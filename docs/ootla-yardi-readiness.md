# Yardi integration readiness - Stage 12

Reviewed: 2026-10-21 (Africa/Lagos). Project: Ootla, Documents/software/Ootla.

## Evidence inspected

The repository, its documentation/configuration/migrations, relevant chat attachments and Ootla/Yardi-named Downloads were inspected. The original Ootla foundation attachment is a product brief, not Yardi interface documentation. Another keyword-matching attachment describes a different project's simulator and is excluded from Ootla evidence. The available image assets are branding/dashboard references.

No authorized client API manual, WSDL/OpenAPI/schema, XML/JSON/CSV sample payload, licensed-interface identification, authentication instructions, pilot property scope or approved source-field mapping was found. Current server environment variable names and saved connection metadata were checked without printing secrets: no Yardi credentials/configuration or live connection is configured. Public Yardi information is not substituted for the client's licensed interfaces.

## Independent implementation states

| State | Current evidence |
| --- | --- |
| Scaffolding implemented | Yes: guarded readiness/configuration validation, neutral mapping and transport boundaries, source-ownership policy and existing durable connector infrastructure. |
| Mapping tested | No client Yardi mapping is tested. Canonical/path/validation contract tests use explicitly synthetic non-Yardi fixtures. Stage 11's functional simulator mappings are tested separately. |
| Credentials configured | No live Yardi credentials. An optional encryption key or simulator credential does not prove live credentials exist. |
| Live behavior verified | No. No live transport is registered, no provider call is enabled and no Yardi behavior has been observed. |

The current live adapter status is Not configured. Residents and payment-status ingestion are explicitly Unsupported. A well-formed dry-run draft, successful unit test, simulation badge or typed documentation reference cannot advance these evidence states.

## Boundaries available for review

Open http://127.0.0.1:7673/admin/integrations?view=yardi after normal organization-admin sign-in. The Yardi setup view shows independent evidence, remaining inputs and field ownership. The original simulator remains on Connection.

- GET /api/connectors/yardi/readiness: protected, organization-admin only, safe metadata, no writes.
- POST /api/connectors/yardi/validate-config: protected same-origin dry run. Optional neutral fields are documentationReference, interfaceId, clientEnvironment, propertyExternalIds and requestedCapabilities. These are Ootla planning fields, not Yardi endpoint/authentication/payload names.
- An empty JSON object returns missing-input reasons. Supplied references remain unverified; nothing is stored, connected or imported. Unknown secret/authentication/endpoint/payload/activation fields are rejected. Property IDs are bounded to 500 distinct entries for a pilot draft, not a limit on the client's 2,700-plus properties.
- Source mappings contain canonical targets and explicitly reviewed source paths only after authoritative documentation and samples are provided. No guessed source field or default mapping is shipped. A neutral transport boundary returns not-configured/unsupported without network access.
- Reuse external_record_mappings with its typed tenant-safe property/unit/contact/application/lease references and connection identity. No extra external-ID columns or duplicate customer store are created. Resident and payment status have no supported canonical ingestion target in this stage.

Readiness and validation are non-persistent. Invalid/missing live setup does not prevent Ootla startup, CRM use, standalone imports or the functional simulator.

## Field ownership and authority

This is Ootla's proposed authority policy, not a claim about an undocumented Yardi payload. Apply source ownership only to explicitly configured fields and identities; standalone records remain managed through their established local/import workflows. No live write capability is granted.

| Domain | Source-owned after approved mapping | Ootla-owned work | Current support / write boundary |
| --- | --- | --- | --- |
| Properties | Configured provider identity and descriptive property fields, such as canonical name/address/city/type. Group mapping needs explicit agreement. | Internal IDs, staff assignments, CRM organization/grouping where not source-owned. | Canonical foundation/external mapping exists; live source selectors and transport not configured. Preserve properties as properties, distinct from units. |
| Units | Configured provider unit/parent-property identity, inventory attributes, availability and authoritative rent/evidence when the licensed interface supplies them. | Prospect preferences and staff follow-ups; no invented availability verification. | Canonical foundation exists; real status semantics/time zones/deltas need approved samples. Simulator availability remains Demo with null live verification. |
| Contacts | Configured provider customer/guest-card/contact identity and approved name/email/phone fields. | Unified canonical identity, internal notes, lead preferences, consent/history and staff-owned relationship work. | Reuse dedicated external mappings and current property scope; no merge on name/shared email or silent adoption. |
| Applications | Configured source application identity, relationships and source status, only when the licensed interface supports them. | Staff document review, tasks and recorded decisions; application-specific status remains on its application record. | Canonical application foundation/mapping exists; live status mapping is unverified. AI does not approve/reject applicants; screening needs an approved provider, consent and staff review. |
| Leases | Configured authoritative lease identity, resident/unit relationships, status and dates; financial terms/accounting stay in Yardi. | CRM follow-ups and evidence-based summaries. | Canonical lease foundation exists; no provider lease is executed or locally certified by dragging a lead. Live mapping remains unconfigured. |
| Residents | Yardi remains authoritative for configured resident/occupancy/lease records. | Customer support, tasks and communications attached to the same verified identity/history. | Resident ingestion Unsupported. Contact/household/lease foundations are not proof of a completed resident adapter; no resident is created from a lead-stage change. |
| Payment status | Yardi retains ledger, balance, receivables and accounting authority. A configured existing payment provider may supply verified transaction status with provenance and reconciliation. | Read-only verified display and visitor-initiated existing-provider handoff when configured. | Payment-status ingestion Unsupported. No payment authorization, capture, charge, refund, ledger posting or inferred paid status. A return URL/user checkbox is not verification. |

Existing source-owned field checks remain server-side. Ootla's lead stages, ownership, preferences, internal notes, tasks, staff decisions and audit history cannot be overwritten by generic guest-card updates. A stale/ambiguous/provider-owned conflict requires the appropriate staff/provider workflow; review does not grant universal write access.

## Remaining client inputs

1. Exact licensed Yardi product/interface/version and authorized documentation, including supported read/write operations and record identifiers.
2. Documented authentication and secret-delivery/rotation process, issued server credentials, permissions and network restrictions. Do not paste secrets into public pages, source control or examples.
3. Client-approved organization and explicit pilot property IDs; property/unit hierarchy and current staff scope. Begin with a bounded pilot, then plan paginated reconciliation of the full 2,700-plus-property portfolio.
4. Sanitized representative payloads/schema for requested domains, including IDs/relationships, status variants, timestamps/time zones, nulls, pagination, incremental/deletion/correction semantics and errors.
5. Approved field-ownership and transformation profile, identity/duplicate decisions and unsupported-field behavior.
6. Provider-approved test environment or controlled read-only validation arrangement with known expected records.
7. Webhook/event authenticity, replay/order/idempotency and delivery/retry/rate-limit instructions if that interface uses events; do not assume webhooks exist.
8. Reconciliation acceptance criteria, responsible client reviewers, monitoring/support contacts, activation decision and rollback boundaries.

See [pilot checklist](ootla-yardi-pilot-checklist.md). Stage 12 prepares the boundary; it does not activate a live connection.
