# Stage 25: local voice simulation walkthrough

Open http://127.0.0.1:7673/admin/voice after normal staff sign-in. This is the native Ootla voice foundation. The progress log records the actual isolated API/browser verification gate.

## Deliberate setup

1. Voice is disabled by default. No call, microphone, audio output or recording starts on page load.
2. An organization administrator in the isolated demo can open **Voice setup & transcript policy**.
3. Select **Enable the local transcript simulator for this isolated organization**, keep **Transcript retention days** at zero unless deliberate raw-text retention is wanted, and choose **Save voice settings**.
4. If requiring consent, provide the actual **Client-approved consent notice** and enable its requirement. The application supplies no jurisdictional legal wording.
5. Recording stays disabled. This interface cannot enable it. Telephony, live speech recognition and speech output remain not configured.
6. A published permitted demo property channel must exist in the native Conversations workspace. Search for channels through **Find a published property**; only the bounded server page is loaded.

## Property questions and event handling

1. Choose **Published property channel**, **Property questions** and an **Example caller name**. The name labels synthetic input; it does not establish identity.
2. Choose **Start transcript simulation**.
3. Enter a question in **Synthetic caller transcript**, then **Submit synthetic transcript**.
4. The returned text is shown as the current local response. Operational metadata and a concise session summary persist through the actual backend.
5. With retention set to zero, raw text is not retained. The immediate response exists in page memory and clears on refresh or reopening; it is not placed in localStorage or sessionStorage.
6. Test **Simulate silence**, **Simulate unclear speech**, **Simulate interruption**, **Simulate repeated question**, **Simulate timeout**, **Simulate provider failure**, **Simulate unavailable slot**, **Simulate failed transfer** and **End simulated session**. The repeated-question control asks for clarification; it does not replay a question whose text was not retained.
7. Terminal or handoff states stop further automated input. A failed transfer says it did not connect; a saved staff-help request is not a real telephone transfer.
8. **Open staff conversation** and **Open lead timeline** lead to the same native CRM history used by other customer interactions.

The five displayed layers separate synthetic recognition input, dialogue orchestration, permitted domain tools, text output and staff handoff. Transcript playback is not proof of live ASR, TTS or telephony.

## Native viewing booking

1. Start a **Viewing enquiry** simulation on a property with configured native availability.
2. Select **Find available viewing slots**. An optional viewing date uses the property calendar; results show its timezone, location, duration and available slots.
3. Choose one returned slot and select **Confirm viewing booking**.
4. A conflict or unavailable slot remains an error; it is not presented as a successful booking. Refresh availability and choose another slot as needed.
5. Only a successful native booking response produces a confirmed viewing outcome. The header metric is refreshed from server aggregates.
6. The local booking, lead timeline and staff conversation use the existing scheduling workflow. Demo notifications remain simulated. Google synchronization status is separate.

## Verified application guidance

Use matching staff, applicant and property records. The separate applicant demo is prepared deliberately with `npm run demo:applicant` if it has not already been seeded; it is not created on startup. Existing credentials and staff work are preserved.

1. Sign out of any current staff account, then open http://127.0.0.1:7673/admin/login. Sign in normally as `applications@demo.ootla.test` / `OotlaDemo!2026`. This account belongs to the applicant demo organization. The original `admin@demo.ootla.test` account belongs to another organization and cannot use its proof.
2. Open http://127.0.0.1:7673/admin/conversations?settings=1. Expand **Website chat configuration**. Enter `Willow Court` in **Find an accessible property**, choose **Find properties**, then select **Willow Court - applicant demo** in **Property**. Supply a clear demo **Public chat label**, review the property timezone, and choose **Publish demo chat channel**. Reuse its existing published channel if already configured. Publication exposes only separately approved public facts; it does not expose the private application.
3. Open http://127.0.0.1:7673/admin/voice in this same staff session. Under **Voice setup & transcript policy**, deliberately enable the local simulator and **Save voice settings**. Recording remains disabled.
4. Choose the matching **Published property channel**, set **Simulation scenario** to **Application next steps**, then choose **Start transcript simulation**. Guidance is generic until appropriate verification succeeds.
5. Choose **Open applicant sign in** to open its separate tab in the same browser. At http://127.0.0.1:7673/applicant/login, sign in normally as `applicant@demo.ootla.test` / `OotlaApplicant!2026`. **Fill demo applicant credentials** only fills the fields; still choose **Sign in**. Keep the staff Voice tab open. The applicant and staff cookies are separate.
6. Return to Voice and choose **Load current applicant portal session**. No applicant lookup happens until this deliberate action. Only applications returned by that actual signed-in applicant session, matching the simulated property, appear under **Authorized applicant application**.
7. Select the matching application and choose **Verify current applicant session**. The server checks the actual applicant cookie, matching organization/property and current application permission. An email, name, staff checkbox or arbitrary identifier is not accepted as proof.
8. Enter `What application steps are outstanding?` in **Synthetic caller transcript**, then choose **Submit synthetic transcript**. The response can summarize the authorized participant's current status and outstanding checklist count, while directing detailed review to the secure portal. It does not expose document contents or approve an applicant.
9. To check expiry/revocation behavior, sign out of the applicant portal in its other tab and submit another private-guidance turn in Voice. The server rechecks proof and returns generic secure-portal guidance when it is no longer current.

## Transcript access and retention

- Default retention is zero days. The concise operational summary and metadata are separate from raw transcript text.
- An organization administrator may configure up to 30 days of permitted text retention.
- Raw transcript reads remain protected by the server and current authorization. Private guidance requires current proof as well.
- Authorized users can deliberately select the deletion confirmation and choose **Delete retained transcript**. The summary remains.
- No raw audio is captured or exposed.
- No recording, live customer outreach, payment authorization or applicant decision tool is activated by this demo.

## Focused frontend checks

The mocked UI checks verified deliberate activation, recording=false payloads, retention-zero refresh behavior, immediate server-response display, all scripted event controls, terminal-state input removal, failed-versus-confirmed booking, explicit applicant-session lookup/verification, authorized deletion and keyboard result focus.

The native page was checked at 1586, 1280, 1024, 768, 390 and 320 pixels with no document overflow. Desktop/mobile screenshots were inspected. The approved public pages and Overview remain unchanged; the profile menu remains last at the right of the admin header.

Mocked checks do not establish live provider behavior. Refer to the main progress log and final batch handover for the real isolated API/browser gate and remaining external configuration.
