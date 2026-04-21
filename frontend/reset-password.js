const SUPABASE_URL = 'https://mykzgxpreyqppvzjmwtm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15a3pneHByZXlxcHB2emptd3RtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2OTI4NzQsImV4cCI6MjA5MTI2ODg3NH0.UfCIO5VXfaMbRP6byOl7FjuRy3JRIMqfqv7kdjd25R8';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    detectSessionInUrl: true,
    persistSession: false,
    autoRefreshToken: false,
  },
});

let recoverySessionReady = false;

function clearRpgSession() {
  localStorage.removeItem('rpg_token');
  localStorage.removeItem('rpg_role');
  localStorage.removeItem('rpg_user_id');
  localStorage.removeItem('rpg_email');
  localStorage.removeItem('rpg_ficha_id');
}

function showStatus(message, kind = 'error') {
  const el = document.getElementById('status-msg');
  el.textContent = message;
  el.classList.remove('hidden', 'is-error', 'is-success', 'is-info');
  el.classList.add(`is-${kind}`);
}

function setLoading(loading) {
  const btn = document.getElementById('btn-reset');
  btn.disabled = loading;
  btn.textContent = loading ? 'Salvando...' : 'Salvar nova senha';
}

function enableRecoverySession() {
  if (recoverySessionReady) {
    return;
  }

  recoverySessionReady = true;
  showStatus('Link validado. Agora voce pode definir a nova senha.', 'success');
  window.history.replaceState({}, document.title, window.location.pathname);
}

function exibirErroDoLink() {
  showStatus('O link de recuperacao e invalido ou expirou. Solicite um novo email para continuar.', 'error');
}

async function prepararRecuperacao() {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const linkComErro = hashParams.get('error') || hashParams.get('error_code') || hashParams.get('error_description');

  if (linkComErro) {
    exibirErroDoLink();
    return;
  }

  showStatus('Validando o link de recuperacao...', 'info');

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY' || session) {
      enableRecoverySession();
    }
  });

  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    exibirErroDoLink();
    return;
  }

  if (data.session) {
    enableRecoverySession();
    return;
  }

  window.setTimeout(async () => {
    const retry = await supabaseClient.auth.getSession();
    if (retry.data.session) {
      enableRecoverySession();
      return;
    }

    exibirErroDoLink();
  }, 600);
}

async function handlePasswordReset(event) {
  event.preventDefault();

  const novaSenha = document.getElementById('nova-senha').value;
  const confirmarSenha = document.getElementById('confirmar-senha').value;

  if (!recoverySessionReady) {
    showStatus('Abra esta pagina pelo link mais recente enviado para o seu email.', 'error');
    return;
  }

  if (novaSenha.length < 6) {
    showStatus('A nova senha precisa ter pelo menos 6 caracteres.', 'error');
    return;
  }

  if (novaSenha !== confirmarSenha) {
    showStatus('A confirmacao da senha precisa ser igual a nova senha.', 'error');
    return;
  }

  setLoading(true);

  try {
    const { error } = await supabaseClient.auth.updateUser({ password: novaSenha });

    if (error) {
      showStatus(error.message || 'Nao foi possivel redefinir a senha.', 'error');
      return;
    }

    clearRpgSession();
    showStatus('Senha atualizada com sucesso. Voce ja pode entrar novamente.', 'success');

    window.setTimeout(async () => {
      await supabaseClient.auth.signOut();
      window.location.replace('login.html');
    }, 1600);
  } catch (err) {
    console.error('Erro ao redefinir senha:', err);
    showStatus('Nao foi possivel redefinir a senha agora. Tente novamente.', 'error');
  } finally {
    setLoading(false);
  }
}

document.getElementById('reset-form').addEventListener('submit', handlePasswordReset);
prepararRecuperacao();
