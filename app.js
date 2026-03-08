var STRIPE_MONTHLY_URL = 'https://buy.stripe.com/bJeaEX8zUgzvb6n5lKf7i02';
var STRIPE_ANNUAL_URL = 'https://buy.stripe.com/bJedR9dUednj5M34hGf7i03';
var STRIPE_LIFETIME_URL = 'https://buy.stripe.com/14A3cv9DYfvr1vNaG4f7i04';
var STORAGE_KEY_TOKEN = 'prosescore_token';
var STORAGE_KEY_HISTORY = 'prosescore_history';
var STORAGE_KEY_THEME = 'prosescore_theme';
var STORAGE_KEY_USAGE = 'prosescore_usage';
var STORAGE_KEY_TRIAL = 'prosescore_free_trial_used';
var STORAGE_KEY_COUNTER = 'prosescore_analysis_count';
var TOKEN_PUBLIC_KEY = '4a0b3583a9941e9ff34ccad878f001c02f003b96335c9fc2bfc40f98caa820ed';
var API_BASE = '/api';
var FREE_DAILY_LIMIT = 5;
var COUNTER_SEED = 500;

var isPro = false;
var proProduct = null;
var currentResult = null;
var trialMode = false;

function init() {
  checkStoredToken();
  checkSessionRedirect();
  setupThemeToggle();
  setupAnalysis();
  setupFileUpload();
  setupCharCounter();
  setupPaywall();
  setupRestoreForm();
  updateProBadge();
  updateProUI();
  updateUsageDisplay();
  updateAnalysisCounter();
  setupTrialButton();
  updatePricingVisibility();

  document.getElementById('export-md-btn').addEventListener('click', function () {
    if (!currentResult) return;
    if (!isPro) { alert('Export is a Pro feature. Unlock Pro to export reports.'); return; }
    exportMarkdown();
  });

  var historyToggle = document.getElementById('history-toggle-btn');
  var historyPanel = document.getElementById('history-panel');
  historyToggle.addEventListener('click', function () {
    if (!isPro) { alert('History is a Pro feature. Unlock Pro to save analyses.'); return; }
    historyPanel.hidden = !historyPanel.hidden;
    if (!historyPanel.hidden) renderHistoryPanel();
  });

  document.getElementById('history-close').addEventListener('click', function () {
    document.getElementById('history-panel').hidden = true;
  });
}

// --- Token verification ---

function parseToken(tokenStr) {
  try {
    var parts = tokenStr.split('.');
    if (parts.length !== 3) return null;
    var payload = JSON.parse(atob(parts[1]));
    return payload;
  } catch (e) { return null; }
}

function isTokenExpired(payload) {
  if (!payload || !payload.exp) return true;
  return Math.floor(Date.now() / 1000) > payload.exp;
}

function checkStoredToken() {
  var token = localStorage.getItem(STORAGE_KEY_TOKEN);
  if (!token) {
    // Migration: check old boolean key
    if (localStorage.getItem('prosescore_pro') === 'true') {
      // Old user — keep pro active but prompt to verify
      isPro = true;
      proProduct = 'legacy';
      return;
    }
    isPro = false;
    return;
  }

  var payload = parseToken(token);
  if (!payload) {
    isPro = false;
    return;
  }

  if (isTokenExpired(payload)) {
    // Try silent refresh for subscriptions
    if (payload.product === 'subscription' && payload.email) {
      silentRestore(payload.email);
    }
    isPro = false;
    return;
  }

  isPro = true;
  proProduct = payload.product;
}

