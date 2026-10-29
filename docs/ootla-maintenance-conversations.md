# Maintenance conversations

Implemented in the isolated ootlademo project. The selected request now contains Conversation in the previously reserved space. The compact summary, assignment/status controls and private Internal notes stay separate.

## What works

- Resident-facing history comes from the existing maintenance_messages records, linked by the exact organization and request. Opening or replying does not create a contact, lead, public chat channel or second inbox.
- Native resident-portal replies use the shared communications transport and existing conversation_outbox, with a same-request/message/organization foreign key. Available in resident portal means saved and accessible through the authorized portal; it is not email delivery or a read receipt.
- Existing authenticated resident replies appear in the staff thread. Incoming request-key receipts, outgoing action receipts and stable message IDs prevent duplicate retries. Cursor pagination preserves PostgreSQL timestamp precision and never attaches a thread by matching an email address.
- Drafts are private to the staff author and persist across refreshes. Draft revisions prevent another tab from being silently overwritten. A conflict offers explicit review/cancel/replace while retaining current text.
- Sending and polling update only the conversation. Unsent text, selection, focus, other unsaved request fields and older-message reading position remain intact. The New messages button lets a reader choose when to jump.
- Private staff notes are excluded. The reply payload accepts text and a supported channel, not arbitrary recipients or attachments; private files are not forwarded.

## Email dependency

The existing repository has no implemented email sender, authenticated incoming-email handler or verified email thread/delivery callback mapping. The email transport therefore remains unavailable. Email draft composition is supported where the linked contact has an authorized address, but Send is disabled for that channel; direct API attempts preserve the draft and return501 without creating a delivery record.

Before real email can be activated, choose an approved provider and supply its official transport/authentication, sender identity and configuration, authenticated inbound/status callback specification and verified Message-ID/thread mapping. These are implementation dependencies as well as configuration inputs; adding a password alone cannot enable email. No unverified email webhook was introduced. No real tenant test messages were sent. The Oodler/live email hold remains in force.

## Manual walkthrough

1. Use normal staff sign-in at http://127.0.0.1:7673/admin/login, then open http://127.0.0.1:7673/admin/maintenance?request=477cda01-510c-55fa-a1b5-6d3dcb93be16 . This is Alex Taylor at Grove Lofts, unit3C.
2. In Conversation, enter a short reply through Resident portal. Use Save draft and refresh to check persistence, then Send. Expect Available in resident portal, with no page reload or email claim.
3. In another tab open http://127.0.0.1:7673/resident/login . The already-existing main-workspace resident account is showcase.resident@demo.ootla.test with the isolated demo password OotlaDemo!2026. The separate resident@demo.ootla.test account belongs to another organization and cannot open Alex's request. Existing password edits are never reset by this feature.
4. After resident sign-in open http://127.0.0.1:7673/resident?request=477cda01-510c-55fa-a1b5-6d3dcb93be16 . Read the staff reply and add a resident reply. The staff Conversation checks for new messages about every8seconds while visible. Reading earlier messages shows a New messages control instead of forcing a jump.
5. Select Email draft, save text and refresh. It stays private and cannot be sent. Add a separate Internal note to confirm it remains outside resident correspondence.

The ordinary isolated demo remains usable and database-ready. This test walkthrough uses synthetic demo accounts only; do not substitute real tenant addresses for testing.

## Migration and startup

Migration029_maintenance_conversation.sql was backed up, verified and applied to the local isolated demo. Original migrations001–028 and existing records are preserved. No new dependency or environment variable was added; the running development process already serves the feature.

For another corresponding demo installation, from its project directory run npm run db:migrate before starting/restarting the application with npm run dev. Never run demo preparation/reset against a live database. The live checkout was not changed or deployed.

## Focused verification

Normal isolated service/API and browser checks cover reply/draft persistence, distinct requests for the same resident, real portal inbound replies, duplicate/conflicting request keys, actor-private drafts, failed delivery/retry, access denial and private-note separation. Additional checks cover precise older/newer cursors, lost successful responses, draft-conflict cancellation/confirmation, local-only updates, stable reading position and desktop390px layout. Test fixtures block external requests and never send to real tenants.

Commands used in this checkout: npx --no-install tsx scripts/check-maintenance-conversation.ts; npx --no-install tsx scripts/check-maintenance-conversation-browser.ts; node scripts/check-maintenance-conversation-browser.mjs --retained; npx --no-install tsx scripts/check-maintenance-conversation-preservation.ts; npm run build. Private verification evidence and screenshots are under .local/maintenance-conversation-* and .local/screenshots/maintenance-conversation-*.
