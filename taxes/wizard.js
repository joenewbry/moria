/**
 * Tax Wizard — Core logic for the 8-step TurboTax-style flow
 *
 * Manages state, step navigation, document upload, tax computation,
 * gap analysis rendering, deductions/credits, and form generation.
 */

// ── SESSION STATE ──
const taxSession = {
  sessionId: crypto.randomUUID(),
  currentStep: 1,
  taxYear: 2025,
  // Personal
  firstName: '',
  lastName: '',
  ssnLast4: '',
  filingStatus: 'single',
  stateOfResidence: null, // 'CA', 'NY', 'other'
  childrenUnder17: 0,
  otherDependents: 0,
  // Documents
  documents: [],   // [{id, name, size, type, status, extractionStatus, file}]
  incomes: [],     // extracted data from Claude Vision
  // Gap Analysis
  gapAnswers: {},  // { has401k: true, hasMortgage: false, ... }
  manualEntries: {}, // { contribution401k: 23500, mortgageInterest: 12000, ... }
  // Deductions
  deductionType: 'standard',
  itemized: { mortgage: 0, salt: 0, charitable: 0, medical: 0 },
  credits: {},
  // Computed
  filing: null,
  rulesResults: null,
  generatedForms: [],
};

const TOTAL_STEPS = 8;
const API_BASE = '/taxes/api';

// ── LOAD SAVED STATE ──
(function loadSaved() {
  try {
    const saved = localStorage.getItem('taxWizardSession');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Restore serializable fields (not File objects or blobs)
      const skip = ['documents', 'generatedForms', 'filing', 'rulesResults'];
      for (const key of Object.keys(parsed)) {
        if (!skip.includes(key) && parsed[key] !== undefined) {
          taxSession[key] = parsed[key];
        }
      }
      // Restore incomes (no File refs)
      if (parsed.incomes) taxSession.incomes = parsed.incomes;
    }
  } catch (e) { /* ignore */ }
})();

function saveSession() {
  try {
    // Don't persist File objects or blobs
    const toSave = { ...taxSession };
    toSave.documents = taxSession.documents.map(d => ({
      id: d.id, name: d.name, size: d.size, type: d.type,
      status: d.status, extractionStatus: d.extractionStatus,
    }));
    delete toSave.generatedForms;
    localStorage.setItem('taxWizardSession', JSON.stringify(toSave));
  } catch (e) { /* ignore */ }
}

// ── STEP NAVIGATION ──
function goToStep(n) {
  if (n < 1 || n > TOTAL_STEPS) return;
  taxSession.currentStep = n;

  // Show/hide step sections
  document.querySelectorAll('.wizard-step').forEach(s => {
    s.classList.toggle('active', parseInt(s.dataset.step) === n);
  });

  // Update progress bar
  document.querySelectorAll('.progress-step').forEach(step => {
    const sn = parseInt(step.dataset.step);
    step.classList.remove('done', 'active');
    if (sn < n) step.classList.add('done');
    else if (sn === n) step.classList.add('active');
  });

  // Update nav buttons
  document.getElementById('prev-btn').disabled = n === 1;
  const nextBtn = document.getElementById('next-btn');
  if (n === TOTAL_STEPS) {
    nextBtn.style.display = 'none';
  } else {
    nextBtn.style.display = '';
    nextBtn.textContent = n === TOTAL_STEPS - 1 ? 'Finish →' : 'Next →';
  }
  document.getElementById('step-indicator').textContent = `${n} / ${TOTAL_STEPS}`;

  // Step-specific actions
  if (n === 4) renderGapQuestions();
  if (n === 5) updateDeductionsView();
  if (n === 6) computeAndRenderTaxes();
  if (n === 7) updateFormGenList();
  if (n === 8) renderFormDownloads();

  // Update year label
  document.getElementById('tax-year-label').textContent = `Tax Year ${taxSession.taxYear}`;

  saveSession();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function nextStep() { goToStep(taxSession.currentStep + 1); }
function prevStep() { goToStep(taxSession.currentStep - 1); }

// ── OPTION CARD SELECTION ──
document.querySelectorAll('.option-grid').forEach(grid => {
  const field = grid.dataset.field;
  if (!field) return;
  grid.querySelectorAll('.option-card').forEach(card => {
    card.addEventListener('click', () => {
      grid.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      const value = card.dataset.value;

      if (field === 'taxYear') {
        taxSession.taxYear = parseInt(value);
      } else if (field === 'filingStatus') {
        taxSession.filingStatus = value;
      } else if (field === 'stateOfResidence') {
        taxSession.stateOfResidence = value;
      }
      saveSession();
    });
  });
});

// ── TEXT INPUT BINDINGS ──
['firstName', 'lastName', 'ssnLast4'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('input', () => {
      taxSession[id] = el.value;
      saveSession();
    });
  }
});

['childrenUnder17', 'otherDependents'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('input', () => {
      taxSession[id] = parseInt(el.value) || 0;
      saveSession();
    });
  }
});

// ── DOCUMENT UPLOAD (Step 3) ──
const uploadZone = document.getElementById('upload-zone');
const fileInput = document.getElementById('file-input');

['dragenter', 'dragover'].forEach(e => {
  uploadZone.addEventListener(e, ev => { ev.preventDefault(); uploadZone.classList.add('dragover'); });
});
['dragleave', 'drop'].forEach(e => {
  uploadZone.addEventListener(e, ev => { ev.preventDefault(); uploadZone.classList.remove('dragover'); });
});

uploadZone.addEventListener('drop', e => {
  handleFiles(Array.from(e.dataTransfer.files));
});

fileInput.addEventListener('change', e => {
  handleFiles(Array.from(e.target.files));
  e.target.value = '';
});