async function checkSessionRedirect() {
  var params = new URLSearchParams(window.location.search);
  var sessionId = params.get('session_id');
  if (!sessionId) return;

  // Clean URL immediately
  window.history.replaceState({}, '', window.location.pathname);

  try {
    var res = await fetch(API_BASE + '/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    });

    if (!res.ok) {
      var err = await res.json().catch(function () { return {}; });
      showPaywallMessage('Payment verification failed: ' + (err.error || 'Unknown error'), true);
      return;
    }

    var data = await res.json();
    localStorage.setItem(STORAGE_KEY_TOKEN, data.token);
    localStorage.removeItem('prosescore_pro'); // Clean up old key
    isPro = true;
    proProduct = data.product;
    updateProUI();
    updateProBadge();
    updateUsageDisplay();
    showPaywallMessage('Pro unlocked. Thank you for your purchase.', false);
  } catch (e) {
    showPaywallMessage('Could not verify payment. Please try restoring your purchase.', true);
  }
}

async function silentRestore(email) {
  try {
    var res = await fetch(API_BASE + '/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email }),
    });
    if (res.ok) {
      var data = await res.json();
      localStorage.setItem(STORAGE_KEY_TOKEN, data.token);
      isPro = true;
      proProduct = data.product;
      updateProUI();
      updateProBadge();
    }
  } catch (e) {
    // Silent failure
  }
}

function showPaywallMessage(msg, isError) {
  var el = document.getElementById('paywall-message');
  if (!el) return;
  el.textContent = msg;
  el.className = 'paywall-message ' + (isError ? 'error' : 'success');
  el.hidden = false;
}

// --- Restore purchase form ---

function setupRestoreForm() {
  var btn = document.getElementById('restore-btn');
  var form = document.getElementById('restore-form');
  var submitBtn = document.getElementById('restore-submit');
  var cancelBtn = document.getElementById('restore-cancel');

  if (!btn) return;

  btn.addEventListener('click', function () {
    form.hidden = !form.hidden;
  });

  cancelBtn.addEventListener('click', function () {
    form.hidden = true;
  });

  submitBtn.addEventListener('click', async function () {
    var emailInput = document.getElementById('restore-email');
    var email = emailInput.value.trim();
    if (!email) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Checking...';

    try {
      var res = await fetch(API_BASE + '/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email }),
      });

      if (res.ok) {
        var data = await res.json();
        localStorage.setItem(STORAGE_KEY_TOKEN, data.token);
        localStorage.removeItem('prosescore_pro');
        isPro = true;
        proProduct = data.product;
        updateProUI();
        updateProBadge();
        form.hidden = true;
        showPaywallMessage('Purchase restored.', false);
      } else {
        var err = await res.json().catch(function () { return {}; });
        showPaywallMessage(err.error || 'No purchase found for this email.', true);
      }
    } catch (e) {
      showPaywallMessage('Could not connect to server. Please try again.', true);
    }

    submitBtn.disabled = false;
    submitBtn.textContent = 'Restore';
  });
}

// --- Paywall setup ---

function setupPaywall() {
  var monthlyBtn = document.getElementById('buy-monthly');
  var annualBtn = document.getElementById('buy-annual');
  var lifetimeBtn = document.getElementById('buy-lifetime');

  if (monthlyBtn) monthlyBtn.href = STRIPE_MONTHLY_URL;
  if (annualBtn) annualBtn.href = STRIPE_ANNUAL_URL;
  if (lifetimeBtn) lifetimeBtn.href = STRIPE_LIFETIME_URL;
}

function updateProBadge() {
  var badge = document.getElementById('pro-badge');
  if (badge) badge.hidden = !isPro;
}

function setupThemeToggle() {
  var saved = localStorage.getItem(STORAGE_KEY_THEME);
  if (saved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }

  var btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.addEventListener('click', function () {
      var isLight = document.documentElement.getAttribute('data-theme') === 'light';
      if (isLight) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem(STORAGE_KEY_THEME, 'dark');
      } else {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem(STORAGE_KEY_THEME, 'light');
      }
    });
  }
}

