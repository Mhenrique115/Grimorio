const API_BASE = window.AppConfig?.API_BASE || 'http://localhost:3333';
const TOKEN = localStorage.getItem('rpg_token');
const escapeHtml = window.AppUtils?.escapeHtml || ((value) => String(value ?? ''));

if (!TOKEN || localStorage.getItem('rpg_role') !== 'Admin') {
  alert('Acesso negado.');
  window.location.href = 'login.html';
}

let templates = [];
let formulaTokens = [];
let editingTemplateId = null;
let categoriaFiltroAtiva = 'todas';
let selectedDiceCount = 1;
let selectedDiceFaces = 20;
let latestChatSignature = '';
let chatPollTimer = null;

const FUNCTION_NAMES = new Set(['round']);
const DICE_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const DICE_FACES = [4, 6, 8, 10, 12, 14, 16, 18, 20];
let modalResolver = null;

function logout() {
  localStorage.clear();
  window.location.href = 'login.html';
}

function closeModal(result = false) {
  document.getElementById('app-modal-overlay').classList.add('hidden');
  if (modalResolver) {
    modalResolver(result);
    modalResolver = null;
  }
}

function openModal({
  title = 'Aviso',
  message = '',
  confirmText = 'OK',
  cancelText = 'Cancelar',
  showCancel = true,
}) {
  document.getElementById('app-modal-title').textContent = title;
  document.getElementById('app-modal-message').textContent = message;

  const cancelBtn = document.getElementById('app-modal-cancel');
  const confirmBtn = document.getElementById('app-modal-confirm');

  cancelBtn.textContent = cancelText;
  confirmBtn.textContent = confirmText;
  cancelBtn.classList.toggle('hidden', !showCancel);

  document.getElementById('app-modal-overlay').classList.remove('hidden');

  return new Promise((resolve) => {
    modalResolver = resolve;
  });
}

function showDialog(message, title = 'Aviso') {
  return openModal({
    title,
    message,
    confirmText: 'OK',
    showCancel: false,
  });
}

function showConfirm(message, title = 'Confirmar') {
  return openModal({
    title,
    message,
    confirmText: 'Confirmar',
    cancelText: 'Cancelar',
    showCancel: true,
  });
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

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erro');
  return data;
}

