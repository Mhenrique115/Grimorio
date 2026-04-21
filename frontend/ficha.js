const API_BASE = 'http://localhost:3333';
const FICHA_ID = localStorage.getItem('rpg_ficha_id');
const TOKEN = localStorage.getItem('rpg_token');
const ROLE = localStorage.getItem('rpg_role');
const EMAIL = localStorage.getItem('rpg_email') || '';
const escapeHtml = window.AppUtils?.escapeHtml || ((value) => String(value ?? ''));

const CATEGORIA_ICONES = {
  Caracteristica: '◇',
  Habilidade: '◆',
  Inventario: '⊞',
  Lore: '📜',
  Status: '◉',
};

const DICE_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const DICE_FACES = [4, 6, 8, 10, 12, 14, 16, 18, 20];

let selectedDiceCount = 1;
let selectedDiceFaces = 20;
let latestChatSignature = '';
let chatPollTimer = null;
let currentChatRetentionDays = 2;

if (!TOKEN) window.location.href = 'login.html';

function voltarPainel() {
  localStorage.removeItem('rpg_ficha_id');
  if (ROLE === 'Admin') window.location.href = 'admin.html';
  else if (ROLE === 'Mestre') window.location.href = 'mestre.html';
  else window.location.href = 'login.html';
}

function logout() {
  localStorage.clear();
  window.location.href = 'login.html';
}

function debounce(fn, ms = 500) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

let toastTimer;
function showToast(msg, tipo = 'success') {
  const el = document.getElementById('toast');
  clearTimeout(toastTimer);
  el.textContent = msg;
  el.className = `show ${tipo}`;
  toastTimer = setTimeout(() => { el.className = tipo; }, 2500);
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    localStorage.clear();
    window.location.href = 'login.html';
    throw new Error('Sessao expirada.');
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erro na requisicao');
  return data;
}

let estadoValores = {};

function switchFichaTab(tabId) {
  document.querySelectorAll('.ficha-tab-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.tabTarget === tabId);
  });

  document.querySelectorAll('.ficha-tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `tab-${tabId}`);
  });

  if (tabId === 'dados') {
    carregarChatDados();
  }
}

function renderizarCabecalho(ficha) {
  const campos = [
    { id: 'nomePersonagem', label: 'Nome do Personagem', valor: ficha.nomePersonagem, span: true },
    { id: 'classe', label: 'Classe', valor: ficha.classe },
    { id: 'residencia', label: 'Residencia', valor: ficha.residencia },
    { id: 'idade', label: 'Idade', valor: ficha.idade, type: 'number' },
    { id: 'nomeJogador', label: 'Nome do Jogador', valor: ficha.nomeJogador },
    { id: 'dataNascimento', label: 'Nascimento', valor: ficha.dataNascimento?.split('T')[0], type: 'date' },
  ];

  const grid = document.getElementById('cabecalho-campos');
  grid.innerHTML = '';

  for (const campo of campos) {
    const wrapper = document.createElement('div');
    if (campo.span) wrapper.style.gridColumn = 'span 2';

    wrapper.innerHTML = `
      <p class="campo-label">${escapeHtml(campo.label)}</p>
      <input
        class="input-header"
        type="${campo.type || 'text'}"
        value="${escapeHtml(campo.valor ?? '')}"
        data-campo-estatico="${escapeHtml(campo.id)}"
      />
    `;
    grid.appendChild(wrapper);
  }
}

function renderizarFicha(ficha) {
  for (const v of ficha.valoresCampo) {
    estadoValores[v.templateId] = v;
  }

  const porCategoria = {};
  for (const v of ficha.valoresCampo) {
    const categoria = v.template.categoria;
    if (!porCategoria[categoria]) porCategoria[categoria] = [];
    porCategoria[categoria].push(v);
  }

  const container = document.getElementById('secoes-dinamicas');
  container.innerHTML = '';

  for (const [categoria, valores] of Object.entries(porCategoria)) {
    const secao = document.createElement('div');
    secao.className = 'secao';

    const temTextarea = valores.some((v) => v.template.tipo === 'Textarea');

    secao.innerHTML = `
      <div class="secao-header">
        <span style="color: var(--sepia)">${CATEGORIA_ICONES[categoria] || '◇'}</span>
        <span class="secao-title">${categoria}</span>
      </div>
      <div class="secao-body ${temTextarea ? 'full-width' : ''}" id="secao-${categoria}">
      </div>
    `;

    container.appendChild(secao);
    const body = secao.querySelector(`#secao-${categoria}`);

    for (const v of valores) {
      body.appendChild(criarCampo(v));
    }
  }
}

