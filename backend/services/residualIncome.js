function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function invalid(reasonCodes) {
  return { eligible: false, status: "invalid", reasonCodes };
}

/**
 * Value equity with a finite residual-income forecast and a steady-state tail.
 * Inputs are deliberately scalar: adapters own sourcing and reconciliation.
 */
function calculateResidualIncome(inputs = {}) {
  const {
    bookValue,
    sharesOutstanding,
    costOfEquity,
    startingRoe,
    terminalRoe,
    payout,
    years = 5,
  } = inputs || {};

  const invalidInputs = [];
  if (!finiteNumber(bookValue) || bookValue <= 0) invalidInputs.push("rim-book-value-invalid");
  if (!finiteNumber(sharesOutstanding) || sharesOutstanding <= 0) invalidInputs.push("rim-shares-invalid");
  if (!finiteNumber(costOfEquity) || costOfEquity <= 0) invalidInputs.push("rim-ke-invalid");
  if (!finiteNumber(startingRoe)) invalidInputs.push("rim-starting-roe-invalid");
  if (!finiteNumber(terminalRoe)) invalidInputs.push("rim-terminal-roe-invalid");
  if (!finiteNumber(payout) || payout < 0 || payout > 1) invalidInputs.push("rim-payout-invalid");
  if (!Number.isInteger(years) || years <= 0) invalidInputs.push("rim-years-invalid");
  if (invalidInputs.length) return invalid(invalidInputs);

  const terminalGrowth = (1 - payout) * terminalRoe;
  if (costOfEquity <= terminalGrowth) return invalid(["rim-terminal-assumptions-invalid"]);

  const projectedYears = [];
  let beginningBook = bookValue;
  let pvExplicitResidualIncome = 0;
  for (let year = 1; year <= years; year += 1) {
    const roe = startingRoe + (terminalRoe - startingRoe) * (year / years);
    const earnings = roe * beginningBook;
    const distributions = payout * earnings;
    const residualIncome = earnings - costOfEquity * beginningBook;
    const pvResidualIncome = residualIncome / (1 + costOfEquity) ** year;
    const endingBook = beginningBook + earnings - distributions;
    const values = [roe, earnings, distributions, residualIncome, pvResidualIncome, endingBook];
    if (!values.every(Number.isFinite) || endingBook <= 0) return invalid(["rim-intermediate-invalid"]);
    projectedYears.push({ year, beginningBook, roe, earnings, distributions, residualIncome, endingBook, pvResidualIncome });
    pvExplicitResidualIncome += pvResidualIncome;
    beginningBook = endingBook;
  }

  const terminalEarnings = terminalRoe * beginningBook;
  const terminalDistributions = payout * terminalEarnings;
  const terminalResidualIncome = terminalEarnings - costOfEquity * beginningBook;
  const terminalValue = terminalResidualIncome / (costOfEquity - terminalGrowth);
  const pvTerminalResidualIncome = terminalValue / (1 + costOfEquity) ** years;
  const equityValue = bookValue + pvExplicitResidualIncome + pvTerminalResidualIncome;
  const fairValue = equityValue / sharesOutstanding;
  const outputs = [
    terminalEarnings,
    terminalDistributions,
    terminalResidualIncome,
    terminalValue,
    pvTerminalResidualIncome,
    equityValue,
    fairValue,
  ];
  if (!outputs.every(Number.isFinite)) return invalid(["rim-fair-value-invalid"]);

  return {
    eligible: true,
    status: "valued",
    reasonCodes: [],
    bookValue,
    sharesOutstanding,
    costOfEquity,
    startingRoe,
    terminalRoe,
    payout,
    years,
    terminalGrowth,
    pvExplicitResidualIncome,
    pvTerminalResidualIncome,
    equityValue,
    fairValue,
    projectedYears,
    terminal: {
      roe: terminalRoe,
      payout,
      growth: terminalGrowth,
      beginningBook,
      earnings: terminalEarnings,
      distributions: terminalDistributions,
      residualIncome: terminalResidualIncome,
      value: terminalValue,
      pvValue: pvTerminalResidualIncome,
    },
  };
}

export { calculateResidualIncome };
