import type {ServerConfig} from '../config/env.js';
import type {AuthUser} from '../../shared/contracts.js';
import type {TaskSuggestions,RecordSuggestion,TaskSuggestionResult,suggestionConfirmSchema} from '../../shared/task-suggestion-contracts.js';
import type {Database} from '../db/pool.js';
import type {z} from 'zod';
import {ApiError} from '../http/errors.js';
import {Tasks} from './tasks.js';
import {Leads} from './leads.js';
import {LeadWorkspaces} from './lead-workspace.js';
const at=(v:string)=>new Date(v).toLocaleString('en-GB',{timeZone:'UTC',dateStyle:'medium',timeStyle:'short'})+' UTC';
const staffName=(v:string)=>v==='Demo Administrator'?'Administrator':v;
const short=(v:unknown,n=400)=>String(v??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').slice(0,n);
/** Grounded native suggestions: structured CRM facts select actions, never instructions in customer text.
 * No inference provider, outbound transport or background execution runs from these endpoints.
 * Every confirmed mutation delegates to the domain service with current permissions and version locks.
 */
export class RecordSuggestions {
 constructor(private db:Database,private config?:ServerConfig){}
 async lead(u:AuthUser,id:string):Promise<TaskSuggestions>{
  const ws=await new LeadWorkspaces(this.db,this.config).detail(u,id,{timelinePage:1,tasksPage:1,documentsPage:1,pageSize:10});
  const l=ws.leadDetail.lead;
  const stats=(await this.db.query(`SELECT (SELECT count(*) FROM tasks WHERE organization_id=$1 AND lead_id=$2 AND status='open')::int AS open_tasks,(SELECT count(*) FROM tasks WHERE organization_id=$1 AND lead_id=$2 AND status='open' AND due_at<now())::int AS overdue_tasks,(SELECT count(*) FROM viewings WHERE organization_id=$1 AND lead_id=$2 AND status NOT IN('cancelled','no_show','completed') AND ends_at>now())::int AS upcoming_tours`,[u.organization.id,id])).rows[0];
  const pref=l.preferences,closed=['lost_closed','leased','won'].includes(l.stage);
  const context=[l.name+' · '+l.stageLabel+' · '+l.propertyName,'Owner: '+(l.owner?.name??'Unassigned'),'Next action: '+(l.nextAction||'Not set')+(l.nextActionAt?' · '+at(l.nextActionAt):''),'Preferences: '+[pref.bedrooms===null?'':pref.bedrooms+' bedrooms',pref.budgetMin===null?'':'Budget from '+pref.budgetMin,pref.budgetMax===null?'':'Budget up to '+pref.budgetMax,pref.locations.join(', '),pref.moveInOn?'Move-in '+pref.moveInOn:'',short(pref.requirements,500)].filter(Boolean).join(' · '),stats.open_tasks+' open tasks · '+stats.overdue_tasks+' overdue · '+stats.upcoming_tours+' upcoming viewings',ws.documents.total+' saved documents · '+ws.timeline.total+' activity events · '+ws.contact.households.length+' households',...(l.applicationSummary?['Application: '+l.applicationSummary.status]:[]),...(l.verifiedLeaseMilestone?['A lease milestone is recorded.']:[]),...(l.notes?['Staff notes: '+short(l.notes,700)]:[]),...ws.timeline.items.slice(0,3).map(e=>'Recent activity: '+short(e.title,100)+' · '+short(e.summary,250)),...ws.tasks.items.filter(t=>t.status==='open').slice(0,3).map(t=>'Task: '+short(t.title,200)+(t.details?' · '+short(t.details,300):''))];
  const actions:RecordSuggestion[]=[];
  const owner=ws.owners.find(o=>o.membershipId===u.membershipId)??ws.owners[0];
  if(!l.owner&&owner&&!closed)actions.push({id:'assign',kind:'assign',label:'Assign to '+staffName(owner.name),description:'This lead has no owner. '+staffName(owner.name)+' has access to its property interests.',ownerMembershipId:owner.membershipId});
  if(!closed&&!stats.upcoming_tours&&['new_inquiry','contacted','tour_scheduled','viewing_scheduled'].includes(l.stage))actions.push({id:'viewing',kind:'viewing',label:'Book a viewing',description:'No upcoming viewing is booked. Choose an available slot and confirm with the normal Calendar workflow.',url:'/admin/calendar?view=book&lead='+id});
  if(l.email&&!closed)actions.push({id:'email_draft',kind:'email_draft',label:'Prepare email to '+l.name,description:'Save a private follow-up draft for review. Nothing is sent.'});
  const task=ws.tasks.items.find(t=>t.status==='open');if(task)actions.push({id:'open_task',kind:'open',label:'Open '+short(task.title,100),description:'Review the task description, owner and due date before acting.',url:'/admin/tasks?task='+task.id});
  if(l.applicationSummary)actions.push({id:'open_application',kind:'open',label:'Review application',description:'Open the actual application checklist and staff review.',url:'/admin/applications?application='+l.applicationSummary.id});
  return {summary:closed?'Review the recorded outcome and any remaining operational tasks.':stats.overdue_tasks?'Prioritize the overdue follow-up before starting more work.':!l.owner?'Assign an owner so the next step has a clear person responsible.':stats.upcoming_tours?'A viewing is already on the calendar. Prepare the prospect and follow up afterwards.':'Move the recorded next step forward with the assigned agent.',context:context.filter(v=>!v.endsWith(': ')),actions,canManage:true,version:l.version};
 }
 async task(u:AuthUser,id:string):Promise<TaskSuggestions>{
  const tasks=new Tasks(this.db),{task:t}=await tasks.detail(u,id,{page:1,pageSize:1});
  const options=await tasks.options(u,t.propertyId,t.leadId??undefined);
  const context=[t.title,t.details||'No description recorded yet.',t.propertyName+(t.contactName?' · '+t.contactName:''),'Status: '+t.status+' · Priority: '+t.priority+' · Due '+at(t.dueAt),'Owner: '+(t.owner?.name??'Unassigned'),...(t.linkedRecord?['Linked '+t.linkedRecord.kind+': '+(t.linkedRecord.status??'Review required')]:[])];
  let lead:TaskSuggestions|null=null;
  if(t.leadId){lead=await this.lead(u,t.leadId);context.push(...lead.context);}
  const actions:RecordSuggestion[]=[];
  const owner=options.owners.find(o=>o.membershipId===u.membershipId)??options.owners[0];
  if(t.status==='open'&&!t.owner&&owner)actions.push({id:'assign',kind:'assign',label:'Assign to '+staffName(owner.name),description:'Give this task an eligible owner for the related property.',ownerMembershipId:owner.membershipId});
  const contact=t.contactId?(await this.db.query('SELECT email FROM contacts WHERE organization_id=$1 AND id=$2',[u.organization.id,t.contactId])).rows[0]:null;
  if(t.status==='open'&&t.actionable&&contact?.email)actions.push({id:'email_draft',kind:'email_draft',label:'Prepare email'+(t.contactName?' to '+t.contactName:''),description:'Save a follow-up draft in this task history for review. Nothing is sent.'});
  const viewing=lead?.actions.find(a=>a.kind==='viewing');if(t.status==='open'&&t.actionable&&viewing)actions.push(viewing);
  if(t.status==='open')actions.push({id:'complete',kind:'complete',label:'Complete with a comment',description:'Record what was done, confirm completion and cancel outstanding reminders.'});
  return {summary:t.status!=='open'?'This task is '+t.status+'. Its history remains available.':!t.actionable?'Review whether this task is still needed before closing it with a comment.':t.overdue?'This follow-up is overdue. Review the contact history and finish or reschedule it.':!t.owner?'Assign an owner before the due date.':'Follow the description and record the outcome when the work is finished.',context,actions,canManage:true,version:t.version};
 }
 private validate(s:TaskSuggestions,i:z.infer<typeof suggestionConfirmSchema>):RecordSuggestion{
  if(s.version!==i.version)throw new ApiError(409,'SUGGESTION_STALE','This record changed. Refresh the suggestions before acting.');
  const action=s.actions.find(a=>a.kind===i.action);if(!action)throw new ApiError(409,'SUGGESTION_UNAVAILABLE','This action is no longer appropriate for the current record.');
  if(i.action==='assign'&&(!i.ownerMembershipId||i.ownerMembershipId!==action.ownerMembershipId))throw new ApiError(400,'INVALID_OWNER','Confirm the eligible owner shown in the suggestion.');
  return action;
 }
 async confirmTask(u:AuthUser,id:string,i:z.infer<typeof suggestionConfirmSchema>):Promise<TaskSuggestionResult>{
  const action=this.validate(await this.task(u,id),i),tasks=new Tasks(this.db);
  if(i.action==='assign')return{task:await tasks.update(u,id,{version:i.version,ownerMembershipId:i.ownerMembershipId!}),message:'Task owner saved.'};
  if(i.action==='complete'){if(!i.comment?.trim())throw new ApiError(400,'COMPLETION_COMMENT_REQUIRED','Describe what was completed before confirming.');return{task:await tasks.update(u,id,{version:i.version,status:'completed',completionComment:i.comment}),message:'Task completed and comment saved.'};}
  if(i.action==='email_draft')return{draft:await tasks.saveEmailDraft(u,id,i.version),version:i.version+1,message:'Email draft saved for review. Nothing has been sent.'};
  return{url:action.url,message:'Choose a current slot and confirm the booking in Calendar.'};
 }
 async confirmLead(u:AuthUser,id:string,i:z.infer<typeof suggestionConfirmSchema>):Promise<TaskSuggestionResult>{
  const action=this.validate(await this.lead(u,id),i);
  if(i.action==='assign'){await new Leads(this.db).update(u,id,{version:i.version,ownerMembershipId:i.ownerMembershipId!});return{message:'Lead owner saved.'};}
  if(i.action==='email_draft')return{draft:await new LeadWorkspaces(this.db,this.config).saveEmailDraft(u,id,i.version),message:'Email draft saved for review. Nothing has been sent.'};
  return{url:action.url,message:'Choose a current slot and confirm the booking in Calendar.'};
 }
}