function setupFileUpload() {
  var zone = document.getElementById('upload-zone');
  var input = document.getElementById('file-input');

  zone.addEventListener('click', function () { input.click(); });
  zone.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
  });

  input.addEventListener('change', function () {
    if (input.files.length) handleFile(input.files[0]);
    input.value = '';
  });

  zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', function () { zone.classList.remove('drag-over'); });
  zone.addEventListener('drop', function (e) {
    e.preventDefault();
    zone.classList.remove('drag-over');
    var file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });
}

function handleFile(file) {
  var validExts = ['.txt', '.md'];
  var ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!validExts.includes(ext)) {
    alert('Please upload a .txt or .md file.');
    return;
  }
  var reader = new FileReader();
  reader.onload = function (e) {
    var textarea = document.getElementById('text-input');
    textarea.value = e.target.result;
    updateCharCounter();
    updateAnalyzeButton();
    document.getElementById('analyze-btn').click();
  };
  reader.readAsText(file);
}

function setupCharCounter() {
  var textarea = document.getElementById('text-input');
  textarea.addEventListener('input', function () {
    updateCharCounter();
    updateAnalyzeButton();
  });
  updateCharCounter();
  updateAnalyzeButton();
}

function updateCharCounter() {
  var textarea = document.getElementById('text-input');
  var counter = document.getElementById('char-count');
  var len = textarea.value.length;
  counter.textContent = len + ' character' + (len !== 1 ? 's' : '');
}

function updateAnalyzeButton() {
  var textarea = document.getElementById('text-input');
  var btn = document.getElementById('analyze-btn');
  btn.disabled = !textarea.value.trim();
}

// --- Usage counter ---

function getUsageToday() {
  try {
    var data = JSON.parse(localStorage.getItem(STORAGE_KEY_USAGE));
    if (data && data.date === todayStr()) return data.count;
  } catch (e) {}
  return 0;
}

function incrementUsage() {
  var count = getUsageToday() + 1;
  localStorage.setItem(STORAGE_KEY_USAGE, JSON.stringify({ date: todayStr(), count: count }));
  updateUsageDisplay();
  return count;
}

function todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function updateUsageDisplay() {
  var el = document.getElementById('usage-counter');
  if (!el) return;
  if (isPro) {
    el.hidden = true;
    return;
  }
  var used = getUsageToday();
  var remaining = Math.max(FREE_DAILY_LIMIT - used, 0);
  el.textContent = remaining + ' of ' + FREE_DAILY_LIMIT + ' free analyses remaining today';
  el.hidden = false;
  el.className = 'usage-counter' + (remaining <= 1 ? ' usage-low' : '');
}

function showLimitBanner() {
  var banner = document.getElementById('limit-banner');
  if (banner) banner.hidden = false;
  var results = document.getElementById('results');
  if (results) results.hidden = true;
}

function setupAnalysis() {
  var textarea = document.getElementById('text-input');
  var btn = document.getElementById('analyze-btn');

  btn.addEventListener('click', function () {
    var text = textarea.value.trim();
    if (!text || text.split(/\s+/).filter(Boolean).length < 1) return;

    // Check usage limit for free users
    if (!isPro && getUsageToday() >= FREE_DAILY_LIMIT) {
      showLimitBanner();
      return;
    }

    var result = textlens.analyze(text);
    var density = textlens.density(text);
    var seo = textlens.seoScore(text);
    currentResult = { analysis: result, density: density, seo: seo };

    // Increment usage for free users
    if (!isPro) incrementUsage();

    incrementAnalysisCount();
    document.getElementById('limit-banner').hidden = true;
    document.getElementById('results').hidden = false;
    renderFreeResults(result);
    renderProResults(currentResult);
    updateProUI();
    showTrialBanner();
    saveToHistory(text, currentResult);
  });
}

function getGradeColor(grade) {
  if (grade <= 6) return '#3FB950';
  if (grade <= 9) return '#00E5A0';
  if (grade <= 12) return '#D29922';
  return '#F85149';
}

