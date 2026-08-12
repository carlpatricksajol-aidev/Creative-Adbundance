/* fetch with retries for transient faults.
 *
 * Every outbound call in this system is to a third party over the open internet, from a cron job
 * that nobody is watching. A single ECONNRESET should not lose a meeting.
 *
 * This is not theoretical: on the very first real poll, the Drive folder lookup reset on attempt
 * one and returned 200 on attempt two, and the OpenRouter call did the same thing on the next
 * run. Both would have failed the whole tick.
 *
 * Retries on: transient socket errors, 429, and 5xx. NOT on 4xx — a bad token or a malformed
 * request will fail identically the second time, and retrying just delays a real error.
 */

const TRANSIENT = new Set([
  "ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EAI_AGAIN", "ENOTFOUND",
  "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET", "UND_ERR_HEADERS_TIMEOUT",
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Exponential backoff with jitter: ~0.5s, 1s, 2s, 4s, 8s, spanning ~15s total.
 *
 *  Measured against googleapis.com from a dev machine: ~33% of requests reset, and the failures
 *  come in BURSTS — four consecutive attempts at 400ms intervals all died, while a single retry
 *  a moment later succeeded. Linear backoff just retries inside the same burst. The jitter stops
 *  a cron with several accounts from resynchronising all its retries onto the same instant.
 */
const backoff = (n, base) => Math.round(base * 2 ** (n - 1) * (0.75 + Math.random() * 0.5));

/**
 * @param {string|URL} url
 * @param {object} init      standard fetch init
 * @param {object} opts      { attempts = 6, baseMs = 500, label = '' }
 * @returns {Promise<Response>} a Response with res.ok true, or throws with the cause spelled out
 */
export async function fetchRetry(url, init = {}, opts = {}) {
  const { attempts = 6, baseMs = 500, label = "" } = opts;
  let lastErr;

  for (let n = 1; n <= attempts; n++) {
    let res;
    try {
      res = await fetch(url, init);
    } catch (e) {
      const code = e.cause?.code || e.code;
      lastErr = new Error(`${label || url} failed: ${e.message}${code ? ` (${code})` : ""}`);
      // An unknown cause is treated as transient — undici reports plenty of resets with no code.
      if (n < attempts && (TRANSIENT.has(code) || !code)) {
        const wait = backoff(n, baseMs);
        console.error(`[http] ${label || url}: ${code || e.message}, retry ${n}/${attempts - 1} in ${wait}ms`);
        await sleep(wait);
        continue;
      }
      throw lastErr;
    }

    if ((res.status === 429 || res.status >= 500) && n < attempts) {
      // Respect Retry-After when the server sends one; it knows better than our backoff does.
      const wait = Number(res.headers.get("retry-after")) * 1000 || backoff(n, baseMs * 2);
      console.error(`[http] ${label || url}: ${res.status}, retry ${n}/${attempts - 1} in ${wait}ms`);
      await sleep(wait);
      continue;
    }

    return res;
  }

  throw lastErr || new Error(`${label || url}: exhausted ${attempts} attempts`);
}
