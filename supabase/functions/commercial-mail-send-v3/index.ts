import { createHandler } from './core.mjs';
import { createProvider, createRepository } from './adapters.mjs';

// Prepared implementation only. No mail can be sent until the v3 database contract is installed.
// No third-party runtime dependency, arbitrary remote URL, or client-supplied credential is used.
let handler: (request: Request) => Promise<Response>;
try {
  const repository = createRepository({
    url: Deno.env.get('SUPABASE_URL') || '',
    publicKey: Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '',
    serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  });
  const provider = createProvider({ apiKey: Deno.env.get('RESEND_API_KEY') || '' });
  const configuredOrigins = Deno.env.get('CRM_MAIL_ALLOWED_ORIGINS');
  handler = createHandler({ repository, provider, ...(configuredOrigins ? { allowedOrigins: configuredOrigins.split(',').map(origin => origin.trim()).filter(Boolean) } : {}) });
} catch {
  handler = async () => Response.json({ ok: false, error: 'mail_backend_not_configured', retry_allowed: false }, { status: 503, headers: { 'cache-control': 'no-store' } });
}
Deno.serve(handler);
