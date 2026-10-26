import {z} from 'zod';
import {organizationAdminPageSchema} from './organization-admin-contracts.js';
const text=(n:number)=>z.string().trim().max(n).refine(v=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v));
export const propertyDocumentQuerySchema=organizationAdminPageSchema.extend({propertyId:z.uuid(),status:z.enum(['all','draft','approved','retired']).default('all')}).strict();
export const propertyDocumentUploadSchema=z.object({requestKey:z.uuid(),propertyId:z.uuid(),name:text(180).min(1)}).strict();
export const propertyDocumentReviewSchema=z.object({requestKey:z.uuid(),version:z.number().int().positive(),title:text(160).min(1),reviewedText:text(4000),status:z.enum(['draft','approved','retired']),publicEnabled:z.boolean().default(false),reviewed:z.boolean().default(false)}).strict().refine(v=>v.status!=='approved'||v.reviewed&&v.reviewedText.length>0);
export interface PropertyDocument{id:string;propertyId:string;propertyName:string;name:string;mediaType:string;sizeBytes:number;title:string;reviewedText:string;status:'draft'|'approved'|'retired';publicEnabled:boolean;knowledgeId:string|null;version:number;createdAt:string;updatedAt:string;approvedAt:string|null;retentionExpired:boolean;downloadUrl:string;indexState:'manual_review_required'|'reviewed_text_only'|'retired';notice:string}
