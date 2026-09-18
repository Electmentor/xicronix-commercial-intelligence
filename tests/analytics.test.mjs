import test from 'node:test';
import assert from 'node:assert/strict';
import {analyticsMetrics,analyticsCSV,businessDay,businessMonthRange} from '../analytics.mjs';
import {createDemoData,upgradeDemoData,DEMO_VERSION} from '../demo.mjs';
import {parseCsv} from '../domain.mjs';
const now=new Date('2026-09-09T15:00:00Z');
const won=(date,value,cost=0,extra={})=>({stage:'WON',expected_close_date:date,value,estimated_cost:cost,...extra});
const expense=(date,amount,extra={})=>({expense_date:date,amount,category:'TECHNOLOGY',currency:'PEN',...extra});
const goal=(start,end,sales,margin,expenses,extra={})=>({owner_user_id:null,period_start:start,period_end:end,target_won_value:sales,target_margin:margin,target_expenses:expenses,...extra});
const base=()=>({opportunities:[],expenses:[],goals:[]});

test('inclusive calendar pace separates full-month goal, gross margin, and operating result',()=>{
 const data={opportunities:[won('2026-09-01',1000,400),won('2026-09-09',500,300)],expenses:[expense('2026-09-01',350)],goals:[goal('2026-09-01','2026-09-30',3000,1500,600)]};
 const m=analyticsMetrics(data,{now,period:'month'});
 assert.deepEqual(m.totals,{sales:1500,directCosts:700,grossMargin:800,expenses:350,operatingResult:450,marginPercent:53.33,operatingMarginPercent:30,wonCount:2,unknownCosts:0});
 assert.deepEqual(m.targets,{sales:3000,margin:1500,expenses:600,salesToDate:900,marginToDate:450,expensesToDate:180});
 assert.equal(m.progress.salesPct,166.67);assert.equal(m.progress.periodSalesPct,50);
 assert.equal(m.progress.expensesPct,194.44);assert.equal(m.progress.expensesVariance,170);
 assert.equal(m.period.elapsedDays,9);assert.equal(m.period.totalDays,30);
});

test('missing cost prevents a complete profit estimate while explicit zero cost stays valid',()=>{
 const data={...base(),opportunities:[won('2026-09-01',1000,null),won('2026-09-02',200,0)],expenses:[expense('2026-09-01',300)]};
 const m=analyticsMetrics(data,{now,period:'month'});
 assert.equal(m.totals.sales,1200);assert.equal(m.totals.unknownCosts,1);
 for(const key of ['directCosts','grossMargin','operatingResult','marginPercent','operatingMarginPercent'])assert.equal(m.totals[key],null,key);
 assert.equal(m.series.at(-1).operatingResult,null);
 data.opportunities[0].estimated_cost=0;
 assert.equal(analyticsMetrics(data,{now,period:'month'}).totals.operatingResult,900);
});

test('zero goals remain distinct from missing goals and never divide by zero',()=>{
 const data=base();let m=analyticsMetrics(data,{now,period:'month'});
 assert.equal(m.targets.sales,null);assert.equal(m.progress.salesPct,null);assert.equal(m.quality.goalGaps.sales,30);
 data.goals=[goal('2026-09-01','2026-09-30',0,0,0)];
 m=analyticsMetrics(data,{now,period:'month'});
 assert.equal(m.targets.sales,0);assert.equal(m.targets.salesToDate,0);assert.equal(m.targets.expenses,0);
 assert.equal(m.progress.salesPct,null);assert.equal(m.progress.expensesPct,null);assert.equal(m.quality.goalGaps.sales,0);
 data.goals[0].target_margin=null;
 assert.equal(analyticsMetrics(data,{now,period:'month'}).targets.margin,null);
});

test('only PEN won sales and recorded expenses through the cutoff contribute',()=>{
 const data={opportunities:[won('2026-09-09',100,50),won('2026-09-10',999,0),won('2026-09-08',888,0,{currency:'USD'}),won('2026-09-07',777,0,{stage:'LOST'}),won('2026-09-06',666,0,{stage:'NEGOTIATION'}),won('2026-02-30',777,0),won('2026-09-07',null,0)],expenses:[expense('2026-09-09',20),expense('2026-09-10',500),expense('2026-09-08',400,{currency:'USD'})],goals:[]};
 const m=analyticsMetrics(data,{now,period:'year'});
 assert.equal(m.totals.sales,100);assert.equal(m.totals.expenses,20);assert.equal(m.totals.operatingResult,30);
 assert.equal(m.quality.excludedCurrency,2);assert.equal(m.quality.invalidDates,1);assert.equal(m.quality.invalidAmounts,1);
 assert.equal(m.series[9].isFuture,true);assert.equal(m.series[9].sales,null);assert.equal(m.series[9].expenses,null);assert.equal(m.series[9].plannedSales,null);
});

