# A009 — Atención multicanal, primera etapa DEV

Fecha: 8 octubre 2026. NO MERGE / NO PRODUCCIÓN. Implementación parcial verificada localmente; no operación real certificada.

## Inspección comprobada

- CRM main `0846574edf85149ef9eb4f5b62d0df8a1002589f`, interfaz JavaScript existente + funciones Vercel; no se migra a Next.js.
- Web main `ed5a4ad21c970c6efd2f2e84b511a58f469dc14a`, Next.js/TypeScript.
- PR web 33 atribución y 32 CIDEPE: abiertos, no fusionados. CRM 69 persistencia WhatsApp: abierto, draft. No se modifican sus ramas ni parches.
- Estado en la inspección inicial: CRM DEV `rmximatxuaczhpqbcuho` INACTIVE; PROD y Core DEV ACTIVE_HEALTHY. Actualización A001 del 8 de octubre, 15:27:58 UTC: CRM DEV ACTIVE_HEALTHY y consulta de comprobación correcta; Core DEV pausado con autorización posterior del fundador. PROD sigue ACTIVE_HEALTHY. Esta corrección de código no aplica migraciones ni cambia capacidad, planes o credenciales.
- Vercel equipo `team_YwaTMaGFcjA5ZnrDMOl9knSH`, CRM `prj_PA3OlRptLoBwUHCXeHJqoAEjOVRu`; lista de proyectos accesible, despliegues devuelve 403. CLI Vercel no instalada/disponible con credenciales propias. GitHub muestra status Vercel success para main; no acredita esta etapa.
- Coordinación verificable: ramas, PR y este documento para A001/A007/A009. No se acredita un canal directo de mensajería entre agentes; no se enviaron comunicaciones externas.

## Implementación

`/#conversations`, acceso Conversaciones en Dirección y Ejecutivo. Filtros de canal, responsable, pendientes y antigüedad. Historial, origen declarado con evidencia de consentimiento, asignación, oportunidad, siguiente acción, estado y auditoría. Respuestas humanas tras tomar control; el control humano cancela borradores y pendientes de IA. Reanudar vuelve a supervisión; no activa envío automático.

Extensión de la base CRM, no otro catálogo/contactos. Tres tablas: conversaciones, mensajes y decisiones. IDs referencian contactos, perfiles y oportunidades existentes. No se crean ni fusionan contactos por nombre. Ingesta DEV limitada en servidor a un contacto, organización y responsable sintéticos configurados.

RLS de lectura por organización y responsable. Escrituras solo por API de servidor, actor verificado mediante Supabase Auth y perfil; funciones SQL SECURITY INVOKER ejecutables únicamente por service_role. Rol/organización nunca se toman del cuerpo enviado por el navegador. No se consultan costes/márgenes ni se añaden exportaciones. Las claves de servicio no se exponen al cliente.

Transiciones bloquean la fila de conversación; revision impide cambios obsoletos. Clave de evento única, verificación de contenido ante reintentos. Nexa recoge respuestas pendientes, confirma aceptación y después entrega cuando la UI incorpora el mensaje. No se infiere lectura. Un envío pendiente/aceptado/sin comprobación impide cerrar. Si falla almacenamiento se devuelve error, nunca éxito supuesto.

API desactivada por defecto, exige `VERCEL_ENV=preview`, bandera DEV y URL exacta del Supabase DEV. La preview del CRM obtiene configuración pública DEV y falla cerrada si no está disponible; no usa la sesión productiva como alternativa.

## Evidencia y límites

