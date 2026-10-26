import type {AiIntent,AiSource} from '../../shared/ai-contracts.js';
export interface AiProviderInput{intent:AiIntent;prompt:string;context:Record<string,unknown>;sources:AiSource[];allowedActions:string[];requestId:string}
export interface AiProviderLimits{maxOutputTokens:number;timeoutMs:number}
export interface AiProviderOutput{result:unknown;usage:{inputTokens:number;outputTokens:number;estimated?:boolean}}
export interface AiAdapter{infer(input:AiProviderInput,limits:AiProviderLimits):Promise<AiProviderOutput>}