function switchTab(e, tabId) {
  document.querySelectorAll('.tab-content').forEach((el) => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach((el) => el.classList.remove('active'));
  document.getElementById(`tab-${tabId}`).classList.add('active');
  e.currentTarget.classList.add('active');

  if (tabId === 'usuarios') carregarUsuarios();
  if (tabId === 'fichas') carregarFichas();
  if (tabId === 'dados') carregarChatDados();
}

function showFormStatus(message, type = 'info') {
  const el = document.getElementById('template-form-status');
  el.textContent = message;
  el.className = `form-status${type === 'error' ? ' error' : ''}`;
}

function showUserFormStatus(message, type = 'info') {
  const el = document.getElementById('user-form-status');
  el.textContent = message;
  el.className = `form-status${type === 'error' ? ' error' : ''}`;
}

function hideUserFormStatus() {
  const el = document.getElementById('user-form-status');
  el.textContent = '';
  el.className = 'form-status hidden';
}

function showChatConfigStatus(message, type = 'info') {
  const el = document.getElementById('chat-config-status');
  el.textContent = message;
  el.className = `form-status${type === 'error' ? ' error' : ''}`;
}

function hideChatConfigStatus() {
  const el = document.getElementById('chat-config-status');
  el.textContent = '';
  el.className = 'form-status hidden';
}

function hideFormStatus() {
  const el = document.getElementById('template-form-status');
  el.textContent = '';
  el.className = 'form-status hidden';
}

function getNumericTemplates(excludeId = null) {
  return templates.filter((template) => {
    const numeric = template.tipo === 'Fixo' || template.tipo === 'Calculado';
    return numeric && template.id !== excludeId;
  });
}

function createFieldToken(template) {
  return {
    type: 'field',
    value: template.nome,
    label: template.nome,
  };
}

function createOperatorToken(operator) {
  return { type: 'operator', value: operator };
}

function createParenToken(value) {
  return { type: 'paren', value };
}

function createNumberToken(value) {
  return { type: 'number', value };
}

function createFunctionToken(value) {
  return { type: 'function', value };
}

function getLastToken() {
  return formulaTokens[formulaTokens.length - 1] || null;
}

function canStartValue() {
  const last = getLastToken();
  if (!last) return true;
  if (last.type === 'operator') return true;
  return last.type === 'paren' && last.value === '(';
}

function canCloseParen() {
  const balance = formulaTokens.reduce((total, token) => {
    if (token.type !== 'paren') return total;
    return total + (token.value === '(' ? 1 : -1);
  }, 0);

  if (balance <= 0) return false;

  const last = getLastToken();
  return !!last && (last.type === 'number' || last.type === 'field' || (last.type === 'paren' && last.value === ')'));
}

function endsWithValueToken() {
  const last = getLastToken();
  return !!last && (last.type === 'number' || last.type === 'field' || (last.type === 'paren' && last.value === ')'));
}

function formulaHasBalancedParens() {
  let balance = 0;
  for (const token of formulaTokens) {
    if (token.type === 'paren') {
      balance += token.value === '(' ? 1 : -1;
      if (balance < 0) return false;
    }
  }
  return balance === 0;
}

function isFormulaComplete() {
  if (!formulaTokens.length || !formulaHasBalancedParens()) return false;
  return endsWithValueToken();
}

function getFormulaString() {
  return formulaTokens.map((token) => token.value).join(' ');
}

function getFormulaValidationMessage() {
  if (!formulaTokens.length) {
    return { text: 'Aguardando montagem', className: '' };
  }

  if (!formulaHasBalancedParens()) {
    return { text: 'Parenteses incompletos', className: 'invalid' };
  }

  if (!isFormulaComplete()) {
    return { text: 'Continue a expressao', className: 'invalid' };
  }

  return { text: 'Expressao pronta', className: 'valid' };
}

function renderFormulaValidation() {
  const el = document.getElementById('formula-validation');
  const status = getFormulaValidationMessage();
  el.textContent = status.text;
  el.className = `formula-validation ${status.className}`.trim();
}

function renderCalcDisplay() {
  const display = document.getElementById('calc-display');

  if (formulaTokens.length === 0) {
    display.innerHTML = '<span style="color:rgba(240,230,211,0.3);font-size:0.8rem;font-family:\'Crimson Pro\',serif;">Selecione um campo ou numero para iniciar a formula.</span>';
    renderFormulaValidation();
    return;
  }

  display.innerHTML = formulaTokens.map((token) => {
    if (token.type === 'field') return `<span class="calc-token">${token.label}</span>`;
    if (token.type === 'number') return `<span class="calc-number">${token.value}</span>`;
    if (token.type === 'function') return `<span class="calc-token">${token.value}</span>`;
    return `<span class="calc-operator">${token.value}</span>`;
  }).join('');

  renderFormulaValidation();
}

function parseFormulaToTokens(formula) {
  if (!formula) return [];

  const availableFieldNames = new Set(getNumericTemplates().map((template) => template.nome));
  const parts = formula.match(/(?:\d+\.\d+|\d+|[^\s()+\-*/]+|[()+\-*/])/g) || [];

  return parts.map((part) => {
    if (FUNCTION_NAMES.has(part)) return createFunctionToken(part);
    if (['+', '-', '*', '/'].includes(part)) return createOperatorToken(part);
    if (part === '(' || part === ')') return createParenToken(part);
    if (!Number.isNaN(Number(part))) return createNumberToken(part);
    if (availableFieldNames.has(part)) return { type: 'field', value: part, label: part };
    return { type: 'field', value: part, label: part };
  });
}

function calcAddFunction(functionName) {
  if (!canStartValue()) {
    showFormStatus('Use uma funcao apenas no inicio da expressao ou depois de um operador.', 'error');
    return;
  }

  hideFormStatus();
  formulaTokens.push(createFunctionToken(functionName));
  formulaTokens.push(createParenToken('('));
  renderCalcDisplay();
}

function renderAvailableFields() {
  const container = document.getElementById('lista-nomes-campos');
  const excludeId = editingTemplateId;
  const numericos = getNumericTemplates(excludeId);
  container.innerHTML = '';

  if (!numericos.length) {
    container.innerHTML = '<div class="empty-state">Crie um campo numerico antes de montar uma formula calculada.</div>';
    return;
  }

  numericos.forEach((template) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'calc-btn variable';
    btn.textContent = template.nome;
    btn.onclick = () => calcAddField(template.id);
    container.appendChild(btn);
  });
}

