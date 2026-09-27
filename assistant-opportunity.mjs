import {normalize} from './domain.mjs';
import {effectiveWorkspace,assignedUserId,scopeWorkspaceData} from './workspace.mjs';
import {isSimulated} from './demo.mjs';
import {queryIntent,dateValue} from './assistant-policy.mjs';

const missing='No tengo evidencia suficiente en A009 para afirmar eso.';
const closed=new Set(['COMPLETED','CANCELLED','WON','LOST']);
const safe=v=>String(v??'').replace(/[\r\n\t]+/g,' ').slice(0,700);
const label=r=>safe(r?.name||r?.title||r?.subject);
const fields={
 opportunities:'id,organization_id,institution_id,contact_id,lead_id,name,stage,value,probability,next_action,next_action_date,expected_close_date,owner_user_id,created_by,updated_at',
 institutions:'id,organization_id,name,city',leads:'id,organization_id,title,status,institution_id,contact_id,owner_user_id,created_by,next_action,next_action_date',
 contacts:'id,organization_id,institution_id,first_name,last_name,job_title,decision_level,created_by',
 activities:'id,organization_id,opportunity_id,lead_id,institution_id,contact_id,type,subject,notes,outcome,budget_signal,need_summary,evidence_note,occurred_at,next_action,next_action_date,action_code,created_by',
 tasks:'id,organization_id,opportunity_id,lead_id,institution_id,title,status,priority,due_at,assigned_to,created_by,updated_at',
 meetings:'id,organization_id,opportunity_id,lead_id,institution_id,contact_id,title,status,start_at,end_at,notes,owner_user_id,created_by,updated_at',
 documents:'id,organization_id,lead_id,institution_id,title,category,status,document_date,notes',
 radar:'id,organization_id,lead_id,institution_id,institution_name,classification,workflow_status,actionable,principal_risk,budget_status,weighted_score,signal_summary,source_url'
};
const stages={NEW:'Nueva',QUALIFICATION:'Calificación',QUALIFIED:'Calificada',PROPOSAL:'Propuesta',NEGOTIATION:'Negociación',WON:'Ganada',LOST:'Perdida'};
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(v);
const stamp=v=>dateValue(v)===null?'sin fecha registrada':new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',dateStyle:'medium'}).format(dateValue(v));

export function chooseOpportunity(rows,{message,selected,activeOpportunity,consumedSelection}={}){
 const q=normalize(message||'');
 if(/^(cerrar contexto|salir de oportunidad|quitar oportunidad activa)[.! ]*$/.test(q))return {cleared:true};
 const explicit=rows.filter(r=>[r.name,r.account_name].some(n=>n&&normalize(n).length>=4&&q.includes(normalize(n))));
 let candidates=explicit;
 if(!candidates.length&&selected&&['opportunities','institutions','leads'].includes(selected.kind)&&JSON.stringify(selected)!==JSON.stringify(consumedSelection)){
  candidates=rows.filter(r=>selected.kind==='opportunities'?r.id===selected.id:selected.kind==='institutions'?r.institution_id===selected.id:r.lead_id===selected.id);
  if(!candidates.length)return {unavailable:true};
 }
 if(candidates.length===1)return {opportunity:candidates[0]};
 if(candidates.length>1)return {choices:candidates.map(r=>({id:r.id,name:r.name}))};
 if(activeOpportunity){const r=rows.find(r=>r.id===activeOpportunity);return r?{opportunity:r}:{unavailable:true};}
 return {};
}

