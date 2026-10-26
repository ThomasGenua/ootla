import type {Database} from '../db/pool.js';
import type {ServerConfig} from '../config/env.js';
/** Server-only bounded cleanup; no raw audio exists, and no provider or outbound action is invoked. */
export async function purgeVoiceTranscripts(db:Database,_config:ServerConfig,options:{organizationId?:string;limit?:number}={}):Promise<{purged:number;expiredSessions:number}>{
 const limit=Math.max(1,Math.min(500,options.limit??100));return db.transaction(async c=>{
  const expired=(await c.query("WITH batch AS(SELECT id FROM voice_sessions WHERE ($1::uuid IS NULL OR organization_id=$1) AND status IN('active','interrupted') AND(expires_at<=clock_timestamp() OR last_event_at<=clock_timestamp()-interval '5 minutes') ORDER BY last_event_at,id LIMIT $2 FOR UPDATE SKIP LOCKED) UPDATE voice_sessions v SET status='timed_out',outcome='timed_out',summary='Local transcript-playback session timed out. No call, transfer or booking is implied.',ended_at=clock_timestamp() FROM batch b WHERE v.id=b.id RETURNING v.id",[options.organizationId??null,limit])).rowCount??0;
  const purged=(await c.query("WITH batch AS(SELECT t.id FROM voice_transcripts t LEFT JOIN organization_voice_settings s ON s.organization_id=t.organization_id WHERE ($1::uuid IS NULL OR t.organization_id=$1) AND(t.input_text IS NOT NULL OR t.output_text IS NOT NULL) AND(t.expires_at<=clock_timestamp() OR COALESCE(s.retention_days,0)=0 OR t.created_at+COALESCE(s.retention_days,0)*interval '1 day'<=clock_timestamp()) ORDER BY t.created_at,t.id LIMIT $2 FOR UPDATE OF t SKIP LOCKED) UPDATE voice_transcripts t SET input_text=NULL,output_text=NULL FROM batch b WHERE t.id=b.id RETURNING t.id",[options.organizationId??null,limit])).rowCount??0;
  return{purged,expiredSessions:expired};
 });
}