function getRecommendation(grade) {
  if (grade <= 5) return 'Reading level: Elementary. Your text is accessible to young readers.';
  if (grade <= 8) return 'Reading level: Middle school. Accessible to a broad audience.';
  if (grade <= 10) return 'Reading level: High school. Suitable for most adult readers.';
  if (grade <= 12) return 'Reading level: College prep. Consider simplifying for a general audience.';
  if (grade <= 16) return 'Reading level: College. May be challenging for some readers.';
  return 'Reading level: Graduate. Consider simplifying unless writing for specialists.';
}

function renderFreeResults(result) {
  var grade = result.readability.fleschKincaidGrade.grade;

  var scoreValue = document.getElementById('score-value');
  var meterFill = document.getElementById('meter-fill');
  var scoreLabel = document.getElementById('score-label');
  var scoreInterp = document.getElementById('score-interpretation');

  scoreValue.textContent = grade.toFixed(1);
  scoreValue.style.color = getGradeColor(grade);
  scoreLabel.textContent = 'Flesch-Kincaid grade level';
  scoreInterp.textContent = result.readability.fleschKincaidGrade.interpretation;

  var clamped = Math.min(Math.max(grade, 0), 20);
  var offset = 251 - (251 * clamped / 20);
  meterFill.setAttribute('stroke-dashoffset', offset);
  meterFill.setAttribute('stroke', getGradeColor(grade));

  var statsGrid = document.getElementById('stats-grid');
  var rt = result.readingTime;
  var readingTimeStr = rt.minutes + ' min ' + rt.seconds + ' sec';

  var stats = [
    { value: result.statistics.words, label: 'Words' },
    { value: result.statistics.sentences, label: 'Sentences' },
    { value: result.statistics.paragraphs, label: 'Paragraphs' },
    { value: result.statistics.characters, label: 'Characters' },
    { value: readingTimeStr, label: 'Reading Time' },
    { value: result.statistics.avgWordLength.toFixed(1), label: 'Avg Word Length' },
    { value: result.statistics.avgSentenceLength.toFixed(1), label: 'Avg Sentence Length' },
    { value: result.statistics.syllables, label: 'Syllables' }
  ];

  statsGrid.innerHTML = stats.map(function (s) {
    return '<div class="stat-card"><div class="stat-value">' + s.value + '</div><div class="stat-label">' + s.label + '</div></div>';
  }).join('');

  var rec = document.getElementById('recommendation');
  rec.textContent = getRecommendation(grade);
  rec.hidden = false;
}

function gradeColor(grade) {
  if (grade <= 6) return '#3FB950';
  if (grade <= 9) return '#00E5A0';
  if (grade <= 12) return '#D29922';
  return '#F85149';
}

function seoColor(score) {
  if (score >= 80) return '#3FB950';
  if (score >= 60) return '#00E5A0';
  if (score >= 40) return '#D29922';
  return '#F85149';
}

function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function updateProUI() {
  var paywall = document.getElementById('paywall');
  var proTeaser = document.getElementById('pro-teaser');
  var limitBanner = document.getElementById('limit-banner');
  if (isPro) {
    paywall.classList.add('hidden');
    if (proTeaser) proTeaser.classList.add('hidden');
    if (limitBanner) limitBanner.hidden = true;
  } else {
    paywall.classList.remove('hidden');
    if (proTeaser) proTeaser.classList.remove('hidden');
  }
}

