/*
  SISTEMA DE AGENDA DE CAMPO - MED PLUS
  Front End: HTML + CSS + JavaScript

  PASSO PRINCIPAL PARA LIGAR NO BACK END:
  1) Publique seu Apps Script como Web App.
  2) Copie a URL que termina com /exec.
  3) Cole em CONFIG.SCRIPT_URL abaixo.

  Enquanto SCRIPT_URL estiver vazio, o sistema usa dados de demonstração no navegador
  para você testar cadastro, painel, edição e exclusão sem quebrar nada.
*/

const CONFIG = {
  SHEET_ID: "1jvTEZ3M1lPrPeLU0Og-CIOlYW9K08Nlt0S7OR2RLYlk",
  SCRIPT_URL: "https://script.google.com/macros/s/AKfycbzeaW5sLcBVfV0msRvqNeYac5LaaxFNab6XG0raDKwM6GIyZ98Iv8lXxH7BlFUuhamK/exec", // Cole aqui a URL do Apps Script Web App, exemplo: https://script.google.com/macros/s/SEU_ID/exec
  STORAGE_KEY: "medplus_agenda_campo_demo_v2",
  ACTIONS: {
    LISTAR: "listar",
    SALVAR: "salvar",
    ATUALIZAR: "atualizar",
    EXCLUIR: "excluir"
  },
  TECNICOS_PADRAO: [
    "Carlos Ramos",
    "Danilo Tinoco",
    "Kadu",
    "Paulo Corrêa",
    "Reginaldo",
  ],
  CAMPOS_CHAMADO: [
    { name: "id", label: "ID", type: "hidden", span: 4 },
    { name: "protocolo", label: "Protocolo", type: "text", span: 4, placeholder: "Gerado automaticamente se vazio", readonlyOnCreate: false },
    { name: "dataCadastro", label: "Data do cadastro", type: "date", span: 4, required: true },
    { name: "cliente", label: "Cliente", type: "text", span: 6, required: true, placeholder: "Nome do cliente" },
    { name: "cnpj", label: "CNPJ", type: "text", span: 3, placeholder: "00.000.000/0000-00" },
    { name: "telefone", label: "Telefone", type: "tel", span: 3, placeholder: "(00) 00000-0000" },
    { name: "endereco", label: "Endereço", type: "text", span: 8, placeholder: "Rua, número, bairro" },
    { name: "cidade", label: "Cidade", type: "text", span: 4, placeholder: "Cidade/UF" },
    { name: "tipoAtendimento", label: "Tipo do atendimento", type: "select", span: 4, options: ["Atendimento Chat", "Remoto", "Telefônico", "Visita técnica", "Outro"] },
    { name: "equipamento", label: "Equipamento / sistema", type: "text", span: 4, placeholder: "Equipamento ou sistema atendido" },
    { name: "prioridade", label: "Prioridade", type: "select", span: 4, required: true, options: ["Baixa", "Média", "Alta", "Urgente"] },
    { name: "tecnico", label: "Técnico responsável", type: "select", span: 4, required: true, optionsFrom: "tecnicos" },
    { name: "dataAgendamento", label: "Data agendada", type: "date", span: 4, required: true },
    { name: "horaAgendamento", label: "Horário", type: "time", span: 4 },
    { name: "status", label: "Status", type: "select", span: 4, required: true, options: ["Aberto", "Agendado", "Em atendimento", "Concluído", "Cancelado"] },
    { name: "solicitante", label: "Solicitante", type: "text", span: 4, placeholder: "Quem solicitou" },
    { name: "responsavelLocal", label: "Responsável no local", type: "text", span: 4, placeholder: "Contato no local" },
    { name: "observacoes", label: "Descrição do chamado / observações", type: "textarea", span: 12, placeholder: "Descreva o problema, necessidade do cliente e detalhes do atendimento..." }
  ]
};

