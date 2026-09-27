# v2.46.4 — Prioridad del saludo ejecutivo

Base comprobada: main remoto y local 799f117, producción v2.46.3. Árbol limpio antes de editar.

Alcance: solo la franja del saludo de Dirección. Una única implementación responsive conserva Hola, Toshi, Rendimiento del negocio y Cómo se calcula. Se retira la fila independiente de Rendimiento. Se mantienen cabecera fija, indicadores y resto del dashboard.

Prioridad: una señal CRITICAL pendiente, ordenada por puntuación; mayor oportunidad PEN abierta en PROPOSAL/NEGOTIATION; tarea vencida o en próximas72h, por fecha; seguimiento vencido o en próximas24h; información general. Empates por ID. Señales futuras y registros resueltos quedan fuera. No se marca atendido por abrirlo. Fallos en fuentes de mayor rango impiden afirmar una prioridad inferior como definitiva.

Actualización: tras guardar se reutiliza reload/render. El ciclo existente de45s actualiza también oportunidades/tareas/leads exclusivamente mientras se muestra el resumen ejecutivo administrativo; no añade temporizadores. Radar mantiene su actualización existente. Datos remotos pueden tardar hasta el siguiente ciclo visible exitoso. Sin migraciones ni cambios de permisos.

Validación:
- 40 pruebas Node aprobadas: jerarquía completa, segundo asunto asciende, cierre/completado, fechas, moneda, fuentes fallidas, escape de HTML, indicadores y analítica existentes.
- Navegador aislado sin conexión a backends: Revisar ahora abrió Radar filtrado al registro correcto y el formulario de la tarea correspondiente.
- Se guardó la tarea como Completada mediante UI y automáticamente apareció el seguimiento siguiente. El doble de pruebas necesitaba persistir updates en memoria; se corrigió solo tests/browser-fixture.js.
- Rendimiento abre su página; Cómo se calcula abre las reglas actualizadas.
- Escritorio1280 y1366; pantalla externa simulada1920x1080; móvil390x844. Claro y oscuro. Altura final del bloque104px en escritorio1280. Móvil sin desbordamiento global:375px <=390px. Un único saludo.
- Evidencias locales: ../performance-review/priority-baseline.png, priority-transition.png y priority-final-*.png.

Problemas reales / límites:
- Radar no ofrece Resolver; una señal se retira cuando sus datos dejan de cumplir la condición pendiente (clasificación/estado/resolución o prospecto vinculado cerrado), no por consultarla.
- La comprobación de información parcial contaba claves false como errores; ahora evalúa valores verdaderos, necesario para no invalidar el dashboard después de una sincronización exitosa.
- Pruebas funcionales con fixture y demo aislados, sin escrituras a producción. No se verificó sesión autenticada del fundador contra backend real.
- La suite general tenía35 fallos preexistentes documentados en v2.46.0; esta entrega ejecuta las40 pruebas relevantes, no afirma que la suite general esté verde.

Archivos: executive.mjs (modelo/render/reglas), app.js (acción y actualización), production.css (solo .executive-focus), index.html/sw.js/performance.mjs (versionado), tests/executive-priority.test.mjs, tests/director-desktop.test.mjs (selector de bloque), tests/browser-fixture.js, tests/browser-smoke.py (versión), este informe.
