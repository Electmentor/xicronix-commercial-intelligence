import {escapeHTML as esc} from './domain.mjs';
import {analyticsMetrics} from './analytics.mjs';

const available = value => typeof value === 'number' && Number.isFinite(value);
const number = value => available(value) ? value.toLocaleString('es-PE', {maximumFractionDigits: 1}) : '—';
const percent = value => available(value) ? number(value) + '%' : '—';
const currency = value => available(value) ? 'S/ ' + value.toLocaleString('es-PE', {maximumFractionDigits: 0}) : '—';
const compact = value => {
  if (!available(value)) return '—';
  const scale = Math.abs(value) >= 1e6 ? 1e6 : Math.abs(value) >= 1e3 ? 1e3 : 1;
  return 'S/ ' + (value / scale).toLocaleString('es-PE', {maximumFractionDigits: scale === 1 ? 0 : 1}) + (scale === 1e6 ? ' M' : scale === 1e3 ? ' mil' : '');
};
const day = value => Date.parse(String(value).slice(0, 10) + 'T00:00:00Z') / 86400000;
const dateLabel = value => new Date(String(value).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('es-PE', {day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'});
const ratio = (value, target) => available(value) && available(target) && target > 0 ? value / target * 100 : null;
const fixed = value => Number(value.toFixed(2));
const pointPath = points => points.map((point, i) => (i ? 'L' : 'M') + fixed(point.x) + ',' + fixed(point.y)).join(' ');
const downloadIcon = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M10 3v9m-3-3 3 3 3-3M4 13v4h12v-4"/></svg>';

function tickIndexes(length, max = 6) {
  return new Set(Array.from({length: Math.min(max, length)}, (_, index) => Math.round(index * (length - 1) / Math.max(1, Math.min(max, length) - 1))));
}

function axes({width, height, left, top, right, bottom, min = 0, max, labels = []}) {
  const plotHeight = height - top - bottom, plotWidth = width - left - right;
  const y = value => top + (max - value) / (max - min) * plotHeight;
  const ticks = Array.from({length: 4}, (_, index) => min + (max - min) * index / 3);
  return {
    y,
    markup: ticks.map(value => '<line class="analytics-gridline" x1="' + left + '" x2="' + (width - right) + '" y1="' + fixed(y(value)) + '" y2="' + fixed(y(value)) + '"/><text class="analytics-axis" x="' + (left - 9) + '" y="' + fixed(y(value) + 4) + '" text-anchor="end">' + esc(compact(value)) + '</text>').join('') +
      labels.map(label => '<text class="analytics-axis' + (label.future ? ' analytics-future-label' : '') + '" x="' + fixed(left + label.position * plotWidth) + '" y="' + (height - 10) + '" text-anchor="middle">' + esc(label.text) + '</text>').join('')
  };
}

function legend(items) {
  return '<div class="analytics-legend">' + items.map(([type, label]) => '<span><i class="analytics-key ' + type + '" aria-hidden="true"></i>' + esc(label) + '</span>').join('') + '</div>';
}

function emptyChart(message, page, action) {
  return '<div class="analytics-empty"><span class="analytics-empty-icon" aria-hidden="true">↗</span><p>' + esc(message) + '</p>' + (page ? '<button data-page="' + esc(page) + '">' + esc(action) + ' ↗</button>' : '') + '</div>';
}

function salesChart(m, loaded, goalsLoaded) {
  if (!loaded) return emptyChart('No se pudieron cargar las ventas. Actualiza los datos para ver la tendencia.');
  const rows = m.salesTimeline, width = 600, height = 310, left = 76, right = 23, top = 28, bottom = 38;
  const start = day(m.period.start) - 1, end = day(m.period.end), cutoff = day(m.period.cutoff);
  const x = date => left + (date - start) / Math.max(1, end - start) * (width - left - right);
  const targetKnown = goalsLoaded && available(m.targets.sales);
  const max = Math.max(1, m.totals.sales || 0, targetKnown ? m.targets.sales : 0) * 1.16;
  const indexes = tickIndexes(rows.length);
  const labelDate = new Intl.DateTimeFormat('es-PE', {day:'2-digit', month:'short', timeZone:'UTC'});
  const labels = rows.flatMap((row, index) => indexes.has(index) ? [{text: labelDate.format(new Date(row.date + 'T12:00:00Z')), position: (day(row.date) - start) / Math.max(1, end - start), future: row.isFuture}] : []);
  const {y, markup} = axes({width, height, left, top, right, bottom, max, labels});
  const actual = [{x: left, y: y(0)}], targetPast = [{x: left, y: y(0)}], targetFuture = [];
  let points = '';
  for (const [index, row] of rows.entries()) {
    if (!row.isFuture && available(row.sales)) {
      const point = {x: x(day(row.date)), y: y(row.sales)};
      actual.push(point);
      const previous = rows[index - 1];
      if (!previous || previous.sales !== row.sales || day(row.date) === cutoff) {
        const description = dateLabel(row.date) + ': ventas acumuladas ' + currency(row.sales);
        points += '<circle class="analytics-sales-point" cx="' + fixed(point.x) + '" cy="' + fixed(point.y) + '" r="4" tabindex="0" role="img" aria-label="' + esc(description) + '"><title>' + esc(description) + '</title></circle>';
      }
    }
    if (targetKnown && available(row.plannedSales)) {
      const point = {x: x(day(row.date)), y: y(row.plannedSales)};
      if (!row.isFuture) targetPast.push(point);
      else {
        if (!targetFuture.length) targetFuture.push(targetPast[targetPast.length - 1]);
        targetFuture.push(point);
      }
    }
  }
  const cutoffX = x(cutoff), futureWidth = width - right - cutoffX;
  const future = futureWidth > 1 ? '<rect class="analytics-future-area" x="' + fixed(cutoffX) + '" y="' + top + '" width="' + fixed(futureWidth) + '" height="' + (height - top - bottom) + '"/>' + (futureWidth > 100 ? '<text class="analytics-future-text" x="' + fixed(cutoffX + futureWidth / 2) + '" y="' + (top + 15) + '" text-anchor="middle">Por transcurrir</text>' : '') : '';
  const area = actual.length > 1 ? '<path class="analytics-sales-area" d="' + pointPath(actual) + ' L' + fixed(actual[actual.length - 1].x) + ',' + fixed(y(0)) + ' Z"/>' : '';
  const title = 'Ventas acumuladas frente al objetivo del periodo, en soles';
  const description = 'La línea continua representa ventas ganadas hasta ' + dateLabel(m.period.cutoff) + '. La línea discontinua representa el objetivo; el tramo futuro es punteado. Los valores exactos están en la tabla de datos.';
  return '<svg class="analytics-sales-svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-labelledby="analytics-sales-title analytics-sales-desc"><title id="analytics-sales-title">' + title + '</title><desc id="analytics-sales-desc">' + esc(description) + '</desc>' + future + markup + area +
    (targetKnown ? '<path class="analytics-target-line" d="' + pointPath(targetPast) + '"/>' + (targetFuture.length > 1 ? '<path class="analytics-target-line analytics-target-future" d="' + pointPath(targetFuture) + '"/>' : '') : '') +
    '<line class="analytics-cutoff-line" x1="' + fixed(cutoffX) + '" x2="' + fixed(cutoffX) + '" y1="' + top + '" y2="' + (height - bottom) + '"/><text class="analytics-cutoff-text" x="' + fixed(Math.min(width - right - 2, Math.max(left + 18, cutoffX))) + '" y="16" text-anchor="middle">Corte</text>' +
    '<path class="analytics-sales-line" d="' + pointPath(actual) + '"/>' + points + '</svg>' +
    (!targetKnown ? '<p class="analytics-chart-note">' + (goalsLoaded ? 'Sin meta completa para este periodo. ' : 'Metas pendientes de carga. ') + '<button data-page="goals">Revisar metas ↗</button></p>' : '') +
    (m.totals.wonCount === 0 ? '<p class="analytics-chart-note">Aún no hay ventas ganadas registradas en este periodo.</p>' : '');
}

function expenseChart(m, loaded, goalsLoaded) {
  if (!loaded) return emptyChart('No se pudieron cargar los gastos. No se representan como cero.');
  const rows = m.series, width = 440, height = 194, left = 71, right = 14, top = 13, bottom = 31;
  const values = rows.flatMap(row => [row.expenses, goalsLoaded ? (row.isFuture ? row.targetExpenses : row.plannedExpenses) : null]).filter(available);
  const max = Math.max(1, ...values) * 1.15, step = (width - left - right) / Math.max(1, rows.length);
  const indexes = tickIndexes(rows.length, 6);
  const labels = rows.map((row, index) => ({text: row.label, position: (index + .5) / rows.length, future: row.isFuture, index})).filter(row => indexes.has(row.index));
  const {y, markup} = axes({width, height, left, top, right, bottom, max, labels});
  const barWidth = Math.min(22, step * .31);
  const bars = rows.map((row, index) => {
    const center = left + (index + .5) * step;
    const budget = goalsLoaded ? (row.isFuture ? row.targetExpenses : row.plannedExpenses) : null;
    const description = row.label + ': ' + (row.isFuture ? 'periodo futuro; ' : 'gastos ' + currency(row.expenses) + '; ') + (available(budget) ? 'presupuesto ' + (row.isFuture ? 'del mes ' : 'a la fecha ') + currency(budget) : 'sin presupuesto');
    return '<g tabindex="0" role="img" aria-label="' + esc(description) + '"><title>' + esc(description) + '</title>' +
      (available(budget) ? '<rect class="analytics-budget-bar' + (row.isFuture ? ' analytics-budget-future' : '') + '" x="' + fixed(center + 1) + '" y="' + fixed(y(budget)) + '" width="' + fixed(barWidth) + '" height="' + fixed(Math.max(1, y(0) - y(budget))) + '" rx="2"/>' : '') +
      (!row.isFuture && available(row.expenses) ? '<rect class="analytics-expense-bar" x="' + fixed(center - barWidth - 1) + '" y="' + fixed(y(row.expenses)) + '" width="' + fixed(barWidth) + '" height="' + fixed(Math.max(1, y(0) - y(row.expenses))) + '" rx="2"/>' : '') + '</g>';
  }).join('');
  return '<svg class="analytics-bar-svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-labelledby="analytics-expenses-title analytics-expenses-desc"><title id="analytics-expenses-title">Gastos y presupuesto por mes, en soles</title><desc id="analytics-expenses-desc">Barras sólidas: gastos registrados. Barras de contorno: presupuesto a la fecha. Los presupuestos de meses futuros se muestran punteados, sin gasto real. Valores exactos en la tabla.</desc>' + markup + bars + '</svg>' +
    (!goalsLoaded || !available(m.targets.expenses) ? '<p class="analytics-chart-note">' + (goalsLoaded ? 'Presupuesto incompleto para el periodo.' : 'Presupuestos pendientes de carga.') + '</p>' : '');
}

function profitChart(m, salesLoaded, expensesLoaded) {
  if (!salesLoaded || !expensesLoaded) return emptyChart('El resultado requiere ventas y gastos cargados.');
  const rows = m.series, width = 440, height = 194, left = 71, right = 14, top = 13, bottom = 31;
  const values = rows.filter(row => !row.isFuture).map(row => row.operatingResult).filter(available);
  if (!values.length) return emptyChart('Completa los costos de las ventas ganadas para calcular el resultado.', 'opportunities', 'Completar costos');
  const min = Math.min(0, ...values) * 1.2, max = Math.max(1, ...values) * 1.2;
  const step = (width - left - right) / Math.max(1, rows.length), indexes = tickIndexes(rows.length, 6);
  const labels = rows.map((row, index) => ({text: row.label, position: (index + .5) / rows.length, future: row.isFuture, index})).filter(row => indexes.has(row.index));
  const {y, markup} = axes({width, height, left, top, right, bottom, min, max, labels});
  const barWidth = Math.min(28, step * .62);
  const bars = rows.map((row, index) => {
    if (row.isFuture) return '';
    const center = left + (index + .5) * step, value = row.operatingResult;
    if (!available(value)) return '<text class="analytics-missing-value" x="' + fixed(center) + '" y="' + fixed(y(0) - 8) + '" text-anchor="middle" role="img" tabindex="0" aria-label="' + esc(row.label + ': resultado no disponible; faltan costos') + '">?<title>' + esc(row.label + ': costos pendientes') + '</title></text>';
    const description = row.label + ': resultado operativo estimado ' + currency(value) + (available(row.operatingMarginPercent) ? '; margen operativo ' + percent(row.operatingMarginPercent) : '');
    return '<rect class="analytics-profit-bar ' + (value < 0 ? 'analytics-loss-bar' : '') + '" x="' + fixed(center - barWidth / 2) + '" y="' + fixed(y(Math.max(0, value))) + '" width="' + fixed(barWidth) + '" height="' + fixed(Math.max(1, Math.abs(y(value) - y(0)))) + '" rx="2" tabindex="0" role="img" aria-label="' + esc(description) + '"><title>' + esc(description) + '</title></rect>';
  }).join('');
  return '<svg class="analytics-bar-svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-labelledby="analytics-profit-title analytics-profit-desc"><title id="analytics-profit-title">Resultado operativo estimado por mes, en soles</title><desc id="analytics-profit-desc">Ventas menos costos directos estimados y gastos. Barras bajo la línea de cero representan pérdidas. El signo de interrogación señala costos incompletos. Meses futuros sin resultado.</desc>' + markup + '<line class="analytics-zero-line" x1="' + left + '" x2="' + (width - right) + '" y1="' + fixed(y(0)) + '" y2="' + fixed(y(0)) + '"/>' + bars + '</svg>';
}

function kpi(label, value, detail, status, tone = '', meter = null) {
  return '<article class="analytics-kpi ' + tone + '"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong><p>' + esc(detail) + '</p>' +
    (available(meter) ? '<div class="analytics-kpi-track" aria-hidden="true"><i style="width:' + fixed(Math.max(0, Math.min(100, meter))) + '%"></i></div>' : '<div class="analytics-kpi-spacer"></div>') +
    '<small>' + esc(status) + '</small></article>';
}

function pace(m, salesLoaded, goalsLoaded) {
  const actual = salesLoaded && goalsLoaded ? m.progress.periodSalesPct : null;
  const planned = goalsLoaded ? ratio(m.targets.salesToDate, m.targets.sales) : null;
  const periodProgress = m.period.elapsedDays / Math.max(1, m.period.totalDays) * 100;
  const bar = (label, value, tone) => '<div class="analytics-pace-row"><span>' + esc(label) + '</span><div class="analytics-pace-track" aria-hidden="true"><i class="' + tone + '" style="width:' + fixed(Math.max(0, Math.min(100, value || 0))) + '%"></i></div><strong>' + percent(value) + '</strong></div>';
  return '<div class="analytics-pace"><div class="analytics-pace-heading"><h4>Avance de la meta del periodo</h4><span>' + percent(periodProgress) + ' del tiempo transcurrido</span></div>' +
    (available(actual) && available(planned) ? bar('Logrado', actual, 'analytics-pace-actual') + bar('Programado a hoy', planned, 'analytics-pace-planned') : '<p class="analytics-chart-note">Define una meta de ventas para comparar el avance logrado con lo programado.</p>') + '</div>';
}

function alerts(m, loaded, goalsLoaded, expensesLoaded) {
  const items = [];
  if (m.quality.unknownCosts > 0 && loaded) items.push({tone: 'warning', title: 'Completar costos', detail: m.quality.unknownCosts + ' venta(s) ganada(s) sin costo. El resultado del periodo está pendiente.', page: 'opportunities'});
  if (loaded && goalsLoaded && available(m.progress.salesPct) && m.progress.salesPct < 95) items.push({tone: 'warning', title: 'Recuperar el ritmo de ventas', detail: currency(Math.max(0, -m.progress.salesVariance)) + ' por debajo de lo programado a la fecha.', page: 'opportunities'});
  if (expensesLoaded && goalsLoaded && available(m.progress.expensesVariance) && m.progress.expensesVariance > 0) items.push({tone: 'danger', title: 'Revisar el gasto', detail: currency(m.progress.expensesVariance) + ' por encima del presupuesto a la fecha.', page: 'expenses'});
  if (goalsLoaded && (!available(m.targets.sales) || !available(m.targets.expenses))) items.push({tone: 'neutral', title: 'Completar la planificación', detail: 'Faltan metas de ventas o presupuesto para cubrir todo el periodo.', page: 'goals'});
  if (loaded && expensesLoaded && available(m.totals.operatingResult) && m.totals.operatingResult < 0) items.push({tone: 'danger', title: 'Revisar la rentabilidad', detail: 'El resultado estimado es negativo. Revisa costos y gastos antes de comprometer recursos.', page: 'expenses'});
  if (!items.length && loaded && expensesLoaded && goalsLoaded && available(m.progress.salesPct)) return '<div class="analytics-stable"><span aria-hidden="true">✓</span> Sin desvíos críticos según el avance de ventas y el presupuesto registrados.</div>';
  return items.length ? '<div class="analytics-alerts" aria-label="Acciones sugeridas por los indicadores">' + items.slice(0, 3).map(item => '<button class="analytics-alert ' + item.tone + '" data-page="' + item.page + '"><span class="analytics-alert-mark" aria-hidden="true">' + (item.tone === 'neutral' ? 'i' : '!') + '</span><span><strong>' + esc(item.title) + '</strong><small>' + esc(item.detail) + '</small></span><span aria-hidden="true">↗</span></button>').join('') + '</div>' : '';
}

function dataDetails(m, loaded, goalsLoaded, expensesLoaded) {
  const cell = (value, full = true) => '<td>' + esc(full ? (available(value) ? 'S/ ' + value.toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:2}) : '—') : percent(value)) + '</td>';
  const rows = m.series.map(row => '<tr class="' + (row.isFuture ? 'analytics-future-row' : '') + '"><th scope="row">' + esc(row.label) + (row.isFuture ? '<small>Por transcurrir</small>' : day(row.end) > day(m.period.cutoff) ? '<small>Hasta el corte</small>' : '') + '</th>' +
    cell(loaded ? row.sales : null) + cell(goalsLoaded ? row.plannedSales : null) + cell(goalsLoaded ? row.targetSales : null) + cell(expensesLoaded ? row.expenses : null) + cell(goalsLoaded ? row.plannedExpenses : null) + cell(loaded && expensesLoaded ? row.operatingResult : null) + cell(loaded && expensesLoaded ? row.operatingMarginPercent : null, false) + '</tr>').join('');
  const quality = [
    m.quality.unknownCosts ? m.quality.unknownCosts + ' ventas ganadas sin costo estimado en el periodo.' : '',
    m.quality.excludedCurrency ? m.quality.excludedCurrency + ' registros en otras monedas excluidos; no se convierten a soles.' : '',
    m.quality.invalidDates ? m.quality.invalidDates + ' registros con fechas no válidas excluidos.' : '',
    m.quality.invalidAmounts ? m.quality.invalidAmounts + ' registros con importes no válidos excluidos.' : '',
    m.quality.overlappingGoals ? 'Hay metas superpuestas; se usa la más específica y, a igual duración, la más reciente.' : ''
  ].filter(Boolean);
  return '<details class="analytics-details"><summary>Ver datos exactos y método de cálculo <span>Tabla mensual · PEN</span></summary><div class="analytics-table-scroll" role="region" aria-label="Datos exactos de las gráficas; desplazamiento horizontal disponible" tabindex="0"><table class="analytics-table"><caption>Datos del ' + esc(dateLabel(m.series[0].start)) + ' al ' + esc(dateLabel(m.series[m.series.length-1].end)) + '. Corte: ' + esc(dateLabel(m.period.cutoff)) + '. — indica dato no disponible o periodo futuro.</caption><thead><tr><th scope="col">Mes</th><th scope="col">Ventas</th><th scope="col">Meta a fecha</th><th scope="col">Meta del mes</th><th scope="col">Gastos</th><th scope="col">Presupuesto a fecha</th><th scope="col">Resultado estimado</th><th scope="col">Margen operativo</th></tr></thead><tbody>' + rows + '</tbody></table></div><div class="analytics-method"><h4>Cómo leer estos indicadores</h4><ul>' + (m.methodology || []).map(text => '<li>' + esc(text) + '</li>').join('') + '<li>Escenario al ritmo actual: ventas acumuladas ÷ días transcurridos × días del periodo. Se muestra desde el séptimo día con ventas registradas; supone un ritmo uniforme y no garantiza cierres.</li></ul>' + (quality.length ? '<h4>Calidad de los datos</h4><ul>' + quality.map(text => '<li>' + esc(text) + '</li>').join('') + '</ul>' : '') + '</div></details>';
}

export function renderAnalytics(data, {now = new Date(), period = 'year', demo = false, failures = {}} = {}) {
  const m = analyticsMetrics(data, {now, period}), salesLoaded = !failures.opportunities, expensesLoaded = !failures.expenses, goalsLoaded = !failures.goals;
  const sales = salesLoaded ? m.totals.sales : null, expenses = expensesLoaded ? m.totals.expenses : null;
  const result = salesLoaded && expensesLoaded ? m.totals.operatingResult : null;
  const attainment = salesLoaded && goalsLoaded ? m.progress.salesPct : null, budgetUse = expensesLoaded && goalsLoaded ? m.progress.expensesPct : null;
  const forecast = salesLoaded && m.period.elapsedDays >= 7 && sales > 0 ? sales / m.period.elapsedDays * m.period.totalDays : null;
  const forecastAttainment = goalsLoaded ? ratio(forecast, m.targets.sales) : null;
  const incomplete = !salesLoaded || !expensesLoaded || !goalsLoaded;
  const salesStatus = !salesLoaded ? 'Ventas pendientes de carga' : !goalsLoaded ? 'Metas pendientes de carga' : !available(attainment) ? 'Sin meta comparable a la fecha' : attainment >= 100 ? 'Al ritmo previsto o por encima' : currency(Math.max(0, -m.progress.salesVariance)) + ' pendientes frente al plan';
  const expenseStatus = !expensesLoaded ? 'Gastos pendientes de carga' : !goalsLoaded ? 'Presupuesto pendiente de carga' : m.targets.expensesToDate === 0 ? (expenses > 0 ? 'Hay gastos con presupuesto de cero' : 'Presupuesto de cero; sin gastos registrados') : !available(budgetUse) ? 'Sin presupuesto comparable a la fecha' : budgetUse > 100 ? currency(Math.max(0, m.progress.expensesVariance)) + ' por encima del presupuesto' : currency(Math.max(0, -m.progress.expensesVariance)) + ' de holgura frente al presupuesto';
  const resultStatus = !salesLoaded || !expensesLoaded ? 'Ventas o gastos pendientes de carga' : m.quality.unknownCosts > 0 ? m.quality.unknownCosts + ' ventas sin costo; completa los datos' : available(result) && result < 0 ? 'Resultado negativo en el periodo' : 'Estimado con los costos registrados';
  const kpis = kpi('Ventas vs meta a la fecha', percent(attainment), currency(sales) + ' de ' + currency(goalsLoaded ? m.targets.salesToDate : null) + ' programados', salesStatus, available(attainment) && attainment < 95 ? 'warning' : 'positive', attainment) +
    kpi('Uso del presupuesto a la fecha', percent(budgetUse), currency(expenses) + ' de ' + currency(goalsLoaded ? m.targets.expensesToDate : null) + ' previstos', expenseStatus, available(budgetUse) && budgetUse > 100 ? 'danger' : '', budgetUse) +
    kpi('Resultado operativo estimado', compact(result), 'Ventas − costos directos − gastos', resultStatus, available(result) && result < 0 ? 'danger' : 'positive') +
    kpi('Cierre al ritmo actual', compact(forecast), available(forecastAttainment) ? percent(forecastAttainment) + ' de la meta del periodo' : 'Escenario lineal de ventas', available(forecast) ? 'Supone mantener el ritmo · no es garantía' : 'Requiere al menos 7 días y ventas registradas', 'forecast');
  const majorQualityIssue = (m.quality.excludedCurrency || 0) + (m.quality.invalidDates || 0) + (m.quality.invalidAmounts || 0);
  return '<section class="analytics-panel" aria-labelledby="analytics-heading" data-analytics-section><header class="analytics-header"><div><span class="analytics-eyebrow">CONTROL DE GESTIÓN</span><h2 id="analytics-heading">Rendimiento del negocio</h2><p>' + esc(m.period.label) + ' · Corte al ' + esc(dateLabel(m.period.cutoff)) + '</p></div><div class="analytics-controls"><span class="analytics-source ' + (demo ? 'demo' : 'live') + '">' + (demo ? 'Datos simulados' : 'Datos reales') + '</span><div class="analytics-periods" role="group" aria-label="Periodo de análisis">' + [['month', 'Mes'], ['quarter', 'Trimestre'], ['year', 'Año']].map(([key, label]) => '<button type="button" data-analytics-period="' + key + '" aria-pressed="' + (m.period.key === key) + '">' + label + '</button>').join('') + '</div><button type="button" class="analytics-export" data-analytics-export ' + (incomplete ? 'disabled ' : '') + 'title="Exportar los datos del periodo en CSV">' + downloadIcon + '<span>Exportar</span></button></div></header>' +
    (incomplete ? '<p class="analytics-data-notice" role="status">Información parcial: los módulos que no pudieron cargarse aparecen sin valores. Actualiza los datos antes de tomar decisiones.</p>' : '') +
    (majorQualityIssue ? '<p class="analytics-data-notice" role="status">Se excluyeron registros con otra moneda, fechas o importes no válidos. Revisa el detalle de calidad de datos al final de esta sección.</p>' : '') +
    '<div class="analytics-kpis">' + kpis + '</div><div class="analytics-charts"><article class="analytics-chart analytics-sales"><header><div><h3>Ventas y objetivo</h3><p>Acumulado del periodo · PEN</p></div><div class="analytics-chart-total"><strong>' + esc(compact(sales)) + '</strong><small>Meta: ' + esc(compact(goalsLoaded ? m.targets.sales : null)) + '</small></div></header>' + legend([['sales', 'Ventas registradas'], ['target', 'Objetivo'], ['future', 'Objetivo futuro']]) + salesChart(m, salesLoaded, goalsLoaded) + pace(m, salesLoaded, goalsLoaded) + '</article><article class="analytics-chart analytics-expenses"><header><div><h3>Gastos y presupuesto</h3><p>' + (m.period.key === 'month' ? 'Últimos 6 meses' : 'Por mes') + ' · PEN · actual hasta el corte</p></div><div class="analytics-chart-total"><strong>' + esc(compact(expenses)) + '</strong><small>Acumulado a fecha</small></div></header>' + legend([['expense', 'Gasto'], ['budget', 'Presupuesto a fecha'], ['future', 'Presupuesto futuro']]) + expenseChart(m, expensesLoaded, goalsLoaded) + '</article><article class="analytics-chart analytics-profit"><header><div><h3>Rentabilidad</h3><p>Resultado operativo estimado · ' + (m.period.key === 'month' ? 'últimos 6 meses' : 'por mes') + ' · PEN</p></div><div class="analytics-chart-total"><strong class="' + (available(result) && result < 0 ? 'analytics-negative' : '') + '">' + esc(salesLoaded && expensesLoaded ? percent(m.totals.operatingMarginPercent) : '—') + '</strong><small>Margen operativo del periodo</small></div></header>' + legend([['profit', 'Resultado ≥ 0'], ['loss', 'Pérdida < 0']]) + profitChart(m, salesLoaded, expensesLoaded) + '</article></div>' + alerts(m, salesLoaded, goalsLoaded, expensesLoaded) + dataDetails(m, salesLoaded, goalsLoaded, expensesLoaded) + '</section>';
}
