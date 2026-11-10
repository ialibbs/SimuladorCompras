import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.raw({ type: 'application/octet-stream', limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'web')));

// Paths
const CONFIG_FILE = path.join(__dirname, 'config', 'fiscal_rules.json');
const CATALOG_FILE = path.join(__dirname, 'data', 'catalogo_servicos.json');
const HISTORY_FILE = path.join(__dirname, 'data', 'simulacoes_salvas.json');

// Load config
let fiscalConfig = {};
try {
  fiscalConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
} catch (e) {
  console.warn('Could not read fiscal_rules.json, using fallback:', e.message);
  fiscalConfig = {
    schema: 1,
    revision: 1,
    published_at: new Date().toISOString().slice(0, 10),
    params: {
      cbs_ref: 0.088,
      cbs_reduction: 0.001,
      cbs_effective: 0.087,
      ibs_state: 0.0005,
      ibs_municipal: 0.0005,
      annual_rate: 0.12,
      credit_ibs_cbs_days: 30,
      credit_icms_days: 30,
      ciap: 48,
      radi_days: 0,
      internal_sp: 0.18,
      internal_mg: 0.18,
      credit_utilization: 1.0,
      tax_due_day: 30,
      fiscal_cycle: 30
    },
    cclass: [],
    rules: {
      internal_rates: { SP: 0.18, MG: 0.18 },
      interstate_7: 0.07,
      interstate_12: 0.12,
      imported_4: 0.04
    }
  };
}

// Load catalog
let catalogData = {};
try {
  catalogData = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf-8'));
} catch (e) {
  console.warn('Could not read catalogo_servicos.json:', e.message);
  catalogData = {
    versions: { lc116_nbs: 'v1.1', cindop: 'v1.3', correlation: 'v1.2', cclass: 'v1.7' },
    checked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    lc116: [],
    nbs: [],
    cindop: [],
    correlations: [],
    cclass: []
  };
}

// In-memory / file history
let historyList = [];
try {
  if (fs.existsSync(HISTORY_FILE)) {
    historyList = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
  }
} catch {
  historyList = [];
}

function persistHistory() {
  try {
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(historyList, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving history file:', err);
  }
}

// Routes
app.get('/api/bootstrap', (req, res) => {
  res.json({
    mode: 'direct',
    token: 'direct-token',
    user: {
      id: 1,
      username: 'comprador',
      display_name: 'Comprador (Modo Web)',
      role: 'ADMIN',
      active: true
    }
  });
});

app.get('/api/version', (req, res) => {
  res.json({ version: '5.0.4', access_mode: 'direct' });
});

app.get('/api/me', (req, res) => {
  res.json({
    ok: true,
    user: {
      id: 1,
      username: 'comprador',
      display_name: 'Comprador (Modo Web)',
      role: 'ADMIN',
      active: true
    }
  });
});

app.get('/api/key/status', (req, res) => {
  res.json({
    eligible: false,
    initialize: false,
    windows_identity: 'comprador'
  });
});

app.post('/api/key/exit', (req, res) => {
  res.json({ ok: true, message: 'Área restrita encerrada.' });
});

app.post('/api/key/login', (req, res) => {
  res.json({
    ok: true,
    user: {
      id: 1,
      username: 'comprador',
      display_name: 'Comprador (Modo Web)',
      role: 'ADMIN',
      active: true
    }
  });
});

app.post('/api/key/initialize', (req, res) => {
  res.json({
    ok: true,
    recovery_code: 'REC-' + Math.random().toString(36).substring(2, 10).toUpperCase()
  });
});

app.post('/api/key/recover', (req, res) => {
  res.json({
    ok: true,
    recovery_code: 'REC-' + Math.random().toString(36).substring(2, 10).toUpperCase()
  });
});

app.post('/api/key/password', (req, res) => {
  res.json({ ok: true, message: 'Senha atualizada com sucesso.' });
});

app.post('/api/key/recovery-code', (req, res) => {
  res.json({
    ok: true,
    recovery_code: 'REC-' + Math.random().toString(36).substring(2, 10).toUpperCase()
  });
});

app.get('/api/keys', (req, res) => {
  res.json({
    users: [
      {
        id: 1,
        username: 'comprador',
        display_name: 'Comprador',
        role: 'ADMIN',
        active: true,
        windows_identity: 'comprador'
      }
    ]
  });
});

app.post('/api/keys', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/login', (req, res) => {
  res.json({
    ok: true,
    token: 'web-direct',
    user: {
      id: 1,
      username: 'comprador',
      display_name: 'Comprador (Modo Web)',
      role: 'ADMIN',
      active: true
    }
  });
});

