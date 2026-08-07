/**
 * MED PLUS+ | Sistema de Chamados x Agenda x Checklists
 * Back End: Google Sheets + Apps Script
 *
 * COMO USAR:
 * 1) Crie uma planilha no Google Sheets.
 * 2) Copie o ID da NOVA planilha e cole em DEFAULT_SPREADSHEET_ID.
 * 3) Execute a função CRIAR_ESTRUTURA uma vez.
 * 4) Publique como Web App: Implantar > Nova implantação > App da Web.
 * 5) Permissão: Executar como você / Quem tem acesso: Qualquer pessoa.
 */

const DEFAULT_SPREADSHEET_ID = '1a9_QQPxp56JcmWyDfQoLH9RuQxfTLbHPimfjImoUI8A';
const SHEET_CHAMADOS = 'CHAMADOS';
const SHEET_LOGS = 'LOGS';
const DRIVE_FOLDER_NAME = 'Fotos_Chamados';

const HEADERS = [
  'NUM_CHAMADO',
  'CRIADO_EM',
  'ATUALIZADO_EM',
  'TECNICO',
  'CLIENTE',
  'TIPO_ATENDIMENTO',
  'DATA',
  'HORA',
  'PERIODO',
  'CNPJ',
  'ENDERECO',
  'SITUACAO',
  'MODELO_EQUIPAMENTO',
  'EQUIPAMENTOS_JSON',
  'STATUS',
  'DESCRICAO_FALHA',
  'ACAO_TOMADA_ABERTURA',
  'HORA_INICIO',
  'HORA_FIM',
  'ACAO_TOMADA_TECNICO',
  'FOTOS_JSON',
  'ASSINATURA_CLIENTE_URL',
  'ASSINATURA_TECNICO_URL',
  'NOME_RESPONSAVEL',
  'TELEFONE'
];

const LOG_HEADERS = ['DATA_HORA', 'ACAO', 'NUM_CHAMADO', 'DETALHES'];

function doGet(e) {
  try {
    e = e || { parameter: {} };
    e.parameter = e.parameter || {};
    const action = String(e.parameter.action || 'health');
    const ss = getSpreadsheet_(e.parameter.spreadsheetId);

    if (action === 'health') {
      return json_({ success: true, message: 'MED PLUS+ Back End online.' });
    }

    if (action === 'listChamados') {
      const data = listChamados_(ss);
      return json_({ success: true, data });
    }

    return json_({ success: false, message: 'Ação GET não reconhecida: ' + action });
  } catch (err) {
    logError_(null, 'GET_ERROR', '', err);
    return json_({ success: false, message: err.message || String(err) });
  }
}

function doPost(e) {
  try {
    const body = parseBody_(e);
    const action = String(body.action || '');
    const ss = getSpreadsheet_(body.spreadsheetId);
    const data = body.data || {};

    if (action === 'createChamado') {
      const chamado = createChamado_(ss, data);
      return json_({
        success: true,
        message: 'Chamado criado com sucesso.',
        numeroChamado: chamado.numeroChamado,
        data: chamado
      });
    }

    if (action === 'updateChamado') {
      const chamado = updateChamado_(ss, data);
      return json_({
        success: true,
        message: 'Chamado atualizado com sucesso.',
        numeroChamado: chamado.numeroChamado,
        data: chamado
      });
    }

    if (action === 'deleteChamado') {
      const chamado = deleteChamado_(ss, data);
      return json_({
        success: true,
        message: 'Chamado excluído com sucesso.',
        numeroChamado: chamado.numeroChamado,
        data: chamado
      });
    }

    if (action === 'updateOS') {
      const chamado = updateOS_(ss, data);
      return json_({
        success: true,
        message: 'Ordem de Serviço salva com sucesso.',
        data: chamado
      });
    }

    return json_({ success: false, message: 'Ação POST não reconhecida: ' + action });
  } catch (err) {
    logError_(null, 'POST_ERROR', '', err);
    return json_({ success: false, message: err.message || String(err) });
  }
}

/**
 * Execute esta função manualmente uma vez para criar toda a estrutura.
 */
function CRIAR_ESTRUTURA() {
  const ss = getSpreadsheet_();
  const sheet = ensureSheet_(ss, SHEET_CHAMADOS, HEADERS);
  const logs = ensureSheet_(ss, SHEET_LOGS, LOG_HEADERS);

  formatChamadosSheet_(sheet);
  formatLogsSheet_(logs);
  createDriveFolder_(ss);

  SpreadsheetApp.flush();
  return 'Estrutura criada com sucesso: abas CHAMADOS e LOGS configuradas.';
}


