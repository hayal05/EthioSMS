import { EthioSMS } from './client.mjs';
/** Call from a server-side ERP outbox worker AFTER the leave approval transaction commits.
 * eventId must be persisted with that approval event and reused on retry.
 * This module does not create clients or send anything on import.
 */
export async function notifyLeaveDecision({eventId,employeePhone,decision,client}) {
  if(!['approved','rejected'].includes(decision))throw new Error('Unsupported leave decision');
  const sms=client??new EthioSMS({baseUrl:process.env.ETHIOSMS_BASE_URL,apiKey:process.env.ETHIOSMS_API_KEY});
  return sms.send({to:employeePhone,eventId,message:`Your leave request was ${decision}. Sign in to your employee account for details.`});
}
