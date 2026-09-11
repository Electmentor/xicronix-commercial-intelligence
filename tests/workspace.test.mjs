import test from 'node:test';
import assert from 'node:assert/strict';
import {effectiveWorkspace,workspaceKey,canAccessPage,canWriteModule,scopeWorkspaceData} from '../workspace.mjs';
const admin={role:'ADMIN',organization_id:'org'};
test('only a real ADMIN account can select the administrative experience',()=>{
 assert.equal(effectiveWorkspace(admin,'admin'),'admin');
 for(const role of ['SALES','MANAGER','VIEWER','UNKNOWN']){
  const profile={...admin,role};
  assert.equal(effectiveWorkspace(profile,'admin'),'seller');
  for(const page of ['dashboard','users','goals'])assert.equal(canAccessPage(profile,'admin',page),false);
 }
 assert.equal(canAccessPage(null,'admin','leads'),false);
});
test('seller mode hides administrative modules even for an ADMIN account',()=>{
 for(const page of ['dashboard','users','goals'])assert.equal(canAccessPage(admin,'seller',page),false);
 assert.equal(canWriteModule(admin,'seller','leads'),true);
 assert.equal(canWriteModule({...admin,role:'VIEWER'},'seller','leads'),false);
 assert.equal(canAccessPage(admin,'admin','unknown'),false);
});
test('preferences have separate keys for each user and organization',()=>{
 assert.notEqual(workspaceKey('a','org'),workspaceKey('b','org'));
 assert.notEqual(workspaceKey('a','org'),workspaceKey('a','other'));
});
test('seller scoping keeps assigned records, their links and no management data',()=>{
 const row=(id,extra={})=>({id,organization_id:'org',created_by:'other',...extra});
 const source={
  leads:[row('mine',{owner_user_id:'me',institution_id:'i',contact_id:'c'}),row('other',{owner_user_id:'other',created_by:'me'}),row('fallback',{created_by:'me'}),row('alien',{organization_id:'another',owner_user_id:'me'})],
  opportunities:[row('deal',{owner_user_id:'me',estimated_cost:123}),row('other-deal')],
  tasks:[row('task',{assigned_to:'me'}),row('assigned-away',{created_by:'me',assigned_to:'other'})],
  activities:[row('activity',{lead_id:'mine'}),row('private',{lead_id:'other',created_by:'me'})],
  scores:[row('score',{lead_id:'mine'}),row('other-score',{lead_id:'other'})],
  institutions:[row('i'),row('other-i'),row('created',{created_by:'me'})],
  contacts:[row('c'),row('other-c')],
  users:[row('member')],goals:[row('goal')]
 };
 const result=scopeWorkspaceData(source,admin,'me','seller');
 assert.deepEqual(result.leads.map(row=>row.id),['mine','fallback']);
 assert.deepEqual(result.tasks.map(row=>row.id),['task']);
 assert.deepEqual(result.activities.map(row=>row.id),['activity']);
 assert.deepEqual(result.contacts.map(row=>row.id),['c']);
 assert.deepEqual(result.institutions.map(row=>row.id),['i','created']);
 assert.equal(result.scores.length,1);
 assert.equal(result.opportunities[0].estimated_cost,undefined);
 assert.equal(source.opportunities[0].estimated_cost,123,'input must not be mutated');
 assert.deepEqual(result.users,[]);assert.deepEqual(result.goals,[]);
 assert.equal(scopeWorkspaceData(source,admin,'me','admin').leads.length,3);
 assert.equal(scopeWorkspaceData(source,null,'me','admin').leads.length,0);
});

