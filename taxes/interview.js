/**
 * Tax Interview — Logic, state management, and rules integration
 */

// ── STATE ──
const interviewState = {
  // Section 1
  taxYear: 2025,
  // Section 2
  filingStatus: 'single',
  // Section 3
  firstName: '',
  lastName: '',
  ssnLast4: '',
  stateOfResidence: null, // 'CA', 'NY', 'other'
  // Section 4
  hasChildrenUnder17: false,
  childCount: 0,
  hasOtherDependents: false,
  // Section 5
  hasW2: false,
  has1099NEC: false,
  necEntries: [], // [{ payerName, compensation, withholding }]
  has1099INT: false,
  interestIncome: 0,
  has1099DIV: false,
  dividendIncome: 0,
  // Section 6
  has401k: false,
  hasIRA: false,
  hasHSA: false,
  hasStudentLoan: false,
  hasSEHealthInsurance: false,
  isEducator: false,
  // Section 7
  deductionType: 'standard',
  mortgageInterest: 0,
  saltAmount: 0,
  charitableAmount: 0,
  hasHomeOffice: false,
  hasBusinessMileage: false,
  // Section 8
  hasEducationExpenses: false,
  isRenter: false,
  hasEV: false,
  hasEnergyImprovements: false,
};

let currentSection = 1;
const TOTAL_SECTIONS = 9;

// ── LOAD SAVED STATE ──
(function loadSaved() {
  try {
    const saved = localStorage.getItem('taxInterviewState');
    if (saved) {
      const parsed = JSON.parse(saved);
      Object.assign(interviewState, parsed);
      // Restore UI from state
      restoreUI();
    }
  } catch (e) { /* ignore */ }
})();

function saveState() {
  try {
    localStorage.setItem('taxInterviewState', JSON.stringify(interviewState));
  } catch (e) { /* ignore */ }
}

// ── OPTION CARD SELECTION ──
document.querySelectorAll('.option-grid').forEach(grid => {
  const field = grid.dataset.field;
  grid.querySelectorAll('.option-card').forEach(card => {
    card.addEventListener('click', () => {
      grid.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      const value = card.dataset.value;

      if (field === 'taxYear') {
        interviewState.taxYear = parseInt(value);
        localStorage.setItem('taxYear', value);
      } else if (field === 'filingStatus') {
        interviewState.filingStatus = value;
        localStorage.setItem('taxFilingStatus', value);
        updateStdDeductionDisplay();
      } else if (field === 'stateOfResidence') {
        interviewState.stateOfResidence = value;
        const stMap = { CA: 'california', NY: 'newYork' };
        localStorage.setItem('taxStateId', stMap[value] || '');
      } else if (field === 'deductionType') {
        interviewState.deductionType = value;
        const itemizedEl = document.getElementById('itemized-details');
        if (itemizedEl) itemizedEl.style.display = value === 'itemized' ? '' : 'none';
      }
      saveState();
    });
  });
});

// ── TOGGLE BUTTONS ──
document.querySelectorAll('.toggle-row').forEach(row => {
  const field = row.dataset.field;
  row.querySelectorAll('.toggle-btn button').forEach(btn => {
    btn.addEventListener('click', () => {
      row.querySelectorAll('.toggle-btn button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const isYes = btn.dataset.val === 'yes';
      row.classList.toggle('active', isYes);

      interviewState[field] = isYes;

      // Show/hide sub-sections
      if (field === 'hasChildrenUnder17') {
        document.getElementById('childCount-wrapper').style.display = isYes ? '' : 'none';
      }
      if (field === 'has1099NEC') {
        document.getElementById('nec-cards').style.display = isYes ? '' : 'none';
        if (isYes && interviewState.necEntries.length === 0) {
          addNECCard();
        }
      }
      if (field === 'has1099INT') {
        document.getElementById('int-entry').style.display = isYes ? '' : 'none';
      }
      if (field === 'has1099DIV') {
        document.getElementById('div-entry').style.display = isYes ? '' : 'none';
      }

      saveState();
    });
  });
});

// ── INPUT FIELDS ──
['firstName', 'lastName', 'ssnLast4'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('input', () => {
      interviewState[id] = el.value;
      saveState();
    });
  }
});

['interestIncome', 'dividendIncome', 'mortgageInterest', 'saltAmount', 'charitableAmount'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('input', () => {
      interviewState[id] = parseFloat(el.value) || 0;
      saveState();
    });
  }
});