function onTipoChange() {
  const isCalculado = document.getElementById('f-tipo').value === 'Calculado';
  document.getElementById('formula-group').style.display = isCalculado ? 'block' : 'none';
  renderCalcDisplay();
}

function calcAddField(templateId) {
  const template = templates.find((item) => item.id === templateId);
  if (!template) return;
  if (!canStartValue()) {
    showFormStatus('Depois de um campo ou numero, use um operador antes de inserir outro valor.', 'error');
    return;
  }

  hideFormStatus();
  formulaTokens.push(createFieldToken(template));
  renderCalcDisplay();
}

function calcAddDigit(digit) {
  const last = getLastToken();

  if (!last) {
    formulaTokens.push(createNumberToken(digit));
    renderCalcDisplay();
    return;
  }

  if (last.type === 'number') {
    last.value += digit;
    renderCalcDisplay();
    return;
  }

  if (!canStartValue()) {
    showFormStatus('Use um operador antes de iniciar um novo numero.', 'error');
    return;
  }

  hideFormStatus();
  formulaTokens.push(createNumberToken(digit));
  renderCalcDisplay();
}

function calcAddDecimal() {
  const last = getLastToken();

  if (!last) {
    formulaTokens.push(createNumberToken('0.'));
    renderCalcDisplay();
    return;
  }

  if (last.type === 'number') {
    if (last.value.includes('.')) {
      showFormStatus('Este numero ja possui parte decimal.', 'error');
      return;
    }
    last.value += '.';
    renderCalcDisplay();
    return;
  }

  if (!canStartValue()) {
    showFormStatus('Use um operador antes de iniciar um novo numero decimal.', 'error');
    return;
  }

  hideFormStatus();
  formulaTokens.push(createNumberToken('0.'));
  renderCalcDisplay();
}

function calcAddOperator(operator) {
  if (!endsWithValueToken()) {
    showFormStatus('Complete um valor antes de inserir um operador.', 'error');
    return;
  }

  hideFormStatus();
  formulaTokens.push(createOperatorToken(operator));
  renderCalcDisplay();
}

function calcAddParen(paren) {
  if (paren === '(') {
    if (!canStartValue()) {
      showFormStatus('Abra parenteses apenas no inicio da expressao ou depois de um operador.', 'error');
      return;
    }
    hideFormStatus();
    formulaTokens.push(createParenToken('('));
    renderCalcDisplay();
    return;
  }

  if (!canCloseParen()) {
    showFormStatus('Feche parenteses apenas depois de um valor valido.', 'error');
    return;
  }

  hideFormStatus();
  formulaTokens.push(createParenToken(')'));
  renderCalcDisplay();
}

function calcAction(action) {
  hideFormStatus();

  if (action === 'clear') {
    formulaTokens = [];
    renderCalcDisplay();
    return;
  }

  if (action === 'back') {
    const last = getLastToken();
    if (!last) return;

    if (last.type === 'number' && last.value.length > 1) {
      last.value = last.value.slice(0, -1);
      if (last.value === '-' || last.value === '') {
        formulaTokens.pop();
      }
    } else {
      formulaTokens.pop();
    }
    renderCalcDisplay();
  }
}

