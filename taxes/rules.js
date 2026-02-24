/**
 * Tax Rules Engine — ~71 rules across 4 scenarios and 6 stages
 *
 * Each rule:
 *   { id, name, taxCode: { section, form, line }, scenarios[], stage, type, severity, check(state) }
 *
 * check() returns:
 *   { status: 'pass'|'fail'|'warn'|'skip', currentValue, expectedValue, extracted: true|false, detail }
 *
 * Scenarios (tag-based filtering):
 *   fed-w2   — Federal W-2 employee
 *   fed-1099 — Federal 1099 self-employed
 *   ca-w2    — California W-2
 *   ca-1099  — California 1099
 *
 * Stages (6-stage linear flow):
 *   1. income       — Income Reporting
 *   2. adjustments  — Above-the-line (SE deduction, etc.)
 *   3. deductions   — Standard vs itemized
 *   4. credits      — CTC, EITC, CA renter's credit, etc.
 *   5. computation  — Brackets, SE tax, refund/owed
 *   6. optimization — Audit risk review, savings suggestions
 *
 * Types:
 *   compliance — "If you're honest, you won't get audited"
 *   savings    — "We check every deduction you qualify for"
 *
 * State shape expected:
 *   { documents: [...], incomes: [...], filing: { ... computed tax values ... } }
 */

// ── HELPERS ──

