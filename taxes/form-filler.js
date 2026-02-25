/**
 * Form Filler — pdf-lib integration for filling IRS/FTB/DTF tax forms
 *
 * Uses pdf-lib (loaded via CDN) to fill AcroForm fields in official
 * fillable PDFs from IRS, CA FTB, and NY DTF.
 *
 * Exports:
 *   fill1040(session) → { blob, url, name }
 *   fillCA540(session) → { blob, url, name }
 *   fillNYIT201(session) → { blob, url, name }
 *   downloadForm(formObj)
 *   printForm(formObj)
 */

/* global PDFLib */

// ── FIELD MAPS ──
// Maps our session fields to the AcroForm field names in IRS PDFs.
// These vary by year — the map is keyed by tax year.
// Field names determined by inspecting the official fillable PDFs.

const FORM_1040_FIELDS = {
  // Common field mapping (IRS f1040 field names are relatively stable)
  default: {
    firstName: 'topmostSubform[0].Page1[0].f1_04[0]',
    lastName: 'topmostSubform[0].Page1[0].f1_05[0]',
    ssn: 'topmostSubform[0].Page1[0].f1_06[0]',
    filingStatus_single: 'topmostSubform[0].Page1[0].c1_1[0]',
    filingStatus_mfj: 'topmostSubform[0].Page1[0].c1_2[0]',
    filingStatus_mfs: 'topmostSubform[0].Page1[0].c1_3[0]',
    filingStatus_hoh: 'topmostSubform[0].Page1[0].c1_4[0]',
    filingStatus_qss: 'topmostSubform[0].Page1[0].c1_5[0]',
    // Line 1a: Wages
    line1a: 'topmostSubform[0].Page1[0].f1_07[0]',
    // Line 2b: Taxable interest
    line2b: 'topmostSubform[0].Page1[0].f1_10[0]',
    // Line 3b: Ordinary dividends
    line3b: 'topmostSubform[0].Page1[0].f1_12[0]',
    // Line 7: Capital gain/loss
    line7: 'topmostSubform[0].Page1[0].f1_19[0]',
    // Line 8: Other income (Sched 1)
    line8: 'topmostSubform[0].Page1[0].f1_20[0]',
    // Line 9: Total income
    line9: 'topmostSubform[0].Page1[0].f1_21[0]',
    // Line 10: Adjustments (Sched 1)
    line10: 'topmostSubform[0].Page1[0].f1_22[0]',
    // Line 11: AGI
    line11: 'topmostSubform[0].Page1[0].f1_23[0]',
    // Line 12: Standard deduction or itemized
    line12: 'topmostSubform[0].Page1[0].f1_24[0]',
    // Line 13: QBI deduction
    line13: 'topmostSubform[0].Page1[0].f1_25[0]',
    // Line 14: Total deductions
    line14: 'topmostSubform[0].Page1[0].f1_26[0]',
    // Line 15: Taxable income
    line15: 'topmostSubform[0].Page1[0].f1_27[0]',
    // Line 16: Tax
    line16: 'topmostSubform[0].Page2[0].f2_01[0]',
    // Line 23: SE tax (from Schedule SE)
    line23: 'topmostSubform[0].Page2[0].f2_08[0]',
    // Line 24: Total tax
    line24: 'topmostSubform[0].Page2[0].f2_09[0]',
    // Line 25a: W-2 withholding
    line25a: 'topmostSubform[0].Page2[0].f2_10[0]',
    // Line 25d: Total withholding
    line25d: 'topmostSubform[0].Page2[0].f2_13[0]',
    // Line 33: Total payments
    line33: 'topmostSubform[0].Page2[0].f2_19[0]',
    // Line 34: Overpaid
    line34: 'topmostSubform[0].Page2[0].f2_20[0]',
    // Line 37: Amount you owe
    line37: 'topmostSubform[0].Page2[0].f2_23[0]',
  },
};

