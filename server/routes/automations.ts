import {Router,type Request,type Response,type RequestHandler} from 'express';
import {z} from 'zod';
import type {AuthUser} from '../../shared/contracts.js';
import {automationPageSchema,automationDirectorySchema,automationCreateSchema,automationUpdateSchema,automationPauseSchema,automationRunSchema,automationApprovalSchema,automationActivitySchema} from '../../shared/automation-contracts.js';
import type {ServerConfig} from '../config/env.js';
import type {Database} from '../db/pool.js';
import {ApiError} from '../http/errors.js';
import {protectOrigin} from '../middleware/security.js';
import {readSessionDigest} from '../services/sessions.js';
import {Automations} from '../services/automations.js';
import type {AutomationProcessOptions} from '../services/automation-processor.js';
const empty=z.object({}).strict();
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const r=schema.safeParse(value);if(!r.success)throw new ApiError(400,'AUTOMATION_INVALID_INPUT','Check rule fields, scope, approved template and pagination.');return r.data;}
function body<T>(r:Request,schema:z.ZodType<T>):T{parse(empty,r.query);if(!r.is('application/json'))throw new ApiError(415,'JSON_REQUIRED','Send rule changes as application/json.');return parse(schema,r.body);}
const id=(v:unknown)=>parse(z.uuid(),v),actor=(s:Response)=>s.locals.user as AuthUser;
export function createAutomationRouter(config:ServerConfig,db:Database,requireUser:RequestHandler,processOptions:Pick<AutomationProcessOptions,'transport'>={}):Router{
 const r=Router(),service=new Automations(db,config,processOptions),digest=(q:Request)=>{const v=readSessionDigest(q,config);if(!v)throw new ApiError(401,'AUTH_REQUIRED','Sign in to the current staff organization.');return v;};
 r.use((q,s,next)=>{s.setHeader('Cache-Control','no-store, private');if(!['GET','HEAD','OPTIONS'].includes(q.method))return protectOrigin(config)(q,s,next);next();},requireUser);
 r.get('/',async(q,s)=>s.json(await service.directory(actor(s),digest(q),parse(automationDirectorySchema,q.query))));
 r.get('/config',async(q,s)=>{parse(empty,q.query);s.json(await service.configuration(actor(s),digest(q)));});
 r.get('/options',async(q,s)=>s.json(await service.options(actor(s),digest(q),parse(automationPageSchema.extend({propertyId:z.uuid().optional(),q:z.string().trim().max(200).default(''),ownerSearch:z.string().trim().max(200).default(''),knowledgeSearch:z.string().trim().max(200).default('')}).strict(),q.query))));
 r.get('/activity',async(q,s)=>s.json(await service.activity(actor(s),digest(q),parse(automationActivitySchema,q.query))));
 r.post('/rules',async(q,s)=>s.status(201).json(await service.create(actor(s),digest(q),body(q,automationCreateSchema))));
 r.get('/rules/:id/preview',async(q,s)=>s.json(await service.preview(actor(s),digest(q),id(q.params.id),parse(automationPageSchema,q.query))));
 r.get('/rules/:id',async(q,s)=>s.json(await service.detail(actor(s),digest(q),id(q.params.id),parse(automationPageSchema,q.query))));
 r.put('/rules/:id',async(q,s)=>s.json(await service.update(actor(s),digest(q),id(q.params.id),body(q,automationUpdateSchema))));
 r.post('/pause',async(q,s)=>{const i=body(q,automationPauseSchema);s.json(await service.pause(actor(s),digest(q),i.requestKey,i.paused));});
 r.post('/evaluate',async(q,s)=>s.json(await service.evaluate(actor(s),digest(q),body(q,automationRunSchema))));
 r.post('/process',async(q,s)=>s.json(await service.process(actor(s),digest(q),body(q,automationRunSchema))));
 r.post('/jobs/:id/approve',async(q,s)=>s.json(await service.approve(actor(s),digest(q),id(q.params.id),body(q,automationApprovalSchema))));
 return r;
}
