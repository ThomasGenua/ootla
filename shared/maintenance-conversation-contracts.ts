import {z} from 'zod';
const id=z.uuid();
const body=z.string().max(4000).refine(value=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value));
export const maintenanceConversationChannel=z.enum(['resident_portal','email']);
export const maintenanceConversationQuerySchema=z.object({before:id.optional(),after:id.optional()}).strict().refine(value=>!(value.before&&value.after),'Choose one conversation cursor.');
export const maintenanceConversationDraftSchema=z.object({requestKey:id,body,channel:maintenanceConversationChannel,version:z.number().int().min(0)}).strict();
export const maintenanceConversationReplySchema=z.object({requestKey:id,body:body.refine(value=>value.trim().length>0,'Enter a reply.'),channel:maintenanceConversationChannel,draftVersion:z.number().int().min(0),retryMessageId:id.optional()}).strict();
export interface MaintenanceConversationDraft{body:string;channel:'resident_portal'|'email';version:number}
export interface MaintenanceConversationMessage{id:string;actorKind:'resident'|'staff'|'system';actorName:string;body:string;createdAt:string;channel:'resident_portal'|'email';state:'received'|'queued'|'available_in_portal'|'failed'|'sent'|'delivered'|'cancelled';canRetry:boolean}
export interface MaintenanceConversation{requestId:string;threadId:string;resident:{name:string;email:string|null};access:{canReply:boolean};transport:{portal:{available:boolean;reason?:string};email:{available:false;reason:string}};messages:{items:MaintenanceConversationMessage[];hasOlder:boolean;olderCursor:string|null;newerCursor:string|null;hasNewer:boolean;stateUpdates:MaintenanceConversationMessage[]};draft:MaintenanceConversationDraft|null}
export interface MaintenanceConversationReplyResult{message:MaintenanceConversationMessage;draft:MaintenanceConversationDraft|null}
