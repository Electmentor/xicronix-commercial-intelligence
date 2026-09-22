export function escapeText(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function safeUrl(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}}
export function validatePiForm(kind,values){
 const required=kind==='case'?['organization_name']:kind==='signal'?['label','source','source_url','published_on']:['note'];
 if(required.some(key=>!String(values[key]??'').trim()))throw new Error('Completa los campos obligatorios; no pueden contener solo espacios.');
 if(kind==='case'&&values.organization_website&&!safeUrl(values.organization_website))throw new Error('Usa un sitio institucional HTTP o HTTPS válido.');
}
export function filterCases(rows,query='',state='ALL',kind='research'){
 const q=query.trim().toLocaleLowerCase('es');
 return rows.filter(p=>(state==='ALL'||p.state===state)&&(kind==='all'||(kind==='synthetic')===p.organization_name.startsWith('[SIMULADO]'))&&[p.organization_name,p.sector,p.organization_city,p.hypothesis,...(p.signals||[]).map(s=>s.label)].join(' ').toLocaleLowerCase('es').includes(q));
}
export function sourceLink(url,label='Abrir fuente'){
 const href=safeUrl(url);return href?`<a href="${escapeText(href)}" target="_blank" rel="noopener noreferrer">${escapeText(label)} ↗</a>`:'<span>Fuente pendiente</span>';
}
export const RESOLUTION_LABELS={CREATE_ORG_AND_LEAD:'Crear institución y prospecto',REUSE_ORG_CREATE_LEAD:'Reutilizar institución y crear prospecto',ENRICH_EXISTING_LEAD:'Añadir evidencia al prospecto existente',ENRICH_EXISTING_OPPORTUNITY:'Añadir evidencia a la oportunidad existente',MANUAL_IDENTITY_REVIEW:'Revisar coincidencias antes de continuar'};
export function dateLabel(value){
 if(!value)return 'Fecha pendiente';
 const dateOnly=/^\d{4}-\d{2}-\d{2}$/.test(value);
 const date=new Date(dateOnly?value+'T12:00:00':value);
 return Number.isNaN(date.getTime())?'Fecha pendiente':date.toLocaleDateString('es-PE',{day:'numeric',month:'short',year:'numeric'});
}
