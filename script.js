/*
  MED PLUS+ | Sistema de Chamados x Agenda x Checklists
  Front End: HTML + CSS + JavaScript
  Back End: Google Sheets + Apps Script

  PASSO IMPORTANTE:
  1) Publique o Codigo.gs como Web App no Apps Script.
  2) Copie a URL do Web App e cole abaixo em SCRIPT_URL.
  3) Copie o ID da planilha e cole abaixo em SPREADSHEET_ID.
*/

const CONFIG = {
  SCRIPT_URL: "https://script.google.com/macros/s/AKfycbzxCMsqp6UnJEagOJLBqcYnOr5i3AH1Psjju75PGJqyh8BN1Eyr91ZnYlCxYC2NhLV3cw/exec",
  SPREADSHEET_ID: "1Y6xXZucflOvtfzm6rnZMLf2zELJ_rKaZLc1qBIAjgl8"
};

const DEMO_MODE = CONFIG.SCRIPT_URL.includes("COLE_AQUI") || CONFIG.SPREADSHEET_ID.includes("COLE_AQUI");
const STORAGE_KEY = "medplus_chamados_demo";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const state = {
  chamados: [],
  filtrados: [],
  adminChamados: [],
  chamadoAtual: null,
  editandoNumero: null,
  fotosSelecionadas: [],
  signatures: {}
};

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initLayout();
  initMasksAndDefaults();
  initAberturaPage();
  initPainelPage();
});

function initTheme() {
  const saved = localStorage.getItem("medplus_theme") || "dark";
  document.body.classList.toggle("theme-light", saved === "light");
  document.body.classList.toggle("theme-dark", saved !== "light");
  updateThemeButton();

  $$("#themeToggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const isLight = document.body.classList.toggle("theme-light");
      document.body.classList.toggle("theme-dark", !isLight);
      localStorage.setItem("medplus_theme", isLight ? "light" : "dark");
      updateThemeButton();
    });
  });
}

function updateThemeButton() {
  const isLight = document.body.classList.contains("theme-light");
  $$("#themeToggle").forEach((btn) => {
    btn.textContent = isLight ? "☀️" : "🌙";
    btn.title = isLight ? "Tema Light ativo" : "Tema Dark ativo";
  });
}

function initLayout() {
  const sidebarToggle = $("#sidebarToggle");
  const sidebar = $("#sidebar");
  if (!sidebarToggle || !sidebar) return;

  let overlay = $("#sidebarOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "sidebarOverlay";
    overlay.className = "sidebar-overlay";
    overlay.setAttribute("aria-hidden", "true");
    document.body.appendChild(overlay);
  }

  const openSidebar = () => {
    sidebar.classList.add("open");
    overlay.classList.add("show");
    document.body.classList.add("sidebar-menu-open");
    sidebarToggle.setAttribute("aria-expanded", "true");
    sidebarToggle.setAttribute("aria-label", "Fechar menu");
  };

  const closeSidebar = () => {
    sidebar.classList.remove("open");
    overlay.classList.remove("show");
    document.body.classList.remove("sidebar-menu-open");
    sidebarToggle.setAttribute("aria-expanded", "false");
    sidebarToggle.setAttribute("aria-label", "Abrir menu");
  };

  sidebarToggle.setAttribute("aria-expanded", "false");
  sidebarToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    sidebar.classList.contains("open") ? closeSidebar() : openSidebar();
  });

  overlay.addEventListener("click", closeSidebar);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSidebar();
  });

  $$(".nav-link", sidebar).forEach((link) => {
    link.addEventListener("click", () => {
      if (!link.classList.contains("disabled")) closeSidebar();
    });
  });
}

function initMasksAndDefaults() {
  const dataInput = $("#data");
  const horaInput = $("#hora");
  if (dataInput && !dataInput.value) dataInput.value = todayISO();
  if (horaInput && !horaInput.value) horaInput.value = currentTime();

  const cnpj = $("#cnpj");
  if (cnpj) {
    cnpj.addEventListener("input", () => {
      cnpj.value = maskCNPJ(cnpj.value);
      validateCNPJField();
    });
    cnpj.addEventListener("blur", validateCNPJField);
  }

  const telefone = $("#telefone");
  if (telefone) {
    telefone.addEventListener("input", () => {
      telefone.value = maskPhone(telefone.value);
      validatePhoneField();
    });
    telefone.addEventListener("blur", validatePhoneField);
  }
}

