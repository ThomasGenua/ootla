import { publicAccessCta, publicAccessHeroNote } from '../../shared/public-access';
import { icon, link, wordmark } from '../lib/ui';
import { homeDashboardPreview } from './home-preview';
import { publicWorkflow } from './public-workflow';
import { exploreSection, publicPhoto } from './public-layout';
import { publicFloatingIcons } from './public-decoration';

function exampleLabel(id: string, copy: string): string {
  return `<figcaption id="${id}" class="example-label"><span class="example-dot" aria-hidden="true"></span>${copy}<span class="example-tag">Example</span></figcaption>`;
}
function residentExample(): string {
  return `<figure class="product-example resident-example" aria-labelledby="resident-example-label">${exampleLabel('resident-example-label','A resident request')}<div class="example-context"><span class="example-avatar">AR</span><div><strong>Alex Rivera</strong><span>Willow House · Unit 204</span></div><span class="example-channel">SMS example</span></div><div class="message-bubble resident-message"><p>The tap in my kitchen is dripping. Could someone take a look?</p><span>Example message</span></div><div class="ai-reply"><div class="ai-reply-label">${icon('sparkles')} OotlaAI <span>Suggested reply</span></div><p>Thanks for letting us know, Alex. Could you share a photo and a convenient time for the property team to visit?</p><div class="reply-review">${icon('check')} Ready for staff review</div></div><p class="example-bottom-note">A clear request for your property team.</p></figure>`;
}
function reminderExample(): string {
  return `<figure class="product-example reminder-example" aria-labelledby="reminder-example-label">${exampleLabel('reminder-example-label','A clearer next step')}<div class="example-panel-title"><div><span>YOUR TEAM'S DAY</span><h3>A little nudge helps.</h3></div><span class="tiny-icon">${icon('tasks')}</span></div><div class="example-task"><span class="task-square" aria-hidden="true"></span><div><strong>Follow up on a new enquiry</strong><span>Casey Taylor · Maple Court</span></div><span class="task-due">Today</span></div><div class="example-task"><span class="task-square" aria-hidden="true"></span><div><strong>Review a document request</strong><span>Robin Lane · River Lofts</span></div><span class="task-due due-neutral">Pending</span></div><div class="example-task"><span class="task-square" aria-hidden="true"></span><div><strong>Prepare for tomorrow's viewing</strong><span>Willow House · Unit 204</span></div><span class="task-due due-neutral">Tomorrow</span></div><div class="reminder-note">${icon('sparkles')}<div><strong>Keep the conversation moving.</strong><p>OotlaAI highlights a promised follow-up and prepares the next staff action.</p></div></div><p class="example-bottom-note">Priorities stay with the people responsible.</p></figure>`;
}
function calendarExample(): string {
  return `<figure class="product-example calendar-example" aria-labelledby="calendar-example-label">${exampleLabel('calendar-example-label','Google Calendar viewing schedule')}<div class="calendar-example-header"><div><span>EXAMPLE WEEK</span><h3>Time to see the possibilities.</h3></div>${icon('calendar')}</div><div class="example-week" aria-label="Illustrative Monday to Friday schedule">${[['Mon','21'],['Tue','22'],['Wed','23'],['Thu','24'],['Fri','25']].map(([day,date],index)=>`<div class="${index===1?'example-day-active':''}"><span>${day}</span><strong>${date}</strong></div>`).join('')}</div><div class="calendar-time-row"><span>10:30</span><div class="calendar-appointment"><span class="appointment-line"></span><div><strong>Willow House viewing</strong><p>Unit 204 · Alex Rivera</p><small>10:30–11:00 · Example event</small></div>${icon('home')}</div></div><div class="calendar-time-row"><span>14:00</span><div class="calendar-appointment appointment-muted"><span class="appointment-line"></span><div><strong>Maple Court viewing</strong><p>Unit 12 · Casey Taylor</p><small>14:00–14:30 · Example event</small></div>${icon('home')}</div></div><p class="example-bottom-note">Example viewing schedule.</p></figure>`;
}
function applicationExample(): string {
  return `<figure class="product-example application-example" aria-labelledby="application-example-label">${exampleLabel('application-example-label','Applicant documents and review')}<div class="application-example-header"><span class="example-avatar avatar-warm">RL</span><div><h3>Robin Lane</h3><p>River Lofts · Example application</p></div><span class="status-pill status-warm">In progress</span></div><ol class="application-steps" aria-label="Example review progress"><li class="step-complete"><span>${icon('check')}</span>Received</li><li class="step-current"><span>2</span>Documents</li><li><span>3</span>Staff review</li></ol><div class="document-row"><span class="document-icon">${icon('file')}</span><div><strong>Identity document</strong><span>Example item</span></div><span class="status-pill">Received</span></div><div class="document-row"><span class="document-icon">${icon('file')}</span><div><strong>Proof of income</strong><span>Example item</span></div><span class="status-pill status-warm">Awaiting file</span></div><div class="review-boundary">${icon('shield')}<span>Staff review comes next. AI makes no applicant decision.</span></div><p class="example-bottom-note">A clear checklist for staff review.</p></figure>`;
}
function yardiExample(): string {
  return `<figure class="product-example yardi-example" aria-labelledby="yardi-example-label">${exampleLabel('yardi-example-label','A Yardi-ready approach')}<div class="system-connection"><div class="source-system"><span class="system-word">Yardi</span><span class="system-role">Source of truth</span></div><div class="connection-path" aria-hidden="true"><span></span>${icon('arrow')}<span></span></div><div class="ootla-system">${wordmark()}<span class="system-role">Customer workspace</span></div></div><div class="source-records"><span>Property</span><span>Lease</span><span>Resident</span><span>Accounting</span></div><div class="property-unit-example"><div>${icon('building')}<div><strong>Willow House</strong><span>Example property record</span></div></div><div>${icon('home')}<div><strong>Unit 204</strong><span>A separate unit record</span></div></div></div><div class="connection-status"><span></span>Property and unit records kept separate</div><p class="example-bottom-note">Example record ownership.</p></figure>`;
}
function importExample(): string {
  return `<figure class="product-example import-example" aria-labelledby="import-example-label">${exampleLabel('import-example-label','Your existing customer data')}<div class="import-file"><span class="file-sheet">${icon('file')}</span><div><strong>customers-example.csv</strong><span>Illustrative file · Not uploaded</span></div><span class="status-pill">Preview</span></div><div class="import-mapping"><div class="mapping-header"><span>YOUR FILE</span><span></span><span>OOTLA FIELD</span></div>${[['Customer','Contact name'],['Email','Email address'],['Building','Property']].map(([source,target])=>`<div class="mapping-row"><span>${source}</span>${icon('arrow')}<span>${target}</span></div>`).join('')}</div><div class="import-review"><span>${icon('check')}</span><div><strong>Review before saving.</strong><p>Check field matches and possible duplicates with your team.</p></div></div><p class="example-bottom-note">Review field mapping before importing.</p></figure>`;
}
const homeProcesses = [
  {
    key: 'resident', label: 'Resident requests', eyebrow: '01 / RESIDENT REQUESTS',
    heading: 'An answer that becomes a clear next step.',
    copy: 'OotlaAI helps gather repair details and prepare a service request with useful context for your property management team.',
    value: 'Staff take over when needed. Requested access is not a confirmed technician visit.',
    destination: '/workflows/resident-support', destinationLabel: 'Explore resident support',
    visual: residentExample
  },
  {
    key: 'reminders', label: 'Staff reminders', eyebrow: '02 / STAFF REMINDERS',
    heading: 'Turn a promise into work someone owns.',
    copy: 'OotlaAI highlights pending follow-ups, missing documents and upcoming viewings, helping staff turn conversations into tasks with clear owners.',
    value: 'Your team controls priorities and customer messages.',
    destination: '/ai-workflows', destinationLabel: 'Explore AI workflows',
    visual: reminderExample
  },
  {
    key: 'viewings', label: 'Viewings', eyebrow: '03 / VIEWINGS AND GOOGLE CALENDAR',
    heading: 'Move the conversation toward a viewing.',
    copy: "OotlaAI gathers viewing preferences and prepares scheduling context. Keep bookings with the lead, with optional authorized Google Calendar synchronization.",
    value: 'A requested time stays a request until the booking is confirmed.',
    destination: '/workflows/leasing', destinationLabel: 'Explore the leasing journey',
    visual: calendarExample
  },
  {
    key: 'applications', label: 'Applications', eyebrow: '04 / APPLICATIONS AND STAFF REVIEW',
    heading: 'Less chasing. More clarity for review.',
    copy: 'OotlaAI explains document requests and prepares review summaries. The applicant portal keeps submissions and progress together.',
    value: 'Screening needs consent, an approved provider and staff review. AI never approves or rejects applicants.',
    destination: '/applicant/login', destinationLabel: 'Applicant sign in',
    visual: applicationExample
  },
  {
    key: 'yardi', label: 'Yardi-ready records', eyebrow: '05 / YARDI-READY CONTEXT',
    heading: 'Helpful answers start with trusted records.',
    copy: "OotlaAI can prepare replies from verified property context. Keep separate property and unit records, with availability sources and verification times.",
    value: "Yardi stays authoritative for the records it manages. Keep your team’s work connected to the right source.",
    destination: '/integrations', destinationLabel: 'Explore the integration approach',
    visual: yardiExample
  },
  {
    key: 'import', label: 'Bring your history', eyebrow: '06 / START WITHOUT YARDI',
    heading: 'Bring your customer history into the conversation.',
    copy: 'Import contacts, properties, units and leads into one CRM. OotlaAI uses your reviewed history to help prepare replies and next steps.',
    value: 'Review uncertain matches. A name alone never merges contacts.',
    destination: '/integrations', destinationLabel: 'Explore standalone onboarding',
    visual: importExample
  }
];

