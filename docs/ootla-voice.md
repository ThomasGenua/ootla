# Optional voice foundation — Stage 25

Open http://127.0.0.1:7673/admin/voice after normal staff sign-in. This is **local transcript playback**, not verified live telephony, speech recognition or spoken audio. It does not buy phone numbers, place/receive calls, request microphone access, generate audio or activate recording.

## Deliberate setup

The organization policy defaults disabled. An organization administrator can deliberately enable the local simulator in the verified isolated demo, select transcript retention (0–30 days) and configure approved client consent wording if required. Recording stays disabled; there is no documented configured telephone provider. This does not change .env or activate any external communication.

Use an explicitly published property conversation channel. The separate Harbor View example from `npm run demo:conversations` supplies approved public knowledge and native viewing availability. Only assigned staff can use the corresponding records. Private records and raw transcripts remain protected server-side.

## Walkthrough

1. Sign in at /admin/login as admin@demo.ootla.test / OotlaDemo!2026. Open Voice and deliberately enable local simulation.
2. Choose a published property channel and Property questions. Start a synthetic caller session and enter a property question. The five displayed layers separate synthetic recognition input, dialogue orchestration, permitted tools, text output and staff requests. Retained turns show their recorded processing metadata when authorized retention is enabled.
3. Try **Simulate silence**, **Simulate unclear speech**, **Simulate interruption**, **Simulate repeated question**, **Simulate timeout**, **Simulate provider failure**, **Simulate unavailable slot** and **Simulate failed transfer**. These are explicit local test events, not real phone callbacks. The repeated-question control requests clarification; it does not reconstruct unretained text.
4. For Viewing enquiry, request native available slots, choose an offered future slot and confirm deliberately. A booking message requires actual native booking persistence; unavailable slots and failures cannot produce a success. Google synchronization status remains separate and ordinary demo actions send no invitations.
5. Open the linked lead timeline and Conversations workspace. Voice outcomes use the same records, with concise generic events. Take over as staff to pause automated scheduling/replies; a failed transfer is never labeled as a connected call.
6. For Application next steps, use the normal applicant login in another tab of this same browser. Explicitly load the signed-in applicant's authorized applications and verify the selected one. A name/email or staff checkbox cannot establish caller identity. Private guidance rechecks the actual portal session and grants; without that proof the assistant gives generic secure-portal/staff guidance.
7. Refresh or reopen a session to inspect its outcome. With retention set to zero, raw transcript text is not retained and the immediate reply disappears on refresh; event timestamps and processing metadata can remain. With deliberately approved retention, current authorized transcript readers can inspect retained turns until expiry or explicitly delete them.

For the private application demonstration, use the matching organization: sign staff in as applications@demo.ootla.test / OotlaDemo!2026, publish a property channel for **Willow Court - applicant demo** in Conversations, and enable local Voice for that organization. Sign the applicant in at /applicant/login as applicant@demo.ootla.test / OotlaApplicant!2026 in another tab of the same browser. Start **Application next steps** on that property's channel, choose **Load current applicant portal session**, select its **Authorized applicant application**, then choose **Verify current applicant session**. The exact publication, sign-in and verification steps are in [the Stage 25 UI walkthrough](stage-25-ui-walkthrough.md#verified-application-guidance). The original admin@demo organization cannot use this other organization's proof. A generic unverified inquiry is not silently merged with an existing person on name/email.

The **Staff requests** header metric counts saved staff-help requests and failed-transfer outcomes, not connected phone calls.

No applicant decision, payment authorization, refund, card handling or autonomous renewal-signing tool exists in this voice layer.

## Separation and privacy

The internal adapter interfaces separate speech recognition, dialogue, permitted tools, speech output and staff transfer. The local recognition adapter only accepts bounded synthetic text. Its output is text playback; disabled telephony has false capabilities and rejects provider callback authentication. A commercial provider can only be added against its actual documentation and authorized configuration.

The native conversation bridge uses a generic initial inquiry, source Demo and forced simulated inference. It does not copy raw voice turns/private outputs into customer messages, the lead timeline or AI request logs. Public chat capability endpoints reject voice-origin sessions even with the correct capability token. Staff-only booking wrappers recheck session, organization, every property interest and current conversation ownership. Booking and staff takeover share the organization lock.

Raw turns live only in the restricted transcript store. Receipts retain hashes and outcomes rather than uncontrolled transcript copies. Read-time expiry applies even if the worker is stopped. A bounded server worker clears expired/off-policy text; outcomes, timestamps and canonical CRM links remain. Explicit cleanup: `npm run voice:purge -- --limit=100`.

Approved consent wording is client configuration, not invented jurisdictional legal advice. Recording is unsupported and disabled in this foundation, including when a notice has been saved.

## Remaining live inputs

Live telephony needs the chosen provider's authorized API/callback documentation, issued server credentials, authorized phone scope, callback authentication and replay rules, actual caller-verification policy, transfer destination/availability, approved consent and recording requirements, retention policy and an approved pilot. Live ASR/TTS and live model behavior require their own verified setup. None was activated by this batch.

Additive migration023 prepares this foundation. Run `npm run db:migrate`; no seed or reset is required. Focused check results and remaining limitations are recorded in ootla-progress.md and the final batch handover.
