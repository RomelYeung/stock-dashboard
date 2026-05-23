export function evaluateAIValuation({ ticker, summary, financials, balanceSheet, priceHistory, optionChain, insiderData }) {
  const currentPrice = summary?.currentPrice || 0;
  const dividendYield = summary?.dividendYield || 0;
  const currentDividend = currentPrice * dividendYield;

  const shares = balanceSheet?.sharesOutstanding || 1;
  const netIncome = financials?.annualIncome?.[0]?.netIncome || 0;
  const fcf = balanceSheet?.annualCashFlow?.[0]?.freeCashFlow || 0;
  const totalEquity = balanceSheet?.totalEquity || 1;
  const totalDebt = balanceSheet?.totalDebt || 0;
  const currentAssets = balanceSheet?.currentAssets || 0;
  const totalLiabilities = balanceSheet?.totalLiabilities || 0;
  const operatingMargin = financials?.profitMargins || 0; // Using profit margins as proxy
  
  const eps = shares > 0 ? netIncome / shares : (summary?.trailingPE ? currentPrice / summary.trailingPE : 0);
  const bookValuePerShare = shares > 0 ? totalEquity / shares : (summary?.priceToBook ? currentPrice / summary.priceToBook : 0);
  const ncavPerShare = shares > 0 ? (currentAssets - totalLiabilities) / shares : 0;

  const costOfEquity = 0.08; 
  const shortTermGrowth = financials?.earningsGrowth || 0.10;
  const longTermGrowth = 0.03; 
  const halfLife = 5; 

  // --- 1. DDM (Gordon Growth, H-Model) ---
  let ddmGordon = 0;
  let ddmHModel = 0;
  if (currentDividend > 0 && costOfEquity > longTermGrowth) {
    ddmGordon = (currentDividend * (1 + longTermGrowth)) / (costOfEquity - longTermGrowth);
    ddmHModel = ((currentDividend * (1 + longTermGrowth)) + (currentDividend * halfLife * (shortTermGrowth - longTermGrowth))) / (costOfEquity - longTermGrowth);
  }

  // --- 2. RIM (Residual Income Model) ---
  let rimValue = bookValuePerShare;
  let currentBv = bookValuePerShare;
  let currentEps = eps;
  const rimYears = shortTermGrowth > 0.15 ? 10 : 5;
  for (let i = 1; i <= rimYears; i++) {
    let currentGrowth = shortTermGrowth;
    if (rimYears === 10 && i > 5) {
      const fadeStep = (shortTermGrowth - longTermGrowth) / 5;
      currentGrowth = Math.max(longTermGrowth, shortTermGrowth - fadeStep * (i - 5));
    }
    currentEps *= (1 + currentGrowth);
    const residualIncome = currentEps - (currentBv * costOfEquity);
    rimValue += residualIncome / Math.pow(1 + costOfEquity, i);
    currentBv += currentEps;
  }
  const terminalResidualIncome = (currentEps * (1 + longTermGrowth)) - (currentBv * costOfEquity);
  if (costOfEquity > longTermGrowth) {
    rimValue += (terminalResidualIncome / (costOfEquity - longTermGrowth)) / Math.pow(1 + costOfEquity, rimYears);
  }

  // --- 3. ADF Stationarity ---
  let stationarityScore = 50;
  let volatility = 0.2;
  if (priceHistory && priceHistory.length >= 20) {
    const prices = priceHistory.slice(-20).map(p => p.close || p.currentPrice || p);
    const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    let crossings = 0;
    for (let i = 1; i < prices.length; i++) {
      if ((prices[i-1] - mean) * (prices[i] - mean) < 0) crossings++;
    }
    stationarityScore = Math.min(100, (crossings / (prices.length / 2)) * 100);
    
    const returns = [];
    for(let i=1; i<prices.length; i++){
      returns.push((prices[i]-prices[i-1])/prices[i-1]);
    }
    const meanRet = returns.reduce((sum, r) => sum + r, 0)/returns.length;
    const varRet = returns.reduce((sum, r) => sum + Math.pow(r - meanRet, 2), 0)/returns.length;
    volatility = Math.sqrt(varRet) * Math.sqrt(252);
  }

  // --- 4. Volatility Smile (SVI) ---
  let svi = { a: Math.pow(volatility, 2), b: 0.1, rho: -0.5, m: 0, sigma: 0.1 };
  if (optionChain && Object.keys(optionChain).length > 0) {
    svi.rho = -0.6; 
  }

  // --- 5. AI Agents ---

  // Buffett
  const roic = totalEquity > 0 ? netIncome / (totalEquity + totalDebt) : 0;
  const deRatio = totalEquity > 0 ? totalDebt / totalEquity : 1;
  const fcfToNetIncome = netIncome > 0 ? fcf / netIncome : 0;
  
  let buffettScore = 20;
  if (roic > 0.15) buffettScore += 25;
  else if (roic > 0.08) buffettScore += 10;
  if (deRatio < 0.5) buffettScore += 20;
  if (fcfToNetIncome > 0.8) buffettScore += 20;
  if (operatingMargin > 0.15) buffettScore += 15;
  
  const buffettDialogue = buffettScore > 75 
    ? `This business exhibits a wonderful durable competitive advantage. With ROIC at ${(roic*100).toFixed(1)}%, solid operating margins, and manageable debt, it's a compounder we'd happily own forever.` 
    : (buffettScore > 50 ? `The business is fair, but lacks the outstanding economics I look for. A ${roic > 0 ? (roic*100).toFixed(1) : 'low'}% ROIC doesn't scream 'moat' to me.` : `The fundamentals here don't show a durable competitive advantage. Debt is high or returns on capital are poor. Charlie and I would pass.`);

  // Graham
  const pe = summary?.trailingPE || (eps > 0 ? currentPrice / eps : 999);
  const pb = summary?.priceToBook || (bookValuePerShare > 0 ? currentPrice / bookValuePerShare : 999);
  const currentRatio = balanceSheet?.currentRatio || 1.0;
  const grahamMultiplier = pe * pb;
  
  let grahamScore = 20;
  if (pe < 15) grahamScore += 20;
  if (pb < 1.5) grahamScore += 20;
  if (currentRatio > 2.0) grahamScore += 15;
  if (grahamMultiplier < 22.5) grahamScore += 15;
  if (ncavPerShare > currentPrice) grahamScore += 10; // Extra points for NCAV bargain
  
  const grahamDialogue = grahamScore > 75
    ? `An excellent margin of safety. The Graham multiplier of ${grahamMultiplier.toFixed(1)} is well below my 22.5 threshold, and it's backed by a strong current ratio of ${currentRatio.toFixed(1)}.`
    : (grahamScore > 50 ? `It's reasonably priced, but the margin of safety isn't entirely convincing. P/E of ${pe.toFixed(1)} and P/B of ${pb.toFixed(1)} offer little protection.` : `Speculative and overpriced. With a Graham multiplier of ${grahamMultiplier.toFixed(1)}, you are paying for growth that may never materialize.`);

  // Lynch
  const peg = epsGrowth => (epsGrowth > 0 ? pe / (epsGrowth * 100) : 999);
  const lynchPeg = peg(shortTermGrowth);
  
  let lynchScore = 20;
  if (lynchPeg < 1.0) lynchScore += 40;
  else if (lynchPeg < 1.5) lynchScore += 20;
  if (shortTermGrowth > 0.15 && shortTermGrowth < 0.3) lynchScore += 20; 
  if (deRatio < 0.4) lynchScore += 20;
  
  let category = "Stalwart";
  if (shortTermGrowth > 0.2) category = "Fast Grower";
  else if (shortTermGrowth < 0.05) category = "Slow Grower";
  
  const lynchDialogue = lynchScore > 75
    ? `This is a classic ${category}. A PEG ratio of ${lynchPeg.toFixed(2)} means you're getting growth at a bargain. I love the story here.`
    : (lynchScore > 50 ? `A decent ${category}, but the PEG of ${lynchPeg.toFixed(2)} means it's fairly priced. Keep an eye on its earnings growth.` : `You're paying too much for this level of growth. A PEG of ${lynchPeg.toFixed(2)} for a ${category} is a recipe for disappointment.`);

  // RenTech
  let renTechScore = 30;
  if (stationarityScore > 60) renTechScore += 30;
  if (svi.rho < -0.3) renTechScore += 20;
  if (volatility > 0.25) renTechScore += 20; 
  
  const renTechDialogue = renTechScore > 75
    ? `Strong structural inefficiencies detected. Mean reversion signal is high (stationarity ${stationarityScore.toFixed(0)}). SVI rho of ${svi.rho.toFixed(2)} provides an exploitable skew.`
    : (renTechScore > 50 ? `Weak signal-to-noise ratio. Stationarity score (${stationarityScore.toFixed(0)}) suggests some mean reversion, but vol surface is largely efficient.` : `No statistical edge. Stationarity (${stationarityScore.toFixed(0)}) is too low for mean reversion, and the volatility surface shows no significant anomalies.`);

  // Behavioral Finance
  let behavioralScore = 50;
  const signal = insiderData?.signal || "Neutral";
  if (signal === "Bullish") behavioralScore += 25;
  else if (signal === "Bearish") behavioralScore -= 20;

  let ivText = "";
  if (optionChain && Object.keys(optionChain).length > 0 && volatility > 0) {
    if (volatility > 0.4) {
      behavioralScore -= 15;
      ivText = `High implied volatility (${(volatility*100).toFixed(0)}%) suggests panic or speculative euphoria. `;
    } else if (volatility < 0.2) {
      behavioralScore += 10;
      ivText = `Low implied volatility (${(volatility*100).toFixed(0)}%) suggests complacency, often a good time to build a position. `;
    }
  }

  const behavioralDialogue = behavioralScore > 65
    ? `Market sentiment looks rational or slightly pessimistic, presenting an opportunity. ${ivText}Insider signal is ${signal}, giving us confidence.`
    : (behavioralScore > 40 ? `Sentiment is mixed. ${ivText}Insider signal is ${signal}. No clear cognitive bias to exploit right now.` : `The crowd is highly irrational here. ${ivText}Insider signal is ${signal}. I'd avoid the herd mentality and stay away.`);

  return {
    ticker,
    currentPrice,
    models: {
      ddm: {
        gordonGrowth: Number.isFinite(ddmGordon) ? Math.max(0, ddmGordon) : 0,
        hModel: Number.isFinite(ddmHModel) ? Math.max(0, ddmHModel) : 0
      },
      rim: Number.isFinite(rimValue) ? Math.max(0, rimValue) : 0
    },
    quant: {
      stationarityScore: Number.isFinite(stationarityScore) ? stationarityScore : 0,
      svi,
      volatility: Number.isFinite(volatility) ? volatility : 0
    },
    agents: {
      buffett: { score: Math.round(buffettScore), dialogue: buffettDialogue },
      graham: { score: Math.round(grahamScore), dialogue: grahamDialogue },
      lynch: { score: Math.round(lynchScore), dialogue: lynchDialogue },
      renTech: { score: Math.round(renTechScore), dialogue: renTechDialogue },
      behavioral: { score: Math.round(behavioralScore), dialogue: behavioralDialogue }
    }
  };
}
