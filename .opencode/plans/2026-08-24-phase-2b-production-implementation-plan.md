# Phase 2B Production Implementation Plan

## Status

The user has approved the shared residual-income kernel with separate bank and insurer adapters. This is the implementation plan; no live issuer mapping or production feature is approved by this document alone.

## Non-negotiable release gates

- An issuer is valued only after its exact SEC/regulatory mapping is verified from an authoritative, dated filing. No generic extension-tag guessing.
- Bank CET1/RWA and insurer statutory-surplus/RBC checks are eligibility gates. Missing or unresolved data returns a structured unvalued response; it is never downgraded to a warning.
- The service requires a configured SEC_USER_AGENT with a real application contact before live SEC requests. The existing placeholder contact must not be reused.
- The production pilot must manually verify two banks, one P&C insurer, and one life insurer. Non-allowlisted financial issuers return rim-classification-unsupported.
- The existing experimental backtest remains separate evidence. Its finite five-year fade/no-terminal implementation is not production code.

## Scope

Keep GET /api/stocks/:ticker/dcf backward compatible. Corporate FCFF response fields and behaviour do not change. Financial results add a rim object, while dcf, monteCarlo, and sensitivity stay null.

Initial supported financial types are U.S.-listed commercial-bank/bank-holding-company, P&C insurer, and life insurer. Brokers, asset managers, mortgage REITs, fintechs, reinsurers without verified statutory inputs, foreign issuers, and any unmapped issuer remain unvalued.

## Work sequence

### 1. SEC financial source layer

Owner: coder

Create one SEC financial-data service, reusing the existing company-ticker cache/rate limiter rather than creating another CIK resolver.

It must:

1. Resolve ticker to CIK from SEC company_tickers.json.
2. Fetch the applicable submissions and Company Facts resources with the configured SEC user agent and existing rate limiter.
3. Select the latest available 10-Q or 10-K at or before valuation time and retain accession, form, accepted/filed timestamp, period end, taxonomy, tag/table, unit, and selection rule.
4. Collect three reconciled annual periods for common equity, common net income, common distributions, and point-in-time common shares.
5. Treat duplicate, amendment, unit, or period conflicts as a reason code until an explicit selection rule resolves them.
6. Cache the full source result with a short SEC-appropriate TTL. Upstream SEC/FRED failure remains a 502; missing financial fields return success:true with eligible:false.

The existing Yahoo quote/beta/current-share input may remain the current-market source. It cannot supply the common-equity or common-distribution fields.

### 2. Explicit issuer map and adapter gates

Owner: coder

Add one versioned issuer-map module. Each allowlisted issuer entry specifies:

- subtype and effective date;
- standard concepts or manually reviewed filing-table locations for common equity, common income, common distributions, and shares;
- bank CET1 capital/CET1 ratio/RWA mapping and minimum/buffer rule, or insurer statutory surplus/RBC/GAAP-to-SAP bridge mapping;
- source URL/accession/table name and human-reviewed selection notes.

No fallback makes a new issuer eligible. A missing map produces rim-classification-unsupported. A mapped issuer with missing/reconciled data produces the precise rim reason code from the approved proposal.

The implementation cannot claim a broad bank/insurer launch until this map exists for the pilot issuers.

### 3. Pure residual-income kernel

Owner: coder

Add one pure backend residual-income module, not an alternate DCF branch. Input is the validated adapter record plus a fully sourced cost-of-equity record.

It calculates:

~~~text
RI_t = NI_t - ke * B_(t-1)
B_t = B_(t-1) + NI_t - commonDistributions_t + reconciledOtherEquityChanges_t
V0 = B0 + PV(explicit RI) + PV(terminal RI)
~~~

v1 rules:

- five explicit years;
- starting ROE is the median of three to five reconciled annual ROEs;
- ROE fades to the issuer-subtype steady-state assumption;
- distribution rate is limited by mapped bank capital or insurer solvency capacity;
- terminal value requires finite positive book value, ke > g, and g = (1 - payout) * ROE;
- cost of equity uses a dated FRED risk-free observation, market beta, and a versioned ERP. Missing/stale components are unvalued; no silent beta, ERP, or risk-free fallback;
- current point-in-time common shares divide the resulting equity value. No future-share-count simulation in v1.

Return the base, bear, and bull scenarios with their exact source-backed assumptions and a yearly book/earnings/distributions/residual-income schedule.

### 4. Route contract

Owner: coder

Change the existing financial early-return branch only:

- Obtain validated financial source data and cost-of-equity inputs before deciding rim eligibility.
- For eligible financial issuers return params.modelType = financial-residual-income, params.eligible = true, params.financialSubtype, source quality/provenance, rim, and null DCF fields.
- For ineligible financial issuers return the same response shape with rim:null, structured reason codes, and no FCFF/FRED corporate calculation.
- For corporate issuers preserve the response byte shape except for additive rim:null.

### 5. UI and release note

Owner: ui_specialist

Branch on dcfData.rim before the existing dcf-null unavailable state. Render a compact, labelled Residual Income card with fair value, upside, subtype, base assumptions, capital/solvency status, reason codes, and the explicit-year schedule. Do not render FCFF sliders, Monte Carlo, or DCF sensitivity for RIM results.

Add the required August 2026 release-note entry only with the feature implementation.

### 6. Tests and release validation

Owner: coder then qa_specialist

Focused backend tests must cover:

- direct and derived common-equity/common-income selection;
- date/accession availability, units, amended filings, and source provenance;
- clean-surplus reconciliation and missing distributions;
- bank capital and insurer solvency hard gates;
- terminal identity, no price calibration, and non-finite rejection;
- route behaviour for eligible RIM, structured unvalued RIM, and unchanged corporate FCFF.

Focused frontend tests must cover eligible RIM and unvalued RIM rendering.

Before release, run the pinned 2022 corpus plus a separate out-of-sample window. Report coverage, median absolute percentage error, directional accuracy, and reason-code counts separately for banks and insurers. Manually inspect provenance for the four pilot issuer types before enabling their map entries.

## Implementation blocker

The repository has no verified production issuer map and no real SEC contact configuration. A coder can safely build the kernel and the strict unvalued contract, but cannot responsibly enable a useful production bank/insurer valuation until the pilot issuers and their filing-table/regulatory mappings are verified.

## Next approval/action

Provide the SEC contact value for SEC_USER_AGENT and confirm the pilot issuer set, or authorize a research pass to select/map two banks, one P&C insurer, and one life insurer from current filings. With that evidence, implementation can begin without weakening the approved gates.

