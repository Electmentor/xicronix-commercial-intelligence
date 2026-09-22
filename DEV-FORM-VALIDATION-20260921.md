# Validación de formularios CRM y Prospect Intelligence — DEV

Fecha: 21 septiembre 2026. Resultado: guardado de los nueve formularios activos verificado en navegador autenticado y contrastado con Supabase DEV. No equivale a certificar todo el CRM ni todos los roles/combinaciones.

## Entorno y alcance

- URL: https://xicronix-commercial-intelligence-git-dev-xicronix.vercel.app/
- Proyecto exclusivo de escritura: rmximatxuaczhpqbcuho. Rama: dev. PR: https://github.com/Electmentor/xicronix-commercial-intelligence/pull/16
- Cuenta existente con rol administrador; navegador autenticado, sin leer contraseñas ni tokens.
- Producción no se modificó. Solo se consultaron las definiciones de tres funciones de hitos para reutilizar su contrato. No se cambiaron permisos, RLS, usuarios ni configuración Auth.
- Se crearon datos ficticios identificados como QA, con correos y sitios example.invalid; no se enviaron mensajes externos.

## Matriz: 86 campos en nueve formularios

| Formulario | Campos | Verificación y resultado |
|---|---:|---|
| Instituciones | 10 | Nombre, tipo, RUC, ciudad, país, dirección, correo, teléfono, web y notas: crear, guardar, reabrir y editar notas. Obligatorio vacío y RUC corto rechazados. |
| Contactos | 8 | Nombres, apellidos, institución, cargo, nivel de decisión, correo, teléfono y notas: crear, guardar, reabrir y editar cargo. Correo inválido rechazado. |
| Prospectos | 10 | Título, institución, contacto, origen, estado, valor, calificación manual, responsable, siguiente acción y fecha: guardar, reabrir y editar. Calificación >100 rechazada. Responsable corregido. |
| Oportunidades | 10 | Nombre, institución, contacto, etapa, valor, responsable, probabilidad, cierre esperado, acción y fecha: guardar, reabrir y editar importe. Valor negativo y probabilidad >100 rechazados. |
| Tareas | 8 | Título, prospecto, institución, contacto, estado, importancia, fecha y responsable: guardar, reabrir y completar. Obligatorios vacíos rechazados. |
| Movimientos | 15 | Prospecto, institución, contacto, acción, canal, asunto, resultado, necesidad, horizonte, presupuesto, evidencia, notas, fecha, siguiente acción y seguimiento: guardar, reabrir y editar. Acción obligatoria y pareja acción/fecha verificadas. |
| PI: organización/análisis | 16 | Identidad, tipo, sector, país, ciudad, sitio, hipótesis, siguiente acción, fecha, motivo y seis dimensiones: guardar, reabrir y editar. Vacío/espacios, dimensión >5 y URL activa rechazados. |
| PI: señal | 4 | Publicación, fuente, enlace y fecha: guardado y lectura persistente; fecha de observación separada. Vacíos/espacios y URL insegura rechazados. |
| PI: evidencia | 5 | Tipo, fuente, afirmación, enlace y contradicción crítica: guardado de las seis categorías. Hecho sin respaldo y texto vacío rechazados; contradicción crítica bloquea transferencia. |

Todos los campos se rellenaron con valores de prueba representativos y se verificó su persistencia. No se probaron todas las combinaciones posibles de opciones. Señales y evidencias tienen captura, no un editor individual en esta versión. Las fechas locales de Lima conservaron su hora al reabrir; la base almacenó UTC. Tildes y texto como `<texto>` permanecieron como texto.

## Fallos corregidos

1. DEV no cargaba perfiles para el selector Responsable y rechazaba guardar prospectos. Ahora reutiliza perfiles de la organización para el administrador, manteniendo oculta la gestión de usuarios. Sin nuevos permisos.
2. Oportunidades enviaba seis campos que no existen en el esquema DEV (producto, perfil de costos, cantidad, descuento, precio negociado y costo estimado). Se excluyen solo en DEV junto con su cotizador dependiente. Producción conserva su formulario.
3. Agenda, documentos y entregables mostraban botones que no abrían un módulo habilitado. Ahora están deshabilitados con explicación en DEV.
4. PI aceptaba textos de espacios y sitios con protocolos inseguros; ahora los rechaza sin perder el borrador. Un nuevo caso simulado permanece seleccionado y visible en su filtro.
5. La acción de calificación se guardaba, pero la madurez seguía en 0: al bootstrap DEV le faltaba el trigger de hitos. Se reutilizó el contrato de acciones existente, con ejecución bajo los permisos del usuario y actualización atómica que solo avanza. No hay migración automática de movimientos históricos.

## Flujo y evidencia

- CRM: institución → contacto → prospecto → oportunidad manual; tarea vinculada y movimiento. Todos persistieron. La oportunidad manual conserva institución/contacto; el formulario actual no expone selección de prospecto.
- Movimiento con acción/fecha creó una tarea. Editar acción/fecha conservó su ID y dejó una sola tarea automática. Completar la tarea manual persistió.
- Calificación desde navegador: prospecto pasó de 0 a 15%, actividad conservó M1/15 y autor. SQL cubrió los ocho códigos de hito y que un seguimiento ordinario no altera la madurez ni una acción menor la reduce.
- PI: investigación → calificado → priorizado → revisión → transferencia. Se creó institución/prospecto y una tarea; enlace abrió el expediente correcto en el CRM. Una hipótesis PI no crea por sí sola una nueva oportunidad: se mantiene el contrato pi-crm-v0.1.
- El primer caso `[SIMULADO]` se transfirió, pero el filtro CRM oculta esos registros. Se repitió el recorrido con una fixture `[DEV TEST]` para verificar la apertura del expediente, sin alterar ese filtro.
- Web → CRM: regresión SQL real aprobó transacción, repetición sin duplicar, conflicto de payload, reutilización, reapertura de tarea, oportunidad cerrada, trazabilidad, aislamiento DEV, roles y RLS.