export async function loadOpportunity(payload,auth,authorization,{fetcher=fetch,base,key,now=Date.now()}={}){
 const c=payload.context,limits=[],workspace=effectiveWorkspace(auth,c.workspace);
 if(!c.activeOpportunity&&!c.selected&&queryIntent(payload.message)==='impact')return null;
 const relevant=c.activeOpportunity||['opportunities','institutions','leads'].includes(c.selected?.kind)||c.page==='opportunities'||/oportunidad|prospecto|trabajemos|trabajar con/i.test(payload.message);
 if(!relevant)return null;
 async function read(kind,filters={},limit=101){
  if(c.source==='demo')return (c.records?.[kind]?.sample||[]).filter(r=>Object.entries(filters).every(([k,v])=>v.startsWith('eq.')?String(r[k])===v.slice(3):true));
  const u=new URL(base+'/rest/v1/'+(kind==='radar'?'commercial_radar_dashboard':kind));u.searchParams.set('select',fields[kind]);u.searchParams.set('organization_id','eq.'+auth.organization_id);u.searchParams.set('limit',String(limit));u.searchParams.set('order',kind==='activities'?'occurred_at.desc':'id.asc');
  for(const [k,v] of Object.entries(filters))u.searchParams.set(k,v);
  if(['opportunities','leads','tasks','meetings'].includes(kind)&&workspace!=='admin'){const owner=kind==='tasks'?'assigned_to':'owner_user_id';u.searchParams.set('or','('+owner+'.eq.'+auth.id+',and('+owner+'.is.null,created_by.eq.'+auth.id+'))');}
  try{const res=await fetcher(u,{headers:{apikey:key,Authorization:authorization},signal:AbortSignal.timeout(10000)});if(!res.ok)throw Error();const rows=await res.json();if(!Array.isArray(rows))throw Error();if(rows.length===limit)limits.push(kind+': muestra limitada; puede haber más registros.');return rows.filter(r=>r.organization_id===auth.organization_id&&!isSimulated(r)&&(!['opportunities','leads','tasks','meetings'].includes(kind)||workspace==='admin'||assignedUserId(r)===auth.id));}catch{limits.push(kind+': fuente no disponible.');return [];}
 }
 let rows=await read('opportunities',{},201);
 const named=payload.message.match(/(?:trabajemos (?:con|sobre)|trabajar (?:con|sobre)|oportunidad llamada)\s+[«"]?(.+?)[»"]?[.?!]*$/i)?.[1]?.trim();
 if(named&&/^[\p{L}\p{N} ._-]{3,100}$/u.test(named)){
  const accounts=await read('institutions',{name:'ilike.'+named},21);
  const matches=await read('opportunities',{name:'ilike.*'+named+'*'},101);
  for(const account of accounts)for(const row of await read('opportunities',{institution_id:'eq.'+account.id},101))matches.push({...row,account_name:account.name});
  rows=[...new Map([...rows,...matches].map(r=>[r.id,r])).values()];
 }
 if(uuid(c.activeOpportunity)&&!rows.some(r=>r.id===c.activeOpportunity))rows.push(...await read('opportunities',{id:'eq.'+c.activeOpportunity},1));
 if(c.selected?.kind==='opportunities'&&uuid(c.selected.id)&&!rows.some(r=>r.id===c.selected.id))rows.push(...await read('opportunities',{id:'eq.'+c.selected.id},1));
 // Account names are read only for the selected account or exact named account search.
 if(c.selected?.kind==='institutions'&&uuid(c.selected.id)){const account=await read('institutions',{id:'eq.'+c.selected.id},2);rows=rows.map(r=>({...r,account_name:account.find(a=>a.id===r.institution_id)?.name}));}
 const selection=chooseOpportunity(rows,{...c,message:payload.message});
 if(selection.cleared)return {answer:'Contexto de oportunidad cerrado.',activeOpportunity:null};
 if(selection.choices)return {answer:'Hay varias oportunidades. Selecciona cuál deseas trabajar:\n'+selection.choices.map(r=>r.name).join('\n'),opportunityChoices:selection.choices,activeOpportunity:null};
 if(selection.unavailable)return {answer:'La oportunidad anterior ya no está accesible. Selecciona otra; no cambiaré de oportunidad automáticamente.',activeOpportunity:null};
 if(!selection.opportunity)return /oportunidad|prospecto|trabajemos/i.test(payload.message)?{answer:'Abre una oportunidad o indica su nombre exacto para trabajar con ella.',opportunityChoices:rows.slice(0,6).map(r=>({id:r.id,name:r.name})),activeOpportunity:null}:null;
 const opportunity=selection.opportunity;
 const related={opportunity};
 const jobs=[['institutions',opportunity.institution_id?{id:'eq.'+opportunity.institution_id}:null],['leads',opportunity.lead_id?{id:'eq.'+opportunity.lead_id}:null],['contacts',opportunity.institution_id?{institution_id:'eq.'+opportunity.institution_id}:opportunity.contact_id?{id:'eq.'+opportunity.contact_id}:null],...['activities','tasks','meetings'].map(k=>[k,{opportunity_id:'eq.'+opportunity.id}]),['documents',opportunity.lead_id?{lead_id:'eq.'+opportunity.lead_id}:null],['radar',opportunity.lead_id?{lead_id:'eq.'+opportunity.lead_id}:null]];
 await Promise.all(jobs.map(async([kind,filters])=>{related[kind]=filters?await read(kind,filters,31):[];}));
 // Lead-only history is relevant but explicitly shared by all opportunities of that lead.
 if(opportunity.lead_id)await Promise.all(['activities','tasks','meetings'].map(async kind=>{const extra=await read(kind,{lead_id:'eq.'+opportunity.lead_id,opportunity_id:'is.null'},31);related[kind].push(...extra.filter(r=>!related[kind].some(x=>x.id===r.id)));}));
 const {opportunity:record,...lists}=related;
 const scoped=c.source==='demo'?lists:scopeWorkspaceData({...lists,opportunities:[record]},auth,auth.id,workspace);
 return {context:{...scoped,opportunity:record},limitations:limits,now,source:c.source,activeOpportunity:opportunity.id,activeOpportunityLabel:opportunity.name,stage:stages[opportunity.stage]||opportunity.stage};
}

