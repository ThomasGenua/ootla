import { icon, link } from '../lib/ui';
import { exploreSection, publicPhoto } from './public-layout';

function caption(copy: string): string {
  return `<figcaption class="public-example-label pf-example-caption"><span>${copy}</span><span class="pf-illustrative">Illustrative</span></figcaption>`;
}

export function platformPage(): string {
  return `<main id="main-content" class="public-detail-page platform-page public-refresh">
    <section class="detail-hero" data-public-section="intro" aria-labelledby="platform-heading"><div class="detail-container detail-hero-grid">
      <div><span class="detail-kicker">THE OOTLA PLATFORM</span><h1 id="platform-heading">One relationship.<br>A clearer way forward.</h1><p>OotlaAI connects leads, viewings, applications and property work. AI supports the conversation; your team owns the next action and decision.</p><div class="detail-hero-links">${link('/try',`Try Ootla ${icon("arrow")}`, "button button-primary")}<a class="text-link" href="#platform-applications">Explore the platform ${icon("arrow")}</a></div><span class="detail-preview-note">Explore the platform through example workflows.</span></div>
      ${publicPhoto("interior")}
    </div></section>
    <section id="platform-applications" class="public-primary public-section public-section-dark" data-public-section="main" aria-labelledby="platform-applications-heading"><div class="detail-container">
      <div class="detail-split"><div class="detail-copy public-primary-heading"><span class="detail-kicker">FROM INTEREST TO A COMPLETE APPLICATION</span><h2 id="platform-applications-heading">Less chasing.<br>More ready for review.</h2><p>Answer routine questions and keep missing documents visible for timely follow-up.</p><p>Applicants save details and private documents, then return to finish. AI helps explain what is missing; authorized staff review and decide.</p><p class="public-ai-value">AI prepares reminders and handoffs. Screening requires an approved provider, consent and staff review. AI never approves or rejects applicants.</p>${link("/workflows/leasing#leasing-application-heading", `Follow the application journey ${icon("arrow")}`, "text-link text-link-light")}</div>
<figure class="public-example pf-application">${caption('An application ready for follow-up')}<div class="pf-preview-heading"><span class="pf-icon-box">${icon('file')}</span><div><h3>Document review</h3><p>Sam Rivera &middot; Example application</p></div></div><ul class="pf-document-rows"><li><span class="pf-document-icon">${icon('file')}</span><div><strong>Identity document</strong><p>Received &middot; Staff review pending</p></div><span class="pf-document-state">Review</span></li><li><span class="pf-document-icon">${icon('file')}</span><div><strong>Proof of income</strong><p>Awaiting applicant's file</p></div><span class="pf-document-state">Pending</span></li><li><span class="pf-document-icon">${icon('shield')}</span><div><strong>Screening consent</strong><p>Not yet requested</p></div><span class="pf-document-state">Required</span></li></ul><div class="pf-review-boundary">${icon('person')}<div><strong>Staff review, then the next action</strong><p>No screening is requested and no applicant decision has been made.</p></div></div><p class="pf-visual-note">Illustrative checklist. No personal documents or consent are collected here.</p></figure>
      </div>
      <div class="public-feature-grid">
        <article id="platform-leads" class="public-feature"><span class="detail-kicker">LEADS</span><h3 id="platform-leads-heading">Respond while interest is fresh.</h3><p>Answer property questions, collect stated preferences and keep SMS, phone and web conversations with the same lead.</p>${link("/workflows/leasing#leasing-inquiry", `Explore leads ${icon("arrow")}`, "text-link text-link-light")}</article>
        <article id="platform-viewings" class="public-feature"><span class="detail-kicker">VIEWINGS</span><h3 id="platform-viewings-heading">Move from a question to a viewing.</h3><p>Collect preferred times and keep the property timezone and staff owner together. A requested time becomes an appointment only after successful booking.</p>${link("/workflows/leasing#leasing-viewing-heading", `Explore viewings ${icon("arrow")}`, "text-link text-link-light")}</article>
        <article class="public-feature"><span class="detail-kicker">APPLICATIONS</span><h3>Keep progress understandable.</h3><p>One application connects private access, the checklist and staff review. AI explains missing items; a received file still needs review.</p>${link("/workflows/leasing#leasing-application-heading", `Explore applications ${icon("arrow")}`, "text-link text-link-light")}</article>
        <article id="platform-operations" class="public-feature"><span class="detail-kicker">OPERATIONS</span><h3 id="platform-operations-heading">Help the right person pick it up.</h3><p>Collect the issue and prepare a staff handoff. Staff assign work and confirm visits; requested access is not an appointment.</p>${link("/workflows/resident-support", `Explore operations ${icon("arrow")}`, "text-link text-link-light")}</article>
      </div>
      <p class="public-ai-value">Use Yardi-ready integration or standalone import. Keep properties and units separate. Yardi owns its configured records and accounting; the existing provider handles payments. ${link("/integrations", "Explore connections", "text-link text-link-light")}</p>
      <p class="detail-preview-note">Scripted examples. No messages, calls or customer-record changes.</p>
    </div></section>
    ${exploreSection()}
  </main>`;
}
