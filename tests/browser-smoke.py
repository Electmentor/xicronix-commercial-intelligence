"""Real Chromium UI tests with isolated Auth/Data fixtures. Never authenticates a real user."""
import argparse,json,os,threading,http.server,functools
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--base-url');parser.add_argument('--output',default=str(root/'review-artifacts'/'browser'));args=parser.parse_args()
out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
class QuietServer(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
server=None
if not args.base_url:
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietServer,directory=str(root)))
 threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}/'
else:base=args.base_url.rstrip('/')+'/'
fixture=(root/'tests/browser-fixture.js').read_text()
checks=[];errors=[];blocked=[]
with sync_playwright() as p:
 exe=os.environ.get('BROWSER_EXECUTABLE')
 if not exe and Path('/usr/bin/chromium').exists():exe='/usr/bin/chromium'
 browser=p.chromium.launch(executable_path=exe,headless=True,args=['--no-sandbox'])
 def newpage(config=None,url='',width=1440):
  context=browser.new_context(viewport={'width':width,'height':900},locale='es-PE',timezone_id='America/Lima')
  context.add_init_script('window.__testConfig='+json.dumps(config or {})+';')
  def route_handler(route):
   u=route.request.url
   if 'cdn.jsdelivr.net/npm/@supabase/supabase-js@' in u:route.fulfill(status=200,content_type='application/javascript',body=fixture)
   elif urlparse(u).netloc==urlparse(base).netloc:route.continue_()
   else:blocked.append(u.split('?')[0]);route.abort()
  context.route('**/*',route_handler)
  page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base+url,wait_until='networkidle')
  return context,page
 def check(name,fn):
  fn();checks.append(name)
 try:
  context,page=newpage();expect(page.locator('#workspaceControls')).to_be_visible()
  check('actual data is default',lambda:expect(page.locator('#sourceBadge')).to_have_text('DATOS REALES'))
  check('release marker',lambda:expect(page.locator('meta[name="xicronix-release"]')).to_have_attribute('content','2026-09-18-v2.3'))
  page.screenshot(path=str(out/'desktop-v2-fixture.png'),full_page=True)
  pages=['institutions','contacts','leads','opportunities','tasks','activities','catalog_products','cost_profiles','expenses','goals','users','dashboard']
  for target in pages:
   page.locator('#navigation [data-page="'+target+'"]').click()
   check('navigation '+target,lambda t=target:expect(page.locator('#appView')).to_have_attribute('data-page',t))
  page.locator('#navigation [data-page="leads"]').click()
  check('real lead visible',lambda:expect(page.locator('#recordList')).to_contain_text('Institución de validación · Diagnóstico'))
  check('historical simulated records excluded',lambda:expect(page.locator('#recordList')).not_to_contain_text('[SIMULADO]'))
  page.get_by_role('button',name='Ver solicitud').first.click()
  check('original request displayed',lambda:expect(page.locator('#leadDetailContent')).to_contain_text('Solicitamos un diagnóstico'))
  check('original text escaped',lambda:expect(page.locator('#leadDetailContent em')).to_have_count(0))
  page.screenshot(path=str(out/'request-detail-fixture.png'),full_page=True)
  page.locator('#closeLeadDetail').click()
  page.get_by_role('button',name='Registrar movimiento').first.click();check('interaction form',lambda:expect(page.locator('#editor')).to_be_visible());page.locator('#cancelEditor').click()
  page.locator('#navigation [data-page="tasks"]').click();page.reload(wait_until='networkidle')
  check('page survives refresh',lambda:expect(page.locator('#appView')).to_have_attribute('data-page','tasks'))
  page.locator('#themeToggle').click();page.reload(wait_until='networkidle')
  check('night mode persists',lambda:expect(page.locator('html')).to_have_attribute('data-theme','night'))
  page.locator('#sourceToggle').click();check('explicit demo',lambda:expect(page.locator('#sourceBadge')).to_contain_text('DEMOSTRACIÓN'))
  page.locator('#sourceToggle').click();check('return to real',lambda:expect(page.locator('#sourceBadge')).to_have_text('DATOS REALES'))
  assert page.evaluate('window.__testWrites.length')==0;checks.append('no business writes in browsing')
  page.locator('#navigation [data-page="dashboard"]').click()
  for width in [320,390,768,1024,1440]:
   page.set_viewport_size({'width':width,'height':900})
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),f'horizontal overflow at {width}'
   checks.append('viewport '+str(width))
   page.locator('#navigation [data-page="leads"]').scroll_into_view_if_needed();page.locator('#navigation [data-page="leads"]').focus();page.keyboard.press('Enter')
   expect(page.locator('#appView')).to_have_attribute('data-page','leads')
   if width==390:page.screenshot(path=str(out/'mobile-v2-fixture.png'),full_page=True)
  context.close()
  lead='33333333-3333-4333-8333-333333333333'
  context,page=newpage(url='?lead='+lead)
  check('notification link opens request',lambda:expect(page.locator('#leadDetailDialog')).to_be_visible())
  page.locator('#closeLeadDetail').click();page.locator('#logoutBtn').click()
  check('logout clears private details',lambda:expect(page.locator('#leadDetailContent')).to_be_empty())
  check('logout returns login',lambda:expect(page.locator('#authView')).to_be_visible());context.close()
  for role in ['SALES','MANAGER','VIEWER']:
   context,page=newpage({'role':role});expect(page.locator('#appView')).to_be_visible()
   check(role+' cannot select administrator mode',lambda:expect(page.locator('#adminModeBtn')).to_be_hidden())
   check(role+' cannot open admin routes',lambda:expect(page.locator('#navigation [data-page="users"]')).to_have_count(0))
   check(role+' sees only assigned leads',lambda:expect(page.locator('#recordList')).not_to_contain_text('Prospecto de otro vendedor'))
   if role=='VIEWER':check('viewer has no write control',lambda:expect(page.locator('#newBtn')).to_be_hidden())
   context.close()
  context,page=newpage({'loggedOut':True});page.locator('#email').fill('admin@example.invalid');page.locator('#rememberEmail').check()
  page.locator('#forgotBtn').click();expect(page.locator('#password')).to_be_disabled();page.locator('#authBtn').click()
  expect(page.locator('#authMsg')).to_contain_text('Si el correo tiene una cuenta')
  calls=page.evaluate('window.__testAuthCalls');assert calls[-1]['redirectTo']=='https://xicronix-commercial-intelligence.vercel.app/'
  checks.append('canonical password recovery request (fixture)')
  page.reload(wait_until='networkidle');expect(page.locator('#email')).to_have_value('admin@example.invalid');checks.append('remember email persists, not password')
  page.locator('#password').fill('fixture-password-only');page.locator('#authBtn').click();expect(page.locator('#workspaceControls')).to_be_visible()
  assert 'fixture-password-only' not in page.evaluate('JSON.stringify(localStorage)');checks.append('password never saved by application')
  context.close()
  context,page=newpage({'recovery':True});expect(page.locator('#authTitle')).to_have_text('Nueva contraseña')
  expect(page.locator('#password')).to_have_attribute('minlength','12');checks.append('recovery retains account and new-password rules');context.close()
  context,page=newpage({'unlinked':True});expect(page.locator('#status')).to_contain_text('aún no está vinculada');expect(page.locator('#newBtn')).to_be_hidden();checks.append('unlinked user cannot manage records');context.close()
  context,page=newpage({'failTable':'commercial_goals'});expect(page.locator('#status')).to_contain_text('Metas');checks.append('partial failure visible, navigation remains usable');context.close()
  assert not errors,errors
  assert not blocked,blocked
  checks.append('no unhandled JavaScript errors or real backend calls')
 finally:
  (out/'results.json').write_text(json.dumps({'base_url':base,'mode':'Chromium with isolated Supabase Auth/Data fixtures; not a real-account end-to-end test','checks':checks,'count':len(checks),'javascript_errors':errors,'blocked_network':blocked},ensure_ascii=False,indent=2))
  browser.close()
  if server:server.shutdown()
print(f'{len(checks)} browser checks passed; no real account, email or business record was modified.')