function handleFiles(files) {
  files.forEach(file => {
    const doc = {
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      type: guessDocType(file.name),
      status: 'uploading',
      extractionStatus: {},
      file: file,
    };
    taxSession.documents.push(doc);
    renderDocList();
    processDocument(doc);
  });
}

function guessDocType(name) {
  const lower = name.toLowerCase();
  if (lower.includes('w-2') || lower.includes('w2')) return 'W-2';
  if (lower.includes('1099-nec') || lower.includes('1099nec')) return '1099-NEC';
  if (lower.includes('1099-int')) return '1099-INT';
  if (lower.includes('1099-div')) return '1099-DIV';
  if (lower.includes('1099-b')) return '1099-B';
  if (lower.includes('1098-t')) return '1098-T';
  if (lower.includes('1098-e')) return '1098-E';
  if (lower.includes('1098')) return '1098';
  if (lower.includes('1099')) return '1099';
  return 'Unknown';
}

function renderDocList() {
  const list = document.getElementById('doc-list');
  if (taxSession.documents.length === 0) { list.innerHTML = ''; return; }

  list.innerHTML = taxSession.documents.map(doc => {
    const iconClass = getDocIconClass(doc.type);
    const iconText = getDocIconText(doc.type);
    let statusHtml;
    if (doc.status === 'uploading') {
      statusHtml = '<span class="status-badge none"><span class="spinner"></span> Uploading</span>';
    } else if (doc.status === 'processing') {
      statusHtml = '<span class="status-badge none"><span class="spinner"></span> Analyzing</span>';
    } else if (doc.status === 'processed') {
      const exStatus = doc.extractionStatus || {};
      const fields = Object.values(exStatus);
      const missing = fields.filter(v => v === 'not_found').length;
      statusHtml = missing > 0
        ? `<span class="status-badge medium">⚠ ${fields.length - missing}/${fields.length}</span>`
        : '<span class="status-badge high">✓ Extracted</span>';
    } else if (doc.status === 'error') {
      statusHtml = '<span class="status-badge low">Error</span>';
    } else {
      statusHtml = '<span class="status-badge none">—</span>';
    }
    return `
      <div class="doc-item">
        <div class="doc-icon ${iconClass}">${iconText}</div>
        <div class="doc-info">
          <div class="doc-name">${doc.name}</div>
          <div class="doc-meta">${doc.type} · ${formatSize(doc.size)}</div>
        </div>
        <div class="doc-status">${statusHtml}</div>
      </div>`;
  }).join('');

  saveSession();
}

function getDocIconClass(type) {
  if (type === 'W-2') return 'w2';
  if (type === '1099-NEC') return 'nec';
  if (type === '1099-INT') return 'int';
  if (type === '1099-DIV') return 'div';
  return 'other';
}

function getDocIconText(type) {
  if (type === 'W-2') return 'W2';
  if (type.startsWith('1099')) return '99';
  if (type.startsWith('1098')) return '98';
  return '??';
}

// ── PROCESSING LOG ──
function showProcessingLog() {
  document.getElementById('processing-section').style.display = '';
}

function addLogEntry(text, docName) {
  const entries = document.getElementById('log-entries');
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  if (docName) {
    const label = document.createElement('span');
    label.className = 'log-doc-label';
    label.textContent = docName;
    entry.appendChild(label);
  }
  const content = document.createElement('div');
  content.className = 'log-text';
  content.textContent = text;
  entry.appendChild(content);
  entries.appendChild(entry);
  const log = document.getElementById('processing-log');
  log.scrollTop = log.scrollHeight;
  requestAnimationFrame(() => entry.classList.add('visible'));
}

function addLogDivider() {
  const entries = document.getElementById('log-entries');
  const divider = document.createElement('div');
  divider.className = 'log-divider';
  entries.appendChild(divider);
}

// ── DOCUMENT PROCESSING (SSE) ──
async function processDocument(doc) {
  showProcessingLog();
  addLogEntry(`Uploading ${doc.name}…`, doc.name);

  doc.status = 'uploading';
  renderDocList();

  const formData = new FormData();
  formData.append('file', doc.file);

  try {
    doc.status = 'processing';
    renderDocList();
    addLogEntry('Sending to Claude Vision for analysis…', doc.name);

    const response = await fetch(`${API_BASE}/extract`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let extractedData = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      let eventType = null;
      let eventData = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          eventData = line.slice(6);
          if (eventType && eventData) {
            try {
              const parsed = JSON.parse(eventData);
              if (eventType === 'log') {
                addLogEntry(parsed.text, doc.name);
              } else if (eventType === 'data') {
                extractedData = parsed;
                const exStatus = parsed.extraction_status || {};
                const exFields = Object.values(exStatus);
                const exCount = exFields.filter(v => v === 'extracted').length;
                addLogEntry(`Extracted ${parsed.doc_type || 'document'} — ${exCount}/${exFields.length} fields.`, doc.name);
              } else if (eventType === 'error') {
                addLogEntry(`Error: ${parsed.error}`, doc.name);
                doc.status = 'error';
                renderDocList();
              }
            } catch (e) { /* skip malformed JSON */ }
            eventType = null;
            eventData = '';
          }
        } else if (line === '') {
          eventType = null;
          eventData = '';
        }
      }
    }

    if (extractedData) {
      doc.status = 'processed';
      doc.extractionStatus = extractedData.extraction_status || {};
      if (extractedData.doc_type) doc.type = extractedData.doc_type;

      // Tag with doc ID for dedup
      extractedData._docId = doc.id;
      // Remove any previous extraction for this doc (re-upload case)
      taxSession.incomes = taxSession.incomes.filter(i => i._docId !== doc.id);
      taxSession.incomes.push(extractedData);
      renderDocList();
      renderIncomes();
      addLogDivider();
    } else if (doc.status !== 'error') {
      doc.status = 'error';
      addLogEntry('No structured data received from API.', doc.name);
      renderDocList();
    }

  } catch (error) {
    doc.status = 'error';
    addLogEntry(`Error: ${error.message}`, doc.name);
    renderDocList();
    console.error('Processing error:', error);
  }

  saveSession();
}

