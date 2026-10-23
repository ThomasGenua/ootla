import { Router, type Request, type Response, type RequestHandler } from 'express';
import { z } from 'zod';
import type { AuthUser } from '../../shared/contracts.js';
import { importUploadSchema, importMapSchema, importDecisionsSchema, importConfirmSchema, importPageSchema, importRowsSchema } from '../../shared/import-contracts.js';
import type { ServerConfig } from '../config/env.js';
import type { Database } from '../db/pool.js';
import { ApiError } from '../http/errors.js';
import { protectOrigin } from '../middleware/security.js';
import { Imports } from '../services/imports.js';
const actor = (r: Response) => r.locals.user as AuthUser;
const parse = <T>(schema: z.ZodType<T>, input: unknown): T => { const result = schema.safeParse(input); if (!result.success)
    throw new ApiError(400, 'INVALID_IMPORT_INPUT', 'Check the import fields, identifiers and pagination.'); return result.data; };
const id = (v: unknown) => parse(z.uuid(), v);
function body<T>(req: Request, schema: z.ZodType<T>): T { if (!req.is('application/json'))
    throw new ApiError(415, 'JSON_REQUIRED', 'Send import requests as application/json.'); return parse(schema, req.body); }
export function createImportRouter(config: ServerConfig, database: Database, requireUser: RequestHandler): Router {
    const router = Router(), imports = new Imports(database);
    router.use(requireUser, (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method))
        return protectOrigin(config)(req, res, next); next(); });
    router.get('/onboarding', async (req, res) => res.json(await imports.onboarding(actor(res))));
    router.get('/', async (req, res) => res.json(await imports.list(actor(res), parse(importPageSchema, req.query))));
    router.post('/upload', async (req, res) => res.status(201).json(await imports.upload(actor(res), body(req, importUploadSchema))));
    router.get('/:batchId/rows', async (req, res) => res.json(await imports.rows(actor(res), id(req.params.batchId), parse(importRowsSchema, req.query))));
    router.get('/:batchId/errors.csv', async (req, res) => { res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="ootla-import-${id(req.params.batchId)}-errors.csv"`); res.setHeader('X-Content-Type-Options', 'nosniff'); res.send(await imports.errorCsv(actor(res), id(req.params.batchId))); });
    router.post('/:batchId/map', async (req, res) => res.json(await imports.map(actor(res), id(req.params.batchId), body(req, importMapSchema))));
    router.post('/:batchId/validate', async (req, res) => res.json(await imports.validate(actor(res), id(req.params.batchId))));
    router.post('/:batchId/decisions', async (req, res) => res.json(await imports.decisions(actor(res), id(req.params.batchId), body(req, importDecisionsSchema))));
    router.post('/:batchId/confirm', async (req, res) => { body(req, importConfirmSchema); res.json(await imports.confirm(actor(res), id(req.params.batchId))); });
    router.post('/:batchId/retry', async (req, res) => { body(req, importConfirmSchema); res.json(await imports.confirm(actor(res), id(req.params.batchId), true)); });
    router.post('/:batchId/undo-preview', async (req, res) => res.json(await imports.undoPreview(actor(res), id(req.params.batchId), parse(importPageSchema, req.query))));
    router.post('/:batchId/undo', async (req, res) => { body(req, importConfirmSchema); res.json(await imports.undo(actor(res), id(req.params.batchId))); });
    router.get('/:batchId', async (req, res) => res.json(await imports.get(actor(res), id(req.params.batchId))));
    return router;
}
