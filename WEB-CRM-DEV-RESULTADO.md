# Xicronix — cierre del primer flujo comercial DEV
Fecha: 21 de septiembre de 2026. Estado: implementado y validado con datos sintéticos.

## Resultado verificable
[Formulario DEV](https://xicronix-web-v2-preview-git-dev-web-crm-20260921-xicronix.vercel.app/contacto)
→ /api/contact → xicronix-web-leads (CRM DEV) → web_intake_dev_v1
→ prospecto NEW + oportunidad DETECTED + tarea PENDING + actividad WEB_FORM.

Prueba de navegador realizada a las 21:14 UTC (16:14 Lima): dos envíos válidos del mismo contacto e interés dejaron exactamente 1 prospecto, 1 oportunidad, 1 tarea y 2 actividades. El caso rechazado no dejó registros; el formulario conservó el texto y permitió corregirlo.

| Evidencia | Identificador |
|---|---|
| Primera referencia visible | 4f7f5cc0-6d47-41d9-9085-426ec0f28753 |
| Segunda referencia visible | ea6ec1c6-df70-4d96-bdeb-6ec9a7c47e67 |
| Prospecto CRM DEV | f2898d5c-faaa-4d0a-832c-f7388195d10a |
| Oportunidad CRM DEV | 133b2adf-5681-4ba4-811f-d504bca4f54e |
| Tarea CRM DEV | e057ea63-47d6-409d-9c34-9cb13aadaaf4 |
| Migración aplicada | 20260921210746_web_crm_dev_v1 |
| Edge Function | xicronix-web-leads, versión 1, verify_jwt=true |
| Commit Web validado | 1727aa422ff9553be256f15a850121107dcf059c |
| Commit CRM implementado | 7228b9d09218c4f8b890dfb93cded2a64b31a568 |

Contacto ficticio: web-crm-e2e-20260921@example.invalid.
Institución ficticia: [DEV TEST] Flujo Web CRM 20260921.
Tarea asignada al ADMIN preexistente de DEV, vencimiento inicial 2026-09-22 21:14:08 UTC.
Los registros E2E se conservaron identificados como prueba. Los fixtures SQL se revirtieron.

## Inspección antes de modificar
HECHO: CRM DEV estaba INACTIVE y Core DEV ACTIVE_HEALTHY. El fundador autorizó explícitamente pausar Core DEV y restaurar CRM DEV.
HECHO: la restauración pasó por COMING_UP y RESTORING. Las lecturas transitorias vacías no se usaron para recrear tablas. Tras ACTIVE_HEALTHY se inspeccionó el esquema restaurado.
HECHO: DEV tiene institutions, contacts, leads, opportunities, tasks y activities; no tenía web_leads ni triggers de recepción.
HECHO: el código Web apuntaba por defecto a PRODUCCIÓN; el receptor original no creaba una oportunidad, dependía de campos/tabla/triggers ausentes en DEV y podía indicar éxito tras fallo de sincronización. Existía diferencia entre landingPage/referrer y landingPath/referrerHost.
HECHO: Vercel xicronix-web-v2-preview también aloja www.xicronix.com; su nombre no identifica un entorno seguro.

## Reutilización y cambios
Se reutilizaron formulario, ruta y nombre de función receptora, tablas comerciales y restricción de tareas. No se creó ninguna tabla.
Se añadió activities.web_submission y un índice único por organización/referencia.
La nueva RPC compone el flujo en una transacción, usando SECURITY INVOKER y el rol servidor ya existente; anon y authenticated no tienen EXECUTE.
El formulario mantiene una referencia estable para reintentar sin recargar. Cada nuevo envío conserva mensaje y evidencia sin duplicar oportunidad/tarea abiertas del mismo caso.
Se conserva fuente, página, fecha, interés, producto y aviso de privacidad. La atribución opcional conserva la regla de consentimiento existente; sin consentimiento no se inventan campañas.
La oportunidad nace DETECTED, con valor/probabilidad/score cero, sin afirmar calificación comercial.
Los destinatarios reales y los correos están fuera del flujo DEV: solo @example.invalid; no hay envío de mensajes.

## Validación y límites de evidencia
- 8 pruebas locales de API: PASS. Usan transporte sustituido y se distinguen del E2E real.
- SQL en CRM DEV real: PASS para recibo completo, reintento, conflicto de identificador, reutilización, reapertura de tarea, oportunidad cerrada, atribución, entorno, datos sintéticos, RLS y permisos; rollback de fixtures.
- Navegador Preview → función desplegada → base CRM DEV: PASS, con confirmación visible y consulta de registros vinculados.
- Rechazo de correo no sintético, conservación del formulario y corrección: PASS; cero contactos para el dato rechazado.
- [Validación de integración, typecheck y build](https://github.com/Electmentor/xicronix-web/actions/runs/35655821829): SUCCESS.
- [CI general](https://github.com/Electmentor/xicronix-web/actions/runs/35655824989): SUCCESS.
- [Regresión de navegador y seis soluciones](https://github.com/Electmentor/xicronix-web/actions/runs/35655824993): SUCCESS.
- [Preview validado](https://vercel.com/xicronix/xicronix-web-v2-preview/EoyVAdKrKs7jMZ97uXHxnrsQUZY6): READY.
- No se inició sesión en la interfaz CRM ni se alteraron cuentas: la existencia y relaciones de los registros se comprobaron directamente en su base DEV.

## Dependencias y riesgos
CRM DEV rmximatxuaczhpqbcuho debe permanecer activo. Se usa su organización DEV y un ADMIN existente.
DEV_CONTACT_LEAD_TOKEN contiene la clave anon JWT ya existente, solo en Preview de dev/web-crm-20260921. No se extrajeron ni copiaron claves service_role a Vercel.
La Web y la Edge Function bloquean destinos de producción. La Edge Function conserva JWT obligatorio. La RPC conserva RLS y no eleva privilegios del cliente.
La deduplicación no resuelve alias de institución ni duplicados históricos. Una recarga pierde la referencia pendiente y podría generar otra actividad, aunque se reutiliza el caso abierto.
El bloqueo transaccional por organización y el límite de 100 solicitudes/10 minutos son decisiones para este mínimo DEV; requieren evaluación antes de escalar.
El asesor reporta [protección de contraseñas filtradas deshabilitada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No se cambió Auth. El asesor de rendimiento reportó índices existentes sin uso, sin errores nuevos de este flujo.

## Rollback
El script crm-dev/database/web-crm-dev-rollback.sql revoca exclusivamente la ejecución de la RPC a service_role, conservando registros y trazabilidad.
Alternativa: retirar DEV_CONTACT_LEAD_TOKEN únicamente de la rama Preview y redesplegar esa rama.
No ejecutar rollback en PRODUCCIÓN, no fusionar main, no sustituir la Edge Function DEV por el receptor original que supone infraestructura de producción.
La recuperación consiste en restaurar el permiso del servidor/variable tras comprobar el destino DEV. No borrar la columna de trazabilidad ni los registros de pruebas como parte de un rollback operacional.

## Entornos al cierre
- CRM DEV: ACTIVE_HEALTHY.
- Core DEV: INACTIVE, pausa temporal autorizada para permitir esta prueba.
- CRM PRODUCCIÓN: ACTIVE_HEALTHY; ninguna mutación realizada por esta tarea.
- Web main y dominios de PRODUCCIÓN: no modificados ni promovidos.
- [PR Web #14](https://github.com/Electmentor/xicronix-web/pull/14): draft, NO MERGE a producción.
- [PR CRM #13](https://github.com/Electmentor/xicronix-commercial-intelligence/pull/13): draft, destino dev.

## Aprendizaje sustentado
La inspección mostró que compartir repositorio o nombre de endpoint no demuestra que DEV tenga el mismo esquema que PRODUCCIÓN. La implementación quedó basada en el esquema DEV confirmado, no en afirmaciones de conversaciones anteriores. Los nombres comerciales de proyectos tampoco prueban aislamiento; debe verificarse rama, destino y backend.