// ── INCOME RENDERING ──
function renderIncomes() {
  const container = document.getElementById('income-sources');
  if (taxSession.incomes.length === 0) { container.innerHTML = ''; return; }

  container.innerHTML = '<div style="margin-top:24px;margin-bottom:8px;font-size:12px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em">Extracted Income Sources</div>' +
    taxSession.incomes.map(inc => {
      const exStatus = inc.extraction_status || {};
      const fields = Object.values(exStatus);
      const extracted = fields.filter(v => v === 'extracted').length;
      const allExtracted = fields.length > 0 && extracted === fields.length;
      const statusBadge = allExtracted
        ? '<span class="status-badge high">✓ All fields</span>'
        : fields.length > 0
          ? `<span class="status-badge medium">⚠ ${extracted}/${fields.length}</span>`
          : '<span class="status-badge high">✓</span>';

      if (inc.doc_type === 'W-2') {
        return `
          <div class="income-card">
            <div class="income-header">
              <div class="income-type">
                <span class="type-badge w2">W-2</span>
                <span class="income-employer">${inc.employer_name || 'Employer'}</span>
              </div>
              <span class="income-amount">${fmtCurrency(inc.wages || 0)}</span>
            </div>
            <div class="income-details">
              <div class="income-detail"><span class="dl">Fed Withheld</span><span class="dv">${fmtCurrency(inc.fed_income_tax_withheld || 0)}</span></div>
              <div class="income-detail"><span class="dl">State Withheld</span><span class="dv">${fmtCurrency(inc.state_income_tax_withheld || 0)}</span></div>
              <div class="income-detail"><span class="dl">SS Tax</span><span class="dv">${fmtCurrency(inc.social_security_tax_withheld || 0)}</span></div>
              <div class="income-detail"><span class="dl">Medicare</span><span class="dv">${fmtCurrency(inc.medicare_tax_withheld || 0)}</span></div>
              ${inc.box12_codes && inc.box12_codes.length > 0
                ? inc.box12_codes.map(c => `<div class="income-detail"><span class="dl">Box 12 ${c.code}</span><span class="dv">${fmtCurrency(c.amount)}</span></div>`).join('')
                : ''}
            </div>
            <div style="margin-top:10px;text-align:right">${statusBadge}</div>
          </div>`;
      } else {
        const payer = inc.payer_name || 'Payer';
        const amount = inc.nonemployee_compensation || inc.interest_income || inc.ordinary_dividends || inc.proceeds || 0;
        const docType = inc.doc_type || 'Unknown';
        const badgeClass = docType.includes('INT') ? 'int' : docType.includes('DIV') ? 'div' : docType.includes('B') ? 'b' : 'nec';
        return `
          <div class="income-card">
            <div class="income-header">
              <div class="income-type">
                <span class="type-badge ${badgeClass}">${docType}</span>
                <span class="income-employer">${payer}</span>
              </div>
              <span class="income-amount">${fmtCurrency(amount)}</span>
            </div>
            <div class="income-details">
              ${inc.fed_income_tax_withheld ? `<div class="income-detail"><span class="dl">Fed Withheld</span><span class="dv">${fmtCurrency(inc.fed_income_tax_withheld)}</span></div>` : ''}
              ${inc.state_tax_withheld ? `<div class="income-detail"><span class="dl">State Withheld</span><span class="dv">${fmtCurrency(inc.state_tax_withheld)}</span></div>` : ''}
              ${inc.qualified_dividends != null ? `<div class="income-detail"><span class="dl">Qualified Div</span><span class="dv">${fmtCurrency(inc.qualified_dividends)}</span></div>` : ''}
            </div>
            <div style="margin-top:10px;text-align:right">${statusBadge}</div>
          </div>`;
      }
    }).join('');
}

// ── GAP ANALYSIS (Step 4) ──
function renderGapQuestions() {
  if (typeof getGapQuestions !== 'function') return;

  const questions = getGapQuestions(taxSession);
  const container = document.getElementById('gap-questions');
  const emptyEl = document.getElementById('gap-empty');

  if (questions.length === 0) {
    container.innerHTML = '';
    emptyEl.style.display = '';
    return;
  }
  emptyEl.style.display = 'none';

  container.innerHTML = questions.map(rule => {
    const followUpHtml = buildFollowUpHtml(rule);
    return `
      <div class="toggle-row" data-gap-id="${rule.id}">
        <div>
          <div class="toggle-label">${rule.question}</div>
          <div class="toggle-sublabel">${rule.hint}</div>
        </div>
        <div class="toggle-btn">
          <button data-val="yes" onclick="answerGap('${rule.id}', true, this)">YES</button>
          <button data-val="no" onclick="answerGap('${rule.id}', false, this)">NO</button>
        </div>
      </div>
      <div class="toggle-followup" id="followup-${rule.id}">
        ${followUpHtml}
      </div>`;
  }).join('');

  // Restore previous answers
  for (const [id, val] of Object.entries(taxSession.gapAnswers)) {
    const row = container.querySelector(`[data-gap-id="${id}"]`);
    if (!row) continue;
    const btn = row.querySelector(`button[data-val="${val ? 'yes' : 'no'}"]`);
    if (btn) {
      btn.classList.add('active');
      row.classList.toggle('active', val);
      if (val) {
        const followup = document.getElementById(`followup-${id}`);
        if (followup) followup.classList.add('visible');
      }
    }
  }
}