test('leap-year and year-boundary dates use Lima calendar independently of host timezone',()=>{
 const leap=analyticsMetrics({ ...base(),goals:[goal('2024-02-01','2024-02-29',2900,1450,290)]},{now:new Date('2024-02-29T17:00:00Z'),period:'month'});
 assert.equal(leap.period.totalDays,29);assert.equal(leap.period.elapsedDays,29);assert.equal(leap.targets.salesToDate,2900);
 const midnight=analyticsMetrics({...base(),opportunities:[won('2026-12-31',100,0),won('2027-01-01',500,0)]},{now:new Date('2027-01-01T03:00:00Z'),period:'year'});
 assert.equal(midnight.period.cutoff,'2026-12-31');assert.equal(midnight.period.start,'2026-01-01');assert.equal(midnight.totals.sales,100);
 const nextYear=analyticsMetrics(base(),{now:new Date('2027-01-01T05:00:00Z'),period:'month'});
 assert.equal(nextYear.period.start,'2027-01-01');assert.equal(nextYear.series[0].key,'2026-08');assert.equal(nextYear.series.at(-1).key,'2027-01');
});

test('month chart shows six months, quarters use current quarter, year uses twelve months',()=>{
 const data={...base(),opportunities:[won('2026-08-31',300,100),won('2026-09-09',200,150),won('2026-10-01',500,0)]};
 const month=analyticsMetrics(data,{now,period:'month'});
 assert.equal(month.series.length,6);assert.equal(month.series[0].key,'2026-04');assert.equal(month.totals.sales,200);
 assert.equal(month.series[4].sales,300);assert.equal(month.series[4].cutoff,'2026-08-31');assert.equal(month.series[5].cutoff,'2026-09-09');
 const quarter=analyticsMetrics(data,{now,period:'quarter'});
 assert.equal(quarter.series.length,3);assert.equal(quarter.period.start,'2026-07-01');assert.equal(quarter.period.end,'2026-09-30');assert.equal(quarter.totals.sales,500);
 const july=analyticsMetrics(base(),{now:new Date('2026-07-01T17:00:00Z'),period:'quarter'});
 assert.deepEqual(july.series.map(row=>row.isFuture),[false,true,true]);
 assert.equal(analyticsMetrics(data,{now,period:'year'}).series.length,12);
});

test('daily cumulative sales follow the selected calendar period and reconcile exactly at cutoff',()=>{
 const data={...base(),opportunities:[won('2026-08-31',9000000,1),won('2026-09-01',100,50),won('2026-09-09',50,20),won('2026-09-10',99999,0)],goals:[goal('2026-01-01','2026-12-31',36500,20000,5000),goal('2026-09-01','2026-09-30',1000000,400000,50000)]};
 for(const period of ['month','quarter','year']){
  const m=analyticsMetrics(data,{now,period}),lastActual=m.salesTimeline.filter(row=>!row.isFuture).at(-1);
  assert.equal(m.salesTimeline[0].date,m.period.start);assert.equal(m.salesTimeline.at(-1).date,m.period.end);
  assert.equal(lastActual.date,m.period.cutoff);assert.equal(lastActual.sales,m.totals.sales);assert.equal(lastActual.plannedSales,m.targets.salesToDate);
  assert.equal(m.salesTimeline.at(-1).plannedSales,m.targets.sales);
  assert.ok(m.salesTimeline.filter(row=>row.isFuture).every(row=>row.sales===null));
 }
 const month=analyticsMetrics(data,{now,period:'month'});
 assert.equal(month.salesTimeline[0].sales,100);assert.equal(month.salesTimeline[7].sales,100);assert.equal(month.salesTimeline[8].sales,150);
 assert.equal(month.salesTimeline.at(-1).plannedSales,1000000);
});

