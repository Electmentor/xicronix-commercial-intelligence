const PROVIDERS={
  groq:{
    id:'groq',
    name:'Groq',
    endpoint:'https://api.groq.com/openai/v1/responses',
    defaultModel:'openai/gpt-oss-120b',
    keyEnv:'GROQ_API_KEY'
  }
};

export function resolveAssistantProvider(env=process.env){
  const id=String(env.ASSISTANT_PROVIDER||'groq').trim().toLowerCase();
  const spec=PROVIDERS[id];
  if(!spec)throw Error('PROVIDER_NOT_SUPPORTED');
  return {
    ...spec,
    key:env[spec.keyEnv]||null,
    model:env.ASSISTANT_MODEL||spec.defaultModel
  };
}

export async function requestStructuredPlan({provider,payload,schema,instructions,fetcher=fetch}){
  if(!provider?.key)throw Error('NOT_CONFIGURED');
  const started=Date.now();
  const response=await fetcher(provider.endpoint,{
    method:'POST',
    headers:{Authorization:'Bearer '+provider.key,'Content-Type':'application/json'},
    signal:AbortSignal.timeout(35000),
    body:JSON.stringify({
      model:provider.model,
      store:false,
      max_output_tokens:1800,
      text:{format:{type:'json_schema',name:'evidence_plan',strict:true,schema}},
      instructions,
      input:[{
        role:'user',
        content:JSON.stringify({
          context:{
            policy:payload.evidence.policy,
            page:payload.evidence.page,
            intent:payload.evidence.intent,
            source:payload.evidence.source,
            ranked_records:payload.evidence.items.map(x=>({id:x.id,title:x.title,gate:x.gate.state})),
            facts:payload.evidence.facts.map(({id,field,value})=>({id,field,value})),
            recommendations:payload.evidence.recommendations,
            limitations:payload.evidence.limitations
          },
          request:payload.message,
          previous_questions:payload.history.filter(x=>x.role==='user').slice(-3).map(x=>x.content)
        })
      }]
    })
  });
  const result=await response.json();
  console.info('ASSISTANT_USAGE',JSON.stringify({
    provider:provider.name,
    model:provider.model,
    latency_ms:Date.now()-started,
    status:response.status,
    input_tokens:result.usage?.input_tokens??null,
    output_tokens:result.usage?.output_tokens??null,
    total_tokens:result.usage?.total_tokens??null
  }));
  if(!response.ok){
    if(['insufficient_quota','credit_balance_exhausted'].includes(result.error?.code))throw Error('PROVIDER_CREDIT');
    if(response.status===401||response.status===403)throw Error('PROVIDER_AUTH');
    if(response.status===429)throw Object.assign(Error('RATE_LIMIT'),{retryAfterMs:Math.min(60000,Math.max(15000,(Number(response.headers.get('retry-after'))||30)*1000))});
    throw Error('PROVIDER_ERROR');
  }
  const answer=(result.output||[])
    .flatMap(x=>x.content||[])
    .filter(x=>x.type==='output_text')
    .map(x=>x.text)
    .join('\n')
    .trim();
  if(!answer)throw Error('EMPTY_RESPONSE');
  return answer;
}
