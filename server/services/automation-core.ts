import type {AutomationCandidate,AutomationRunResult} from '../../shared/automation-contracts.js';
export interface AutomationSource extends AutomationCandidate{
 sourceState:string;leadId:string|null;contactId:string|null;applicationId:string|null;tourId:string|null;conversationId:string|null;sourceTaskId:string|null;
}
export const automationCancellationReasons=['Customer replied','Document arrived or application advanced','Lead/viewing workflow advanced','Consent withdrawn','Staff took over','Source task resolved','Rule paused or changed','Organization automation paused','Current staff/property authorization changed','Approved source withdrawn'] as const;
export const emptyAutomationResult=():AutomationRunResult=>({scanned:0,queued:0,completed:0,cancelled:0,failed:0,deferred:0});
