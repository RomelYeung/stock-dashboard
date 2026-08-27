# Phase 2B Proposal: Production Residual-Income Data and Assumptions

## Status

Proposal only. It selects no implementation path and changes no production behavior. Approval is required before building the data adapter, model, API contract, UI, or release note.

## Decision requested

Adopt a single residual-income calculation kernel with **separate bank and insurer data/assumption adapters**. Phase 2B would initially support only U.S.-listed bank holding companies/commercial banks and P&C/life insurers whose required source fields pass the eligibility gates below. Ambiguous financial companies (brokers, asset managers, mortgage REITs, fintechs, reinsurers without the required statutory data, and foreign issuers) remain explicitly unvalued.

This is the recommended choice because one common formula is appropriate, but GAAP book equity, banking capital, insurer statutory surplus, and reserve disclosures are not interchangeable. The existing eight-company residual-income comparison is retained only as experimental backtest evidence; it is not promoted to production.

## Why a separate contract is needed

The live /api/stocks/:ticker/dcf flow deliberately returns no valuation for the financial-residual-income cohort, while its Yahoo inputs do not provide common net income, common dividends, or common/preferred equity. The experimental SEC ingestion already extracts some of these fields with tag provenance, but it is an as-of fixture pipeline rather than a live production source. The experimental RIM also uses a five-year earnings fade with no terminal value and warns that insurer GAAP equity is only a proxy.

Residual income values equity directly:

~~~text
V0 = B0 + sum(RI_t / (1 + ke)^t) + TV_RI / (1 + ke)^N
RI_t = NI_t - ke * B_(t-1)
B_t = B_(t-1) + NI_t - common_distributions_t + reconciled_other_equity_changes_t
~~~

