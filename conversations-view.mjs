import {escapeHTML as esc} from './domain.mjs';
const labels={new:'Nueva',active:'En atención',waiting:'Esperando respuesta',resolved:'Resuelta',pending:'Pendiente de envío',accepted:'Aceptado por Nexa',delivered:'Entregado al navegador',received:'Recibido',draft:'Propuesta por revisar',cancelled:'Cancelado',failed:'Fallido',uncertain:'Resultado por comprobar',read:'Lectura confirmada'};
export function createConversationsView(root,{request,contacts=[],users=[],opportunities=[]}) {
 let rows=[],selected=null,detail=null,channel='',owner='',pending=true,oldest=false,alive=true,busy=false;
 const name=(id,items)=>{const x=items.find(r=>r.id===id);return x?.full_name||[x?.first_name,x?.last_name].filter(Boolean).join(' ')||x?.name||id;};
 const status=document.createElement('p');status.setAttribute('role','status');
 const body=document.createElement('div');root.replaceChildren(status,body);
 const notify=t=>{if(alive)status.textContent=t;};
 async function call(action,data){if(busy)return;busy=true;try{await request('POST',{action,data});await load(selected);notify('Cambio guardado.');}catch(e){notify('No se guardó: '+e.message);}finally{busy=false;}}
 async function load(id=selected){try{const r=await request('GET');if(!alive)return;rows=r.conversations;selected=id;detail=id?await request('GET',null,id):null;if(!alive)return;draw();notify('DEV · modo supervisado. Ningún mensaje se envía automáticamente. Máximo 200 conversaciones y 500 mensajes por consulta.');}catch(e){notify('Conversaciones no disponible: '+e.message+'. No hay confirmación de guardado ni envío.');}}
 function draw(){
  const list=rows.filter(c=>(!channel||c.channel===channel)&&(!owner||c.owner_user_id===owner)&&(!pending||c.status!=='resolved')).sort((a,b)=>(oldest?1:-1)*(Date.parse(a.updated_at)-Date.parse(b.updated_at)));
  const c=detail?.conversation;
  body.innerHTML=`<div class="conversation-filters"><label>Canal <select id="cv-channel"><option value="">Todos</option>${['nexa','whatsapp','email','instagram','phone'].map(v=>`<option ${channel===v?'selected':''}>${v}</option>`).join('')}</select></label><label>Responsable <select id="cv-owner"><option value="">Todos</option>${[...new Set(rows.map(r=>r.owner_user_id))].map(v=>`<option value="${esc(v)}" ${owner===v?'selected':''}>${esc(name(v,users))}</option>`).join('')}</select></label><label><input id="cv-pending" type="checkbox" ${pending?'checked':''}> Pendientes</label><label><input id="cv-oldest" type="checkbox" ${oldest?'checked':''}> Más antiguas primero</label><button id="cv-refresh">Actualizar</button></div>
  <div class="conversation-layout"><aside aria-label="Conversaciones">${list.length?list.map(v=>`<button class="conversation-item" data-id="${esc(v.id)}" ${v.id===selected?'aria-current="true"':''}><strong>${esc(name(v.contact_id,contacts))}</strong><span>${esc(v.channel)} · ${labels[v.status]}</span><small>${esc(v.next_action)}</small>${v.status==='new'?'<b>Consulta nueva</b>':''}</button>`).join(''):'<p>No hay conversaciones con estos filtros.</p>'}</aside><section>${c?`
  <h2>${esc(name(c.contact_id,contacts))}</h2><p>${esc(c.channel)} · ${labels[c.status]} · <strong>${c.attention==='human'?'Atiende una persona':'IA supervisada: revisión humana obligatoria'}</strong></p>
  <p>Origen declarado con consentimiento: ${esc(c.source_evidence.page||'Sin página documentada')} · ${esc(c.source_evidence.consent_version||'')}</p>
  <p>Oportunidad: ${esc(name(c.opportunity_id,opportunities)||'Sin vincular')} ${esc(opportunities.find(o=>o.id===c.opportunity_id)?.stage||'')}</p>
  <div class="conversation-history" role="log" aria-label="Historial">${detail.messages.map(m=>`<article class="conversation-message ${m.direction}"><small>${esc(m.actor)} · ${esc(new Date(m.occurred_at).toLocaleString('es-PE',{timeZone:'America/Lima'}))} · ${labels[m.status]}</small><p>${esc(m.body)}</p>${m.provider_id?`<small>Comprobante: ${esc(m.provider_id)}</small>`:''}${m.error_code?`<p role="alert">${esc(m.error_code)}</p>`:''}</article>`).join('')}</div>
  <button id="cv-takeover">Tomar atención humana</button> <button id="cv-supervise">Reanudar supervisión de IA</button>
  <form id="cv-reply"><label>Respuesta <textarea name="body" required maxlength="4000" ${c.attention!=='human'||c.status==='resolved'?'disabled':''}></textarea></label><button ${c.attention!=='human'||c.status==='resolved'?'disabled':''}>Poner respuesta en cola</button><p>Se confirma entrega solo cuando el navegador del visitante la recibe.</p></form>
  <form id="cv-edit"><label>Responsable<select name="owner_id">${[...new Set([c.owner_user_id,...users.map(u=>u.id)])].map(id=>`<option value="${esc(id)}" ${id===c.owner_user_id?'selected':''}>${esc(name(id,users))}</option>`).join('')}</select></label><label>Oportunidad<select name="opportunity_id"><option value="">Sin vincular</option>${[...new Set([c.opportunity_id,...opportunities.map(o=>o.id)].filter(Boolean))].map(id=>`<option value="${esc(id)}" ${id===c.opportunity_id?'selected':''}>${esc(name(id,opportunities))}</option>`).join('')}</select></label><label>Siguiente acción<input name="next_action" value="${esc(c.next_action)}" required maxlength="1000"></label><label>Estado<select name="status">${['new','active','waiting','resolved'].map(v=>`<option value="${v}" ${c.status===v?'selected':''}>${labels[v]}</option>`).join('')}</select></label><label>Resultado de cierre<input name="closed_reason" value="${esc(c.closed_reason||'')}"></label><button>Guardar seguimiento</button></form>
  <details><summary>Registro de decisiones (${detail.events.length})</summary>${detail.events.map(e=>`<p>${esc(e.action)} · ${esc(e.actor_id||'Nexa')} · ${esc(e.occurred_at)}</p>`).join('')}</details>`:'<p>Abre una conversación para revisar su historial y atenderla.</p>'}</section></div>`;
  const get=id=>body.querySelector('#'+id);
  get('cv-channel').onchange=e=>{channel=e.target.value;draw();};get('cv-owner').onchange=e=>{owner=e.target.value;draw();};get('cv-pending').onchange=e=>{pending=e.target.checked;draw();};get('cv-oldest').onchange=e=>{oldest=e.target.checked;draw();};get('cv-refresh').onclick=()=>load();
  body.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>load(b.dataset.id));
  if(!c)return;
  const base={conversation_id:c.id,revision:c.revision};
  get('cv-takeover').onclick=()=>call('takeover',base);get('cv-supervise').onclick=()=>call('supervise',base);
  let eventKey=crypto.randomUUID(),lastBody='';
  get('cv-reply').onsubmit=e=>{e.preventDefault();const text=new FormData(e.target).get('body');if(text!==lastBody){eventKey=crypto.randomUUID();lastBody=text;}void call('reply',{...base,body:text,event_key:eventKey});};
  get('cv-edit').onsubmit=e=>{e.preventDefault();void call('update',{...Object.fromEntries(new FormData(e.target)),...base});};
 }
 void load();return {destroy(){alive=false;root.replaceChildren();}};
}
