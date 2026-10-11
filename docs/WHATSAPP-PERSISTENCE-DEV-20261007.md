# A009 · Persistencia WhatsApp DEV — fase autorizada

Autorización del fundador: «Autorizado», 6/10/2026 22:10 Lima, a implementar el guardado y asociación de contactos existentes en DEV con datos de prueba. Continúa PR #69; no merge ni despliegue productivo.

## Resultado

Implementados dos registros propuestos: `whatsapp_receipts` y `whatsapp_identities`. Reutiliza contactos, perfiles, actividades y tareas existentes. No crea contactos ni un segundo CRM. El esquema real de columnas y restricciones del CRM se consultó mediante metadata de solo lectura; no se copiaron datos de clientes.

- Guardado transaccional y deduplicación por organización/evento; conflicto de contenido revierte el lote completo.
- Confirmación mediante segunda consulta de filas/IDs/hashes, después del commit. HTTP 200 aislado nunca acredita guardado.
- Asociación explícita de identidad WhatsApp a `contact_id` existente, dentro de la misma organización. Sin asociación inequívoca, queda una tarea de revisión. No hay fusiones, inferencia por IP ni atribución retrospectiva.
- Procesamiento transaccional e idempotente: una actividad WHATSAPP y una tarea, con cliente, responsable y siguiente paso. Casos sin responsable o cliente permanecen en revisión. El fallo revierte cambios parciales y deja el recibo disponible para reintento.
- Estados recibidos fuera de orden permanecen como evidencia aparte, sin inventar mensajes enviados ni tareas comerciales para estados huérfanos.
- RLS y grants: recibos visibles solo a administradores de su organización; anónimos sin acceso. Ingesta, asociación y procesamiento solo mediante rol servidor. Funciones SECURITY INVOKER, search_path vacío y ejecución revocada a PUBLIC/anon/authenticated. No se ampliaron permisos en ningún sistema remoto.
- Adaptador servidor restringido al proyecto DEV exacto `rmximatxuaczhpqbcuho`; rechaza producción incluso con flag encendido. Las credenciales y la activación no se configuraron.

## Evidencia y límites

Pruebas de unidad/contrato: 20/20 pasan (`node --test tests/whatsapp-intake.test.mjs tests/whatsapp-store.test.mjs`).

Prueba SQL: 13 verificaciones pasan con PostgreSQL 17.5 WASM (PGlite 0.3.14) sobre disco local. Incluye cerrar/reabrir la base y recuperar el registro, lectura posterior al commit, lote revertido por conflicto, reintento sin duplicación, asociación al contacto existente, aislamiento por organización, prohibición de anónimos/ingesta autenticada, rollback al fallar procesamiento, estado huérfano, identidad no reasignable y webhook firmado pasando por el almacén SQL real.

PGlite serializa consultas: no demuestra carreras entre conexiones PostgreSQL independientes. Las tablas CRM del ensayo son fixtures sintéticos basados en el contrato observado; no reproducen todos los triggers/RLS de Supabase. No se afirma validación remota, pantalla nueva, integración de Meta ni recepción de clientes. La suite CRM anterior tenía 39 fallos ya comparados con la base; esta fase no modifica esas áreas ni vuelve a diagnosticarlas.

Reproducción: instalar `@electric-sql/pglite@0.3.14` en un directorio temporal externo al repo y ejecutar `WA_PGLITE_MODULE=/ruta/absoluta/node_modules/@electric-sql/pglite/dist/index.js node scripts/verify-whatsapp-db.mjs`. No requiere credenciales ni red durante las pruebas. Genera únicamente datos sintéticos locales.

## Bloqueo remoto verificado

Supabase reporta `Xicronix Commercial Intelligence DEV` como INACTIVE; SQL agotó el tiempo de conexión. Se intentó restaurar ese proyecto existente con `restore_project`. Supabase rechazó la restauración: el titular ya tiene dos proyectos gratuitos activos. Exige pausar/eliminar otro o cambiar de plan. No se pausó, eliminó ni contrató nada. Producción y Core permanecen intactos.

La migración fue generada con Supabase CLI `migration new whatsapp_intake_dev`; está versionada para revisión, aplicada únicamente en la base de pruebas local. Requiere la marca de sesión `app.whatsapp_environment=dev`. Esa marca es una prevención operativa, no una prueba de identidad del entorno: antes de cualquier aplicación remota hay que verificar URL/project_id DEV. No ejecutar contra producción.

Changelog Supabase consultado: el cambio 25/09/2026 sobre PostgreSQL 15.19/17.11 afecta ltree, pgcrypto, btree_gist y operadores personalizados. Esta migración no usa esas extensiones ni operadores personalizados. Documentación de funciones SECURITY INVOKER y RLS revisada; advisors remotos no ejecutados porque DEV no está activo.

## Siguiente acción y reversión

Hace falta recuperar capacidad para el DEV existente. Pausar otro proyecto o cambiar de plan requiere una decisión específica del fundador. No es necesario volver a autorizar este código ni la persistencia DEV ya aprobada.

Tras recuperar DEV: verificar su esquema real y estructuras equivalentes; aplicar migración revisada; repetir pruebas de commit/readback con conexiones independientes, RLS/triggers y pantalla CRM; incorporar reintentos al mecanismo operacional existente. El procesador actual se invoca explícitamente; no se creó cron paralelo ni envío automático. Cuenta Meta, número, proveedor, coexistencia, permisos, costos y prueba controlada real conservan sus gates.

Reversión actual: retirar el cambio de la PR. No hay esquema remoto que revertir. Si posteriormente se activa DEV, apagar WHATSAPP_INTAKE_ENABLED preservando recibos e historial; no eliminar tablas para revertir código.
