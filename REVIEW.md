# Revisión de código y base de datos · 9 septiembre 2026

Se revisó el único archivo del repositorio original (`index.html`, 936 líneas), el esquema de las nueve tablas públicas y sus políticas RLS. No existe código backend en ese repositorio. No se revisaron contraseñas ni contenido de correos.

| Hallazgo | Resultado |
| --- | --- |
| `return` separado por salto de línea en el filtro descartaba todas las instituciones | Corregido y cubierto con regresión |
| Marca SYNCHRONICS y opciones en inglés | XICRONIX y etiquetas españolas |
| Contactos, leads y oportunidades eran botones sin acción | Módulos conectados al esquema existente |
| Indicadores de conexión y persistencia eran texto fijo | Eliminados; se muestran fallos reales de carga |
| No había recuperación de contraseña | Flujo de solicitud y actualización implementado; entrega de correo pendiente de prueba |
| Errores de datos solo en consola | Mensajes visibles y estados parciales |
| No existía edición ni manejo de cambios concurrentes | Formularios y comparación de versión |
| Datos permanecían en memoria al cerrar sesión | Limpieza de estado, formularios y vistas |
| Lectura podía limitarse al máximo de la API | Lotes explícitos de 500 |
| VIEWER podía escribir por RLS | Corrección restrictiva preparada, sin aplicar en producción |
| Relaciones no exigían pertenecer a la misma organización | Validación de formularios y SQL restrictivo preparado |
| Falta de índices verificada como requisito de rendimiento | No se modificaron índices sin evidencia de carga |

Validado: sintaxis, archivos locales referenciados, pruebas de búsqueda, cartera, agenda, CSV y escape. El SQL propuesto se valida dentro de una transacción con rollback; no se activan permisos nuevos en producción. No se hicieron pruebas de navegador ni sesiones reales de usuarios. La aplicación mejorada queda como propuesta revisable en GitHub; no se sustituye silenciosamente la versión publicada.
