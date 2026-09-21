# Corrección de movimientos DEV — 2026-09-21

Problema: Acción realizada se mostraba opcional, aunque un movimiento nuevo no podía guardarse sin ella. Además, activities DEV carecía de need_summary, decision_timeline y budget_signal, que el formulario envía.

Cambio: requisito visible y validación nativa para movimientos nuevos; validación defensiva desplaza/focaliza el campo. Los históricos sin acción siguen editables. Se amplió la tabla existente con tres columnas text anulables. Sin tablas nuevas ni permisos/RLS cambiados.

Validación: cuatro pruebas unitarias y cuatro pruebas de formulario/guardado seleccionadas pasan; inserción real bajo rol authenticated y UID administrador existente pasó dentro de BEGIN/ROLLBACK. No se guardó el borrador del usuario: su sesión instalada no está disponible al agente. No se afirma E2E autenticado en navegador.

La suite antigua completa tiene siete fallos de expectativas/interfaz tras corregir imports ausentes del harness (títulos, texto y versión), fuera de este arreglo. No se presenta como aprobada.

Dependencia adicional detectada: activities DEV no tiene triggers de seguimiento. El texto que promete creación automática de tarea por movimiento necesita validación/implementación posterior; esta corrección no lo resuelve. El flujo de entrada web tiene su propio RPC y no depende de ese trigger.

Rollback: revertir el commit del frontend; conservar las columnas anulables para no perder contenido. Solo retirar columnas si se verifica que están vacías y existe autorización. PRODUCCIÓN intacta.
