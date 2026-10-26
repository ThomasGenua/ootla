import {Router,type Request,type Response,type RequestHandler} from 'express';
import {z} from 'zod';
import type {AuthUser} from '../../shared/contracts.js';
import {askCreateSchema,askMessageSchema,actionConfirmSchema,conversationPageSchema,conversationDirectorySchema,channelPublishSchema,publicStartSchema,publicReadSchema,publicMessageSchema,conversationConsentSchema,conversationReplySchema,conversationOwnershipSchema,conversationSimulateSchema,outboxProcessSchema,publicSlotsSchema,publicBookSchema} from '../../shared/conversation-contracts.js';
import type {ServerConfig} from '../config/env.js';
import type {Database} from '../db/pool.js';
import type {AiAdapter} from '../ai/adapter.js';
import {ApiError} from '../http/errors.js';
import {protectOrigin} from '../middleware/security.js';
import {readSessionDigest} from '../services/sessions.js';
import {AskOotlaService} from '../services/ask-ootla.js';
import {Conversations} from '../services/conversations.js';
const empty=z.object({}).strict();
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const r=schema.safeParse(value);if(!r.success)throw new ApiError(400,'CONVERSATION_INVALID_INPUT','Check the supported fields, identifiers and bounded message content.');return r.data;}
const id=(v:unknown)=>parse(z.uuid(),v),actor=(s:Response)=>s.locals.user as AuthUser;
function body<T>(r:Request,schema:z.ZodType<T>):T{parse(empty,r.query);if(!r.is('application/json'))throw new ApiError(415,'JSON_REQUIRED','Send conversation changes as application/json.');return parse(schema,r.body);}
function secured(router:Router,config:ServerConfig,requireUser?:RequestHandler){router.use((r,s,next)=>{s.setHeader('Cache-Control','no-store, private');s.setHeader('Referrer-Policy','no-referrer');s.setHeader('X-Robots-Tag','noindex, nofollow');if(!['GET','HEAD','OPTIONS'].includes(r.method))return protectOrigin(config)(r,s,next);next();});if(requireUser)router.use(requireUser);}
function digest(r:Request,config:ServerConfig){const v=readSessionDigest(r,config);if(!v)throw new ApiError(401,'AUTH_REQUIRED','Sign in to the current staff organization.');return v;}
export function createAskRouter(config:ServerConfig,db:Database,requireUser:RequestHandler,adapter?:AiAdapter):Router{
 const r=Router(),service=new AskOotlaService(db,config,adapter);secured(r,config,requireUser);
 r.get('/policy',async(q,s)=>{parse(empty,q.query);s.json(await service.policy(actor(s),digest(q,config)));});
 r.put('/policy',async(q,s)=>s.json(await service.setPolicy(actor(s),digest(q,config),body(q,z.object({allowTaskCreation:z.boolean()}).strict()).allowTaskCreation)));
 r.get('/threads',async(q,s)=>s.json(await service.list(actor(s),digest(q,config),parse(conversationPageSchema.extend({propertyId:z.uuid().optional(),leadId:z.uuid().optional(),applicationId:z.uuid().optional(),maintenanceRequestId:z.uuid().optional()}).strict(),q.query))));
 r.post('/threads',async(q,s)=>s.status(201).json(await service.create(actor(s),digest(q,config),body(q,askCreateSchema))));
 r.get('/threads/:id',async(q,s)=>s.json(await service.detail(actor(s),digest(q,config),id(q.params.id),parse(conversationPageSchema,q.query))));
 r.post('/threads/:id/messages',async(q,s)=>s.json(await service.message(actor(s),digest(q,config),id(q.params.id),body(q,askMessageSchema))));
 r.post('/threads/:id/actions/:actionId/confirm',async(q,s)=>s.json(await service.confirm(actor(s),digest(q,config),id(q.params.id),id(q.params.actionId),body(q,actionConfirmSchema).requestKey)));
 return r;
}
export function createConversationRouter(config:ServerConfig,db:Database,requireUser:RequestHandler,adapter?:AiAdapter):Router{
 const r=Router(),service=new Conversations(db,config,adapter);secured(r,config,requireUser);
 r.get('/',async(q,s)=>s.json(await service.directory(actor(s),digest(q,config),parse(conversationDirectorySchema,q.query))));
 r.get('/config',async(q,s)=>{parse(empty,q.query);s.json(await service.configuration(actor(s),digest(q,config)));});
 r.post('/channels',async(q,s)=>s.json(await service.publish(actor(s),digest(q,config),body(q,channelPublishSchema))));
 r.post('/simulate',async(q,s)=>s.status(201).json(await service.simulate(actor(s),digest(q,config),body(q,conversationSimulateSchema))));
 r.get('/:id',async(q,s)=>s.json(await service.detail(actor(s),digest(q,config),id(q.params.id),parse(conversationPageSchema,q.query))));
 r.post('/:id/messages',async(q,s)=>s.json(await service.reply(actor(s),digest(q,config),id(q.params.id),body(q,conversationReplySchema))));
 r.post('/:id/ownership',async(q,s)=>s.json(await service.ownership(actor(s),digest(q,config),id(q.params.id),body(q,conversationOwnershipSchema))));
 r.post('/:id/process',async(q,s)=>s.json(await service.process(actor(s),digest(q,config),id(q.params.id),body(q,outboxProcessSchema))));
 r.post('/:id/simulate-inbound',async(q,s)=>s.json(await service.simulateInbound(actor(s),digest(q,config),id(q.params.id),body(q,z.object({requestKey:z.uuid(),message:z.string().trim().min(1).max(1500)}).strict()))));
 r.post('/:id/drafts/:messageId/approve',async(q,s)=>s.json(await service.approve(actor(s),digest(q,config),id(q.params.id),id(q.params.messageId),body(q,z.object({requestKey:z.uuid(),body:z.string().trim().min(1).max(3000).optional()}).strict()))));
 return r;
}
export function createPublicConversationRouter(config:ServerConfig,db:Database,adapter?:AiAdapter):Router{
 const r=Router(),service=new Conversations(db,config,adapter);secured(r,config);
 const limits=new Map<string,{window:number;requests:number;starts:number}>();
 r.use((q,_s,next)=>{const now=Date.now(),key=q.ip??'unknown';for(const[k,v]of limits)if(v.window+60000<=now)limits.delete(k);let b=limits.get(key);if(!b){if(limits.size>=2048)throw new ApiError(429,'CHAT_RATE_LIMIT','Public chat is busy. Please try again shortly.');b={window:now,requests:0,starts:0};limits.set(key,b);}b.requests++;if(q.path==='/start')b.starts++;if(b.requests>120||b.starts>10)throw new ApiError(429,'CHAT_RATE_LIMIT','Please wait before sending more chat requests.');next();});
 r.get('/catalog',async(q,s)=>{parse(empty,q.query);s.json(await service.catalog());});
 r.post('/start',async(q,s)=>s.status(201).json(await service.start(body(q,publicStartSchema))));
 r.post('/read',async(q,s)=>{const i=body(q,publicReadSchema);s.json(await service.publicRead(i.token,{page:i.page,pageSize:i.pageSize}));});
 r.post('/messages',async(q,s)=>s.json(await service.publicMessage(body(q,publicMessageSchema))));
 r.post('/consent',async(q,s)=>{const i=body(q,conversationConsentSchema);s.json(await service.consent(i.token,i.requestKey,i.consent));});
 r.post('/slots',async(q,s)=>{const {token,...input}=body(q,publicSlotsSchema);s.json(await service.slots(token,input));});
 r.post('/book',async(q,s)=>{const {token,...input}=body(q,publicBookSchema);s.json(await service.book(token,input));});
 return r;
}
