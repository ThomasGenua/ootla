import type {PoolClient} from 'pg';
import type {AuthUser} from '../../shared/contracts.js';
import {ApiError} from '../http/errors.js';
export async function assertComposer(c:PoolClient,actor:AuthUser,id:string){
 const row=(await c.query('SELECT membership_id FROM conversation_composers WHERE conversation_id=$1 AND expires_at>clock_timestamp()',[id])).rows[0];
 if(row&&row.membership_id!==actor.membershipId)throw new ApiError(409,'REPLY_IN_PROGRESS','Another teammate is replying. Wait until they finish before changing or sending a reply.');
}