function criarCampo(valorCampo) {
  const { template } = valorCampo;
  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-template-id', template.id);

  const labelHtml = `
    <p class="campo-label">
      ${template.label}
      ${template.descricao
        ? `<span class="descricao-icon" title="${template.descricao}">ℹ</span>`
        : ''}
    </p>
  `;

  switch (template.tipo) {
    case 'Fixo':
      wrapper.innerHTML = `
        ${labelHtml}
        <input class="input-fixo" type="number" min="-10" max="100" value="${valorCampo.valorBase ?? 0}" data-tipo="fixo" data-template-id="${template.id}" />
        <div class="submultiplos">
          <div><p class="submultiplo-label">1/2 (50%)</p><input class="input-submultiplo" type="text" readonly value="${valorCampo.valorMetade ?? 0}" data-submultiplo="metade" data-template-id="${template.id}" /></div>
          <div><p class="submultiplo-label">1/5 (20%)</p><input class="input-submultiplo" type="text" readonly value="${valorCampo.valorQuinto ?? 0}" data-submultiplo="quinto" data-template-id="${template.id}" /></div>
        </div>
      `;
      break;
    case 'Calculado':
      wrapper.innerHTML = `
        ${labelHtml}
        <input class="input-calculado" type="text" readonly value="${valorCampo.valorBase ?? 0}" data-tipo="calculado" data-template-id="${template.id}" title="Campo calculado automaticamente pelo servidor" />
        <div class="submultiplos">
          <div><p class="submultiplo-label">1/2 (50%)</p><input class="input-submultiplo" type="text" readonly value="${valorCampo.valorMetade ?? 0}" data-submultiplo="metade" data-template-id="${template.id}" /></div>
          <div><p class="submultiplo-label">1/5 (20%)</p><input class="input-submultiplo" type="text" readonly value="${valorCampo.valorQuinto ?? 0}" data-submultiplo="quinto" data-template-id="${template.id}" /></div>
        </div>
      `;
      break;
    case 'Textarea':
      wrapper.innerHTML = `
        ${labelHtml}
        <textarea class="textarea-rpg" data-tipo="textarea" data-template-id="${template.id}" rows="4">${valorCampo.valorTexto ?? ''}</textarea>
      `;
      break;
    case 'Checkbox':
      wrapper.innerHTML = `
        <div class="checkbox-wrapper">
          <input class="checkbox-rpg" type="checkbox" ${valorCampo.valorBooleano ? 'checked' : ''} data-tipo="checkbox" data-template-id="${template.id}" />
          <p class="campo-label" style="margin:0">${template.label}</p>
        </div>
      `;
      break;
  }

  return wrapper;
}

function atualizarCamposNaTela(valoresAtualizados) {
  for (const v of valoresAtualizados) {
    const inputCalculado = document.querySelector(`[data-tipo="calculado"][data-template-id="${v.templateId}"]`);
    if (inputCalculado) inputCalculado.value = v.valorBase;

    const metade = document.querySelector(`[data-submultiplo="metade"][data-template-id="${v.templateId}"]`);
    const quinto = document.querySelector(`[data-submultiplo="quinto"][data-template-id="${v.templateId}"]`);

    if (metade) metade.value = v.valorMetade;
    if (quinto) quinto.value = v.valorQuinto;
  }
}