function renderProResults(data) {
  var result = data.analysis;
  var seo = data.seo;

  var consensusGrade = result.readability.consensusGrade;
  document.getElementById('consensus-value').textContent = consensusGrade.toFixed(1);
  document.getElementById('consensus-value').style.color = gradeColor(consensusGrade);
  document.getElementById('consensus-note').textContent = 'Average across 7 grade-level formulas';

  var formulas = [
    { name: 'Flesch Reading Ease', data: result.readability.fleschReadingEase, isScore: true },
    { name: 'Flesch-Kincaid', data: result.readability.fleschKincaidGrade, isScore: false },
    { name: 'Coleman-Liau', data: result.readability.colemanLiauIndex, isScore: false },
    { name: 'Automated Readability', data: result.readability.automatedReadabilityIndex, isScore: false },
    { name: 'Gunning Fog', data: result.readability.gunningFogIndex, isScore: false },
    { name: 'SMOG', data: result.readability.smogIndex, isScore: false },
    { name: 'Dale-Chall', data: result.readability.daleChallScore, isScore: false },
    { name: 'Linsear Write', data: result.readability.linsearWriteFormula, isScore: false }
  ];

  var gridHtml = formulas.map(function (f) {
    var value, color;
    if (f.isScore) {
      value = f.data.score.toFixed(1);
      var easeGrade = f.data.grade != null ? f.data.grade : (100 - f.data.score) / 5;
      color = gradeColor(easeGrade);
    } else {
      value = 'Grade ' + f.data.grade.toFixed(1);
      color = gradeColor(f.data.grade);
    }
    return '<div class="formula-item">' +
      '<span class="formula-name">' + escapeHtml(f.name) + '</span>' +
      '<span class="formula-grade" style="color: ' + color + '">' + value + '</span>' +
      '</div>';
  }).join('');
  document.getElementById('readability-table').innerHTML = gridHtml;

  var sent = result.sentiment;
  var sentColor = sent.label === 'positive' ? '#3FB950' : sent.label === 'negative' ? '#F85149' : '#8B949E';
  var barWidth = Math.min(Math.abs(sent.comparative) * 100, 100);
  var sentHtml = '<div class="sentiment-header">' +
    '<span class="sentiment-label" style="color: ' + sentColor + '">' + escapeHtml(sent.label) + '</span>' +
    '<span class="sentiment-score">Score: ' + sent.score.toFixed(2) + '</span>' +
    '<span class="sentiment-confidence">Confidence: ' + (sent.confidence * 100).toFixed(0) + '%</span>' +
    '</div>' +
    '<div class="sentiment-bar"><div class="sentiment-bar-fill" style="width: ' + barWidth + '%; background: ' + sentColor + '"></div></div>';

  if ((sent.positive && sent.positive.length) || (sent.negative && sent.negative.length)) {
    sentHtml += '<div class="word-lists">';
    if (sent.positive && sent.positive.length) {
      sentHtml += '<div class="word-list"><h3>Positive words</h3>';
      sent.positive.forEach(function (w) {
        sentHtml += '<span class="word-tag positive">' + escapeHtml(w) + '</span>';
      });
      sentHtml += '</div>';
    }
    if (sent.negative && sent.negative.length) {
      sentHtml += '<div class="word-list"><h3>Negative words</h3>';
      sent.negative.forEach(function (w) {
        sentHtml += '<span class="word-tag negative">' + escapeHtml(w) + '</span>';
      });
      sentHtml += '</div>';
    }
    sentHtml += '</div>';
  }
  document.getElementById('sentiment-display').innerHTML = sentHtml;

  var keywords = result.keywords || [];
  var maxCount = keywords.length ? keywords[0].count : 1;
  var kwHtml = keywords.map(function (kw) {
    var pct = (kw.count / maxCount) * 100;
    return '<div class="keyword-item">' +
      '<span class="keyword-word">' + escapeHtml(kw.word) + '</span>' +
      '<div class="keyword-bar-bg"><div class="keyword-bar-fill" style="width: ' + pct + '%"></div></div>' +
      '<span class="keyword-count">' + kw.count + ' (' + kw.density.toFixed(1) + '%)</span>' +
      '</div>';
  }).join('');
  document.getElementById('keywords-list').innerHTML = kwHtml;

  var seoData = seo;
  var seoHtml = '<div class="seo-score-big" style="color: ' + seoColor(seoData.score) + '">' + seoData.score + '</div>' +
    '<div class="seo-grade">Grade: ' + escapeHtml(seoData.grade) + '</div>' +
    '<div class="seo-details">' +
      '<div class="seo-detail"><div class="seo-detail-value" style="color: ' + seoColor(seoData.details.readabilityScore) + '">' + seoData.details.readabilityScore + '</div><div class="seo-detail-label">Readability</div></div>' +
      '<div class="seo-detail"><div class="seo-detail-value" style="color: ' + seoColor(seoData.details.contentLengthScore) + '">' + seoData.details.contentLengthScore + '</div><div class="seo-detail-label">Content Length</div></div>' +
      '<div class="seo-detail"><div class="seo-detail-value" style="color: ' + seoColor(seoData.details.keywordScore) + '">' + seoData.details.keywordScore + '</div><div class="seo-detail-label">Keywords</div></div>' +
      '<div class="seo-detail"><div class="seo-detail-value" style="color: ' + seoColor(seoData.details.sentenceVarietyScore) + '">' + seoData.details.sentenceVarietyScore + '</div><div class="seo-detail-label">Sentence Variety</div></div>' +
    '</div>';

  if (seoData.issues && seoData.issues.length) {
    seoHtml += '<div class="seo-issues"><h3>Issues</h3><ul>';
    seoData.issues.forEach(function (issue) {
      seoHtml += '<li>' + escapeHtml(issue) + '</li>';
    });
    seoHtml += '</ul></div>';
  }

  if (seoData.suggestions && seoData.suggestions.length) {
    seoHtml += '<div class="seo-suggestions"><h3>Suggestions</h3><ul>';
    seoData.suggestions.forEach(function (s) {
      seoHtml += '<li>' + escapeHtml(s) + '</li>';
    });
    seoHtml += '</ul></div>';
  }
  document.getElementById('seo-display').innerHTML = seoHtml;

  var summary = result.summary;
  var summaryHtml = '<p class="summary-text">' + escapeHtml(summary.sentences.join(' ')) + '</p>' +
    '<p class="summary-ratio">Compression ratio: ' + (summary.ratio * 100).toFixed(0) + '% of original</p>';
  document.getElementById('summary-display').innerHTML = summaryHtml;
}

