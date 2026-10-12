# Mis casos · Dirección — lista única de aceptación

Estado: EN VERIFICACIÓN PARA APLICAR AL CRM. El usuario autorizó expresamente aplicarlo en el propio CRM; no se declara terminación de la matriz.
Base inspeccionada: cf15d952e520780b71396904e125c50ea93c5d57, main y producción coincidentes.
Rama de trabajo: work/mis-casos-direccion-20261012. La copia local procede de archivos GitHub del SHA exacto; no es una clonación del historial completo.

## Cambios implementados

Vista inicial Mi intervención, Todos y Cerrados; búsqueda; tarjetas con solicitud, motivo, estado, responsable, siguiente paso y fecha; ejecución personal separada. El expediente conserva contexto, respuestas protegidas, documentos, agenda e historial existentes y añade solicitudes concretas e historial estructurado de decisiones.

RPC transaccional con permisos ADMIN reales, organización validada, responsable válido, motivo, bloqueo por revisión y updated_at, recibos idempotentes ligados a actor/comando, historial y tareas canónicas existentes. Registro de solicitudes también admite MANAGER/SALES exclusivamente en casos propios. Ninguna decisión modifica la etapa de oportunidad, ejecuta compras, paga ni envía correo.

Estados propios de solicitud: pendiente, atendido, esperando cliente, resuelto, pausado, descartado y cerrado. Descartar no resuelve; convertir un lead no cierra una solicitud. Resolución/cierre comprueban tareas, reuniones, entregables y bloqueos. Reapertura conserva historia y exige resultado, evidencia, motivo y seguimiento.

Propuestas se recuperan del cotizador por ID, revisión y huella de la versión, con importe, margen y alcance del servidor. Revisión nueva invalida la vigencia de una aprobación anterior. Reglas económicas vacías por defecto: no se inventan facultades. Recursos/excepciones registran límites explícitos; no ejecutan otra operación.

## Matriz obligatoria

Cada fila solo será APROBADA cuando cumpla usuario autorizado, rechazo de usuario sin permiso, persistencia tras recarga y nueva sesión, historial y trabajo siguiente, reintento/doble clic sin duplicados, error y conflicto concurrente sin pérdida ni falso éxito, verificación remota y comprobación autorizada en producción.

| Decisión | Código | SQL remoto DEV | Navegador y sesión real DEV | Producción | Estado de aceptación |
|---|---|---|---|---|---|
| 1 Priorizar con motivo e historia | Implementado | Comprobaciones SQL parciales PASS¹ | Pendiente | No publicado | PENDIENTE |
| 2 Asignar o reasignar a responsable válido | Implementado | Comprobaciones SQL parciales PASS¹ | Pendiente | No publicado | PENDIENTE |
| 3 Aprobar/rechazar versión de propuesta | Implementado | Pendiente; cotizador ausente en DEV | Pendiente | No publicado | PENDIENTE |
| 4 Autorizar excepción y límites | Implementado | Comprobaciones SQL parciales PASS¹; reglas reales no confirmadas | Pendiente | No publicado | PENDIENTE |
| 5 Autorizar recursos sin compra/pago | Implementado | Comprobaciones SQL parciales PASS¹; reglas reales no confirmadas | Pendiente | No publicado | PENDIENTE |
| 6 Confirmar/modificar compromiso | Implementado | Comprobaciones SQL parciales PASS¹ | Pendiente | No publicado | PENDIENTE |
| 7 Decidir bloqueo y verificar resolución | Implementado | Comprobaciones SQL parciales PASS¹ | Pendiente | No publicado | PENDIENTE |
| 8 Tratar escalación y vincular reclamo existente | Implementado | Pendiente; reclamos ausente en DEV | Pendiente | No publicado | PENDIENTE |
| 9 Continuar/pausar/descartar con motivo | Implementado | Comprobaciones SQL parciales PASS¹ | Pendiente | No publicado | PENDIENTE |
| 10 Cerrar excepcionalmente o reabrir | Implementado | Comprobaciones SQL parciales PASS¹ | Pendiente | No publicado | PENDIENTE |

¹ tests/case-direction-dev.sql: ejecución remota real en DEV con usuarios, organización, casos y reglas sintéticos dentro de una transacción revertida. Decisiones 1,2,4,5,6,7,8,9,10: autorizado/VIEWER, reintento exacto, revisión obsoleta, historia atómica, tareas sin duplicados, cierre bloqueado con pendientes, reapertura y rechazo de escritura directa. No demuestra recarga del navegador, Auth real, persistencia entre sesiones ni contención entre conexiones. La matriz permanece PENDIENTE.

