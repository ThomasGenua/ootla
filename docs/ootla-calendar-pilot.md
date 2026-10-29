# Calendar pilot review

The Calendar refinement is implemented in the isolated ootlademo checkout. The separate live checkout and external communication hold are unchanged.

## Open and test

Staff login: http://127.0.0.1:7673/admin/login

Account: admin@demo.ootla.test / OotlaDemo!2026. Use normal Sign in.

Calendar: http://127.0.0.1:7673/admin/calendar

1. The initial view is a real month grid. Select any date or its empty cell to open the selected-day popup. Existing entries resolve actual linked leads, properties, units, staff and statuses. Open an entry for its viewing detail.
2. Choose a future date, select Book a viewing, then select a property, linked lead and eligible viewing agent. Optionally select a unit. Choose Find available times, select one of the actual offered slots, check the meeting location and save. The popup updates from persisted records; closing it refreshes the grid without replacing the admin header or sidebar. Refresh the page to verify persistence.
3. A failed request keeps the entered fields. A slot conflict requires Find available times again. Cancel or Escape closes the dialog and returns focus. Nothing is booked merely by opening or changing a date.
4. Switch Month, Week, Day or Agenda, move Previous/Next or Today, and use the compact property/status Filters. Browser Back and reading position remain usable. A selected-day list has its own bounded pagination when needed.
5. Availability settings opens the existing protected property schedule and staff weekly hours. Hidden stored property timezone values are preserved. Weekly hours remain property-local recurring rules; displayed appointments and offered times use the browser-resolved user timezone, without printing raw timezone identifiers.

The period grid reads at most 1000 authorized records within its bounded range. If there are more, a visible notice says the period is partial and each selected date independently pages its actual bookings. Properties are not loaded as an unbounded portfolio. Month ranges cover six complete Monday-first civil weeks, including correct daylight-saving boundaries.

## Google Calendar

Feature: http://127.0.0.1:7673/admin/calendar?view=google

Select Google Calendar, then Sync with your Google Calendar. The popup explains the current connection state. This isolated preview does not authorize Google or make provider calls; it deliberately offers Continue in Ootla. No external sign-in, successful sync or calendar invitation is simulated.

For an eligible configured non-demo deployment, Continue with Google uses the existing real OAuth flow, bound to the current staff membership, organization and secure session. After consent, the staff member chooses calendars for busy-time checks and one writable destination for assigned Ootla viewings. Saving that selection queues the existing durable synchronization jobs. This does not grant other staff access to the account or change unrelated Google events.

Native Calendar may display the current staff member's cached Google intervals as read-only Busy entries. It never exposes other event titles, attendees or descriptions, and does not turn those intervals into CRM viewings. Cached updates can be delayed and do not reserve a local viewing slot. Local booking success and Google synchronization status remain separate.

No live Google account or credentials were configured or verified for this refinement. The existing required server settings are GOOGLE_CALENDAR_ENABLED, GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, GOOGLE_CALENDAR_REDIRECT_URI and GOOGLE_CALENDAR_TOKEN_KEY; approved Google Cloud consent/client configuration and an exact APP_URL/api/google-calendar/oauth/callback redirect are also required. Never enable them by converting the retained demo/customer database into live mode. Detailed existing transport, ownership and activation boundaries remain in ootla-google-calendar.md.

## Startup and preservation

The existing demo is already running. No installation, migration, environment change, seed/reset or restart is needed. The data remains real PostgreSQL-backed CRM records. New booking tests ran only in disposable isolated databases; retained review used normal authentication and reads. All prior migrations, private environment settings and original business records are preserved. No live checkout, production deployment, notification transport or Git push was changed.
