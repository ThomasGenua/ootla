import { icon, link, type IconName } from '../lib/ui';
import { exploreSection, publicPhoto } from './public-layout';

function exampleCaption(copy: string): string {
  return `<figcaption class="public-example-label"><span class="wf-example-dot" aria-hidden="true"></span>${copy}<span>Illustrative</span></figcaption>`;
}
function journey(steps: Array<{ icon: IconName; title: string; copy: string }>): string {
  return `<figure class="public-example wf-journey">${exampleCaption('One relationship, connected steps')}<ol>${steps.map((step, index) => `<li><span class="wf-step-symbol" aria-hidden="true">${icon(step.icon)}</span><div><span class="wf-step-number">0${index + 1}</span><h2>${step.title}</h2><p>${step.copy}</p></div></li>`).join('')}</ol><p class="wf-example-note">Illustrative. No records or messages created.</p></figure>`;
}
function status(copy: string, tone = ''): string {
  return `<span class="wf-status ${tone ? 'wf-status-' + tone : ''}">${copy}</span>`;
}
function aiValue(copy: string): string {
  return `<p class="public-ai-value">${icon('sparkles')}<span><strong>OotlaAI:</strong> ${copy}</span></p>`;
}

export function leasingPage(): string {
  return `<main id="main-content" class="public-detail-page workflow-page leasing-page public-refresh">
    <section class="detail-hero" data-public-section="intro" aria-labelledby="leasing-heading">
      <div class="detail-container detail-hero-grid">
        <div><span class="detail-kicker">OOTLAAI / LEASING</span><h1 id="leasing-heading">Keep interest moving.<br>Keep the details together.</h1>
          <p>OotlaAI connects inquiries, viewings and applications. Your team owns the relationship and decisions.</p>
          <div class="public-channel-list" aria-label="Illustrated communication channels"><span>Prospect inquiries</span><span>Staff handoffs</span><span>AI assistance</span></div>
          <div class="detail-hero-links">${link('/try','Try Ootla ' + icon('arrow'), 'button button-primary')}<a class="text-link" href="#leasing-inquiry">Follow the journey ${icon('arrow')}</a></div>
          <span class="detail-preview-note">Explore the journey through example records.</span>
        </div>
        ${journey([{ icon:'message', title:'Understand the inquiry', copy:'OotlaAI gathers the prospect\'s stated needs.' }, { icon:'calendar', title:'Arrange a viewing', copy:'Staff confirm availability.' }, { icon:'file', title:'Complete the application', copy:'Track missing documents.' }, { icon:'person', title:'Put people in charge', copy:'Staff decide and record outcomes.' }])}
      </div>
    </section>
    <section id="leasing-inquiry" class="public-primary" data-public-section="main" aria-labelledby="leasing-journey-heading">
      <div class="detail-container">
        <div class="public-primary-heading"><span class="detail-kicker">ONE CONNECTED LEASING JOURNEY</span><h2 id="leasing-journey-heading">From inquiry<br>to staff review.</h2><p>One history. A next step at every stage.</p></div>
        <div class="public-feature-grid">
          <article class="public-feature">
            <span class="detail-kicker">01 / FIRST RESPONSE</span><h3>Understand the inquiry.</h3>
            <p>Capture property, unit, budget, bedrooms and move-in preferences.</p>
            ${aiValue('Answer property questions by a property conversation. Gather missing details.')}
            <figure class="public-example wf-inquiry">${exampleCaption('An SMS inquiry')}
              <div class="wf-message"><span>PROSPECT &middot; EXAMPLE SMS</span><p>Is Elm Court's one-bedroom available next month?</p></div>
              <div class="wf-message wf-message-ai"><span>${icon('sparkles')} OOTLAAI &middot; ILLUSTRATED REPLY</span><p>When would you like to move and view? Staff will check availability.</p></div>
              <div class="wf-review-note">${icon('person')}<span>Preferences stay with the prospect. No message sent.</span></div>
            </figure>
          </article>
          <article class="public-feature">
            <span class="detail-kicker">02 / THE VIEWING</span><h3 id="leasing-viewing-heading">Arrange the viewing.</h3>
            <p>Match the home, requested time and agent. Google Calendar sync is optional.</p>
            ${aiValue('Gather preferences and prepare reminders from the recorded booking status.')}
            <figure class="public-example wf-viewing">${exampleCaption('A viewing request')}
              <div class="wf-visual-heading"><span class="wf-large-icon">${icon('calendar')}</span><div><h3>Elm Court &middot; Unit 14</h3><p>One-bedroom apartment</p></div></div>
              <div class="wf-date-card"><span class="wf-date-icon" aria-hidden="true">${icon('clock')}</span><div><span>REQUESTED TIME</span><strong>Thursday, 2:30 pm</strong><p>Prospect preference &middot; Example only</p></div></div>
              <dl class="wf-record-details"><div><dt>Viewing status</dt><dd>${status('Awaiting confirmation','amber')}</dd></div><div><dt>Invitation</dt><dd>Not sent</dd></div></dl>
              <p class="wf-example-note">A booking requires verified availability and satisfied scheduling rules.</p>
            </figure>
          </article>
          <article class="public-feature">
            <span class="detail-kicker">03 / THE APPLICATION</span><h3 id="leasing-application-heading">Keep applications moving.</h3>
            <p>Connect portal documents and review to the contact.</p>
            ${aiValue('Explain missing items and prepare document reminders.')}
            <figure class="public-example wf-application">${exampleCaption('An application checklist')}
              <ul class="wf-document-list"><li><span class="wf-document-icon">${icon('file')}</span><div><h4>Identity document</h4><p>Staff review still needed</p></div>${status('Received')}</li><li><span class="wf-document-icon">${icon('file')}</span><div><h4>Proof of income</h4><p>Applicant follow-up needed</p></div>${status('Awaiting file','amber')}</li><li><span class="wf-document-icon">${icon('shield')}</span><div><h4>Screening consent</h4><p>Approved provider and consent required</p></div>${status('Not requested','neutral')}</li></ul>
              <p class="wf-example-note">Screening requires consent, an approved provider and staff review.</p>
            </figure>
            ${link('/applicant/login', 'Open applicant sign in ' + icon('arrow'), 'text-link text-link-light')}
          </article>
          <article class="public-feature">
            <span class="detail-kicker">04 / STAFF REVIEW</span><h3>Ready for<br>staff review.</h3>
            <p>Keep review context together. Application progress stays visible on the lead.</p>
            ${aiValue('Summarize outstanding work. Staff decide applications; leased status requires a verified lease milestone.')}
            <figure class="public-example wf-history">${exampleCaption('A review handoff')}
              <ol class="wf-history-list"><li><span aria-hidden="true"></span><div><h4>Inquiry context gathered</h4><p>Property, unit and preferences connected.</p></div></li><li><span aria-hidden="true"></span><div><h4>Document gap identified</h4><p>Proof of income needs follow-up.</p></div></li><li class="wf-history-pending"><span aria-hidden="true"></span><div><h4>Staff review pending</h4><p>No decision or lease created.</p></div></li></ol>
              <p class="wf-example-note">Yardi remains authoritative for configured lease and resident records.</p>
            </figure>
          </article>
        </div>
      </div>
    </section>
    ${exploreSection()}
  </main>`;
}

