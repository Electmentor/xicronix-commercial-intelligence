// Approved operational lesson CHAT-20261004-01. No private customer data.
export const POLICY_VERSION = 'public-chat-hours-20261004-v2';
export const HOURS_LABEL = 'lunes a sábado, de 8:00 a. m. a 6:00 p. m. (hora de Lima)';
export function limaDate(now = new Date()) {
 return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
function sunday(date) { return /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(date+'T12:00:00-05:00').getUTCDay()===0; }
export function calendarContext(now = new Date()) {
 const today=limaDate(now);
 const label=new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',dateStyle:'full',timeStyle:'short'}).format(now);
 return '\nREGLAS OPERATIVAS OBLIGATORIAS (fecha del servidor): '+label+'; zona America/Lima; fecha ISO '+today+'. Los domingos NO hay atención humana. El asistente digital sí puede orientar. Horario provisional indicado por el fundador: lunes a sábado de 08:00 a 18:00, America/Lima. Las 18:00 son el cierre. Feriados y excepciones requieren confirmación. El horario general no garantiza una cita ni disponibilidad. No inventes cierres electorales o feriados. Interpreta hoy/mañana con esta fecha. No confirmes citas, llamadas, disponibilidad ni plazos de respuesta. No tienes herramienta para enviar, registrar o agendar: tampoco prometas que VAS a derivar o que TE contactarán. El botón solo abre el canal para que el visitante envíe su solicitud; aún no ha sido enviada. Añade al JSON appointment_request (boolean) y requested_date (YYYY-MM-DD o null) y requested_time (HH:mm de 24 horas o null), solo como interpretación de la solicitud, nunca como reserva.';
}
export function enforceOperations(answer,messages,now=new Date()) {
 const last=messages.at(-1)?.content||'';
 const prior=messages.slice(-5,-1).map(m=>m.content).join(' ');
 const call=/llamad|llamar|llamen|tel[eé]fon|agendar|cita\b|reuni[oó]n|horario de atenci[oó]n/i;
 const time=/hoy|mañana|domingo|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|\d{1,2}\s*(?:am|pm|h\b|:\d{2})/i;
 const schedule=answer.appointment_request===true||call.test(last)||(call.test(prior)&&time.test(last));
 if(/horarios?|a qu[eé] hora.*(?:atienden|abren|cierran)|cu[aá]ndo atienden/i.test(last) && !/agendar|llamad|llamar|cita\b|reuni[oó]n/i.test(last)) {
  return {...answer,message:'Nuestro horario de referencia es '+HOURS_LABEL+'. Los domingos no hay atención humana; los feriados y las citas requieren confirmación. Puedo orientarte por aquí también fuera de ese horario.',options:[],handoff:false};
 }
 if(schedule) {
  const today=limaDate(now);
  let target=typeof answer.requested_date==='string'?answer.requested_date:null;
  if(/\bhoy\b/i.test(last)) target=today;
  else if(/\bmañana\b/i.test(last)) {const d=new Date(today+'T12:00:00-05:00');d.setUTCDate(d.getUTCDate()+1);target=limaDate(d);}
  const closed=/domingo/i.test(last)||(target&&sunday(target));
  if(closed) return {...answer,message:'Los domingos no atendemos llamadas. Nuestro horario de referencia es lunes a sábado, de 8:00 a. m. a 6:00 p. m., hora de Lima. Puedes solicitar otro día con el botón de contacto; la llamada quedará pendiente de confirmación y aún no se ha enviado ninguna solicitud.',options:[],handoff:true};
  const explicit=last.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)\b/i);
  let requested=typeof answer.requested_time==='string'?answer.requested_time:null;
  if(explicit){let h=Number(explicit[1]);if(h>=1&&h<=12){h=h%12+(/^p/i.test(explicit[3])?12:0);requested=String(h).padStart(2,'0')+':'+(explicit[2]||'00');}}
  if(requested&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(requested)){
   const [h,m]=requested.split(':').map(Number);
   if(h*60+m<480||h*60+m>=1080) return {...answer,message:'Esa hora está fuera de nuestro horario de referencia: '+HOURS_LABEL+'. Puedes proponer una hora dentro de ese rango con el botón de contacto; el equipo deberá confirmarla. Todavía no hay una llamada agendada.',options:[],handoff:true};
  }
  return {...answer,message:'Nuestro horario de referencia es lunes a sábado, de 8:00 a. m. a 6:00 p. m., hora de Lima. Podemos tomar esa fecha y hora como una preferencia, pero no puedo confirmar disponibilidad ni agendar la llamada desde aquí. Puedes enviar tu solicitud con el botón de contacto para que el equipo confirme un horario. Aún no se ha enviado ninguna solicitud.',options:[],handoff:true};
 }
 // Fail closed on claims of actions that this read-only assistant cannot perform.
 if(/(?:vamos a|voy a|te|le)\s+(?:derivar|contactar|llamar)|(?:derivaremos|contactaremos|llamaremos|te contactar[aá]n|te llamar[aá]n)|(?:he|hemos|ya|qued[oó]|est[aá])\s+(?:enviado|registrado|agendad[oa]|confirmad[oa]|derivad[oa])/i.test(answer.message)) {
  return {...answer,message:'Para continuar con el equipo, puedes enviar tu solicitud mediante el botón de contacto. Este chat todavía no ha enviado ni registrado una solicitud, y la atención está sujeta a confirmación.',options:[],handoff:true};
 }
 return answer;
}
