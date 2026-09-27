import {generateResponse} from '../api/assistant.mjs';
try {
 const model=process.env.ASSISTANT_MODEL||'openai/gpt-oss-120b';
 const answer=await generateResponse({key:process.env.GROQ_API_KEY,model,payload:{message:'Responde brevemente indicando que recibiste esta prueba técnica. No hay datos comerciales.',history:[],context:{page:'deployment-validation',module:'Validación técnica',source:'synthetic',records:{}}}});
 if(!answer.trim())throw Error('EMPTY_RESPONSE');
 console.log('ASSISTANT_PROVIDER_VERIFIED '+JSON.stringify({provider:'Groq',model,responseCharacters:answer.length}));
} catch(error) {
 console.error('ASSISTANT_PROVIDER_NOT_VERIFIED '+(['NOT_CONFIGURED','PROVIDER_CREDIT','PROVIDER_AUTH','RATE_LIMIT','PROVIDER_ERROR','EMPTY_RESPONSE'].includes(error.message)?error.message:'UNAVAILABLE'));
 process.exitCode=1;
}
