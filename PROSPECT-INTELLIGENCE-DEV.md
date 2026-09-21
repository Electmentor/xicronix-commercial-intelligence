# Prospect Intelligence DEV — 21 septiembre 2026

Primera versión operativa inspirada en las referencias visuales: lista de organizaciones con expediente lateral, señales con fuentes y fechas, evidencia clasificada, evaluación manual explicable y revisión de transferencia al CRM.

## Alcance y reutilización

- Entorno exclusivo: CRM DEV, proyecto Supabase rmximatxuaczhpqbcuho; rama dev. Producción y permisos permanecen sin cambios.
- REUTILIZAR: pi_cases, pi_signals, pi_evidence, pi_transfers, instituciones, prospectos, actividades, tareas, RLS y RPC existentes.
- EXTENDER: formularios de captura/edición, fuentes seguras, filtros, preparación de transferencia inmutable y ejecución repetible sin duplicar tarea.
- COMPONER: señales → evidencia → evaluación → revisión humana → prospecto CRM y seguimiento.
- CREAR: únicamente presentación, helpers, pruebas y el trigger de seguimiento ausente en DEV. Sin tablas ni endpoints adicionales.

La transferencia conserva el contrato pi-crm-v0.1. Crea institución/prospecto cuando corresponde o añade evidencia a un prospecto u oportunidad existentes. No crea automáticamente una oportunidad nueva a partir de una hipótesis de investigación. La entrada Web → CRM conserva su flujo transaccional anterior.

## Comportamiento

La página usa la sesión existente del CRM en el mismo navegador y origen. Sin sesión muestra ingreso y una demostración explícita de solo lectura; un error de conexión nunca se presenta como datos reales.

Registrar organización, editar análisis, registrar señal y añadir evidencia persisten en las tablas existentes. Los hechos/confirmaciones exigen fuente y enlace en el formulario. Las publicaciones conservan fecha de publicación y de observación por separado. La UI admite solo enlaces HTTP/HTTPS y escapa los textos.

Las dimensiones conservan F encaje, N necesidad, C capacidad, T momento, A accesibilidad, E evidencia. Las puntuaciones son índices de reglas y evaluación manual, no probabilidades de venta ni evaluación automática de IA. Las fórmulas están visibles.

Antes de transferir se exige identidad, hipótesis, evidencia, evaluación suficiente, ausencia de contradicción crítica, estado priorizado, siguiente acción, fecha y motivo. La revisión muestra lo que se creará/reutilizará. Cambiar el caso invalida la revisión anterior; se comprueba nuevamente al ejecutar. Repetir la ejecución devuelve los mismos identificadores. Se conserva el responsable del prospecto nuevo y una tarea por transferencia.

Los movimientos con próxima acción y fecha ahora generan/actualizan una tarea interna bajo RLS. Las tareas terminadas no se reabren. Las entradas WEB_FORM usan su automatización existente para evitar duplicación. Borrar la próxima acción no cancela tareas ya creadas: su estado se gestiona en Tareas.

## Investigación inicial

Se registraron dos casos reales con una señal y tres evidencias cada uno (hecho, hipótesis, dato faltante). Ambos permanecen RESEARCHING y readiness=false; no se transfirieron ni se contactó a nadie.

- PUCP: publicación del 28 agosto 2026 sobre Open Lab. Fuente: https://investigacion.pucp.edu.pe/noticias-y-eventos/open-lab-abre-nuevas-posibilidades-para-innovar/
- UNIFÉ: publicación del 8 abril 2026 sobre laboratorio y observatorio IA. Fuente: https://unife.edu.pe/inauguracion-del-laboratorio-de-inteligencia-artificial-y-el-observatorio-ia-unife/

Estas publicaciones permiten investigar colaboración; no acreditan presupuesto disponible, necesidad de compra ni intención comercial. Investigación registrada el 21 septiembre 2026. Los cuatro ejemplos simulados anteriores se conservan y se filtran por separado.

## Evidencia de validación

- 8 pruebas unitarias pasan: filtros, enlaces/escape, fecha sin desfase, aislamiento de proyecto DEV y validación de movimientos.
- 5 pruebas seleccionadas del harness CRM pasan: edición según rol, conservación de formulario, separación de demostración, importación y guardado de movimiento después de seleccionar acción.
- tests/pi-discovery-dev.sql ejecutado en Supabase DEV bajo authenticated y UID del administrador existente, dentro de BEGIN/ROLLBACK. Comprueba preparación repetida, rechazo de cambios no revisados, revisión sustituida, bloqueo por contradicción, ejecución repetida, propietario del prospecto, una tarea por transferencia, actualización de tarea por movimiento y conservación de tareas terminadas. Sin residuos de prueba.
- Navegador: carga de la interfaz, demostración explícita, búsqueda sin resultados, vista de señales y bloqueo de escritura sin sesión verificados.
- No se afirma E2E autenticado completo del navegador: la sesión de la aplicación instalada del usuario no está disponible en el navegador del agente. Base de datos y UI se verificaron por separado.
- La suite histórica completa del CRM conserva siete fallos previos de expectativas de títulos/textos/versión, documentados en MOVEMENT-DEV-FIX.md; no se declara aprobada.

## Dependencias y límites

Supabase JS v2 desde CDN, sesión/perfil existente, RLS vigente, RPC PI previos y restricción única de tareas por organización/automation_key. No requiere nuevas credenciales ni ampliar acceso.

Primera versión de investigación manual: sin rastreo automático, avisos externos ni predicciones. La coincidencia CRM conserva las reglas existentes de nombre/RUC/web; ante varias instituciones coincide en revisión manual. Varias oportunidades de una institución siguen la selección preexistente y requieren revisión comercial. No hay prueba de carga/concurrencia; un conflicto transaccional puede exigir volver a preparar la transferencia.

## Rollback

Frontend: revertir únicamente este cambio de PI sobre la rama dev; base anterior 8153c4a0327ebcbe22736688dad683cb10e270f9. No mover main.

Base de datos: database/pi-discovery-dev-v2-rollback.sql restaura las dos definiciones RPC anteriores y retira el trigger nuevo. Aplicar solo a CRM DEV, mediante migración y en ventana sin escrituras. Ese rollback recupera también las limitaciones anteriores de revisión/reintento, por lo que es preferible corregir hacia adelante.

El rollback conserva investigaciones, transferencias, movimientos y tareas. No borra datos ni revoca la vinculación al CRM. Las migraciones consolidadas se registran en database/pi-discovery-dev-v2.sql; fueron aplicadas incrementalmente en DEV, incluyendo correcciones de ámbito SQL y comparación de snapshots.
