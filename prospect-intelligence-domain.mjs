export const PI_STATES = Object.freeze([
  'DETECTED',
  'RESEARCHING',
  'QUALIFIED',
  'PRIORITIZED',
  'READY_FOR_CRM',
  'TRANSFERRED',
  'MONITORING',
  'DISCARDED'
]);

export const PI_STATE_LABELS = Object.freeze({
  DETECTED:'Detectado',
  RESEARCHING:'Investigando',
  QUALIFIED:'Calificado',
  PRIORITIZED:'Priorizado',
  READY_FOR_CRM:'Listo para CRM',
  TRANSFERRED:'Transferido',
  MONITORING:'Monitoreo',
  DISCARDED:'Descartado'
});

export const DIMENSIONS = Object.freeze({
  F:{label:'Fit Xicronix',description:'Alineación entre la oportunidad y capacidades reales de Xicronix.'},
  N:{label:'Necesidad',description:'Claridad, intensidad y relevancia de la necesidad detectada.'},
  C:{label:'Capacidad',description:'Capacidad económica, institucional y operativa para ejecutar.'},
  T:{label:'Timing',description:'Conveniencia y proximidad temporal de la ventana comercial.'},
  A:{label:'Accesibilidad',description:'Posibilidad real de llegar a decisores, influenciadores o canales de entrada.'},
  E:{label:'Evidencia',description:'Calidad, cantidad, independencia y consistencia del sustento disponible.'}
});

export const EVIDENCE_TYPES = Object.freeze([
  'FACT',
  'CONFIRMATION',
  'INFERENCE',
  'HYPOTHESIS',
  'CONTRADICTION',
  'MISSING_DATA'
]);

export const EVIDENCE_LABELS = Object.freeze({
  FACT:'Hecho',
  CONFIRMATION:'Confirmación',
  INFERENCE:'Inferencia',
  HYPOTHESIS:'Hipótesis',
  CONTRADICTION:'Contradicción',
  MISSING_DATA:'Dato faltante'
});

const TRANSITIONS = Object.freeze({
  DETECTED:new Set(['RESEARCHING','MONITORING','DISCARDED']),
  RESEARCHING:new Set(['QUALIFIED','MONITORING','DISCARDED']),
  QUALIFIED:new Set(['PRIORITIZED','RESEARCHING','MONITORING','DISCARDED']),
  PRIORITIZED:new Set(['READY_FOR_CRM','QUALIFIED','MONITORING','DISCARDED']),
  READY_FOR_CRM:new Set(['TRANSFERRED','PRIORITIZED']),
  TRANSFERRED:new Set([]),
  MONITORING:new Set(['RESEARCHING','DISCARDED']),
  DISCARDED:new Set(['RESEARCHING'])
});

export function clamp(value,min=0,max=100){
  const n=Number(value);
  if(!Number.isFinite(n))return min;
  return Math.min(max,Math.max(min,n));
}

export function dimensionScore(prospect){
  const d=prospect?.dimensions||{};
  const weights={F:.25,N:.20,C:.15,T:.15,A:.10,E:.15};
  const weighted=Object.entries(weights).reduce((sum,[key,w])=>sum+clamp(d[key],0,5)*20*w,0);
  return Math.round(clamp(weighted));
}

export function confidenceScore(prospect){
  const evidence=Array.isArray(prospect?.evidence)?prospect.evidence:[];
  const traceable=evidence.filter(e=>e?.source&&e?.url&&['FACT','CONFIRMATION'].includes(e.type)).length;
  const supportive=evidence.filter(e=>['FACT','CONFIRMATION'].includes(e?.type)).length;
  const contradictions=evidence.filter(e=>e?.type==='CONTRADICTION'&&e?.critical).length;
  const evidenceDimension=clamp(prospect?.dimensions?.E,0,5)*12;
  return Math.round(clamp(20 + Math.min(30,traceable*10) + Math.min(20,supportive*5) + evidenceDimension - contradictions*30));
}

export function canTransition(from,to){
  return !!TRANSITIONS[from]?.has(to);
}

export function transitionProspect(prospect,to){
  if(!prospect||!canTransition(prospect.state,to))throw new Error(`Transición PI inválida: ${prospect?.state||'UNKNOWN'} → ${to}`);
  return {...prospect,state:to,updatedAt:new Date().toISOString()};
}

