"""Read-only production deployment verification. No credentials or messages are used."""
from pathlib import Path
import hashlib,json,time,urllib.request
from datetime import datetime,timezone
from playwright.sync_api import sync_playwright,expect
root=Path(__file__).resolve().parents[1]
base='https://xicronix-commercial-intelligence.vercel.app/'
out=root/'review-artifacts'/'production';out.mkdir(parents=True,exist_ok=True)
expected=(root/'index.html').read_bytes()
files=['index.html','app.js','styles.css','executive.css','analytics.css','production.css','domain.mjs','workspace.mjs','demo.mjs','executive.mjs','analytics.mjs','analytics-view.mjs','catalog.mjs','recuperar.html','recuperar.js','complaints.html']
results={'checked_at':datetime.now(timezone.utc).isoformat(),'base_url':base,'release':'2026-09-18-v2.2','assets':[],'logged_out_browser':False}
def fetch(path):
 req=urllib.request.Request(base+('' if path=='index.html' else path)+'?verify='+str(int(time.time())),headers={'User-Agent':'Xicronix-release-verification/2.1','Cache-Control':'no-cache'})
 with urllib.request.urlopen(req,timeout=25) as response:return response.read(),response.status
try:
 for attempt in range(30):
  try:
   body,status=fetch('index.html')
   if status==200 and hashlib.sha256(body).digest()==hashlib.sha256(expected).digest():break
  except Exception:pass
  if attempt==29:raise RuntimeError('Production did not serve this approved index within the verification window')
  time.sleep(10)
 for name in files:
  body,status=fetch(name);actual=hashlib.sha256(body).hexdigest();wanted=hashlib.sha256((root/name).read_bytes()).hexdigest()
  results['assets'].append({'path':name,'http_status':status,'sha256':actual,'matches_reviewed_commit':actual==wanted})
  assert actual==wanted,f'Deployment mismatch: {name}'
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  page=browser.new_page(viewport={'width':1440,'height':900},locale='es-PE')
  errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
  page.goto(base,wait_until='networkidle')
  expect(page.locator('#authTitle')).to_have_text('Ingresar')
  expect(page.locator('#forgotBtn')).to_be_visible()
  expect(page.locator('#rememberEmail')).to_be_visible()
  expect(page.locator('#appView')).to_be_hidden()
  assert page.evaluate("typeof window.supabase?.createClient==='function'"),'Official SDK failed to load'
  assert not errors,errors
  page.screenshot(path=str(out/'production-login.png'),full_page=True)
  results['logged_out_browser']=True;results['javascript_errors']=errors
  browser.close()
 results['passed']=True
finally:
 (out/'verification.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print('16 production assets match reviewed commit; genuine signed-out login loads. No authenticated client data accessed.')
