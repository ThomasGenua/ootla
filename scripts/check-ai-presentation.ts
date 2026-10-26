import assert from 'node:assert/strict';
import type {AuthUser,OrganizationRole} from '../shared/contracts.js';
import type {AiConfiguration,AiResponse} from '../shared/ai-contracts.js';
import {aiResponseForStaff,aiConfigurationForStaff} from '../server/http/ai-presentation.js';
const actor=(role:OrganizationRole):AuthUser=>({id:'test-staff',email:'synthetic@example.test',name:'Synthetic staff',membershipId:'test-membership',permissions:['properties.read'],sessionExpiresAt:'2030-01-01T00:00:00.000Z',organization:{id:'test-organization',name:'Synthetic organization',role}});
const result:AiResponse={id:'test-request',mode:'live',intent:'property_question',response:'The saved office hours are 09:00 to 17:00.',internalSummary:'Owner operational summary',sources:[{id:'knowledge:test',kind:'knowledge',title:'Office hours',url:'/admin/ai',excerpt:'09:00 to 17:00',verifiedAt:null,simulated:false}],actions:[{name:'create_staff_task',status:'failed',message:'The task could not be created.'}],executionStatus:'partial',staffHandoffReason:'Ask staff to complete the follow-up.',trace:{tools:[{name:'read_property',status:'completed',reason:'Internal diagnostic'}],latencyMs:123,usage:{inputTokens:10,outputTokens:20,estimated:false,costMicros:4}},createdAt:'2026-10-26T00:00:00.000Z'};
const configuration:AiConfiguration={mode:'live',label:'OotlaAI',notice:'Ask about your authorized property records.',limits:{maxRequestsPerMinute:20,maxTokensPerRequest:16000,dailyTokenBudget:200000,dailyCostBudgetMicros:1000000,timeoutMs:8000},access:{canRun:true,canManageKnowledge:false},capabilities:['property_question']};
const stored=JSON.stringify(result),storedConfiguration=JSON.stringify(configuration);
Object.freeze(result);Object.freeze(configuration);
for(const role of ['leasing_agent','property_manager','read_only_analyst','staff','read_only'] as const){
 const wire=aiResponseForStaff(result,actor(role)),settings=aiConfigurationForStaff(configuration,actor(role));
 assert(!Object.hasOwn(wire,'trace'));assert(!Object.hasOwn(wire,'internalSummary'));assert(!Object.hasOwn(settings,'limits'));
 assert.equal(wire.response,result.response);assert.deepEqual(wire.actions,result.actions);assert.equal(wire.executionStatus,'partial');assert.equal(wire.staffHandoffReason,result.staffHandoffReason);
 assert.deepEqual(wire.sources,result.sources);assert.deepEqual(settings.access,configuration.access);assert.deepEqual(settings.capabilities,configuration.capabilities);
 const json=JSON.stringify(wire);assert(!json.includes('Internal diagnostic'));assert(!json.includes('Owner operational summary'));assert(!json.includes('costMicros'));
}
console.log('PASS all five non-owner staff roles receive business results and capability state without traces, internal summaries or configuration limits.');
assert.deepEqual(aiResponseForStaff(result,actor('organization_admin')),result);assert.deepEqual(aiConfigurationForStaff(configuration,actor('organization_admin')),configuration);
console.log('PASS current organization administrator retains full private diagnostic evidence.');
assert.equal(JSON.stringify(result),stored);assert.equal(JSON.stringify(configuration),storedConfiguration);
const oldOwner=actor('organization_admin'),demoted={...oldOwner,organization:{...oldOwner.organization,role:'leasing_agent' as const}};
assert(!Object.hasOwn(aiResponseForStaff(result,demoted),'trace'));assert(!Object.hasOwn(aiConfigurationForStaff(configuration,demoted),'limits'));
console.log('PASS HTTP projection does not mutate stored orchestration evidence, fake zero limits, or retain owner diagnostics after a current-role demotion.');
console.log('AI HTTP presentation verification passed (3 focused groups; no network or retained data).');