const FORM_CA540_FIELDS = {
  default: {
    firstName: 'Text1',
    lastName: 'Text2',
    ssn: 'Text3',
    filingStatus_single: 'Check Box1',
    filingStatus_mfj: 'Check Box2',
    filingStatus_mfs: 'Check Box3',
    filingStatus_hoh: 'Check Box4',
    // Line 12: State wages
    line12: 'Text12',
    // Line 13: AGI from federal
    line13: 'Text13',
    // Line 15: CA adjustments
    line15: 'Text15',
    // Line 17: CA taxable income
    line17: 'Text17',
    // Line 18: CA deduction
    line18: 'Text18',
    // Line 19: Taxable income
    line19: 'Text19',
    // Line 31: Tax
    line31: 'Text31',
    // Line 35: CA tax liability
    line35: 'Text35',
    // Line 48: Mental Health Services Tax
    line48: 'Text48',
    // Line 64: Total tax
    line64: 'Text64',
    // Line 71: Withholding
    line71: 'Text71',
    // Line 91: Overpaid
    line91: 'Text91',
    // Line 93: Amount you owe
    line93: 'Text93',
  },
};

const FORM_NY_IT201_FIELDS = {
  default: {
    firstName: 'Text1',
    lastName: 'Text2',
    ssn: 'Text3',
    line1: 'Text_Line1',
    line19: 'Text_Line19',
    line32: 'Text_Line32',
    line33: 'Text_Line33',
    line37: 'Text_Line37',
    line39: 'Text_Line39',
    line46: 'Text_Line46',
    line47: 'Text_Line47',
    line62: 'Text_Line62',
    line72: 'Text_Line72',
    line78: 'Text_Line78',
    line80: 'Text_Line80',
  },
};

// ── HELPERS ──

function fmt(n) {
  if (n == null || isNaN(n)) return '0';
  return Math.round(n).toString();
}

function fmtCurrency(n) {
  return '$' + Math.round(n || 0).toLocaleString();
}

/**
 * Try to set a form field value. Silently skip if field doesn't exist.
 */
function trySetField(form, fieldName, value) {
  try {
    const field = form.getTextField(fieldName);
    if (field) {
      field.setText(String(value));
    }
  } catch (e) {
    // Field doesn't exist in this version of the PDF — skip
  }
}

/**
 * Try to check a checkbox field.
 */
function tryCheckField(form, fieldName) {
  try {
    const field = form.getCheckBox(fieldName);
    if (field) {
      field.check();
    }
  } catch (e) {
    // Skip
  }
}

// ── FORM FILLING ──

/**
 * Fill IRS Form 1040 with session data.
 * Returns { blob, url, name } or null if PDF not available.
 */
