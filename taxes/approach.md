# Tax Preparation Dashboard — Research & Approach

## How the Industry Handles Tax Preparation

### TurboTax (Intuit)

**Compliance**: TurboTax maintains a proprietary tax rules engine updated annually by a team of CPAs and tax attorneys. Every field maps to specific IRS form lines. The system validates against ~4,000 IRS rules and cross-references entries across forms (e.g., W-2 Box 1 must flow to 1040 Line 1a). "Accuracy Guarantee" backs this with audit defense.

**Completeness**: Interview-based flow walks users through every life event that could trigger a deduction or credit. The "Life Changes" wizard probes for missed items. A final "Federal Review" step checks for blank required fields, inconsistencies, and common omissions (e.g., state taxes paid, HSA contributions).

**Tax Savings**: "Deduction Finder" suggests itemized vs. standard deduction. Prompts for education credits, child tax credit, retirement contributions. Runs parallel calculations to recommend optimal filing strategy. Upsells to higher tiers for access to more optimization.

### H&R Block

**Compliance**: Similar rules engine to TurboTax but also leverages their 60,000+ in-person tax preparers' institutional knowledge. "Second Look" feature re-examines prior-year returns for missed deductions. More conservative approach — tends to flag ambiguous situations for human review.

**Completeness**: Step-by-step guided flow with document checklist. Integration with ADP and payroll providers for automatic W-2 import. "Tax Identity Shield" adds verification layer. Year-over-year comparison flags missing income sources.

**Tax Savings**: "Refund Reveal" shows running refund as entries are made. Proactive prompts for commonly missed deductions. Free "Tax Pro Review" in higher tiers where a human CPA checks optimization.

### IRS Direct File (Free File)

**Compliance**: Minimal — handles only simple returns (W-2 income, standard deduction, limited credits). Built on exact IRS form logic with no interpretation layer. Strict input validation against IRS schemas.

**Completeness**: Very limited scope by design. Only supports a handful of form types. No deduction optimization. Advantage: zero cost, direct IRS integration, instant acceptance confirmation.

**Tax Savings**: None beyond basic credits (EITC, Child Tax Credit). No optimization — assumes standard deduction. Designed for simplicity, not savings.

---

## Our Approach: Two Guarantees

We built our system around two clear promises:

1. **Audit Shield** — "If you're honest, you won't get audited." Every compliance rule maps to a real IRS or California tax code section. The rules engine verifies withholding rates, bracket math, identity consistency, and audit risk indicators. When all compliance checks pass, your return matches what the IRS expects to see.

2. **Savings Finder** — "We check every deduction you qualify for." Savings rules actively look for missed deductions and credits: retirement contributions, HSA, QBI deduction, home office, student loan interest, CA renter's credit, and more. Each savings rule tells you exactly what you could claim and why.

### Rules Engine Architecture

Every rule is a structured object with real tax code citations:

```javascript
{
  id: "fed-w2-inc-01",
  name: "W-2 Wages to 1040 Line 1a",
  taxCode: { section: "IRC 61(a)", form: "1040", line: "1a" },
  scenarios: ["fed-w2"],
  stage: "income",
  type: "compliance",
  severity: "error",
  check(state) { ... }
}
```

**69 rules** across 4 scenarios and 6 stages:

| Stage | Name | What it covers |
|-------|------|----------------|
| 1 | Income Reporting | Document completeness, identity consistency, income flows, withholding rates |
| 2 | Adjustments | SE deduction, retirement contributions, HSA, student loan interest |
| 3 | Deductions | Standard vs itemized, SALT cap, home office, QBI deduction |
| 4 | Credits | CTC, EITC, education credits, CA renter's credit, energy credits |
| 5 | Tax Computation | AGI, federal/CA brackets, SE tax, refund/owed, estimated tax penalty |
| 6 | Optimization | Math verification, audit risk indicators (round numbers, high income, loss ratios) |

**4 scenarios** (tag-based filtering, not separate rule trees):
- `fed-w2` — Federal W-2 employee
- `fed-1099` — Federal 1099 self-employed
- `ca-w2` — California W-2
- `ca-1099` — California 1099

