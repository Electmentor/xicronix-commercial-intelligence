# Acceso y recuperación — Xicronix Commercial Intelligence

## Cuenta existente
Usar la cuenta ya vinculada a la organización. No crear otra cuenta para recuperar una contraseña. No modificar roles, registros comerciales ni valores de `auth.users` para resolver un olvido de contraseña.

## Guardado seguro
La aplicación puede recordar el correo si el usuario lo selecciona en su equipo personal. La contraseña debe guardarse en el gestor de contraseñas del navegador, nunca en este repositorio, en documentos, en el CRM ni en conversaciones. La sesión de Supabase se conserva en el navegador conforme a su configuración; no es una copia de la contraseña y no debe exportarse.

## Recuperación
El formulario de acceso incorpora «Olvidé mi contraseña». La solicitud usa Supabase Auth y siempre presenta una confirmación genérica para evitar enumerar cuentas.

La página `/recuperar.html` también permite comprobar el token de un correo de recuperación emitido por Supabase, sin depender del destino de una versión de pruebas. Solo acepta enlaces HTTPS de la instancia de Auth de este proyecto, de tipo `recovery`. El usuario debe pulsar el botón de confirmación: la mera carga de la página no consume el token. Un token caducado o usado no permite cambiar la contraseña.

La sesión de recuperación de esta página es temporal y permanece en memoria. Antes de actualizar la contraseña se vuelve a comprobar la identidad con `getUser`. El usuario elige y confirma su contraseña (mínimo 12 caracteres), se limpian los campos y se cierra esa sesión temporal. Después ingresa normalmente y autoriza a su navegador a guardar la contraseña.

## Configuración pendiente del proveedor
Durante la revisión del 18 de septiembre de 2026, el correo automático de Supabase utilizaba como destino un preview de Vercel protegido. La configuración global de Auth NO se ha cambiado mediante este trabajo.

En Supabase Authentication > URL Configuration, el administrador debe verificar:
- Site URL: `https://xicronix-commercial-intelligence.vercel.app/`
- Redirect URLs: autorizar exactamente el origen y las rutas de recuperación usadas en producción.

Después de ese ajuste debe enviarse una nueva solicitud y comprobarse el destino del mensaje sin consumir el enlace del usuario desde herramientas de diagnóstico. Como alternativa provisional, el usuario puede copiar la dirección de «Reset password» y pegarla en `/recuperar.html`.

## Alcance de las verificaciones
Se verificó la sintaxis de JavaScript y se probaron localmente la interfaz lógica, recuperación, validación, coincidencia de contraseñas y limpieza con simulaciones de DOM/Auth. Estas pruebas NO son una prueba integral con una contraseña real. No se ha elegido, leído ni almacenado la contraseña del titular y no se ha alterado la información comercial.

Cada publicación debe comprobar que el HTML y sus scripts responden HTTP 200 en el dominio público. Un commit guardado o un despliegue pendiente no equivalen a disponibilidad en producción.
