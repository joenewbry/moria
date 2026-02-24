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

## Confidence & Audit Risk Scoring

### IRS DIF Score (Discriminant Information Function)

The IRS uses a proprietary scoring model (DIF) to select returns for audit. While the exact formula is secret, known factors include:

- **Income-to-deduction ratios**: Deductions disproportionate to income
- **Schedule C losses**: Repeated business losses, especially against W-2 income
- **Round numbers**: Excessive round-number entries suggest estimation
- **Outlier detection**: Entries far from statistical norms for income bracket
- **High-income returns**: Audit rates increase significantly above $200K AGI
- **Cash businesses**: Industries with high cash transaction volume
- **Home office deductions**: Historically high audit trigger
- **Cryptocurrency**: Emerging focus area for IRS enforcement

### Field-Level Confidence (Our Innovation)

Commercial tools use binary validation (valid/invalid). We introduce three-tier confidence scoring at the individual field level:

| Tier | Score | Meaning | Visual |
|------|-------|---------|--------|
| High | ≥ 0.95 | OCR extracted cleanly, cross-validated against other fields | Green |
| Medium | 0.80–0.94 | Extracted but needs human verification (ambiguous characters, no cross-reference) | Yellow |
| Low | < 0.80 | Could not extract reliably, manual entry required | Red |

This is more granular than any commercial product and directly supports our "trust but verify" philosophy.

---

## Our Approach

### Architecture: Field-Level Dependency Graph

Every tax form field is modeled as a node in a directed acyclic graph (DAG). Edges represent computational dependencies:

```
W-2 Box 1 (Wages) ──→ 1040 Line 1a (Total Wages)
W-2 Box 2 (Federal Tax Withheld) ──→ 1040 Line 25a (W-2 Withholding)
1099-NEC Box 1 (Nonemployee Compensation) ──→ Schedule SE Line 2
Schedule SE Line 12 ──→ 1040 Line 15 (SE Tax)
Schedule SE Line 13 ──→ 1040 Schedule 1 Line 15 (SE Deduction)
```

Benefits:
- **Automatic propagation**: Change a W-2 value, all downstream fields recompute
- **Confidence inheritance**: A downstream field's confidence is bounded by its inputs
- **Completeness tracking**: Unfilled upstream nodes highlight exactly what's missing
- **Audit trail**: Every computed value traces back to source documents

### Three-Tier Confidence System

**Document Level**: Overall confidence that a document was correctly identified and parsed.
- High: Clear scan, all fields extracted, document type confirmed
- Medium: Some fields ambiguous, document type probable
- Low: Poor scan quality, significant extraction failures

**Field Level**: Confidence in each extracted value.
- High: Clean OCR, passes format validation, cross-references match
- Medium: OCR result plausible but ambiguous (e.g., "1" vs "l", "0" vs "O")
- Low: OCR failed or produced implausible result

**Computation Level**: Confidence in calculated/derived values.
- High: All inputs are high-confidence, computation is deterministic
- Medium: At least one input is medium-confidence
- Low: Any input is low-confidence, or computation involves judgment calls

### Claude Vision API for Document Processing

We use Claude's vision capabilities for document OCR and field extraction:

**Pipeline**:
1. **Upload**: User drops W-2/1099 PDF or image
2. **Vision Extract**: Claude Vision identifies document type and extracts all fields with positional data
3. **Validate**: Each field checked against expected format (EIN format, SSN format, dollar amounts)
4. **Cross-Reference**: Fields compared across documents (employer EIN on W-2 vs 1099, SSN consistency)
5. **Map**: Extracted values placed into dependency graph nodes
6. **Compute**: Downstream values calculated (AGI, taxable income, tax owed)
7. **Review**: Human reviews any field below high confidence

**Why Claude Vision over Tesseract/AWS Textract**:
- Understands document semantics, not just OCR — knows what a W-2 *is*
- Can handle varied layouts (different employer W-2 formats)
- Extracts structured data directly (field name → value mapping)
- Provides natural-language explanation of ambiguous extractions
- Single API handles OCR + field identification + validation reasoning

### Filing Scope

**Federal (Form 1040)**:
- Income: W-2 wages, 1099-NEC self-employment
- Above-the-line deductions: SE tax deduction, student loan interest
- Standard vs. itemized deduction comparison
- Tax computation with bracket application
- Credits: Child Tax Credit, EITC (if applicable)
- Payments: W-2 withholding, estimated payments
- Refund or amount owed

**California (Form 540)**:
- Starts from federal AGI
- California-specific adjustments
- CA standard deduction ($5,540 single / $11,080 MFJ for 2025)
- CA tax brackets (1% to 13.3%)
- Mental Health Services Tax (1% above $1M)
- CA withholding from W-2 Box 17
- Renter's credit (if applicable)

### Completeness Tracking

The dashboard tracks completeness at multiple levels:

1. **Document Collection**: Which expected documents have been uploaded?
2. **Field Extraction**: What percentage of fields were successfully extracted?
3. **Cross-Validation**: Do values agree across documents?
4. **Form Population**: What percentage of required form fields are filled?
5. **Review Status**: Have all medium/low confidence fields been human-verified?

Each level rolls up into an overall "readiness to file" score displayed prominently on the dashboard.

---

## Risk Mitigation

- **No e-filing**: We generate completed forms for review, not direct submission
- **Human-in-the-loop**: Every extracted value is reviewable and editable
- **Conservative defaults**: When ambiguous, we flag for review rather than guess
- **Audit trail**: Every value traces to a source document or explicit user entry
- **Disclaimer**: Dashboard clearly states this is a preparation tool, not tax advice