export function nextBestAction(context,now=Date.now()){
 const o=context.opportunity;
 const tasks=(context.tasks||[]).filter(r=>!closed.has(r.status)).sort((a,b)=>(dateValue(a.due_at)??Infinity)-(dateValue(b.due_at)??Infinity)||a.id.localeCompare(b.id));
 const overdue=tasks.find(r=>dateValue(r.due_at)!==null&&dateValue(r.due_at)<now);
 const meeting=(context.meetings||[]).filter(r=>!closed.has(r.status)&&dateValue(r.start_at)>=now).sort((a,b)=>dateValue(a.start_at)-dateValue(b.start_at))[0];
 const decision=(context.contacts||[]).find(c=>['DECISION_MAKER','FINAL_APPROVER'].includes(c.decision_level));
 if(closed.has(o.stage))return {text:'Revisar el resultado registrado antes de plantear nuevas acciones.',why:'La oportunidad figura cerrada.',source:'Oportunidades',owner:o.owner_user_id,date:null};
 if(overdue)return {text:'Revisar la tarea «'+label(overdue)+'».',why:'Su fecha límite registrada ya pasó.',source:'Tareas',owner:overdue.assigned_to,date:overdue.due_at};
 if(meeting)return {text:'Preparar la reunión «'+label(meeting)+'».',why:'Existe una reunión pendiente registrada.',source:'Agenda',owner:meeting.owner_user_id,date:meeting.start_at};
 if(tasks[0])return {text:'Revisar la tarea «'+label(tasks[0])+'».',why:'Es la tarea abierta con fecha más próxima entre las consultadas.',source:'Tareas',owner:tasks[0].assigned_to,date:tasks[0].due_at};
 if(o.next_action)return {text:'Preparar la próxima acción registrada: '+safe(o.next_action),why:'Es el siguiente paso registrado en la oportunidad.',source:'Oportunidades',owner:o.owner_user_id,date:o.next_action_date};
 return {text:decision?'Definir y registrar el siguiente paso comercial.':'Validar quién decide y registrarlo en Contactos.',why:decision?'No hay próxima acción registrada.':'No consta un contacto clasificado como decisor en los datos consultados.',source:decision?'Oportunidades':'Contactos',owner:o.owner_user_id,date:null};
}