/**
 * Atalho com nome mais claro para executar na primeira instalação.
 */
function INSTALAR_BACKEND_COMPLETO() {
  return CRIAR_ESTRUTURA();
}

/**
 * Função opcional para testar rapidamente o Back End depois de autorizar o Apps Script.
 */
function TESTAR_BACKEND() {
  CRIAR_ESTRUTURA();
  const ss = getSpreadsheet_();
  const chamado = createChamado_(ss, {
    tecnico: 'Técnico Teste',
    cliente: 'Cliente Teste',
    tipoAtendimento: 'Visita técnica',
    data: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    hora: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm'),
    periodo: 'Manhã',
    cnpj: '00.000.000/0000-00',
    endereco: 'Endereço de teste',
    situacao: 'Em atendimento 🔧',
    modeloEquipamento: 'Equipamento Teste',
    status: 'Contrato',
    descricaoFalha: 'Falha de teste',
    acaoTomada: 'Ação inicial de teste',
    nomeResponsavel: 'Responsável Teste',
    telefone: '(00) 00000-0000'
  });
  return 'Teste criado: ' + chamado.numeroChamado;
}

function createChamado_(ss, data) {
  const sheet = ensureSheet_(ss, SHEET_CHAMADOS, HEADERS);
  const numeroChamado = generateUniqueNumber_(sheet);
  const now = now_();

  const rowObject = {
    NUM_CHAMADO: numeroChamado,
    CRIADO_EM: now,
    ATUALIZADO_EM: now,
    TECNICO: clean_(data.tecnico),
    CLIENTE: clean_(data.cliente),
    TIPO_ATENDIMENTO: clean_(data.tipoAtendimento),
    DATA: clean_(data.data),
    HORA: clean_(data.hora),
    PERIODO: clean_(data.periodo),
    CNPJ: clean_(data.cnpj),
    ENDERECO: clean_(data.endereco),
    SITUACAO: clean_(data.situacao),
    MODELO_EQUIPAMENTO: clean_(data.modeloEquipamento),
    EQUIPAMENTOS_JSON: JSON.stringify([clean_(data.modeloEquipamento)].filter(Boolean)),
    STATUS: clean_(data.status),
    DESCRICAO_FALHA: clean_(data.descricaoFalha),
    ACAO_TOMADA_ABERTURA: clean_(data.acaoTomada),
    HORA_INICIO: '',
    HORA_FIM: '',
    ACAO_TOMADA_TECNICO: '',
    FOTOS_JSON: '[]',
    ASSINATURA_CLIENTE_URL: '',
    ASSINATURA_TECNICO_URL: '',
    NOME_RESPONSAVEL: clean_(data.nomeResponsavel),
    TELEFONE: clean_(data.telefone)
  };

  sheet.appendRow(HEADERS.map((header) => rowObject[header] || ''));
  log_(ss, 'CREATE_CHAMADO', numeroChamado, 'Chamado criado pelo formulário de abertura.');

  return rowToChamado_(rowObject);
}


function updateChamado_(ss, data) {
  const sheet = ensureSheet_(ss, SHEET_CHAMADOS, HEADERS);
  const numeroChamado = clean_(data.numeroChamado);
  if (!numeroChamado) throw new Error('Número do chamado não informado para edição.');

  const found = findRowByChamado_(sheet, numeroChamado);
  if (!found) throw new Error('Chamado não encontrado: ' + numeroChamado);

  const current = rowArrayToObject_(found.values);
  let equipamentosJson = current.EQUIPAMENTOS_JSON || '[]';
  const equipamentosAtuais = parseJsonArray_(equipamentosJson);
  const modeloAnterior = clean_(current.MODELO_EQUIPAMENTO);
  const novoModelo = clean_(data.modeloEquipamento);

  if (!equipamentosAtuais.length || (equipamentosAtuais.length === 1 && clean_(equipamentosAtuais[0]) === modeloAnterior)) {
    equipamentosJson = JSON.stringify([novoModelo].filter(Boolean));
  }

  const updates = {
    ATUALIZADO_EM: now_(),
    TECNICO: clean_(data.tecnico),
    CLIENTE: clean_(data.cliente),
    TIPO_ATENDIMENTO: clean_(data.tipoAtendimento),
    DATA: clean_(data.data),
    HORA: clean_(data.hora),
    PERIODO: clean_(data.periodo),
    CNPJ: clean_(data.cnpj),
    ENDERECO: clean_(data.endereco),
    SITUACAO: clean_(data.situacao),
    MODELO_EQUIPAMENTO: novoModelo,
    EQUIPAMENTOS_JSON: equipamentosJson,
    STATUS: clean_(data.status),
    DESCRICAO_FALHA: clean_(data.descricaoFalha),
    ACAO_TOMADA_ABERTURA: clean_(data.acaoTomada),
    NOME_RESPONSAVEL: clean_(data.nomeResponsavel),
    TELEFONE: clean_(data.telefone)
  };

  Object.keys(updates).forEach((header) => {
    const col = HEADERS.indexOf(header) + 1;
    if (col > 0) sheet.getRange(found.row, col).setValue(updates[header]);
  });

  log_(ss, 'UPDATE_CHAMADO', numeroChamado, 'Chamado editado pela área administrativa da abertura.');

  const updatedValues = sheet.getRange(found.row, 1, 1, HEADERS.length).getValues()[0];
  return rowToChamado_(rowArrayToObject_(updatedValues));
}

