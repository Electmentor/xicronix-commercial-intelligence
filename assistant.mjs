import {radarNeedsAttention} from './radar-lifecycle.mjs?v=2.46.7';
export const assistantErrors={AUTH_REQUIRED:'Tu sesión no está disponible. Vuelve a ingresar.',PROVIDER_AUTH:'La credencial del proveedor de IA no está habilitada. La administración debe revisarla.',NOT_CONFIGURED:'El servicio de IA aún no está configurado.',PROVIDER_CREDIT:'El proveedor de IA no tiene saldo disponible. La administración debe habilitarlo.',RATE_LIMIT:'Se alcanzó el límite temporal. Espera un minuto y vuelve a enviar.',TIMEOUT:'La respuesta tardó demasiado. Puedes volver a enviar.',PROVIDER_ERROR:'El proveedor de IA no respondió correctamente. Inténtalo de nuevo.',EMPTY_RESPONSE:'No se recibió una respuesta. Inténtalo de nuevo.'};
const fields=['id','name','title','institution_name','status','workflow_status','classification','weighted_score','actionable','signal_summary','next_action','next_action_date','stage','value','currency','due_at','priority','signal_date'];
export function compactRecord(row){return Object.fromEntries(fields.filter(k=>row?.[k]!==undefined).map(k=>[k,typeof row[k]==='string'?row[k].slice(0,700):row[k]]));}
export function buildAssistantContext({page,module,workspace,role,source,records={},failures={},visibleText='',selected=null,priority=null,filters={},visibleMetrics=[]}){
 const relevant=Object.fromEntries(Object.entries(records).map(([key,rows])=>[key,{available:!failures[key],loaded:rows.length,sample_limit:10,sample:failures[key]?[]:rows.slice(0,10).map(compactRecord)}]));
 const pipeline={};for(const row of records.opportunities||[])pipeline[row.stage||'Sin etapa']=(pipeline[row.stage||'Sin etapa']||0)+1;
 return {page,module,workspace,role,source,captured_at:new Date().toISOString(),filters,visible_metrics:visibleMetrics,alerts:(failures.radar?[]:records.radar||[]).filter(r=>r.classification==='CRITICAL'&&radarNeedsAttention(r)).slice(0,10).map(compactRecord),visible_text:visibleText.slice(0,6000),selected:selected?compactRecord(selected):null,executive_priority:priority,pipeline:failures.opportunities?null:pipeline,records:relevant,limitations:Object.keys(failures).filter(k=>failures[k]).map(k=>'Carga no disponible: '+k)};
}
export function createAssistant({panel,messages,form,input,status,contextLabel,send,getContext,identity}){
 let history=[],pending=false,epoch=0,owner=null,controller=null;
 const viewport=()=>{const v=window.visualViewport;panel.style.setProperty('--assistant-viewport-height',(v?.height||innerHeight)+'px');panel.style.setProperty('--assistant-keyboard-offset',Math.max(0,innerHeight-(v?.height||innerHeight)-(v?.offsetTop||0))+'px');};
 window.visualViewport?.addEventListener('resize',viewport);window.visualViewport?.addEventListener('scroll',viewport);viewport();
 const buttons=()=>[...panel.querySelectorAll('[data-ai-prompt],button[type="submit"]')];
 function append(role,text){const a=document.createElement('article');a.className='ai-message '+role;const p=document.createElement('p');p.textContent=text;a.append(p);messages.append(a);messages.scrollTop=messages.scrollHeight;return a;}
 function reset(){epoch++;controller?.abort();history=[];pending=false;owner=identity();messages.replaceChildren();input.value='';status.textContent='';buttons().forEach(b=>b.disabled=false);messages.setAttribute('aria-busy','false');}
 function sync(){if(owner!==identity())reset();const c=getContext();contextLabel.textContent=c.module+' · '+(c.workspace==='admin'?'Dirección':'Comercial')+(c.source==='demo'?' · Demostración':'');}
 async function submit(event){event?.preventDefault();sync();const message=input.value.trim();if(!message||pending)return;if(message.length>2000){status.textContent='Usa hasta 2000 caracteres.';return;}
  const context=getContext(),turn=epoch;pending=true;controller=new AbortController();buttons().forEach(b=>b.disabled=true);messages.setAttribute('aria-busy','true');append('user',message);input.value='';status.textContent='Analizando '+context.module+'…';
  try{const answer=await send({message,history:history.slice(-12),context},controller.signal);if(turn!==epoch)return;append('assistant',answer);history.push({role:'user',content:message},{role:'assistant',content:answer});history=history.slice(-24);status.textContent='Respuesta sobre '+context.module+'.';}
  catch(error){if(turn!==epoch)return;const detail=assistantErrors[error.message]||'No se pudo conectar con el Assistant. Inténtalo de nuevo.';append('system',detail);status.textContent='No se envió correctamente. Puedes reintentar.';if(!input.value)input.value=message;}
  finally{if(turn===epoch){pending=false;buttons().forEach(b=>b.disabled=false);messages.setAttribute('aria-busy','false');}}
 }
 form.addEventListener('submit',submit);input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();form.requestSubmit();}});
 panel.querySelectorAll('[data-ai-prompt]').forEach(b=>b.addEventListener('click',()=>{if(!pending){input.value=b.dataset.aiPrompt;form.requestSubmit();}}));
 return {sync,reset,open(){sync();panel.hidden=false;input.focus();},close(){panel.hidden=true;}};
}
