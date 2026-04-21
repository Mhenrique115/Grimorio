const API_BASE = window.AppConfig?.API_BASE || 'http://localhost:3333';
const TOKEN = localStorage.getItem('rpg_token');
const ROLE = localStorage.getItem('rpg_role');
const escapeHtml = window.AppUtils?.escapeHtml || ((value) => String(value ?? ''));

const DICE_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const DICE_FACES = [4, 6, 8, 10, 12, 14, 16, 18, 20];

let selectedDiceCount = 1;
let selectedDiceFaces = 20;
let latestChatSignature = '';
let chatPollTimer = null;

if (!TOKEN || ROLE !== 'Mestre') {
  window.location.href = 'login.html';
}

function logout() {
  localStorage.clear();
  window.location.href = 'login.html';
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
  if (!res.ok) throw new Error(data.error || 'Erro');
  return data;
}

function switchTab(event, tabId) {
  document.querySelectorAll('.tab-content').forEach((el) => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach((el) => el.classList.remove('active'));
  document.getElementById(`tab-${tabId}`).classList.add('active');
  event.currentTarget.classList.add('active');

  if (tabId === 'fichas') carregarFichas();
  if (tabId === 'modelos') carregarTemplates();
  if (tabId === 'dados') carregarChatDados();
}

function abrirFicha(id) {
  localStorage.setItem('rpg_ficha_id', id);
  window.location.href = 'ficha.html';
}

function formatTemplateCard(template) {
  const formula = template.formulaLogica
    ? `<div class="template-formula">${escapeHtml(template.formulaLogica)}</div>`
    : '';

  return `
    <article class="template-card">
      <div class="template-card-top">
        <div>
          <div class="template-card-title">${escapeHtml(template.label)}</div>
          <div class="template-card-code">${escapeHtml(template.nome)}</div>
          <div class="template-meta">
            <span class="template-badge">${escapeHtml(template.tipo)}</span>
            <span class="template-badge category">${escapeHtml(template.categoria)}</span>
          </div>
          ${formula}
        </div>
      </div>
    </article>
  `;
}

async function carregarFichas() {
  try {
    const { data } = await apiFetch('/fichas');
    const tbody = document.getElementById('lista-fichas-body');
    const count = document.getElementById('fichas-count');
    tbody.innerHTML = '';
    count.textContent = `${data.length} ${data.length === 1 ? 'ficha' : 'fichas'}`;

    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhuma ficha criada.</td></tr>';
      return;
    }

    data.forEach((ficha) => {
      tbody.innerHTML += `
        <tr>
          <td>${escapeHtml(ficha.nomePersonagem || 'Desconhecido')}</td>
          <td>${escapeHtml(ficha.classe || '-')}</td>
          <td>${escapeHtml(ficha.nomeJogador || '-')}</td>
          <td>${escapeHtml(ficha.user.email)}</td>
          <td><button class="btn-acao" onclick="abrirFicha('${escapeHtml(ficha.id)}')">Ver Ficha</button></td>
        </tr>
      `;
    });
  } catch (err) {
    console.error(err);
    document.getElementById('lista-fichas-body').innerHTML = '<tr><td colspan="5" style="text-align:center;">Nao foi possivel carregar as fichas.</td></tr>';
  }
}

async function carregarTemplates() {
  try {
    const { data } = await apiFetch('/templates');
    const lista = document.getElementById('lista-templates');
    const count = document.getElementById('templates-count');
    count.textContent = `${data.length} ${data.length === 1 ? 'campo' : 'campos'}`;

    if (!data.length) {
      lista.innerHTML = '<div class="empty-state">Nenhum template ativo encontrado.</div>';
      return;
    }

    lista.innerHTML = data.map(formatTemplateCard).join('');
  } catch (err) {
    console.error(err);
    document.getElementById('lista-templates').innerHTML = '<div class="empty-state">Nao foi possivel carregar os templates.</div>';
  }
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
            <span class="dice-author">${escapeHtml(nomeExibicao)}</span>
            <span class="dice-role ${escapeHtml(roleClass)}">${escapeHtml(roll.roleSnapshot)}</span>
          </div>
          <span class="dice-time">${escapeHtml(formatChatTime(roll.createdAt))}</span>
        </div>
        <div class="dice-chat-expression">${escapeHtml(roll.expressao)}</div>
        <div class="dice-chat-result">Resultado total: <strong>${escapeHtml(roll.total)}</strong></div>
        <div class="dice-chat-breakdown">Faces giradas: [${escapeHtml(resultados)}]</div>
      </article>
    `;
  }).join('');

  list.scrollTop = list.scrollHeight;
}

async function carregarChatDados({ silent = false } = {}) {
  try {
    const { data } = await apiFetch('/chat/rolls');
    document.getElementById('dice-retention-info').textContent = `${data.retentionDays} dia(s)`;
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

    document.getElementById('dice-retention-info').textContent = `${data.retentionDays} dia(s)`;
    await carregarChatDados();
  } catch (err) {
    showDiceChatStatus(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Girar agora';
  }
}

function iniciarPollingChat() {
  clearInterval(chatPollTimer);
  chatPollTimer = window.setInterval(() => {
    carregarChatDados({ silent: true });
  }, 4000);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('mestre-email').textContent = localStorage.getItem('rpg_email') || '';
  renderDiceControls();
  carregarFichas();
  carregarChatDados();
  iniciarPollingChat();
});

window.addEventListener('beforeunload', () => {
  clearInterval(chatPollTimer);
});
