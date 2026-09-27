const env=process.env.VERCEL_ENV||'local';
if(env!=='production'&&!process.env.GROQ_API_KEY){
 console.log('ASSISTANT_PROVIDER_CHECK_SKIPPED '+JSON.stringify({env,reason:'GROQ_API_KEY_NOT_CONFIGURED_OUTSIDE_PRODUCTION'}));
 process.exit(0);
}
import {generateResponse} from '../api/assistant.mjs';
import {buildEvidence,queryIntent,renderEvidence,POLICY_VERSION} from '../assistant-policy.mjs';
const records={radar:[{id:'validation-critical',institution_name:'Caso sintético de validación',classification:'CRITICAL',weighted_score:95,workflow_status:'PENDING',actionable:false,signal_date:'2026-09-26'}],opportunities:[{id:'validation-opportunity',name:'Oportunidad sintética',stage:'PROPOSAL',value:1000,currency:'PEN',next_action:'Enviar propuesta'}]};
try {
 const model=process.env.ASSISTANT_MODEL||'openai/gpt-oss-120b';
 const questions=['¿Qué es lo más importante que debo hacer hoy?','¿Por qué?','¿Qué hago después?','¿Qué requiere autorización?','¿Qué oportunidades tienen mayor impacto?','¿Cuál es el teléfono del contacto?'];
 const results=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 for(const message of questions){
  const evidence=buildEvidence({records:message===questions[5]?{}:records,role:'ADMIN',page:'dashboard',source:'synthetic',now:Date.parse('2026-09-27T20:00:00Z'),intent:queryIntent(message),focus:'radar:validation-critical'});
  let plan;for(let attempt=0;attempt<3;attempt++){try{plan=await generateResponse({key:process.env.GROQ_API_KEY,model,payload:{message,history:[],evidence}});break;}catch(error){if(error.message!=='RATE_LIMIT'||attempt===2)throw error;console.log('ASSISTANT_CHECK_COOLDOWN '+evidence.intent);await pause(error.retryAfterMs||30000);}}
  const answer=renderEvidence(evidence,plan);if(!answer.trim())throw Error('EMPTY_RESPONSE');
  if(message===questions[5]&&!answer.includes('No tengo evidencia suficiente en el CRM'))throw Error('UNSUPPORTED_EVIDENCE');
  results.push({intent:evidence.intent,verified:true,responseCharacters:answer.length});console.log('ASSISTANT_CHECK_VERIFIED '+evidence.intent);if(message!==questions.at(-1))await pause(15000);
 }
 console.log('ASSISTANT_PROVIDER_VERIFIED '+JSON.stringify({provider:'Groq',model,policy:POLICY_VERSION,checks:results}));
} catch(error) {
 if(['JSON_PARSE','REFERENCE_OR_SCHEMA'].includes(error.validation))console.error('ASSISTANT_VALIDATION_STAGE '+error.validation);
 console.error('ASSISTANT_PROVIDER_NOT_VERIFIED '+(['NOT_CONFIGURED','PROVIDER_CREDIT','PROVIDER_AUTH','RATE_LIMIT','PROVIDER_ERROR','EMPTY_RESPONSE','UNSUPPORTED_EVIDENCE'].includes(error.message)?error.message:'UNAVAILABLE'));
 process.exitCode=1;
}
