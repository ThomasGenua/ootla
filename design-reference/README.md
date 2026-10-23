# Ootla design references

## Branding and typography correction - 2026-10-21

The user explicitly requested that the admin dashboard use the landing page's lighter typography and supplied replacement logo/favicon images. This correction supersedes the earlier provisional logo treatment and heavier dashboard heading weights while preserving the approved layout.

- Use the same self-hosted Ootla Inter family on landing/dashboard, with headings/emphasis at 500 and body/navigation at 400. Keep the inert dashboard shown in the landing hero consistent with the real admin interface. Do not restore 650-800 weight dashboard headings/metrics.
- Approved original transparent wordmark: public/brand/ootla-wordmark.png. Approved roof/O icon: public/brand/ootla-icon.png. Both are byte-for-byte copies of the supplied local PNGs. The white-background reference is design-reference/assets/ootla-logo-on-white.png; source filenames, SHA-256 digests and display bounds are recorded in design-reference/assets/ootla-brand-assets.json. These originals are now available locally and supersede earlier statements that logo binaries were unavailable.
- Shared wordmark() renders the supplied artwork across public headers/footers, sign-in, admin and coded product previews. Do not reconstruct the lettering as HTML text or restore the provisional roof SVG. client/brand.css clips transparent canvas without changing the original PNG; dark surfaces retain the original forest-green mark and render its lettering white for visibility.
- Favicon public/brand/favicon.svg embeds the exact supplied icon PNG inside a tighter viewBox. The PNG is a fallback; public/ootla-mark.svg uses the same icon as a compatibility path. No generated/repainted logo is substituted.
- This is a requested visual correction only. No later numbered stage, data reset, authentication change, provider action or deployment is authorized. Stop after reporting it.


## Stage 10 standalone import workspace - completed, awaiting review

Keep import onboarding and tools on `/admin/imports` in the existing approved shell, linked by **Open customer-data import** on the dedicated Integrations page. Preserve the five sidebar destinations, full-width charcoal header/top navigation, four Overview metrics, sidebar below the header and maximum-three spacious actionable follow-up cards. Import/upload panels, duplicate tables and worker progress do not belong on Overview. Public sections, typography, clipped inert dashboard examples and hello@ootla.ai are unchanged.

Present six clear steps: Upload, Map fields, Validate, Review duplicates, Confirm import, Reconcile results. Upload only stages private data. Show saved batch UUID, original physical source row numbers, invalid/duplicate decisions and actual results. Native labeled file/map/decision/confirmation controls and paginated horizontal table regions must remain keyboard-usable at narrow widths. Tables may scroll inside their own labeled region; the page must not overflow. Clearly label downloaded templates invented examples and CSV-only/UTF-8 limits.

Duplicate UI must distinguish Create a separate contact, reviewed existing identity and Skip. Name-only suggestions must say they cannot establish identity; never visually imply automatic merging or overwrite. Results link to actual canonical records and distinguish created, linked, invalid, failed, skipped, removed and safely retained work. Imported availability remains unverified. A New inquiry import must not look like an executed lease, approved application, booked appointment or provider operation.

Undo previews explain why later edits/dependencies will be retained. Confirmation removes only eligible untouched records, preserving reused contacts/history and later work. The separate standalone demo is an empty synthetic organization; its masked **Fill standalone demo credentials** button does not submit or bypass normal Sign in. No customer data or external communications are fabricated.

Final 15 backend groups, nine isolated write-browser groups, three bounded restriction-state UI cases and three retained record-read-only browser groups passed. Responsive 320/390/768/1586px import/results views, native labels/keyboard/reduced motion, bounded data, genuine navigation and unchanged four-metric/maximum-three-card Overview passed. The final 147-module client/server build, bounded compiled security smoke, all eight migration checksums, 109 protected source hashes and original-data preservation across 35 prior business tables passed. New captures are `.local/screenshots/stage10-imports-desktop.png` and `stage10-imports-mobile.png`; they are review artifacts, not replacement visual authorities or user approval. The separate retained standalone demo has no imported/customer records. Current review origin remains http://127.0.0.1:7673. A final render correction hides deleted-record links after undo while retaining created/retained links, IDs and outcomes; three focused property/contact/lead cases and the final post-correction 147-module client/server build passed. No backend/database change or broad-suite repeat was needed. Stage 10 is complete with no outstanding failures. STOP and await user review without advancing.
## Stage 09 task workspace - completed, awaiting review

