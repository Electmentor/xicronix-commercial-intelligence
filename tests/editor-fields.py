"""Chromium regression for CRM editor fields. Auth and data are fictional; no real writes."""
import argparse,functools,http.server,json,os,threading
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
root=Path(__file__).resolve().parents[1]
ap=argparse.ArgumentParser();ap.add_argument('--base-url');ap.add_argument('--output',default=str(root/'review-artifacts'/'editor-fields'));args=ap.parse_args()
out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*_):pass
server=None
if args.base_url:base=args.base_url.rstrip('/')+'/'
else:
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(root)))
 threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}/'
fixture=(root/'tests/browser-fixture.js').read_text()+r'''
(()=>{
 const db=window.__testDB,base={organization_id:db.profiles[0].organization_id,created_by:db.profiles[0].id,created_at:'2026-09-18T12:00:00Z',updated_at:'2026-09-18T12:00:00Z'};
 db.institutions.push({...base,id:'inst-2',name:'Segundo colegio de prueba',type:'SCHOOL',country:'Peru'});
 db.contacts.push({...base,id:'contact-2',institution_id:'inst-2',first_name:'Segundo contacto',decision_level:'UNKNOWN'});
 Object.assign(db.leads[0],{institution_id:'inst-1',contact_id:'contact-1',score:25,estimated_value:0});
 db.leads.push({...base,id:'44444444-4444-4444-8444-444444444444',title:'Segundo prospecto de prueba',institution_id:'inst-2',contact_id:'contact-2',owner_user_id:base.created_by,source:'EMAIL',status:'NEW',score:0,estimated_value:0});
 Object.assign(db.activities[0],{institution_id:'inst-1',contact_id:'contact-1',type:'WEB_FORM',outcome:null,occurred_at:'2026-09-18T12:00:50.327Z',next_action:null,next_action_date:null});
 const create=window.supabase.createClient;
 window.supabase.createClient=(...args)=>{
  const client=create(...args),from=client.from;
  client.from=table=>{
   const q=from(table),old=q.result.bind(q);
   q.result=single=>{
    if(!q.applied&&q.op!=='select'){
     q.applied=true;
     if(q.op==='insert')db[table].push({...base,id:crypto.randomUUID(),...q.payload});
     if(q.op==='update')db[table].filter(row=>q.filters.every(([k,v])=>row[k]===v)).forEach(row=>Object.assign(row,q.payload));
    }
    return old(single);
   };
   return q;
  };
  return client;
 };
})();
'''
checks=[];errors=[];blocked=[]
with sync_playwright() as p:
 exe=os.environ.get('BROWSER_EXECUTABLE') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None)
 browser=p.chromium.launch(executable_path=exe,headless=True,args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':1440,'height':1000},locale='es-PE',timezone_id='America/Lima')
 def route(r):
  if 'cdn.jsdelivr.net/npm/@supabase/supabase-js@' in r.request.url:r.fulfill(status=200,content_type='application/javascript',body=fixture)
  elif urlparse(r.request.url).netloc==urlparse(base).netloc:r.continue_()
  else:blocked.append(r.request.url.split('?')[0]);r.abort()
 context.route('**/*',route);page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 def mark(label):checks.append(label)
 def field(name):return page.locator('#field-'+name)
 def nav(name):page.locator('#navigation [data-page="'+name+'"]').click()
 def cancel():page.locator('#cancelEditor').click()
 def saved():expect(page.locator('#editor')).not_to_be_visible();expect(page.locator('#status')).to_contain_text('guardado correctamente')
 try:
  page.goto(base,wait_until='networkidle');expect(page.locator('#workspaceControls')).to_be_visible();nav('leads')
  row=page.locator('#recordList tr',has_text='Institución de validación · Diagnóstico');row.get_by_role('button',name='Editar',exact=True).click()
  expect(field('institution_id')).to_have_value('inst-1');expect(field('contact_id')).to_have_value('contact-1');expect(field('source')).to_have_value('WEBSITE');mark('lead editor loads actual linked institution contact and web origin')
  expect(field('contact_id').locator('option[value="contact-2"]')).to_have_count(0);mark('contact options are filtered by institution')
  field('institution_id').select_option('inst-2');expect(field('contact_id')).to_have_value('');expect(field('contact_id').locator('option[value="contact-1"]')).to_have_count(0);mark('changing institution clears incompatible contact')
  field('institution_id').select_option('');field('contact_id').select_option('contact-1');expect(field('institution_id')).to_have_value('inst-1');mark('selecting a linked contact fills its institution')
  field('title').fill('Diagnóstico revisado de prueba');field('source').select_option('WEBSITE');field('status').select_option('NEW');field('estimated_value').fill('0');field('score').fill('25');field('next_action').fill('Coordinar reunión de prueba');field('next_action_date').fill('2026-09-22T10:30');page.locator('#saveBtn').click();saved()
  lead=page.evaluate('window.__testDB.leads[0]');assert lead['next_action_date']=='2026-09-22T15:30:00.000Z';assert lead['contact_id']=='contact-1';mark('lead values and Lima date persist in isolated API')
  row=page.locator('#recordList tr',has_text='Diagnóstico revisado de prueba');row.get_by_role('button',name='Registrar movimiento',exact=True).click()
  expect(field('institution_id')).to_have_value('inst-1');expect(field('contact_id')).to_have_value('contact-1');expect(field('action_code')).to_have_value('');expect(field('type')).to_have_value('');expect(field('outcome')).to_have_value('');expect(field('subject')).to_have_value('');mark('new movement inherits links but never fabricates action channel subject or outcome')
  expect(field('type').locator('option[value="WEB_FORM"]')).to_have_text('Formulario web');mark('web-form channel selectable')
  field('lead_id').select_option('44444444-4444-4444-8444-444444444444');expect(field('institution_id')).to_have_value('inst-2');expect(field('contact_id')).to_have_value('contact-2');mark('changing prospect synchronizes institution and contact')
  field('lead_id').select_option('33333333-3333-4333-8333-333333333333')
  field('action_code').select_option('INFORMATION_RECEIVED');field('type').select_option('WEB_FORM');field('subject').fill('Registro ficticio de formulario');field('need_summary').fill('Necesidad de diagnóstico de laboratorio');field('decision_timeline').fill('Por confirmar');field('budget_signal').fill('No informado');field('notes').fill('Texto de prueba\n<em>sin ejecutar HTML</em>');field('occurred_at').fill('2026-09-18T13:53');field('next_action').fill('Preparar reunión');
  page.locator('#saveBtn').click();expect(page.locator('#formMsg')).to_contain_text('próxima acción y su fecha');mark('incomplete followup is rejected without saving')
  field('next_action_date').fill('2026-09-22T11:30');page.locator('#saveBtn').click();saved()
  new=page.evaluate('window.__testDB.activities.at(-1)');assert new['type']=='WEB_FORM' and new['outcome'] is None;assert new['occurred_at']=='2026-09-18T18:53:00.000Z';assert new['next_action_date']=='2026-09-22T16:30:00.000Z';assert new['institution_id']=='inst-1' and new['contact_id']=='contact-1';assert new['budget_signal']=='No informado';mark('all interaction fields persist including null outcome and exact timezone')
  nav('activities');page.locator('#recordList button[data-edit="'+new['id']+'"]').click();expect(field('type')).to_have_value('WEB_FORM');expect(field('outcome')).to_have_value('');expect(field('notes')).to_have_value(new['notes']);expect(field('decision_timeline')).to_have_value('Por confirmar');expect(field('need_summary')).to_have_value('Necesidad de diagnóstico de laboratorio');expect(field('next_action_date')).to_have_value('2026-09-22T11:30');mark('reopening edited interaction retains every saved field')
  page.screenshot(path=str(out/'linked-interaction-fixture.png'),full_page=True);cancel()
  page.locator('#recordList button[data-edit="activity-1"]').click();expect(field('outcome')).to_have_value('');field('subject').fill('Recepción web revisada');page.locator('#saveBtn').click();saved();assert page.evaluate('window.__testDB.activities[0].occurred_at')=='2026-09-18T12:00:50.327Z';mark('editing another field preserves original event seconds and milliseconds')
  nav('leads');page.locator('#recordList tr',has_text='Diagnóstico revisado de prueba').get_by_role('button',name='Ver solicitud').click();expect(page.locator('#leadDetailContent')).to_contain_text('Formulario web');page.locator('#leadDetailContent button[data-edit-activity="activity-1"]').click();expect(page.locator('#leadDetailDialog')).not_to_be_visible();expect(page.locator('#editor')).to_be_visible();mark('original request opens its own edit form without duplicate events');cancel()
  nav('leads');page.locator('#recordList tr',has_text='Diagnóstico revisado de prueba').get_by_role('button',name='Registrar movimiento').click();field('action_code').select_option('FOLLOW_UP');field('type').select_option('EMAIL');field('subject').fill('Prueba de integridad');field('institution_id').select_option('inst-2');field('contact_id').select_option('contact-2');before=page.evaluate('window.__testWrites.length');page.locator('#saveBtn').click();expect(page.locator('#formMsg')).to_contain_text('institución debe coincidir');assert page.evaluate('window.__testWrites.length')==before;mark('mismatched prospect institution is blocked');cancel()
  nav('tasks');page.locator('#recordList button[data-edit="task-1"]').click();expect(field('lead_id')).to_be_visible();expect(field('contact_id')).to_be_visible();field('lead_id').select_option('33333333-3333-4333-8333-333333333333');expect(field('contact_id')).to_have_value('contact-1');mark('task editor also supports consistent links');cancel()
  for width in [390,768,1440]:
   page.set_viewport_size({'width':width,'height':950});nav('leads');page.locator('#recordList tr',has_text='Diagnóstico revisado de prueba').get_by_role('button',name='Registrar movimiento').click();expect(field('type')).to_be_visible();assert page.locator('#editor').evaluate('(el)=>el.scrollWidth<=el.clientWidth+1');cancel();mark('editor fits viewport '+str(width))
  assert not errors,errors;assert not blocked,blocked;mark('no JavaScript errors or real customer requests')
 finally:
  (out/'results.json').write_text(json.dumps({'base_url':base,'fixture_only':True,'checks':checks,'count':len(checks),'javascript_errors':errors,'blocked_requests':blocked},ensure_ascii=False,indent=2));browser.close()
  if server:server.shutdown()
print(f'{len(checks)} editor checks passed; all data operations used isolated fictional fixtures.')
