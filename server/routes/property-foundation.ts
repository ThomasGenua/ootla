import { Router, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import type { AuthUser } from '../../shared/contracts.js';
import { applicationCreateSchema, contactCreateSchema, contactDirectorySchema, contactUpdateSchema, externalMappingSchema, foundationPageSchema, groupCreateSchema, householdCreateSchema, householdMemberSchema, leaseCreateSchema, propertyCreateSchema, propertyDirectorySchema, propertyUpdateSchema, unitCreateSchema, unitUpdateSchema } from '../../shared/property-contracts.js';
import type { ServerConfig } from '../config/env.js';
import type { Database } from '../db/pool.js';
import { ApiError } from '../http/errors.js';
import { protectOrigin } from '../middleware/security.js';
import { permission, PropertyFoundation } from '../services/property-foundation.js';
const actor = (response: Response): AuthUser => response.locals.user as AuthUser;
function parse<T>(schema: z.ZodType<T>, value: unknown): T { const result = schema.safeParse(value); if (!result.success)
    throw new ApiError(400, 'INVALID_INPUT', 'Check the requested fields, identifiers and pagination.'); return result.data; }
function body<T>(request: Request, schema: z.ZodType<T>): T { if (!request.is('application/json'))
    throw new ApiError(415, 'JSON_REQUIRED', 'Send this request as application/json.'); return parse(schema, request.body); }
const id = (value: unknown): string => parse(z.uuid(), value);
const pageSchema = foundationPageSchema.strict();
const relatedQuery = foundationPageSchema.extend({ propertyId: z.uuid().optional() }).strict();
const mappingQuery = foundationPageSchema.extend({ entityType: z.enum(['property', 'unit', 'contact', 'application', 'lease']).optional(), entityId: z.uuid().optional() }).strict().refine(value => Boolean(value.entityType) === Boolean(value.entityId));
const relatedFields = { contactId: z.uuid().optional(), householdId: z.uuid().nullable().optional(), propertyId: z.uuid().optional(), unitId: z.uuid().nullable().optional(), leadId: z.uuid().nullable().optional() };
const applicationUpdate = z.object({ ...relatedFields, status: z.enum(['draft', 'submitted', 'staff_review']).optional() }).strict().refine(value => Object.keys(value).length > 0);
const leaseUpdate = z.object({ ...relatedFields, applicationId: z.uuid().nullable().optional(), status: z.enum(['draft', 'active', 'ended']).optional(), startsOn: z.iso.date().nullable().optional(), endsOn: z.iso.date().nullable().optional() }).strict().refine(value => Object.keys(value).length > 0);
/** Bounded Stage 06 data foundation. No provider calls, outbound actions or portal sessions. */
export function createPropertyFoundationRouter(config: ServerConfig, database: Database, requireUser: RequestHandler): Router {
    const router = Router();
    const service = new PropertyFoundation(database);
    router.use(requireUser, (request, response, next) => { response.setHeader('Cache-Control', 'no-store'); permission(actor(response), 'properties.read'); if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method))
        return protectOrigin(config)(request, response, next); next(); });
    router.get('/properties', async (request, response) => { response.json(await service.properties(actor(response), parse(propertyDirectorySchema, request.query))); });
    router.get('/groups', async (request, response) => { parse(z.object({}).strict(), request.query); response.json(await service.groups(actor(response))); });
    router.post('/groups', async (request, response) => { response.status(201).json({ group: await service.createGroup(actor(response), body(request, groupCreateSchema)) }); });
    router.post('/properties', async (request, response) => { response.status(201).json({ property: await service.createProperty(actor(response), body(request, propertyCreateSchema)) }); });
    router.get('/properties/:propertyId', async (request, response) => { response.json(await service.propertyDetail(actor(response), id(request.params.propertyId), parse(pageSchema, request.query))); });
    router.patch('/properties/:propertyId', async (request, response) => { response.json({ property: await service.updateProperty(actor(response), id(request.params.propertyId), body(request, propertyUpdateSchema)) }); });
    router.get('/properties/:propertyId/units', async (request, response) => { response.json(await service.units(actor(response), id(request.params.propertyId), parse(pageSchema, request.query))); });
    router.get('/properties/:propertyId/leads', async (request, response) => { response.json(await service.leads(actor(response), id(request.params.propertyId), parse(pageSchema, request.query))); });
    router.post('/properties/:propertyId/units', async (request, response) => { response.status(201).json({ unit: await service.createUnit(actor(response), id(request.params.propertyId), body(request, unitCreateSchema)) }); });
    router.patch('/properties/:propertyId/units/:unitId', async (request, response) => { response.json({ unit: await service.updateUnit(actor(response), id(request.params.propertyId), id(request.params.unitId), body(request, unitUpdateSchema)) }); });
    router.get('/contacts', async (request, response) => { response.json(await service.contacts(actor(response), parse(contactDirectorySchema, request.query))); });
    router.post('/contacts', async (request, response) => { response.status(201).json({ contact: await service.createContact(actor(response), body(request, contactCreateSchema)) }); });
    router.get('/contacts/:contactId', async (request, response) => { response.json(await service.contactDetail(actor(response), id(request.params.contactId), parse(pageSchema, request.query))); });
    router.patch('/contacts/:contactId', async (request, response) => { response.json({ contact: await service.updateContact(actor(response), id(request.params.contactId), body(request, contactUpdateSchema)) }); });
    router.post('/contacts/:contactId/properties', async (request, response) => { const input = body(request, z.object({ propertyId: z.uuid() }).strict()); response.json({ contact: await service.linkContactProperty(actor(response), id(request.params.contactId), input.propertyId) }); });
    router.get('/contacts/:contactId/history', async (request, response) => { response.json(await service.contactHistory(actor(response), id(request.params.contactId), parse(pageSchema, request.query))); });
    router.get('/households', async (request, response) => { response.json(await service.households(actor(response), parse(pageSchema, request.query))); });
    router.post('/households', async (request, response) => { response.status(201).json({ household: await service.createHousehold(actor(response), body(request, householdCreateSchema)) }); });
    router.post('/households/:householdId/members', async (request, response) => { response.json({ household: await service.addHouseholdMember(actor(response), id(request.params.householdId), body(request, householdMemberSchema)) }); });
    router.get('/applications', async (request, response) => { const input = parse(relatedQuery, request.query); response.json(await service.relatedRecords(actor(response), 'application', input, input.propertyId)); });
    router.post('/applications', async (request, response) => { response.status(201).json({ application: await service.createApplication(actor(response), body(request, applicationCreateSchema)) }); });
    router.patch('/applications/:applicationId', async (request, response) => { response.json({ application: await service.updateRelated(actor(response), 'application', id(request.params.applicationId), body(request, applicationUpdate)) }); });
    router.get('/leases', async (request, response) => { const input = parse(relatedQuery, request.query); response.json(await service.relatedRecords(actor(response), 'lease', input, input.propertyId)); });
    router.post('/leases', async (request, response) => { response.status(201).json({ lease: await service.createLease(actor(response), body(request, leaseCreateSchema)) }); });
    router.patch('/leases/:leaseId', async (request, response) => { response.json({ lease: await service.updateRelated(actor(response), 'lease', id(request.params.leaseId), body(request, leaseUpdate)) }); });
    router.get('/external-mappings', async (request, response) => { const input = parse(mappingQuery, request.query); response.json(await service.mappings(actor(response), input, input.entityType && input.entityId ? { entityType: input.entityType, entityId: input.entityId } : undefined)); });
    router.post('/external-mappings', async (request, response) => { response.status(201).json({ mapping: await service.createMapping(actor(response), body(request, externalMappingSchema)) }); });
    return router;
}