function initAberturaPage() {
  const form = $("#formAbertura");
  if (!form) return;

  bindAdminChamados();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!validateCNPJField() || !validatePhoneField()) {
      toast("Revise CNPJ e telefone antes de salvar.", "error");
      return;
    }

    const btn = form.querySelector("button[type='submit']");
    const editando = Boolean(state.editandoNumero);
    setLoading(btn, true, editando ? "Salvando edição..." : "Salvando...");

    try {
      const payload = formToObject(form);
      if (editando) payload.numeroChamado = state.editandoNumero;

      const response = await apiPost(editando ? "updateChamado" : "createChamado", payload);
      const numero = response.numeroChamado || response.data?.numeroChamado || payload.numeroChamado;

      toast(editando ? `Chamado ${numero} atualizado com sucesso!` : `Chamado ${numero || "gerado"} salvo com sucesso!`, "success");
      form.reset();
      sairModoEdicao();
      initMasksAndDefaults();
      await carregarAdminChamados();

      const badge = $("#chamadoBadge");
      if (badge && numero) badge.textContent = `🚑 ${numero}`;
    } catch (error) {
      console.error(error);
      toast(error.message || "Erro ao salvar chamado.", "error");
    } finally {
      setLoading(btn, false, state.editandoNumero ? "💾 Salvar edição" : "✅ Gerar OS");
    }
  });

  form.addEventListener("reset", () => {
    window.setTimeout(() => {
      sairModoEdicao();
      initMasksAndDefaults();
    }, 0);
  });

  $("#cancelEditBtn")?.addEventListener("click", () => {
    form.reset();
    sairModoEdicao();
    initMasksAndDefaults();
  });
}

function bindAdminChamados() {
  if (!$("#adminChamadosTbody")) return;

  $("#adminReloadBtn")?.addEventListener("click", carregarAdminChamados);
  $("#adminBusca")?.addEventListener("input", renderAdminChamados);
  $("#adminSituacao")?.addEventListener("change", renderAdminChamados);

  $("#adminChamadosTbody")?.addEventListener("click", async (event) => {
    const editBtn = event.target.closest("[data-admin-edit]");
    const deleteBtn = event.target.closest("[data-admin-delete]");

    if (editBtn) {
      editarChamadoAdmin(editBtn.dataset.adminEdit);
      return;
    }

    if (deleteBtn) {
      await excluirChamadoAdmin(deleteBtn.dataset.adminDelete);
    }
  });

  carregarAdminChamados();
}

async function carregarAdminChamados() {
  const btn = $("#adminReloadBtn");
  setLoading(btn, true, "Atualizando...");

  try {
    const response = await apiGet("listChamados");
    state.adminChamados = Array.isArray(response.data) ? response.data : [];
    renderAdminChamados();

    if (DEMO_MODE) {
      toast("Modo demonstração ativo. Cole a URL do Apps Script e o ID da planilha no script.js para usar o Back End real.", "error");
    }
  } catch (error) {
    console.error(error);
    toast(error.message || "Erro ao carregar a área administrativa.", "error");
    state.adminChamados = [];
    renderAdminChamados();
  } finally {
    setLoading(btn, false, "🔄 Atualizar lista");
  }
}

