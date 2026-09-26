# A009 · Commercial Intelligence CRM — CANONICAL OPERATING CHARTER

This file is the single operational source of truth for any agent, Work session, or assistant working on Xicronix Commercial Intelligence CRM.

## PRIMARY OBJECTIVE

The CRM is considered 100% complete only when the user can open it and work commercially without depending on ChatGPT, Work, Excel, or manual reconstruction of context.

Completion means the user can reliably:

1. Search for any school/prospect and find it quickly.
2. View its key data, contacts, history, and priority.
3. Know exactly which commercial pipeline stage it is in.
4. See the next commercial action to perform.
5. Register changes, progress, actions, and outcomes without failures.
6. Use dashboard, pipeline, and alerts with real data.

Everything else is secondary until these six capabilities are stable.

## EXECUTION RULE

Do not stop for micro-decisions.

Continue autonomously with the known objective and existing decisions until one of these blockers appears:

- missing access or credentials;
- a real monetary cost requiring approval;
- irreversible deletion or destructive action;
- material production/architecture risk requiring Human Gate;
- an ambiguity that genuinely changes the business outcome and cannot be resolved from existing context.

Do not ask the user to repeat information already defined in the repository, project context, prior decisions, or this charter.

## COMMUNICATION RULE

Default response to the user: maximum 3–5 short lines.

Do not send long technical explanations unless the user explicitly asks for detail.

Do not narrate every technical step. Report only:

- verified result;
- real blocker;
- required Human Gate;
- final completion status.

## SCOPE CONTROL

Freeze scope until the primary objective is complete.

Do not prioritize new maps, animations, visual extras, speculative modules, or unrelated enhancements over the six completion capabilities.

Use the institutional sequence:

REUSE → EXTEND → CONSOLIDATE → CREATE.

Do not reprocess thousands of records or rerun expensive enrichment when valid prior results already exist. Prefer incremental, deduplicated, traceable updates.

## WORK / AGENT HANDOFF

Any new Work session or agent must read this file before acting.

Do not make the founder manually reconstruct the CRM state.

When transferring work between agents or sessions, transfer:

- current production version;
- active branch / commit;
- verified completed items;
- verified blockers;
- next executable action;
- Human Gates, if any.

The founder is not the integration layer between agents.

## CURRENT PRODUCTION BASELINE

Production branch: main
Canonical repository: Electmentor/xicronix-commercial-intelligence
Known baseline at creation of this charter: v2.44.2

## DEFINITION OF DONE

A009 is DONE when the six primary capabilities work end-to-end with real data, mobile usability is acceptable, critical navigation and search paths are stable, and no blocker prevents normal daily commercial operation.

Until then, optimize for closure, not feature growth.
