import {effectiveWorkspace,scopeWorkspaceData} from './workspace.mjs';
import {isSimulated} from './demo.mjs';
import {KINDS,buildEvidence,queryIntent} from './assistant-policy.mjs';
export const CRM_URL='https://qzfprdhmcaucqcdqgqiz.supabase.co';
export const CRM_PUBLIC_KEY='sb_publishable_WzxQ2iPXjy4IMx4iYOAVqA_U6i8kpFK';
const TABLES={radar:'commercial_radar_dashboard',tasks:'tasks',opportunities:'opportunities',leads:'leads',meetings:'meetings'};
export async function loadEvidence(payload,auth,authorization,{fetcher=fetch,now=Date.now()}={}){
 const intent=queryIntent(payload.message),context=payload.context;
 const page=String(context.page).split(':')[0],global=['priority','why','next','authorization','impact','brief','clarify','audit'].includes(intent)||['dashboard','now'].includes(page);
 const kinds=intent==='priority'&&/primera tarea|tarea.*prioridad|prioridad.*tarea/.test(payload.message.toLowerCase())?['tasks']:intent==='impact'?['opportunities']:global?KINDS:KINDS.includes(page)?[page]:[];
 const workspace=effectiveWorkspace(auth,context.workspace);
 const limitations=[],records={};
 if(context.source==='demo'){
  for(const kind of kinds)records[kind]=(context.records?.[kind]?.sample||[]).slice(0,100);
  limitations.push('Muestra de demostración aportada por el navegador; no verificada como producción.');
 }else{
  await Promise.all(kinds.map(async kind=>{
   const rows=[],readTimeout=AbortSignal.timeout(12000);
   try{
    for(let offset=0;offset<2000;offset+=500){
     const url=new URL(CRM_URL+'/rest/v1/'+TABLES[kind]);url.searchParams.set('select','*');url.searchParams.set('organization_id','eq.'+auth.organization_id);url.searchParams.set('order','id.asc');url.searchParams.set('offset',String(offset));url.searchParams.set('limit','500');
     if(workspace!=='admin'&&kind!=='radar'){const owner=kind==='tasks'?'assigned_to':'owner_user_id';url.searchParams.set('or','('+owner+'.eq.'+auth.id+',and('+owner+'.is.null,created_by.eq.'+auth.id+'))');}
     const response=await fetcher(url.toString(),{headers:{apikey:CRM_PUBLIC_KEY,Authorization:authorization},signal:readTimeout});
     if(!response.ok)throw Error('LOAD_FAILED');const batch=await response.json();if(!Array.isArray(batch))throw Error('LOAD_FAILED');rows.push(...batch);if(batch.length<500)break;if(offset===1500)limitations.push(kind+': límite de 2000 registros; la prioridad no es exhaustiva.');
    }
    records[kind]=rows.filter(r=>r.organization_id===auth.organization_id&&!isSimulated(r)&&(kind!=='tasks'||!String(r.automation_key||'').startsWith('cx:readiness:')));
   }catch{records[kind]=[];limitations.push(kind+': datos no disponibles; no se consideran como cero asuntos.');}
  }));
 }
 let scoped=context.source==='demo'?records:scopeWorkspaceData(records,auth,auth.id,workspace);
 // Screen filters only constrain screen summaries. Executive priorities use the full authorized operational scope.
 if(!global){const search=String(context.filters?.search||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().slice(0,160),status=String(context.filters?.status||'');for(const kind of kinds)scoped[kind]=(scoped[kind]||[]).filter(r=>(!status||[r.status,r.stage,r.classification].includes(status))&&(!search||[r.title,r.name,r.institution_name].some(v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(search))));}
 if(!kinds.length)limitations.push('Esta pantalla no tiene una fuente comercial estructurada habilitada para el Assistant.');
 return buildEvidence({records:scoped,limitations:limitations.sort(),page:context.page,role:auth.role,now,source:context.source==='demo'?'demo':'live',intent,focus:context.focus,selected:context.selected});
}