const state = {
  chamados: [],
  editandoId: null,
  adminEditandoId: null,
  toastTimer: null
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const page = document.body.dataset.page;

document.addEventListener("DOMContentLoaded", () => {
  setupTheme();
  setupModals();

  if (page === "cadastro") {
    initCadastroPage();
  }

  if (page === "painel") {
    initPainelPage();
  }
});

function initCadastroPage() {
  buildForm("chamadoForm", "");
  buildForm("adminForm", "admin_");
  applyDefaultDates();

  $("#chamadoForm")?.addEventListener("submit", handleSubmitChamado);
  $("#adminForm")?.addEventListener("submit", handleSubmitAdminEdit);
  $("#btnResetForm")?.addEventListener("click", resetMainForm);
  $("#btnNovoChamado")?.addEventListener("click", resetMainForm);
  $("#btnOpenAdmin")?.addEventListener("click", async () => {
    openModal("adminModal");
    await loadChamados();
    renderAdminTable();
  });
  $("#btnReloadAdmin")?.addEventListener("click", async () => {
    await loadChamados(true);
    renderAdminTable();
  });
  $("#adminSearch")?.addEventListener("input", renderAdminTable);
  $("#btnCancelAdminEdit")?.addEventListener("click", clearAdminEditor);
  $("#btnPreviewPayload")?.addEventListener("click", previewMainPayload);

  loadChamados().then(renderAdminTable);
}

async function initPainelPage() {
  setupPanelFilters();
  await loadChamados();
  fillTecnicoFilter();
  renderPainel();

  $("#btnReloadPanel")?.addEventListener("click", async () => {
    await loadChamados(true);
    fillTecnicoFilter();
    renderPainel();
  });

  $("#btnClearFilters")?.addEventListener("click", () => {
    $("#filtersForm")?.reset();
    renderPainel();
  });
}

function setupPanelFilters() {
  ["filterTecnico", "filterCliente", "filterCnpj", "filterDataInicio", "filterDataFim", "filterStatus", "filterPrioridade"].forEach((id) => {
    $("#" + id)?.addEventListener("input", renderPainel);
    $("#" + id)?.addEventListener("change", renderPainel);
  });
}

function setupTheme() {
  const savedTheme = localStorage.getItem("medplus_agenda_theme") || "dark";
  document.body.classList.toggle("light-theme", savedTheme === "light");
  updateThemeButton(savedTheme);

  $("#themeToggle")?.addEventListener("click", () => {
    const nextTheme = document.body.classList.contains("light-theme") ? "dark" : "light";
    document.body.classList.toggle("light-theme", nextTheme === "light");
    localStorage.setItem("medplus_agenda_theme", nextTheme);
    updateThemeButton(nextTheme);
  });
}

function updateThemeButton(theme) {
  const icon = $("#themeIcon");
  const label = $("#themeLabel");
  if (!icon || !label) return;

  if (theme === "light") {
    icon.textContent = "☀️";
    label.textContent = "Light";
  } else {
    icon.textContent = "🌙";
    label.textContent = "Dark";
  }
}

function setupModals() {
  $$('[data-close-modal]').forEach((btn) => {
    btn.addEventListener("click", () => closeModal(btn.dataset.closeModal));
  });

  $$(".modal-backdrop").forEach((backdrop) => {
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closeModal(backdrop.id);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      $$(".modal-backdrop.is-open").forEach((modal) => closeModal(modal.id));
    }
  });
}