function renderAdminChamados() {
  const tbody = $("#adminChamadosTbody");
  const empty = $("#adminEmptyState");
  if (!tbody) return;

  const busca = normalize($("#adminBusca")?.value || "");
  const situacao = $("#adminSituacao")?.value || "";

  const chamados = state.adminChamados.filter((item) => {
    const haystack = normalize([
      item.numeroChamado,
      item.cliente,
      item.tecnico,
      item.cnpj,
      item.status,
      item.situacao
    ].join(" "));

    return (!busca || haystack.includes(busca)) && (!situacao || item.situacao === situacao);
  });

  tbody.innerHTML = "";

  if (!chamados.length) {
    empty?.classList.remove("hidden");
    return;
  }

  empty?.classList.add("hidden");

  chamados.forEach((chamado) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHTML(chamado.numeroChamado || "MED-0000")}</strong></td>
      <td>${escapeHTML(chamado.cliente || "-")}</td>
      <td>${escapeHTML(chamado.tecnico || "-")}</td>
      <td>${formatDateBR(chamado.data || chamado.dataAgendada)}</td>
      <td><span class="status-pill ${(chamado.situacao || "").includes("Finalizado") ? "finalizado" : ""}">${escapeHTML(chamado.situacao || "-")}</span></td>
      <td>
        <div class="admin-actions">
          <button class="btn btn-secondary btn-small" type="button" data-admin-edit="${escapeAttr(chamado.numeroChamado)}">✏️ Editar</button>
          <button class="btn btn-danger btn-small" type="button" data-admin-delete="${escapeAttr(chamado.numeroChamado)}">🗑️ Excluir</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function editarChamadoAdmin(numeroChamado) {
  const chamado = state.adminChamados.find((item) => item.numeroChamado === numeroChamado);
  const form = $("#formAbertura");
  if (!chamado || !form) {
    toast("Chamado não encontrado para edição.", "error");
    return;
  }

  state.editandoNumero = chamado.numeroChamado;

  setValue("#numeroChamadoAdmin", chamado.numeroChamado);
  setValue("#tecnico", chamado.tecnico);
  setValue("#cliente", chamado.cliente);
  setValue("#tipoAtendimento", chamado.tipoAtendimento);
  setValue("#data", chamado.data || chamado.dataAgendada);
  setValue("#hora", chamado.hora);
  setValue("#periodo", chamado.periodo);
  setValue("#cnpj", maskCNPJ(chamado.cnpj));
  setValue("#endereco", chamado.endereco);
  setValue("#situacao", chamado.situacao);
  setValue("#modeloEquipamento", chamado.modeloEquipamento);
  setValue("#status", chamado.status);
  setValue("#descricaoFalha", chamado.descricaoFalha);
  setValue("#acaoTomada", chamado.acaoTomada);
  setValue("#nomeResponsavel", chamado.nomeResponsavel);
  setValue("#telefone", maskPhone(chamado.telefone));

  validateCNPJField();
  validatePhoneField();

  setText("#chamadoBadge", `✏️ Editando ${chamado.numeroChamado}`);
  setText("#formSubmitBtn", "💾 Salvar edição");
  $("#cancelEditBtn")?.classList.remove("hidden");

  document.querySelector(".form-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
  toast(`Editando chamado ${chamado.numeroChamado}.`, "success");
}

async function excluirChamadoAdmin(numeroChamado) {
  if (!numeroChamado) return;
  const chamado = state.adminChamados.find((item) => item.numeroChamado === numeroChamado);
  const cliente = chamado?.cliente ? ` - ${chamado.cliente}` : "";

  if (!window.confirm(`Deseja realmente excluir o chamado ${numeroChamado}${cliente}?`)) return;

  const btn = $$('[data-admin-delete]').find((button) => button.dataset.adminDelete === numeroChamado);
  setLoading(btn, true, "Excluindo...");

  try {
    await apiPost("deleteChamado", { numeroChamado });
    toast(`Chamado ${numeroChamado} excluído com sucesso.`, "success");

    if (state.editandoNumero === numeroChamado) {
      $("#formAbertura")?.reset();
      sairModoEdicao();
      initMasksAndDefaults();
    }

    await carregarAdminChamados();
  } catch (error) {
    console.error(error);
    toast(error.message || "Erro ao excluir chamado.", "error");
  } finally {
    setLoading(btn, false, "🗑️ Excluir");
  }
}

function sairModoEdicao() {
  state.editandoNumero = null;
  setValue("#numeroChamadoAdmin", "");
  setText("#chamadoBadge", "🚑 MED-0000");
  setText("#formSubmitBtn", "✅ Gerar OS");
  $("#cancelEditBtn")?.classList.add("hidden");
  const cnpjHelp = $("#cnpjHelp");
  const telefoneHelp = $("#telefoneHelp");
  if (cnpjHelp) {
    cnpjHelp.textContent = "";
    cnpjHelp.className = "field-help";
  }
  if (telefoneHelp) {
    telefoneHelp.textContent = "";
    telefoneHelp.className = "field-help";
  }
}

async function initPainelPage() {
  const list = $("#chamadosList");
  if (!list) return;

  initOSModal();
  bindFilters();
  await carregarChamados();
}

function bindFilters() {
  ["#filtroBusca", "#filtroTecnico", "#filtroStatus", "#filtroSituacao", "#filtroPeriodo", "#filtroDataInicial", "#filtroDataFinal"].forEach((selector) => {
    const el = $(selector);
    if (el) el.addEventListener("input", aplicarFiltros);
    if (el) el.addEventListener("change", aplicarFiltros);
  });

  const filtersToggleBtn = $("#filtersToggleBtn");
  const advancedFiltersAccordion = $("#advancedFiltersAccordion");

  if (filtersToggleBtn && advancedFiltersAccordion) {
    filtersToggleBtn.addEventListener("click", () => {
      const willOpen = advancedFiltersAccordion.hasAttribute("hidden");
      advancedFiltersAccordion.toggleAttribute("hidden", !willOpen);
      advancedFiltersAccordion.classList.toggle("open", willOpen);
      filtersToggleBtn.classList.toggle("active", willOpen);
      filtersToggleBtn.setAttribute("aria-expanded", String(willOpen));
      filtersToggleBtn.setAttribute("title", willOpen ? "Fechar filtros avançados" : "Abrir filtros avançados");
    });
  }

  const reloadBtn = $("#reloadBtn");
  if (reloadBtn) reloadBtn.addEventListener("click", carregarChamados);

  const clearFiltersBtn = $("#clearFiltersBtn");
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener("click", () => {
      ["#filtroBusca", "#filtroTecnico", "#filtroStatus", "#filtroSituacao", "#filtroPeriodo", "#filtroDataInicial", "#filtroDataFinal"].forEach((selector) => {
        const el = $(selector);
        if (el) el.value = "";
      });
      aplicarFiltros();
    });
  }
}

async function carregarChamados() {
  const reloadBtn = $("#reloadBtn");
  setLoading(reloadBtn, true, "Atualizando...");

  try {
    const response = await apiGet("listChamados");
    state.chamados = Array.isArray(response.data) ? response.data : [];
    aplicarFiltros();

    if (DEMO_MODE) {
      toast("Modo demonstração ativo. Cole a URL do Apps Script e o ID da planilha no script.js para usar o Back End real.", "error");
    }
  } catch (error) {
    console.error(error);
    toast(error.message || "Erro ao carregar chamados.", "error");
    state.chamados = [];
    aplicarFiltros();
  } finally {
    setLoading(reloadBtn, false, "🔄 Atualizar");
  }
}

function aplicarFiltros() {
  const busca = normalize($("#filtroBusca")?.value || "");
  const tecnico = normalize($("#filtroTecnico")?.value || "");
  const status = $("#filtroStatus")?.value || "";
  const situacao = $("#filtroSituacao")?.value || "";
  const periodo = $("#filtroPeriodo")?.value || "";
  const dataInicial = $("#filtroDataInicial")?.value || "";
  const dataFinal = $("#filtroDataFinal")?.value || "";

  state.filtrados = state.chamados.filter((item) => {
    const haystack = normalize([
      item.numeroChamado,
      item.tecnico,
      item.cliente,
      item.cnpj,
      item.endereco,
      item.tipoAtendimento,
      item.status,
      item.situacao,
      item.descricaoFalha
    ].join(" "));

    const data = item.data || item.dataAgendada || "";

    return (!busca || haystack.includes(busca)) &&
      (!tecnico || normalize(item.tecnico).includes(tecnico)) &&
      (!status || item.status === status) &&
      (!situacao || item.situacao === situacao) &&
      (!periodo || item.periodo === periodo) &&
      (!dataInicial || data >= dataInicial) &&
      (!dataFinal || data <= dataFinal);
  });

  renderMetrics();
  renderChamados();
}

function renderMetrics() {
  const total = state.chamados.length;
  const atendimento = state.chamados.filter((c) => (c.situacao || "").includes("Em atendimento")).length;
  const finalizado = state.chamados.filter((c) => (c.situacao || "").includes("Finalizado")).length;
  const hoje = state.chamados.filter((c) => (c.data || c.dataAgendada) === todayISO()).length;

  setText("#metricTotal", total);
  setText("#metricAtendimento", atendimento);
  setText("#metricFinalizado", finalizado);
  setText("#metricHoje", hoje);
  setText("#resultCount", `${state.filtrados.length} chamado${state.filtrados.length === 1 ? "" : "s"}`);
}

function renderChamados() {
  const list = $("#chamadosList");
  const empty = $("#emptyState");
  if (!list) return;

  list.innerHTML = "";

  if (!state.filtrados.length) {
    empty?.classList.remove("hidden");
    return;
  }

  empty?.classList.add("hidden");

  state.filtrados.forEach((chamado) => {
    const card = document.createElement("article");
    card.className = "call-card";
    const isFinalizado = (chamado.situacao || "").includes("Finalizado");

    card.innerHTML = `
      <div class="call-card-header">
        <div>
          <h3>${escapeHTML(chamado.numeroChamado || "MED-0000")}</h3>
          <div class="client">🏢 ${escapeHTML(chamado.cliente || "Cliente não informado")}</div>
        </div>
        <span class="status-pill ${isFinalizado ? "finalizado" : ""}">${escapeHTML(chamado.situacao || "Sem situação")}</span>
      </div>

      <div class="call-info">
        <div><span>👨‍🔧 Técnico</span><strong>${escapeHTML(chamado.tecnico || "-")}</strong></div>
        <div><span>📅 Data</span><strong>${formatDateBR(chamado.data || chamado.dataAgendada)}</strong></div>
        <div><span>🌗 Período</span><strong>${escapeHTML(chamado.periodo || "-")}</strong></div>
        <div><span>📌 Status</span><strong>${escapeHTML(chamado.status || "-")}</strong></div>
      </div>

      <p class="call-description">${escapeHTML(chamado.descricaoFalha || "Sem descrição da falha.")}</p>

      <div class="call-actions">
        <button class="btn btn-primary" type="button" data-os="${escapeHTML(chamado.numeroChamado)}">🧾 Gerar Ordem de Serviço</button>
        <button class="btn btn-ghost" type="button" data-view="${escapeHTML(chamado.numeroChamado)}">👁️ Ver detalhes</button>
      </div>
    `;

    card.querySelector("[data-os]").addEventListener("click", () => abrirOS(chamado));
    card.querySelector("[data-view]").addEventListener("click", () => abrirOS(chamado));
    list.appendChild(card);
  });
}

function initOSModal() {
  const modal = $("#osModal");
  if (!modal) return;

  $("#closeModalBtn")?.addEventListener("click", () => modal.close());
  $("#addEquipamentoBtn")?.addEventListener("click", () => addEquipamentoRow());
  $("#printBtn")?.addEventListener("click", () => window.print());
  $("#limparOSBtn")?.addEventListener("click", limparCamposTecnicos);

  $("#osFotos")?.addEventListener("change", handleFotosSelecionadas);

  $$('[data-clear-signature]').forEach((btn) => {
    btn.addEventListener("click", () => clearSignature(btn.dataset.clearSignature));
  });

  initSignaturePad("assinaturaCliente", "cliente");
  initSignaturePad("assinaturaTecnico", "tecnico");

  const form = $("#formOS");
  form?.addEventListener("submit", salvarOS);
}

function abrirOS(chamado) {
  state.chamadoAtual = chamado;
  state.fotosSelecionadas = [];

  setValue("#osNumeroChamado", chamado.numeroChamado);
  setValue("#osNumeroDisplay", chamado.numeroChamado);
  setText("#printNumero", chamado.numeroChamado || "MED-0000");
  setText("#modalTitle", `Gerar OS ${chamado.numeroChamado || ""}`);

  setValue("#osTecnico", chamado.tecnico);
  setValue("#osCliente", chamado.cliente);
  setValue("#osTipoAtendimento", chamado.tipoAtendimento);
  setValue("#osData", chamado.data || chamado.dataAgendada);
  setValue("#osHoraInicio", chamado.horaInicio || "");
  setValue("#osHoraFim", chamado.horaFim || "");
  setValue("#osPeriodo", chamado.periodo);
  setValue("#osCnpj", chamado.cnpj);
  setValue("#osEndereco", chamado.endereco);
  setValue("#osSituacao", chamado.situacao);
  setValue("#osStatus", chamado.status);
  setValue("#osNomeResponsavel", chamado.nomeResponsavel);
  setValue("#osTelefone", chamado.telefone);
  setValue("#osDescricaoFalha", chamado.descricaoFalha);
  setValue("#osAcaoTomadaTecnico", chamado.acaoTomadaTecnico || chamado.acaoTomada || "");

  renderEquipamentos(chamado);
  renderFotosPreview(parseMaybeJSON(chamado.fotosJson || chamado.fotos) || []);
  clearSignature("cliente");
  clearSignature("tecnico");

  const modal = $("#osModal");
  if (modal && typeof modal.showModal === "function") modal.showModal();
}

function renderEquipamentos(chamado) {
  const container = $("#equipamentosContainer");
  if (!container) return;
  container.innerHTML = "";

  const equipamentosSalvos = parseMaybeJSON(chamado.equipamentosJson || chamado.equipamentos) || [];
  const equipamentos = equipamentosSalvos.length ? equipamentosSalvos : [chamado.modeloEquipamento || ""];

  equipamentos.forEach((valor) => addEquipamentoRow(valor));
}

function addEquipamentoRow(value = "") {
  const container = $("#equipamentosContainer");
  if (!container) return;

  const row = document.createElement("div");
  row.className = "equipamento-row";
  row.innerHTML = `
    <input type="text" class="equipamento-input" placeholder="Modelo / equipamento atendido" value="${escapeAttr(value)}" />
    <button class="remove-equip-btn no-print" type="button" title="Remover equipamento">🗑️</button>
  `;

  row.querySelector("button").addEventListener("click", () => {
    if ($$(".equipamento-row", container).length === 1) {
      row.querySelector("input").value = "";
      return;
    }
    row.remove();
  });

  container.appendChild(row);
}

async function handleFotosSelecionadas(event) {
  const files = Array.from(event.target.files || []).slice(0, 8);
  state.fotosSelecionadas = [];

  if (!files.length) return;

  toast("Preparando fotos para envio ao Drive...", "success");

  for (const file of files) {
    try {
      const base64 = await resizeImageToBase64(file);
      state.fotosSelecionadas.push({
        nome: sanitizeFilename(file.name),
        tipo: "image/jpeg",
        base64
      });
    } catch (error) {
      console.error(error);
      toast(`Não foi possível processar a foto ${file.name}.`, "error");
    }
  }

  const previews = state.fotosSelecionadas.map((foto) => ({
    nome: foto.nome,
    url: `data:${foto.tipo};base64,${foto.base64}`
  }));
  renderFotosPreview(previews);
}

function renderFotosPreview(fotos) {
  const preview = $("#fotosPreview");
  if (!preview) return;

  preview.innerHTML = "";
  const lista = Array.isArray(fotos) ? fotos : [];

  if (!lista.length) {
    preview.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1; padding: 18px;"><strong>📷 Nenhuma foto anexada</strong><p>Selecione fotos antes de salvar a OS.</p></div>`;
    return;
  }

  lista.forEach((foto) => {
    const card = document.createElement("div");
    card.className = "photo-card";
    const url = foto.url || foto.link || "";
    const nome = foto.nome || "Foto";
    card.innerHTML = `
      ${url ? `<img src="${escapeAttr(url)}" alt="${escapeAttr(nome)}">` : ""}
      ${url && !url.startsWith("data:") ? `<a href="${escapeAttr(url)}" target="_blank" rel="noopener">🔗 ${escapeHTML(nome)}</a>` : `<span>${escapeHTML(nome)}</span>`}
    `;
    preview.appendChild(card);
  });
}

async function salvarOS(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const btn = form.querySelector("button[type='submit']");
  setLoading(btn, true, "Salvando OS...");

  try {
    const equipamentos = $$(".equipamento-input").map((input) => input.value.trim()).filter(Boolean);
    const assinaturaCliente = getSignatureBase64("cliente");
    const assinaturaTecnico = getSignatureBase64("tecnico");

    const payload = {
      numeroChamado: $("#osNumeroChamado")?.value,
      horaInicio: $("#osHoraInicio")?.value,
      horaFim: $("#osHoraFim")?.value,
      equipamentos,
      acaoTomadaTecnico: $("#osAcaoTomadaTecnico")?.value,
      fotos: state.fotosSelecionadas,
      assinaturaCliente: assinaturaCliente ? {
        nome: `assinatura-cliente-${$("#osNumeroChamado")?.value}.png`,
        tipo: "image/png",
        base64: assinaturaCliente
      } : null,
      assinaturaTecnico: assinaturaTecnico ? {
        nome: `assinatura-tecnico-${$("#osNumeroChamado")?.value}.png`,
        tipo: "image/png",
        base64: assinaturaTecnico
      } : null
    };

    const response = await apiPost("updateOS", payload);
    toast(response.message || "OS salva com sucesso!", "success");

    await carregarChamados();
    const atualizado = state.chamados.find((c) => c.numeroChamado === payload.numeroChamado);
    if (atualizado) abrirOS(atualizado);
  } catch (error) {
    console.error(error);
    toast(error.message || "Erro ao salvar OS.", "error");
  } finally {
    setLoading(btn, false, "💾 Salvar OS");
  }
}

function limparCamposTecnicos() {
  setValue("#osHoraInicio", "");
  setValue("#osHoraFim", "");
  setValue("#osAcaoTomadaTecnico", "");
  state.fotosSelecionadas = [];
  const fotos = $("#osFotos");
  if (fotos) fotos.value = "";
  renderFotosPreview([]);
  clearSignature("cliente");
  clearSignature("tecnico");
  toast("Campos técnicos limpos.", "success");
}

function initSignaturePad(canvasId, key) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  let drawing = false;
  let hasDrawn = false;

  function resizeCanvas() {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = canvas.getBoundingClientRect();
    const data = canvas.toDataURL();
    canvas.width = Math.max(520, Math.floor(rect.width * ratio));
    canvas.height = Math.floor(180 * ratio);
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = "#111827";
    if (hasDrawn && data) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, 180);
      img.src = data;
    }
  }

  function getPoint(event) {
    const rect = canvas.getBoundingClientRect();
    const source = event.touches?.[0] || event;
    return {
      x: source.clientX - rect.left,
      y: source.clientY - rect.top
    };
  }

  function start(event) {
    event.preventDefault();
    drawing = true;
    hasDrawn = true;
    const p = getPoint(event);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function move(event) {
    if (!drawing) return;
    event.preventDefault();
    const p = getPoint(event);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function end() {
    drawing = false;
  }

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);

  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", end);

  state.signatures[key] = {
    canvas,
    ctx,
    clear() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasDrawn = false;
    },
    hasDrawn() {
      return hasDrawn;
    }
  };
}