app.post('/api/register', (req, res) => {
  res.json({ ok: true, message: 'Conta cadastrada com sucesso.' });
});

app.post('/api/logout', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/users', (req, res) => {
  res.json({
    users: [
      {
        id: 1,
        username: 'comprador',
        display_name: 'Comprador',
        role: 'ADMIN',
        active: true
      }
    ]
  });
});

app.post('/api/users', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/users/:id', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/profile/password', (req, res) => {
  res.json({ ok: true, message: 'Senha atualizada com sucesso.' });
});

app.post('/api/profile/recover', (req, res) => {
  res.json({ ok: true, message: 'Senha redefinida com sucesso.' });
});

app.get('/api/config', (req, res) => {
  res.json(fiscalConfig);
});

app.post('/api/config', (req, res) => {
  try {
    if (req.body && typeof req.body === 'object') {
      fiscalConfig = {
        ...fiscalConfig,
        ...req.body,
        revision: (fiscalConfig.revision || 1) + 1,
        updated_at: new Date().toISOString()
      };
      try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(fiscalConfig, null, 2), 'utf-8');
      } catch (err) {
        console.warn('Could not persist config to disk:', err.message);
      }
    }
    res.json(fiscalConfig);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/catalog', (req, res) => {
  res.json(catalogData);
});

app.get('/api/catalog/status', (req, res) => {
  res.json({
    current: {
      versions: catalogData.versions || {},
      checked_at: catalogData.checked_at || new Date().toISOString(),
      updated_at: catalogData.updated_at || new Date().toISOString(),
      update_mode: 'manual',
      counts: {
        lc116: catalogData.lc116?.length || 0,
        nbs: catalogData.nbs?.length || 0,
        cindop: catalogData.cindop?.length || 0,
        correlations: catalogData.correlations?.length || 0,
        cclass: (catalogData.cclass && catalogData.cclass.length) ? catalogData.cclass.length : (fiscalConfig.cclass?.length || 0)
      }
    },
    auto: {
      running: false,
      ok: true,
      changed: false,
      message: 'Catálogo de referências tributárias e serviços carregado com sucesso.',
      finished_at: new Date().toISOString()
    },
    pending: null
  });
});

app.post('/api/catalog/check', (req, res) => {
  res.json({
    changed: false,
    message: 'Catálogo oficial atualizado com sucesso.'
  });
});

app.post('/api/catalog/apply', (req, res) => {
  res.json({ catalog: catalogData });
});

// History endpoints
app.get('/api/history', (req, res) => {
  res.json({ history: historyList });
});

app.post('/api/history/append', (req, res) => {
  const record = req.body?.record || req.body;
  if (!record) return res.status(400).json({ error: 'Registro inválido.' });
  if (!record.savedAt) record.savedAt = new Date().toISOString();
  historyList.unshift(record);
  persistHistory();
  res.json({ ok: true, count: historyList.length });
});

app.post('/api/history/delete', (req, res) => {
  const savedAt = req.body?.savedAt;
  if (savedAt) {
    historyList = historyList.filter(item => item.savedAt !== savedAt);
    persistHistory();
  }
  res.json({ ok: true, count: historyList.length });
});