- `tests/conversations.test.mjs`: 17 pruebas aprobadas (incluye prueba contenedora): SQL persistente con reinicio, repetición/conflicto, RLS otra organización/vendedor sin asignar, escrituras directas denegadas, toma humana, revisión obsoleta, idempotencia, aceptación/entrega, cierre, eventos desordenados, desconexión, bloqueo productivo.
- `scripts/verify-conversations-browser.cjs`: Chromium, consulta sintética → bandeja → toma humana → respuesta → recepción en visitante → cierre → recarga → ancho móvil 390px. Sin errores JavaScript.
- `scripts/verify-conversations-navigation.cjs`: navegación real del CRM a `#conversations`, indisponibilidad explícita y vuelta al dashboard con fixture de autenticación.
- Web: `tests/chat-supervised.test.cjs`, 9 pruebas aprobadas (incluye contenedora), gates, sesión firmada HttpOnly, origen, consentimiento, aislamiento de hilo, fallo de puente y bloqueo de alias productivo. TypeScript comprobado contra checkout de trabajo con dependencias existentes; no acredita build de la rama remota.
- Diagnóstico inicial de CI: main tenía 140 pruebas, 101 aprobadas y 39 fallidas; esta rama 141, 101 aprobadas y 40 fallidas. Las 29 de `tests/app-workspace.test.mjs` fallaban al iniciar por un fixture DOM desactualizado. La nueva prueba contenedora de conversaciones fallaba por una dependencia PGlite no declarada. El pipeline ocultaba el código de fallo detrás de `tee`. Las correcciones se verifican en el último run de [CRM validation](https://github.com/Electmentor/xicronix-commercial-intelligence/actions/workflows/crm-validation.yml), comprobando el SHA de la rama.
- PGlite 0.3.14, PostgreSQL WASM local en disco. No acredita concurrencia entre conexiones de PostgreSQL remoto, esquema íntegro, triggers, Auth real ni entrega externa. Prueba de navegador usa datos y puente sintéticos.
- No se implementa aún generación de propuestas desde documentos autorizados, reservas ni alertas push/sonoras de este módulo. El indicador de consulta nueva sí es visible en la bandeja. No se habilita IA autónoma.
- No se han probado Nexa web y CRM juntos en Vercel, ni un mensaje real autorizado. Sin migración remota, sin credenciales nuevas configuradas, sin producción.

## Reproducción local

Corrección de validación del 8 de octubre, versión de rama v2.49.2: `npm ci --ignore-scripts` y 162/162 pruebas Node aprobadas, ninguna omitida; 17 corresponden al contenedor/recorrido de conversaciones. Sintaxis JavaScript/Python, formato del diff y auditoría npm (cero vulnerabilidades) comprobados. Se conservan pruebas de permisos, carga parcial y datos sensibles. Además se reparan preservación de demos editadas, histórico de leads convertidos, importación de tareas para VIEWER, indicadores parciales móviles, impresión/logo del documento cliente y selección histórica sin cambios falsos. La verificación del proveedor se omite correctamente en local por falta de clave; no se simuló su aprobación.

Chromium no pudo arrancar en el ejecutor local por restricciones de sockets; las regresiones completas de navegador deben aprobar en GitHub Actions para el SHA final. No confundir las 162 pruebas Node con una aprobación de navegador ni con una prueba remota Nexa/CRM.

Dependencias de pruebas fijadas en `package-lock.json`: PGlite 0.3.14 y Playwright 1.57.0. No se requieren credenciales ni servicios remotos:

```sh
npm ci --ignore-scripts
npm test
npm run test:conversations
npx playwright install chromium
npm run preview:conversations
# En otra terminal, mismo entorno:
node scripts/verify-conversations-browser.cjs
node scripts/verify-conversations-navigation.cjs
```

Para tooling externo se mantienen los overrides `PGLITE_MODULE` y `PLAYWRIGHT_MODULE`. `CHROMIUM_PATH` permite indicar el ejecutable local en los scripts de conversaciones. CI instala las versiones fijadas, propaga errores con `set -euo pipefail` y conserva logs/capturas. El recorrido prueba SQL/API/UI sintéticos; no acredita el puente Nexa web remoto, Supabase Auth real ni entrega a proveedores externos.

La preview local vive en `http://127.0.0.1:4173/`, es exclusivamente sintética; no es una URL pública disponible al fundador. El script no forma parte de las rutas API desplegadas.

## Acciones necesarias para preview remota

1. Capacidad DEV resuelta por A001 mediante el cambio autorizado de capacidad descrito arriba; mantener CRM DEV activo y no cambiar Core, PROD ni el plan dentro de este PR. Esto no habilita por sí solo la integración remota.
2. Administrador Vercel: habilitar acceso al proyecto/despliegues ya identificado; el conector actual recibe 403. No se amplían permisos automáticamente.
3. A009: migración solo en DEV, sesión marcada `SET app.conversations_environment='dev'`; crear o reutilizar contacto/perfil sintéticos; configurar variables exclusivas de preview. Validar esquema y concurrencia remotos.
4. A007/A009: configurar URL exacta de preview CRM en web, sesión de prueba y token compartido. Recorrer Nexa real de preview → bandeja → visitante, validar RLS remoto y errores.
5. A001/fundador: aprobación explícita de producción solo después de evidencia remota, reconciliación con PR 33/69 y completar los límites de la etapa. Esta rama NO es apta para promover a producción: gates y mapeo sintético son deliberados.

Variables CRM preview: `CONVERSATIONS_DEV_ENABLED=true`, `CONVERSATIONS_SUPABASE_URL` (DEV exacto), `CONVERSATIONS_PUBLIC_KEY` (publishable/anon), `CONVERSATIONS_SERVICE_KEY`, `CONVERSATIONS_BRIDGE_TOKEN`, `CONVERSATIONS_TEST_ORG_ID`, `CONVERSATIONS_TEST_CONTACT_ID`, `CONVERSATIONS_TEST_OWNER_ID`. Nunca copiar secretos a documentación.

Variables web preview: `NEXT_PUBLIC_NEXA_SUPERVISED_DEV=true`, `NEXA_SUPERVISED_DEV=true`, `CONVERSATIONS_BRIDGE_TOKEN`, `CONVERSATIONS_DEV_BRIDGE_URL` (URL de preview CRM terminada en `/api/conversations-bridge`). En modo supervisado no se llama al generador automático existente; polling cada 4 segundos mientras el chat esté abierto. La ruta normal de Nexa permanece intacta con la bandera desactivada.

## Canales y costes

- Nexa: prueba local sintética; puente web preparado, remoto pendiente. Usa Vercel/Supabase existentes; no se ha comprado ningún plan ni activado consumo de modelos con esta etapa. Coste recurrente incremental no cuantificado sin volumen y capacidad DEV.
- WhatsApp oficial: PR 69 preservado; persistencia DEV local histórica, API real y envío no verificados aquí. Meta, plantillas, consentimiento y precios requieren comprobación antes de activar.
- Correo: integración Zoho existente sin modificaciones/envíos; recepción, hilo y Enviados pendientes de reconciliación. No se usa Resend como sustituto ni se reenvía APM.
- Instagram: no activado. Falta comprobar cuenta empresarial, permisos y API Meta aplicable.
- Teléfono: no activado. Selección de proveedor, tarifas, consentimiento para transcripción y traspaso pendientes. No se activan grabaciones ni llamadas.

## Reversión

Antes de merge basta conservar/cerrar drafts sin fusionar. Para desactivar una preview configurada, desactivar banderas de CRM/web y volver al commit previo de sus ramas. Mantener tablas e historial: no hacer DROP ni borrar datos para revertir. No hay cambios productivos ni migraciones remotas que revertir en esta entrega.
