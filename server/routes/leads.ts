import { Router, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import type { AuthUser } from '../../shared/contracts.js';
import { leadCreateSchema, leadUpdateSchema, leadStageSchema, leadDirectorySchema, leadOptionsSchema, duplicateSuggestionsSchema, leaseVerificationSchema, leadPageSchema, leasingStages, salesStages } from '../../shared/lead-contracts.js';
import type { ServerConfig } from '../config/env.js';
import type { Database } from '../db/pool.js';
import { ApiError } from '../http/errors.js';
import { protectOrigin } from '../middleware/security.js';
import { permission } from '../services/property-foundation.js';
import { Leads } from '../services/leads.js';
const actor = (r: Response): AuthUser => r.locals.user as AuthUser;
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
    const r = schema.safeParse(value);
    if (!r.success)
        throw new ApiError(400, 'INVALID_INPUT', 'Check the lead fields, identifiers, filters and pagination.');
    return r.data;
}
function body<T>(r: Request, schema: z.ZodType<T>): T {
    if (!r.is('application/json'))
        throw new ApiError(415, 'JSON_REQUIRED', 'Send this request as application/json.');
    return parse(schema, r.body);
}
const id = (v: unknown) => parse(z.uuid(), v);
const followSchema = z.object({ q: z.string().trim().max(200).default(''), stages: z.string().max(1000).default('') }).strict().refine(v => !v.stages || v.stages.split(',').every(s => ['new', 'contacted', 'viewing_scheduled', 'qualified', ...leasingStages.map(s => s.key), ...salesStages.map(s => s.key)].includes(s)));
/** Real database lead operations; no outbound action, screening decision or lease execution. */
export function createLeadRouter(config: ServerConfig, database: Database, requireUser: RequestHandler): Router {
    const router = Router(), service = new Leads(database);
    router.use(requireUser, (request, response, next) => {
        response.setHeader('Cache-Control', 'no-store');
        permission(actor(response), 'properties.read');
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method))
            return protectOrigin(config)(request, response, next);
        next();
    });
    router.get('/', async (request, response) => { response.json(await service.directory(actor(response), parse(leadDirectorySchema, request.query))); });
    router.get('/options', async (request, response) => { response.json(await service.options(actor(response), parse(leadOptionsSchema, request.query))); });
    router.get('/duplicate-suggestions', async (request, response) => { response.json(await service.duplicates(actor(response), parse(duplicateSuggestionsSchema, request.query))); });
    router.get('/follow-ups', async (request, response) => { const i = parse(followSchema, request.query); response.json(await service.followUps(actor(response), i.q, i.stages ? i.stages.split(',') : [])); });
    router.post('/', async (request, response) => { response.status(201).json({ lead: await service.create(actor(response), body(request, leadCreateSchema)) }); });
    router.get('/:leadId', async (request, response) => { response.json(await service.detail(actor(response), id(request.params.leadId), parse(leadPageSchema.strict(), request.query))); });
    router.patch('/:leadId', async (request, response) => { response.json({ lead: await service.update(actor(response), id(request.params.leadId), body(request, leadUpdateSchema)) }); });
    router.patch('/:leadId/stage', async (request, response) => { response.json({ lead: await service.changeStage(actor(response), id(request.params.leadId), body(request, leadStageSchema)) }); });
    router.get('/:leadId/events', async (request, response) => { response.json(await service.events(actor(response), id(request.params.leadId), parse(leadPageSchema.strict(), request.query))); });
    router.post('/:leadId/lease-verification', async (request, response) => { response.json({ lead: await service.verifyLease(actor(response), id(request.params.leadId), body(request, leaseVerificationSchema)) }); });
    return router;
}
