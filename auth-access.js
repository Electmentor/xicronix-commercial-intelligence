/* Account access only. Uses Supabase Auth; never stores or logs passwords. */
(() => {
  'use strict';
  const emailKey = 'xicronix.crm.remembered-email';
  const recoveryKey = 'xicronix.crm.password-recovery';
  const read = (storage, key) => { try { return window[storage].getItem(key); } catch { return null; } };
  const write = (storage, key, value) => {
    try { if (value) window[storage].setItem(key, value); else window[storage].removeItem(key); } catch { /* Storage may be disabled. */ }
  };
  let recovering = xicronixRecoveryLink || read('sessionStorage', recoveryKey) === '1';
  let busy = false;
  let resetting = false;
  let requestAfter = 0;
  let activeSession = null;
  let enterTimer;
  if (recovering) write('sessionStorage', recoveryKey, '1');

  const style = document.createElement('style');
  style.textContent = '.auth-check{display:flex;align-items:center;gap:9px;font-weight:400;font-size:13px;line-height:1.5}.auth-check input{width:18px;height:18px;padding:0;flex-shrink:0}.auth-note{font-size:12px;line-height:1.6;color:#536479}.auth-link{display:block;width:100%;margin-top:12px;padding:10px;border:0;background:transparent;color:#095db5;text-decoration:underline;font-weight:700}.auth button:disabled{opacity:.6;cursor:wait}.auth input:focus-visible,.auth button:focus-visible{outline:3px solid #ff8a1f;outline-offset:3px}.auth .msg{line-height:1.6;overflow-wrap:anywhere}.auth-card{max-width:100%}';
  document.head.appendChild(style);
  document.querySelector('.auth-card').innerHTML = `
    <div class="brand">XICRONIX<small>COMMERCIAL INTELLIGENCE</small></div>
    <h1 id="authTitle">Ingresar</h1>
    <p class="muted" id="authDescription">Acceso seguro al sistema comercial.</p>
    <div class="tabs" id="authTabs"><button type="button" id="loginTab" class="active">Ingresar</button><button type="button" id="signupTab">Crear usuario</button></div>
    <form id="authForm" autocomplete="on">
      <label for="email">Correo de tu cuenta</label>
      <input id="email" name="username" type="email" autocomplete="username" inputmode="email" autocapitalize="none" spellcheck="false" required>
      <div id="passwordFields"><label for="password">Contraseña</label><input id="password" name="password" type="password" autocomplete="current-password" minlength="6" required><label class="auth-check"><input id="showPassword" type="checkbox">Mostrar contraseña</label></div>
      <label class="auth-check" id="rememberLabel"><input id="rememberEmail" type="checkbox">Recordar mi correo en este equipo personal</label>
      <button id="authBtn" type="submit" class="primary wide">Ingresar</button>
      <button id="forgotPassword" type="button" class="auth-link">Olvidé mi contraseña</button>
      <button id="backToLogin" type="button" class="auth-link hidden">Volver a ingresar</button>
      <div id="authMsg" class="msg" role="status" aria-live="polite"></div>
    </form>
    <form id="resetForm" class="hidden" autocomplete="on">
      <label for="resetEmail">Cuenta</label><input id="resetEmail" name="username" type="email" autocomplete="username" readonly>
      <label for="newPassword">Nueva contraseña</label><input id="newPassword" name="new-password" type="password" autocomplete="new-password" minlength="12" required aria-describedby="passwordHelp">
      <p id="passwordHelp" class="auth-note">Usa al menos 12 caracteres y una contraseña que no utilices en otra cuenta.</p>
      <label for="confirmPassword">Repite la nueva contraseña</label><input id="confirmPassword" name="confirm-password" type="password" autocomplete="new-password" minlength="12" required>
      <label class="auth-check"><input id="showNewPassword" type="checkbox">Mostrar contraseñas</label>
      <button id="resetBtn" type="submit" class="primary wide">Guardar nueva contraseña</button>
      <div id="resetMsg" class="msg" role="status" aria-live="polite"></div>
    </form>
    <p class="auth-note">Guarda la contraseña en el gestor de tu navegador cuando te lo ofrezca. La sesión se conserva en este navegador; en equipos compartidos, cierra sesión al terminar.</p>`;

  function message(id, text, error = false) {
    $(id).textContent = text;
    $(id).className = error ? 'msg error' : 'msg ok';
  }
  function setRecovery(value) {
    recovering = value;
    write('sessionStorage', recoveryKey, value ? '1' : null);
  }
  function remember() {
    write('localStorage', emailKey, $('rememberEmail').checked ? $('email').value.trim() : null);
  }
  function errorText(error) {
    if (error?.status === 429 || /rate.limit|too.many|seconds/i.test(error?.message || '')) return 'Espera un minuto antes de volver a intentarlo.';
    if (/invalid.login|invalid.credentials/i.test(error?.code || error?.message || '')) return 'El correo o la contraseña no son correctos. Puedes usar «Olvidé mi contraseña».';
    if (/email.not.confirmed/i.test(error?.code || error?.message || '')) return 'Confirma tu correo con el mensaje que recibiste al crear la cuenta.';
    if (/same.password/i.test(error?.code || error?.message || '')) return 'Elige una contraseña diferente de la anterior.';
    if (/weak.password/i.test(error?.code || error?.message || '')) return 'Elige una contraseña más segura, de al menos 12 caracteres.';
    return 'No se pudo completar la operación. Revisa tu conexión e inténtalo de nuevo.';
  }
  authMode = function(next) {
    mode = next;
    const recovery = next === 'recover';
    $('authTitle').textContent = recovery ? 'Recuperar acceso' : next === 'signup' ? 'Crear usuario' : 'Ingresar';
    $('authDescription').textContent = recovery ? 'Te enviaremos un enlace para elegir una contraseña nueva. No necesitas crear otra cuenta.' : 'Acceso seguro al sistema comercial.';
    $('authTabs').classList.toggle('hidden', recovery);
    $('authForm').classList.remove('hidden');
    $('resetForm').classList.add('hidden');
    $('passwordFields').classList.toggle('hidden', recovery);
    $('password').required = !recovery;
    $('password').disabled = recovery;
    $('password').autocomplete = next === 'signup' ? 'new-password' : 'current-password';
    $('forgotPassword').classList.toggle('hidden', recovery || next === 'signup');
    $('backToLogin').classList.toggle('hidden', !recovery);
    $('authBtn').textContent = recovery ? 'Enviar enlace a mi correo' : next === 'signup' ? 'Crear usuario' : 'Ingresar';
    $('loginTab').classList.toggle('active', next === 'login');
    $('signupTab').classList.toggle('active', next === 'signup');
    message('authMsg', '');
  };
  $('loginTab').onclick = () => { if (!busy) authMode('login'); };
  $('signupTab').onclick = () => { if (!busy) authMode('signup'); };
  $('forgotPassword').onclick = () => { if (!busy) { authMode('recover'); $('email').focus(); } };
  $('backToLogin').onclick = () => { if (!busy) authMode('login'); };
  $('showPassword').onchange = e => { $('password').type = e.target.checked ? 'text' : 'password'; };
  $('showNewPassword').onchange = e => { for (const id of ['newPassword','confirmPassword']) $(id).type = e.target.checked ? 'text' : 'password'; };
  $('rememberEmail').onchange = () => { if (!$('rememberEmail').checked) write('localStorage', emailKey, null); };
  $('confirmPassword').oninput = () => $('confirmPassword').setCustomValidity('');
  const remembered = read('localStorage', emailKey);
  if (remembered) { $('email').value = remembered; $('rememberEmail').checked = true; }

  $('authForm').onsubmit = async e => {
    e.preventDefault();
    if (busy || !$('authForm').reportValidity()) return;
    const email = $('email').value.trim();
    const action = mode;
    if (action === 'recover' && Date.now() < requestAfter) { message('authMsg', 'Espera un minuto antes de solicitar otro enlace.', true); return; }
    busy = true;
    $('authBtn').disabled = true;
    message('authMsg', 'Procesando…');
    try {
      if (action === 'recover') {
        const {error} = await sb.auth.resetPasswordForEmail(email, {redirectTo: new URL('/', location.href).href});
        if (error) throw error;
        requestAfter = Date.now() + 60000;
        remember();
        message('authMsg', 'Si este correo tiene una cuenta, recibirá un enlace para cambiar la contraseña. Revisa también Spam. Abre el mensaje más reciente; no compartas el enlace.');
        return;
      }
      const credentials = {email, password: $('password').value};
      const result = action === 'signup' ? await sb.auth.signUp(credentials) : await sb.auth.signInWithPassword(credentials);
      if (result.error) throw result.error;
      remember();
      if (!result.data.session) { message('authMsg', 'Revisa tu correo para confirmar el acceso.'); return; }
      setRecovery(false);
      route(result.data.session);
    } catch (error) { message('authMsg', errorText(error), true); }
    finally { busy = false; $('authBtn').disabled = false; }
  };

  function showReset(s) {
    activeSession = s;
    session = s;
    $('appView').classList.add('hidden');
    $('authView').classList.remove('hidden');
    $('authTabs').classList.add('hidden');
    $('authForm').classList.add('hidden');
    $('resetForm').classList.remove('hidden');
    $('authTitle').textContent = 'Elige tu nueva contraseña';
    $('authDescription').textContent = 'Conservas tu misma cuenta y sus permisos.';
    $('resetEmail').value = s.user.email || '';
  }
  function route(s) {
    activeSession = s;
    clearTimeout(enterTimer);
    if (resetting) return;
    if (s && recovering) { showReset(s); return; }
    if (s) {
      // Supabase callbacks must return before making additional Auth-dependent requests.
      enterTimer = setTimeout(() => {
        if (!recovering && activeSession === s) enterApp(s).catch(() => {
          $('appView').classList.add('hidden'); $('authView').classList.remove('hidden');
          message('authMsg', 'La sesión está abierta, pero no se pudo cargar el sistema. Recarga la página.', true);
        });
      }, 0);
    } else {
      session = null; profile = null;
      $('appView').classList.add('hidden'); $('authView').classList.remove('hidden');
      if (recovering) { setRecovery(false); authMode('recover'); message('authMsg', 'El enlace no es válido o ya venció. Solicita uno nuevo.', true); }
    }
  }
  $('resetForm').onsubmit = async e => {
    e.preventDefault();
    if (resetting || !$('resetForm').reportValidity()) return;
    if ($('newPassword').value !== $('confirmPassword').value) {
      $('confirmPassword').setCustomValidity('Las contraseñas no coinciden.'); $('confirmPassword').reportValidity(); return;
    }
    resetting = true; $('resetBtn').disabled = true;
    message('resetMsg', 'Guardando…');
    try {
      const verified = await sb.auth.getUser();
      if (verified.error || !verified.data.user || !activeSession || verified.data.user.id !== activeSession.user.id) {
        message('resetMsg', 'La sesión de recuperación venció. Recarga la página y solicita un nuevo enlace.', true); return;
      }
      const {error} = await sb.auth.updateUser({password: $('newPassword').value});
      if (error) throw error;
      const email = verified.data.user.email || '';
      $('newPassword').value = ''; $('confirmPassword').value = ''; $('password').value = '';
      setRecovery(false);
      const signedOut = await sb.auth.signOut({scope:'local'});
      authMode('login'); $('email').value = email;
      message('authMsg', signedOut.error ? 'Contraseña actualizada. Recarga la página para continuar.' : 'Contraseña actualizada. Ingresa con ella y elige «Guardar» o «Actualizar» cuando tu navegador te lo ofrezca.');
    } catch (error) { message('resetMsg', errorText(error), true); }
    finally { resetting = false; $('resetBtn').disabled = false; }
  };
  sb.auth.onAuthStateChange((event,s) => {
    if (event === 'PASSWORD_RECOVERY') setRecovery(true);
    if (event === 'SIGNED_OUT') { setRecovery(false); if (!resetting) authMode('login'); }
    route(s);
  });
  (async () => {
    try {
      const {data,error} = await sb.auth.getSession();
      if (error) throw error;
      if (xicronixAuthLinkError) { setRecovery(false); authMode('recover'); message('authMsg', 'El enlace no es válido o ya venció. Solicita uno nuevo.', true); return; }
      route(data.session);
    } catch { setRecovery(false); authMode('recover'); message('authMsg', 'No se pudo verificar el acceso. Solicita otro enlace o vuelve a intentar ingresar.', true); }
  })();
})();
