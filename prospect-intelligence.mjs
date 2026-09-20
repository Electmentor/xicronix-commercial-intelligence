import {
  PI_STATE_LABELS,DIMENSIONS,EVIDENCE_LABELS,
  dimensionScore,confidenceScore,resolveDuplicate,evaluateReadiness,
  createTransferEnvelope,summarizeKpis,transitionProspect,canTransition
} from './prospect-intelligence-domain.mjs';
import {createPiRepository} from './prospect-intelligence-supabase.mjs';

const STORAGE_KEY='xicronix.pi.dev.prototype.v1';
const $=id=>document.getElementById(id);
const DEV_CONFIG={url:'https://rmximatxuaczhpqbcuho.supabase.co',publishableKey:'sb_publishable_pqqyMTcBovUi4sbp2Cn6yw_sL0_Xs__'};
let repository=null,backendMode=false,backendContext=null,pendingTransferId=null;

let CRM_SNAPSHOT={
  organizations:[
    {id:'org-demo-1',name:'Instituto Horizonte',ruc:'20111111111',website:'https://institutohorizonte.example'}
  ],
  leads:[
    {id:'lead-demo-1',organization_id:'org-demo-1',status:'RESEARCHING',title:'Modernización de laboratorio'}
  ],
  opportunities:[]
};

const seed=[
  {
    id:'pi-001',
    state:'PRIORITIZED',
    organization:{name:'Colegio Monteluz',type:'SCHOOL',city:'Lima',country:'Perú',website:'https://monteluz.example'},
    sector:'Educación escolar',
    hypothesis:'La institución podría requerir modernización de laboratorios STEM y acompañamiento para integrar tecnología educativa.',
    dimensions:{F:5,N:4,C:3,T:4,A:3,E:4},
    signals:[
      {label:'Plan institucional de modernización publicado',isNew:true},
      {label:'Convocatoria de perfil de innovación educativa',isNew:false}
    ],
    evidence:[
      {type:'FACT',source:'Sitio institucional',url:'https://monteluz.example/plan',note:'Plan institucional con eje de modernización.'},
      {type:'CONFIRMATION',source:'Convocatoria pública',url:'https://monteluz.example/convocatoria',note:'Búsqueda de capacidades de innovación.'},
      {type:'INFERENCE',source:'Análisis PI',url:'https://xicronix.example/dev/pi',note:'Existe alineación con capacidades Xicronix.'}
    ],
    decisionMakers:['Dirección General','Coordinación Académica'],
    missingData:['Presupuesto aprobado','Calendario de compra'],
    nextAction:'Identificar responsable de infraestructura y validar horizonte de inversión.',
    transferReason:'Fit alto, necesidad plausible y evidencia independiente.',
    analysisVersion:'pi-rules-v0.1'
  },
  {
    id:'pi-002',
    state:'RESEARCHING',
    organization:{name:'Clínica Horizonte Sur',type:'CLINIC',city:'Arequipa',country:'Perú',website:'https://horizontesur.example'},
    sector:'Salud',
    hypothesis:'La expansión anunciada podría abrir una necesidad de capacitación técnica y equipamiento de formación.',
    dimensions:{F:3,N:3,C:4,T:4,A:2,E:2},
    signals:[{label:'Anuncio de nueva sede',isNew:true}],
    evidence:[
      {type:'FACT',source:'Comunicado corporativo',url:'https://horizontesur.example/sede',note:'Nueva sede anunciada.'},
      {type:'MISSING_DATA',source:'PI',url:'https://xicronix.example/dev/pi',note:'No hay evidencia todavía sobre equipamiento educativo.'}
    ],
    decisionMakers:['Gerencia de Operaciones'],
    missingData:['Necesidad específica','Decisor técnico'],
    nextAction:'Buscar proyecto de implementación y responsables de la nueva sede.',
    analysisVersion:'pi-rules-v0.1'
  },
  {
    id:'pi-003',
    state:'QUALIFIED',
    organization:{name:'Instituto Horizonte',type:'INSTITUTE',city:'Lima',country:'Perú',website:'https://institutohorizonte.example',ruc:'20111111111'},
    sector:'Educación técnica',
    hypothesis:'Hay señales de renovación de ambientes técnicos que pueden ampliar una iniciativa comercial ya existente.',
    dimensions:{F:4,N:4,C:3,T:3,A:4,E:4},
    signals:[{label:'Renovación de talleres técnicos',isNew:true}],
    evidence:[
      {type:'FACT',source:'Portal institucional',url:'https://institutohorizonte.example/talleres',note:'Proyecto de renovación publicado.'},
      {type:'CONFIRMATION',source:'Boletín institucional',url:'https://institutohorizonte.example/boletin',note:'Fase de evaluación de proveedores.'}
    ],
    decisionMakers:['Dirección Académica'],
    missingData:['Alcance técnico detallado'],
    nextAction:'Enriquecer el prospecto CRM existente con la nueva evidencia.',
    analysisVersion:'pi-rules-v0.1'
  },
  {
    id:'pi-004',
    state:'MONITORING',
    organization:{name:'Centro Educativo Nova',type:'SCHOOL',city:'Trujillo',country:'Perú',website:'https://nova.example'},
    sector:'Educación escolar',
    hypothesis:'Podría existir interés futuro en tecnología educativa, pero la señal actual no justifica activación comercial.',
    dimensions:{F:4,N:2,C:2,T:1,A:2,E:2},
    signals:[{label:'Actualización menor de infraestructura',isNew:false}],
    evidence:[
      {type:'FACT',source:'Comunicado institucional',url:'https://nova.example/infraestructura',note:'Mejora menor sin proyecto STEM explícito.'}
    ],
    decisionMakers:[],
    missingData:['Necesidad concreta','Presupuesto','Decisor'],
    nextAction:'Mantener monitoreo trimestral.',
    analysisVersion:'pi-rules-v0.1'
  }
];