const childCountEl = document.getElementById('childCount');
if (childCountEl) {
  childCountEl.addEventListener('input', () => {
    interviewState.childCount = parseInt(childCountEl.value) || 0;
    saveState();
  });
}

// ── 1099-NEC REPEATING CARDS ──
function addNECCard(data) {
  const entry = data || { payerName: '', compensation: 0, withholding: 0 };
  const index = interviewState.necEntries.length;
  interviewState.necEntries.push(entry);
  renderNECCards();
  saveState();
}

function removeNECCard(index) {
  interviewState.necEntries.splice(index, 1);
  renderNECCards();
  saveState();
}

function renderNECCards() {
  const container = document.getElementById('nec-cards-list');
  container.innerHTML = interviewState.necEntries.map((entry, i) => `
    <div class="income-entry-card" data-nec-index="${i}">
      <div class="card-header">
        <div class="card-title">
          <span class="type-badge">1099-NEC</span>
          1099-NEC #${i + 1}
        </div>
        ${interviewState.necEntries.length > 1 ? `<button class="remove-card-btn" onclick="removeNECCard(${i})">&times;</button>` : ''}
      </div>
      <div class="input-group">
        <div class="input-label">Payer Name</div>
        <input type="text" class="input-field" value="${entry.payerName}" placeholder="Company name"
          oninput="updateNECEntry(${i}, 'payerName', this.value)">
      </div>
      <div class="input-row">
        <div class="input-group">
          <div class="input-label">Compensation (Box 1)</div>
          <input type="number" class="input-field money" value="${entry.compensation || ''}" placeholder="0"
            oninput="updateNECEntry(${i}, 'compensation', parseFloat(this.value)||0)">
        </div>
        <div class="input-group">
          <div class="input-label">Federal Tax Withheld (Box 4)</div>
          <input type="number" class="input-field money" value="${entry.withholding || ''}" placeholder="0"
            oninput="updateNECEntry(${i}, 'withholding', parseFloat(this.value)||0)">
        </div>
      </div>
      <div class="upload-mini">
        <input type="file" accept=".pdf,.png,.jpg,.jpeg" onchange="handleNECUpload(${i}, this)">
        <div class="upload-mini-text">Or drop a 1099-NEC image here</div>
      </div>
    </div>
  `).join('');
}

function updateNECEntry(index, field, value) {
  if (interviewState.necEntries[index]) {
    interviewState.necEntries[index][field] = value;
    saveState();
  }
}

function handleNECUpload(index, input) {
  // For now, just note that a file was attached
  if (input.files && input.files[0]) {
    const file = input.files[0];
    if (interviewState.necEntries[index]) {
      interviewState.necEntries[index].fileName = file.name;
      interviewState.necEntries[index].hasUpload = true;
      saveState();
    }
    // The actual extraction happens on the dashboard
    const miniText = input.parentElement.querySelector('.upload-mini-text');
    if (miniText) miniText.textContent = file.name;
  }
}

document.getElementById('add-nec-btn').addEventListener('click', () => addNECCard());

// ── STANDARD DEDUCTION DISPLAY ──
function updateStdDeductionDisplay() {
  const el = document.getElementById('std-ded-amount');
  if (!el) return;
  if (typeof getTaxConstants === 'function') {
    const c = getTaxConstants(interviewState.taxYear, null, interviewState.filingStatus);
    const amt = c.fed.stdDeduction;
    el.textContent = '$' + amt.toLocaleString() + ' (' + interviewState.filingStatus + ')';
  }
}

// ── NAVIGATION ──
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const stepIndicator = document.getElementById('step-indicator');

function goToSection(n) {
  if (n < 1 || n > TOTAL_SECTIONS) return;
  currentSection = n;

  // Update sections
  document.querySelectorAll('.interview-section').forEach(s => {
    s.classList.toggle('active', parseInt(s.dataset.section) === n);
  });

  // Update progress bar
  document.querySelectorAll('.progress-step').forEach(step => {
    const sn = parseInt(step.dataset.step);
    step.classList.remove('done', 'active');
    if (sn < n) step.classList.add('done');
    else if (sn === n) step.classList.add('active');
  });

  // Update nav buttons
  prevBtn.disabled = n === 1;
  nextBtn.textContent = n === TOTAL_SECTIONS - 1 ? 'Review \u2192' : n === TOTAL_SECTIONS ? '' : 'Next \u2192';
  nextBtn.style.display = n === TOTAL_SECTIONS ? 'none' : '';
  stepIndicator.textContent = n + ' / ' + TOTAL_SECTIONS;

  // Build review on section 9
  if (n === TOTAL_SECTIONS) {
    buildReview();
  }

  // Update std deduction display when entering section 7
  if (n === 7) {
    updateStdDeductionDisplay();
  }

  saveState();
}