function openModal(id) {
  const modal = $("#" + id);
  if (!modal) return;
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal(id) {
  const modal = $("#" + id);
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
}

function buildForm(formId, prefix = "") {
  const form = $("#" + formId);
  if (!form) return;

  form.innerHTML = CONFIG.CAMPOS_CHAMADO.map((field) => createFieldHTML(field, prefix)).join("");
  applyMasks(form);
}

function createFieldHTML(field, prefix) {
  const id = prefix + field.name;
  const required = field.required ? "required" : "";
  const hiddenClass = field.type === "hidden" ? "is-hidden" : "";
  const value = field.name === "status" ? "Agendado" : "";
  const span = field.span || 4;

  if (field.type === "textarea") {
    return `
      <div class="field span-${span} ${hiddenClass}">
        <label for="${id}">${field.label}${field.required ? " *" : ""}</label>
        <textarea id="${id}" name="${field.name}" ${required} placeholder="${field.placeholder || ""}">${value}</textarea>
      </div>`;
  }

  if (field.type === "select") {
    const options = getFieldOptions(field);
    return `
      <div class="field span-${span} ${hiddenClass}">
        <label for="${id}">${field.label}${field.required ? " *" : ""}</label>
        <select id="${id}" name="${field.name}" ${required}>
          <option value="">Selecione...</option>
          ${options.map((option) => `<option value="${escapeHTML(option)}" ${option === value ? "selected" : ""}>${escapeHTML(option)}</option>`).join("")}
        </select>
      </div>`;
  }

  return `
    <div class="field span-${span} ${hiddenClass}">
      <label for="${id}">${field.label}${field.required ? " *" : ""}</label>
      <input id="${id}" name="${field.name}" type="${field.type}" ${required} value="${escapeHTML(value)}" placeholder="${field.placeholder || ""}" />
    </div>`;
}

function getFieldOptions(field) {
  if (field.optionsFrom === "tecnicos") {
    const fromData = uniqueValues(state.chamados.map((item) => pick(item, "tecnico"))).filter(Boolean);
    return [...new Set([...CONFIG.TECNICOS_PADRAO, ...fromData])];
  }
  return field.options || [];
}

function applyMasks(form) {
  const telefone = form.querySelector('[name="telefone"]');
  telefone?.addEventListener("input", () => {
    telefone.value = maskPhone(telefone.value);
  });

  const cnpj = form.querySelector('[name="cnpj"]');
  cnpj?.addEventListener("input", () => {
    cnpj.value = maskCnpj(cnpj.value);
  });
}

function maskPhone(value) {
  const numbers = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (numbers.length <= 10) {
    return numbers.replace(/(\d{0,2})(\d{0,4})(\d{0,4})/, (_, ddd, part1, part2) => {
      let result = ddd ? `(${ddd}` : "";
      if (ddd.length === 2) result += ") ";
      if (part1) result += part1;
      if (part2) result += `-${part2}`;
      return result;
    });
  }
  return numbers.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
}

function maskCnpj(value) {
  const numbers = String(value || "").replace(/\D/g, "").slice(0, 14);
  return numbers
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function applyDefaultDates() {
  const today = new Date().toISOString().slice(0, 10);
  const dataCadastro = $("#dataCadastro");
  const status = $("#status");
  if (dataCadastro && !dataCadastro.value) dataCadastro.value = today;
  if (status && !status.value) status.value = "Agendado";
}

async function handleSubmitChamado(event) {
  event.preventDefault();
  const form = event.currentTarget;

  if (!form.reportValidity()) return;

  const payload = getFormData(form);
  const isEditing = Boolean(state.editandoId || payload.id);
  const action = isEditing ? CONFIG.ACTIONS.ATUALIZAR : CONFIG.ACTIONS.SALVAR;

  if (!payload.id) payload.id = generateId();
  if (!payload.protocolo) payload.protocolo = generateProtocol();
  if (!payload.dataCadastro) payload.dataCadastro = new Date().toISOString().slice(0, 10);

  try {
    await apiRequest(action, { chamado: payload, id: payload.id });
    showToast(isEditing ? "Chamado atualizado com sucesso." : "Chamado salvo com sucesso.");
    resetMainForm();
    await loadChamados(true);
    renderAdminTable();
  } catch (error) {
    showToast(error.message || "Erro ao salvar chamado.", "error");
  }
}

async function handleSubmitAdminEdit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;

  const payload = getFormData(form);
  if (!payload.id && state.adminEditandoId) payload.id = state.adminEditandoId;

  try {
    await apiRequest(CONFIG.ACTIONS.ATUALIZAR, { chamado: payload, id: payload.id });
    showToast("Chamado atualizado pela área administrativa.");
    clearAdminEditor();
    await loadChamados(true);
    renderAdminTable();
  } catch (error) {
    showToast(error.message || "Erro ao atualizar chamado.", "error");
  }
}

function getFormData(form) {
  const data = new FormData(form);
  const payload = {};
  CONFIG.CAMPOS_CHAMADO.forEach((field) => {
    payload[field.name] = String(data.get(field.name) || "").trim();
  });
  return payload;
}

function setFormData(form, data, prefix = "") {
  CONFIG.CAMPOS_CHAMADO.forEach((field) => {
    const input = form.querySelector(`#${prefix}${field.name}`);
    if (!input) return;
    input.value = pick(data, field.name) || "";
  });
}

function resetMainForm() {
  state.editandoId = null;
  $("#formTitle") && ($("#formTitle").textContent = "Cadastrar chamado / atendimento");
  $("#btnSalvar") && ($("#btnSalvar").textContent = "Salvar chamado");
  $("#chamadoForm")?.reset();
  applyDefaultDates();
}

function previewMainPayload() {
  const form = $("#chamadoForm");
  if (!form) return;
  const payload = getFormData(form);
  $("#payloadPreview").textContent = JSON.stringify(payload, null, 2);
  openModal("payloadModal");
}

async function loadChamados(force = false) {
  if (state.chamados.length && !force) return state.chamados;

  try {
    const response = await apiRequest(CONFIG.ACTIONS.LISTAR, {});
    state.chamados = normalizeChamados(response);
  } catch (error) {
    showToast(error.message || "Não foi possível carregar os chamados.", "error");
    state.chamados = readDemoData();
  }

  rebuildSelectsAfterLoad();
  return state.chamados;
}

function rebuildSelectsAfterLoad() {
  ["chamadoForm", "adminForm"].forEach((formId) => {
    const form = $("#" + formId);
    if (!form) return;
    const values = getFormData(form);
    buildForm(formId, formId === "adminForm" ? "admin_" : "");
    setFormData(form, values, formId === "adminForm" ? "admin_" : "");
  });
}

function normalizeChamados(response) {
  const source = response?.dados || response?.data || response?.chamados || response?.registros || response?.resultado || response;
  if (!Array.isArray(source)) return [];

  return source.map((item) => normalizeKeys(item)).map((item) => ({
    id: pick(item, "id") || pick(item, "ID") || generateId(),
    protocolo: pick(item, "protocolo") || pick(item, "PROTOCOLO") || "",
    dataCadastro: formatDateForInput(pick(item, "dataCadastro") || pick(item, "DATA_CADASTRO") || pick(item, "data") || pick(item, "DATA")),
    cliente: pick(item, "cliente") || pick(item, "CLIENTE") || pick(item, "nomeCliente") || "",
    cnpj: pick(item, "cnpj") || pick(item, "CNPJ") || pick(item, "CPF_CNPJ") || pick(item, "cpfCnpj") || "",
    telefone: pick(item, "telefone") || pick(item, "TELEFONE") || "",
    email: pick(item, "email") || pick(item, "EMAIL") || "",
    endereco: pick(item, "endereco") || pick(item, "ENDERECO") || pick(item, "endereço") || "",
    cidade: pick(item, "cidade") || pick(item, "CIDADE") || "",
    tipoAtendimento: pick(item, "tipoAtendimento") || pick(item, "TIPO_ATENDIMENTO") || pick(item, "tipo") || "",
    equipamento: pick(item, "equipamento") || pick(item, "EQUIPAMENTO") || "",
    prioridade: pick(item, "prioridade") || pick(item, "PRIORIDADE") || "",
    tecnico: pick(item, "tecnico") || pick(item, "TECNICO") || pick(item, "técnico") || "",
    dataAgendamento: formatDateForInput(pick(item, "dataAgendamento") || pick(item, "DATA_AGENDAMENTO") || pick(item, "dataAgenda") || pick(item, "DATA_AGENDA")),
    horaAgendamento: pick(item, "horaAgendamento") || pick(item, "HORA_AGENDAMENTO") || pick(item, "hora") || "",
    status: pick(item, "status") || pick(item, "STATUS") || "",
    solicitante: pick(item, "solicitante") || pick(item, "SOLICITANTE") || "",
    responsavelLocal: pick(item, "responsavelLocal") || pick(item, "RESPONSAVEL_LOCAL") || "",
    observacoes: pick(item, "observacoes") || pick(item, "OBSERVACOES") || pick(item, "descrição") || pick(item, "descricao") || ""
  }));
}

function normalizeKeys(item) {
  if (!item || typeof item !== "object") return {};
  const normalized = { ...item };
  Object.keys(item).forEach((key) => {
    const clean = key
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_")
      .toUpperCase();
    normalized[clean] = item[key];
  });
  return normalized;
}

function pick(item, key) {
  if (!item) return "";
  if (Object.prototype.hasOwnProperty.call(item, key)) return item[key];
  const upper = key.toUpperCase();
  if (Object.prototype.hasOwnProperty.call(item, upper)) return item[upper];
  return "";
}

function formatDateForInput(value) {
  if (!value) return "";
  const stringValue = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(stringValue)) return stringValue.slice(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}/.test(stringValue)) {
    const [day, month, year] = stringValue.slice(0, 10).split("/");
    return `${year}-${month}-${day}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

async function apiRequest(action, payload = {}) {
  const body = {
    action,
    acao: action,
    sheetId: CONFIG.SHEET_ID,
    ...payload
  };

  if (!CONFIG.SCRIPT_URL) {
    return demoApi(action, payload);
  }

  const response = await fetch(CONFIG.SCRIPT_URL, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    }
  });

  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch (_) {
    json = { raw: text };
  }

  if (!response.ok || json.ok === false || json.status === "erro" || json.success === false) {
    throw new Error(json.mensagem || json.message || json.erro || "Erro de comunicação com o Apps Script.");
  }

  return json;
}

function demoApi(action, payload = {}) {
  let data = readDemoData();

  switch (action) {
    case CONFIG.ACTIONS.LISTAR:
      return { ok: true, dados: data };

    case CONFIG.ACTIONS.SALVAR: {
      const chamado = payload.chamado || payload;
      data.unshift(chamado);
      writeDemoData(data);
      return { ok: true, chamado };
    }

    case CONFIG.ACTIONS.ATUALIZAR: {
      const chamado = payload.chamado || payload;
      data = data.map((item) => String(item.id) === String(chamado.id || payload.id) ? { ...item, ...chamado } : item);
      writeDemoData(data);
      return { ok: true, chamado };
    }

    case CONFIG.ACTIONS.EXCLUIR: {
      const id = payload.id;
      data = data.filter((item) => String(item.id) !== String(id));
      writeDemoData(data);
      return { ok: true };
    }

    default:
      return { ok: true };
  }
}

function readDemoData() {
  const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
  if (saved) {
    try { return JSON.parse(saved); } catch (_) { return []; }
  }

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const afterTomorrow = new Date(today);
  afterTomorrow.setDate(today.getDate() + 2);

  const sample = [
    {
      id: generateId(),
      protocolo: generateProtocol(),
      dataCadastro: today.toISOString().slice(0, 10),
      cliente: "Clínica Exemplo Vida",
      cnpj: "12.345.678/0001-90",
      telefone: "(16) 99999-0001",
      endereco: "Av. Central, 1000",
      cidade: "Ribeirão Preto/SP",
      tipoAtendimento: "Remoto",
      equipamento: "Sistema de atendimento",
      prioridade: "Alta",
      tecnico: "João Técnico",
      dataAgendamento: tomorrow.toISOString().slice(0, 10),
      horaAgendamento: "09:30",
      status: "Agendado",
      solicitante: "Ana Paula",
      responsavelLocal: "Recepção",
      observacoes: "Verificar instabilidade relatada pelo cliente e testar comunicação no local."
    },
    {
      id: generateId(),
      protocolo: generateProtocol(),
      dataCadastro: today.toISOString().slice(0, 10),
      cliente: "Hospital Modelo",
      cnpj: "98.765.432/0001-10",
      telefone: "(16) 98888-0002",
      endereco: "Rua das Flores, 225",
      cidade: "Sertãozinho/SP",
      tipoAtendimento: "Visita técnica",
      equipamento: "Estação de trabalho",
      prioridade: "Média",
      tecnico: "Maria Técnica",
      dataAgendamento: afterTomorrow.toISOString().slice(0, 10),
      horaAgendamento: "14:00",
      status: "Aberto",
      solicitante: "Roberto",
      responsavelLocal: "TI",
      observacoes: "Instalação inicial e conferência do ambiente."
    }
  ];
  writeDemoData(sample);
  return sample;
}

function writeDemoData(data) {
  localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(data));
}

function renderAdminTable() {
  const tbody = $("#adminTableBody");
  if (!tbody) return;

  const search = normalizeText($("#adminSearch")?.value || "");
  const rows = state.chamados.filter((item) => {
    if (!search) return true;
    return normalizeText([
      item.protocolo,
      item.cliente,
      item.cnpj,
      item.tecnico,
      item.status,
      item.prioridade,
      item.dataAgendamento
    ].join(" ")).includes(search);
  });

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8">Nenhum chamado encontrado.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((item) => `
    <tr>
      <td>
        <div class="row-actions">
          <button class="action-btn" type="button" title="Editar" data-admin-edit="${escapeHTML(item.id)}">✏️</button>
          <button class="action-btn delete" type="button" title="Excluir" data-admin-delete="${escapeHTML(item.id)}">🗑️</button>
        </div>
      </td>
      <td>${escapeHTML(item.protocolo || "-")}</td>
      <td>${escapeHTML(item.cliente || "-")}</td>
      <td>${escapeHTML(item.cnpj || "-")}</td>
      <td>${escapeHTML(item.tecnico || "-")}</td>
      <td>${escapeHTML(formatDateBR(item.dataAgendamento) || "-")} ${escapeHTML(item.horaAgendamento || "")}</td>
      <td><span class="badge ${statusClass(item.status)}">${escapeHTML(item.status || "-")}</span></td>
      <td><span class="badge ${priorityClass(item.prioridade)}">${escapeHTML(item.prioridade || "-")}</span></td>
    </tr>
  `).join("");

  $$('[data-admin-edit]', tbody).forEach((button) => {
    button.addEventListener("click", () => startAdminEdit(button.dataset.adminEdit));
  });

  $$('[data-admin-delete]', tbody).forEach((button) => {
    button.addEventListener("click", () => deleteChamado(button.dataset.adminDelete));
  });
}

function startAdminEdit(id) {
  const chamado = state.chamados.find((item) => String(item.id) === String(id));
  if (!chamado) return;
  state.adminEditandoId = id;
  const editor = $("#adminEditor");
  const form = $("#adminForm");
  editor?.classList.remove("is-hidden");
  setFormData(form, chamado, "admin_");
  editor?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function clearAdminEditor() {
  state.adminEditandoId = null;
  $("#adminForm")?.reset();
  $("#adminEditor")?.classList.add("is-hidden");
}

async function deleteChamado(id) {
  const chamado = state.chamados.find((item) => String(item.id) === String(id));
  const label = chamado?.protocolo || chamado?.cliente || "este chamado";
  const confirmed = confirm(`Tem certeza que deseja excluir ${label}?`);
  if (!confirmed) return;

  try {
    await apiRequest(CONFIG.ACTIONS.EXCLUIR, { id });
    showToast("Chamado excluído com sucesso.");
    await loadChamados(true);
    clearAdminEditor();
    renderAdminTable();
  } catch (error) {
    showToast(error.message || "Erro ao excluir chamado.", "error");
  }
}

function fillTecnicoFilter() {
  const select = $("#filterTecnico");
  if (!select) return;
  const current = select.value;
  const tecnicos = [...new Set([...CONFIG.TECNICOS_PADRAO, ...state.chamados.map((item) => item.tecnico).filter(Boolean)])].sort();
  select.innerHTML = `<option value="">Todos os técnicos</option>${tecnicos.map((tecnico) => `<option value="${escapeHTML(tecnico)}">${escapeHTML(tecnico)}</option>`).join("")}`;
  select.value = current;
}

function renderPainel() {
  const list = $("#callsList");
  if (!list) return;

  const filtered = getFilteredChamados();
  updateMetrics(filtered);
  $("#resultCount") && ($("#resultCount").textContent = `${filtered.length} ${filtered.length === 1 ? "registro" : "registros"}`);

  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state">Nenhum chamado encontrado com os filtros selecionados.</div>`;
    return;
  }

  list.innerHTML = filtered.map((item) => `
    <article class="call-card">
      <div>
        <h3>${escapeHTML(item.cliente || "Cliente não informado")}</h3>
        <div class="call-meta">
          <span>📌 ${escapeHTML(item.protocolo || "Sem protocolo")}</span>
          <span>🏢 ${escapeHTML(item.cnpj || "CNPJ não informado")}</span>
          <span>📍 ${escapeHTML(item.cidade || item.endereco || "Local não informado")}</span>
          <span>📞 ${escapeHTML(item.telefone || "Sem telefone")}</span>
        </div>
      </div>
      <div class="badge-row">
        <span class="badge ${statusClass(item.status)}">${escapeHTML(item.status || "Sem status")}</span>
        <span class="badge ${priorityClass(item.prioridade)}">${escapeHTML(item.prioridade || "Sem prioridade")}</span>
        <span class="badge">👨‍🔧 ${escapeHTML(item.tecnico || "Sem técnico")}</span>
        <span class="badge">📅 ${escapeHTML(formatDateBR(item.dataAgendamento) || "Sem data")} ${escapeHTML(item.horaAgendamento || "")}</span>
      </div>
      <button class="btn btn-outline" type="button" data-details="${escapeHTML(item.id)}">Ver detalhes</button>
    </article>
  `).join("");

  $$('[data-details]', list).forEach((button) => {
    button.addEventListener("click", () => openDetails(button.dataset.details));
  });
}

