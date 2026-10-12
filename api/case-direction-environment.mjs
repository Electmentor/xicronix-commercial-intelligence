import {DEV_CRM,DIRECTION_DEV_BRANCH} from '../crm-environment.mjs';
export function environmentConfig(env){return env.VERCEL_ENV==='preview'&&env.VERCEL_GIT_COMMIT_REF===DIRECTION_DEV_BRANCH?DEV_CRM:null;}
export default function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 const config=environmentConfig(process.env);
 if(req.method!=='GET')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 if(!config)return res.status(503).json({error:'DEV_ENVIRONMENT_NOT_CONFIGURED'});
 return res.status(200).json(config);
}
