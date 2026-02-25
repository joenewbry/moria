/**
 * Tax Data — Multi-year, multi-state tax constants
 *
 * Covers: Federal, California, New York
 * Years: 2023, 2024, 2025
 * Filing statuses: single, mfj, mfs, hoh, qss
 *
 * Exports:
 *   getTaxConstants(year, stateId, filingStatus) → { fed, state }
 *   computeTaxFromBrackets(taxableIncome, brackets) → number
 */

// ── FEDERAL CONSTANTS ──

const FEDERAL_DATA = {
  2023: {
    standardDeduction: { single: 13850, mfj: 27700, mfs: 13850, hoh: 20800, qss: 27700 },
    brackets: {
      single: [
        [11000, 0.10], [44725 - 11000, 0.12], [95375 - 44725, 0.22],
        [182100 - 95375, 0.24], [231250 - 182100, 0.32],
        [578125 - 231250, 0.35], [Infinity, 0.37]
      ],
      mfj: [
        [22000, 0.10], [89450 - 22000, 0.12], [190750 - 89450, 0.22],
        [364200 - 190750, 0.24], [462500 - 364200, 0.32],
        [693750 - 462500, 0.35], [Infinity, 0.37]
      ],
      mfs: [
        [11000, 0.10], [44725 - 11000, 0.12], [95375 - 44725, 0.22],
        [182100 - 95375, 0.24], [231250 - 182100, 0.32],
        [346875 - 231250, 0.35], [Infinity, 0.37]
      ],
      hoh: [
        [15700, 0.10], [59850 - 15700, 0.12], [95350 - 59850, 0.22],
        [182100 - 95350, 0.24], [231250 - 182100, 0.32],
        [578100 - 231250, 0.35], [Infinity, 0.37]
      ],
    },
    ssWageBase: 160200,
    ssRate: 0.062,
    medicareRate: 0.0145,
    seTaxRate: 0.153,
    contrib401kLimit: 22500,
    contrib401kCatchUp: 7500,
    contribIRALimit: 6500,
    contribIRACatchUp: 1000,
    contribHSASelf: 3850,
    contribHSAFamily: 7750,
    eitcNoChild: 17640,
    saversCreditLimit: 36500,
    studentLoanPhaseout: { single: 85000, mfj: 175000 },
    iraPhaseout: { single: [73000, 83000], mfj: [116000, 136000] },
    qbiThreshold: { single: 182100, mfj: 364200 },
    mileageRate: 0.655,
    saltCap: 10000,
    ctcAmount: 2000,
    ctcIncomeLimit: { single: 200000, mfj: 400000 },
    educatorExpense: 300,
    studentLoanMax: 2500,
  },
  2024: {
    standardDeduction: { single: 14600, mfj: 29200, mfs: 14600, hoh: 21900, qss: 29200 },
    brackets: {
      single: [
        [11600, 0.10], [47150 - 11600, 0.12], [100525 - 47150, 0.22],
        [191950 - 100525, 0.24], [243725 - 191950, 0.32],
        [609350 - 243725, 0.35], [Infinity, 0.37]
      ],
      mfj: [
        [23200, 0.10], [94300 - 23200, 0.12], [201050 - 94300, 0.22],
        [383900 - 201050, 0.24], [487450 - 383900, 0.32],
        [731200 - 487450, 0.35], [Infinity, 0.37]
      ],
      mfs: [
        [11600, 0.10], [47150 - 11600, 0.12], [100525 - 47150, 0.22],
        [191950 - 100525, 0.24], [243725 - 191950, 0.32],
        [365600 - 243725, 0.35], [Infinity, 0.37]
      ],
      hoh: [
        [16550, 0.10], [63100 - 16550, 0.12], [100500 - 63100, 0.22],
        [191950 - 100500, 0.24], [243700 - 191950, 0.32],
        [609350 - 243700, 0.35], [Infinity, 0.37]
      ],
    },
    ssWageBase: 168600,
    ssRate: 0.062,
    medicareRate: 0.0145,
    seTaxRate: 0.153,
    contrib401kLimit: 23000,
    contrib401kCatchUp: 7500,
    contribIRALimit: 7000,
    contribIRACatchUp: 1000,
    contribHSASelf: 4150,
    contribHSAFamily: 8300,
    eitcNoChild: 18591,
    saversCreditLimit: 38250,
    studentLoanPhaseout: { single: 90000, mfj: 185000 },
    iraPhaseout: { single: [77000, 87000], mfj: [123000, 143000] },
    qbiThreshold: { single: 191950, mfj: 383900 },
    mileageRate: 0.67,
    saltCap: 10000,
    ctcAmount: 2000,
    ctcIncomeLimit: { single: 200000, mfj: 400000 },
    educatorExpense: 300,
    studentLoanMax: 2500,
  },
  2025: {
    standardDeduction: { single: 15000, mfj: 30000, mfs: 15000, hoh: 22500, qss: 30000 },
    brackets: {
      single: [
        [11925, 0.10], [48475 - 11925, 0.12], [103350 - 48475, 0.22],
        [197300 - 103350, 0.24], [250525 - 197300, 0.32],
        [626350 - 250525, 0.35], [Infinity, 0.37]
      ],
      mfj: [
        [23850, 0.10], [96950 - 23850, 0.12], [206700 - 96950, 0.22],
        [394600 - 206700, 0.24], [501050 - 394600, 0.32],
        [751600 - 501050, 0.35], [Infinity, 0.37]
      ],
      mfs: [
        [11925, 0.10], [48475 - 11925, 0.12], [103350 - 48475, 0.22],
        [197300 - 103350, 0.24], [250525 - 197300, 0.32],
        [375800 - 250525, 0.35], [Infinity, 0.37]
      ],
      hoh: [
        [17000, 0.10], [64850 - 17000, 0.12], [103350 - 64850, 0.22],
        [197300 - 103350, 0.24], [250500 - 197300, 0.32],
        [626350 - 250500, 0.35], [Infinity, 0.37]
      ],
    },
    ssWageBase: 176100,
    ssRate: 0.062,
    medicareRate: 0.0145,
    seTaxRate: 0.153,
    contrib401kLimit: 23500,
    contrib401kCatchUp: 7500,
    contribIRALimit: 7000,
    contribIRACatchUp: 1000,
    contribHSASelf: 4300,
    contribHSAFamily: 8550,
    eitcNoChild: 18591,
    saversCreditLimit: 38250,
    studentLoanPhaseout: { single: 90000, mfj: 185000 },
    iraPhaseout: { single: [79000, 89000], mfj: [126000, 146000] },
    qbiThreshold: { single: 191950, mfj: 383900 },
    mileageRate: 0.70,
    saltCap: 10000,
    ctcAmount: 2000,
    ctcIncomeLimit: { single: 200000, mfj: 400000 },
    educatorExpense: 300,
    studentLoanMax: 2500,
  },
};

