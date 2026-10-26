import {residentCanonicalJoin,residentCanonicalContact} from './resident-access.js';
import {maintenanceStaffScope} from './maintenance-access.js';
/** Shared current private-request guard for durable-job lists, counts and candidate discovery. */
export const maintenanceAutomationJobScope=(alias:string):string=>" AND ("+alias+".subject_kind<>'maintenance' OR EXISTS(SELECT 1 FROM maintenance_requests mr JOIN resident_relationships rr ON rr.id=mr.resident_relationship_id AND rr.organization_id=mr.organization_id "+residentCanonicalJoin+" WHERE mr.id="+alias+".subject_id AND mr.organization_id="+alias+".organization_id AND "+maintenanceStaffScope('mr')+" AND "+residentCanonicalContact+"))";
