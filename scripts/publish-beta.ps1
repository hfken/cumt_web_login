[CmdletBinding()]
param(
  [string]$Version,
  [string]$Notes,
  [string]$Branch = "beta",
  [string]$AssetsDir = "beta-assets",
  [string]$CommitMessage,
  [switch]$SkipBuild,
  [switch]$NoPush,
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir

function Write-Step {
  param([string]$Message)
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Invoke-RepoCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Command,
    [switch]$Mutable
  )

  Write-Host "PS> $Command" -ForegroundColor DarkGray

  if ($DryRun -and $Mutable) {
    return ""
  }

  $output = & powershell -NoProfile -Command $Command 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw ($output -join [Environment]::NewLine)
  }

  return ($output -join [Environment]::NewLine).TrimEnd()
}

function Read-Utf8File {
  param([Parameter(Mandatory = $true)][string]$Path)
  return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}

function Write-Utf8File {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Content
  )

  if ($DryRun) {
    Write-Host "DRYRUN write $Path" -ForegroundColor Yellow
    return
  }

  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Get-CargoVersion {
  param([Parameter(Mandatory = $true)][string]$Path)

  foreach ($line in (Read-Utf8File -Path $Path) -split "`r?`n") {
    if ($line.TrimStart().StartsWith('version = "')) {
      return (($line -split '"')[1]).Trim()
    }
  }

  throw "无法从 $Path 读取版本号。"
}

function Set-CargoVersion {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$TargetVersion
  )

  $lines = [System.Collections.Generic.List[string]]::new()
  $updated = $false

  foreach ($line in (Read-Utf8File -Path $Path) -split "`r?`n") {
    if (-not $updated -and $line.TrimStart().StartsWith('version = "')) {
      $lines.Add('version = "' + $TargetVersion + '"')
      $updated = $true
    } else {
      $lines.Add($line)
    }
  }

  if (-not $updated) {
    throw "未能更新 $Path 中的版本号。"
  }

  Write-Utf8File -Path $Path -Content (($lines -join "`r`n").TrimEnd("`r", "`n") + "`r`n")
}

function Convert-RemoteToHttpsBase {
  param([Parameter(Mandatory = $true)][string]$RemoteUrl)

  $trimmed = $RemoteUrl.Trim()
  if ($trimmed -match '^https://') {
    return ($trimmed -replace '\.git$', '')
  }

  if ($trimmed -match '^git@gitee\.com:(.+?)(\.git)?$') {
    return "https://gitee.com/$($Matches[1])"
  }

  throw "暂不支持的远端地址格式: $RemoteUrl"
}

function Get-JsonDepth {
  param([Parameter(Mandatory = $true)]$InputObject)

  if ($null -eq $InputObject) {
    return 1
  }

  if ($InputObject -is [string] -or $InputObject -is [ValueType]) {
    return 1
  }

  if ($InputObject -is [System.Collections.IEnumerable] -and -not ($InputObject -is [hashtable])) {
    $maxChildDepth = 1
    foreach ($item in $InputObject) {
      $childDepth = Get-JsonDepth -InputObject $item
      if ($childDepth -gt $maxChildDepth) {
        $maxChildDepth = $childDepth
      }
    }
    return 1 + $maxChildDepth
  }

  $propertyDepth = 1
  foreach ($property in $InputObject.PSObject.Properties) {
    $childDepth = Get-JsonDepth -InputObject $property.Value
    if ($childDepth -gt $propertyDepth) {
      $propertyDepth = $childDepth
    }
  }

  return 1 + $propertyDepth
}

