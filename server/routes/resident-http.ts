import type {Response,Request,RequestHandler} from 'express';
import {z} from 'zod';
import {ApiError} from '../http/errors.js';
import type {ServerConfig} from '../config/env.js';
import {protectOrigin} from '../middleware/security.js';
import type {MaintenanceFile} from '../../shared/resident-contracts.js';
export function residentParse<T>(schema:z.ZodType<T>,value:unknown):T{const r=schema.safeParse(value);if(!r.success)throw new ApiError(400,'RESIDENT_INVALID_INPUT','Check required values, request identifiers, dates and access preferences.');return r.data;}
export const residentId=(v:unknown)=>residentParse(z.uuid(),v);
export const residentNoQuery=(r:Request)=>residentParse(z.object({}).strict(),r.query);
export function residentBody<T>(r:Request,schema:z.ZodType<T>):T{residentNoQuery(r);if(!r.is('application/json'))throw new ApiError(415,'JSON_REQUIRED','Send this action as application/json.');return residentParse(schema,r.body);}
export function residentRouteSecurity(config:ServerConfig):RequestHandler{return(q,s,next)=>{s.setHeader('Cache-Control','no-store, private');s.setHeader('Referrer-Policy','no-referrer');if(!['GET','HEAD','OPTIONS'].includes(q.method))return protectOrigin(config)(q,s,next);next();};}
export function sendMaintenanceFile(s:Response,result:{document:MaintenanceFile;content:Buffer}):void{const d=result.document,name=d.name.replace(/[^a-zA-Z0-9._ -]/g,'_').replace(/^[ .]+/,'')||'document';s.setHeader('Content-Type',d.mediaType);s.setHeader('Content-Disposition','attachment; filename="'+name+'"; filename*=UTF-8\'\''+encodeURIComponent(d.name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase()));s.setHeader('Content-Length',String(d.sizeBytes));s.setHeader('Cache-Control','no-store, private');s.setHeader('X-Content-Type-Options','nosniff');s.setHeader('X-Download-Options','noopen');s.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");s.send(result.content);}
