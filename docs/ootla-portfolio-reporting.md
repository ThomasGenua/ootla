# Portfolio and team reporting — Stage 23

Open http://127.0.0.1:7673/admin/reports after normal staff sign-in. Reports use native CRM records; website analytics remain separate at /admin/analytics. Filters are applied server-side before aggregation and pagination.

## Verified boundaries

Current membership, organization, role and every property interest on a lead are checked. Region labels are Ootla metadata, configured separately from provider-owned property fields. Only organization administrators and property managers can export; exports are bounded to 5,000 rows / 5 MiB with formula-safe CSV cells. Over-limit exports fail explicitly. Tables default to 25 rows, maximum 100.

Exactly four header values are period counts: leads created, non-cancelled viewings booked, portal applications submitted, and valid verified active-lease milestones. Separate cohort outcomes use linked records and chronological ordering. Lead-to-tour uses leasing leads created in the period; tour-to-application uses completed viewings during the period and subsequent linked application starts; application-to-lease uses portal submissions during the period and subsequent valid linked lease evidence. Cohort observations end at the earlier of the selected exclusive end date and the observed time. Current cancellations/record state apply; this is not a reconstructed historical snapshot.

The page includes complete source, date, numerator, denominator, status and exclusion definitions. First follow-up timing is the earliest logged staff call or staff conversation after lead creation, through observation; notes and AI replies are excluded. A logged call is not proof of an actual completed call. Current task workload is distinguished from period-created lead counts. Draft/imported applications without a portal submission timestamp do not inflate submission counts. Demo events, manual attestations and provider evidence are separately labeled.

Ask Ootla uses this same reporting service and selected dates/filters. Answers show observed dates, definitions and record links; they do not infer causation. Saved histories recheck present grants and anchored relationships. Changed authorization hides unauthorized history before pagination; unrelated later inquiries do not invalidate earlier authorized threads.

## Manual review

1. Open Reports, select dates and an assigned property/group or configured region.
2. Switch between Properties, Sources, Pipeline age, Follow-ups, Workload and Applications. Search, change pages and read Definitions.
3. Ask “How did this property perform during the selected period?” and compare dates/counts with the page.
4. Select Applications / Missing documents, then ask which applications await documents.
5. As an authorized export role, download CSV. Read-only analysts cannot export.
6. Configure a region only as an organization administrator, then filter by it.

## Checks and scale observations

Focused verification: seven API groups (including relationship-based history changes before pagination), four actual Chrome groups, both TypeScript projects and six mocked responsive widths. Controlled period counts were 5/3/3/1 and linked cohorts 2/4, 2/3 and 1/3. Scratch fixture records were removed.

Optional isolated benchmark: `npm run check:portfolio-scale`. It creates and removes only its owned scratch database, uses the existing volume seed and adds 2,700 properties plus 2,700 leads, **zero units**. Repeating the seed creates no duplicates. Pages of 25, last page 108 and single-result search passed. It never inserts volume fixtures into the retained demo.

Final measurement repeated once after Stage24 extended report task-scope queries. Measured 2026-10-25 on Windows x64, Node22.22.0, eight logical CPUs, 63.85 GiB RAM, project-owned local PostgreSQL, Vite/Express loopback and headless Chrome:
- Directory HTTP first 122.46 ms; warm median 88.42 ms; maximum response 9,254 bytes.
- Portfolio report HTTP first 335.16 ms; warm median 241.54 ms; maximum response 18,159 bytes.
- Browser page readiness: Properties 2,857.86 ms; Reports 2,919.00 ms.

These are synthetic developer-machine observations, not an SLA or an Apache VPS benchmark. Production concurrency, dense activity histories, remote latency and bulk document storage were not measured. Raw observations are kept in ignored .local/portfolio-scale-observations.json. Earlier fixture failures (invalid source enum and a hidden-option browser locator) were corrected; the final complete benchmark passed.

## Commands

`npm run db:migrate` applies additive immutable migration021. No reset, automatic seed, new dependency or actual .env change is required.

Focused checks: `npm run check:portfolio-reporting`, `npm run check:portfolio-reporting-browser`, `npm run check:portfolio-scale`. Test runners use owned disposable environments. Start normally with `npm run dev` once the project-owned database is running; see README for the complete installation/start sequence.