function resetForm() {
  editingTemplateId = null;
  formulaTokens = [];
  document.getElementById('f-nome').value = '';
  document.getElementById('f-label').value = '';
  document.getElementById('f-tipo').value = 'Fixo';
  document.getElementById('f-categoria').value = 'Caracteristica';
  document.getElementById('template-form-title').textContent = 'Criar Campo';
  document.getElementById('btn-template-submit').textContent = 'Forjar Campo';
  document.getElementById('btn-template-cancel').classList.add('hidden');
  hideFormStatus();
  onTipoChange();
  renderAvailableFields();
  renderCalcDisplay();
}

function onCategoriaFilterChange() {
  categoriaFiltroAtiva = document.getElementById('templates-filter-categoria').value;
  renderTemplateList();
}

function cancelarEdicao() {
  resetForm();
}

function preencherFormulario(templateId) {
  const template = templates.find((item) => item.id === templateId);
  if (!template) return;

  editingTemplateId = template.id;
  document.getElementById('f-nome').value = template.nome;
  document.getElementById('f-label').value = template.label;
  document.getElementById('f-tipo').value = template.tipo;
  document.getElementById('f-categoria').value = template.categoria;
  formulaTokens = template.formulaLogica ? parseFormulaToTokens(template.formulaLogica) : [];

  document.getElementById('template-form-title').textContent = `Editar Campo: ${template.label}`;
  document.getElementById('btn-template-submit').textContent = 'Salvar Alteracoes';
  document.getElementById('btn-template-cancel').classList.remove('hidden');
  showFormStatus('Modo edicao ativo. Voce pode alterar nome, label, tipo e formula.', 'info');
  onTipoChange();
  renderAvailableFields();
  renderCalcDisplay();
  window.scrollTo({ top: 0, behavior: 'smooth' });
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
        <div class="template-actions">
          <button class="btn-acao-soft" onclick="preencherFormulario('${escapeHtml(template.id)}')">Alterar</button>
          <button class="btn-acao-danger" onclick="excluirTemplate('${escapeHtml(template.id)}')">Excluir</button>
        </div>
      </div>
    </article>
  `;
}

function getTemplatesFiltrados() {
  if (categoriaFiltroAtiva === 'todas') return templates;
  return templates.filter((template) => template.categoria === categoriaFiltroAtiva);
}

function renderTemplateList() {
  const lista = document.getElementById('lista-templates');
  const count = document.getElementById('templates-count');
  const filtrados = getTemplatesFiltrados();

  count.textContent = `${filtrados.length} ${filtrados.length === 1 ? 'campo' : 'campos'}`;

  if (!filtrados.length) {
    lista.innerHTML = '<div class="empty-state">Nenhum template encontrado para esta categoria.</div>';
    return;
  }

  lista.innerHTML = filtrados.map(formatTemplateCard).join('');
}

async function carregarTemplates() {
  try {
    const { data } = await apiFetch('/templates');
    templates = data;
    renderTemplateList();

    renderAvailableFields();
    renderCalcDisplay();
  } catch (e) {
    console.error(e);
    document.getElementById('lista-templates').innerHTML = '<div class="empty-state">Nao foi possivel carregar os templates.</div>';
  }
}

function buildTemplatePayload() {
  const tipo = document.getElementById('f-tipo').value;
  const payload = {
    nome: document.getElementById('f-nome').value.trim(),
    label: document.getElementById('f-label').value.trim(),
    tipo,
    categoria: document.getElementById('f-categoria').value,
    formulaLogica: tipo === 'Calculado' ? getFormulaString() : null,
    ordem: 0,
  };

  if (!payload.nome || !payload.label) {
    throw new Error('Preencha nome e label antes de salvar.');
  }

  if (tipo === 'Calculado') {
    if (!formulaTokens.length) {
      throw new Error('Monte a formula antes de salvar o campo calculado.');
    }

    if (!isFormulaComplete()) {
      throw new Error('A formula ainda esta incompleta. Finalize a expressao antes de salvar.');
    }
  }

  return payload;
}

async function submitTemplate() {
  try {
    hideFormStatus();
    const payload = buildTemplatePayload();
    const successMessage = editingTemplateId
      ? 'Campo atualizado com sucesso.'
      : 'Campo forjado com sucesso.';

    if (editingTemplateId) {
      await apiFetch(`/templates/${editingTemplateId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    } else {
      await apiFetch('/templates', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }

    await carregarTemplates();
    resetForm();
    showFormStatus(successMessage);
  } catch (err) {
    showFormStatus(err.message, 'error');
  }
}

