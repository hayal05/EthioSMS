import type pg from 'pg';
import { transaction } from './pool.js';
import { settleRecipient } from '../messaging/dispatch.js';
export async function maintain(pool:pg.Pool){
 return transaction(pool,async client=>{
  const lock=(await client.query('SELECT pg_try_advisory_xact_lock(174962,3) AS acquired')).rows[0];
  if(!lock.acquired)return {busy:true,expired:0,purged:0};
  const settings=(await client.query('SELECT * FROM ethiosms.settings')).rows[0];
  const expired=(await client.query(`SELECT r.id FROM ethiosms.message_recipients r JOIN ethiosms.message_jobs j ON j.id=r.job_id
   WHERE r.status='queued' AND j.expires_at<=now() ORDER BY j.expires_at LIMIT 100 FOR UPDATE OF r SKIP LOCKED`)).rows;
  for(const row of expired){await client.query("UPDATE ethiosms.message_recipients SET status='expired',updated_at=now() WHERE id=$1",[row.id]);await settleRecipient(client,row.id,false);}
  await client.query("UPDATE ethiosms.message_recipients SET status='unknown',reconcile_at=NULL,last_error_code='CONFIRMATION_OVERDUE' WHERE status='accepted' AND submitted_at<now()-interval '24 hours'");
  await client.query(`UPDATE ethiosms.message_jobs j SET payload_ciphertext='' WHERE j.kind='otp' AND payload_ciphertext<>'' AND
    (j.expires_at<=now() OR EXISTS(SELECT 1 FROM ethiosms.otp_challenges o WHERE o.job_id=j.id AND (o.consumed_at IS NOT NULL OR o.superseded_at IS NOT NULL OR o.attempts>=o.max_attempts)))`);
  await client.query('DELETE FROM ethiosms.sessions WHERE token_hash IN (SELECT token_hash FROM ethiosms.sessions WHERE expires_at<now() LIMIT 1000)');
  await client.query("DELETE FROM ethiosms.setup_tokens WHERE token_hash IN (SELECT token_hash FROM ethiosms.setup_tokens WHERE expires_at<now() OR consumed_at<now()-interval '24 hours' LIMIT 1000)");
  for(const table of ['auth_limits','api_rate_limits'])await client.query(`DELETE FROM ethiosms.${table} WHERE ctid IN (SELECT ctid FROM ethiosms.${table} WHERE bucket<now()-interval '1 day' LIMIT 1000)`);
  await client.query("DELETE FROM ethiosms.otp_challenges WHERE id IN (SELECT id FROM ethiosms.otp_challenges WHERE expires_at<now()-$1::int*interval '1 hour' LIMIT 1000)",[settings.otp_retention_hours]);
  const jobs=(await client.query(`SELECT j.id FROM ethiosms.message_jobs j WHERE j.created_at<now()-$1::int*interval '1 day'
    AND NOT EXISTS(SELECT 1 FROM ethiosms.message_recipients r WHERE r.job_id=j.id AND (r.status NOT IN ('sent','delivered','failed','expired','unknown','cancelled') OR (NOT r.usage_settled AND EXISTS(SELECT 1 FROM ethiosms.usage_reservations v WHERE v.job_id=j.id))))
    ORDER BY j.created_at LIMIT 50 FOR UPDATE OF j SKIP LOCKED`,[settings.message_retention_days])).rows;
  for(const job of jobs){
   await client.query('DELETE FROM ethiosms.otp_challenges WHERE job_id=$1',[job.id]);
   await client.query('DELETE FROM ethiosms.campaigns WHERE job_id=$1',[job.id]);
   await client.query('DELETE FROM ethiosms.message_attempts WHERE recipient_id IN (SELECT id FROM ethiosms.message_recipients WHERE job_id=$1)',[job.id]);
   await client.query('DELETE FROM ethiosms.message_recipients WHERE job_id=$1',[job.id]);
   await client.query('DELETE FROM ethiosms.usage_reservations WHERE job_id=$1',[job.id]);
   await client.query('DELETE FROM ethiosms.message_jobs WHERE id=$1',[job.id]);
  }
  await client.query("DELETE FROM ethiosms.audit_events WHERE id IN (SELECT id FROM ethiosms.audit_events WHERE created_at<now()-$1::int*interval '1 day' LIMIT 1000)",[settings.audit_retention_days]);
  await client.query("DELETE FROM ethiosms.usage_counters WHERE reserved_segments=0 AND usage_date<(now() AT TIME ZONE 'Africa/Addis_Ababa')::date-90");
  return {busy:false,expired:expired.length,purged:jobs.length};
 });
}