export function residentSupportPage(): string {
  return `<main id="main-content" class="public-detail-page workflow-page resident-support-page public-refresh">
    <section class="detail-hero" data-public-section="intro" aria-labelledby="resident-support-heading">
      <div class="detail-container detail-hero-grid">
        <div><span class="detail-kicker">OOTLAAI / RESIDENT SUPPORT</span><h1 id="resident-support-heading">Listen to the request.<br>Keep people informed.</h1>
          <p>OotlaAI clarifies repair, renewal and payment questions with resident context.</p>
          <div class="public-channel-list" aria-label="Illustrated communication channels"><span>Resident SMS</span><span>Phone &amp; voice</span><span>AI responses</span></div>
          <div class="detail-hero-links"><a class="button button-primary" href="#resident-request">Follow a request ${icon('arrow')}</a>${link('/ai-workflows#ai-demonstrations', 'Try the AI examples', 'text-link')}</div>
          <span class="detail-preview-note">Explore resident requests and the team’s next steps using example records.</span>
        </div>
        ${publicPhoto('neighborhood')}
      </div>
    </section>
    <section id="resident-request" class="public-primary" data-public-section="main" aria-labelledby="resident-journey-heading">
      <div class="detail-container">
        <div class="public-primary-heading"><span class="detail-kicker">HELPFUL CONVERSATIONS. VISIBLE FOLLOW-THROUGH.</span><h2 id="resident-journey-heading">Every request.<br>A clear next step.</h2><p>AI gathers details. Staff assign work and confirm appointments.</p></div>
        <div class="public-feature-grid">
          <article class="public-feature">
            <span class="detail-kicker">01 / THE REQUEST</span><h3>Clarify the request.</h3>
            <p>Connect the issue, home and access preference.</p>
            ${aiValue('Clarify a property conversation. Prepare a task.')}
            <figure class="public-example wf-service-request">${exampleCaption('A bathroom fan request')}
              <div class="wf-message"><span>RESIDENT &middot; EXAMPLE SMS</span><p>My bathroom fan has stopped working.</p></div>
              <div class="wf-message wf-message-ai"><span>${icon('sparkles')} OOTLAAI &middot; ILLUSTRATED RESPONSE</span><p>Which bathroom is the fan in, and when would access be possible?</p></div>
              <div class="wf-request-header"><div><span>SERVICE REQUEST</span><h3>Bathroom fan not working</h3></div>${status('Awaiting assignment','amber')}</div>
              <dl class="wf-record-details"><div><dt>Requested access</dt><dd>Tomorrow, 10 am&ndash;noon</dd></div><div><dt>Technician appointment</dt><dd>Not scheduled</dd></div></dl>
              <p class="wf-example-note">Requested access is not a confirmed appointment.</p>
            </figure>
          </article>
          <article class="public-feature">
            <span class="detail-kicker">02 / ASSIGNMENT &amp; UPDATES</span><h3>Assign the work.<br>Prepare an update.</h3>
            <p>Staff assign the request. Updates reflect its recorded status.</p>
            ${aiValue('Flag unassigned work and prepare accurate SMS or call follow-ups.')}
            <figure class="public-example wf-history">${exampleCaption('A staff handoff and an update')}
              <ol class="wf-history-list"><li><span aria-hidden="true"></span><div><h4>Request details gathered</h4><p>Details ready for review.</p></div></li><li class="wf-history-pending"><span aria-hidden="true"></span><div><h4>Assignment still needed</h4><p>Staff assign and schedule.</p></div></li></ol>
              <div class="wf-update-draft"><span>${icon('message')} RESIDENT UPDATE &middot; UNSENT DRAFT</span><p>Fan request and access preference noted. Staff will review.</p></div>
              <p class="wf-example-note">Unsent draft. No assignment or appointment promised.</p>
            </figure>
          </article>
          <article class="public-feature">
            <span class="detail-kicker">03 / RENEWAL CONVERSATIONS</span><h3>Support renewals.</h3>
            <p>Connect renewal questions to lease and customer history.</p>
            ${aiValue('Flag upcoming renewals and prepare follow-ups using approved information.')}
            <figure class="public-example wf-renewal">${exampleCaption('A renewal follow-up')}
              <div class="wf-message"><span>RESIDENT QUESTION &middot; EXAMPLE</span><p>What are my options when my current lease ends?</p></div>
              <dl class="wf-record-details"><div><dt>Next action</dt><dd>Review the current lease record</dd></div><div><dt>Responsible team</dt><dd>Property management</dd></div><div><dt>Renewal terms</dt><dd>Awaiting staff review</dd></div></dl>
              <p class="wf-example-note">Staff decide renewals. AI cannot change leases; configured Yardi records remain authoritative.</p>
            </figure>
          </article>
          <article class="public-feature">
            <span class="detail-kicker">04 / PAYMENT QUESTIONS</span><h3 id="resident-payment-heading">Guide payment questions.</h3>
            <p>Use the existing provider. Show verified status.</p>
            ${aiValue('Guide the external handoff. Route account questions to staff.')}
            <figure class="public-example wf-payment">${exampleCaption('An existing-provider handoff')}
              <ol class="wf-provider-path"><li><span>${icon('message')}</span><div><h3>The resident asks</h3><p>Where can I make my payment?</p></div></li><li><span>${icon('link')}</span><div><h3>OotlaAI guides</h3><p>Use the approved external provider.</p></div></li><li><span>${icon('lock')}</span><div><h3>The provider handles payment</h3><p>Ootla does not authorize, capture, charge or refund payments.</p></div></li></ol>
              <p class="wf-example-note">Illustrative. No payment or status verified. Yardi retains accounting authority.</p>
            </figure>
            ${link('/integrations', 'Explore the integration paths ' + icon('arrow'), 'text-link text-link-light')}
          </article>
        </div>
      </div>
    </section>
    ${exploreSection()}
  </main>`;
}
