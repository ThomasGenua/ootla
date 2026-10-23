import { Router, type Request, type Response, type RequestHandler } from 'express';
import { z } from 'zod';
import type { AuthUser } from '../../shared/contracts.js';
import { taskPageSchema, taskDirectorySchema, taskCreateSchema, taskUpdateSchema, taskOptionsSchema, taskFollowupsSchema, taskTeamSchema, taskRoutingSchema, taskSnoozeSchema } from '../../shared/task-contracts.js';
import type { ServerConfig } from '../config/env.js';
import type { Database } from '../db/pool.js';
import { ApiError } from '../http/errors.js';
import { protectOrigin } from '../middleware/security.js';
import { Tasks } from '../services/tasks.js';
const actor = (r: Response) => r.locals.user as AuthUser;
function parse<T>(schema: z.ZodType<T>, value: unknown): T { const result = schema.safeParse(value); if (!result.success)
    throw new ApiError(400, 'INVALID_INPUT', 'Check the task fields, identifiers and pagination.'); return result.data; }
const id = (v: unknown) => parse(z.uuid(), v);
function body<T>(r: Request, schema: z.ZodType<T>): T { if (!r.is('application/json'))
    throw new ApiError(415, 'JSON_REQUIRED', 'Send task changes as application/json.'); return parse(schema, r.body); }
export function createTaskRouter(config: ServerConfig, database: Database, requireUser: RequestHandler): Router {
    const router = Router(), tasks = new Tasks(database);
    router.use(requireUser, (request, response, next) => { response.setHeader('Cache-Control', 'no-store'); if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method))
        return protectOrigin(config)(request, response, next); next(); });
    router.get('/', async (req, res) => res.json(await tasks.list(actor(res), parse(taskDirectorySchema, req.query))));
    router.get('/options', async (req, res) => { const p = parse(taskOptionsSchema, req.query); res.json(await tasks.options(actor(res), p.propertyId, p.leadId,p.q)); });
    router.get('/related-options', async (req, res) => { const p = parse(z.object({ propertyId: z.uuid(), leadId: z.uuid().optional(),q:z.string().trim().max(200).default('') }).strict(), req.query); res.json(await tasks.relatedOptions(actor(res), p.propertyId, p.leadId,p.q)); });
    router.get('/follow-ups', async (req, res) => { const p = parse(taskFollowupsSchema, req.query); res.json(await tasks.followups(actor(res), p.stages.split(',').filter(Boolean), p.q)); });
    router.get('/reminders', async (req, res) => res.json(await tasks.reminders(actor(res), parse(taskPageSchema, req.query))));
    router.post('/reminders/:reminderId/snooze', async (req, res) => res.json({ reminder: await tasks.snooze(actor(res), id(req.params.reminderId), body(req, taskSnoozeSchema).minutes) }));
    router.post('/teams', async (req, res) => res.status(201).json({ team: await tasks.team(actor(res), body(req, taskTeamSchema)) }));
    router.put('/teams/:teamId', async (req, res) => res.json({ team: await tasks.team(actor(res), body(req, taskTeamSchema), id(req.params.teamId)) }));
    router.post('/routing-rules', async (req, res) => res.json({ rule: await tasks.routing(actor(res), body(req, taskRoutingSchema)) }));
    router.get('/:taskId', async (req, res) => res.json(await tasks.detail(actor(res), id(req.params.taskId), parse(taskPageSchema, req.query))));
    router.post('/', async (req, res) => res.status(201).json({ task: await tasks.create(actor(res), body(req, taskCreateSchema)) }));
    router.patch('/:taskId', async (req, res) => res.json({ task: await tasks.update(actor(res), id(req.params.taskId), body(req, taskUpdateSchema)) }));
    return router;
}
