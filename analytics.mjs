// Management estimates in PEN. These figures are neither collections nor accounting profit.
const DAY = 86400000;
const businessDate = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'});
const monthLabel = new Intl.DateTimeFormat('es-PE',{timeZone:'UTC',month:'short',year:'2-digit'});
const rounded = value => value === null ? null : Math.round((value + Number.EPSILON) * 100) / 100;
const number = value => value === null || value === undefined || value === '' || typeof value === 'boolean' || !Number.isFinite(Number(value)) ? null : Number(value);
const ratio = (actual,target) => actual !== null && target !== null && target > 0 ? rounded(actual / target * 100) : null;
const difference = (actual,target) => actual === null || target === null ? null : rounded(actual-target);
const iso = ordinal => new Date(ordinal * DAY).toISOString().slice(0,10);
function dayNumber(value){
 if(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)){
  const timestamp=Date.parse(value+'T00:00:00Z');
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0,10)===value ? timestamp/DAY : null;
 }
 const date=value instanceof Date?value:new Date(value);
 if(value===null||value===undefined||value===''||!Number.isFinite(date.getTime()))return null;
 const parts=Object.fromEntries(businessDate.formatToParts(date).map(part=>[part.type,part.value]));
 return Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day))/DAY;
}
const monthStart = (year,month) => Date.UTC(year,month,1)/DAY;
const inRange = (row,start,end) => row.day>=start && row.day<=end;
const pen = row => !row.currency || String(row.currency).toUpperCase()==='PEN';
export function businessDay(now=new Date()){
 const day=dayNumber(now);if(day===null)throw new RangeError('La fecha de corte no es válida.');
 return iso(day);
}
export function businessMonthRange(now=new Date()){
 const day=dayNumber(now);if(day===null)throw new RangeError('La fecha de corte no es válida.');
 const date=new Date(day*DAY),year=date.getUTCFullYear(),month=date.getUTCMonth();
 return {start:iso(monthStart(year,month)),end:iso(monthStart(year,month+1)-1)};
}

function actuals(opportunities,expenses,start,end){
 const won=opportunities.filter(row=>inRange(row,start,end)),spent=expenses.filter(row=>inRange(row,start,end));
 const sales=rounded(won.reduce((sum,row)=>sum+row.value,0)),unknownCosts=won.filter(row=>row.cost===null).length;
 const directCosts=unknownCosts?null:rounded(won.reduce((sum,row)=>sum+row.cost,0));
 const grossMargin=directCosts===null?null:rounded(sales-directCosts),expenseTotal=rounded(spent.reduce((sum,row)=>sum+row.amount,0));
 const operatingResult=grossMargin===null?null:rounded(grossMargin-expenseTotal);
 return {sales,directCosts,grossMargin,expenses:expenseTotal,operatingResult,marginPercent:ratio(grossMargin,sales),operatingMarginPercent:ratio(operatingResult,sales),wonCount:won.length,unknownCosts};
}

// A specific monthly plan overrides a broader annual one; revisions use the latest timestamp.
// Each calendar day receives exactly one rate per field, so plans can never be double-counted.
function planned(goals,start,end){
 const fields={sales:'target_won_value',margin:'target_margin',expenses:'target_expenses'};
 const sums={sales:0,margin:0,expenses:0},gaps={sales:0,margin:0,expenses:0};let overlaps=0;
 for(let date=start;date<=end;date++){
  const covering=goals.filter(goal=>date>=goal.start&&date<=goal.end);
  if(covering.length>1)overlaps++;
  for(const [key,field] of Object.entries(fields)){
   const goal=covering.find(row=>number(row.source[field])!==null&&number(row.source[field])>=0);
   if(!goal)gaps[key]++;
   else sums[key]+=number(goal.source[field])/(goal.end-goal.start+1);
  }
 }
 return {...Object.fromEntries(Object.keys(fields).map(key=>[key,gaps[key]?null:rounded(sums[key])])),gaps,overlaps};
}