function buildFollowUpHtml(rule) {
  if (rule.followUp === 'amount') {
    const val = taxSession.manualEntries[rule.field] || '';
    return `
      <div class="input-group" style="margin-bottom:0">
        <div class="input-label">${rule.placeholder || 'Amount'}</div>
        <input type="number" class="input-field money" value="${val}" placeholder="0"
          oninput="updateManualEntry('${rule.field}', this.value)">
      </div>`;
  }
  if (rule.followUp === 'upload') {
    return `
      <div class="upload-mini">
        <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onchange="handleGapUpload('${rule.docType}', this)">
        <div class="upload-mini-text">Upload ${rule.docType} document</div>
      </div>`;
  }
  if (rule.followUp === 'amount_or_upload') {
    const val = taxSession.manualEntries[rule.field] || '';
    return `
      <div class="input-group">
        <div class="input-label">${rule.placeholder || 'Amount'}</div>
        <input type="number" class="input-field money" value="${val}" placeholder="0"
          oninput="updateManualEntry('${rule.field}', this.value)">
      </div>
      <div class="upload-mini">
        <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onchange="handleGapUpload('${rule.docType}', this)">
        <div class="upload-mini-text">Or upload ${rule.docType} document</div>
      </div>`;
  }
  // yesno — no follow-up input needed
  return '';
}

function answerGap(id, value, btnEl) {
  taxSession.gapAnswers[id] = value;

  // Toggle button state
  const row = btnEl.closest('.toggle-row');
  row.querySelectorAll('.toggle-btn button').forEach(b => b.classList.remove('active'));
  btnEl.classList.add('active');
  row.classList.toggle('active', value);

  // Show/hide follow-up
  const followup = document.getElementById(`followup-${id}`);
  if (followup) {
    followup.classList.toggle('visible', value);
  }

  saveSession();
}

function updateManualEntry(field, value) {
  taxSession.manualEntries[field] = parseFloat(value) || 0;
  saveSession();
}

function handleGapUpload(docType, input) {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    const doc = {
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      type: docType,
      status: 'uploading',
      extractionStatus: {},
      file: file,
    };
    taxSession.documents.push(doc);
    renderDocList();
    processDocument(doc);

    const miniText = input.parentElement.querySelector('.upload-mini-text');
    if (miniText) miniText.textContent = `Uploading ${file.name}…`;
  }
}

// ── DEDUCTIONS & CREDITS (Step 5) ──
function selectDeduction(type) {
  taxSession.deductionType = type;
  document.querySelectorAll('.deduction-option').forEach(el => {
    el.classList.toggle('selected', el.dataset.value === type);
  });
  document.getElementById('itemized-fields').classList.toggle('visible', type === 'itemized');
  saveSession();
}

function updateItemized() {
  taxSession.itemized.mortgage = parseFloat(document.getElementById('ded-mortgage').value) || 0;
  taxSession.itemized.salt = parseFloat(document.getElementById('ded-salt').value) || 0;
  taxSession.itemized.charitable = parseFloat(document.getElementById('ded-charitable').value) || 0;
  taxSession.itemized.medical = parseFloat(document.getElementById('ded-medical').value) || 0;
  updateItemizedTotal();
  saveSession();
}

function updateItemizedTotal() {
  const salt = Math.min(taxSession.itemized.salt, 10000); // SALT cap
  const total = taxSession.itemized.mortgage + salt + taxSession.itemized.charitable + taxSession.itemized.medical;
  document.getElementById('item-ded-amount').textContent = fmtCurrency(total);
}

function updateDeductionsView() {
  // Get constants
  const c = getTaxConstants(taxSession.taxYear, getStateId(), taxSession.filingStatus);
  const stdDed = c.fed.stdDeduction;

  document.getElementById('std-ded-amount').textContent = fmtCurrency(stdDed);

  // Pre-populate itemized from gap analysis + docs
  if (taxSession.manualEntries.mortgageInterest) {
    taxSession.itemized.mortgage = taxSession.manualEntries.mortgageInterest;
    document.getElementById('ded-mortgage').value = taxSession.itemized.mortgage;
  }
  if (taxSession.manualEntries.saltExtra) {
    taxSession.itemized.salt = taxSession.manualEntries.saltExtra;
    document.getElementById('ded-salt').value = taxSession.itemized.salt;
  }
  if (taxSession.manualEntries.charitableDonations) {
    taxSession.itemized.charitable = taxSession.manualEntries.charitableDonations;
    document.getElementById('ded-charitable').value = taxSession.itemized.charitable;
  }

  // Also pull from 1098 if uploaded
  const mortgage1098 = taxSession.incomes.find(i => i.doc_type === '1098');
  if (mortgage1098 && mortgage1098.mortgage_interest) {
    taxSession.itemized.mortgage = mortgage1098.mortgage_interest;
    document.getElementById('ded-mortgage').value = taxSession.itemized.mortgage;
  }

  updateItemizedTotal();
  const itemTotal = taxSession.itemized.mortgage + Math.min(taxSession.itemized.salt, 10000) +
    taxSession.itemized.charitable + taxSession.itemized.medical;

  // Show recommendation
  const stdRec = document.getElementById('std-recommended');
  const itemRec = document.getElementById('item-recommended');
  if (itemTotal > stdDed) {
    stdRec.style.display = 'none';
    itemRec.style.display = '';
    taxSession.deductionType = 'itemized';
  } else {
    stdRec.style.display = '';
    itemRec.style.display = 'none';
    taxSession.deductionType = 'standard';
  }
  document.querySelectorAll('.deduction-option').forEach(el => {
    el.classList.toggle('selected', el.dataset.value === taxSession.deductionType);
  });
  document.getElementById('itemized-fields').classList.toggle('visible', taxSession.deductionType === 'itemized');

  // Update credits
  updateCreditsView();
}

