import assert from 'node:assert/strict';
import {
  dimensionScore,confidenceScore,resolveDuplicate,evaluateReadiness,
  createTransferEnvelope,canTransition,transitionProspect
} from '../prospect-intelligence-domain.mjs';

const prospect={
  id:'p1',state:'PRIORITIZED',
  organization:{name:'Colegio Alpha',website:'https://alpha.example'},
  hypothesis:'Necesidad plausible de modernización STEM.',
  dimensions:{F:5,N:4,C:3,T:4,A:3,E:4},
  evidence:[
    {type:'FACT',source:'Fuente A',url:'https://a.example',note:'Hecho verificable'},
    {type:'CONFIRMATION',source:'Fuente B',url:'https://b.example',note:'Confirmación independiente'}
  ],
  signals:[{label:'Señal',isNew:true}],
  decisionMakers:['Dirección'],
  missingData:[],
  nextAction:'Contactar al decisor técnico.'
};

assert.ok(dimensionScore(prospect)>=60);
assert.ok(confidenceScore(prospect)>=60);
assert.equal(canTransition('PRIORITIZED','READY_FOR_CRM'),true);
assert.equal(canTransition('DETECTED','TRANSFERRED'),false);

const duplicate=resolveDuplicate(prospect,{organizations:[],leads:[],opportunities:[]});
assert.equal(duplicate.action,'CREATE_ORG_AND_LEAD');

const gate=evaluateReadiness(prospect,duplicate);
assert.equal(gate.ready,true);

const envelope=createTransferEnvelope(prospect,duplicate);
assert.equal(envelope.contract_version,'pi-crm-v0.1');
assert.equal(envelope.duplicate_resolution.action,'CREATE_ORG_AND_LEAD');
assert.equal(envelope.organization_identity.name,'Colegio Alpha');

const next=transitionProspect(prospect,'READY_FOR_CRM');
assert.equal(next.state,'READY_FOR_CRM');

const existingOrg={id:'org1',name:'Colegio Alpha',website:'https://alpha.example'};
const duplicateLead=resolveDuplicate(prospect,{
  organizations:[existingOrg],
  leads:[{id:'lead1',organization_id:'org1',status:'RESEARCHING'}],
  opportunities:[]
});
assert.equal(duplicateLead.action,'ENRICH_EXISTING_LEAD');

const blocked={...prospect,evidence:[{type:'CONTRADICTION',critical:true,source:'Fuente',url:'https://x.example',note:'Contradicción crítica'}]};
assert.equal(evaluateReadiness(blocked,duplicate).ready,false);

console.log('Prospect Intelligence domain tests: OK');