// Excel Export
app.post('/api/export/excel', (req, res) => {
  try {
    const { kind, data } = req.body || {};
    const wb = XLSX.utils.book_new();

    if (kind === 'history') {
      const records = Array.isArray(data) ? data : [];
      const historyRows = [];
      records.forEach(item => {
        const sups = item.suppliers || {};
        Object.entries(sups).forEach(([k, su]) => {
          if (!su) return;
          historyRows.push({
            'Salvo em': item.savedAt || '',
            'Data compra': item.purchaseDate || '',
            'Tipo': item.operationMode || 'Mercadoria',
            'Liquidação': item.settlement || 'Normal',
            'Critério': item.criterion || '',
            'Cenário': k,
            'Fornecedor': su.name || '',
            'CNPJ': su.cnpj || '',
            'UF': su.uf || '',
            'Regime': su.regime || '',
            'Preço base': su.price || 0,
            'Prazo (dias)': su.term || 0,
            'LC 116': su.lc116 || '',
            'NBS': su.nbs || '',
            'cClassTrib': su.cclass || ''
          });
        });
      });
      const wsHistory = XLSX.utils.json_to_sheet(historyRows.length ? historyRows : [{}]);
      XLSX.utils.book_append_sheet(wb, wsHistory, 'Histórico');
    } else {
      const suppliers = data?.suppliers || [];
      const results = data?.results || [];

      // Sheet 1: Resumo Executivo
      const summary = suppliers.map((su, i) => {
        const r = results[i] || {};
        return {
          'Cenário': `F${i + 1}`,
          'Fornecedor': su.name || '',
          'CNPJ': su.cnpj || '',
          'Regime': su.regime || '',
          'Prazo dias': su.term || 0,
          'Preço final NF': r.priceNF || 0,
          'Créditos': r.credits || 0,
          'Custo líquido': r.net || 0,
          'VP líquido': r.selectedVP || 0,
          'Crédito útil': r.creditUseful || 0
        };
      });
      const wsSummary = XLSX.utils.json_to_sheet(summary.length ? summary : [{}]);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo Executivo');

      // Sheet 2: Fornecedores
      const supRows = suppliers.map((su, i) => ({
        'Cenário': `F${i + 1}`,
        'Fornecedor': su.name || '',
        'CNPJ': su.cnpj || '',
        'UF': su.uf || '',
        'Regime': su.regime || '',
        'Finalidade': su.purpose || '',
        'NCM': su.ncm || '',
        'LC 116': su.lc116 || '',
        'NBS': su.nbs || '',
        'cIndOp': su.cindop || '',
        'cClassTrib': su.cclass || '',
        'Preço base': su.price || 0,
        'Desconto': su.discount || 0,
        'Negociação %': su.negPct || 0,
        'Negociação R$': su.negValue || 0,
        'Prazo dias': su.term || 0
      }));
      const wsSup = XLSX.utils.json_to_sheet(supRows.length ? supRows : [{}]);
      XLSX.utils.book_append_sheet(wb, wsSup, 'Fornecedores');

      // Sheet 3: Fiscal
      const fiscalRows = [];
      suppliers.forEach((su, i) => {
        const r = results[i] || {};
        const tag = `F${i + 1}`;
        const name = su.name || '';
        if (r.mode === 'Serviço') {
          fiscalRows.push(
            { 'Cenário': tag, 'Fornecedor': name, 'Tributo/Retenção': 'ISS', 'Base': r.issBase || 0, 'Alíquota': su.issRate || 0, 'Valor': r.iss || 0, 'Crédito': 0 },
            { 'Cenário': tag, 'Fornecedor': name, 'Tributo/Retenção': 'IBS', 'Base': r.base || 0, 'Alíquota': r.ibsRate || 0, 'Valor': r.ibs || 0, 'Crédito': r.crIbs || 0 },
            { 'Cenário': tag, 'Fornecedor': name, 'Tributo/Retenção': 'CBS', 'Base': r.base || 0, 'Alíquota': r.cbsRate || 0, 'Valor': r.cbs || 0, 'Crédito': r.crCbs || 0 },
            { 'Cenário': tag, 'Fornecedor': name, 'Tributo/Retenção': 'IRRF', 'Base': r.base || 0, 'Alíquota': su.irrf || 0, 'Valor': r.irrf || 0, 'Crédito': 0 },
            { 'Cenário': tag, 'Fornecedor': name, 'Tributo/Retenção': 'INSS', 'Base': r.base || 0, 'Alíquota': su.inss || 0, 'Valor': r.inss || 0, 'Crédito': 0 }
          );
        } else {
          fiscalRows.push(
            { 'Cenário': tag, 'Fornecedor': name, 'Tributo/Retenção': 'ICMS', 'Base': r.icmsBase || 0, 'Alíquota': r.inter || 0, 'Valor': r.icms || 0, 'Crédito': r.crIcms || 0 },
            { 'Cenário': tag, 'Fornecedor': name, 'Tributo/Retenção': 'IPI', 'Base': r.base || 0, 'Alíquota': su.ipi || 0, 'Valor': r.ipi || 0, 'Crédito': r.crIpi || 0 },
            { 'Cenário': tag, 'Fornecedor': name, 'Tributo/Retenção': 'ICMS-ST', 'Base': r.stBase || 0, 'Alíquota': r.stAppliedRate || 0, 'Valor': r.st || 0, 'Crédito': 0 },
            { 'Cenário': tag, 'Fornecedor': name, 'Tributo/Retenção': 'IBS', 'Base': r.base || 0, 'Alíquota': r.ibsRate || 0, 'Valor': r.ibs || 0, 'Crédito': r.crIbs || 0 },
            { 'Cenário': tag, 'Fornecedor': name, 'Tributo/Retenção': 'CBS', 'Base': r.base || 0, 'Alíquota': r.cbsRate || 0, 'Valor': r.cbs || 0, 'Crédito': r.crCbs || 0 },
            { 'Cenário': tag, 'Fornecedor': name, 'Tributo/Retenção': 'DIFAL', 'Base': r.difalBase || 0, 'Alíquota': r.difalRate || 0, 'Valor': r.difal || 0, 'Crédito': 0 }
          );
        }
      });
      const wsFiscal = XLSX.utils.json_to_sheet(fiscalRows.length ? fiscalRows : [{}]);
      XLSX.utils.book_append_sheet(wb, wsFiscal, 'Fiscal');
    }

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="simulacao.xlsx"');
    res.send(buf);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Falha ao gerar arquivo Excel: ' + err.message });
  }
});

