export const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money = value => new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN',maximumFractionDigits:0}).format(Number(value)||0);
export function filterRecords(records, query, field, value, relatedName = () => '') {
  const needle = normalize(query.trim());
  return records.filter(row => (!value || row[field] === value) && (!needle || normalize([...Object.values(row),relatedName(row)].join(' ')).includes(needle)));
}
export const isOpen = row => !['WON','LOST','CONVERTED','DISQUALIFIED','COMPLETED','CANCELLED'].includes(row.stage || row.status);

const TASK_IMPORTANCE_BOOST={LOW:0,MEDIUM:2,HIGH:5,CRITICAL:8};
export function taskUrgency(row, now=Date.now()) {
  if (['COMPLETED','CANCELLED'].includes(row?.status)) return {score:-100,band:'CLOSED',label:row.status==='COMPLETED'?'Completada':'Cancelada',due:null,hasDate:false};
  const boost=(TASK_IMPORTANCE_BOOST[row?.priority]||0)+(row?.status==='IN_PROGRESS'?2:0);
  const due=Date.parse(row?.due_at);
  if(!Number.isFinite(due)) return {score:10+boost,band:'UNSCHEDULED',label:'Sin fecha definida',due:null,hasDate:false};
  const delta=due-now,hour=3600000,day=86400000;
  if(delta<0) return {score:Math.min(125,100+boost+Math.floor((-delta)/day)),band:'OVERDUE',label:'Vencida',due,hasDate:true};
  if(delta<=24*hour) return {score:90+boost,band:'TODAY',label:'Atender en 24 h',due,hasDate:true};
  if(delta<=72*hour) return {score:75+boost,band:'SOON',label:'Próximas 72 h',due,hasDate:true};
  if(delta<=7*day) return {score:60+boost,band:'WEEK',label:'Próximos 7 días',due,hasDate:true};
  if(delta<=14*day) return {score:45+boost,band:'FORTNIGHT',label:'Próximos 14 días',due,hasDate:true};
  return {score:30+boost,band:'SCHEDULED',label:'Programada',due,hasDate:true};
}
export function sortTasksByUrgency(tasks, now=Date.now()) {
  return [...(tasks||[])].sort((a,b)=>{
    const ua=taskUrgency(a,now),ub=taskUrgency(b,now);
    if(ua.score!==ub.score)return ub.score-ua.score;
    if(ua.hasDate!==ub.hasDate)return ua.hasDate?-1:1;
    if(ua.hasDate&&ub.hasDate&&ua.due!==ub.due)return ua.due-ub.due;
    return String(a.created_at||'').localeCompare(String(b.created_at||''));
  });
}
export function priorities(data, now = Date.now()) {
  const scores = new Map((data.scores || []).filter(row => row.lead_id).map(row => [row.lead_id, row]));
  const taskRows=sortTasksByUrgency((data.tasks||[]).filter(isOpen),now).map(row=>({...row,table:'tasks',due:row.due_at,urgency:taskUrgency(row,now),derived_score:null,recommendation:null}));
  const commercial=['leads','opportunities'].flatMap(table => (data[table] || []).filter(isOpen).map(row => {
    const score = table === 'leads' ? scores.get(row.id) : null;
    return {...row, table, due:row.next_action_date, derived_score:score?.total_score ?? null, recommendation:score?.recommendation || null};
  })).filter(row=>row.due&&Number.isFinite(Date.parse(row.due))).sort((a,b)=>{
    const aOverdue=Date.parse(a.due)<now,bOverdue=Date.parse(b.due)<now;
    if(aOverdue!==bOverdue)return aOverdue?-1:1;
    const scoreDifference=Number(b.derived_score??b.score??b.probability??0)-Number(a.derived_score??a.score??a.probability??0);
    return scoreDifference||Date.parse(a.due)-Date.parse(b.due);
  });
  return [...taskRows,...commercial];
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
