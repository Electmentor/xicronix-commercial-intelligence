// Entirely fictional sandbox. No auth accounts, network requests or production writes.
export const DEMO_VERSION = 1;
export const DEMO_SELLERS = [
 {id:'demo-seller-1',full_name:'Valeria Torres',role:'SALES'},
 {id:'demo-seller-2',full_name:'Diego Salazar',role:'SALES'},
 {id:'demo-seller-3',full_name:'Camila Ríos',role:'SALES'},
 {id:'demo-seller-4',full_name:'Mateo Vargas',role:'SALES'},
 {id:'demo-seller-5',full_name:'Lucía Paredes',role:'SALES'}
];
export const localDay = date => [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
export function monthRange(now=new Date()){
 return {start:localDay(new Date(now.getFullYear(),now.getMonth(),1)),end:localDay(new Date(now.getFullYear(),now.getMonth()+1,0))};
}
export function createDemoData(org,now=new Date()){
 const period=monthRange(now),stamp=now.toISOString();
 const day=(offset,hour=10)=>{const date=new Date(now);date.setDate(date.getDate()+offset);date.setHours(hour,0,0,0);return date.toISOString();};
 const base=(id,owner='demo-seller-1')=>({id,organization_id:org,created_by:owner,created_at:day(-25),updated_at:stamp,is_simulated:true,notes:'[SIMULADO] Caso ficticio para explorar el sistema. No representa ventas, personas ni pagos reales.'});
 const sectors=['Universidad Aurora','Colegio Horizonte','Instituto Nova','Centro Andino de Investigación','Clínica Boreal','Universidad del Pacífico Sur','Colegio Arquímedes','Instituto TecnoSur','Laboratorio Prisma','Hospital Nueva Vida','Universidad Altamira','Colegio Robótica','Instituto Vector','Centro Científico Delta','Clínica Meridiano','Universidad Lumen','Colegio Galileo','Instituto Futura','Centro de Innovación Quasar','Hospital Horizonte'];
 const offerings=['Laboratorio de física','Aula STEM','Analítica e IA','Laboratorio de química','Equipamiento de investigación','Automatización de procesos'];
 const data={institutions:[],contacts:[],leads:[],opportunities:[],tasks:[],activities:[],scores:[],users:[],goals:[]};
 data.users=DEMO_SELLERS.map(user=>({...base(user.id,user.id),...user}));
 data.institutions=sectors.map((name,index)=>({...base('demo-institution-'+index,DEMO_SELLERS[index%5].id),name:name+' [SIMULADO]',type:['UNIVERSITY','SCHOOL','INSTITUTE','RESEARCH_CENTER','CLINIC'][index%5],city:['Lima','Arequipa','Trujillo','Cusco'][index%4],country:'Perú',email:'institucion'+index+'@example.invalid',website:'https://example.invalid'}));
 data.contacts=Array.from({length:30},(_,index)=>({...base('demo-contact-'+index,DEMO_SELLERS[index%5].id),first_name:['Marina','Álvaro','Sofía','Nicolás','Elena'][index%5],last_name:'Contacto demo '+(index+1),institution_id:data.institutions[index%20].id,job_title:['Dirección académica','Jefatura de laboratorio','Gerencia de innovación'][index%3],decision_level:index%3?'DECISION_MAKER':'INFLUENCER',email:'contacto'+index+'@example.invalid'}));
 data.leads=Array.from({length:40},(_,index)=>{
  const owner=DEMO_SELLERS[index%5].id,contact=data.contacts[index%30],institution=data.institutions.find(row=>row.id===contact.institution_id);
  return {...base('demo-lead-'+index,owner),owner_user_id:owner,title:offerings[index%6]+' · '+institution.name,institution_id:institution.id,contact_id:contact.id,source:['Referido','Evento STEM','Consulta web','Prospección'][index%4],status:['NEW','RESEARCHING','CONTACTED','QUALIFIED','CONTACT_PENDING','CONVERTED','DISQUALIFIED','QUALIFIED'][index%8],score:45+index%10*5,estimated_value:25000+index*3500,next_action:index%7===0?'':['Confirmar presupuesto','Agendar demostración','Validar decisor','Enviar propuesta'][index%4],next_action_date:index%7===0?null:day(index%10-3)};
 });
 const stages=['WON','WON','PROPOSAL','NEGOTIATION','QUALIFIED','CONTACTED','OPPORTUNITY','LOST','PROPOSAL','DETECTED','CONTACT_PENDING','NEGOTIATION'];
 data.opportunities=Array.from({length:30},(_,index)=>{
  const lead=data.leads[index],value=[185000,124000,76000,96000,142000,54000,82000,45000,116000,69000][index%10];
  const stage=stages[index%12],cost=index===22?null:Math.round(value*(index===3?1.06:index===11?.92:.56+(index%5)*.035));
  const close=stage==='WON'?localDay(new Date(now.getFullYear(),now.getMonth(),Math.max(1,now.getDate()-(index%5)))):localDay(new Date(now.getFullYear(),now.getMonth(),Math.min(28,now.getDate()+index%18)));
  return {...base('demo-opportunity-'+index,lead.owner_user_id),owner_user_id:lead.owner_user_id,lead_id:lead.id,institution_id:lead.institution_id,contact_id:lead.contact_id,name:lead.title,stage,value,estimated_cost:cost,probability:stage==='WON'?100:stage==='LOST'?0:stage==='NEGOTIATION'?85:stage==='PROPOSAL'?60:30,expected_close_date:close,next_action:['Revisar alcance con compras','Confirmar aprobación del decisor','Negociar sin erosionar margen'][index%3],next_action_date:day(index%9-4)};
 });
 data.tasks=Array.from({length:50},(_,index)=>{
  const lead=data.leads[index%40];
  return {...base('demo-task-'+index,lead.owner_user_id),assigned_to:lead.owner_user_id,lead_id:lead.id,institution_id:lead.institution_id,contact_id:lead.contact_id,title:['Llamar al decisor','Enviar propuesta técnica','Validar presupuesto','Preparar demostración','Actualizar costos'][index%5]+' · caso '+(index+1),status:index%4===0?'COMPLETED':index%4===1?'IN_PROGRESS':'PENDING',priority:['HIGH','MEDIUM','LOW','CRITICAL'][index%4],due_at:day(index%12-4)};
 });
 data.activities=Array.from({length:80},(_,index)=>{
  const lead=data.leads[index%40];
  return {...base('demo-activity-'+index,lead.owner_user_id),lead_id:lead.id,institution_id:lead.institution_id,contact_id:lead.contact_id,type:['CALL','MEETING','EMAIL','DEMO','FOLLOW_UP'][index%5],subject:['Necesidad validada','Reunión con decisor','Propuesta remitida','Demostración realizada','Seguimiento comercial'][index%5],outcome:['INTERESTED','QUALIFIED','FOLLOW_UP','NO_RESPONSE'][index%4],need_summary:'Modernizar capacidades de ciencia y tecnología; alcance inicial identificado.',budget_signal:index%3?'Presupuesto en evaluación':'Rango confirmado por el contacto',decision_timeline:'Este trimestre',occurred_at:day(-index%14,index%8+8),next_action:lead.next_action,next_action_date:lead.next_action_date};
 });
 data.goals=[{...base('demo-goal-org'),owner_user_id:null,period_start:period.start,period_end:period.end,target_won_value:1000000,target_margin:380000},
 ...DEMO_SELLERS.map((user,index)=>({...base('demo-goal-'+index,user.id),owner_user_id:user.id,period_start:period.start,period_end:period.end,target_won_value:[260000,220000,160000,200000,160000][index],target_margin:[100000,80000,60000,80000,60000][index]}))];
 refreshDemoScores(data,now);
 return data;
}
export function refreshDemoScores(data,now=new Date()){
 data.scores=data.leads.map(lead=>{
  const interactions=data.activities.filter(row=>row.lead_id===lead.id);
  const latest=interactions.slice().sort((a,b)=>String(b.occurred_at).localeCompare(String(a.occurred_at)))[0];
  const score=Math.min(100,(lead.institution_id?15:0)+(lead.contact_id?15:0)+(lead.next_action?10:0)+(lead.next_action_date?10:0)+(latest?.need_summary?20:0)+(latest?.budget_signal?15:0)+(latest?.outcome==='QUALIFIED'?15:latest?.outcome==='INTERESTED'?10:0));
  return {id:'demo-score-'+lead.id,organization_id:lead.organization_id,lead_id:lead.id,is_simulated:true,total_score:score,calculated_at:now.toISOString(),recommendation_source:'DEMO_RULES_V1',recommendation:!lead.next_action?'Definir una próxima acción y fecha.':score>=75?'Priorizar contacto con el decisor y validar presupuesto.':'Completar la necesidad y confirmar el interés antes de preparar una propuesta.'};
 });
}
export function mutateDemo(data,table,operation,payload,{id,userId,org,now=new Date()}){
 if(!Array.isArray(data[table])||table==='scores')throw Error('Módulo demo no válido');
 if(operation==='delete'){
  for(const [other,fields] of Object.entries({contacts:['institution_id'],leads:['institution_id','contact_id','owner_user_id'],opportunities:['institution_id','contact_id','lead_id','owner_user_id'],tasks:['institution_id','contact_id','lead_id','opportunity_id','assigned_to'],activities:['institution_id','contact_id','lead_id','opportunity_id'],goals:['owner_user_id']})){
   if(data[other].some(row=>fields.some(field=>row[field]===id)))throw Error('El caso tiene registros vinculados. Reasígnalos antes de eliminarlo.');
  }
  data[table]=data[table].filter(row=>row.id!==id);
 }else{
  const stamp=now.toISOString();
  if(id){
   const row=data[table].find(row=>row.id===id);if(!row)throw Error('Registro demo no disponible');
   Object.assign(row,payload,{id,organization_id:org,updated_at:stamp,is_simulated:true});
  }else{
   const rows=Array.isArray(payload)?payload:[payload];
   for(const row of rows)data[table].unshift({...row,id:'demo-new-'+Date.now()+'-'+data[table].length,organization_id:org,created_by:userId,created_at:stamp,updated_at:stamp,is_simulated:true});
  }
 }
 refreshDemoScores(data,now);
 return data;
}
export function isSimulated(row){
 return row.is_simulated===true||['name','title','subject','notes','full_name'].some(key=>/\[SIMULADO\]/i.test(row[key]||''));
}
export function realOnly(source){
 const result=Object.fromEntries(Object.entries(source).map(([key,rows])=>[key,rows.filter(row=>!isSimulated(row))]));
 const removed=new Set(Object.entries(source).flatMap(([key,rows])=>rows.filter(row=>!result[key].includes(row)).map(row=>row.id)));
 for(const key of Object.keys(result))result[key]=result[key].filter(row=>!['institution_id','contact_id','lead_id','opportunity_id','owner_user_id','assigned_to'].some(field=>removed.has(row[field])));
 return result;
}

