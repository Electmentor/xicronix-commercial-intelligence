"""Chromium test of the actual app with isolated UI fixtures; no real APIs or messages."""
import functools,http.server,json,os,threading
from datetime import datetime,timedelta
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'review-artifacts'/'case-direction';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start();BASE=f'http://127.0.0.1:{server.server_port}/'
fixture=(ROOT/'tests/browser-fixture.js').read_text()+'\n'+(ROOT/'tests/case-direction-browser-fixture.js').read_text()
checks=[];errors=[]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 for width in [1440,390]:
  context=browser.new_context(viewport={'width':width,'height':900},locale='es-PE',timezone_id='America/Lima',service_workers='block')
  def route(r):
   u=r.request.url
   if 'cdn.jsdelivr.net/npm/@supabase/supabase-js@' in u:r.fulfill(status=200,content_type='application/javascript',body=fixture)
   elif 'unpkg.com/leaflet@' in u:r.fulfill(status=200,body='')
   elif urlparse(u).netloc==urlparse(BASE).netloc:r.continue_()
   else:r.abort()
  context.route('**/*',route);page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(BASE+'#page=leads',wait_until='networkidle')
  if page.locator('#entryDirectionBtn').is_visible():page.locator('#entryDirectionBtn').click()
  expect(page.locator('.case-direction')).to_be_visible()
  if page.locator('#dailyBriefingDialog').is_visible():page.locator('#closeDailyBriefing').click()
  expect(page.locator('.cd-card')).to_have_count(1);expect(page.locator('.cd-card')).to_contain_text('Sin responsable')
  page.screenshot(path=str(OUT/('desktop.png' if width>700 else 'mobile.png')),full_page=True)
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Horizontal overflow'
  page.locator('#directionSearch').fill('no existe');expect(page.locator('.cd-empty')).to_be_visible();page.locator('#directionSearch').fill('')
  page.locator('.cd-card [data-direction-action=ASSIGN]').click();expect(page.locator('#caseDirectionDialog')).to_be_visible()
  page.locator('[name=owner_id]').select_option('11111111-1111-4111-8111-111111111111')
  page.locator('[name=next_action]').fill('Recuperar documento original');page.locator('[name=due_at]').fill((datetime.now()+timedelta(days=3)).strftime('%Y-%m-%dT10:00'))
  page.locator('[name=reason]').fill('Necesitamos responsable y seguimiento verificable')
  page.evaluate('window.__directionTest.mode="network"')
  page.locator('#caseDirectionDialog [type=submit]').click();expect(page.locator('[data-cd-reconcile]')).to_be_visible()
  expect(page.locator('[name=reason]')).to_have_value('Necesitamos responsable y seguimiento verificable')
  page.evaluate('window.__directionTest.mode="success"');page.locator('[data-cd-reconcile]').click()
  expect(page.locator('#leadDetailDialog')).to_be_visible();expect(page.locator('.cd-supervision')).to_contain_text('Historial de decisiones · 1')
  commands=page.evaluate('window.__directionTest.calls');assert len(commands)==2 and commands[0]['p_command_id']==commands[1]['p_command_id'],'Retry changed receipt'
  assert page.evaluate('window.__testDB.tasks.length')==1,'Duplicate task'
  page.locator('#closeLeadDetail').click();page.locator('[data-direction-filter=closed]').click();expect(page.locator('.cd-empty')).to_be_visible();page.locator('[data-direction-filter=all]').click()
  page.locator('.cd-card [data-lead-detail]').click();page.locator('.cd-supervision [data-direction-action=PRIORITIZE]').click()
  page.locator('[name=reason]').fill('Prioridad pendiente tras revisión concurrente');page.evaluate('window.__directionTest.mode="conflict"')
  page.locator('#caseDirectionDialog [type=submit]').click();expect(page.locator('[data-cd-conflict]')).to_be_visible();expect(page.locator('[name=reason]')).to_have_value('Prioridad pendiente tras revisión concurrente')
  page.locator('[data-cd-conflict]').click();expect(page.locator('#caseDirectionDialog [type=submit]')).to_be_visible()
  page.evaluate('window.__directionTest.mode="success"');page.locator('#caseDirectionDialog [type=submit]').click();expect(page.locator('#leadDetailDialog')).to_be_visible()
  checks.append({'width':width,'checks':['intervention','incomplete assignment','search/empty','responsive','same-receipt network retry','history/task','closed/all','conflict draft retention']});context.close()
 browser.close()
server.shutdown();(OUT/'results.json').write_text(json.dumps({'mode':'isolated real app UI; synthetic SDK','checks':checks,'errors':errors},ensure_ascii=False,indent=2));assert not errors,errors
print(json.dumps({'passed':checks,'page_errors':errors},ensure_ascii=False))