const enviarValorNumerico = debounce(async (input, templateId) => {
  const valorBase = parseInt(input.value, 10);
  if (Number.isNaN(valorBase)) return;
  if (valorBase < -10) input.value = '-10';
  if (valorBase > 100) input.value = '100';

  const valorNormalizado = Math.min(100, Math.max(-10, parseInt(input.value, 10)));

  input.classList.add('saving');
  input.classList.remove('error');

  try {
    const data = await apiFetch(`/fichas/${FICHA_ID}/valores`, {
      method: 'PATCH',
      body: JSON.stringify({ templateId, valorBase: valorNormalizado }),
    });

    atualizarCamposNaTela(data.data.valoresAtualizados);
    showToast('Salvo com sucesso.', 'success');
  } catch (err) {
    input.classList.add('error');
    showToast('Erro ao salvar.', 'error');
  } finally {
    input.classList.remove('saving');
  }
}, 500);

const enviarTexto = debounce(async (textarea, templateId) => {
  textarea.classList.add('saving');
  try {
    await apiFetch(`/fichas/${FICHA_ID}/valores`, {
      method: 'PATCH',
      body: JSON.stringify({ templateId, valorTexto: textarea.value }),
    });
    showToast('Salvo com sucesso.', 'success');
  } catch (err) {
    showToast('Erro ao salvar.', 'error');
  } finally {
    textarea.classList.remove('saving');
  }
}, 800);

function registrarEventListeners() {
  document.getElementById('secoes-dinamicas').addEventListener('input', (e) => {
    const el = e.target;
    const tipo = el.dataset.tipo;
    const templateId = el.dataset.templateId;
    if (!templateId) return;

    if (tipo === 'fixo') enviarValorNumerico(el, templateId);
    else if (tipo === 'textarea') enviarTexto(el, templateId);
  });

  document.getElementById('secoes-dinamicas').addEventListener('change', async (e) => {
    const el = e.target;
    const templateId = el.dataset.templateId;

    if (el.dataset.tipo === 'checkbox' && templateId) {
      try {
        await apiFetch(`/fichas/${FICHA_ID}/valores`, {
          method: 'PATCH',
          body: JSON.stringify({ templateId, valorBooleano: el.checked }),
        });
        showToast('Salvo com sucesso.', 'success');
      } catch {
        showToast('Erro ao salvar.', 'error');
        el.checked = !el.checked;
      }
    }
  });
}

function renderDiceControls() {
  const countGrid = document.getElementById('dice-count-grid');
  const facesGrid = document.getElementById('dice-faces-grid');

  countGrid.innerHTML = DICE_COUNTS.map((count) => `
    <button
      type="button"
      class="dice-btn ${count === selectedDiceCount ? 'active' : ''}"
      onclick="selectDiceCount(${count})"
    >
      x${count}
    </button>
  `).join('');

  facesGrid.innerHTML = DICE_FACES.map((faces) => `
    <button
      type="button"
      class="dice-btn ${faces === selectedDiceFaces ? 'active' : ''}"
      onclick="selectDiceFaces(${faces})"
    >
      D${faces}
    </button>
  `).join('');

  updateDicePreview();
}

function selectDiceCount(count) {
  selectedDiceCount = count;
  renderDiceControls();
}

function selectDiceFaces(faces) {
  selectedDiceFaces = faces;
  renderDiceControls();
}

function updateDicePreview() {
  const preview = document.getElementById('dice-preview');
  preview.textContent = selectedDiceCount === 1
    ? `D${selectedDiceFaces}`
    : `${selectedDiceCount}xD${selectedDiceFaces}`;
}

function showDiceChatStatus(message, type = 'info') {
  const el = document.getElementById('dice-chat-status');
  el.textContent = message;
  el.className = `dice-chat-status ${type}`.trim();
}

function hideDiceChatStatus() {
  const el = document.getElementById('dice-chat-status');
  el.textContent = '';
  el.className = 'dice-chat-status hidden';
}

function formatChatTime(dateValue) {
  return new Date(dateValue).toLocaleString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
}

function buildRollSignature(rolls) {
  return rolls.map((roll) => `${roll.id}:${roll.total}`).join('|');
}

