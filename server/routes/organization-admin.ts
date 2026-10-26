import {Router,raw,type Request,type Response,type RequestHandler} from 'express';
import {z} from 'zod';
import type {AuthUser} from '../../shared/contracts.js';
import {organizationAdminPageSchema,organizationAdminOptionsSchema,organizationSettingsSchema,organizationAiPolicySchema,organizationStaffCreateSchema,organizationGroupSchema,organizationPropertyGroupSchema,organizationKnowledgeQuerySchema,organizationKnowledgeSchema,organizationLeadRoutingSchema,organizationLeadRoutingQuerySchema} from '../../shared/organization-admin-contracts.js';
import type {ServerConfig} from '../config/env.js';
import type {Database} from '../db/pool.js';
import {ApiError} from '../http/errors.js';
import {protectOrigin} from '../middleware/security.js';
import {readSessionDigest} from '../services/sessions.js';
import {OrganizationAdminService} from '../services/organization-admin.js';
import {PropertyDocuments} from '../services/property-documents.js';
import {propertyDocumentQuerySchema,propertyDocumentUploadSchema,propertyDocumentReviewSchema} from '../../shared/property-document-contracts.js';
const actor=(s:Response)=>s.locals.user as AuthUser;
function parse<T>(schema:z.ZodType<T>,v:unknown):T{const p=schema.safeParse(v);if(!p.success)throw new ApiError(400,'ORGANIZATION_ADMIN_INVALID_INPUT','Check the requested organization fields, identifiers and policy limits.');return p.data;}
function body<T>(r:Request,s:z.ZodType<T>):T{if(!r.is('application/json'))throw new ApiError(415,'JSON_REQUIRED','Send organization changes as application/json.');return parse(s,r.body);}
const id=(v:unknown)=>parse(z.uuid(),v),empty=z.object({}).strict();
export function createOrganizationAdminRouter(config:ServerConfig,db:Database,requireUser:RequestHandler):Router{
 const router=Router(),service=new OrganizationAdminService(db,config),documents=new PropertyDocuments(db,config),digest=(r:Request)=>{const d=readSessionDigest(r,config);if(!d)throw new ApiError(401,'AUTH_REQUIRED','Sign in with your staff account.');return d;};
 router.use((r,s,n)=>{s.setHeader('Cache-Control','no-store, private');s.setHeader('Referrer-Policy','no-referrer');if(!['GET','HEAD','OPTIONS'].includes(r.method))return protectOrigin(config)(r,s,n);n();},requireUser);
 router.get('/settings',async(r,s)=>{parse(empty,r.query);s.json(await service.settings(actor(s),digest(r)));});
 router.put('/settings',async(r,s)=>s.json(await service.updateSettings(actor(s),digest(r),body(r,organizationSettingsSchema))));
 router.get('/members',async(r,s)=>s.json(await service.members(actor(s),digest(r),parse(organizationAdminPageSchema,r.query))));
 router.get('/members/:id',async(r,s)=>s.json(await service.member(actor(s),digest(r),id(r.params.id))));
 router.get('/members/:id/properties',async(r,s)=>s.json(await service.memberProperties(actor(s),digest(r),id(r.params.id),parse(organizationAdminPageSchema,r.query))));
 router.post('/members',async(r,s)=>s.status(201).json(await service.createStaff(actor(s),digest(r),body(r,organizationStaffCreateSchema))));
 router.get('/options',async(r,s)=>s.json(await service.options(actor(s),digest(r),parse(organizationAdminOptionsSchema,r.query))));
 router.post('/groups',async(r,s)=>s.status(201).json(await service.group(actor(s),digest(r),body(r,organizationGroupSchema))));
 router.patch('/groups/:id',async(r,s)=>s.json(await service.group(actor(s),digest(r),body(r,organizationGroupSchema),id(r.params.id))));
 router.put('/properties/:id/group',async(r,s)=>s.json(await service.propertyGroup(actor(s),digest(r),id(r.params.id),body(r,organizationPropertyGroupSchema))));
 router.get('/lead-routing',async(r,s)=>s.json(await service.leadRouting(actor(s),digest(r),parse(organizationLeadRoutingQuerySchema,r.query))));
 router.put('/lead-routing',async(r,s)=>s.json(await service.setLeadRouting(actor(s),digest(r),body(r,organizationLeadRoutingSchema))));
 router.put('/ai-policy',async(r,s)=>s.json(await service.updateAiPolicy(actor(s),digest(r),body(r,organizationAiPolicySchema))));
 router.get('/knowledge',async(r,s)=>s.json(await service.knowledge(actor(s),digest(r),parse(organizationKnowledgeQuerySchema,r.query))));
 router.post('/knowledge',async(r,s)=>s.status(201).json(await service.saveKnowledge(actor(s),digest(r),body(r,organizationKnowledgeSchema))));
 router.patch('/knowledge/:id',async(r,s)=>s.json(await service.saveKnowledge(actor(s),digest(r),body(r,organizationKnowledgeSchema),id(r.params.id))));
 router.get('/property-documents',async(r,s)=>s.json(await documents.list(actor(s),digest(r),parse(propertyDocumentQuerySchema,r.query))));
 router.post('/property-documents',raw({type:()=>true,limit:2097152}),async(r,s)=>s.status(201).json(await documents.upload(actor(s),digest(r),parse(propertyDocumentUploadSchema,r.query),r.get('Content-Type')?.split(';')[0].trim().toLowerCase()??'',r.body as Buffer)));
 router.get('/property-documents/:id',async(r,s)=>{parse(empty,r.query);s.json(await documents.detail(actor(s),digest(r),id(r.params.id)));});
 router.patch('/property-documents/:id',async(r,s)=>s.json(await documents.review(actor(s),digest(r),id(r.params.id),body(r,propertyDocumentReviewSchema))));
 router.get('/property-documents/:id/download',async(r,s)=>{parse(empty,r.query);const result=await documents.download(actor(s),digest(r),id(r.params.id)),d=result.document,name=d.name.replace(/[^a-zA-Z0-9._ -]/g,'_').replace(/^[ .]+/,'')||'document';s.setHeader('Content-Type',d.mediaType);s.setHeader('Content-Disposition','attachment; filename="'+name+'"');s.setHeader('Content-Length',String(result.content.length));s.setHeader('X-Content-Type-Options','nosniff');s.setHeader('X-Download-Options','noopen');s.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");s.send(result.content);});
 return router;
}
