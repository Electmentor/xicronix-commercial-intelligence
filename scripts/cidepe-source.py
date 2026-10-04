"""Validate the authorized workbook and emit a transactional, idempotent import.
Usage: python3 scripts/cidepe-source.py SOURCE.xlsx ORGANIZATION_UUID > private-import.sql
The generated SQL contains supplier prices. Never commit or publish it.
"""
import hashlib,json,sys,uuid
from pathlib import Path
from decimal import Decimal
import openpyxl
path=Path(sys.argv[1]);org=str(uuid.UUID(sys.argv[2]));sha=hashlib.sha256(path.read_bytes()).hexdigest()
sheet=openpyxl.load_workbook(path,data_only=True)['rptTabelaPreco'];rows=[]
for n,row in enumerate(sheet.values,1):
 if n<6 or not row[0]:continue
 sku,name,_,__,ncm,currency,price=row
 if currency!='USD' or Decimal(str(price))<0:raise ValueError(f'Invalid currency/price at row {n}')
 rows.append(dict(sku=str(sku),name=name,ncm=str(ncm),currency=currency,price=str(price),row=n))
if len(rows)!=730 or len({r['sku'] for r in rows})!=730:raise ValueError('Expected exactly 730 unique products')
def literal(value):return "'"+str(value).replace("'","''")+"'"
print('begin;')
print('with source as (select * from jsonb_to_recordset('+literal(json.dumps(rows,ensure_ascii=False))+"::jsonb) as x(sku text,name text,ncm text,currency text,price numeric,row int))")
print("insert into public.catalog_products(organization_id,supplier_name,supplier_sku,name,category,currency,supplier_unit_price,origin_country,notes,source_metadata) select "+literal(org)+"::uuid,'CIDEPE',sku,name,'Sin clasificar',currency,price,'Brasil', 'Fuente: Tabla precio 08.2026.xlsx; hoja rptTabelaPreco; fila '||row||'. NCM proveedor: '||ncm||'. Incoterm y vigencia no especificados.', jsonb_build_object('file','Tabla precio 08.2026.xlsx','sheet','rptTabelaPreco','row',row,'sha256',"+literal(sha)+",'supplier_currency',currency,'supplier_price',price,'supplier_ncm',ncm) from source on conflict(organization_id,supplier_sku) do update set name=excluded.name,currency=excluded.currency,supplier_unit_price=excluded.supplier_unit_price,notes=excluded.notes,source_metadata=excluded.source_metadata where catalog_products.supplier_name='CIDEPE';")
print('commit;')
print(f'-- Verified source: {len(rows)} products; SHA256 {sha}',file=sys.stderr)
