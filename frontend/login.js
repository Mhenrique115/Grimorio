const API_BASE = window.AppConfig?.API_BASE || 'http://localhost:3333';

const ROLE_REDIRECT = {
  Admin: 'admin.html',
  Mestre: 'mestre.html',
};

function persistFichaId(fichaId) {
  if (fichaId) {
    localStorage.setItem('rpg_ficha_id', fichaId);
    return;
  }

  localStorage.removeItem('rpg_ficha_id');
}

function showMessage(msg, kind = 'error') {
  const el = document.getElementById('status-msg');
  el.textContent = msg;
  el.classList.remove('hidden', 'is-error', 'is-success', 'is-info');
  el.classList.add(`is-${kind}`);
}

function hideMessage() {
  document.getElementById('status-msg').classList.add('hidden');
}

function getRedirectForRole(role) {
  if (ROLE_REDIRECT[role]) {
    return ROLE_REDIRECT[role];
  }

  if (role === 'Jogador') {
    const fichaId = localStorage.getItem('rpg_ficha_id');
    return fichaId ? 'ficha.html' : null;
  }

  return null;
}

async function resolveJogadorFichaId(token) {
  const response = await fetch(`${API_BASE}/fichas/minha`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 404) {
    persistFichaId(null);
    return null;
  }

  if (response.status === 401) {
    localStorage.clear();
    return null;
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Nao foi possivel localizar a ficha do jogador.');
  }

  const fichaId = data?.data?.id ?? null;
  persistFichaId(fichaId);
  return fichaId;
}

(async function checkExistingSession() {
  const token = localStorage.getItem('rpg_token');
  const role = localStorage.getItem('rpg_role');
  let destino = getRedirectForRole(role);

  if (token && role === 'Jogador' && !destino) {
    try {
      const fichaId = await resolveJogadorFichaId(token);
      if (fichaId) {
        destino = 'ficha.html';
      }
    } catch (err) {
      console.error('Erro ao recuperar ficha do jogador:', err);
    }
  }

  if (token && destino) {
    window.location.replace(destino);
  }
})();

function setLoading(loading) {
  const btn = document.getElementById('btn-entrar');
  btn.disabled = loading;
  btn.textContent = loading ? 'Invocando...' : 'Adentrar o Grimorio';
}

function setForgotPasswordLoading(loading) {
  const btn = document.getElementById('btn-esqueci-senha');
  btn.disabled = loading;
  btn.textContent = loading ? 'Enviando...' : 'Esqueci minha senha';
}

async function handleForgotPassword() {
  const email = document.getElementById('email').value.trim();

  if (!email) {
    showMessage('Informe o email para receber o link de redefinicao.', 'error');
    return;
  }

  setForgotPasswordLoading(true);

  try {
    const response = await fetch(`${API_BASE}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    const data = await response.json();

    if (!response.ok) {
      showMessage(data.error || 'Nao foi possivel enviar o email de recuperacao.', 'error');
      return;
    }

    showMessage('Se o email existir, enviaremos um link para redefinir a senha.', 'success');
  } catch (err) {
    console.error('Erro ao solicitar recuperacao de senha:', err);
    showMessage('Nao foi possivel falar com o servidor agora. Tente novamente.', 'error');
  } finally {
    setForgotPasswordLoading(false);
  }
}

async function handleLogin() {
  hideMessage();

  const email = document.getElementById('email').value.trim();
  const senha = document.getElementById('senha').value;

  if (!email || !senha) {
    showMessage('Preencha e-mail e senha para prosseguir.', 'error');
    return;
  }

  setLoading(true);

  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: senha }),
    });

    const data = await response.json();

    if (!response.ok) {
      showMessage(data.error || 'Credenciais invalidas. Verifique os seus dados.', 'error');
      return;
    }

    localStorage.setItem('rpg_token', data.token);
    localStorage.setItem('rpg_role', data.user.role);
    localStorage.setItem('rpg_user_id', data.user.id);
    localStorage.setItem('rpg_email', data.user.email);
    persistFichaId(data.fichaId);

    const destino = getRedirectForRole(data.user.role);
    if (!destino) {
      showMessage('Nenhuma ficha foi encontrada para este jogador. Peca ao mestre para criar ou vincular uma ficha.', 'error');
      return;
    }

    window.location.replace(destino);
  } catch (err) {
    console.error('Erro ao fazer login:', err);
    showMessage('Nao foi possivel ligar ao servidor. Tente novamente.', 'error');
  } finally {
    setLoading(false);
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleLogin();
});
