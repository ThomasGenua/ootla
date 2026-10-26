# Server-side OotlaAI — Stage 19

Open http://127.0.0.1:7673/admin/ai after normal staff sign-in. This is a working page within the existing shared shell, using real authorized CRM records. The isolated demo is explicitly **Simulated AI**. Scripted inference runs through the same scoped orchestration and normal task services; no external model or messaging service is called.

## Request pathway

1. Authenticate the current server session and membership; establish organization, property and complete lead/application scope.
2. Classify one bounded intent.
3. Retrieve only approved knowledge for that exact organization/property before searching.
4. Read changing availability, native viewing slots or actual application checklist state through permitted application/domain queries.
5. Invoke the configured adapter with relevant, bounded context and output limits.
6. Validate the strict result structure and supplied source identifiers.
7. Re-authorize every proposed task using fresh session, role, record and property grants.
8. Create permitted tasks through the normal Tasks service with durable idempotency receipts.
9. Verify the saved task identity and actionable state in the same transaction.
10. Compose a response from actual source facts and action results, then persist the operational trace.

Results separate response, concise operational summary, sources, actions/status, execution status and handoff reason. The model cannot select arbitrary record IDs. Read intents cannot authorize writes. An unknown tool or malformed argument is refused. No SQL/shell execution, payment authorization, application decision, eligibility scoring or Stage 20 messaging is available.

General retrieval excludes identity-document bytes and screening reports. Knowledge is data, not system policy; suspicious instruction text is excluded as an additional defense. Only organization admins can create/edit/approve property knowledge. Editing approved content returns it to Draft unless explicitly reapproved. A property question with no approved answer requests staff help rather than inventing one.

Availability includes reported versus recently verified counts; stale records are not confirmed offers. Viewing slots are bounded current native options, not bookings or Google invitations. Application checklist reads reveal required-item/consent presence, not document contents. A converted customer's follow-up remains property/contact linked so it stays actionable while the AI request retains its authorized application context.

## Try the working scenarios

1. Choose a permitted property. Under Add property knowledge, save an approved synthetic FAQ such as **Entrance** / **Use the east entrance for viewings.** Ask **Which entrance should visitors use?** and run the request. The answer links its exact approved source.
2. Choose Current availability; run it. Compare the source with Properties and its verification times.
3. Select an actual lead, choose Viewing options, and run. Configure native Calendar/property staff availability first to see offered slots; otherwise the honest result asks staff to configure them.
4. Select the linked application and choose Application checklist. The result reports its actual missing details/documents/consent/readiness.
5. Choose Follow-up task, optionally set its title/due date/priority, then Run request. Open saved task only appears after the normal domain operation commits. Refreshing/retrying the same request does not create a second task.
6. Ask **Approve this application** or **Refund a payment**. The server refuses. Staff handoff creates a permitted internal task when authorized.

Scenario buttons fill the question; they do not run actions. Queued results have Check request status; that reads the existing request instead of invoking inference again. Operational trace shows tools, sources, concise reasons, latency and usage; no chain-of-thought or raw prompt is stored.

## Configuration and budgets

Server-only .env.example documents AI_PROVIDER, AI_MODEL, AI_API_KEY, AI_MAX_REQUESTS_PER_MINUTE, AI_MAX_TOKENS_PER_REQUEST, AI_DAILY_TOKEN_BUDGET, AI_DAILY_COST_BUDGET_MICROS, AI_INPUT_COST_MICROS_PER_MILLION, AI_OUTPUT_COST_MICROS_PER_MILLION and AI_TIMEOUT_MS. Existing .env was preserved.

The default provider is simulated. Simulation is available only in a verified isolated demo. A non-demo environment without a configured provider returns Not configured. Live AI is rejected in DEMO_MODE.

The optional OpenAI adapter uses the official HTTPS Responses API with store:false, strict JSON schema, bounded response bytes/output, one request and an abort timeout. Set an approved model and credentials only in a separately authorized non-demo environment. There is no default invented model or price: operator-verified positive token prices and a cost budget are required. Costs are estimates in USD millionths, not a provider billing guarantee.

Organization request budgets are reserved under a database lock before inference; daily windows use UTC. Token reservation conservatively includes bounded input bytes, fixed policy/schema overhead and output allowance. Failed/timed-out provider calls conservatively consume the reserved estimate. Rate/budget exhaustion prevents a model request. No model retry loop runs automatically.

## Persistence, routes and verification

Migration 017_ai_orchestration.sql adds approved knowledge, mutation receipts, actor-bound AI requests and operational traces. Task action receipts reuse Stage 18's shared domain mechanism.

Authenticated endpoints: /api/ai/config, /options, /knowledge, POST /requests and GET /requests/:id. Every request and cached result rechecks current scope. Records are server-paginated and bounded; whole portfolios are never loaded into the browser.

Focused commands: STAGE_CHECK=19 npm run check:application-journey, npm run check:ai-transport and npm run check:ai-browser. Checks inject typed server-only adapters and stub fetch; no paid inference occurs. Live provider behavior is **not verified**. Consent/privacy/provider approval, model selection, credentials and approved token pricing remain operator/client inputs.

Official references: [Structured Outputs with Responses](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses) and [response storage/conversation state](https://developers.openai.com/api/docs/guides/conversation-state).