function updateCreditsView() {
  const c = getTaxConstants(taxSession.taxYear, getStateId(), taxSession.filingStatus);

  // CTC
  const ctcPerChild = c.fed.ctcAmount || 2000;
  const ctcTotal = taxSession.childrenUnder17 * ctcPerChild;
  document.getElementById('ctc-amount').textContent = fmtCurrency(ctcTotal);
  document.getElementById('credit-ctc').classList.toggle('active', ctcTotal > 0);

  // Education
  let eduCredit = 0;
  if (taxSession.gapAnswers.hasTuition && taxSession.manualEntries.tuitionPaid) {
    eduCredit = Math.min(taxSession.manualEntries.tuitionPaid, 2500); // AOTC max
  }
  document.getElementById('edu-credit-amount').textContent = fmtCurrency(eduCredit);
  document.getElementById('credit-education').classList.toggle('active', eduCredit > 0);

  // CA Renter's credit
  const renterCredit = (taxSession.stateOfResidence === 'CA' && taxSession.gapAnswers.isRenter)
    ? (c.state ? (c.state.rentersCreditAmount ? c.state.rentersCreditAmount[taxSession.filingStatus === 'mfj' ? 'mfj' : 'single'] : 60) : 60)
    : 0;
  document.getElementById('renter-credit-amount').textContent = fmtCurrency(renterCredit);
  document.getElementById('credit-renter').classList.toggle('active', renterCredit > 0);
  document.getElementById('credit-renter').style.display = taxSession.stateOfResidence === 'CA' ? '' : 'none';

  // EV credit
  const evCredit = taxSession.gapAnswers.hasEV ? 7500 : 0;
  document.getElementById('ev-credit-amount').textContent = fmtCurrency(evCredit);
  document.getElementById('credit-ev').classList.toggle('active', evCredit > 0);

  // Childcare credit
  let childcareCredit = 0;
  if (taxSession.manualEntries.childcareExpenses) {
    const maxExpense = taxSession.childrenUnder17 >= 2 ? 6000 : 3000;
    childcareCredit = Math.round(Math.min(taxSession.manualEntries.childcareExpenses, maxExpense) * 0.20);
  }
  document.getElementById('childcare-credit-amount').textContent = fmtCurrency(childcareCredit);
  document.getElementById('credit-childcare').classList.toggle('active', childcareCredit > 0);

  // Store for computation
  taxSession.credits = { ctc: ctcTotal, education: eduCredit, renter: renterCredit, ev: evCredit, childcare: childcareCredit };
  saveSession();
}