function deleteChamado_(ss, data) {
  const sheet = ensureSheet_(ss, SHEET_CHAMADOS, HEADERS);
  const numeroChamado = clean_(data.numeroChamado);
  if (!numeroChamado) throw new Error('Número do chamado não informado para exclusão.');

  const found = findRowByChamado_(sheet, numeroChamado);
  if (!found) throw new Error('Chamado não encontrado: ' + numeroChamado);

  const rowObject = rowArrayToObject_(found.values);
  const chamado = rowToChamado_(rowObject);
  const arquivosExcluidos = trashChamadoLinkedDriveFiles_(ss, numeroChamado, rowObject);

  sheet.deleteRow(found.row);
  log_(ss, 'DELETE_CHAMADO', numeroChamado, 'Chamado excluído pela área administrativa. Arquivos vinculados movidos para a lixeira do Drive: ' + arquivosExcluidos + '.');

  chamado.arquivosExcluidos = arquivosExcluidos;
  return chamado;
}

function updateOS_(ss, data) {
  const sheet = ensureSheet_(ss, SHEET_CHAMADOS, HEADERS);
  const numeroChamado = clean_(data.numeroChamado);
  if (!numeroChamado) throw new Error('Número do chamado não informado.');

  const found = findRowByChamado_(sheet, numeroChamado);
  if (!found) throw new Error('Chamado não encontrado: ' + numeroChamado);

  const current = rowArrayToObject_(found.values);
  const folder = createDriveFolder_(ss);

  let fotos = parseJsonArray_(current.FOTOS_JSON);
  const fotosRemovidas = Array.isArray(data.fotosRemovidas) ? data.fotosRemovidas.map(clean_).filter(Boolean) : [];

  if (fotosRemovidas.length) {
    trashDriveFiles_(fotosRemovidas);
    fotos = fotos.filter((foto) => !isFotoRemovida_(foto, fotosRemovidas));
  }

  if (Array.isArray(data.fotosMantidas)) {
    const mantidas = data.fotosMantidas.map(normalizeFotoSalva_).filter((foto) => foto.url || foto.id || foto.nome);
    if (mantidas.length || fotosRemovidas.length) fotos = mantidas;
  }

  if (Array.isArray(data.fotos) && data.fotos.length) {
    const fotosSalvas = saveFiles_(folder, data.fotos, numeroChamado, 'foto');
    fotos = fotos.concat(fotosSalvas);
  }

  let assinaturaClienteUrl = current.ASSINATURA_CLIENTE_URL || '';
  if (data.assinaturaCliente && data.assinaturaCliente.base64) {
    assinaturaClienteUrl = saveSingleFile_(folder, data.assinaturaCliente, numeroChamado, 'assinatura-cliente').url;
  }

  let assinaturaTecnicoUrl = current.ASSINATURA_TECNICO_URL || '';
  if (data.assinaturaTecnico && data.assinaturaTecnico.base64) {
    assinaturaTecnicoUrl = saveSingleFile_(folder, data.assinaturaTecnico, numeroChamado, 'assinatura-tecnico').url;
  }

  const novaSituacao = clean_(data.situacao || data.osSituacao || current.SITUACAO);

  const updates = {
    ATUALIZADO_EM: now_(),
    HORA_INICIO: clean_(data.horaInicio || data.osHoraInicio),
    HORA_FIM: clean_(data.horaFim || data.osHoraFim),
    SITUACAO: novaSituacao,
    EQUIPAMENTOS_JSON: JSON.stringify(Array.isArray(data.equipamentos) ? data.equipamentos.map(clean_).filter(Boolean) : []),
    ACAO_TOMADA_TECNICO: clean_(data.acaoTomadaTecnico || data.osAcaoTomadaTecnico),
    FOTOS_JSON: JSON.stringify(fotos),
    ASSINATURA_CLIENTE_URL: assinaturaClienteUrl,
    ASSINATURA_TECNICO_URL: assinaturaTecnicoUrl
  };

  Object.keys(updates).forEach((header) => {
    const col = HEADERS.indexOf(header) + 1;
    if (col > 0) sheet.getRange(found.row, col).setValue(updates[header]);
  });

  log_(ss, 'UPDATE_OS', numeroChamado, 'Ordem de Serviço atualizada pelo painel técnico.');

  const updatedValues = sheet.getRange(found.row, 1, 1, HEADERS.length).getValues()[0];
  return rowToChamado_(rowArrayToObject_(updatedValues));
}

