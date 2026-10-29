// Presentation only: recognize shipped scaffold text without rewriting stored records or customer content.
const recordNames: Readonly<Record<string, string>> = {
  'Demo Administrator':'Administrator',
  'Ootla Demo':'Ootla workspace',
  'Ootla Standalone Demo':'Standalone workspace',
  'Simulator Cedar Court':'Cedar Court',
  'Taylor Morgan — synthetic voice inquiry':'Taylor Morgan',
  'Harbor View — conversation demo': 'Harbor View',
  'Harbor View demo team': 'Harbor View team',
  'Harbor View demo reception': 'Harbor View reception',
  'Demo 101': '101',
  'Cedar Courtyard - resident demo': 'Cedar Courtyard',
  'City neighbourhoods - showcase': 'City neighbourhoods',
};
const recordCopy: Readonly<Record<string, string>> = {
  'Simulated communication example':'Communication note',
  'Simulated: Maya requested a Harbor House viewing. No calendar invitation was sent.':'Maya requested a Harbor House viewing. Awaiting booking confirmation.',
  'Simulated: a follow-up reminder was prepared for Jordan. No email or SMS was sent.':'Follow-up reminder prepared for Jordan.',
  "Simulated: Priya's sales enquiry is ready for staff review. No screening or payment request was made.":"Priya's sales inquiry is ready for staff review.",
  'Demo City':'City',

  'Synthetic demo viewing record; not a live calendar booking.': 'Viewing requested. Confirm the date and staff availability before booking.',
  'Synthetic showcase record. Saved CRM data can be edited normally; no real customer or external communication is involved.': 'Review the contact details, property preferences and next action.',
  'Saved showcase work. Complete, reassign or change it through the normal task workflow.': 'Complete this follow-up or update its assignment and due date.',
  'Illustrative private staff note: confirm stated budget, move-in date and property preferences before the next action.': 'Confirm the stated budget, move-in date and property preferences before the next action.',
  'Illustrative call log: Avery asked about available one-bedroom homes. No real phone call was made.': 'Call note: Avery asked about available one-bedroom homes. No call was placed by Ootla.',
  'Synthetic demo lease milestone - no real signature': 'Lease milestone recorded; no external signature was verified.',
  'Synthetic completed lease example': 'Lease completion recorded in this workspace.',
  'Synthetic demo signed lease evidence only': 'Recorded lease evidence; external signature verification unavailable.',
  'Synthetic staff-reviewed showcase decision. No real applicant was approved or screened.': 'Staff review recorded in this workspace; no external screening was performed.',
  'My bathroom fan has stopped working. This is an illustrative resident request.': 'My bathroom fan has stopped working.',
  'Illustrative request saved. Awaiting staff assignment; access preference is not an appointment.': 'Request saved. Awaiting staff assignment; requested access is not an appointment.',
  'Cedar House reception - illustrative viewing': 'Cedar House reception',
  'Synthetic address - demonstration only': 'Address awaiting confirmation',
  'Synthetic waterfront example': 'Waterfront property',
  '12 Cedar Walk - illustrative address': '12 Cedar Walk',
  '8 Grove Road - illustrative address': '8 Grove Road',
  'Example history': 'Activity history',
  'Synthetic demo lead. Looking for a one-bedroom home near transit; prefers a weekday viewing.': 'Looking for a one-bedroom home near transit; prefers a weekday viewing.',
  'Synthetic demo lead. Interested in a three-bedroom townhome and a flexible move-in date.': 'Interested in a three-bedroom townhome and a flexible move-in date.',
  'Synthetic demo sales enquiry. Staff should discuss availability and next steps; no approval decision has been made.': 'Sales inquiry. Discuss availability and next steps; no approval decision has been made.',
  'Public demo viewing guidance': 'Viewing guidance',
  'Public demo property information': 'Property information',
  'Viewings last 30 minutes at the demo reception. Use Show viewing options for current slots, then confirm your choice. A slot is booked only after the normal scheduling service succeeds.': 'Viewings last 30 minutes at reception. Choose a current available time and confirm it to book.',
  'Harbor View is a synthetic property used only for an isolated Ootla demonstration. Its example unit has two bedrooms. Ask staff to verify current availability and application requirements; no rent concession, approval or payment is offered.': 'Harbor View offers a two-bedroom home. Ask staff to verify current availability and application requirements.',
};
export function presentRecordName(value: string): string { return recordNames[value] ?? value; }
export function presentRecordText(value: string): string {
  const known = recordCopy[value] ?? recordNames[value];
  if (known !== undefined) return known;
  const administrator=/^(Owner: |Assign to |Recorded by |Updated by )Demo Administrator$/.exec(value);
  if(administrator)return administrator[1]+'Administrator';
  const household=/^(Avery Brooks|Noah Patel|Leila Morgan|Ethan Lewis|Sofia Ahmed|Ben Carter|Alex Taylor|Riley Williams) - illustrative household$/.exec(value);
  if(household)return household[1]+' household';
  if(value==='A quiet home with good transport access. Illustrative preferences supplied by the customer.')return 'A quiet home with good transport access.';
  if(value==='Identity document - example only')return 'Identity document';
  if(value==='Supporting document - example only')return 'Supporting document';
  if(value.startsWith('Synthetic lead. ')){
    const recognized=recordCopy['Synthetic demo lead. '+value.slice('Synthetic lead. '.length)];if(recognized)return recognized;
  }
  if (/^Synthetic supporting example [12]\.txt$/.test(value)) return value.replace('Synthetic supporting example ', 'Supporting document ');
  if (/^Illustrative preferences - (?:Avery Brooks|Noah Patel|Leila Morgan|Ethan Lewis|Sofia Ahmed|Ben Carter|Alex Taylor|Riley Williams)\.txt$/.test(value)) return value.replace('Illustrative preferences - ', 'Property preferences - ');
  const application = /^Illustrative (draft|submitted|staff review|approved) application\. Staff can review private example files\. No real applicant consent or external decision was created\.$/.exec(value);
  if (application) return 'Application '+application[1]+'. Review the saved details and supporting files; consent must be recorded separately.';
  const prefixed=/^(Staff notes: |Recent activity: |Task: )(.*)$/s.exec(value);
  if(prefixed){const inner=presentRecordText(prefixed[2]);return prefixed[1]+inner;}
  if(value.includes(' · '))return value.split(' · ').map(part=>presentRecordText(part)).join(' · ');
  return value;
}
