# Conversational UX correction — 2026-10-04

Founder reported that 'Tienes para marcar?' following a service list was interpreted as a telephone request. Approved scope: typing indication, clickable contextual choices, simpler wording and progressive commercial guidance.

Implementation: server-owned JSON response contract (message/options/handoff); up to six validated textual reply choices; prior choices included in bounded conversation history; one question per turn; explicit list-selection disambiguation; no automatic form diversion for mere commercial interest. Handoff only for explicit contact/formal quote, accepted next step or complaint. UI displays animated dots only while awaiting an actual response, respects reduced motion, keeps input/header fixed and choices within scrollable conversation, and prevents duplicate sends.

Security: same authenticated bridge, no CRM data or actions, no secrets/client URLs in generated choices, React escapes all content. Existing price/privacy rules retained. Local auth/role/JSON contract checks passed. Production regression must cover marking a list, selecting a button, contextual follow-up, topic switch and explicit handoff.
