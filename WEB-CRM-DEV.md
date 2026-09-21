# Web → CRM DEV — integración comercial

Estado: implementación DEV; validación del navegador en curso. No fusionar en main.

## Inspección y decisión

Base Web: d68d90026ce6287aa39d34d3be43ec78dad32c13. Base CRM dev: a93913b3363922f3d3a4d4eb20925be6660ccaa4.
Se inspeccionaron el formulario, /api/contact, el receptor xicronix-web-leads y el esquema real de CRM DEV después de su restauración.
El receptor original usa web_leads, organization.slug=xicronix y campos/triggers ausentes en DEV; no crea oportunidades y puede devolver éxito con sincronización fallida. La Web enviaba landingPage/referrer, mientras el receptor esperaba landingPath/referrerHost.

REUTILIZAR: formulario, ruta /api/contact, nombre del receptor, tablas institutions/contacts/leads/opportunities/tasks/activities y clave única de automatización de tasks.
EXTENDER: activities.web_submission conserva el sobre recibido; índice único por organización y referencia. El formulario conserva la referencia ante reintentos y registra submissionPath sin depender de consentimiento de analítica. La atribución opcional conserva su consentimiento existente.
COMPONER: public.web_intake_dev_v1 ejecuta todos los cambios en una transacción. Reutiliza un caso web abierto para contacto, institución e interés equivalentes. Cada nueva solicitud conserva su propia actividad. Una referencia repetida no crea registros; el mismo identificador con contenido diferente se rechaza.
CREAR: únicamente la operación transaccional que faltaba en DEV; no se crean tablas nuevas, usuarios ni roles.

## Aislamiento y dependencias

- Supabase DEV: rmximatxuaczhpqbcuho. Organización: xicronix-commercial-intelligence-dev.
- Core DEV quedó temporalmente pausado con autorización explícita del fundador para reactivar CRM DEV. PRODUCCIÓN qzfprdhmcaucqcdqgqiz no se modifica.
- Rama Web: dev/web-crm-20260921; solo Vercel Preview. El nombre del proyecto xicronix-web-v2-preview NO implica aislamiento: también aloja www.xicronix.com. Nunca promover ni tocar main.
- DEV_CONTACT_LEAD_ENDPOINT solo permite la URL exacta del receptor DEV. VERCEL_ENV=production bloquea la ruta. No hay fallback al backend de producción ni seguimiento de redirecciones.
- DEV_CONTACT_LEAD_TOKEN: clave anon JWT ya existente del proyecto DEV, guardada solo para esta rama Preview. No es service_role. La función exige JWT de plataforma; internamente utiliza las credenciales de servidor ya provistas por Supabase.
- La RPC usa SECURITY INVOKER, solo ejecutable por service_role. Se conservan RLS y roles. No se conceden permisos nuevos a anon ni authenticated.
- Solo contactos ficticios @example.invalid. No se envían correos ni mensajes. La oportunidad nace DETECTED, sin valor ni probabilidad comercial inventados; el prospecto sigue NEW, pendiente de evaluación humana.
- Se requiere un ADMIN ya existente de la organización DEV para asignar la tarea. SLA inicial: 24 horas desde recepción por la base de datos.

## Contrato

Entrada: leadId UUID, environment=dev, source=xicronix-web, submittedAt, contact, request.interest/product/message, attribution, privacyNotice.
Se preservan mensaje, interés, origen, fecha del servidor web, fecha de recepción en CRM, página del formulario, atribución opcional y aviso de privacidad. No se infiere una campaña cuando no existe.
Salida interna: ok, synced, duplicate, reference, leadId, opportunityId, taskId. La ruta devuelve éxito solo si el recibo confirma los tres registros vinculados; al visitante expone únicamente su referencia.

## Validación

- node --test tests/contact-dev.test.cjs: 8/8 PASS, con transporte sustituido; no equivale a E2E.
- CRM tests/web-crm-dev.sql ejecutado en el proyecto DEV real: PASS, con rollback de fixtures. Cubre reintento, conflicto, reutilización, trazabilidad, reapertura de tarea, oportunidad cerrada, rechazo de entorno incorrecto, contacto no sintético, RLS y privilegios.
- Build/typecheck y formulario Preview: consultar el informe de cierre y comprobaciones del PR.

## Riesgos y límites

- La deduplicación de identidad usa correo normalizado + institución normalizada y la del caso usa interés. No resuelve nombres alternativos ni duplicados históricos.
- La transacción serializa la recepción por organización; es apropiada para este mínimo DEV, no una decisión de escalado de producción. Límite de 100 nuevas solicitudes por 10 minutos en CRM y 5 por IP/10 minutos en la instancia Web.
- La clave anon no autentica a una persona. El receptor permite solo datos sintéticos y no permite lectura general. Para abrir datos reales fuera de DEV se requiere una revisión de autenticación/abuso separada.
- Una recarga del navegador pierde la referencia pendiente; la reutilización del caso evita nuevas oportunidades/tareas, pero puede registrar otra actividad. Los reintentos sin recarga mantienen el identificador.
- El asesor de seguridad reporta protección de contraseñas filtradas deshabilitada; no se modificó Auth. [Referencia](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Rollback

1. Deshabilitar solo el flujo DEV revocando EXECUTE de web_intake_dev_v1 a service_role (script de rollback del CRM) o retirando DEV_CONTACT_LEAD_TOKEN únicamente de esta rama Preview y redesplegando esa rama.
2. Conservar activities.web_submission y los registros sintéticos para auditoría; no borrar datos ni revertir main. No desplegar la versión antigua del receptor en DEV: asume infraestructura de producción.
3. Para reactivar el flujo, restaurar EXECUTE a service_role y/o la variable de esta rama tras verificar destino.
4. La disponibilidad de Core DEV/CRM DEV es independiente del código. Coordinar su inversión al cerrar las pruebas; no pausar PRODUCCIÓN.

Documentación técnica consultada: [funciones PostgreSQL y privilegios](https://supabase.com/docs/guides/database/functions), [Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route).
