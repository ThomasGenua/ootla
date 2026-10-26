import {Router,type Request} from 'express';
import {z} from 'zod';
import type {Database} from '../db/pool.js';
import type {ServerConfig} from '../config/env.js';
import {ApiError} from '../http/errors.js';
import {protectOrigin} from '../middleware/security.js';
import {OrganizationProvisioning} from '../services/organization-provisioning.js';
import {staffInvitationResolveSchema,staffInvitationAcceptSchema} from '../../shared/organization-provisioning-contracts.js';
function body<T>(request:Request,schema:z.ZodType<T>):T{if(Object.keys(request.query).length||!request.is('application/json'))throw new ApiError(400,'STAFF_INVITATION_INVALID','Open your invitation link and complete the requested fields.');const value=schema.safeParse(request.body);if(!value.success)throw new ApiError(400,'STAFF_INVITATION_INVALID','Check your invitation and choose a password between 12 and 128 characters.');return value.data;}
/** No provision/reissue/revoke endpoints exist. An opaque existing invitation is required. */
export function createStaffOnboardingRouter(config:ServerConfig,database:Database):Router{
 const router=Router(),service=new OrganizationProvisioning(database,config),buckets=new Map<string,{until:number;requests:number;accepts:number}>();
 router.use((request,response,next)=>{response.setHeader('Cache-Control','no-store, private');response.setHeader('Referrer-Policy','no-referrer');response.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');if(!['GET','HEAD','OPTIONS'].includes(request.method))return protectOrigin(config)(request,response,next);next();});
 router.use((request,response,next)=>{const now=Date.now();for(const[key,value]of buckets)if(value.until<=now)buckets.delete(key);const key=request.ip??'unknown';let value=buckets.get(key);if(!value){if(buckets.size>=2048)throw new ApiError(429,'STAFF_INVITATION_LIMITED','Please wait before trying this invitation again.');value={until:now+60000,requests:0,accepts:0};buckets.set(key,value);}value.requests++;if(request.path==='/accept')value.accepts++;if(value.requests>60||value.accepts>20){response.setHeader('Retry-After',String(Math.max(1,Math.ceil((value.until-now)/1000))));throw new ApiError(429,'STAFF_INVITATION_LIMITED','Please wait before trying this invitation again.');}next();});
 router.post('/resolve',async(request,response)=>{const input=body(request,staffInvitationResolveSchema);response.json(await service.resolve(input.token));});
 router.post('/accept',async(request,response)=>response.json(await service.accept(body(request,staffInvitationAcceptSchema))));
 return router;
}