ke is cost of equity. The terminal value is allowed only when g < ke and terminal ROE, payout, and growth agree: g = (1 - payout) * ROE. This follows the standard book-value/excess-return framework and uses beginning book equity for ROE. See [Damodaran's price-to-book determinants](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/invfables/pbvdeterminants.htm) and [valuation text](https://pages.stern.nyu.edu/~adamodar/pdfiles/uValue/uValuebook.pdf).

## Data policy

### Source precedence and provenance

1. **SEC filing/XBRL facts are canonical** for common equity, common earnings, common distributions, historical book value, and filing dates. SEC Company Facts/XBRL may contain filer-specific extension tags, so every selected value must carry the concept, taxonomy version, unit, period end, accession, filed/accepted timestamp, and selection rule. [SEC API documentation](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)
2. **SEC filing tables/notes are the fallback** for capital and statutory/solvency data not represented by a stable standard tag. Each fallback is issuer-specific, versioned, and reviewable; never silently map a new extension tag.
3. **Current quote, beta, and current point-in-time shares** continue to come from the existing market-data path, but their provider/time must be recorded. SEC shares are the fallback only when a point-in-time market-data share count is unavailable.
4. **FRED risk-free rate** and a versioned market-risk-premium dataset feed cost of equity. A live result records observation date, retrieval timestamp, source/version, and any fallback.
5. **Regulatory data is a guardrail, not a substitute valuation base.** Bank CET1/RWA and insurer statutory surplus/RBC must retain their original basis and source. They must not be mixed into GAAP common book equity or GAAP net income without an explicit reconciliation.

SEC Financial Statement Data Sets remain useful for deterministic historical replay, but not as the sole live source: they are quarterly, flattened primary-statement data and omit many required disclosures. [SEC FSDS documentation](https://www.sec.gov/data-research/sec-markets-data/financial-statement-data-sets)

### Common core record

Every eligible issuer needs these dated, sourced fields:

| Field | Required rule |
| --- | --- |
| commonEquity (B0) | Direct parent common equity when available; otherwise total equity minus preferred equity and noncontrolling interests, with each component sourced. Reject if a required subtraction is unknown. |
| commonNetIncome | Direct income attributable to common holders; otherwise consolidated net income less preferred dividends and NCI income, with the derived basis recorded. |
| commonDistributions | Cash common dividends plus net common repurchases (repurchases less issuance). A missing material component is a reason code, not zero. |
| sharesOutstanding | Latest point-in-time common shares at or before valuation timestamp; record date/basis. Weighted-average shares are historical fallback only and must be labelled. |
| bookValueHistory | At least three annual, reconciled beginning/ending common-equity observations, each tied to a filing acceptance timestamp. |
| earningsHistory | Matching annual common-net-income observations and adjustments for one-offs. |
| costOfEquity | Risk-free rate, beta, ERP, size premium if used, calculation and source timestamps. |
| classification | Explicit supported subtype and source/effective date; no sector/industry regex alone determines production eligibility. |

The record includes periodEnd, availableAt, valuationAsOf, sourceUrl, accession, taxonomy, tagOrTable, unit, basis, selectionRule, and diagnostics. The latest available filing must satisfy availableAt <= valuationAsOf; a backtest must use the same rule rather than today's restated facts.

### Bank adapter

Required valuation-base fields are the common core plus a separate regulatory-capital record:

| Field | Treatment |
| --- | --- |
| Common equity and common earnings | GAAP/SEC valuation base. CET1 is never substituted for book equity. |
| CET1 capital, CET1 ratio, RWA | Required guardrail when disclosed; retain the filing-table source and reporting basis. |
| Minimum/buffer capital | Versioned regulatory assumption for distribution-capacity checks, not an earnings forecast. Basel minimum CET1 is 4.5%, with a 2.5% conservation buffer constraining distributions; local applicability must be issuer-specific. [Basel RBC20](https://www.bis.org/basel_framework/chapter/RBC/20.htm?export=pdf&inforce=20230101&published=20201126&tldate=20221119) |
| Credit-loss/provision and AOCI flags | Required diagnostics for earnings/book-value normalization; Phase 2B does not invent a portfolio credit model. |

The initial bank scope excludes firms whose reported capital framework cannot be reconciled to the required fields. This removes the current classifier's unsafe implication that every broker or other financial company is a bank.

### Insurer adapter

Required valuation-base fields are the common core plus a separate solvency record:

| Field | Treatment |
| --- | --- |
| GAAP common equity and common earnings | Valuation base, subject to clean-surplus reconciliation. |
| Statutory surplus, RBC ratio/authorized-control level | Required solvency guardrail where disclosed; never combined with GAAP earnings/book value without a documented bridge. |
| Reserve development, catastrophe/large-loss, realized investment-gain flags | Required normalization diagnostics; absent or materially unresolved flags make the issuer unvalued. |
| Admitted-assets and GAAP-to-SAP bridge | Disclosure-backed reconciliation only; no generic conversion factor. |

U.S. insurer statutory accounting is designed for solvency, uses admitted-asset and liability conventions that differ from GAAP, and its RBC is risk/size based. [NAIC SAP](https://content.naic.org/insurance-topics/statutory-accounting-principles) and [NAIC RBC](https://content.naic.org/insurance-topics/risk-based-capital). For Phase 2B, this means statutory figures constrain sustainable distributions; they do not replace the market-value residual-income base.

## Assumption policy

### Versioned model assumptions

The response carries modelId, assumptionSetId, asOf, and a structured assumptions/provenance object. A result is reproducible only with the associated source records and assumptions, not by recalculating it against current data.

| Assumption | Base policy | Guardrail |
| --- | --- | --- |
| Explicit horizon | Five years | Same horizon for all scenarios in v1. |
| Starting ROE | Median of the latest three to five reconciled annual ROEs, after disclosed one-off adjustments | Require positive beginning book equity and matching periods; no automatic value when volatility/adjustments are unresolved. |
| ROE fade | Fade base ROE to subtype-specific steady-state ROE by year five | Steady-state ROE and payout must imply g < ke; do not perpetuate a peak-cycle ROE. |
| Payout/distribution rate | Median historical common-distribution payout, then cap by bank capital or insurer solvency capacity | Require source coverage for dividends, repurchases, and issuance; otherwise do not claim clean surplus. |
| Cost of equity | rf + beta * ERP + documented size premium | No silent beta/ERP default. Missing or stale components yield eligible:false with a reason code. |
| Terminal residual income | Perpetuity from year-six residual income | Only if finite, ke > g, terminal book is positive, and the steady-state identity holds. |
| Share count | Current point-in-time common shares | Record buyback/issuance effect through distributions; do not simulate future share count in v1. |

The API presents bear/base/bull scenarios by varying only starting ROE, steady-state ROE, and permitted payout within source-backed/capital-backed ranges. It must not calibrate inputs to the current price, and it must display the assumption source or fallback for every scenario.

### Normalization and clean-surplus gates

Before an issuer can be valued, the adapter must expose and reconcile material changes in common equity. The initial reason-code set is:

~~~text
rim-classification-unsupported
rim-common-equity-unavailable
rim-common-earnings-unavailable
rim-common-distributions-incomplete
rim-book-history-insufficient
rim-clean-surplus-unreconciled
rim-shares-unavailable
rim-cost-of-equity-unavailable
rim-bank-capital-unavailable
rim-bank-capital-buffer-breached
rim-insurer-solvency-unavailable
rim-insurer-gaap-sap-bridge-unresolved
rim-terminal-assumptions-invalid
~~~

OCI/AOCI, preferred dividends, NCI, share issuance/repurchase, acquisitions/disposals, reserve-development effects, realized investment gains/losses, and one-off legal/catastrophe items are never silently dropped. A disclosure-backed adjustment may be included in normalization; otherwise the affected issuer/scenario remains unavailable.

## Candidate production contract

Phase 2B should keep the existing endpoint and additive response shape. For an eligible financial issuer:

~~~text
params: {
  modelType: "financial-residual-income",
  eligible: true,
  financialSubtype: "bank" | "insurer",
  assumptionSetId, valuationAsOf,
  costOfEquity, terminalGrowth,
  dataQuality: { reasonCodes, warnings, sources }
}
rim: {
  fairValue, equityValue, bookValue, pvExplicitResidualIncome, pvTerminalResidualIncome,
  projectedYears: [{ year, beginningBook, roe, earnings, distributions, residualIncome, endingBook }],
  terminal: { roe, payout, growth, residualIncome, value },
  scenarios: { bear, base, bull }
}
~~~

dcf, monteCarlo, and FCFF sensitivity remain null for financial residual-income results in v1; a separate rim object avoids pretending that an equity model is a DCF. The frontend should render an explicitly labelled residual-income view only after data eligibility is true. The legacy AI RIM output and its synthetic defaults are excluded from this contract.

## Validation before release

1. Keep the existing pinned 2022 bank/insurer fixture as a regression corpus, but add a separate out-of-sample window and report coverage, median absolute percentage error, directional accuracy, and reason-code counts by bank versus insurer.
2. Add deterministic unit tests for common-equity derivation, common-income derivation, clean-surplus roll-forward, capital/solvency gating, terminal consistency, and no-current-price calibration.
3. Add route tests proving unsupported/insufficient-data financial issuers return a structured unvalued residual-income response before any FCFF calculation.
4. Manually inspect source provenance for at least two banks, one P&C insurer, and one life insurer before enabling the subtype in production.
5. Release only when the model result, its scenario assumptions, and every material source field are visible and reproducible from the response.

## Alternatives considered

| Option | Benefit | Rejected risk |
| --- | --- | --- |
| Reuse the experimental generic RIM unchanged | Smallest code diff | It has no terminal value, uses incomplete clean-surplus inputs, and labels insurer GAAP as a proxy. |
| One generic financial adapter | Faster initial coverage | It conflates regulatory capital and statutory accounting with GAAP valuation inputs. |
| **Shared RIM kernel plus bank/insurer adapters** | Small shared calculation and auditable sector-specific data gates | More source mapping up front; recommended. |
| Banks first, insurers later | Lowest data risk | Does not meet the stated Phase 2B bank-and-insurer objective. |

## Deferred

- Broker/dealer, asset manager, mortgage REIT, fintech, and foreign-bank/foreign-insurer valuation.
- Generic GAAP-to-SAP conversion, embedded value, or actuarial reserve projection.
- Automated extension-tag acceptance, forecast consensus ingestion, and future-share-count simulation.
- Monte Carlo and a shared DCF/RIM sensitivity UI; add only after the deterministic v1 data contract and backtest pass.

## Approval gate

If approved, the next step is a narrow implementation plan for the two adapters, shared deterministic kernel, additive API response, focused tests, and one user-visible release note. If the desired rollout should instead be banks first, or a GAAP-only insurer model without statutory gating, choose that explicitly before implementation.

