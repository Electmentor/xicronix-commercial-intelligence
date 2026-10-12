# A009 · WhatsApp: receptor preparado en DEV, recepción real pendiente

**Actualización fase 2:** el fundador autorizó persistencia sintética DEV. Implementación y verificación local en `WHATSAPP-PERSISTENCE-DEV-20261007.md`; esa actualización sustituye los pendientes de código descritos a continuación. Supabase DEV sigue bloqueado por límite de proyectos gratuitos. No hay activación de cuenta real ni producción.

Orden del fundador: integración WhatsApp Xicronix, recibida 6 de octubre de 2026 (Lima).
No desplegar ni activar con clientes. No se ha conectado una cuenta WhatsApp.

## Base comprobada y trabajo protegido

- CRM: `Electmentor/xicronix-commercial-intelligence`, main `0846574edf85149ef9eb4f5b62d0df8a1002589f`.
- Web: `Electmentor/xicronix-web`, main `ed5a4ad21c970c6efd2f2e84b511a58f469dc14a` al consultar.
- Ramas y PR abiertos de ambos repositorios inspeccionados. CRM #64 (Next Best Action) y #63 (CI) siguen separados. Web #32 (CIDEPE) sigue separado.
- Este cambio solo añade archivos. No toca Nexa, panel comercial, formularios, esquema, credenciales, permisos ni main. No se inspeccionaron cambios locales de otras sesiones, que no son accesibles por GitHub.
- El CRM actual es JavaScript ESM + frontend estático + funciones Vercel/Supabase; no se introduce Next.js.

## Implementado

`api/whatsapp-webhook.mjs`: receptor desactivado por defecto. Incluso con el flag activado, responde 503 mientras no se implemente e inyecte el adaptador de persistencia. El GET de suscripción también queda bloqueado.

`whatsapp-intake.mjs`: HMAC-SHA256 sobre bytes originales; comparación segura; validación de cuenta y número por identificadores; límite de cuerpo; normalización de mensajes y estados; claves deterministas de evento; detección de contenido contradictorio; separación de recepción, procesamiento y entrega. Mensajes no textuales conservan su sobre para revisión humana, sin descargar medios.

No hay transporte saliente ni conexión a analítica. No se atribuyen campañas, personas o recorridos a partir del teléfono, la IP o el clic. No se registra consentimiento de marketing a partir de recibir una consulta.

El adaptador pendiente deberá guardar TODO el lote en una transacción, comprobar conflictos y devolver un recibo durable con todas las claves de evento. Un 200 genérico no cumple el contrato. Un timeout, fallo o recibo parcial devuelve 503 para permitir reintento sin afirmar recepción.

Los tests usan un doble en memoria. Prueban el contrato y las defensas del receptor; NO prueban persistencia, aislamiento de base de datos ni llegada de mensajes reales.

## Human Gate: persistencia propuesta, NO aplicada

La orden exige presentar cualquier nueva persistencia antes de introducirla. Esta propuesta requiere aprobación separada para implementación y prueba en un entorno DEV aislado con datos sintéticos.

Reutilizar `organizations`, `profiles`, `contacts`, `leads`, `activities` y `tasks`. No crear otro CRM ni duplicar catálogo. Antes de SQL, verificar esquema real y posibles estructuras equivalentes fuera del repositorio.

Propuesta mínima, a consolidar con tablas existentes si ya ofrecen estas garantías:

| Registro | Datos y garantía |
| --- | --- |
| Recibo de canal | organización, WABA, phone_number_id, event_key único, content_hash, mensaje/estado normalizado, received_at, estado de procesamiento, intentos, próximo intento y código de error sin PII en logs. Índice único por organización/event_key. |
| Identidad de canal | organización, WABA, phone_number_id, wa_id y contact_id existente; identidad externa única. Un teléfono no autoriza fusionar personas ni instituciones. Coincidencias ambiguas requieren revisión. |

El sobre no textual puede contener metadatos personales. Acceso restringido al equipo autorizado; sin analítica ni logs de payload. Proponer retención de sobres técnicos de 30 días, sin activación ni eliminación automática hasta aprobación; historial comercial según política institucional confirmada.

No generar contacto en el webhook. Un procesador transaccional posterior debe resolver identidad y reutilizar contacto, crear actividad una sola vez por evento y asociar el caso comercial abierto cuando haya evidencia. Si hay ambigüedad, mantener la consulta visible en revisión sin inventar institución, nombre o fusión. Bloqueo transaccional/índice único debe impedir contactos duplicados en carreras concurrentes.

Cada caso mostrará cliente o «Contacto por identificar», mensaje, responsable o «Pendiente de asignación», siguiente paso «Revisar consulta y preparar respuesta humana», y estados separados. Reutilizar asignación, tareas y alertas existentes. No afirmar «procesado» hasta completar y leer los registros comerciales vinculados. Los fallos de procesamiento deben poder reintentarse desde el recibo durable, sin nueva automatización paralela.

RLS por organización y permisos comerciales vigentes, sin lectura pública ni credenciales privilegiadas en frontend. Estados huérfanos se conservan hasta correlacionarlos con el identificador del mensaje, sin inventar un envío. Entregas fuera de orden no rebajan leído/entregado; contradicciones con fallos se revisan.

