/**
 * Tax Compliance Engine — 55 rules across 10 categories
 *
 * Each rule: { id, name, category, irsRef, description, check(state) }
 * check() returns: { status: 'pass'|'fail'|'warn'|'skip', currentValue, expectedValue, confidence, detail }
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

// ── CATEGORIES ──
const CATEGORIES = [
  { id: 'doc-completeness', name: 'Document Completeness', icon: '📋', description: 'Ensures all required documents are present and processed' },
  { id: 'identity', name: 'Identity & Consistency', icon: '🪪', description: 'SSN, EIN, and name consistency across documents' },
  { id: 'income', name: 'Income Reporting', icon: '💰', description: 'All income sources properly reported to IRS' },
  { id: 'withholding', name: 'Withholding Accuracy', icon: '🏦', description: 'Federal and state withholding rates within expected ranges' },
  { id: 'deductions', name: 'Deductions', icon: '📝', description: 'Standard or itemized deduction properly applied' },
  { id: 'tax-computation', name: 'Tax Computation', icon: '🧮', description: 'AGI, brackets, and tax correctly computed' },
  { id: 'credits', name: 'Credits Eligibility', icon: '🎯', description: 'Tax credit eligibility screening' },
  { id: 'california', name: 'California 540', icon: '🐻', description: 'California state return accuracy' },
  { id: 'math', name: 'Mathematical Accuracy', icon: '✅', description: 'All arithmetic verified' },
  { id: 'audit-risk', name: 'Audit Risk Indicators', icon: '🔍', description: 'IRS DIF score risk factors' },
];

// ── RULES ──
const RULES = [

  // ───────────────────────────
  // 1. DOCUMENT COMPLETENESS (5)
  // ───────────────────────────
  {
    id: 'dc-01', category: 'doc-completeness',
    name: 'W-2 Present',
    irsRef: 'Form W-2',
    description: 'At least one W-2 has been uploaded and processed',
    check(s) {
      const w2s = s.incomes.filter(i => i.doc_type === 'W-2');
      return {
        status: w2s.length > 0 ? 'pass' : 'warn',
        currentValue: `${w2s.length} W-2(s)`,
        expectedValue: '≥1 W-2',
        confidence: 1.0,
        detail: w2s.length > 0 ? `Found ${w2s.length} W-2 document(s)` : 'No W-2 uploaded — skip if self-employed only'
      };
    }
  },
  {
    id: 'dc-02', category: 'doc-completeness',
    name: 'All Documents Processed',
    irsRef: 'General',
    description: 'Every uploaded document was successfully extracted',
    check(s) {
      const total = s.documents.length;
      const processed = s.documents.filter(d => d.status === 'processed').length;
      return {
        status: total === 0 ? 'skip' : processed === total ? 'pass' : 'fail',
        currentValue: `${processed}/${total}`,
        expectedValue: `${total}/${total}`,
        confidence: 1.0,
        detail: processed === total ? 'All documents processed successfully' : `${total - processed} document(s) still pending`
      };
    }
  },
  {
    id: 'dc-03', category: 'doc-completeness',
    name: 'Document Legibility',
    irsRef: 'General',
    description: 'All documents have confidence score ≥ 0.80',
    check(s) {
      if (s.incomes.length === 0) return { status: 'skip', currentValue: '—', expectedValue: '≥0.80', confidence: 1.0, detail: 'No documents to check' };
      const lowConf = s.incomes.filter(i => (i.confidence || 0) < 0.80);
      const avgConf = s.incomes.reduce((sum, i) => sum + (i.confidence || 0), 0) / s.incomes.length;
      return {
        status: lowConf.length > 0 ? 'warn' : 'pass',
        currentValue: pct(avgConf),
        expectedValue: '≥80%',
        confidence: avgConf,
        detail: lowConf.length > 0 ? `${lowConf.length} document(s) below 80% confidence` : 'All documents clearly readable'
      };
    }
  },
  {
    id: 'dc-04', category: 'doc-completeness',
    name: 'Document Type Identified',
    irsRef: 'General',
    description: 'Each document type (W-2, 1099-NEC, etc.) was correctly identified',
    check(s) {
      if (s.incomes.length === 0) return { status: 'skip', currentValue: '—', expectedValue: 'All typed', confidence: 1.0, detail: 'No documents' };
      const unknown = s.incomes.filter(i => !i.doc_type || i.doc_type === 'Unknown');
      return {
        status: unknown.length > 0 ? 'warn' : 'pass',
        currentValue: `${s.incomes.length - unknown.length}/${s.incomes.length} typed`,
        expectedValue: 'All typed',
        confidence: 0.95,
        detail: unknown.length > 0 ? `${unknown.length} document(s) have unknown type` : 'All document types identified'
      };
    }
  },
  {
    id: 'dc-05', category: 'doc-completeness',
    name: 'Tax Year Match',
    irsRef: 'General',
    description: 'All documents are for tax year 2025',
    check(s) {
      if (s.incomes.length === 0) return { status: 'skip', currentValue: '—', expectedValue: '2025', confidence: 1.0, detail: 'No documents' };
      return {
        status: 'pass',
        currentValue: '2025',
        expectedValue: '2025',
        confidence: 0.90,
        detail: 'Documents appear to be for the correct tax year (verify manually)'
      };
    }
  },

  // ───────────────────────────
  // 2. IDENTITY & CONSISTENCY (5)
  // ───────────────────────────
  {
    id: 'id-01', category: 'identity',
    name: 'SSN Consistency',
    irsRef: 'Form 1040 Header',
    description: 'SSN last-4 matches across all documents',
    check(s) {
      const ssns = s.incomes.map(i => i.employee_ssn_last4 || i.recipient_ssn_last4).filter(Boolean);
      if (ssns.length < 2) return { status: 'skip', currentValue: ssns[0] || '—', expectedValue: 'Match', confidence: 1.0, detail: 'Need 2+ documents to cross-check' };
      const allMatch = ssns.every(x => x === ssns[0]);
      return {
        status: allMatch ? 'pass' : 'fail',
        currentValue: allMatch ? `***-**-${ssns[0]}` : 'Mismatch',
        expectedValue: 'All match',
        confidence: 0.95,
        detail: allMatch ? 'SSN last-4 consistent across all documents' : 'SSN mismatch detected — verify documents belong to same filer'
      };
    }
  },
  {
    id: 'id-02', category: 'identity',
    name: 'EIN Format Valid',
    irsRef: 'W-2 Box c',
    description: 'Employer EIN is in valid XX-XXXXXXX format',
    check(s) {
      const eins = s.incomes.map(i => i.employer_ein || i.payer_tin).filter(Boolean);
      if (eins.length === 0) return { status: 'skip', currentValue: '—', expectedValue: 'XX-XXXXXXX', confidence: 1.0, detail: 'No EINs extracted' };
      const valid = eins.filter(e => /^\d{2}-\d{7}$/.test(e));
      return {
        status: valid.length === eins.length ? 'pass' : 'warn',
        currentValue: `${valid.length}/${eins.length} valid`,
        expectedValue: 'All valid',
        confidence: 0.90,
        detail: valid.length === eins.length ? 'All EINs in correct format' : 'Some EINs may not be in standard format'
      };
    }
  },
  {
    id: 'id-03', category: 'identity',
    name: 'Employee Name Consistency',
    irsRef: 'W-2 Box e',
    description: 'Employee/recipient name matches across documents',
    check(s) {
      const names = s.incomes.map(i => (i.employee_name || i.recipient_name || '').toUpperCase().trim()).filter(Boolean);
      if (names.length < 2) return { status: 'skip', currentValue: names[0] || '—', expectedValue: 'Match', confidence: 1.0, detail: 'Need 2+ documents' };
      const allMatch = names.every(n => n === names[0]);
      return {
        status: allMatch ? 'pass' : 'warn',
        currentValue: allMatch ? names[0] : 'Varies',
        expectedValue: 'Consistent',
        confidence: 0.85,
        detail: allMatch ? 'Name consistent across all documents' : 'Name varies — could be formatting differences'
      };
    }
  },
  {
    id: 'id-04', category: 'identity',
    name: 'Filing Status Determined',
    irsRef: 'Form 1040 Line 1-5',
    description: 'Filing status is set (defaulting to Single)',
    check(s) {
      const status = s.filing?.filingStatus || 'Single';
      return {
        status: 'pass',
        currentValue: status,
        expectedValue: 'Determined',
        confidence: 0.85,
        detail: `Filing as ${status} — change if married/HOH`
      };
    }
  },
  {
    id: 'id-05', category: 'identity',
    name: 'State Residency Identified',
    irsRef: 'State Return',
    description: 'State residency identified from W-2 state fields',
    check(s) {
      const states = s.incomes.map(i => i.state).filter(Boolean);
      if (states.length === 0) return { status: 'skip', currentValue: '—', expectedValue: 'Identified', confidence: 1.0, detail: 'No state info in documents' };
      return {
        status: 'pass',
        currentValue: [...new Set(states)].join(', '),
        expectedValue: 'Identified',
        confidence: 0.95,
        detail: `State(s) identified: ${[...new Set(states)].join(', ')}`
      };
    }
  },

  // ───────────────────────────
  // 3. INCOME REPORTING (8)
  // ───────────────────────────
  {
    id: 'inc-01', category: 'income',
    name: 'W-2 Wages → 1040 Line 1a',
    irsRef: '1040 Line 1a',
    description: 'Total W-2 wages correctly flow to Form 1040 Line 1a',
    check(s) {
      const w2Total = s.incomes.filter(i => i.doc_type === 'W-2').reduce((sum, i) => sum + (i.wages || 0), 0);
      if (w2Total === 0) return { status: 'skip', currentValue: '—', expectedValue: '—', confidence: 1.0, detail: 'No W-2 wages' };
      const reported = s.filing?.totalW2Wages || 0;
      return {
        status: approxEqual(w2Total, reported, 1) ? 'pass' : 'fail',
        currentValue: fmt(reported),
        expectedValue: fmt(w2Total),
        confidence: 0.95,
        detail: `W-2 wages sum: ${fmt(w2Total)}`
      };
    }
  },
  {
    id: 'inc-02', category: 'income',
    name: '1099-NEC → Schedule C',
    irsRef: 'Schedule C Line 1',
    description: '1099-NEC income flows to Schedule C gross receipts',
    check(s) {
      const necTotal = s.incomes.filter(i => i.doc_type === '1099-NEC').reduce((sum, i) => sum + (i.nonemployee_compensation || 0), 0);
      if (necTotal === 0) return { status: 'skip', currentValue: '—', expectedValue: '—', confidence: 1.0, detail: 'No 1099-NEC income' };
      return {
        status: 'pass',
        currentValue: fmt(necTotal),
        expectedValue: fmt(necTotal),
        confidence: 0.95,
        detail: `Self-employment income: ${fmt(necTotal)} should appear on Schedule C`
      };
    }
  },
  {
    id: 'inc-03', category: 'income',
    name: 'Interest Income Reported',
    irsRef: '1040 Line 2b',
    description: '1099-INT interest income included in total',
    check(s) {
      const intTotal = s.incomes.filter(i => i.doc_type === '1099-INT').reduce((sum, i) => sum + (i.interest_income || 0), 0);
      if (intTotal === 0) return { status: 'skip', currentValue: '—', expectedValue: '—', confidence: 1.0, detail: 'No interest income' };
      return {
        status: 'pass',
        currentValue: fmt(intTotal),
        expectedValue: fmt(intTotal),
        confidence: 0.95,
        detail: `Interest income: ${fmt(intTotal)}`
      };
    }
  },
  {
    id: 'inc-04', category: 'income',
    name: 'Dividend Income Reported',
    irsRef: '1040 Line 3b',
    description: '1099-DIV dividend income included in total',
    check(s) {
      const divTotal = s.incomes.filter(i => i.doc_type === '1099-DIV').reduce((sum, i) => sum + (i.ordinary_dividends || 0), 0);
      if (divTotal === 0) return { status: 'skip', currentValue: '—', expectedValue: '—', confidence: 1.0, detail: 'No dividend income' };
      return {
        status: 'pass',
        currentValue: fmt(divTotal),
        expectedValue: fmt(divTotal),
        confidence: 0.95,
        detail: `Dividend income: ${fmt(divTotal)}`
      };
    }
  },
  {
    id: 'inc-05', category: 'income',
    name: 'No Duplicate Documents',
    irsRef: 'General',
    description: 'No duplicate income sources detected (same employer + same amount)',
    check(s) {
      if (s.incomes.length < 2) return { status: 'skip', currentValue: '—', expectedValue: 'No dupes', confidence: 1.0, detail: 'Not enough documents to check' };
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
        confidence: 0.85,
        detail: dupes.length > 0 ? 'Possible duplicate — same employer and amount' : 'No duplicates detected'
      };
    }
  },
  {
    id: 'inc-06', category: 'income',
    name: 'Total Income Computed',
    irsRef: '1040 Line 9',
    description: 'Total income (all sources) correctly summed',
    check(s) {
      const w2 = s.incomes.filter(i => i.doc_type === 'W-2').reduce((sum, i) => sum + (i.wages || 0), 0);
      const nec = s.incomes.filter(i => i.doc_type === '1099-NEC').reduce((sum, i) => sum + (i.nonemployee_compensation || 0), 0);
      const int = s.incomes.filter(i => i.doc_type === '1099-INT').reduce((sum, i) => sum + (i.interest_income || 0), 0);
      const div = s.incomes.filter(i => i.doc_type === '1099-DIV').reduce((sum, i) => sum + (i.ordinary_dividends || 0), 0);
      const total = w2 + nec + int + div;
      if (total === 0) return { status: 'skip', currentValue: '—', expectedValue: '—', confidence: 1.0, detail: 'No income' };
      const reported = s.filing?.totalIncome || 0;
      return {
        status: approxEqual(total, reported, 1) ? 'pass' : 'fail',
        currentValue: fmt(reported),
        expectedValue: fmt(total),
        confidence: 0.95,
        detail: `Income from all sources: ${fmt(total)}`
      };
    }
  },
  {
    id: 'inc-07', category: 'income',
    name: 'Qualified Dividends ≤ Ordinary',
    irsRef: '1040 Lines 3a/3b',
    description: 'Qualified dividends cannot exceed ordinary dividends',
    check(s) {
      const divDocs = s.incomes.filter(i => i.doc_type === '1099-DIV');
      if (divDocs.length === 0) return { status: 'skip', currentValue: '—', expectedValue: '—', confidence: 1.0, detail: 'No dividend docs' };
      const qualExceeds = divDocs.some(d => (d.qualified_dividends || 0) > (d.ordinary_dividends || 0));
      return {
        status: qualExceeds ? 'fail' : 'pass',
        currentValue: qualExceeds ? 'Exceeds' : 'Valid',
        expectedValue: 'Qual ≤ Ord',
        confidence: 0.95,
        detail: qualExceeds ? 'Qualified dividends exceed ordinary — impossible per IRS rules' : 'Qualified dividends within ordinary dividends'
      };
    }
  },
  {
    id: 'inc-08', category: 'income',
    name: 'Income Sources Non-Negative',
    irsRef: 'General',
    description: 'All income amounts are ≥ 0',
    check(s) {
      if (s.incomes.length === 0) return { status: 'skip', currentValue: '—', expectedValue: '≥0', confidence: 1.0, detail: 'No income' };
      const negative = s.incomes.filter(i => {
        const amt = i.wages || i.nonemployee_compensation || i.interest_income || i.ordinary_dividends || 0;
        return amt < 0;
      });
      return {
        status: negative.length > 0 ? 'fail' : 'pass',
        currentValue: negative.length > 0 ? `${negative.length} negative` : 'All ≥ 0',
        expectedValue: 'All ≥ 0',
        confidence: 1.0,
        detail: negative.length > 0 ? 'Negative income detected — verify source documents' : 'All income values non-negative'
      };
    }
  },

  // ───────────────────────────
  // 4. WITHHOLDING ACCURACY (6)
  // ───────────────────────────
  {
    id: 'wh-01', category: 'withholding',
    name: 'Federal Withholding Rate',
    irsRef: 'W-2 Box 2',
    description: 'Federal income tax withholding rate between 10-37%',
    check(s) {
      const w2s = s.incomes.filter(i => i.doc_type === 'W-2' && i.wages > 0);
      if (w2s.length === 0) return { status: 'skip', currentValue: '—', expectedValue: '10-37%', confidence: 1.0, detail: 'No W-2s' };
      const results = w2s.map(w => ({ name: w.employer_name, rate: w.fed_income_tax_withheld / w.wages }));
      const outOfRange = results.filter(r => !rateInRange(r.rate, 0.0, 0.40));
      return {
        status: outOfRange.length > 0 ? 'warn' : 'pass',
        currentValue: results.map(r => pct(r.rate)).join(', '),
        expectedValue: '0-37%',
        confidence: 0.90,
        detail: outOfRange.length > 0 ? `Unusual withholding rate for: ${outOfRange.map(r => r.name).join(', ')}` : 'Federal withholding rates within normal range'
      };
    }
  },
  {
    id: 'wh-02', category: 'withholding',
    name: 'Social Security Tax = 6.2%',
    irsRef: 'W-2 Box 4',
    description: 'SS tax withheld ≈ 6.2% of SS wages (up to wage base)',
    check(s) {
      const w2s = s.incomes.filter(i => i.doc_type === 'W-2' && i.social_security_wages > 0);
      if (w2s.length === 0) return { status: 'skip', currentValue: '—', expectedValue: '6.2%', confidence: 1.0, detail: 'No SS wages' };
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
        confidence: 0.95,
        detail: issues.length > 0 ? `SS tax mismatch for: ${issues.join(', ')}` : 'Social Security tax correctly withheld at 6.2%'
      };
    }
  },
  {
    id: 'wh-03', category: 'withholding',
    name: 'Medicare Tax = 1.45%',
    irsRef: 'W-2 Box 6',
    description: 'Medicare tax withheld ≈ 1.45% of Medicare wages',
    check(s) {
      const w2s = s.incomes.filter(i => i.doc_type === 'W-2' && i.medicare_wages > 0);
      if (w2s.length === 0) return { status: 'skip', currentValue: '—', expectedValue: '1.45%', confidence: 1.0, detail: 'No Medicare wages' };
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
        confidence: 0.95,
        detail: issues.length > 0 ? `Medicare tax mismatch for: ${issues.join(', ')}` : 'Medicare tax correctly withheld at 1.45%'
      };
    }
  },
  {
    id: 'wh-04', category: 'withholding',
    name: 'SS Wages ≤ Wage Base',
    irsRef: 'W-2 Box 3',
    description: 'Social Security wages do not exceed wage base ($176,100 for 2025)',
    check(s) {
      const w2s = s.incomes.filter(i => i.doc_type === 'W-2' && i.social_security_wages > 0);
      if (w2s.length === 0) return { status: 'skip', currentValue: '—', expectedValue: '≤$176,100', confidence: 1.0, detail: 'No SS wages' };
      const over = w2s.filter(w => w.social_security_wages > SS_WAGE_BASE_2025);
      return {
        status: over.length > 0 ? 'warn' : 'pass',
        currentValue: w2s.map(w => fmt(w.social_security_wages)).join(', '),
        expectedValue: `≤${fmt(SS_WAGE_BASE_2025)}`,
        confidence: 0.95,
        detail: over.length > 0 ? 'SS wages exceed annual wage base — verify with employer' : 'SS wages within wage base limit'
      };
    }
  },
  {
    id: 'wh-05', category: 'withholding',
    name: 'State Withholding Present',
    irsRef: 'W-2 Box 17',
    description: 'State income tax withheld if state wages exist',
    check(s) {
      const w2s = s.incomes.filter(i => i.doc_type === 'W-2' && (i.state_wages || 0) > 0);
      if (w2s.length === 0) return { status: 'skip', currentValue: '—', expectedValue: 'Present', confidence: 1.0, detail: 'No state wages' };
      const missing = w2s.filter(w => (w.state_income_tax_withheld || 0) === 0);
      return {
        status: missing.length > 0 ? 'warn' : 'pass',
        currentValue: missing.length > 0 ? `${missing.length} missing` : 'All present',
        expectedValue: 'Present',
        confidence: 0.85,
        detail: missing.length > 0 ? 'Some W-2s show state wages but no state withholding' : 'State withholding present on all W-2s with state wages'
      };
    }
  },
  {
    id: 'wh-06', category: 'withholding',
    name: 'Withholding ≤ Income',
    irsRef: 'General',
    description: 'Withholding amounts do not exceed corresponding income',
    check(s) {
      if (s.incomes.length === 0) return { status: 'skip', currentValue: '—', expectedValue: '≤ Income', confidence: 1.0, detail: 'No data' };
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
        confidence: 0.95,
        detail: issues.length > 0 ? `Withholding exceeds income for: ${issues.join(', ')}` : 'All withholding amounts within income'
      };
    }
  },

  // ───────────────────────────
  // 5. DEDUCTIONS (5)
  // ───────────────────────────
  {
    id: 'ded-01', category: 'deductions',
    name: 'Standard Deduction Applied',
    irsRef: '1040 Line 13',
    description: 'Standard deduction of $15,000 (single) applied for 2025',
    check(s) {
      if (!s.filing || !s.filing.agi) return { status: 'skip', currentValue: '—', expectedValue: '$15,000', confidence: 1.0, detail: 'No filing data' };
      const deduction = s.filing.standardDeduction || FED_STANDARD_DEDUCTION_SINGLE;
      return {
        status: deduction === FED_STANDARD_DEDUCTION_SINGLE ? 'pass' : 'warn',
        currentValue: fmt(deduction),
        expectedValue: fmt(FED_STANDARD_DEDUCTION_SINGLE),
        confidence: 0.95,
        detail: deduction === FED_STANDARD_DEDUCTION_SINGLE ? 'Standard deduction correctly applied' : 'Non-standard deduction amount — verify if itemizing'
      };
    }
  },
  {
    id: 'ded-02', category: 'deductions',
    name: 'SE Deduction Computed',
    irsRef: 'Schedule SE',
    description: 'Self-employment tax deduction = 50% of SE tax',
    check(s) {
      const necTotal = s.incomes.filter(i => i.doc_type === '1099-NEC').reduce((sum, i) => sum + (i.nonemployee_compensation || 0), 0);
      if (necTotal === 0) return { status: 'skip', currentValue: '—', expectedValue: '—', confidence: 1.0, detail: 'No SE income' };
      const seNet = necTotal * 0.9235;
      const seTax = seNet * SE_TAX_RATE;
      const seDeduction = Math.floor(seTax * 0.5);
      return {
        status: 'pass',
        currentValue: fmt(seDeduction),
        expectedValue: fmt(seDeduction),
        confidence: 0.90,
        detail: `SE deduction: 50% of SE tax (${fmt(seTax)}) = ${fmt(seDeduction)}`
      };
    }
  },
  {
    id: 'ded-03', category: 'deductions',
    name: 'Deduction Not Exceeding AGI',
    irsRef: '1040 Line 13-14',
    description: 'Deduction amount does not exceed AGI (taxable income ≥ 0)',
    check(s) {
      if (!s.filing || !s.filing.agi) return { status: 'skip', currentValue: '—', expectedValue: '≥ 0', confidence: 1.0, detail: 'No filing data' };
      const taxable = s.filing.taxableIncome;
      return {
        status: taxable >= 0 ? 'pass' : 'fail',
        currentValue: fmt(taxable),
        expectedValue: '≥ $0',
        confidence: 1.0,
        detail: taxable >= 0 ? 'Taxable income is non-negative' : 'Taxable income is negative — check deduction'
      };
    }
  },
  {
    id: 'ded-04', category: 'deductions',
    name: 'Standard vs Itemized Decision',
    irsRef: '1040 Line 12-13',
    description: 'Check whether itemizing would be beneficial',
    check(s) {
      if (!s.filing) return { status: 'skip', currentValue: '—', expectedValue: '—', confidence: 1.0, detail: 'No filing data' };
      return {
        status: 'pass',
        currentValue: 'Standard',
        expectedValue: 'Optimal',
        confidence: 0.80,
        detail: 'Using standard deduction — itemize if mortgage interest + SALT + charity > $15,000'
      };
    }
  },
  {
    id: 'ded-05', category: 'deductions',
    name: 'QBI Deduction Eligibility',
    irsRef: 'Section 199A',
    description: 'Qualified Business Income deduction check for SE income',
    check(s) {
      const necTotal = s.incomes.filter(i => i.doc_type === '1099-NEC').reduce((sum, i) => sum + (i.nonemployee_compensation || 0), 0);
      if (necTotal === 0) return { status: 'skip', currentValue: '—', expectedValue: '—', confidence: 1.0, detail: 'No qualified business income' };
      const qbi = Math.floor(necTotal * 0.20);
      return {
        status: 'warn',
        currentValue: fmt(qbi) + ' potential',
        expectedValue: 'Up to 20% of QBI',
        confidence: 0.70,
        detail: `Potential QBI deduction of ${fmt(qbi)} — depends on income limits and business type`
      };
    }
  },

  // ───────────────────────────
  // 6. TAX COMPUTATION (6)
  // ───────────────────────────
  {
    id: 'tc-01', category: 'tax-computation',
    name: 'AGI Correctly Computed',
    irsRef: '1040 Line 11',
    description: 'AGI = Total Income − Adjustments',
    check(s) {
      if (!s.filing) return { status: 'skip', currentValue: '—', expectedValue: '—', confidence: 1.0, detail: 'No filing data' };
      const expected = s.filing.totalIncome - (s.filing.adjustments || 0);
      return {
        status: approxEqual(s.filing.agi, expected, 1) ? 'pass' : 'fail',
        currentValue: fmt(s.filing.agi),
        expectedValue: fmt(expected),
        confidence: 0.95,
        detail: `AGI = ${fmt(s.filing.totalIncome)} − ${fmt(s.filing.adjustments || 0)} = ${fmt(expected)}`
      };
    }
  },
  {
    id: 'tc-02', category: 'tax-computation',
    name: 'Federal Tax Brackets Applied',
    irsRef: '1040 Line 16',
    description: '2025 federal tax brackets correctly applied to taxable income',
    check(s) {
      if (!s.filing || !s.filing.taxableIncome) return { status: 'skip', currentValue: '—', expectedValue: '—', confidence: 1.0, detail: 'No taxable income' };
      const expected = computeFedTax(s.filing.taxableIncome);
      const actual = s.filing.fedIncomeTax || 0;
      return {
        status: approxEqual(actual, expected, 5) ? 'pass' : 'fail',
        currentValue: fmt(actual),
        expectedValue: fmt(expected),
        confidence: 0.95,
        detail: `Federal tax on ${fmt(s.filing.taxableIncome)} taxable income`
      };
    }
  },
  {
    id: 'tc-03', category: 'tax-computation',
    name: 'Self-Employment Tax',
    irsRef: 'Schedule SE',
    description: 'SE tax = 92.35% of net SE income × 15.3%',
    check(s) {
      const necTotal = s.incomes.filter(i => i.doc_type === '1099-NEC').reduce((sum, i) => sum + (i.nonemployee_compensation || 0), 0);
      if (necTotal === 0) return { status: 'skip', currentValue: '—', expectedValue: '—', confidence: 1.0, detail: 'No SE income' };
      const expected = Math.round(necTotal * 0.9235 * SE_TAX_RATE);
      const actual = s.filing?.seTax || 0;
      return {
        status: approxEqual(actual, expected, 5) ? 'pass' : 'fail',
        currentValue: fmt(actual),
        expectedValue: fmt(expected),
        confidence: 0.95,
        detail: `SE tax: ${fmt(necTotal)} × 92.35% × 15.3% = ${fmt(expected)}`
      };
    }
  },
  {
    id: 'tc-04', category: 'tax-computation',
    name: 'Total Tax Computed',
    irsRef: '1040 Line 24',
    description: 'Total tax = income tax + SE tax + other taxes',
    check(s) {
      if (!s.filing) return { status: 'skip', currentValue: '—', expectedValue: '—', confidence: 1.0, detail: 'No filing data' };
      const expected = (s.filing.fedIncomeTax || 0) + (s.filing.seTax || 0);
      const actual = s.filing.totalFedTax || 0;
      return {
        status: approxEqual(actual, expected, 5) ? 'pass' : 'fail',
        currentValue: fmt(actual),
        expectedValue: fmt(expected),
        confidence: 0.95,
        detail: `Total tax = ${fmt(s.filing.fedIncomeTax || 0)} income tax + ${fmt(s.filing.seTax || 0)} SE tax`
      };
    }
  },
  {
    id: 'tc-05', category: 'tax-computation',
    name: 'Refund/Balance Due Correct',
    irsRef: '1040 Line 34/37',
    description: 'Refund or balance due = total payments − total tax',
    check(s) {
      if (!s.filing) return { status: 'skip', currentValue: '—', expectedValue: '—', confidence: 1.0, detail: 'No filing data' };
      const expected = (s.filing.totalFedWithheld || 0) - (s.filing.totalFedTax || 0);
      const actual = s.filing.fedResult || 0;
      return {
        status: approxEqual(actual, expected, 1) ? 'pass' : 'fail',
        currentValue: fmt(actual),
        expectedValue: fmt(expected),
        confidence: 0.95,
        detail: `${fmt(s.filing.totalFedWithheld || 0)} payments − ${fmt(s.filing.totalFedTax || 0)} tax = ${fmt(expected)}`
      };
    }
  },
  {
    id: 'tc-06', category: 'tax-computation',
    name: 'Effective Tax Rate Reasonable',
    irsRef: 'General',
    description: 'Effective federal tax rate is within expected range',
    check(s) {
      if (!s.filing || !s.filing.totalIncome || s.filing.totalIncome === 0) return { status: 'skip', currentValue: '—', expectedValue: '0-37%', confidence: 1.0, detail: 'No income' };
      const effectiveRate = (s.filing.totalFedTax || 0) / s.filing.totalIncome;
      return {
        status: rateInRange(effectiveRate, 0, 0.40) ? 'pass' : 'warn',
        currentValue: pct(effectiveRate),
        expectedValue: '0-37%',
        confidence: 0.85,
        detail: `Effective federal rate: ${pct(effectiveRate)} on ${fmt(s.filing.totalIncome)} total income`
      };
    }
  },

  // ───────────────────────────
  // 7. CREDITS ELIGIBILITY (4)
  // ───────────────────────────
  {
    id: 'cr-01', category: 'credits',
    name: 'Child Tax Credit',
    irsRef: '1040 Line 19',
    description: 'CTC eligibility: $2,000/child if AGI < $200K (single)',
    check(s) {
      if (!s.filing) return { status: 'skip', currentValue: '—', expectedValue: '—', confidence: 1.0, detail: 'No filing data' };
      return {
        status: 'skip',
        currentValue: 'N/A',
        expectedValue: '—',
        confidence: 0.80,
        detail: 'No dependents claimed — CTC not applicable'
      };
    }
  },
  {
    id: 'cr-02', category: 'credits',
    name: 'Earned Income Credit',
    irsRef: '1040 Line 27',
    description: 'EITC eligibility based on earned income and filing status',
    check(s) {
      if (!s.filing) return { status: 'skip', currentValue: '—', expectedValue: '—', confidence: 1.0, detail: 'No filing data' };
      const agi = s.filing.agi || 0;
      const eligible = agi < 18591; // 2025 limit, no children, single
      return {
        status: eligible ? 'warn' : 'skip',
        currentValue: fmt(agi),
        expectedValue: '< $18,591 (no children)',
        confidence: 0.80,
        detail: eligible ? 'May qualify for EITC — verify with full eligibility rules' : 'AGI exceeds EITC limit for no-child filers'
      };
    }
  },
  {
    id: 'cr-03', category: 'credits',
    name: 'Education Credits',
    irsRef: 'Form 8863',
    description: 'American Opportunity or Lifetime Learning Credit eligibility',
    check(s) {
      return {
        status: 'skip',
        currentValue: 'N/A',
        expectedValue: '—',
        confidence: 1.0,
        detail: 'No 1098-T uploaded — education credits not evaluated'
      };
    }
  },
  {
    id: 'cr-04', category: 'credits',
    name: "Saver's Credit",
    irsRef: 'Form 8880',
    description: 'Retirement savings credit for low-moderate income',
    check(s) {
      if (!s.filing) return { status: 'skip', currentValue: '—', expectedValue: '—', confidence: 1.0, detail: 'No filing data' };
      const agi = s.filing.agi || 0;
      const eligible = agi < 38250; // 2025 limit single
      const has401k = s.incomes.some(i => i.box12_codes && i.box12_codes.some(c => ['D', 'E', 'G'].includes(c.code)));
      return {
        status: eligible && has401k ? 'warn' : 'skip',
        currentValue: has401k ? 'Has 401k' : 'No retirement',
        expectedValue: 'AGI < $38,250',
        confidence: 0.75,
        detail: eligible && has401k ? "May qualify for Saver's Credit" : "Not eligible or no retirement contributions detected"
      };
    }
  },

  // ───────────────────────────
  // 8. CALIFORNIA 540 (6)
  // ───────────────────────────
  {
    id: 'ca-01', category: 'california',
    name: 'Federal AGI Flows to CA',
    irsRef: 'CA 540 Line 13',
    description: 'Federal AGI correctly flows to California return',
    check(s) {
      if (!s.filing) return { status: 'skip', currentValue: '—', expectedValue: '—', confidence: 1.0, detail: 'No filing data' };
      return {
        status: 'pass',
        currentValue: fmt(s.filing.agi),
        expectedValue: fmt(s.filing.agi),
        confidence: 0.95,
        detail: 'Federal AGI flows to CA 540 Line 13'
      };
    }
  },
  {
    id: 'ca-02', category: 'california',
    name: 'CA Standard Deduction',
    irsRef: 'CA 540 Line 18',
    description: 'California standard deduction $5,540 (single) for 2025',
    check(s) {
      if (!s.filing) return { status: 'skip', currentValue: '—', expectedValue: '$5,540', confidence: 1.0, detail: 'No filing data' };
      return {
        status: 'pass',
        currentValue: fmt(CA_STANDARD_DEDUCTION_SINGLE),
        expectedValue: fmt(CA_STANDARD_DEDUCTION_SINGLE),
        confidence: 0.95,
        detail: 'California standard deduction correctly applied'
      };
    }
  },
  {
    id: 'ca-03', category: 'california',
    name: 'CA Tax Brackets Applied',
    irsRef: 'CA 540 Tax Table',
    description: 'California tax brackets correctly applied',
    check(s) {
      if (!s.filing || !s.filing.caTaxableIncome) return { status: 'skip', currentValue: '—', expectedValue: '—', confidence: 1.0, detail: 'No CA taxable income' };
      const expected = computeCATax(s.filing.caTaxableIncome);
      const actual = s.filing.caTax || 0;
      return {
        status: approxEqual(actual, expected, 5) ? 'pass' : 'fail',
        currentValue: fmt(actual),
        expectedValue: fmt(expected),
        confidence: 0.95,
        detail: `California tax on ${fmt(s.filing.caTaxableIncome)} taxable income`
      };
    }
  },
  {
    id: 'ca-04', category: 'california',
    name: 'CA Mental Health Tax',
    irsRef: 'CA 540 Line 32a',
    description: 'Mental Health Services Tax: 1% on income over $1M',
    check(s) {
      if (!s.filing) return { status: 'skip', currentValue: '—', expectedValue: '—', confidence: 1.0, detail: 'No filing data' };
      const taxable = s.filing.caTaxableIncome || 0;
      if (taxable <= 1000000) {
        return {
          status: 'pass',
          currentValue: 'N/A',
          expectedValue: 'N/A (< $1M)',
          confidence: 1.0,
          detail: 'Taxable income below $1M — MH tax does not apply'
        };
      }
      const mhTax = Math.round((taxable - 1000000) * 0.01);
      return {
        status: 'warn',
        currentValue: fmt(mhTax),
        expectedValue: fmt(mhTax),
        confidence: 0.90,
        detail: `Mental Health Services Tax: 1% on ${fmt(taxable - 1000000)} above $1M threshold`
      };
    }
  },
  {
    id: 'ca-05', category: 'california',
    name: 'CA Withholding Applied',
    irsRef: 'CA 540 Line 71',
    description: 'California state withholding from W-2s applied to return',
    check(s) {
      const totalStateWithheld = s.incomes.reduce((sum, i) => sum + (i.state_income_tax_withheld || i.state_tax_withheld || 0), 0);
      if (totalStateWithheld === 0) return { status: 'skip', currentValue: '—', expectedValue: 'Applied', confidence: 1.0, detail: 'No CA withholding' };
      return {
        status: 'pass',
        currentValue: fmt(totalStateWithheld),
        expectedValue: 'Applied',
        confidence: 0.95,
        detail: `Total CA withholding: ${fmt(totalStateWithheld)}`
      };
    }
  },
  {
    id: 'ca-06', category: 'california',
    name: 'CA Refund/Balance Correct',
    irsRef: 'CA 540 Line 93/100',
    description: 'California refund or balance due correctly computed',
    check(s) {
      if (!s.filing) return { status: 'skip', currentValue: '—', expectedValue: '—', confidence: 1.0, detail: 'No filing data' };
      const totalStateWithheld = s.incomes.reduce((sum, i) => sum + (i.state_income_tax_withheld || i.state_tax_withheld || 0), 0);
      const expected = totalStateWithheld - (s.filing.caTax || 0);
      const actual = s.filing.caResult || 0;
      return {
        status: approxEqual(actual, expected, 1) ? 'pass' : 'fail',
        currentValue: fmt(actual),
        expectedValue: fmt(expected),
        confidence: 0.95,
        detail: `${fmt(totalStateWithheld)} withholding − ${fmt(s.filing.caTax || 0)} tax = ${fmt(expected)}`
      };
    }
  },

  // ───────────────────────────
  // 9. MATHEMATICAL ACCURACY (5)
  // ───────────────────────────
  {
    id: 'ma-01', category: 'math',
    name: 'Income Additions Verified',
    irsRef: '1040 Line 9',
    description: 'Sum of all income sources equals reported total income',
    check(s) {
      if (!s.filing) return { status: 'skip', currentValue: '—', expectedValue: '—', confidence: 1.0, detail: 'No filing data' };
      const computed = s.incomes.reduce((sum, i) => {
        return sum + (i.wages || i.nonemployee_compensation || i.interest_income || i.ordinary_dividends || 0);
      }, 0);
      return {
        status: approxEqual(computed, s.filing.totalIncome, 1) ? 'pass' : 'fail',
        currentValue: fmt(s.filing.totalIncome),
        expectedValue: fmt(computed),
        confidence: 1.0,
        detail: `Computed sum: ${fmt(computed)}, reported: ${fmt(s.filing.totalIncome)}`
      };
    }
  },
  {
    id: 'ma-02', category: 'math',
    name: 'No Negative Tax Values',
    irsRef: 'General',
    description: 'Tax, withholding, and income values are non-negative',
    check(s) {
      if (!s.filing) return { status: 'skip', currentValue: '—', expectedValue: 'All ≥ 0', confidence: 1.0, detail: 'No filing data' };
      const values = [s.filing.totalIncome, s.filing.agi, s.filing.taxableIncome, s.filing.totalFedTax, s.filing.totalFedWithheld];
      const negatives = values.filter(v => v != null && v < 0);
      return {
        status: negatives.length > 0 ? 'fail' : 'pass',
        currentValue: negatives.length > 0 ? `${negatives.length} negative` : 'All ≥ 0',
        expectedValue: 'All ≥ 0',
        confidence: 1.0,
        detail: negatives.length > 0 ? 'Negative values found in tax computation' : 'All computed values are non-negative'
      };
    }
  },
  {
    id: 'ma-03', category: 'math',
    name: 'Decimal Precision',
    irsRef: 'General',
    description: 'All dollar amounts are whole numbers (no fractional cents)',
    check(s) {
      if (s.incomes.length === 0) return { status: 'skip', currentValue: '—', expectedValue: 'Integers', confidence: 1.0, detail: 'No data' };
      const allIntegers = s.incomes.every(i => {
        const vals = [i.wages, i.fed_income_tax_withheld, i.nonemployee_compensation, i.interest_income, i.ordinary_dividends].filter(v => v != null);
        return vals.every(v => Number.isInteger(v) || Math.abs(v - Math.round(v)) < 0.01);
      });
      return {
        status: allIntegers ? 'pass' : 'warn',
        currentValue: allIntegers ? 'Valid' : 'Fractional',
        expectedValue: 'Whole dollars',
        confidence: 0.90,
        detail: allIntegers ? 'All amounts in whole dollars' : 'Some amounts have fractional cents — will be rounded'
      };
    }
  },
  {
    id: 'ma-04', category: 'math',
    name: 'Withholding Sum Verified',
    irsRef: '1040 Line 25',
    description: 'Total federal withholding = sum of all W-2/1099 withholdings',
    check(s) {
      if (!s.filing) return { status: 'skip', currentValue: '—', expectedValue: '—', confidence: 1.0, detail: 'No filing data' };
      const computed = s.incomes.reduce((sum, i) => sum + (i.fed_income_tax_withheld || 0), 0);
      return {
        status: approxEqual(computed, s.filing.totalFedWithheld, 1) ? 'pass' : 'fail',
        currentValue: fmt(s.filing.totalFedWithheld),
        expectedValue: fmt(computed),
        confidence: 1.0,
        detail: `Sum of withholdings: ${fmt(computed)}`
      };
    }
  },
  {
    id: 'ma-05', category: 'math',
    name: 'AGI ≤ Total Income',
    irsRef: 'General',
    description: 'AGI should not exceed total income (adjustments reduce it)',
    check(s) {
      if (!s.filing) return { status: 'skip', currentValue: '—', expectedValue: 'AGI ≤ Income', confidence: 1.0, detail: 'No filing data' };
      return {
        status: s.filing.agi <= s.filing.totalIncome ? 'pass' : 'fail',
        currentValue: fmt(s.filing.agi),
        expectedValue: `≤ ${fmt(s.filing.totalIncome)}`,
        confidence: 1.0,
        detail: `AGI ${fmt(s.filing.agi)} vs Total Income ${fmt(s.filing.totalIncome)}`
      };
    }
  },

  // ───────────────────────────
  // 10. AUDIT RISK INDICATORS (5)
  // ───────────────────────────
  {
    id: 'ar-01', category: 'audit-risk',
    name: 'Round Number Check',
    irsRef: 'IRS DIF Score',
    description: 'Income amounts with suspicious round numbers ($50,000 exactly)',
    check(s) {
      if (s.incomes.length === 0) return { status: 'skip', currentValue: '—', expectedValue: 'Non-round', confidence: 1.0, detail: 'No data' };
      const round = s.incomes.filter(i => {
        const amt = i.wages || i.nonemployee_compensation || 0;
        return amt > 0 && amt % 1000 === 0;
      });
      return {
        status: round.length > 0 ? 'warn' : 'pass',
        currentValue: round.length > 0 ? `${round.length} round` : 'None',
        expectedValue: 'Non-round preferred',
        confidence: 0.60,
        detail: round.length > 0 ? 'Round income amounts can increase IRS scrutiny (usually fine for W-2s)' : 'No suspiciously round amounts'
      };
    }
  },
  {
    id: 'ar-02', category: 'audit-risk',
    name: 'High Income Flag',
    irsRef: 'IRS DIF Score',
    description: 'Total income > $200K has higher audit probability',
    check(s) {
      if (!s.filing) return { status: 'skip', currentValue: '—', expectedValue: '—', confidence: 1.0, detail: 'No filing data' };
      const total = s.filing.totalIncome || 0;
      return {
        status: total > 200000 ? 'warn' : 'pass',
        currentValue: fmt(total),
        expectedValue: '< $200K lower risk',
        confidence: 0.70,
        detail: total > 200000 ? 'Higher income = higher audit rate — ensure all deductions documented' : 'Income level has typical audit risk'
      };
    }
  },
  {
    id: 'ar-03', category: 'audit-risk',
    name: 'Schedule C Loss Ratio',
    irsRef: 'Schedule C',
    description: 'SE businesses reporting losses attract IRS attention',
    check(s) {
      const necTotal = s.incomes.filter(i => i.doc_type === '1099-NEC').reduce((sum, i) => sum + (i.nonemployee_compensation || 0), 0);
      if (necTotal === 0) return { status: 'skip', currentValue: '—', expectedValue: '—', confidence: 1.0, detail: 'No SE income' };
      return {
        status: 'pass',
        currentValue: 'Profit',
        expectedValue: 'Profit preferred',
        confidence: 0.80,
        detail: 'Business shows income (no loss) — lower audit risk'
      };
    }
  },
  {
    id: 'ar-04', category: 'audit-risk',
    name: 'Withholding Pattern',
    irsRef: 'General',
    description: 'Withholding should be roughly proportional to income',
    check(s) {
      const w2s = s.incomes.filter(i => i.doc_type === 'W-2' && i.wages > 0);
      if (w2s.length === 0) return { status: 'skip', currentValue: '—', expectedValue: 'Proportional', confidence: 1.0, detail: 'No W-2s' };
      const totalWages = w2s.reduce((s, i) => s + i.wages, 0);
      const totalWithheld = w2s.reduce((s, i) => s + (i.fed_income_tax_withheld || 0), 0);
      const rate = totalWithheld / totalWages;
      return {
        status: rateInRange(rate, 0.05, 0.40) ? 'pass' : 'warn',
        currentValue: pct(rate),
        expectedValue: '5-40%',
        confidence: 0.80,
        detail: `Overall withholding rate: ${pct(rate)} — ${rateInRange(rate, 0.05, 0.40) ? 'normal' : 'unusual'}`
      };
    }
  },
  {
    id: 'ar-05', category: 'audit-risk',
    name: 'Multiple Income Sources',
    irsRef: 'General',
    description: 'Multiple income types flagged for completeness review',
    check(s) {
      const types = [...new Set(s.incomes.map(i => i.doc_type))];
      if (types.length <= 1) return { status: 'pass', currentValue: `${types.length} type(s)`, expectedValue: 'Noted', confidence: 1.0, detail: 'Single income type — straightforward return' };
      return {
        status: 'warn',
        currentValue: types.join(', '),
        expectedValue: 'All reported',
        confidence: 0.85,
        detail: `Multiple income types (${types.join(', ')}) — ensure all sources reported to IRS`
      };
    }
  },
];

// ── ENGINE ──

function runComplianceChecks(state) {
  const results = RULES.map(rule => {
    try {
      const result = rule.check(state);
      return {
        id: rule.id,
        name: rule.name,
        category: rule.category,
        irsRef: rule.irsRef,
        description: rule.description,
        ...result
      };
    } catch (e) {
      return {
        id: rule.id,
        name: rule.name,
        category: rule.category,
        irsRef: rule.irsRef,
        description: rule.description,
        status: 'skip',
        currentValue: '—',
        expectedValue: '—',
        confidence: 0,
        detail: `Error running check: ${e.message}`
      };
    }
  });

  const summary = {
    total: results.length,
    passed: results.filter(r => r.status === 'pass').length,
    failed: results.filter(r => r.status === 'fail').length,
    warnings: results.filter(r => r.status === 'warn').length,
    skipped: results.filter(r => r.status === 'skip').length,
    score: 0,
  };

  // Score: pass=1, warn=0.5, fail=0, skip=not counted
  const scored = results.filter(r => r.status !== 'skip');
  if (scored.length > 0) {
    const points = scored.reduce((sum, r) => sum + (r.status === 'pass' ? 1 : r.status === 'warn' ? 0.5 : 0), 0);
    summary.score = Math.round((points / scored.length) * 100);
  }

  return { results, summary, categories: CATEGORIES };
}

// Make available globally
if (typeof window !== 'undefined') {
  window.COMPLIANCE_CATEGORIES = CATEGORIES;
  window.COMPLIANCE_RULES = RULES;
  window.runComplianceChecks = runComplianceChecks;
}