// --- Markdown Export ---

function downloadFile(content, filename, mimeType) {
  var blob = new Blob([content], { type: mimeType });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportMarkdown() {
  var result = currentResult.analysis;
  var seo = currentResult.seo;
  var rt = result.readingTime;
  var now = new Date();
  var dateStr = now.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  var fileDate = now.toISOString().slice(0, 10);

  var md = '# ProseScore Analysis Report\n\n';
  md += '**Generated:** ' + dateStr + '\n';
  md += '**Words:** ' + result.statistics.words + ' | **Sentences:** ' + result.statistics.sentences +
    ' | **Paragraphs:** ' + result.statistics.paragraphs + ' | **Reading time:** ' + rt.minutes + ' min ' + rt.seconds + ' sec\n\n';

  md += '## Readability\n\n';
  md += '| Formula | Grade | Score | Interpretation |\n';
  md += '|---------|-------|-------|----------------|\n';

  var formulas = [
    { name: 'Flesch-Kincaid', data: result.readability.fleschKincaidGrade },
    { name: 'Gunning Fog', data: result.readability.gunningFogIndex },
    { name: 'Coleman-Liau', data: result.readability.colemanLiauIndex },
    { name: 'SMOG', data: result.readability.smogIndex },
    { name: 'ARI', data: result.readability.automatedReadabilityIndex },
    { name: 'Dale-Chall', data: result.readability.daleChallScore },
    { name: 'Linsear Write', data: result.readability.linsearWriteFormula }
  ];

  formulas.forEach(function (f) {
    var grade = f.data.grade != null ? f.data.grade.toFixed(1) : '-';
    var score = f.data.score != null ? f.data.score.toFixed(1) : grade;
    var interp = f.data.interpretation || '';
    md += '| ' + f.name + ' | ' + grade + ' | ' + score + ' | ' + interp + ' |\n';
  });

  md += '\n**Consensus grade level:** ' + result.readability.consensusGrade.toFixed(1) + '\n';
  var fre = result.readability.fleschReadingEase;
  md += '**Flesch Reading Ease:** ' + fre.score.toFixed(1) + ' — ' + (fre.interpretation || '') + '\n\n';

  var sent = result.sentiment;
  md += '## Sentiment\n\n';
  md += '**Label:** ' + sent.label.charAt(0).toUpperCase() + sent.label.slice(1) +
    ' | **Score:** ' + sent.score.toFixed(2) +
    ' | **Confidence:** ' + (sent.confidence * 100).toFixed(0) + '%\n\n';

  if (sent.positive && sent.positive.length) {
    md += '**Positive words:** ' + sent.positive.join(', ') + '\n';
  }
  if (sent.negative && sent.negative.length) {
    md += '**Negative words:** ' + sent.negative.join(', ') + '\n';
  }
  md += '\n';

  var keywords = result.keywords || [];
  if (keywords.length) {
    md += '## Top keywords\n\n';
    md += '| Keyword | Count | Density |\n';
    md += '|---------|-------|---------|\n';
    keywords.forEach(function (kw) {
      md += '| ' + kw.word + ' | ' + kw.count + ' | ' + kw.density.toFixed(2) + '% |\n';
    });
    md += '\n';
  }

  md += '## SEO Score\n\n';
  md += '**Overall:** ' + seo.score + '/100 (' + seo.grade + ')\n\n';
  md += '| Metric | Score |\n';
  md += '|--------|-------|\n';
  md += '| Readability | ' + seo.details.readabilityScore + ' |\n';
  md += '| Content length | ' + seo.details.contentLengthScore + ' |\n';
  md += '| Keywords | ' + seo.details.keywordScore + ' |\n';
  md += '| Sentence variety | ' + seo.details.sentenceVarietyScore + ' |\n\n';

  if (seo.issues && seo.issues.length) {
    md += '**Issues:**\n';
    seo.issues.forEach(function (issue) { md += '- ' + issue + '\n'; });
    md += '\n';
  }
  if (seo.suggestions && seo.suggestions.length) {
    md += '**Suggestions:**\n';
    seo.suggestions.forEach(function (s) { md += '- ' + s + '\n'; });
    md += '\n';
  }

  var summary = result.summary;
  if (summary && summary.sentences && summary.sentences.length) {
    md += '## Summary\n\n';
    md += '> ' + summary.sentences.join(' ') + '\n\n';
  }

  md += '---\n*Generated by [ProseScore](https://prosescore.ckmtools.dev) — powered by [textlens](https://www.npmjs.com/package/textlens)*\n';

  downloadFile(md, 'prosescore-report-' + fileDate + '.md', 'text/markdown');
}

// --- Analysis History ---

function saveToHistory(text, result) {
  if (!isPro) return;
  var history = loadHistory();
  var entry = {
    id: 'ps_' + Date.now(),
    timestamp: Date.now(),
    preview: text.slice(0, 100),
    wordCount: result.analysis.statistics.words,
    grade: result.analysis.readability.fleschKincaidGrade.grade,
    sentiment: result.analysis.sentiment.label,
    text: text,
    result: result
  };
  history.unshift(entry);
  if (history.length > 50) history.pop();
  localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));
  renderHistoryPanel();
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORY)) || [];
  } catch (e) { return []; }
}