// ── TAX COMPUTATION (Step 6) ──
function computeAndRenderTaxes() {
  const s = taxSession;
  const stateId = getStateId();
  const c = getTaxConstants(s.taxYear, stateId, s.filingStatus);
  const fed = c.fed;
  const sc = c.state;

  // ── Aggregate income ──
  const totalW2 = s.incomes.filter(i => i.doc_type === 'W-2').reduce((sum, i) => sum + (i.wages || 0), 0);
  const totalNEC = s.incomes.filter(i => i.doc_type === '1099-NEC').reduce((sum, i) => sum + (i.nonemployee_compensation || 0), 0);
  const totalINT = s.incomes.filter(i => i.doc_type === '1099-INT').reduce((sum, i) => sum + (i.interest_income || 0), 0);
  const totalDIV = s.incomes.filter(i => i.doc_type === '1099-DIV').reduce((sum, i) => sum + (i.ordinary_dividends || 0), 0);
  const totalCapGains = (s.manualEntries.capitalGains || 0);
  const otherIncome = (s.manualEntries.otherIncome || 0);
  const totalIncome = totalW2 + totalNEC + totalINT + totalDIV + totalCapGains + otherIncome;

  // ── Self-employment tax ──
  const seTaxableIncome = totalNEC * 0.9235;
  const seTax = totalNEC > 0 ? Math.round(seTaxableIncome * (fed.seTaxRate || 0.153)) : 0;
  const seDeduction = Math.floor(seTax * 0.5);

  // ── Adjustments ──
  let adjustments = seDeduction;
  if (s.manualEntries.contribution401k) adjustments += Math.min(s.manualEntries.contribution401k, fed.contrib401kLimit || 23500);
  if (s.manualEntries.contributionIRA) adjustments += Math.min(s.manualEntries.contributionIRA, fed.contribIRALimit || 7000);
  if (s.manualEntries.contributionHSA) adjustments += Math.min(s.manualEntries.contributionHSA, fed.contribHSASelf || 4300);
  if (s.manualEntries.studentLoanInterest) adjustments += Math.min(s.manualEntries.studentLoanInterest, fed.studentLoanMax || 2500);
  if (s.manualEntries.seHealthInsurance) adjustments += s.manualEntries.seHealthInsurance;
  if (s.gapAnswers.isEducator) adjustments += fed.educatorExpense || 300;

  // Also include 401k from W-2 box 12 code D
  const w2_401k = s.incomes.filter(i => i.doc_type === 'W-2').reduce((sum, i) => {
    if (i.box12_codes) {
      return sum + i.box12_codes.filter(c => c.code === 'D').reduce((s2, c) => s2 + (c.amount || 0), 0);
    }
    return sum;
  }, 0);
  // Don't double-count: only add if no manual entry
  if (w2_401k > 0 && !s.manualEntries.contribution401k) {
    // W-2 box 12D is already excluded from taxable wages, so no adjustment needed
  }

  const agi = totalIncome - adjustments;

  // ── Deduction ──
  const stdDeduction = fed.stdDeduction;
  let itemizedTotal = 0;
  if (s.deductionType === 'itemized') {
    itemizedTotal = s.itemized.mortgage + Math.min(s.itemized.salt, fed.saltCap || 10000) +
      s.itemized.charitable + s.itemized.medical;
  }
  const deduction = s.deductionType === 'itemized' ? itemizedTotal : stdDeduction;

  // ── Home office deduction (SE only) ──
  let homeOfficeDeduction = 0;
  if (s.manualEntries.homeOfficeSqft && totalNEC > 0) {
    homeOfficeDeduction = Math.min(s.manualEntries.homeOfficeSqft * 5, 1500);
  }

  // ── Business mileage (SE only) ──
  let mileageDeduction = 0;
  if (s.manualEntries.businessMiles && totalNEC > 0) {
    mileageDeduction = Math.round(s.manualEntries.businessMiles * (fed.mileageRate || 0.70));
  }

  const taxableIncome = Math.max(0, agi - deduction - homeOfficeDeduction - mileageDeduction);

  // ── Federal tax ──
  const fedIncomeTax = computeTaxFromBrackets(taxableIncome, fed.brackets);

  // ── Credits ──
  const totalCredits = (s.credits.ctc || 0) + (s.credits.education || 0) + (s.credits.ev || 0) + (s.credits.childcare || 0);

  const fedTaxAfterCredits = Math.max(0, fedIncomeTax - totalCredits);
  const totalFedTax = fedTaxAfterCredits + seTax;

  // ── Withholding ──
  const totalFedWithheld = s.incomes.reduce((sum, i) => sum + (i.fed_income_tax_withheld || 0), 0);
  const fedResult = totalFedWithheld - totalFedTax;

  // ── State ──
  const totalStateWithheld = s.incomes.reduce((sum, i) => sum + (i.state_income_tax_withheld || i.state_tax_withheld || 0), 0);

  const filing = {
    filingStatus: s.filingStatus,
    totalW2Wages: totalW2,
    totalNEC,
    totalInterest: totalINT,
    totalDividends: totalDIV,
    capitalGains: totalCapGains,
    otherIncome,
    totalIncome,
    adjustments,
    agi,
    deduction,
    deductionType: s.deductionType,
    standardDeduction: stdDeduction,
    taxableIncome,
    fedIncomeTax,
    seTax,
    totalCredits,
    fedTaxAfterCredits,
    totalFedTax,
    totalFedWithheld,
    fedResult,
    totalStateWithheld,
    homeOfficeDeduction,
    mileageDeduction,
  };

  // CA computation
  if (stateId === 'california' && sc) {
    const caStdDed = sc.stdDeduction;
    filing.caStdDeduction = caStdDed;
    filing.caDeduction = caStdDed; // CA doesn't have itemized in our model
    const caTaxable = Math.max(0, agi - caStdDed);
    filing.caTaxableIncome = caTaxable;
    let caTax = computeTaxFromBrackets(caTaxable, sc.brackets);
    let mhTax = 0;
    if (caTaxable > sc.mentalHealthThreshold) {
      mhTax = Math.round((caTaxable - sc.mentalHealthThreshold) * sc.mentalHealthRate);
    }
    filing.caBaseTax = caTax;
    filing.caMHTax = mhTax;
    const caCredits = (s.credits.renter || 0);
    filing.caCredits = caCredits;
    filing.caTax = caTax + mhTax - caCredits;
    filing.caResult = totalStateWithheld - filing.caTax;
  }

  // NY computation
  if (stateId === 'newYork' && sc) {
    const nyStdDed = sc.stdDeduction;
    filing.nyStdDeduction = nyStdDed;
    filing.nyDeduction = nyStdDed;
    const nyTaxable = Math.max(0, agi - nyStdDed);
    filing.nyTaxableIncome = nyTaxable;
    filing.nyTax = computeTaxFromBrackets(nyTaxable, sc.brackets);
    filing.nyCredits = 0;
    filing.nyResult = totalStateWithheld - filing.nyTax;
  }

  taxSession.filing = filing;

  // ── Render ──
  renderFilingCards(filing, stateId);
  runRulesCheck(filing, stateId);
  saveSession();
}