Push-Location $repoRoot
try {
  $cargoTomlPath = Join-Path $repoRoot "src-tauri/Cargo.toml"
  $tauriConfigPath = Join-Path $repoRoot "src-tauri/tauri.conf.json"
  $updaterBetaPath = Join-Path $repoRoot "updater-beta.json"
  $nsisDir = Join-Path $repoRoot "src-tauri/target/release/bundle/nsis"
  $assetsPath = Join-Path $repoRoot $AssetsDir

  Write-Step "检查当前分支"
  $currentBranch = Invoke-RepoCommand -Command "git branch --show-current"
  if ($currentBranch -ne $Branch) {
    throw "当前分支是 '$currentBranch'，请先切到 '$Branch' 再发布 beta。"
  }

  Write-Step "读取当前版本"
  $cargoVersion = Get-CargoVersion -Path $cargoTomlPath
  $tauriConfig = Get-Content $tauriConfigPath -Raw | ConvertFrom-Json
  if ($cargoVersion -ne $tauriConfig.package.version) {
    throw "Cargo.toml ($cargoVersion) 与 tauri.conf.json ($($tauriConfig.package.version)) 版本不一致。"
  }

  $targetVersion = if ([string]::IsNullOrWhiteSpace($Version)) { $cargoVersion } else { $Version.Trim() }

  if ($targetVersion -ne $cargoVersion) {
    Write-Step "更新 beta 版本到 $targetVersion"
    Set-CargoVersion -Path $cargoTomlPath -TargetVersion $targetVersion
    $tauriConfig.package.version = $targetVersion
    Write-Utf8File -Path $tauriConfigPath -Content (($tauriConfig | ConvertTo-Json -Depth 100))
  }

  if (-not $SkipBuild) {
    Write-Step "构建 Tauri beta 安装包"
    Invoke-RepoCommand -Command "npm run tauri build" -Mutable | Out-Host
  } else {
    Write-Step "跳过构建，直接复用现有产物"
  }

  Write-Step "定位本次 beta 构建产物"
  if (-not (Test-Path $nsisDir)) {
    throw "未找到 NSIS 产物目录: $nsisDir"
  }

  $sourceZip = Get-ChildItem $nsisDir -File | Where-Object { $_.Name -like "*_${targetVersion}_x64-setup.nsis.zip" } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  $sourceSig = Get-ChildItem $nsisDir -File | Where-Object { $_.Name -like "*_${targetVersion}_x64-setup.nsis.zip.sig" } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  $sourceExe = Get-ChildItem $nsisDir -File | Where-Object { $_.Name -like "*_${targetVersion}_x64-setup.exe" } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  $recentArtifacts = Get-ChildItem $nsisDir -File | Where-Object { $_.Name -like "*_x64-setup.nsis.zip" } | Sort-Object LastWriteTime -Descending | Select-Object -First 5 -ExpandProperty Name

  if (-not $sourceZip) {
    $recentText = if ($recentArtifacts) { $recentArtifacts -join ", " } else { "无" }
    throw "未找到版本 $targetVersion 对应的 updater zip 产物。请先执行 npm run tauri build。当前目录最近的 zip 产物: $recentText"
  }
  if (-not $sourceSig) {
    throw "未找到版本 $targetVersion 对应的 zip.sig 签名文件。"
  }
  if (-not $sourceExe) {
    throw "未找到版本 $targetVersion 对应的安装包 exe。"
  }

  $assetZipName = "CUMTLogin-beta-$targetVersion-x64-setup.nsis.zip"
  $assetSigName = "$assetZipName.sig"
  $assetExeName = "CUMTLogin-beta-$targetVersion-x64-setup.exe"

  Write-Step "同步 beta 资产文件到 $AssetsDir"
  if (-not $DryRun -and -not (Test-Path $assetsPath)) {
    New-Item -ItemType Directory -Path $assetsPath | Out-Null
  }

  $targetZipPath = Join-Path $assetsPath $assetZipName
  $targetSigPath = Join-Path $assetsPath $assetSigName
  $targetExePath = Join-Path $assetsPath $assetExeName

  if ($DryRun) {
    Write-Host "DRYRUN copy $($sourceZip.FullName) -> $targetZipPath" -ForegroundColor Yellow
    Write-Host "DRYRUN copy $($sourceSig.FullName) -> $targetSigPath" -ForegroundColor Yellow
    Write-Host "DRYRUN copy $($sourceExe.FullName) -> $targetExePath" -ForegroundColor Yellow
  } else {
    Copy-Item -LiteralPath $sourceZip.FullName -Destination $targetZipPath -Force
    Copy-Item -LiteralPath $sourceSig.FullName -Destination $targetSigPath -Force
    Copy-Item -LiteralPath $sourceExe.FullName -Destination $targetExePath -Force
  }

  Write-Step "更新 updater-beta.json"
  $updater = Get-Content $updaterBetaPath -Raw | ConvertFrom-Json
  $originUrl = Invoke-RepoCommand -Command "git remote get-url origin"
  $repoBaseUrl = Convert-RemoteToHttpsBase -RemoteUrl $originUrl
  $assetUrl = "$repoBaseUrl/raw/$Branch/$AssetsDir/$assetZipName"
  $signature = (Get-Content $sourceSig.FullName -Raw).Trim()
  $publishTime = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

  $updater.version = $targetVersion
  $updater.pub_date = $publishTime
  if ([string]::IsNullOrWhiteSpace($Notes)) {
    $updater.notes = "测试更新通道 beta $targetVersion`n发布时间：$publishTime`n本次构建由 scripts/publish-beta.ps1 自动发布。"
  } else {
    $updater.notes = $Notes
  }

  if (-not $updater.platforms) {
    $updater | Add-Member -NotePropertyName "platforms" -NotePropertyValue ([pscustomobject]@{})
  }
  $platformKey = 'windows-x86_64'
  if (-not $updater.platforms.$platformKey) {
    $updater.platforms | Add-Member -NotePropertyName $platformKey -NotePropertyValue ([pscustomobject]@{})
  }

  $updater.platforms.$platformKey.signature = $signature
  $updater.platforms.$platformKey.url = $assetUrl

  $jsonDepth = [Math]::Max((Get-JsonDepth -InputObject $updater), 5)
  Write-Utf8File -Path $updaterBetaPath -Content (($updater | ConvertTo-Json -Depth $jsonDepth))

  Write-Step "提交本次 beta 发布"
  $finalCommitMessage = if ([string]::IsNullOrWhiteSpace($CommitMessage)) {
    "chore(beta): publish $targetVersion"
  } else {
    $CommitMessage
  }

  $pendingBeforeAdd = Invoke-RepoCommand -Command "git status --porcelain"
  if ([string]::IsNullOrWhiteSpace($pendingBeforeAdd)) {
    Write-Host "工作区没有待提交改动，跳过 git add / git commit。" -ForegroundColor Yellow
  } else {
    Invoke-RepoCommand -Command "git add -A" -Mutable | Out-Null
    $pendingAfterAdd = Invoke-RepoCommand -Command "git status --porcelain"
    if ([string]::IsNullOrWhiteSpace($pendingAfterAdd)) {
      Write-Host "没有检测到可提交的改动。" -ForegroundColor Yellow
    } else {
      $tempCommitMessage = Join-Path ([System.IO.Path]::GetTempPath()) ("beta-commit-" + [guid]::NewGuid().ToString("N") + ".txt")
      try {
        Write-Utf8File -Path $tempCommitMessage -Content ($finalCommitMessage + "`r`n")
        Invoke-RepoCommand -Command "git commit -F `"$tempCommitMessage`"" -Mutable | Out-Host
      } finally {
        if (-not $DryRun -and (Test-Path $tempCommitMessage)) {
          Remove-Item -LiteralPath $tempCommitMessage -Force
        }
      }
    }
  }

  if (-not $NoPush) {
    Write-Step "推送 beta 分支到远端"
    Invoke-RepoCommand -Command "git push origin $Branch" -Mutable | Out-Host
  } else {
    Write-Step "按要求跳过远端推送"
  }

  Write-Host ""
  Write-Host "发布完成。" -ForegroundColor Green
  Write-Host "版本: $targetVersion"
  Write-Host "更新清单: $updaterBetaPath"
  Write-Host "下载地址: $assetUrl"
  Write-Host "安装包: $targetExePath"
}
finally {
  Pop-Location
}