function renderDiceChat(rolls) {
  const list = document.getElementById('dice-chat-list');

  if (!rolls.length) {
    list.innerHTML = '<div class="dice-empty-state">Aguardando a primeira rolagem do grupo.</div>';
    return;
  }

  list.innerHTML = rolls.map((roll) => {
    const resultados = roll.resultados.join(', ');
    const roleClass = (roll.roleSnapshot || 'Jogador').toLowerCase();
    const nomeExibicao = roll.user.nomePersonagem || roll.user.email;
    return `
      <article class="dice-chat-item">
        <div class="dice-chat-top">
          <div>
            <span class="dice-author">${nomeExibicao}</span>
            <span class="dice-role ${roleClass}">${roll.roleSnapshot}</span>
          </div>
          <span class="dice-time">${formatChatTime(roll.createdAt)}</span>
        </div>
        <div class="dice-chat-expression">${roll.expressao}</div>
        <div class="dice-chat-result">Resultado total: <strong>${roll.total}</strong></div>
        <div class="dice-chat-breakdown">Faces giradas: [${resultados}]</div>
      </article>
    `;
  }).join('');

  list.scrollTop = list.scrollHeight;
}

async function carregarChatDados({ silent = false } = {}) {
  try {
    const { data } = await apiFetch('/chat/rolls');
    currentChatRetentionDays = data.retentionDays;
    document.getElementById('dice-retention-info').textContent = `${currentChatRetentionDays} dia(s)`;
    const signature = buildRollSignature(data.rolls);

    if (signature !== latestChatSignature) {
      latestChatSignature = signature;
      renderDiceChat(data.rolls);
    }

    if (!silent) {
      hideDiceChatStatus();
    }
  } catch (err) {
    if (!silent) {
      showDiceChatStatus(err.message, 'error');
    }
  }
}

async function girarDados() {
  const btn = document.getElementById('btn-roll-dice');
  btn.disabled = true;
  btn.textContent = 'Girando...';

  try {
    const { data } = await apiFetch('/chat/rolls', {
      method: 'POST',
      body: JSON.stringify({
        quantidade: selectedDiceCount,
        faces: selectedDiceFaces,
      }),
    });

    currentChatRetentionDays = data.retentionDays;
    document.getElementById('dice-retention-info').textContent = `${currentChatRetentionDays} dia(s)`;
    showToast(`Rolagem concluida: ${data.roll.total}`, 'success');
    await carregarChatDados();
  } catch (err) {
    showDiceChatStatus(err.message, 'error');
    showToast('Nao foi possivel girar o dado.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Girar agora';
  }
}

async function limparChatDados() {
  const confirmed = window.confirm('Limpar todo o historico de giro de dados?');
  if (!confirmed) return;

  try {
    await apiFetch('/chat/rolls', { method: 'DELETE' });
    latestChatSignature = '';
    await carregarChatDados();
    showToast('Historico limpo com sucesso.', 'success');
  } catch (err) {
    showDiceChatStatus(err.message, 'error');
    showToast('Nao foi possivel limpar o historico.', 'error');
  }
}

function iniciarPollingChat() {
  clearInterval(chatPollTimer);
  chatPollTimer = window.setInterval(() => {
    carregarChatDados({ silent: true });
  }, 4000);
}

async function init() {
  if (!FICHA_ID) {
    alert('Nenhuma ficha selecionada. Redirecionando...');
    window.location.href = 'login.html';
    return;
  }

  try {
    const { data: ficha } = await apiFetch(`/fichas/${FICHA_ID}`);
    renderizarCabecalho(ficha);
    renderizarFicha(ficha);
    registrarEventListeners();
    renderDiceControls();
    await carregarChatDados();
    iniciarPollingChat();

    if (ROLE === 'Admin') {
      document.getElementById('btn-clear-chat').classList.remove('hidden');
    }

    document.getElementById('loading-overlay').style.display = 'none';
    document.getElementById('ficha-main').style.display = 'block';
  } catch (err) {
    console.error('Erro ao carregar ficha:', err);
    document.querySelector('#loading-overlay p').textContent = 'Erro ao carregar a ficha.';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('user-email-display').textContent = EMAIL;

  if (ROLE === 'Admin' || ROLE === 'Mestre') {
    document.getElementById('btn-voltar').style.display = 'inline-block';
  }

  init();
});

window.addEventListener('beforeunload', () => {
  clearInterval(chatPollTimer);
});
