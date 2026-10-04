# Public chatbot bridge — 2026-10-04

Founder approved A007 → A009 → Groq integration and production verification. A009 retains GROQ_API_KEY. PUBLIC_CHAT_BRIDGE_TOKEN is a separate 256-bit server-only authentication token configured as Sensitive in both production projects; never commit values.

/api/public-chat uses a server-owned public Xicronix prompt, validated user/assistant history, no CRM imports, no database access and no action tools. A007 sends only messages and an HMAC of the visitor IP for per-instance rate limits. Neither IP nor bridge credentials are sent to Groq. Upstream errors return no provider payload or secrets. A007 reports degraded:true on failures, and provider:groq/degraded:false only after a validated provider success.

Limits: 24 messages, 2000 characters each, 64 KB body, 500 output tokens, 15-second provider timeout. Rate limits are per warm instance (20/client/minute and 120 total/minute), not a distributed quota. Browser history is untrusted. Public chat cannot register or send a commercial case; it directs visitors to /contacto. Availability depends on both deployments and the shared Groq account quota.

Local checks passed: unauthorized denial without provider call, injected system-role rejection, ignored policy override, success marking, body-size rejection and rate limiting. Production verification follows deployment.

Rollback: revert only this bridge change and the A007 route integration; remove PUBLIC_CHAT_BRIDGE_TOKEN from both projects if retiring the bridge. Do not alter GROQ_API_KEY or the internal Assistant.