function clearSignature(key) {
  state.signatures[key]?.clear();
}

function getSignatureBase64(key) {
  const signature = state.signatures[key];
  if (!signature || !signature.hasDrawn()) return "";
  return signature.canvas.toDataURL("image/png").split(",")[1];
}

async function apiGet(action) {
  if (DEMO_MODE) return demoApi(action);

  const url = new URL(CONFIG.SCRIPT_URL);
  url.searchParams.set("action", action);
  url.searchParams.set("spreadsheetId", CONFIG.SPREADSHEET_ID);

  const response = await fetch(url.toString(), { method: "GET" });
  return handleApiResponse(response);
}

async function apiPost(action, data) {
  if (DEMO_MODE) return demoApi(action, data);

  const response = await fetch(CONFIG.SCRIPT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action,
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      data
    })
  });

  return handleApiResponse(response);
}

async function handleApiResponse(response) {
  const text = await response.text();
  let json;

  try {
    json = JSON.parse(text);
  } catch (_) {
    throw new Error("Resposta inválida do Apps Script. Verifique se o Web App foi publicado como 'Qualquer pessoa'.");
  }

  if (!response.ok || json.success === false) {
    throw new Error(json.message || "Erro na comunicação com o Apps Script.");
  }

  return json;
}

function demoApi(action, data) {
  const chamados = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");

  if (action === "listChamados") {
    return Promise.resolve({ success: true, data: chamados });
  }

  if (action === "createChamado") {
    const numeroChamado = createDemoNumber(chamados);
    const now = new Date();
    const novo = {
      numeroChamado,
      criadoEm: now.toISOString(),
      ...data,
      dataAgendada: data.data,
      modeloEquipamento: data.modeloEquipamento,
      equipamentosJson: JSON.stringify([data.modeloEquipamento].filter(Boolean)),
      fotosJson: "[]"
    };
    chamados.unshift(novo);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chamados));
    return Promise.resolve({ success: true, numeroChamado, data: novo });
  }

  if (action === "updateChamado") {
    const index = chamados.findIndex((c) => c.numeroChamado === data.numeroChamado);
    if (index === -1) return Promise.reject(new Error("Chamado não encontrado no modo demonstração."));

    chamados[index] = {
      ...chamados[index],
      ...data,
      dataAgendada: data.data,
      equipamentosJson: JSON.stringify([data.modeloEquipamento].filter(Boolean)),
      atualizadoEm: new Date().toISOString()
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(chamados));
    return Promise.resolve({ success: true, message: "Chamado atualizado no modo demonstração.", data: chamados[index] });
  }

  if (action === "deleteChamado") {
    const index = chamados.findIndex((c) => c.numeroChamado === data.numeroChamado);
    if (index === -1) return Promise.reject(new Error("Chamado não encontrado no modo demonstração."));

    const [removido] = chamados.splice(index, 1);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chamados));
    return Promise.resolve({ success: true, message: "Chamado excluído no modo demonstração.", data: removido });
  }

  if (action === "updateOS") {
    const index = chamados.findIndex((c) => c.numeroChamado === data.numeroChamado);
    if (index === -1) return Promise.reject(new Error("Chamado não encontrado no modo demonstração."));

    chamados[index] = {
      ...chamados[index],
      horaInicio: data.horaInicio,
      horaFim: data.horaFim,
      equipamentosJson: JSON.stringify(data.equipamentos || []),
      acaoTomadaTecnico: data.acaoTomadaTecnico,
      fotosJson: JSON.stringify((data.fotos || []).map((foto) => ({ nome: foto.nome, url: `data:${foto.tipo};base64,${foto.base64}` }))),
      atualizadoEm: new Date().toISOString()
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(chamados));
    return Promise.resolve({ success: true, message: "OS salva no modo demonstração.", data: chamados[index] });
  }

  return Promise.resolve({ success: true });
}

