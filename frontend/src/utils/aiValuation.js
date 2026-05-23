/**
 * Valuation Models for AI Analysis
 */

export const calculateGordonGrowth = (dividend, costOfEquity, growthRate) => {
  if (!dividend || !costOfEquity || costOfEquity <= growthRate) return null;
  return (dividend * (1 + growthRate)) / (costOfEquity - growthRate);
};

export const calculateHModel = (dividend, costOfEquity, shortGrowth, longGrowth, yearsHighGrowth) => {
  if (!dividend || !costOfEquity || costOfEquity <= longGrowth) return null;
  const H = yearsHighGrowth / 2;
  const terminalValue = (dividend * (1 + longGrowth)) / (costOfEquity - longGrowth);
  const premium = (dividend * H * (shortGrowth - longGrowth)) / (costOfEquity - longGrowth);
  return terminalValue + premium;
};

export const calculateRIM = (bookValue, epsForecasts, costOfEquity, terminalGrowthRate) => {
  if (!bookValue || !epsForecasts || !epsForecasts.length || !costOfEquity || costOfEquity <= terminalGrowthRate) return null;
  
  let currentBV = bookValue;
  let totalPVResidualIncome = 0;
  
  for (let t = 0; t < epsForecasts.length; t++) {
    const eps = epsForecasts[t];
    const residualIncome = eps - (costOfEquity * currentBV);
    totalPVResidualIncome += residualIncome / Math.pow(1 + costOfEquity, t + 1);
    
    // Assume all earnings are retained for simplicity if dividends aren't provided
    // For a more precise model, we'd need payout ratios.
    currentBV += eps;
  }
  
  // Terminal value
  const lastRI = epsForecasts[epsForecasts.length - 1] - (costOfEquity * currentBV);
  const terminalValue = lastRI / (costOfEquity - terminalGrowthRate);
  const pvTerminalValue = terminalValue / Math.pow(1 + costOfEquity, epsForecasts.length);
  
  return bookValue + totalPVResidualIncome + pvTerminalValue;
};
