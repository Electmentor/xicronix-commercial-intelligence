# Incidente de recuperación de acceso — DEV

2026-09-21. El usuario recibe el correo, pero el enlace muestra una pantalla de autorización de Vercel. No se capturaron contraseñas ni enlaces privados.

## Evidencia
- Rama dev inspeccionada: a93913b3363922f3d3a4d4eb20925be6660ccaa4.
- Login DEV carga públicamente y usa rmximatxuaczhpqbcuho.
- La cuenta DEV inspeccionada está confirmada y no bloqueada. Esto no prueba la validez de su contraseña.
- recuperar.js en dev usa exclusivamente el proyecto de PRODUCCIÓN: inconsistencia confirmada.
- ACCESS.md ya documenta un destino de recuperación protegido. El último cambio de app.js ofrece un arreglo manual para localhost. La configuración actual del proveedor aún no pudo verificarse: el panel requiere iniciar sesión.

## Corrección preparada
La recuperación alternativa elige Auth según el dominio oficial exacto; DEV usa exclusivamente CRM DEV. Dominios desconocidos no inicializan Auth. Conserva verificación de tokens y sesión temporal. No cambia usuarios, contraseñas, permisos ni configuración de producción.

## Validación
5 pruebas locales con Auth simulado pasan: selección DEV, bloqueo de dominio desconocido, compatibilidad de producción sin llamadas reales, rechazo de enlace de otro entorno y verificación explícita del token con error controlado.
No se ha validado un cambio real de contraseña ni resuelto todavía la redirección del correo.

## Dependencia pendiente
Inspeccionar Site URL, Redirect URLs y plantilla de recuperación en Supabase CRM DEV con sesión del titular. Identificar el destino que produce la pantalla de Vercel, sin consumir enlaces del usuario. Cualquier ampliación de destinos permitidos requiere autorización humana explícita. No desactivar la protección de Vercel para resolverlo.

## Riesgo y rollback
Solo se reconocen los dominios oficiales de DEV y producción; una preview distinta se bloquea intencionalmente. Este cambio está preparado en una rama y no publicado en dev. Rollback: revertir el commit si se integra. Conservar configuración previa antes de cualquier cambio posterior. PRODUCCIÓN intacta.
