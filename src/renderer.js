const { invoke } = window.__TAURI__.tauri;
const { appWindow } = window.__TAURI__.window;

document.addEventListener('contextmenu', e => {
  if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
    e.preventDefault();
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  const studentIdInput = document.getElementById('studentId');
  const passwordInput = document.getElementById('password');
  const operatorSelect = document.getElementById('operator');
  const autoLoginCheck = document.getElementById('autoLogin');
  const loginBtn = document.getElementById('loginBtn');
  const checkBtn = document.getElementById('checkBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const closeWindowBtn = document.getElementById('closeWindowBtn');
  const statusMessage = document.getElementById('statusMessage');
  
  const loginView = document.getElementById('loginView');
  const successView = document.getElementById('successView');
  const successIconBtn = document.getElementById('successIconBtn');
  const settingsView = document.getElementById('settingsView');
  const openSettingsBtn = document.getElementById('openSettingsBtn');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const checkIntervalInput = document.getElementById('checkInterval');
  const checkIntervalWrapper = document.getElementById('checkIntervalWrapper');
  const autoCheckInput = document.getElementById('autoCheck');
  const portalAddressInput = document.getElementById('portalAddress');
  const backToLoginBtn = document.getElementById('backToLoginBtn');
  const checkUpdateBtn = document.getElementById('checkUpdateBtn');
  const settingsError = document.getElementById('settingsError');

  const inlineUpdateBox = document.getElementById('inlineUpdateBox');
  const updateVersionText = document.getElementById('updateVersionText');
  const updateNotesContainer = document.getElementById('updateNotesContainer');

  let overrideSuccessView = false;
  let wasConnected = null;
  let hasCheckedUpdates = false;
  let pendingLoginConfig = null;

  const confirmView = document.getElementById('confirmView');
  const confirmOnlineUser = document.getElementById('confirmOnlineUser');
  const confirmCancelBtn = document.getElementById('confirmCancelBtn');
  const confirmOkBtn = document.getElementById('confirmOkBtn');

  const updateBanner = document.getElementById('updateBanner');
  const updateBannerTitle = document.getElementById('updateBannerTitle');
  const updateBannerSub = document.getElementById('updateBannerSub');
  const updateBannerBtn = document.getElementById('updateBannerBtn');

  function showUpdateBanner(version, notes) {
    if (updateBannerTitle) updateBannerTitle.textContent = `发现新版本 v${version}`;
    if (updateBannerSub && notes) {
      const firstLine = notes.split('\n')[0];
      updateBannerSub.textContent = firstLine.length > 28 ? firstLine.slice(0, 28) + '…' : firstLine;
    }
    if (updateBanner) updateBanner.classList.remove('view-hidden');

    // Pre-populate the settings update UI so user can install immediately
    if (updateVersionText) {
      updateVersionText.textContent = `🚀 v${version} 发现新版本`;
      updateVersionText.style.color = '#3b82f6';
    }
    if (updateNotesContainer) {
      updateNotesContainer.textContent = notes || '服务器未提供额外的发版日志。';
    }
    if (inlineUpdateBox) inlineUpdateBox.classList.remove('view-hidden');
    if (checkUpdateBtn) {
      checkUpdateBtn.dataset.pendingUpdate = 'true';
      checkUpdateBtn.textContent = '一键更新';
      checkUpdateBtn.classList.add('shake');
      checkUpdateBtn.disabled = false;
    }
  }

  async function checkUpdateOnConnect() {
    if (hasCheckedUpdates) return;
    hasCheckedUpdates = true;
    try {
      const updateInfo = await invoke('check_for_updates');
      if (updateInfo && updateInfo.available) {
        showUpdateBanner(updateInfo.version, updateInfo.notes);
      }
    } catch (e) {
      console.warn('Auto update check failed:', e);
    }
  }

  if (updateBannerBtn) {
    updateBannerBtn.addEventListener('click', () => {
      if (updateBanner) updateBanner.classList.add('view-hidden');
      if (settingsView) settingsView.classList.remove('view-hidden');
    });
  }

  // Confirm overlay: cancel
  if (confirmCancelBtn) {
    confirmCancelBtn.addEventListener('click', () => {
      pendingLoginConfig = null;
      if (confirmView) confirmView.classList.add('view-hidden');
      setStatus('已取消顶号操作', 'normal');
    });
  }

  // Confirm overlay: proceed with force login
  if (confirmOkBtn) {
    confirmOkBtn.addEventListener('click', async () => {
      if (!pendingLoginConfig) return;
      const config = pendingLoginConfig;
      pendingLoginConfig = null;
      if (confirmView) confirmView.classList.add('view-hidden');

      loginBtn.disabled = true;
      loginBtn.textContent = '正在连接...';
      setStatus('正在顶替登录...', 'normal');
      try {
        const result = await invoke('do_login', { config, force: true });
        setStatus(result.message, result.success ? 'success' : 'error');
        if (result.success) {
          overrideSuccessView = false;
          showSuccessView();
        }
      } catch (e) {
        setStatus(e, 'error');
      }
      loginBtn.disabled = false;
      loginBtn.textContent = '登录网络';
    });
  }

  function setStatus(msg, type = 'normal') {
    statusMessage.textContent = msg;
    statusMessage.className = 'status-message';
    if (type === 'success') statusMessage.classList.add('status-success');
    if (type === 'error') statusMessage.classList.add('status-error');
  }

  function showSuccessView() {
    if (loginView) loginView.classList.add('view-hidden');
    if (successView) successView.classList.remove('view-hidden');
    checkUpdateOnConnect();
  }

  function showLoginView() {
    if (successView) successView.classList.add('view-hidden');
    if (loginView) loginView.classList.remove('view-hidden');
  }

  // Settings Overlay Logic
  if (autoCheckInput) {
    autoCheckInput.addEventListener('change', () => {
      if (checkIntervalWrapper) {
        if (autoCheckInput.checked) checkIntervalWrapper.classList.remove('collapsed');
        else checkIntervalWrapper.classList.add('collapsed');
      }
    });
  }

  if (openSettingsBtn) {
    openSettingsBtn.addEventListener('click', () => {
      if (settingsView) settingsView.classList.remove('view-hidden');
      if (settingsError) settingsError.classList.add('view-hidden');
    });
  }

  if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener('click', () => {
      // Reset Update Dialog Layout State
      if (checkUpdateBtn && checkUpdateBtn.dataset.pendingUpdate === "true") {
          checkUpdateBtn.dataset.pendingUpdate = "false";
          checkUpdateBtn.textContent = '检查更新';
          checkUpdateBtn.classList.remove('shake');
          if (inlineUpdateBox) inlineUpdateBox.classList.add('view-hidden');
      }

      const isAutoCheck = autoCheckInput ? autoCheckInput.checked : true;
      const intervalVal = parseInt(checkIntervalInput.value, 10);
      
      if (isAutoCheck && (isNaN(intervalVal) || intervalVal < 5)) {
        if (settingsError) settingsError.classList.remove('view-hidden');
        if (checkIntervalInput) {
          checkIntervalInput.classList.add('shake');
          setTimeout(() => checkIntervalInput.classList.remove('shake'), 400);
        }
        return; // Early return to prevent saving & closing
      }

      if (settingsError) settingsError.classList.add('view-hidden');
      if (settingsView) settingsView.classList.add('view-hidden');
      
      const newConfig = {
        studentId: studentIdInput.value.trim(),
        password: passwordInput.value,
        operator: operatorSelect.value,
        portalAddress: portalAddressInput ? portalAddressInput.value.trim() : '',
        autoLogin: autoLoginCheck.checked,
        checkInterval: intervalVal,
        autoCheck: isAutoCheck
      };
      
      if (typeof startHeartbeat === 'function') startHeartbeat(newConfig.checkInterval, newConfig.autoCheck);
      invoke('save_config', { config: newConfig }).catch(console.error);
    });
  }

  // Check Updates Logic
  if (checkUpdateBtn) {
    checkUpdateBtn.addEventListener('click', async () => {
      if (checkUpdateBtn.dataset.pendingUpdate === "true") {
          checkUpdateBtn.textContent = '下载网络包...';
          checkUpdateBtn.disabled = true;
          try {
              await invoke('install_update');
              checkUpdateBtn.textContent = '成功！重启中...';
              setTimeout(() => invoke('restart_app').catch(console.error), 800);
          } catch(e) {
              if (settingsError) {
                  settingsError.textContent = "更新安装失败: " + e;
                  settingsError.classList.remove('view-hidden');
              }
              checkUpdateBtn.textContent = '一键更新';
              checkUpdateBtn.disabled = false;
          }
          return;
      }

      const originalText = '检查更新';
      checkUpdateBtn.textContent = '检查中...';
      checkUpdateBtn.disabled = true;
      if (settingsError) settingsError.classList.add('view-hidden');
      if (inlineUpdateBox) inlineUpdateBox.classList.add('view-hidden');

      try {
        const updateInfo = await invoke('check_for_updates');
        if (updateInfo) {
            if (updateInfo.available) {
                checkUpdateBtn.dataset.pendingUpdate = "true";
                checkUpdateBtn.textContent = '一键更新';
                checkUpdateBtn.classList.add('shake');
                checkUpdateBtn.disabled = false;
                if (updateVersionText) {
                    updateVersionText.textContent = `🚀 v${updateInfo.version} 发现新版本`;
                    updateVersionText.style.color = '#3b82f6';
                }
            } else {
                checkUpdateBtn.dataset.pendingUpdate = "false";
                checkUpdateBtn.textContent = '当前已是最新';
                checkUpdateBtn.disabled = true;
                checkUpdateBtn.classList.remove('shake');
                if (updateVersionText) {
                    updateVersionText.textContent = `✅ v${updateInfo.version || '最新'} 当前已处于最新版`;
                    updateVersionText.style.color = '#10b981'; // Green success variant
                }
                setTimeout(() => {
                    checkUpdateBtn.textContent = originalText;
                    checkUpdateBtn.disabled = false;
                }, 3500);
            }

            if (updateNotesContainer) {
                updateNotesContainer.textContent = updateInfo.notes ? updateInfo.notes : '服务器未提供额外的发版日志。';
            }
            if (inlineUpdateBox) inlineUpdateBox.classList.remove('view-hidden');
        }
      } catch (e) {
        if (settingsError) {
            settingsError.textContent = '网络不通，或你尚未为此版本生成安全签名。\n底层截获: ' + e;
            settingsError.classList.remove('view-hidden');
        }
        checkUpdateBtn.textContent = '网络/签名故障';
        setTimeout(() => {
            checkUpdateBtn.textContent = originalText;
            checkUpdateBtn.disabled = false;
            if (settingsError && settingsError.textContent.includes('网络不通')) {
                 settingsError.classList.add('view-hidden');
            }
        }, 8000);
        console.error(e);
      }
    });
  }

  // Load Config
  let config = { studentId: '', password: '', operator: 'cmcc', portalAddress: '', autoLogin: false, checkInterval: 15, autoCheck: true };
  try {
    config = await invoke('get_config');
    studentIdInput.value = config.studentId || '';
    passwordInput.value = config.password || '';
    operatorSelect.value = config.operator || 'cmcc';
    if (portalAddressInput) portalAddressInput.value = config.portalAddress || '';
    autoLoginCheck.checked = config.autoLogin || false;
    if (autoCheckInput) autoCheckInput.checked = config.autoCheck !== false;
    if (checkIntervalInput) checkIntervalInput.value = config.checkInterval || 15;
    if (checkIntervalWrapper) {
        if (config.autoCheck === false) checkIntervalWrapper.classList.add('collapsed');
        else checkIntervalWrapper.classList.remove('collapsed');
    }
  } catch (e) {
    console.error('Failed to load config', e);
  }

  // Auto check connection
  async function runBackgroundCheck() {
    try {
      const connStatus = await invoke('check_connection');
      setStatus(connStatus.message, connStatus.connected ? 'success' : 'error');
      if (connStatus.connected) {
        if (!overrideSuccessView) {
          showSuccessView();
        }
        wasConnected = true;
      } else {
        if (wasConnected === true) {
          invoke('notify_drop').catch(console.error);
        }
        wasConnected = false;
        overrideSuccessView = false;
        showLoginView();
      }
    } catch (e) {
      console.error('Background check error:', e);
    }
  }

  let heartbeatInterval = null;
  window.startHeartbeat = function(seconds, enabled) {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    if (enabled === false) return;
    
    const ms = Math.max(5, parseInt(seconds, 10) || 15) * 1000;
    heartbeatInterval = setInterval(runBackgroundCheck, ms);
  };

  setStatus('正在检测网络状态...', 'normal');
  runBackgroundCheck();

  startHeartbeat(config.checkInterval || 15, config.autoCheck !== false);

  // When the window is brought to front (e.g. from tray), immediately re-check
  // so the UI reflects the current login state without waiting for the next heartbeat.
  appWindow.listen('tauri://focus', () => {
    runBackgroundCheck();
  }).catch(console.error);

  // Dynamic Version Injection
  const appVersionDisplay = document.getElementById('appVersionDisplay');
  if (appVersionDisplay && window.__TAURI__ && window.__TAURI__.app) {
      window.__TAURI__.app.getVersion().then(v => {
          appVersionDisplay.textContent = `版本 v${v} | 中国矿业大学`;
      }).catch(console.error);
  }

  // Check Status Click
  checkBtn.addEventListener('click', async () => {
    checkBtn.disabled = true;
    setStatus('正在检测...', 'normal');
    try {
        const res = await invoke('check_connection');
        setStatus(res.message, res.connected ? 'success' : 'error');
        if (res.connected) showSuccessView();
    } catch(e) {
        setStatus(e, 'error');
    }
    checkBtn.disabled = false;
  });

  // Regular Logout Click
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      logoutBtn.disabled = true;
      setStatus('正在注销...', 'normal');
      try {
        const res = await invoke('do_logout');
        setStatus(res.message, res.success ? 'success' : 'error');
        if (res.success) {
          wasConnected = false;
          showLoginView();
        }
      } catch (e) {
        setStatus(e, 'error');
      }
      logoutBtn.disabled = false;
    });
  }

  // Success Icon Click (Logout)
  if (successIconBtn) {
    successIconBtn.addEventListener('click', async () => {
      successIconBtn.style.pointerEvents = 'none';
      setStatus('正在切断连接...', 'normal');
      try {
        const res = await invoke('do_logout');
        setStatus(res.message, res.success ? 'success' : 'error');
        if (res.success) {
          wasConnected = false;
          overrideSuccessView = false;
          showLoginView();
        }
      } catch (e) {
        setStatus(e, 'error');
      }
      successIconBtn.style.pointerEvents = 'auto';
    });
  }

  // Back to login Click
  if (backToLoginBtn) {
    backToLoginBtn.addEventListener('click', () => {
      overrideSuccessView = true;
      showLoginView();
    });
  }

  // Login Click
  loginBtn.addEventListener('click', async () => {
    const studentId = studentIdInput.value.trim();
    const password = passwordInput.value;
    const operator = operatorSelect.value;
    const portalAddress = portalAddressInput ? portalAddressInput.value.trim() : '';
    const autoLogin = autoLoginCheck.checked;

    if (!studentId || !password) {
      setStatus('请输入学号和密码', 'error');
      return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = '正在连接...';
    setStatus('正在探测与登录...', 'normal');

    const newConfig = {
      studentId,
      password,
      operator,
      portalAddress,
      autoLogin,
      checkInterval: parseInt(checkIntervalInput.value, 10) || 15,
      autoCheck: autoCheckInput ? autoCheckInput.checked : true
    };
    try {
        const result = await invoke('do_login', { config: newConfig, force: false });
        if (result.needsConfirm) {
            setStatus('当前有其他账号在线，请确认是否顶号', 'error');
            pendingLoginConfig = newConfig;
            if (confirmOnlineUser) confirmOnlineUser.textContent = result.onlineUser || '未知账号';
            if (confirmView) confirmView.classList.remove('view-hidden');
        } else {
            setStatus(result.message, result.success ? 'success' : 'error');
            if (result.success) {
                overrideSuccessView = false;
                showSuccessView();
            }
        }
    } catch(e) {
        setStatus(e, 'error');
    }

    loginBtn.disabled = false;
    loginBtn.textContent = '登录网络';
  });

  // Close App
  if (closeWindowBtn) {
    closeWindowBtn.addEventListener('click', () => {
      appWindow.hide();
    });
  }
});