function backendCase(row,signals,evidence){
  return {
    id:row.id,
    state:row.state,
    organization:{
      name:row.organization_name,
      type:row.organization_type,
      ruc:row.organization_ruc,
      website:row.organization_website,
      city:row.organization_city,
      country:row.organization_country
    },
    sector:row.sector||'Sin sector',
    hypothesis:row.hypothesis||'Sin hipótesis registrada.',
    dimensions:row.dimensions||{F:0,N:0,C:0,T:0,A:0,E:0},
    potential:row.potential_score,
    confidence:row.confidence_score,
    signals:(signals||[]).map(item=>({label:item.label,isNew:item.is_new,source:item.source,url:item.source_url})),
    evidence:(evidence||[]).map(item=>({type:item.evidence_type,source:item.source,url:item.source_url,note:item.note,critical:item.critical})),
    decisionMakers:[],
    missingData:(evidence||[]).filter(item=>item.evidence_type==='MISSING_DATA').map(item=>item.note),
    nextAction:row.next_action||'Definir siguiente acción.',
    nextActionDate:row.next_action_date,
    transferReason:row.transfer_reason||'',
    analysisVersion:row.analysis_version||'pi-rules-v0.1'
  };
}

async function loadBackend(){
  if(!window.supabase){
    $('backendStatus').textContent='Supabase DEV no está disponible; mostrando prototipo sintético local.';
    return false;
  }
  try{
    repository=createPiRepository(window.supabase,DEV_CONFIG);
    const context=await repository.currentContext();
    if(!context?.session){
      $('backendStatus').textContent='Backend CRM DEV listo. Inicia sesión en CRM DEV para trabajar con persistencia real.';
      return false;
    }
    if(!context.profile){
      $('backendStatus').textContent='Sesión DEV detectada, pero el perfil todavía no está vinculado.';
      return false;
    }
    backendContext=context;
    const orgId=context.profile.organization_id;
    const [cases,snapshot]=await Promise.all([repository.listCases(orgId),repository.crmSnapshot(orgId)]);
    CRM_SNAPSHOT=snapshot;
    prospects=await Promise.all(cases.map(async row=>{
      const [signals,evidence]=await Promise.all([repository.listSignals(row.id),repository.listEvidence(row.id)]);
      return backendCase(row,signals,evidence);
    }));
    backendMode=true;
    selectedId=prospects.some(row=>row.id===selectedId)?selectedId:prospects[0]?.id;
    $('backendStatus').textContent='Conectado a Supabase CRM DEV · '+(context.profile.role||'sin rol')+' · persistencia real.';
    $('resetPrototype').textContent='Recargar backend DEV';
    return true;
  }catch(error){
    console.error(error);
    $('backendStatus').textContent='No se pudo abrir el backend DEV; se mantiene el prototipo sintético local.';
    return false;
  }
}

function clone(value){return JSON.parse(JSON.stringify(value));}
function load(){
  try{
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    if(Array.isArray(saved)&&saved.length)return saved;
  }catch(_error){}
  return clone(seed);
}
let prospects=load();
let selectedId=prospects[0]?.id;
let stateFilter='ALL';

function save(){if(!backendMode)localStorage.setItem(STORAGE_KEY,JSON.stringify(prospects));}
function current(){return prospects.find(p=>p.id===selectedId)||prospects[0];}
function score(p){return p.potential??dimensionScore(p);}
function confidence(p){return p.confidence??confidenceScore(p);}
function duplicate(p){return resolveDuplicate(p,CRM_SNAPSHOT);}

