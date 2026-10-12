// UI-only fixture. Does not authenticate or call a real database/provider.
(()=>{
 const db=window.__testDB,org=db.profiles[0].organization_id,user=db.profiles[0].id;
 db.leads=db.leads.slice(0,1);db.leads[0].title='SINTÉTICO · laboratorio escolar';db.leads[0].owner_user_id=null;db.leads[0].next_action=null;db.leads[0].next_action_date=null;
 db.tasks=[];db.commercial_mail_inbox=[];
 db.activities=[{id:'request',organization_id:org,lead_id:db.leads[0].id,type:'WEB_FORM',notes:'Requerimiento original: Equipar un laboratorio escolar de física.',occurred_at:'2026-10-12T10:00:00Z'}];
 for(const key of ['crm_case_direction','crm_case_requests','crm_case_decisions','crm_case_approval_rules'])db[key]=[];
 window.__directionTest={calls:[],mode:'success'};
 const original=window.supabase.createClient;
 window.supabase.createClient=(...args)=>{const client=original(...args);const rpc=client.rpc.bind(client);client.rpc=async(name,command)=>{
  if(name!=='crm_case_command')return rpc(name,command);
  const t=window.__directionTest;t.calls.push(structuredClone(command));await new Promise(resolve=>setTimeout(resolve,120));
  if(t.mode==='network')throw Error('Synthetic network failure');
  if(t.mode==='conflict')return {data:null,error:{message:'CASE_CONFLICT',code:'40001'}};
  if(t.mode==='denied')return {data:null,error:{message:'CASE_DIRECTION_REQUIRED',code:'42501'}};
  const prior=db.crm_case_decisions.find(e=>e.id===command.p_command_id);if(prior)return {data:prior.result,error:null};
  const l=db.leads.find(l=>l.id===command.p_lead_id),stamp=new Date().toISOString();
  let s=db.crm_case_direction.find(s=>s.lead_id===l.id);if(!s){s={lead_id:l.id,organization_id:org,revision:0,lifecycle:'PENDING',priority:'MEDIUM'};db.crm_case_direction.push(s);}
  if(command.p_action==='PRIORITIZE')s.priority=command.p_payload.priority;
  if(command.p_action==='ASSIGN')l.owner_user_id=command.p_payload.owner_id;
  if(command.p_payload.next_action){l.next_action=command.p_payload.next_action;l.next_action_date=command.p_payload.due_at;db.tasks=[{id:'execution',organization_id:org,lead_id:l.id,title:l.next_action,due_at:l.next_action_date,assigned_to:command.p_payload.owner_id,status:'PENDING'}];}
  s.revision++;s.updated_at=stamp;l.updated_at=stamp;
  const result={command_id:command.p_command_id,revision:s.revision,lead_id:l.id};
  db.crm_case_decisions.push({id:command.p_command_id,organization_id:org,lead_id:l.id,actor_id:user,action:command.p_action,reason:command.p_reason,created_at:stamp,before_value:{},after_value:{priority:s.priority,owner_user_id:l.owner_user_id},result});
  return {data:result,error:null};
 };return client;};
})();
