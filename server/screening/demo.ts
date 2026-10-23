import type { ScreeningAdapter } from './adapter.js';
/** Synthetic provider content remains separate from CRM application, consent and staff decision state. */
export const demoScreeningAdapter:ScreeningAdapter={
 key:'ootla_screening_demo',mode:'demo',label:'Isolated synthetic screening provider',
 nextStatus:current=>current==='submitted'?'provider_reviewing':'report_received',
 report:()=>Buffer.from('OOTLA SCREENING DEMONSTRATION\nSynthetic provider report received.\nNo live credit, background or identity search was performed.\nNo score, eligibility threshold or application decision is supplied.\nAuthorized staff must review and record their own decision.\n','utf8')
};
