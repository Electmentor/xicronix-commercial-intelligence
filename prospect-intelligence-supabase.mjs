// DEV-only Prospect Intelligence Supabase adapter.
// The adapter refuses the production project ref by design.

const PROD_REF='qzfprdhmcaucqcdqgqiz';

function projectRef(url){
  try{return new URL(url).hostname.split('.')[0];}catch{return '';}
}

export function validateDevConfig(config){
  if(!config?.url||!config?.publishableKey)return {enabled:false,reason:'DEV_CONFIG_MISSING'};
  const ref=projectRef(config.url);
  if(!ref)return {enabled:false,reason:'DEV_URL_INVALID'};
  if(config.url!=='https://rmximatxuaczhpqbcuho.supabase.co')throw new Error('Prospect Intelligence solo admite CRM DEV.');
  return {enabled:true,ref};
}

export function createPiRepository(supabaseFactory,config){
  const validation=validateDevConfig(config);
  if(!validation.enabled)return null;
  const client=supabaseFactory.createClient(config.url,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});

  return {
    validation,
    client,
    async saveCase(values,id){
      const context=await this.currentContext();
      if(!context?.profile)throw new Error('Inicia sesión en CRM DEV.');
      let query;
      if(id)query=client.from('pi_cases').update({...values,updated_at:new Date().toISOString()}).eq('id',id).eq('organization_id',context.profile.organization_id);
      else query=client.from('pi_cases').insert({...values,organization_id:context.profile.organization_id,created_by:context.session.user.id});
      const {data,error}=await query.select().single();if(error)throw error;return data;
    },
    async addObservation(table,caseId,values){
      if(!['pi_signals','pi_evidence'].includes(table))throw new Error('Registro no permitido');
      const context=await this.currentContext();
      if(!context?.profile)throw new Error('Inicia sesión en CRM DEV.');
      const {data,error}=await client.from(table).insert({...values,case_id:caseId,organization_id:context.profile.organization_id,created_by:context.session.user.id}).select().single();
      if(error)throw error;return data;
    },
    async currentContext(){
      const {data:{session},error:sessionError}=await client.auth.getSession();
      if(sessionError)throw sessionError;
      if(!session?.user?.id)return null;
      const {data:profile,error:profileError}=await client.from('profiles').select('id,organization_id,full_name,role').eq('id',session.user.id).maybeSingle();
      if(profileError)throw profileError;
      if(!profile?.organization_id)return {session,profile:null};
      return {session,profile};
    },
    async crmSnapshot(organizationId){
      const [institutions,leads,opportunities]=await Promise.all([
        client.from('institutions').select('id,name,ruc,website').eq('organization_id',organizationId),
        client.from('leads').select('id,organization_id,institution_id,status,title').eq('organization_id',organizationId),
        client.from('opportunities').select('id,organization_id,institution_id,stage,name').eq('organization_id',organizationId)
      ]);
      for(const result of [institutions,leads,opportunities])if(result.error)throw result.error;
      return {organizations:institutions.data||[],leads:(leads.data||[]).map(row=>({...row,organization_id:row.institution_id})),opportunities:(opportunities.data||[]).map(row=>({...row,organization_id:row.institution_id}))};
    },
    async listCases(organizationId){
      const {data,error}=await client.from('pi_cases').select('*').eq('organization_id',organizationId).order('updated_at',{ascending:false});
      if(error)throw error;
      return data||[];
    },
    async listSignals(caseId){
      const {data,error}=await client.from('pi_signals').select('*').eq('case_id',caseId).order('observed_at',{ascending:false});
      if(error)throw error;
      return data||[];
    },
    async listEvidence(caseId){
      const {data,error}=await client.from('pi_evidence').select('*').eq('case_id',caseId).order('created_at',{ascending:false});
      if(error)throw error;
      return data||[];
    },
    async readiness(caseId){
      const {data,error}=await client.rpc('pi_readiness',{target_case:caseId});
      if(error)throw error;
      return data;
    },
    async prepareTransfer(caseId){
      const {data,error}=await client.rpc('pi_prepare_transfer',{target_case:caseId});
      if(error)throw error;
      return data;
    },
    async transition(caseId,state){
      const {data,error}=await client.rpc('pi_transition_case',{target_case:caseId,target_state:state});
      if(error)throw error;
      return data;
    },
    async executeTransfer(transferId){
      const {data,error}=await client.rpc('pi_execute_transfer',{target_transfer:transferId});
      if(error)throw error;
      return data;
    }
  };
}
