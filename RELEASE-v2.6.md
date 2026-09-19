# Xicronix Commercial Intelligence — V2.6

## Agenda y reuniones

Esta versión agrega un módulo CRM de Agenda para reuniones comerciales.

### Incluye
- reuniones vinculadas a prospecto, institución y contacto;
- fecha/hora de inicio y fin;
- modalidad virtual, presencial o llamada;
- estado de reunión;
- estado de confirmación del cliente;
- responsable;
- lugar o enlace;
- detección de cruces con otras reuniones registradas para el mismo responsable;
- acceso para agendar desde la ficha maestra del prospecto;
- historial de reuniones visible dentro del expediente.

### Google Calendar
El modelo de datos incluye campos para calendar_id, event_id, URL del evento y Meet. La cuenta principal de Google Calendar del usuario está disponible a través del conector autorizado, pero esta versión del frontend no contiene credenciales OAuth ni crea eventos de Google por sí sola.

Cuando una reunión real deba enviarse a Google Calendar, se debe crear mediante la conexión autorizada y luego registrar sus identificadores en el expediente. Las pruebas de V2.6 no crean invitaciones reales.

### Conflictos
El CRM permite guardar una reunión aun cuando exista un cruce, pero lo muestra antes de guardar. La detección interna considera reuniones no canceladas del mismo responsable. También existe la función SQL private.crm_meeting_conflict_count para validación de servidor.
