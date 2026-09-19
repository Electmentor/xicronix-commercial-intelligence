# Xicronix Commercial Intelligence — V2.5

## Atención y alertas

Esta versión introduce un centro de atención persistente para solicitudes web que todavía no tienen una primera respuesta humana registrada.

### Reglas
- El contador muestra prospectos web abiertos sin primera respuesta humana.
- La vista muestra institución/contacto, área de enrutamiento, tiempo esperando y SLA interno.
- El SLA de entrada web queda centralizado y configurable en private.cx_intake_routes.sla_minutes.
- Valor inicial: 1440 minutos (24 horas internas). No constituye un plazo comunicado al cliente.
- Una interacción WEB_FORM nunca genera una segunda tarea de seguimiento.
- La tarea canónica de entrada web es cx:web:<web_lead_id>.
- Las tareas antiguas cx:activity:* duplicadas para la misma entrada web se cancelan, conservando el historial.

### Primera respuesta humana
Se registra automáticamente cuando el expediente recibe un movimiento humano documentado por correo, llamada, WhatsApp, reunión o visita, o la acción explícita RESPONSE_SENT.

### Nuevas entradas web
La Edge Function V8:
- reutiliza institución por nombre cuando existe;
- reutiliza contacto por correo cuando existe;
- crea institución/contacto cuando faltan;
- vincula ambos al prospecto y al movimiento inicial;
- registra el movimiento inicial como WEB_FORM sin fabricar una llamada ni una propuesta;
- usa el SLA canónico para la próxima atención;
- conserva el aviso interno;
- adapta el acuse automático al tipo de solicitud, sin afirmar que hubo respuesta humana.

No se envía ningún mensaje de prueba a clientes durante la validación de esta versión.
