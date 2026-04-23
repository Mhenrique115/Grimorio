const { config, storage, navigation } = window.RPGCore;
const API_BASE = config.API_BASE;
let recoveryAccessToken = '';

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

function exibirErroDoLink() {
  showStatus('O link de recuperacao e invalido ou expirou. Solicite um novo email para continuar.', 'error');
}

function prepararRecuperacao() {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const linkComErro = hashParams.get('error') || hashParams.get('error_code') || hashParams.get('error_description');

  if (linkComErro) {
    exibirErroDoLink();
    return;
  }

  const accessToken = hashParams.get('access_token');
  const tipo = hashParams.get('type');

  if (!accessToken || tipo !== 'recovery') {
    exibirErroDoLink();
    return;
  }

  recoveryAccessToken = accessToken;
  showStatus('Link validado. Agora voce pode definir a nova senha.', 'success');
  window.history.replaceState({}, document.title, window.location.pathname);
}

async function handlePasswordReset(event) {
  event.preventDefault();

  const novaSenha = document.getElementById('nova-senha').value;
  const confirmarSenha = document.getElementById('confirmar-senha').value;

  if (!recoveryAccessToken) {
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
    const response = await fetch(`${API_BASE}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessToken: recoveryAccessToken,
        password: novaSenha,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      showStatus(data.error || 'Nao foi possivel redefinir a senha.', 'error');
      return;
    }

    storage.clearSession();
    showStatus('Senha atualizada com sucesso. Voce ja pode entrar novamente.', 'success');

    window.setTimeout(() => {
      navigation.goTo('login', { replace: true });
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
