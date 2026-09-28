/**
 * DocProofreader AI - Client Application Logic
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

  // DOM Elements - Navigation & Theme
  const authStatusBadge = document.getElementById('authStatusBadge');
  const btnLockSession = document.getElementById('btnLockSession');
  const apiKeyStatus = document.getElementById('apiKeyStatus');
  const btnSettings = document.getElementById('btnSettings');
  const themeToggle = document.getElementById('themeToggle');
  const settingsModal = document.getElementById('settingsModal');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const inputApiKey = document.getElementById('inputApiKey');
  const btnToggleKeyVis = document.getElementById('btnToggleKeyVis');
  const btnTestKey = document.getElementById('btnTestKey');
  const btnSaveKey = document.getElementById('btnSaveKey');
  const keyTestResult = document.getElementById('keyTestResult');

  // DOM Elements - Views
  const loginSection = document.getElementById('loginSection');
  const loginForm = document.getElementById('loginForm');
  const inputPasscode = document.getElementById('inputPasscode');
  const btnTogglePasscodeVis = document.getElementById('btnTogglePasscodeVis');
  const passcodeEyeIcon = document.getElementById('passcodeEyeIcon');
  const btnUnlock = document.getElementById('btnUnlock');
  const loginFeedback = document.getElementById('loginFeedback');
  const uploadSection = document.getElementById('uploadSection');
  const reviewSection = document.getElementById('reviewSection');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const loadingTitle = document.getElementById('loadingTitle');
  const loadingMsg = document.getElementById('loadingMsg');

  // DOM Elements - Upload Stage
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const selectedFileInfo = document.getElementById('selectedFileInfo');
  const selectedFileName = document.getElementById('selectedFileName');
  const btnRemoveFile = document.getElementById('btnRemoveFile');
  const toneSelect = document.getElementById('toneSelect');
  const btnLoadSample = document.getElementById('btnLoadSample');
  const btnStartAnalysis = document.getElementById('btnStartAnalysis');

  // DOM Elements - Review Stage
  const btnBackToUpload = document.getElementById('btnBackToUpload');
  const reviewDocName = document.getElementById('reviewDocName');
  const filterChips = document.querySelectorAll('.chip');
  const countNeedsReview = document.getElementById('countNeedsReview');
  const countAutoAccepted = document.getElementById('countAutoAccepted');
  const countAll = document.getElementById('countAll');
  const countSpelling = document.getElementById('countSpelling');
  const countGrammar = document.getElementById('countGrammar');
  const countClarity = document.getElementById('countClarity');
  const autoAcceptBanner = document.getElementById('autoAcceptBanner');
  const bannerAutoCount = document.getElementById('bannerAutoCount');
  const bannerPendingText = document.getElementById('bannerPendingText');
  const btnViewPendingOnly = document.getElementById('btnViewPendingOnly');
  const btnAcceptAllRemaining = document.getElementById('btnAcceptAllRemaining');
  const btnCloseBanner = document.getElementById('btnCloseBanner');
  const btnAcceptAll = document.getElementById('btnAcceptAll');
  const btnRejectAll = document.getElementById('btnRejectAll');
  const docViewer = document.getElementById('docViewer');
  const suggestionsList = document.getElementById('suggestionsList');
  const acceptedCountBadge = document.getElementById('acceptedCountBadge');
  const rejectedCountBadge = document.getElementById('rejectedCountBadge');
  const pendingCountBadge = document.getElementById('pendingCountBadge');
  const progressSummary = document.getElementById('progressSummary');
  const applyCountSummary = document.getElementById('applyCountSummary');
  const progressBar = document.getElementById('progressBar');
  const btnApplyAndDownload = document.getElementById('btnApplyAndDownload');

  // DOM Elements - Stepper Navigation & In-Context Popover
  const btnPrevError = document.getElementById('btnPrevError');
  const btnNextError = document.getElementById('btnNextError');
  const errorCounterBadge = document.getElementById('errorCounterBadge');
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
  let currentActiveIssueId = null;

  // =========================================================================
  // Authentication & Session Management
  // =========================================================================

  function getAuthToken() {
    return localStorage.getItem('stark_auth_token') || '';
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
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  async function authFetch(url, options = {}) {
    const headers = getAuthHeaders(options.headers || {});
    const resp = await fetch(url, { ...options, headers });
    if (resp.status === 401) {
      clearAuthToken();
      showLoginView('Your session has expired or requires authentication. Please enter your team passcode.');
      throw new Error('Authentication required');
    }
    return resp;
  }

  function showLoginView(feedbackMsg = null) {
    loginSection.classList.add('active');
    uploadSection.classList.remove('active');
    reviewSection.classList.remove('active');
    authStatusBadge.classList.add('hidden');
    btnLockSession.classList.add('hidden');
    apiKeyStatus.classList.add('hidden');
    btnSettings.classList.add('hidden');
    
    if (feedbackMsg) {
      showLoginFeedback(feedbackMsg, false);
    } else {
      loginFeedback.classList.add('hidden');
    }
    inputPasscode.value = '';
    setTimeout(() => inputPasscode.focus(), 100);
  }

  function showWorkspaceView() {
    loginSection.classList.remove('active');
    uploadSection.classList.add('active');
    reviewSection.classList.remove('active');
    authStatusBadge.classList.remove('hidden');
    btnLockSession.classList.remove('hidden');
    apiKeyStatus.classList.remove('hidden');
    btnSettings.classList.remove('hidden');

    // Load server configuration once authenticated
    fetchConfig();
  }

  function showLoginFeedback(msg, isSuccess) {
    loginFeedback.textContent = msg;
    loginFeedback.className = `login-feedback ${isSuccess ? 'success' : 'error'}`;
    loginFeedback.classList.remove('hidden');
  }

  // Passcode visibility toggle
  btnTogglePasscodeVis.addEventListener('click', () => {
    const isPassword = inputPasscode.type === 'password';
    inputPasscode.type = isPassword ? 'text' : 'password';
    passcodeEyeIcon.innerHTML = isPassword
      ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>'
      : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
  });

  // Login submission
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleLogin();
  });

  async function handleLogin() {
    const passcode = inputPasscode.value.trim();
    if (!passcode) {
      showLoginFeedback('Please enter the team passcode.', false);
      inputPasscode.focus();
      return;
    }

    btnUnlock.disabled = true;
    const origBtnHtml = btnUnlock.innerHTML;
    btnUnlock.innerHTML = '<span>Verifying Passcode...</span>';

    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode })
      });

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({ detail: 'Incorrect passcode' }));
        showLoginFeedback(errorData.detail || 'Incorrect team passcode. Please try again.', false);
        inputPasscode.select();
        btnUnlock.disabled = false;
        btnUnlock.innerHTML = origBtnHtml;
        return;
      }

      const data = await resp.json();
      setAuthToken(data.token);
      showLoginFeedback('Passcode verified! Unlocking workspace...', true);

      setTimeout(() => {
        btnUnlock.disabled = false;
        btnUnlock.innerHTML = origBtnHtml;
        showWorkspaceView();
      }, 350);

    } catch (err) {
      showLoginFeedback('Network error verifying passcode. Please try again.', false);
      btnUnlock.disabled = false;
      btnUnlock.innerHTML = origBtnHtml;
    }
  }

  // Lock workspace / Logout button
  btnLockSession.addEventListener('click', () => {
    if (confirm('Lock the Stark Proofreader workspace? You will need to re-enter the team passcode.')) {
      clearAuthToken();
      showLoginView('Workspace locked. Enter passcode to return.');
    }
  });

  // Check initial authentication status
  checkAuthStatus();

  async function checkAuthStatus() {
    const token = getAuthToken();
    if (!token) {
      showLoginView();
      return;
    }

    try {
      const resp = await fetch('/api/auth/status', {
        headers: getAuthHeaders()
      });
      const data = await resp.json();
      if (data.authenticated) {
        showWorkspaceView();
      } else {
        clearAuthToken();
        showLoginView();
      }
    } catch (err) {
      // Offline fallback: show login
      showLoginView();
    }
  }

  // =========================================================================
  // Settings & Configuration
  // =========================================================================

  // Load saved API key from localStorage
  const savedKey = localStorage.getItem('docproofreader_api_key') || '';
  if (savedKey) {
    inputApiKey.value = savedKey;
  }

  async function fetchConfig() {
    try {
      const resp = await authFetch('/api/config');
      const data = await resp.json();
      serverHasKey = data.has_server_key;
      updateKeyBadge();
    } catch (err) {
      console.warn('Could not fetch server config:', err);
      updateKeyBadge();
    }
  }

  function getEffectiveKey() {
    return localStorage.getItem('docproofreader_api_key') || '';
  }

  function updateKeyBadge() {
    const userKey = getEffectiveKey();
    if (serverHasKey) {
      apiKeyStatus.className = 'status-badge status-ready';
      apiKeyStatus.innerHTML = '<span class="status-dot"></span><span class="status-text">Server API Ready</span>';
    } else if (userKey) {
      apiKeyStatus.className = 'status-badge status-ready';
      apiKeyStatus.innerHTML = '<span class="status-dot"></span><span class="status-text">User API Key Active</span>';
    } else {
      apiKeyStatus.className = 'status-badge status-warning';
      apiKeyStatus.innerHTML = '<span class="status-dot"></span><span class="status-text">API Key Required</span>';
    }
  }

  // Settings Modal Handlers
  btnSettings.addEventListener('click', () => {
    keyTestResult.classList.add('hidden');
    settingsModal.classList.remove('hidden');
  });

  btnCloseModal.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
  });

  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) settingsModal.classList.add('hidden');
  });

  btnToggleKeyVis.addEventListener('click', () => {
    inputApiKey.type = inputApiKey.type === 'password' ? 'text' : 'password';
  });

  btnTestKey.addEventListener('click', async () => {
    const key = inputApiKey.value.trim();
    if (!key) {
      showKeyTestFeedback('Please enter an API key first.', false);
      return;
    }
    btnTestKey.disabled = true;
    btnTestKey.textContent = 'Testing...';
    try {
      const resp = await authFetch('/api/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: key })
      });
      const data = await resp.json();
      if (data.valid) {
        showKeyTestFeedback('Valid API Key! Successfully connected to Gemini High-Speed AI Engine.', true);
      } else {
        showKeyTestFeedback(`Key verification failed: ${data.error || 'Invalid key'}`, false);
      }
    } catch (err) {
      showKeyTestFeedback(`Connection error: ${err.message}`, false);
    } finally {
      btnTestKey.disabled = false;
      btnTestKey.textContent = 'Test Connection';
    }
  });

  btnSaveKey.addEventListener('click', () => {
    const key = inputApiKey.value.trim();
    if (key) {
      localStorage.setItem('docproofreader_api_key', key);
    } else {
      localStorage.removeItem('docproofreader_api_key');
    }
    updateKeyBadge();
    settingsModal.classList.add('hidden');
  });

  function showKeyTestFeedback(message, isSuccess) {
    keyTestResult.textContent = message;
    keyTestResult.className = `key-test-feedback ${isSuccess ? 'success' : 'error'}`;
    keyTestResult.classList.remove('hidden');
  }

  // Theme toggle
  themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('theme-dark');
    document.body.classList.toggle('theme-light');
  });

  // =========================================================================
  // Upload Stage: Drag & Drop and File Selection
  dropZone.addEventListener('click', (e) => {
    if (e.target !== fileInput && !e.target.closest('#btnRemoveFile')) {
      fileInput.click();
    }
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelected(e.target.files[0]);
    }
  });

  btnRemoveFile.addEventListener('click', (e) => {
    e.stopPropagation();
    currentFile = null;
    fileInput.value = '';
    selectedFileInfo.classList.add('hidden');
    btnStartAnalysis.disabled = true;
  });

  function handleFileSelected(file) {
    if (!file.name.toLowerCase().endsWith('.docx')) {
      alert('Please upload a Microsoft Word document with a .docx extension.');
      return;
    }
    currentFile = file;
    selectedFileName.textContent = file.name;
    selectedFileInfo.classList.remove('hidden');
    btnStartAnalysis.disabled = false;
  }

  // Load Sample Document
  btnLoadSample.addEventListener('click', async () => {
    showLoading('Loading Sample Document...', 'Fetching pre-configured business report sample...');
    try {
      const resp = await authFetch('/api/sample-doc');
      if (!resp.ok) throw new Error('Could not load sample document');
      const blob = await resp.blob();
      const sampleFile = new File([blob], 'Sample_Business_Report.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });
      handleFileSelected(sampleFile);
      hideLoading();
      // Automatically trigger analysis
      btnStartAnalysis.click();
    } catch (err) {
      hideLoading();
      alert('Error fetching sample: ' + err.message);
    }
  });

  // Start Document Analysis
  btnStartAnalysis.addEventListener('click', async () => {
    if (!currentFile) return;

    const userKey = getEffectiveKey();
    if (!serverHasKey && !userKey) {
      settingsModal.classList.remove('hidden');
      showKeyTestFeedback('Please enter your Gemini API key to start proofreading.', false);
      return;
    }

    let elapsed = 0;
    const loadingTimer = setInterval(() => {
      elapsed++;
      if (elapsed === 2) {
        loadingMsg.textContent = 'Scanning grammar, spelling & clarity with Gemini AI... (' + elapsed + 's)';
      } else if (elapsed === 4) {
        loadingMsg.textContent = 'Formatting suggestions and building review workspace... (' + elapsed + 's)';
      } else {
        loadingTitle.textContent = 'Fast AI Proofreading (' + elapsed + 's)';
      }
    }, 1000);

    showLoading('Fast AI Proofreading...', 'Extracting paragraphs & checking with Gemini AI...');

    const formData = new FormData();
    formData.append('file', currentFile);
    if (userKey) {
      formData.append('api_key', userKey);
    }
    formData.append('tone', toneSelect.value);

    try {
      const resp = await authFetch('/api/analyze', {
        method: 'POST',
        body: formData
      });

      clearInterval(loadingTimer);

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({ detail: resp.statusText }));
        const msg = errorData.detail || 'Analysis request failed';
        if (msg.includes('API key') || msg.includes('API_KEY_INVALID') || msg.includes('INVALID_ARGUMENT')) {
          hideLoading();
          settingsModal.classList.remove('hidden');
          showKeyTestFeedback('Your Gemini API Key is missing or invalid. Please paste your valid key below and click "Save Key".', false);
          return;
        }
        throw new Error(msg);
      }

      const result = await resp.json();
      sessionId = result.session_id;
      docBlocks = result.blocks || [];
      docIssues = result.issues || [];

      // Initialize decisions: Auto-accept all spelling and evident grammar errors!
      decisions = {};
      let autoCount = 0;
      let reviewCount = 0;

      docIssues.forEach(issue => {
        const errType = (issue.error_type || '').toLowerCase();
        const isSpelling = errType === 'spelling';
        const isSpacing = errType === 'spacing';
        const isEvident = isSpelling || isSpacing || issue.is_evident === true || (errType === 'grammar' && issue.severity === 'error');

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

      // Default active filter: focus on items needing confirmation if any, else all
      currentFilter = reviewCount > 0 ? 'needs_review' : 'all';
      filterChips.forEach(c => {
        c.classList.toggle('active', c.getAttribute('data-filter') === currentFilter);
      });

      // Switch to Review Workspace
      renderReviewWorkspace(result.filename);
      hideLoading();
    } catch (err) {
      clearInterval(loadingTimer);
      hideLoading();
      alert('Error analyzing document: ' + err.message);
    }
  });

  let activeLoadingInterval = null;

  function showLoading(title, message) {
    loadingTitle.textContent = title;
    loadingMsg.textContent = message;
    loadingOverlay.classList.remove('hidden');
  }

  function hideLoading() {
    if (activeLoadingInterval) {
      clearInterval(activeLoadingInterval);
      activeLoadingInterval = null;
    }
    loadingOverlay.classList.add('hidden');
  }

  // =========================================================================
  // Review Workspace: Split View Rendering & Interactions
  // =========================================================================

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

  function renderReviewWorkspace(filename) {
    reviewDocName.textContent = filename || 'Document.docx';
    uploadSection.classList.remove('active');
    reviewSection.classList.add('active');

    // Update issue counts & banner
    updateFilterCounts();

    // Render left panel (Document View)
    renderDocumentView();

    // Render right panel (Suggestions List)
    renderSuggestionsList();

    // Update footer progress
    updateReviewProgress();

    // Reset active issue & initialize stepper / focus
    currentActiveIssueId = null;
    const visible = getVisibleIssues();
    if (visible.length > 0) {
      const first = visible.find(i => {
        const d = decisions[i.id] || {};
        return !d.accepted && !d.rejected;
      }) || visible[0];
      setTimeout(() => {
        activateIssue(first.id, first.block_id, true);
      }, 150);
    } else {
      updateStepperCounter();
    }
  }

  btnBackToUpload.addEventListener('click', () => {
    if (confirm('Go back to upload? Any unapplied review decisions will be discarded.')) {
      reviewSection.classList.remove('active');
      uploadSection.classList.add('active');
    }
  });

  // Wire up Smart Banner quick action buttons
  if (btnViewPendingOnly) {
    btnViewPendingOnly.addEventListener('click', () => {
      filterChips.forEach(c => c.classList.remove('active'));
      const chip = document.querySelector('.chip[data-filter="needs_review"]');
      if (chip) chip.classList.add('active');
      currentFilter = 'needs_review';
      renderSuggestionsList();
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

  if (btnCloseBanner) {
    btnCloseBanner.addEventListener('click', () => {
      if (autoAcceptBanner) {
        autoAcceptBanner.style.display = 'none';
      }
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
    const countSpacing = document.getElementById('countSpacing');
    if (countSpacing) countSpacing.textContent = docIssues.filter(i => ['spacing', 'punctuation'].includes((i.error_type || '').toLowerCase())).length;
    if (countClarity) countClarity.textContent = docIssues.filter(i => ['clarity', 'style'].includes((i.error_type || '').toLowerCase())).length;

    // Update Smart Banner
    if (bannerAutoCount) {
      bannerAutoCount.textContent = `${autoAcceptedCount} spelling, grammar & spacing errors`;
    }
    if (bannerPendingText) {
      if (pendingCount > 0) {
        bannerPendingText.textContent = `${pendingCount} suggestion${pendingCount === 1 ? '' : 's'} need your confirmation.`;
        if (btnViewPendingOnly) btnViewPendingOnly.style.display = 'inline-flex';
        if (btnAcceptAllRemaining) btnAcceptAllRemaining.style.display = 'inline-flex';
      } else {
        bannerPendingText.textContent = `All suggestions confirmed! Ready to download your clean file.`;
        if (btnViewPendingOnly) btnViewPendingOnly.style.display = 'none';
        if (btnAcceptAllRemaining) btnAcceptAllRemaining.style.display = 'none';
      }
    }
  }

  // Filter chips handler
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

  // Render Document View (Left Panel)
  function renderDocumentView() {
    docViewer.innerHTML = '';

    // Group issues by block_id
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
        pElem.classList.add('has-errors');
        // Render text with highlight spans
        pElem.innerHTML = buildHighlightedHtml(block.text, blockIssues);
      } else {
        pElem.textContent = block.text;
      }

      docViewer.appendChild(pElem);
    });

    // Attach click listeners to highlighted spans
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
    // Sort issues by char_start ascending
    const sorted = [...issues].sort((a, b) => (a.char_start || 0) - (b.char_start || 0));

    let html = '';
    let lastIdx = 0;

    for (const issue of sorted) {
      let start = issue.char_start;
      let end = issue.char_end;

      if (start === undefined || end === undefined || start < lastIdx || end > text.length) {
        // Robust fallback: search for original_text starting from lastIdx
        const orig = issue.original_text || '';
        if (!orig) continue;
        let found = text.indexOf(orig, lastIdx);
        if (found === -1) {
          // Case-insensitive search
          found = text.toLowerCase().indexOf(orig.toLowerCase(), lastIdx);
        }
        if (found !== -1) {
          start = found;
          end = found + orig.length;
        } else {
          continue;
        }
      }

      // Plain text before issue
      html += escapeHtml(text.substring(lastIdx, start));

      // Highlight span
      const typeClass = `type-${(issue.error_type || 'grammar').toLowerCase()}`;
      const origText = escapeHtml(text.substring(start, end));
      html += `<span class="inline-error-highlight ${typeClass}" data-issue-id="${issue.id}" title="${escapeHtml(issue.explanation)}">${origText}</span>`;

      lastIdx = end;
    }

    // Remaining text
    html += escapeHtml(text.substring(lastIdx));
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

  function formatDiffContent(text, isSpacing = false) {
    if (!text) return '';
    const escaped = escapeHtml(text);
    if (isSpacing && text.includes('  ')) {
      return escaped.replace(/  +/g, match => `<span class="diff-space-pill" title="${match.length} consecutive spaces">${'·'.repeat(match.length)}</span>`);
    }
    return escaped;
  }

  // Render Suggestions List (Right Panel)
  function renderSuggestionsList() {
    suggestionsList.innerHTML = '';

    const filteredIssues = docIssues.filter(issue => {
      const d = decisions[issue.id] || {};
      if (currentFilter === 'all') return true;
      if (currentFilter === 'needs_review') return !d.accepted && !d.rejected;
      if (currentFilter === 'auto_accepted') return d.autoAccepted && d.accepted;
      const t = (issue.error_type || '').toLowerCase();
      if (currentFilter === 'clarity') return t === 'clarity' || t === 'style';
      if (currentFilter === 'spacing') return t === 'spacing' || t === 'punctuation';
      return t === currentFilter;
    });

    if (filteredIssues.length === 0) {
      let emptyMsg = 'Everything in this category is clean!';
      if (currentFilter === 'needs_review') emptyMsg = 'All suggestions have been confirmed! Click below to download.';
      suggestionsList.innerHTML = `
        <div style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
          <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">🎉</div>
          <h4 style="color: var(--text-main); margin-bottom: 0.35rem;">No items to display</h4>
          <p style="font-size: 0.88rem;">${emptyMsg}</p>
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

    // Check if this error/word appears multiple times in the document
    const targetKey = (issue.original_text || '').trim().toLowerCase();
    let repeatCount = 0;
    if (targetKey) {
      repeatCount = docIssues.filter(i => (i.original_text || '').trim().toLowerCase() === targetKey).length;
    }

    let statusBadgeHtml = '';
    if (isAuto) {
      statusBadgeHtml = `<span class="badge-auto-accepted" title="Corrected automatically without asking">✓ Auto-Corrected</span>`;
    } else if (decision.accepted) {
      statusBadgeHtml = `<span class="card-status-badge status-accepted">✓ Accepted</span>`;
    } else if (decision.rejected) {
      statusBadgeHtml = `<span class="card-status-badge status-rejected">✗ Dismissed</span>`;
    } else {
      statusBadgeHtml = `<span class="badge-needs-review">⏳ Needs Review</span>`;
    }

    card.innerHTML = `
      <div class="card-header-row">
        <div class="card-badges">
          <span class="type-badge badge-${errType}">${typeLabel}</span>
          ${issue.severity && issue.severity !== 'suggestion' ? `<span class="card-severity badge-severity-${issue.severity.toLowerCase()}">${issue.severity}</span>` : ''}
          ${repeatCount > 1 ? `<span class="badge-repeated" title="Occurs ${repeatCount} times in document (auto-synced)">🔁 ${repeatCount}x</span>` : ''}
        </div>
        <div class="card-status-container" id="statusContainer_${issue.id}">
          ${statusBadgeHtml}
        </div>
      </div>

      <div class="card-diff-box">
        <del class="diff-del">${formatDiffContent(issue.original_text, errType === 'spacing')}</del>
        <span class="diff-arrow">→</span>
        <ins class="diff-ins" id="targetText_${issue.id}">${formatDiffContent(decision.editedText, errType === 'spacing')}</ins>
      </div>

      <p class="card-explanation">${escapeHtml(issue.explanation)}</p>

      <div class="card-edit-wrap hidden" id="editWrap_${issue.id}">
        <input type="text" class="edit-input" id="editInput_${issue.id}" value="${escapeHtml(decision.editedText)}">
        <button class="btn btn-secondary btn-sm" id="btnSaveEdit_${issue.id}">Save</button>
      </div>

      <div class="card-actions-row">
        <button class="btn btn-secondary btn-sm" id="btnToggleEdit_${issue.id}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
          <span>Edit</span>
        </button>

        <div style="display: flex; gap: 0.5rem;" id="actionButtons_${issue.id}">
          ${isAuto ? `
            <button class="btn btn-secondary btn-sm" id="btnReject_${issue.id}" title="Revert this automatic fix">Revert</button>
          ` : `
            <button class="btn ${decision.rejected ? 'btn-danger' : 'btn-outline-danger'} btn-sm" id="btnReject_${issue.id}">
              ✗ Reject
            </button>
            <button class="btn ${decision.accepted ? 'btn-success' : 'btn-outline-success'} btn-sm" id="btnAccept_${issue.id}">
              ✓ Accept
            </button>
          `}
        </div>
      </div>
    `;

    // Event Listeners for Card
    const btnAccept = card.querySelector(`#btnAccept_${issue.id}`);
    const btnReject = card.querySelector(`#btnReject_${issue.id}`);
    const btnToggleEdit = card.querySelector(`#btnToggleEdit_${issue.id}`);
    const editWrap = card.querySelector(`#editWrap_${issue.id}`);
    const editInput = card.querySelector(`#editInput_${issue.id}`);
    const btnSaveEdit = card.querySelector(`#btnSaveEdit_${issue.id}`);
    const targetText = card.querySelector(`#targetText_${issue.id}`);

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

    btnToggleEdit.addEventListener('click', (e) => {
      e.stopPropagation();
      editWrap.classList.toggle('hidden');
      if (!editWrap.classList.contains('hidden')) {
        editInput.focus();
      }
    });

    btnSaveEdit.addEventListener('click', (e) => {
      e.stopPropagation();
      const val = editInput.value.trim();
      if (val) {
        decisions[issue.id].editedText = val;
        targetText.innerHTML = formatDiffContent(val, errType === 'spacing');
        editWrap.classList.add('hidden');
        setDecision(issue.id, true, false, true);
      }
    });

    // Clicking anywhere on the suggestion card navigates directly to that part of the document!
    card.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('input')) return;
      activateIssue(issue.id, issue.block_id, true, 'card');
    });

    // Hover on card focuses corresponding paragraph highlight
    card.addEventListener('mouseenter', () => {
      highlightDocumentSpan(issue.id, true);
    });
    card.addEventListener('mouseleave', () => {
      highlightDocumentSpan(issue.id, false);
    });

    return card;
  }

  function setDecision(issueId, accepted, rejected, syncSameText = true) {
    const targetIssue = docIssues.find(i => i.id === issueId);
    if (!targetIssue) return;

    const targetKey = (targetIssue.original_text || '').trim().toLowerCase();
    const editedVal = decisions[issueId]?.editedText || targetIssue.suggested_text;

    // If word/sentence is repeated in the document, sync across all occurrences
    const issuesToSync = (syncSameText && targetKey) ?
      docIssues.filter(i => (i.original_text || '').trim().toLowerCase() === targetKey) :
      [targetIssue];

    issuesToSync.forEach(item => {
      if (!decisions[item.id]) return;
      decisions[item.id].accepted = accepted;
      decisions[item.id].rejected = rejected;
      if (editedVal) decisions[item.id].editedText = editedVal;

      const card = document.getElementById(`card_${item.id}`);
      if (card) {
        card.classList.remove('card-accepted', 'card-rejected');
        if (accepted) card.classList.add('card-accepted');
        if (rejected) card.classList.add('card-rejected');

        const targetText = card.querySelector(`#targetText_${item.id}`);
        if (targetText && editedVal) targetText.textContent = editedVal;

        const statusContainer = card.querySelector(`#statusContainer_${item.id}`);
        if (statusContainer) {
          if (accepted) {
            statusContainer.innerHTML = `<span class="card-status-badge status-accepted">✓ Accepted</span>`;
          } else if (rejected) {
            statusContainer.innerHTML = `<span class="card-status-badge status-rejected">✗ Dismissed</span>`;
          } else {
            statusContainer.innerHTML = `<span class="badge-needs-review">⏳ Needs Review</span>`;
          }
        }

        const actionsDiv = card.querySelector(`#actionButtons_${item.id}`);
        if (actionsDiv) {
          if (accepted) {
            actionsDiv.innerHTML = `<button class="btn btn-secondary btn-sm" id="btnReject_${item.id}">Revert</button>`;
            card.querySelector(`#btnReject_${item.id}`).addEventListener('click', (e) => {
              e.stopPropagation();
              setDecision(item.id, false, true, true);
            });
          } else if (rejected) {
            actionsDiv.innerHTML = `<button class="btn btn-outline-success btn-sm" id="btnAccept_${item.id}">✓ Accept</button>`;
            card.querySelector(`#btnAccept_${item.id}`).addEventListener('click', (e) => {
              e.stopPropagation();
              setDecision(item.id, true, false, true);
            });
          }
        }
      }
    });

    updateFilterCounts();
    updateReviewProgress();
    updateStepperCounter();
    if (inlinePopover && !inlinePopover.classList.contains('hidden') && currentActiveIssueId) {
      updatePopoverDecisionUI(currentActiveIssueId);
    }
  }

  // =========================================================================
  // Stepper, Dual-Scroll & In-Context Correction Popover
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

    // Check if target is already reasonably visible inside the container
    const isAlreadyVisible = (
      targetRect.top >= containerRect.top + 30 &&
      targetRect.bottom <= containerRect.bottom - 30
    );
    if (isAlreadyVisible && !options.force) {
      return;
    }

    const relativeTop = targetRect.top - containerRect.top;
    const targetScrollTop = container.scrollTop + relativeTop - (container.clientHeight / 2) + (targetRect.height / 2);

    container.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: options.behavior || 'smooth'
    });
  }

  let popoverTrackingAnim = null;
  function startPopoverTracking(durationMs = 500) {
    if (popoverTrackingAnim) cancelAnimationFrame(popoverTrackingAnim);
    const start = performance.now();
    function track(now) {
      if (currentActiveIssueId && inlinePopover && !inlinePopover.classList.contains('hidden')) {
        updatePopoverPosition(true);
        if (now - start < durationMs) {
          popoverTrackingAnim = requestAnimationFrame(track);
        } else {
          popoverTrackingAnim = null;
        }
      }
    }
    popoverTrackingAnim = requestAnimationFrame(track);
  }

  function activateIssue(issueId, blockId, showPopover = true, source = 'nav') {
    if (!issueId) return;
    currentActiveIssueId = issueId;

    const targetIssue = docIssues.find(i => i.id === issueId);

    // 1. Remove pulse and focus from all previous elements
    docViewer.querySelectorAll('.pulse-target').forEach(el => el.classList.remove('pulse-target', 'focused'));
    document.querySelectorAll('.suggestion-card').forEach(c => c.classList.remove('focused'));

    // 2. Locate highlight span in document preview with robust fallback
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
      // Scroll document smoothly to center the error.
      // If user clicked the document span itself, don't force a jump; otherwise force center-scroll
      scrollTargetInsideContainer(docViewer, docTarget, { force: source !== 'doc' });
    }

    // 3. Focus & smoothly scroll matching card in suggestions list
    const activeCard = document.getElementById(`card_${issueId}`);
    if (activeCard) {
      activeCard.classList.add('focused');
      // If user clicked the card itself, don't force a jump; otherwise force center-scroll
      scrollTargetInsideContainer(suggestionsList, activeCard, { force: source !== 'card' });
    }

    // 4. Update Stepper Status Badge
    updateStepperCounter();

    // 5. In-Context Popover ("see it and correct it right there itself")
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
      if (popoverOrig) {
        popoverOrig.innerHTML = formatDiffContent(targetIssue.original_text, errType === 'spacing');
      }
      if (popoverRepl) {
        popoverRepl.innerHTML = formatDiffContent(d.editedText || targetIssue.suggested_text, errType === 'spacing');
      }

      updatePopoverDecisionUI(issueId);

      // Display and position popover
      inlinePopover.classList.remove('hidden');
      updatePopoverPosition(true);

      // Track popover position continuously during smooth scrolling
      startPopoverTracking(500);
    } else if (inlinePopover && (!showPopover || !span)) {
      inlinePopover.classList.add('hidden');
    }
  }

  function updatePopoverPosition(force = false) {
    if (!currentActiveIssueId || !inlinePopover || inlinePopover.classList.contains('hidden')) return;

    const span = docViewer.querySelector(`.inline-error-highlight[data-issue-id="${currentActiveIssueId}"]`);
    if (!span) {
      inlinePopover.classList.add('hidden');
      return;
    }

    const panel = docViewer.parentElement; // .doc-view-panel
    if (!panel) return;

    const panelRect = panel.getBoundingClientRect();
    const spanRect = span.getBoundingClientRect();
    const docViewerRect = docViewer.getBoundingClientRect();

    // When not in force mode (e.g. user manual scroll), hide if span is far outside
    if (!force) {
      if (spanRect.bottom < docViewerRect.top - 80 || spanRect.top > docViewerRect.bottom + 80) {
        inlinePopover.classList.add('hidden');
        return;
      }
    }

    const popoverWidth = inlinePopover.offsetWidth || 360;
    const popoverHeight = inlinePopover.offsetHeight || 190;

    // Centered horizontally over the span, clamped within panel bounds
    let left = (spanRect.left + spanRect.width / 2) - panelRect.left - (popoverWidth / 2);
    left = Math.max(16, Math.min(panelRect.width - popoverWidth - 16, left));

    // Vertical placement: prefer below, flip above if close to bottom
    let top = spanRect.bottom - panelRect.top + 10;
    const fitsBelow = (top + popoverHeight <= panelRect.height - 16);
    const arrow = inlinePopover.querySelector('.popover-arrow');

    if (!fitsBelow && (spanRect.top - panelRect.top - popoverHeight - 10 > 10)) {
      top = spanRect.top - panelRect.top - popoverHeight - 10;
      inlinePopover.classList.add('popover-above');
    } else {
      inlinePopover.classList.remove('popover-above');
    }

    inlinePopover.style.top = `${Math.round(top)}px`;
    inlinePopover.style.left = `${Math.round(left)}px`;

    // Position arrow directly pointing to the highlighted word
    if (arrow) {
      const spanCenter = (spanRect.left + spanRect.width / 2) - panelRect.left;
      let arrowLeft = spanCenter - left - 6;
      arrowLeft = Math.max(20, Math.min(popoverWidth - 28, arrowLeft));
      arrow.style.left = `${Math.round(arrowLeft)}px`;
    }
  }

  function updatePopoverDecisionUI(issueId) {
    if (!inlinePopover || inlinePopover.classList.contains('hidden')) return;
    const issue = docIssues.find(i => i.id === issueId);
    if (!issue) return;
    const d = decisions[issueId] || { accepted: false, rejected: false, editedText: issue.suggested_text };
    if (d.accepted) {
      if (popoverBtnAccept) {
        popoverBtnAccept.textContent = '✓ Accepted';
        popoverBtnAccept.className = 'btn btn-success btn-sm';
      }
      if (popoverBtnReject) {
        popoverBtnReject.textContent = 'Revert';
        popoverBtnReject.className = 'btn btn-secondary btn-sm';
      }
    } else if (d.rejected) {
      if (popoverBtnAccept) {
        popoverBtnAccept.textContent = '✓ Accept';
        popoverBtnAccept.className = 'btn btn-outline-success btn-sm';
      }
      if (popoverBtnReject) {
        popoverBtnReject.textContent = '✗ Dismissed';
        popoverBtnReject.className = 'btn btn-danger btn-sm';
      }
    } else {
      if (popoverBtnAccept) {
        popoverBtnAccept.textContent = '✓ Accept';
        popoverBtnAccept.className = 'btn btn-success btn-sm';
      }
      if (popoverBtnReject) {
        popoverBtnReject.textContent = '✗ Reject';
        popoverBtnReject.className = 'btn btn-outline-danger btn-sm';
      }
    }

    if (popoverRepl && d.editedText) {
      popoverRepl.innerHTML = formatDiffContent(d.editedText, (issue.error_type || '').toLowerCase() === 'spacing');
    }
  }

  function nextIssue(preferPending = false) {
    const visible = getVisibleIssues();
    if (visible.length === 0) return;

    let targetIndex = -1;
    const currentIndex = visible.findIndex(i => i.id === currentActiveIssueId);

    if (preferPending) {
      for (let i = currentIndex + 1; i < visible.length; i++) {
        const d = decisions[visible[i].id] || {};
        if (!d.accepted && !d.rejected) {
          targetIndex = i;
          break;
        }
      }
      if (targetIndex === -1) {
        for (let i = 0; i <= currentIndex; i++) {
          const d = decisions[visible[i].id] || {};
          if (!d.accepted && !d.rejected) {
            targetIndex = i;
            break;
          }
        }
      }
    }

    if (targetIndex === -1) {
      targetIndex = (currentIndex + 1) % visible.length;
    }

    const nextTarget = visible[targetIndex];
    if (nextTarget) {
      activateIssue(nextTarget.id, nextTarget.block_id, true);
    }
  }

  function prevIssue() {
    const visible = getVisibleIssues();
    if (visible.length === 0) return;
    const currentIndex = visible.findIndex(i => i.id === currentActiveIssueId);
    let prevIndex = currentIndex - 1;
    if (prevIndex < 0) prevIndex = visible.length - 1;
    const prevTarget = visible[prevIndex];
    if (prevTarget) {
      activateIssue(prevTarget.id, prevTarget.block_id, true);
    }
  }

  function scrollToDocumentHighlight(issueId, blockId) {
    activateIssue(issueId, blockId, true);
  }

  function focusSuggestionCard(issueId) {
    activateIssue(issueId, null, true);
  }

  function highlightDocumentSpan(issueId, active) {
    const span = docViewer.querySelector(`.inline-error-highlight[data-issue-id="${issueId}"]`);
    if (span) {
      if (active) {
        span.classList.add('focused');
      } else if (currentActiveIssueId !== issueId) {
        span.classList.remove('focused');
      }
    }
  }

  // Stepper Toolbar Listeners
  if (btnPrevError) {
    btnPrevError.addEventListener('click', (e) => {
      e.stopPropagation();
      prevIssue();
    });
  }
  if (btnNextError) {
    btnNextError.addEventListener('click', (e) => {
      e.stopPropagation();
      nextIssue(false);
    });
  }

  // Header click handler: Clicking "Corrections & Suggestions" navigates to next pending issue
  const suggPanelHeader = document.querySelector('.suggestions-panel .panel-header');
  if (suggPanelHeader) {
    suggPanelHeader.style.cursor = 'pointer';
    suggPanelHeader.title = 'Click to focus next pending suggestion';
    suggPanelHeader.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      nextIssue(true);
    });
  }

  // In-Context Popover Listeners
  if (btnClosePopover) {
    btnClosePopover.addEventListener('click', (e) => {
      e.stopPropagation();
      inlinePopover.classList.add('hidden');
    });
  }

  if (popoverBtnPrev) {
    popoverBtnPrev.addEventListener('click', (e) => {
      e.stopPropagation();
      prevIssue();
    });
  }
  if (popoverBtnNext) {
    popoverBtnNext.addEventListener('click', (e) => {
      e.stopPropagation();
      nextIssue(false);
    });
  }

  if (popoverBtnAccept) {
    popoverBtnAccept.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!currentActiveIssueId) return;
      const targetId = currentActiveIssueId;
      setDecision(targetId, true, false, true);
      updatePopoverDecisionUI(targetId);
      setTimeout(() => {
        nextIssue(true);
      }, 180);
    });
  }

  if (popoverBtnReject) {
    popoverBtnReject.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!currentActiveIssueId) return;
      const targetId = currentActiveIssueId;
      const d = decisions[targetId] || {};
      if (d.accepted) {
        setDecision(targetId, false, false, true); // Revert
      } else {
        setDecision(targetId, false, true, true); // Dismiss
      }
      updatePopoverDecisionUI(targetId);
      setTimeout(() => {
        nextIssue(true);
      }, 180);
    });
  }

  // Keep popover pinned to highlight during scrolling or window resizing
  docViewer.addEventListener('scroll', () => {
    if (inlinePopover && !inlinePopover.classList.contains('hidden')) {
      updatePopoverPosition();
    }
  }, { passive: true });

  window.addEventListener('resize', () => {
    if (inlinePopover && !inlinePopover.classList.contains('hidden')) {
      updatePopoverPosition();
    }
  }, { passive: true });

  // Bulk Actions
  btnAcceptAll.addEventListener('click', () => {
    docIssues.forEach(issue => {
      setDecision(issue.id, true, false);
    });
  });

  btnRejectAll.addEventListener('click', () => {
    docIssues.forEach(issue => {
      setDecision(issue.id, false, true);
    });
  });

  function updateReviewProgress() {
    let accepted = 0;
    let rejected = 0;
    let pending = 0;

    docIssues.forEach(issue => {
      const d = decisions[issue.id];
      if (d.accepted) accepted++;
      else if (d.rejected) rejected++;
      else pending++;
    });

    acceptedCountBadge.textContent = `${accepted} Accepted`;
    rejectedCountBadge.textContent = `${rejected} Rejected`;
    pendingCountBadge.textContent = `${pending} Pending`;

    const reviewed = accepted + rejected;
    const total = docIssues.length;
    const pct = total > 0 ? Math.round((reviewed / total) * 100) : 0;

    progressSummary.textContent = `${reviewed} of ${total} reviewed (${pct}%)`;
    applyCountSummary.textContent = `${accepted} correction${accepted === 1 ? '' : 's'} ready to apply`;
    progressBar.style.width = `${pct}%`;

    btnApplyAndDownload.disabled = false;
  }

  // =========================================================================
  // Apply Corrections & Download Updated .docx
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

    if (acceptedItems.length === 0) {
      if (!confirm('No corrections were accepted. Do you still want to download the document without changes?')) {
        return;
      }
    }

    showLoading('Applying Corrections & Building Document...', 'Updating Word runs, preserving formatting, and generating your clean .docx file...');

    try {
      const resp = await authFetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          decisions: acceptedItems
        })
      });

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error(errorData.detail || 'Download request failed');
      }

      // Extract filename from Content-Disposition header if available
      let downloadFilename = 'Document_corrected.docx';
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
      alert(`Success! "${downloadFilename}" has been generated and downloaded with your approved corrections.`);
    } catch (err) {
      hideLoading();
      alert('Error generating document: ' + err.message);
    }
  });

  // Comprehensive Keyboard Shortcuts:
  // - ArrowRight / ArrowDown: Next error
  // - ArrowLeft / ArrowUp: Previous error
  // - A: Accept active error and advance
  // - R or X: Reject/Dismiss active error and advance
  // - Escape: Close in-context popover
  document.addEventListener('keydown', (e) => {
    // Ignore when typing inside form elements
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

    if (reviewSection.classList.contains('active')) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        nextIssue(false);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        prevIssue();
      } else if (e.key === 'a' || e.key === 'A') {
        if (currentActiveIssueId) {
          e.preventDefault();
          const targetId = currentActiveIssueId;
          setDecision(targetId, true, false, true);
          updatePopoverDecisionUI(targetId);
          setTimeout(() => nextIssue(true), 180);
        }
      } else if (e.key === 'r' || e.key === 'R' || e.key === 'x' || e.key === 'X') {
        if (currentActiveIssueId) {
          e.preventDefault();
          const targetId = currentActiveIssueId;
          setDecision(targetId, false, true, true);
          updatePopoverDecisionUI(targetId);
          setTimeout(() => nextIssue(true), 180);
        }
      } else if (e.key === 'Escape') {
        if (inlinePopover) inlinePopover.classList.add('hidden');
      }
    }
  });
});
