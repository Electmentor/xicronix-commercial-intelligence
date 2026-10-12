export const DIRECTION_DEV_BRANCH='work/mis-casos-direccion-20261012';
export const PROD_CRM={url:'https://qzfprdhmcaucqcdqgqiz.supabase.co',key:'sb_publishable_WzxQ2iPXjy4IMx4iYOAVqA_U6i8kpFK',storageKey:'xicronix.crm.auth',environment:'production'};
export const DEV_CRM={url:'https://rmximatxuaczhpqbcuho.supabase.co',key:'sb_publishable_pqqyMTcBovUi4sbp2Cn6yw_sL0_Xs__',storageKey:'xicronix.crm.dev.auth',environment:'dev'};
// Exact production host retains the established client. Preview never falls back to production.
export async function crmClientConfig(hostname,{fetcher=fetch}={}){
 if(['xicronix-commercial-intelligence.vercel.app','xicronix-commercial-intelligence-xicronix.vercel.app','xicronix-commercial-intelligence-git-main-xicronix.vercel.app'].includes(hostname))return PROD_CRM;
 if(['localhost','127.0.0.1'].includes(hostname))return DEV_CRM;
 const r=await fetcher('/api/case-direction-environment',{cache:'no-store'});
 if(!r.ok)throw new Error('El entorno de pruebas no está configurado. Acceso detenido para evitar mezclar DEV y producción.');
 const config=await r.json();if(config.environment!=='dev'||config.url!==DEV_CRM.url||config.key!==DEV_CRM.key||config.storageKey!==DEV_CRM.storageKey)throw new Error('Configuración DEV no verificada.');
 return config;
}