Preserve the approved full-width rounded charcoal header/top navigation, exactly four Overview metrics, sidebar below the header and at most three spacious follow-up cards. Stage 09 changes the live card data to actual actionable tasks while keeping detailed queues, editors, history, routing and reminders on /admin/tasks. Fewer actionable records must yield fewer cards or an honest empty state, never fabricated work. The header bell opens the real in-app reminder inbox; no Overview feed, chart or large AI/integration panel is added.

My tasks, Team tasks and Unassigned distinguish actual assignment. The retained original three tasks remain unassigned, so My tasks is initially empty. Routing uses all eligible property staff when an enabled rule has no selected team; a selected team narrows the pool. Empty/ineligible selected teams leave work Unassigned, and team membership never grants property access. Task detail shows origin/due/priority/status/current completion plus append-only history and exact linked application/tour context. A task does not approve an application or confirm a tour/technician appointment.

Reminders are real in-app notices only. Show clear recipient-only snooze choices and policy, no duplicate refresh-created work, and cancellation after completion/irrelevance. Contextual AI, public scripts and external integrations retain their simulation/setup boundaries; public copy/assets and hello@ootla.ai remain unchanged.

All 14 backend groups, eight isolated write-browser groups and four retained record-read-only groups passed. Native labels/keyboard and 320/390/768/1586px layouts passed. Desktop Tasks, mobile Reminders and desktop routing captures were visually inspected without layout issues. Original data in all 29 prior tables, all seven migration checksums, public sources and admin CSS are preserved. The final 144-module client/server build and bounded compiled security smoke passed without outstanding failures. Captures are implementation review artifacts, not replacement visual authorities or user approval. Current review is http://127.0.0.1:7673. Stage 09 is complete. STOP and await user review without advancing.

## Stage 08 private lead detail - historical completed scope

Preserve the approved charcoal header/top navigation, sidebar beneath it and uncluttered Overview. The existing /admin/leads?lead=<saved UUID> uses the shared shell and Stage 07 identity/interests/preferences/owner/stage/next-action controls. Dedicated sections add contact/household, private staff actions, tasks, documents, combined timeline, contextual AI simulation and transparent property suggestions. Native section links and collapsible form editors keep tools navigable; none belongs on Overview. Public examples and approved hello@ootla.ai remain preserved.

Clearly label internal-only notes/attachments, synthetic communications/viewings, AI simulation/live setup and unverified availability. Read-only/partial-scope viewers get the honest restriction notice rather than editable private tools. Logging calls does not dial; tasks send no reminders. Call history shows direction/outcome/duration and task history distinguishes Open to Completed from Completed to Open. Staff handoff notes are not applicant decisions or provider verification. Requested access is not a confirmed technician appointment.

Suggestions show criteria and verification provenance/date without eligibility scores. Move-in date remains unconfirmed because current availability cannot prove a future date. Retained unverified demo units must not become invented verified matches. Sales keeps its own inventory setup state.

Final build, all 13 backend groups, eight isolated write-browser groups, four retained read-only browser groups and security/source/data preservation passed. Current review is http://127.0.0.1:7673, following preserved APP_URL. Final responsive checks covered 320/390/768/1586px, native labels/keyboard/reduced motion, paged history, escaped staff text and the unchanged four-metric/three-card Overview. Desktop full lead and mobile timeline were visually reviewed, including final visible call/task/viewing metadata. Retained captures were refreshed without customer record writes under .local/screenshots/stage08-lead-{desktop,mobile}.png and stage08-timeline-{desktop,mobile}.png. These are implementation review artifacts, not replacement authorities or user approval. Stage 08 is complete, awaiting user review. STOP; do not begin another stage.

## Stage 07 lead workspace - historical completed scope

Stage 07 places persistent lead list/board, creation, ownership/preferences editing, duplicate suggestions, stage controls and action history on `/admin/leads`. Preserve the approved Overview's full-width rounded charcoal header, four simple metrics, sidebar below it and three spacious follow-up cards. Add lead and View all leads open real dedicated lead tools; new detail panels stay off Overview. The public homepage, its inert clipped example, earlier workflow illustrations and hello@ootla.ai remain unchanged.

Leasing and sales boards have distinct labeled stage vocabularies. Cards represent only the current server page; aggregate column totals are explicitly labeled. Bounded search/filter/pagination controls, owner/unit/property search and native keyboard stage controls must remain visible and usable. Do not portray moving a card as application approval, lease execution or verification.

