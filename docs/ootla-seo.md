
# OotlaAI public search readiness

This follow-up preserves the existing Vite/vanilla TypeScript + Express + PostgreSQL application. It improves technical readiness for searches about real estate AI assistants, AI leasing assistance and property management workflows. It does not deploy the site or claim search placement.

## Content and presentation

- The original headline and six alternating light/charcoal landing sections remain. The six workflow copy/value blocks were shortened from325 to185 words, about43%.
- Real photographs occupy56% of their visual area width; larger product previews occupy88% desktop/90% narrow widths. Their opposing edges create the requested diagonal. Credits reveal on hover/focus/touch instead of a visible bar. The app interface remains primary.
- Natural category wording appears in the hero kicker, supporting text and unique page metadata. There are no hidden keyword lists, competitor-name stuffing, copied assets/copy, fabricated ratings, prices, certifications or live integrations.

## Crawlable output and metadata

shared/public-site.ts owns an allowlist of eight marketing pages with unique titles/descriptions, canonical/social metadata and factual Organization/WebSite/WebPage data. Breadcrumbs point only to existing routes.

scripts/public-seo-plugin.ts reuses client/pages/public.ts through Vite's module renderer during development and build. It serves the same public HTML to all visitors, with one H1, readable content and normal links before JavaScript. This is static public pre-rendering, not a framework replacement or a user-agent-specific crawler version.

Build output includes index.html plus seven nested page HTML files, a separate blank noindex app-shell.html, robots.txt, sitemap.xml and a non-secret public-site-manifest.json. The existing Express application chooses the correct allowlisted public file while preserving staff/applicant gates. Private HTML never receives the homepage body or public JSON-LD. Physical public HTML aliases redirect to their clean paths; unknown pages return404.

client/lib/seo.ts updates managed title/description/robots/canonical/social/JSON-LD on SPA navigation and browser Back. Private routes remove public canonical/schema/social content and preserve their own page titles.

The existing production content-security policy remains restrictive. Compiled JavaScript navigation and inert JSON-LD passed browser verification without weakening it. The existing local Inter font is preloaded.

## Preview and public-launch configuration

The current localhost demo intentionally remains noindex. No public domain has been assumed from the contact email. Its sitemap contains no public URLs until a deliberate public target is enabled.

Optional build-time settings are documented in .env.example:

- PUBLIC_SITE_URL: the verified production HTTPS origin only, with no path, credentials, query or fragment.
- PUBLIC_SITE_INDEXING: false by default; true requires that valid public origin.

These values are not secrets. The actual .env was not changed.

For a later explicitly authorized public launch:

1. Confirm the canonical public domain and HTTPS deployment.
2. Set PUBLIC_SITE_URL to that origin and PUBLIC_SITE_INDEXING=true in the build environment, then run npm.cmd run build.
3. Serve the build through the established Express application. Runtime APP_URL must match the built public origin; NODE_ENV must be production, DEMO_MODE must be false, and the request Host must match. A mismatch keeps HTTP indexing disabled and the sitemap empty. Canonical URLs are never constructed from request headers.
4. Keep the deployment's existing secure production configuration and organization boundaries. No deployment or provider activation is part of this follow-up.
5. Verify the live public routes, raw HTML/canonical/social/schema, robots.txt, sitemap.xml, private noindex/authentication and HTTPS behavior.
6. Verify domain ownership in Search Console and submit the sitemap. Live crawl/indexing and search-result appearance require separate evidence.

Public robots guidance permits public crawling and excludes staff/applicant/booking/API prefixes. Preview pages additionally carry noindex metadata/headers so crawlers can see that instruction. Robots rules are not access control; the existing backend authentication and permissions remain authoritative.

## Focused verification

From C:/Users/user/Documents/software/Ootla:

- npm.cmd run build
- npm.cmd run check:public-seo

The focused check covers configuration/metadata/schema/sitemap/runtime-host fixtures; built raw HTML and private blank shells/gates/404s/aliases; all eight public pages without JavaScript; compiled JavaScript under the production CSP; responsive photo hierarchy/credits; SPA metadata/back; and the retained demo's ordinary sign-in/header/sign-out. Temporary servers use no database or workers and are stopped. Reserved test origins are not contacted. Ordinary demo sign-in creates/revokes only its own expected session/audit records.

## Official guidance consulted

[Google's JavaScript SEO guidance](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics) supports readable pre-rendered content, unique page titles/descriptions and consistent canonicals.

[Google's AI-search guidance](https://developers.google.com/search/docs/appearance/ai-features) applies normal SEO fundamentals to AI search features; special AI markup is not required and inclusion is not guaranteed. Important information remains visible text, supported by relevant photographs and internal links. Structured data describes the visible product without invented commercial claims.

The current [DashQ](https://dashq.io/) and [EliseAI](https://eliseai.com/) sites were reviewed only for category context. OotlaAI uses original wording and retains its own configuration and staff-review boundaries.