export function analyticsMetrics(data,{now=new Date(),period='year'}={}){
 const today=dayNumber(now);if(today===null)throw new RangeError('La fecha de corte no es válida.');
 const current=new Date(today*DAY),year=current.getUTCFullYear(),month=current.getUTCMonth();
 const key=['month','quarter','year'].includes(period)?period:'year';
 const start=key==='month'?monthStart(year,month):key==='quarter'?monthStart(year,Math.floor(month/3)*3):monthStart(year,0);
 const end=key==='month'?monthStart(year,month+1)-1:key==='quarter'?monthStart(year,Math.floor(month/3)*3+3)-1:monthStart(year+1,0)-1;
 const quality={unknownCosts:0,excludedCurrency:0,invalidDates:0,invalidAmounts:0,goalGaps:{sales:0,margin:0,expenses:0},overlappingGoals:0};
 const opportunities=[],expenses=[],goals=[];
 for(const row of data.opportunities||[]){
  if(row.stage!=='WON')continue;
  if(!pen(row)){quality.excludedCurrency++;continue;}
  const day=dayNumber(row.expected_close_date),value=number(row.value);
  if(day===null){quality.invalidDates++;continue;}
  if(value===null||value<0){quality.invalidAmounts++;continue;}
  const suppliedCost=number(row.estimated_cost),cost=suppliedCost!==null&&suppliedCost>=0?suppliedCost:null;
  if((suppliedCost!==null&&suppliedCost<0)||(suppliedCost===null&&row.estimated_cost!==null&&row.estimated_cost!==undefined&&row.estimated_cost!==''))quality.invalidAmounts++;
  if(day<=today)opportunities.push({source:row,day,value,cost});
 }
 for(const row of data.expenses||[]){
  if(!pen(row)){quality.excludedCurrency++;continue;}
  const day=dayNumber(row.expense_date),amount=number(row.amount);
  if(day===null){quality.invalidDates++;continue;}
  if(amount===null||amount<0){quality.invalidAmounts++;continue;}
  if(day<=today)expenses.push({source:row,day,amount});
 }
 for(const [index,row] of (data.goals||[]).entries()){
  if(row.owner_user_id)continue;
  if(!pen(row)){quality.excludedCurrency++;continue;}
  const start=dayNumber(row.period_start),end=dayNumber(row.period_end);
  if(start===null||end===null||end<start){quality.invalidDates++;continue;}
  goals.push({source:row,start,end,index});
 }
 goals.sort((a,b)=>(a.end-a.start)-(b.end-b.start)||String(b.source.updated_at||b.source.created_at||'').localeCompare(String(a.source.updated_at||a.source.created_at||''))||b.index-a.index);
 const totals=actuals(opportunities,expenses,start,today),totalPlan=planned(goals,start,end),toDate=planned(goals,start,today);
 quality.unknownCosts=totals.unknownCosts;quality.goalGaps=totalPlan.gaps;quality.overlappingGoals=totalPlan.overlaps;
 const targets={sales:totalPlan.sales,margin:totalPlan.margin,expenses:totalPlan.expenses,salesToDate:toDate.sales,marginToDate:toDate.margin,expensesToDate:toDate.expenses};
 const progress={salesPct:ratio(totals.sales,targets.salesToDate),marginPct:ratio(totals.grossMargin,targets.marginToDate),expensesPct:ratio(totals.expenses,targets.expensesToDate),periodSalesPct:ratio(totals.sales,targets.sales),salesVariance:difference(totals.sales,targets.salesToDate),marginVariance:difference(totals.grossMargin,targets.marginToDate),expensesVariance:difference(totals.expenses,targets.expensesToDate)};
 const firstMonth=key==='month'?month-5:key==='quarter'?Math.floor(month/3)*3:0;
 const count=key==='month'?6:key==='quarter'?3:12;
 const series=Array.from({length:count},(_,index)=>{
  const bucketStart=monthStart(year,firstMonth+index),bucketEnd=monthStart(year,firstMonth+index+1)-1;
  const isFuture=bucketStart>today,cutoff=Math.min(bucketEnd,today),target=planned(goals,bucketStart,bucketEnd),plan=isFuture?null:planned(goals,bucketStart,cutoff);
  const values=isFuture?{sales:null,directCosts:null,grossMargin:null,expenses:null,operatingResult:null,marginPercent:null,operatingMarginPercent:null,wonCount:null,unknownCosts:0}:actuals(opportunities,expenses,bucketStart,cutoff);
  return {key:iso(bucketStart).slice(0,7),label:monthLabel.format(new Date(bucketStart*DAY)),start:iso(bucketStart),end:iso(bucketEnd),cutoff:isFuture?null:iso(cutoff),isFuture,...values,targetSales:target.sales,targetMargin:target.margin,targetExpenses:target.expenses,plannedSales:plan?.sales??null,plannedMargin:plan?.margin??null,plannedExpenses:plan?.expenses??null};
 });
 const categories=new Map();
 for(const row of expenses.filter(row=>inRange(row,start,today))){const category=row.source.category||'Sin categoría';categories.set(category,(categories.get(category)||0)+row.amount);}
 const expenseCategories=[...categories].map(([category,amount])=>({category,amount:rounded(amount),sharePct:ratio(amount,totals.expenses)})).sort((a,b)=>b.amount-a.amount);
 // Daily cumulative sales use the selected period, independent of the six-month comparison chart.
 const dailySales=new Map();
 for(const row of opportunities.filter(row=>inRange(row,start,today)))dailySales.set(row.day,(dailySales.get(row.day)||0)+row.value);
 let accumulatedSales=0,accumulatedPlan=0,planMissing=false;
 const salesTimeline=Array.from({length:end-start+1},(_,index)=>{
  const date=start+index,isFuture=date>today;
  accumulatedSales+=dailySales.get(date)||0;
  const goal=goals.find(row=>row.start<=date&&row.end>=date&&number(row.source.target_won_value)!==null&&number(row.source.target_won_value)>=0);
  if(goal)accumulatedPlan+=number(goal.source.target_won_value)/(goal.end-goal.start+1);else planMissing=true;
  return {date:iso(date),sales:isFuture?null:rounded(accumulatedSales),plannedSales:planMissing?null:rounded(accumulatedPlan),isFuture};
 });
 return {period:{key,label:key==='month'?'Mes actual':key==='quarter'?'Trimestre actual':'Año actual',start:iso(start),end:iso(end),cutoff:iso(today),elapsedDays:today-start+1,totalDays:end-start+1},totals,targets,progress,series,salesTimeline,expenseCategories,quality,methodology:[
  'Corte por día calendario de Lima (UTC−5), incluyendo el día actual. Las fechas futuras no se contabilizan como realizadas.',
  'Ventas: oportunidades ganadas (WON) según su fecha de cierre prevista. No son cobros ni ingresos contables auditados.',
  'Costo directo: estimated_cost de cada cierre. Si falta un costo, margen bruto y resultado operativo completo quedan sin calcular.',
  'Margen bruto estimado = ventas − costos directos estimados. Resultado operativo estimado = margen bruto − gastos operativos registrados; no equivale a utilidad neta.',
  'Metas y presupuestos al corte: cuota diaria uniforme del objetivo completo por cada día calendario incluido. No modela estacionalidad dentro del mes.',
  'Se usan metas de la organización. Las de menor duración prevalecen; entre revisiones del mismo alcance se usa la más reciente. Cada campo se resuelve por separado sin duplicar importes.',
  'Sin cobertura completa de una meta se muestra sin meta; una meta de cero se conserva, aunque el porcentaje sobre cero no se calcula.',
  'Solo PEN; los registros sin moneda explícita usan PEN según el esquema existente. No se convierten ni suman otras monedas.'
 ]};
}