Contact selection explicitly distinguishes a suggested match from confirmed identity; same names/shared email never imply an automatic merge. Canonical contact links, explicit property-association controls, eligible owner choices and read-only permissions reflect the real backend. Stage history displays real actor/time. Tour scheduled is CRM progression, not confirmation of a booked viewing or sent invitation. Applications/Leases signed remain unconfigured rather than gaining unsupported counts. Application summary comes from the saved application, and **Not verified** is honest lease evidence until the authorized milestone exists.

Final build and all 12 backend groups passed. Seven isolated write-browser groups and four retained record-read-only groups passed, including 320/390/768/1586px responsive layouts, native labels/focus/reduced motion, real create/edit/owner/stage refresh persistence, distinct sales/leasing boards, actor/time history and preserved Overview actions/four metrics/three cards. Source/data preservation and compiled security smoke passed. Desktop list/board and mobile detail captures were visually inspected; retained captures are under `.local/screenshots/stage07-{list,detail,board}-{desktop,mobile}.png` plus `stage07-create-mobile.png`. They are review captures, not user approval or new visual authorities. Stage 07 is complete with no outstanding failures, awaiting user review. STOP without starting Stage 08.

## Stage 06 property/contact workspaces - historical completed scope

Stage 06 adds dedicated property and contact tools inside the existing approved admin shell. Preserve the full-width charcoal header/top navigation, sidebar below it, exactly four overview metrics and three spacious lead cards. Do not add directory tables, charts or maintenance/AI/integration widgets to Overview. Existing public pages and the user-approved hello@ootla.ai handoff remain preserved.

Property pages distinguish portfolio properties from individual units, show server filter/pagination controls and honest source/availability evidence, and keep editable forms on the relevant directory/detail page. Contacts/households have their own workspace/tab with explicit identity/property links and scoped relationship history. Matching email must not visually imply an identity merge. Source-owned fields display locked/read-only states, and restricted staff see read-only tools consistent with backend grants.

Legacy/demo availability verification remains unavailable, never inferred from creation time or fabricated as a live Yardi status. A stored mapping or Yardi-connected organization mode is not an active integration. Applications/leases are minimal identity relations without a completed workflow; preserve unconfigured overview metric labels/values.

Final build, ten backend scratch groups, all six focused browser groups and original overview/source/old-column data preservation passed. Browser review covered 320/390/768/1586px, native forms/keyboard, filters/paging and normal login/refresh/logout; retained form writes were deliberately omitted because scratch API checks verify persistence. The 4px 320px header overflow was corrected only on the new workspace routes and rechecked. Desktop property directory and mobile Harbor detail were visually reviewed. Exact four overview metrics/three saved cards remain unchanged. No outstanding verification failures remain. Stage 06 is complete, awaiting user review; STOP with no Stage 07. Passing checks do not imply user visual approval.

## Stage 05b platform and integrations - historical completed scope

Preserve the protected Stage 04 visual authority and the approved public green/off-white/charcoal family with headings 500/body 400. Stage 05b changes public integrations/platform/supporting navigation only; existing home/workflows/admin remain preservation requirements.

Integrations must show the exact hero “Yardi-ready integration.” and seven separate text/coded-preview stories for Yardi records, Google Calendar, Google Analytics acquisition, standalone customer/history import, applicant portal, maintenance and existing-provider payment guidance.

Use clear example/awaiting-configuration labels. Yardi-connected/Standalone is only a local illustration selector, not an organization setting or status proof. Yardi activation needs the client-licensed interfaces, permissions and configuration; do not imply certification or a live connection.

Platform explanations cover Leads/Viewings/Applications/Operations and use genuine existing public workflow links. Contact/privacy navigation must have truthful content/destinations. The user approved hello@ootla.ai on 2026-10-21; display exactly that address linked to mailto:hello@ootla.ai. No legal identity, delivery test or policy guarantee is inferred; the website sends nothing.

Final build, all six focused browser groups, 680 contrast samples, selector/keyboard/mobile/privacy checks and preservation passed. All four platform/integration/contact/privacy desktop/mobile captures were visually reviewed. A final cosmetic title correction received bounded compiled Chrome smoke; the full six groups were not repeated. Final approved-contact build and bounded contact-only follow-up passed: exact href without activation, keyboard/SPA focus, 320/390/1586px layout and 42 contrast samples. Contact desktop/mobile captures were refreshed. The prior six-group suite was not repeated after the email update. Stage 05b is complete; user review remains pending. STOP after Stage 05b; do not claim a ready contact inbox or advance to Stage 06.