async function excluirTemplate(templateId) {
  const template = templates.find((item) => item.id === templateId);
  if (!template) return;

  const confirmed = await showConfirm(`Excluir o campo "${template.label}"?`, 'Excluir campo');
  if (!confirmed) return;

  try {
    await apiFetch(`/templates/${templateId}`, { method: 'DELETE' });
    if (editingTemplateId === templateId) resetForm();
    await carregarTemplates();
    showFormStatus('Campo excluido com sucesso.');
  } catch (err) {
    showFormStatus(err.message, 'error');
  }
}

async function carregarFichas() {
  try {
    const { data } = await apiFetch('/fichas');
    const tbody = document.getElementById('lista-fichas-body');
    tbody.innerHTML = '';
    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhuma ficha criada.</td></tr>';
      return;
    }

    data.forEach((f) => {
      tbody.innerHTML += `<tr><td>${escapeHtml(f.nomePersonagem || 'Desconhecido')}</td><td>${escapeHtml(f.classe || '-')}</td><td>${escapeHtml(f.nomeJogador || '-')}</td><td>${escapeHtml(f.user.email)}</td><td><button class="btn-acao" onclick="abrirFicha('${escapeHtml(f.id)}')">Ver Ficha</button></td></tr>`;
    });
  } catch (err) {
    console.error(err);
  }
}

function abrirFicha(id) {
  localStorage.setItem('rpg_ficha_id', id);
  window.location.href = 'ficha.html';
}

async function carregarUsuarios() {
  try {
    const { data } = await apiFetch('/users');
    const tbody = document.getElementById('lista-usuarios-body');
    tbody.innerHTML = '';
    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum usuario encontrado.</td></tr>';
      return;
    }

    data.forEach((u) => {
      const dataFormatada = new Date(u.createdAt).toLocaleDateString('pt-BR');
      tbody.innerHTML += `<tr><td>${escapeHtml(u.email)}</td><td>${escapeHtml(dataFormatada)}</td><td>
        <select class="role-select" onchange="mudarRole('${escapeHtml(u.id)}', this.value)" ${u.email === localStorage.getItem('rpg_email') ? 'disabled title="Nao pode mudar o proprio cargo"' : ''}>
          <option value="Jogador" ${u.role === 'Jogador' ? 'selected' : ''}>Jogador</option>
          <option value="Mestre" ${u.role === 'Mestre' ? 'selected' : ''}>Mestre</option>
          <option value="Admin" ${u.role === 'Admin' ? 'selected' : ''}>Admin</option>
        </select>
      </td><td>
        <button class="btn-acao-soft" onclick="reenviarResetSenha('${escapeHtml(u.id)}', '${escapeHtml(u.email)}')">Enviar redefinicao</button>
      </td></tr>`;
    });
  } catch (err) {
    console.error(err);
    document.getElementById('lista-usuarios-body').innerHTML = '<tr><td colspan="4" style="text-align:center;">Nao foi possivel carregar os usuarios.</td></tr>';
  }
}

