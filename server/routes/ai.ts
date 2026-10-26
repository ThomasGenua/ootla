import {Router,type Request,type Response,type RequestHandler} from 'express';
import {z} from 'zod';
import type {AuthUser} from '../../shared/contracts.js';
import {aiRequestSchema,aiOptionsSchema,aiKnowledgeQuerySchema,aiKnowledgeCreateSchema,aiKnowledgeUpdateSchema} from '../../shared/ai-contracts.js';
import type {ServerConfig} from '../config/env.js';
import type {Database} from '../db/pool.js';
import {ApiError} from '../http/errors.js';
import {protectOrigin} from '../middleware/security.js';
import {readSessionDigest} from '../services/sessions.js';
import {AiOrchestrationService} from '../services/ai-orchestration.js';
import type {AiAdapter} from '../ai/adapter.js';
import {staffOrganizationAccess} from '../services/application-access.js';
import {aiConfigurationForStaff,aiResponseForStaff} from '../http/ai-presentation.js';
const empty=z.object({}).strict();
function parse<T>(s:z.ZodType<T>,v:unknown):T{const result=s.safeParse(v);if(!result.success)throw new ApiError(400,'AI_INVALID_INPUT','Choose an authorized property and valid supported AI request fields.');return result.data;}
function body<T>(r:Request,s:z.ZodType<T>):T{if(!r.is('application/json'))throw new ApiError(415,'JSON_REQUIRED','Send AI changes as application/json.');return parse(s,r.body);}
const id=(v:unknown)=>parse(z.uuid(),v),actor=(s:Response)=>s.locals.user as AuthUser;
/** Optional adapter injection is a server-only test hook, never controlled by HTTP input. */
export function createAiRouter(config:ServerConfig,database:Database,requireUser:RequestHandler,adapterOverride?:AiAdapter):Router{
 const router=Router(),service=new AiOrchestrationService(database,config,adapterOverride);
 const digest=(r:Request)=>{const d=readSessionDigest(r,config);if(!d)throw new ApiError(401,'AUTH_REQUIRED','Sign in to use the Ootla AI workspace.');return d;};
 router.use((r,s,next)=>{s.setHeader('Cache-Control','no-store, private');s.setHeader('Referrer-Policy','no-referrer');if(!['GET','HEAD','OPTIONS'].includes(r.method))return protectOrigin(config)(r,s,next);next();},requireUser);
 const currentActor=(r:Request,s:Response)=>database.transaction(c=>staffOrganizationAccess(c,config,actor(s),digest(r),{permission:'properties.read'}));
 router.get('/config',async(r,s)=>{parse(empty,r.query);const result=await service.configuration(actor(s),digest(r));s.json(aiConfigurationForStaff(result,await currentActor(r,s)));});
 router.get('/options',async(r,s)=>s.json(await service.options(actor(s),digest(r),parse(aiOptionsSchema,r.query))));
 router.get('/knowledge',async(r,s)=>s.json(await service.knowledge(actor(s),digest(r),parse(aiKnowledgeQuerySchema,r.query))));
 router.post('/knowledge',async(r,s)=>{parse(empty,r.query);s.status(201).json(await service.createKnowledge(actor(s),digest(r),body(r,aiKnowledgeCreateSchema)));});
 router.patch('/knowledge/:id',async(r,s)=>{parse(empty,r.query);s.json(await service.updateKnowledge(actor(s),digest(r),id(r.params.id),body(r,aiKnowledgeUpdateSchema)));});
 router.post('/requests',async(r,s)=>{parse(empty,r.query);const result=await service.request(actor(s),digest(r),body(r,aiRequestSchema));s.status(result.executionStatus==='queued'?202:200).json(aiResponseForStaff(result,await currentActor(r,s)));});
 router.get('/requests/:id',async(r,s)=>{parse(empty,r.query);const result=await service.result(actor(s),digest(r),id(r.params.id));s.json(aiResponseForStaff(result,await currentActor(r,s)));});
 return router;
}
