import { icon } from '../lib/ui';

const steps = [
  {
    title: 'Enquiry received',
    heading: 'Start with a little context.',
    copy: 'A new prospect asks about a home. Their question, preferred move-in date and property stay together, ready for a thoughtful reply.',
    note: 'One customer record. A clear next step.'
  },
  {
    title: 'Viewing arranged',
    heading: 'Make room for a real conversation.',
    copy: 'Staff agree a suitable time and bring the viewing details into their schedule. Everyone can see what happens next.',
    note: 'A shared plan, with your team in control.'
  },
  {
    title: 'Staff review',
    heading: 'Keep the decision with people.',
    copy: 'Documents and outstanding questions are brought together for an authorized member of staff. AI can help organize the context; the team reviews the application.',
    note: 'Helpful preparation. Human review.'
  }
];

function enquiryPanel(): string {
  return `<div class="workflow-panel-top"><span class="workflow-panel-icon">${icon('message')}</span><span class="workflow-state-label">New enquiry</span></div>
    <div class="workflow-person"><span class="workflow-person-avatar">AM</span><div><h4>Alex Morgan</h4><p>Looking for a two-bedroom home</p></div></div>
    <p class="workflow-example-message">“Could I take a look around on Saturday?”</p>
    <div class="workflow-context-row">${icon('home')}<span>Cedar Court <span aria-hidden="true">·</span> Unit 204</span></div>
    <div class="workflow-next-step"><span>Next step</span><strong>Confirm a suitable viewing time</strong></div>`;
}

function viewingPanel(): string {
  return `<div class="workflow-panel-top"><span class="workflow-panel-icon">${icon('calendar')}</span><span class="workflow-state-label">Viewing arranged</span></div>
    <div class="workflow-calendar-date"><span>SAT</span><strong>24</strong><span>OCTOBER · EXAMPLE DATE</span></div>
    <div class="workflow-viewing"><span class="workflow-viewing-line" aria-hidden="true"></span><div><p>10:30–11:00</p><h4>Alex’s viewing</h4><p>Cedar Court · Unit 204</p></div>${icon('check')}</div>
    <div class="workflow-next-step"><span>Next step</span><strong>Welcome Alex at the property</strong></div>`;
}

function reviewPanel(): string {
  return `<div class="workflow-panel-top"><span class="workflow-panel-icon">${icon('file')}</span><span class="workflow-state-label">Staff review</span></div>
    <div class="workflow-person"><span class="workflow-person-avatar">AM</span><div><h4>Alex’s application</h4><p>Documents gathered for review</p></div></div>
    <ul class="workflow-document-list"><li>${icon('check')}<span>Identity document</span><small>Received</small></li><li>${icon('check')}<span>Proof of income</span><small>Received</small></li><li>${icon('clock')}<span>Staff review</span><small>Pending</small></li></ul>
    <div class="workflow-next-step"><span>Next step</span><strong>An authorized staff member reviews</strong></div>`;
}

export function publicWorkflow(): string {
  const panels = [enquiryPanel(), viewingPanel(), reviewPanel()];
  return `<section id="workflow" class="home-workflow home-band home-band-dark" aria-labelledby="workflow-heading" data-workflow-active="0" data-workflow-motion="manual">
    <div class="workflow-container">
      <div class="workflow-intro"><span class="workflow-kicker">A CLEARER NEXT STEP</span><h2 id="workflow-heading">A little progress.<br>A connected journey.</h2><p>From the first question to staff review, keep the useful details close.</p></div>
      <div class="workflow-layout">
        <ol class="workflow-story">${steps.map((step, index) => `<li class="workflow-story-step" data-workflow-step="${index}"><span class="workflow-step-number" aria-hidden="true">0${index + 1}</span><div><span class="workflow-step-eyebrow">${step.title}</span><h3>${step.heading}</h3><p>${step.copy}</p><span class="workflow-story-note">${step.note}</span></div></li>`).join('')}</ol>
        <div class="workflow-stage">
          <div class="workflow-example-label"><span></span>Example workflow</div>
          <div class="workflow-controls" role="group" aria-label="Choose an example workflow step">${steps.map((step, index) => `<button type="button" class="workflow-control" data-workflow-select="${index}" aria-pressed="${index === 0}" aria-controls="workflow-panel-${index}" aria-label="Show step ${index + 1}: ${step.title}"><span class="workflow-control-number">${index + 1}</span><span>${step.title}</span></button>`).join('')}</div>
          <div class="workflow-preview">${panels.map((panel, index) => `<div id="workflow-panel-${index}" class="workflow-panel" data-workflow-panel="${index}" role="group" aria-label="Example: ${steps[index]!.title}" ${index === 0 ? '' : 'hidden'}>${panel}</div>`).join('')}</div>
          <p class="workflow-example-note">Illustrative interface. No messages, invitations or decisions are sent.</p>
          <p class="workflow-motion-note" data-workflow-motion-note>Choose a step to explore the example.</p>
          <p class="workflow-announcement" data-workflow-announcement role="status" aria-live="polite" aria-atomic="true"></p>
        </div>
      </div>
    </div>
  </section>`;
}