## Stage 05a public workflow pages - historical completed scope

Current public AI, leasing and resident-support pages extend the established forest-green/off-white/charcoal family with shared public-detail styling. Preserve the Stage 05 homepage and the actual Stage 04 protected dashboard; no new reference image supersedes that admin authority.

The AI resident/reminder/viewing panels are manual scripted examples, not live AI. Five displayed steps progressively show conversation, record and staff handoff; scenario selection/replay resets the local example. Example disclosure, keyboard focus and responsive layouts remain required.

Preserve the resident timing boundary visually and in copy: “My bathroom fan has stopped working.” leads to clarification and requested Thursday 14:00–16:00 access. DEMO-104 stays Awaiting assignment, technician Unassigned, appointment Not scheduled. Requested access must never look like a confirmed technician appointment. The next staff task asks people to review/assign/confirm.

Leasing viewing times remain requests; applicant review belongs to staff with provider/consent screening boundaries. Resident assignment/update/renewal/payment illustrations are unsent/unsubmitted; no charge/refund or falsely verified payment status appears.

Shared navigation uses a native-details Workflows menu and real /admin/login CTAs. Final build, seven focused scenario/route/keyboard/mobile/privacy groups, 620 contrast samples, compiled-route smoke and preservation passed. Caption contrast was corrected; bounded final desktop/mobile focus/Replay/public-fragment checks passed after the focused fixes without repeating the complete suite. Rendered desktop/mobile pages and completed scenarios were visually reviewed. Stage 05a is complete, awaiting user review; no later stage started. Passing checks do not imply user visual approval.

## Stage 05 public homepage - historical completed scope

The current authorized stage changes only the public homepage. Preserve the actual Stage 04 protected dashboard, its visual authority and all working authentication/data.

Hero headline: “Keep leads moving. Keep people informed.” Supporting copy: “Ootla brings your pipeline, AI assistance and daily property work into one clear workspace.”

Public layout uses forest green, off-white and charcoal; heading weight 500/body 400. Six separate alternating text/visual sections cover resident AI replies, staff reminders, viewing scheduling/Google Calendar, applicant documents/staff review, Yardi readiness and standalone imports. Each visual is an example/planned workflow, not a connected service.

The hero uses the actual coded admin shell at full 1480px desktop size, positioned far right and clipped beyond the viewport, without shrink/stretch transforms. At widths up to 900px, the still-unscaled preview moves below the copy in normal flow inside a clipped 430px-high frame; this corrects the initial mobile overlap. Preview-only styles are scoped to its inert container; the signed-in admin keeps its existing source/styles. A few subtle floating calendar/home/AI icons support the hero.

Preview records are invented public examples: Alex Morgan, Casey Taylor and Robin Lane, with three example leads/two tours derived from those fixtures and null unconfigured application/lease values. No private records or API request supply this artwork. It is aria-hidden/inert, with inner main/h1 converted to avoid duplicate page semantics.

The three-step illustrative workflow offers native click/keyboard controls and optional scroll observation. Runtime reduced-motion removes automatic observer changes/sticky behavior/transitions, and route abort cleans up observer/listeners. No AI response, reminder, upload, calendar invitation, screening decision, Yardi connection or import is executed.

The full build, seven focused functional browser groups, public privacy/motion/keyboard checks and unchanged-admin/data preservation passed. Initial mobile overlap and low-contrast example disclosures were corrected. Final build and targeted contrast review passed 171 text nodes at 1586px/390px, including all three workflow panels, with minimum small-text contrast 4.58:1. Refreshed desktop/mobile full-page/hero/resident/workflow captures were visually reviewed. The seven functional groups passed before the CSS-only contrast follow-up and were not repeated afterward. Stage 05 is complete and awaits user visual review; no later stage started. Completion does not imply user visual approval; stop after the requested stage.

## Protected admin visual authority - Stage 04

The approved dashboard image supplied in the Stage 04 conversation is now the authoritative visual reference. Its dimensions are 1586 by 992 pixels. The image is visible in the conversation; an original raster binary has not been saved in this repository. Earlier records saying the dashboard reference was unavailable describe the historical state before Stage 04 and must not override the newly supplied image.

