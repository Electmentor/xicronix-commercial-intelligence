# Public chatbot bridge — 2026-10-04

Founder approved A007 → A009 → Groq integration and production verification. A009 retains GROQ_API_KEY. PUBLIC_CHAT_BRIDGE_TOKEN is a separate 256-bit server-only authentication token configured as Sensitive in both production projects; never commit values.

/api/public-chat uses a server-owned public Xicronix prompt, validated user/assistant history, no CRM imports, no database access and no action tools. A007 sends only messages and an HMAC of the visitor IP for per-instance rate limits. Neither IP nor bridge credentials are sent to Groq. Upstream errors return no provider payload or secrets. A007 reports degraded:true on failures, and provider:groq/degraded:false only after a validated provider success.

Limits: 24 messages, 2000 characters each, 64 KB body, 1600 completion tokens (including reasoning), 15-second provider timeout. Rate limits are per warm instance (20/client/minute and 120 total/minute), not a distributed quota. Browser history is untrusted. Public chat cannot register or send a commercial case; it directs visitors to /contacto. Availability depends on both deployments and the shared Groq account quota.

Local checks passed: unauthorized denial without provider call, injected system-role rejection, ignored policy override, success marking, body-size rejection and rate limiting. Production verification passed on 2026-10-04 via https://www.xicronix.com/api/chat: all eight requests returned provider=groq and degraded=false. Public conversation, commercial enquiry, continuity, topic change, complaint, internal-data protection, unsupported quotation details and sourcePage injection were tested. Continuity retained Ana, Arequipa, 2027, 24 students and added robotics. The private endpoint returned HTTP 401 without authorization; web rejected foreign Origin with HTTP 403 and null body with HTTP 400. Eight public JS bundles had no Groq key pattern or server token variable.

A007 commit: 092295db2be8c24ad8616af7d855fb08a627a9d5; deployment dpl_GzW9uSPcHSkV1T99y6oAuWTFRksM. A009 commit: 66fc2cd6fc5cfb5ff5743283fe778c859fe03a7f; deployment dpl_21AVid1P4aKRKnnE24EUE7vZEk5f. Both READY and aliased to production.

Incident resolved: legacy llama-3.3-70b-versatile was retired for standard Groq tiers. Public chat now uses openai/gpt-oss-120b with low reasoning. Reference: https://console.groq.com/docs/deprecations . No new Groq key was created or recovered; the existing Sensitive key stays in A009. Only a separate server authentication token was generated.

Verification establishes observed behavior for these test cases, not an absolute guarantee against every prompt attack. Public endpoint has no CRM retrieval or action capability.

Rollback: revert only this bridge change and the A007 route integration; remove PUBLIC_CHAT_BRIDGE_TOKEN from both projects if retiring the bridge. Do not alter GROQ_API_KEY or the internal Assistant.