function getFilteredChamados() {
  const tecnico = normalizeText($("#filterTecnico")?.value || "");
  const cliente = normalizeText($("#filterCliente")?.value || "");
  const cnpj = normalizeText($("#filterCnpj")?.value || "");
  const dataInicio = $("#filterDataInicio")?.value || "";
  const dataFim = $("#filterDataFim")?.value || "";
  const status = normalizeText($("#filterStatus")?.value || "");
  const prioridade = normalizeText($("#filterPrioridade")?.value || "");

  return state.chamados
    .filter((item) => {
      const data = item.dataAgendamento || "";
      const matchesTecnico = !tecnico || normalizeText(item.tecnico).includes(tecnico);
      const matchesCliente = !cliente || normalizeText(item.cliente).includes(cliente);
      const matchesCnpj = !cnpj || normalizeText(item.cnpj).includes(cnpj);
      const matchesStatus = !status || normalizeText(item.status) === status;
      const matchesPrioridade = !prioridade || normalizeText(item.prioridade) === prioridade;
      const matchesInicio = !dataInicio || data >= dataInicio;
      const matchesFim = !dataFim || data <= dataFim;
      return matchesTecnico && matchesCliente && matchesCnpj && matchesStatus && matchesPrioridade && matchesInicio && matchesFim;
    })
    .sort((a, b) => String(a.dataAgendamento || "").localeCompare(String(b.dataAgendamento || "")) || String(a.horaAgendamento || "").localeCompare(String(b.horaAgendamento || "")));
}

