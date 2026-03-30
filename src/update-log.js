const { invoke } = window.__TAURI__.tauri;
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
  const titleEl = document.getElementById('logTitle');
  const subtitleEl = document.getElementById('logSubtitle');
  const statusEl = document.getElementById('logStatus');
  const checkedAtEl = document.getElementById('logCheckedAt');
  const notesEl = document.getElementById('logNotes');
  const hintEl = document.getElementById('logHint');
  const closeBtn = document.getElementById('closeWindowBtn');
  const acknowledgeBtn = document.getElementById('acknowledgeBtn');
  const metaCards = document.querySelectorAll('.meta-card');

  const info = getStoredUpdateInfo();
  let canInstallUpdate = false;

  if (info) {
    const versionText = info.version ? `v${info.version}` : '未知版本';
    titleEl.textContent = info.available ? `${versionText} 可更新` : `${versionText} 已是最新`;
    subtitleEl.textContent = info.available
      ? '本次检查发现了新版本，下面是完整的版本更新说明。'
      : '当前已经是最新版本，这里显示的是本次返回的版本说明。';
    statusEl.textContent = info.available ? '发现新版本' : '当前已是最新';
    checkedAtEl.textContent = formatCheckedAt(info.checkedAt);
    notesEl.textContent = info.notes || (info.available
      ? '发布端没有提供额外的更新日志。'
      : '当前版本没有新的更新说明。');

    if (info.available) {
      canInstallUpdate = true;
      statusEl.classList.add('status-success');
      if (metaCards[0]) metaCards[0].classList.add('status-success-card');
      if (hintEl) {
        hintEl.textContent = '确认无误后可直接开始更新，应用完成安装后会自动重启。';
      }
      if (acknowledgeBtn) {
        acknowledgeBtn.textContent = '立即更新';
      }
    } else if (hintEl) {
      hintEl.textContent = '当前已经是最新版本，无需回到主窗口执行更新。';
    }
  } else {
    titleEl.textContent = '未读取到更新信息';
    subtitleEl.textContent = '这个窗口没有拿到有效的更新数据，请回到主窗口重新执行“检查更新”。';
    statusEl.textContent = '读取失败';
    checkedAtEl.textContent = '未知';
    notesEl.textContent = '请关闭当前窗口后，在主窗口的设置里重新点击“检查更新”。';
    if (hintEl) {
      hintEl.textContent = '如果问题持续出现，可以检查主窗口控制台或重新启动应用。';
    }
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      appWindow.close();
    });
  }

  if (acknowledgeBtn) {
    acknowledgeBtn.addEventListener('click', async () => {
      if (!canInstallUpdate) {
        appWindow.close();
        return;
      }

      acknowledgeBtn.disabled = true;
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
    });
  }

  try {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
  } catch (_error) {
  }

  await autoFitWindow();
});