Stage 04 implemented this dashboard only; its protected interface is preserved during Stage 05. Match its proportions, spacing, typography, hierarchy, charcoal header, light workspace, green actions and spacious follow-up cards. Keep detailed tools on their own pages. The interface is coded HTML/CSS/TypeScript, never the screenshot as a background.

The required composition is:

- A full-width rounded charcoal header with Ootla branding and top navigation: Overview, Leads, Properties, Applications, Calendar.
- An Overview title and period selector.
- Exactly four summary metrics: New leads, Tours booked, Applications, Leases signed.
- A sidebar beginning below the header: My leads, Tasks, Analytics, AI assistant, Integrations.
- A light workspace with three spacious Leads to follow up cards and clear Add lead, View lead and View all leads affordances.
- No overview charts, activity feed, AI panel or integration widgets.

## Branding assets

The original approved logo binary/vector source is still not present locally. `public/ootla-mark.svg` is the existing editable roof/O reconstruction informed by the earlier supplied logo images. Reuse it without inventing a new brand mark. The admin wordmark follows the image's spacing/alignment and does not add a decorative dot. It remains a provisional vector reconstruction until the original approved asset is provided; do not claim it is the exact source artwork.

Admin typography uses the self-hosted `public/fonts/InterVariable.woff2` from the Inter Project, with its SIL Open Font License 1.1 retained in [Inter license](../public/fonts/Inter-LICENSE.txt). The `Ootla Inter` family is scoped to admin and the coded hero preview through separate `client/admin.css`; existing public/login global styles are preserved and no external font requests occur.

Preserve accessible names and suitable dark/light treatment. Stage 04 did not generate a replacement raster logo; Stage 05 reuses the established branding for its authorized public layout.

## Honest record and metric content

The image establishes layout; displayed data comes from the existing organization-scoped database. Follow-up cards read the saved lead's actual status, property, unit description and earliest open linked task. Existing status labels are New inquiry, Contacted, Tour booked and Qualified. Do not relabel demo fixtures as Applying or Leased to imitate example content.

New leads counts lead records created in the selected period. Tours booked counts non-cancelled viewing bookings created in that period, rather than the date the viewing occurs. Periods are month/week/all, using Africa/Lagos boundaries. Applications and leases are unconfigured: their metric values are null and must display an honest unavailable state rather than fabricated zeros or rates. The original API count fields remain for compatibility.

Add lead opens a clearly pending creation page; no record is created. View lead opens a read-only saved detail with related records. Search and stage filters operate on the available records.

## Public preview and review status

The homepage preview reuses the coded admin shell, extends beyond the viewport and clips at the right edge. It remains illustrative, contains no private customer records and is not a screenshot or functional CRM module.

Stage 04 passed four backend groups, the final full build, nine extended browser groups and desktop/mobile/tablet captured visual review, with a close reference match and no clipping/overlap. Final preservation and focused navigation/mobile/deep-link QA also passed. Navigation is centered within 2px, layouts have no overflow at 320/390/768/1586px, and keyboard focus/query return behavior is preserved safely. Stage 04 completed and its user visual review remains pending; its historical verification record is preserved as the Stage 05 public work proceeds. Captures are stored under `.local/screenshots/stage04-admin-desktop.png`, `stage04-admin-mobile.png` and `stage04-admin-tablet.png`. Implementation review does not imply exact pixel identity or user approval.

Starting project tokens remain forest green `#237A3B`, charcoal `#10191A` and off-white `#F5F6F5`. Public headings retain their lighter direction; the admin shell follows the approved image's hierarchy without introducing remote font dependencies.

## Occasional logo motion - 2026-10-23

The user requested a slight roof tilt above the first O and subtle motion on the remaining letters. The shared wordmark uses clipped copies of the unchanged original PNG only during a brief 18-second animation cycle, with the first O stationary. The exact original unsplit rendering remains visible during quiet intervals and reduced-motion states. Roof tilt is at most five degrees; o/t/l/a lift slightly in sequence. System/account reduced motion disable it, and the inert homepage dashboard logo stays static. Preserve supplied assets, existing font weights, colors and layout. This is a branding follow-up only; no later numbered stage is authorized.

## Contextual compact admin header - 2026-10-23

