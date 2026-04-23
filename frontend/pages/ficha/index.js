const { utils, storage, auth, http, dice, navigation } = window.RPGCore;
const session = auth.requireRole(['Jogador', 'Mestre', 'Admin']);
const FICHA_ID = storage.getFichaId();
const TOKEN = session?.token;
const ROLE = session?.role;
const EMAIL = session?.email || '';
const escapeHtml = utils.escapeHtml;

const CATEGORIA_ICONES = {
  Caracteristica: '◇',
  Habilidade: '◆',
  Inventario: '⊞',
  Lore: '📜',
  Status: '◉',
};

const DICE_COUNTS = dice.DICE_COUNTS;
const DICE_FACES = dice.DICE_FACES;

let selectedDiceCount = 1;
let selectedDiceFaces = 20;
let latestChatSignature = '';
let chatPollTimer = null;
let currentChatRetentionDays = 2;
let estadoCabecalho = {};
const AUTOSAVE_DELAY_MS = 2000;

function voltarPainel() {
  storage.persistFichaId(null);
  if (ROLE === 'Admin') navigation.goTo('admin');
  else if (ROLE === 'Mestre') navigation.goTo('mestre');
  else navigation.goTo('login');
}

function logout() {
  auth.logout();
}

const debounce = utils.debounce;

let toastTimer;
function showToast(msg, tipo = 'success') {
  const el = document.getElementById('toast');
  clearTimeout(toastTimer);
  el.textContent = msg;
  el.className = `show ${tipo}`;
  toastTimer = setTimeout(() => { el.className = tipo; }, 2500);
}

const apiFetch = http.createApiClient({
  tokenProvider: () => TOKEN,
  onUnauthorized: () => auth.logout(),
});

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
  estadoCabecalho = {
    nomePersonagem: ficha.nomePersonagem ?? '',
    classe: ficha.classe ?? '',
    residencia: ficha.residencia ?? '',
    idade: ficha.idade ?? '',
    nomeJogador: ficha.nomeJogador ?? '',
    dataNascimento: ficha.dataNascimento?.split('T')[0] ?? '',
  };

  const campos = [
    { id: 'nomePersonagem', label: 'Nome do Personagem', valor: estadoCabecalho.nomePersonagem, span: true },
    { id: 'classe', label: 'Classe', valor: estadoCabecalho.classe },
    { id: 'residencia', label: 'Residencia', valor: estadoCabecalho.residencia },
    { id: 'idade', label: 'Idade', valor: estadoCabecalho.idade, type: 'number' },
    { id: 'nomeJogador', label: 'Nome do Jogador', valor: estadoCabecalho.nomeJogador },
    { id: 'dataNascimento', label: 'Nascimento', valor: estadoCabecalho.dataNascimento, type: 'date' },
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

function normalizarCampoCabecalho(campo, valor) {
  if (campo === 'idade') {
    if (valor === '') return null;

    const numero = Number.parseInt(valor, 10);
    if (Number.isNaN(numero)) return null;
    return Math.min(100, Math.max(-10, numero));
  }

  if (campo === 'dataNascimento') {
    return valor || null;
  }

  const texto = String(valor ?? '').trim();

  if (campo === 'nomePersonagem') {
    return texto;
  }

  return texto || null;
}

function aplicarValorCabecalhoNoInput(input, valorNormalizado) {
  if (valorNormalizado == null) {
    input.value = '';
    return;
  }

  input.value = String(valorNormalizado);
}

const enviarCampoCabecalho = debounce(async (input) => {
  const campo = input.dataset.campoEstatico;
  if (!campo) return;

  const valorNormalizado = normalizarCampoCabecalho(campo, input.value);

  if (campo === 'nomePersonagem' && !valorNormalizado) {
    input.classList.add('error');
    showToast('Nome do personagem e obrigatorio.', 'error');
    aplicarValorCabecalhoNoInput(input, estadoCabecalho[campo]);
    return;
  }

  if (estadoCabecalho[campo] === valorNormalizado) {
    aplicarValorCabecalhoNoInput(input, valorNormalizado);
    return;
  }

  input.classList.add('saving');
  input.classList.remove('error');

  try {
    const payload = { [campo]: valorNormalizado };
    const response = await apiFetch(`/fichas/${FICHA_ID}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });

    const fichaAtualizada = response.data || {};
    estadoCabecalho[campo] = fichaAtualizada[campo] ?? valorNormalizado;
    aplicarValorCabecalhoNoInput(input, estadoCabecalho[campo]);
    showToast('Cabecalho salvo com sucesso.', 'success');
  } catch (err) {
    input.classList.add('error');
    aplicarValorCabecalhoNoInput(input, estadoCabecalho[campo]);
    showToast(err.message || 'Erro ao salvar cabecalho.', 'error');
  } finally {
    input.classList.remove('saving');
  }
}, AUTOSAVE_DELAY_MS);

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
}, AUTOSAVE_DELAY_MS);

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
}, AUTOSAVE_DELAY_MS);

function registrarEventListeners() {
  document.getElementById('cabecalho-campos').addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.campoEstatico) {
      enviarCampoCabecalho(el);
    }
  });

  document.getElementById('cabecalho-campos').addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.campoEstatico) {
      enviarCampoCabecalho(el);
    }
  });

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

const formatChatTime = dice.formatChatTime;
const buildRollSignature = dice.buildRollSignature;

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
    navigation.goTo('login');
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
