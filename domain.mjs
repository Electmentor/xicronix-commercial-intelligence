export const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money = value => new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN',maximumFractionDigits:0}).format(Number(value)||0);
export function filterRecords(records, query, field, value, relatedName = () => '') {
  const needle = normalize(query.trim());
  return records.filter(row => (!value || row[field] === value) && (!needle || normalize([...Object.values(row),relatedName(row)].join(' ')).includes(needle)));
}
export const isOpen = row => !['WON','LOST','CONVERTED','DISQUALIFIED','COMPLETED','CANCELLED'].includes(row.stage || row.status);
export function priorities(data, now = Date.now()) {
  const scores = new Map((data.scores || []).filter(row => row.lead_id).map(row => [row.lead_id, row]));
  return ['tasks','leads','opportunities'].flatMap(table => (data[table] || []).filter(isOpen).map(row => {
    const score = table === 'leads' ? scores.get(row.id) : null;
    return {...row, table, due:row.due_at || row.next_action_date, derived_score:score?.total_score ?? null, recommendation:score?.recommendation || null};
  }))
    .filter(row => row.due && Number.isFinite(Date.parse(row.due)))
    .sort((a,b) => {
      const aOverdue = Date.parse(a.due) < now;
      const bOverdue = Date.parse(b.due) < now;
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
      const scoreDifference = Number(b.derived_score ?? b.score ?? b.probability ?? 0) - Number(a.derived_score ?? a.score ?? a.probability ?? 0);
      return scoreDifference || Date.parse(a.due) - Date.parse(b.due);
    });
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

export function parseCsv(text) {
  const input=String(text??'').replace(/^\uFEFF/,'');
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<input.length;i++){
    const char=input[i],next=input[i+1];
    if(quoted){
      if(char==='"'&&next==='"'){cell+='"';i++;}
      else if(char==='"')quoted=false;
      else cell+=char;
    }else if(char==='"'&&cell==='')quoted=true;
    else if(char===','){row.push(cell);cell='';}
    else if(char==='\n'||char==='\r'){
      if(char==='\r'&&next==='\n')i++;
      row.push(cell);cell='';
      if(row.some(value=>value.trim()!==''))rows.push(row);
      row=[];
    }else cell+=char;
  }
  if(cell!==''||row.length){row.push(cell);if(row.some(value=>value.trim()!==''))rows.push(row);}
  if(rows.length<2)return [];
  const headers=rows.shift().map(header=>normalize(header));
  return rows.map(values=>Object.fromEntries(headers.map((header,index)=>[header,String(values[index]??'').trim()])));
}