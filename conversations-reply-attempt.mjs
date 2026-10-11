// Keep only a digest and idempotency key, never customer message text.
const prefix='xicronix:conversation-reply:v1:';
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
export async function prepareReplyAttempt(storage,conversationId,body,cryptoImpl=crypto){
 const digest=Array.from(new Uint8Array(await cryptoImpl.subtle.digest('SHA-256',new TextEncoder().encode(body)))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const key=prefix+conversationId;
 let existing;try{existing=JSON.parse(storage.getItem(key)||'null');}catch{throw Error('No se pudo recuperar el intento anterior; comprueba el historial antes de reenviar.');}
 if(existing?.digest===digest&&uuid(existing.event_key))return existing;
 // Changing the text must not replace an unresolved attempt silently.
 if(existing)throw Error('Hay una respuesta pendiente de comprobar. Reintenta el mismo texto y revisa el historial.');
 const attempt={event_key:cryptoImpl.randomUUID(),digest};
 storage.setItem(key,JSON.stringify(attempt));
 if(storage.getItem(key)!==JSON.stringify(attempt))throw Error('No se pudo conservar la clave de reintento; respuesta no enviada.');
 return attempt;
}
export function confirmReplyAttempt(storage,conversationId,eventKey,result){
 const receipt=result?.result;
 if(result?.ok!==true||!uuid(receipt?.message_id||receipt?.id)||!['pending','accepted','delivered','read'].includes(receipt?.status))throw Error('Resultado de envío por comprobar; se conserva la clave de reintento.');
 const key=prefix+conversationId;const existing=JSON.parse(storage.getItem(key)||'null');
 if(existing?.event_key===eventKey)storage.removeItem(key);
}
