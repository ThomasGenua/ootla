import type {PoolClient} from 'pg';
import {ApiError} from '../http/errors.js';
/** Recheck current approval/scope/version after inference and immediately before queued delivery. */
export async function assertAiKnowledgeCurrent(c:PoolClient,org:string,propertyId:string,sources:ReadonlyArray<{id?:string;version?:number;verifiedAt?:string|null}>,publicOnly=false):Promise<void>{
 const knowledge=sources.filter(s=>s.id?.startsWith('knowledge:'));if(!knowledge.length)return;
 const ids=knowledge.map(s=>s.id!.slice(10));const rows=(await c.query("SELECT id,property_id,version,approved_at FROM ai_knowledge WHERE organization_id=$1 AND id=ANY($2::uuid[]) AND (property_id=$3 OR property_id IS NULL) AND status='approved' AND (NOT $4::boolean OR public_enabled) FOR SHARE",[org,ids,propertyId,publicOnly])).rows;
 if(knowledge.some(s=>{const r=rows.find(r=>r.id===s.id!.slice(10));return !r||s.version!==undefined&&r.version!==s.version||s.verifiedAt&&new Date(r.approved_at).getTime()!==new Date(s.verifiedAt).getTime();}))throw new ApiError(409,'AI_KNOWLEDGE_CHANGED','Approved knowledge changed or was retired. No stale answer or automated action was released. Ask again using the current approved sources.');
}

export async function assertKnowledgeEditable(c:PoolClient,org:string,id:string):Promise<void>{if((await c.query("SELECT to_regclass('public.property_knowledge_documents') IS NOT NULL AS ready")).rows[0]?.ready&&(await c.query('SELECT id FROM property_knowledge_documents WHERE organization_id=$1 AND knowledge_id=$2',[org,id])).rowCount)throw new ApiError(409,'KNOWLEDGE_DOCUMENT_MANAGED','Review this source in Organization > Property documents. Its approved text and private source must be managed together.');}