function renderFilingCards(f, stateId) {
  // Result banner
  const totalResult = f.fedResult + (f.caResult || 0) + (f.nyResult || 0);
  const resultEl = document.getElementById('result-amount');
  const resultLabel = document.getElementById('result-label');
  const resultDetail = document.getElementById('result-detail');

  if (totalResult >= 0) {
    resultEl.textContent = '+' + fmtCurrency(totalResult);
    resultEl.className = 'result-amount refund';
    resultLabel.textContent = 'Estimated Total Refund';
  } else {
    resultEl.textContent = fmtCurrency(Math.abs(totalResult));
    resultEl.className = 'result-amount owed';
    resultLabel.textContent = 'Estimated Amount Owed';
  }

  const details = [`Federal: ${f.fedResult >= 0 ? '+' : ''}${fmtCurrency(f.fedResult)}`];
  if (f.caResult !== undefined) details.push(`CA: ${f.caResult >= 0 ? '+' : ''}${fmtCurrency(f.caResult)}`);
  if (f.nyResult !== undefined) details.push(`NY: ${f.nyResult >= 0 ? '+' : ''}${fmtCurrency(f.nyResult)}`);
  resultDetail.textContent = details.join('  |  ');

  // Federal card
  setVal('fed-wages', fmtCurrency(f.totalW2Wages));
  setVal('fed-other', fmtCurrency(f.totalIncome - f.totalW2Wages));
  setVal('fed-income', fmtCurrency(f.totalIncome));
  setVal('fed-adj', f.adjustments > 0 ? '−' + fmtCurrency(f.adjustments) : '$0');
  setVal('fed-agi', fmtCurrency(f.agi));
  setVal('fed-deduction', `${f.deductionType === 'itemized' ? 'Itemized' : 'Standard'} (${fmtCurrency(f.deduction)})`);
  setVal('fed-taxable', fmtCurrency(f.taxableIncome));
  setVal('fed-income-tax', fmtCurrency(f.fedIncomeTax));
  setVal('fed-se-tax', fmtCurrency(f.seTax));
  setVal('fed-credits', f.totalCredits > 0 ? '−' + fmtCurrency(f.totalCredits) : '$0');
  setVal('fed-total-tax', fmtCurrency(f.totalFedTax));
  setVal('fed-withheld', fmtCurrency(f.totalFedWithheld));
  const fedResultEl = document.getElementById('fed-result');
  fedResultEl.textContent = f.fedResult >= 0 ? '+' + fmtCurrency(f.fedResult) : '−' + fmtCurrency(Math.abs(f.fedResult));
  fedResultEl.className = 'value ' + (f.fedResult >= 0 ? 'refund' : 'owed');

  // CA card
  const caCard = document.getElementById('ca-card');
  if (stateId === 'california' && f.caTax !== undefined) {
    caCard.style.display = '';
    setVal('ca-agi', fmtCurrency(f.agi));
    setVal('ca-deduction', fmtCurrency(f.caDeduction || f.caStdDeduction));
    setVal('ca-taxable', fmtCurrency(f.caTaxableIncome));
    setVal('ca-tax', fmtCurrency(f.caBaseTax));
    setVal('ca-mh-tax', fmtCurrency(f.caMHTax || 0));
    setVal('ca-credits', f.caCredits > 0 ? '−' + fmtCurrency(f.caCredits) : '$0');
    setVal('ca-total-tax', fmtCurrency(f.caTax));
    setVal('ca-withheld', fmtCurrency(f.totalStateWithheld));
    const caResultEl = document.getElementById('ca-result');
    caResultEl.textContent = f.caResult >= 0 ? '+' + fmtCurrency(f.caResult) : '−' + fmtCurrency(Math.abs(f.caResult));
    caResultEl.className = 'value ' + (f.caResult >= 0 ? 'refund' : 'owed');
  } else {
    caCard.style.display = 'none';
  }

  // NY card
  const nyCard = document.getElementById('ny-card');
  if (stateId === 'newYork' && f.nyTax !== undefined) {
    nyCard.style.display = '';
    setVal('ny-agi', fmtCurrency(f.agi));
    setVal('ny-deduction', fmtCurrency(f.nyDeduction || f.nyStdDeduction));
    setVal('ny-taxable', fmtCurrency(f.nyTaxableIncome));
    setVal('ny-tax', fmtCurrency(f.nyTax));
    setVal('ny-credits', '$0');
    setVal('ny-total-tax', fmtCurrency(f.nyTax));
    setVal('ny-withheld', fmtCurrency(f.totalStateWithheld));
    const nyResultEl = document.getElementById('ny-result');
    nyResultEl.textContent = f.nyResult >= 0 ? '+' + fmtCurrency(f.nyResult) : '−' + fmtCurrency(Math.abs(f.nyResult));
    nyResultEl.className = 'value ' + (f.nyResult >= 0 ? 'refund' : 'owed');
  } else {
    nyCard.style.display = 'none';
  }

  // Adjust filing grid columns
  const visibleCards = document.querySelectorAll('#filing-grid .filing-card:not([style*="display: none"])').length;
  document.getElementById('filing-grid').style.gridTemplateColumns =
    visibleCards >= 3 ? 'repeat(3, 1fr)' : visibleCards === 2 ? '1fr 1fr' : '1fr';
}

function runRulesCheck(filing, stateId) {
  if (typeof runRulesEngine !== 'function') return;

  const rulesState = {
    documents: taxSession.documents,
    incomes: taxSession.incomes,
    filing: filing,
    taxYear: taxSession.taxYear,
    stateId: stateId,
  };

  try {
    const { results, complianceSummary, savingsSummary } = runRulesEngine(rulesState);
    taxSession.rulesResults = { results, complianceSummary, savingsSummary };

    // Show rules panel
    const panel = document.getElementById('rules-panel');
    panel.style.display = '';

    document.getElementById('rp-passed').textContent = complianceSummary.passed;
    document.getElementById('rp-failed').textContent = complianceSummary.failed;
    document.getElementById('rp-warnings').textContent = complianceSummary.warnings;
    document.getElementById('rp-skipped').textContent = (results.length - complianceSummary.passed - complianceSummary.failed - complianceSummary.warnings);

    // Savings opportunities
    const detail = document.getElementById('rules-detail');
    const savings = results.filter(r => r.guarantee === 'savings' && (r.status === 'warn' || r.status === 'fail'));
    if (savings.length > 0) {
      detail.innerHTML = '<div style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--teal)">Potential Savings</div>' +
        savings.map(r => `<div style="font-size:12px;color:var(--text-dim);padding:4px 0;border-bottom:1px solid var(--border)">• ${r.detail || r.name}</div>`).join('');
    } else {
      detail.innerHTML = '<div style="font-size:13px;color:var(--text-muted)">No additional savings opportunities found.</div>';
    }

    // Save for backward compat
    try {
      localStorage.setItem('taxRulesResults', JSON.stringify({ results, complianceSummary, savingsSummary, timestamp: Date.now() }));
      localStorage.setItem('taxState', JSON.stringify(rulesState));
    } catch (e) { /* ignore */ }
  } catch (e) {
    console.warn('Rules engine error:', e);
  }
}

function toggleRulesPanel() {
  document.getElementById('rules-panel').classList.toggle('open');
}

