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

const WHATSAPP_TECNICOS = {
  "Carlos Ramos": "5511967395073",
  "Danilo Tinoco": "5511988722276",
  "Kadu": "5511978955692",
  "Paulo Corrêa": "5516997454168",
  "Reginaldo": "5511972167303"
};

const WHATSAPP_GRUPO_OS_DIA_A_DIA = {
  nome: "O.S + Dia a Dia !!",
  telefone: "5511988720944"
};

/*
  IMPORTANTE:
  - Com WhatsApp Web/App via navegador, o sistema abre a conversa com a mensagem pronta.
  - O envio 100% automático sem clique no botão Enviar exige uma API de WhatsApp no Back End.
  - O grupo/contato O.S + Dia a Dia !! é sempre incluído junto com o técnico selecionado.
*/

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
  fotosExistentes: [],
  fotosRemovidas: [],
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

    let janelasWhatsApp = [];

    try {
      const payload = formToObject(form);
      if (editando) payload.numeroChamado = state.editandoNumero;

      janelasWhatsApp = !editando ? prepararJanelasWhatsApp(payload.tecnico) : [];

      const response = await apiPost(editando ? "updateChamado" : "createChamado", payload);
      const numero = response.numeroChamado || response.data?.numeroChamado || payload.numeroChamado;

      if (!editando) {
        enviarResumoChamadoWhatsApp({
          ...payload,
          numeroChamado: numero
        }, janelasWhatsApp);
      }

      toast(editando ? `Chamado ${numero} atualizado com sucesso!` : `Chamado ${numero || "gerado"} salvo com sucesso! WhatsApp preparado para técnico e O.S + Dia a Dia.`, "success");
      form.reset();
      sairModoEdicao();
      initMasksAndDefaults();
      await carregarAdminChamados();

      const badge = $("#chamadoBadge");
      if (badge && numero) badge.textContent = `🚑 ${numero}`;
    } catch (error) {
      fecharJanelasWhatsAppReservadas(janelasWhatsApp);
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

function getDestinosWhatsApp(tecnico) {
  const destinos = [];
  const numerosIncluidos = new Set();
  const nomeTecnico = String(tecnico || "").trim();

  const addDestinoWhatsApp = (destino) => {
    const telefone = onlyDigits(destino?.telefone || "");
    if (!telefone || numerosIncluidos.has(telefone)) return;

    numerosIncluidos.add(telefone);
    destinos.push({
      ...destino,
      telefone
    });
  };

  addDestinoWhatsApp({
    nome: nomeTecnico || "Técnico selecionado",
    telefone: WHATSAPP_TECNICOS[nomeTecnico],
    tipo: "tecnico"
  });

  addDestinoWhatsApp({
    ...WHATSAPP_GRUPO_OS_DIA_A_DIA,
    tipo: "grupo"
  });

  return destinos;
}

function prepararJanelasWhatsApp(tecnico) {
  const destinos = getDestinosWhatsApp(tecnico);

  return destinos.map((destino) => {
    let janela = null;

    try {
      janela = window.open("", "_blank");
      if (janela) {
        janela.document.write("<p style='font-family:system-ui;padding:24px'>Preparando WhatsApp...</p>");
      }
    } catch (_) {
      janela = null;
    }

    return { destino, janela };
  });
}

function fecharJanelasWhatsAppReservadas(janelasWhatsApp = []) {
  janelasWhatsApp.forEach((item) => {
    try {
      if (item?.janela && !item.janela.closed) item.janela.close();
    } catch (_) {}
  });
}

function enviarResumoChamadoWhatsApp(chamado, janelasWhatsApp = []) {
  const destinos = janelasWhatsApp.length ? janelasWhatsApp : prepararJanelasWhatsApp(chamado.tecnico);

  if (!destinos.length) {
    toast(`WhatsApp não configurado para o técnico ${chamado.tecnico || "selecionado"}.`, "error");
    return;
  }

  destinos.forEach((item, index) => {
    const url = montarUrlWhatsApp(item.destino.telefone, montarMensagemWhatsAppChamado(chamado, item.destino));

    window.setTimeout(() => {
      try {
        if (item.janela && !item.janela.closed) {
          item.janela.location.href = url;
          return;
        }
      } catch (_) {}

      window.open(url, "_blank");
    }, index * 650);
  });
}

function montarUrlWhatsApp(telefone, mensagem) {
  const numero = onlyDigits(telefone);
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}

function montarMensagemWhatsAppChamado(chamado, destino = {}) {
  const numero = chamado.numeroChamado || chamado.printNumero || "MED-0000";
  const tecnico = chamado.tecnico || chamado.osTecnico || "-";
  const data = formatDateBR(chamado.data || chamado.osData || chamado.dataAgendada || "");
  const hora = getHoraInicioChamado(chamado) || normalizeTimeValue(chamado.hora || chamado.osHoraInicio || "") || "-";
  const cliente = chamado.cliente || chamado.osCliente || "-";
  const endereco = chamado.endereco || chamado.osEndereco || "-";
  const contato = chamado.nomeResponsavel || chamado.osNomeResponsavel || chamado.responsavel || "-";
  const telefone = chamado.telefone ? maskPhone(chamado.telefone) : (chamado.osTelefone ? maskPhone(chamado.osTelefone) : "-");
  const mencao = destino.tipo === "grupo" ? `@${tecnico}` : `@${destino.nome || tecnico}`;

  return `${mencao}\n\n` +
    `⚠️ *_PAINEL DE CHAMADOS_* ⚠️\n` +
    `======= *INFORMA* ======= \n\n` +
    `Chamado Nº: *_${numero}_*\n` +
    `Técnico: *_${tecnico}_*\n` +
    `Data: *_${data}_*\n` +
    `Hora: *_${hora}_*\n` +
    `Cliente: *_${cliente}_*\n` +
    `Endereço: *_${endereco}_*\n` +
    `Contato: *_${contato}_*\n` +
    `Telefone: *_${telefone}_*`;
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

  if (!window.confirm(`Deseja realmente excluir o chamado ${numeroChamado}${cliente}?\n\nEsta ação também moverá para a lixeira do Drive as fotos e assinaturas vinculadas a este chamado.`)) return;

  const btn = $$('[data-admin-delete]').find((button) => button.dataset.adminDelete === numeroChamado);
  setLoading(btn, true, "Excluindo...");

  try {
    const response = await apiPost("deleteChamado", { numeroChamado });
    const arquivosExcluidos = Number(response.data?.arquivosExcluidos || response.arquivosExcluidos || 0);
    const complemento = arquivosExcluidos > 0 ? ` ${arquivosExcluidos} arquivo(s) vinculado(s) movido(s) para a lixeira do Drive.` : "";
    toast(`Chamado ${numeroChamado} excluído com sucesso.${complemento}`, "success");

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

  const dateFilterToggleBtn = $("#dateFilterToggleBtn");
  const dateFilterAccordion = $("#dateFilterAccordion");

  if (dateFilterToggleBtn && dateFilterAccordion) {
    dateFilterToggleBtn.addEventListener("click", () => {
      const willOpen = dateFilterAccordion.hasAttribute("hidden");
      dateFilterAccordion.toggleAttribute("hidden", !willOpen);
      dateFilterAccordion.classList.toggle("open", willOpen);
      dateFilterToggleBtn.classList.toggle("active", willOpen);
      dateFilterToggleBtn.setAttribute("aria-expanded", String(willOpen));
      dateFilterToggleBtn.querySelector("span").textContent = willOpen ? "Filtro de data aberto" : "Selecionar data";
    });
  }

  const todayFilterBtn = $("#todayFilterBtn");
  if (todayFilterBtn) {
    todayFilterBtn.addEventListener("click", () => {
      const hoje = todayISO();
      setValue("#filtroDataInicial", hoje);
      setValue("#filtroDataFinal", hoje);
      aplicarFiltros();
      toast("Mostrando agendamentos de hoje.", "success");
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
  const dataInicial = normalizeDateISO($("#filtroDataInicial")?.value || "");
  const dataFinal = normalizeDateISO($("#filtroDataFinal")?.value || "");

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

    const dataChamado = getChamadoDateISO(item);

    return (!busca || haystack.includes(busca)) &&
      (!tecnico || normalize(item.tecnico).includes(tecnico)) &&
      (!status || item.status === status) &&
      (!situacao || item.situacao === situacao) &&
      (!periodo || item.periodo === periodo) &&
      (!dataInicial || (dataChamado && dataChamado >= dataInicial)) &&
      (!dataFinal || (dataChamado && dataChamado <= dataFinal));
  });

  renderMetrics();
  renderChamados();
}

function atualizarChamadoNoEstado(chamadoAtualizado) {
  if (!chamadoAtualizado || !chamadoAtualizado.numeroChamado) return;

  const mergeChamado = (lista) => {
    const index = lista.findIndex((item) => item.numeroChamado === chamadoAtualizado.numeroChamado);
    if (index >= 0) {
      lista[index] = {
        ...lista[index],
        ...chamadoAtualizado
      };
    }
  };

  mergeChamado(state.chamados);
  mergeChamado(state.filtrados);
  mergeChamado(state.adminChamados);

  if (state.chamadoAtual?.numeroChamado === chamadoAtualizado.numeroChamado) {
    state.chamadoAtual = {
      ...state.chamadoAtual,
      ...chamadoAtualizado
    };
  }

  aplicarFiltros();
}

function renderMetrics() {
  const total = state.chamados.length;
  const atendimento = state.chamados.filter((c) => (c.situacao || "").includes("Em atendimento")).length;
  const finalizado = state.chamados.filter((c) => (c.situacao || "").includes("Finalizado")).length;
  const hoje = state.chamados.filter((c) => getChamadoDateISO(c) === todayISO()).length;

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

  state.filtrados.forEach((chamado, index) => {
    const card = document.createElement("article");
    card.className = "call-card";
    const isFinalizado = (chamado.situacao || "").includes("Finalizado");
    const detailsId = `call-details-${String(chamado.numeroChamado || index).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    const numeroChamado = chamado.numeroChamado || "MED-0000";
    const tecnicoChamado = chamado.tecnico || "Técnico não informado";
    const nomeResponsavel = chamado.nomeResponsavel || chamado.responsavel || "-";
    const telefone = chamado.telefone ? maskPhone(chamado.telefone) : "-";
    const endereco = chamado.endereco || "-";
    const horaInicio = getHoraInicioChamado(chamado) || "-";

    card.innerHTML = `
      <div class="call-card-header">
        <div class="call-main">
          <h3><span class="call-protocol protocol-code">${escapeHTML(numeroChamado)}</span> <span class="call-title-separator">|</span> <span class="call-title-tecnico">${escapeHTML(tecnicoChamado)}</span></h3>
          <div class="call-client-row">
            <div class="client">🏢 ${escapeHTML(chamado.cliente || "Cliente não informado")}</div>
            <button class="details-toggle" type="button" data-details-toggle aria-controls="${escapeAttr(detailsId)}" aria-expanded="false">👁️ Ver detalhes</button>
          </div>
        </div>
        <span class="status-pill ${isFinalizado ? "finalizado" : ""}">${escapeHTML(chamado.situacao || "Sem situação")}</span>
      </div>

      <div id="${escapeAttr(detailsId)}" class="call-details" hidden>
        <div class="call-contact-grid">
          <div><span>👤 Nome do responsável</span><strong>${escapeHTML(nomeResponsavel)}</strong></div>
          <div><span>📞 Telefone</span><strong>${escapeHTML(telefone)}</strong></div>
          <div class="call-detail-wide"><span>📍 Endereço</span><strong>${escapeHTML(endereco)}</strong></div>
        </div>

        <div class="call-info">
          <div><span>👨‍🔧 Técnico</span><strong>${escapeHTML(chamado.tecnico || "-")}</strong></div>
          <div><span>📅 Data</span><strong>${formatDateBR(chamado.data || chamado.dataAgendada)}</strong></div>
          <div><span>▶️ Hora início</span><strong>${escapeHTML(horaInicio)}</strong></div>
          <div><span>🌗 Período</span><strong>${escapeHTML(chamado.periodo || "-")}</strong></div>
          <div><span>📌 Status</span><strong>${escapeHTML(chamado.status || "-")}</strong></div>
        </div>

        <p class="call-description"><strong>⚠️ Descrição da falha:</strong><br>${escapeHTML(chamado.descricaoFalha || "Sem descrição da falha.")}</p>

        <div class="call-actions">
          <button class="btn btn-primary" type="button" data-os="${escapeHTML(chamado.numeroChamado)}">🧾 Gerar Ordem de Serviço</button>
        </div>
      </div>
    `;

    const details = card.querySelector(".call-details");
    const detailsToggle = card.querySelector("[data-details-toggle]");

    detailsToggle?.addEventListener("click", () => {
      if (!details) return;
      const willOpen = details.hasAttribute("hidden");
      details.toggleAttribute("hidden", !willOpen);
      details.classList.toggle("open", willOpen);
      detailsToggle.classList.toggle("active", willOpen);
      detailsToggle.setAttribute("aria-expanded", String(willOpen));
      detailsToggle.textContent = willOpen ? "🙈 Ocultar detalhes" : "👁️ Ver detalhes";
    });

    card.querySelector("[data-os]")?.addEventListener("click", () => abrirOS(chamado));
    list.appendChild(card);
  });
}

function initOSModal() {
  const modal = $("#osModal");
  if (!modal) return;

  $("#closeModalBtn")?.addEventListener("click", () => modal.close());
  $("#addEquipamentoBtn")?.addEventListener("click", () => addEquipamentoRow());
  $("#printBtn")?.addEventListener("click", imprimirOS);
  $("#limparOSBtn")?.addEventListener("click", limparCamposTecnicos);

  $("#osFotos")?.addEventListener("change", handleFotosSelecionadas);

  $$('[data-clear-signature]').forEach((btn) => {
    btn.addEventListener("click", () => clearSignature(btn.dataset.clearSignature));
  });

  initSignaturePad("assinaturaCliente", "cliente");
  initSignaturePad("assinaturaTecnico", "tecnico");

  const form = $("#formOS");
  form?.addEventListener("submit", salvarOS);

  modal.addEventListener("input", (event) => {
    if (event.target.matches('input:not([type="hidden"]):not([type="file"]), textarea, select')) {
      syncPrintValue(event.target);
    }
  });

  modal.addEventListener("change", (event) => {
    if (event.target.matches('input:not([type="hidden"]):not([type="file"]), textarea, select')) {
      syncPrintValue(event.target);
    }
  });

  window.addEventListener("beforeprint", preparePrintValues);
  window.addEventListener("afterprint", restoreDocumentTitleAfterPrint);
}

async function imprimirOS() {
  preparePrintValues();
  prepareSignaturesForPrint();
  await waitForPrintImages();

  state.documentTitleBeforePrint = document.title;
  document.title = buildOSPrintFilename();

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => window.print());
  });
}

function restoreDocumentTitleAfterPrint() {
  if (state.documentTitleBeforePrint) {
    document.title = state.documentTitleBeforePrint;
    state.documentTitleBeforePrint = null;
  }
}

function preparePrintValues() {
  const printArea = $("#printArea");
  if (!printArea) return;

  $$('input:not([type="hidden"]):not([type="file"]), textarea, select', printArea).forEach(syncPrintValue);
  prepareSignaturesForPrint();
}

function prepareSignaturesForPrint() {
  const signatures = [
    { key: "cliente", canvasId: "assinaturaCliente" },
    { key: "tecnico", canvasId: "assinaturaTecnico" }
  ];

  signatures.forEach(({ key, canvasId }) => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    let printImg = canvas.parentElement?.querySelector(`.signature-print-img[data-signature-print="${key}"]`);
    if (!printImg) {
      printImg = document.createElement("img");
      printImg.className = "signature-print-img";
      printImg.dataset.signaturePrint = key;
      printImg.alt = key === "cliente" ? "Assinatura do Cliente" : "Assinatura do Técnico";
      canvas.insertAdjacentElement("afterend", printImg);
    }

    try {
      printImg.src = canvas.toDataURL("image/png");
    } catch (error) {
      console.warn("Não foi possível preparar a assinatura para impressão.", error);
      printImg.removeAttribute("src");
    }
  });
}

function waitForPrintImages(timeout = 3500) {
  const printArea = $("#printArea");
  if (!printArea) return Promise.resolve();

  const images = $$('img', printArea).filter((img) => img.src && !img.complete);
  if (!images.length) return Promise.resolve();

  return new Promise((resolve) => {
    let done = false;
    let pending = images.length;

    const finish = () => {
      if (done) return;
      pending -= 1;
      if (pending <= 0) {
        done = true;
        resolve();
      }
    };

    const timer = window.setTimeout(() => {
      if (done) return;
      done = true;
      resolve();
    }, timeout);

    const finishOne = () => {
      if (done) return;
      pending -= 1;
      if (pending <= 0) {
        done = true;
        window.clearTimeout(timer);
        resolve();
      }
    };

    images.forEach((img) => {
      img.addEventListener("load", finishOne, { once: true });
      img.addEventListener("error", finishOne, { once: true });
    });
  });
}

function syncPrintValue(control) {
  if (!control) return;

  let printValue = control.nextElementSibling;
  if (!printValue || !printValue.classList.contains("print-value")) {
    printValue = document.createElement("div");
    printValue.className = "print-value";
    printValue.setAttribute("aria-hidden", "true");
    control.insertAdjacentElement("afterend", printValue);
  }

  const value = getPrintableControlValue(control);
  printValue.textContent = value && value.trim() ? value : "-";
}

function getPrintableControlValue(control) {
  const raw = control.value || control.textContent || "-";
  const id = control.id || "";
  const name = control.name || "";
  const type = control.getAttribute("type") || "";
  const isDateField = type === "date" || /data/i.test(`${id} ${name}`);
  if (isDateField) return formatDateBR(raw);
  return raw || "-";
}

function buildOSPrintFilename() {
  const numero = cleanFilenamePart($("#printNumero")?.textContent || $("#osNumeroDisplay")?.value || "MED-0000");
  const cliente = cleanFilenamePart($("#osCliente")?.value || "Cliente");
  const status = cleanFilenamePart($("#osStatus")?.value || "Status");
  const tecnico = cleanFilenamePart($("#osTecnico")?.value || "Tecnico");
  const dataBR = formatDateBR($("#osData")?.value || "");
  const dataArquivo = cleanFilenamePart(dataBR.replaceAll("/", "-") || "Data");
  return `OS Nº_${numero} - ${cliente} - ${status} - ${tecnico} - ${dataArquivo}`;
}

function cleanFilenamePart(value) {
  return String(value || "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "-";
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
  setValue("#osData", formatDateBR(chamado.data || chamado.dataAgendada));
  setValue("#osHoraInicio", getHoraInicioChamado(chamado));
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
  state.fotosExistentes = parseMaybeJSON(chamado.fotosJson || chamado.fotos) || [];
  state.fotosSelecionadas = [];
  state.fotosRemovidas = [];
  renderFotosPreview();
  clearSignature("cliente");
  clearSignature("tecnico");

  const modal = $("#osModal");
  if (modal && typeof modal.showModal === "function") modal.showModal();

  preparePrintValues();
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
  syncPrintValue(row.querySelector(".equipamento-input"));
}

async function handleFotosSelecionadas(event) {
  const atuais = state.fotosExistentes.length + state.fotosSelecionadas.length;
  const limite = Math.max(0, 8 - atuais);
  const files = Array.from(event.target.files || []).slice(0, limite || 0);

  if (!files.length) {
    if (atuais >= 8) toast("Limite de 8 fotos por OS atingido.", "error");
    return;
  }

  toast("Compactando fotos para economizar espaço no Drive...", "success");

  for (const file of files) {
    try {
      const fotoCompactada = await compressImageFile(file);
      state.fotosSelecionadas.push(fotoCompactada);
    } catch (error) {
      console.error(error);
      toast(`Não foi possível processar a foto ${file.name}.`, "error");
    }
  }

  if (event.target) event.target.value = "";
  renderFotosPreview();
  toast("Fotos compactadas e prontas para salvar na pasta Fotos_Chamados.", "success");
}

function getFotosParaPreview() {
  const existentes = state.fotosExistentes.map((foto, index) => ({
    ...foto,
    _source: "existente",
    _index: index
  }));

  const novas = state.fotosSelecionadas.map((foto, index) => ({
    nome: foto.nome,
    url: `data:${foto.tipo};base64,${foto.base64}`,
    previewUrl: `data:${foto.tipo};base64,${foto.base64}`,
    _source: "nova",
    _index: index
  }));

  return existentes.concat(novas);
}

function renderFotosPreview(fotos) {
  const preview = $("#fotosPreview");
  if (!preview) return;

  preview.innerHTML = "";
  const lista = Array.isArray(fotos) ? fotos : getFotosParaPreview();

  if (!lista.length) {
    preview.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1; padding: 18px;"><strong>📷 Nenhuma foto anexada</strong><p>Selecione fotos antes de salvar a OS.</p></div>`;
    return;
  }

  lista.forEach((foto) => {
    const card = document.createElement("div");
    card.className = "photo-card";
    const imgSrc = getPhotoImageSrc(foto);
    const linkUrl = foto.url || foto.link || imgSrc || "";
    const nome = foto.nome || "Foto";
    card.innerHTML = `
      ${imgSrc ? `<img src="${escapeAttr(imgSrc)}" alt="${escapeAttr(nome)}">` : ""}
      ${linkUrl && !linkUrl.startsWith("data:") ? `<a href="${escapeAttr(linkUrl)}" target="_blank" rel="noopener">🔗 ${escapeHTML(nome)}</a>` : `<span>${escapeHTML(nome)}</span>`}
      ${foto._source ? `<button class="photo-delete-btn no-print" type="button" data-photo-source="${escapeAttr(foto._source)}" data-photo-index="${escapeAttr(foto._index)}" title="Excluir foto desta OS" aria-label="Excluir foto desta OS">🗑️</button>` : ""}
    `;
    preview.appendChild(card);
  });

  $$("[data-photo-source]", preview).forEach((button) => {
    button.addEventListener("click", () => removerFotoOS(button.dataset.photoSource, Number(button.dataset.photoIndex)));
  });
}

function getPhotoImageSrc(foto) {
  if (!foto) return "";
  if (foto.previewUrl) return foto.previewUrl;
  if (foto.urlPreview) return foto.urlPreview;
  if (foto.base64) return `data:${foto.tipo || "image/jpeg"};base64,${foto.base64}`;

  const url = foto.url || foto.link || "";
  if (url.startsWith("data:")) return url;

  const driveId = foto.id || foto.fileId || extractDriveFileId(url);
  if (driveId) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveId)}&sz=w1200`;

  return url;
}

function extractDriveFileId(url) {
  const text = String(url || "");
  const patterns = [
    /\/d\/([a-zA-Z0-9_-]+)/,
    /id=([a-zA-Z0-9_-]+)/,
    /file\/d\/([a-zA-Z0-9_-]+)/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }

  return "";
}

function buildFotoPreviewCache() {
  const cache = [];

  state.fotosExistentes.forEach((foto, index) => {
    const previewUrl = getLocalPreviewUrl(foto);
    if (!previewUrl) return;
    cache.push({
      nome: foto.nome || "",
      token: getFotoToken(foto),
      previewUrl,
      index
    });
  });

  state.fotosSelecionadas.forEach((foto, index) => {
    cache.push({
      nome: foto.nome || "",
      token: "",
      previewUrl: `data:${foto.tipo || "image/jpeg"};base64,${foto.base64}`,
      index: state.fotosExistentes.length + index
    });
  });

  return cache;
}

function getLocalPreviewUrl(foto) {
  if (!foto) return "";
  if (foto.previewUrl) return foto.previewUrl;
  if (foto.urlPreview) return foto.urlPreview;
  if (String(foto.url || "").startsWith("data:")) return foto.url;
  if (String(foto.link || "").startsWith("data:")) return foto.link;
  if (foto.base64) return `data:${foto.tipo || "image/jpeg"};base64,${foto.base64}`;
  return "";
}

function getFotoToken(foto) {
  if (!foto) return "";
  return String(foto.id || foto.fileId || foto.url || foto.link || foto.nome || "");
}

function aplicarPreviewLocalNasFotos(fotos, cache = []) {
  if (!Array.isArray(fotos)) return [];
  const usados = new Set();

  return fotos.map((foto, index) => {
    const atual = { ...foto };
    if (getLocalPreviewUrl(atual)) return atual;

    const token = getFotoToken(atual);
    let encontrado = token ? cache.find((item, cacheIndex) => !usados.has(cacheIndex) && item.token && item.token === token) : null;

    if (!encontrado && atual.nome) {
      encontrado = cache.find((item, cacheIndex) => !usados.has(cacheIndex) && item.nome && item.nome === atual.nome);
    }

    if (!encontrado && atual.nome) {
      encontrado = cache.find((item, cacheIndex) => !usados.has(cacheIndex) && item.nome && (atual.nome.includes(item.nome) || item.nome.includes(atual.nome)));
    }

    if (!encontrado) {
      encontrado = cache.find((item, cacheIndex) => !usados.has(cacheIndex) && item.index === index);
    }

    if (encontrado?.previewUrl) {
      const cacheIndex = cache.indexOf(encontrado);
      usados.add(cacheIndex);
      atual.previewUrl = encontrado.previewUrl;
    }

    return atual;
  });
}

function stripFotoClientOnlyFields(foto) {
  if (!foto) return foto;
  const { previewUrl, urlPreview, _source, _index, ...limpa } = foto;
  return limpa;
}

function removerFotoOS(source, index) {
  if (Number.isNaN(index)) return;

  if (source === "existente") {
    const [removida] = state.fotosExistentes.splice(index, 1);
    const token = removida?.id || removida?.fileId || removida?.url || removida?.link || removida?.nome || "";
    if (token) state.fotosRemovidas.push(token);
    toast("Foto removida da OS. Clique em Salvar OS para confirmar.", "success");
  }

  if (source === "nova") {
    state.fotosSelecionadas.splice(index, 1);
    toast("Foto removida antes do envio ao Drive.", "success");
  }

  renderFotosPreview();
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

    const horaInicio = $("#osHoraInicio")?.value || "";
    const horaFim = $("#osHoraFim")?.value || "";
    const situacao = $("#osSituacao")?.value || "";
    const acaoTomadaTecnico = $("#osAcaoTomadaTecnico")?.value || "";

    if (!situacao) {
      toast("Selecione a situação da OS antes de salvar.", "error");
      $("#osSituacao")?.focus();
      return;
    }

    const previewCacheFotos = buildFotoPreviewCache();

    const payload = {
      numeroChamado: $("#osNumeroChamado")?.value,
      horaInicio,
      horaFim,
      situacao,
      equipamentos,
      acaoTomadaTecnico,

      // Campos abaixo mantêm compatibilidade caso o Back End esteja esperando os IDs do modal.
      osHoraInicio: horaInicio,
      osHoraFim: horaFim,
      osSituacao: situacao,
      osAcaoTomadaTecnico: acaoTomadaTecnico,

      fotos: state.fotosSelecionadas,
      fotosMantidas: state.fotosExistentes.map(stripFotoClientOnlyFields),
      fotosRemovidas: state.fotosRemovidas,
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

    const atualizado = response.data || {
      ...(state.chamadoAtual || {}),
      numeroChamado: payload.numeroChamado,
      horaInicio,
      horaFim,
      situacao,
      equipamentosJson: JSON.stringify(equipamentos),
      acaoTomadaTecnico,
      fotosJson: JSON.stringify(state.fotosExistentes)
    };

    atualizarChamadoNoEstado(atualizado);

    const fotosAtualizadas = parseMaybeJSON(atualizado.fotosJson || atualizado.fotos) || null;
    if (Array.isArray(fotosAtualizadas)) {
      state.fotosExistentes = aplicarPreviewLocalNasFotos(fotosAtualizadas, previewCacheFotos);
      state.fotosSelecionadas = [];
      state.fotosRemovidas = [];
      renderFotosPreview();
    }

    if (state.chamadoAtual?.numeroChamado === payload.numeroChamado) {
      state.chamadoAtual = {
        ...state.chamadoAtual,
        ...atualizado
      };
    }

    preparePrintValues();
    await carregarChamados();

    const chamadoAtualizado = state.chamados.find((c) => c.numeroChamado === payload.numeroChamado) || atualizado;
    if (chamadoAtualizado) {
      state.chamadoAtual = {
        ...state.chamadoAtual,
        ...chamadoAtualizado
      };
    }

    // Importante: não chamamos abrirOS() aqui.
    // Isso mantém todos os campos preenchidos no modal após salvar,
    // permitindo imprimir/PDF depois sem perder as informações digitadas.
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
  state.fotosRemovidas.push(...state.fotosExistentes.map((foto) => foto.id || foto.fileId || foto.url || foto.link || foto.nome).filter(Boolean));
  state.fotosExistentes = [];
  state.fotosSelecionadas = [];
  const fotos = $("#osFotos");
  if (fotos) fotos.value = "";
  renderFotosPreview();
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
      horaInicio: data.horaInicio || data.osHoraInicio || "",
      horaFim: data.horaFim || data.osHoraFim || "",
      situacao: data.situacao || data.osSituacao || chamados[index].situacao || "",
      equipamentosJson: JSON.stringify(data.equipamentos || []),
      acaoTomadaTecnico: data.acaoTomadaTecnico || data.osAcaoTomadaTecnico || "",
      fotosJson: JSON.stringify((data.fotosMantidas || []).concat((data.fotos || []).map((foto) => ({ nome: foto.nome, url: `data:${foto.tipo};base64,${foto.base64}` })))),
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

function compressImageFile(file, maxSize = 1280, quality = 0.68) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith("image/")) {
      reject(new Error("Selecione apenas arquivos de imagem."));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Erro ao ler imagem."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Arquivo de imagem inválido."));
      img.onload = () => {
        const maiorLado = Math.max(img.width, img.height);
        const scale = Math.min(1, maxSize / maiorLado);
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d", { alpha: false });
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        const base64 = dataUrl.split(",")[1] || "";
        const tamanhoCompactado = Math.round((base64.length * 3) / 4);
        const originalName = sanitizeFilename(file.name || "foto.jpg");
        const finalName = originalName.replace(/\.[^.]+$/, "") + "-compactada.jpg";

        resolve({
          nome: finalName,
          tipo: "image/jpeg",
          base64,
          largura: width,
          altura: height,
          tamanhoOriginal: file.size || 0,
          tamanhoCompactado
        });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function resizeImageToBase64(file, maxWidth = 1280, quality = 0.68) {
  return compressImageFile(file, maxWidth, quality).then((foto) => foto.base64);
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

function getChamadoDateISO(chamado) {
  if (!chamado) return "";
  return normalizeDateISO(
    chamado.data ||
    chamado.dataAgendada ||
    chamado.osData ||
    chamado.dataAtendimento ||
    chamado.DATA ||
    ""
  );
}

function normalizeDateISO(value) {
  if (!value) return "";

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return dateToLocalISO(value);
  }

  const raw = String(value).trim();
  if (!raw) return "";

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`;
  }

  const br = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
  if (br) {
    return `${br[3]}-${String(br[2]).padStart(2, "0")}-${String(br[1]).padStart(2, "0")}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return dateToLocalISO(parsed);
  }

  return "";
}

function dateToLocalISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function getHoraInicioChamado(chamado) {
  if (!chamado) return "";

  return normalizeTimeValue(
    chamado.horaInicio ||
    chamado.osHoraInicio ||
    chamado.horaInicial ||
    chamado.inicio ||
    chamado.hora ||
    chamado.horario ||
    chamado.HORA_INICIO ||
    chamado.HORA ||
    ""
  );
}

function normalizeTimeValue(value) {
  if (!value) return "";

  const raw = String(value).trim();
  if (!raw) return "";

  const match = raw.match(/(\d{1,2}):(\d{2})/);
  if (match) {
    return `${String(match[1]).padStart(2, "0")}:${match[2]}`;
  }

  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  return raw;
}

function formatDateBR(value) {
  if (!value) return "-";
  const raw = String(value).trim();

  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[1]}/${br[2]}/${br[3]}`;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;

  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  }

  return raw.split(/[T\s]/)[0] || raw;
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
