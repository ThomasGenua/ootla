import {Router,raw,type Request,type Response,type RequestHandler} from 'express';
import {z} from 'zod';
import type {AuthUser} from '../../shared/contracts.js';
import {maintenanceListSchema,maintenanceOptionsSchema,maintenanceSettingsSchema,maintenanceMessageSchema,maintenanceAssignmentSchema,maintenanceStatusSchema,maintenanceFileSchema,residentPageSchema,residentInvitationSchema,residentRenewalSchema} from '../../shared/resident-contracts.js';
import type {Database} from '../db/pool.js';
import type {ServerConfig} from '../config/env.js';
import {ApiError} from '../http/errors.js';
import {readSessionDigest} from '../services/sessions.js';
import {MaintenanceService} from '../services/maintenance.js';
import {residentParse as parse,residentBody as body,residentId as id,residentNoQuery as noQuery,residentRouteSecurity as security,sendMaintenanceFile} from './resident-http.js';
export function createMaintenanceRouter(config:ServerConfig,db:Database,requireUser:RequestHandler):Router{
 const r=Router(),service=new MaintenanceService(db,config),u=(s:Response)=>s.locals.user as AuthUser,digest=(q:Request)=>{const d=readSessionDigest(q,config);if(!d)throw new ApiError(401,'AUTH_REQUIRED','Sign in to the current staff organization.');return d;};
 r.use(security(config),requireUser);
 r.get('/',async(q,s)=>s.json(await service.list(u(s),digest(q),parse(maintenanceListSchema,q.query))));
 r.get('/options',async(q,s)=>s.json(await service.options(u(s),digest(q),parse(maintenanceOptionsSchema,q.query))));
 r.put('/settings',async(q,s)=>s.json(await service.settings(u(s),digest(q),body(q,maintenanceSettingsSchema))));
 r.post('/resident-invitations',async(q,s)=>s.json(await service.invitation(u(s),digest(q),body(q,residentInvitationSchema))));
 r.put('/renewals',async(q,s)=>s.json(await service.renewal(u(s),digest(q),body(q,residentRenewalSchema))));
 r.put('/resident-grants/:id',async(q,s)=>s.json(await service.setGrant(u(s),digest(q),id(q.params.id),body(q,z.object({active:z.boolean()}).strict()).active)));
 r.get('/:id',async(q,s)=>s.json(await service.detail(u(s),digest(q),id(q.params.id),parse(residentPageSchema,q.query))));
 r.post('/:id/messages',async(q,s)=>s.json(await service.message(u(s),digest(q),id(q.params.id),body(q,maintenanceMessageSchema))));
 r.put('/:id/assignment',async(q,s)=>s.json(await service.assignment(u(s),digest(q),id(q.params.id),body(q,maintenanceAssignmentSchema))));
 r.put('/:id/status',async(q,s)=>s.json(await service.status(u(s),digest(q),id(q.params.id),body(q,maintenanceStatusSchema))));
 r.post('/:id/files',raw({type:()=>true,limit:2097152}),async(q,s)=>s.status(201).json(await service.uploadStaff(u(s),digest(q),id(q.params.id),parse(maintenanceFileSchema,q.query),q.get('Content-Type')?.split(';')[0].trim().toLowerCase()??'',q.body as Buffer)));
 r.get('/:id/files/:fileId/download',async(q,s)=>{noQuery(q);sendMaintenanceFile(s,await service.downloadStaff(u(s),digest(q),id(q.params.id),id(q.params.fileId)));});
 return r;
}