test('specific organizational plans override broad plans once; individual goals do not inflate targets',()=>{
 const data={...base(),goals:[goal('2026-01-01','2026-12-31',36500,18250,3650),goal('2026-09-01','2026-09-30',6000,3000,900,{created_at:'2026-08-01'}),goal('2026-09-01','2026-09-30',9000,4500,1200,{updated_at:'2026-08-31'}),goal('2026-09-01','2026-09-30',999999,999999,999999,{owner_user_id:'seller'})]};
 const m=analyticsMetrics(data,{now,period:'month'});
 assert.equal(m.targets.sales,9000);assert.equal(m.targets.salesToDate,2700);assert.equal(m.targets.margin,4500);assert.equal(m.targets.expensesToDate,360);
 assert.equal(m.quality.overlappingGoals,30);
});

test('target coverage is required per field and per interval; known early target survives a future gap',()=>{
 const data={...base(),goals:[goal('2026-09-01','2026-09-15',1500,undefined,300)]};
 const m=analyticsMetrics(data,{now,period:'month'});
 assert.equal(m.targets.sales,null);assert.equal(m.targets.salesToDate,900);assert.equal(m.targets.marginToDate,null);
 assert.equal(m.quality.goalGaps.sales,15);assert.equal(m.quality.goalGaps.margin,30);
});

test('negative margin and spending above budget remain visible and categories reconcile',()=>{
 const data={opportunities:[won('2026-09-03',100,140)],expenses:[expense('2026-09-03',30),expense('2026-09-03',20,{category:'TRAVEL'})],goals:[goal('2026-09-01','2026-09-30',300,100,100)]};
 const m=analyticsMetrics(data,{now,period:'month'});
 assert.equal(m.totals.grossMargin,-40);assert.equal(m.totals.operatingResult,-90);assert.equal(m.totals.marginPercent,-40);
 assert.equal(m.progress.expensesVariance,20);assert.equal(m.expenseCategories.reduce((sum,row)=>sum+row.amount,0),50);
 assert.equal(m.expenseCategories[0].sharePct,60);
});

test('negative source values cannot inflate profit or reduce expenses, but calculated losses stay negative',()=>{
 const data={...base(),opportunities:[won('2026-09-03',100,-140),won('2026-09-03',-900,0)],expenses:[expense('2026-09-03',30),expense('2026-09-03',-700)]};
 const m=analyticsMetrics(data,{now,period:'month'});
 assert.equal(m.totals.sales,100);assert.equal(m.totals.expenses,30);assert.equal(m.totals.operatingResult,null);assert.equal(m.quality.unknownCosts,1);assert.equal(m.quality.invalidAmounts,3);
 data.opportunities[0].estimated_cost=140;
 assert.equal(analyticsMetrics(data,{now,period:'month'}).totals.operatingResult,-70);
});

test('CSV exports the same monthly metrics, preserving losses and leaving unknown/future figures blank',()=>{
 const data={...base(),opportunities:[won('2026-09-09',100,150)]};
 const output=analyticsCSV(data,{now,period:'year'}),parsed=parseCsv(output);
 assert.ok(output.startsWith('\uFEFF'));assert.ok(output.includes('"-50"'));assert.ok(!output.includes("\"'-50\""));
 assert.ok(output.includes('"2026-10","Futuro","","PEN",""'));
 assert.ok(output.includes('"2026-09","Parcial al corte","2026-09-09","PEN","100"'));
 assert.ok(output.includes('"DATOS REALES"'));assert.ok(analyticsCSV(data,{now,demo:true}).includes('"DEMOSTRACIÓN"'));
 assert.ok(parsed);
});

test('extended demo provides twelve months, future plans, expenses, and a loss without any future actual',()=>{
 const data=createDemoData('org',now),m=analyticsMetrics(data,{now,period:'year'});
 const months=new Set(data.opportunities.filter(row=>row.stage==='WON').map(row=>row.expected_close_date.slice(0,7)));
 assert.equal(months.size,12);assert.equal(data.expenses.length,72);assert.ok(data.opportunities.every(row=>row.stage!=='WON'||row.expected_close_date<='2026-09-09'));
 assert.ok(data.expenses.every(row=>row.expense_date<='2026-09-09'&&row.currency==='PEN'&&row.is_simulated));
 assert.ok(data.expenses.every(row=>['PERSONNEL','MARKETING','OPERATIONS','TECHNOLOGY','OTHER'].includes(row.category)));
 assert.ok(m.series.some(row=>row.operatingResult<0));assert.ok(m.series.some(row=>!row.isFuture&&row.expenses>row.plannedExpenses));
 assert.ok(m.targets.sales>0);assert.ok(m.targets.expenses>0);assert.ok(m.series[11].targetSales>0);assert.equal(m.series[11].sales,null);
});

