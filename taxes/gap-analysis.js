/**
 * Gap Analysis — Smart follow-up questions based on uploaded documents
 *
 * Each rule has:
 *   id        — unique key (stored in gapAnswers)
 *   question  — what we ask the user
 *   hint      — help text below the question
 *   condition — fn(session) → true if this question should be shown
 *   followUp  — 'amount' | 'upload' | 'yesno' | 'amount_or_upload'
 *   field     — key in manualEntries when followUp is 'amount'
 *   docType   — doc type label when followUp is 'upload'
 */

const GAP_RULES = [
  // ── RETIREMENT ──
  {
    id: 'has401k',
    question: 'Did you contribute to a 401(k) or 403(b) in this tax year?',
    hint: 'Employer-sponsored retirement plan contributions reduce your taxable income.',
    condition: (s) => {
      // Check if any W-2 has box 12 code D/E/F/G (401k/403b/SEP/457b)
      const retirementCodes = ['D', 'E', 'F', 'G', 'AA', 'BB'];
      const hasBox12 = s.incomes.some(i =>
        i.doc_type === 'W-2' && i.box12_codes &&
        i.box12_codes.some(c => retirementCodes.includes(c.code) && c.amount > 0)
      );
      return !hasBox12;
    },
    followUp: 'amount',
    field: 'contribution401k',
    placeholder: 'Total 401(k) contributions',
  },
  {
    id: 'hasIRA',
    question: 'Did you contribute to a Traditional IRA?',
    hint: 'Traditional IRA contributions may be tax-deductible depending on income.',
    condition: (s) => true,
    followUp: 'amount',
    field: 'contributionIRA',
    placeholder: 'IRA contribution amount',
  },
  {
    id: 'hasHSA',
    question: 'Did you contribute to a Health Savings Account (HSA)?',
    hint: 'HSA contributions are tax-deductible if you have a high-deductible health plan.',
    condition: (s) => {
      const hasBox12W = s.incomes.some(i =>
        i.doc_type === 'W-2' && i.box12_codes &&
        i.box12_codes.some(c => c.code === 'W' && c.amount > 0)
      );
      return !hasBox12W;
    },
    followUp: 'amount',
    field: 'contributionHSA',
    placeholder: 'HSA contribution amount',
  },

  // ── HOUSING ──
  {
    id: 'hasMortgage',
    question: 'Did you pay mortgage interest this year?',
    hint: 'You would have received a Form 1098 from your lender.',
    condition: (s) => {
      const has1098 = s.incomes.some(i => i.doc_type === '1098');
      return !has1098;
    },
    followUp: 'amount_or_upload',
    field: 'mortgageInterest',
    placeholder: 'Total mortgage interest paid',
    docType: '1098',
  },
  {
    id: 'isRenter',
    question: 'Do you pay rent in California?',
    hint: 'California residents with income under ~$50K may qualify for a renter\'s credit.',
    condition: (s) => s.stateOfResidence === 'CA',
    followUp: 'yesno',
  },

  // ── TAXES PAID ──
  {
    id: 'hasSALT',
    question: 'Did you pay state and local taxes beyond paycheck withholding?',
    hint: 'Property taxes, estimated tax payments, or prior-year balance due. SALT deduction is capped at $10,000.',
    condition: (s) => true,
    followUp: 'amount',
    field: 'saltExtra',
    placeholder: 'Additional state/local/property taxes paid',
  },

  // ── CHARITABLE ──
  {
    id: 'hasCharitable',
    question: 'Did you make charitable donations over $250?',
    hint: 'Cash and non-cash contributions to qualified organizations.',
    condition: (s) => true,
    followUp: 'amount',
    field: 'charitableDonations',
    placeholder: 'Total charitable contributions',
  },

  // ── EDUCATION ──
  {
    id: 'hasStudentLoan',
    question: 'Did you pay student loan interest?',
    hint: 'Up to $2,500 in student loan interest is deductible. You would have received a 1098-E.',
    condition: (s) => {
      const has1098E = s.incomes.some(i => i.doc_type === '1098-E');
      return !has1098E;
    },
    followUp: 'amount_or_upload',
    field: 'studentLoanInterest',
    placeholder: 'Student loan interest paid',
    docType: '1098-E',
  },
  {
    id: 'hasTuition',
    question: 'Did you pay college tuition or education expenses?',
    hint: 'You may qualify for the American Opportunity or Lifetime Learning credit. You would have received a 1098-T.',
    condition: (s) => {
      const has1098T = s.incomes.some(i => i.doc_type === '1098-T');
      return !has1098T;
    },
    followUp: 'amount_or_upload',
    field: 'tuitionPaid',
    placeholder: 'Tuition and fees paid',
    docType: '1098-T',
  },
  {
    id: 'isEducator',
    question: 'Are you a K-12 teacher or educator?',
    hint: 'Educators can deduct up to $300 for unreimbursed classroom expenses.',
    condition: (s) => true,
    followUp: 'yesno',
  },

  // ── INVESTMENTS ──
  {
    id: 'hasSoldStocks',
    question: 'Did you sell any stocks, bonds, or cryptocurrency?',
    hint: 'You would have received a 1099-B from your brokerage.',
    condition: (s) => {
      const has1099B = s.incomes.some(i => i.doc_type === '1099-B');
      return !has1099B;
    },
    followUp: 'amount_or_upload',
    field: 'capitalGains',
    placeholder: 'Net capital gain/loss',
    docType: '1099-B',
  },

  // ── SELF-EMPLOYMENT ──
  {
    id: 'hasSEHealthInsurance',
    question: 'Are you self-employed and pay for your own health insurance?',
    hint: 'Self-employed health insurance premiums are deductible above-the-line.',
    condition: (s) => {
      const hasSE = s.incomes.some(i => i.doc_type === '1099-NEC');
      return hasSE;
    },
    followUp: 'amount',
    field: 'seHealthInsurance',
    placeholder: 'Annual health insurance premiums',
  },
  {
    id: 'hasHomeOffice',
    question: 'Do you use part of your home exclusively for business?',
    hint: 'Self-employed individuals can deduct home office expenses (simplified: $5/sq ft, max 300 sq ft).',
    condition: (s) => {
      const hasSE = s.incomes.some(i => i.doc_type === '1099-NEC');
      return hasSE;
    },
    followUp: 'amount',
    field: 'homeOfficeSqft',
    placeholder: 'Square footage of home office',
  },
  {
    id: 'hasBusinessMileage',
    question: 'Did you drive for business purposes?',
    hint: 'Standard mileage rate applies for self-employed business driving.',
    condition: (s) => {
      const hasSE = s.incomes.some(i => i.doc_type === '1099-NEC');
      return hasSE;
    },
    followUp: 'amount',
    field: 'businessMiles',
    placeholder: 'Total business miles driven',
  },

  // ── CREDITS ──
  {
    id: 'hasEV',
    question: 'Did you purchase or lease a qualifying electric vehicle?',
    hint: 'The Clean Vehicle Credit can be up to $7,500 for new EVs.',
    condition: (s) => true,
    followUp: 'yesno',
  },
  {
    id: 'hasEnergyImprovements',
    question: 'Did you make energy-efficient home improvements?',
    hint: 'Solar panels, heat pumps, insulation, etc. may qualify for the Residential Clean Energy Credit.',
    condition: (s) => true,
    followUp: 'yesno',
  },
  {
    id: 'hasChildcare',
    question: 'Did you pay for childcare or dependent care expenses?',
    hint: 'The Child and Dependent Care Credit covers up to $3,000 per child ($6,000 for 2+).',
    condition: (s) => s.childrenUnder17 > 0 || s.otherDependents > 0,
    followUp: 'amount',
    field: 'childcareExpenses',
    placeholder: 'Total childcare expenses',
  },

  // ── MISC INCOME ──
  {
    id: 'hasOtherIncome',
    question: 'Did you have any other income not covered by documents above?',
    hint: 'Gambling winnings, rental income, alimony received, jury duty, etc.',
    condition: (s) => true,
    followUp: 'amount',
    field: 'otherIncome',
    placeholder: 'Total other income',
  },
];

/**
 * Get applicable gap analysis questions for the current session.
 * Filters out questions already answered and those whose conditions aren't met.
 *
 * @param {object} session - The taxSession state object
 * @returns {Array} Applicable gap rules
 */
function getGapQuestions(session) {
  return GAP_RULES.filter(rule => {
    // Skip if already answered
    if (session.gapAnswers && session.gapAnswers[rule.id] !== undefined) {
      return false;
    }
    // Check condition
    try {
      return rule.condition(session);
    } catch (e) {
      return false;
    }
  });
}

/**
 * Get all gap rules (including answered ones, for review).
 */
function getAllGapRules() {
  return GAP_RULES;
}

// Make available globally
if (typeof window !== 'undefined') {
  window.GAP_RULES = GAP_RULES;
  window.getGapQuestions = getGapQuestions;
  window.getAllGapRules = getAllGapRules;
}