## Evidencia disponible

- Supabase DEV exacto: rmximatxuaczhpqbcuho, ACTIVE_HEALTHY observado. Producción: qzfprdhmcaucqcdqgqiz, no se ejecutaron escrituras.
- Migraciones aplicadas únicamente en DEV: crm_case_direction_v1 y crm_case_direction_followup_guard_v1. El segundo ajuste evita duplicar tareas: el trigger existente private.cx_activity_followup_v1 crea tareas al recibir next_action/next_action_date en actividades; la decisión registra trabajo en la tarea canónica y deja vacíos esos campos de actividad.
- Pruebas locales nuevas: tests/case-direction.test.mjs (9 comprobaciones de filtros, estados, incompletos, búsqueda, bloqueo, versión, HTML no confiable, mensajes e aislamiento DEV/PROD), aprobadas.
- SQL de reproducción: database/crm-case-direction-v1.sql. RLS activo en las cuatro tablas nuevas. Escritura directa de cliente revocada; wrapper invoker y escritor privado con comprobación de auth.uid()/profiles reales, sin user_metadata ni privilegios derivados de Vista dirección.
- Pruebas locales case-detail-runtime y case-whatsapp-integration aprobadas tras adaptar sus dependencias de extracción a las importaciones y al init asíncrono. Las protecciones de respuesta y la integración WhatsApp se conservan.
- La suite base antes del cambio tenía ocho archivos fallidos: app-workspace, assistant-resilience, assistant, demo-executive, director-desktop, domain, public-chat-operations y workspace. Log íntegro local: /tmp/baseline-tests.txt. No se eliminaron ni desactivaron.
- Chromium local: bloqueado antes de iniciar servidor por PermissionError [Errno 1] al crear un socket. El intento de ejecución con permiso adicional quedó pendiente hasta interrupción del usuario; no se acredita navegación ni se fabrican capturas.
- GitHub conectado permitió recuperar código. Clonación HTTP falló por conexión al proxy. Vercel permitió inspeccionar producción/proyecto; listar despliegues con teamId devolvió 403. No hay credenciales CLI configuradas en este entorno.
- No hay sesión de un usuario DEV ni cuentas SALES/VIEWER de prueba disponibles; DEV tiene un único profile ADMIN. SQL bajo claims de prueba no equivale a iniciar sesión por Auth.

## Pendientes y responsables

- Agente: ejecutar pruebas transaccionales SQL, completar errores y conflicto de todas las decisiones; obtener preview revisable; repetir regresiones y registrar evidencia.
- Entorno/administración de acceso: habilitar ejecución de Chromium y acceso al preview de este proyecto sin retirar protección; permitir sesiones DEV de prueba por un mecanismo seguro. No entregar claves por chat ni ampliar roles reales.
- Dirección: confirmar reglas empresariales de importe/moneda, margen mínimo, descuento y plazo de pago. La capacidad permanece bloqueada mientras falten; no se pide autorización de despliegue aún.
- Cotizador y reclamos ausentes en DEV: verificar la integración con fixtures compatibles sin instalar otro CRM ni copiar datos reales; distinguirlo de una prueba del módulo real.

## Despliegue, impacto y reversión

Aplicación al CRM autorizada por el usuario. Preview 517d4428 compilado READY: dpl_4Pp4CPdUnjFmqPwQ82Q5Df7waArh. Protección de Vercel conservada; la conexión devolvió 403 al intentar acceso autenticado. Se añadió un trabajo independiente de pruebas de Dirección en GitHub con Chromium y fixtures aisladas, sin quitar las pruebas heredadas, y verificación de los archivos reales publicados al actualizar main.
Impacto acotado: pestaña Mis casos en Dirección, servicio de decisiones y selección DEV del cliente en la rama exacta de prueba. El resto de módulos se reutiliza.
Respaldo productivo observado: dpl_HQhReg966bYFu3bayGAni31dXJd1, commit cf15d952, producción READY.
Reversión de código: volver al commit base o retirar solo los archivos y conexiones de Dirección. Reversión operativa DEV: retirar acceso a la RPC, conservar tablas e historia; no borrar casos. La instrucción posterior «aplica en el propio CRM» autoriza esta aplicación. Respaldo y reversión se conservan; no se activan reglas económicas sin definición empresarial. No se contrató ni amplió ningún servicio.