prevBtn.addEventListener('click', () => goToSection(currentSection - 1));
nextBtn.addEventListener('click', () => goToSection(currentSection + 1));

// ── REVIEW BUILDER ──
function buildReview() {
  const s = interviewState;
  const stateNames = { CA: 'California', NY: 'New York', other: 'Other' };
  const statusNames = { single: 'Single', mfj: 'Married Filing Jointly', mfs: 'Married Filing Separately', hoh: 'Head of Household', qss: 'Qualifying Surviving Spouse' };

  const totalNEC = s.necEntries.reduce((sum, e) => sum + (e.compensation || 0), 0);

  const html = `
    <div class="review-group">
      <div class="review-group-title">Tax Year & Filing <button class="review-edit-btn" onclick="goToSection(1)">Edit</button></div>
      <div class="review-row"><span class="review-label">Tax Year</span><span class="review-value">${s.taxYear}</span></div>
      <div class="review-row"><span class="review-label">Filing Status</span><span class="review-value">${statusNames[s.filingStatus] || s.filingStatus}</span></div>
    </div>

    <div class="review-group">
      <div class="review-group-title">Personal Info <button class="review-edit-btn" onclick="goToSection(3)">Edit</button></div>
      <div class="review-row"><span class="review-label">Name</span><span class="review-value">${s.firstName} ${s.lastName}</span></div>
      <div class="review-row"><span class="review-label">SSN Last 4</span><span class="review-value">***-**-${s.ssnLast4 || '????'}</span></div>
      <div class="review-row"><span class="review-label">State</span><span class="review-value">${stateNames[s.stateOfResidence] || 'Not selected'}</span></div>
    </div>

    <div class="review-group">
      <div class="review-group-title">Dependents <button class="review-edit-btn" onclick="goToSection(4)">Edit</button></div>
      <div class="review-row"><span class="review-label">Children under 17</span><span class="review-value">${s.hasChildrenUnder17 ? s.childCount + ' child(ren)' : 'None'}</span></div>
      <div class="review-row"><span class="review-label">Other dependents</span><span class="review-value">${s.hasOtherDependents ? 'Yes' : 'None'}</span></div>
    </div>

    <div class="review-group">
      <div class="review-group-title">Income Sources <button class="review-edit-btn" onclick="goToSection(5)">Edit</button></div>
      <div class="review-row"><span class="review-label">W-2 Employment</span><span class="review-value">${s.hasW2 ? 'Yes' : 'No'}</span></div>
      <div class="review-row"><span class="review-label">1099-NEC Self-Employment</span><span class="review-value">${s.has1099NEC ? s.necEntries.length + ' source(s), $' + totalNEC.toLocaleString() : 'No'}</span></div>
      <div class="review-row"><span class="review-label">Interest Income</span><span class="review-value">${s.has1099INT ? '$' + s.interestIncome.toLocaleString() : 'No'}</span></div>
      <div class="review-row"><span class="review-label">Dividend Income</span><span class="review-value">${s.has1099DIV ? '$' + s.dividendIncome.toLocaleString() : 'No'}</span></div>
    </div>

    <div class="review-group">
      <div class="review-group-title">Adjustments <button class="review-edit-btn" onclick="goToSection(6)">Edit</button></div>
      <div class="review-row"><span class="review-label">401(k)</span><span class="review-value">${s.has401k ? 'Yes' : 'No'}</span></div>
      <div class="review-row"><span class="review-label">IRA</span><span class="review-value">${s.hasIRA ? 'Yes' : 'No'}</span></div>
      <div class="review-row"><span class="review-label">HSA</span><span class="review-value">${s.hasHSA ? 'Yes' : 'No'}</span></div>
      <div class="review-row"><span class="review-label">Student Loan Interest</span><span class="review-value">${s.hasStudentLoan ? 'Yes' : 'No'}</span></div>
    </div>

    <div class="review-group">
      <div class="review-group-title">Deductions <button class="review-edit-btn" onclick="goToSection(7)">Edit</button></div>
      <div class="review-row"><span class="review-label">Deduction Type</span><span class="review-value">${s.deductionType === 'standard' ? 'Standard' : 'Itemized'}</span></div>
      ${s.deductionType === 'itemized' ? `
        <div class="review-row"><span class="review-label">Mortgage Interest</span><span class="review-value">$${s.mortgageInterest.toLocaleString()}</span></div>
        <div class="review-row"><span class="review-label">SALT</span><span class="review-value">$${Math.min(s.saltAmount, 10000).toLocaleString()}</span></div>
        <div class="review-row"><span class="review-label">Charitable</span><span class="review-value">$${s.charitableAmount.toLocaleString()}</span></div>
      ` : ''}
      <div class="review-row"><span class="review-label">Home Office</span><span class="review-value">${s.hasHomeOffice ? 'Yes' : 'No'}</span></div>
    </div>

    <div class="review-group">
      <div class="review-group-title">Credits <button class="review-edit-btn" onclick="goToSection(8)">Edit</button></div>
      <div class="review-row"><span class="review-label">Education</span><span class="review-value">${s.hasEducationExpenses ? 'Yes' : 'No'}</span></div>
      <div class="review-row"><span class="review-label">Renter</span><span class="review-value">${s.isRenter ? 'Yes' : 'No'}</span></div>
      <div class="review-row"><span class="review-label">EV Credit</span><span class="review-value">${s.hasEV ? 'Yes' : 'No'}</span></div>
      <div class="review-row"><span class="review-label">Energy Improvements</span><span class="review-value">${s.hasEnergyImprovements ? 'Yes' : 'No'}</span></div>
    </div>
  `;

  document.getElementById('review-content').innerHTML = html;
}

