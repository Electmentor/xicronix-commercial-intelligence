import test from 'node:test';
import assert from 'node:assert/strict';
import {renderAnalytics} from '../analytics-view.mjs';
const now=new Date('2026-09-09T15:00:00Z');
const data={opportunities:[
 {stage:'WON',expected_close_date:'2026-08-31',value:9000000,estimated_cost:100},
 {stage:'WON',expected_close_date:'2026-09-01',value:100,estimated_cost:30},
 {stage:'WON',expected_close_date:'2026-09-09',value:50,estimated_cost:20},
 {stage:'WON',expected_close_date:'2026-09-10',value:9000000,estimated_cost:100}
],expenses:[],goals:[{owner_user_id:null,period_start:'2026-09-01',period_end:'2026-09-30',target_won_value:3000,target_margin:1500,target_expenses:300}]};

test('month sales graph excludes the six-month history and keeps actual and target geometry within its viewport',()=>{
 const html=renderAnalytics(data,{now,period:'month'});
 const svg=html.match(/<svg class="analytics-sales-svg"[\s\S]*?<\/svg>/)?.[0];assert.ok(svg);
 assert.doesNotMatch(svg,/NaN|Infinity/);
 const paths=[...svg.matchAll(/<path class="analytics-(?:sales-line|target-line[^"]*)" d="([^"]+)"/g)];assert.equal(paths.length,3);
 for(const [,path] of paths)for(const [,x,y] of path.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)){
  assert.ok(Number(x)>=76&&Number(x)<=577,'x stays within current period: '+x);
  assert.ok(Number(y)>=28&&Number(y)<=272,'y stays within the plotted scale: '+y);
 }
 const circles=[...svg.matchAll(/<circle class="analytics-sales-point"[^>]*>/g)].map(match=>match[0]);
 assert.equal(circles.length,2,'only September 1 and 9 create sale milestones');
 assert.ok(circles.at(-1).includes('ventas acumuladas S/ 150'));
 const cutoff=Number(svg.match(/class="analytics-cutoff-line" x1="([\d.]+)"/)[1]);
 assert.ok(circles.every(circle=>Number(circle.match(/cx="([\d.]+)"/)[1])<=cutoff));
 assert.ok(paths.some(([,path])=>path.includes('L577,')),'future plan reaches the end of September');
});

test('daily sales graph handles an empty first day, missing goals, and a period end without invalid geometry',()=>{
 for(const timestamp of ['2026-09-01T15:00:00Z','2026-09-30T15:00:00Z']){
  const html=renderAnalytics({opportunities:[],expenses:[],goals:[]},{now:new Date(timestamp),period:'month'});
  const svg=html.match(/<svg class="analytics-sales-svg"[\s\S]*?<\/svg>/)[0];
  assert.doesNotMatch(svg,/NaN|Infinity/);assert.match(svg,/analytics-sales-line/);
  assert.doesNotMatch(svg,/<path class="analytics-target-line/);
 }
});
