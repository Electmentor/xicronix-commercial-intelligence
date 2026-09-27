# Design QA — Rendimiento del negocio v2.46.0

final result: passed

## Alcance y comparación

Referencia: imagen adjunta de 1536×1024, con el dashboard en el panel izquierdo y cuatro referencias de subpáginas a la derecha. Implementación revisada en navegador integrado a 1440×1000 CSS y en móvil 390×844. Las imágenes se emitieron juntas en la comparación. No se declara igualdad de píxeles: se conserva el marco operativo existente, su panel de notificaciones y su navegación.

Evidencia local conservada fuera de los assets productivos, en `../performance-review/`: `desktop-final-reviewed.png`, `mobile.png`, `sales.png`, `budget.png`, `profit.png`, `forecast.png`. La demostración está explícitamente identificada; las cifras proceden del generador que ya existía, no de transcribir la referencia. La fuente vacía se comprobó también.

## Iteraciones y correcciones

- P2: tarjetas excesivamente altas y separación amplia. Se redujeron padding, controles y espaciado del dashboard.
- P2: el intento de altura fija reducía y luego recortaba los gráficos. Corregido usando altura natural y espacio mínimo para cada panel. Verificación final: clientHeight y scrollHeight coinciden en las tres tarjetas (530/530, 258/258, 258/258); ejes y barras completos en captura final.
- P2: faltaba diferenciación visible del tramo proyectado. Se añadieron líneas discontinuas violetas y escenarios coral/turquesa, conservando la línea real y el objetivo.
- P2: barras de rentabilidad mostraban únicamente resultado. Se extiende el gráfico existente para distinguir ventas, costo directo y resultado, con tabla exacta en el detalle.
- P2: el acceso financiero estaba oculto dentro del análisis avanzado. Se incorpora un acceso directo desde Dirección, utilizable también en móvil.

## Superficies revisadas

- Tipografía: se conserva la familia del CRM; títulos y cifras jerarquizados, etiquetas claras y sin texto superpuesto. Los importes exactos permanecen en tablas/exportación.
- Espaciado: cuatro KPI en escritorio, gráfico principal a izquierda y dos comparativos a derecha; alertas/acciones en paralelo; resumen al final. Móvil reordena alertas antes de gráficos y evita desbordamiento de página.
- Color y contraste: navy, texto claro, azul comercial, turquesa positivo, coral para pérdidas/excesos, violeta para proyección. Foco visible. La visualización financiera conserva su identidad navy al cambiar el modo global.
- Assets: se preservan marca, iconografía y marco de navegación del CRM. No se sustituye la UI con una imagen ni se generan cifras decorativas. Gráficos basados en el motor vectorial existente y sus datos.
- Contenido: toda cifra de demostración se identifica como simulada. Falta de costos, metas y base de proyección tiene estado explícito. Fórmulas largas quedan en detalle expandible.
- Interacciones: las cuatro subpáginas, filtros, periodos, retorno, control del escenario y apertura del registro funcionan en la prueba local. El Blob CSV se verificó con instrumentación local; la limitación del evento de descarga del navegador queda documentada en la nota de versión.

## Diferencias intencionales y límites

Se mantienen las notificaciones y el Assistant, por lo que el marco exterior no replica la imagen. Las subpáginas presentan los campos realmente disponibles y no replican métricas inventadas de las miniaturas. La prueba visual no equivale a una sesión autenticada real en producción ni a una auditoría WCAG completa.

No quedan hallazgos P0/P1/P2 de funcionamiento o recorte dentro del alcance revisado. Refinamiento P3 posible: reducir el número de puntos de la curva anual manteniendo los valores diarios accesibles.