function createDemoNumber(chamados) {
  let number;
  do {
    number = `MED-${Math.floor(1000 + Math.random() * 9000)}`;
  } while (chamados.some((c) => c.numeroChamado === number));
  return number;
}

function resizeImageToBase64(file, maxWidth = 1400, quality = 0.76) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Erro ao ler imagem."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Arquivo de imagem inválido."));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality).split(",")[1]);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function validateCNPJField() {
  const input = $("#cnpj");
  const help = $("#cnpjHelp");
  if (!input || !help) return true;

  if (!input.value.trim()) {
    help.textContent = "";
    help.className = "field-help";
    return false;
  }

  const valid = isValidCNPJ(input.value);
  help.textContent = valid ? "CNPJ válido." : "CNPJ inválido. Confira os números digitados.";
  help.className = `field-help ${valid ? "ok" : "error"}`;
  return valid;
}

function validatePhoneField() {
  const input = $("#telefone");
  const help = $("#telefoneHelp");
  if (!input || !help) return true;

  const digits = onlyDigits(input.value);
  const valid = digits.length === 10 || digits.length === 11;
  help.textContent = valid ? "Telefone válido." : "Informe DDD + telefone com 10 ou 11 dígitos.";
  help.className = `field-help ${valid ? "ok" : "error"}`;
  return valid;
}