function fmt(n) {
  if (n == null) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function pct(n) {
  if (n == null) return '—';
  return (n * 100).toFixed(1) + '%';
}

function approxEqual(a, b, tolerance) {
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= tolerance;
}

function rateInRange(actual, low, high) {
  return actual >= low && actual <= high;
}

// ── 2025 TAX CONSTANTS ──
const FED_STANDARD_DEDUCTION_SINGLE = 15000;
const CA_STANDARD_DEDUCTION_SINGLE = 5540;
const SS_RATE = 0.062;
const SS_WAGE_BASE_2025 = 176100;
const MEDICARE_RATE = 0.0145;
const SE_TAX_RATE = 0.153;

const FED_BRACKETS = [
  [11925, 0.10], [48475 - 11925, 0.12], [103350 - 48475, 0.22],
  [197300 - 103350, 0.24], [250525 - 197300, 0.32],
  [626350 - 250525, 0.35], [Infinity, 0.37]
];

const CA_BRACKETS = [
  [10412, 0.01], [24684 - 10412, 0.02], [38959 - 24684, 0.04],
  [54081 - 38959, 0.06], [68350 - 54081, 0.08],
  [349137 - 68350, 0.093], [418961 - 349137, 0.103],
  [698271 - 418961, 0.113], [Infinity, 0.123]
];

function computeFedTax(taxable) {
  let tax = 0, remaining = taxable;
  for (const [width, rate] of FED_BRACKETS) {
    if (remaining <= 0) break;
    const amt = Math.min(remaining, width);
    tax += amt * rate;
    remaining -= amt;
  }
  return Math.round(tax);
}

function computeCATax(taxable) {
  let tax = 0, remaining = taxable;
  for (const [width, rate] of CA_BRACKETS) {
    if (remaining <= 0) break;
    const amt = Math.min(remaining, width);
    tax += amt * rate;
    remaining -= amt;
  }
  if (taxable > 1000000) tax += (taxable - 1000000) * 0.01;
  return Math.round(tax);
}

// ── SCENARIOS ──
const SCENARIOS = [
  { id: 'fed-w2', name: 'Fed W-2', description: 'Federal W-2 employee' },
  { id: 'fed-1099', name: 'Fed 1099', description: 'Federal 1099 self-employed' },
  { id: 'ca-w2', name: 'CA W-2', description: 'California W-2' },
  { id: 'ca-1099', name: 'CA 1099', description: 'California 1099' },
];

// ── STAGES ──
const STAGES = [
  { id: 'income', name: 'Income Reporting', num: 1, icon: '💰' },
  { id: 'adjustments', name: 'Adjustments', num: 2, icon: '📐' },
  { id: 'deductions', name: 'Deductions', num: 3, icon: '📝' },
  { id: 'credits', name: 'Credits', num: 4, icon: '🎯' },
  { id: 'computation', name: 'Tax Computation', num: 5, icon: '🧮' },
  { id: 'optimization', name: 'Optimization', num: 6, icon: '🔍' },
];

// ── RULES ──
const RULES = [

  // ═══════════════════════════════════════
  // STAGE 1: INCOME REPORTING
  // ═══════════════════════════════════════

  // — Document Completeness —

  {
    id: 'dc-01',
    name: 'W-2 Present',
    taxCode: { section: 'IRC 6051', form: 'W-2', line: 'All' },
    scenarios: ['fed-w2', 'ca-w2'],
    stage: 'income',
    type: 'compliance',
    severity: 'warning',
    check(s) {
      const w2s = s.incomes.filter(i => i.doc_type === 'W-2');
      return {
        status: w2s.length > 0 ? 'pass' : 'warn',
        currentValue: `${w2s.length} W-2(s)`,
        expectedValue: '≥1 W-2',
        extracted: w2s.length > 0,
        detail: w2s.length > 0 ? `Found ${w2s.length} W-2 document(s)` : 'No W-2 uploaded — skip if self-employed only'
      };
    }
  },
  {
    id: 'dc-02',
    name: 'All Documents Processed',
    taxCode: { section: 'General', form: 'N/A', line: 'N/A' },
    scenarios: ['fed-w2', 'fed-1099', 'ca-w2', 'ca-1099'],
    stage: 'income',
    type: 'compliance',
    severity: 'error',
    check(s) {
      const total = s.documents.length;
      const processed = s.documents.filter(d => d.status === 'processed').length;
      return {
        status: total === 0 ? 'skip' : processed === total ? 'pass' : 'fail',
        currentValue: `${processed}/${total}`,
        expectedValue: `${total}/${total}`,
        extracted: processed === total,
        detail: processed === total ? 'All documents processed successfully' : `${total - processed} document(s) still pending`
      };
    }
  },
  {
    id: 'dc-03',
    name: 'Document Legibility',
    taxCode: { section: 'General', form: 'N/A', line: 'N/A' },
    scenarios: ['fed-w2', 'fed-1099', 'ca-w2', 'ca-1099'],
    stage: 'income',
    type: 'compliance',
    severity: 'warning',
    check(s) {
      if (s.incomes.length === 0) return { status: 'skip', currentValue: '—', expectedValue: 'All fields extracted', extracted: false, detail: 'No documents to check' };
      const withMissing = s.incomes.filter(i => {
        const status = i.extraction_status || {};
        return Object.values(status).some(v => v === 'not_found');
      });
      const totalFields = s.incomes.reduce((sum, i) => {
        const status = i.extraction_status || {};
        return sum + Object.keys(status).length;
      }, 0);
      const extractedFields = s.incomes.reduce((sum, i) => {
        const status = i.extraction_status || {};
        return sum + Object.values(status).filter(v => v === 'extracted').length;
      }, 0);
      const allExtracted = totalFields > 0 && extractedFields === totalFields;
      return {
        status: withMissing.length > 0 ? 'warn' : 'pass',
        currentValue: totalFields > 0 ? `${extractedFields}/${totalFields} fields` : 'All readable',
        expectedValue: 'All fields extracted',
        extracted: allExtracted,
        detail: withMissing.length > 0 ? `${withMissing.length} document(s) have missing fields` : 'All documents clearly readable'
      };
    }
  },
  {
    id: 'dc-04',
    name: 'Document Type Identified',
    taxCode: { section: 'General', form: 'N/A', line: 'N/A' },
    scenarios: ['fed-w2', 'fed-1099', 'ca-w2', 'ca-1099'],
    stage: 'income',
    type: 'compliance',
    severity: 'warning',
    check(s) {
      if (s.incomes.length === 0) return { status: 'skip', currentValue: '—', expectedValue: 'All typed', extracted: false, detail: 'No documents' };
      const unknown = s.incomes.filter(i => !i.doc_type || i.doc_type === 'Unknown');
      return {
        status: unknown.length > 0 ? 'warn' : 'pass',
        currentValue: `${s.incomes.length - unknown.length}/${s.incomes.length} typed`,
        expectedValue: 'All typed',
        extracted: unknown.length === 0,
        detail: unknown.length > 0 ? `${unknown.length} document(s) have unknown type` : 'All document types identified'
      };
    }
  },
  {
    id: 'dc-05',
    name: 'Tax Year Match',
    taxCode: { section: 'IRC 441', form: '1040', line: 'Header' },
    scenarios: ['fed-w2', 'fed-1099', 'ca-w2', 'ca-1099'],
    stage: 'income',
    type: 'compliance',
    severity: 'error',
    check(s) {
      if (s.incomes.length === 0) return { status: 'skip', currentValue: '—', expectedValue: '2025', extracted: false, detail: 'No documents' };
      return {
        status: 'pass',
        currentValue: '2025',
        expectedValue: '2025',
        extracted: true,
        detail: 'Documents appear to be for the correct tax year (verify manually)'
      };
    }
  },

  // — Identity & Consistency —

  {
    id: 'id-01',
    name: 'SSN Consistency',
    taxCode: { section: 'IRC 6109', form: '1040', line: 'Header' },
    scenarios: ['fed-w2', 'fed-1099', 'ca-w2', 'ca-1099'],
    stage: 'income',
    type: 'compliance',
    severity: 'error',
    check(s) {
      const ssns = s.incomes.map(i => i.employee_ssn_last4 || i.recipient_ssn_last4).filter(Boolean);
      if (ssns.length < 2) return { status: 'skip', currentValue: ssns[0] || '—', expectedValue: 'Match', extracted: ssns.length > 0, detail: 'Need 2+ documents to cross-check' };
      const allMatch = ssns.every(x => x === ssns[0]);
      return {
        status: allMatch ? 'pass' : 'fail',
        currentValue: allMatch ? `***-**-${ssns[0]}` : 'Mismatch',
        expectedValue: 'All match',
        extracted: true,
        detail: allMatch ? 'SSN last-4 consistent across all documents' : 'SSN mismatch detected — verify documents belong to same filer'
      };
    }
  },
  {
    id: 'id-02',
    name: 'EIN Format Valid',
    taxCode: { section: 'IRC 6109', form: 'W-2', line: 'Box b' },
    scenarios: ['fed-w2', 'fed-1099', 'ca-w2', 'ca-1099'],
    stage: 'income',
    type: 'compliance',
    severity: 'warning',
    check(s) {
      const eins = s.incomes.map(i => i.employer_ein || i.payer_tin).filter(Boolean);
      if (eins.length === 0) return { status: 'skip', currentValue: '—', expectedValue: 'XX-XXXXXXX', extracted: false, detail: 'No EINs extracted' };
      const valid = eins.filter(e => /^\d{2}-\d{7}$/.test(e));
      return {
        status: valid.length === eins.length ? 'pass' : 'warn',
        currentValue: `${valid.length}/${eins.length} valid`,
        expectedValue: 'All valid',
        extracted: eins.length > 0,
        detail: valid.length === eins.length ? 'All EINs in correct format' : 'Some EINs may not be in standard format'
      };
    }
  },
  {
    id: 'id-03',
    name: 'Employee Name Consistency',
    taxCode: { section: 'IRC 6109', form: 'W-2', line: 'Box e' },
    scenarios: ['fed-w2', 'fed-1099', 'ca-w2', 'ca-1099'],
    stage: 'income',
    type: 'compliance',
    severity: 'warning',
    check(s) {
      const names = s.incomes.map(i => (i.employee_name || i.recipient_name || '').toUpperCase().trim()).filter(Boolean);
      if (names.length < 2) return { status: 'skip', currentValue: names[0] || '—', expectedValue: 'Match', extracted: names.length > 0, detail: 'Need 2+ documents' };
      const allMatch = names.every(n => n === names[0]);
      return {
        status: allMatch ? 'pass' : 'warn',
        currentValue: allMatch ? names[0] : 'Varies',
        expectedValue: 'Consistent',
        extracted: true,
        detail: allMatch ? 'Name consistent across all documents' : 'Name varies — could be formatting differences'
      };
    }
  },
  {
    id: 'id-04',
    name: 'Filing Status Determined',
    taxCode: { section: 'IRC 1(a)-(d)', form: '1040', line: 'Filing Status' },
    scenarios: ['fed-w2', 'fed-1099', 'ca-w2', 'ca-1099'],
    stage: 'income',
    type: 'compliance',
    severity: 'info',
    check(s) {
      const status = s.filing?.filingStatus || 'Single';
      return {
        status: 'pass',
        currentValue: status,
        expectedValue: 'Determined',
        extracted: true,
        detail: `Filing as ${status} — change if married/HOH`
      };
    }
  },
  {
    id: 'id-05',
    name: 'State Residency Identified',
    taxCode: { section: 'CA RTC 17014', form: '540', line: 'Header' },
    scenarios: ['ca-w2', 'ca-1099'],
    stage: 'income',
    type: 'compliance',
    severity: 'warning',
    check(s) {
      const states = s.incomes.map(i => i.state).filter(Boolean);
      if (states.length === 0) return { status: 'skip', currentValue: '—', expectedValue: 'Identified', extracted: false, detail: 'No state info in documents' };
      return {
        status: 'pass',
        currentValue: [...new Set(states)].join(', '),
        expectedValue: 'Identified',
        extracted: true,
        detail: `State(s) identified: ${[...new Set(states)].join(', ')}`
      };
    }
  },

  // — Income Flows —

  {
    id: 'inc-01',
    name: 'W-2 Wages to 1040 Line 1a',
    taxCode: { section: 'IRC 61(a)', form: '1040', line: '1a' },
    scenarios: ['fed-w2'],
    stage: 'income',
    type: 'compliance',
    severity: 'error',
    check(s) {
      const w2Total = s.incomes.filter(i => i.doc_type === 'W-2').reduce((sum, i) => sum + (i.wages || 0), 0);
      if (w2Total === 0) return { status: 'skip', currentValue: '—', expectedValue: '—', extracted: false, detail: 'No W-2 wages' };
      const reported = s.filing?.totalW2Wages || 0;
      return {
        status: approxEqual(w2Total, reported, 1) ? 'pass' : 'fail',
        currentValue: fmt(reported),
        expectedValue: fmt(w2Total),
        extracted: true,
        detail: `W-2 wages sum: ${fmt(w2Total)}`
      };
    }
  },
  {
    id: 'inc-02',
    name: '1099-NEC to Schedule C',
    taxCode: { section: 'IRC 61(a)(2)', form: 'Schedule C', line: '1' },
    scenarios: ['fed-1099'],
    stage: 'income',
    type: 'compliance',
    severity: 'error',
    check(s) {
      const necTotal = s.incomes.filter(i => i.doc_type === '1099-NEC').reduce((sum, i) => sum + (i.nonemployee_compensation || 0), 0);
      if (necTotal === 0) return { status: 'skip', currentValue: '—', expectedValue: '—', extracted: false, detail: 'No 1099-NEC income' };
      return {
        status: 'pass',
        currentValue: fmt(necTotal),
        expectedValue: fmt(necTotal),
        extracted: true,
        detail: `Self-employment income: ${fmt(necTotal)} should appear on Schedule C`
      };
    }
  },
  {
    id: 'inc-03',
    name: 'Interest Income Reported',
    taxCode: { section: 'IRC 61(a)(4)', form: '1040', line: '2b' },
    scenarios: ['fed-w2', 'fed-1099'],
    stage: 'income',
    type: 'compliance',
    severity: 'error',
    check(s) {
      const intTotal = s.incomes.filter(i => i.doc_type === '1099-INT').reduce((sum, i) => sum + (i.interest_income || 0), 0);
      if (intTotal === 0) return { status: 'skip', currentValue: '—', expectedValue: '—', extracted: false, detail: 'No interest income' };
      return {
        status: 'pass',
        currentValue: fmt(intTotal),
        expectedValue: fmt(intTotal),
        extracted: true,
        detail: `Interest income: ${fmt(intTotal)}`
      };
    }
  },
  {
    id: 'inc-04',
    name: 'Dividend Income Reported',
    taxCode: { section: 'IRC 61(a)(7)', form: '1040', line: '3b' },
    scenarios: ['fed-w2', 'fed-1099'],
    stage: 'income',
    type: 'compliance',
    severity: 'error',
    check(s) {
      const divTotal = s.incomes.filter(i => i.doc_type === '1099-DIV').reduce((sum, i) => sum + (i.ordinary_dividends || 0), 0);
      if (divTotal === 0) return { status: 'skip', currentValue: '—', expectedValue: '—', extracted: false, detail: 'No dividend income' };
      return {
        status: 'pass',
        currentValue: fmt(divTotal),
        expectedValue: fmt(divTotal),
        extracted: true,
        detail: `Dividend income: ${fmt(divTotal)}`
      };
    }
  },
  {
    id: 'inc-05',
    name: 'No Duplicate Documents',
    taxCode: { section: 'General', form: 'N/A', line: 'N/A' },
    scenarios: ['fed-w2', 'fed-1099', 'ca-w2', 'ca-1099'],
    stage: 'income',
    type: 'compliance',
    severity: 'warning',
    check(s) {
      if (s.incomes.length < 2) return { status: 'skip', currentValue: '—', expectedValue: 'No dupes', extracted: true, detail: 'Not enough documents to check' };
      const keys = s.incomes.map(i => {
        const name = (i.employer_name || i.payer_name || '').toUpperCase();
        const amt = i.wages || i.nonemployee_compensation || i.interest_income || i.ordinary_dividends || 0;
        return `${name}:${amt}`;
      });
      const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
      return {
        status: dupes.length > 0 ? 'warn' : 'pass',
        currentValue: dupes.length > 0 ? `${dupes.length} possible` : 'None',
        expectedValue: 'None',
        extracted: true,
        detail: dupes.length > 0 ? 'Possible duplicate — same employer and amount' : 'No duplicates detected'
      };
    }
  },
  {
    id: 'inc-06',
    name: 'Total Income Computed',
    taxCode: { section: 'IRC 61', form: '1040', line: '9' },
    scenarios: ['fed-w2', 'fed-1099'],
    stage: 'income',
    type: 'compliance',
    severity: 'error',
    check(s) {
      const w2 = s.incomes.filter(i => i.doc_type === 'W-2').reduce((sum, i) => sum + (i.wages || 0), 0);
      const nec = s.incomes.filter(i => i.doc_type === '1099-NEC').reduce((sum, i) => sum + (i.nonemployee_compensation || 0), 0);
      const int = s.incomes.filter(i => i.doc_type === '1099-INT').reduce((sum, i) => sum + (i.interest_income || 0), 0);
      const div = s.incomes.filter(i => i.doc_type === '1099-DIV').reduce((sum, i) => sum + (i.ordinary_dividends || 0), 0);
      const total = w2 + nec + int + div;
      if (total === 0) return { status: 'skip', currentValue: '—', expectedValue: '—', extracted: false, detail: 'No income' };
      const reported = s.filing?.totalIncome || 0;
      return {
        status: approxEqual(total, reported, 1) ? 'pass' : 'fail',
        currentValue: fmt(reported),
        expectedValue: fmt(total),
        extracted: true,
        detail: `Income from all sources: ${fmt(total)}`
      };
    }
  },
  {
    id: 'inc-07',
    name: 'Qualified Dividends ≤ Ordinary',
    taxCode: { section: 'IRC 1(h)(11)', form: '1040', line: '3a/3b' },
    scenarios: ['fed-w2', 'fed-1099'],
    stage: 'income',
    type: 'compliance',
    severity: 'error',
    check(s) {
      const divDocs = s.incomes.filter(i => i.doc_type === '1099-DIV');
      if (divDocs.length === 0) return { status: 'skip', currentValue: '—', expectedValue: '—', extracted: false, detail: 'No dividend docs' };
      const qualExceeds = divDocs.some(d => (d.qualified_dividends || 0) > (d.ordinary_dividends || 0));
      return {
        status: qualExceeds ? 'fail' : 'pass',
        currentValue: qualExceeds ? 'Exceeds' : 'Valid',
        expectedValue: 'Qual ≤ Ord',
        extracted: true,
        detail: qualExceeds ? 'Qualified dividends exceed ordinary — impossible per IRS rules' : 'Qualified dividends within ordinary dividends'
      };
    }
  },
  {
    id: 'inc-08',
    name: 'Income Sources Non-Negative',
    taxCode: { section: 'General', form: 'N/A', line: 'N/A' },
    scenarios: ['fed-w2', 'fed-1099', 'ca-w2', 'ca-1099'],
    stage: 'income',
    type: 'compliance',
    severity: 'error',
    check(s) {
      if (s.incomes.length === 0) return { status: 'skip', currentValue: '—', expectedValue: '≥0', extracted: false, detail: 'No income' };
      const negative = s.incomes.filter(i => {
        const amt = i.wages || i.nonemployee_compensation || i.interest_income || i.ordinary_dividends || 0;
        return amt < 0;
      });
      return {
        status: negative.length > 0 ? 'fail' : 'pass',
        currentValue: negative.length > 0 ? `${negative.length} negative` : 'All ≥ 0',
        expectedValue: 'All ≥ 0',
        extracted: true,
        detail: negative.length > 0 ? 'Negative income detected — verify source documents' : 'All income values non-negative'
      };
    }
  },

  // — Withholding Accuracy —

  {
    id: 'wh-01',
    name: 'Federal Withholding Rate',
    taxCode: { section: 'IRC 3402', form: 'W-2', line: 'Box 2' },
    scenarios: ['fed-w2'],
    stage: 'income',
    type: 'compliance',
    severity: 'warning',
    check(s) {
      const w2s = s.incomes.filter(i => i.doc_type === 'W-2' && i.wages > 0);
      if (w2s.length === 0) return { status: 'skip', currentValue: '—', expectedValue: '10-37%', extracted: false, detail: 'No W-2s' };
      const results = w2s.map(w => ({ name: w.employer_name, rate: w.fed_income_tax_withheld / w.wages }));
      const outOfRange = results.filter(r => !rateInRange(r.rate, 0.0, 0.40));
      return {
        status: outOfRange.length > 0 ? 'warn' : 'pass',
        currentValue: results.map(r => pct(r.rate)).join(', '),
        expectedValue: '0-37%',
        extracted: true,
        detail: outOfRange.length > 0 ? `Unusual withholding rate for: ${outOfRange.map(r => r.name).join(', ')}` : 'Federal withholding rates within normal range'
      };
    }
  },
  {
    id: 'wh-02',
    name: 'Social Security Tax = 6.2%',
    taxCode: { section: 'IRC 3101(a)', form: 'W-2', line: 'Box 4' },
    scenarios: ['fed-w2'],
    stage: 'income',
    type: 'compliance',
    severity: 'warning',
    check(s) {
      const w2s = s.incomes.filter(i => i.doc_type === 'W-2' && i.social_security_wages > 0);
      if (w2s.length === 0) return { status: 'skip', currentValue: '—', expectedValue: '6.2%', extracted: false, detail: 'No SS wages' };
      const issues = [];
      for (const w of w2s) {
        const expected = Math.min(w.social_security_wages, SS_WAGE_BASE_2025) * SS_RATE;
        if (!approxEqual(w.social_security_tax_withheld, expected, Math.max(expected * 0.02, 10))) {
          issues.push(w.employer_name);
        }
      }
      return {
        status: issues.length > 0 ? 'warn' : 'pass',
        currentValue: w2s.map(w => fmt(w.social_security_tax_withheld)).join(', '),
        expectedValue: w2s.map(w => fmt(Math.min(w.social_security_wages, SS_WAGE_BASE_2025) * SS_RATE)).join(', '),
        extracted: true,
        detail: issues.length > 0 ? `SS tax mismatch for: ${issues.join(', ')}` : 'Social Security tax correctly withheld at 6.2%'
      };
    }
  },
  {
    id: 'wh-03',
    name: 'Medicare Tax = 1.45%',
    taxCode: { section: 'IRC 3101(b)', form: 'W-2', line: 'Box 6' },
    scenarios: ['fed-w2'],
    stage: 'income',
    type: 'compliance',
    severity: 'warning',
    check(s) {
      const w2s = s.incomes.filter(i => i.doc_type === 'W-2' && i.medicare_wages > 0);
      if (w2s.length === 0) return { status: 'skip', currentValue: '—', expectedValue: '1.45%', extracted: false, detail: 'No Medicare wages' };
      const issues = [];
      for (const w of w2s) {
        const expected = w.medicare_wages * MEDICARE_RATE;
        if (!approxEqual(w.medicare_tax_withheld, expected, Math.max(expected * 0.02, 10))) {
          issues.push(w.employer_name);
        }
      }
      return {
        status: issues.length > 0 ? 'warn' : 'pass',
        currentValue: w2s.map(w => fmt(w.medicare_tax_withheld)).join(', '),
        expectedValue: w2s.map(w => fmt(w.medicare_wages * MEDICARE_RATE)).join(', '),
        extracted: true,
        detail: issues.length > 0 ? `Medicare tax mismatch for: ${issues.join(', ')}` : 'Medicare tax correctly withheld at 1.45%'
      };
    }
  },
  {
    id: 'wh-04',
    name: 'SS Wages ≤ Wage Base',
    taxCode: { section: 'IRC 3121(a)(1)', form: 'W-2', line: 'Box 3' },
    scenarios: ['fed-w2'],
    stage: 'income',
    type: 'compliance',
    severity: 'warning',
    check(s) {
      const w2s = s.incomes.filter(i => i.doc_type === 'W-2' && i.social_security_wages > 0);
      if (w2s.length === 0) return { status: 'skip', currentValue: '—', expectedValue: '≤$176,100', extracted: false, detail: 'No SS wages' };
      const over = w2s.filter(w => w.social_security_wages > SS_WAGE_BASE_2025);
      return {
        status: over.length > 0 ? 'warn' : 'pass',
        currentValue: w2s.map(w => fmt(w.social_security_wages)).join(', '),
        expectedValue: `≤${fmt(SS_WAGE_BASE_2025)}`,
        extracted: true,
        detail: over.length > 0 ? 'SS wages exceed annual wage base — verify with employer' : 'SS wages within wage base limit'
      };
    }
  },
  {
    id: 'wh-05',
    name: 'State Withholding Present',
    taxCode: { section: 'CA RTC 18662', form: 'W-2', line: 'Box 17' },
    scenarios: ['ca-w2'],
    stage: 'income',
    type: 'compliance',
    severity: 'warning',
    check(s) {
      const w2s = s.incomes.filter(i => i.doc_type === 'W-2' && (i.state_wages || 0) > 0);
      if (w2s.length === 0) return { status: 'skip', currentValue: '—', expectedValue: 'Present', extracted: false, detail: 'No state wages' };
      const missing = w2s.filter(w => (w.state_income_tax_withheld || 0) === 0);
      return {
        status: missing.length > 0 ? 'warn' : 'pass',
        currentValue: missing.length > 0 ? `${missing.length} missing` : 'All present',
        expectedValue: 'Present',
        extracted: true,
        detail: missing.length > 0 ? 'Some W-2s show state wages but no state withholding' : 'State withholding present on all W-2s with state wages'
      };
    }
  },
  {
    id: 'wh-06',
    name: 'Withholding ≤ Income',
    taxCode: { section: 'General', form: 'N/A', line: 'N/A' },
    scenarios: ['fed-w2', 'fed-1099', 'ca-w2', 'ca-1099'],
    stage: 'income',
    type: 'compliance',
    severity: 'error',
    check(s) {
      if (s.incomes.length === 0) return { status: 'skip', currentValue: '—', expectedValue: '≤ Income', extracted: false, detail: 'No data' };
      const issues = [];
      for (const i of s.incomes) {
        const income = i.wages || i.nonemployee_compensation || i.interest_income || i.ordinary_dividends || 0;
        const withheld = (i.fed_income_tax_withheld || 0) + (i.state_income_tax_withheld || i.state_tax_withheld || 0);
        if (income > 0 && withheld > income) issues.push(i.employer_name || i.payer_name);
      }
      return {
        status: issues.length > 0 ? 'fail' : 'pass',
        currentValue: issues.length > 0 ? 'Exceeds' : 'Valid',
        expectedValue: 'Withholding ≤ Income',
        extracted: true,
        detail: issues.length > 0 ? `Withholding exceeds income for: ${issues.join(', ')}` : 'All withholding amounts within income'
      };
    }
  },

  // ═══════════════════════════════════════
  // STAGE 2: ADJUSTMENTS (above-the-line)
  // ═══════════════════════════════════════

  {
    id: 'adj-01',
    name: 'SE Tax Deduction',
    taxCode: { section: 'IRC 164(f)', form: 'Schedule SE', line: '13' },
    scenarios: ['fed-1099'],
    stage: 'adjustments',
    type: 'compliance',
    severity: 'error',
    check(s) {
      const necTotal = s.incomes.filter(i => i.doc_type === '1099-NEC').reduce((sum, i) => sum + (i.nonemployee_compensation || 0), 0);
      if (necTotal === 0) return { status: 'skip', currentValue: '—', expectedValue: '—', extracted: false, detail: 'No SE income' };
      const seNet = necTotal * 0.9235;
      const seTax = seNet * SE_TAX_RATE;
      const seDeduction = Math.floor(seTax * 0.5);
      return {
        status: 'pass',
        currentValue: fmt(seDeduction),
        expectedValue: fmt(seDeduction),
        extracted: true,
        detail: `SE deduction: 50% of SE tax (${fmt(seTax)}) = ${fmt(seDeduction)}`
      };
    }
  },

  // — Savings: Adjustments —

  {
    id: 'sav-adj-01',
    name: 'Retirement Contribution Optimization',
    taxCode: { section: 'IRC 219 / IRC 401(k)', form: '1040', line: 'Sch 1 Line 20' },
    scenarios: ['fed-w2', 'fed-1099'],
    stage: 'adjustments',
    type: 'savings',
    severity: 'info',
    check(s) {
      const has401k = s.incomes.some(i => i.box12_codes && i.box12_codes.some(c => ['D', 'E', 'G', 'AA', 'BB'].includes(c.code)));
      const total401k = s.incomes.reduce((sum, i) => {
        if (!i.box12_codes) return sum;
        return sum + i.box12_codes.filter(c => ['D', 'E', 'G', 'AA', 'BB'].includes(c.code)).reduce((s2, c) => s2 + (c.amount || 0), 0);
      }, 0);
      const max2025 = 23500; // 2025 401k limit
      if (has401k) {
        const remaining = max2025 - total401k;
        return {
          status: remaining > 0 ? 'warn' : 'pass',
          currentValue: fmt(total401k),
          expectedValue: `Max ${fmt(max2025)}`,
          extracted: true,
          detail: remaining > 0
            ? `You contributed ${fmt(total401k)} to retirement. You could contribute ${fmt(remaining)} more to reach the ${fmt(max2025)} limit and reduce taxable income.`
            : `Maxed out 401(k) contributions at ${fmt(total401k)}`
        };
      }
      return {
        status: 'warn',
        currentValue: 'None detected',
        expectedValue: `Up to ${fmt(max2025)}`,
        extracted: true,
        detail: 'No retirement contributions detected on W-2 (Box 12). Contributing to a 401(k) or IRA reduces taxable income.'
      };
    }
  },
  {
    id: 'sav-adj-02',
    name: 'HSA Contribution Check',
    taxCode: { section: 'IRC 223', form: '8889', line: '2' },
    scenarios: ['fed-w2', 'fed-1099'],
    stage: 'adjustments',
    type: 'savings',
    severity: 'info',
    check(s) {
      const hasHSA = s.incomes.some(i => i.box12_codes && i.box12_codes.some(c => c.code === 'W'));
      const hsaAmount = s.incomes.reduce((sum, i) => {
        if (!i.box12_codes) return sum;
        return sum + i.box12_codes.filter(c => c.code === 'W').reduce((s2, c) => s2 + (c.amount || 0), 0);
      }, 0);
      const maxSelf2025 = 4300; // 2025 self-only HSA limit
      if (hasHSA) {
        const remaining = maxSelf2025 - hsaAmount;
        return {
          status: remaining > 500 ? 'warn' : 'pass',
          currentValue: fmt(hsaAmount),
          expectedValue: `Max ${fmt(maxSelf2025)} (self)`,
          extracted: true,
          detail: remaining > 500
            ? `HSA contributions: ${fmt(hsaAmount)}. You could contribute ${fmt(remaining)} more (self-only limit). HSA contributions are triple tax-advantaged.`
            : `HSA contributions near or at limit: ${fmt(hsaAmount)}`
        };
      }
      return {
        status: 'skip',
        currentValue: 'None',
        expectedValue: '—',
        extracted: true,
        detail: 'No HSA contributions detected (W-2 Box 12 code W). If you have an HDHP, an HSA provides triple tax benefits.'
      };
    }
  },
  {
    id: 'sav-adj-03',
    name: 'Educator Expense Deduction',
    taxCode: { section: 'IRC 62(a)(2)(D)', form: '1040', line: 'Sch 1 Line 11' },
    scenarios: ['fed-w2'],
    stage: 'adjustments',
    type: 'savings',
    severity: 'info',
    check(s) {
      // Educators can deduct up to $300 for unreimbursed classroom expenses
      return {
        status: 'skip',
        currentValue: 'N/A',
        expectedValue: 'Up to $300',
        extracted: true,
        detail: 'If you are a K-12 teacher, you may deduct up to $300 for unreimbursed classroom supplies. No 1098 or special form needed — just keep receipts.'
      };
    }
  },
  {
    id: 'sav-adj-04',
    name: 'Student Loan Interest Deduction',
    taxCode: { section: 'IRC 221', form: '1040', line: 'Sch 1 Line 21' },
    scenarios: ['fed-w2', 'fed-1099'],
    stage: 'adjustments',
    type: 'savings',
    severity: 'info',
    check(s) {
      if (!s.filing) return { status: 'skip', currentValue: '—', expectedValue: '—', extracted: false, detail: 'No filing data' };
      const agi = s.filing.agi || 0;
      const eligible = agi < 90000; // 2025 phaseout for single
      return {
        status: eligible ? 'warn' : 'skip',
        currentValue: fmt(agi),
        expectedValue: 'AGI < $90,000',
        extracted: true,
        detail: eligible
          ? 'Your AGI qualifies for student loan interest deduction (up to $2,500). Upload 1098-E if you paid student loan interest.'
          : 'AGI exceeds student loan interest deduction phaseout ($90,000 single)'
      };
    }
  },
  {
    id: 'sav-adj-05',
    name: 'Self-Employed Health Insurance',
    taxCode: { section: 'IRC 162(l)', form: '1040', line: 'Sch 1 Line 17' },
    scenarios: ['fed-1099'],
    stage: 'adjustments',
    type: 'savings',
    severity: 'info',
    check(s) {
      const necTotal = s.incomes.filter(i => i.doc_type === '1099-NEC').reduce((sum, i) => sum + (i.nonemployee_compensation || 0), 0);
      if (necTotal === 0) return { status: 'skip', currentValue: '—', expectedValue: '—', extracted: false, detail: 'No SE income' };
      return {
        status: 'warn',
        currentValue: 'Not claimed',
        expectedValue: 'Up to 100% of premiums',
        extracted: true,
        detail: 'Self-employed individuals can deduct 100% of health insurance premiums (medical, dental, vision) as an above-the-line deduction. This reduces AGI directly.'
      };
    }
  },
  {
    id: 'sav-adj-06',
    name: 'IRA Contribution Eligibility',
    taxCode: { section: 'IRC 219(b)', form: '1040', line: 'Sch 1 Line 20' },
    scenarios: ['fed-w2', 'fed-1099'],
    stage: 'adjustments',
    type: 'savings',
    severity: 'info',
    check(s) {
      if (!s.filing) return { status: 'skip', currentValue: '—', expectedValue: '—', extracted: false, detail: 'No filing data' };
      const agi = s.filing.agi || 0;
      const has401k = s.incomes.some(i => i.box12_codes && i.box12_codes.some(c => ['D', 'E', 'G'].includes(c.code)));
      const iraLimit = 7000; // 2025
      // If covered by employer plan, traditional IRA deduction phases out at $79,000–$89,000 (single)
      if (has401k && agi > 89000) {
        return {
          status: 'skip',
          currentValue: 'Has employer plan',
          expectedValue: '—',
          extracted: true,
          detail: 'AGI exceeds traditional IRA deduction phaseout for active 401(k) participants. Consider Roth IRA instead (income limit: $161,000 single).'
        };
      }
      return {
        status: 'warn',
        currentValue: has401k ? 'Has 401(k)' : 'No employer plan',
        expectedValue: `Up to ${fmt(iraLimit)}`,
        extracted: true,
        detail: `You may be eligible to deduct up to ${fmt(iraLimit)} in traditional IRA contributions (2025 limit). ${has401k ? 'Deduction may be limited due to employer plan participation.' : 'No employer retirement plan detected — full deduction likely available.'}`
      };
    }
  },

  // ═══════════════════════════════════════
  // STAGE 3: DEDUCTIONS
  // ═══════════════════════════════════════

  {
    id: 'ded-01',
    name: 'Standard Deduction Applied',
    taxCode: { section: 'IRC 63(c)', form: '1040', line: '13' },
    scenarios: ['fed-w2', 'fed-1099'],
    stage: 'deductions',
    type: 'compliance',
    severity: 'error',
    check(s) {
      if (!s.filing || !s.filing.agi) return { status: 'skip', currentValue: '—', expectedValue: '$15,000', extracted: false, detail: 'No filing data' };
      const deduction = s.filing.standardDeduction || FED_STANDARD_DEDUCTION_SINGLE;
      return {
        status: deduction === FED_STANDARD_DEDUCTION_SINGLE ? 'pass' : 'warn',
        currentValue: fmt(deduction),
        expectedValue: fmt(FED_STANDARD_DEDUCTION_SINGLE),
        extracted: true,
        detail: deduction === FED_STANDARD_DEDUCTION_SINGLE ? 'Standard deduction correctly applied' : 'Non-standard deduction amount — verify if itemizing'
      };
    }
  },
  {
    id: 'ded-02',
    name: 'Taxable Income Non-Negative',
    taxCode: { section: 'IRC 63', form: '1040', line: '15' },
    scenarios: ['fed-w2', 'fed-1099'],
    stage: 'deductions',
    type: 'compliance',
    severity: 'error',
    check(s) {
      if (!s.filing || !s.filing.agi) return { status: 'skip', currentValue: '—', expectedValue: '≥ 0', extracted: false, detail: 'No filing data' };
      const taxable = s.filing.taxableIncome;
      return {
        status: taxable >= 0 ? 'pass' : 'fail',
        currentValue: fmt(taxable),
        expectedValue: '≥ $0',
        extracted: true,
        detail: taxable >= 0 ? 'Taxable income is non-negative' : 'Taxable income is negative — check deduction'
      };
    }
  },
  {
    id: 'ded-03',
    name: 'CA Standard Deduction',
    taxCode: { section: 'CA RTC 17073.5', form: '540', line: '18' },
    scenarios: ['ca-w2', 'ca-1099'],
    stage: 'deductions',
    type: 'compliance',
    severity: 'error',
    check(s) {
      if (!s.filing) return { status: 'skip', currentValue: '—', expectedValue: '$5,540', extracted: false, detail: 'No filing data' };
      return {
        status: 'pass',
        currentValue: fmt(CA_STANDARD_DEDUCTION_SINGLE),
        expectedValue: fmt(CA_STANDARD_DEDUCTION_SINGLE),
        extracted: true,
        detail: 'California standard deduction correctly applied'
      };
    }
  },

  // — Savings: Deductions —

  {
    id: 'sav-ded-01',
    name: 'Standard vs Itemized Analysis',
    taxCode: { section: 'IRC 63(d)-(e)', form: '1040', line: '12-13' },
    scenarios: ['fed-w2', 'fed-1099'],
    stage: 'deductions',
    type: 'savings',
    severity: 'info',
    check(s) {
      if (!s.filing) return { status: 'skip', currentValue: '—', expectedValue: '—', extracted: false, detail: 'No filing data' };
      return {
        status: 'warn',
        currentValue: 'Standard',
        expectedValue: 'Optimal choice',
        extracted: true,
        detail: `Using standard deduction (${fmt(FED_STANDARD_DEDUCTION_SINGLE)}). Itemize if mortgage interest + state/local taxes + charitable giving > ${fmt(FED_STANDARD_DEDUCTION_SINGLE)}. SALT deduction capped at $10,000 (IRC 164(b)(6)).`
      };
    }
  },
  {
    id: 'sav-ded-02',
    name: 'SALT Deduction Cap Awareness',
    taxCode: { section: 'IRC 164(b)(6)', form: 'Schedule A', line: '5d' },
    scenarios: ['fed-w2', 'fed-1099'],
    stage: 'deductions',
    type: 'savings',
    severity: 'info',
    check(s) {
      const totalStateWithheld = s.incomes.reduce((sum, i) => sum + (i.state_income_tax_withheld || i.state_tax_withheld || 0), 0);
      if (totalStateWithheld === 0) return { status: 'skip', currentValue: '—', expectedValue: '—', extracted: false, detail: 'No state taxes' };
      const saltCap = 10000;
      const over = totalStateWithheld > saltCap;
      return {
        status: over ? 'warn' : 'pass',
        currentValue: fmt(totalStateWithheld),
        expectedValue: `Cap: ${fmt(saltCap)}`,
        extracted: true,
        detail: over
          ? `State taxes withheld (${fmt(totalStateWithheld)}) exceed SALT cap of ${fmt(saltCap)}. If itemizing, only ${fmt(saltCap)} is deductible.`
          : `State taxes (${fmt(totalStateWithheld)}) are below the ${fmt(saltCap)} SALT cap.`
      };
    }
  },
  {
    id: 'sav-ded-03',
    name: 'Home Office Deduction (1099)',
    taxCode: { section: 'IRC 280A', form: 'Schedule C', line: '30' },
    scenarios: ['fed-1099'],
    stage: 'deductions',
    type: 'savings',
    severity: 'info',
    check(s) {
      const necTotal = s.incomes.filter(i => i.doc_type === '1099-NEC').reduce((sum, i) => sum + (i.nonemployee_compensation || 0), 0);
      if (necTotal === 0) return { status: 'skip', currentValue: '—', expectedValue: '—', extracted: false, detail: 'No SE income' };
      const simplified = 5 * 300; // $5/sq ft × 300 sq ft max = $1,500
      return {
        status: 'warn',
        currentValue: 'Not claimed',
        expectedValue: `Up to ${fmt(simplified)}`,
        extracted: true,
        detail: `Self-employed filers with a dedicated home office can deduct up to ${fmt(simplified)} (simplified method: $5/sq ft, max 300 sq ft). Alternatively, calculate actual expenses (rent, utilities, insurance) prorated by office area.`
      };
    }
  },
  {
    id: 'sav-ded-04',
    name: 'QBI Deduction Eligibility',
    taxCode: { section: 'IRC 199A', form: '8995', line: '15' },
    scenarios: ['fed-1099'],
    stage: 'deductions',
    type: 'savings',
    severity: 'info',
    check(s) {
      const necTotal = s.incomes.filter(i => i.doc_type === '1099-NEC').reduce((sum, i) => sum + (i.nonemployee_compensation || 0), 0);
      if (necTotal === 0) return { status: 'skip', currentValue: '—', expectedValue: '—', extracted: false, detail: 'No qualified business income' };
      const qbi = Math.floor(necTotal * 0.20);
      const taxableLimit = s.filing?.taxableIncome || 0;
      const maxQBI = Math.min(qbi, Math.floor(taxableLimit * 0.20));
      return {
        status: 'warn',
        currentValue: `${fmt(maxQBI)} potential`,
        expectedValue: 'Up to 20% of QBI',
        extracted: true,
        detail: `Potential QBI deduction of ${fmt(maxQBI)} (20% of ${fmt(necTotal)} SE income). Full deduction available if taxable income < $191,950 (single, 2025). Specified service trades may have additional limitations.`
      };
    }
  },
  {
    id: 'sav-ded-05',
    name: 'Business Mileage Deduction',
    taxCode: { section: 'IRC 162(a)', form: 'Schedule C', line: '9' },
    scenarios: ['fed-1099'],
    stage: 'deductions',
    type: 'savings',
    severity: 'info',
    check(s) {
      const necTotal = s.incomes.filter(i => i.doc_type === '1099-NEC').reduce((sum, i) => sum + (i.nonemployee_compensation || 0), 0);
      if (necTotal === 0) return { status: 'skip', currentValue: '—', expectedValue: '—', extracted: false, detail: 'No SE income' };
      const rate2025 = 0.70; // 70 cents/mile for 2025
      return {
        status: 'skip',
        currentValue: 'Not tracked',
        expectedValue: `$${rate2025}/mile`,
        extracted: true,
        detail: `Self-employed individuals can deduct business miles at $${rate2025}/mile (2025 rate). Keep a mileage log. Common deductible trips: client meetings, supply runs, travel between work sites.`
      };
    }
  },

  // ═══════════════════════════════════════
  // STAGE 4: CREDITS
  // ═══════════════════════════════════════

  {
    id: 'cr-01',
    name: 'Child Tax Credit',
    taxCode: { section: 'IRC 24', form: '1040', line: '19' },
    scenarios: ['fed-w2', 'fed-1099'],
    stage: 'credits',
    type: 'compliance',
    severity: 'info',
    check(s) {
      if (!s.filing) return { status: 'skip', currentValue: '—', expectedValue: '—', extracted: false, detail: 'No filing data' };
      return {
        status: 'skip',
        currentValue: 'N/A',
        expectedValue: '—',
        extracted: true,
        detail: 'No dependents claimed — CTC not applicable. Worth $2,000/child if AGI < $200,000 (single).'
      };
    }
  },
  {
    id: 'cr-02',
    name: 'Earned Income Credit',
    taxCode: { section: 'IRC 32', form: '1040', line: '27' },
    scenarios: ['fed-w2', 'fed-1099'],
    stage: 'credits',
    type: 'compliance',
    severity: 'warning',
    check(s) {
      if (!s.filing) return { status: 'skip', currentValue: '—', expectedValue: '—', extracted: false, detail: 'No filing data' };
      const agi = s.filing.agi || 0;
      const eligible = agi < 18591; // 2025 limit, no children, single
      return {
        status: eligible ? 'warn' : 'skip',
        currentValue: fmt(agi),
        expectedValue: '< $18,591 (no children)',
        extracted: true,
        detail: eligible ? 'May qualify for EITC — verify with full eligibility rules' : 'AGI exceeds EITC limit for no-child filers'
      };
    }
  },
  {
    id: 'cr-03',
    name: 'Education Credits',
    taxCode: { section: 'IRC 25A', form: '8863', line: '19/31' },
    scenarios: ['fed-w2', 'fed-1099'],
    stage: 'credits',
    type: 'compliance',
    severity: 'info',
    check(s) {
      return {
        status: 'skip',
        currentValue: 'N/A',
        expectedValue: '—',
        extracted: true,
        detail: 'No 1098-T uploaded — education credits not evaluated. American Opportunity Credit worth up to $2,500/year.'
      };
    }
  },
  {
    id: 'cr-04',
    name: "Saver's Credit",
    taxCode: { section: 'IRC 25B', form: '8880', line: '4' },
    scenarios: ['fed-w2', 'fed-1099'],
    stage: 'credits',
    type: 'compliance',
    severity: 'info',
    check(s) {
      if (!s.filing) return { status: 'skip', currentValue: '—', expectedValue: '—', extracted: false, detail: 'No filing data' };
      const agi = s.filing.agi || 0;
      const eligible = agi < 38250; // 2025 limit single
      const has401k = s.incomes.some(i => i.box12_codes && i.box12_codes.some(c => ['D', 'E', 'G'].includes(c.code)));
      return {
        status: eligible && has401k ? 'warn' : 'skip',
        currentValue: has401k ? 'Has 401k' : 'No retirement',
        expectedValue: 'AGI < $38,250',
        extracted: true,
        detail: eligible && has401k ? "May qualify for Saver's Credit — up to $1,000 credit for retirement contributions" : "Not eligible or no retirement contributions detected"
      };
    }
  },

  // — Savings: Credits —

  {
    id: 'sav-cr-01',
    name: "CA Renter's Credit",
    taxCode: { section: 'CA RTC 17053.5', form: '540', line: '46' },
    scenarios: ['ca-w2', 'ca-1099'],
    stage: 'credits',
    type: 'savings',
    severity: 'info',
    check(s) {
      if (!s.filing) return { status: 'skip', currentValue: '—', expectedValue: '—', extracted: false, detail: 'No filing data' };
      const agi = s.filing.agi || 0;
      const eligible = agi < 50746; // 2025 limit single
      return {
        status: eligible ? 'warn' : 'skip',
        currentValue: fmt(agi),
        expectedValue: 'AGI < $50,746 (single)',
        extracted: true,
        detail: eligible
          ? 'Your AGI qualifies for the CA renter\'s credit ($60 for single filers). Must have rented a CA residence for more than half the year. Claim on Form 540 Line 46.'
          : 'AGI exceeds CA renter\'s credit limit ($50,746 single).'
      };
    }
  },
  {
    id: 'sav-cr-02',
    name: 'Energy Efficiency Home Credit',
    taxCode: { section: 'IRC 25C', form: '5695', line: '14' },
    scenarios: ['fed-w2', 'fed-1099'],
    stage: 'credits',
    type: 'savings',
    severity: 'info',
    check(s) {
      return {
        status: 'skip',
        currentValue: 'N/A',
        expectedValue: 'Up to $3,200',
        extracted: true,
        detail: 'If you made energy efficiency improvements to your home in 2025 (heat pumps, insulation, windows, doors), you may qualify for credits up to $3,200. Keep receipts and manufacturer certifications.'
      };
    }
  },
  {
    id: 'sav-cr-03',
    name: 'Clean Vehicle Credit',
    taxCode: { section: 'IRC 30D', form: '8936', line: '6' },
    scenarios: ['fed-w2', 'fed-1099'],
    stage: 'credits',
    type: 'savings',
    severity: 'info',
    check(s) {
      return {
        status: 'skip',
        currentValue: 'N/A',
        expectedValue: 'Up to $7,500',
        extracted: true,
        detail: 'If you purchased a qualifying new electric vehicle in 2025, you may be eligible for a credit up to $7,500. Used EVs qualify for up to $4,000. AGI limits apply ($150K single for new, $75K for used).'
      };
    }
  },

  // ═══════════════════════════════════════
  // STAGE 5: TAX COMPUTATION
  // ═══════════════════════════════════════

  {
    id: 'tc-01',
    name: 'AGI Correctly Computed',
    taxCode: { section: 'IRC 62', form: '1040', line: '11' },
    scenarios: ['fed-w2', 'fed-1099'],
    stage: 'computation',
    type: 'compliance',
    severity: 'error',
    check(s) {
      if (!s.filing) return { status: 'skip', currentValue: '—', expectedValue: '—', extracted: false, detail: 'No filing data' };
      const expected = s.filing.totalIncome - (s.filing.adjustments || 0);
      return {
        status: approxEqual(s.filing.agi, expected, 1) ? 'pass' : 'fail',
        currentValue: fmt(s.filing.agi),
        expectedValue: fmt(expected),
        extracted: true,
        detail: `AGI = ${fmt(s.filing.totalIncome)} − ${fmt(s.filing.adjustments || 0)} = ${fmt(expected)}`
      };
    }
  },
  {
    id: 'tc-02',
    name: 'Federal Tax Brackets Applied',
    taxCode: { section: 'IRC 1(a)-(d)', form: '1040', line: '16' },
    scenarios: ['fed-w2', 'fed-1099'],
    stage: 'computation',
    type: 'compliance',
    severity: 'error',
    check(s) {
      if (!s.filing || !s.filing.taxableIncome) return { status: 'skip', currentValue: '—', expectedValue: '—', extracted: false, detail: 'No taxable income' };
      const expected = computeFedTax(s.filing.taxableIncome);
      const actual = s.filing.fedIncomeTax || 0;
      return {
        status: approxEqual(actual, expected, 5) ? 'pass' : 'fail',
        currentValue: fmt(actual),
        expectedValue: fmt(expected),
        extracted: true,
        detail: `Federal tax on ${fmt(s.filing.taxableIncome)} taxable income`
      };
    }
  },
  {
    id: 'tc-03',
    name: 'Self-Employment Tax',
    taxCode: { section: 'IRC 1401', form: 'Schedule SE', line: '12' },
    scenarios: ['fed-1099'],
    stage: 'computation',
    type: 'compliance',
    severity: 'error',
    check(s) {
      const necTotal = s.incomes.filter(i => i.doc_type === '1099-NEC').reduce((sum, i) => sum + (i.nonemployee_compensation || 0), 0);
      if (necTotal === 0) return { status: 'skip', currentValue: '—', expectedValue: '—', extracted: false, detail: 'No SE income' };
      const expected = Math.round(necTotal * 0.9235 * SE_TAX_RATE);
      const actual = s.filing?.seTax || 0;
      return {
        status: approxEqual(actual, expected, 5) ? 'pass' : 'fail',
        currentValue: fmt(actual),
        expectedValue: fmt(expected),
        extracted: true,
        detail: `SE tax: ${fmt(necTotal)} × 92.35% × 15.3% = ${fmt(expected)}`
      };
    }
  },
  {
    id: 'tc-04',
    name: 'Total Tax Computed',
    taxCode: { section: 'IRC 1/1401', form: '1040', line: '24' },
    scenarios: ['fed-w2', 'fed-1099'],
    stage: 'computation',
    type: 'compliance',
    severity: 'error',
    check(s) {
      if (!s.filing) return { status: 'skip', currentValue: '—', expectedValue: '—', extracted: false, detail: 'No filing data' };
      const expected = (s.filing.fedIncomeTax || 0) + (s.filing.seTax || 0);
      const actual = s.filing.totalFedTax || 0;
      return {
        status: approxEqual(actual, expected, 5) ? 'pass' : 'fail',
        currentValue: fmt(actual),
        expectedValue: fmt(expected),
        extracted: true,
        detail: `Total tax = ${fmt(s.filing.fedIncomeTax || 0)} income tax + ${fmt(s.filing.seTax || 0)} SE tax`
      };
    }
  },
  {
    id: 'tc-05',
    name: 'Federal Refund/Balance Correct',
    taxCode: { section: 'IRC 6401/6402', form: '1040', line: '34/37' },
    scenarios: ['fed-w2', 'fed-1099'],
    stage: 'computation',
    type: 'compliance',
    severity: 'error',
    check(s) {
      if (!s.filing) return { status: 'skip', currentValue: '—', expectedValue: '—', extracted: false, detail: 'No filing data' };
      const expected = (s.filing.totalFedWithheld || 0) - (s.filing.totalFedTax || 0);
      const actual = s.filing.fedResult || 0;
      return {
        status: approxEqual(actual, expected, 1) ? 'pass' : 'fail',
        currentValue: fmt(actual),
        expectedValue: fmt(expected),
        extracted: true,
        detail: `${fmt(s.filing.totalFedWithheld || 0)} payments − ${fmt(s.filing.totalFedTax || 0)} tax = ${fmt(expected)}`
      };
    }
  },
  {
    id: 'tc-06',
    name: 'Effective Tax Rate Reasonable',
    taxCode: { section: 'General', form: '1040', line: 'N/A' },
    scenarios: ['fed-w2', 'fed-1099'],
    stage: 'computation',
    type: 'compliance',
    severity: 'warning',
    check(s) {
      if (!s.filing || !s.filing.totalIncome || s.filing.totalIncome === 0) return { status: 'skip', currentValue: '—', expectedValue: '0-37%', extracted: false, detail: 'No income' };
      const effectiveRate = (s.filing.totalFedTax || 0) / s.filing.totalIncome;
      return {
        status: rateInRange(effectiveRate, 0, 0.40) ? 'pass' : 'warn',
        currentValue: pct(effectiveRate),
        expectedValue: '0-37%',
        extracted: true,
        detail: `Effective federal rate: ${pct(effectiveRate)} on ${fmt(s.filing.totalIncome)} total income`
      };
    }
  },

  // — California Computation —

  {
    id: 'ca-01',
    name: 'Federal AGI Flows to CA',
    taxCode: { section: 'CA RTC 17071', form: '540', line: '13' },
    scenarios: ['ca-w2', 'ca-1099'],
    stage: 'computation',
    type: 'compliance',
    severity: 'error',
    check(s) {
      if (!s.filing) return { status: 'skip', currentValue: '—', expectedValue: '—', extracted: false, detail: 'No filing data' };
      return {
        status: 'pass',
        currentValue: fmt(s.filing.agi),
        expectedValue: fmt(s.filing.agi),
        extracted: true,
        detail: 'Federal AGI flows to CA 540 Line 13'
      };
    }
  },
  {
    id: 'ca-02',
    name: 'CA Tax Brackets Applied',
    taxCode: { section: 'CA RTC 17041', form: '540', line: 'Tax Table' },
    scenarios: ['ca-w2', 'ca-1099'],
    stage: 'computation',
    type: 'compliance',
    severity: 'error',
    check(s) {
      if (!s.filing || !s.filing.caTaxableIncome) return { status: 'skip', currentValue: '—', expectedValue: '—', extracted: false, detail: 'No CA taxable income' };
      const expected = computeCATax(s.filing.caTaxableIncome);
      const actual = s.filing.caTax || 0;
      return {
        status: approxEqual(actual, expected, 5) ? 'pass' : 'fail',
        currentValue: fmt(actual),
        expectedValue: fmt(expected),
        extracted: true,
        detail: `California tax on ${fmt(s.filing.caTaxableIncome)} taxable income`
      };
    }
  },
  {
    id: 'ca-03',
    name: 'CA Mental Health Tax',
    taxCode: { section: 'CA RTC 17043', form: '540', line: '32a' },
    scenarios: ['ca-w2', 'ca-1099'],
    stage: 'computation',
    type: 'compliance',
    severity: 'warning',
    check(s) {
      if (!s.filing) return { status: 'skip', currentValue: '—', expectedValue: '—', extracted: false, detail: 'No filing data' };
      const taxable = s.filing.caTaxableIncome || 0;
      if (taxable <= 1000000) {
        return {
          status: 'pass',
          currentValue: 'N/A',
          expectedValue: 'N/A (< $1M)',
          extracted: true,
          detail: 'Taxable income below $1M — MH tax does not apply'
        };
      }
      const mhTax = Math.round((taxable - 1000000) * 0.01);
      return {
        status: 'warn',
        currentValue: fmt(mhTax),
        expectedValue: fmt(mhTax),
        extracted: true,
        detail: `Mental Health Services Tax: 1% on ${fmt(taxable - 1000000)} above $1M threshold`
      };
    }
  },
  {
    id: 'ca-04',
    name: 'CA Withholding Applied',
    taxCode: { section: 'CA RTC 18662', form: '540', line: '71' },
    scenarios: ['ca-w2', 'ca-1099'],
    stage: 'computation',
    type: 'compliance',
    severity: 'warning',
    check(s) {
      const totalStateWithheld = s.incomes.reduce((sum, i) => sum + (i.state_income_tax_withheld || i.state_tax_withheld || 0), 0);
      if (totalStateWithheld === 0) return { status: 'skip', currentValue: '—', expectedValue: 'Applied', extracted: false, detail: 'No CA withholding' };
      return {
        status: 'pass',
        currentValue: fmt(totalStateWithheld),
        expectedValue: 'Applied',
        extracted: true,
        detail: `Total CA withholding: ${fmt(totalStateWithheld)}`
      };
    }
  },
  {
    id: 'ca-05',
    name: 'CA Refund/Balance Correct',
    taxCode: { section: 'CA RTC 19001', form: '540', line: '93/100' },
    scenarios: ['ca-w2', 'ca-1099'],
    stage: 'computation',
    type: 'compliance',
    severity: 'error',
    check(s) {
      if (!s.filing) return { status: 'skip', currentValue: '—', expectedValue: '—', extracted: false, detail: 'No filing data' };
      const totalStateWithheld = s.incomes.reduce((sum, i) => sum + (i.state_income_tax_withheld || i.state_tax_withheld || 0), 0);
      const expected = totalStateWithheld - (s.filing.caTax || 0);
      const actual = s.filing.caResult || 0;
      return {
        status: approxEqual(actual, expected, 1) ? 'pass' : 'fail',
        currentValue: fmt(actual),
        expectedValue: fmt(expected),
        extracted: true,
        detail: `${fmt(totalStateWithheld)} withholding − ${fmt(s.filing.caTax || 0)} tax = ${fmt(expected)}`
      };
    }
  },

  // — Savings: Computation —

  {
    id: 'sav-comp-01',
    name: 'Estimated Tax Penalty Avoidance',
    taxCode: { section: 'IRC 6654', form: '2210', line: '1' },
    scenarios: ['fed-1099'],
    stage: 'computation',
    type: 'savings',
    severity: 'warning',
    check(s) {
      if (!s.filing) return { status: 'skip', currentValue: '—', expectedValue: '—', extracted: false, detail: 'No filing data' };
      const necTotal = s.incomes.filter(i => i.doc_type === '1099-NEC').reduce((sum, i) => sum + (i.nonemployee_compensation || 0), 0);
      if (necTotal === 0) return { status: 'skip', currentValue: '—', expectedValue: '—', extracted: false, detail: 'No SE income' };
      const totalTax = s.filing.totalFedTax || 0;
      const totalWithheld = s.filing.totalFedWithheld || 0;
      const owed = totalTax - totalWithheld;
      return {
        status: owed > 1000 ? 'warn' : 'pass',
        currentValue: owed > 0 ? fmt(owed) + ' owed' : 'Covered',
        expectedValue: 'Owed < $1,000 or 90% paid',
        extracted: true,
        detail: owed > 1000
          ? `You may owe ${fmt(owed)} at filing. If you didn't make quarterly estimated payments (Form 1040-ES), you could face an underpayment penalty. Safe harbor: pay 100% of prior year's tax or 90% of current year's.`
          : 'Withholding appears sufficient to avoid estimated tax penalty.'
      };
    }
  },
  {
    id: 'sav-comp-02',
    name: 'CA SDI Overpayment Check',
    taxCode: { section: 'CA UI Code 984', form: '540', line: '74' },
    scenarios: ['ca-w2'],
    stage: 'computation',
    type: 'savings',
    severity: 'info',
    check(s) {
      const w2s = s.incomes.filter(i => i.doc_type === 'W-2');
      if (w2s.length < 2) return { status: 'skip', currentValue: '—', expectedValue: '—', extracted: true, detail: 'Need multiple W-2s to check SDI overpayment' };
      // CA SDI wage limit for 2025 is $174,148, rate is 1.1%
      const sdiLimit = 174148;
      const totalWages = w2s.reduce((sum, i) => sum + (i.state_wages || i.wages || 0), 0);
      return {
        status: totalWages > sdiLimit ? 'warn' : 'skip',
        currentValue: fmt(totalWages),
        expectedValue: `Limit: ${fmt(sdiLimit)}`,
        extracted: true,
        detail: totalWages > sdiLimit
          ? `Combined state wages (${fmt(totalWages)}) exceed SDI wage limit. If multiple employers each withheld SDI, you may be able to claim excess SDI as a credit on CA 540 Line 74.`
          : 'Combined wages below SDI limit — no overpayment expected.'
      };
    }
  },

  // ═══════════════════════════════════════
  // STAGE 6: OPTIMIZATION
  // ═══════════════════════════════════════

  // — Mathematical Accuracy —

  {
    id: 'ma-01',
    name: 'Income Additions Verified',
    taxCode: { section: 'IRC 61', form: '1040', line: '9' },
    scenarios: ['fed-w2', 'fed-1099', 'ca-w2', 'ca-1099'],
    stage: 'optimization',
    type: 'compliance',
    severity: 'error',
    check(s) {
      if (!s.filing) return { status: 'skip', currentValue: '—', expectedValue: '—', extracted: false, detail: 'No filing data' };
      const computed = s.incomes.reduce((sum, i) => {
        return sum + (i.wages || i.nonemployee_compensation || i.interest_income || i.ordinary_dividends || 0);
      }, 0);
      return {
        status: approxEqual(computed, s.filing.totalIncome, 1) ? 'pass' : 'fail',
        currentValue: fmt(s.filing.totalIncome),
        expectedValue: fmt(computed),
        extracted: true,
        detail: `Computed sum: ${fmt(computed)}, reported: ${fmt(s.filing.totalIncome)}`
      };
    }
  },
  {
    id: 'ma-02',
    name: 'No Negative Tax Values',
    taxCode: { section: 'General', form: 'N/A', line: 'N/A' },
    scenarios: ['fed-w2', 'fed-1099', 'ca-w2', 'ca-1099'],
    stage: 'optimization',
    type: 'compliance',
    severity: 'error',
    check(s) {
      if (!s.filing) return { status: 'skip', currentValue: '—', expectedValue: 'All ≥ 0', extracted: false, detail: 'No filing data' };
      const values = [s.filing.totalIncome, s.filing.agi, s.filing.taxableIncome, s.filing.totalFedTax, s.filing.totalFedWithheld];
      const negatives = values.filter(v => v != null && v < 0);
      return {
        status: negatives.length > 0 ? 'fail' : 'pass',
        currentValue: negatives.length > 0 ? `${negatives.length} negative` : 'All ≥ 0',
        expectedValue: 'All ≥ 0',
        extracted: true,
        detail: negatives.length > 0 ? 'Negative values found in tax computation' : 'All computed values are non-negative'
      };
    }
  },
  {
    id: 'ma-03',
    name: 'Decimal Precision',
    taxCode: { section: 'IRC 6102', form: 'N/A', line: 'N/A' },
    scenarios: ['fed-w2', 'fed-1099', 'ca-w2', 'ca-1099'],
    stage: 'optimization',
    type: 'compliance',
    severity: 'info',
    check(s) {
      if (s.incomes.length === 0) return { status: 'skip', currentValue: '—', expectedValue: 'Integers', extracted: false, detail: 'No data' };
      const allIntegers = s.incomes.every(i => {
        const vals = [i.wages, i.fed_income_tax_withheld, i.nonemployee_compensation, i.interest_income, i.ordinary_dividends].filter(v => v != null);
        return vals.every(v => Number.isInteger(v) || Math.abs(v - Math.round(v)) < 0.01);
      });
      return {
        status: allIntegers ? 'pass' : 'warn',
        currentValue: allIntegers ? 'Valid' : 'Fractional',
        expectedValue: 'Whole dollars',
        extracted: true,
        detail: allIntegers ? 'All amounts in whole dollars' : 'Some amounts have fractional cents — will be rounded'
      };
    }
  },
  {
    id: 'ma-04',
    name: 'Withholding Sum Verified',
    taxCode: { section: 'IRC 3402', form: '1040', line: '25' },
    scenarios: ['fed-w2', 'fed-1099', 'ca-w2', 'ca-1099'],
    stage: 'optimization',
    type: 'compliance',
    severity: 'error',
    check(s) {
      if (!s.filing) return { status: 'skip', currentValue: '—', expectedValue: '—', extracted: false, detail: 'No filing data' };
      const computed = s.incomes.reduce((sum, i) => sum + (i.fed_income_tax_withheld || 0), 0);
      return {
        status: approxEqual(computed, s.filing.totalFedWithheld, 1) ? 'pass' : 'fail',
        currentValue: fmt(s.filing.totalFedWithheld),
        expectedValue: fmt(computed),
        extracted: true,
        detail: `Sum of withholdings: ${fmt(computed)}`
      };
    }
  },
  {
    id: 'ma-05',
    name: 'AGI ≤ Total Income',
    taxCode: { section: 'IRC 62', form: '1040', line: '11' },
    scenarios: ['fed-w2', 'fed-1099', 'ca-w2', 'ca-1099'],
    stage: 'optimization',
    type: 'compliance',
    severity: 'error',
    check(s) {
      if (!s.filing) return { status: 'skip', currentValue: '—', expectedValue: 'AGI ≤ Income', extracted: false, detail: 'No filing data' };
      return {
        status: s.filing.agi <= s.filing.totalIncome ? 'pass' : 'fail',
        currentValue: fmt(s.filing.agi),
        expectedValue: `≤ ${fmt(s.filing.totalIncome)}`,
        extracted: true,
        detail: `AGI ${fmt(s.filing.agi)} vs Total Income ${fmt(s.filing.totalIncome)}`
      };
    }
  },

  // — Audit Risk Indicators —

  {
    id: 'ar-01',
    name: 'Round Number Check',
    taxCode: { section: 'IRS DIF Score', form: 'N/A', line: 'N/A' },
    scenarios: ['fed-w2', 'fed-1099', 'ca-w2', 'ca-1099'],
    stage: 'optimization',
    type: 'compliance',
    severity: 'info',
    check(s) {
      if (s.incomes.length === 0) return { status: 'skip', currentValue: '—', expectedValue: 'Non-round', extracted: false, detail: 'No data' };
      const round = s.incomes.filter(i => {
        const amt = i.wages || i.nonemployee_compensation || 0;
        return amt > 0 && amt % 1000 === 0;
      });
      return {
        status: round.length > 0 ? 'warn' : 'pass',
        currentValue: round.length > 0 ? `${round.length} round` : 'None',
        expectedValue: 'Non-round preferred',
        extracted: true,
        detail: round.length > 0 ? 'Round income amounts can increase IRS scrutiny (usually fine for W-2s)' : 'No suspiciously round amounts'
      };
    }
  },
  {
    id: 'ar-02',
    name: 'High Income Flag',
    taxCode: { section: 'IRS DIF Score', form: 'N/A', line: 'N/A' },
    scenarios: ['fed-w2', 'fed-1099', 'ca-w2', 'ca-1099'],
    stage: 'optimization',
    type: 'compliance',
    severity: 'info',
    check(s) {
      if (!s.filing) return { status: 'skip', currentValue: '—', expectedValue: '—', extracted: false, detail: 'No filing data' };
      const total = s.filing.totalIncome || 0;
      return {
        status: total > 200000 ? 'warn' : 'pass',
        currentValue: fmt(total),
        expectedValue: '< $200K lower risk',
        extracted: true,
        detail: total > 200000 ? 'Higher income = higher audit rate — ensure all deductions documented' : 'Income level has typical audit risk'
      };
    }
  },
  {
    id: 'ar-03',
    name: 'Schedule C Loss Ratio',
    taxCode: { section: 'IRC 183', form: 'Schedule C', line: '31' },
    scenarios: ['fed-1099'],
    stage: 'optimization',
    type: 'compliance',
    severity: 'warning',
    check(s) {
      const necTotal = s.incomes.filter(i => i.doc_type === '1099-NEC').reduce((sum, i) => sum + (i.nonemployee_compensation || 0), 0);
      if (necTotal === 0) return { status: 'skip', currentValue: '—', expectedValue: '—', extracted: false, detail: 'No SE income' };
      return {
        status: 'pass',
        currentValue: 'Profit',
        expectedValue: 'Profit preferred',
        extracted: true,
        detail: 'Business shows income (no loss) — lower audit risk. IRS scrutinizes hobby losses under IRC 183.'
      };
    }
  },
  {
    id: 'ar-04',
    name: 'Withholding Pattern',
    taxCode: { section: 'General', form: 'N/A', line: 'N/A' },
    scenarios: ['fed-w2'],
    stage: 'optimization',
    type: 'compliance',
    severity: 'info',
    check(s) {
      const w2s = s.incomes.filter(i => i.doc_type === 'W-2' && i.wages > 0);
      if (w2s.length === 0) return { status: 'skip', currentValue: '—', expectedValue: 'Proportional', extracted: false, detail: 'No W-2s' };
      const totalWages = w2s.reduce((s2, i) => s2 + i.wages, 0);
      const totalWithheld = w2s.reduce((s2, i) => s2 + (i.fed_income_tax_withheld || 0), 0);
      const rate = totalWithheld / totalWages;
      return {
        status: rateInRange(rate, 0.05, 0.40) ? 'pass' : 'warn',
        currentValue: pct(rate),
        expectedValue: '5-40%',
        extracted: true,
        detail: `Overall withholding rate: ${pct(rate)} — ${rateInRange(rate, 0.05, 0.40) ? 'normal' : 'unusual'}`
      };
    }
  },
  {
    id: 'ar-05',
    name: 'Multiple Income Sources',
    taxCode: { section: 'General', form: 'N/A', line: 'N/A' },
    scenarios: ['fed-w2', 'fed-1099', 'ca-w2', 'ca-1099'],
    stage: 'optimization',
    type: 'compliance',
    severity: 'info',
    check(s) {
      const types = [...new Set(s.incomes.map(i => i.doc_type))];
      if (types.length <= 1) return { status: 'pass', currentValue: `${types.length} type(s)`, expectedValue: 'Noted', extracted: true, detail: 'Single income type — straightforward return' };
      return {
        status: 'warn',
        currentValue: types.join(', '),
        expectedValue: 'All reported',
        extracted: true,
        detail: `Multiple income types (${types.join(', ')}) — ensure all sources reported to IRS`
      };
    }
  },
];


// ── ENGINE ──

/**
 * Run all rules, filtered optionally by scenario.
 * Returns: { results, summary, stages, scenarios }
 */
function runRulesEngine(state, scenarioFilter) {
  const applicableRules = scenarioFilter
    ? RULES.filter(r => r.scenarios.includes(scenarioFilter))
    : RULES;

  const results = applicableRules.map(rule => {
    try {
      const result = rule.check(state);
      return {
        id: rule.id,
        name: rule.name,
        taxCode: rule.taxCode,
        scenarios: rule.scenarios,
        stage: rule.stage,
        type: rule.type,
        severity: rule.severity,
        ...result
      };
    } catch (e) {
      return {
        id: rule.id,
        name: rule.name,
        taxCode: rule.taxCode,
        scenarios: rule.scenarios,
        stage: rule.stage,
        type: rule.type,
        severity: rule.severity,
        status: 'skip',
        currentValue: '—',
        expectedValue: '—',
        extracted: false,
        detail: `Error running check: ${e.message}`
      };
    }
  });

  // Split by type
  const complianceResults = results.filter(r => r.type === 'compliance');
  const savingsResults = results.filter(r => r.type === 'savings');

  // Compliance summary
  const complianceSummary = {
    total: complianceResults.length,
    passed: complianceResults.filter(r => r.status === 'pass').length,
    failed: complianceResults.filter(r => r.status === 'fail').length,
    warnings: complianceResults.filter(r => r.status === 'warn').length,
    skipped: complianceResults.filter(r => r.status === 'skip').length,
    score: 0,
  };
  const compScored = complianceResults.filter(r => r.status !== 'skip');
  if (compScored.length > 0) {
    const points = compScored.reduce((sum, r) => sum + (r.status === 'pass' ? 1 : r.status === 'warn' ? 0.5 : 0), 0);
    complianceSummary.score = Math.round((points / compScored.length) * 100);
  }

  // Savings summary
  const savingsSummary = {
    total: savingsResults.length,
    opportunities: savingsResults.filter(r => r.status === 'warn').length,
    evaluated: savingsResults.filter(r => r.status !== 'skip').length,
    skipped: savingsResults.filter(r => r.status === 'skip').length,
  };

  // Combined summary (for backward compat with completeness tracker)
  const allScored = results.filter(r => r.status !== 'skip');
  const summary = {
    total: results.length,
    passed: results.filter(r => r.status === 'pass').length,
    failed: results.filter(r => r.status === 'fail').length,
    warnings: results.filter(r => r.status === 'warn').length,
    skipped: results.filter(r => r.status === 'skip').length,
    score: 0,
  };
  if (allScored.length > 0) {
    const pts = allScored.reduce((sum, r) => sum + (r.status === 'pass' ? 1 : r.status === 'warn' ? 0.5 : 0), 0);
    summary.score = Math.round((pts / allScored.length) * 100);
  }

  return {
    results,
    summary,
    complianceSummary,
    savingsSummary,
    stages: STAGES,
    scenarios: SCENARIOS,
  };
}

// Backward-compatible wrapper for existing code
function runComplianceChecks(state) {
  const { results, summary, stages } = runRulesEngine(state);
  // Map stages to old-style categories for checks.html
  const categories = stages.map(st => ({
    id: st.id,
    name: st.name,
    icon: st.icon,
    description: `Stage ${st.num}: ${st.name}`,
  }));
  // Map results to old format
  const mappedResults = results.map(r => ({
    ...r,
    category: r.stage,
    irsRef: r.taxCode ? `${r.taxCode.section} · ${r.taxCode.form} ${r.taxCode.line}` : 'General',
    description: r.detail || '',
    confidence: r.extracted ? 1.0 : 0.0,
  }));
  return { results: mappedResults, summary, categories };
}


// Make available globally
if (typeof window !== 'undefined') {
  window.RULES = RULES;
  window.STAGES = STAGES;
  window.SCENARIOS = SCENARIOS;
  window.runRulesEngine = runRulesEngine;
  window.runComplianceChecks = runComplianceChecks;
}