export function analyticsCSV(data,options={}){
 const m=analyticsMetrics(data,options);
 const columns=[['month','Mes'],['state','Estado del periodo'],['cutoff','Corte (Lima)'],['currency','Moneda'],['sales','Ventas ganadas'],['targetSales','Meta ventas mes completo'],['plannedSales','Meta ventas al corte'],['directCosts','Costos directos estimados'],['grossMargin','Margen bruto estimado'],['targetMargin','Meta margen bruto mes completo'],['plannedMargin','Meta margen bruto al corte'],['expenses','Gastos operativos'],['targetExpenses','Presupuesto gastos mes completo'],['plannedExpenses','Presupuesto gastos al corte'],['operatingResult','Resultado operativo estimado'],['marginPercent','Margen bruto (%)'],['operatingMarginPercent','Margen operativo (%)'],['unknownCosts','Cierres sin costo'],['origin','Origen']];
 const cell=value=>'"'+String(value??'').replace(typeof value==='number'?/$^/:/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
 const rows=m.series.map(row=>({...row,month:row.key,state:row.isFuture?'Futuro':row.cutoff<row.end?'Parcial al corte':'Mes completo',currency:'PEN',origin:options.demo?'DEMOSTRACIÓN':'DATOS REALES'}));
 return '\uFEFF'+[columns.map(([,label])=>cell(label)).join(','),...rows.map(row=>columns.map(([key])=>cell(row[key])).join(','))].join('\r\n');
}
