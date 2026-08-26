# JPM Residual-Income Distribution Source Proposal

## Decision requested

Approve or reject a JPM-specific, source-pinned common-distribution map for
the existing residual-income adapter. This proposal changes neither the model
kernel nor insurer coverage.

## Evidence

Source: JPMorgan Chase & Co. 2025 Form 10-K, filed 2026-02-13, accession
`000162828026008131`, primary document `jpm-20251231.htm`.

| Component | Concept | Contexts (2025 / 2024 / 2023) | Values ($bn) |
| --- | --- | --- | --- |
| Common dividends | `us-gaap:DividendsCommonStockCash` | `c-63` / `c-64` / `c-65` | 16.060 / 13.786 / 12.055 |
| Common repurchases | `us-gaap:PaymentsForRepurchaseOfCommonStock` | `c-1` / `c-28` / `c-29` | 31.591 / 18.830 / 9.824 |
| Treasury-stock reissuance | `jpm:TreasuryStockValueReissued` | `c-77` / `c-78` / `c-79` | 1.351 / 1.206 / 1.099 |

The generic `us-gaap:ProceedsFromStockOptionsExercised` tag is absent. The
available `AdjustmentsToAdditionalPaidInCapitalSharebasedCompensationAndExerciseOfStockOptions`
facts are narrower than total reissuance and should not substitute for it.

Official sources:

- https://www.sec.gov/Archives/edgar/data/19617/000162828026008131/jpm-20251231.htm
- https://www.sec.gov/Archives/edgar/data/19617/000162828026008131/jpm-20251231_htm.xml

## Options

1. Keep JPM unvalued. This retains the current safety gate but leaves a
   second bank unsupported despite reviewed facts.
2. Use treasury-stock reissuance as the explicit issuance offset in
   `dividends + repurchases - reissuance`. This recognizes the documented
   offset to common-equity distributions, while remaining source-pinned.

## Recommendation

Choose option 2, with these non-negotiable controls:

- Pin the accession, primary document, tags, dimensions, and all annual
  context references above.
- Require one matching fact per component; any missing or duplicate fact is
  `rim-common-distributions-incomplete`.
- Retain the current clean-surplus, capital, and share gates. If the full
  JPM history cannot reconcile within the existing tolerance, remain
  `rim-clean-surplus-unreconciled`; do not introduce a balancing adjustment.
- Bump the adapter cache namespace and add focused regressions for the
  issuer-specific contexts and primary-document mismatch.

This is a narrow JPM data-source assumption only. It does not make treasury
reissuance a generic treatment for other banks.

## Expected change surface

- `backend/services/financialResidualIncome.js`
- `backend/services/__tests__/financialResidualIncome.test.js`
- `frontend/public/release-notes.html` only if the gate becomes valued for
  users.
