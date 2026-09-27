import {escapeHTML as esc} from './domain.mjs';
export const radarState=row=>row.workflow_status==='RESOLVED'?'RESOLVED':row.workflow_status==='DISCARDED'||row.classification==='DISCARD'?'DISCARDED':row.workflow_status==='IN_REVIEW'?'IN_REVIEW':'PENDING';
export const radarStateLabels={PENDING:'Pendiente',IN_REVIEW:'En revisión',RESOLVED:'Resuelta',DISCARDED:'Descartada'};
export const radarNeedsAttention=row=>['PENDING','IN_REVIEW'].includes(radarState(row))&&(radarState(row)!=='IN_REVIEW'||row.actionable===true);
export const radarPriorityOrder=(a,b)=>Number(b.weighted_score||0)-Number(a.weighted_score||0)||(radarState(a)==='IN_REVIEW')-(radarState(b)==='IN_REVIEW')||String(a.id).localeCompare(String(b.id));
export function radarTransition(row,target,reason,actor,at){
 const state=radarState(row);
 if(!['IN_REVIEW','RESOLVED','DISCARDED'].includes(target)||['RESOLVED','DISCARDED'].includes(state)||state===target)throw Error('INVALID_TRANSITION');
 const note=String(reason||'').trim();if(note.length>2000)throw Error('REASON_TOO_LONG');
 if(['RESOLVED','DISCARDED'].includes(target)&&!note)throw Error('REASON_REQUIRED');
 return {from:row.workflow_status||'DETECTED',to:target,reason:note||null,actor_id:actor,at};
}
export function renderRadarLifecycle(row,canManage){
 const state=radarState(row),closed=['RESOLVED','DISCARDED'].includes(state);
 const button=(target,label)=>'<button type="button" data-radar-state="'+target+'" data-radar-id="'+esc(row.id)+'">'+label+'</button>';
 return '<section class="radar-lifecycle" aria-label="Atención de la señal"><div><strong>'+radarStateLabels[state]+'</strong>'+(row.updated_at?'<small>Actualizada '+esc(new Date(row.updated_at).toLocaleString('es-PE',{timeZone:'America/Lima'}))+'</small>':'')+'</div><div class="radar-lifecycle-actions">'+(canManage&&!closed?(state==='PENDING'?button('IN_REVIEW','Revisar'):'')+button('RESOLVED','Resolver')+button('DISCARDED','Descartar'):'')+'<button type="button" data-radar-history="'+esc(row.id)+'">Historial</button></div></section>';
}