function deleteHistoryEntry(id) {
  var history = loadHistory().filter(function (e) { return e.id !== id; });
  localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));
  renderHistoryPanel();
}

function loadHistoryEntry(id) {
  var history = loadHistory();
  var entry = history.find(function (e) { return e.id === id; });
  if (!entry) return;
  document.getElementById('text-input').value = entry.text;
  currentResult = entry.result;
  renderFreeResults(entry.result.analysis);
  renderProResults(entry.result);
  document.getElementById('results').hidden = false;
  document.getElementById('history-panel').hidden = true;
}

function renderHistoryPanel() {
  var list = document.getElementById('history-list');
  var history = loadHistory();
  if (history.length === 0) {
    list.innerHTML = '<p class="text-secondary" style="padding: 1rem;">No saved analyses yet.</p>';
    return;
  }
  list.innerHTML = history.map(function (entry) {
    return '<div class="history-item" data-id="' + entry.id + '">' +
      '<div class="history-preview">' + escapeHtml(entry.preview) + '...</div>' +
      '<div class="history-meta">' +
        '<span>' + entry.wordCount + ' words</span>' +
        '<span>Grade ' + entry.grade.toFixed(1) + '</span>' +
        '<span>' + new Date(entry.timestamp).toLocaleDateString() + '</span>' +
      '</div>' +
      '<div class="history-actions">' +
        '<button class="history-load" data-id="' + entry.id + '" aria-label="Load analysis">Load</button>' +
        '<button class="history-delete" data-id="' + entry.id + '" aria-label="Delete entry">Delete</button>' +
      '</div>' +
    '</div>';
  }).join('');

  list.querySelectorAll('.history-load').forEach(function (btn) {
    btn.addEventListener('click', function () { loadHistoryEntry(btn.dataset.id); });
  });
  list.querySelectorAll('.history-delete').forEach(function (btn) {
    btn.addEventListener('click', function () { deleteHistoryEntry(btn.dataset.id); });
  });
}