async function fill1040(session) {
  const year = session.taxYear || 2025;
  const f = session.filing;
  if (!f) return null;

  const pdfPath = `/taxes/forms/f1040-${year}.pdf`;
  const fields = FORM_1040_FIELDS.default;

  try {
    const pdfBytes = await fetch(pdfPath).then(r => {
      if (!r.ok) throw new Error(`PDF not found: ${pdfPath}`);
      return r.arrayBuffer();
    });

    const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();

    // Personal info
    trySetField(form, fields.firstName, session.firstName || '');
    trySetField(form, fields.lastName, session.lastName || '');
    if (session.ssnLast4) {
      trySetField(form, fields.ssn, `XXX-XX-${session.ssnLast4}`);
    }

    // Filing status checkboxes
    const statusMap = {
      single: fields.filingStatus_single,
      mfj: fields.filingStatus_mfj,
      mfs: fields.filingStatus_mfs,
      hoh: fields.filingStatus_hoh,
      qss: fields.filingStatus_qss,
    };
    if (statusMap[session.filingStatus]) {
      tryCheckField(form, statusMap[session.filingStatus]);
    }

    // Income lines
    trySetField(form, fields.line1a, fmt(f.totalW2Wages));
    trySetField(form, fields.line2b, fmt(f.totalInterest || 0));
    trySetField(form, fields.line3b, fmt(f.totalDividends || 0));
    trySetField(form, fields.line7, fmt(f.capitalGains || 0));

    // Other income (1099-NEC goes to Schedule C → Schedule 1 → line 8)
    const otherIncome = (f.totalNEC || 0) + (f.otherIncome || 0);
    if (otherIncome > 0) {
      trySetField(form, fields.line8, fmt(otherIncome));
    }

    // Totals
    trySetField(form, fields.line9, fmt(f.totalIncome));
    trySetField(form, fields.line10, fmt(f.adjustments));
    trySetField(form, fields.line11, fmt(f.agi));
    trySetField(form, fields.line12, fmt(f.deduction || f.standardDeduction));
    trySetField(form, fields.line14, fmt(f.deduction || f.standardDeduction));
    trySetField(form, fields.line15, fmt(f.taxableIncome));
    trySetField(form, fields.line16, fmt(f.fedIncomeTax));

    // SE tax
    if (f.seTax > 0) {
      trySetField(form, fields.line23, fmt(f.seTax));
    }

    // Total tax
    trySetField(form, fields.line24, fmt(f.totalFedTax));

    // Payments
    trySetField(form, fields.line25a, fmt(f.totalFedWithheld));
    trySetField(form, fields.line25d, fmt(f.totalFedWithheld));
    trySetField(form, fields.line33, fmt(f.totalFedWithheld));

    // Refund or owed
    if (f.fedResult >= 0) {
      trySetField(form, fields.line34, fmt(f.fedResult));
    } else {
      trySetField(form, fields.line37, fmt(Math.abs(f.fedResult)));
    }

    // Flatten so fields aren't editable
    form.flatten();

    const filledBytes = await pdfDoc.save();
    const blob = new Blob([filledBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    return {
      name: `Form_1040_${year}.pdf`,
      blob,
      url,
      formType: '1040',
      year,
    };
  } catch (e) {
    console.error('Error filling 1040:', e);
    // Fall back to generating a summary PDF
    return generateSummaryPdf('Federal Form 1040', session);
  }
}

/**
 * Fill CA Form 540 with session data.
 */
async function fillCA540(session) {
  const year = session.taxYear || 2025;
  const f = session.filing;
  if (!f || !f.caTax) return null;

  const pdfPath = `/taxes/forms/ca540-${year}.pdf`;
  const fields = FORM_CA540_FIELDS.default;

  try {
    const pdfBytes = await fetch(pdfPath).then(r => {
      if (!r.ok) throw new Error(`PDF not found: ${pdfPath}`);
      return r.arrayBuffer();
    });

    const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();

    trySetField(form, fields.firstName, session.firstName || '');
    trySetField(form, fields.lastName, session.lastName || '');
    if (session.ssnLast4) {
      trySetField(form, fields.ssn, `XXX-XX-${session.ssnLast4}`);
    }

    const statusMap = {
      single: fields.filingStatus_single,
      mfj: fields.filingStatus_mfj,
      mfs: fields.filingStatus_mfs,
      hoh: fields.filingStatus_hoh,
    };
    if (statusMap[session.filingStatus]) {
      tryCheckField(form, statusMap[session.filingStatus]);
    }

    trySetField(form, fields.line13, fmt(f.agi));
    trySetField(form, fields.line17, fmt(f.agi));
    trySetField(form, fields.line18, fmt(f.caDeduction || f.caStdDeduction || 5540));
    trySetField(form, fields.line19, fmt(f.caTaxableIncome));
    trySetField(form, fields.line31, fmt(f.caTax));
    trySetField(form, fields.line35, fmt(f.caTax));
    trySetField(form, fields.line64, fmt(f.caTax));
    trySetField(form, fields.line71, fmt(f.totalStateWithheld || 0));

    if (f.caResult >= 0) {
      trySetField(form, fields.line91, fmt(f.caResult));
    } else {
      trySetField(form, fields.line93, fmt(Math.abs(f.caResult)));
    }

    form.flatten();
    const filledBytes = await pdfDoc.save();
    const blob = new Blob([filledBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    return {
      name: `CA_540_${year}.pdf`,
      blob,
      url,
      formType: 'CA-540',
      year,
    };
  } catch (e) {
    console.error('Error filling CA 540:', e);
    return generateSummaryPdf('California Form 540', session);
  }
}

/**
 * Fill NY Form IT-201 with session data.
 */
async function fillNYIT201(session) {
  const year = session.taxYear || 2025;
  const f = session.filing;
  if (!f || !f.nyTax) return null;

  const pdfPath = `/taxes/forms/ny-it201-${year}.pdf`;
  const fields = FORM_NY_IT201_FIELDS.default;

  try {
    const pdfBytes = await fetch(pdfPath).then(r => {
      if (!r.ok) throw new Error(`PDF not found: ${pdfPath}`);
      return r.arrayBuffer();
    });

    const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();

    trySetField(form, fields.firstName, session.firstName || '');
    trySetField(form, fields.lastName, session.lastName || '');
    if (session.ssnLast4) {
      trySetField(form, fields.ssn, `XXX-XX-${session.ssnLast4}`);
    }

    trySetField(form, fields.line1, fmt(f.totalW2Wages || 0));
    trySetField(form, fields.line19, fmt(f.totalIncome));
    trySetField(form, fields.line32, fmt(f.agi));
    trySetField(form, fields.line33, fmt(f.nyDeduction || f.nyStdDeduction || 8000));
    trySetField(form, fields.line37, fmt(f.nyTaxableIncome));
    trySetField(form, fields.line39, fmt(f.nyTax));
    trySetField(form, fields.line46, fmt(f.nyTax));
    trySetField(form, fields.line62, fmt(f.nyTax));
    trySetField(form, fields.line72, fmt(f.totalStateWithheld || 0));

    if (f.nyResult >= 0) {
      trySetField(form, fields.line78, fmt(f.nyResult));
    } else {
      trySetField(form, fields.line80, fmt(Math.abs(f.nyResult)));
    }

    form.flatten();
    const filledBytes = await pdfDoc.save();
    const blob = new Blob([filledBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    return {
      name: `NY_IT201_${year}.pdf`,
      blob,
      url,
      formType: 'NY-IT201',
      year,
    };
  } catch (e) {
    console.error('Error filling NY IT-201:', e);
    return generateSummaryPdf('New York Form IT-201', session);
  }
}

/**
 * Fallback: Generate a summary PDF when the official fillable PDF isn't available.
 * Uses pdf-lib to create a simple text-based PDF with tax computation results.
 */
async function generateSummaryPdf(formTitle, session) {
  const f = session.filing;
  if (!f) return null;

  const pdfDoc = await PDFLib.PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // Letter size
  const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);

  const year = session.taxYear || 2025;
  let y = 740;
  const leftMargin = 72;
  const rightCol = 450;

  // Title
  page.drawText(`${formTitle} — Tax Year ${year}`, {
    x: leftMargin, y, size: 18, font: boldFont,
  });
  y -= 30;

  page.drawText('DRAFT — NOT FOR FILING', {
    x: leftMargin, y, size: 12, font: boldFont, color: PDFLib.rgb(0.8, 0.2, 0.2),
  });
  y -= 30;

  // Personal info
  page.drawText(`Name: ${session.firstName || ''} ${session.lastName || ''}`, {
    x: leftMargin, y, size: 11, font,
  });
  y -= 18;
  page.drawText(`Filing Status: ${session.filingStatus || 'single'}`, {
    x: leftMargin, y, size: 11, font,
  });
  y -= 30;

  // Line items
  const lines = [];
  if (formTitle.includes('1040')) {
    lines.push(
      ['Total Income', fmtCurrency(f.totalIncome)],
      ['Adjustments', fmtCurrency(f.adjustments)],
      ['Adjusted Gross Income', fmtCurrency(f.agi)],
      ['Deduction', fmtCurrency(f.deduction || f.standardDeduction)],
      ['Taxable Income', fmtCurrency(f.taxableIncome)],
      ['Federal Income Tax', fmtCurrency(f.fedIncomeTax)],
      ['Self-Employment Tax', fmtCurrency(f.seTax || 0)],
      ['Total Federal Tax', fmtCurrency(f.totalFedTax)],
      ['Total Payments/Withholding', fmtCurrency(f.totalFedWithheld)],
      ['', ''],
      [f.fedResult >= 0 ? 'REFUND' : 'AMOUNT OWED', fmtCurrency(Math.abs(f.fedResult))],
    );
  } else if (formTitle.includes('540')) {
    lines.push(
      ['Federal AGI', fmtCurrency(f.agi)],
      ['CA Taxable Income', fmtCurrency(f.caTaxableIncome)],
      ['CA Tax', fmtCurrency(f.caTax)],
      ['State Withholding', fmtCurrency(f.totalStateWithheld || 0)],
      ['', ''],
      [f.caResult >= 0 ? 'REFUND' : 'AMOUNT OWED', fmtCurrency(Math.abs(f.caResult))],
    );
  } else if (formTitle.includes('IT-201')) {
    lines.push(
      ['Federal AGI', fmtCurrency(f.agi)],
      ['NY Taxable Income', fmtCurrency(f.nyTaxableIncome)],
      ['NY Tax', fmtCurrency(f.nyTax)],
      ['State Withholding', fmtCurrency(f.totalStateWithheld || 0)],
      ['', ''],
      [f.nyResult >= 0 ? 'REFUND' : 'AMOUNT OWED', fmtCurrency(Math.abs(f.nyResult))],
    );
  }

  for (const [label, value] of lines) {
    if (!label && !value) { y -= 10; continue; }
    const isTotal = label === 'REFUND' || label === 'AMOUNT OWED';
    const useFont = isTotal ? boldFont : font;
    const size = isTotal ? 13 : 11;

    page.drawText(label, { x: leftMargin, y, size, font: useFont });
    page.drawText(value, { x: rightCol, y, size, font: useFont });
    y -= 20;
  }

  // Footer
  y = 60;
  page.drawText('Generated by CUBE Tax Prep — Not a substitute for professional tax advice.', {
    x: leftMargin, y, size: 9, font, color: PDFLib.rgb(0.5, 0.5, 0.5),
  });

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);

  const nameMap = {
    'Federal Form 1040': `Form_1040_${year}_Summary.pdf`,
    'California Form 540': `CA_540_${year}_Summary.pdf`,
    'New York Form IT-201': `NY_IT201_${year}_Summary.pdf`,
  };

  return {
    name: nameMap[formTitle] || `Tax_Summary_${year}.pdf`,
    blob,
    url,
    formType: formTitle,
    year,
    isSummary: true,
  };
}

/**
 * Download a generated form.
 */
function downloadForm(formObj) {
  if (!formObj || !formObj.url) return;
  const a = document.createElement('a');
  a.href = formObj.url;
  a.download = formObj.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Print a generated form.
 */
function printForm(formObj) {
  if (!formObj || !formObj.url) return;
  const w = window.open(formObj.url, '_blank');
  if (w) {
    w.addEventListener('load', () => w.print());
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.fill1040 = fill1040;
  window.fillCA540 = fillCA540;
  window.fillNYIT201 = fillNYIT201;
  window.generateSummaryPdf = generateSummaryPdf;
  window.downloadForm = downloadForm;
  window.printForm = printForm;
}