export function opportunityReply(loaded,message,auth){
 if(!loaded.context)return loaded;
 const c=loaded.context,o=c.opportunity,q=normalize(message),intent=queryIntent(message),nba=nextBestAction(c,loaded.now);
 const contacts=c.contacts||[],people=contacts.map(r=>safe([r.first_name,r.last_name].filter(Boolean).join(' '))+(r.job_title?' · '+safe(r.job_title):''));
 const deciders=contacts.filter(r=>['DECISION_MAKER','FINAL_APPROVER'].includes(r.decision_level));
 const history=[...(c.activities||[])].sort((a,b)=>(dateValue(b.occurred_at)||0)-(dateValue(a.occurred_at)||0));
 const latest=history[0];
 const fact=rows=>rows.length?rows.map(r=>safe(r)).join('; '):missing;
 const gaps=[!deciders.length?'Decisor sin identificar':null,!history.some(r=>r.budget_signal)?'Presupuesto sin evidencia registrada':null,!o.next_action?'Siguiente paso sin registrar':null,!o.expected_close_date?'Fecha de cierre sin registrar':null].filter(Boolean);
 const source='Fuente: A009 · '+label(o)+'.';
 let answer;
 if(intent==='audit')answer='Detalle técnico\n'+JSON.stringify({opportunity_id:o.id,as_of:new Date(loaded.now).toISOString(),sources:Object.fromEntries(Object.entries(c).filter(([k])=>k!=='opportunity').map(([k,v])=>[k,v.map(r=>r.id)])),ranking:'tarea vencida → reunión pendiente → tarea próxima → acción registrada → faltantes',limitations:loaded.limitations},null,2);
 else if(intent==='brief'||intent==='clarify')answer=(intent==='clarify'?'En sencillo: ':'Resumen: ')+label(o)+' · '+loaded.stage+'.\nRecomendación: '+nba.text+'\n'+nba.why;
 else if(/quien decide|decisor/.test(q))answer=deciders.length?'Decisores registrados: '+deciders.map(r=>safe(r.first_name+' '+(r.last_name||''))+(r.job_title?' · '+safe(r.job_title):'')).join('; '):missing+' No consta un decisor identificado.';
 else if(/con quien|contactos/.test(q))answer='Contactos registrados: '+fact(people)+'. No se presume autoridad de compra por el cargo.';
 else if(/ultimo contacto|historial/.test(q))answer=latest?'Último movimiento registrado: '+label(latest)+' · '+stamp(latest.occurred_at)+'.\n'+safe(latest.notes):missing;
 else if(/presupuesto/.test(q))answer='Presupuesto registrado: '+fact(history.filter(r=>r.budget_signal).slice(0,3).map(r=>r.budget_signal))+'. El valor de la oportunidad no acredita presupuesto aprobado.';
 else if(/objecion/.test(q))answer='Objeciones: '+fact(history.filter(r=>/objeci[oó]n/i.test(r.subject||'')).map(r=>r.notes||r.subject))+'.';
 else if(/riesgo|bloque/.test(q))answer='Riesgos registrados en Radar: '+fact((c.radar||[]).filter(r=>r.principal_risk).map(r=>r.principal_risk))+'\nFaltantes por validar (no prueban un bloqueo): '+gaps.join('; ')+'.';
 else if(/que falta/.test(q))answer='Falta validar o registrar: '+(gaps.join('; ')||'No se detectan faltantes en los campos revisados; esto no acredita que la venta esté lista.')+'.';
 else if(/vence|fecha limite/.test(q))answer='Cierre previsto: '+stamp(o.expected_close_date)+'. Seguimiento: '+stamp(o.next_action_date)+'.';
 else if(intent==='authorization'||/^(envia|contacta|acepta|cierra|marca.*ganad|marca.*perdid)/.test(q))answer='Requiere autorización: contactar al cliente, enviar propuestas, comprometer precio o términos, cambiar etapa o cerrar la oportunidad. Leer, analizar y preparar borradores está permitido. No se ha ejecutado ninguna acción externa.';
 else if(/que debo registrar|despues de la reunion/.test(q))answer='Para registrar el resultado: ¿qué ocurrió y qué acordaron?, ¿quién participó o decidió?, ¿hubo objeciones?, ¿cuál es el siguiente paso, responsable y fecha acordada?\nEscribe «Registra resultado de reunión: …» con lo confirmado. Prepararé el registro para revisarlo antes de guardar; no completaré acuerdos ausentes.';
 else if(/(?:prepara|redacta).*(correo|propuesta)/.test(q))answer='Borrador para revisar — no enviado\nAsunto: '+label(o)+'\nHola, quisiera validar el alcance de esta oportunidad y el siguiente paso. ¿Podrían confirmar las necesidades, las personas que participan en la decisión y la fecha prevista para revisarlas?\nBase disponible: etapa '+loaded.stage+'. '+(o.next_action?'Siguiente paso registrado: '+safe(o.next_action):'No consta siguiente paso.')+'\nPendiente antes de una propuesta comercial: confirmar alcance, precio y condiciones. No se ofrece ningún importe ni compromiso.\nHuman Gate: requiere autorización antes de enviar.';
 else if(/prepar|que deberia decir|reunion|hablar con/.test(q)&&!/^(registra|guarda)/.test(q))answer='Objetivo recomendado: validar el siguiente paso de «'+label(o)+'».\nPersonas registradas: '+fact(people)+'\nQué sabemos: etapa '+loaded.stage+'.\nQué falta saber: '+(gaps.join('; ')||'Confirmar vigencia de los datos registrados.')+'\nPreguntas sugeridas: ¿Quién aprueba la compra? ¿Qué alcance necesitan validar? ¿Qué siguiente paso y fecha podemos acordar?\nRiesgos registrados: '+fact((c.radar||[]).filter(r=>r.principal_risk).map(r=>r.principal_risk))+'\nObjeciones conocidas: '+fact(history.filter(r=>/objeci[oó]n/i.test(r.subject||'')).map(r=>r.notes||r.subject))+'\nResultado deseado (recomendación): documentar acuerdos, responsable y seguimiento.\nHuman Gate: requiere autorización para enviar o comprometer condiciones; este texto es preparación.';
 else if(/propuesta/.test(q))answer='Documentos registrados: '+fact((c.documents||[]).map(r=>label(r)+' · '+safe(r.category)+' · '+safe(r.status)))+'\nMovimientos de propuesta: '+fact(history.filter(r=>/PROPOSAL/.test(r.action_code||'')).map(r=>label(r)+' · '+stamp(r.occurred_at)))+'. No se ha leído el contenido de archivos adjuntos.';
 else if(intent==='next'||intent==='priority'||intent==='why')answer='Siguiente acción\nRecomendación: '+nba.text+'\nPor qué\n'+nba.why+'\nQuién debe actuar\n'+(nba.owner===auth.id?'Tú, como responsable registrado.':nba.owner?'El responsable asignado en A009.':'Responsable sin registrar.')+'\nFecha o urgencia\n'+stamp(nba.date)+'\nHuman Gate\nPuedes revisar y preparar; ejecutar acciones externas o cambiar condiciones requiere autorización.\nFuente: '+nba.source+'.';
 else if(/que sabemos|resumir pantalla|resumen ejecutivo|trabajemos|trabajar con|mejorar esta pantalla/.test(q))answer='Oportunidad: '+label(o)+'\nInstitución: '+(label(c.institutions?.[0])||missing)+'\nEtapa: '+loaded.stage+'\nValor registrado: '+(o.value==null?missing:o.value+' PEN')+'\nProbabilidad manual registrada: '+(o.probability==null?missing:o.probability+'% (no es una predicción)')+'\nPróximo paso recomendado: '+nba.text;
 else answer=missing+' Mantengo «'+label(o)+'» como oportunidad activa. Puedes consultar decisores, presupuesto, riesgos, próximo paso o preparar una reunión.';
 const draft=prepareOpportunityAction(c,message,auth);
 if(draft)answer=draft.answer;
 return {...loaded,context:undefined,answer:(loaded.source==='demo'?'DEMOSTRACIÓN — datos sintéticos.\n':'')+answer+'\n'+source+(loaded.limitations.length?'\nLímites: '+loaded.limitations.join(' '):''),action:draft?.action,actions:draft?.actions,focus:'opportunities:'+o.id};
}

