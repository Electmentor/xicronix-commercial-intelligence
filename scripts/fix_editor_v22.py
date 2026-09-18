from pathlib import Path
root=Path(__file__).resolve().parents[1];p=root/'app.js';s=p.read_text()
if "activityType:{WEB_FORM:" in s:
 print('Editor patch already applied');raise SystemExit(0)
assert "CRM_RELEASE='2026-09-18-v2.1'" in s, 'Unexpected baseline'
def rep(a,b):
 global s
 assert s.count(a)==1,(s.count(a),a[:80]);s=s.replace(a,b,1)
rep("activityType:{CALL:'Llamada'", "activityType:{WEB_FORM:'Formulario web',CALL:'Llamada'")
rep("activityOutcome:{", "leadSource:{WEBSITE:'Formulario web',EMAIL:'Correo',WHATSAPP:'WhatsApp',CALL:'Llamada',REFERRAL:'Referido',EVENT:'Evento',OTHER:'Otro'},\n activityOutcome:{")
rep("f('source','Fuente')", "f('source','Canal de origen','select',false,enums.leadSource)")
rep("f('title','Título','text',true),institution,f('status','Estado','select',true,enums.taskStatus)","f('title','Título','text',true),f('lead_id','Prospecto','relation'),institution,contact,f('status','Estado','select',true,enums.taskStatus)")
rep("type:'CALL',subject:'Primer contacto',outcome:'FOLLOW_UP',occurred_at:localDateTime(new Date().toISOString())", "type:'',subject:'',outcome:'',occurred_at:new Date().toISOString()")
rep("let options=field.options;if(field.type==='relation'){const source=relationTable(field.key);options=Object.fromEntries(scopedRows(source).map(r=>[r.id,nameOf(r)]));}","let options=field.options;if(field.type==='relation')options=Object.fromEntries(editorRelationRows(field.key,row).map(r=>[r.id,nameOf(r)]));\n if(options&&value&&!Object.hasOwn(options,value))options={...options,[value]:'Valor actual: '+String(value)+' (revisar)'};")
rep("${field.type==='relation'?'<option value=\"\">Sin vincular</option>':''}","<option value=\"\" ${value===''?'selected':''}>${field.type==='relation'?'Sin vincular':field.required?'Selecciona una opción':'Sin registrar'}</option>")
rep("['score','probability',...costRateKeys].includes(field.key)?1:'0.01'", "['score','probability','quantity',...costRateKeys].includes(field.key)?1:'0.01'")
rep("$('saveBtn').hidden=!writableFor(table);$('saveBtn').disabled=false;$('editor').showModal();", "if(['leads','activities','opportunities','tasks'].includes(table))$('fields').insertAdjacentHTML('beforeend','<p id=\"relationHelp\" class=\"full muted\" role=\"status\">Institución y contacto deben corresponder entre sí. Al cambiar de institución se actualiza la lista de contactos.</p>');\n if(table==='activities')$('fields').insertAdjacentHTML('beforeend','<p class=\"full muted\">Registra únicamente una interacción que haya ocurrido. La solicitud inicial del formulario ya figura en el historial; no es una llamada ni una propuesta enviada. La próxima acción con fecha genera una tarea interna, no envía mensajes.</p>');\n if(fieldsFor(table).some(f=>f.type==='datetime-local'))$('fields').insertAdjacentHTML('beforeend','<p class=\"full muted\">Las fechas y horas se muestran en la zona horaria de este navegador y se guardan como instantes UTC.</p>');\n $('saveBtn').hidden=!writableFor(table);$('saveBtn').disabled=false;$('editor').showModal();")
rep("$('fields').addEventListener('change',updateQuotePreview);", "$('fields').addEventListener('change',event=>{syncEditorRelations(event.target?.name);updateQuotePreview();});")
rep("const payload={}, form=new FormData($('recordForm'));", "const payload={}, form=new FormData($('recordForm'));\n const original=editId?scopedRows(editTable).find(row=>row.id===editId):null;\n if(typeof $('recordForm').reportValidity==='function'&&!$('recordForm').reportValidity())return;")
rep("else if(field.type==='datetime-local')value=value?new Date(value).toISOString():null;", "else if(field.type==='datetime-local'){if(value&&!Number.isFinite(Date.parse(value))){$('formMsg').textContent='Revisa la fecha de '+field.label+'.';return;}value=value?new Date(value).toISOString():null;}")
rep("if(field.type==='number'&&value!==null&&(!Number.isFinite(value)", "if(field.options&&value&&!Object.hasOwn(field.options,value)&&value!==original?.[field.key]){$('formMsg').textContent='Selecciona una opción válida para '+field.label+'.';return;}\n  if(['score','probability','quantity'].includes(field.key)&&value!==null&&!Number.isInteger(value)){$('formMsg').textContent=field.label+' debe ser un número entero.';return;}\n  if(field.type==='number'&&value!==null&&(!Number.isFinite(value)")
rep("if(payload.contact_id){const selected=data.contacts.find(c=>c.id===payload.contact_id);if(!selected||selected.institution_id&&selected.institution_id!==payload.institution_id){$('formMsg').textContent='El contacto debe pertenecer a la institución seleccionada.';return;}}", "const relationshipError=editorRelationshipError(payload);if(relationshipError){$('formMsg').textContent=relationshipError;return;}\n if(editTable==='activities'&&Boolean(payload.next_action)!==Boolean(payload.next_action_date)){$('formMsg').textContent='Para programar el seguimiento, completa la próxima acción y su fecha, o deja ambos campos vacíos.';return;}")
rep("if(!errors.some(error=>error.startsWith(prefix)))payloads.push(payload);", "const relationError=editorRelationshipError(payload);if(relationError)errors.push(prefix+relationError);\n  if(table==='activities'&&Boolean(payload.next_action)!==Boolean(payload.next_action_date))errors.push(prefix+'completa la próxima acción y su fecha.');\n  if(['score','probability','quantity'].some(key=>payload[key]!=null&&!Number.isInteger(payload[key])))errors.push(prefix+'los porcentajes manuales y la cantidad deben ser enteros.');\n  if(!errors.some(error=>error.startsWith(prefix)))payloads.push(payload);")
rep("field('Origen',lead.source)","field('Canal de origen',enums.leadSource[lead.source]||lead.source)")
rep("esc(date(row.occurred_at))+'</small><p>'", "esc(enums.activityType[row.type]||row.type)+' · '+esc(date(row.occurred_at))+'</small><p>'")
rep("esc(row.notes||row.need_summary||'Sin notas adicionales')+'</p></article>'", "esc(row.notes||row.need_summary||'Sin notas adicionales')+'</p>'+(writableFor('activities')?'<button type=\"button\" data-edit-activity=\"'+row.id+'\">Editar interacción</button>':'')+'</article>'")
rep("if(b.dataset.activityLead){", "if(b.dataset.editActivity){closeLeadDetails();openEditor('activities',b.dataset.editActivity);return;}if(b.dataset.activityLead){")
helpers=r'''
// Linked fields are real foreign keys. Keep the form consistent without inventing interactions.
function editorRelationRows(key,row={}){
 const list=scopedRows(relationTable(key));
 return key==='contact_id'&&row.institution_id?list.filter(contact=>!contact.institution_id||contact.institution_id===row.institution_id):list;
}
function editorRelationshipError(payload){
 if(payload.contact_id){
  const contact=scopedRows('contacts').find(row=>row.id===payload.contact_id);
  if(!contact)return 'Selecciona un contacto disponible.';
  if(contact.institution_id&&!payload.institution_id)payload.institution_id=contact.institution_id;
  if(contact.institution_id&&contact.institution_id!==payload.institution_id)return 'El contacto debe pertenecer a la institución seleccionada.';
 }
 if(payload.lead_id){
  const lead=scopedRows('leads').find(row=>row.id===payload.lead_id);
  if(!lead)return 'Selecciona un prospecto disponible.';
  if(lead.institution_id&&payload.institution_id&&lead.institution_id!==payload.institution_id)return 'La institución debe coincidir con la del prospecto. Corrige primero el prospecto si cambió de institución.';
 }
 return '';
}
function syncEditorRelations(changed){
 if(!['institution_id','contact_id','lead_id'].includes(changed)||!editTable||busy)return;
 const available=fieldsFor(editTable).map(field=>field.key);
 const node=key=>available.includes(key)?document.getElementById('field-'+key):null;
 const institution=node('institution_id'),contact=node('contact_id'),lead=node('lead_id');
 if(changed==='lead_id'&&lead){
  const chosen=scopedRows('leads').find(row=>row.id===lead.value);
  if(institution)institution.value=chosen?.institution_id||'';
  if(contact)contact.dataset.preferred=chosen?.contact_id||'';
 }
 if(changed==='contact_id'&&contact&&institution){
  const chosen=scopedRows('contacts').find(row=>row.id===contact.value);
  if(chosen?.institution_id&&!institution.value)institution.value=chosen.institution_id;
 }
 if(contact){
  const old=changed==='lead_id'?contact.dataset.preferred||'':contact.value;
  const rows=editorRelationRows('contact_id',{institution_id:institution?.value||''});
  contact.innerHTML='<option value="">Sin vincular</option>'+rows.map(row=>'<option value="'+esc(row.id)+'">'+esc(nameOf(row))+'</option>').join('');
  contact.value=rows.some(row=>row.id===old)?old:'';
  const help=document.getElementById('relationHelp');
  if(help)help.textContent=rows.length?'Selecciona el contacto correspondiente; la selección se guarda junto al registro.':'No hay contactos para esta institución. Registra primero el contacto en el módulo Contactos.';
 }
}
'''
rep("function openEditor(table,id=null,initialValues={}){",helpers+"\nfunction openEditor(table,id=null,initialValues={}){")
s=s.replace("2026-09-18-v2.1","2026-09-18-v2.2")
s=s.replace("country:'Peru',type:'OTHER',priority:","country:'Peru',type:table==='activities'?'':'OTHER',priority:")
s=s.replace("value=value?new Date(value).toISOString():null;}","value=value?(original?.[field.key]&&value===localDateTime(original[field.key])?original[field.key]:new Date(value).toISOString()):null;}")
p.write_text(s)
for name in ['index.html','tests/app-workspace.test.mjs','tests/browser-smoke.py','tests/verify-production.py']:
 p=root/name;t=p.read_text().replace('2026-09-18-v2.1','2026-09-18-v2.2').replace('20260918-v2.1','20260918-v2.2').replace('V2 · 18 SEP 2026','V2.2 · 18 SEP 2026');p.write_text(t)
print('Editor fields updated; no database, customer or account changes from this script.')