export function normalizeIdentity(value){
  return String(value||'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/https?:\/\/(www\.)?/g,'')
    .replace(/[^a-z0-9]/g,'');
}

export function resolveDuplicate(prospect,crmSnapshot={organizations:[],leads:[],opportunities:[]}){
  const orgs=crmSnapshot.organizations||[];
  const leads=crmSnapshot.leads||[];
  const opportunities=crmSnapshot.opportunities||[];
  const pName=normalizeIdentity(prospect?.organization?.name);
  const pRuc=normalizeIdentity(prospect?.organization?.ruc);
  const pWeb=normalizeIdentity(prospect?.organization?.website);

  const exact=orgs.filter(org=>{
    const name=pName&&normalizeIdentity(org.name)===pName;
    const ruc=pRuc&&normalizeIdentity(org.ruc)===pRuc;
    const web=pWeb&&normalizeIdentity(org.website)===pWeb;
    return ruc||web||name;
  });

  if(exact.length>1)return {status:'UNCERTAIN',action:'MANUAL_IDENTITY_REVIEW',reason:'Más de una organización coincide con la identidad observada.'};
  if(exact.length===0)return {status:'NEW',action:'CREATE_ORG_AND_LEAD',reason:'No existe una organización coincidente en el snapshot CRM.'};

  const organization=exact[0];
  const relatedOpportunities=opportunities.filter(o=>o.organization_id===organization.id&&!['WON','LOST'].includes(o.stage));
  if(relatedOpportunities.length)return {status:'OPPORTUNITY_EXISTS',action:'ENRICH_EXISTING_OPPORTUNITY',organization,opportunity:relatedOpportunities[0],reason:'Existe una oportunidad abierta para la misma organización.'};

  const relatedLeads=leads.filter(l=>l.organization_id===organization.id&&!['DISQUALIFIED','CONVERTED'].includes(l.status));
  if(relatedLeads.length)return {status:'LEAD_EXISTS',action:'ENRICH_EXISTING_LEAD',organization,lead:relatedLeads[0],reason:'Existe un prospecto CRM activo para la misma organización.'};

  return {status:'ORG_EXISTS',action:'REUSE_ORG_CREATE_LEAD',organization,reason:'La organización existe, pero no tiene un prospecto activo equivalente.'};
}

export function evaluateReadiness(prospect,duplicateResult){
  const evidence=Array.isArray(prospect?.evidence)?prospect.evidence:[];
  const criticalContradiction=evidence.some(e=>e?.type==='CONTRADICTION'&&e?.critical);
  const traceableEvidence=evidence.some(e=>e?.source&&e?.url&&['FACT','CONFIRMATION'].includes(e.type));
  const potential=Number.isFinite(Number(prospect?.potential))?Number(prospect.potential):dimensionScore(prospect);
  const confidence=Number.isFinite(Number(prospect?.confidence))?Number(prospect.confidence):confidenceScore(prospect);

  const checks=[
    ['identity',!!prospect?.organization?.name,'Organización identificada'],
    ['hypothesis',!!String(prospect?.hypothesis||'').trim(),'Hipótesis comercial explícita'],
    ['need',clamp(prospect?.dimensions?.N,0,5)>=3,'Necesidad evaluada ≥ 3/5'],
    ['evidence',traceableEvidence,'Evidencia trazable confirmada'],
    ['fit',clamp(prospect?.dimensions?.F,0,5)>=3,'Fit Xicronix ≥ 3/5'],
    ['potential',potential>=60,'Potencial comercial ≥ 60'],
    ['confidence',confidence>=60,'Confianza global ≥ 60'],
    ['next_action',!!String(prospect?.nextAction||'').trim(),'Siguiente acción propuesta'],
    ['contradiction',!criticalContradiction,'Sin contradicción crítica abierta'],
    ['duplicate',duplicateResult?.status!=='UNCERTAIN','Identidad CRM sin ambigüedad crítica']
  ].map(([code,ok,label])=>({code,ok,label}));

  return {
    ready:checks.every(c=>c.ok),
    checks,
    potential:Math.round(clamp(potential)),
    confidence:Math.round(clamp(confidence))
  };
}

export function createTransferEnvelope(prospect,duplicateResult){
  const readiness=evaluateReadiness(prospect,duplicateResult);
  if(!readiness.ready)throw new Error('El prospecto no supera el gate READY_FOR_CRM.');
  return {
    contract_version:'pi-crm-v0.1',
    source_system:'xicronix-prospect-intelligence-dev',
    analysis_version:prospect.analysisVersion||'pi-rules-v0.1',
    transferred_at:new Date().toISOString(),
    organization_identity:{...prospect.organization},
    commercial_hypothesis:prospect.hypothesis,
    signals:[...(prospect.signals||[])],
    evidence:[...(prospect.evidence||[])],
    dimensions:{...prospect.dimensions},
    potential_score:readiness.potential,
    confidence_score:readiness.confidence,
    suggested_decision_makers:[...(prospect.decisionMakers||[])],
    missing_data:[...(prospect.missingData||[])],
    suggested_next_action:prospect.nextAction,
    transfer_reason:prospect.transferReason||'Prospecto supera gate PI READY_FOR_CRM.',
    duplicate_resolution:{
      status:duplicateResult.status,
      action:duplicateResult.action,
      organization_id:duplicateResult.organization?.id||null,
      lead_id:duplicateResult.lead?.id||null,
      opportunity_id:duplicateResult.opportunity?.id||null
    }
  };
}

export function summarizeKpis(prospects){
  const rows=Array.isArray(prospects)?prospects:[];
  return {
    observed:rows.length,
    newSignals:rows.reduce((sum,p)=>sum+(p.signals?.filter(s=>s?.isNew).length||0),0),
    researching:rows.filter(p=>p.state==='RESEARCHING').length,
    prioritized:rows.filter(p=>p.state==='PRIORITIZED').length,
    ready:rows.filter(p=>p.state==='READY_FOR_CRM').length
  };
}
