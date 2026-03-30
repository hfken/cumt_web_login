const { invoke } = window.__TAURI__.tauri;
const { app } = window.__TAURI__;
const { appWindow, LogicalSize } = window.__TAURI__.window;

document.addEventListener('contextmenu', event => {
  event.preventDefault();
});

document.addEventListener('selectstart', event => {
  event.preventDefault();
});

function getStoredUpdateInfo() {
  const params = new URLSearchParams(window.location.search);
  const dataKey = params.get('dataKey');
  if (!dataKey) return null;

  const raw = localStorage.getItem(dataKey);
  if (!raw) return null;

  localStorage.removeItem(dataKey);

  try {
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

function formatCheckedAt(value) {
  if (!value) return '未知';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知';

  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function parseVersion(version) {
  const sanitized = String(version || '').trim().replace(/^v/i, '').split('+')[0];
  const [corePart, preReleasePart = ''] = sanitized.split('-', 2);

  return {
    core: corePart.split('.').map(part => Number.parseInt(part, 10) || 0),
    preRelease: preReleasePart
      ? preReleasePart.split('.').map(part => (/^\d+$/.test(part) ? Number.parseInt(part, 10) : part.toLowerCase()))
      : []
  };
}

function compareIdentifiers(left, right) {
  if (typeof left === 'number' && typeof right === 'number') {
    return left === right ? 0 : (left > right ? 1 : -1);
  }

  if (typeof left === 'number') return -1;
  if (typeof right === 'number') return 1;
  if (left === right) return 0;
  return left > right ? 1 : -1;
}

function compareVersions(leftVersion, rightVersion) {
  const left = parseVersion(leftVersion);
  const right = parseVersion(rightVersion);
  const coreLength = Math.max(left.core.length, right.core.length);

  for (let index = 0; index < coreLength; index += 1) {
    const diff = compareIdentifiers(left.core[index] ?? 0, right.core[index] ?? 0);
    if (diff !== 0) return diff;
  }

  if (left.preRelease.length === 0 && right.preRelease.length === 0) return 0;
  if (left.preRelease.length === 0) return 1;
  if (right.preRelease.length === 0) return -1;

  const preReleaseLength = Math.max(left.preRelease.length, right.preRelease.length);
  for (let index = 0; index < preReleaseLength; index += 1) {
    const leftPart = left.preRelease[index];
    const rightPart = right.preRelease[index];

    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;

    const diff = compareIdentifiers(leftPart, rightPart);
    if (diff !== 0) return diff;
  }

  return 0;
}

async function getCurrentVersion() {
  if (!app || typeof app.getVersion !== 'function') return '';

  try {
    return await app.getVersion();
  } catch (_error) {
    return '';
  }
}

async function autoFitWindow() {
  const windowFrame = document.querySelector('.window-frame');
  const windowCard = document.querySelector('.window-card');
  const notesEl = document.getElementById('logNotes');
  if (!windowFrame || !windowCard || !notesEl) {
    await appWindow.show();
    return;
  }

  const screenHeight = window.screen?.availHeight || window.screen?.height || 900;
  const maxWindowHeight = Math.max(420, screenHeight - 56);

  windowFrame.classList.remove('window-scroll');
  notesEl.style.maxHeight = 'none';

  await new Promise(resolve => window.requestAnimationFrame(resolve));

  let naturalHeight = Math.ceil(windowFrame.scrollHeight);

  if (naturalHeight > maxWindowHeight) {
    windowFrame.classList.add('window-scroll');
    const overflow = naturalHeight - maxWindowHeight;
    const currentNotesHeight = notesEl.scrollHeight;
    const targetNotesHeight = Math.max(140, currentNotesHeight - overflow - 12);
    notesEl.style.maxHeight = `${targetNotesHeight}px`;

    await new Promise(resolve => window.requestAnimationFrame(resolve));
    naturalHeight = Math.ceil(windowFrame.scrollHeight);
  }

  const targetHeight = Math.max(420, Math.min(maxWindowHeight, naturalHeight));

  await appWindow.setAlwaysOnTop(true);
  await appWindow.setSize(new LogicalSize(560, targetHeight));
  await appWindow.center();
  await appWindow.show();
}

document.addEventListener('DOMContentLoaded', async () => {
  const currentVersion = await getCurrentVersion();
  const isBetaBuild = String(currentVersion).includes('-beta');
  const titleEl = document.getElementById('logTitle');
  const subtitleEl = document.getElementById('logSubtitle');
  const statusEl = document.getElementById('logStatus');
  const checkedAtEl = document.getElementById('logCheckedAt');
  const notesEl = document.getElementById('logNotes');
  const hintEl = document.getElementById('logHint');
  const closeBtn = document.getElementById('closeWindowBtn');
  const acknowledgeBtn = document.getElementById('acknowledgeBtn');
  const channelSelect = document.getElementById('channelSelect');
  const metaCards = document.querySelectorAll('.meta-card');

  const initialInfo = getStoredUpdateInfo();
  let currentInfo = null;
  let isLoading = false;

  function setLoadingState(channel) {
    titleEl.textContent = channel === 'beta' ? '正在读取测试通道' : '正在读取正式通道';
    subtitleEl.textContent = '请稍候，窗口正在向对应通道检查最新版本。';
    statusEl.textContent = '检查中';
    statusEl.classList.remove('status-success');
    if (metaCards[0]) metaCards[0].classList.remove('status-success-card');
    checkedAtEl.textContent = formatCheckedAt(new Date().toISOString());
    notesEl.textContent = '正在加载日志内容...';
    if (hintEl) {
      hintEl.textContent = '通道切换后会自动刷新版本说明与安装按钮。';
    }
    if (acknowledgeBtn) {
      acknowledgeBtn.disabled = true;
      acknowledgeBtn.textContent = '正在检查...';
    }
  }

  function renderInfo(info) {
    currentInfo = info;
    statusEl.classList.remove('status-success');
    if (metaCards[0]) metaCards[0].classList.remove('status-success-card');

    const versionText = info.version ? `v${info.version}` : '未知版本';
    checkedAtEl.textContent = formatCheckedAt(info.checkedAt);
    notesEl.textContent = info.notes || (info.available
      ? '发布端没有提供额外的更新日志。'
      : '当前通道没有新的更新说明。');

    if (info.channel === 'beta') {
      if (info.available) {
        titleEl.textContent = `${versionText} 可安装`;
        subtitleEl.textContent = '测试通道存在可安装的新版本，下面是对应的版本说明。';
        statusEl.textContent = '发现测试版';
        statusEl.classList.add('status-success');
        if (metaCards[0]) metaCards[0].classList.add('status-success-card');
        if (hintEl) {
          hintEl.textContent = '将下载并启动测试版安装程序，后续请按安装向导完成更新。';
        }
        if (acknowledgeBtn) {
          acknowledgeBtn.disabled = false;
          acknowledgeBtn.textContent = '安装测试版';
        }
        return;
      }

      if (info.versionRelation === 0) {
        titleEl.textContent = `${versionText} 已安装`;
        subtitleEl.textContent = '当前应用已经运行在这个测试版，无需重复安装。';
        statusEl.textContent = '当前已是测试版';
        if (hintEl) {
          hintEl.textContent = '如果确实需要重装当前测试版，请回到主窗口设置页再次点击“安装测试版”。';
        }
      } else if (info.versionRelation > 0) {
        titleEl.textContent = `${versionText} 低于当前版本`;
        subtitleEl.textContent = '当前安装版本高于测试通道版本，窗口不会触发回退安装。';
        statusEl.textContent = '无需降级';
        if (hintEl) {
          hintEl.textContent = '当前版本高于测试通道版本，已阻止回退安装。';
        }
      } else {
        titleEl.textContent = `${versionText} 不可安装`;
        subtitleEl.textContent = '测试通道返回了版本信息，但当前无法确认是否可安装。';
        statusEl.textContent = '暂不可安装';
        if (hintEl) {
          hintEl.textContent = '请稍后重试，或回到主窗口重新检查网络与版本。';
        }
      }

      if (acknowledgeBtn) {
        acknowledgeBtn.disabled = false;
        acknowledgeBtn.textContent = '知道了';
      }
      return;
    }

    if (info.channel === 'stable' && info.installMode === 'installer') {
      if (info.available) {
        titleEl.textContent = `${versionText} 可升级为正式版`;
        subtitleEl.textContent = '当前运行的是测试版，切换到正式通道后可直接安装正式版。';
        statusEl.textContent = '发现正式版';
        statusEl.classList.add('status-success');
        if (metaCards[0]) metaCards[0].classList.add('status-success-card');
        if (hintEl) {
          hintEl.textContent = '将下载并启动正式版安装程序，完成后即可切换回正式版。';
        }
        if (acknowledgeBtn) {
          acknowledgeBtn.disabled = false;
          acknowledgeBtn.textContent = '安装正式版';
        }
      } else {
        titleEl.textContent = versionText ? `${versionText} 暂不可安装` : '正式通道无可安装版本';
        subtitleEl.textContent = info.versionRelation > 0
          ? '当前测试版版本高于正式通道，窗口不会触发回退安装。'
          : '当前已经没有比你这版更高的正式版可安装。';
        statusEl.textContent = info.versionRelation > 0 ? '无需降级' : '当前已是最新';
        if (hintEl) {
          hintEl.textContent = info.versionRelation > 0
            ? '当前测试版版本高于正式通道，已阻止回退安装。'
            : '如果后续发布了更高的正式版，这里会直接提供安装入口。';
        }
        if (acknowledgeBtn) {
          acknowledgeBtn.disabled = false;
          acknowledgeBtn.textContent = '知道了';
        }
      }
      return;
    }

    titleEl.textContent = info.available ? `${versionText} 可更新` : `${versionText} 已是最新`;
    subtitleEl.textContent = info.available
      ? '本次检查发现了新版本，下面是完整的版本更新说明。'
      : '当前已经是最新版本，这里显示的是本次返回的版本说明。';
    statusEl.textContent = info.available ? '发现新版本' : '当前已是最新';

    if (info.available) {
      statusEl.classList.add('status-success');
      if (metaCards[0]) metaCards[0].classList.add('status-success-card');
      if (hintEl) {
        hintEl.textContent = '确认无误后可直接开始更新，应用完成安装后会自动重启。';
      }
      if (acknowledgeBtn) {
        acknowledgeBtn.disabled = false;
        acknowledgeBtn.textContent = '立即更新';
      }
    } else {
      if (hintEl) {
        hintEl.textContent = '当前已经是最新版本，无需回到主窗口执行更新。';
      }
      if (acknowledgeBtn) {
        acknowledgeBtn.disabled = false;
        acknowledgeBtn.textContent = '知道了';
      }
    }
  }

  function renderLoadError(channel, error) {
    currentInfo = null;
    titleEl.textContent = channel === 'beta' ? '测试通道读取失败' : '正式通道读取失败';
    subtitleEl.textContent = '未能从所选通道拿到有效的更新数据，请稍后重试。';
    statusEl.textContent = '读取失败';
    statusEl.classList.remove('status-success');
    if (metaCards[0]) metaCards[0].classList.remove('status-success-card');
    checkedAtEl.textContent = formatCheckedAt(new Date().toISOString());
    notesEl.textContent = `底层截获: ${String(error)}`;
    if (hintEl) {
      hintEl.textContent = '如果问题持续出现，可以检查网络状态、更新清单地址或当前签名配置。';
    }
    if (acknowledgeBtn) {
      acknowledgeBtn.disabled = false;
      acknowledgeBtn.textContent = '知道了';
    }
  }

  async function fetchChannelInfo(channel) {
    const checkedAt = new Date().toISOString();

    if (channel === 'beta') {
      const [betaInfo, latestCurrentVersion] = await Promise.all([
        invoke('get_beta_installer_info'),
        getCurrentVersion()
      ]);

      const version = betaInfo && typeof betaInfo.version === 'string' ? betaInfo.version : '';
      const versionRelation = latestCurrentVersion ? compareVersions(latestCurrentVersion, version) : -1;

      return {
        channel: 'beta',
        available: !latestCurrentVersion || versionRelation < 0,
        version,
        notes: betaInfo && typeof betaInfo.notes === 'string' ? betaInfo.notes : '',
        checkedAt,
        versionRelation,
        installMode: 'installer'
      };
    }

    if (isBetaBuild) {
      const stableInfo = await invoke('get_stable_installer_info');
      const version = stableInfo && typeof stableInfo.version === 'string' ? stableInfo.version : '';
      const versionRelation = currentVersion ? compareVersions(currentVersion, version) : -1;

      return {
        channel: 'stable',
        available: !currentVersion || versionRelation < 0,
        version,
        notes: stableInfo && typeof stableInfo.notes === 'string' ? stableInfo.notes : '',
        checkedAt,
        versionRelation,
        installMode: 'installer'
      };
    }

    const updateInfo = await invoke('check_for_updates');
    return {
      channel: 'stable',
      available: !!(updateInfo && updateInfo.available),
      version: updateInfo && typeof updateInfo.version === 'string' ? updateInfo.version : '',
      notes: updateInfo && typeof updateInfo.notes === 'string' ? updateInfo.notes : '',
      checkedAt,
      installMode: 'updater'
    };
  }

  async function loadChannelInfo(channel, preferredInfo = null) {
    if (isLoading) return;
    isLoading = true;
    if (channelSelect) channelSelect.disabled = true;
    setLoadingState(channel);

    try {
      let info = null;
      const canReusePreferredInfo = (
        preferredInfo &&
        preferredInfo.channel === channel &&
        !isBetaBuild &&
        channel === 'stable'
      );

      if (canReusePreferredInfo) {
        info = {
          channel,
          available: !!preferredInfo.available,
          version: preferredInfo.version || '',
          notes: preferredInfo.notes || '',
          checkedAt: preferredInfo.checkedAt || new Date().toISOString(),
          installMode: preferredInfo.installMode || (channel === 'stable' ? 'updater' : 'installer'),
          versionRelation: preferredInfo.versionRelation
        };
      } else {
        info = await fetchChannelInfo(channel);
      }

      renderInfo(info);
    } catch (error) {
      renderLoadError(channel, error);
      console.error('Load update info failed:', error);
    } finally {
      if (channelSelect) channelSelect.disabled = false;
      isLoading = false;
      await autoFitWindow();
    }
  }

  if (channelSelect) {
    channelSelect.addEventListener('change', () => {
      loadChannelInfo(channelSelect.value);
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      appWindow.close();
    });
  }

  if (acknowledgeBtn) {
    acknowledgeBtn.addEventListener('click', async () => {
      if (!currentInfo || !currentInfo.available) {
        appWindow.close();
        return;
      }

      acknowledgeBtn.disabled = true;
      if (currentInfo.channel === 'beta') {
        acknowledgeBtn.textContent = '正在启动...';
        if (hintEl) {
          hintEl.textContent = '正在下载并启动测试版安装程序，请稍候。';
        }

        try {
          const betaInstallResult = await invoke('install_beta_update');
          const launchedVersion = betaInstallResult && typeof betaInstallResult.version === 'string'
            ? betaInstallResult.version
            : currentInfo.version;
          acknowledgeBtn.textContent = '已启动安装器';
          if (hintEl) {
            hintEl.textContent = `测试版 v${launchedVersion} 安装程序已启动，请按安装向导完成更新。`;
          }
        } catch (error) {
          acknowledgeBtn.disabled = false;
          acknowledgeBtn.textContent = '安装测试版';
          if (hintEl) {
            hintEl.textContent = `测试版安装失败：${String(error)}`;
          }
          console.error('Install beta update failed:', error);
        }
      } else if (currentInfo.installMode === 'installer') {
        acknowledgeBtn.textContent = '正在启动...';
        if (hintEl) {
          hintEl.textContent = '正在下载并启动正式版安装程序，请稍候。';
        }

        try {
          const stableInstallResult = await invoke('install_stable_update');
          const launchedVersion = stableInstallResult && typeof stableInstallResult.version === 'string'
            ? stableInstallResult.version
            : currentInfo.version;
          acknowledgeBtn.textContent = '已启动安装器';
          if (hintEl) {
            hintEl.textContent = `正式版 v${launchedVersion} 安装程序已启动，请按安装向导完成切换。`;
          }
        } catch (error) {
          acknowledgeBtn.disabled = false;
          acknowledgeBtn.textContent = '安装正式版';
          if (hintEl) {
            hintEl.textContent = `正式版安装失败：${String(error)}`;
          }
          console.error('Install stable update failed:', error);
        }
      } else {
        acknowledgeBtn.textContent = '正在更新...';
        if (hintEl) {
          hintEl.textContent = '正在下载并安装更新，请稍候。';
        }

        try {
          await invoke('install_update');
          acknowledgeBtn.textContent = '正在重启...';
          if (hintEl) {
            hintEl.textContent = '更新安装完成，应用即将自动重启。';
          }
          setTimeout(() => {
            invoke('restart_app').catch(console.error);
          }, 800);
        } catch (error) {
          acknowledgeBtn.disabled = false;
          acknowledgeBtn.textContent = '立即更新';
          if (hintEl) {
            hintEl.textContent = `更新安装失败：${String(error)}`;
          }
          console.error('Install update failed:', error);
        }
      }

      await autoFitWindow();
    });
  }

  try {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
  } catch (_error) {
  }

  const initialChannel = initialInfo && initialInfo.channel
    ? initialInfo.channel
    : (isBetaBuild ? 'beta' : 'stable');
  if (channelSelect) channelSelect.value = initialChannel;
  await loadChannelInfo(initialChannel, initialInfo);
});
