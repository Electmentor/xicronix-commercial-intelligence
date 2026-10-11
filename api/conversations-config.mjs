import {enabled} from '../conversations-store.mjs';
export function createHandler(env=process.env){return async()=>{
 const key=env.CONVERSATIONS_PUBLIC_KEY||'';
 let isPublic=key.startsWith('sb_publishable_');
 if(!isPublic){try{isPublic=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role==='anon';}catch{}}
 if(!enabled(env)||!isPublic)return Response.json({ok:false,error:'dev_unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
 return Response.json({ok:true,url:env.CONVERSATIONS_SUPABASE_URL,key,recoveryRedirectUrl:'https://xicronix-commercial-intelligence-git-work-a009-116bc1-xicronix.vercel.app/'},{headers:{'Cache-Control':'no-store'}});
};}
export default {fetch:createHandler()};