## Contrato para A007

- A007 conserva campañas/página de llegada y CTA por separado. No reemplazar `utm_content` por CTA.
- Parche 01 del ZIP pertenece a A007; parche 02 requiere revisión independiente. Ninguno aplicado por este cambio.
- Clic/abrir WhatsApp/cancelar no crea contacto, mensaje recibido ni oportunidad en A009.
- No introducir código de consulta persistente en esta fase. Si se aprueba posteriormente, se correlaciona solo cuando el mensaje realmente lo contiene o existe confirmación verificable, con consentimiento y caducidad definidos. Sin atribución retroactiva a APM.
- Fuentes localizadas: `Xicronix_Atribucion_Web_DEV_20261007.zip` (libfile_be6caf3101ec8191b2e2d3889dfc1be9); borrador de atención leído completo (libfile_f9ea0e185c1081919fa5e37d627c1e53). No se declara revisión de los bytes del ZIP desde A009.
- Las seis fichas, etiquetas y respuestas rápidas del borrador siguen sin publicar; horario e imágenes pendientes según el propio documento. A008 conserva la responsabilidad de contenido y activos maestros.

## Cuenta, proveedor y condiciones pendientes

Número indicado por la orden: +51 922 187 634. Titularidad, cuenta empresarial, dispositivos, responsables y horario NO verificados desde una sesión de WhatsApp. No confundirlo con phone_number_id.

Opción técnica propuesta: formato de webhook Meta WhatsApp Cloud API. No se ha seleccionado/contratado proveedor, creado app, generado credencial, añadido permisos, aceptado condiciones ni solicitado suscripción.

La página oficial de precios consultada el 7/10/2026 indica cobro por mensaje entregado, según mercado y categoría; también publica exenciones para servicio/utilidad en determinadas condiciones. El tarifario Perú y las condiciones concretas de la cuenta/proveedor deben verificarse antes de aprobar presupuesto. No se promete costo cero ni una tarifa específica. Fuente: https://business.whatsapp.com/products/platform-pricing

Las páginas oficiales de configuración actual/coexistencia devolvieron HTTP 429 en la consulta. Coexistencia, elegibilidad, sincronización de historial y permisos exactos quedan sin confirmar. No migrar ni desconectar la app. Documentación de firma consultada en el SDK oficial archivado de Meta: https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/webhooks/start/ . Revalidar contrato actual y realizar prueba firmada desde Meta antes de habilitar.

Referencia RLS: https://supabase.com/docs/guides/database/postgres/row-level-security . Índice de changelog no legible por la herramienta (content-type text/markdown); no se implementó función, cliente ni esquema Supabase nuevo.

## Verificación y cierre permitido

- Ejecutar `node --test tests/whatsapp-intake.test.mjs`: firma inválida/cuerpo alterado, duplicados, concurrencia del doble, caída del receptor, confirmación perdida tras commit simulado, recibo parcial, cuenta incorrecta, estados fuera de orden, medio no textual y límites.
- Ejecutar suite existente, comprobación sintáctica y comando build actual. No hay compilación TypeScript en este repositorio.
- No hay pantalla nueva: no se declara verificación visual, almacenamiento real ni integración end-to-end. Navegación/campañas/consentimiento/revocación de la web corresponde a A007 y queda pendiente de su evidencia.
- Después del Human Gate de esquema: implementar adaptador transaccional, leer comprobantes reales en DEV, verificar permisos/carreras/reintentos y pantalla CRM. Después de aprobación específica de cuenta/proveedor: prueba controlada con número de prueba, nunca con clientes sin autorización.
- Antes de producción: presentar commit final y diff, cuenta/número, proveedor, permisos exactos, tratamiento/retención, costos/condiciones, responsable y horario, prueba real y reversión. Solicitar autorización específica.
- Reversión de esta preparación: cerrar PR/eliminar rama sin tocar datos; no hay migración aplicada. Para futura activación, diseñar reversión que preserve recibos y atención desde la app, evitando perder eventos durante indisponibilidad.

Estado final de esta fase: receptor de código preparado; persistencia propuesta; recepción integrada NO habilitada.

## Resultados locales verificados

Node v24.19.0, 7/10/2026. Pruebas específicas: 15/15 pasan. Suite completa candidata: 155 tests, 116 pasan, 39 fallan. Suite de la base exacta en worktree independiente: 140 tests, 101 pasan, 39 fallan. Comparación de nombres de fallos: cero nuevos y cero resueltos. Estos fallos preexistentes impiden declarar la suite CRM completa en verde; no se corrigieron en este cambio.

`node --check` de los dos módulos nuevos y `git diff --check`: correctos. El comando build del repositorio (`node scripts/verify-assistant-provider.mjs`) terminó con `ASSISTANT_PROVIDER_CHECK_SKIPPED`, por ausencia de GROQ_API_KEY fuera de producción. No constituye validación de inferencia ni build de producción. No hay typecheck TypeScript aplicable a los nuevos módulos ESM. Sin prueba visual ni deploy remoto de esta fase.
