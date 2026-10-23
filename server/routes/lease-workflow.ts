import {Router,type Request,type Response,type RequestHandler} from 'express';
import {z} from 'zod';
import type {AuthUser} from '../../shared/contracts.js';
import {leaseWorkflowCreateSchema,leaseWorkflowTransitionSchema,leaseWorkflowActionSchema,leaseWorkflowSettingsSchema} from '../../shared/lease-workflow-contracts.js';
import type {ServerConfig} from '../config/env.js';
import type {Database} from '../db/pool.js';
import {ApiError} from '../http/errors.js';
import {protectOrigin} from '../middleware/security.js';
import {readSessionDigest} from '../services/sessions.js';
import {LeaseWorkflowService} from '../services/lease-workflow.js';
const empty=z.object({}).strict();
function parse<T>(s:z.ZodType<T>,v:unknown):T{const r=s.safeParse(v);if(!r.success)throw new ApiError(400,'INVALID_INPUT','Check the lease stage, explicit evidence and dates. Uploaded documents do not verify signatures.');return r.data;}
function body<T>(r:Request,s:z.ZodType<T>):T{if(!r.is('application/json'))throw new ApiError(415,'JSON_REQUIRED','Send lease actions as application/json.');return parse(s,r.body);}
const id=(v:unknown)=>parse(z.uuid(),v),actor=(r:Response)=>r.locals.user as AuthUser;
export function createLeaseWorkflowRouter(config:ServerConfig,database:Database,requireUser:RequestHandler):Router{
 const router=Router(),service=new LeaseWorkflowService(database,config);
 const digest=(r:Request)=>{const d=readSessionDigest(r,config);if(!d)throw new ApiError(401,'AUTH_REQUIRED','Sign in to the Ootla staff workspace.');return d;};
 router.use((r,s,next)=>{s.setHeader('Cache-Control','no-store, private');s.setHeader('Referrer-Policy','no-referrer');parse(empty,r.query);if(!['GET','HEAD','OPTIONS'].includes(r.method))return protectOrigin(config)(r,s,next);next();},requireUser);
 router.get('/settings',async(r,s)=>s.json(await service.settings(actor(s),digest(r))));
 router.post('/settings',async(r,s)=>s.json(await service.saveSettings(actor(s),digest(r),body(r,leaseWorkflowSettingsSchema))));
 router.get('/:id',async(r,s)=>s.json(await service.workspace(actor(s),digest(r),id(r.params.id))));
 router.post('/:id/create',async(r,s)=>s.json(await service.create(actor(s),digest(r),id(r.params.id),body(r,leaseWorkflowCreateSchema))));
 router.post('/:id/transition',async(r,s)=>s.json(await service.transition(actor(s),digest(r),id(r.params.id),body(r,leaseWorkflowTransitionSchema))));
 router.post('/:id/reopen',async(r,s)=>s.json(await service.reopen(actor(s),digest(r),id(r.params.id),body(r,leaseWorkflowActionSchema))));
 return router;
}