// ── CALIFORNIA CONSTANTS ──

const CALIFORNIA_DATA = {
  2023: {
    standardDeduction: { single: 5363, mfj: 10726, mfs: 5363, hoh: 10726 },
    brackets: {
      single: [
        [10099, 0.01], [23942 - 10099, 0.02], [37788 - 23942, 0.04],
        [52455 - 37788, 0.06], [66295 - 52455, 0.08],
        [338639 - 66295, 0.093], [406364 - 338639, 0.103],
        [677275 - 406364, 0.113], [Infinity, 0.123]
      ],
      mfj: [
        [20198, 0.01], [47884 - 20198, 0.02], [75576 - 47884, 0.04],
        [104910 - 75576, 0.06], [132590 - 104910, 0.08],
        [677278 - 132590, 0.093], [812728 - 677278, 0.103],
        [1354550 - 812728, 0.113], [Infinity, 0.123]
      ],
    },
    mentalHealthThreshold: 1000000,
    mentalHealthRate: 0.01,
    sdiWageLimit: 153164,
    sdiRate: 0.009,
    rentersCreditLimit: { single: 49220, mfj: 98440 },
    rentersCreditAmount: { single: 60, mfj: 120 },
  },
  2024: {
    standardDeduction: { single: 5540, mfj: 11080, mfs: 5540, hoh: 11080 },
    brackets: {
      single: [
        [10412, 0.01], [24684 - 10412, 0.02], [38959 - 24684, 0.04],
        [54081 - 38959, 0.06], [68350 - 54081, 0.08],
        [349137 - 68350, 0.093], [418961 - 349137, 0.103],
        [698271 - 418961, 0.113], [Infinity, 0.123]
      ],
      mfj: [
        [20824, 0.01], [49368 - 20824, 0.02], [77918 - 49368, 0.04],
        [108162 - 77918, 0.06], [136700 - 108162, 0.08],
        [698274 - 136700, 0.093], [837922 - 698274, 0.103],
        [1396542 - 837922, 0.113], [Infinity, 0.123]
      ],
    },
    mentalHealthThreshold: 1000000,
    mentalHealthRate: 0.01,
    sdiWageLimit: 153164,
    sdiRate: 0.009,
    rentersCreditLimit: { single: 50746, mfj: 101492 },
    rentersCreditAmount: { single: 60, mfj: 120 },
  },
  2025: {
    standardDeduction: { single: 5540, mfj: 11080, mfs: 5540, hoh: 11080 },
    brackets: {
      single: [
        [10412, 0.01], [24684 - 10412, 0.02], [38959 - 24684, 0.04],
        [54081 - 38959, 0.06], [68350 - 54081, 0.08],
        [349137 - 68350, 0.093], [418961 - 349137, 0.103],
        [698271 - 418961, 0.113], [Infinity, 0.123]
      ],
      mfj: [
        [20824, 0.01], [49368 - 20824, 0.02], [77918 - 49368, 0.04],
        [108162 - 77918, 0.06], [136700 - 108162, 0.08],
        [698274 - 136700, 0.093], [837922 - 698274, 0.103],
        [1396542 - 837922, 0.113], [Infinity, 0.123]
      ],
    },
    mentalHealthThreshold: 1000000,
    mentalHealthRate: 0.01,
    sdiWageLimit: 174148,
    sdiRate: 0.011,
    rentersCreditLimit: { single: 50746, mfj: 101492 },
    rentersCreditAmount: { single: 60, mfj: 120 },
  },
};