function homeProcessSections(): string {
  const sectionIds = ['ootlaai-processes', 'staff-reminders', 'viewing-calendar', 'applicant-review', 'yardi-ready', 'standalone-import'];
  return homeProcesses.map((process, index) => {
    const visualFirst = index % 2 === 1;
    const photo = process.key === 'resident' ? 'residentPhone' : process.key === 'viewings' ? 'propertyTeam' : null;
    const floatingIcon = process.key === 'reminders' ? 'bell' : process.key === 'applications' ? 'file' : process.key === 'import' ? 'sparkles' : null;
    const visual = photo
      ? `<div class="home-story-media">${publicPhoto(photo)}<div class="home-story-product">${process.visual()}</div><span class="home-photo-icon home-photo-icon-one" aria-hidden="true">${icon(process.key === 'resident' ? 'message' : 'calendar')}</span><span class="home-photo-icon home-photo-icon-two" aria-hidden="true">${icon(process.key === 'resident' ? 'sparkles' : 'home')}</span></div>`
      : floatingIcon ? `<div class="public-floating-visual">${process.visual()}${publicFloatingIcons([floatingIcon])}</div>` : process.visual();
    const channels = index === 0
      ? `<ul class="public-channel-list" aria-label="Illustrative OotlaAI communication channels"><li>${icon('message')} Resident conversations</li><li>${icon('person')} Staff handoffs</li><li>${icon('sparkles')} AI assistance</li></ul>`
      : '';
    const copy = `<div class="story-copy">${index === 0 ? '<span id="resident-ai" aria-hidden="true"></span>' : ''}<span class="eyebrow">${process.eyebrow}</span><h2 id="${process.key}-heading">${process.heading}</h2><p>${process.copy}</p>${channels}<p class="public-ai-value">${process.value}</p>${link(process.destination, `${process.destinationLabel} ${icon('arrow')}`, 'text-link')}</div>`;
    return `<section id="${sectionIds[index]}" class="home-band home-band-${visualFirst ? 'light' : 'dark'}" data-home-process-section="${process.key}" aria-labelledby="${process.key}-heading"><div class="home-container story-layout${visualFirst ? ' story-visual-first' : ''}">${visualFirst ? visual + copy : copy + visual}</div></section>`;
  }).join('');
}

