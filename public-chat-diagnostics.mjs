// Never log provider bodies, prompts, credentials or free text.
const TYPES = new Set(['invalid_request_error', 'authentication_error', 'permission_error', 'rate_limit_error', 'server_error']);
const CODES = new Set(['json_validate_failed', 'tool_use_failed', 'model_not_found', 'context_length_exceeded', 'rate_limit_exceeded']);
const MODELS = new Set(['openai/gpt-oss-120b', 'openai/gpt-oss-20b']);
const MAX_ERROR_BYTES = 8192;
const READ_BUDGET_MS = 250;

function allowed(value, choices) {
 return typeof value === 'string' && choices.has(value) ? value : value == null ? null : 'other';
}

async function readError(response) {
 let reader;
 let timer;
 const timeout = Symbol('timeout');
 try {
  if (!response.body) return { state: 'empty' };
  reader = response.body.getReader();
  const expired = new Promise(resolve => { timer = setTimeout(() => resolve(timeout), READ_BUDGET_MS); });
  const chunks = [];
  let size = 0;
  while (true) {
   const chunk = await Promise.race([reader.read(), expired]);
   if (chunk === timeout) return { state: 'timeout' };
   if (chunk.done) break;
   size += chunk.value.byteLength;
   if (size > MAX_ERROR_BYTES) return { state: 'too_large' };
   chunks.push(chunk.value);
  }
  if (!size) return { state: 'empty' };
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { return { state: 'non_json' }; }
  return { state: 'json', error: payload?.error };
 } catch {
  return { state: 'unreadable' };
 } finally {
  clearTimeout(timer);
  // Cancellation errors must never change the public response or be logged.
  if (reader) { try { void reader.cancel().catch(() => {}); } catch {} }
 }
}

export async function publicChatFailureDiagnostic(response, model) {
 const status = Number.isInteger(response.status) && response.status >= 400 && response.status <= 599 ? response.status : null;
 let rawRequestId;
 try { rawRequestId = response.headers?.get?.('x-request-id'); } catch {}
 // Groq-style request IDs only; arbitrary header text is discarded.
 const requestId = typeof rawRequestId === 'string' && /^req_[a-z0-9]{26}$/.test(rawRequestId) ? rawRequestId : null;
 const result = await readError(response);
 return {
  version: 1,
  provider: 'groq',
  status,
  code: allowed(result.error?.code, CODES),
  type: allowed(result.error?.type, TYPES),
  request_id: requestId,
  model: allowed(model, MODELS),
  body_state: result.state
 };
}