// ── NEW YORK CONSTANTS ──

const NEWYORK_DATA = {
  2023: {
    standardDeduction: { single: 8000, mfj: 16050, mfs: 8000, hoh: 11200 },
    brackets: {
      single: [
        [8500, 0.04], [11700 - 8500, 0.045], [13900 - 11700, 0.0525],
        [80650 - 13900, 0.0585], [215400 - 80650, 0.0625],
        [1077550 - 215400, 0.0685], [5000000 - 1077550, 0.0965],
        [25000000 - 5000000, 0.103], [Infinity, 0.109]
      ],
      mfj: [
        [17150, 0.04], [23600 - 17150, 0.045], [27900 - 23600, 0.0525],
        [161550 - 27900, 0.0585], [323200 - 161550, 0.0625],
        [2155350 - 323200, 0.0685], [5000000 - 2155350, 0.0965],
        [25000000 - 5000000, 0.103], [Infinity, 0.109]
      ],
    },
    eitcRate: 0.30, // 30% of federal EITC
    nycBrackets: {
      single: [
        [12000, 0.03078], [25000 - 12000, 0.03762],
        [50000 - 25000, 0.03819], [Infinity, 0.03876]
      ],
    },
  },
  2024: {
    standardDeduction: { single: 8000, mfj: 16050, mfs: 8000, hoh: 11200 },
    brackets: {
      single: [
        [8500, 0.04], [11700 - 8500, 0.045], [13900 - 11700, 0.0525],
        [80650 - 13900, 0.0585], [215400 - 80650, 0.0625],
        [1077550 - 215400, 0.0685], [5000000 - 1077550, 0.0965],
        [25000000 - 5000000, 0.103], [Infinity, 0.109]
      ],
      mfj: [
        [17150, 0.04], [23600 - 17150, 0.045], [27900 - 23600, 0.0525],
        [161550 - 27900, 0.0585], [323200 - 161550, 0.0625],
        [2155350 - 323200, 0.0685], [5000000 - 2155350, 0.0965],
        [25000000 - 5000000, 0.103], [Infinity, 0.109]
      ],
    },
    eitcRate: 0.30,
    nycBrackets: {
      single: [
        [12000, 0.03078], [25000 - 12000, 0.03762],
        [50000 - 25000, 0.03819], [Infinity, 0.03876]
      ],
    },
  },
  2025: {
    standardDeduction: { single: 8000, mfj: 16050, mfs: 8000, hoh: 11200 },
    brackets: {
      single: [
        [8500, 0.04], [11700 - 8500, 0.045], [13900 - 11700, 0.0525],
        [80650 - 13900, 0.0585], [215400 - 80650, 0.0625],
        [1077550 - 215400, 0.0685], [5000000 - 1077550, 0.0965],
        [25000000 - 5000000, 0.103], [Infinity, 0.109]
      ],
      mfj: [
        [17150, 0.04], [23600 - 17150, 0.045], [27900 - 23600, 0.0525],
        [161550 - 27900, 0.0585], [323200 - 161550, 0.0625],
        [2155350 - 323200, 0.0685], [5000000 - 2155350, 0.0965],
        [25000000 - 5000000, 0.103], [Infinity, 0.109]
      ],
    },
    eitcRate: 0.30,
    nycBrackets: {
      single: [
        [12000, 0.03078], [25000 - 12000, 0.03762],
        [50000 - 25000, 0.03819], [Infinity, 0.03876]
      ],
    },
  },
};