function stateBadge(state){return '<span class="badge state-'+state.toLowerCase()+'">'+(PI_STATE_LABELS[state]||state)+'</span>';}
function metric(label,value,sub=''){return '<article class="metric"><span>'+label+'</span><strong>'+value+'</strong><small>'+sub+'</small></article>';}

function renderKpis(){
  const k=summarizeKpis(prospects);
  $('kpis').innerHTML=[
    metric('Organizaciones observadas',k.observed,backendMode?'Supabase DEV':'prototipo local'),
    metric('Nuevas señales',k.newSignals,backendMode?'señales persistidas':'periodo simulado'),
    metric('Investigando',k.researching,'estado PI'),
    metric('Priorizados',k.prioritized,'estado PI'),
    metric('Listos para CRM',k.ready,'gate superado')
  ].join('');
}

function renderList(){
  const rows=prospects
    .filter(p=>stateFilter==='ALL'||p.state===stateFilter)
    .sort((a,b)=>score(b)-score(a));
  $('prospectList').innerHTML=rows.map(p=>{
    const d=duplicate(p);
    return '<button class="prospect-row '+(p.id===selectedId?'selected':'')+'" data-id="'+p.id+'">'+
      '<span><b>'+p.organization.name+'</b><small>'+p.sector+' · '+p.organization.city+'</small></span>'+
      stateBadge(p.state)+
      '<span class="score">'+score(p)+'/100<small>potencial</small></span>'+
      '<span class="score">'+confidence(p)+'%<small>confianza</small></span>'+
      '<span class="dedupe">'+d.action.replaceAll('_',' ')+'</span>'+
    '</button>';
  }).join('')||'<p class="empty">No hay prospectos con este filtro.</p>';
  document.querySelectorAll('[data-id]').forEach(btn=>btn.onclick=()=>{selectedId=btn.dataset.id;render();});
}

function renderDimensions(p){
  $('dimensions').innerHTML=Object.entries(DIMENSIONS).map(([key,meta])=>
    '<article class="dimension"><header><b>'+key+'</b><span>'+meta.label+'</span></header><strong>'+Number(p.dimensions[key]||0)+'/5</strong><progress max="5" value="'+Number(p.dimensions[key]||0)+'"></progress><small>'+meta.description+'</small></article>'
  ).join('');
}

function renderEvidence(p){
  $('evidence').innerHTML=(p.evidence||[]).map(e=>
    '<article class="evidence-item"><div>'+stateBadge(e.type)+'</div><div><b>'+(EVIDENCE_LABELS[e.type]||e.type)+'</b><p>'+e.note+'</p><small>'+e.source+' · '+e.url+'</small></div></article>'
  ).join('');
}

function renderReasoning(p){
  const steps=[
    ['Señal',p.signals?.[0]?.label||'Sin señal'],
    ['Interpretación','La señal se analiza sin convertirla automáticamente en hecho comercial.'],
    ['Hipótesis',p.hypothesis],
    ['Evidencia',(p.evidence||[]).filter(e=>['FACT','CONFIRMATION'].includes(e.type)).length+' evidencia(s) trazables'],
    ['Prioridad',score(p)+'/100 potencial · '+confidence(p)+'% confianza'],
    ['Siguiente acción',p.nextAction]
  ];
  $('reasoning').innerHTML=steps.map(([title,body],i)=>'<article><span>'+String(i+1).padStart(2,'0')+'</span><b>'+title+'</b><p>'+body+'</p></article>').join('');
}

function renderGate(p){
  const dup=duplicate(p);
  const gate=evaluateReadiness(p,dup);
  $('gateStatus').innerHTML='<div class="gate-summary '+(gate.ready?'ready':'blocked')+'"><strong>'+(gate.ready?'LISTO PARA CRM':'NO LISTO PARA CRM')+'</strong><span>'+gate.checks.filter(c=>c.ok).length+'/'+gate.checks.length+' controles superados</span></div>';
  $('gateChecks').innerHTML=gate.checks.map(c=>'<li class="'+(c.ok?'ok':'fail')+'">'+(c.ok?'✓':'×')+' '+c.label+'</li>').join('');
  $('duplicateResult').innerHTML='<b>Resolución CRM</b><p>'+dup.reason+'</p><code>'+dup.action+'</code>';
  $('transferBtn').disabled=!gate.ready;
  $('readyBtn').disabled=!gate.ready||p.state==='READY_FOR_CRM'||p.state==='TRANSFERRED';
}