// ── RUN COMPUTATION ──
document.getElementById('run-computation-btn').addEventListener('click', () => {
  // Save final state
  saveState();

  // Build rules engine state from interview answers
  const rulesState = buildRulesState();
  try {
    localStorage.setItem('taxState', JSON.stringify(rulesState));
  } catch (e) { /* ignore */ }

  // Redirect to dashboard
  window.location.href = '/taxes/';
});

function buildRulesState() {
  const s = interviewState;
  const stMap = { CA: 'california', NY: 'newYork' };
  const stateId = stMap[s.stateOfResidence] || null;

  // Build incomes array from interview data
  const incomes = [];

  // 1099-NEC entries
  if (s.has1099NEC) {
    s.necEntries.forEach(entry => {
      if (entry.compensation > 0) {
        incomes.push({
          doc_type: '1099-NEC',
          payer_name: entry.payerName || 'Self-Employment',
          nonemployee_compensation: entry.compensation,
          fed_income_tax_withheld: entry.withholding || 0,
          state: s.stateOfResidence,
          extraction_status: { payer_name: 'extracted', nonemployee_compensation: 'extracted' },
        });
      }
    });
  }

  // 1099-INT
  if (s.has1099INT && s.interestIncome > 0) {
    incomes.push({
      doc_type: '1099-INT',
      payer_name: 'Interest',
      interest_income: s.interestIncome,
      extraction_status: { interest_income: 'extracted' },
    });
  }

  // 1099-DIV
  if (s.has1099DIV && s.dividendIncome > 0) {
    incomes.push({
      doc_type: '1099-DIV',
      payer_name: 'Dividends',
      ordinary_dividends: s.dividendIncome,
      extraction_status: { ordinary_dividends: 'extracted' },
    });
  }

  // Compute filing values using tax-data.js
  const c = typeof getTaxConstants === 'function'
    ? getTaxConstants(s.taxYear, stateId, s.filingStatus)
    : null;
  const fed = c ? c.fed : null;
  const sc = c ? c.state : null;

  const totalNEC = incomes.filter(i => i.doc_type === '1099-NEC').reduce((sum, i) => sum + (i.nonemployee_compensation || 0), 0);
  const totalINT = s.has1099INT ? s.interestIncome : 0;
  const totalDIV = s.has1099DIV ? s.dividendIncome : 0;
  const totalIncome = totalNEC + totalINT + totalDIV;
  // W-2 income will be added later via document upload on dashboard

  const seRate = fed ? fed.seTaxRate : 0.153;
  const seTaxableIncome = totalNEC * 0.9235;
  const seTax = Math.round(seTaxableIncome * seRate);
  const seDeduction = Math.floor(seTax * 0.5);
  const adjustments = seDeduction;
  const agi = totalIncome - adjustments;
  const standardDeduction = fed ? fed.stdDeduction : 15000;
  const taxableIncome = Math.max(0, agi - standardDeduction);

  const filing = {
    filingStatus: s.filingStatus,
    totalW2Wages: 0,
    totalIncome,
    adjustments,
    agi,
    standardDeduction,
    taxableIncome,
    fedIncomeTax: fed ? computeTaxFromBrackets(taxableIncome, fed.brackets) : 0,
    seTax,
    totalFedTax: 0,
    totalFedWithheld: incomes.reduce((sum, i) => sum + (i.fed_income_tax_withheld || 0), 0),
    fedResult: 0,
    totalStateWithheld: 0,
  };

  filing.totalFedTax = filing.fedIncomeTax + filing.seTax;
  filing.fedResult = filing.totalFedWithheld - filing.totalFedTax;

  // State computations
  if (stateId === 'california' && sc) {
    filing.caTaxableIncome = Math.max(0, agi - sc.stdDeduction);
    let caTax = computeTaxFromBrackets(filing.caTaxableIncome, sc.brackets);
    if (filing.caTaxableIncome > sc.mentalHealthThreshold) {
      caTax += Math.round((filing.caTaxableIncome - sc.mentalHealthThreshold) * sc.mentalHealthRate);
    }
    filing.caTax = caTax;
    filing.caResult = 0 - caTax;
  }

  if (stateId === 'newYork' && sc) {
    filing.nyTaxableIncome = Math.max(0, agi - sc.stdDeduction);
    filing.nyTax = computeTaxFromBrackets(filing.nyTaxableIncome, sc.brackets);
    filing.nyResult = 0 - filing.nyTax;
  }

  return {
    documents: [],
    incomes,
    filing,
    taxYear: s.taxYear,
    stateId,
  };
}

