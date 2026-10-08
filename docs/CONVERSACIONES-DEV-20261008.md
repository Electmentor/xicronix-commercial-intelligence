# A009 — Atención multicanal, primera etapa DEV

Fecha: 8 octubre 2026. NO MERGE / NO PRODUCCIÓN. Implementación parcial verificada localmente; no operación real certificada.

## Inspección comprobada

- CRM main `0846574edf85149ef9eb4f5b62d0df8a1002589f`, interfaz JavaScript existente + funciones Vercel; no se migra a Next.js.
- Web main `ed5a4ad21c970c6efd2f2e84b511a58f469dc14a`, Next.js/TypeScript.
- PR web 33 atribución y 32 CIDEPE: abiertos, no fusionados. CRM 69 persistencia WhatsApp: abierto, draft. No se modifican sus ramas ni parches.
- Supabase CRM DEV `rmximatxuaczhpqbcuho`: INACTIVE. PROD y Core DEV: ACTIVE_HEALTHY. El PR 69 documenta límite de dos proyectos gratuitos activos. No se pausa Core ni se cambia plan.
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
- Suite heredada `tests/app-workspace.test.mjs`: 29 fallos tanto en main intacto como en esta rama (`window.addEventListener` ausente en fixture VM). No se declara suite global verde.
- PGlite 0.3.14, PostgreSQL WASM local en disco. No acredita concurrencia entre conexiones de PostgreSQL remoto, esquema íntegro, triggers, Auth real ni entrega externa. Prueba de navegador usa datos y puente sintéticos.
- No se implementa aún generación de propuestas desde documentos autorizados, reservas ni alertas push/sonoras de este módulo. El indicador de consulta nueva sí es visible en la bandeja. No se habilita IA autónoma.
- No se han probado Nexa web y CRM juntos en Vercel, ni un mensaje real autorizado. Sin migración remota, sin credenciales nuevas configuradas, sin producción.

## Reproducción local

Con PGlite 0.3.14 y Playwright 1.56.1 instalados en tooling externo al repositorio:

```sh
PGLITE_MODULE=/ruta/pglite/dist/index.js node --test tests/conversations.test.mjs
PGLITE_MODULE=/ruta/pglite/dist/index.js node scripts/preview-conversations.mjs
# En otra terminal, mismo entorno:
PLAYWRIGHT_MODULE=/ruta/playwright node scripts/verify-conversations-browser.cjs
PLAYWRIGHT_MODULE=/ruta/playwright node scripts/verify-conversations-navigation.cjs
```

La preview local vive en `http://127.0.0.1:4173/`, es exclusivamente sintética; no es una URL pública disponible al fundador. El script no forma parte de las rutas API desplegadas.

## Acciones necesarias para preview remota

1. A001/fundador: resolver capacidad DEV respetando la prohibición de pausar Core o contratar sin permiso; no existe capacidad libre comprobada. A009 no puede activar este DEV con el estado actual.
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
