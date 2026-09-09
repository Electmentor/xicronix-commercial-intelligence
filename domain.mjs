export const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money = value => new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN',maximumFractionDigits:0}).format(Number(value)||0);
export function filterRecords(records, query, field, value, relatedName = () => '') {
  const needle = normalize(query.trim());
  return records.filter(row => (!value || row[field] === value) && (!needle || normalize([...Object.values(row),relatedName(row)].join(' ')).includes(needle)));
}
export const isOpen = row => !['WON','LOST','CONVERTED','DISQUALIFIED','COMPLETED','CANCELLED'].includes(row.stage || row.status);
export function priorities(data, now = Date.now()) {
  return ['tasks','leads','opportunities'].flatMap(table => (data[table] || []).filter(isOpen).map(row => ({...row,table,due:row.due_at || row.next_action_date})))
    .filter(row => row.due && Number.isFinite(Date.parse(row.due)))
    .sort((a,b) => Date.parse(a.due)-Date.parse(b.due));
}
export function metrics(data, now=Date.now()) {
  const open=(data.opportunities||[]).filter(isOpen);
  return {institutions:(data.institutions||[]).length,leads:(data.leads||[]).filter(isOpen).length,
    pipeline:open.reduce((sum,row)=>sum+Number(row.value||0),0),
    weighted:open.reduce((sum,row)=>sum+Number(row.value||0)*Number(row.probability||0)/100,0),
    overdue:priorities(data).filter(row=>Date.parse(row.due)<now).length};
}
export function csv(rows, columns) {
  const cell = v => '"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
  return '\uFEFF'+[columns.map(c=>cell(c.label)).join(','),...rows.map(row=>columns.map(c=>cell(row[c.key])).join(','))].join('\r\n');
}
