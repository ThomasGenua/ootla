import type {AiAdapter,AiProviderInput,AiProviderLimits,AiProviderOutput} from './adapter.js';
/** Scripted inference only. It never follows instructions inside knowledge text or performs a domain action. */
export class SimulatedAiAdapter implements AiAdapter{
 async infer(input:AiProviderInput,limits:AiProviderLimits):Promise<AiProviderOutput>{
  const useful=input.sources.filter(s=>input.intent==='property_question'?s.kind==='knowledge'||s.kind==='property':input.intent==='availability'?s.kind==='availability':input.intent==='viewing_options'?s.kind==='viewing':input.intent==='application_checklist'?s.kind==='application_checklist':true);
  const task=input.context.requestedTask;
  const proposedActions=(input.intent==='create_follow_up'||input.intent==='staff_handoff')&&input.allowedActions.includes('create_staff_task')&&task?[{name:'create_staff_task',arguments:task}]:[];
  const missing=input.intent==='property_question'&&!useful.some(s=>s.kind==='knowledge')||input.intent==='application_checklist'&&!input.context.checklist;
  const result={response:missing?'The approved facts needed for this question are unavailable. Please ask authorized staff.':'The server must verify the scoped facts and every proposed action before presenting the result.',internalSummary:'Scripted simulation selected the permitted context and proposed only an allowed staff task.',sourceIds:useful.map(s=>s.id).slice(0,12),proposedActions,handoffReason:missing?'The requested approved knowledge or application context is unavailable.':input.intent==='staff_handoff'?'Authorized staff follow-up was requested.':null};
  return{result,usage:{inputTokens:Math.ceil(Buffer.byteLength(JSON.stringify(input),'utf8')/4),outputTokens:Math.min(limits.maxOutputTokens,Math.ceil(Buffer.byteLength(JSON.stringify(result),'utf8')/4)),estimated:true}};
 }
}