// Import Template
app.get('/api/import/template', (req, res) => {
  try {
    const wb = XLSX.utils.book_new();
    const headers = [
      {
        'Cenário': 1,
        'Fornecedor': 'Fornecedor Exemplo',
        'CNPJ': '00.000.000/0001-00',
        'UF': 'SP',
        'Regime Tributário': 'Lucro Real',
        'Finalidade': 'Industrialização',
        'cClassTrib': '000001',
        'NCM': '8471.30.12',
        'Preço': 50000,
        'Prazo (dias)': 30,
        'Desconto': 0,
        'Frete': 0,
        'IPI %': 0,
        'FCP %': 0
      }
    ];
    const ws = XLSX.utils.json_to_sheet(headers);
    XLSX.utils.book_append_sheet(wb, ws, 'Mercadorias');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Modelo_Importacao_Cotacoes_Por_Tipo.xlsx"');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Import Excel File
app.post('/api/import/excel', (req, res) => {
  try {
    const buffer = req.body;
    if (!buffer || !buffer.length) {
      return res.status(400).json({ error: 'Arquivo vazio ou formato inválido.' });
    }
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = wb.SheetNames[0];
    const ws = wb.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(ws);

    const scenarios = {};
    rows.forEach((row, idx) => {
      const scenarioNum = row['Cenário'] || row['scenario'] || 1;
      if (!scenarios[scenarioNum]) scenarios[scenarioNum] = [];
      scenarios[scenarioNum].push({
        name: row['Fornecedor'] || row['name'] || `Fornecedor ${scenarioNum}`,
        cnpj: row['CNPJ'] || row['cnpj'] || '',
        uf: row['UF'] || row['uf'] || 'SP',
        regime: row['Regime'] || row['Regime Tributário'] || 'Lucro Real',
        purpose: row['Finalidade'] || 'Industrialização',
        cclass: String(row['cClassTrib'] || row['cclass'] || '000001'),
        price: Number(row['Preço'] || row['price'] || row['Valor'] || 0),
        term: Number(row['Prazo (dias)'] || row['term'] || 30),
        discount: Number(row['Desconto'] || row['discount'] || 0)
      });
    });

    res.json({
      total_rows: rows.length,
      sheets_used: [firstSheetName],
      scenario_count: Object.keys(scenarios).length,
      scenarios
    });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ error: 'Erro ao processar planilha: ' + err.message });
  }
});

// Fallback to index.html for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'web', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Simulador de Compras rodando na porta ${PORT} (0.0.0.0)`);
});
