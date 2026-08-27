/**
 * Shared Rate Limiter for SEC EDGAR API (Max 10 requests/sec)
 * Used by both sec.js and insiderTrading.js to avoid hitting rate limits
 */
class RateLimiter {
  constructor(limitPerSec) {
    this.delay = 1000 / limitPerSec;
    this.lastCall = 0;
  }

  async throttle() {
    const now = Date.now();
    const elapsed = now - this.lastCall;
    if (elapsed < this.delay) {
      const waitTime = this.delay - elapsed;
      this.lastCall = now + waitTime;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    } else {
      this.lastCall = now;
    }
  }

  /**
   * Reset the rate limiter state (useful for tests to isolate state)
   */
  reset() {
    this.lastCall = 0;
  }
}

// Create a shared instance for SEC EDGAR API (10 req/sec)
export const secLimiter = new RateLimiter(10);

export default RateLimiter;
