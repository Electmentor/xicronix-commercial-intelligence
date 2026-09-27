import {normalize} from './domain.mjs';
import {radarNeedsAttention} from './radar-lifecycle.mjs';
export const POLICY_VERSION='a009-evidence-v1.1';
export const MISSING='No tengo evidencia suficiente en el CRM';
export const KINDS=['radar','tasks','opportunities','leads','meetings'];
export const LABELS={radar:'Radar',tasks:'Tareas',opportunities:'Oportunidades',leads:'Leads',meetings:'Agenda'};
const CLOSED=new Set(['RESOLVED','DISCARDED','WON','LOST','COMPLETED','CANCELLED','DISQUALIFIED','CONVERTED']);
const clean=v=>String(v??'').replace(/[\r\n\t]+/g,' ').slice(0,160);
const numeric=v=>v!==null&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const day=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(value);
export function dateValue(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value))return null;const ms=Date.parse(value.length===10?value+'T23:59:59-05:00':value);return Number.isFinite(ms)?ms:null;}
export function queryIntent(message){const q=normalize(message).trim().replace(/^[¿¡\s]+|[?!¡¿.,\s]+$/g,'').replace(/[, ]*por favor$/,'').trim();if(/^(hola|buenos dias|buenas tardes|buenas noches|buenas|hey|gracias)[!.,\s]*$/.test(q))return 'greeting';if(/^(resumido|mas breve|mas corto|en pocas palabras|resumelo|resumeme eso|resume eso|breve)[!.,\s]*$/.test(q))return 'brief';if(/no (te )?entiendo|no entendi|mas claro|explicamelo|explicame eso|en sencillo/.test(q))return 'clarify';if(/detalle tecnico|fuentes tecnicas|trazabilidad|ids? del registro/.test(q))return 'audit';if(/autoriz|human.?gate|permiso/.test(q))return 'authorization';if(/oportunidad.*(impact|valor|mayor)|mayor.*oportunidad/.test(q))return 'impact';if(/por que|porque/.test(q))return 'why';if(/despues|siguiente|que hago/.test(q))return 'next';if(/importante|prioridad|atencion|urgente|hacer hoy/.test(q))return 'priority';if(/mejor/.test(q))return 'improve';return 'summary';}
export function humanGate(kind,row,role){
 // No generic approval ledger exists in this CRM. Do not infer approval from role or opening a record.
 if(role==='VIEWER')return {state:'REQUIRED',label:'Requiere autorización',reason:'El perfil es de solo lectura.',source:'profiles.role'};
 if(kind==='radar'&&row.actionable!==true)return {state:'REQUIRED',label:'Requiere autorización',reason:'La señal no está habilitada como actionable=true; requiere revisión humana antes de activarla.',source:'commercial_radar_dashboard.actionable'};
 if(/enviar|contactar|llamar|publicar|comprar|pagar|aprobar|contratar|eliminar|promover|crear|convertir/.test(normalize(row.next_action||'')))return {state:'REQUIRED',label:'Requiere autorización',reason:'La acción registrada implica comunicación o cambio externo; esta política exige confirmación humana.',source:'política '+POLICY_VERSION+' / next_action'};
 return {state:'UNKNOWN',label:'Autorización no acreditada',reason:'No hay un registro general de autorizaciones disponible. La revisión de evidencia sí puede proponerse; ejecutar cambios requiere confirmación humana.',source:'política '+POLICY_VERSION};
}
export function buildEvidence({records={},limitations=[],page='dashboard',role='VIEWER',now=Date.now(),source='live',focus=null,intent='priority',selected=null}){
 const items=[];
 for(const kind of KINDS)for(const row of records[kind]||[]){
  if(!row.id)continue;const prioritizing=!['summary','improve'].includes(intent);if(prioritizing&&(CLOSED.has(row.status)||CLOSED.has(row.stage)||CLOSED.has(row.workflow_status)||(kind==='radar'&&!radarNeedsAttention(row))))continue;
  const signalDate=dateValue(row.signal_date);if(prioritizing&&kind==='radar'&&signalDate!==null&&day(signalDate)>day(now))continue;
  const status=row.workflow_status||row.stage||row.status||null;
  const deadlineField=kind==='tasks'?'due_at':kind==='meetings'?'start_at':kind==='leads'&&!row.first_human_response_at&&row.attention_due_at?'attention_due_at':row.next_action_date?'next_action_date':kind==='opportunities'?'expected_close_date':null;
  const deadline=dateValue(row[deadlineField]);
  const due=deadline===null?0:deadline<now?3:day(deadline)===day(now)?2:deadline-now<=72*3600000?1:0;
  const critical={CRITICAL:4,HIGH:3,MEDIUM:2,LOW:1,POTENTIAL:2,OBSERVE:1}[row.classification||row.priority]||0;
  const value=numeric(kind==='leads'?row.estimated_value:kind==='opportunities'?row.value:null);
  const currency=value===null?null:(row.currency||'PEN');
  const impact=value!==null&&value>=0&&currency==='PEN'?value:0;
  const blocked=kind==='radar'&&row.actionable===false?1:0;
  const recent=signalDate===null?0:now-signalDate<=7*86400000?2:now-signalDate<=30*86400000?1:0;
  const score=numeric(row.weighted_score);
  const facts={};
  for(const field of ['status','stage','workflow_status','classification','priority','weighted_score','actionable','due_at','start_at','end_at','next_action_date','expected_close_date','attention_due_at','first_human_response_at','signal_date','updated_at'])if(row[field]!==null&&row[field]!==undefined)facts[field]=row[field];
  if(value!==null){facts[kind==='leads'?'estimated_value':'value']=value;facts.currency=currency;}
  if(row.next_action)facts.next_action=clean(row.next_action);
  const gate=humanGate(kind,row,role),id=kind+':'+row.id;
  const reason=[critical?'criticidad registrada: '+clean(row.classification||row.priority):null,deadline!==null?'fecha registrada ('+deadlineField+'): '+clean(row[deadlineField]):null,value!==null?'importe registrado: '+value+' '+currency:null,blocked?'bloqueo: actionable=false':null,score!==null?'weighted_score: '+score:null].filter(Boolean);
  const missing=[];if(deadline===null)missing.push('fecha de próxima atención');if(kind==='opportunities'&&value===null)missing.push('valor comercial');if(!row.next_action&&['leads','opportunities'].includes(kind))missing.push('próxima acción');
  items.push({id,kind,record_id:row.id,title:clean(row.title||row.name||row.institution_name||'Registro sin título'),status,facts,gate,missing,reason,rank:[critical,due,impact,blocked,recent,score??-1],deadline,due_label:due===3?'vencimiento superado':due===2?'vencimiento hoy':due===1?'vencimiento en las próximas 72 h':null,source:LABELS[kind]+' · '+row.id,recommendation:gate.state==='REQUIRED'?'Solicitar autorización antes de ejecutar; revisar primero el registro.':missing.length?'Revisar el registro y completar '+missing.join(', ')+' antes de decidir.':row.next_action?'Revisar la próxima acción registrada y confirmar autorización antes de ejecutarla.':kind==='tasks'?'Revisar el estado de la tarea; registrar su resultado solo cuando exista evidencia.':kind==='meetings'?'Revisar horario y estado registrados antes de confirmar la reunión.':'Revisar la evidencia de la señal antes de decidir su siguiente paso.'});
 }
 const compare=(a,b)=>{for(let i=0;i<a.rank.length;i++)if(a.rank[i]!==b.rank[i])return b.rank[i]-a.rank[i];return (a.deadline??Infinity)-(b.deadline??Infinity)||a.id.localeCompare(b.id);};
 items.sort(compare);
 let ranked=items;
 if(intent==='impact'){ranked=items.filter(x=>x.kind==='opportunities'&&x.facts.value!==undefined&&x.facts.currency==='PEN').sort((a,b)=>b.facts.value-a.facts.value||compare(a,b));if(items.some(x=>x.kind==='opportunities'&&(x.facts.value===undefined||x.facts.currency!=='PEN')))limitations=[...limitations,'Impacto: comparación por valor registrado en PEN; faltantes y otras monedas no son comparables sin evidencia adicional.'];}
 if(intent==='authorization')ranked=items.filter(x=>x.gate.state==='REQUIRED');
 const focusItem=items.find(x=>x.id===focus);
 const selectedItem=items.find(x=>x.record_id===selected?.id&&x.kind===selected?.kind);
 const main=['why','next','brief','clarify','audit'].includes(intent)&&focusItem?focusItem:selectedItem&&['summary','improve'].includes(intent)?selectedItem:ranked[0];
 const candidates=[...(main?[main]:[]),...ranked.filter(x=>x.id!==main?.id)].slice(0,4);
 const facts=candidates.flatMap(item=>Object.entries(item.facts).map(([field,value])=>({id:item.id+'/'+field,record:item.id,field,value,source:item.source+' · '+item.title+' · '+field}))).slice(0,48);
 const recommendations=candidates.map(item=>({id:item.id+'/review',record:item.id,text:item.recommendation,source:item.source}));
 return {policy:POLICY_VERSION,page,intent,source,as_of:new Date(now).toISOString(),timezone:'America/Lima',scope:'Registros abiertos accesibles del ámbito consultado',limitations:[...limitations,...(source!=='live'?['Demostración: estos datos no constituyen evidencia real del CRM.']:[]),...(focus&&!focusItem&&['why','next','brief','clarify','audit'].includes(intent)?['El asunto anterior ya no está pendiente o no está accesible; se actualizó la prioridad.']:[])],items:candidates,facts,recommendations,focus:main?.id||null,retained_focus:!!(focusItem&&['why','next','brief','clarify','audit'].includes(intent)),ranking_rule:'criticidad > vencimiento > importe registrado PEN > bloqueo explícito > actualidad de señal > weighted_score > fecha > id',authorization_note:'Sin registro general de aprobaciones: ausencia de restricción explícita no equivale a permiso.'};
}
export function validatePlan(plan,evidence){
 if(!plan||typeof plan!=='object'||Array.isArray(plan)||Object.keys(plan).some(k=>!['evidence_ids','recommendation_ids','insufficient'].includes(k))||!Array.isArray(plan.evidence_ids)||!Array.isArray(plan.recommendation_ids)||typeof plan.insufficient!=='boolean'||plan.evidence_ids.length>6||plan.recommendation_ids.length>3)throw Error('UNSUPPORTED_EVIDENCE');
 if(plan.evidence_ids.some(id=>!evidence.facts.some(f=>f.id===id))||plan.recommendation_ids.some(id=>!evidence.recommendations.some(r=>r.id===id)))throw Error('UNSUPPORTED_EVIDENCE');return plan;
}
const WORDS={PENDING:'pendiente',IN_PROGRESS:'en curso',COMPLETED:'completada',CANCELLED:'cancelada',OVERDUE:'vencida',CRITICAL:'crítica',HIGH:'alta',MEDIUM:'media',LOW:'baja',DETECTED:'detectada',RESEARCHING:'en investigación',IN_REVIEW:'en revisión',RESOLVED:'resuelta',DISCARDED:'descartada',PROPOSAL:'propuesta',NEGOTIATION:'negociación',WON:'ganada',LOST:'perdida',CONTACT_PENDING:'por contactar',CONTACTED:'contactada',QUALIFIED:'calificada',NEW:'nuevo',CONFIRMED:'confirmada',SCHEDULED:'programada'};
const FIELD_LABELS={status:'Estado',stage:'Etapa',workflow_status:'Estado de revisión',classification:'Importancia',priority:'Prioridad',weighted_score:'Puntuación de Radar',actionable:'Habilitada para avanzar',due_at:'Fecha límite',start_at:'Inicio',end_at:'Fin',next_action_date:'Próximo seguimiento',expected_close_date:'Cierre previsto',attention_due_at:'Atención prevista',first_human_response_at:'Primera respuesta',signal_date:'Fecha de señal',updated_at:'Actualización',value:'Importe registrado',estimated_value:'Valor estimado',currency:'Moneda',next_action:'Próxima acción registrada'};
function readableFact(field,value){if(/_at$|_date$/.test(field)&&dateValue(value)!==null)return new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',day:'numeric',month:'short',year:'numeric',...(String(value).length>10?{hour:'2-digit',minute:'2-digit'}:{})}).format(dateValue(value));if(typeof value==='boolean')return value?'sí':'no';return WORDS[value]||clean(value);}
function simpleReason(item){const parts=[];const importance=item.facts.priority||item.facts.classification;if(importance)parts.push('está marcada con prioridad '+(WORDS[importance]||clean(importance)));if(item.due_label)parts.push(item.due_label==='vencimiento superado'?'su fecha límite ya pasó':item.due_label==='vencimiento hoy'?'vence hoy':'vence en las próximas 72 horas');if(!parts.length&&item.facts.value!==undefined)parts.push('tiene un importe registrado de '+item.facts.value+' '+item.facts.currency);return parts.length?parts.join(' y ')+'.':'Es el primer asunto según los datos disponibles; no hay suficiente detalle para afirmar que sea urgente.';}
function simpleAction(item){if(item.gate.state==='REQUIRED')return 'Requiere autorización. Recomendación: revisa el registro y solicita autorización antes de actuar.';if(item.facts.next_action)return 'Recomendación: revisa «'+item.facts.next_action+'» y confirma el permiso antes de ejecutarla.';return item.kind==='tasks'?'Recomendación: abre esta tarea y define el primer paso; no veo un primer paso detallado en los datos consultados.':'Recomendación: '+item.recommendation;}
export function renderConversation(evidence){
 const item=evidence.items[0],intro=evidence.source!=='live'?'Demostración. ':'';
 const limits=evidence.limitations.length?'\nNota: '+evidence.limitations.join(' '):'';
 if(!item)return intro+'El asunto anterior ya no está pendiente o no está disponible. '+MISSING+' para señalar otro.'+limits;
 const source='Fuente: '+LABELS[item.kind]+' · '+item.title+'.';
 if(['brief','clarify'].includes(evidence.intent))return intro+(evidence.intent==='clarify'?'Dicho de forma sencilla: ':'Primero: ')+item.title+'.\n'+simpleReason(item)+'\n'+simpleAction(item)+'\nFuente: '+LABELS[item.kind]+'.'+limits;
 const title=evidence.intent==='next'?'Siguiente paso':evidence.intent==='why'?'Por qué esta prioridad':'Prioridad #1';
 const reason=evidence.intent==='impact'?'Tiene un importe registrado de '+item.facts.value+' '+item.facts.currency+'; la comparación usa ese importe, no una estimación de éxito.':simpleReason(item);
 const secondary=['priority','impact','authorization'].includes(evidence.intent)?evidence.items.slice(1,3).map(x=>x.title+(x.gate.state==='REQUIRED'?' (requiere autorización)':'')).join('; '):'';
 return intro+title+'\n'+item.title+'\nPor qué\n'+reason+'\nSiguiente acción\n'+simpleAction(item)+'\n'+source+(secondary?'\nDespués: '+secondary+'.':'')+limits;
}
export function renderEvidence(evidence,plan){
 validatePlan(plan,evidence);const main=evidence.items[0];const intro=evidence.source!=='live'?'DEMOSTRACIÓN — no son datos reales.\n':'';
 const limits=evidence.limitations.length?'\nAlcance: '+evidence.limitations.join(' '):'';
 if(!main)return intro+MISSING+(evidence.intent==='authorization'?'. No puedo confirmar qué asuntos requieren autorización con los registros disponibles.':' para identificar una prioridad válida.')+'\n'+evidence.authorization_note+limits;
 if(['priority','why','next','impact','authorization','brief','clarify'].includes(evidence.intent))return renderConversation(evidence);
 const reason=main.reason.length?main.reason.join('; '):MISSING+' para justificar urgencia o impacto';
 if(evidence.intent==='audit'){
  const basis=evidence.intent==='impact'?'comparación por importe registrado, no por probabilidad de cierre ni rentabilidad':'criticidad → vencimiento → importe PEN → bloqueo → actualidad → weighted_score (regla '+evidence.policy+')';
  return intro+'Prioridad #1\n'+main.title+'\nPor qué\nDato CRM: '+reason+'.\nInferencia: '+(evidence.retained_focus?'se conserva el asunto anterior; se justifica con ':'primero según ')+basis+' dentro del ámbito consultado.'+(main.due_label?' Cálculo al momento de consulta: '+main.due_label+'.':'')+'\nSiguiente acción\n'+main.gate.label+(evidence.intent==='authorization'?': '+main.gate.reason+' Fuente de restricción: '+main.gate.source:'')+'. Recomendación: '+main.recommendation+(main.facts.next_action?' Acción registrada (no ejecutada): «'+main.facts.next_action+'».':'')+'\nFuente\n'+main.source+' · campos: '+Object.keys(main.facts).join(', ')+' · consulta '+evidence.as_of+'\n'+evidence.items.slice(1,4).map((x,i)=>'Secundaria '+(i+1)+': '+x.title+' — '+x.gate.label+' ('+x.source+').').join('\n')+'\n'+evidence.authorization_note+limits;
 }
 const facts=[...new Set(plan.evidence_ids)].map(id=>evidence.facts.find(f=>f.id===id));
 const recommendations=[...new Set(plan.recommendation_ids)].map(id=>evidence.recommendations.find(r=>r.id===id));
 if(plan.insufficient||!facts.length)return intro+MISSING+'.'+limits;
 return intro+facts.map(f=>(FIELD_LABELS[f.field]||f.field)+': '+readableFact(f.field,f.value)+' — '+LABELS[evidence.items.find(x=>x.id===f.record).kind]+': '+evidence.items.find(x=>x.id===f.record).title+'.').join('\n')+(recommendations.length?'\n'+recommendations.map(r=>'Recomendación: '+r.text+'\nFuente: '+LABELS[evidence.items.find(x=>x.id===r.record).kind]+' · '+evidence.items.find(x=>x.id===r.record).title).join('\n'):'')+limits;
}
