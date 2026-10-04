# Cotizador nativo de A009 · v2.48.0

El fundador autorizó conservar JavaScript nativo tras verificar que el CRM no utiliza Next.js/TypeScript. Se extienden `quotes`, `quote_items` y `catalog_products` en la instancia existente; `quote_versions` conserva revisiones inmutables. No se crea otra aplicación, base de datos o autenticación.

## Uso

Dirección → Cotizaciones → Nueva cotización. Seleccionar oportunidad del CRM o marcar Prueba interna. Añadir productos, ajustar costos y condiciones, guardar una versión. El documento cliente se descarga como HTML imprimible; abrirlo y seleccionar Imprimir → Guardar como PDF. El historial permite descargar cada versión original. Solo ADMIN puede modificar el motor financiero; los perfiles internos de la organización conservan lectura bajo RLS. La emisión no envía mensajes ni modifica automáticamente etapas/valores del pipeline.

## Fuente

`Tabla precio 08.2026.xlsx`, `rptTabelaPreco`, filas 6–735. Se verificaron 730 códigos únicos, descripciones, moneda, precios y referencias de fila contra Supabase: cero diferencias. SHA-256 `e9218dd4cb1370c181352c9b61225b7081391765efc867e5e5a00b588b1b7b99`. La importación ya existente se conserva, con metadatos estructurados adicionales. El archivo y los precios no se publican en el repositorio. `scripts/cidepe-source.py` valida y genera un upsert reproducible. El NCM del proveedor no se trata como clasificación peruana validada.

## Motor

Cálculo autoritativo en Postgres NUMERIC, por pedido completo:

- CIF PEN = (equipos USD + flete USD + seguro USD) × tipo de cambio.
- Derecho = CIF × ad valorem; IGV importación = (CIF + derecho) × tasa IGV.
- Percepción estimada = (CIF + derecho + IGV importación) × tasa percepción.
- Costo puesto = CIF + derecho + gastos locales PEN + contingencia + IGV no recuperable.
- Caja = costo puesto + IGV recuperable + percepción. La percepción se trata como anticipo fiscal, separada del costo económico.
- Costos distribuidos por valor proveedor; última partida recibe el residuo de centavos. Precio = costo / (1 − margen bruto). Markup = utilidad / costo; margen real = utilidad / venta sin IGV.
- Precio negociado sustituye el calculado; descuento de partida aplicado a precio unitario y descuento global al subtotal. IGV de venta calculado al final. Se redondea cada importe publicado a 2 decimales.
- Capital de trabajo conservador = máximo(0, desembolsos antes de cobro final − anticipo cliente). Se muestra además el pago inicial al proveedor. Supone anticipo cliente disponible antes del pedido y pago íntegro al proveedor antes de entrega; no incluye crédito o costos financieros.

Gastos locales: importes económicos sin IGV recuperable. Flete y gastos son de todo el pedido, no de cada equipo. Las tasas son editables y no sustituyen la validación aduanera. Fuente tributaria de referencia: https://www.sunat.gob.pe/orientacionaduanera/pagosgarantias/ (confirmar tratamiento aplicable antes de emisión).

## Seguridad y versiones

`save_xicronix_quote` usa una transacción, bloqueo de cotización y revisión esperada. UUID de solicitud permite reintentar sin duplicar; cada versión conserva inputs, precios/códigos/fuente del catálogo y cálculos. El trigger recalcula incluso un INSERT directo: el navegador no decide los totales finales. No hay permisos UPDATE/DELETE sobre versiones para authenticated. RLS limita organización. Funciones son SECURITY INVOKER, sin acceso anónimo.

El DTO comercial se construye con lista explícita de campos. El HTML no contiene estados internos ni JSON oculto. Solo incluye cliente, alcance, condiciones, equipos, cantidades, precios de venta, descuento global, IGV y total. No incluye costo proveedor, landed cost, margen, markup, caja ni trazabilidad privada. Alcance/condiciones son textos comerciales visibles: el operador no debe introducir información interna en ellos.

## Primera prueba

`Xicronix Lab FQBM 12/4 — secundaria`: cuatro mesas existentes, 12 prácticas/año propuestas. Cuatro kits de mecánica, cuatro de metrología/química, cuatro de microscopía y un kit matemático para 5 grupos asignado a cuatro mesas. Selección pedagógica provisional: validar equipamiento, consumibles, accesorios, seguridad y cobertura con CIDEPE. Los costos logísticos y tipo de cambio del escenario son supuestos explícitos, no tarifas verificadas. No se crea un cliente u oportunidad ficticios. La prueba siempre genera BORRADOR, aunque se marquen confirmaciones.

## Verificación

`node --test tests/quote-document.test.mjs tests/catalog.test.mjs`.
`tests/cotizador.sql`: pruebas reales de funciones/RLS en una transacción con rollback, precios sintéticos; cubre cálculo, descuentos, margen versus markup, recuperabilidad, validación, guardado, idempotencia, conflicto de versión, historia inmutable y documento saneado.

La batería completa antigua tiene 38 fallos preexistentes reproducidos en HEAD 3837846; la nueva revisión conserva esos 38 fallos y añade tres pruebas aprobadas. No se presenta la batería general como aprobada. El job independiente `quotation-ui` verifica los módulos exactos publicados, edición, guardado/reapertura, historial, descarga saneada y tamaño móvil con datos sintéticos; conserva capturas y resultado en GitHub Actions. No sustituye la autenticación real del usuario ni las pruebas SQL. La herramienta de navegador de esta sesión agotó tiempo, por lo que la revisión de interfaz se ejecuta en CI.

## Roles — v2.48.1
Dirección (`ADMIN`) mantiene precios de proveedor en Catálogo y costos en Costos y márgenes. Para habilitar trabajo comercial, crea un perfil USD, establece costos, margen mínimo y vigencia y marca «Autorizar uso por comerciales». No se habilitan supuestos de prueba automáticamente.

`SALES` y `MANAGER` pueden crear cotizaciones con ese perfil, elegir sus oportunidades, cantidades, margen objetivo, precios de venta y descuentos. Los costos son de solo lectura y el servidor los toma del perfil y catálogo, ignorando cualquier valor forjado. Las versiones comerciales quedan para revisión técnica de Dirección; un margen inferior al mínimo también marca el documento como borrador. Dirección guarda una nueva versión validada para emisión. Cada versión conserva sus costos históricos.

Las escrituras directas a cabeceras y partidas están limitadas a Dirección. El comando de guardado comercial verifica rol, organización y propiedad antes de persistir los valores calculados. `tests/quote-roles.sql` verifica estas restricciones con cambios que se revierten al finalizar.
