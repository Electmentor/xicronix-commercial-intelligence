# Atención DEV · 9 octubre 2026

## Candidato y alcance

Reutiliza PR70 (`2e70c2c`) y PR69 (`f0c21f5`) sobre main `e4278f1138d30cbc1105909f3c5e5c513ece2700`. Integraciones locales limpias. Los módulos públicos Nexa de PR72 se preservan sin diferencias frente a main. No se ha hecho push, merge remoto, despliegue, migración remota, cambio de clientes reales ni envío externo. El preview existente se conserva compatible mientras se coordina código y SQL.

Ciclo Nexa local: consulta sintética → contacto/origen persistidos → bandeja con responsable y aviso visible → atención humana → respuesta en cola → aceptación del puente → acuse del navegador → seguimiento fechado → resolución confirmada → cierre con resultado y evidencia.

PR69 sigue siendo receptor/recibos WhatsApp y asociación revisada con contacto/actividad/tarea. No equivale a una bandeja WhatsApp operativa ni habilita envío externo.

## Cambios mínimos añadidos

- Migración aditiva `20261009161000_conversation_attention_cycle_dev.sql` sobre esquema PR70.
- `follow_up_at`: fecha persistida; recepción fija 24h como plazo inicial operativo. El operador confirma/cambia fecha según caso. Guardar atención abierta requiere fecha.
- `dependency_pending`: planos, precios, decisiones u otra dependencia impiden resolver/cerrar. Omitir el campo conserva su valor, no lo borra.
- `closure_evidence` y `closed_reason`: ambos obligatorios. `resolved` además exige `resolution_confirmed: true`, confirmación humana de que la solicitud está satisfecha; un acuse por sí solo no basta.
- `last_incoming_message_id` se actualiza bajo bloqueo de conversación; `response_to_id`: respuesta ligada a la última consulta persistida, sin confiar en hora externa ni empates/reordenación de timestamps. La respuesta entregada a una consulta anterior no resuelve un nuevo ingreso tardío.
- Estados `resolved` y `closed`, con `resolution_outcome` (`resolved` / `administrative`). Resuelto→cerrado conserva resultado. Un cierre administrativo no se contabiliza como resolución ni venta ganada.
- Draft, pending, accepted, uncertain o failed impiden resolver/cerrar. No se altera `opportunities.stage`.
- Entrada nueva reabre, limpia resultado vigente y conserva anterior motivo/evidencia/resultado en eventos. Takeover no reabre silenciosamente un caso terminal.
- Eventos retienen responsable, fecha y snapshot de decisión/evidencia.
- Reintento del operador retiene clave idempotente y digest del texto en localStorage, sin guardar texto. Sobrevive recarga/nueva instancia. Se borra solo con comprobante UUID+estado; texto distinto ante intento incierto se bloquea hasta comprobar el anterior.

## Contrato web sin cambios

Puente servidor DEV, nunca token en navegador:
- `receive`: `{thread_id,event_key,body,occurred_at,consent:true,consent_version,source_page}` → `{ok:true,result:{conversation_id,message_id,duplicate}}`.
- `poll`: `{thread_id}` → mensajes accepted/delivered. Aceptación no significa entrega.
- `ack`: `{thread_id,message_id}` → `{ok:true,result:{message_id,status:'delivered'}}`.

La API de operador añade a update: `follow_up_at` ISO, `dependency_pending` boolean, `closure_evidence`, `resolution_confirmed` boolean. `status` admite `closed`. El servidor deriva actor/organización desde Auth. El contrato conserva UUID/revisión y rechazo de cambios concurrentes.

## Pruebas verificadas y límites