export function prepareOpportunityAction(c,message,auth){
 const q=normalize(message),o=c.opportunity;
 if(!/^(registra|guarda|crea|actualiza|mueve|cambia)/.test(q))return null;
 if(auth.role==='VIEWER')return {answer:'Requiere autorización: tu perfil permite solo lectura.'};
 const initial={institution_id:o.institution_id,contact_id:o.contact_id,lead_id:o.lead_id,opportunity_id:o.id};
 if(/^(registra|crea) (un )?contacto/.test(q))return {answer:'Abre el formulario de contacto para registrar solo los datos confirmados. El cargo no acredita autoridad de compra.',action:{table:'contacts',initial:{institution_id:o.institution_id,opportunity_id:o.id,decision_level:'UNKNOWN'}}};
 if(/^actualiza.*tarea/.test(q))return {answer:'Selecciona la tarea que quieres revisar antes de guardar el cambio.',actions:(c.tasks||[]).filter(r=>!closed.has(r.status)).map(r=>({table:'tasks',id:r.id,label:r.title,initial:{opportunity_id:o.id}}))};
 if(/^(crea|registra) (una )?tarea/.test(q))return {answer:'Preparé una tarea para esta oportunidad. Revisa el título, responsable y fecha en el formulario antes de guardarla.',action:{table:'tasks',initial:{...initial,title:message.replace(/^(crea|registra) (una )?tarea\s*:?\s*/i,'')}}};
 if(/^(registra|guarda)/.test(q))return {answer:'Preparé el registro con tus palabras. Revisa lo ocurrido, el canal y los acuerdos antes de guardarlo en A009.',action:{table:'activities',initial:{...initial,subject:/objecion/.test(q)?'Objeción registrada':/reunion/.test(q)?'Resultado de reunión':'Nota comercial',notes:message,type:'NOTE'}}};
 return {answer:'Requiere revisión y autorización en el formulario de la oportunidad antes de guardar un cambio material.',action:{table:'opportunities',id:o.id}};
}
