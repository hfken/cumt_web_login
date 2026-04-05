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
  const settingsScrollArea = document.getElementById('settingsScrollArea');
  const settingsCustomScrollbar = document.getElementById('settingsCustomScrollbar');
  const settingsCustomScrollbarThumb = document.getElementById('settingsCustomScrollbarThumb');
  const settingsActionsGlass = document.querySelector('#settingsView .settings-actions-glass');
  const settingsActionsPillGroup = document.querySelector('#settingsView .settings-actions-pill-group');
  const backToLoginBtn = document.getElementById('backToLoginBtn');
  const checkUpdateBtn = document.getElementById('checkUpdateBtn');
  const installBetaBtn = document.getElementById('installBetaBtn');
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
  let settingsActionsAnimation = null;
  let settingsDirtyState = false;
  let settingsActionsPillAnimation = null;
  let settingsSaveButtonAnimation = null;

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
  const autoLoginRepairView = document.getElementById('autoLoginRepairView');
  const autoLoginRepairMessage = document.getElementById('autoLoginRepairMessage');
  const autoLoginRepairError = document.getElementById('autoLoginRepairError');
  const autoLoginRepairLaterBtn = document.getElementById('autoLoginRepairLaterBtn');
  const autoLoginRepairNowBtn = document.getElementById('autoLoginRepairNowBtn');

  const updateBanner = document.getElementById('updateBanner');
  const updateBannerTitle = document.getElementById('updateBannerTitle');
  const updateBannerSub = document.getElementById('updateBannerSub');
  const updateBannerBtn = document.getElementById('updateBannerBtn');
  let autoLoginRepairPromptDismissed = false;
  let settingsScrollbarDragState = null;

  const displayMessageReplacements = [
    [
      '设置已保存，正在请求管理员权限以完成开机自启动计划任务配置...',
      '设置已保存，正在请求管理员权限更新开机自启...'
    ],
    [
      '设置已保存，已更新开机自启动配置。',
      '设置已保存，开机自启已更新。'
    ],
    [
      '设置已保存，已关闭开机自启动。',
      '设置已保存，开机自启已关闭。'
    ],
    [
      '检测到你之前已开启“开机后台自动登录”，但当前系统里没有对应的计划任务，开机后将不会自动连接校园网。',
      '已开启开机自启，但系统里缺少对应计划任务。'
    ],
    [
      '检测到现有开机自启动计划任务仍指向旧版本或旧路径，开机后可能无法正常自动连接校园网。',
      '现有开机自启任务仍指向旧路径或旧版本。'
    ],
    [
      '已暂时跳过开机自启动修复提醒，可稍后在设置页重新保存。',
      '已跳过本次修复提醒，可稍后在设置页重新保存。'
    ]
  ];

  function normalizeDisplayMessage(message) {
    return String(message ?? '').replace(/\s+/g, ' ').trim();
  }

  function compactDisplayMessage(message) {
    let compacted = normalizeDisplayMessage(message);

    displayMessageReplacements.forEach(([source, target]) => {
      if (compacted === source) {
        compacted = target;
      }
    });

    compacted = compacted.replace(
      /^配置已保存，但拉起管理员授权失败（错误码 (\d+)），未能完成开机自启动设置。$/,
      '配置已保存，但无法拉起管理员授权（错误码 $1）。'
    );
    compacted = compacted.replace(
      /^配置已保存，但你取消了管理员授权，未能完成开机自启动设置。$/,
      '配置已保存，但你取消了管理员授权，开机自启未更新。'
    );
    compacted = compacted.replace(
      /^配置已保存，但创建开机自启动计划任务失败：当前权限不足。请用管理员模式重新打开程序后再试。$/,
      '配置已保存，但权限不足，开机自启未更新。请用管理员模式重试。'
    );

    return compacted;
  }

  function showSettingsMessage(message, type = 'error') {
    if (!settingsError) return;
    const normalizedMessage = normalizeDisplayMessage(message);
    settingsError.textContent = compactDisplayMessage(normalizedMessage);
    settingsError.title = normalizedMessage;
    settingsError.style.color = type === 'error' ? '#dc2626' : '#355f8a';
    settingsError.classList.remove('view-hidden');
    scrollSettingsMessageIntoView();
  }

  function clearSettingsMessage() {
    if (!settingsError) return;
    settingsError.title = '';
    settingsError.style.color = '#dc2626';
    settingsError.classList.add('view-hidden');
  }

  function showAutoLoginRepairError(message) {
    if (!autoLoginRepairError) return;
    const normalizedMessage = normalizeDisplayMessage(message);
    autoLoginRepairError.textContent = compactDisplayMessage(normalizedMessage);
    autoLoginRepairError.title = normalizedMessage;
    autoLoginRepairError.classList.remove('view-hidden');
  }

  function clearAutoLoginRepairError() {
    if (!autoLoginRepairError) return;
    autoLoginRepairError.textContent = '';
    autoLoginRepairError.title = '';
    autoLoginRepairError.classList.add('view-hidden');
  }

  function updateSettingsCustomScrollbar() {
    if (!settingsScrollArea || !settingsCustomScrollbar || !settingsCustomScrollbarThumb) return;

    const viewportHeight = settingsScrollArea.clientHeight;
    const contentHeight = settingsScrollArea.scrollHeight;
    const trackHeight = settingsCustomScrollbar.clientHeight;
    const maxScrollTop = Math.max(0, contentHeight - viewportHeight);

    if (maxScrollTop <= 0 || trackHeight <= 0) {
      settingsCustomScrollbar.classList.add('is-hidden');
      settingsCustomScrollbarThumb.style.height = '0px';
      settingsCustomScrollbarThumb.style.transform = 'translateY(0)';
      return;
    }

    settingsCustomScrollbar.classList.remove('is-hidden');

    const thumbHeight = Math.max(30, Math.round((viewportHeight / contentHeight) * trackHeight));
    const maxThumbTop = Math.max(0, trackHeight - thumbHeight);
    const thumbTop = (settingsScrollArea.scrollTop / maxScrollTop) * maxThumbTop;

    settingsCustomScrollbarThumb.style.height = `${thumbHeight}px`;
    settingsCustomScrollbarThumb.style.transform = `translateY(${thumbTop}px)`;
  }

  function scheduleSettingsCustomScrollbarRefresh() {
    if (!settingsView || settingsView.classList.contains('view-hidden')) return;

    updateSettingsCustomScrollbar();
    window.requestAnimationFrame(() => {
      updateSettingsCustomScrollbar();
      window.requestAnimationFrame(() => {
        updateSettingsCustomScrollbar();
      });
    });
    window.setTimeout(() => {
      updateSettingsCustomScrollbar();
    }, 80);
  }

  function getSettingsActionsDirtyPadding() {
    if (!settingsActionsGlass || !closeSettingsBtn) return 0;
    const gap = 10;
    return closeSettingsBtn.offsetWidth + gap;
  }

  function applySettingsActionsDirtyState(isDirty) {
    if (!settingsActionsGlass || !closeSettingsBtn || !settingsActionsPillGroup) return;

    settingsDirtyState = !!isDirty;
    settingsActionsGlass.style.paddingRight = isDirty ? `${getSettingsActionsDirtyPadding()}px` : '0px';
    settingsActionsPillGroup.style.transform = 'translateX(0)';
    closeSettingsBtn.style.opacity = isDirty ? '1' : '0';
    closeSettingsBtn.style.visibility = isDirty ? 'visible' : 'hidden';
    closeSettingsBtn.style.pointerEvents = isDirty ? 'auto' : 'none';
  }

  function updateSettingsActionsDirtyState(forceDirty = null, options = {}) {
    if (!settingsActionsGlass || !closeSettingsBtn || !settingsActionsPillGroup) return;

    const { animate = !settingsView?.classList.contains('view-hidden') } = options;
    const nextDirty = !!(forceDirty ?? hasUnsavedSettings());

    if (nextDirty === settingsDirtyState && !animate) {
      applySettingsActionsDirtyState(nextDirty);
      return;
    }

    if (nextDirty === settingsDirtyState) return;

    const pillRectBefore = settingsActionsPillGroup.getBoundingClientRect();

    if (settingsActionsPillAnimation) {
      settingsActionsPillAnimation.cancel();
      settingsActionsPillAnimation = null;
    }

    if (settingsSaveButtonAnimation) {
      settingsSaveButtonAnimation.cancel();
      settingsSaveButtonAnimation = null;
    }

    if (!animate) {
      applySettingsActionsDirtyState(nextDirty);
      return;
    }

    const targetPadding = nextDirty ? getSettingsActionsDirtyPadding() : 0;
    const currentOpacity = parseFloat(window.getComputedStyle(closeSettingsBtn).opacity) || 0;
    const targetOpacity = nextDirty ? 1 : 0;

    if (nextDirty) {
      closeSettingsBtn.style.visibility = 'visible';
      closeSettingsBtn.style.pointerEvents = 'none';
    }

    settingsActionsGlass.style.paddingRight = `${targetPadding}px`;
    const pillRectAfter = settingsActionsPillGroup.getBoundingClientRect();
    const pillDeltaX = pillRectBefore.left - pillRectAfter.left;

    if (Math.abs(pillDeltaX) > 0.5 && typeof settingsActionsPillGroup.animate === 'function') {
      settingsActionsPillGroup.style.transform = `translateX(${pillDeltaX}px)`;
      settingsActionsPillAnimation = settingsActionsPillGroup.animate(
        [
          { transform: `translateX(${pillDeltaX}px)` },
          { transform: 'translateX(0)' }
        ],
        {
          duration: 460,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          fill: 'forwards'
        }
      );

      settingsActionsPillAnimation.onfinish = () => {
        settingsActionsPillGroup.style.transform = 'translateX(0)';
        settingsActionsPillAnimation = null;
      };

      settingsActionsPillAnimation.oncancel = () => {
        settingsActionsPillGroup.style.transform = 'translateX(0)';
        settingsActionsPillAnimation = null;
      };
    } else {
      settingsActionsPillGroup.style.transform = 'translateX(0)';
    }

    if (typeof closeSettingsBtn.animate === 'function') {
      settingsSaveButtonAnimation = closeSettingsBtn.animate(
        [
          { opacity: currentOpacity },
          { opacity: targetOpacity }
        ],
        {
          duration: nextDirty ? 320 : 220,
          easing: 'ease',
          fill: 'forwards'
        }
      );

      settingsSaveButtonAnimation.onfinish = () => {
        closeSettingsBtn.style.opacity = `${targetOpacity}`;
        closeSettingsBtn.style.visibility = nextDirty ? 'visible' : 'hidden';
        closeSettingsBtn.style.pointerEvents = nextDirty ? 'auto' : 'none';
        settingsSaveButtonAnimation = null;
      };

      settingsSaveButtonAnimation.oncancel = () => {
        settingsSaveButtonAnimation = null;
      };
    } else {
      closeSettingsBtn.style.transition = `opacity ${nextDirty ? 0.32 : 0.22}s ease`;
      window.requestAnimationFrame(() => {
        closeSettingsBtn.style.opacity = `${targetOpacity}`;
      });
      window.setTimeout(() => {
        closeSettingsBtn.style.visibility = nextDirty ? 'visible' : 'hidden';
        closeSettingsBtn.style.pointerEvents = nextDirty ? 'auto' : 'none';
      }, nextDirty ? 320 : 220);
    }

    settingsDirtyState = nextDirty;
  }

  function playSettingsActionsEntrance() {
    if (!settingsActionsGlass) return;

    if (settingsActionsAnimation) {
      settingsActionsAnimation.cancel();
      settingsActionsAnimation = null;
    }

    settingsActionsGlass.style.opacity = '0';
    settingsActionsGlass.style.transform = 'translateY(calc(100% + 96px)) scale(0.95)';
    void settingsActionsGlass.offsetHeight;

    if (typeof settingsActionsGlass.animate === 'function') {
      settingsActionsAnimation = settingsActionsGlass.animate(
        [
          {
            opacity: 0,
            transform: 'translateY(calc(100% + 96px)) scale(0.95)'
          },
          {
            opacity: 1,
            transform: 'translateY(0) scale(1)'
          }
        ],
        {
          duration: 820,
          easing: 'cubic-bezier(0.16, 0.92, 0.2, 1)',
          fill: 'forwards'
        }
      );

      settingsActionsAnimation.onfinish = () => {
        settingsActionsGlass.style.opacity = '1';
        settingsActionsGlass.style.transform = 'translateY(0) scale(1)';
        settingsActionsAnimation = null;
      };

      settingsActionsAnimation.oncancel = () => {
        settingsActionsAnimation = null;
      };
      return;
    }

    settingsActionsGlass.style.transition = 'transform 0.82s cubic-bezier(0.16, 0.92, 0.2, 1), opacity 0.48s ease';
    window.requestAnimationFrame(() => {
      settingsActionsGlass.style.opacity = '1';
      settingsActionsGlass.style.transform = 'translateY(0) scale(1)';
    });
  }

  function scheduleSettingsActionsEntrance() {
    if (!settingsActionsGlass) return;

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        playSettingsActionsEntrance();
      });
    });
  }

  function scrollSettingsMessageIntoView() {
    if (!settingsView || settingsView.classList.contains('view-hidden')) return;
    if (!settingsScrollArea || !settingsError || settingsError.classList.contains('view-hidden')) return;

    const scrollToBottom = behavior => {
      settingsScrollArea.scrollTo({
        top: settingsScrollArea.scrollHeight,
        behavior
      });
      updateSettingsCustomScrollbar();
    };

    window.requestAnimationFrame(() => {
      scrollToBottom('smooth');
      window.requestAnimationFrame(() => {
        updateSettingsCustomScrollbar();
      });
    });

    window.setTimeout(() => {
      scrollToBottom('auto');
      updateSettingsCustomScrollbar();
    }, 120);
  }

  function scrollSettingsByTrackPosition(clientY) {
    if (!settingsScrollArea || !settingsCustomScrollbar || !settingsCustomScrollbarThumb) return;

    const trackRect = settingsCustomScrollbar.getBoundingClientRect();
    const thumbHeight = settingsCustomScrollbarThumb.offsetHeight;
    const maxThumbTop = Math.max(0, trackRect.height - thumbHeight);
    const rawThumbTop = clientY - trackRect.top - thumbHeight / 2;
    const thumbTop = Math.min(Math.max(0, rawThumbTop), maxThumbTop);
    const maxScrollTop = Math.max(0, settingsScrollArea.scrollHeight - settingsScrollArea.clientHeight);

    settingsScrollArea.scrollTop = maxThumbTop === 0
      ? 0
      : (thumbTop / maxThumbTop) * maxScrollTop;
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

    updateSettingsActionsDirtyState(false, { animate: false });
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

  function bindSettingsDirtyState() {
    const watchInput = (element, eventName = 'input') => {
      if (!element) return;
      element.addEventListener(eventName, () => {
        updateSettingsActionsDirtyState(null, { animate: true });
      });
    };

    watchInput(studentIdInput);
    watchInput(passwordInput);
    watchInput(portalAddressInput);
    watchInput(checkIntervalInput);
    watchInput(operatorSelect, 'change');
    watchInput(autoLoginCheck, 'change');
    watchInput(autoCheckInput, 'change');
  }

  async function checkAutoLoginRepairPrompt() {
    if (autoLoginRepairPromptDismissed) return;
    if (!config?.autoLogin) return;

    try {
      const taskStatus = await invoke('check_auto_login_task_status', { configValue: config });
      if (!taskStatus?.needsAttention) return;
      if (autoLoginRepairMessage) {
        const rawMessage = taskStatus.message || '检测到当前系统里的开机自启动任务异常，开机后可能不会自动连接校园网。';
        autoLoginRepairMessage.textContent = compactDisplayMessage(rawMessage);
        autoLoginRepairMessage.title = normalizeDisplayMessage(rawMessage);
      }
      clearAutoLoginRepairError();
      if (autoLoginRepairView) autoLoginRepairView.classList.remove('view-hidden');
    } catch (error) {
      console.warn('Failed to inspect auto login task status:', error);
    }
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
    const normalizedMessage = normalizeDisplayMessage(msg);
    statusMessage.textContent = compactDisplayMessage(normalizedMessage);
    statusMessage.title = normalizedMessage;
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

  async function openBetaInstaller() {
    if (!installBetaBtn) return;

    if (isBetaBuild) {
      showSettingsMessage('你已安装测试版客户端，无需重复安装。', 'info');
      setStatus('当前已是测试版客户端', 'normal');
      return;
    }

    const originalText = installBetaBtn.textContent;
    installBetaBtn.disabled = true;
    installBetaBtn.textContent = '正在下载...';

    try {
      const betaInstallResult = await invoke('install_beta_update');
      const betaVersion = betaInstallResult && typeof betaInstallResult.version === 'string'
        ? betaInstallResult.version
        : '未知版本';

      showSettingsMessage(`测试版 v${betaVersion} 安装程序已启动，请按安装向导完成更新`, 'info');
    } catch (error) {
      showSettingsMessage('安装测试版失败: ' + error, 'error');
      console.error('Install beta update failed:', error);
    }

    installBetaBtn.textContent = originalText;
    installBetaBtn.disabled = false;
  }

  // Settings Overlay Logic
  if (autoCheckInput) {
    autoCheckInput.addEventListener('change', () => {
      if (checkIntervalWrapper) {
        if (autoCheckInput.checked) checkIntervalWrapper.classList.remove('collapsed');
        else checkIntervalWrapper.classList.add('collapsed');
      }
      updateSettingsActionsDirtyState(null, { animate: true });
      scheduleSettingsCustomScrollbarRefresh();
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

  if (autoLoginRepairLaterBtn) {
    autoLoginRepairLaterBtn.addEventListener('click', () => {
      autoLoginRepairPromptDismissed = true;
      clearAutoLoginRepairError();
      if (autoLoginRepairView) autoLoginRepairView.classList.add('view-hidden');
      setStatus('已暂时跳过开机自启动修复提醒，可稍后在设置页重新保存。', 'normal');
    });
  }

  if (autoLoginRepairNowBtn) {
    autoLoginRepairNowBtn.addEventListener('click', async () => {
      autoLoginRepairNowBtn.disabled = true;
      if (autoLoginRepairLaterBtn) autoLoginRepairLaterBtn.disabled = true;
      clearAutoLoginRepairError();

      try {
        const syncResult = await invoke('sync_auto_login_settings', { configValue: config });
        if (autoLoginRepairView) autoLoginRepairView.classList.add('view-hidden');
        autoLoginRepairPromptDismissed = true;
        const syncStatusType = syncResult?.synced === false ? 'normal' : 'success';
        setStatus(syncResult?.message || '已开始修复开机自启动设置', syncStatusType);
      } catch (error) {
        showAutoLoginRepairError(String(error));
        setStatus(String(error), 'error');
      } finally {
        autoLoginRepairNowBtn.disabled = false;
        if (autoLoginRepairLaterBtn) autoLoginRepairLaterBtn.disabled = false;
      }
    });
  }

  if (settingsScrollArea) {
    settingsScrollArea.addEventListener('scroll', updateSettingsCustomScrollbar);
  }

  if (settingsCustomScrollbar) {
    settingsCustomScrollbar.addEventListener('mousedown', event => {
      if (event.target === settingsCustomScrollbarThumb) return;
      event.preventDefault();
      scrollSettingsByTrackPosition(event.clientY);
      updateSettingsCustomScrollbar();
    });
  }

  if (settingsCustomScrollbarThumb) {
    settingsCustomScrollbarThumb.addEventListener('mousedown', event => {
      if (!settingsCustomScrollbar) return;
      event.preventDefault();

      const trackRect = settingsCustomScrollbar.getBoundingClientRect();
      const thumbRect = settingsCustomScrollbarThumb.getBoundingClientRect();
      settingsScrollbarDragState = {
        pointerOffsetY: event.clientY - thumbRect.top,
        trackTop: trackRect.top
      };
      settingsCustomScrollbarThumb.classList.add('is-active');
      document.body.style.userSelect = 'none';
    });
  }

  document.addEventListener('mousemove', event => {
    if (!settingsScrollbarDragState || !settingsScrollArea || !settingsCustomScrollbar || !settingsCustomScrollbarThumb) {
      return;
    }

    const trackHeight = settingsCustomScrollbar.clientHeight;
    const thumbHeight = settingsCustomScrollbarThumb.offsetHeight;
    const maxThumbTop = Math.max(0, trackHeight - thumbHeight);
    const rawThumbTop = event.clientY - settingsScrollbarDragState.trackTop - settingsScrollbarDragState.pointerOffsetY;
    const thumbTop = Math.min(Math.max(0, rawThumbTop), maxThumbTop);
    const maxScrollTop = Math.max(0, settingsScrollArea.scrollHeight - settingsScrollArea.clientHeight);

    settingsScrollArea.scrollTop = maxThumbTop === 0
      ? 0
      : (thumbTop / maxThumbTop) * maxScrollTop;
  });

  document.addEventListener('mouseup', () => {
    if (!settingsScrollbarDragState) return;
    settingsScrollbarDragState = null;
    if (settingsCustomScrollbarThumb) {
      settingsCustomScrollbarThumb.classList.remove('is-active');
    }
    document.body.style.userSelect = '';
  });

  window.addEventListener('resize', updateSettingsCustomScrollbar);

  if (openSettingsBtn) {
    openSettingsBtn.addEventListener('click', async () => {
      openSettingsBtn.disabled = true;
      clearSettingsMessage();

      try {
        await refreshConfigFromBackend({ applyToForm: true });
        if (settingsView) settingsView.classList.remove('view-hidden');
        updateSettingsActionsDirtyState(false, { animate: false });
        scheduleSettingsActionsEntrance();
        if (settingsScrollArea) settingsScrollArea.scrollTop = 0;
        scheduleSettingsCustomScrollbarRefresh();
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

        const syncResult = await invoke('sync_auto_login_settings', { configValue: nextConfig });
        if (settingsView) settingsView.classList.add('view-hidden');
        showLoginView();
        const syncStatusType = syncResult?.synced === false ? 'normal' : 'success';
        setStatus(syncResult?.message || '设置已保存', syncStatusType);
      } catch (error) {
        if (settingsView) settingsView.classList.remove('view-hidden');
        showSettingsMessage(String(error), 'error');
        setStatus(String(error), 'error');
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
        updateSettingsActionsDirtyState(false, { animate: false });
        overrideSuccessView = true;
        showLoginView();
        if (settingsView) settingsView.classList.add('view-hidden');
        const clearMessage = result?.message || '已清除所有本地配置。';
        const clearStatusType = /但|失败|未能/.test(clearMessage) ? 'error' : 'normal';
        setStatus(clearMessage, clearStatusType);
      } catch (error) {
        showSettingsMessage(String(error), 'error');
      } finally {
        if (clearConfigBtn) clearConfigBtn.disabled = false;
        closeSettingsBtn.disabled = false;
        if (checkUpdateBtn) checkUpdateBtn.disabled = false;
      }
  }

  // Check Updates Logic
  bindSettingsDirtyState();

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

  if (installBetaBtn) {
    installBetaBtn.addEventListener('click', () => {
      openBetaInstaller();
    });
  }

  // Load Config
  let config = getDefaultConfig();
  try {
    await refreshConfigFromBackend({ applyToForm: true });
    updateSettingsCustomScrollbar();
    await checkAutoLoginRepairPrompt();
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