### Identificadores de evidencia temporal

| Registro | ID |
|---|---|
| Institución manual QA | 4b3bb053-d6d4-4d81-9be8-845654788bc2 |
| Contacto QA | 1c759b86-ec87-4e0c-8e7a-fcb3ed7bb872 |
| Prospecto manual QA | ae1b302f-c4b3-4c2f-9fa0-774447dd4a51 |
| Oportunidad QA | 5cdfcc23-cd3c-428d-af25-cdb8c04d11bb |
| Movimiento QA | 891850d2-8b3b-4ae4-abf8-fb3e02da9064 |
| Tarea automática QA | bc2190b8-c5ed-4e34-8063-5b40116c2854 |
| Caso PI con todos los campos | f4565d7c-5812-4fcf-8e2f-58ea5ad891d4 |
| Transferencia UI y apertura CRM | ffcce775-fcba-4fb9-9378-c2f2c4ac2c37 |
| Prospecto de transferencia UI | 22f12bf0-70fb-4208-81ef-5f338cba2a03 |

Tras guardar evidencia local se eliminaron exclusivamente las fixtures de esta revisión, comprobando dependencias y cantidades en una transacción: 3 casos PI, 3 instituciones, 3 prospectos, 1 contacto, 1 oportunidad y sus señales/evidencias/transferencias/actividades/tareas. Se conservaron los seis casos PI previos y el prospecto `[DEV TEST] Flujo Web CRM 20260921`. Las pruebas SQL usaron BEGIN/ROLLBACK.

## Pruebas automatizadas y límites

- `tests/pi-discovery.test.mjs`, `tests/movement-validation.test.mjs`, `tests/prospect-intelligence-supabase.test.mjs`: 10 pruebas aprobadas.
- `tests/app-workspace.test.mjs`: 25 de 32 aprobadas, incluidas las nuevas pruebas DEV de responsable y oportunidad. Persisten siete fallos históricos: títulos, presentación del tablero vendedor, módulo inicial por rol, mensajes de prospecto convertido y versión del documento HTML. No se declara esta suite totalmente aprobada ni se ocultaron sus fallos.
- `tests/crm-dev-milestones.sql`: aprobado como authenticated; ocho acciones, evidencia, autor, edición, avance monotónico y seguimiento ordinario.
- `tests/pi-discovery-dev.sql`: aprobado como authenticated; revisión obsoleta/contradictoria bloqueada, ejecución repetible, una tarea y actualización sin reabrir tareas terminadas.
- `tests/web-crm-dev.sql`: aprobado como service_role para el contrato de entrada web y sus comprobaciones de permisos.
- Vercel publicó correctamente el frontend 8bc90193c2925cfe771388dba0fd8be84f71e64e; se verificó en el dominio DEV.

Pendiente y fuera de los nueve formularios activos: agenda/reuniones, entregables, documentos, cotización/costos y otros módulos administrativos no habilitados en DEV. El potencial calculado del CRM permanece pendiente: DEV no tiene instalado su motor de scoring; no debe confundirse con las seis dimensiones PI ni con madurez por hitos. La evidencia transferida se conserva, pero su presentación en el expediente todavía muestra contenido serializado.

Esta revisión no certifica recuperación de correo, todos los navegadores/dispositivos, carga/concurrencia ni sesiones reales separadas de vendedor/lector. Se conservó la sesión autenticada existente. El fallo del emulador PostgreSQL en CI, por acceso a auth, sigue documentado; no se ampliaron permisos para ocultarlo.

## Dependencias, riesgo y rollback

Dependencias reutilizadas: Supabase Auth/perfil y RLS, tablas CRM/PI existentes, RPC PI y entrada web, trigger de seguimiento previo, frontend estático DEV. Sin tablas ni endpoints nuevos.

Migración aplicada: `database/crm-dev-milestones-v1.sql`. Añade cuatro columnas de auditoría y un trigger privado SECURITY INVOKER; revoca invocación directa. No modifica políticas ni concede privilegios. Riesgo: la madurez conserva el mayor hito registrado; corregir/eliminar un movimiento histórico no reduce automáticamente ese porcentaje, siguiendo el contrato existente. No se recalculó el historial.

Rollback frontend: revertir en dev el commit 8bc90193c2925cfe771388dba0fd8be84f71e64e (base dc15ea39195dc1be2f21e20f065d83e9d8412c75), conservando cambios posteriores. Nunca mover main. Esto recuperaría también los errores de formularios, por lo que se prefiere corregir hacia adelante.

Rollback DB: aplicar únicamente en rmximatxuaczhpqbcuho `database/crm-dev-milestones-v1-rollback.sql`. Detiene nuevos avances automáticos; preserva columnas y evidencia ya registrada. Ningún rollback borra datos comerciales del usuario.