function listChamados_(ss) {
  const sheet = ensureSheet_(ss, SHEET_CHAMADOS, HEADERS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  return values
    .filter((row) => row.some((cell) => String(cell).trim() !== ''))
    .map((row) => rowToChamado_(rowArrayToObject_(row)))
    .reverse();
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const needsHeader = headers.some((header, idx) => firstRow[idx] !== header);

  if (needsHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  return sheet;
}

function formatChamadosSheet_(sheet) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, HEADERS.length)
    .setBackground('#0f3343')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  sheet.getRange('A:A').setNumberFormat('@');
  sheet.getRange('G:G').setNumberFormat('@');
  sheet.getRange('H:H').setNumberFormat('@');
  sheet.getRange('J:J').setNumberFormat('@');
  sheet.getRange('R:S').setNumberFormat('@');
  sheet.getRange('Y:Y').setNumberFormat('@');

  applyValidation_(sheet, 'G2:G', null);
  applyValidation_(sheet, 'F2:F', ['Atendimento Chat', 'Remoto', 'Telefônico', 'Visita técnica']);
  applyValidation_(sheet, 'I2:I', ['Manhã', 'Tarde', 'Noite']);
  applyValidation_(sheet, 'L2:L', ['Em atendimento 🔧', 'Finalizado ✅']);
  applyValidation_(sheet, 'O2:O', ['Aluguel', 'Avulso', 'Cancelada', 'Contrato', 'Desinstalação', 'Garantia', 'Instalação']);

  sheet.autoResizeColumns(1, HEADERS.length);
}

function formatLogsSheet_(sheet) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, LOG_HEADERS.length)
    .setBackground('#a61e20')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setHorizontalAlignment('center');
  sheet.autoResizeColumns(1, LOG_HEADERS.length);
}

function applyValidation_(sheet, rangeA1, options) {
  if (!options) return;
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(options, true)
    .setAllowInvalid(true)
    .build();
  sheet.getRange(rangeA1).setDataValidation(rule);
}

function getSpreadsheet_(spreadsheetId) {
  const id = spreadsheetId || DEFAULT_SPREADSHEET_ID;
  if (!id || id === 'COLE_AQUI_O_ID_DA_PLANILHA' || id === 'COLE_AQUI_O_ID_DA_NOVA_PLANILHA') {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
    throw new Error('Cole o ID da nova planilha em DEFAULT_SPREADSHEET_ID no Codigo.gs.');
  }
  return SpreadsheetApp.openById(id);
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  const contents = e.postData.contents;
  try {
    return JSON.parse(contents);
  } catch (err) {
    return e.parameter || {};
  }
}

function generateUniqueNumber_(sheet) {
  const existing = new Set();
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    sheet.getRange(2, 1, lastRow - 1, 1).getValues().forEach((row) => existing.add(String(row[0])));
  }

  let numero;
  let attempts = 0;
  do {
    numero = 'MED-' + Math.floor(1000 + Math.random() * 9000);
    attempts++;
  } while (existing.has(numero) && attempts < 1000);

  if (existing.has(numero)) {
    numero = 'MED-' + new Date().getTime().toString().slice(-6);
  }

  return numero;
}