**2 rule types**:
- `compliance` (~55 rules) — Audit safety checks
- `savings` (~16 rules) — Deduction and credit optimization

### Binary Field Extraction (Not Confidence Scoring)

We deliberately chose binary extraction status over confidence scoring:

- Each field is either **extracted** or **not_found** — no ambiguous 0.0-1.0 scores
- Document cards show a checkmark (all fields extracted) or warning icon (some missing)
- The "Field Extraction" completeness bar = extracted fields / total fields
- This is simpler to understand and more honest — either we got the data or we didn't

### IRS DIF Score Awareness

The IRS uses a proprietary scoring model (DIF) to select returns for audit. Known factors include:

- **Income-to-deduction ratios**: Deductions disproportionate to income
- **Schedule C losses**: Repeated business losses, especially against W-2 income
- **Round numbers**: Excessive round-number entries suggest estimation
- **Outlier detection**: Entries far from statistical norms for income bracket
- **High-income returns**: Audit rates increase significantly above $200K AGI
- **Cash businesses**: Industries with high cash transaction volume
- **Home office deductions**: Historically high audit trigger

Our Stage 6 (Optimization) rules check for these factors and flag potential issues.

---

## Claude Vision API for Document Processing

We use Claude's vision capabilities for document OCR and field extraction:

**Pipeline**:
1. **Upload**: User drops W-2/1099 PDF or image
2. **Vision Extract**: Claude Vision identifies document type and extracts all fields
3. **Validate**: Each field checked against expected format (EIN format, SSN format, dollar amounts)
4. **Cross-Reference**: Fields compared across documents (employer EIN on W-2 vs 1099, SSN consistency)
5. **Map**: Extracted values placed into tax computation
6. **Compute**: Downstream values calculated (AGI, taxable income, tax owed)
7. **Review**: Human reviews any fields that couldn't be extracted

**Why Claude Vision over Tesseract/AWS Textract**:
- Understands document semantics, not just OCR — knows what a W-2 *is*
- Can handle varied layouts (different employer W-2 formats)
- Extracts structured data directly (field name → value mapping)
- Provides natural-language explanation of ambiguous extractions
- Single API handles OCR + field identification + validation reasoning

### Filing Scope

**Federal (Form 1040)**:
- Income: W-2 wages, 1099-NEC self-employment, 1099-INT interest, 1099-DIV dividends
- Above-the-line deductions: SE tax deduction, student loan interest, IRA, HSA
- Standard vs. itemized deduction comparison
- Tax computation with bracket application
- Credits: Child Tax Credit, EITC, Saver's Credit, energy credits
- Payments: W-2 withholding, estimated payments
- Refund or amount owed

**California (Form 540)**:
- Starts from federal AGI
- California-specific adjustments
- CA standard deduction ($5,540 single / $11,080 MFJ for 2025)
- CA tax brackets (1% to 12.3% + Mental Health Tax)
- Mental Health Services Tax (1% above $1M)
- CA withholding from W-2 Box 17
- Renter's credit, SDI overpayment

### Completeness Tracking

The dashboard tracks completeness at multiple levels:

1. **Document Collection**: Which expected documents have been uploaded?
2. **Field Extraction**: What percentage of fields were successfully extracted?
3. **Cross-Validation**: Do values agree across documents?
4. **Rules Engine**: Compliance check pass rate
5. **Review Status**: Have missing fields been manually verified?

Each level rolls up into an overall "readiness to file" score displayed prominently on the dashboard.

---

## Risk Mitigation

- **No e-filing**: We generate completed forms for review, not direct submission
- **Human-in-the-loop**: Every extracted value is reviewable and editable
- **Conservative defaults**: When ambiguous, we flag for review rather than guess
- **Audit trail**: Every value traces to a source document or explicit user entry
- **Real tax code citations**: Every rule references an IRC or CA RTC section
- **Disclaimer**: Dashboard clearly states this is a preparation tool, not tax advice
