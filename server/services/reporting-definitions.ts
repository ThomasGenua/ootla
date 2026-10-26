import type {ReportingDefinition} from '../../shared/reporting-contracts.js';
export const definitions:ReportingDefinition[]=[
  {
    "id": "leads_created",
    "label": "Leads created",
    "kind": "period_count",
    "source": "Canonical leads",
    "dateBasis": "leads.created_at in the inclusive selected UTC dates.",
    "numerator": "Distinct authorized leads created in the period, across leasing and sales.",
    "denominator": null,
    "included": "Every saved lead intent and current stage.",
    "excluded": "Other organizations or any lead with an unauthorized property interest.",
    "limitation": "Imported creation time may represent import time; this is not a conversion rate."
  },
  {
    "id": "viewings_booked",
    "label": "Viewings booked",
    "kind": "period_count",
    "source": "Canonical viewings linked to permitted leads",
    "dateBasis": "viewings.created_at in the selected UTC period.",
    "numerator": "Distinct viewings currently Scheduled, Completed or No-show.",
    "denominator": null,
    "included": "Saved native viewings, counted once per viewing.",
    "excluded": "Cancelled records and requests/invitations without a booked viewing.",
    "limitation": "This measures booking creation, not viewing occurrence or successful attendance; current status is observed now."
  },
  {
    "id": "applications_submitted",
    "label": "Applications submitted",
    "kind": "period_count",
    "source": "Canonical applications",
    "dateBasis": "applications.portal_submitted_at in the selected UTC period.",
    "numerator": "Distinct applications with a saved portal submission timestamp.",
    "denominator": null,
    "included": "Submitted records irrespective of their later current review state.",
    "excluded": "Drafts or imported statuses without a portal submission timestamp.",
    "limitation": "A website event or drag of a lead card does not count as submission."
  },
  {
    "id": "leases_verified",
    "label": "Leases verified",
    "kind": "period_count",
    "source": "Canonical active leases and lease_verified_milestones",
    "dateBasis": "Milestone verified_at in the selected UTC period.",
    "numerator": "Distinct active leases with a valid milestone matching the lease's current updated_at.",
    "denominator": null,
    "included": "Explicit manual attestation, isolated demo event or verified provider evidence, identified separately.",
    "excluded": "Draft/ended leases, obsolete evidence, a lead stage alone, payment events and website analytics.",
    "limitation": "Manual or demo evidence is not proof of a live signing provider. Current record validity is observed now."
  },
  {
    "id": "lead_to_tour",
    "label": "Lead to viewing",
    "kind": "cohort_conversion",
    "source": "Leasing leads and their linked noncancelled viewings",
    "dateBasis": "Cohort: leasing leads created in the selected UTC period. Outcome cutoff: earlier of period-end exclusive and observedAt.",
    "numerator": "Cohort leads with a same-lead viewing created after lead creation and before the outcome cutoff.",
    "denominator": "All authorized leasing leads created in that same cohort period.",
    "included": "Each lead at most once; Scheduled, Completed or No-show viewing outcomes.",
    "excluded": "Sales opportunities, cancelled viewings, unbooked invitations and outcomes after cutoff.",
    "limitation": "Current statuses are read now; this is not a reconstructed historical snapshot or causal attribution."
  },
  {
    "id": "tour_to_application",
    "label": "Viewing to application started",
    "kind": "cohort_conversion",
    "source": "Completed viewings and exact lead/property/contact-linked applications",
    "dateBasis": "Cohort: completed leasing viewings whose starts_at falls in the selected UTC period; common outcome cutoff applies.",
    "numerator": "Cohort viewings with an application created at/after the viewing end (or start if no end) and before cutoff.",
    "denominator": "Authorized completed leasing viewings in that viewing-date cohort.",
    "included": "Application drafts count as started; each viewing is counted at most once.",
    "excluded": "Scheduled, cancelled and No-show viewings; earlier or unrelated applications; outcomes after cutoff.",
    "limitation": "One later application may relate to multiple completed viewings. This is a viewing-based cohort, not a unique-person conversion or proof of causation."
  },
  {
    "id": "application_to_lease",
    "label": "Submitted application to verified lease",
    "kind": "cohort_conversion",
    "source": "Submitted applications, exact linked active leases and current verified milestones",
    "dateBasis": "Cohort: portal_submitted_at in the selected UTC period. Outcome verified_at must follow submission and precede cutoff.",
    "numerator": "Cohort applications with an exact application-linked active lease and valid current milestone.",
    "denominator": "Authorized applications with a portal submission in that same cohort period.",
    "included": "Each application at most once, with explicit evidence provenance.",
    "excluded": "Unsubmitted drafts, unrelated leases, stale evidence and outcomes after cutoff.",
    "limitation": "Pending/young cohorts may not yet have reached an outcome. A zero denominator has no defined rate and is shown as unavailable."
  },
  {
    "id": "pipeline_age",
    "label": "Pipeline age",
    "kind": "elapsed_time",
    "source": "Current open canonical leads created in the selected period",
    "dateBasis": "Observed now minus lead.created_at, in elapsed days.",
    "numerator": "Elapsed time of each included lead, grouped by current pipeline stage where displayed.",
    "denominator": "Included leads for displayed averages.",
    "included": "Current open leads; sales retain their own stages.",
    "excluded": "Leased, Won and Lost/Closed records and unauthorized property interests.",
    "limitation": "Age is not time spent in a stage; stage history and imported dates can differ."
  },
  {
    "id": "follow_up",
    "label": "Follow-up due",
    "kind": "current_state",
    "source": "Current open cohort leads and saved next-action dates",
    "dateBasis": "Next-action due time compared with observedAt; lead creation uses the selected period.",
    "numerator": "Open leads with next_action_at at/before the observed time.",
    "denominator": "Open authorized cohort leads where a comparison count is shown.",
    "included": "Actual saved next actions, including unassigned work.",
    "excluded": "Closed/won/leased leads; AI guesses, notes and generated delivery claims.",
    "limitation": "A missing due date is not treated as completed work. Staff task queues remain the operational source for task completion."
  },
  {
    "id": "first_logged_follow_up",
    "label": "First logged follow-up",
    "kind": "elapsed_time",
    "source": "Lead call logs or staff sent/delivered conversation records",
    "dateBasis": "Earliest qualifying staff event after lead creation, measured in hours.",
    "numerator": "Elapsed hours from creation to the first qualifying log for each included lead.",
    "denominator": "Only cohort leads with a qualifying logged follow-up.",
    "included": "Staff call logs and staff messages saved Sent/Delivered.",
    "excluded": "Internal notes, drafts, AI replies and leads without qualifying evidence.",
    "limitation": "A logged call does not prove a connected telephone conversation. Local simulated delivery is identified as simulation; unlogged work is unknown."
  },
  {
    "id": "workload",
    "label": "Staff workload",
    "kind": "current_state",
    "source": "Native actionable Tasks and current owners of period-created open leads",
    "dateBasis": "Open task workload is a current snapshot independent of period; lead workload uses the selected creation period.",
    "numerator": "Current actionable open tasks and period-created open leads per eligible owner, with unassigned work shown separately.",
    "denominator": null,
    "included": "Current permitted property assignments, relevant linked records and native completion state.",
    "excluded": "Resolved/cancelled/irrelevant tasks, closed leads, unauthorized records and unavailable staff guesses.",
    "limitation": "Owner/team/region/group filters use current configuration. Work counts do not measure staff effort, quality or protected characteristics."
  }
];
export const reportingLimitations:string[]=[
  "Report dates use UTC and an exclusive next-day upper bound; the outcome cutoff never extends beyond the observed time.",
  "Cohort conversions use linked records from the same defined cohort. The four period counts are separate measures and must not be divided into conversion rates.",
  "Current statuses, ownership, teams and region/group configuration are observed now; reports do not reconstruct every historical change.",
  "Imported creation timestamps may indicate import time. Missing submission, follow-up or provider evidence remains unknown rather than an invented milestone.",
  "Manual attestation, isolated demo evidence and provider verification are distinct. Notes, call logs and simulated sends do not prove an actual phone connection or external delivery.",
  "Website analytics is separate. These reports do not infer customer attribution or causal explanations, and missing-document counts never disclose document contents."
];