function findRowByChamado_(sheet, numeroChamado) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === numeroChamado) {
      return { row: i + 2, values: values[i] };
    }
  }
  return null;
}

function rowArrayToObject_(row) {
  const obj = {};
  HEADERS.forEach((header, idx) => obj[header] = formatCell_(row[idx]));
  return obj;
}

function rowToChamado_(obj) {
  return {
    numeroChamado: obj.NUM_CHAMADO || '',
    criadoEm: obj.CRIADO_EM || '',
    atualizadoEm: obj.ATUALIZADO_EM || '',
    tecnico: obj.TECNICO || '',
    cliente: obj.CLIENTE || '',
    tipoAtendimento: obj.TIPO_ATENDIMENTO || '',
    data: obj.DATA || '',
    dataAgendada: obj.DATA || '',
    hora: obj.HORA || '',
    periodo: obj.PERIODO || '',
    cnpj: obj.CNPJ || '',
    endereco: obj.ENDERECO || '',
    situacao: obj.SITUACAO || '',
    modeloEquipamento: obj.MODELO_EQUIPAMENTO || '',
    equipamentosJson: obj.EQUIPAMENTOS_JSON || '[]',
    status: obj.STATUS || '',
    descricaoFalha: obj.DESCRICAO_FALHA || '',
    acaoTomada: obj.ACAO_TOMADA_ABERTURA || '',
    horaInicio: obj.HORA_INICIO || '',
    horaFim: obj.HORA_FIM || '',
    acaoTomadaTecnico: obj.ACAO_TOMADA_TECNICO || '',
    fotosJson: obj.FOTOS_JSON || '[]',
    assinaturaClienteUrl: obj.ASSINATURA_CLIENTE_URL || '',
    assinaturaTecnicoUrl: obj.ASSINATURA_TECNICO_URL || '',
    nomeResponsavel: obj.NOME_RESPONSAVEL || '',
    telefone: obj.TELEFONE || ''
  };
}

function createDriveFolder_(ss) {
  let parentFolder = null;

  try {
    const spreadsheetId = ss && ss.getId ? ss.getId() : DEFAULT_SPREADSHEET_ID;
    const spreadsheetFile = DriveApp.getFileById(spreadsheetId);
    const parents = spreadsheetFile.getParents();
    if (parents.hasNext()) parentFolder = parents.next();
  } catch (err) {
    parentFolder = null;
  }

  if (parentFolder) {
    const folders = parentFolder.getFoldersByName(DRIVE_FOLDER_NAME);
    if (folders.hasNext()) {
      const existingFolder = folders.next();
      existingFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return existingFolder;
    }

    const folder = parentFolder.createFolder(DRIVE_FOLDER_NAME);
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return folder;
  }

  const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  if (folders.hasNext()) {
    const existingFolder = folders.next();
    existingFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return existingFolder;
  }

  const folder = DriveApp.createFolder(DRIVE_FOLDER_NAME);
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return folder;
}

function saveFiles_(folder, files, numeroChamado, prefix) {
  return files.map((file, index) => saveSingleFile_(folder, file, numeroChamado, prefix + '-' + (index + 1)));
}

function saveSingleFile_(folder, file, numeroChamado, prefix) {
  if (!file || !file.base64) throw new Error('Arquivo inválido para salvar no Drive.');

  const mimeType = file.tipo || file.mimeType || 'image/jpeg';
  const extension = mimeType === 'image/png' ? '.png' : '.jpg';
  const safeName = sanitizeFilename_(file.nome || prefix + extension);
  const finalName = numeroChamado + '-' + prefix + '-' + new Date().getTime() + '-' + safeName;
  const bytes = Utilities.base64Decode(file.base64);
  const blob = Utilities.newBlob(bytes, mimeType, finalName);
  const driveFile = folder.createFile(blob);
  driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    nome: finalName,
    url: driveFile.getUrl(),
    id: driveFile.getId(),
    criadoEm: now_()
  };
}


function normalizeFotoSalva_(foto) {
  foto = foto || {};
  return {
    nome: clean_(foto.nome || foto.name || 'Foto'),
    url: clean_(foto.url || foto.link || ''),
    id: clean_(foto.id || foto.fileId || extractDriveFileId_(foto.url || foto.link || '')),
    criadoEm: clean_(foto.criadoEm || foto.createdAt || '')
  };
}

