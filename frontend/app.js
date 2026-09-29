/**
 * Stark Proofreader AI - Executive Classy Edition
 * Dual-Pane Wordvice AI Layout & Document Intelligence
 */

document.addEventListener('DOMContentLoaded', () => {
  // State
  let currentFile = null;
  let sessionId = null;
  let docBlocks = [];
  let docIssues = [];
  let decisions = {}; // issue_id -> { accepted: bool, rejected: bool, editedText: string }
  let currentFilter = 'all';
  let serverHasKey = false;
  let currentActiveIssueId = null;

  // DOM Elements - Shell & Sidebar
  const appSidebar = document.getElementById('appSidebar');
  const btnToggleSidebar = document.getElementById('btnToggleSidebar');
  const navProofread = document.getElementById('navProofread');
  const navDocMode = document.getElementById('navDocMode');
  const navQuickPaste = document.getElementById('navQuickPaste');
  const btnSettingsNav = document.getElementById('btnSettingsNav');
  const btnRulesNav = document.getElementById('btnRulesNav');
  const themeToggle = document.getElementById('themeToggle');
  const btnLockSession = document.getElementById('btnLockSession');
  const sidebarApiKeyDot = document.getElementById('sidebarApiKeyDot');

  // DOM Elements - Topbar
  const activeDocTag = document.getElementById('activeDocTag');
  const activeDocTitle = document.getElementById('activeDocTitle');
  const btnLoadSample = document.getElementById('btnLoadSample');
  const apiKeyStatus = document.getElementById('apiKeyStatus');
  const authStatusBadge = document.getElementById('authStatusBadge');

  // DOM Elements - Subtoolbar
  const langSelect = document.getElementById('langSelect');
  const modePillsGroup = document.getElementById('modePillsGroup');
  const toneSelect = document.getElementById('toneSelect');
  const btnApplyAndDownload = document.getElementById('btnApplyAndDownload');

  // DOM Elements - Left Pane
  const leftInputState = document.getElementById('leftInputState');
  const leftDocViewerState = document.getElementById('leftDocViewerState');
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const selectedFileInfo = document.getElementById('selectedFileInfo');
  const selectedFileName = document.getElementById('selectedFileName');
  const btnRemoveFile = document.getElementById('btnRemoveFile');
  const rawTextInput = document.getElementById('rawTextInput');
  const docViewer = document.getElementById('docViewer');
  const btnStartAnalysis = document.getElementById('btnStartAnalysis');
  const btnStartText = document.getElementById('btnStartText');
  const btnClearDoc = document.getElementById('btnClearDoc');
  const wordCountLabel = document.getElementById('wordCountLabel');
  const btnCopyContent = document.getElementById('btnCopyContent');

  // DOM Elements - Right Pane
  const rightEmptyState = document.getElementById('rightEmptyState');
  const rightActiveState = document.getElementById('rightActiveState');
  const autoAcceptBanner = document.getElementById('autoAcceptBanner');
  const bannerAutoCount = document.getElementById('bannerAutoCount');
  const bannerPendingText = document.getElementById('bannerPendingText');
  const btnViewPendingOnly = document.getElementById('btnViewPendingOnly');
  const btnCloseBanner = document.getElementById('btnCloseBanner');
  const filterChips = document.querySelectorAll('.chip');
  const countNeedsReview = document.getElementById('countNeedsReview');
  const countAutoAccepted = document.getElementById('countAutoAccepted');
  const countAll = document.getElementById('countAll');
  const countSpelling = document.getElementById('countSpelling');
  const countGrammar = document.getElementById('countGrammar');
  const countSpacing = document.getElementById('countSpacing');
  const countClarity = document.getElementById('countClarity');
  const suggestionsList = document.getElementById('suggestionsList');

  // DOM Elements - Stepper & Bulk Decisions
  const btnPrevError = document.getElementById('btnPrevError');
  const btnNextError = document.getElementById('btnNextError');
  const errorCounterBadge = document.getElementById('errorCounterBadge');
  const btnRejectAll = document.getElementById('btnRejectAll');
  const btnAcceptAllRemaining = document.getElementById('btnAcceptAllRemaining');

  // DOM Elements - In-Context Popover
  const inlinePopover = document.getElementById('inlinePopover');
  const popoverBadge = document.getElementById('popoverBadge');
  const popoverSeverity = document.getElementById('popoverSeverity');
  const btnClosePopover = document.getElementById('btnClosePopover');
  const popoverExplanation = document.getElementById('popoverExplanation');
  const popoverOrig = document.getElementById('popoverOrig');
  const popoverRepl = document.getElementById('popoverRepl');
  const popoverBtnPrev = document.getElementById('popoverBtnPrev');
  const popoverIndexText = document.getElementById('popoverIndexText');
  const popoverBtnNext = document.getElementById('popoverBtnNext');
  const popoverBtnReject = document.getElementById('popoverBtnReject');
  const popoverBtnAccept = document.getElementById('popoverBtnAccept');

  // DOM Elements - Modals & Login
  const loginSection = document.getElementById('loginSection');
  const loginForm = document.getElementById('loginForm');
  const inputPasscode = document.getElementById('inputPasscode');
  const btnTogglePasscodeVis = document.getElementById('btnTogglePasscodeVis');
  const passcodeEyeIcon = document.getElementById('passcodeEyeIcon');
  const btnUnlock = document.getElementById('btnUnlock');
  const loginFeedback = document.getElementById('loginFeedback');
  const settingsModal = document.getElementById('settingsModal');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const inputApiKey = document.getElementById('inputApiKey');
  const btnToggleKeyVis = document.getElementById('btnToggleKeyVis');
  const btnTestKey = document.getElementById('btnTestKey');
  const btnSaveKey = document.getElementById('btnSaveKey');
  const keyTestResult = document.getElementById('keyTestResult');
  const rulesModal = document.getElementById('rulesModal');
  const btnCloseRulesModal = document.getElementById('btnCloseRulesModal');
  const btnCloseRulesBtn = document.getElementById('btnCloseRulesBtn');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const loadingTitle = document.getElementById('loadingTitle');
  const loadingMsg = document.getElementById('loadingMsg');

  // =========================================================================
  // Authentication & Passcode Gate
  // =========================================================================

  function getAuthToken() {
    return localStorage.getItem('stark_auth_token') || 'stark2026';
  }

  function setAuthToken(token) {
    if (token) {
      localStorage.setItem('stark_auth_token', token);
    } else {
      localStorage.removeItem('stark_auth_token');
    }
  }

  function clearAuthToken() {
    localStorage.removeItem('stark_auth_token');
  }

  function getAuthHeaders(extraHeaders = {}) {
    const headers = { ...extraHeaders };
    const token = getAuthToken();
    if (token) {
      headers['X-Team-Passcode'] = token;
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  async function authFetch(url, options = {}) {
    const opts = { ...options };
    opts.headers = getAuthHeaders(opts.headers || {});
    let resp = await fetch(url, opts);
    if (resp.status === 401) {
      // Auto-retry with default team passcode stark2026
      try {
        const recoveryResp = await fetch('/api/verify-passcode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ passcode: 'stark2026' })
        });
        if (recoveryResp.ok) {
          const recoveryData = await recoveryResp.json();
          const tok = recoveryData.token || 'stark2026';
          setAuthToken(tok);
          opts.headers = getAuthHeaders(opts.headers || {});
          resp = await fetch(url, opts);
          if (resp.status !== 401) {
            unlockWorkspace();
            return resp;
          }
        }
      } catch (_) {}
      showLoginGate('Session expired or unauthorized. Please re-enter team passcode.');
      throw new Error('Authentication required');
    }
    return resp;
  }

  const fetchWithAuth = authFetch;

  function showLoginGate(feedbackMsg = '') {
    if (loginSection) {
      loginSection.classList.remove('hidden');
      loginSection.classList.add('active');
      loginSection.style.setProperty('display', 'flex', 'important');
      loginSection.style.pointerEvents = 'auto';
      loginSection.style.visibility = 'visible';
      loginSection.style.zIndex = '200';
    }
    if (feedbackMsg && loginFeedback) {
      loginFeedback.textContent = feedbackMsg;
      loginFeedback.className = 'login-feedback error';
      loginFeedback.classList.remove('hidden');
    }
    if (authStatusBadge) authStatusBadge.classList.add('hidden');
    if (btnLockSession) btnLockSession.classList.add('hidden');
    if (inputPasscode) {
      inputPasscode.value = 'stark2026';
      setTimeout(() => inputPasscode.focus(), 150);
    }
  }

  function unlockWorkspace() {
    if (window.starkDismissOverlay) {
      window.starkDismissOverlay();
    }
    if (loginSection) {
      loginSection.classList.remove('active');
      loginSection.classList.add('hidden');
      loginSection.style.setProperty('display', 'none', 'important');
      loginSection.style.pointerEvents = 'none';
      loginSection.style.visibility = 'hidden';
      loginSection.style.zIndex = '-9999';
    }
    if (authStatusBadge) authStatusBadge.classList.remove('hidden');
    if (btnLockSession) btnLockSession.classList.remove('hidden');
    if (loginFeedback) loginFeedback.classList.add('hidden');
  }

  async function verifyPasscode(passcode) {
    if (window.starkUnlock) {
      return await window.starkUnlock();
    }
    const code = (passcode || '').trim();
    if (!code) {
      showLoginError('Please enter a team passcode.');
      return false;
    }
    if (btnUnlock) {
      btnUnlock.disabled = true;
      btnUnlock.innerHTML = '<span>Verifying...</span>';
    }
    try {
      const resp = await fetch('/api/verify-passcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: code })
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        setAuthToken(data.token || code);
        unlockWorkspace();
        try {
          await checkServerApiKey();
        } catch (_) {}
        return true;
      } else {
        showLoginError(data.detail || data.message || 'Incorrect passcode. Default is stark2026.');
        return false;
      }
    } catch (err) {
      showLoginError('Network connection error: ' + err.message);
      return false;
    } finally {
      if (btnUnlock) {
        btnUnlock.disabled = false;
        btnUnlock.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
          </svg>
          <span>Unlock Workspace</span>
        `;
      }
    }
  }

  function showLoginError(msg) {
    if (loginFeedback) {
      loginFeedback.textContent = msg;
      loginFeedback.className = 'login-feedback error';
      loginFeedback.classList.remove('hidden');
    }
    if (inputPasscode) {
      inputPasscode.focus();
      inputPasscode.select();
    }
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = inputPasscode ? inputPasscode.value : '';
      await verifyPasscode(code);
    });
  }

  if (btnUnlock) {
    btnUnlock.addEventListener('click', async (e) => {
      e.preventDefault();
      const code = inputPasscode ? inputPasscode.value : '';
      await verifyPasscode(code);
    });
  }

  if (btnTogglePasscodeVis) {
    btnTogglePasscodeVis.addEventListener('click', () => {
      const isPwd = inputPasscode.type === 'password';
      inputPasscode.type = isPwd ? 'text' : 'password';
      passcodeEyeIcon.innerHTML = isPwd
        ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>'
        : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
    });
  }

  if (btnLockSession) {
    btnLockSession.addEventListener('click', () => {
      if (confirm('Lock workspace session?')) {
        clearAuthToken();
        showLoginGate();
      }
    });
  }

  // Auto-verify stored passcode on page load
  async function initAuth() {
    const existingToken = getAuthToken() || 'stark2026';
    try {
      const resp = await fetch('/api/verify-passcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: existingToken })
      });
      if (resp.ok) {
        const data = await resp.json();
        setAuthToken(data.token || existingToken);
        unlockWorkspace();
        try {
          await checkServerApiKey();
        } catch (_) {}
      } else {
        // Fallback to default team passcode
        const fallbackResp = await fetch('/api/verify-passcode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ passcode: 'stark2026' })
        });
        if (fallbackResp.ok) {
          const fbData = await fallbackResp.json();
          setAuthToken(fbData.token || 'stark2026');
          unlockWorkspace();
          try {
            await checkServerApiKey();
          } catch (_) {}
        } else {
          showLoginGate();
        }
      }
    } catch {
      unlockWorkspace();
    }
  }

  // =========================================================================
  // Theme Toggle (Light / Dark)
  // =========================================================================

  const savedTheme = localStorage.getItem('stark_theme') || 'theme-light';
  document.body.className = savedTheme;

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const isDark = document.body.classList.contains('theme-dark');
      const nextTheme = isDark ? 'theme-light' : 'theme-dark';
      document.body.className = nextTheme;
      localStorage.setItem('stark_theme', nextTheme);
    });
  }

  // Sidebar Collapse Toggle
  if (btnToggleSidebar && appSidebar) {
    btnToggleSidebar.addEventListener('click', () => {
      appSidebar.classList.toggle('collapsed');
      const isCol = appSidebar.classList.contains('collapsed');
      localStorage.setItem('sidebar_collapsed', isCol ? '1' : '0');
    });
    if (localStorage.getItem('sidebar_collapsed') === '1') {
      appSidebar.classList.add('collapsed');
    }
  }

  // =========================================================================
  // API Key & Model Configuration
  // =========================================================================

  function getClientApiKey() {
    return localStorage.getItem('gemini_api_key') || '';
  }
  function setClientApiKey(key) {
    if (key) localStorage.setItem('gemini_api_key', key);
    else localStorage.removeItem('gemini_api_key');
  }

  async function checkServerApiKey() {
    try {
      const resp = await authFetch('/api/key-status');
      if (resp.ok) {
        const data = await resp.json();
        serverHasKey = data.server_has_key;
        updateApiKeyUI();
      }
    } catch (e) {
      updateApiKeyUI();
    }
  }

  function updateApiKeyUI() {
    const clientKey = getClientApiKey();
    const isConfigured = serverHasKey || !!clientKey;

    if (apiKeyStatus) {
      if (isConfigured) {
        apiKeyStatus.className = 'status-pill status-ready';
        apiKeyStatus.querySelector('.status-text').textContent = 'Gemini Ready';
      } else {
        apiKeyStatus.className = 'status-pill status-missing';
        apiKeyStatus.querySelector('.status-text').textContent = 'Need API Key';
      }
    }
    if (sidebarApiKeyDot) {
      sidebarApiKeyDot.className = isConfigured ? 'nav-status-dot dot-ready' : 'nav-status-dot dot-missing';
    }
  }

  if (btnSettingsNav) {
    btnSettingsNav.addEventListener('click', () => {
      inputApiKey.value = getClientApiKey();
      keyTestResult.classList.add('hidden');
      settingsModal.classList.remove('hidden');
    });
  }

  if (btnCloseModal) {
    btnCloseModal.addEventListener('click', () => settingsModal.classList.add('hidden'));
  }
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) settingsModal.classList.add('hidden');
  });

  if (btnToggleKeyVis) {
    btnToggleKeyVis.addEventListener('click', () => {
      inputApiKey.type = inputApiKey.type === 'password' ? 'text' : 'password';
    });
  }

  if (btnTestKey) {
    btnTestKey.addEventListener('click', async () => {
      const keyToTest = inputApiKey.value.trim();
      if (!keyToTest) {
        keyTestResult.className = 'key-test-feedback error';
        keyTestResult.textContent = 'Please enter an API key to test.';
        keyTestResult.classList.remove('hidden');
        return;
      }
      btnTestKey.disabled = true;
      btnTestKey.textContent = 'Testing...';
      try {
        const resp = await authFetch('/api/test-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: keyToTest })
        });
        const data = await resp.json();
        keyTestResult.classList.remove('hidden');
        if (data.valid) {
          keyTestResult.className = 'key-test-feedback success';
          keyTestResult.textContent = '✓ ' + (data.message || 'Key is valid and active!');
        } else {
          keyTestResult.className = 'key-test-feedback error';
          keyTestResult.textContent = '✗ ' + (data.error || 'Invalid API key.');
        }
      } catch (err) {
        keyTestResult.className = 'key-test-feedback error';
        keyTestResult.textContent = 'Network error testing key: ' + err.message;
        keyTestResult.classList.remove('hidden');
      } finally {
        btnTestKey.disabled = false;
        btnTestKey.textContent = 'Test Connection';
      }
    });
  }

  if (btnSaveKey) {
    btnSaveKey.addEventListener('click', () => {
      const key = inputApiKey.value.trim();
      setClientApiKey(key);
      updateApiKeyUI();
      settingsModal.classList.add('hidden');
    });
  }

  // Rules Modal
  if (btnRulesNav) {
    btnRulesNav.addEventListener('click', () => rulesModal.classList.remove('hidden'));
  }
  if (btnCloseRulesModal) {
    btnCloseRulesModal.addEventListener('click', () => rulesModal.classList.add('hidden'));
  }
  if (btnCloseRulesBtn) {
    btnCloseRulesBtn.addEventListener('click', () => rulesModal.classList.add('hidden'));
  }
  rulesModal.addEventListener('click', (e) => {
    if (e.target === rulesModal) rulesModal.classList.add('hidden');
  });

  // =========================================================================
  // Sub-Toolbar Mode Pills (Light, Standard, Intensive, Concise)
  // =========================================================================

  if (modePillsGroup) {
    const pills = modePillsGroup.querySelectorAll('.mode-pill');
    pills.forEach(pill => {
      pill.addEventListener('click', () => {
        pills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const mode = pill.getAttribute('data-mode');
        // Map mode to tone
        if (mode === 'light') toneSelect.value = 'strict';
        else if (mode === 'intensive') toneSelect.value = 'formal';
        else if (mode === 'concise') toneSelect.value = 'concise';
        else toneSelect.value = 'business';
      });
    });
  }

  // =========================================================================
  // Dropzone & File Handling / Direct Textarea
  // =========================================================================

  function countWords(str) {
    if (!str) return 0;
    return str.trim().split(/\s+/).filter(Boolean).length;
  }

  function updateWordCountUI() {
    if (leftDocViewerState && !leftDocViewerState.classList.contains('hidden')) {
      let totalWords = 0;
      docBlocks.forEach(b => { totalWords += countWords(b.text); });
      wordCountLabel.textContent = `${totalWords.toLocaleString()} words • ${docBlocks.length} blocks`;
    } else if (rawTextInput && rawTextInput.value.trim()) {
      const words = countWords(rawTextInput.value);
      wordCountLabel.textContent = `${words} / 500 words`;
    } else if (currentFile) {
      const sizeKb = Math.round(currentFile.size / 1024);
      wordCountLabel.textContent = `${sizeKb} KB • .docx`;
    } else {
      wordCountLabel.textContent = '0 words';
    }
  }

  if (rawTextInput) {
    rawTextInput.addEventListener('input', () => {
      updateWordCountUI();
      if (rawTextInput.value.trim()) {
        btnStartText.textContent = 'Proofread Text';
      } else if (currentFile) {
        btnStartText.textContent = 'Proofread Document';
      } else {
        btnStartText.textContent = 'Proofread';
      }
    });
  }

  // Setup Drag & Drop
  if (dropZone) {
    dropZone.addEventListener('click', (e) => {
      if (e.target !== btnRemoveFile) fileInput.click();
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
      });
    });

    dropZone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files.length > 0) handleFileSelect(files[0]);
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) handleFileSelect(fileInput.files[0]);
    });
  }

  function handleFileSelect(file) {
    if (!file.name.toLowerCase().endsWith('.docx')) {
      alert('Please upload a Microsoft Word (.docx) document.');
      return;
    }
    currentFile = file;
    selectedFileName.textContent = file.name;
    selectedFileInfo.classList.remove('hidden');
    btnStartText.textContent = 'Proofread Document';
    updateWordCountUI();
  }

  if (btnRemoveFile) {
    btnRemoveFile.addEventListener('click', (e) => {
      e.stopPropagation();
      currentFile = null;
      fileInput.value = '';
      selectedFileInfo.classList.add('hidden');
      updateWordCountUI();
    });
  }

  // Clear / New Document Button
  if (btnClearDoc) {
    btnClearDoc.addEventListener('click', () => {
      if (docBlocks.length > 0 || currentFile || (rawTextInput && rawTextInput.value.trim())) {
        if (!confirm('Clear current document and start over?')) return;
      }
      resetToInputState();
    });
  }

  function resetToInputState() {
    currentFile = null;
    sessionId = null;
    docBlocks = [];
    docIssues = [];
    decisions = {};
    if (fileInput) fileInput.value = '';
    if (rawTextInput) rawTextInput.value = '';
    if (selectedFileInfo) selectedFileInfo.classList.add('hidden');
    if (leftDocViewerState) leftDocViewerState.classList.add('hidden');
    if (leftInputState) leftInputState.classList.remove('hidden');
    if (rightActiveState) rightActiveState.classList.add('hidden');
    if (rightEmptyState) rightEmptyState.classList.remove('hidden');
    if (activeDocTag) activeDocTag.classList.add('hidden');
    if (btnApplyAndDownload) btnApplyAndDownload.classList.add('hidden');
    if (inlinePopover) inlinePopover.classList.add('hidden');
    btnStartText.textContent = 'Proofread';
    updateWordCountUI();
  }

  // Copy Content Button
  if (btnCopyContent) {
    btnCopyContent.addEventListener('click', () => {
      let textToCopy = '';
      if (docBlocks.length > 0) {
        textToCopy = docBlocks.map(b => b.text).join('\n\n');
      } else if (rawTextInput) {
        textToCopy = rawTextInput.value;
      }
      if (!textToCopy) {
        alert('No content to copy.');
        return;
      }
      navigator.clipboard.writeText(textToCopy).then(() => {
        const origTitle = btnCopyContent.title;
        btnCopyContent.title = 'Copied!';
        btnCopyContent.style.color = 'var(--brand-primary)';
        setTimeout(() => {
          btnCopyContent.title = origTitle;
          btnCopyContent.style.color = '';
        }, 1500);
      });
    });
  }

  // Try Sample Report Button
  if (btnLoadSample) {
    btnLoadSample.addEventListener('click', async () => {
      showLoading('Loading Sample Report...', 'Fetching pre-configured Stark quarterly report with realistic grammar, spelling, and spacing errors...');
      try {
        const resp = await authFetch('/api/sample-doc');
        if (!resp.ok) throw new Error('Could not load sample document');
        const blob = await resp.blob();
        currentFile = new File([blob], 'Stark_Quarterly_Report_Sample.docx', {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        });
        selectedFileName.textContent = currentFile.name;
        selectedFileInfo.classList.remove('hidden');
        hideLoading();
        // Immediately start analysis for seamless testing!
        btnStartAnalysis.click();
      } catch (err) {
        hideLoading();
        alert('Failed to load sample: ' + err.message);
      }
    });
  }

  // =========================================================================
  // Start Proofreading Analysis
  // =========================================================================

  btnStartAnalysis.addEventListener('click', async () => {
    const rawText = rawTextInput ? rawTextInput.value.trim() : '';

    if (!currentFile && !rawText) {
      alert('Please choose a Word (.docx) document or enter text in the editor.');
      return;
    }

    const effectiveKey = getClientApiKey();
    if (!serverHasKey && !effectiveKey) {
      settingsModal.classList.remove('hidden');
      alert('Please provide a Google Gemini API Key first.');
      return;
    }

    showLoading('Fast AI Proofreading...', 'Checking grammar, spelling, double spaces, and phrasing with Gemini High-Speed AI...');

    try {
      let resp;
      if (currentFile) {
        const formData = new FormData();
        formData.append('file', currentFile);
        if (effectiveKey) formData.append('api_key', effectiveKey);
        formData.append('tone', toneSelect ? toneSelect.value : 'business');
        resp = await authFetch('/api/analyze', { method: 'POST', body: formData });
      } else {
        const formData = new FormData();
        formData.append('text', rawText);
        if (effectiveKey) formData.append('api_key', effectiveKey);
        formData.append('tone', toneSelect ? toneSelect.value : 'business');
        resp = await authFetch('/api/analyze-text', { method: 'POST', body: formData });
      }

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error(errData.detail || 'Analysis failed');
      }

      const result = await resp.json();
      sessionId = result.session_id;
      docBlocks = result.blocks || [];
      docIssues = result.issues || [];

      // Initialize decisions: auto-accept evident typos ONLY in body text (NEVER in titles or catalog metadata!)
      decisions = {};
      let autoCount = 0;
      let reviewCount = 0;

      const blockMap = {};
      docBlocks.forEach(b => { blockMap[b.id] = b; });

      docIssues.forEach(issue => {
        const blk = blockMap[issue.block_id];
        const isTitle = (blk && blk.is_title_or_heading) || issue.is_title;
        const errType = (issue.error_type || '').toLowerCase();
        const isSpelling = errType === 'spelling';
        const isSpacing = errType === 'spacing';
        // Titles & catalog metadata lines are strictly protected from auto-accept
        const isEvident = !isTitle && (isSpelling || isSpacing || issue.is_evident === true || (errType === 'grammar' && issue.severity === 'error'));

        if (isEvident) {
          autoCount++;
          decisions[issue.id] = {
            accepted: true,
            autoAccepted: true,
            rejected: false,
            editedText: issue.suggested_text
          };
        } else {
          reviewCount++;
          decisions[issue.id] = {
            accepted: false,
            autoAccepted: false,
            rejected: false,
            editedText: issue.suggested_text
          };
        }
      });

      currentFilter = reviewCount > 0 ? 'needs_review' : 'all';
      filterChips.forEach(c => {
        c.classList.toggle('active', c.getAttribute('data-filter') === currentFilter);
      });

      // Switch to Review State
      renderReviewWorkspace(result.filename);
      hideLoading();
    } catch (err) {
      hideLoading();
      alert('Error analyzing document: ' + err.message);
    }
  });

  function showLoading(title, message) {
    loadingTitle.textContent = title;
    loadingMsg.textContent = message;
    loadingOverlay.classList.remove('hidden');
  }

  function hideLoading() {
    loadingOverlay.classList.add('hidden');
  }

  // =========================================================================
  // Review Workspace Rendering
  // =========================================================================

  function renderReviewWorkspace(filename) {
    // Show active states
    if (leftInputState) leftInputState.classList.add('hidden');
    if (leftDocViewerState) leftDocViewerState.classList.remove('hidden');
    if (rightEmptyState) rightEmptyState.classList.add('hidden');
    if (rightActiveState) rightActiveState.classList.remove('hidden');

    if (activeDocTag) {
      activeDocTag.classList.remove('hidden');
      activeDocTitle.textContent = filename || 'Document.docx';
    }
    if (btnApplyAndDownload) {
      btnApplyAndDownload.classList.remove('hidden');
    }

    updateFilterCounts();
    renderDocumentView();
    renderSuggestionsList();
    updateWordCountUI();

    // Focus first actionable issue
    currentActiveIssueId = null;
    const visible = getVisibleIssues();
    if (visible.length > 0) {
      const first = visible.find(i => {
        const d = decisions[i.id] || {};
        return !d.accepted && !d.rejected;
      }) || visible[0];
      setTimeout(() => activateIssue(first.id, first.block_id, true), 120);
    } else {
      updateStepperCounter();
    }
  }

  function getVisibleIssues() {
    return docIssues.filter(issue => {
      const d = decisions[issue.id] || {};
      if (currentFilter === 'all') return true;
      if (currentFilter === 'needs_review') return !d.accepted && !d.rejected;
      if (currentFilter === 'auto_accepted') return d.autoAccepted && d.accepted;
      const t = (issue.error_type || '').toLowerCase();
      if (currentFilter === 'clarity') return t === 'clarity' || t === 'style';
      if (currentFilter === 'spacing') return t === 'spacing' || t === 'punctuation';
      return t === currentFilter;
    });
  }

  function updateFilterCounts() {
    let pendingCount = 0;
    let autoAcceptedCount = 0;

    docIssues.forEach(issue => {
      const d = decisions[issue.id];
      if (d && !d.accepted && !d.rejected) pendingCount++;
      if (d && d.autoAccepted && d.accepted) autoAcceptedCount++;
    });

    if (countNeedsReview) countNeedsReview.textContent = pendingCount;
    if (countAutoAccepted) countAutoAccepted.textContent = autoAcceptedCount;
    if (countAll) countAll.textContent = docIssues.length;
    if (countSpelling) countSpelling.textContent = docIssues.filter(i => (i.error_type || '').toLowerCase() === 'spelling').length;
    if (countGrammar) countGrammar.textContent = docIssues.filter(i => (i.error_type || '').toLowerCase() === 'grammar').length;
    if (countSpacing) countSpacing.textContent = docIssues.filter(i => ['spacing', 'punctuation'].includes((i.error_type || '').toLowerCase())).length;
    if (countClarity) countClarity.textContent = docIssues.filter(i => ['clarity', 'style'].includes((i.error_type || '').toLowerCase())).length;

    // Smart Banner
    if (bannerAutoCount) {
      bannerAutoCount.textContent = `${autoAcceptedCount} typos & errors`;
    }
    if (bannerPendingText) {
      if (pendingCount > 0) {
        bannerPendingText.textContent = `${pendingCount} suggestion${pendingCount === 1 ? '' : 's'} need your review.`;
        if (btnViewPendingOnly) btnViewPendingOnly.style.display = 'inline-flex';
        if (btnAcceptAllRemaining) btnAcceptAllRemaining.style.display = 'inline-flex';
      } else {
        bannerPendingText.textContent = `All suggestions confirmed! Ready to download.`;
        if (btnViewPendingOnly) btnViewPendingOnly.style.display = 'none';
        if (btnAcceptAllRemaining) btnAcceptAllRemaining.style.display = 'none';
      }
    }
  }

  // Filter Chips Click
  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      filterChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.getAttribute('data-filter');
      renderSuggestionsList();
      const visible = getVisibleIssues();
      if (visible.length > 0) {
        const first = visible.find(i => {
          const d = decisions[i.id] || {};
          return !d.accepted && !d.rejected;
        }) || visible[0];
        activateIssue(first.id, first.block_id, true);
      } else {
        if (inlinePopover) inlinePopover.classList.add('hidden');
        updateStepperCounter();
      }
    });
  });

  // Banner Actions
  if (btnViewPendingOnly) {
    btnViewPendingOnly.addEventListener('click', () => {
      filterChips.forEach(c => c.classList.remove('active'));
      const chip = document.querySelector('.chip[data-filter="needs_review"]');
      if (chip) chip.classList.add('active');
      currentFilter = 'needs_review';
      renderSuggestionsList();
    });
  }

  if (btnCloseBanner) {
    btnCloseBanner.addEventListener('click', () => {
      if (autoAcceptBanner) autoAcceptBanner.style.display = 'none';
    });
  }

  if (btnAcceptAllRemaining) {
    btnAcceptAllRemaining.addEventListener('click', () => {
      docIssues.forEach(issue => {
        const d = decisions[issue.id];
        if (!d.accepted && !d.rejected) {
          setDecision(issue.id, true, false);
        }
      });
      btnApplyAndDownload.click();
    });
  }

  // =========================================================================
  // Document View Rendering (Left Pane)
  // =========================================================================

  function renderDocumentView() {
    docViewer.innerHTML = '';

    const issuesByBlock = {};
    docIssues.forEach(issue => {
      issuesByBlock[issue.block_id] = issuesByBlock[issue.block_id] || [];
      issuesByBlock[issue.block_id].push(issue);
    });

    docBlocks.forEach(block => {
      const pElem = document.createElement('div');
      const styleName = (block.style || '').toLowerCase();
      let headingClass = '';
      if (styleName.includes('heading 1') || styleName.includes('title')) headingClass = 'doc-heading-0';
      else if (styleName.includes('heading 2')) headingClass = 'doc-heading-1';

      pElem.className = `doc-paragraph ${headingClass}`;
      pElem.id = `view_${block.id}`;

      const blockIssues = issuesByBlock[block.id] || [];
      if (blockIssues.length > 0) {
        pElem.innerHTML = buildHighlightedHtml(block.text, blockIssues);
      } else {
        pElem.textContent = block.text;
      }

      docViewer.appendChild(pElem);
    });

    // Attach click listeners to highlight spans
    docViewer.querySelectorAll('.inline-error-highlight').forEach(span => {
      span.addEventListener('click', (e) => {
        e.stopPropagation();
        const issueId = span.getAttribute('data-issue-id');
        const issue = docIssues.find(i => i.id === issueId);
        activateIssue(issueId, issue ? issue.block_id : null, true, 'doc');
      });
    });
  }

  function buildHighlightedHtml(text, issues) {
    const sorted = [...issues].sort((a, b) => (a.char_start || 0) - (b.char_start || 0));
    let html = '';
    let lastIdx = 0;

    sorted.forEach(issue => {
      const start = issue.char_start || 0;
      const end = issue.char_end || start + (issue.original_text || '').length;

      if (start > lastIdx) {
        html += escapeHtml(text.slice(lastIdx, start));
      }

      const originalPart = text.slice(start, end) || issue.original_text;
      const errType = (issue.error_type || 'grammar').toLowerCase();
      html += `<span class="inline-error-highlight type-${errType}" data-issue-id="${issue.id}">${escapeHtml(originalPart)}</span>`;

      lastIdx = end;
    });

    if (lastIdx < text.length) {
      html += escapeHtml(text.slice(lastIdx));
    }

    return html;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatDiffContent(text) {
    if (!text) return '';
    return escapeHtml(text);
  }

  // =========================================================================
  // Suggestions List Rendering (Right Pane)
  // =========================================================================

  function renderSuggestionsList() {
    suggestionsList.innerHTML = '';
    const filteredIssues = getVisibleIssues();

    if (filteredIssues.length === 0) {
      suggestionsList.innerHTML = `
        <div style="text-align: center; padding: 2.5rem 1rem; color: var(--text-dim);">
          <div style="font-size: 1.8rem; margin-bottom: 0.35rem;">✨</div>
          <h4 style="color: var(--text-main); font-size: 0.95rem; margin-bottom: 0.2rem;">All clear in this category!</h4>
          <p style="font-size: 0.8rem;">Click 'Download Clean Document' to export your final file.</p>
        </div>
      `;
      return;
    }

    filteredIssues.forEach(issue => {
      const card = createSuggestionCard(issue);
      suggestionsList.appendChild(card);
    });
  }

  function createSuggestionCard(issue) {
    const card = document.createElement('div');
    const decision = decisions[issue.id] || { accepted: false, rejected: false, editedText: issue.suggested_text };

    let stateClass = '';
    if (decision.accepted) stateClass = 'card-accepted';
    else if (decision.rejected) stateClass = 'card-rejected';

    card.className = `suggestion-card ${stateClass}`;
    card.id = `card_${issue.id}`;

    const errType = (issue.error_type || 'grammar').toLowerCase();
    const typeLabel = errType.charAt(0).toUpperCase() + errType.slice(1);
    const isAuto = decision.autoAccepted && decision.accepted;

    const targetKey = (issue.original_text || '').trim().toLowerCase();
    let repeatCount = 0;
    if (targetKey) {
      repeatCount = docIssues.filter(i => (i.original_text || '').trim().toLowerCase() === targetKey).length;
    }

    let statusBadgeHtml = '';
    if (isAuto) {
      statusBadgeHtml = `<span class="badge-auto-accepted" title="Auto-corrected">✓ Auto</span>`;
    } else if (decision.accepted) {
      statusBadgeHtml = `<span class="card-status-badge status-accepted">✓ Confirmed</span>`;
    } else if (decision.rejected) {
      statusBadgeHtml = `<span class="card-status-badge status-rejected">✗ Dismissed</span>`;
    } else {
      statusBadgeHtml = `<span class="badge-needs-review">Review</span>`;
    }

    card.innerHTML = `
      <div class="card-header-row">
        <div class="card-badges">
          <span class="type-badge badge-${errType}">${typeLabel}</span>
          ${repeatCount > 1 ? `<span class="badge-repeated" title="Occurs ${repeatCount} times in document (synced)">🔁 ${repeatCount}x</span>` : ''}
        </div>
        <div class="card-status-container" id="statusContainer_${issue.id}">
          ${statusBadgeHtml}
        </div>
      </div>

      <div class="card-diff-box">
        <del class="diff-del">${formatDiffContent(issue.original_text)}</del>
        <span class="diff-arrow">→</span>
        <ins class="diff-ins" id="targetText_${issue.id}">${formatDiffContent(decision.editedText)}</ins>
      </div>

      <p class="card-explanation">${escapeHtml(issue.explanation)}</p>

      <div class="card-actions-row">
        <button class="btn btn-secondary btn-xs" id="btnToggleEdit_${issue.id}">Edit</button>
        <div style="display: flex; gap: 0.35rem;" id="actionButtons_${issue.id}">
          ${isAuto ? `
            <button class="btn btn-secondary btn-xs" id="btnReject_${issue.id}" title="Revert auto-correction">Revert</button>
          ` : `
            <button class="btn-card-reject" id="btnReject_${issue.id}">✗ Reject</button>
            <button class="btn-card-accept" id="btnAccept_${issue.id}">✓ Accept</button>
          `}
        </div>
      </div>
    `;

    // Listeners for Card
    const btnAccept = card.querySelector(`#btnAccept_${issue.id}`);
    const btnReject = card.querySelector(`#btnReject_${issue.id}`);
    const btnToggleEdit = card.querySelector(`#btnToggleEdit_${issue.id}`);

    if (btnAccept) {
      btnAccept.addEventListener('click', (e) => {
        e.stopPropagation();
        setDecision(issue.id, true, false, true);
      });
    }

    if (btnReject) {
      btnReject.addEventListener('click', (e) => {
        e.stopPropagation();
        setDecision(issue.id, false, true, true);
      });
    }

    if (btnToggleEdit) {
      btnToggleEdit.addEventListener('click', (e) => {
        e.stopPropagation();
        const customText = prompt('Enter your replacement text:', decision.editedText || issue.suggested_text);
        if (customText !== null) {
          decision.editedText = customText;
          setDecision(issue.id, true, false, false);
          renderSuggestionsList();
        }
      });
    }

    card.addEventListener('click', () => {
      activateIssue(issue.id, issue.block_id, true, 'card');
    });

    return card;
  }

  // =========================================================================
  // Dual-Scroll, Stepper & In-Context Popover
  // =========================================================================

  function updateStepperCounter() {
    const visible = getVisibleIssues();
    const total = visible.length;
    let currentIdx = visible.findIndex(i => i.id === currentActiveIssueId);
    if (currentIdx < 0 && total > 0) currentIdx = 0;
    const displayNum = total > 0 ? currentIdx + 1 : 0;

    if (errorCounterBadge) {
      errorCounterBadge.textContent = `${displayNum} / ${total}`;
    }
    if (popoverIndexText) {
      popoverIndexText.textContent = `${displayNum} / ${total}`;
    }

    const disabled = total <= 1;
    if (btnPrevError) btnPrevError.disabled = disabled;
    if (btnNextError) btnNextError.disabled = disabled;
    if (popoverBtnPrev) popoverBtnPrev.disabled = disabled;
    if (popoverBtnNext) popoverBtnNext.disabled = disabled;
  }

  function scrollTargetInsideContainer(container, targetEl, options = {}) {
    if (!container || !targetEl) return;
    const containerRect = container.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();

    const isAlreadyVisible = (
      targetRect.top >= containerRect.top + 30 &&
      targetRect.bottom <= containerRect.bottom - 30
    );
    if (isAlreadyVisible && !options.force) return;

    const relativeTop = targetRect.top - containerRect.top;
    const targetScrollTop = container.scrollTop + relativeTop - (container.clientHeight / 2) + (targetRect.height / 2);

    container.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: options.behavior || 'smooth'
    });
  }

  function activateIssue(issueId, blockId, showPopover = true, source = 'nav') {
    if (!issueId) return;
    currentActiveIssueId = issueId;

    const targetIssue = docIssues.find(i => i.id === issueId);

    // Remove previous active classes
    docViewer.querySelectorAll('.pulse-target').forEach(el => el.classList.remove('pulse-target', 'focused'));
    document.querySelectorAll('.suggestion-card').forEach(c => c.classList.remove('focused'));

    // Highlight span in document
    let span = docViewer.querySelector(`.inline-error-highlight[data-issue-id="${issueId}"]`);
    if (!span && targetIssue) {
      const bId = targetIssue.block_id || blockId;
      const p = bId ? document.getElementById(`view_${bId}`) : null;
      if (p) {
        const origNorm = (targetIssue.original_text || '').trim().toLowerCase();
        const spansInBlock = p.querySelectorAll('.inline-error-highlight');
        for (const s of spansInBlock) {
          if (s.textContent.trim().toLowerCase() === origNorm) {
            span = s;
            break;
          }
        }
      }
    }

    const docTarget = span || (blockId ? document.getElementById(`view_${blockId}`) : null);
    if (docTarget) {
      docTarget.classList.add('focused', 'pulse-target');
      scrollTargetInsideContainer(docViewer, docTarget, { force: source !== 'doc' });
    }

    // Highlight card in suggestion stream
    const activeCard = document.getElementById(`card_${issueId}`);
    if (activeCard) {
      activeCard.classList.add('focused');
      scrollTargetInsideContainer(suggestionsList, activeCard, { force: source !== 'card' });
    }

    updateStepperCounter();

    // Popover placement
    if (showPopover && span && targetIssue && inlinePopover) {
      const errType = (targetIssue.error_type || 'grammar').toLowerCase();
      const typeLabel = errType.charAt(0).toUpperCase() + errType.slice(1);

      if (popoverBadge) {
        popoverBadge.textContent = typeLabel;
        popoverBadge.className = `type-badge badge-${errType}`;
      }
      if (popoverSeverity) {
        popoverSeverity.textContent = targetIssue.severity || 'suggestion';
      }
      if (popoverExplanation) {
        popoverExplanation.textContent = targetIssue.explanation || '';
      }

      const d = decisions[issueId] || { accepted: false, rejected: false, editedText: targetIssue.suggested_text };
      if (popoverOrig) popoverOrig.textContent = targetIssue.original_text;
      if (popoverRepl) popoverRepl.textContent = d.editedText || targetIssue.suggested_text;

      updatePopoverDecisionUI(issueId);
      inlinePopover.classList.remove('hidden');
      updatePopoverPosition();
    } else if (inlinePopover) {
      inlinePopover.classList.add('hidden');
    }
  }

  function updatePopoverPosition() {
    if (!currentActiveIssueId || !inlinePopover || inlinePopover.classList.contains('hidden')) return;

    const span = docViewer.querySelector(`.inline-error-highlight[data-issue-id="${currentActiveIssueId}"]`);
    if (!span) return;

    const paneRect = leftDocViewerState.getBoundingClientRect();
    const spanRect = span.getBoundingClientRect();

    if (spanRect.bottom < paneRect.top - 20 || spanRect.top > paneRect.bottom + 20) {
      inlinePopover.classList.add('hidden');
      return;
    }

    const popoverWidth = inlinePopover.offsetWidth || 340;
    const popoverHeight = inlinePopover.offsetHeight || 150;

    let left = spanRect.left - paneRect.left;
    if (left + popoverWidth > paneRect.width - 15) {
      left = Math.max(10, paneRect.width - popoverWidth - 15);
    }
    if (left < 10) left = 10;

    const spaceBelow = paneRect.bottom - spanRect.bottom;
    let top;
    if (spaceBelow >= popoverHeight + 15 || spanRect.top - paneRect.top < popoverHeight + 15) {
      top = spanRect.bottom - paneRect.top + 8;
      inlinePopover.classList.remove('popover-above');
    } else {
      top = spanRect.top - paneRect.top - popoverHeight - 8;
      inlinePopover.classList.add('popover-above');
    }

    inlinePopover.style.left = `${Math.round(left)}px`;
    inlinePopover.style.top = `${Math.round(top)}px`;
  }

  function updatePopoverDecisionUI(issueId) {
    const d = decisions[issueId] || {};
    if (popoverBtnAccept) {
      popoverBtnAccept.style.opacity = d.accepted ? '1' : '0.85';
    }
    if (popoverBtnReject) {
      popoverBtnReject.style.opacity = d.rejected ? '1' : '0.85';
    }
  }

  if (btnClosePopover) {
    btnClosePopover.addEventListener('click', () => inlinePopover.classList.add('hidden'));
  }

  if (popoverBtnAccept) {
    popoverBtnAccept.addEventListener('click', () => {
      if (currentActiveIssueId) {
        setDecision(currentActiveIssueId, true, false, true);
        setTimeout(() => nextIssue(true), 120);
      }
    });
  }

  if (popoverBtnReject) {
    popoverBtnReject.addEventListener('click', () => {
      if (currentActiveIssueId) {
        setDecision(currentActiveIssueId, false, true, true);
        setTimeout(() => nextIssue(true), 120);
      }
    });
  }

  if (popoverBtnPrev) popoverBtnPrev.addEventListener('click', () => prevIssue());
  if (popoverBtnNext) popoverBtnNext.addEventListener('click', () => nextIssue(false));
  if (btnPrevError) btnPrevError.addEventListener('click', () => prevIssue());
  if (btnNextError) btnNextError.addEventListener('click', () => nextIssue(false));

  function nextIssue(autoAdvance = false) {
    const visible = getVisibleIssues();
    if (visible.length === 0) return;
    let currentIdx = visible.findIndex(i => i.id === currentActiveIssueId);
    let nextIdx = (currentIdx + 1) % visible.length;
    activateIssue(visible[nextIdx].id, visible[nextIdx].block_id, true);
  }

  function prevIssue() {
    const visible = getVisibleIssues();
    if (visible.length === 0) return;
    let currentIdx = visible.findIndex(i => i.id === currentActiveIssueId);
    let prevIdx = (currentIdx - 1 + visible.length) % visible.length;
    activateIssue(visible[prevIdx].id, visible[prevIdx].block_id, true);
  }

  function setDecision(issueId, accepted, rejected, autoAdvance = false) {
    const targetIssue = docIssues.find(i => i.id === issueId);
    const targetKey = (targetIssue && targetIssue.original_text ? targetIssue.original_text.trim().toLowerCase() : '');

    // Sync all repeated occurrences in document
    docIssues.forEach(issue => {
      const matchKey = (issue.original_text || '').trim().toLowerCase();
      if (issue.id === issueId || (targetKey && matchKey === targetKey)) {
        decisions[issue.id] = {
          accepted,
          rejected,
          autoAccepted: false,
          editedText: decisions[issue.id]?.editedText || issue.suggested_text
        };
      }
    });

    updateFilterCounts();
    renderSuggestionsList();
    updatePopoverDecisionUI(issueId);

    if (autoAdvance) {
      const visible = getVisibleIssues();
      const currentIdx = visible.findIndex(i => i.id === issueId);
      if (currentIdx >= 0 && currentIdx < visible.length - 1) {
        setTimeout(() => {
          activateIssue(visible[currentIdx + 1].id, visible[currentIdx + 1].block_id, true);
        }, 120);
      }
    }
  }

  // Bulk Decision Actions
  if (btnRejectAll) {
    btnRejectAll.addEventListener('click', () => {
      docIssues.forEach(issue => setDecision(issue.id, false, true));
    });
  }

  // Re-position popover on doc scroll
  if (docViewer) {
    docViewer.addEventListener('scroll', () => {
      if (inlinePopover && !inlinePopover.classList.contains('hidden')) {
        updatePopoverPosition();
      }
    }, { passive: true });
  }

  // =========================================================================
  // Download Clean .docx Document
  // =========================================================================

  btnApplyAndDownload.addEventListener('click', async () => {
    if (!sessionId) return;

    const acceptedItems = [];
    docIssues.forEach(issue => {
      const d = decisions[issue.id];
      if (d && d.accepted) {
        acceptedItems.push({
          issue_id: issue.id,
          block_id: issue.block_id,
          accepted: true,
          original_text: issue.original_text,
          replacement_text: d.editedText || issue.suggested_text
        });
      }
    });

    showLoading('Building Clean Word Document...', 'Applying approved changes, preserving styling, tables, and typography...');

    try {
      const resp = await authFetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, decisions: acceptedItems })
      });

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error(errorData.detail || 'Download request failed');
      }

      let downloadFilename = 'Clean_Document.docx';
      const disposition = resp.headers.get('Content-Disposition');
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) downloadFilename = match[1];
      }

      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = downloadFilename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();

      hideLoading();
      alert(`Success! "${downloadFilename}" downloaded with all approved corrections.`);
    } catch (err) {
      hideLoading();
      alert('Error exporting document: ' + err.message);
    }
  });

  // Nav items click handlers
  if (navProofread) {
    navProofread.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-nav .nav-item').forEach(n => n.classList.remove('active'));
      navProofread.classList.add('active');
    });
  }

  if (navDocMode) {
    navDocMode.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-nav .nav-item').forEach(n => n.classList.remove('active'));
      navDocMode.classList.add('active');
      if (dropZone) dropZone.scrollIntoView({ behavior: 'smooth' });
    });
  }

  if (navQuickPaste) {
    navQuickPaste.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-nav .nav-item').forEach(n => n.classList.remove('active'));
      navQuickPaste.classList.add('active');
      if (rawTextInput) rawTextInput.focus();
    });
  }

  // Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIssue(false);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      prevIssue();
    } else if (e.key === 'a' || e.key === 'A') {
      if (currentActiveIssueId) {
        e.preventDefault();
        setDecision(currentActiveIssueId, true, false, true);
      }
    } else if (e.key === 'r' || e.key === 'R' || e.key === 'x' || e.key === 'X') {
      if (currentActiveIssueId) {
        e.preventDefault();
        setDecision(currentActiveIssueId, false, true, true);
      }
    } else if (e.key === 'Escape') {
      if (inlinePopover) inlinePopover.classList.add('hidden');
    }
  });

  // =========================================================================
  // WORKSPACE VIEW SWITCHING & MISSING ITEM INFO MODULE
  // =========================================================================
  function escapeHtmlStr(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  const viewProofreader = document.getElementById('viewProofreader');
  const viewMissingItems = document.getElementById('viewMissingItems');
  const navProofread = document.getElementById('navProofread');
  const navDocMode = document.getElementById('navDocMode');
  const navMissingItems = document.getElementById('navMissingItems');
  const topbarHeading = document.querySelector('.topbar-heading');

  function switchWorkspaceView(viewName, subMode) {
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(n => n.classList.remove('active'));
    
    if (viewName === 'missing-items') {
      if (viewProofreader) viewProofreader.classList.add('hidden');
      if (viewMissingItems) viewMissingItems.classList.remove('hidden');
      if (navMissingItems) navMissingItems.classList.add('active');
      if (topbarHeading) topbarHeading.textContent = 'Missing Item Info Generator';
      loadMissingItemsStatus();
    } else {
      if (viewMissingItems) viewMissingItems.classList.add('hidden');
      if (viewProofreader) viewProofreader.classList.remove('hidden');
      if (navProofread) navProofread.classList.add('active');
      if (topbarHeading) topbarHeading.textContent = 'AI Proofreader';

      if (subMode === 'doc') {
        if (navDocMode) {
          document.querySelectorAll('.sidebar-nav .nav-item').forEach(n => n.classList.remove('active'));
          navDocMode.classList.add('active');
        }
        if (dropZone) dropZone.scrollIntoView({ behavior: 'smooth' });
      } else if (subMode === 'paste') {
        const navQuickPaste = document.getElementById('navQuickPaste');
        if (navQuickPaste) {
          document.querySelectorAll('.sidebar-nav .nav-item').forEach(n => n.classList.remove('active'));
          navQuickPaste.classList.add('active');
        }
        if (rawTextInput) rawTextInput.focus();
      }
    }
  }

  window.starkLoadMissingStatus = loadMissingItemsStatus;

  if (navProofread) navProofread.addEventListener('click', () => switchWorkspaceView('proofreader'));
  if (navDocMode) navDocMode.addEventListener('click', () => switchWorkspaceView('proofreader', 'doc'));
  if (navMissingItems) navMissingItems.addEventListener('click', () => switchWorkspaceView('missing-items'));

  // Missing Items Sub-Tabs
  const tabAutoFetch = document.getElementById('tabAutoFetch');
  const tabDirectUpload = document.getElementById('tabDirectUpload');
  const panelAutoFetch = document.getElementById('panelAutoFetch');
  const panelDirectUpload = document.getElementById('panelDirectUpload');

  if (tabAutoFetch && tabDirectUpload) {
    tabAutoFetch.addEventListener('click', () => {
      tabAutoFetch.classList.add('active');
      tabDirectUpload.classList.remove('active');
      panelAutoFetch.classList.remove('hidden');
      panelDirectUpload.classList.add('hidden');
    });

    tabDirectUpload.addEventListener('click', () => {
      tabDirectUpload.classList.add('active');
      tabAutoFetch.classList.remove('active');
      panelDirectUpload.classList.remove('hidden');
      panelAutoFetch.classList.add('hidden');
    });
  }

  // Portal status & Brands
  const portalDot = document.getElementById('portalDot');
  const portalStatusText = document.getElementById('portalStatusText');
  const starkBrandSuggestions = document.getElementById('starkBrandSuggestions');

  async function loadMissingItemsStatus() {
    try {
      const resp = await fetchWithAuth('/api/missing-items/status');
      if (!resp.ok) return;
      const data = await resp.json();

      if (data.portal_configured) {
        if (portalDot) portalDot.className = 'pulse-indicator-dot dot-ready';
        if (portalStatusText) portalStatusText.innerHTML = '<strong>Portal Connected</strong> • Automated fetch is ready with server credentials.';
      } else {
        if (portalDot) portalDot.className = 'pulse-indicator-dot dot-warn';
        if (portalStatusText) portalStatusText.innerHTML = '<strong>Server Credentials Not Configured</strong> • Please use <strong>Direct Excel Upload</strong> below, or ask your administrator to set STARK_PREMIUM_EMAIL & STARK_PREMIUM_PASSWORD on server.';
        // Auto-switch to Direct Excel Upload so users are not stranded on an unconfigured portal tab
        if (window.starkMissingTab) {
          window.starkMissingTab('upload');
        }
      }

      if (starkBrandSuggestions && Array.isArray(data.brands)) {
        starkBrandSuggestions.innerHTML = '';
        data.brands.forEach(b => {
          const opt = document.createElement('option');
          opt.value = b;
          starkBrandSuggestions.appendChild(opt);
        });
      }
    } catch (e) {
      console.warn('Error loading missing items status:', e);
    }
  }

  // Flow 1: Automated Portal Fetch
  const fetchBrandInput = document.getElementById('fetchBrandInput');
  const btnTriggerFetch = document.getElementById('btnTriggerFetch');
  const fetchProgressBox = document.getElementById('fetchProgressBox');
  const fetchCurrentStep = document.getElementById('fetchCurrentStep');
  const jobPillId = document.getElementById('jobPillId');
  const fetchStepsList = document.getElementById('fetchStepsList');
  let fetchPollInterval = null;

  if (btnTriggerFetch) {
    btnTriggerFetch.addEventListener('click', async () => {
      const brand = (fetchBrandInput ? fetchBrandInput.value : '').trim();
      if (!brand) {
        alert('Please enter or select a Brand Name.');
        if (fetchBrandInput) fetchBrandInput.focus();
        return;
      }

      btnTriggerFetch.disabled = true;
      if (fetchProgressBox) fetchProgressBox.classList.remove('hidden');
      if (fetchCurrentStep) fetchCurrentStep.textContent = `Starting Missing Item report for ${brand}...`;
      if (fetchStepsList) fetchStepsList.innerHTML = '';
      const missingResultsArea = document.getElementById('missingResultsArea');
      if (missingResultsArea) missingResultsArea.classList.add('hidden');

      try {
        const resp = await fetchWithAuth('/api/missing-items/fetch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brand })
        });

        if (!resp.ok) {
          const err = await resp.json();
          throw new Error(err.detail || 'Could not launch portal automation.');
        }

        const data = await resp.json();
        const jobId = data.job_id;
        if (jobPillId) jobPillId.textContent = `Job: ${jobId}`;

        // Poll job
        if (fetchPollInterval) clearInterval(fetchPollInterval);
        fetchPollInterval = setInterval(async () => {
          try {
            const jResp = await fetchWithAuth(`/api/missing-items/jobs/${jobId}`);
            if (!jResp.ok) return;
            const job = await jResp.json();

            if (fetchCurrentStep) fetchCurrentStep.textContent = job.step || 'Processing...';

            if (fetchStepsList && Array.isArray(job.steps)) {
              fetchStepsList.innerHTML = job.steps.map(s => `
                <div class="step-flow-item">
                  <span class="step-check-icon">✓</span>
                  <span>${escapeHtmlStr(s)}</span>
                </div>
              `).join('');
            }

            if (job.status === 'success') {
              clearInterval(fetchPollInterval);
              btnTriggerFetch.disabled = false;
              if (fetchProgressBox) fetchProgressBox.classList.add('hidden');
              displayMissingResults(job.result);
            } else if (job.status === 'failed') {
              clearInterval(fetchPollInterval);
              btnTriggerFetch.disabled = false;
              alert('Report Generation Error: ' + (job.error || 'Automation failed.'));
            }
          } catch (pollErr) {
            console.error('Poll error:', pollErr);
          }
        }, 1500);

      } catch (err) {
        btnTriggerFetch.disabled = false;
        alert(err.message);
        if (fetchProgressBox) fetchProgressBox.classList.add('hidden');
      }
    });
  }

  // Flow 2: Direct Raw Excel Upload
  const uploadBrandInput = document.getElementById('uploadBrandInput');
  const missingDropzone = document.getElementById('missingDropzone');
  const missingFileInput = document.getElementById('missingFileInput');
  const dropzoneIdle = document.getElementById('dropzoneIdle');
  const dropzoneSelected = document.getElementById('dropzoneSelected');
  const selectedFileName = document.getElementById('selectedFileName');
  const selectedFileSize = document.getElementById('selectedFileSize');
  const btnRemoveFile = document.getElementById('btnRemoveFile');
  const btnCleanUploadFile = document.getElementById('btnCleanUploadFile');
  let currentUploadExcel = null;

  if (missingDropzone && missingFileInput) {
    missingDropzone.addEventListener('click', (e) => {
      if (e.target.id === 'btnRemoveFile') return;
      missingFileInput.click();
    });

    missingDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      missingDropzone.classList.add('dragover');
    });

    missingDropzone.addEventListener('dragleave', () => {
      missingDropzone.classList.remove('dragover');
    });

    missingDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      missingDropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleSelectedExcel(e.dataTransfer.files[0]);
      }
    });

    missingFileInput.addEventListener('change', () => {
      if (missingFileInput.files && missingFileInput.files.length > 0) {
        handleSelectedExcel(missingFileInput.files[0]);
      }
    });
  }

  function handleSelectedExcel(file) {
    if (!file.name.toLowerCase().match(/\.(xlsx|xls)$/)) {
      alert('Please upload an Excel workbook (.xlsx or .xls).');
      return;
    }
    currentUploadExcel = file;
    if (dropzoneIdle) dropzoneIdle.classList.add('hidden');
    if (dropzoneSelected) dropzoneSelected.classList.remove('hidden');
    if (selectedFileName) selectedFileName.textContent = file.name;
    if (selectedFileSize) selectedFileSize.textContent = (file.size / 1024).toFixed(1) + ' KB';
    if (btnCleanUploadFile) btnCleanUploadFile.disabled = false;

    // Auto-populate brand input if empty and filename contains brand hint
    if (uploadBrandInput && !uploadBrandInput.value.trim()) {
      const match = file.name.match(/^([a-zA-Z\s_-]+?)(?:_MissingItem|\.xlsx|\.xls)/i);
      if (match && match[1] && !match[1].toLowerCase().includes('report')) {
        uploadBrandInput.value = match[1].replace(/[_-]+/g, ' ').trim();
      }
    }
  }

  if (btnRemoveFile) {
    btnRemoveFile.addEventListener('click', (e) => {
      e.stopPropagation();
      currentUploadExcel = null;
      if (missingFileInput) missingFileInput.value = '';
      if (dropzoneIdle) dropzoneIdle.classList.remove('hidden');
      if (dropzoneSelected) dropzoneSelected.classList.add('hidden');
      if (btnCleanUploadFile) btnCleanUploadFile.disabled = true;
    });
  }

  if (btnCleanUploadFile) {
    btnCleanUploadFile.addEventListener('click', async () => {
      if (!currentUploadExcel) return;
      const brand = (uploadBrandInput ? uploadBrandInput.value : '').trim() || 'Brand';

      btnCleanUploadFile.disabled = true;
      btnCleanUploadFile.innerHTML = '<span>Cleaning & Formatting...</span>';

      const formData = new FormData();
      formData.append('file', currentUploadExcel);
      formData.append('brand', brand);

      try {
        const resp = await fetchWithAuth('/api/missing-items/process-upload', {
          method: 'POST',
          body: formData
        });

        if (!resp.ok) {
          const err = await resp.json();
          throw new Error(err.detail || 'Processing failed');
        }

        const data = await resp.json();
        displayMissingResults(data);
      } catch (err) {
        alert('Upload Clean Error: ' + err.message);
      } finally {
        btnCleanUploadFile.disabled = false;
        btnCleanUploadFile.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>Clean & Format Vendor Workbook</span>
        `;
      }
    });
  }

  // Display Results, Stats & Preview
  function displayMissingResults(res) {
    const missingResultsArea = document.getElementById('missingResultsArea');
    const resultsFilename = document.getElementById('resultsFilename');
    const btnDownloadResultExcel = document.getElementById('btnDownloadResultExcel');
    const statSourceCount = document.getElementById('statSourceCount');
    const statRetainedCount = document.getElementById('statRetainedCount');
    const statDroppedCount = document.getElementById('statDroppedCount');
    const statColsCount = document.getElementById('statColsCount');
    const vendorTableHead = document.getElementById('vendorTableHead');
    const vendorTableBody = document.getElementById('vendorTableBody');

    if (!res || !missingResultsArea) return;

    if (resultsFilename) resultsFilename.textContent = res.send_filename || 'Vendor_Missing_Item_Send_File.xlsx';
    if (btnDownloadResultExcel) {
      btnDownloadResultExcel.href = res.download_url || `/api/missing-items/download/${res.job_id}`;
      btnDownloadResultExcel.onclick = () => {
        setTimeout(() => {
          resultsFilename.innerHTML += ' <span style="color:#15803D; font-weight:700;">(Ephemeral Purge Completed ✓)</span>';
        }, 1200);
      };
    }

    if (statSourceCount) statSourceCount.textContent = res.source_rows || 0;
    if (statRetainedCount) statRetainedCount.textContent = res.retained_rows || 0;
    if (statDroppedCount) statDroppedCount.textContent = res.deleted_rows || 0;
    if (statColsCount) statColsCount.textContent = (res.columns || []).length;

    // Render preview table
    if (vendorTableHead && vendorTableBody && Array.isArray(res.columns) && Array.isArray(res.preview_rows)) {
      vendorTableHead.innerHTML = `
        <tr>
          ${res.columns.map(c => `<th>${escapeHtmlStr(c)}</th>`).join('')}
        </tr>
      `;

      if (res.preview_rows.length === 0) {
        vendorTableBody.innerHTML = `
          <tr>
            <td colspan="${res.columns.length}" style="text-align:center; padding: 2rem; color: var(--text-dim);">
              No missing-item rows detected for this brand. All items in the report are fully populated!
            </td>
          </tr>
        `;
      } else {
        vendorTableBody.innerHTML = res.preview_rows.map(row => `
          <tr>
            ${res.columns.map(c => {
              const val = row[c] || '';
              if (val === '') {
                return `<td><span class="cell-blank-tag">Needs Fill-in</span></td>`;
              } else if (val === 'N/A') {
                return `<td><span class="cell-na-tag">N/A</span></td>`;
              }
              return `<td>${escapeHtmlStr(val)}</td>`;
            }).join('')}
          </tr>
        `).join('');
      }
    }

    const initialMissingState = document.getElementById('initialMissingState');
    if (initialMissingState) initialMissingState.classList.add('hidden');

    missingResultsArea.classList.remove('hidden');
    missingResultsArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  window.starkDisplayMissingResults = displayMissingResults;

  async function loadSampleMissingReport() {
    const btn = document.getElementById('btnTrySampleMissing');
    const btn2 = document.getElementById('btnUploadSampleBtn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>Loading Sample...</span>';
    }
    if (btn2) {
      btn2.disabled = true;
      btn2.innerHTML = '<span>Loading Sample...</span>';
    }
    try {
      const resp = await fetchWithAuth('/api/missing-items/sample');
      if (!resp.ok) throw new Error('Could not load sample missing items report');
      const data = await resp.json();
      displayMissingResults(data);
    } catch (err) {
      alert('Sample Report Error: ' + err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
          <span>Try Sample Report</span>
        `;
      }
      if (btn2) {
        btn2.disabled = false;
        btn2.innerHTML = '<span>Try With Sample Report</span>';
      }
    }
  }

  window.starkLoadSampleMissing = loadSampleMissingReport;
  const btnTrySampleMissing = document.getElementById('btnTrySampleMissing');
  if (btnTrySampleMissing) {
    btnTrySampleMissing.addEventListener('click', loadSampleMissingReport);
  }
  const btnUploadSampleBtn = document.getElementById('btnUploadSampleBtn');
  if (btnUploadSampleBtn) {
    btnUploadSampleBtn.addEventListener('click', loadSampleMissingReport);
  }

  // Initialize
  initAuth();
});
