import { levenbergMarquardt } from 'ml-levenberg-marquardt';

/**
 * SVI (Stochastic Volatility Inspired) parameterization
 * of the implied variance smile.
 *
 * Raw SVI: w(k) = a + b * (ρ * (k - m) + sqrt((k - m)² + σ²))
 *
 * Where:
 *   k = log(K / F)  (log-strike)
 *   a = overall variance level
 *   b = angle between put/call wings
 *   ρ = skew (asymmetry), -1 ≤ ρ ≤ 1
 *   m = horizontal shift (ATM log-strike offset)
 *   σ = smoothness / curvature, σ > 0
 */

/**
 * Evaluate total implied variance at a given log-strike using raw SVI.
 * @param {number} k - log-strike
 * @param {object} params - SVI parameters
 * @param {number} params.a - variance level
 * @param {number} params.b - wing angle
 * @param {number} params.rho - skew (-1 to 1)
 * @param {number} params.m - horizontal shift
 * @param {number} params.sigma - smoothness (> 0)
 * @returns {number} total implied variance w(k)
 */
export function sviTotalVariance(k, { a, b, rho, m, sigma }) {
  return a + b * (rho * (k - m) + Math.sqrt((k - m) ** 2 + sigma ** 2));
}

/**
 * Compute implied volatility at log-strike k from SVI total variance.
 * @param {number} k - log-strike
 * @param {object} params - SVI parameters
 * @returns {number} implied volatility (sqrt of total variance / sqrt(T)? — caller normalizes)
 */
export function sviImpliedVol(k, params) {
  const variance = sviTotalVariance(k, params);
  return Math.sqrt(Math.max(0, variance));
}

/**
 * Fit raw SVI parameters to implied volatility data using Levenberg-Marquardt.
 *
 * Fits total variance w(k) = σ_iv(k)² as a function of log-strike k.
 *
 * @param {number[]} kData - Array of log-strikes (k = log(K / F))
 * @param {number[]} ivData - Array of implied volatilities (decimal, e.g. 0.25 for 25%)
 * @param {object} [opts] - Optional configuration
 * @param {number[]} [opts.weights] - Per-point weights (higher = more influence, e.g. volume or 1/spread)
 * @param {number[]} [opts.initialValues] - Initial [a, b, rho, m, sigma]
 * @param {number[]} [opts.minValues] - Lower bounds
 * @param {number[]} [opts.maxValues] - Upper bounds
 * @param {number} [opts.maxIterations=200] - Max solver iterations
 * @param {number} [opts.errorTolerance=1e-8] - Convergence tolerance
 * @returns {{ a: number, b: number, rho: number, m: number, sigma: number, error: number, iterations: number } | null}
 */
export function fitSVI(kData, ivData, opts = {}) {
  if (!kData || !ivData || kData.length < 5 || ivData.length < 5) {
    return null;
  }
  if (kData.length !== ivData.length) {
    return null;
  }

  // Convert IV to total variance for fitting
  const wData = ivData.map((v) => v * v);

  const minW = Math.min(...wData);
  const maxW = Math.max(...wData);
  
  // Dynamically scale bounds and initial values based on the data
  const initialA = Math.max(1e-4, minW);
  const maxA = Math.max(10, maxW * 2);
  
  const minK = Math.min(...kData);
  const maxK = Math.max(...kData);
  const minM = minK - 0.5;
  const maxM = maxK + 0.5;

  const {
    weights,
    initialValues = [initialA, 0.1, 0.0, 0.0, 0.1],
    minValues = [0.0, 1e-6, -0.999, minM, 1e-4],
    maxValues = [maxA, 10.0, 0.999, maxM, 2.0],
    maxIterations = 200,
    errorTolerance = 1e-8,
  } = opts;

  const lmOptions = {
    initialValues,
    minValues,
    maxValues,
    maxIterations,
    errorTolerance,
  };
  if (weights) lmOptions.weights = weights;

  let result;
  try {
    result = levenbergMarquardt(
      { x: kData, y: wData },
      (params) => (k) => {
        const [a, b, rho, m, sigma] = params;
        return a + b * (rho * (k - m) + Math.sqrt((k - m) ** 2 + sigma ** 2));
      },
      lmOptions,
    );
  } catch {
    return null;
  }

  if (!result || !result.parameterValues) return null;

  const [a, b, rho, m, sigma] = result.parameterValues;
  return {
    a,
    b,
    rho,
    m,
    sigma,
    error: result.parameterError,
    iterations: result.iterations,
  };
}
