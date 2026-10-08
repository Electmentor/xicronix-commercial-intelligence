"""Real Chromium UI tests with isolated Auth/Data fixtures. Never authenticates a real user."""
import argparse,json,os,re,threading,http.server,functools
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
# Compare the rendered release against this checkout, including deployed-asset runs.
release_markers=re.findall(r'<meta\s+name="xicronix-release"\s+content="([^"]+)"', (root/'index.html').read_text())
assert len(release_markers)==1 and re.fullmatch(r'\d{4}-\d{2}-\d{2}-v\d+\.\d+\.\d+',release_markers[0]), 'Missing or invalid candidate release marker'
expected_release=release_markers[0]
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
   elif 'unpkg.com/leaflet@' in u and u.endswith('.js'):route.fulfill(status=200,content_type='application/javascript',body='')
   elif 'unpkg.com/leaflet@' in u and u.endswith('.css'):route.fulfill(status=200,content_type='text/css',body='')
   elif urlparse(u).netloc==urlparse(base).netloc:route.continue_()
   else:blocked.append(u.split('?')[0]);route.abort()
  context.route('**/*',route_handler)
  page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base+url,wait_until='networkidle')
  return context,page
 def check(name,fn):
  fn();checks.append(name)
 def open_sidebar():
  toggle=page.locator('#sidebarToggle')
  if toggle.get_attribute('aria-expanded')=='false':toggle.click()
  expect(toggle).to_have_attribute('aria-expanded','true')
  expect(page.locator('#mainSidebar')).to_be_visible()
 def sidebar_click(selector):
  open_sidebar()
  page.locator(selector).click()
 def nav(target):
  sidebar_click('#navigation [data-page="'+target+'"]')
  expect(page.locator('#appView')).to_have_attribute('data-page',target)
 try:
  context,page=newpage();expect(page.locator('#workspaceControls')).to_be_visible()
  page.locator('#entryDirectionBtn').click();expect(page.locator('#workspaceEntry')).to_be_hidden()
  page.wait_for_timeout(500)
  if page.locator('#dailyBriefingDialog').evaluate("el=>el.open"):
   page.locator('#closeDailyBriefing').click()
  check('actual data is default',lambda:expect(page.locator('#sidebarLiveBtn')).to_have_attribute('aria-pressed','true'))
  check('release marker',lambda:expect(page.locator('meta[name="xicronix-release"]')).to_have_attribute('content',expected_release))
  open_sidebar();checks.append('desktop navigation opens through its menu button')
  page.screenshot(path=str(out/'desktop-v2-fixture.png'),full_page=True)
  pages=['now','users','goals','opportunities','meetings','leads','prospects','radar','supplier_relationships','strategic_alliances','catalog_products','institutions','contacts','mail','documents','cost_profiles','expenses','dashboard']
  for target in pages:
   nav(target)
   check('navigation '+target,lambda t=target:expect(page.locator('#appView')).to_have_attribute('data-page',t))
  nav('now')
  check('mobile command center renders',lambda:expect(page.locator('#recordList')).to_contain_text('XICRONIX AHORA'))
  check('now cards are navigable',lambda:expect(page.locator('.now-kpi-card')).to_have_count(4))
  page.locator('.now-kpi-card').nth(2).click()
  check('potential card opens Radar',lambda:expect(page.locator('#appView')).to_have_attribute('data-page','radar'))
  check('potential card applies Radar filter',lambda:expect(page.locator('#filter')).to_have_value('POTENTIAL'))
  nav('now')
  nav('mail')
  check('Zoho mail module renders',lambda:expect(page.locator('#recordList')).to_contain_text('Diagnóstico del laboratorio'))
  nav('radar')
  check('radar module renders safely',lambda:expect(page.locator('#recordList')).to_contain_text('Colegio Radar de prueba'))
  check('Radar call action visible',lambda:expect(page.locator('.radar-quick-actions a[href^="tel:"]')).to_be_visible())
  check('Radar Zoho email action visible',lambda:expect(page.get_by_role('link',name='Correo Zoho')).to_be_visible())
  check('Radar WhatsApp action visible',lambda:expect(page.locator('.radar-quick-actions a[href*="wa.me"]')).to_be_visible())
  check('Radar linked prospect action visible',lambda:expect(page.locator('[data-radar-lead]')).to_be_visible())
  check('Radar register action visible',lambda:expect(page.locator('[data-radar-activity]')).to_be_visible())
  nav('leads')
  check('real lead visible',lambda:expect(page.locator('#recordList')).to_contain_text('Institución de validación · Diagnóstico'))
  page.get_by_role('button',name='Abrir expediente comercial').first.click();check('commercial dossier opens',lambda:expect(page.locator('.lead-detail-kicker')).to_have_text('EXPEDIENTE COMERCIAL'));check('recommended action visible',lambda:expect(page.locator('#leadDetailContent')).to_contain_text('ACCIÓN RECOMENDADA'));check('planning section visible',lambda:expect(page.locator('#leadDetailContent')).to_contain_text('Agenda y tareas'));check('documents section visible',lambda:expect(page.locator('#leadDetailContent')).to_contain_text('Documentos y material'));page.locator('#closeLeadDetail').click()
  check('historical simulated records excluded',lambda:expect(page.locator('#recordList')).not_to_contain_text('[SIMULADO]'))
  page.get_by_role('button',name='Abrir expediente comercial').first.click()
  check('original request displayed',lambda:expect(page.locator('#leadDetailContent')).to_contain_text('Solicitamos un diagnóstico'))
  check('original text escaped',lambda:expect(page.locator('#leadDetailContent em')).to_have_count(0))
  page.screenshot(path=str(out/'request-detail-fixture.png'),full_page=True)
  page.locator('#closeLeadDetail').click()
  page.get_by_role('button',name='Registrar movimiento').first.click();check('interaction form',lambda:expect(page.locator('#editor')).to_be_visible());page.locator('#cancelEditor').click()
  page.locator('#themeToggle').click();page.reload(wait_until='networkidle')
  page.locator('#entryDirectionBtn').click();expect(page.locator('#workspaceEntry')).to_be_hidden();page.wait_for_timeout(500)
  if page.locator('#dailyBriefingDialog').evaluate("el=>el.open"):
   page.locator('#closeDailyBriefing').click()
  check('night mode persists',lambda:expect(page.locator('html')).to_have_attribute('data-theme','night'))
  nav('radar')
  page.locator('#recordList').evaluate("""node=>node.insertAdjacentHTML('beforeend','<article id="nightRadarProbe" class="radar-card critical"><header><div><span class="radar-class">Crítica</span><h3>Prueba visual</h3><p>Lima</p></div><div class="radar-score"><b>94</b><span>/100</span></div></header><p class="radar-summary">Texto principal legible</p><div class="radar-facts"><span><b>Laboratorio</b>Confirmado</span></div><footer><a href="#">Fuente</a></footer></article>')""")
  assert page.evaluate("getComputedStyle(document.querySelector('#nightRadarProbe')).backgroundColor")!='rgb(255, 255, 255)';checks.append('night radar card uses dark surface')
  assert page.evaluate("getComputedStyle(document.querySelector('#nightRadarProbe')).color") in ['rgb(238, 245, 255)','rgb(232, 240, 250)'];checks.append('night radar text has strong contrast token')
  page.set_viewport_size({'width':390,'height':900})
  assert page.evaluate("getComputedStyle(document.querySelector('.sidebar-toggle')).position")=='fixed';checks.append('mobile sidebar toggle uses current fixed menu control')
  check('mobile footer is visible',lambda:expect(page.locator('#mobileAppBottomNav')).to_be_visible())
  assert page.evaluate("parseFloat(getComputedStyle(document.querySelector('#mobileAppBottomNav button small')).fontSize)>=10");checks.append('mobile footer labels are readable')

  sidebar_click('#sidebarDemoBtn');check('explicit demo',lambda:expect(page.locator('#sidebarDemoBtn')).to_have_attribute('aria-pressed','true'))
  sidebar_click('#sidebarLiveBtn');check('return to real',lambda:expect(page.locator('#sidebarLiveBtn')).to_have_attribute('aria-pressed','true'))
  assert page.evaluate('window.__testWrites.length')==0;checks.append('no business writes in browsing')
  if page.locator('#sidebarToggle').get_attribute('aria-expanded')=='true':page.locator('#sidebarToggle').click()
  page.locator('#mobileNavHome').click()
  for width in [320,390,768,1024,1440]:
   page.set_viewport_size({'width':width,'height':900})
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),f'horizontal overflow at {width}'
   checks.append('viewport '+str(width))
   nav('leads')
   expect(page.locator('#appView')).to_have_attribute('data-page','leads')
   if width==390:page.screenshot(path=str(out/'mobile-v2-fixture.png'),full_page=True)
  context.close()
  lead='33333333-3333-4333-8333-333333333333'
  context,page=newpage(url='?lead='+lead)
  check('notification link opens request',lambda:expect(page.locator('#leadDetailDialog')).to_be_visible())
  page.locator('#closeLeadDetail').click();sidebar_click('#logoutBtn')
  check('logout clears private details',lambda:expect(page.locator('#leadDetailContent')).to_be_empty())
  check('logout returns login',lambda:expect(page.locator('#authView')).to_be_visible());context.close()
  for role in ['SALES','MANAGER','VIEWER']:
   context,page=newpage({'role':role});expect(page.locator('#appView')).to_be_visible();page.wait_for_timeout(500)
   if page.locator('#dailyBriefingDialog').evaluate("el=>el.open"):
    page.locator('#closeDailyBriefing').click()
   check(role+' cannot select administrator mode',lambda:expect(page.locator('#adminModeBtn')).to_be_hidden())
   check(role+' cannot open admin routes',lambda:expect(page.locator('#navigation [data-page="users"]')).to_have_count(0))
   check(role+' has seller dashboard',lambda:expect(page.locator('#dashboard')).to_contain_text(re.compile(r'Tu negocio\s*en una sola vista')))
   nav('leads')
   check(role+' sees prospect progress',lambda:expect(page.locator('#dashboard')).to_contain_text('Institución de validación'))
   check(role+' sees only assigned leads',lambda:expect(page.locator('#dashboard')).not_to_contain_text('Prospecto de otro vendedor'))
   if role=='SALES':
    nav('tasks')
    check('seller task cards render',lambda:expect(page.locator('.task-mobile-card')).to_have_count(1))
    check('seller task quick actions visible',lambda:expect(page.locator('.task-mobile-actions').first).to_be_visible())
    check('seller linked task opens prospect',lambda:expect(page.locator('[data-task-lead]').first).to_be_visible())
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
 except Exception as error:
  errors.append(str(error));page.screenshot(path=str(out/'failure.png'),full_page=True)
  raise
 finally:
  (out/'results.json').write_text(json.dumps({'base_url':base,'mode':'Chromium with isolated Supabase Auth/Data fixtures; not a real-account end-to-end test','checks':checks,'count':len(checks),'javascript_errors':errors,'blocked_network':blocked},ensure_ascii=False,indent=2))
  browser.close()
  if server:server.shutdown()
print(f'{len(checks)} browser checks passed; no real account, email or business record was modified.')
