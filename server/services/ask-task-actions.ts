import {z} from 'zod';
import type {PoolClient} from 'pg';
import type {AuthUser} from '../../shared/contracts.js';
import type {AskAction,AskRecordReference} from '../../shared/conversation-contracts.js';
import {taskUpdateSchema} from '../../shared/task-contracts.js';
import type {Database} from '../db/pool.js';
import type {ServerConfig} from '../config/env.js';
import {ApiError} from '../http/errors.js';
import {staffOrganizationAccess} from './application-access.js';
import {Tasks} from './tasks.js';

const previewSchema=z.object({title:z.string().min(1).max(300),dueAt:z.iso.datetime({offset:true}),priority:z.enum(['low','normal','high','urgent']),propertyId:z.uuid(),taskId:z.uuid(),version:z.number().int().positive(),ownerMembershipId:z.uuid().nullable().optional(),ownerName:z.string().max(200).optional(),status:z.enum(['open','completed','cancelled']).optional(),completionComment:z.string().max(2000).optional(),context:z.unknown().optional()}).strict();
const command=/\b(?:assign|reassign|complete|close|finish|cancel|reopen|priority|mark\b.{0,60}\b(?:done|complete))\b/i;

/** Preview only. All target/owner names come from the existing authorized task services. */
export async function proposeAskTaskUpdate(c:PoolClient,db:Database,config:ServerConfig,u:AuthUser,digest:string,message:string,reference:AskRecordReference):Promise<{preview:AskAction['preview'];summary:string}>{
 const actor=await staffOrganizationAccess(c,config,u,digest,{permission:'leasing.manage'});
 if(reference.kind!=='task'||!command.test(message))throw new ApiError(400,'ASK_TASK_CHANGE_REQUIRED','Choose a task and ask to assign it, change its priority, complete it, cancel it or reopen it.');
 const {task}=await new Tasks(db).detail(actor,reference.id,{page:1,pageSize:1});
 if(reference.propertyId&&reference.propertyId!==task.propertyId)throw new ApiError(404,'ASK_TASK_UNAVAILABLE','That task could not be found.');
 const preview:AskAction['preview']={title:task.title,dueAt:task.dueAt,priority:task.priority,propertyId:task.propertyId,taskId:task.id,version:task.version};
 if(/\b(?:assign|reassign)\b/i.test(message)){
  const requested=message.match(/\b(?:assign|reassign)\b[\s\S]*?\bto\s+(.+?)(?:[.!?]|$)/i)?.[1]?.trim().replace(/^["']|["']$/g,'').replace(/\s+please$/i,'').trim();
  if(!requested)throw new ApiError(400,'ASK_TASK_OWNER_REQUIRED','Who should own this task? You can say assign it to me, or use a staff member’s full name.');
  const search=/^(?:me|myself)$/i.test(requested)?actor.name:requested;
  const options=await new Tasks(db).options(actor,task.propertyId,task.leadId??undefined,search);
  if(options.ownerTotal>options.owners.length)throw new ApiError(400,'ASK_TASK_OWNER_TOO_BROAD','Please use the staff member’s full name to narrow the assignment.');
  const exact=options.owners.filter(owner=>/^(?:me|myself)$/i.test(requested)?owner.membershipId===actor.membershipId:owner.name.toLocaleLowerCase()===search.toLocaleLowerCase());
  const matches=exact.length?exact:options.owners.filter(owner=>owner.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  if(matches.length!==1)throw new ApiError(400,'ASK_TASK_OWNER_UNRESOLVED',matches.length?'Which staff member did you mean: '+matches.slice(0,3).map(owner=>owner.name).join(', ')+'? Please use their full name.':'No matching staff member is available for this task.');
  preview.ownerMembershipId=matches[0]!.membershipId;preview.ownerName=matches[0]!.name;
  return{preview,summary:'Review assigning “'+task.title+'” to '+preview.ownerName+'. Nothing has changed yet.'};
 }
 if(/\b(?:reopen)\b/i.test(message))preview.status='open';
 else if(/\b(?:cancel)\b/i.test(message))preview.status='cancelled';
 else if(/\b(?:complete|close|finish|done)\b/i.test(message)){
  preview.status='completed';const comment=message.match(/\b(?:comment|comments|note)\s*:\s*([\s\S]+)$/i)?.[1]?.trim();if(comment)preview.completionComment=comment.slice(0,2000);
 }else{
  const named=[...new Set([...message.matchAll(/\b(urgent|high|normal|low)\b/ig)].map(match=>match[1]!.toLowerCase()))];
  const priority=message.match(/\b(?:to|as)\s+(?:a\s+)?(urgent|high|normal|low)\b/i)?.[1]?.toLowerCase()??(named.length===1?named[0]:undefined);
  if(!priority)throw new ApiError(400,'ASK_TASK_PRIORITY_REQUIRED','Which priority should this task have: Low, Normal, High or Urgent?');
  preview.priority=priority;
 }
 return{preview,summary:'Review '+(preview.status==='completed'?'completing':preview.status==='cancelled'?'cancelling':preview.status==='open'?'reopening':'changing the priority of')+' “'+task.title+'”. Nothing has changed yet.'};
}

/** Called only inside the existing locked Ask confirmation transaction; never from model arguments. */
export async function executeAskTaskUpdate(c:PoolClient,db:Database,config:ServerConfig,u:AuthUser,digest:string,input:AskAction['preview']):Promise<{taskId:string;url:string;body:string}>{
 const actor=await staffOrganizationAccess(c,config,u,digest,{permission:'leasing.manage'}),preview=previewSchema.parse(input);
 const selected=(await c.query('SELECT property_id FROM tasks WHERE organization_id=$1 AND id=$2 FOR UPDATE',[actor.organization.id,preview.taskId])).rows[0];
 if(!selected||selected.property_id!==preview.propertyId)throw new ApiError(404,'ASK_TASK_UNAVAILABLE','That task could not be found.');
 const update=taskUpdateSchema.parse({version:preview.version,...preview.ownerMembershipId!==undefined?{ownerMembershipId:preview.ownerMembershipId,assignment:'manual'}:preview.status?{status:preview.status,...preview.completionComment!==undefined?{completionComment:preview.completionComment}:{}}:{priority:preview.priority}});
 const task=await new Tasks(db).updateLinked(c,actor,preview.taskId,update);
 return{taskId:task.id,url:'/admin/tasks?task='+task.id,body:preview.ownerMembershipId!==undefined?'The task assignment was saved.':preview.status==='completed'?'The task was completed.':preview.status==='cancelled'?'The task was cancelled.':preview.status==='open'?'The task was reopened.':'The task priority was updated.'};
}