function renderDetail(){
  const p=current();if(!p)return;
  const dup=duplicate(p),gate=evaluateReadiness(p,dup);
  $('orgName').textContent=p.organization.name;
  $('orgMeta').textContent=[p.sector,p.organization.city,p.organization.country].filter(Boolean).join(' · ');
  $('stateHolder').innerHTML=stateBadge(p.state);
  $('why').textContent=p.hypothesis;
  $('potential').textContent=gate.potential+'/100';
  $('confidence').textContent=gate.confidence+'%';
  $('evidenceLevel').textContent='E'+Math.min(5,(p.evidence||[]).filter(e=>['FACT','CONFIRMATION'].includes(e.type)).length);
  $('piState').textContent=PI_STATE_LABELS[p.state]||p.state;
  $('nextAction').textContent=p.nextAction;
  renderDimensions(p);renderEvidence(p);renderReasoning(p);renderGate(p);
  const nextMap={DETECTED:'RESEARCHING',RESEARCHING:'QUALIFIED',QUALIFIED:'PRIORITIZED',PRIORITIZED:'READY_FOR_CRM'};
  const next=nextMap[p.state];
  $('advanceBtn').hidden=!next;$('advanceBtn').textContent=next?'Avanzar a '+PI_STATE_LABELS[next]:'';
  $('advanceBtn').onclick=async()=>{
    if(!next||!canTransition(p.state,next))return;
    try{
      if(backendMode){
        await repository.transition(p.id,next);
        await loadBackend();
      }else{
        prospects=prospects.map(row=>row.id===p.id?transitionProspect(row,next):row);
        save();
      }
      render();
    }catch(error){alert(error.message||'No se pudo avanzar el estado.');}
  };
}

async function openTransfer(){
  const p=current(),dup=duplicate(p);
  try{
    if(backendMode){
      const prepared=await repository.prepareTransfer(p.id);
      pendingTransferId=prepared.transfer_id;
      $('transferPayload').textContent=JSON.stringify(prepared.payload,null,2);
      $('transferDecision').textContent=prepared.gate?.duplicate_resolution?.action||dup.action;
      $('executeTransfer').hidden=false;
      await loadBackend();
      render();
    }else{
      const envelope=createTransferEnvelope(p,dup);
      pendingTransferId=null;
      $('transferPayload').textContent=JSON.stringify(envelope,null,2);
      $('transferDecision').textContent=dup.action;
      $('executeTransfer').hidden=true;
    }
    $('transferDialog').showModal();
  }catch(error){alert(error.message||'No se pudo preparar la transferencia.');}
}

async function markReady(){
  const p=current(),gate=evaluateReadiness(p,duplicate(p));
  if(!gate.ready)return;
  if(p.state==='PRIORITIZED'&&canTransition(p.state,'READY_FOR_CRM')){
    try{
      if(backendMode){
        const serverGate=await repository.readiness(p.id);
        if(!serverGate?.ready)throw new Error('El backend DEV no considera el caso listo para CRM.');
        await repository.transition(p.id,'READY_FOR_CRM');
        await loadBackend();
      }else{
        prospects=prospects.map(row=>row.id===p.id?transitionProspect(row,'READY_FOR_CRM'):row);
        save();
      }
      render();
    }catch(error){alert(error.message||'No se pudo marcar el caso como listo para CRM.');}
  }
}

function render(){
  renderKpis();renderList();renderDetail();
  document.querySelectorAll('[data-filter]').forEach(btn=>btn.classList.toggle('active',btn.dataset.filter===stateFilter));
}

document.querySelectorAll('[data-filter]').forEach(btn=>btn.onclick=()=>{stateFilter=btn.dataset.filter;render();});
$('transferBtn').onclick=openTransfer;
$('readyBtn').onclick=markReady;
$('closeTransfer').onclick=()=>{$('transferDialog').close();pendingTransferId=null;};
$('executeTransfer').onclick=async()=>{
  if(!backendMode||!pendingTransferId)return;
  if(!confirm('¿Ejecutar esta transferencia en CRM DEV? No afecta PRODUCCIÓN.'))return;
  $('executeTransfer').disabled=true;
  try{
    const result=await repository.executeTransfer(pendingTransferId);
    pendingTransferId=null;
    $('transferDialog').close();
    await loadBackend();
    render();
    alert('Transferencia ejecutada en CRM DEV: '+(result?.status||'EXECUTED'));
  }catch(error){alert(error.message||'No se pudo ejecutar la transferencia.');}
  finally{$('executeTransfer').disabled=false;}
};
$('copyTransfer').onclick=async()=>{
  await navigator.clipboard.writeText($('transferPayload').textContent);
  $('copyTransfer').textContent='Copiado';setTimeout(()=>$('copyTransfer').textContent='Copiar payload',1200);
};
$('resetPrototype').onclick=async()=>{
  if(backendMode){
    await loadBackend();
    render();
    return;
  }
  if(confirm('¿Restablecer el prototipo DEV? Solo se borra el estado local de este navegador.')){
    prospects=clone(seed);selectedId=prospects[0].id;save();render();
  }
};

render();
loadBackend().then(connected=>{if(connected)render();});