function updateMetrics(rows) {
  const total = rows.length;
  const agendados = rows.filter((item) => normalizeText(item.status) === "agendado").length;
  const atendimento = rows.filter((item) => normalizeText(item.status) === "em atendimento").length;
  const alta = rows.filter((item) => ["alta", "urgente"].includes(normalizeText(item.prioridade))).length;

  $("#metricTotal") && ($("#metricTotal").textContent = total);
  $("#metricAgendados") && ($("#metricAgendados").textContent = agendados);
  $("#metricAtendimento") && ($("#metricAtendimento").textContent = atendimento);
  $("#metricAlta") && ($("#metricAlta").textContent = alta);
}

function openDetails(id) {
  const item = state.chamados.find((chamado) => String(chamado.id) === String(id));
  if (!item) return;
  $("#detailsTitle").textContent = item.protocolo || "Detalhes do chamado";

  const fieldsToShow = CONFIG.CAMPOS_CHAMADO.filter((field) => field.type !== "hidden");
  $("#detailsBody").innerHTML = fieldsToShow.map((field) => {
    const value = field.type.includes("date") ? formatDateBR(item[field.name]) : item[field.name];
    return `
      <div class="detail-row">
        <strong>${escapeHTML(field.label)}</strong>
        <span>${escapeHTML(value || "-")}</span>
      </div>`;
  }).join("");

  openModal("detailsModal");
}

function statusClass(status) {
  return "status-" + normalizeText(status).replace(/\s+/g, "-");
}

function priorityClass(priority) {
  return "priority-" + normalizeText(priority).replace(/\s+/g, "-");
}

function formatDateBR(value) {
  if (!value) return "";
  const dateString = formatDateForInput(value);
  if (!dateString) return String(value);
  const [year, month, day] = dateString.split("-");
  return `${day}/${month}/${year}`;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function uniqueValues(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function generateId() {
  return "CH_" + Date.now().toString(36).toUpperCase() + "_" + Math.random().toString(36).slice(2, 7).toUpperCase();
}

function generateProtocol() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.floor(1000 + Math.random() * 9000);
  return `MP-${date}-${random}`;
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(message, type = "success") {
  const toast = $("#toast");
  if (!toast) return;
  clearTimeout(state.toastTimer);
  toast.textContent = message;
  toast.className = `toast show ${type === "error" ? "error" : ""}`;
  state.toastTimer = setTimeout(() => {
    toast.className = "toast";
  }, 3600);
}
