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
| VIEWER podía escribir por RLS | Corrección restrictiva aplicada en Supabase y verificada con los asesores |
| Relaciones no exigían pertenecer a la misma organización | Validación de formularios y SQL restrictivo aplicado |
| Faltaban índices en claves foráneas | Índices añadidos; el asesor ya no reporta claves foráneas sin cobertura |

Validado: sintaxis, archivos locales referenciados, pruebas de búsqueda, cartera, agenda, CSV y escape. Las migraciones de endurecimiento, helper privado, políticas e índices están aplicadas en Supabase. El asesor de seguridad solo mantiene pendiente la activación manual de protección contra contraseñas filtradas. El despliegue Vercel del Preview reporta estado Ready. La prueba automatizada del navegador autenticado queda como validación manual en el Preview.
