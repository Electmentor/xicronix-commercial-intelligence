import assert from 'node:assert/strict';
import { requestPublicCompletion } from '../public-chat-provider.mjs';
import { createHandler } from '../api/public-chat.mjs';
const response=(status,headers={})=>new Response('{}',{status,headers});
for (const [status,header,expected] of [[429,'1',2],[429,'60',1],[429,null,1],[401,null,1],[503,null,2],[429,'invalid',1]]) {
 let calls=0,wait=0;
 const result=await requestPublicCompletion(async()=>{calls++;return calls===1?response(status,header?{'retry-after':header}:{}):response(200);},{},{pause:async ms=>{wait+=ms;}});
 assert.equal(calls,expected);assert.equal(result.status,expected===2?200:status);assert.ok(wait<=3000);
}
let calls=0;
await requestPublicCompletion(async()=>{calls++;return response(429,{'retry-after':'1'});},{},{pause:async()=>{}});
assert.equal(calls,2);
const env={GROQ_API_KEY:'synthetic',PUBLIC_CHAT_BRIDGE_TOKEN:'synthetic-bridge'};
const request=messages=>new Request('https://example.test',{method:'POST',headers:{authorization:'Bearer synthetic-bridge','x-chat-client':'a'.repeat(64)},body:JSON.stringify({messages})});
let sent;
const handler=createHandler({env,fetcher:async(_,options)=>{sent=JSON.parse(options.body);return Response.json({choices:[{message:{content:JSON.stringify({message:'Claro, te ayudo.',options:[],handoff:false})}}]});}});
const result=await (await handler(request([{role:'user',content:'quiero una llamada el domingo'}]))).json();
assert.equal(result.provider,'groq');assert.equal(result.degraded,false);assert.match(result.message,/domingos no atendemos/);
assert.ok(sent.messages[0].content.length<5500);assert.equal(sent.max_completion_tokens,1200);
const schema=createHandler({env,fetcher:async()=>Response.json({choices:[{message:{content:'{"message":"incomplete"}'}}]})});
assert.equal((await (await schema(request([{role:'user',content:'hola'}]))).json()).reason,'provider_schema');
console.log('PASS provider: bounded retries, cooldown, authentication path, compact policy, schedule guard, invalid schema');
