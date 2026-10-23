# Yardi pilot activation checklist

Prepared for Stage 12. This is a future pilot checklist, not an activation action. The adapter remains Not configured; no live mapping, credential or behavior is verified. Complete the client's evidence and a supported implementation before activation.

## Access and supported interface

- [ ] Record the exact licensed product/interface/version and authorized documentation reference. Confirm supported resources/operations and who may use them; do not infer universal access.
- [ ] Confirm client ownership/authorization for the organization and requested records. Use a client-approved test environment or controlled read-only arrangement.
- [ ] Obtain the documented authentication method and server credentials through the approved secure channel. Verify rotation/expiry/revocation and any network constraints. No guessed auth headers, token routes or endpoint names.
- [ ] Implement and register only the documented transport behind the connector interface. Keep simulation separate. Leave unimplemented capabilities Unsupported and deny all outbound writes until independently specified and authorized.
- [ ] Protect configuration, mappings, diagnostics and credentials with current staff/organization permissions. An organization admin has no platform-superadmin access. Secrets remain server-only, encrypted with an independently managed key.

## Property scope and permissions

- [ ] Agree on a small explicit pilot property allowlist and expected count. Treat property and unit identities/counts separately; the full portfolio has 2,700-plus properties.
- [ ] Verify organization, property and staff scopes at read/ingestion time, including revoked users/grants. Reject unrelated organization/property records and broken cross-tenant relationships.
- [ ] Confirm read permissions separately for properties, units, contacts, applications, leases, residents and payment/accounting status. No disabled resource may appear enabled because a login succeeded.
- [ ] Confirm that the selected interface can filter or otherwise safely enforce the approved scope and bounded pagination. If this cannot be guaranteed, keep that capability unavailable.

## Mappings and field ownership

- [ ] Obtain sanitized representative payloads/schema, including normal/changed/missing/null/error cases. Preserve source IDs, parent relationships and provenance.
- [ ] Review a versioned canonical mapping for each requested domain against that exact documented interface/sample. Separate Ootla-owned CRM data from Yardi-owned configured fields.
- [ ] Keep provider IDs in the typed external mapping registry. Resolve identity through stable provider IDs and explicit staff review; do not merge on names/email alone.
- [ ] Agree on source-status meanings, transformation/null rules, currency/date/time-zone handling and availability evidence. Do not map an unknown status to occupied/available/leased/paid by default.
- [ ] Confirm applications retain their own source status and staff review. Confirm lease/resident changes preserve customer history and cannot be manufactured by lead progression.
- [ ] Leave resident/payment-status capabilities unsupported until their canonical models, permission boundaries and documented source mappings exist.
- [ ] Keep accounting authority in Yardi. Verify read-only status provenance/reconciliation with an existing payment provider where applicable; no charge/capture/refund/ledger-write operations.
- [ ] Record mapping-test evidence separately from configuration syntax tests or simulator fixtures. Changing mapping version requires focused revalidation.

## Synchronization and reconciliation

- [ ] Verify read-only connectivity with actual client-authorized credentials and approved scope. Record sanitized evidence/time/environment; never log secrets or full customer payloads.
- [ ] Reconcile initial property/unit/contact/application/lease counts and sampled relationships against client-approved expected data. Record resident/payment unsupported gaps explicitly.
- [ ] Test incremental updates, corrections, stale/out-of-order data, repeated events/pages and resumption using the documented provider semantics. Cursor/checkpoint and canonical writes must stay duplicate-safe.
- [ ] Test temporary/terminal failures, actual retry/rate-limit behavior, interrupted processes and safe resumption without dropping failed records or duplicating successful ones.
- [ ] Verify unsupported/source-owned fields, missing IDs, schema changes and scope violations fail safely with protected diagnostics and reconciliation gaps.
- [ ] Compare authoritative fields and Ootla-owned notes/tasks/ownership/stages before and after sync. Confirm simulator and standalone data remain separate.
- [ ] Agree acceptance thresholds and an accountable client reviewer. Do not label the adapter Live until supported behavior has been observed and documented.

## Rollback and operational handoff

- [ ] Capture database backup/recovery verification, pre-pilot aggregate counts, approved mapping version, cursor/checkpoint and relevant record revisions before activation.
- [ ] Define how to disconnect/pause jobs, revoke provider access and stop new ingestion. Verify the connector does not keep processing after the agreed stop boundary.
- [ ] Retain durable receipts, mappings, history and diagnostic/audit evidence. Do not blindly restore an old cursor and replay without duplicate protection.
- [ ] Preview any compensating record changes against current revisions/relationships. Preserve staff work performed after import; never delete or overwrite unrelated customer records.
- [ ] Validate backup restoration/compensation in an isolated environment. Do not overwrite production as a routine rollback step.
- [ ] Reconcile after rollback and require a reviewed plan before resuming. Keep the functional demo available independently.
- [ ] Assign client/engineering owners for monitoring, failed jobs, permission/key changes, reconciliation and incident handling. Record remaining unsupported capabilities.

## Evidence sign-off

| Gate | Evidence required | Stage 12 status |
| --- | --- | --- |
| Scaffolding implemented | Guarded interfaces, validation, mapping structure and fail-closed responses; focused checks. | Implemented. |
| Mapping tested | Approved source payloads/schema and exact-interface field/relationship reconciliation. | Not available; synthetic contract/simulator tests are separate. |
| Credentials configured | Issued server credentials, documented method, scope and secure storage validated for this client interface. | Not configured. |
| Live behavior verified | Observed authorized provider requests/results, reconciliation, recovery and reviewed acceptance evidence. | Not verified; no live transport registered. |

A typed reference, populated secret field or successful simulation is not evidence for the next gate. Scope/credential setup alone does not authorize production activation.
