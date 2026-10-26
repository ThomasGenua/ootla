import { icon, link } from '../lib/ui';
import { aiDemonstrations } from './ai-demo';
import { exploreSection } from './public-layout';

export function aiWorkflowsPage(): string {
  return `<main id="main-content" class="public-detail-page ai-workflows-page public-refresh">
    <section class="detail-hero" data-public-section="intro" aria-labelledby="ai-workflows-heading">
      <div class="detail-container detail-hero-grid">
        <div>
          <span class="detail-kicker">OOTLAAI / CONVERSATIONS THAT MOVE WORK FORWARD</span>
          <h1 id="ai-workflows-heading">A helpful reply.<br>A useful next step.</h1>
          <p>OotlaAI brings property questions, connected records and staff next steps into one conversation.</p>
          <div class="public-channel-list" aria-label="Illustrated communication channels"><span>Property questions</span><span>Staff handoffs</span><span>AI assistance</span></div>
          <div class="detail-hero-links"><a href="#ai-demonstrations" class="button button-primary">Try the scenarios ${icon('arrow')}</a>${link('/try','Try Ootla', 'text-link')}</div>
          <span class="detail-preview-note">Explore three example conversations and the work that follows.</span>
        </div>
        <div class="ai-intro-visual" aria-label="Illustrated conversation, request and staff handoff">
          <span class="public-example-label">ONE CONVERSATION, CONNECTED WORK</span>
          <div class="ai-intro-node"><span>${icon('message')}</span><div><strong>A question comes in</strong><p>Start with a property question.</p></div></div>
          <div class="ai-intro-line" aria-hidden="true"></div>
          <div class="ai-intro-node"><span>${icon('sparkles')}</span><div><strong>OotlaAI brings the context</strong><p>Clarify details. Prepare a reply.</p></div></div>
          <div class="ai-intro-line" aria-hidden="true"></div>
          <div class="ai-intro-node"><span>${icon('person')}</span><div><strong>The team sees the next action</strong><p>An owner, task and history.</p></div></div>
          <span class="ai-intro-caption">Illustrated workflow &middot; No real records created</span>
        </div>
      </div>
    </section>
    <section class="public-primary" data-public-section="main" aria-labelledby="ai-examples-heading">
      <div class="detail-container">
        <div class="public-primary-heading">
          <span class="detail-kicker">LESS CHASING. MORE FOLLOW-THROUGH.</span>
          <h2 id="ai-examples-heading">See what OotlaAI adds<br>at every next step.</h2>
          <p>Try three examples: the response, resulting work and staff handoff.</p>
        </div>
        ${aiDemonstrations()}
        <div class="public-feature-grid">
          <article class="public-feature">
            <span class="detail-kicker">RESIDENT REQUESTS</span>
            <h3>A reply becomes a request.</h3>
            <p>OotlaAI clarifies the issue and access preference, then prepares a service request and staff task.</p>
            <p class="public-ai-value">${icon('sparkles')} <span><strong>Staff confirm the visit.</strong> Requested access is not a technician appointment.</span></p>
          </article>
          <article class="public-feature">
            <span class="detail-kicker">STAFF REMINDERS</span>
            <h3>Pending work gets attention.</h3>
            <p>OotlaAI highlights callbacks, missing documents and unassigned work, with an owner and next action.</p>
            <p class="public-ai-value">${icon('sparkles')} <span><strong>AI prepares follow-ups.</strong> Staff review sensitive actions and decide applications.</span></p>
          </article>
          <article class="public-feature">
            <span class="detail-kicker">PROSPECT VIEWINGS</span>
            <h3>Interest turns into a next step.</h3>
            <p>OotlaAI brings together budget, bedrooms, move-in preferences and a viewing request.</p>
            <p class="public-ai-value">${icon('sparkles')} <span><strong>A request, then confirmation.</strong> Availability and scheduling rules govern booking.</span></p>
          </article>
          <article class="public-feature">
            <span class="detail-kicker">HUMAN HANDOFF &amp; HISTORY</span>
            <h3>The context stays with the work.</h3>
            <p>Questions, details and action history stay together, so staff can take over without starting again.</p>
            <div class="detail-hero-links">${link('/workflows/leasing', 'Explore leasing ' + icon('arrow'), 'text-link text-link-light')}${link('/workflows/resident-support', 'Explore resident support ' + icon('arrow'), 'text-link text-link-light')}</div>
          </article>
        </div>
      </div>
    </section>
    ${exploreSection()}
  </main>`;
}