export function homePage(): string {
  return `<main id="main-content" class="home-page public-refresh">
    <section class="home-hero" data-public-section="intro" aria-labelledby="home-heading">
      <div class="home-container hero-layout"><div class="hero-copy">
        <span class="hero-kicker"><span></span> REAL ESTATE AI ASSISTANT</span>
        <h1 id="home-heading">Keep leads moving. <span>Keep people informed.</span></h1>
        <p>OotlaAI brings real estate leads, leasing and resident support into one clear workspace.</p>
        <div class="hero-actions">${publicAccessCta('button button-primary', ' '+icon('arrow'))}<a href="#ootlaai-processes" class="text-link">See OotlaAI at work ${icon('arrow')}</a></div>
        <div class="hero-footnote"><span class="hero-note-mark">${icon('shield')}</span>${publicAccessHeroNote()}</div>
      </div></div>
      <div class="hero-preview-area"><div class="hero-preview-glow" aria-hidden="true"></div>${homeDashboardPreview()}</div>
      <span class="floating-icon floating-calendar" aria-hidden="true">${icon('calendar')}</span><span class="floating-icon floating-home" aria-hidden="true">${icon('home')}</span><span class="floating-icon floating-ai" aria-hidden="true">${icon('sparkles')}</span>
    </section>
    ${homeProcessSections()}
    ${publicWorkflow()}
    ${exploreSection()}
  </main>`;
}
