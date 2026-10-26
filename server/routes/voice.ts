import {Router,type Request,type Response,type RequestHandler} from 'express';
import type {z} from 'zod';
import type {AuthUser} from '../../shared/contracts.js';
import {voiceSettingsSchema,voiceStartSchema,voiceEventSchema,voiceListSchema,voicePageSchema,voiceVerifySchema,voiceBookSchema,voiceSlotsSchema,voiceActionSchema} from '../../shared/voice-contracts.js';
import type {Database} from '../db/pool.js';
import type {ServerConfig} from '../config/env.js';
import {ApiError} from '../http/errors.js';
import {readSessionDigest} from '../services/sessions.js';
import {ApplicantPortal} from '../services/applicant-portal.js';
import {VoiceService} from '../services/voice.js';
import {residentParse as parse,residentBody as body,residentId as id,residentRouteSecurity as security} from './resident-http.js';
export function createVoiceRouter(config:ServerConfig,db:Database,requireUser:RequestHandler):Router{
 const r=Router(),service=new VoiceService(db,config),applicants=new ApplicantPortal(db,config),u=(s:Response)=>s.locals.user as AuthUser,digest=(q:Request)=>{const v=readSessionDigest(q,config);if(!v)throw new ApiError(401,'AUTH_REQUIRED','Sign in to the authorized staff organization.');return v;};
 r.use(security(config),requireUser);
 r.get('/settings',async(q,s)=>{if(Object.keys(q.query).length)throw new ApiError(400,'VOICE_INVALID_INPUT','Voice settings do not accept query parameters.');s.json(await service.settings(u(s),digest(q)));});
 r.put('/settings',async(q,s)=>s.json(await service.configure(u(s),digest(q),body(q,voiceSettingsSchema))));
 r.get('/options',async(q,s)=>s.json(await service.options(u(s),digest(q),parse(voiceListSchema,q.query))));
 r.get('/sessions',async(q,s)=>s.json(await service.directory(u(s),digest(q),parse(voiceListSchema,q.query))));
 r.post('/sessions',async(q,s)=>s.status(201).json(await service.start(u(s),digest(q),body(q,voiceStartSchema))));
 r.get('/sessions/:id',async(q,s)=>s.json(await service.detail(u(s),digest(q),id(q.params.id),parse(voicePageSchema,q.query))));
 r.post('/sessions/:id/events',async(q,s)=>s.json(await service.event(u(s),digest(q),id(q.params.id),body(q,voiceEventSchema))));
 r.post('/sessions/:id/verify-applicant',async(q,s)=>{const input=body(q,voiceVerifySchema);s.json(await service.verify(u(s),digest(q),id(q.params.id),input,await applicants.currentUser(q)));});
 r.get('/sessions/:id/slots',async(q,s)=>s.json(await service.slots(u(s),digest(q),id(q.params.id),parse(voiceSlotsSchema,q.query))));
 r.post('/sessions/:id/book',async(q,s)=>s.json(await service.book(u(s),digest(q),id(q.params.id),body(q,voiceBookSchema))));
 r.delete('/sessions/:id/transcript',async(q,s)=>s.json(await service.deleteTranscript(u(s),digest(q),id(q.params.id),body(q,voiceActionSchema).requestKey)));
 r.post('/provider/callback',async()=>{throw new ApiError(501,'VOICE_PROVIDER_UNSUPPORTED','No documented telephony provider or authenticated real callback transport is configured. Only signed-in, origin-checked local simulator events are accepted.');});
 r.post('/recording',async()=>{throw new ApiError(501,'VOICE_RECORDING_UNSUPPORTED','Recording is disabled. No raw audio is accepted or created; approved client requirements and a documented provider are required before a recording implementation.');});
 return r;
}