function isValidCNPJ(value) {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1+$/.test(cnpj)) return false;

  const calc = (base) => {
    const weights = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = base.split("").reduce((acc, digit, idx) => acc + Number(digit) * weights[idx], 0);
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const digit1 = calc(cnpj.slice(0, 12));
  const digit2 = calc(cnpj.slice(0, 12) + digit1);
  return cnpj.endsWith(`${digit1}${digit2}`);
}

function maskCNPJ(value) {
  return onlyDigits(value)
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function maskPhone(value) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return digits
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

function formToObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function setLoading(button, loading, text) {
  if (!button) return;
  button.disabled = loading;
  button.dataset.originalText ||= button.textContent;
  button.textContent = loading ? text : (text || button.dataset.originalText);
}

function toast(message, type = "success") {
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.className = `toast show ${type}`;
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => el.className = "toast", 4200);
}

function setValue(selector, value) {
  const el = $(selector);
  if (el) el.value = value || "";
}

function setText(selector, value) {
  const el = $(selector);
  if (el) el.textContent = value ?? "";
}

function onlyDigits(value) {
  return String(value || "").replace(/\D+/g, "");
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function todayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
}

function currentTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function formatDateBR(value) {
  if (!value) return "-";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function parseMaybeJSON(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

function escapeHTML(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHTML(value).replaceAll("`", "&#096;");
}

function sanitizeFilename(name) {
  return String(name || "foto.jpg")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(0, 80);
}
