# Xicronix Commercial Intelligence — V2.8

## Documentos del Expediente Comercial

V2.8 agrega gestión documental privada vinculada a cada expediente comercial.

### Carpetas
- Solicitud y diagnóstico
- Propuestas y cotizaciones
- Contratos y autorizaciones
- Facturación y pagos
- Implementación y entrega
- Manuales y postventa

### Estados documentales
- Borrador
- Vigente
- Enviado
- Firmado
- Reemplazado

Estos estados son explícitos y no se infieren del mero hecho de cargar un archivo.

### Versionado
Cada archivo nuevo sobre un documento existente crea una versión nueva:
- la versión anterior se conserva;
- una sola versión queda marcada como actual;
- el expediente muestra la versión actual y permite revisar el historial;
- las versiones previas no se eliminan automáticamente.

### Almacenamiento
Los archivos se almacenan en el bucket privado `crm-documents`.
- El bucket no es público.
- El acceso se limita por organización mediante RLS.
- La apertura usa URLs firmadas de corta duración.
- El límite por archivo es 25 MB.

### Distinciones de evidencia
- Archivo subido ≠ archivo enviado.
- Archivo enviado ≠ contrato firmado.
- Contrato firmado ≠ pago recibido.
- Factura o comprobante cargado ≠ pago verificado.

### Expediente Comercial
Desde el expediente se puede:
- subir un documento;
- ver su carpeta, estado y versión actual;
- abrir el archivo privado;
- revisar versiones anteriores.

No se cargó ningún documento ficticio en producción durante el desarrollo.
