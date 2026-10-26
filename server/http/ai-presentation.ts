import type {AiConfiguration,AiResponse} from '../../shared/ai-contracts.js';
import type {AuthUser} from '../../shared/contracts.js';

/** HTTP projections only. Persisted orchestration results keep their full internal evidence. */
export type StaffAiResponse = Omit<AiResponse,'trace'|'internalSummary'> & Partial<Pick<AiResponse,'trace'|'internalSummary'>>;
export type StaffAiConfiguration = Omit<AiConfiguration,'limits'> & Partial<Pick<AiConfiguration,'limits'>>;

export function aiResponseForStaff(result:AiResponse,currentActor:AuthUser):StaffAiResponse {
 if(currentActor.organization.role==='organization_admin')return result;
 return {id:result.id,mode:result.mode,intent:result.intent,response:result.response,sources:result.sources,actions:result.actions,
  executionStatus:result.executionStatus,staffHandoffReason:result.staffHandoffReason,createdAt:result.createdAt};
}
export function aiConfigurationForStaff(configuration:AiConfiguration,currentActor:AuthUser):StaffAiConfiguration {
 if(currentActor.organization.role==='organization_admin')return configuration;
 return {mode:configuration.mode,label:configuration.label,notice:configuration.notice,access:configuration.access,capabilities:configuration.capabilities};
}
