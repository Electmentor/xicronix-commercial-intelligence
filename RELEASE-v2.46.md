# v2.46.0 — Rendimiento del negocio

## Implementación

Se extiende el motor financiero existente, sin tablas, migraciones ni escrituras nuevas. Dirección dispone de acceso directo a Rendimiento y cuatro subpáginas: Ventas, Presupuesto, Rentabilidad y Proyecciones. La navegación usa `?performance=overview|sales|budget|profit|forecast#page=dashboard`, con los controles de acceso existentes.

Incluye KPI con acceso al detalle; corte Lima; Mes/Trimestre/Año; gráficos reales, objetivos y proyección diferenciados; alertas con gravedad, área y fecha; acciones enlazadas al editor del registro; resumen ejecutivo; CSV por vista. Ventas filtra institución, ejecutivo y producto de catálogo; Presupuesto filtra categoría. La vista mantiene el panel de notificaciones, Assistant y la navegación comercial existentes.

## Cálculos y procedencia

- REAL: oportunidades WON según cierre previsto hasta el corte, y gastos registrados. Solo PEN; no convierte monedas ni representa cobros.
- CALCULADA: ventas/meta al corte; gastos/presupuesto al corte; resultado = ventas − costos directos estimados − gastos; margen = resultado/ventas. La comparación interanual usa el mismo corte y solo aparece si existe una base positiva registrada.
- PROYECTADA: ventas acumuladas/días transcurridos × días del periodo. Conservador y optimista mantienen las ventas realizadas y varían únicamente el tramo futuro entre 0% y 50%. Disponible con ventas positivas y siete días transcurridos. No es garantía ni previsión probabilística.
- NO DISPONIBLE: costo faltante impide el resultado completo; metas sin cobertura o denominadores cero impiden porcentajes; una fuente fallida no se sustituye por cero. Un conjunto cargado sin registros sí puede sumar cero, identificado como actividad registrada.
- Metas organizacionales: prorrateo por día calendario; prevalece el plan más específico y luego la revisión más reciente, sin doble conteo.
- Margen por operación es margen bruto. No se reparte gasto general entre instituciones sin una base de distribución documentada.
- Resumen: etapas actuales del pipeline; cierres previstos en próximos 30 días y su valor nominal, sin prometer conversión.
- La demostración existente se mantiene separada y rotulada; no se copió ninguna cifra del archivo de referencia al código productivo.

## Validación

- 36 pruebas enfocadas en cálculos, gráficos, Dirección y el módulo nuevo: aprobadas.
- Suite completa: 87 pruebas, 52 aprobadas y 35 fallos heredados. La copia íntegra del commit base `53985856fc341d40a49acd61f41391a2734800a2` produjo 82 pruebas, 47 aprobadas y los mismos 35 fallos; no hay nombres nuevos entre las pruebas fallidas. Predominan dobles de DOM desactualizados (`window.addEventListener`) y expectativas previas de roles/demostración. No se declara aprobada la suite completa.
- Navegador integrado, entorno local aislado: entrada desde Dirección, enlace directo, cuatro subpáginas, mes, retorno, filtros de ventas y categoría, escenarios 20%/35%, acceso al editor de tarea desde una acción, fuente vacía, cambio día/noche, y rechazo de acceso financiero con rol SALES.
- CSV: el clic real generó un Blob de 47 filas para 46 cierres de demostración, con corte, moneda y origen. El doble local muestra el resultado del Blob; el evento nativo de descarga del navegador integrado agotó su espera, por lo que no se afirma verificación del archivo guardado por ese navegador. Serialización, filtros y neutralización de fórmulas se prueban automáticamente.
- Vista móvil 390×844 sin desbordamiento horizontal de página; KPI, alertas, gráficos, acciones y detalle reordenados. Comparación visual de escritorio a 1440×1000 con la referencia.
- Comprobaciones de sintaxis y `git diff --check` aprobadas. No se probaron envíos reales de Zoho ni acciones reales de backend: el cambio no las modifica.

## Caché y reversibilidad

Se actualizan los indicadores de versión, consultas de assets, importaciones modificadas y nombre del caché a v2.46.0. Se conserva el mecanismo de actualización y la estrategia de red del service worker. Reversión: revertir el commit de esta versión y desplegar con un identificador de caché nuevo.

Destino autorizado: https://xicronix-commercial-intelligence.vercel.app/ . El estado efectivo del despliegue se verifica por separado después de publicar.

Referencias consultadas: [seguridad Data API de Supabase](https://supabase.com/docs/guides/api/securing-your-api), [despliegues Git de Vercel](https://vercel.com/docs/git). No se cambian sesiones, claves, permisos ni políticas RLS.