The user accepted the occasional logo animation and explicitly requested four page-specific summary cards, shorter real cards and collapse to the top logo/navigation/actions. Current real cards are94-96px (110px only on the narrowest phones); original132px sizing remains only in the inert public hero example. The far-right chevron toggles title/period/cards; original charcoal styling, lighter typography, accepted logo motion and sidebar below header remain. Each module's counts are scoped real database snapshots, not repeated Overview statistics or browser-page lengths. Preserve this correction in later admin work. No new numbered stage is authorized.

## Public structure and account controls - current correction, 2026-10-23

The latest explicit user follow-up supersedes the earlier multi-section marketing layout: each marketing route has an introduction, one main forest-green section, Explore and footer. OotlaAI is the product name and Ootla remains the supplied brand/logo. The main section explains AI's contribution with SMS/phone/response examples, clearly qualified as scripted and setup-dependent. Keep the lighter heading500/body400 typography, supplied original public/brand PNG artwork and unchanged animated-wordmark/reduced-motion behavior. Historical provisional-asset and admin-only-font notes above do not describe the current implementation.

Platform's main feature is application follow-through. Three real, locally served illustrative photographs appear across Platform, Integrations and Resident support, with retained credit/provenance. The public coded hero dashboard remains full size and right-clipped, and examples never create records or send messages.

The real admin header order is Search, Notifications, summary collapse/expand, Profile. Profile is the last control on the far right; the dropdown identity shows only the user's name, while real profile/edit/settings/logout actions remain. This replaces the previous far-right chevron position. Preserve the four compact contextual cards, original Overview composition, existing data/permissions and Stage15 applicant interface. This follow-up is implemented, not yet user-approved.

## Authoritative charcoal/light correction - 2026-10-23

The user's "green background" wording was a mistake: use the current charcoal #10191a. This correction supersedes the green main-section direction above. Inner pages use light introduction, dark main content, LIGHT Explore and DARK footer. The homepage returns to six full alternating charcoal/off-white process bands rather than tabs, followed by its restrained workflow, light Explore and dark footer. Preserve improved OotlaAI/AI/SMS/phone value copy.

Resident requests and Viewings on the homepage mix a real illustrative photograph with a coded product preview and two subtle floating icons each. Credits remain visible above the photo, alt text is neutral and reduced motion disables decorative motion. Existing three inner photographs, branding/font/logo animation, clipped hero dashboard and admin profile/header corrections remain. See public/photos/sources.json for provenance. This correction is implemented and awaiting visual review.

## Landing hierarchy and concise copy - 2026-10-23

The user explicitly reduced the photographs' prominence: they now occupy56% of the media width, while coded product previews fill100%. Preserve this hierarchy at mobile and desktop widths, with small overlap, visible credits and floating icons beside the photo. Keep the full-size clipped hero dashboard and charcoal/off-white section structure.

The six workflow copy/value blocks are43% shorter. Retain concise natural real estate AI assistant/leasing/property-management language and the product's setup/staff-review boundaries. SEO improvements add pre-rendered public HTML and metadata, not more content sections, hidden keyword lists, competitor copy or fabricated claims. This follow-up is implemented and awaits user review.

## Current photo-credit and diagonal correction - 2026-10-23

The latest user instruction replaces always-visible credit bars with hover/focus/touch attribution and Escape dismissal. Retain the source/license manifest and neutral alt text. Normal layout shows the photograph alone.

Restore opposing edges: photograph upper right, product preview lower left with a clear diagonal overlap. Current photo56% / preview88% desktop and90% narrow widths preserves the interface's prominence. Do not align both right edges again. Keep the original hero crop, full-size dashboard and section palette.

Inner marketing prose is substantially shorter and direct, with setup/staff/privacy facts retained. The global Skip to content anchor is removed at the user's explicit request; semantic main landmarks remain. Existing applicant navigation and all admin/SEO/authentication features are preserved. Implemented and awaiting review.

## Subtle public accents and Contact us - 2026-10-23

The latest follow-up adds restrained floating icons to three homepage previews and shared Explore margins. Keep gentle14-second motion, reduced-motion support, decorative semantics and clear content/control space. Preserve existing hero/photo accents and all prior diagonal, palette and attribution corrections.

Contact shows a Contact us action rather than a printed email address. It opens a pre-addressed draft via the verified mailto destination. Public search/schema copy omits the address. No automatic delivery or contact-form backend was added. Implemented and awaiting review.
