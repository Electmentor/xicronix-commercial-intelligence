"""Read-only deployed-asset checks. Does not log in, create cases or send messages."""
import hashlib,json,time,urllib.request
from pathlib import Path
root=Path(__file__).resolve().parents[1]
base='https://xicronix-commercial-intelligence.vercel.app/'
assets=['app.js','case-direction.mjs','case-direction.css','crm-environment.mjs','index.html']
deadline=time.monotonic()+240
while True:
 try:
  for asset in assets:
   with urllib.request.urlopen(base+asset+'?case-direction-verification='+str(time.time()),timeout=12) as response:body=response.read()
   assert hashlib.sha256(body).digest()==hashlib.sha256((root/asset).read_bytes()).digest(),f'Deployed asset differs: {asset}'
  break
 except Exception:
  if time.monotonic()>deadline:raise
  time.sleep(5)
print(json.dumps({'url':base+'#page=leads','mode':'read-only exact deployed assets','assets':assets,'passed':True}))