// --- Analysis counter (social proof) ---

function getAnalysisCount() {
  var stored = localStorage.getItem(STORAGE_KEY_COUNTER);
  if (stored) return parseInt(stored, 10);
  return COUNTER_SEED;
}

function incrementAnalysisCount() {
  var count = getAnalysisCount() + 1;
  localStorage.setItem(STORAGE_KEY_COUNTER, String(count));
  updateAnalysisCounter();
}

function updateAnalysisCounter() {
  var el = document.getElementById('analysis-counter');
  if (!el) return;
  var count = getAnalysisCount();
  el.textContent = count.toLocaleString() + '+ texts analyzed';
}

// --- Free Pro trial ---

function isTrialUsed() {
  return localStorage.getItem(STORAGE_KEY_TRIAL) === 'true';
}

function setupTrialButton() {
  var btn = document.getElementById('trial-btn');
  if (!btn) return;
  btn.addEventListener('click', function () {
    trialMode = true;
    // Re-run analysis with Pro features
    var text = document.getElementById('text-input').value.trim();
    if (!text) return;

    var result = textlens.analyze(text);
    var density = textlens.density(text);
    var seo = textlens.seoScore(text);
    currentResult = { analysis: result, density: density, seo: seo };

    renderFreeResults(result);
    renderProResults(currentResult);

    // Unlock pro teaser visually
    var paywall = document.getElementById('paywall');
    var proTeaser = document.getElementById('pro-teaser');
    if (paywall) paywall.classList.add('hidden');
    if (proTeaser) proTeaser.classList.add('hidden');

    // Mark trial as used
    localStorage.setItem(STORAGE_KEY_TRIAL, 'true');
    trialMode = false;

    // Hide trial button, show CTA
    document.getElementById('trial-banner').hidden = true;
    document.getElementById('trial-cta').hidden = false;
  });
}

function showTrialBanner() {
  if (isPro || isTrialUsed()) return;
  var trialBanner = document.getElementById('trial-banner');
  if (trialBanner) trialBanner.hidden = false;
}

function updatePricingVisibility() {
  var section = document.querySelector('.pricing-section');
  if (!section) return;
  if (isPro) {
    section.classList.add('hidden');
  } else {
    section.classList.remove('hidden');
  }
}

document.addEventListener('DOMContentLoaded', init);
