const { invoke } = window.__TAURI__.tauri;
const { app } = window.__TAURI__;
const { appWindow, WebviewWindow } = window.__TAURI__.window;

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
  const clearConfigBtn = document.getElementById('clearConfigBtn');
  const settingsBackBtn = document.getElementById('settingsBackBtn');
  const checkIntervalInput = document.getElementById('checkInterval');
  const checkIntervalWrapper = document.getElementById('checkIntervalWrapper');
  const autoCheckInput = document.getElementById('autoCheck');
  const portalAddressInput = document.getElementById('portalAddress');
  const backToLoginBtn = document.getElementById('backToLoginBtn');
  const checkUpdateBtn = document.getElementById('checkUpdateBtn');
  const settingsError = document.getElementById('settingsError');

  let overrideSuccessView = false;
  let wasConnected = null;
  let hasCheckedUpdates = false;
  let isCheckingUpdates = false;
  let pendingLoginConfig = null;
  let lastUpdateInfo = null;
  let notifiedUpdateVersion = null;
  let isBetaBuild = false;
  const startupVersion = await getCurrentVersion();
  isBetaBuild = String(startupVersion).includes('-beta');

  const confirmView = document.getElementById('confirmView');
  const confirmOnlineUser = document.getElementById('confirmOnlineUser');
  const confirmCancelBtn = document.getElementById('confirmCancelBtn');
  const confirmOkBtn = document.getElementById('confirmOkBtn');
  const unsavedConfirmView = document.getElementById('unsavedConfirmView');
  const unsavedConfirmCancelBtn = document.getElementById('unsavedConfirmCancelBtn');
  const unsavedConfirmOkBtn = document.getElementById('unsavedConfirmOkBtn');
  const clearConfigConfirmView = document.getElementById('clearConfigConfirmView');
  const clearConfigConfirmCancelBtn = document.getElementById('clearConfigConfirmCancelBtn');
  const clearConfigConfirmOkBtn = document.getElementById('clearConfigConfirmOkBtn');

  const updateBanner = document.getElementById('updateBanner');
  const updateBannerTitle = document.getElementById('updateBannerTitle');
  const updateBannerSub = document.getElementById('updateBannerSub');
  const updateBannerBtn = document.getElementById('updateBannerBtn');

  function showSettingsMessage(message, type = 'error') {
    if (!settingsError) return;
    settingsError.textContent = message;
    settingsError.style.color = type === 'error' ? '#dc2626' : '#355f8a';
    settingsError.classList.remove('view-hidden');
  }

  function clearSettingsMessage() {
    if (!settingsError) return;
    settingsError.style.color = '#dc2626';
    settingsError.classList.add('view-hidden');
  }

  function collectDraftConfig() {
    return {
      studentId: studentIdInput.value.trim(),
      password: passwordInput.value,
      operator: operatorSelect.value,
      portalAddress: portalAddressInput ? portalAddressInput.value.trim() : '',
      autoLogin: autoLoginCheck.checked,
      checkInterval: parseInt(checkIntervalInput.value, 10) || 15,
      autoCheck: autoCheckInput ? autoCheckInput.checked : true
    };
  }

  function getDefaultConfig() {
    return {
      studentId: '',
      password: '',
      operator: 'cmcc',
      portalAddress: '',
      autoLogin: false,
      checkInterval: 15,
      autoCheck: true
    };
  }

  async function refreshConfigFromBackend({ applyToForm = false } = {}) {
    try {
      const latestConfig = await invoke('get_config');
      config = normalizeConfig(latestConfig);
      if (applyToForm) {
        applyConfigToForm(config);
      }
      return config;
    } catch (error) {
      console.error('Failed to load config', error);
      throw error;
    }
  }

  function applyConfigToForm(configValue) {
    if (!configValue) return;

    studentIdInput.value = configValue.studentId || '';
    passwordInput.value = configValue.password || '';
    operatorSelect.value = configValue.operator || 'cmcc';
    if (portalAddressInput) portalAddressInput.value = configValue.portalAddress || '';
    autoLoginCheck.checked = !!configValue.autoLogin;
    if (autoCheckInput) autoCheckInput.checked = configValue.autoCheck !== false;
    if (checkIntervalInput) checkIntervalInput.value = configValue.checkInterval || 15;
    if (checkIntervalWrapper) {
      if (configValue.autoCheck === false) checkIntervalWrapper.classList.add('collapsed');
      else checkIntervalWrapper.classList.remove('collapsed');
    }
  }

  function normalizeConfig(configValue) {
    return {
      studentId: (configValue?.studentId || '').trim(),
      password: configValue?.password || '',
      operator: configValue?.operator || 'cmcc',
      portalAddress: (configValue?.portalAddress || '').trim(),
      autoLogin: !!configValue?.autoLogin,
      checkInterval: parseInt(configValue?.checkInterval, 10) || 15,
      autoCheck: configValue?.autoCheck !== false
    };
  }

  async function persistConfig(configValue) {
    const normalizedConfig = normalizeConfig(configValue);
    await invoke('save_config', { configValue: normalizedConfig });
    config = normalizedConfig;
    applyConfigToForm(config);
    return config;
  }

  function hasUnsavedSettings() {
    return JSON.stringify(normalizeConfig(collectDraftConfig())) !== JSON.stringify(normalizeConfig(config));
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
    } catch (error) {
      console.warn('Failed to read app version:', error);
      return '';
    }
  }

  function getPreferredUpdateChannel() {
    return isBetaBuild ? 'beta' : 'stable';
  }

  function openUpdateLogWindow(updateInfo, channel = 'stable') {
    if (!updateInfo || !WebviewWindow) return;

    const cacheKey = `update-log:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(cacheKey, JSON.stringify({
      channel,
      version: updateInfo.version || '',
      available: !!updateInfo.available,
      notes: updateInfo.notes || '',
      checkedAt: new Date().toISOString()
    }));

    const existingWindow = WebviewWindow.getByLabel('update-log-window');
    if (existingWindow) {
      existingWindow.close().catch(() => {});
    }

    new WebviewWindow('update-log-window', {
      url: `update-log.html?dataKey=${encodeURIComponent(cacheKey)}`,
      title: '版本更新日志',
      width: 560,
      height: 420,
      minWidth: 560,
      minHeight: 420,
      maxWidth: 560,
      center: true,
      resizable: false,
      decorations: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      maximizable: false,
      minimizable: false,
      focus: true,
      visible: false
    });
  }

  function showUpdateBanner(version, notes) {
    lastUpdateInfo = {
      version,
      notes: notes || '',
      available: true
    };

    if (updateBannerTitle) updateBannerTitle.textContent = `发现新版本 v${version}`;
    if (updateBannerSub && notes) {
      const firstLine = notes.split('\n')[0];
      updateBannerSub.textContent = firstLine.length > 28 ? firstLine.slice(0, 28) + '…' : firstLine;
    }
    if (updateBanner) updateBanner.classList.remove('view-hidden');
  }

  async function checkUpdateOnConnect() {
    if (hasCheckedUpdates || isCheckingUpdates) return;
    isCheckingUpdates = true;
    try {
      const hasInternetAccess = await invoke('check_internet_access');
      if (!hasInternetAccess) {
        return;
      }

      const updateInfo = await invoke('check_for_updates');
      hasCheckedUpdates = true;
      if (updateInfo && updateInfo.available) {
        showUpdateBanner(updateInfo.version, updateInfo.notes);
        if (updateInfo.version && notifiedUpdateVersion !== updateInfo.version) {
          notifiedUpdateVersion = updateInfo.version;
          invoke('notify_update_available', { version: updateInfo.version }).catch(console.error);
        }
      }
    } catch (e) {
      console.warn('Auto update check failed:', e);
    } finally {
      isCheckingUpdates = false;
    }
  }

  if (updateBannerBtn) {
    updateBannerBtn.addEventListener('click', () => {
      if (lastUpdateInfo) openUpdateLogWindow(lastUpdateInfo, getPreferredUpdateChannel());
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
      const loginConfig = pendingLoginConfig;
      pendingLoginConfig = null;
      if (confirmView) confirmView.classList.add('view-hidden');

      loginBtn.disabled = true;
      loginBtn.textContent = '正在连接...';
      setStatus('正在顶替登录...', 'normal');
      try {
        const result = await invoke('do_login', { configValue: loginConfig, force: true });
        let statusType = result.success ? 'success' : 'error';
        let statusMessageText = result.message;

        if (result.success) {
          try {
            await persistConfig(loginConfig);
          } catch (error) {
            console.error('Failed to persist config after force login:', error);
            statusType = 'error';
            statusMessageText = `${result.message}，但保存本地配置失败：${String(error)}`;
          }
        }

        setStatus(statusMessageText, statusType);
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

  if (unsavedConfirmCancelBtn) {
    unsavedConfirmCancelBtn.addEventListener('click', () => {
      if (unsavedConfirmView) unsavedConfirmView.classList.add('view-hidden');
      if (settingsView) settingsView.classList.remove('view-hidden');
    });
  }

  if (unsavedConfirmOkBtn) {
    unsavedConfirmOkBtn.addEventListener('click', () => {
      applyConfigToForm(config);
      if (unsavedConfirmView) unsavedConfirmView.classList.add('view-hidden');
      if (settingsView) settingsView.classList.add('view-hidden');
      clearSettingsMessage();
      showLoginView();
    });
  }

  if (clearConfigConfirmCancelBtn) {
    clearConfigConfirmCancelBtn.addEventListener('click', () => {
      if (clearConfigConfirmView) clearConfigConfirmView.classList.add('view-hidden');
      if (settingsView) settingsView.classList.remove('view-hidden');
    });
  }

  if (clearConfigConfirmOkBtn) {
    clearConfigConfirmOkBtn.addEventListener('click', () => {
      if (clearConfigConfirmView) clearConfigConfirmView.classList.add('view-hidden');
      performClearConfig();
    });
  }

  if (openSettingsBtn) {
    openSettingsBtn.addEventListener('click', async () => {
      openSettingsBtn.disabled = true;
      clearSettingsMessage();

      try {
        await refreshConfigFromBackend({ applyToForm: true });
        if (settingsView) settingsView.classList.remove('view-hidden');
      } catch (error) {
        setStatus(`读取设置失败：${String(error)}`, 'error');
      } finally {
        openSettingsBtn.disabled = false;
      }
    });
  }

  if (settingsBackBtn) {
    settingsBackBtn.addEventListener('click', () => {
      if (hasUnsavedSettings()) {
        if (unsavedConfirmView) unsavedConfirmView.classList.remove('view-hidden');
        return;
      }
      if (settingsView) settingsView.classList.add('view-hidden');
      clearSettingsMessage();
      showLoginView();
    });
  }

  if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener('click', () => {
      handleSaveSettings().catch(error => {
        console.error('Failed to save settings:', error);
        showSettingsMessage(String(error), 'error');
        closeSettingsBtn.disabled = false;
        if (checkUpdateBtn) checkUpdateBtn.disabled = false;
      });
    });
  }

  if (clearConfigBtn) {
    clearConfigBtn.addEventListener('click', () => {
      handleClearConfig();
    });
  }

  async function handleSaveSettings() {
      const isAutoCheck = autoCheckInput ? autoCheckInput.checked : true;
      const intervalVal = parseInt(checkIntervalInput.value, 10);
      
      if (isAutoCheck && (isNaN(intervalVal) || intervalVal < 5)) {
        showSettingsMessage('⚠ 频率不得低于 5 秒', 'error');
        if (checkIntervalInput) {
          checkIntervalInput.classList.add('shake');
          setTimeout(() => checkIntervalInput.classList.remove('shake'), 400);
        }
        return; // Early return to prevent saving & closing
      }

      clearSettingsMessage();
      closeSettingsBtn.disabled = true;
      if (clearConfigBtn) clearConfigBtn.disabled = true;
      if (checkUpdateBtn) checkUpdateBtn.disabled = true;
      
      const newConfig = {
        studentId: studentIdInput.value.trim(),
        password: passwordInput.value,
        operator: operatorSelect.value,
        portalAddress: portalAddressInput ? portalAddressInput.value.trim() : '',
        autoLogin: autoLoginCheck.checked,
        checkInterval: intervalVal,
        autoCheck: isAutoCheck
      };
      const nextConfig = normalizeConfig(newConfig);
      
      try {
        await persistConfig(newConfig);
        if (typeof startHeartbeat === 'function') startHeartbeat(nextConfig.checkInterval, nextConfig.autoCheck);
        if (settingsView) settingsView.classList.add('view-hidden');
        showLoginView();

        const syncResult = await invoke('sync_auto_login_settings', { configValue: nextConfig });
        const syncStatusType = syncResult?.synced === false ? 'normal' : 'success';
        setStatus(syncResult?.message || '设置已保存', syncStatusType);
      } catch (error) {
        showSettingsMessage(String(error), 'error');
      } finally {
        closeSettingsBtn.disabled = false;
        if (clearConfigBtn) clearConfigBtn.disabled = false;
        if (checkUpdateBtn) checkUpdateBtn.disabled = false;
      }
  }

  function handleClearConfig() {
      clearSettingsMessage();
      if (clearConfigConfirmView) clearConfigConfirmView.classList.remove('view-hidden');
  }

  async function performClearConfig() {
      clearSettingsMessage();
      if (clearConfigBtn) clearConfigBtn.disabled = true;
      closeSettingsBtn.disabled = true;
      if (checkUpdateBtn) checkUpdateBtn.disabled = true;

      try {
        const result = await invoke('clear_config');
        config = getDefaultConfig();
        applyConfigToForm(config);
        if (typeof startHeartbeat === 'function') startHeartbeat(config.checkInterval, config.autoCheck);
        overrideSuccessView = true;
        showLoginView();
        if (settingsView) settingsView.classList.add('view-hidden');
        setStatus(result?.message || '已清空本地保存的账号配置，当前网络连接状态不受影响。', 'normal');
      } catch (error) {
        showSettingsMessage(String(error), 'error');
      } finally {
        if (clearConfigBtn) clearConfigBtn.disabled = false;
        closeSettingsBtn.disabled = false;
        if (checkUpdateBtn) checkUpdateBtn.disabled = false;
      }
  }

  // Check Updates Logic
  if (checkUpdateBtn) {
    checkUpdateBtn.addEventListener('click', async () => {
      checkUpdateBtn.disabled = true;
      clearSettingsMessage();

      try {
        const updateInfo = await invoke('check_for_updates');
        if (updateInfo) {
            lastUpdateInfo = updateInfo;
            openUpdateLogWindow(updateInfo, getPreferredUpdateChannel());
        }
      } catch (e) {
        showSettingsMessage('网络不通，或你尚未为此版本生成安全签名。\n底层截获: ' + e, 'error');
        console.error(e);
      } finally {
        checkUpdateBtn.disabled = false;
      }
    });
  }

  // Load Config
  let config = getDefaultConfig();
  try {
    await refreshConfigFromBackend({ applyToForm: true });
  } catch (error) {
    config = getDefaultConfig();
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

    await checkUpdateOnConnect();
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
  if (appVersionDisplay && startupVersion) {
      appVersionDisplay.textContent = `版本 v${startupVersion} | 中国矿业大学`;
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
        const result = await invoke('do_login', { configValue: newConfig, force: false });
        if (result.needsConfirm) {
            setStatus('当前有其他账号在线，请确认是否顶号', 'error');
            pendingLoginConfig = newConfig;
            if (confirmOnlineUser) confirmOnlineUser.textContent = result.onlineUser || '未知账号';
            if (confirmView) confirmView.classList.remove('view-hidden');
        } else {
            let statusType = result.success ? 'success' : 'error';
            let statusMessageText = result.message;

            if (result.success) {
                try {
                    await persistConfig(newConfig);
                } catch (error) {
                    console.error('Failed to persist config after login:', error);
                    statusType = 'error';
                    statusMessageText = `${result.message}，但保存本地配置失败：${String(error)}`;
                }
            }

            setStatus(statusMessageText, statusType);
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
