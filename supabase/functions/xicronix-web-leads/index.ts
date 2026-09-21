// DEV-only version of the existing website intake endpoint. No email side effects.
const DEV_URL = 'https://rmximatxuaczhpqbcuho.supabase.co';
const MAX_BODY = 16000;
function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export async function handle(req: Request) {
  if (Deno.env.get('SUPABASE_URL') !== DEV_URL) return json({ok:false},503);
  if (req.method !== 'POST') return json({ok:false},405);
  if (!req.headers.get('content-type')?.includes('application/json')) return json({ok:false},415);
  // The platform verifies the DEV JWT (verify_jwt=true). Never disable that gate.
  if (!req.headers.get('authorization')?.startsWith('Bearer ')) return json({ok:false},401);
  const declared = Number(req.headers.get('content-length'));
  if (declared > MAX_BODY) return json({ok:false},413);
  const reader = req.body?.getReader();
  if (!reader) return json({ok:false},400);
  const chunks: Uint8Array[] = []; let length=0;
  while (true) {
    const {done,value}=await reader.read(); if(done) break;
    length+=value.length; if(length>MAX_BODY){await reader.cancel();return json({ok:false},413);} chunks.push(value);
  }
  const bytes=new Uint8Array(length); let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let envelope: Record<string, unknown>;
  try {const parsed=JSON.parse(new TextDecoder().decode(bytes));if(!object(parsed))throw Error();envelope=parsed;} catch {return json({ok:false},400);}
  if(envelope.environment!=='dev'||envelope.source!=='xicronix-web'||!object(envelope.contact)||!object(envelope.request)||!object(envelope.privacyNotice))return json({ok:false},400);
  if(typeof envelope.contact.email!=='string'||!envelope.contact.email.toLowerCase().endsWith('@example.invalid'))return json({ok:false,message:'Usa un contacto sintético @example.invalid en DEV.'},400);
  try {
    const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if(!key)return json({ok:false},503);
    const response=await fetch(DEV_URL+'/rest/v1/rpc/web_intake_dev_v1',{
      method:'POST',headers:{'content-type':'application/json',apikey:key,authorization:`Bearer ${key}`},
      body:JSON.stringify({envelope}),redirect:'error',signal:AbortSignal.timeout(6500)
    });
    const receipt=await response.json();
    if(!response.ok){
      const status=receipt?.code==='22023'||receipt?.code==='22P02'||receipt?.code==='22007'?400:503;
      console.error('web_intake_dev_failed',{code:receipt?.code});
      return json({ok:false,message:'No se pudo completar la solicitud DEV.'},status);
    }
    if(receipt?.ok!==true||receipt?.synced!==true)return json({ok:false},503);
    return json(receipt,receipt.duplicate?200:201);
  } catch {return json({ok:false,message:'Reintenta con la misma referencia.'},503);}
}
Deno.serve(handle);
