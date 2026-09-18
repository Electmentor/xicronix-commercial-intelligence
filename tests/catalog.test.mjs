import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateLandedCost, calculateQuote, DEMO_CATALOG_PRODUCTS, DEMO_COST_PROFILES} from '../catalog.mjs';

test('catalogo demo calcula CIF, tributos y costo puesto sin mezclar caja con margen',()=>{
 const result=calculateLandedCost(DEMO_CATALOG_PRODUCTS[0],DEMO_COST_PROFILES[0],2);
 assert.equal(result.quantity,2);
 assert.ok(result.cif>result.fob);
 assert.ok(result.duty>0);
 assert.ok(result.igv>0);
 assert.ok(result.cashForeign>result.economicForeign);
 assert.ok(Math.abs(result.cashPen-(result.cashForeign*3.78))<1e-8);
});

test('catalogo de prueba deja claro que sus precios son ficticios',()=>{
 assert.ok(DEMO_CATALOG_PRODUCTS.every(row=>row.supplier_name.includes('referencia demo')));
 assert.equal(DEMO_COST_PROFILES[0].origin_country,'Brasil');
});

test('negotiation changes revenue, never supplier cost; total cost includes every unit',()=>{
 const product={currency:'USD',supplier_unit_price:100};
 const profile={currency:'USD',exchange_rate:4,freight_international:20};
 const a=calculateQuote(product,profile,2,200,0),b=calculateQuote(product,profile,2,200,10);
 assert.equal(a.economicTotalPen,880);
 assert.equal(a.revenuePen,1600);
 assert.equal(b.economicTotalPen,880);
 assert.equal(b.revenuePen,1440);
 assert.equal(b.marginPen,560);
 assert.throws(()=>calculateQuote(product,profile,0,200,0));
 assert.throws(()=>calculateQuote(product,profile,1,'',0));
 assert.throws(()=>calculateQuote(product,profile,1,200,101));
});