function isFotoRemovida_(foto, tokens) {
  foto = foto || {};
  const candidates = [
    foto.id,
    foto.fileId,
    foto.url,
    foto.link,
    foto.nome,
    extractDriveFileId_(foto.url || foto.link || '')
  ].map(clean_).filter(Boolean);

  return tokens.some((token) => {
    const cleaned = clean_(token);
    const tokenId = extractDriveFileId_(cleaned);
    return candidates.includes(cleaned) || (tokenId && candidates.includes(tokenId));
  });
}

function trashDriveFiles_(tokens) {
  const seen = {};
  let total = 0;

  (tokens || []).forEach((token) => {
    const fileId = extractDriveFileId_(token) || clean_(token);
    total += trashDriveFileById_(fileId, seen);
  });

  return total;
}

function trashChamadoLinkedDriveFiles_(ss, numeroChamado, rowObject) {
  const tokens = [];
  const fotos = parseJsonArray_(rowObject.FOTOS_JSON);

  fotos.forEach((foto) => {
    if (!foto) return;

    if (typeof foto === 'string') {
      tokens.push(foto);
      return;
    }

    tokens.push(
      foto.id,
      foto.fileId,
      foto.url,
      foto.link,
      foto.webViewLink,
      foto.webContentLink
    );
  });

  tokens.push(
    rowObject.ASSINATURA_CLIENTE_URL,
    rowObject.ASSINATURA_TECNICO_URL
  );

  const seen = {};
  let total = 0;

  total += trashDriveFilesWithSeen_(tokens, seen);
  total += trashDriveFilesByChamadoPrefix_(ss, numeroChamado, seen);

  return total;
}

function trashDriveFilesWithSeen_(tokens, seen) {
  let total = 0;

  (tokens || []).forEach((token) => {
    const fileId = extractDriveFileId_(token) || clean_(token);
    total += trashDriveFileById_(fileId, seen);
  });

  return total;
}

function trashDriveFileById_(fileId, seen) {
  fileId = clean_(fileId);
  if (!fileId || fileId.length < 20) return 0;
  if (seen && seen[fileId]) return 0;
  if (seen) seen[fileId] = true;

  try {
    const file = DriveApp.getFileById(fileId);
    file.setTrashed(true);
    return 1;
  } catch (err) {
    // Se não for possível mover para a lixeira, a exclusão do chamado continua.
    return 0;
  }
}

function trashDriveFilesByChamadoPrefix_(ss, numeroChamado, seen) {
  const folder = findDriveFolder_(ss);
  if (!folder) return 0;

  const prefix = clean_(numeroChamado) + '-';
  let total = 0;
  const files = folder.getFiles();

  while (files.hasNext()) {
    const file = files.next();
    const name = file.getName ? file.getName() : '';

    if (!name || name.indexOf(prefix) !== 0) continue;

    total += trashDriveFileById_(file.getId(), seen);
  }

  return total;
}

function findDriveFolder_(ss) {
  let parentFolder = null;

  try {
    const spreadsheetId = ss && ss.getId ? ss.getId() : DEFAULT_SPREADSHEET_ID;
    const spreadsheetFile = DriveApp.getFileById(spreadsheetId);
    const parents = spreadsheetFile.getParents();
    if (parents.hasNext()) parentFolder = parents.next();
  } catch (err) {
    parentFolder = null;
  }

  if (parentFolder) {
    const folders = parentFolder.getFoldersByName(DRIVE_FOLDER_NAME);
    if (folders.hasNext()) return folders.next();
  }

  const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  return folders.hasNext() ? folders.next() : null;
}

function extractDriveFileId_(value) {
  const match = String(value || '').match(/[-\w]{25,}/);
  return match ? match[0] : '';
}

function parseJsonArray_(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function log_(ss, acao, numeroChamado, detalhes) {
  try {
    const sheet = ensureSheet_(ss, SHEET_LOGS, LOG_HEADERS);
    sheet.appendRow([now_(), acao, numeroChamado, detalhes]);
  } catch (err) {
    // Evita que erro de log impeça a operação principal.
  }
}

function logError_(ss, acao, numeroChamado, err) {
  try {
    const spreadsheet = ss || getSpreadsheet_();
    log_(spreadsheet, acao, numeroChamado, err && err.stack ? err.stack : String(err));
  } catch (_) {}
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function clean_(value) {
  return String(value == null ? '' : value).trim();
}

function now_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

function formatCell_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  }
  return value == null ? '' : String(value);
}

function sanitizeFilename_(name) {
  return String(name || 'arquivo')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .substring(0, 90);
}
