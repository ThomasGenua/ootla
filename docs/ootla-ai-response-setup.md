# Ask Ootla response generation and setup

Ask Ootla uses the existing server-side OpenAI Responses API adapter. Authorized record results and approved knowledge are context; the validated model `response` is the conversational answer. Sources remain separate links. A read answer cannot execute an action. Existing task proposals still require staff confirmation and normal domain authorization.

## Current runtime

The isolated `ootlademo` instance has `DEMO_MODE=true`, `AI_PROVIDER=simulated`, and blank `AI_MODEL`/`AI_API_KEY`. Every AI environment entry already exists, so the private `.env` was preserved byte-for-byte. No credentials were copied from another project and no external model, email, SMS or calendar invitation was activated.

Live inference is intentionally forbidden in demo mode. This task preserves that boundary. Do not switch off demo mode on the existing demo database or change the separate live checkout merely to activate AI. Use a separately authorized non-demo runtime with its own correct database identity, sessions and organization configuration.

## Exact server settings to fill

For that non-demo runtime, use its private environment file or deployment secret store:

| Setting | Required value |
| --- | --- |
| `AI_PROVIDER` | `openai` |
| `AI_MODEL` | An explicit model ID enabled for your API project and supporting the existing Responses structured-output request. No model is silently selected. |
| `AI_API_KEY` | Your private API-project key. Never commit it or put it in client variables. |
| `AI_INPUT_COST_MICROS_PER_MILLION` | Positive, operator-verified input price in millionths of USD per one million tokens. |
| `AI_OUTPUT_COST_MICROS_PER_MILLION` | Positive, operator-verified output price in the same units. |
| `AI_DAILY_COST_BUDGET_MICROS` | A positive daily budget in millionths of USD. |
| `AI_DAILY_TOKEN_BUDGET` | An explicit positive daily token ceiling. |
| `AI_MAX_TOKENS_PER_REQUEST` | An explicit request ceiling large enough for bounded context, the instruction/schema overhead and an answer. |
| `AI_MAX_REQUESTS_PER_MINUTE` | The desired bounded request rate. |
| `AI_TIMEOUT_MS` | An explicit timeout appropriate for the selected model, within the existing validated range. |

Keep `DEMO_MODE=false` only on the correctly isolated non-demo runtime. The organization AI policy must also enable the needed intent and `native_read` capability; its limits may be stricter than the server ceilings. Existing credential, session, membership, record, knowledge approval and action checks remain in force. Do not enable unrelated outbound providers to enable read-only AI.

The safe `.env.example` contains placeholders and conservative limits. The zero token-price placeholders deliberately do not authorize paid inference. Current model availability and pricing must be verified before entering rates. API configuration follows OpenAI's [Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs).

## Behavior and dates

Substantive Ask requests, including priorities, lead summaries, checklists and registered reporting/operations answers, use the shared synthesis pathway when live inference is configured. Tool facts, bounded conversation history and current approved knowledge are separate from the final prose. The existing ledger meters requests, tokens and cost and preserves duplicate-safe retries.

When inference is absent or fails, the reply states the limitation briefly and may display actual authorized records. It does not claim that a model generated those results or that an action succeeded. Protected traces retain technical diagnostics. No live failure silently becomes scripted simulation.

The browser sends its resolved timezone for each request. Shared helpers format routine dates as Today, Tomorrow, Oct 29 or a local time. Lease civil dates do not shift timezone. Stored UTC timestamps, calendar calculations and explicit timezone settings are unchanged. Old saved answers are preserved; routine displayed ISO dates are humanized without altering links or user-authored messages.

## Review locally

Open http://127.0.0.1:7673/admin/maintenance and sign in normally with the existing isolated preview account. Open the floating Ask Ootla launcher. Start a new conversation and ask what needs attention, request a lead summary or inspect an application's missing documents. Expect actual current records with source links and a short truthful AI-availability notice in this unconfigured demo. Previously saved responses are not rewritten.

With a separately configured authorized non-demo runtime, repeat those questions to verify conversational model answers. Open sources to check grounding. Inspect the protected request diagnostics to confirm live mode and usage. Missing credentials, rejected output, timeout and exhausted budget must show concise failure/native results and must not create a task or report a successful send.

## Migration and verification

Migration 030 permits a null property on the existing AI-request ledger for organization-wide staff questions such as My tasks; public property-scoped AI requests still require their property. It adds no customer record and does not reset any data. Apply additive migrations deliberately with `npm run db:migrate` before starting a compiled deployment. Ordinary startup never migrates or seeds automatically.

Focused checks cover controlled live-eligible provider routing, source/knowledge access, budget and retry behavior, failures, user dates and transport validation. A controlled test transport verifies the code path without a paid API call; it is not evidence of a real external model response. Actual live-provider verification remains pending until authorized credentials and model/prices are configured.
Final local evidence: eight controlled routing groups, three interruption/accounting groups, one omitted-timezone fixture, seven transport groups, date/DST/schema checks and final read-only safety review passed. The full build and final server compilation passed. Migration030 is already applied to this local demo, and its API/frontend are running. The backup and strict preservation check retain all963original rows and private environment bytes; only known automation cursor fields differ. The existing client bundle-size advisory remains.

An interrupted request is not automatically replayed or retrospectively repaired. The same receipt reports in-progress or interrupted status; an expired request conservatively settles its ledger without another provider call or action. Start a deliberate new question after an interruption. Live external model verification remains pending.