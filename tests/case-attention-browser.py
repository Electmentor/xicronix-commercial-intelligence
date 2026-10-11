"""Isolated Chromium case workflow tests. Never calls a real API, DB or mail provider."""
import argparse, functools, http.server, json, os, re, threading, traceback
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--serve-fixture', action='store_true', help='Serve an isolated CSP-protected fixture for supported cloud browser QA')
parser.add_argument('--output', default=str(ROOT / 'review-artifacts/case-attention'))
args = parser.parse_args()
OUT = Path(args.output); OUT.mkdir(parents=True, exist_ok=True)
class QuietServer(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
    def do_GET(self):
        path=urlparse(self.path).path
        if args.serve_fixture:
            if path in ['/', '/index.html']:
                body=(ROOT/'index.html').read_text()
                body=re.sub(r'<script[^>]+src="https://cdn\.jsdelivr[^>]+></script>', '<script defer src="/isolated-fixture.js"></script>', body)
                body=re.sub(r'<(?:script|link)[^>]+(?:src|href)="https://unpkg\.com/leaflet[^>]*>(?:</script>)?', '', body)
                payload=body.encode();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8')
                self.send_header('Content-Security-Policy', "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'none'; frame-src 'self'; object-src 'none'; form-action 'none'")
                self.send_header('Content-Length',str(len(payload)));self.end_headers();self.wfile.write(payload);return
            if path=='/isolated-fixture.js':
                self.send_response(200);self.send_header('Content-Type','application/javascript');self.end_headers();self.wfile.write(FIXTURE.encode());return
            if path.startswith('/api/') or path.startswith('/functions/'):
                self.send_error(403,'Real endpoints forbidden in isolated fixture');return
        return super().do_GET()
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietServer, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{server.server_port}/'
FIXTURE = (ROOT / 'tests/browser-fixture.js').read_text() + '\n' + (ROOT / 'tests/case-attention-browser-fixture.js').read_text()
if args.serve_fixture:
    print(BASE,flush=True)
    threading.Event().wait()
LEAD='33333333-3333-4333-8333-333333333333'
DOC='55555555-5555-4555-8555-555555555551'
DOC2='55555555-5555-4555-8555-555555555552'
REQUEST='Laboratorio de física escolar, 30 m²'
checks=[]; failures=[]; errors=[]; blocked=[]; screenshots=[]; calls=[]
expect.set_options(timeout=2000)
def check(name, fn):
    try: fn(); checks.append(name)
    except Exception as exc: failures.append({'check':name,'error':str(exc)}); print('FAIL:',name, str(exc)[:240],flush=True)
def assert_true(value, message='Assertion failed'):
    assert value, message
def screenshot(page,name):
    path=OUT/(name+'.png');page.screenshot(path=str(path),full_page=True);screenshots.append(str(path))
def invoke_bodies(page): return page.evaluate('window.__caseTest.calls.map(c=>c.body)')
def send_bodies(page): return [r for r in invoke_bodies(page) if r.get('action')!='capabilities']
def no_overflow(page):
    assert_true(page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Page has horizontal overflow')
    for locator in ['#leadDetailDialog[open]','#smartMailDialog[open]']:
        if page.locator(locator).count():
            assert_true(page.locator(locator).evaluate('el=>el.scrollWidth<=el.clientWidth+1'),locator+' has horizontal overflow')
def open_detail(page):
    page.locator(f'[data-case-id="{LEAD}"] [data-lead-detail]').click()
    expect(page.locator('#leadDetailDialog')).to_be_visible()
def open_draft(page,from_detail=False):
    target=f'#leadDetailDialog [data-smart-mail="{LEAD}"]' if from_detail else f'[data-case-id="{LEAD}"] [data-smart-mail]'
    page.locator(target).click();expect(page.locator('#smartMailDialog')).to_be_visible()
def fill_draft(page):
    page.locator('#smartMailBody').fill('Hola Ana,\n\nSobre el laboratorio de física escolar de 30 m², ¿cuántos alumnos lo utilizarán?\n\nSaludos,\nEquipo Xicronix')
    page.locator(f'[data-smart-material="{DOC}"]').click()
    return page.locator('#smartMailBody').input_value()
def send(page):
    page.locator('[data-send-smart-mail]').click()
    page.wait_for_timeout(150)
def wait_ready(page):
    expect(page.locator('[data-send-smart-mail]')).to_be_enabled()
def set_responses(page, responses):page.evaluate('(r)=>window.__caseTest.control.responses=r', responses)
with sync_playwright() as p:
    try:
        browser=p.chromium.launch(executable_path=os.environ.get('BROWSER_EXECUTABLE','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    except Exception as exc:
        (OUT/'results.json').write_text(json.dumps({'status':'blocked','mode':'Isolated Playwright Chromium','passed':[],'failures':[],'browser_launch_error':str(exc),'visual_review':'not run: Chromium cannot create required socket; no screenshot fabricated'},ensure_ascii=False,indent=2))
        server.shutdown();raise
    def newpage(config=None,width=1440,url=''):
        context=browser.new_context(viewport={'width':width,'height':900},locale='es-PE',timezone_id='America/Lima',service_workers='block')
        context.add_init_script('window.__testConfig='+json.dumps(config or {})+';')
        def route_handler(route):
            u=route.request.url
            if 'cdn.jsdelivr.net/npm/@supabase/supabase-js@' in u:route.fulfill(status=200,content_type='application/javascript',body=FIXTURE)
            elif 'unpkg.com/leaflet@' in u:route.fulfill(status=200,content_type='application/javascript' if '.js' in u else 'text/css',body='')
            elif urlparse(u).netloc==urlparse(BASE).netloc and route.request.method=='GET' and not urlparse(u).path.startswith('/api/'):
                route.continue_()
            else:blocked.append({'url':u.split('?')[0],'method':route.request.method});route.abort()
        context.route('**/*',route_handler)
        page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('dialog',lambda d:d.accept())
        page.goto(BASE+url,wait_until='networkidle');page.wait_for_timeout(200)
        return context,page
    def scenario(name,fn,config=None,width=1440,url=''):
        context,page=newpage(config,width,url)
        try:fn(page)
        except Exception as exc:
            failures.append({'check':name+' scenario','error':str(exc),'traceback':traceback.format_exc()})
            print('SCENARIO FAIL:',name,str(exc)[:300],flush=True)
            screenshot(page,name+'-failure')
        finally:
            calls.append({'scenario':name,'calls':page.evaluate('window.__caseTest?.calls||[]')})
            check(name+' no direct business writes',lambda:assert_true(page.evaluate('window.__testWrites.length===0')))
            context.close()
    def browsing(page):
        check('direct Mis casos landing',lambda:expect(page.locator('#appView')).to_have_attribute('data-page','leads'))
        check('workspace gate hidden',lambda:expect(page.locator('#workspaceEntry')).to_be_hidden())
        check('daily briefing does not interrupt',lambda:expect(page.locator('#dailyBriefingDialog')).to_be_hidden())
        check('Pendientes is default',lambda:expect(page.locator('[data-case-filter="pending"]')).to_have_attribute('aria-pressed','true'))
        check('two own pending cases',lambda:expect(page.locator('.case-card')).to_have_count(2))
        check('other owner excluded',lambda:expect(page.locator('.case-workspace')).not_to_contain_text('Caso de otro propietario'))
        card=page.locator(f'[data-case-id="{LEAD}"]')
        check('request preserved verbatim',lambda:expect(card.locator('.case-request p')).to_have_text(REQUEST))
        check('metadata excluded from request',lambda:expect(card.locator('.case-request')).not_to_contain_text('INTERNAL_'))
        check('case has owner, last action, next step',lambda:assert_true(all(t in card.inner_text() for t in ['Responsable','Última acción','Siguiente paso'])))
        check('no email case cannot reply',lambda:expect(page.locator('[data-case-id$="3335"] [data-smart-mail]')).to_have_count(0))
        screenshot(page,'desktop-pending');check('desktop list no overflow',lambda:no_overflow(page))
        page.locator('[data-case-filter="all"]').click();check('all includes closed',lambda:expect(page.locator('.case-card')).to_have_count(3))
        page.locator('[data-case-filter="closed"]').click();check('closed filter isolates closed case',lambda:expect(page.locator('.case-card')).to_have_count(1))
        check('closed case visible',lambda:expect(page.locator('.case-card')).to_contain_text('Colegio Cerrado Sintético'))
        page.locator('[data-case-filter="all"]').click()
        search=page.locator('#commercialSearch');search.fill('Física')
        check('search narrows cases',lambda:expect(page.locator('.case-card')).to_have_count(1))
        search.fill('zz-sin-coincidencias');check('search empty result',lambda:expect(page.locator('.case-card')).to_have_count(0))
        search.fill('');page.locator('[data-case-filter="pending"]').click()
        open_detail(page)
        check('detail original request',lambda:expect(page.locator('.case-original-request')).to_have_text(REQUEST))
        check('detail context fields',lambda:assert_true(all(t in page.locator('.case-context-grid').inner_text() for t in ['Responsable','Última acción','Siguiente paso'])))
        check('reply in detail',lambda:expect(page.locator('#leadDetailDialog [data-smart-mail]')).to_have_text('Responder'))
        page.get_by_text('Conversación por correo',exact=False).click()
        check('outbox appears in conversation',lambda:expect(page.locator('.mail-thread')).to_contain_text('Acuse anterior conservado'))
        screenshot(page,'desktop-detail');check('desktop detail no overflow',lambda:no_overflow(page))
        page.locator('#closeLeadDetail').click();check('close restores focus',lambda:expect(page.locator(f'[data-case-id="{LEAD}"] [data-lead-detail]')).to_be_focused())
        open_detail(page);page.keyboard.press('Escape');check('Escape closes detail',lambda:expect(page.locator('#leadDetailDialog')).to_be_hidden())
        check('Escape restores focus',lambda:expect(page.locator(f'[data-case-id="{LEAD}"] [data-lead-detail]')).to_be_focused())
        open_detail(page);page.go_back();check('Back closes drawer',lambda:expect(page.locator('#leadDetailDialog')).to_be_hidden())
        check('Back keeps app open',lambda:expect(page.locator('#appView')).to_be_visible())
    def compose(page):
        open_detail(page);open_draft(page,True)
        check('draft displays request context',lambda:expect(page.locator('.smart-mail-original')).to_contain_text(REQUEST))
        check('draft excludes internal next_action and metadata',lambda:assert_true('INTERNAL_' not in page.locator('#smartMailBody').input_value()))
        send(page);check('placeholder blocks send',lambda:assert_true(len(invoke_bodies(page))==0))
        check('placeholder explains missing reply',lambda:expect(page.locator('#smartMailFeedback')).to_contain_text('Sustituye'))
        check('placeholder focuses body',lambda:expect(page.locator('#smartMailBody')).to_be_focused())
        fill_draft(page);check('attachment selection count',lambda:expect(page.locator('#smartMaterialCount')).to_have_text('1 adjunto'))
        screenshot(page,'desktop-reply');check('desktop compose no overflow',lambda:no_overflow(page))
        page.locator('#closeSmartMail').click();check('cancel closes draft',lambda:expect(page.locator('#smartMailDialog')).to_be_hidden())
        check('cancel returns focus to reply',lambda:expect(page.locator('#leadDetailDialog [data-smart-mail]')).to_be_focused())
        open_draft(page,True);page.keyboard.press('Escape');check('Escape closes draft',lambda:expect(page.locator('#smartMailDialog')).to_be_hidden())
        open_draft(page,True);page.go_back();check('Back closes draft before detail',lambda:expect(page.locator('#smartMailDialog')).to_be_hidden())
        check('detail remains after draft Back',lambda:expect(page.locator('#leadDetailDialog')).to_be_visible())
    def success(page):
        open_draft(page);fill_draft(page);page.locator(f'[data-smart-material="{DOC2}"]').click();send(page)
        expect(page.locator('.case-send-result')).to_be_visible()
        bodies=invoke_bodies(page);sends=send_bodies(page)
        check('capabilities precedes send',lambda:assert_true(bodies[0]=={'action':'capabilities'} and len(sends)==1))
        check('selected document IDs sent',lambda:assert_true(sends[0]['document_ids']==sorted([DOC,DOC2])))
        check('UUID idempotency key sent',lambda:assert_true(bool(re.fullmatch(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}',sends[0].get('idempotency_key','')))))
        check('function invoked with POST',lambda:assert_true(page.evaluate('window.__caseTest.calls.every(c=>c.method==="POST")')))
        check('success only says delivery unconfirmed',lambda:expect(page.locator('.case-send-result')).to_contain_text('Entrega al destinatario pendiente de confirmación'))
        check('send does not close lead',lambda:assert_true(page.evaluate('(id)=>window.__testDB.leads.find(r=>r.id===id).status',LEAD)=='NEW'))
        check('sent mail in reloaded conversation',lambda:expect(page.locator('.mail-thread')).to_contain_text('¿cuántos alumnos lo utilizarán?'))
        check('only digest and identifiers persisted',lambda:assert_true('cuántos alumnos' not in page.evaluate('JSON.stringify(sessionStorage)')))
        screenshot(page,'desktop-sent')
    def not_ready(page):
        open_draft(page);body=fill_draft(page);send(page);wait_ready(page)
        check('old contract blocks send',lambda:assert_true(len(send_bodies(page))==0))
        check('old contract keeps draft',lambda:expect(page.locator('#smartMailBody')).to_have_value(body))
        check('old contract explains channel',lambda:expect(page.locator('#smartMailFeedback')).to_contain_text('aún no está habilitado'))
    def recoverable_error(page):
        open_draft(page);body=fill_draft(page);send(page);wait_ready(page)
        check('provider error keeps draft',lambda:expect(page.locator('#smartMailBody')).to_have_value(body))
        check('provider error keeps selected docs',lambda:expect(page.locator(f'[data-smart-material="{DOC}"]')).to_have_class(re.compile('selected')))
        check('provider error inline visible',lambda:expect(page.locator('#smartMailFeedback')).to_contain_text('rechazó'))
        send(page);expect(page.locator('.case-send-result')).to_be_visible();sent=send_bodies(page)
        check('confirmed failure allows new key with same message',lambda:assert_true(len(sent)==2 and sent[0]['idempotency_key']!=sent[1]['idempotency_key'] and {k:v for k,v in sent[0].items() if k!='idempotency_key'}=={k:v for k,v in sent[1].items() if k!='idempotency_key'}))
    def uncertain(page):
        open_draft(page);body=fill_draft(page);send(page);wait_ready(page)
        check('network error keeps draft',lambda:expect(page.locator('#smartMailBody')).to_have_value(body))
        check('network error preserves selected doc',lambda:expect(page.locator(f'[data-smart-material="{DOC}"]')).to_have_class(re.compile('selected')))
        check('network uncertainty visible',lambda:expect(page.locator('#smartMailFeedback')).to_contain_text('No se pudo confirmar'))
        old=send_bodies(page)[0]
        page.locator('#smartMailBody').fill(body+'\nOtra frase.');send(page);wait_ready(page)
        check('changed payload blocked during uncertainty',lambda:assert_true(len(send_bodies(page))==1))
        page.locator('#smartMailBody').fill(body);send(page);expect(page.locator('.case-send-result')).to_be_visible()
        check('uncertain retry retains key',lambda:assert_true(send_bodies(page)[1]==old))
    def invalid_success(page):
        open_draft(page);body=fill_draft(page);send(page);wait_ready(page)
        check('incomplete success remains open',lambda:expect(page.locator('#smartMailDialog')).to_be_visible())
        check('incomplete success not announced sent',lambda:expect(page.locator('.case-send-result')).to_have_count(0))
        check('incomplete success keeps draft',lambda:expect(page.locator('#smartMailBody')).to_have_value(body))
    def mobile(page):
        check('390px direct pending landing',lambda:expect(page.locator('#appView')).to_have_attribute('data-page','leads'))
        check('390px no overflow',lambda:no_overflow(page));screenshot(page,'mobile-pending')
        open_detail(page);check('390px detail no overflow',lambda:no_overflow(page));screenshot(page,'mobile-detail')
        open_draft(page,True);fill_draft(page);check('390px draft no overflow',lambda:no_overflow(page));screenshot(page,'mobile-reply')
        page.keyboard.press('Escape');page.locator('#closeLeadDetail').click()
        page.locator('[data-case-filter="closed"]').click();check('390px filters work',lambda:expect(page.locator('.case-card')).to_have_count(1))
    try:
        scenario('browsing',browsing)
        scenario('compose',compose)
        scenario('success',success)
        scenario('capabilities',not_ready,{'capabilities':{'contract_version':2,'attachments':True,'idempotency':True}})
        scenario('error-retry',recoverable_error,{'responses':[{'errorResponse':{'error':'provider_rejected','status':'FAILED','retry_allowed':True}}]})
        scenario('network-retry',uncertain,{'responses':[{'throw':'Synthetic network failure'}]})
        scenario('missing-provider',invalid_success,{'responses':[{'ok':True,'status':'SENT','delivery_status':'UNCONFIRMED'}]})
        scenario('wrong-delivery',invalid_success,{'responses':[{'ok':True,'status':'SENT','provider_message_id':'fixture-id','delivery_status':'DELIVERED'}]})
        scenario('mobile',mobile,width=390)
        check('no unhandled JavaScript errors',lambda:assert_true(not errors,str(errors)))
        check('no real backend or unexpected network attempted',lambda:assert_true(not blocked,str(blocked)))
    finally:
        result={'mode':'Local Chromium; base Supabase fixture extended; all external hosts blocked; no real accounts, API, email or DB','passed':checks,'failures':failures,'count':len(checks),'javascript_errors':errors,'blocked_network':blocked,'screenshots':screenshots,'function_calls':calls,'visual_review':'pending actual image inspection'}
        (OUT/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
        browser.close();server.shutdown()
print(f'{len(checks)} checks passed; {len(failures)} failures. Evidence: {OUT}',flush=True)
raise SystemExit(1 if failures else 0)
