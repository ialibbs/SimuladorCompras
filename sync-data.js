import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const WEB_DIR = path.join(__dirname, 'web');
const WEB_API_DIR = path.join(__dirname, 'web', 'api');
const CONFIG_DIR = path.join(__dirname, 'config');

fs.mkdirSync(WEB_API_DIR, { recursive: true });
fs.mkdirSync(CONFIG_DIR, { recursive: true });

// Copy fiscal_rules.json
const fiscalRulesSrc = path.join(DATA_DIR, 'fiscal_rules.json');
if (fs.existsSync(fiscalRulesSrc)) {
  fs.copyFileSync(fiscalRulesSrc, path.join(WEB_API_DIR, 'config.json'));
  fs.copyFileSync(fiscalRulesSrc, path.join(CONFIG_DIR, 'fiscal_rules.json'));
  console.log('Synced fiscal_rules.json -> web/api/config.json & config/fiscal_rules.json');
}

// Copy catalogo_servicos.json
const catalogSrc = path.join(DATA_DIR, 'catalogo_servicos.json');
if (fs.existsSync(catalogSrc)) {
  fs.copyFileSync(catalogSrc, path.join(WEB_API_DIR, 'catalog.json'));
  console.log('Synced catalogo_servicos.json -> web/api/catalog.json');
}

// Copy data.json
const dataSrc = path.join(DATA_DIR, 'data.json');
if (fs.existsSync(dataSrc)) {
  fs.copyFileSync(dataSrc, path.join(WEB_DIR, 'data.json'));
  console.log('Synced data.json -> web/data.json');
}

// Copy import_layout.json
const layoutSrc = path.join(DATA_DIR, 'import_layout.json');
if (fs.existsSync(layoutSrc)) {
  fs.copyFileSync(layoutSrc, path.join(WEB_DIR, 'import_layout.json'));
  console.log('Synced import_layout.json -> web/import_layout.json');
}

console.log('Data sync complete!');