// ── RESTORE UI FROM STATE ──
function restoreUI() {
  const s = interviewState;

  // Restore option cards
  restoreOptionGrid('taxYear', String(s.taxYear));
  restoreOptionGrid('filingStatus', s.filingStatus);
  if (s.stateOfResidence) restoreOptionGrid('stateOfResidence', s.stateOfResidence);
  restoreOptionGrid('deductionType', s.deductionType);

  // Restore toggles
  const toggleFields = ['hasChildrenUnder17', 'hasOtherDependents', 'hasW2', 'has1099NEC',
    'has1099INT', 'has1099DIV', 'has401k', 'hasIRA', 'hasHSA', 'hasStudentLoan',
    'hasSEHealthInsurance', 'isEducator', 'hasHomeOffice', 'hasBusinessMileage',
    'hasEducationExpenses', 'isRenter', 'hasEV', 'hasEnergyImprovements'];

  toggleFields.forEach(field => {
    const row = document.querySelector(`.toggle-row[data-field="${field}"]`);
    if (!row) return;
    const val = s[field] ? 'yes' : 'no';
    row.querySelectorAll('.toggle-btn button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.val === val);
    });
    row.classList.toggle('active', s[field]);
  });

  // Restore inputs
  ['firstName', 'lastName', 'ssnLast4'].forEach(id => {
    const el = document.getElementById(id);
    if (el && s[id]) el.value = s[id];
  });
  ['interestIncome', 'dividendIncome', 'mortgageInterest', 'saltAmount', 'charitableAmount'].forEach(id => {
    const el = document.getElementById(id);
    if (el && s[id]) el.value = s[id];
  });
  if (s.childCount && childCountEl) childCountEl.value = s.childCount;

  // Show/hide conditional sections
  if (s.hasChildrenUnder17) document.getElementById('childCount-wrapper').style.display = '';
  if (s.has1099NEC) {
    document.getElementById('nec-cards').style.display = '';
    renderNECCards();
  }
  if (s.has1099INT) document.getElementById('int-entry').style.display = '';
  if (s.has1099DIV) document.getElementById('div-entry').style.display = '';
  if (s.deductionType === 'itemized') document.getElementById('itemized-details').style.display = '';
}

function restoreOptionGrid(field, value) {
  const grid = document.querySelector(`.option-grid[data-field="${field}"]`);
  if (!grid) return;
  grid.querySelectorAll('.option-card').forEach(card => {
    card.classList.toggle('selected', card.dataset.value === value);
  });
}

// Init std deduction display
updateStdDeductionDisplay();
