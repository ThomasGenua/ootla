import { Router,type Request,type RequestHandler,type Response } from 'express';
import { z } from 'zod';
import type { AuthUser } from '../../shared/contracts.js';
import { connectorCredentialsSchema,connectorDemoActionSchema,connectorPageSchema,connectorRequestSchema,connectorResolveSchema,connectorSyncSchema } from '../../shared/connector-contracts.js';
import type { ServerConfig } from '../config/env.js';
import type { Database } from '../db/pool.js';
import { ApiError } from '../http/errors.js';
import { protectOrigin } from '../middleware/security.js';
import { Connectors } from '../services/connectors.js';
import { readSessionDigest } from '../services/sessions.js';
import { getYardiReadiness } from '../connectors/yardi/readiness.js';
import { validateYardiConfiguration } from '../connectors/yardi/configuration.js';
const actor=(response:Response)=>response.locals.user as AuthUser;
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success)throw new ApiError(400,'INVALID_INPUT','Check connector identifiers, actions and pagination.');return result.data;}
function body<T>(request:Request,schema:z.ZodType<T>):T{if(!request.is('application/json'))throw new ApiError(415,'JSON_REQUIRED','Send connector changes as application/json.');return parse(schema,request.body);}
const id=(value:unknown)=>parse(z.uuid(),value);
export function createConnectorRouter(config:ServerConfig,database:Database,requireUser:RequestHandler):Router{
 const router=Router(),connectors=new Connectors(database,config);
 const digest=(request:Request)=>{const value=readSessionDigest(request,config);if(!value)throw new ApiError(401,'AUTH_REQUIRED','Sign in to manage connectors.');return value;};
 router.use(requireUser,(request,response,next)=>{if(actor(response).organization.role!=='organization_admin')throw new ApiError(403,'OWNER_ADMIN_REQUIRED','Your organization administrator manages these connections.');response.setHeader('Cache-Control','no-store');if(!['GET','HEAD','OPTIONS'].includes(request.method))return protectOrigin(config)(request,response,next);next();});
 router.get('/',async(request,response)=>response.json(await connectors.overview(actor(response),digest(request))));
 router.get('/yardi/readiness',async(request,response)=>{
  await connectors.overview(actor(response),digest(request));
  response.json(getYardiReadiness(Boolean(config.connectorCredentialKey)));
 });
 router.post('/yardi/validate-config',async(request,response)=>{
  await connectors.overview(actor(response),digest(request));
  if(!request.is('application/json'))throw new ApiError(415,'JSON_REQUIRED','Send a neutral configuration draft as application/json.');
  response.json(validateYardiConfiguration(request.body));
 });
 router.post('/demo',async(request,response)=>response.status(201).json(await connectors.createDemo(actor(response),digest(request),body(request,connectorRequestSchema).requestKey)));
 router.get('/:id/jobs',async(request,response)=>response.json(await connectors.jobs(actor(response),digest(request),id(request.params.id),parse(connectorPageSchema,request.query))));
 router.get('/:id/mappings',async(request,response)=>response.json(await connectors.mappings(actor(response),digest(request),id(request.params.id),parse(connectorPageSchema,request.query))));
 router.get('/:id/events',async(request,response)=>response.json(await connectors.events(actor(response),digest(request),id(request.params.id),parse(connectorPageSchema,request.query))));
 router.get('/:id/conflicts',async(request,response)=>response.json(await connectors.conflicts(actor(response),digest(request),id(request.params.id),parse(connectorPageSchema,request.query))));
 router.post('/:id/sync',async(request,response)=>{const input=body(request,connectorSyncSchema);response.status(202).json(await connectors.sync(actor(response),digest(request),id(request.params.id),input.requestKey,input.mode));});
 router.post('/:id/disconnect',async(request,response)=>response.json(await connectors.disconnect(actor(response),digest(request),id(request.params.id),body(request,connectorRequestSchema).requestKey)));
 router.post('/:id/reconnect',async(request,response)=>response.json(await connectors.reconnect(actor(response),digest(request),id(request.params.id),body(request,connectorRequestSchema).requestKey)));
 router.post('/:id/demo-actions',async(request,response)=>response.json(await connectors.demoAction(actor(response),digest(request),id(request.params.id),body(request,connectorDemoActionSchema))));
 router.put('/:id/credentials',async(request,response)=>response.json(await connectors.credentials(actor(response),digest(request),id(request.params.id),body(request,connectorCredentialsSchema).secret)));
 router.post('/:id/conflicts/:conflictId/resolve',async(request,response)=>response.json(await connectors.resolve(actor(response),digest(request),id(request.params.id),id(request.params.conflictId),body(request,connectorResolveSchema))));
 return router;
}
