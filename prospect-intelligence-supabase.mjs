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
  if(ref===PROD_REF)throw new Error('Prospect Intelligence DEV refuses the production Supabase project.');
  return {enabled:true,ref};
}

export function createPiRepository(supabaseFactory,config){
  const validation=validateDevConfig(config);
  if(!validation.enabled)return null;
  const client=supabaseFactory.createClient(config.url,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});

  return {
    validation,
    client,
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
    async executeTransfer(transferId){
      const {data,error}=await client.rpc('pi_execute_transfer',{target_transfer:transferId});
      if(error)throw error;
      return data;
    }
  };
}
