# Chat → CRM → correo

El visitante abre el formulario dentro del chat, revisa el contexto (máximo 4000 caracteres), introduce nombre/correo y autoriza el registro y correo transaccional. No se guarda todo chat automáticamente ni se suscribe a marketing.

Reutiliza /api/contact y xicronix-web-leads (Supabase); crea web_leads, contacto, lead y actividad en A009. No permite consultar CRM desde la IA. Reutiliza Resend del servidor con el dominio existente. Correo de confirmación y enlaces públicos oficiales; no envía propuestas generadas ni datos internos.

RequestId firmado con HMAC en A007 deriva la referencia persistente: reintentos no duplican lead ni envíos. La respuesta distingue registro, sincronización CRM y aceptación de correo (no entrega). Los fallos conservan estado; no prometemos reintentos automáticos. Existe límite de 3 solicitudes por correo/día además del límite de IP de A007.

La regla de horarios y confirmación humana permanece. No agenda citas ni confirma plazos. Consentimiento/version/fecha/canal e ID del correo se conservan en submission_context protegido por RLS.

Pruebas locales: node tests/chat-lead-integration.test.mjs (A009). Verifica autorización, contexto CRM, contenido público, reintentos, conflictos y errores CRM/correo.