test('local demo upgrade is additive and idempotent, preserves edited records, budgets, and version',()=>{
 const data=createDemoData('org',now);
 data.demo_migrations=[];
 const original=data.opportunities[0];original.value=123456;
 const currentGoal=data.goals.find(row=>row.id==='demo-goal-org');currentGoal.target_expenses=0;
 const expenses=data.expenses.length,opportunities=data.opportunities.length,goals=data.goals.length;
 delete data.expenses;
 upgradeDemoData(data,'org',now);
 assert.equal(data.opportunities[0],original);assert.equal(data.opportunities[0].value,123456);assert.equal(currentGoal.target_expenses,0);
 assert.equal(data.expenses.length,expenses);assert.equal(data.opportunities.length,opportunities);assert.equal(data.goals.length,goals);
 const snapshot=JSON.stringify(data);upgradeDemoData(data,'org',new Date('2026-09-15T17:00:00Z'));assert.equal(JSON.stringify(data),snapshot);
 assert.equal(DEMO_VERSION,2);assert.ok(Object.values(data).every(Array.isArray));
});

test('saved demo category repair only normalizes generated legacy categories and preserves all other edits',()=>{
 const data=createDemoData('org',now),facility=data.expenses[3],travel=data.expenses[4],edited=data.expenses[0];
 facility.category='FACILITIES';facility.amount=1234.56;facility.description='Descripción editada';
 travel.category='TRAVEL';edited.category='MARKETING';
 const unrelated={id:'manual-demo-expense',is_simulated:true,category:'TRAVEL',amount:55};
 const live={id:'demo-analytics-expense-live',is_simulated:false,category:'FACILITIES',amount:66};
 data.expenses.push(unrelated,live);
 const facilityBefore={...facility},travelBefore={...travel},editedBefore={...edited};
 upgradeDemoData(data,'org',now);
 assert.deepEqual(facility,{...facilityBefore,category:'OPERATIONS'});assert.deepEqual(travel,{...travelBefore,category:'OPERATIONS'});
 assert.deepEqual(edited,editedBefore);assert.equal(unrelated.category,'TRAVEL');assert.equal(live.category,'FACILITIES');
 const snapshot=JSON.stringify(data);upgradeDemoData(data,'org',now);assert.equal(JSON.stringify(data),snapshot);
});

test('demo seed remains at the Lima cutoff near UTC midnight and leap-day month ends',()=>{
 for(const [timestamp,cutoff] of [['2027-01-01T03:00:00Z','2026-12-31'],['2024-03-01T03:00:00Z','2024-02-29']]){
  const data=createDemoData('org',new Date(timestamp));
  assert.ok(data.opportunities.filter(row=>row.stage==='WON').every(row=>row.expected_close_date<=cutoff));
  assert.ok(data.expenses.every(row=>row.expense_date<=cutoff));
  assert.equal(data.goals.find(row=>row.id==='demo-goal-org').period_end,cutoff);
 }
});

test('upgrade respects a saved broad organizational plan instead of overriding it with generated monthly plans',()=>{
 const data=createDemoData('org',now);
 data.demo_migrations=[];
 const custom=goal('2026-01-01','2026-12-31',12000000,4800000,0,{id:'saved-annual-plan',is_simulated:true,organization_id:'org'});
 data.goals=[custom];
 upgradeDemoData(data,'org',now);
 assert.equal(data.goals.filter(row=>row.period_start>='2026-01-01').length,1);
 assert.equal(data.goals[0],custom);assert.equal(custom.target_expenses,0);
 assert.equal(analyticsMetrics(data,{now,period:'year'}).targets.sales,12000000);
});

test('analytics never mutates source data and rejects an invalid cutoff',()=>{
 const data=createDemoData('org',now),snapshot=JSON.stringify(data);
 analyticsMetrics(data,{now});analyticsCSV(data,{now});assert.equal(JSON.stringify(data),snapshot);
 assert.throws(()=>analyticsMetrics(data,{now:new Date('invalid')}),RangeError);
 assert.equal(businessDay(new Date('2027-01-01T03:00:00Z')),'2026-12-31');
 assert.deepEqual(businessMonthRange(new Date('2027-01-01T03:00:00Z')),{start:'2026-12-01',end:'2026-12-31'});
});
