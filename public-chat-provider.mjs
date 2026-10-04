// One bounded retry, respecting the provider's cooldown. Never expose error bodies.
export async function requestPublicCompletion(fetcher, options, { timeoutMs = 17000, pause = ms => new Promise(r => setTimeout(r, ms)), now = Date.now } = {}) {
 const deadline = now() + timeoutMs;
 for (let attempt = 0; attempt < 2; attempt++) {
  const response = await fetcher('https://api.groq.com/openai/v1/chat/completions', { ...options, signal: AbortSignal.timeout(Math.max(1, deadline - now())) });
  if (response.ok || attempt === 1 || ![429, 502, 503, 504].includes(response.status)) return response;
  const header = response.headers.get('retry-after');
  const delay = header === null ? (response.status === 429 ? Infinity : 500) : (/^\d+(?:\.\d+)?$/.test(header) ? Number(header) * 1000 : Date.parse(header) - now());
  // Long or unknown rate-limit windows need a graceful fallback, not extra traffic.
  if (!Number.isFinite(delay) || delay < 0 || delay > 3000 || deadline - now() < delay + 5000) return response;
  await response.body?.cancel();
  await pause(Math.max(100, delay));
 }
}