// ── FORM GENERATION (Step 7) ──
function updateFormGenList() {
  const stateId = getStateId();
  document.getElementById('gen-ca540').style.display = stateId === 'california' ? '' : 'none';
  document.getElementById('gen-ny201').style.display = stateId === 'newYork' ? '' : 'none';

  // Reset statuses
  for (const id of ['gen-1040-status', 'gen-ca540-status', 'gen-ny201-status']) {
    const el = document.getElementById(id);
    if (el) { el.textContent = 'Pending'; el.className = 'form-gen-status pending'; }
  }
  for (const id of ['gen-1040', 'gen-ca540', 'gen-ny201']) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('done');
  }
}

async function generateAllForms() {
  const btn = document.getElementById('generate-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Generating…';

  taxSession.generatedForms = [];

  // Ensure computation is done
  if (!taxSession.filing) computeAndRenderTaxes();

  // 1040
  try {
    setGenStatus('gen-1040', 'gen-1040-status', 'generating', 'Generating…');
    const f1040 = await fill1040(taxSession);
    if (f1040) {
      taxSession.generatedForms.push(f1040);
      setGenStatus('gen-1040', 'gen-1040-status', 'done', '✓ Ready');
    } else {
      setGenStatus('gen-1040', 'gen-1040-status', 'done', '✓ Summary');
    }
  } catch (e) {
    console.error('1040 generation error:', e);
    setGenStatus('gen-1040', 'gen-1040-status', 'pending', 'Error');
  }

  // CA 540
  const stateId = getStateId();
  if (stateId === 'california') {
    try {
      setGenStatus('gen-ca540', 'gen-ca540-status', 'generating', 'Generating…');
      const fCA = await fillCA540(taxSession);
      if (fCA) {
        taxSession.generatedForms.push(fCA);
        setGenStatus('gen-ca540', 'gen-ca540-status', 'done', '✓ Ready');
      }
    } catch (e) {
      console.error('CA 540 generation error:', e);
      setGenStatus('gen-ca540', 'gen-ca540-status', 'pending', 'Error');
    }
  }

  // NY IT-201
  if (stateId === 'newYork') {
    try {
      setGenStatus('gen-ny201', 'gen-ny201-status', 'generating', 'Generating…');
      const fNY = await fillNYIT201(taxSession);
      if (fNY) {
        taxSession.generatedForms.push(fNY);
        setGenStatus('gen-ny201', 'gen-ny201-status', 'done', '✓ Ready');
      }
    } catch (e) {
      console.error('NY IT-201 generation error:', e);
      setGenStatus('gen-ny201', 'gen-ny201-status', 'pending', 'Error');
    }
  }

  btn.disabled = false;
  btn.innerHTML = 'Generate Tax Forms';

  // Auto-advance to step 8 if forms were generated
  if (taxSession.generatedForms.length > 0) {
    setTimeout(() => goToStep(8), 500);
  }
}

function setGenStatus(itemId, statusId, status, text) {
  const item = document.getElementById(itemId);
  const statusEl = document.getElementById(statusId);
  if (statusEl) {
    statusEl.textContent = text;
    statusEl.className = 'form-gen-status ' + status;
  }
  if (item) {
    item.classList.toggle('done', status === 'done');
  }
}

// ── OUTPUT (Step 8) ──
function renderFormDownloads() {
  const container = document.getElementById('form-downloads');
  if (taxSession.generatedForms.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">No forms generated yet. Go back to Step 7 to generate your forms.</div>';
    return;
  }

  container.innerHTML = taxSession.generatedForms.map((form, i) => `
    <div class="form-download-row">
      <div>
        <div class="form-download-name">${form.name}</div>
        <div style="font-size:11px;color:var(--text-muted)">${form.isSummary ? 'Summary PDF (official form not available)' : 'Filled official form'}</div>
      </div>
      <a class="form-download-btn" href="${form.url}" download="${form.name}">Download</a>
    </div>
  `).join('');
}

function downloadAllForms() {
  taxSession.generatedForms.forEach(form => downloadForm(form));
}

// ── HELPERS ──
function getStateId() {
  const stMap = { CA: 'california', NY: 'newYork' };
  return stMap[taxSession.stateOfResidence] || null;
}

function setVal(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function fmtCurrency(n) {
  if (n == null || isNaN(n)) return '$0';
  return '$' + Math.round(Math.abs(n)).toLocaleString();
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

// ── RESTORE UI STATE ON LOAD ──
(function restoreUI() {
  const s = taxSession;

  // Restore option cards
  restoreOptionGrid('taxYear', String(s.taxYear));
  restoreOptionGrid('filingStatus', s.filingStatus);
  if (s.stateOfResidence) restoreOptionGrid('stateOfResidence', s.stateOfResidence);

  // Restore text inputs
  ['firstName', 'lastName', 'ssnLast4'].forEach(id => {
    const el = document.getElementById(id);
    if (el && s[id]) el.value = s[id];
  });
  if (s.childrenUnder17) document.getElementById('childrenUnder17').value = s.childrenUnder17;
  if (s.otherDependents) document.getElementById('otherDependents').value = s.otherDependents;

  // Restore itemized
  if (s.itemized.mortgage) document.getElementById('ded-mortgage').value = s.itemized.mortgage;
  if (s.itemized.salt) document.getElementById('ded-salt').value = s.itemized.salt;
  if (s.itemized.charitable) document.getElementById('ded-charitable').value = s.itemized.charitable;
  if (s.itemized.medical) document.getElementById('ded-medical').value = s.itemized.medical;

  // Render incomes if present
  if (s.incomes.length > 0) renderIncomes();

  // Restore to saved step
  if (s.currentStep > 1) {
    goToStep(s.currentStep);
  }
})();

function restoreOptionGrid(field, value) {
  const grid = document.querySelector(`.option-grid[data-field="${field}"]`);
  if (!grid) return;
  grid.querySelectorAll('.option-card').forEach(card => {
    card.classList.toggle('selected', card.dataset.value === value);
  });
}
