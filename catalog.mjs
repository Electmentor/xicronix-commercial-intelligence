// Datos y calculos del catalogo comercial. Los valores DEMO son ficticios:
// no representan precios oficiales de CIDEPE ni una cotizacion vinculante.
export const DEMO_CATALOG_PRODUCTS = [
 {supplier_name:'CIDEPE (referencia demo)',supplier_sku:'EQ-DEMO-047D',name:'Kit de mecanica y dinamica para laboratorio',category:'Fisica',currency:'USD',supplier_unit_price:680,price_valid_from:'2026-09-01',price_valid_until:'2026-12-31',origin_country:'Brasil',tariff_code:'9023.00.00',weight_kg:8.5,volume_m3:0.06,reference_url:'https://www.cidepe.com.br/br',active:true},
 {supplier_name:'CIDEPE (referencia demo)',supplier_sku:'EQ-DEMO-STEM01',name:'Estacion modular de ciencias STEM',category:'Educacion STEM',currency:'USD',supplier_unit_price:1240,price_valid_from:'2026-09-01',price_valid_until:'2026-12-31',origin_country:'Brasil',tariff_code:'9023.00.00',weight_kg:18,volume_m3:0.14,reference_url:'https://cidepe.com.br/en/produtos',active:true},
 {supplier_name:'CIDEPE (referencia demo)',supplier_sku:'EQ-DEMO-OPT02',name:'Banco de optica experimental',category:'Optica',currency:'USD',supplier_unit_price:920,price_valid_from:'2026-09-01',price_valid_until:'2026-12-31',origin_country:'Brasil',tariff_code:'9023.00.00',weight_kg:12,volume_m3:0.09,reference_url:'https://www.cidepe.com.br/br',active:true},
 {supplier_name:'CIDEPE (referencia demo)',supplier_sku:'EQ-DEMO-QUI03',name:'Modulo de quimica segura',category:'Quimica',currency:'USD',supplier_unit_price:1580,price_valid_from:'2026-09-01',price_valid_until:'2026-12-31',origin_country:'Brasil',tariff_code:'9023.00.00',weight_kg:24,volume_m3:0.2,reference_url:'https://cidepe.com.br/en/produtos',active:true},
 {supplier_name:'CIDEPE (referencia demo)',supplier_sku:'EQ-DEMO-ROB04',name:'Plataforma introductoria de robotica',category:'Robotica',currency:'USD',supplier_unit_price:2100,price_valid_from:'2026-09-01',price_valid_until:'2026-12-31',origin_country:'Brasil',tariff_code:'9023.00.00',weight_kg:15,volume_m3:0.12,reference_url:'https://www.cidepe.com.br/br',active:true}
];

export const DEMO_COST_PROFILES = [
 {name:'Brasil → Peru · importacion demostrativa',origin_country:'Brasil',destination_country:'Peru',currency:'USD',exchange_rate:3.78,freight_international:260,insurance:35,ad_valorem_rate:0.06,igv_rate:0.18,perception_rate:0.035,customs_broker_fee:180,terminal_fee:95,storage_fee:45,inland_transport:120,installation_fee:0,contingency_rate:0.03,valid_from:'2026-09-01',valid_until:'2026-12-31',notes:'Perfil ficticio para probar escenarios. Confirmar SPN, origen y tributos con agente de aduanas.'}
];

const n = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const rate = value => Math.max(0, n(value));

/**
 * Calcula un costo referencial por unidad. Los gastos de embarque se prorratean
 * por cantidad y los impuestos recuperables se muestran separados del costo
 * economico para evitar confundir caja con margen.
 */
export function calculateLandedCost(product, profile, quantity=1) {
 const qty=Math.max(1,Math.round(n(quantity)||1));
 const fob=n(product?.supplier_unit_price);
 const freight=n(profile?.freight_international)/qty;
 const insurance=n(profile?.insurance)/qty;
 const cif=fob+freight+insurance;
 const duty=cif*rate(profile?.ad_valorem_rate);
 const otherPerUnit=(n(profile?.customs_broker_fee)+n(profile?.terminal_fee)+n(profile?.storage_fee)+n(profile?.inland_transport)+n(profile?.installation_fee))/qty;
 const igvBase=cif+duty;
 const igv=igvBase*rate(profile?.igv_rate);
 const perceptionBase=cif+duty+igv+otherPerUnit;
 const perception=perceptionBase*rate(profile?.perception_rate);
 const contingency=(cif+duty+otherPerUnit)*rate(profile?.contingency_rate);
 const economicForeign=cif+duty+otherPerUnit+contingency;
 const cashForeign=economicForeign+igv+perception;
 const fx=n(profile?.exchange_rate)||1;
 return {quantity:qty,fob,freight,insurance,cif,duty,otherPerUnit,igvBase,igv,perception,contingency,economicForeign,cashForeign,economicPen:economicForeign*fx,cashPen:cashForeign*fx,exchangeRate:fx};
}

export function catalogDisplayName(row){
 return [row?.name,row?.supplier_sku].filter(Boolean).join(' · ') || 'Producto sin nombre';
}

export function calculateQuote(product, profile, quantity, sellingPrice, discount=0){
 const qty=Number(quantity),price=Number(sellingPrice),pct=Number(discount);
 if(!Number.isInteger(qty)||qty<1||sellingPrice===null||sellingPrice===''||!Number.isFinite(price)||price<0||!Number.isFinite(pct)||pct<0||pct>100)throw Error('Revisa cantidad, precio de venta y descuento.');
 if(product.currency!==profile.currency||!Number.isFinite(Number(profile.exchange_rate))||Number(profile.exchange_rate)<=0)throw Error('La moneda del producto y del perfil debe coincidir; indica un tipo de cambio positivo.');
 const cost=calculateLandedCost(product,profile,qty);
 const economicTotalPen=cost.economicPen*qty,cashTotalPen=cost.cashPen*qty;
 const revenuePen=price*(1-pct/100)*qty*cost.exchangeRate;
 return {economicTotalPen,cashTotalPen,revenuePen,marginPen:revenuePen-economicTotalPen,marginPct:revenuePen>0?(revenuePen-economicTotalPen)/revenuePen*100:null};
}

