import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export const IDs={org:'00000000-0000-4000-8000-000000000001',other:'00000000-0000-4000-8000-000000000002',contact:'00000000-0000-4000-8000-000000000003',owner:'00000000-0000-4000-8000-000000000004',seller:'00000000-0000-4000-8000-000000000005',alien:'00000000-0000-4000-8000-000000000006'};
export async function createFixture(){
 // npm ci provides the pinned runtime; an explicit external path remains useful for isolated tooling.
 const {PGlite}=await import(process.env.PGLITE_MODULE?pathToFileURL(resolve(process.env.PGLITE_MODULE)).href:'@electric-sql/pglite');
 const directory=await mkdtemp(join(tmpdir(),'a009-conversations-'));
 let db=new PGlite(directory);
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema public,auth to authenticated,service_role;
 create table organizations(id uuid primary key);
 create table profiles(id uuid primary key,organization_id uuid references organizations,role text);
 create table contacts(id uuid primary key,organization_id uuid references organizations);
 create table opportunities(id uuid primary key,organization_id uuid references organizations);
 grant select on profiles,contacts,opportunities to authenticated,service_role;
 insert into organizations values('${IDs.org}'),('${IDs.other}');
 insert into profiles values('${IDs.owner}','${IDs.org}','ADMIN'),('${IDs.seller}','${IDs.org}','SALES'),('${IDs.alien}','${IDs.other}','ADMIN');
 insert into contacts values('${IDs.contact}','${IDs.org}');`);
 const migration=await readFile(new URL('../../supabase/migrations/20261008143001_conversations_dev.sql',import.meta.url),'utf8');
 // Serialized queue only for the local PGlite connection; remote PostgreSQL concurrency is a separate gate.
 let chain=Promise.resolve();
 const serial=fn=>{const p=chain.then(fn);chain=p.catch(()=>{});return p;};
 const fixture={
  get db(){return db;},directory,migration,
  async migrate(){await db.exec("set app.conversations_environment='dev'");await db.exec(migration);},
  async reopen(){await db.close();db=new PGlite(directory);},
  async dispose(){await db.close();await rm(directory,{recursive:true,force:true});},
  store:{
   async authenticate(token){return ({admin:{id:IDs.owner,organization_id:IDs.org,role:'ADMIN'},seller:{id:IDs.seller,organization_id:IDs.org,role:'SALES'},alien:{id:IDs.alien,organization_id:IDs.other,role:'ADMIN'}})[token]||null;},
   async list(token){return serial(async()=>{await identity(token);return (await db.query('select * from commercial_conversations order by updated_at desc')).rows;});},
   async detail(token,id){return serial(async()=>{await identity(token);const c=(await db.query('select * from commercial_conversations where id=$1',[id])).rows[0];if(!c)throw Error('not_found');return {conversation:c,messages:(await db.query('select * from commercial_messages where conversation_id=$1 order by occurred_at,id',[id])).rows,events:(await db.query('select * from commercial_conversation_events where conversation_id=$1 order by occurred_at,id',[id])).rows};});},
   command(org,actor,action,data){return serial(async()=>{await db.exec('set role service_role');return (await db.query('select conversation_command($1,$2,$3,$4) as result',[org,actor,action,JSON.stringify(data)])).rows[0].result;});},
   bridge(org,contact,thread,ack=null){return serial(async()=>{await db.exec('set role service_role');return (await db.query('select conversation_bridge($1,$2,$3,$4) as result',[org,contact,thread,ack])).rows[0].result;});}
  }
 };
 async function identity(token){const p=await fixture.store.authenticate(token);if(!p)throw Error('forbidden');await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[p.id]);}
 return fixture;
}
