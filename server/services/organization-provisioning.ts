import type {Database} from '../db/pool.js';
import type {ServerConfig} from '../config/env.js';
import type {OrganizationProvisioningManifest,OrganizationInvitationReissue,OrganizationInvitationRevoke,StaffInvitationAccept} from '../../shared/organization-provisioning-contracts.js';
import {provisionPendingOrganization} from './organization-provisioning-create.js';
import {reissueFirstAdministrator,revokeFirstAdministrator} from './organization-invitation-management.js';
import {resolveStaffInvitation,acceptStaffInvitation} from './staff-onboarding.js';
/** Operator provisioning is never mounted on HTTP; only resolve/accept are public capability actions. */
export class OrganizationProvisioning{
 constructor(private readonly database:Database,private readonly config:ServerConfig){}
 provision(input:OrganizationProvisioningManifest){return provisionPendingOrganization(this.database,this.config,input);}
 reissue(input:OrganizationInvitationReissue){return reissueFirstAdministrator(this.database,this.config,input);}
 revoke(input:OrganizationInvitationRevoke){return revokeFirstAdministrator(this.database,this.config,input);}
 resolve(token:string){return resolveStaffInvitation(this.database,this.config,token);}
 accept(input:StaffInvitationAccept){return acceptStaffInvitation(this.database,this.config,input);}
}
