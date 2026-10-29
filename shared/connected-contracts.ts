import {z} from 'zod';
export const attentionQuery=z.object({page:z.coerce.number().int().min(1).max(100000).default(1),owner:z.enum(['all','mine','unassigned']).default('all'),kind:z.enum(['all','inquiry','task','application','resident','mention','maintenance','renewal','vacancy','waitlist']).default('all')}).strict();
export const noteSchema=z.object({requestKey:z.uuid(),body:z.string().trim().min(1).max(5000).refine(v=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)),mentions:z.array(z.uuid()).max(10).refine(v=>new Set(v).size===v.length).default([])}).strict();
export const timingSchema=z.object({version:z.number().int().positive(),snoozedUntil:z.iso.datetime({offset:true}).nullable(),responseDueAt:z.iso.datetime({offset:true}).nullable()}).strict();
export const composerSchema=z.object({clientId:z.uuid(),release:z.boolean().default(false)}).strict();
