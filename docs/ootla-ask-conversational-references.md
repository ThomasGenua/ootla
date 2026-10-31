# Conversational Ask Ootla

Updated 2026-10-30. Applies to the local `ootlademo` checkout. This refinement preserves the compact floating assistant and existing server authentication, organization/property permissions, inference provider, conversation history and confirmed native actions.

## Scope and references

A new conversation starts across the staff member's authorized properties in the current organization. A property picker is not required. Each message may carry the currently open page and its selected property, unit, contact, lead, application, viewing, task or Maintenance request as a hint. That hint is not a permanent scope or an authorization grant.

An authorized explicit name/address/reference takes precedence over page background. Server-side bounded searches resolve records; the model receives authorized facts and approved knowledge, never unrestricted SQL. A clear full match proceeds. Ambiguity produces one short question and compact choices. A choice is bound to its stored conversation and must still pass current access checks. Unknown and unauthorized targets receive the same unavailable/no-match treatment, without exposing restricted matches or falling back to the last property.

The conversation remembers selected references and ordered result sets. Follow-ups such as “that property”, “that applicant” or “the second viewing” reuse and revalidate those references. If the referent is ambiguous, the assistant asks. Explicit portfolio/all-property questions broaden back to the authorized organization. Navigating changes helpful page context while retaining the same conversation, draft and reading position; only New conversation deliberately starts another one.

Queries are bounded: up to eight record examples and up to three explicitly compared properties. Larger comparisons ask to narrow; record-list replies indicate their bounded results. This is not a universal arbitrary natural-language filter engine. Explicit pending-application and upcoming/scheduled-viewing questions use actual supported statuses and dates, not invented lifecycle states. Unit availability retains reported source and actual verification time; unverified availability stays unverified.

## Working interactions

From http://127.0.0.1:7673/admin/maintenance, sign in normally, open Ask Ootla and start a new conversation. Use the existing `admin@demo.ootla.test` account through normal demo sign-in.

- “Show pending applications across all properties.” No property selection is required.
- “What applications are pending at Cedar House?” resolves that named property.
- “Show viewings at that property.” keeps the conversational property. After a list with at least two results, “Open the second viewing” opens the corresponding real record.
- “Compare Cedar House and Grove Lofts.” reads authorized property records and actual counts.
- An ambiguous partial name offers compact choices; a nonexistent name produces no-match. The two-similar-name and restricted-access cases are verified with isolated records rather than adding duplicates to the retained demo.
- Open a lead and ask “Summarize this lead”, or ask for a different authorized lead by name. The explicit name wins over the page.
- “Create a follow-up task for that lead.” displays a confirmation card. Review the due date, title and related record; optional Task details can supply a deliberate title/due date. The assistant does not claim to parse every free-form date expression.
- Open a task and ask “Assign this task to me”, or use an eligible staff member's full name. “Change this task's priority from high to low” and task completion/cancellation/reopening also present the exact change for confirmation.
- “Find available viewing options for [actual lead name] at [actual property]” reads the existing Calendar availability/slot service. Offered times are not booked appointments.
- On a selected resident/request or prospect record, “Draft a reply” prepares private, editable, unsent text from its actual facts. No email, SMS or portal message is sent by that request.

Task creation and changes recheck arguments, current membership/property/linked-record access, policy and record version at confirmation, and use existing transactional task services. Stable receipts prevent duplicate actions. Stale changes must be reviewed again instead of overwriting staff work. Applicant decisions, payment execution and arbitrary writes are unavailable. Other record edits and booking changes remain on their existing linked workspaces; no unrestricted conversational write tool was introduced.

## Model and failure behavior

When eligible live inference is configured, substantive read results go through the existing metered synthesis path and use validated conversational model prose with source links. This isolated demo still has no model/API key configured and forbids live inference, so native answers and suggested drafts remain explicitly record-based. See [AI setup](ootla-ai-response-setup.md). This task does not activate a model or external service.

Prior turns are checked against current record references and approved knowledge before being supplied to inference. Revoked/retired facts are excluded. Distinct in-flight questions in one conversation are serialized. Invalid choices fail before leaving an unanswered staff receipt; expired interrupted accounting settles conservatively without repeating inference/actions. Configured history cleanup also clears reference/choice labels and resolution state. Private notes and document bytes are not copied into ordinary reply context.

## White table cards

Actual admin tables and their existing scroll wrappers now have a shared white card surface. Tasks, Properties, Leads, Maintenance and other admin directories preserve their existing compact search/filter/pagination, semantic headers/status highlights and mobile scrolling. The charcoal header, overview layout, marketing previews and portal permissions are unchanged.

## Migration and startup

Migration `031_ask_conversational_resolution.sql` adds actor-bound conversation reference/choice metadata and the supported `update_task` action kind. It does not reset or seed records. Apply additive migrations deliberately on a corresponding checkout:

```text
npm run db:migrate
npm run build
```

Restart the existing application process when deploying compiled output. Local development normally uses `npm run dev`; preserve the existing private environment and database. No additional dependency or configuration entry is required. Do not copy demo data/secrets to the live instance, activate providers or deploy from this guide without an explicit instruction.

## Verification and local readiness

The local demo already has migration031 and is running at the URL above. No local reinstall, seed/reset or manual restart is needed. Fourteen controlled provider/reference groups, four responsive browser groups, two retention/expiry groups and the required full type/build checks passed. Actual external AI remains pending; no outbound provider was activated. The only build warning is the existing shared bundle-size advisory.

A native backup preceded the migration. Strict preservation retains all970original records and private environment bytes; original migration files/checksums are unchanged. Known automation scan cursors advanced normally. Full evidence and individual continuation receipts are recorded in the [progress log](ootla-progress.md).