// ── HELPERS ──

/**
 * Compute tax from bracket table.
 * brackets: [[width, rate], ...] where last entry has Infinity width.
 */
function computeTaxFromBrackets(taxableIncome, brackets) {
  let tax = 0, remaining = taxableIncome;
  for (const [width, rate] of brackets) {
    if (remaining <= 0) break;
    const amt = Math.min(remaining, width);
    tax += amt * rate;
    remaining -= amt;
  }
  return Math.round(tax);
}

/**
 * Get tax constants for a given year, state, and filing status.
 *
 * @param {number} year - 2023, 2024, or 2025
 * @param {string} stateId - 'california', 'newYork', or null/undefined for federal-only
 * @param {string} filingStatus - 'single', 'mfj', 'mfs', 'hoh', 'qss'
 * @returns {{ fed: object, state: object|null }}
 */
function getTaxConstants(year, stateId, filingStatus) {
  const yr = year || 2025;
  const fs = filingStatus || 'single';

  const fedYear = FEDERAL_DATA[yr] || FEDERAL_DATA[2025];
  const fedBrackets = fedYear.brackets[fs] || fedYear.brackets.single;
  const fedStdDed = fedYear.standardDeduction[fs] || fedYear.standardDeduction.single;

  const fed = {
    ...fedYear,
    brackets: fedBrackets,
    standardDeduction: fedYear.standardDeduction, // keep full object
    stdDeduction: fedStdDed, // resolved for this filing status
  };

  let stateConstants = null;

  if (stateId === 'california') {
    const caYear = CALIFORNIA_DATA[yr] || CALIFORNIA_DATA[2025];
    // CA uses single brackets for mfs/hoh too
    const caBracketKey = (fs === 'mfj' || fs === 'qss') ? 'mfj' : 'single';
    const caBrackets = caYear.brackets[caBracketKey] || caYear.brackets.single;
    const caStdDed = caYear.standardDeduction[fs] || caYear.standardDeduction.single;

    stateConstants = {
      ...caYear,
      brackets: caBrackets,
      standardDeduction: caYear.standardDeduction,
      stdDeduction: caStdDed,
    };
  } else if (stateId === 'newYork') {
    const nyYear = NEWYORK_DATA[yr] || NEWYORK_DATA[2025];
    const nyBracketKey = (fs === 'mfj' || fs === 'qss') ? 'mfj' : 'single';
    const nyBrackets = nyYear.brackets[nyBracketKey] || nyYear.brackets.single;
    const nyStdDed = nyYear.standardDeduction[fs] || nyYear.standardDeduction.single;
    const nycBrackets = nyYear.nycBrackets ? (nyYear.nycBrackets[nyBracketKey] || nyYear.nycBrackets.single) : null;

    stateConstants = {
      ...nyYear,
      brackets: nyBrackets,
      standardDeduction: nyYear.standardDeduction,
      stdDeduction: nyStdDed,
      nycBrackets: nycBrackets,
    };
  }

  return { fed, state: stateConstants };
}

// Make available globally
if (typeof window !== 'undefined') {
  window.TAX_DATA = { federal: FEDERAL_DATA, california: CALIFORNIA_DATA, newYork: NEWYORK_DATA };
  window.getTaxConstants = getTaxConstants;
  window.computeTaxFromBrackets = computeTaxFromBrackets;
}
