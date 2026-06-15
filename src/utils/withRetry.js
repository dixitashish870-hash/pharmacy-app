/**
 * withRetry(fn, options)
 *
 * Retries an async function up to `retries` times with exponential back-off.
 *
 * @param {() => Promise<any>} fn      - The async function to call.
 * @param {object}            [opts]
 * @param {number}            [opts.retries=3]       - Max attempts (including the first).
 * @param {number}            [opts.baseDelay=500]   - Base delay in ms; multiplied by attempt index.
 * @param {(err, attempt) => boolean} [opts.shouldRetry] - Optional predicate; return false to stop early.
 *
 * @returns {Promise<any>} Resolves with the function's return value, or rejects after all attempts fail.
 *
 * @example
 * // Retry a fetch up to 3 times with 500 / 1000 / 1500 ms delays
 * const data = await withRetry(() => fetch('/api/products').then(r => r.json()));
 *
 * @example
 * // Custom retry count and delay
 * const sale = await withRetry(() => axios.post('/api/sales', payload), { retries: 5, baseDelay: 300 });
 *
 * @example
 * // Only retry on network errors, not 4xx responses
 * const res = await withRetry(
 *   () => axios.get('/api/stats'),
 *   { shouldRetry: (err) => !err.response || err.response.status >= 500 }
 * );
 */
export async function withRetry(fn, { retries = 3, baseDelay = 500, shouldRetry = () => true } = {}) {
  let lastError;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      const isLastAttempt = attempt === retries - 1;
      if (isLastAttempt || !shouldRetry(err, attempt)) {
        throw err;
      }

      // Exponential back-off: 500ms, 1000ms, 1500ms, ...
      await new Promise((r) => setTimeout(r, baseDelay * (attempt + 1)));
    }
  }

  throw lastError;
}