async function criarUsuario() {
  hideUserFormStatus();

  const email = document.getElementById('u-email').value.trim();
  const role = document.getElementById('u-role').value;
  const sendPasswordReset = document.getElementById('u-send-reset').checked;
  const btn = document.getElementById('btn-user-submit');

  if (!email) {
    showUserFormStatus('Informe o email do novo usuario.', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Criando...';

  try {
    const result = await apiFetch('/users', {
      method: 'POST',
      body: JSON.stringify({ email, role, sendPasswordReset }),
    });

    document.getElementById('u-email').value = '';
    document.getElementById('u-role').value = 'Jogador';
    document.getElementById('u-send-reset').checked = true;
    showUserFormStatus(result.message || 'Usuario criado com sucesso.');
    await carregarUsuarios();
  } catch (err) {
    showUserFormStatus(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Criar Usuario';
  }
}

async function carregarChatConfig() {
  try {
    const { data } = await apiFetch('/chat/config');
    document.getElementById('chat-retention-days').value = data.chatRetentionDays;
  } catch (err) {
    showChatConfigStatus(err.message, 'error');
  }
}

async function salvarChatConfig() {
  hideChatConfigStatus();

  const input = document.getElementById('chat-retention-days');
  const btn = document.getElementById('btn-chat-config-submit');
  const chatRetentionDays = parseInt(input.value, 10);

  if (Number.isNaN(chatRetentionDays)) {
    showChatConfigStatus('Informe quantos dias o historico deve permanecer.', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    const result = await apiFetch('/chat/config', {
      method: 'PATCH',
      body: JSON.stringify({ chatRetentionDays }),
    });
    showChatConfigStatus(result.message || 'Configuracao salva com sucesso.');
  } catch (err) {
    showChatConfigStatus(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Salvar configuracao';
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

async function limparChatDados() {
  const confirmed = await showConfirm('Limpar todo o historico do giro de dados?', 'Limpar historico');
  if (!confirmed) return;

  try {
    await apiFetch('/chat/rolls', { method: 'DELETE' });
    latestChatSignature = '';
    await carregarChatDados();
    await showDialog('Historico limpo com sucesso.', 'Historico limpo');
  } catch (err) {
    await showDialog(`Erro: ${err.message}`, 'Erro');
  }
}

function iniciarPollingChat() {
  clearInterval(chatPollTimer);
  chatPollTimer = window.setInterval(() => {
    carregarChatDados({ silent: true });
  }, 4000);
}

async function mudarRole(id, novaRole) {
  try {
    await apiFetch(`/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role: novaRole }) });
    await showDialog(`Cargo atualizado para ${novaRole}!`, 'Cargo atualizado');
  } catch (err) {
    await showDialog(`Erro: ${err.message}`, 'Erro');
    carregarUsuarios();
  }
}

async function reenviarResetSenha(id, email) {
  const confirmed = await showConfirm(`Enviar email de redefinicao de senha para "${email}"?`, 'Redefinir senha');
  if (!confirmed) return;

  try {
    const result = await apiFetch(`/users/${id}/send-reset`, { method: 'POST' });
    await showDialog(result.message || 'Email de redefinicao enviado.', 'Email enviado');
  } catch (err) {
    await showDialog(`Erro: ${err.message}`, 'Erro');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('admin-email').textContent = localStorage.getItem('rpg_email') || '';
  document.getElementById('app-modal-cancel').addEventListener('click', () => closeModal(false));
  document.getElementById('app-modal-confirm').addEventListener('click', () => closeModal(true));
  document.getElementById('app-modal-overlay').addEventListener('click', (event) => {
    if (event.target.id === 'app-modal-overlay') closeModal(false);
  });
  resetForm();
  renderDiceControls();
  carregarTemplates();
  carregarChatConfig();
  carregarChatDados();
  iniciarPollingChat();
});

window.addEventListener('beforeunload', () => {
  clearInterval(chatPollTimer);
});
