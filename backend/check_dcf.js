import { getSummary, getFinancials, getBalanceSheet } from "./services/yahoofinance.js";
import { aggregateDCFInputs, projectFCF, monteCarlo } from "./services/dcf.js";

async function run() {
  for (const ticker of ["CBRS", "SPCX"]) {
    try {
      console.log(`\n=== DCF for ${ticker} ===`);
      const summary = await getSummary(ticker);
      const financials = await getFinancials(ticker);
      const balanceSheet = await getBalanceSheet(ticker);

      const inputs = aggregateDCFInputs(
        summary,
        financials,
        balanceSheet,
        financials.annualIncome,
        balanceSheet.annualCashFlow
      );

      console.log("Inputs:", inputs);

      const dcfResult = projectFCF(
        inputs.fcf,
        inputs.projectionGrowth,
        inputs.terminalGrowth,
        inputs.wacc,
        inputs.cash,
        inputs.debt,
        inputs.sharesOutstanding,
        inputs.projectionYears
      );
      console.log("DCF result:", dcfResult);

      const mcResult = monteCarlo(
        inputs.fcf,
        inputs.projectionGrowth,
        inputs.wacc,
        inputs.cash,
        inputs.debt,
        inputs.sharesOutstanding,
        100, // iterations
        inputs.terminalGrowth,
        inputs.projectionYears
      );
      console.log("Monte Carlo (histogram first 2):", mcResult.histogram.slice(0, 2));
    } catch (err) {
      console.error(`Failed for ${ticker}:`, err);
    }
  }
  process.exit(0);
}

run();
