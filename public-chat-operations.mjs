// Approved operational lesson CHAT-20261004-01. No private customer data.
export const POLICY_VERSION = 'public-chat-hours-20261004';
export function limaDate(now = new Date()) {
 return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
function sunday(date) { return /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(date+'T12:00:00-05:00').getUTCDay()===0; }
export function calendarContext(now = new Date()) {
 const today=limaDate(now);
 const label=new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',dateStyle:'full',timeStyle:'short'}).format(now);
 return '\nREGLAS OPERATIVAS OBLIGATORIAS (fecha del servidor): '+label+'; zona America/Lima; fecha ISO '+today+'. Los domingos NO hay atención humana. El asistente digital sí puede orientar. No hay horarios de lunes a sábado, feriados ni excepciones verificados: nunca supongas que están abiertos ni garantices disponibilidad. No inventes cierres electorales o feriados. Interpreta hoy/mañana con esta fecha. No confirmes citas, llamadas, disponibilidad ni plazos de respuesta. No tienes herramienta para enviar, registrar o agendar: tampoco prometas que VAS a derivar o que TE contactarán. El botón solo abre el canal para que el visitante envíe su solicitud; aún no ha sido enviada. Añade al JSON appointment_request (boolean) y requested_date (YYYY-MM-DD o null), solo como interpretación de la solicitud, nunca como reserva.';
}
export function enforceOperations(answer,messages,now=new Date()) {
 const last=messages.at(-1)?.content||'';
 const prior=messages.slice(-5,-1).map(m=>m.content).join(' ');
 const call=/llamad|llamar|llamen|tel[eé]fon|agendar|cita\b|reuni[oó]n|horario de atenci[oó]n/i;
 const time=/hoy|mañana|domingo|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|\d{1,2}\s*(?:am|pm|h\b|:\d{2})/i;
 const schedule=answer.appointment_request===true||call.test(last)||(call.test(prior)&&time.test(last));
 if(schedule) {
  const today=limaDate(now);
  let target=typeof answer.requested_date==='string'?answer.requested_date:null;
  if(/\bhoy\b/i.test(last)) target=today;
  else if(/\bmañana\b/i.test(last)) {const d=new Date(today+'T12:00:00-05:00');d.setUTCDate(d.getUTCDate()+1);target=limaDate(d);}
  const closed=/domingo/i.test(last)||(target&&sunday(target));
  if(closed) return {...answer,message:'Los domingos no atendemos llamadas. La llamada no está agendada ni se ha enviado una solicitud desde este chat. Puedes proponer otro día mediante el botón de contacto; el equipo deberá confirmar la fecha y la hora.',options:[],handoff:true};
  return {...answer,message:'Podemos tomar esa fecha y hora como una preferencia, pero no puedo confirmar disponibilidad ni agendar la llamada desde aquí. Puedes enviar tu solicitud con el botón de contacto para que el equipo confirme un horario. Aún no se ha enviado ninguna solicitud.',options:[],handoff:true};
 }
 // Fail closed on claims of actions that this read-only assistant cannot perform.
 if(/(?:vamos a|voy a|te|le)\s+(?:derivar|contactar|llamar)|(?:derivaremos|contactaremos|llamaremos|te contactar[aá]n|te llamar[aá]n)|(?:he|hemos|ya|qued[oó]|est[aá])\s+(?:enviado|registrado|agendad[oa]|confirmad[oa]|derivad[oa])/i.test(answer.message)) {
  return {...answer,message:'Para continuar con el equipo, puedes enviar tu solicitud mediante el botón de contacto. Este chat todavía no ha enviado ni registrado una solicitud, y la atención está sujeta a confirmación.',options:[],handoff:true};
 }
 return answer;
}