Comando comparable completo: `node --test --test-concurrency=1 tests/*.test.mjs`.
- main e4278f1: 142 casos, 103 aprobados, 39 fallos heredados.
- candidato final: 313 casos, 313 aprobados; log `review-artifacts/full-tests-final.txt`.
- Los arreglos de tests/interfaz heredados se reutilizan de PR70, incluidos 3f16480 y sucesores; no fueron reparaciones nuevas de este ciclo.
- WhatsApp SQL: `WA_PGLITE_MODULE="$PWD/node_modules/@electric-sql/pglite/dist/index.js" node scripts/verify-whatsapp-db.mjs`: 13/13 aprobados.
- `node --check app.js`, todos módulos/API/scripts y `git diff --check`: aprobados.
- PGlite prueba SQL en disco, reinicio, segunda sesión API, RLS sintético, duplicados, cambios stale, fallo, dependencia y auditoría. Serializa conexiones; NO prueba contención remota Supabase ni Auth real.
- Algunas ejecuciones intermedias de archivos PGlite terminaron abruptamente en el entorno compartido; la corrida final serial completa arriba sí aprobó. No se ocultan como fallos de aserción arreglados.
- Chromium local NO pudo iniciar (`socket() Operation not permitted`), incluso tras ejecución revisada. Script UI ampliado incluye recarga, contexto nuevo y móvil, pero NO se declara aprobado ni se adjuntan capturas inexistentes. Pruebas Python/UI de cotizador tampoco se ejecutaron en este ciclo.

## DEV remoto y seguridad

Infra verificó DEV `rmximatxuaczhpqbcuho` ACTIVE_HEALTHY, 0 conversaciones/mensajes, pero todavía sin las nuevas columnas. CORE inactivo no fue modificado. Preview PR70 existe y requiere login Supabase; no se suplantó perfil ni se crearon credenciales. No equivale a validación remota.

Aplicación requiere aprobación coordinada del candidato y revisión independiente. El SQL exige `app.conversations_environment='dev'` y `app.conversations_project_ref='rmximatxuaczhpqbcuho'`; el ejecutor debe verificar además el ID de proyecto explícito de la herramienta. Las variables por sí solas no autentican destino. No ejecutar sobre PROD.

Preflight remoto: nombres/tipos de tablas y constraint `commercial_conversations_status_check`, copia exacta función existente y privilegios/RLS; columnas nuevas ausentes; revisión de QA. Ejecutar sets y migración dentro de la misma llamada/sesión. No incluye nuevos grants ni cambia default privileges.

SHA256 migración: `8dc45e5ed104bfeb092434e172f1e4994a7b5079ffa216f653a4c6858ad4eff7`.
Copia función remota antes de cualquier cambio: SHA256 `308ce1f6640f8f3d03360a29de3345fa984e0bde6165059cd8c6bd32cdd98bed`; cuerpo confirmado idéntico al original PR70. El propietario conserva el archivo exacto para revisión y reversión.

## Reversión que preserva datos

Si falla la migración, su transacción revierte DDL y reemplazo de función completos. Después de aplicar, reversión operacional segura: deshabilitar exclusivamente el acceso preview DEV al ciclo, conservar tablas, columnas, mensajes y eventos, y restaurar la definición exacta anterior de `conversation_command` únicamente contra el DEV verificado. No DROP de columnas, tablas o evidencia; no borrar sintéticos automáticamente. Mantener la vista del candidato para leer nuevos estados o dejar ciclo deshabilitado, pues la UI anterior no comprende `closed`/outcome. No reactivar una UI anterior incompatible sobre datos nuevos. Cualquier posterior downgrade físico debe ser una migración revisada aparte.

## Pendientes reales

QA independiente 11/11 aprobada (incluye timestamps empatados/invertidos); integración web→CRM→SQL local 9/9 aprobada. Pendiente aplicación DEV coordinada; sesión de prueba autorizada y prueba remota de reload/nueva sesión; revisión visual/móvil; notificación externa al responsable. El aviso actual es visible en bandeja, no email/push comprobado. Producción permanece fuera de alcance.

Paquete apply/postcheck/rollback y snapshot ACL/RLS/políticas/conteos están preparados. No se ejecutó DDL remoto ni una prueba de DDL con ROLLBACK: la herramienta de DDL registra historial de migración, y no se presupuso que un rollback interno revierta ese efecto lateral. El estado remoto permanece sin cambios. npm audit del candidato: 0 vulnerabilidades reportadas.
