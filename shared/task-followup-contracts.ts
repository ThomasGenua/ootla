import {z} from 'zod';
const text=(max:number)=>z.string().trim().min(1).max(max).refine(v=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v));
export const followupDraftSchema=z.object({requestKey:z.uuid(),version:z.number().int().positive()}).strict();
export const followupSendSchema=z.object({requestKey:z.uuid(),version:z.number().int().positive(),draftId:z.uuid(),subject:text(200).refine(v=>!/[\r\n]/.test(v)),body:text(3000),confirm:z.literal(true),saveOnly:z.boolean().default(false)}).strict();
export const followupCommentSchema=z.object({requestKey:z.uuid(),version:z.number().int().positive(),body:text(2000),complete:z.boolean().default(false)}).strict();
export interface FollowupEmail {id:string;to:string;recipientName:string;subject:string;body:string;version:number;generation:'record_based'|'live';delivery:'preview'|'unavailable'}
export interface FollowupResult {version:number;eventId:string;state:'draft'|'preview_processed'|'comment_saved'|'completed';message:string;email?:FollowupEmail}
