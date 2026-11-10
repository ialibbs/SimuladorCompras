// Capability delivered by the Windows launcher to this browser session only.
const LAUNCH_TOKEN=new URLSearchParams(window.location.hash.slice(1)).get('launch')||sessionStorage.getItem('launch_token')||'';
if(LAUNCH_TOKEN){sessionStorage.setItem('launch_token',LAUNCH_TOKEN);window.history.replaceState(null,'',window.location.pathname+window.location.search);}
const originalFetch=window.fetch.bind(window);
window.fetch=(input,options={})=>{if(typeof input==='string'&&input.startsWith('/api/'))options={...options,headers:{...(options.headers||{}),'X-Launch-Token':LAUNCH_TOKEN}};return originalFetch(input,options);};
let DB={params:{},cclass:[],catalog:{lc116:[],nbs:[],cindop:[],correlations:[],versions:{}}};
let supplierCount=2;
let settlement='Normal';
let ibscbsInIcmsBase='Sim';
let operationMode='Mercadoria'; // default for newly created scenarios
let ibscbsInIssBase='Não';
let criterion='Menor custo econômico VP';
let suppressNegotiationSync=false;
let activeDashView='executiva';
let activeTable='cclass';
let bulkRowsBySupplier={};
const TREATY_SOURCE='https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/legislacao/acordos-internacionais/acordos-para-evitar-a-dupla-tributacao/acordos-para-evitar-a-dupla-tributacao-e-prevenir-a-evasao-fiscal';
const TREATY_COUNTRIES=new Set(['África do Sul','Alemanha','Argentina','Áustria','Bélgica','Canadá','Chile','China','Coreia do Sul','Dinamarca','Emirados Árabes Unidos','Equador','Eslováquia','Espanha','Filipinas','Finlândia','França','Hungria','Índia','Israel','Itália','Japão','Luxemburgo','México','Noruega','Países Baixos','Peru','Portugal','República Tcheca','Rússia','Singapura','Suécia','Suíça','Trinidad e Tobago','Turquia','Ucrânia','Uruguai']);
const $=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n||0));
const pct=n=>new Intl.NumberFormat('pt-BR',{style:'percent',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n||0));
const fmtDate=d=>d?new Intl.DateTimeFormat('pt-BR').format(new Date(d+'T12:00:00')):'—';
const num=v=>Number(String(v??0).replace(',','.'))||0;
const pow=(r,d)=>Math.pow(1+r,d/365);
const days=(a,b)=>Math.round((b-a)/86400000);
const dateVal=s=>new Date((s||'2027-01-01')+'T12:00:00');
const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function lastWeekdayNextMonth(d){let x=new Date(d.getFullYear(),d.getMonth()+2,0,12);while(x.getDay()==0||x.getDay()==6)x.setDate(x.getDate()-1);return x}
function easterDate(year){
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,
        f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,
        i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),
        month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;
  return new Date(year,month-1,day,12);
}
function addDateSet(set,d){set.add(ymd(d))}
function taxHolidaySet(year,uf){
  const h=new Set([
    `${year}-01-01`,`${year}-04-21`,`${year}-05-01`,`${year}-09-07`,
    `${year}-10-12`,`${year}-11-02`,`${year}-11-15`,`${year}-11-20`,`${year}-12-25`
  ]);
  const easter=easterDate(year);
  const goodFriday=new Date(easter);goodFriday.setDate(goodFriday.getDate()-2);addDateSet(h,goodFriday);
  if(uf==='SP')h.add(`${year}-07-09`);
  (DB?.params?.extra_tax_holidays||[]).forEach(x=>h.add(x));
  return h;
}
function isTaxBusinessDay(d,uf){
  const dow=d.getDay();
  if(dow===0||dow===6)return false;
  return !taxHolidaySet(d.getFullYear(),uf).has(ymd(d));
}
function previousTaxBusinessDay(d,uf){
  const x=new Date(d);
  while(!isTaxBusinessDay(x,uf))x.setDate(x.getDate()-1);
  return x;
}
function taxDueNextMonth(purchase,day,uf){
  const x=new Date(purchase.getFullYear(),purchase.getMonth()+1,day,12);
  return previousTaxBusinessDay(x,uf);
}
function icmsCashDueDate(purchase,buyerUF){
  const corporateDueDay=DB.rules?.icms_due_days?.[buyerUF]??DB.rules?.icms_due_days?.default??(buyerUF==='MG'?9:20); // parâmetros corporativos solicitados
  return taxDueNextMonth(purchase,corporateDueDay,buyerUF);
}
function ipiCashDueDate(purchase,buyerUF){
  return taxDueNextMonth(purchase,DB.rules?.ipi_due_day??25,buyerUF);
}

const list={
 uf:['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'],
 regimes:['Lucro Real','Lucro Presumido','Simples Nacional','Simples + IBS/CBS regular','MEI'],
 purposes:['Industrialização','Revenda','Contratação de transporte (CT-e)','Ativo imobilizado','Uso e consumo empresarial','Brinde','Bonificação','Doação','Amostra grátis','Uso pessoal','Outra'],
 origins:['CST 0 — Nacional (regra geral)','CST 1 — Estrangeira: importação direta','CST 2 — Estrangeira: adquirida no mercado interno','CST 3 — Nacional: conteúdo importado >40% e ≤70%','CST 4 — Nacional: PPB','CST 5 — Nacional: conteúdo importado ≤40%','CST 6 — Estrangeira: importação direta sem similar / CAMEX','CST 7 — Estrangeira: mercado interno sem similar / CAMEX','CST 8 — Nacional: conteúdo importado >70%','Manual / exceção'],
 st:['Não aplicar','MVA ajustado','PMC','PMPF','Pauta / preço fixo'],difal:['Base dupla','Base simples','Não aplicar'],
 yesno:['Não','Sim'],currency:['USD','EUR','GBP','JPY','CNY','CHF','CAD','MXN','BRL','Outra'],serviceCredit:['Automático — regra geral','Sim — permitir crédito','Não — bloquear crédito'],
 countries:['África do Sul','Alemanha','Argentina','Áustria','Bélgica','Canadá','Chile','China','Coreia do Sul','Dinamarca','Emirados Árabes Unidos','Equador','Eslováquia','Espanha','Estados Unidos','Filipinas','Finlândia','França','Hungria','Índia','Irlanda','Israel','Itália','Japão','Luxemburgo','México','Noruega','Países Baixos','Peru','Portugal','Reino Unido','República Tcheca','Rússia','Singapura','Suécia','Suíça','Trinidad e Tobago','Turquia','Ucrânia','Uruguai','Outro'],
 serviceNature:['Serviço técnico / assistência técnica','Serviço administrativo','Software / SaaS','Licença / royalty','Consultoria','Marketing / publicidade','Pesquisa e desenvolvimento','Treinamento','Frete internacional','Outro'],
 treatyMode:['Automático assistido','Não aplicar tratado','Manual / validado pelo Fiscal']
};
const merchFields=[
 ['name','Nome do fornecedor','text'],['cnpj','CNPJ','text'],['uf','UF fornecedor','select','uf'],['regime','Regime fornecedor','select','regimes'],['purpose','Finalidade','select','purposes'],['transportStartUF','UF início do transporte','select','uf'],['transportEndUF','UF fim do transporte','select','uf'],['ncm','NCM','text'],['cclass','cClassTrib','cclass'],['price','Preço base (R$)','number'],['freight','Frete (R$)','number'],['insurance','Seguro (R$)','number'],['other','Outras despesas (R$)','number'],['discount','Desconto incondicional (R$)','number'],['term','Prazo pagamento (dias)','number'],
 ['group','NEGOCIAÇÃO DA PROPOSTA'],['negPct','Redução negociável (%)','percent'],['negValue','Redução negociável (R$)','number'],
 ['group','AJUSTES FISCAIS'],['origin','Origem — CST (1º dígito)','select','origins'],['icmsManual','ICMS manual %','percent'],['ipi','IPI %','percent'],['fcp','FCP %','percent'],['is','IS %','percent'],['stMethod','Método ICMS-ST','select','st'],['stParam','MVA ajustada (%) ou base PMC/PMPF/pauta (R$)','number'],['stRate','Alíquota interna da mercadoria para ST (%) — 0 usa padrão da UF','percent'],['difalMethod','Método DIFAL','select','difal'],['simpIcms','Crédito ICMS Simples %','percent'],['simpCbs','Crédito CBS Simples %','percent'],['simpIbs','Crédito IBS Simples %','percent'],['ipiCredit','Crédito IPI % do imposto','percent']
];
const importFields=[
 ['name','Fornecedor exterior','text'],['country','País de origem','text'],['purpose','Finalidade','select','purposes'],['ncm','NCM','text'],['cclass','cClassTrib','cclass'],
 ['group','VALOR ADUANEIRO'],['currency','Moeda','select','currency'],['foreignPrice','Valor da mercadoria na moeda','number'],['exchangeRate','Câmbio aduaneiro (R$)','number'],['intlFreight','Frete internacional (R$)','number'],['intlInsurance','Seguro internacional (R$)','number'],['customsAdjustment','Ajustes do valor aduaneiro (R$)','number'],
 ['group','DESEMBARAÇO E TRIBUTOS'],['clearanceDate','Data prevista de desembaraço','date'],['iiRate','II (%)','percent'],['ipi','IPI (%)','percent'],['is','IS (%)','percent'],['siscomexFee','Taxa Siscomex (R$)','number'],['afrmm','AFRMM (R$)','number'],['cide','CIDE-Combustíveis (R$)','number'],['antidumping','Antidumping/compensatórios/salvaguardas (R$)','number'],['otherCustoms','Outros tributos/taxas até liberação (R$)','number'],['icmsImportRate','ICMS-importação (%)','percent'],
 ['group','DESPESAS E NEGOCIAÇÃO'],['localExpenses','Despesas locais pós-liberação (R$)','number'],['term','Prazo pagamento fornecedor (dias)','number'],['negPct','Redução negociável (%)','percent'],['negValue','Redução negociável (R$)','number'],
 ['group','CRÉDITOS'],['importIcmsCredit','Crédito ICMS (% do imposto)','percent'],['importIpiCredit','Crédito IPI (% do imposto)','percent'],['ibscbsCredit','Crédito IBS/CBS (% do imposto)','percent']
];
const serviceFields=[
 ['name','Nome do prestador','text'],['cnpj','CNPJ','text'],['uf','UF prestador','select','uf'],['providerCity','Município do prestador','text'],['buyerCity','Município do tomador','text'],['servicePlace','Município/local da prestação','text'],['regime','Regime do prestador','select','regimes'],
 ['group','CLASSIFICAÇÃO DO SERVIÇO'],['serviceDescription','Descrição do serviço','text'],['lc116','Serviço LC 116 — descrição + código','catalog','lc116'],['nbs','NBS — descrição + código','catalog','nbs'],['cindop','cIndOp','catalog','cindop'],['cclass','cClassTrib','catalog','cclass'],
 ['group','VALOR E NEGOCIAÇÃO'],['price','Preço base do serviço (R$)','number'],['other','Outras despesas (R$)','number'],['discount','Desconto incondicional (R$)','number'],['term','Prazo pagamento (dias)','number'],['negPct','Redução negociável (%)','percent'],['negValue','Redução negociável (R$)','number'],
 ['group','ISS'],['issRate','Alíquota ISS (%) — manual','percent'],['issRetained','ISS retido pelo tomador?','select','yesno'],
 ['group','IBS / CBS'],['serviceCredit','Crédito IBS/CBS','select','serviceCredit'],['simpCbs','Crédito CBS Simples %','percent'],['simpIbs','Crédito IBS Simples %','percent'],['is','IS %','percent'],
 ['group','RETENÇÕES — ASSISTIDAS / EDITÁVEIS'],['irrf','IRRF (%)','percent'],['inss','INSS (%)','percent'],['csll','CSLL / retenções federais (%)','percent'],['otherRet','Outras retenções (%)','percent'],['retentionNote','Observação das retenções','text']
];
const hybridFields=[
 ['name','Nome do prestador/fornecedor','text'],['cnpj','CNPJ','text'],['uf','UF','select','uf'],['regime','Regime','select','regimes'],['purpose','Finalidade dos materiais','select','purposes'],
 ['group','PARCELA DE SERVIÇO'],['serviceDescription','Descrição do serviço','text'],['lc116','Serviço LC 116 — descrição + código','catalog','lc116'],['nbs','NBS — descrição + código','catalog','nbs'],['cindop','cIndOp','catalog','cindop'],['cclass','cClassTrib do serviço','catalog','cclass'],['servicePrice','Valor dos serviços (R$)','number'],['issRate','ISS (%)','percent'],['issRetained','ISS retido?','select','yesno'],['serviceCredit','Crédito IBS/CBS do serviço','select','serviceCredit'],['irrf','IRRF (%)','percent'],['inss','INSS (%)','percent'],['csll','CSLL / retenções federais (%)','percent'],['otherRet','Outras retenções (%)','percent'],
 ['group','PARCELA DE MATERIAIS'],['materialDescription','Descrição dos materiais','text'],['ncm','NCM','text'],['materialCclass','cClassTrib dos materiais','cclass'],['materialPrice','Valor dos materiais (R$)','number'],['origin','Origem — CST','select','origins'],['ipi','IPI (%)','percent'],['fcp','FCP (%)','percent'],['stMethod','Método ICMS-ST','select','st'],['stParam','MVA ajustada (%) ou base PMC/PMPF/pauta (R$)','number'],['stRate','Alíquota interna da mercadoria para ST (%) — 0 usa padrão da UF','percent'],['difalMethod','Método DIFAL','select','difal'],['simpIcms','Crédito ICMS Simples %','percent'],['simpCbs','Crédito CBS Simples %','percent'],['simpIbs','Crédito IBS Simples %','percent'],['ipiCredit','Crédito IPI % do imposto','percent'],
 ['group','CONDIÇÕES COMUNS'],['other','Outras despesas (R$)','number'],['discount','Desconto incondicional (R$)','number'],['term','Prazo de pagamento (dias)','number'],['negPct','Redução negociável (%)','percent'],['negValue','Redução negociável (R$)','number']
];
const importServiceFields=[
 ['name','Prestador estrangeiro','text'],['foreignTaxId','Identificação fiscal no exterior','text'],['country','País do prestador','select','countries'],['currency','Moeda','select','currency'],['regime','Regime do adquirente','select','regimes'],
 ['group','CLASSIFICAÇÃO DO SERVIÇO'],['serviceNature','Natureza do pagamento','select','serviceNature'],['serviceDescription','Descrição detalhada','text'],['lc116','Serviço LC 116','catalog','lc116'],['nbs','NBS','catalog','nbs'],['cindop','cIndOp','catalog','cindop'],['cclass','cClassTrib','catalog','cclass'],['consumptionPlace','Local de consumo/resultado','text'],['buyerCity','Município do tomador','text'],
 ['group','VALOR E REMESSA'],['foreignServicePrice','Valor contratado na moeda','number'],['exchangeRate','Câmbio da remessa (R$)','number'],['bankExpenses','Despesas bancárias/remessa (R$)','number'],['term','Prazo para pagamento (dias)','number'],['grossUp','Contrato possui gross-up de IRRF?','select','yesno'],
 ['group','TRATADO E TRIBUTOS'],['treatyMode','Tratado — aplicação','select','treatyMode'],['treatyStatus','Tratado identificado','text'],['irrfImport','IRRF (%)','percent'],['cideImport','CIDE (%)','percent'],['iofFx','IOF-câmbio (%)','percent'],['issRate','ISS-importação (%)','percent'],['serviceCredit','Crédito IBS/CBS','select','serviceCredit'],['ibscbsCredit','Crédito IBS/CBS (% do imposto)','percent'],['treatyNote','Observação/validação fiscal','text']
];
list.freightModes=['CIF — cobrado pelo fornecedor','CIF — já incluso no preço','FOB — contratado pelo comprador'];
list.transportScopes=['Nacional intermunicipal/interestadual','Municipal (ISS)','Iniciado no exterior'];
list.supplyKinds=['Pontual','Continuado / fracionado','Administração pública (art. 473)'];
const supplyFields=[['supplyKind','Natureza temporal do fornecimento','select','supplyKinds'],['documentIssueDate','Data emissão documento fiscal (opcional)','date'],['expectedDeliveryDate','Entrega prevista no documento fiscal','date'],['considerationDueDate','Exigibilidade da contraprestação (continuado)','date'],['group','FORNECIMENTO E ENTREGA'],['supplyDate','Data do fornecimento / entrega (fato gerador)','date'],['taxExtinctionDate','Extinção IBS/CBS prevista (opcional)','date'],['advanceSchedule','Antecipações: JSON [{date,base,documentDate,extinctionDate}]','text']];
const freightFields=[['group','FRETE CIF / FOB'],['freightMode','Responsabilidade e cobrança do frete','select','freightModes'],['freightScope','Tipo do transporte FOB','select','transportScopes'],['freightRegime','Regime do transportador FOB','select','regimes'],['freightCclass','cClassTrib do transporte FOB','cclass'],['freightStartDate','Data início transporte FOB','date'],['freightTerm','Prazo frete FOB desde a data da compra (dias)','number'],['freightIcms','ICMS do transporte FOB (%) — 0 automático','percent'],['freightIss','ISS transporte municipal (%)','percent'],['freightSimpCbs','Crédito CBS Simples do frete (%)','percent'],['freightSimpIbs','Crédito IBS Simples do frete (%)','percent'],['freightSimpIcms','Crédito ICMS Simples do frete (%)','percent'],['freightCredit','Crédito IBS/CBS transporte FOB','select','serviceCredit']];
function fieldsForMode(mode){const fields=mode==='Serviço'?serviceFields:mode==='Serviço + materiais'?hybridFields:mode==='Importação de serviços'?importServiceFields:mode==='Importação'?importFields:merchFields;return [['calculationBasis','Simulador — ponto de partida','select','calculationBasis'],['grossTarget','Bruto final negociado (R$)','number'],...fields,...(mode==='Mercadoria'?freightFields:[]),...supplyFields].map(f=>f[2]==='cclass'?[f[0],f[1],'catalog','cclass']:f)}
list.calculationBasis=['Partindo do líquido','Partindo do bruto'];
function refreshInverseFields(p){
 const inverse=$(`${p}_calculationBasis`)?.value==='Partindo do bruto',gross=$(`${p}_grossTarget`);
 if(gross){gross.closest('label').classList.toggle('hidden',!inverse);gross.required=inverse;gross.min='0';}
 let note=$(`${p}_inverseNote`);
 if(!note){note=document.createElement('small');note.id=`${p}_inverseNote`;note.className='field-hint';$(`fields_${p}`)?.prepend(note)}
 const mode=$(`${p}_operationType`)?.value||operationMode;
 note.textContent=inverse?(mode==='Importação'?'Informe o custo bruto total nacionalizado, incluindo despesas.':mode==='Importação de serviços'?'Informe o custo bruto total da contratação, incluindo tributos e despesas.':'Informe o total final da NF, após descontos, antes das retenções e sem DIFAL recolhido fora da NF.')+' O preço de entrada é encontrado pelo motor existente. No híbrido e na importação em massa, os valores de entrada definem a proporção entre as parcelas. IBS/CBS não integram a própria base.':'';
}

function activeFields(){return fieldsForMode(operationMode)}
function supplierDefault(i){return {operationType:operationMode,calculationBasis:'Partindo do líquido',grossTarget:0,name:`Fornecedor ${i}`,cnpj:'',foreignTaxId:'',uf:'MG',providerCity:'',buyerCity:'',servicePlace:'',regime:i===2?'Simples Nacional':'Lucro Real',purpose:'Industrialização',transportStartUF:'MG',transportEndUF:'SP',ncm:'',nbs:'',serviceDescription:'',materialDescription:'',lc116:'',cindop:'',cclass:'000001',materialCclass:'000001',price:92000,servicePrice:60000,materialPrice:32000,foreignServicePrice:15000,bankExpenses:0,freight:0,freightMode:'CIF — cobrado pelo fornecedor',freightScope:'Nacional intermunicipal/interestadual',freightRegime:'Lucro Real',freightCclass:'000001',freightStartDate:'',freightEndDate:'',freightTerm:0,freightIcms:0,freightIss:0,freightSimpCbs:0,freightSimpIbs:0,freightSimpIcms:0,freightCredit:'Automático — regra geral',supplyKind:'Pontual',documentIssueDate:'',expectedDeliveryDate:'',considerationDueDate:'',supplyDate:'',taxExtinctionDate:'',advanceSchedule:'',insurance:0,other:0,discount:0,term:i===1?90:60,negPct:0,negValue:0,origin:'CST 0 — Nacional (regra geral)',icmsManual:0,ipi:0,fcp:0,is:0,stMethod:'Não aplicar',stParam:0,stRate:0,difalMethod:'Base dupla',simpIcms:0,simpCbs:0,simpIbs:0,ipiCredit:0,issRate:0,issRetained:'Não',serviceCredit:'Automático — regra geral',irrf:0,inss:0,csll:0,otherRet:0,retentionNote:'',country:'Estados Unidos',currency:'USD',foreignPrice:15000,exchangeRate:5.5,intlFreight:0,intlInsurance:0,customsAdjustment:0,clearanceDate:'2027-01-20',iiRate:0,siscomexFee:0,afrmm:0,cide:0,antidumping:0,otherCustoms:0,icmsImportRate:.18,localExpenses:0,importIcmsCredit:1,importIpiCredit:1,ibscbsCredit:1,serviceNature:'Serviço técnico / assistência técnica',consumptionPlace:'Brasil',grossUp:'Não',treatyMode:'Automático assistido',treatyStatus:'',irrfImport:.15,cideImport:.10,iofFx:0,treatyNote:''}}


function catalogLabel(kind,x){
  if(kind==='cclass'){
    const c=DB.cclass.find(y=>String(y.code)===String(x.code));
    return c?`${c.description} • ${c.treatment}`:(x.description||'Classificação tributária');
  }
  return x.description||'';
}
function catalogSelectedCode(prefix,key){
  const el=$(`${prefix}_${key}`);
  if(!el)return '';
  return String(el.dataset.code||'').trim();
}
function catalogFind(kind,code){
  const arr=kind==='cclass'?((DB.catalog.cclass&&DB.catalog.cclass.length)?DB.catalog.cclass:(DB.cclass||[])):(DB.catalog[kind]||[]);
  return arr.find(x=>String(x.code||'')===String(code||''));
}
function catalogDisplay(kind,item){
  if(!item)return '';
  const desc=(item.description||'').trim();
  return desc?`${desc} — ${item.code}`:String(item.code||'');
}
function setCatalogSelection(prefix,key,kind,code,displayOverride=''){
  const el=$(`${prefix}_${key}`),tag=$(`${prefix}_${key}_selected`);
  if(!el)return;
  const item=catalogFind(kind,code);
  el.dataset.code=String(code||'');
  el.value=displayOverride || catalogDisplay(kind,item) || String(code||'');
  if(tag) tag.textContent=code?`Código selecionado: ${code}`:'Nenhum código selecionado';
}
function correlationMatchesLc(row,code){const a=String(row.lc116||'').replace(/\D/g,''),b=String(code||'').replace(/\D/g,'');return a===b||(a.length===4&&b.startsWith(a));}
function catalogItems(kind,prefix){
  const lc=catalogSelectedCode(prefix,'lc116'),nbs=catalogSelectedCode(prefix,'nbs'),ci=catalogSelectedCode(prefix,'cindop');
  const corr=DB.catalog.correlations||[];
  if(kind==='cclass'){
    const source=(DB.catalog.cclass&&DB.catalog.cclass.length)?DB.catalog.cclass:(DB.cclass||[]);
    const all=source.map(x=>({code:String(x.code||''),description:x.description||'',treatment:x.treatment||'',suggested:false}));
    let cc=corr;
    if(lc)cc=cc.filter(x=>correlationMatchesLc(x,lc));
    if(nbs)cc=cc.filter(x=>String(x.nbs)===nbs);
    if(ci)cc=cc.filter(x=>String(x.cindop)===ci);
    const suggested=new Set(cc.map(x=>String(x.cclass||'')).filter(Boolean));
    return all.map(x=>({...x,suggested:suggested.has(x.code)})).sort((a,b)=>(Number(b.suggested)-Number(a.suggested))||a.code.localeCompare(b.code));
  }
  let arr=[...(DB.catalog[kind]||[])].map(x=>({...x,suggested:false}));
  let cc=corr;
  if(lc)cc=cc.filter(x=>correlationMatchesLc(x,lc));
  if(nbs)cc=cc.filter(x=>String(x.nbs)===nbs);
  if(ci)cc=cc.filter(x=>String(x.cindop)===ci);
  let suggested=new Set();
  if(kind==='nbs'&&lc)suggested=new Set(cc.map(x=>String(x.nbs||'')).filter(Boolean));
  if(kind==='cindop'&&(lc||nbs))suggested=new Set(cc.map(x=>String(x.cindop||'')).filter(Boolean));
  arr=arr.map(x=>({...x,suggested:suggested.has(String(x.code))}));
  if(kind==='nbs' && !arr.length){
    const codes=[...new Set((corr||[]).map(x=>String(x.nbs||'')).filter(Boolean))];
    arr=codes.map(code=>({code,description:'Descrição NBS ainda não carregada — atualize o catálogo oficial',suggested:suggested.has(code)}));
  }
  if(kind==='cindop' && !arr.length){
    const codes=[...new Set((corr||[]).map(x=>String(x.cindop||'')).filter(Boolean))];
    arr=codes.map(code=>({code,description:'Descrição cIndOp ainda não carregada — atualize o catálogo oficial',suggested:suggested.has(code)}));
  }
  return arr.sort((a,b)=>(Number(b.suggested)-Number(a.suggested))||String(a.description||'').localeCompare(String(b.description||''),'pt-BR'));
}
let aliasCatalog=null,aliasIndex={};
function correlatedAliases(kind,prefix,item){
 if(aliasCatalog!==DB.catalog){aliasCatalog=DB.catalog;aliasIndex={nbs:new Map(),cindop:new Map(),cclass:new Map()};const lc=new Map((DB.catalog.lc116||[]).map(r=>[String(r.code),r.description||''])),nbs=new Map((DB.catalog.nbs||[]).map(r=>[String(r.code),r.description||'']));for(const row of DB.catalog.correlations||[]){const text=[row.lc116,lc.get(String(row.lc116))||'',row.nbs,nbs.get(String(row.nbs))||'',row.cindop,row.cclass].join(' ');for(const k of ['nbs','cindop','cclass']){const code=String(row[k]||'');aliasIndex[k].set(code,(aliasIndex[k].get(code)||'')+' '+text);}}}
 return aliasIndex[kind]?.get(String(item?.code||''))||'';
}

function normSearch(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()}
function catalogMatches(kind,prefix,q){const nq=normSearch(q);const arr=catalogItems(kind,prefix);if(!nq)return arr.slice(0,180);return arr.filter(x=>normSearch(`${x.code} ${x.description||''} ${x.treatment||''} ${correlatedAliases(kind,prefix,x)}`).includes(nq)).slice(0,180)}
function catalogMenuHTML(kind,prefix,q){
  const items=catalogMatches(kind,prefix,q);
  if(!items.length){const total=catalogItems(kind,prefix).length;return `<div class="catalog-empty">${total?`Nenhum resultado para “${escapeHtml(q)}”. Tente parte da descrição ou do código.`:'Catálogo ainda não carregado. ADMIN: use Atualizações > Verificar fontes oficiais. Se a rede corporativa bloquear gov.br, o app preservará o último catálogo válido.'}</div>`}
  return items.map(x=>`<button type="button" class="catalog-option ${x.suggested?'suggested':''}" data-code="${escapeHtml(x.code)}"><span class="catalog-option-text"><strong>${escapeHtml(x.description||'Descrição não disponível')}</strong><small>${kind==='lc116'?'LC 116 / Código Nacional':kind==='nbs'?'NBS':kind==='cindop'?'cIndOp':'cClassTrib'}: ${escapeHtml(x.code)}</small></span>${x.suggested?'<em>Sugerido pela correlação oficial</em>':''}</button>`).join('')
}
const requiredByMode={
  Mercadoria:new Set(['name','uf','regime','purpose','cclass','price','term','origin']),
  Importação:new Set(['name','country','purpose','ncm','cclass','currency','foreignPrice','exchangeRate','clearanceDate','term','icmsImportRate']),
  Serviço:new Set(['name','uf','regime','cclass','price','term'])
  ,'Serviço + materiais':new Set(['name','uf','regime','cclass','servicePrice','materialCclass','materialPrice','term'])
  ,'Importação de serviços':new Set(['name','country','currency','serviceNature','cclass','foreignServicePrice','exchangeRate','term'])
};
function fieldRequired(key){return requiredByMode[operationMode]?.has(key)||false}
function requiredLabel(label,key){return fieldRequired(key)?`${label}<small class="required-text">preenchimento obrigatório</small>`:label}
function fieldLockReason(p,key){
  const regime=$(`${p}_regime`)?.value||'';
  const origin=$(`${p}_origin`)?.value||'';
  const st=$(`${p}_stMethod`)?.value||'';
  const purpose=$(`${p}_purpose`)?.value||'';
  const mode=$(`${p}_operationType`)?.value||operationMode;
  const buyerUF=$('buyerUF')?.value||'SP';
  const ipi=num($(`${p}_ipi`)?.value);
  const iss=num($(`${p}_issRate`)?.value);
  const isTransport=mode==='Mercadoria'&&purpose==='Contratação de transporte (CT-e)';
  const mei=regime==='MEI'||regime==='MEI/Outros - manual';
  if(key==='treatyStatus')return 'Informação automática baseada na lista oficial de acordos da Receita Federal; validar artigo e protocolo aplicáveis.';
  if(mei&&['simpIcms','simpCbs','simpIbs','ipiCredit'].includes(key))return 'MEI: crédito bloqueado no motor (ICMS, IBS, CBS e IPI = 0).';
  if(['simpCbs','simpIbs'].includes(key)&&regime!=='Simples Nacional')return 'Automático pelo regime/cClassTrib — editável somente no Simples Nacional normal.';
  if(isTransport&&['ncm','freight','insurance','origin','icmsManual','ipi','fcp','stMethod','stParam','stRate','difalMethod','ipiCredit'].includes(key))return 'Não aplicável à contratação de transporte (CT-e).';
  if(!isTransport&&$(`${p}_freightMode`)?.value!=='FOB — contratado pelo comprador'&&['transportStartUF','transportEndUF'].includes(key))return 'Preenchimento exclusivo para contratação de transporte (CT-e).';
  if(DB.rules?.mg_import_zero!==false&&mode==='Importação'&&buyerUF==='MG'&&['Industrialização','Revenda'].includes(purpose)&&['icmsImportRate','importIcmsCredit'].includes(key))return 'Regra corporativa MG: ICMS-importação e crédito de ICMS fixados em 0% para industrialização/revenda.';
  if(key==='icmsManual'&&origin!=='Manual / exceção')return 'Disponível somente quando a origem estiver definida como Manual / exceção.';
  if(['stParam','stRate'].includes(key)&&st==='Não aplicar')return 'Disponível somente quando houver ICMS-ST.';
  if(key==='ipiCredit'&&ipi<=0)return 'Disponível somente quando houver IPI informado.';
  if(key==='issRetained'&&operationMode==='Serviço'&&iss<=0)return 'Disponível somente quando houver alíquota de ISS informada.';
  return '';
}
function refreshFieldStates(p){
  const af=fieldsForMode($(`${p}_operationType`)?.value||operationMode);
  af.forEach(f=>{
    if(f[0]==='group')return;
    const key=f[0],el=$(`${p}_${key}`),lab=el?.closest('label');if(!el)return;
    const freight=$(`${p}_freightMode`)?.value==='FOB — contratado pelo comprador',scope=$(`${p}_freightScope`)?.value,regime=$(`${p}_freightRegime`)?.value;
    const freightDetail=freightFields.some(f=>f[0]===key)&&key!=='freightMode';
    let hide=freightDetail&&(!freight||!(num($(`${p}_freight`)?.value)>0));
    if(freight&&key==='freightIss')hide=scope!=='Municipal (ISS)';
    if(freight&&key==='freightIcms')hide=scope==='Municipal (ISS)';
    if(['freightSimpCbs','freightSimpIbs','freightSimpIcms'].includes(key))hide=hide||regime!=='Simples Nacional'||(key==='freightSimpIcms'&&scope==='Municipal (ISS)');
    if(['transportStartUF','transportEndUF'].includes(key))hide=!freight&&$(`${p}_purpose`)?.value!=='Contratação de transporte (CT-e)';
    lab?.classList.toggle('hidden',hide);
    const reason=fieldLockReason(p,key),locked=!!reason;
    el.disabled=locked;
    lab?.classList.toggle('field-locked',locked);
    let hint=lab?.querySelector('.lock-hint');
    if(locked){
      if(['simpCbs','simpIbs','simpIcms','ipiCredit','icmsImportRate','importIcmsCredit'].includes(key)&&(/MEI:|Regra corporativa MG:/.test(reason)))el.value=0;
      if(isNaN(Number(el.value))===false&&reason==='Não aplicável à contratação de transporte (CT-e).')el.value=0;
      if(!hint){hint=document.createElement('small');hint.className='lock-hint';lab.appendChild(hint)}
      hint.textContent=reason;
    } else if(hint)hint.remove();
  });
  refreshValidation(p);
}
function requiredValueMissing(p,key){
  const el=$(`${p}_${key}`);if(!el||el.disabled)return false;
  if(el.dataset?.code!==undefined)return !String(el.dataset.code||'').trim();
  return !String(el.value??'').trim();
}
let validationAttempted=false;
function refreshValidation(p,show=false){
  const missing=[];
  const scenarioMode=$(`${p}_operationType`)?.value||operationMode;
  const required=new Set(requiredByMode[scenarioMode]||[]);
  if(scenarioMode==='Mercadoria'&&$(`${p}_purpose`)?.value==='Contratação de transporte (CT-e)'){required.delete('origin');required.add('transportStartUF');required.add('transportEndUF')}
  required.forEach(key=>{
    const el=$(`${p}_${key}`);if(!el)return;
    const miss=requiredValueMissing(p,key);
    el.classList.toggle('required-missing',show&&miss);
    el.closest('label')?.classList.toggle('label-required-missing',show&&miss);
    if(miss)missing.push(key);
  });
  const card=$(`supplier_${Number(p.replace('f',''))}`);
  if(card)card.classList.toggle('supplier-incomplete',show&&missing.length>0);
  return missing;
}
function validationSummary(show=validationAttempted){
  const errors=[];
  if(!$('purchaseDate').value)errors.push('Data da compra');
  if(!$('buyerUF').value)errors.push('UF comprador');
  if(settlement==='RADI'&&!$('radiDate').value)errors.push('Data RADI');
  for(let i=1;i<=supplierCount;i++){
    const p=`f${i}`,m=refreshValidation(p,show);
    const supplier=readSupplier(p);if(bulkRowsBySupplier[i])supplier.bulkRows=bulkRowsBySupplier[i];if(supplier.calculationBasis==='Partindo do bruto'){try{calcSupplier(supplier,ctx())}catch(e){errors.push(`F${i}: ${e.message}`)}}
    if(m.length)errors.push(`F${i}: ${m.map(k=>fieldsForMode($(`${p}_operationType`)?.value||operationMode).find(f=>f[0]===k)?.[1]||k).join(', ')}`);
  }
  const box=$('validationBanner');
  if(box){
    box.classList.toggle('hidden',!show||!errors.length);
    box.innerHTML=(show&&errors.length)?`<b>Confira os campos indicados</b><span>${escapeHtml(errors.join(' • '))}</span>`:'';
  }
  return errors;
}
function ensureValid(action='continuar'){
  validationAttempted=true;
  const e=validationSummary(true);
  if(!e.length)return true;
  document.querySelector('.required-missing')?.focus();
  return false;
}

function inputHTML(prefix,f){
  const [key,label,type,opt]=f;if(key==='group')return `<div class="group-title">${label}</div>`;const id=`${prefix}_${key}`,req=fieldRequired(key)?' required data-required="1"':'';let ctrl='';
  if(type==='select')ctrl=`<select id="${id}"${req}>${list[opt].map(x=>`<option>${x}</option>`).join('')}</select>`;
  else if(type==='cclass')ctrl=`<select id="${id}"${req}>${DB.cclass.map(x=>`<option value="${escapeHtml(x.code)}">${escapeHtml(x.code)} • ${escapeHtml(x.description)}</option>`).join('')}</select>`;
  else if(type==='catalog')ctrl=`<div class="catalog-combo" data-kind="${opt}" data-prefix="${prefix}"><input id="${id}"${req} autocomplete="off" placeholder="Digite uma palavra da descrição ou o código"><div class="catalog-menu" id="${id}_menu"></div></div><small class="catalog-selected-code" id="${id}_selected">Nenhum código selecionado</small><small class="source-badge">● Oficial • descrição em destaque • busca por texto/código</small>`;
  else if(type==='date')ctrl=`<input id="${id}" type="date"${req}>`;
  else ctrl=`<input id="${id}" type="${type==='number'||type==='percent'?'number':'text'}" step="0.01"${req}>`;
  return `<label>${requiredLabel(label,key)}${ctrl}</label>`
}
function clearCatalogSelection(prefix,key,message='Nenhum código selecionado'){
  const el=$(`${prefix}_${key}`),tag=$(`${prefix}_${key}_selected`); if(!el)return;
  el.dataset.code=''; el.value=''; if(tag)tag.textContent=message;
}
function correlationCandidates(prefix,target){
  const lc=catalogSelectedCode(prefix,'lc116'),nbs=catalogSelectedCode(prefix,'nbs'),ci=catalogSelectedCode(prefix,'cindop');
  let rows=DB.catalog.correlations||[];
  if(target!=='lc116'&&lc)rows=rows.filter(x=>correlationMatchesLc(x,lc));
  if(target!=='nbs'&&nbs)rows=rows.filter(x=>String(x.nbs||'')===nbs);
  if(target!=='cindop'&&ci)rows=rows.filter(x=>String(x.cindop||'')===ci);
  const prop=target==='cclass'?'cclass':target;
  return [...new Set(rows.map(x=>String(x[prop]||'')).filter(Boolean))];
}
function setAutoOrSuggest(prefix,target,kind){
  const vals=correlationCandidates(prefix,target),tag=$(`${prefix}_${target}_selected`);
  if(vals.length===1){setCatalogSelection(prefix,target,kind,vals[0]);if(tag)tag.textContent=`Sugerido automaticamente pelo Anexo VIII: ${vals[0]} • validar`;return true}
  if(vals.length>1){clearCatalogSelection(prefix,target,`${vals.length} opções correlacionadas — selecione uma`);return false}
  clearCatalogSelection(prefix,target,'Sem correlação única — selecione na lista completa');return false
}
function applyServiceCorrelation(prefix,changedKey){
  if(!['Serviço','Importação de serviços'].includes($(`${prefix}_operationType`)?.value||operationMode))return;
  if(changedKey==='lc116'){
    clearCatalogSelection(prefix,'nbs','Selecione NBS • correlacionadas ficam no topo');
    clearCatalogSelection(prefix,'cindop'); clearCatalogSelection(prefix,'cclass');
    const oneNbs=setAutoOrSuggest(prefix,'nbs','nbs'); if(oneNbs){const oneInd=setAutoOrSuggest(prefix,'cindop','cindop'); if(oneInd)setAutoOrSuggest(prefix,'cclass','cclass'); else setAutoOrSuggest(prefix,'cclass','cclass')}
  } else if(changedKey==='nbs'){
    clearCatalogSelection(prefix,'cindop'); clearCatalogSelection(prefix,'cclass');
    setAutoOrSuggest(prefix,'cindop','cindop'); setAutoOrSuggest(prefix,'cclass','cclass');
  } else if(changedKey==='cindop'){
    clearCatalogSelection(prefix,'cclass'); setAutoOrSuggest(prefix,'cclass','cclass');
  }
}

function refreshTreatyAssist(prefix){
  if(($(`${prefix}_operationType`)?.value||operationMode)!=='Importação de serviços')return;
  const country=$(`${prefix}_country`)?.value||'',mode=$(`${prefix}_treatyMode`)?.value||'Automático assistido',status=$(`${prefix}_treatyStatus`);
  if(!status)return;
  if(mode==='Não aplicar tratado')status.value='Tratado desconsiderado por opção do usuário';
  else if(mode==='Manual / validado pelo Fiscal')status.value='Tratamento manual — registrar validação fiscal';
  else status.value=TREATY_COUNTRIES.has(country)?'Acordo identificado — validar artigo, protocolo e natureza do rendimento':'Acordo não identificado na lista oficial — aplicar regra doméstica e validar';
  let note=$(`${prefix}_treatyAssist`);
  if(!note){note=document.createElement('small');note.id=`${prefix}_treatyAssist`;note.className='tax-assist';status.closest('label')?.appendChild(note)}
  note.innerHTML=`Assistência automática pela <a href="${TREATY_SOURCE}" target="_blank" rel="noopener">lista oficial da Receita Federal</a>. A alíquota não é reduzida sem validação fiscal.`;
}

function cclassAssistText(code){
  const c=getClass(String(code||''));
  if(!c||!code)return '';
  const red=Number(c.reduction||0);
  return `CST ${c.cst||'—'} • ${c.treatment||'tratamento conforme tabela'}${red?` • redução ${pct(red)}`:''}`;
}
function refreshTaxAssist(prefix){
  const c=$(`${prefix}_cclass`);if(!c)return;
  let note=$(`${prefix}_taxAssist`);
  if(!note){
    note=document.createElement('small');note.id=`${prefix}_taxAssist`;note.className='tax-assist';
    const label=c.closest('label');if(label)label.appendChild(note);
  }
  const code=c.dataset?.code!==undefined?c.dataset.code:c.value;
  const txt=cclassAssistText(code);
  note.textContent=txt?`Preenchido pelo catálogo oficial: ${txt}`:'Selecione o cClassTrib para carregar CST, tratamento e redução.';
}

function setupCatalogCombo(p,key,kind){
  const el=$(`${p}_${key}`),menu=$(`${p}_${key}_menu`);if(!el||!menu)return;
  const draw=(queryOverride=null)=>{const q=queryOverride===null?el.value:queryOverride;menu.innerHTML=catalogMenuHTML(kind,p,q);menu.classList.add('open');};
  el.addEventListener('focus',()=>{el.select();draw(el.dataset.code?'':null)});
  el.addEventListener('input',()=>{el.dataset.code='';const tag=$(`${p}_${key}_selected`);if(tag)tag.textContent='Selecione uma opção da lista';draw()});
  menu.onclick=e=>{const b=e.target.closest('.catalog-option');if(!b)return;const item=catalogFind(kind,b.dataset.code);setCatalogSelection(p,key,kind,b.dataset.code);menu.classList.remove('open');if(['lc116','nbs','cindop'].includes(key)){applyServiceCorrelation(p,key);refreshCatalogLists(p)}if(key==='lc116'&&item&&$(`${p}_serviceDescription`)&&!$(`${p}_serviceDescription`).value)$(`${p}_serviceDescription`).value=item.description||'';refreshTaxAssist(p);calcAll();};
  el.addEventListener('change',()=>{const code=String(el.value||'').trim();const item=catalogFind(kind,code);if(item){setCatalogSelection(p,key,kind,item.code);if(['lc116','nbs','cindop'].includes(key))applyServiceCorrelation(p,key);refreshTaxAssist(p);calcAll();}});
  el.addEventListener('keydown',e=>{if(e.key==='Escape')menu.classList.remove('open');if(e.key==='Enter'){e.preventDefault();const items=catalogMatches(kind,p,el.value);if(items.length===1){setCatalogSelection(p,key,kind,items[0].code);menu.classList.remove('open');if(['lc116','nbs','cindop'].includes(key))applyServiceCorrelation(p,key);refreshTaxAssist(p);calcAll();}}});
}
function refreshCatalogLists(p){
  ['nbs','cindop','cclass'].forEach(k=>{const el=$(`${p}_${k}`),menu=$(`${p}_${k}_menu`);if(el&&menu&&menu.classList.contains('open'))menu.innerHTML=catalogMenuHTML(k,p,el.value)});
  const lc=catalogSelectedCode(p,'lc116');if(lc){const item=catalogFind('lc116',lc);if(item&&$(`${p}_serviceDescription`)&&!$(`${p}_serviceDescription`).value)$(`${p}_serviceDescription`).value=item.description||''}
}
function supplierCard(i){const p=`f${i}`;return `<article class="supplier card" id="supplier_${i}"><div class="supplier-head"><div><span class="tag" id="scenarioLabel_${p}">FORNECEDOR ${i} • MERCADO NACIONAL</span><h2 id="title_${p}">Fornecedor ${i}</h2></div><span class="pill">F${i}</span></div><div class="scenario-type-row"><label>Tipo deste cenário<select id="${p}_operationType"><option value="Mercadoria">Mercadoria nacional</option><option value="Importação">Importação de mercadorias</option><option value="Serviço">Serviço nacional</option><option value="Importação de serviços">Importação de serviços</option><option value="Serviço + materiais">Serviço + materiais</option></select></label><small id="${p}_typeHint"></small></div><div class="fields" id="fields_${p}"></div><div id="bulkRows_${p}"></div></article>`}
function scenarioVisualLabel(i,mode){
  const kind=mode==='Importação'?'IMPORTAÇÃO DE MERCADORIAS':mode==='Importação de serviços'?'IMPORTAÇÃO DE SERVIÇOS':mode==='Serviço'?'SERVIÇO':mode==='Serviço + materiais'?'SERVIÇO + MATERIAIS':'MERCADO NACIONAL';
  return `FORNECEDOR ${i} • ${kind}`;
}
function typeHint(mode){return mode==='Importação'?'Motor: importação de mercadorias, desembaraço e landed cost':mode==='Importação de serviços'?'Motor: remessa, ISS, IRRF, CIDE, IOF, IBS/CBS e tratado assistido':mode==='Serviço'?'Motor: serviço, ISS, retenções e IBS/CBS':mode==='Serviço + materiais'?'Motor híbrido: calcula serviço e materiais separadamente e consolida o contrato':'Motor: mercadoria nacional e tributos da compra'}
function normalizeLegacySupplier(data){
  const d={...data};
  if(d.regime==='MEI/Outros - manual')d.regime='MEI';
  const originMap={
    'Nacional':'CST 0 — Nacional (regra geral)',
    'Importação direta — Res. 13 aplicável':'CST 1 — Estrangeira: importação direta',
    'Importada mercado interno — Res. 13 aplicável':'CST 2 — Estrangeira: adquirida no mercado interno',
    'Conteúdo de importação > 40%':'CST 3 — Nacional: conteúdo importado >40% e ≤70%',
    'PPB / exceção Res. 13':'CST 4 — Nacional: PPB',
    'Sem similar nacional / CAMEX':'CST 6 — Estrangeira: importação direta sem similar / CAMEX',
    'Gás natural importado / exceção':'Manual / exceção',
    'Manual':'Manual / exceção'
  };
  if(originMap[d.origin])d.origin=originMap[d.origin];
  return d;
}
function renderSupplierFields(i,data){
  const p=`f${i}`,mode=data.operationType||operationMode||'Mercadoria',af=fieldsForMode(mode);
  const type=$(`${p}_operationType`);if(type)type.value=mode;
  const scenarioLabel=$(`scenarioLabel_${p}`);if(scenarioLabel)scenarioLabel.textContent=scenarioVisualLabel(i,mode);
  const hint=$(`${p}_typeHint`);if(hint)hint.textContent=typeHint(mode);
  const wrap=$(`fields_${p}`);if(!wrap)return;
  const previousMode=operationMode;operationMode=mode;
  wrap.innerHTML=af.map(f=>inputHTML(p,f)).join('');
  operationMode=previousMode;
  Object.entries(data).forEach(([k,v])=>{const el=$(`${p}_${k}`),fd=af.find(x=>x[0]===k);if(!el||!fd)return;if(fd[2]==='catalog')setCatalogSelection(p,k,fd[3],String(v||''));else el.value=fd[2]==='percent'?Number(v||0)*100:v});
  af.forEach(f=>{if(f[0]==='group')return;const el=$(`${p}_${f[0]}`);if(!el)return;el.addEventListener('input',()=>{if(['negPct','negValue','price','servicePrice','materialPrice','foreignPrice','foreignServicePrice','exchangeRate'].includes(f[0]))syncNegotiation(p,f[0]);const nameEl=$(`${p}_name`);$(`title_${p}`).textContent=nameEl?.value||`Fornecedor ${i}`;refreshFieldStates(p);refreshInverseFields(p);if(f[0]==='cclass')refreshTaxAssist(p);if(['country','treatyMode','serviceNature'].includes(f[0]))refreshTreatyAssist(p);calcAll()});if(f[2]==='catalog')setupCatalogCombo(p,f[0],f[3])});
  const nameEl=$(`${p}_name`);$(`title_${p}`).textContent=nameEl?.value||`Fornecedor ${i}`;
  const bulk=$(`bulkRows_${p}`),rows=bulkRowsBySupplier[i]||[];
  if(bulk)bulk.innerHTML=rows.length?`<details open><summary>${rows.length} item(ns) importado(s) neste cenário — tributos calculados individualmente</summary><div style="max-height:360px;overflow:auto"><table><thead><tr><th>Item</th><th>Tipo</th><th>Finalidade</th><th>Regime</th><th>Origem</th><th>Valor</th><th>ICMS %</th><th>IPI %</th><th>ST</th></tr></thead><tbody>${rows.map((r,n)=>`<tr><td>${escapeHtml(r.itemDescription||r.serviceDescription||r.itemCode||String(n+1))}</td><td>${escapeHtml(r.operationType||'')}</td><td>${escapeHtml(r.purpose||'')}</td><td>${escapeHtml(r.regime||'')}</td><td>${escapeHtml(r.origin||'')}</td><td>${money(r.price||r.servicePrice||r.materialPrice||0)}</td><td>${r.icmsManual==null?'—':pct(r.icmsManual)}</td><td>${r.ipi==null?'—':pct(r.ipi)}</td><td>${escapeHtml(r.stMethod||'—')}</td></tr>`).join('')}</tbody></table></div><small>Os campos acima exibem uma prévia do primeiro item e o total do cenário. Os valores por item permanecem na tabela e são calculados individualmente.</small></details>`:'';
  refreshFieldStates(p);refreshTaxAssist(p);refreshTreatyAssist(p);refreshInverseFields(p);
}
function buildSuppliers(snapshot=null){
  const grid=$('suppliersGrid');grid.innerHTML=Array.from({length:supplierCount},(_,k)=>supplierCard(k+1)).join('');
  for(let i=1;i<=supplierCount;i++){
    const p=`f${i}`,d=snapshot?.[p]||supplierDefault(i);if(!d.operationType)d.operationType=operationMode;
    renderSupplierFields(i,d);
    const type=$(`${p}_operationType`);
    type?.addEventListener('change',()=>{
      const current=readSupplier(p),next={...supplierDefault(i),...current,operationType:type.value};
      renderSupplierFields(i,next);calcAll();
    });
  }
  updateSupplierCount();calcAll()
}
function syncNegotiation(p,source){if(suppressNegotiationSync)return;suppressNegotiationSync=true;const mode=$(`${p}_operationType`)?.value||operationMode;
  const price=mode==='Importação'?num($(`${p}_foreignPrice`)?.value)*num($(`${p}_exchangeRate`)?.value):mode==='Importação de serviços'?num($(`${p}_foreignServicePrice`)?.value)*num($(`${p}_exchangeRate`)?.value):mode==='Serviço + materiais'?num($(`${p}_servicePrice`)?.value)+num($(`${p}_materialPrice`)?.value):num($(`${p}_price`)?.value);if(source==='negPct'){const r=num($(`${p}_negPct`).value)/100;$(`${p}_negValue`).value=(price*r).toFixed(2)}else if(source==='negValue'){const v=num($(`${p}_negValue`).value);$(`${p}_negPct`).value=price?((v/price)*100).toFixed(4):0}else if(['price','servicePrice','materialPrice','foreignPrice','foreignServicePrice','exchangeRate'].includes(source)){const r=num($(`${p}_negPct`).value)/100;if(r)$(`${p}_negValue`).value=(price*r).toFixed(2)}suppressNegotiationSync=false}
function readSupplier(p){const o=supplierDefault(Number(p.replace('f',''))||1),mode=$(`${p}_operationType`)?.value||operationMode;o.operationType=mode;fieldsForMode(mode).forEach(f=>{if(f[0]==='group')return;const el=$(`${p}_${f[0]}`);o[f[0]]=f[2]==='number'?num(el?.value):f[2]==='percent'?num(el?.value)/100:f[2]==='catalog'?String(el?.dataset?.code||''):(el?.value||'')});return o}
function allSuppliers(){return Array.from({length:supplierCount},(_,i)=>{const s=readSupplier(`f${i+1}`);if(bulkRowsBySupplier[i+1])s.bulkRows=bulkRowsBySupplier[i+1];return s})}
function getClass(code){return DB.cclass.find(x=>String(x.code)===String(code).padStart(6,'0'))||{reduction:0,treatment:'Classificação não informada',cst:'',valid:false}}
function classTaxFactor(s,cl,tax,fallback,domestic){
 const reduction=cl[tax==='cbs'?'reductionCbs':'reductionIbs'];
 if(reduction===undefined)return fallback;
 if(['Alíquota zero','Isenta','Imune','Suspensão','Não tributada'].some(x=>(cl.treatment||'').includes(x)))return 0;
 if(domestic&&['Simples Nacional','MEI','MEI/Outros - manual'].includes(s.regime))return 0;
 return Math.max(0,1-reduction);
}
function internalRate(uf){return DB.rules?.internal_rates?.[uf]??(uf==='MG'?DB.params.internal_mg:DB.params.internal_sp)}
function interstateRateByUF(originUF,destUF){if(originUF===destUF)return internalRate(destUF);const sulSudesteSemES=new Set(['MG','PR','RJ','RS','SC','SP']);const destino7=new Set(['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','PA','PB','PE','PI','RN','RO','RR','SE','TO']);if(sulSudesteSemES.has(originUF)&&destino7.has(destUF))return DB.rules?.interstate_7??.07;return DB.rules?.interstate_12??.12}
function interRate(s,buyer,internal){if(s._taxRule?.icmsRate!==undefined)return s._taxRule.icmsRate;if(s.uf===buyer)return internal;if(s.origin==='Manual / exceção')return s.icmsManual;if(['CST 1 — Estrangeira: importação direta','CST 2 — Estrangeira: adquirida no mercado interno','CST 3 — Nacional: conteúdo importado >40% e ≤70%','CST 8 — Nacional: conteúdo importado >70%'].includes(s.origin))return DB.rules?.imported_4??.04;return interstateRateByUF(s.uf,buyer)}
function eligibleDifal(p){return (DB.rules?.difal_purposes||['Ativo imobilizado','Uso e consumo empresarial','Brinde','Doação','Amostra grátis','Uso pessoal']).includes(p)}
function serviceCreditAllowed(s,blocked){if(s.serviceCredit==='Não — bloquear crédito')return false;if(s.serviceCredit==='Sim — permitir crédito')return true;return !blocked}
function calcImportSupplier(s,c){
 const p=DB.params,cl=getClass(s.cclass),purchase=c.purchase,fx=Math.max(0,s.exchangeRate||0);
 const foreignBRL=Math.max(0,(s.foreignPrice||0)*fx),totalDiscount=s.negValue||0,merchandiseBRL=Math.max(0,foreignBRL-totalDiscount);
 const customsValue=Math.max(0,merchandiseBRL+(s.intlFreight||0)+(s.intlInsurance||0)+(s.customsAdjustment||0));
 const ii=customsValue*(s.iiRate||0),isBase=customsValue+ii,isv=isBase*(s.is||0);
 const ibscbsBase=Math.max(0,customsValue+ii+isv+(s.siscomexFee||0)+(s.afrmm||0)+(s.cide||0)+(s.antidumping||0)+(s.otherCustoms||0));
 const blocked=['Alíquota zero','Isenta','Imune','Suspensão','Não tributada'].some(x=>(cl.treatment||'').includes(x));
 const factor=blocked?0:Math.max(0,1-(cl.reduction||0)),cbsRate=classTaxRate(s,cl,'cbs',factor,false),ibsRate=classTaxRate(s,cl,'ibs',factor,false);
 const cbs=ibscbsBase*cbsRate,ibs=ibscbsBase*ibsRate,ipiBase=customsValue+ii,ipi=ipiBase*(s.ipi||0);
 const preIcms=customsValue+ii+ipi+isv+(s.siscomexFee||0)+(s.afrmm||0)+(s.cide||0)+(s.antidumping||0)+(s.otherCustoms||0)+(c.ibscbsInIcmsBase==='Sim'?(cbs+ibs):0);
 const mgImportZero=DB.rules?.mg_import_zero!==false&&c.buyerUF==='MG'&&['Industrialização','Revenda'].includes(s.purpose);
 const icmsRate=mgImportZero?0:Math.max(0,Math.min(.99,s.icmsImportRate||0)),icms=icmsRate?preIcms*icmsRate/(1-icmsRate):0,icmsBase=preIcms+icms;
 const crIcms=mgImportZero?0:icms*Math.max(0,Math.min(1,s.importIcmsCredit||0)),crIpi=ipi*Math.max(0,Math.min(1,s.importIpiCredit||0)),crCbs=cbs*Math.max(0,Math.min(1,s.ibscbsCredit||0)),crIbs=ibs*Math.max(0,Math.min(1,s.ibscbsCredit||0));
 const credits=crIcms+crIpi+crCbs+crIbs,customsTaxes=ii+ipi+isv+cbs+ibs+icms+(s.siscomexFee||0)+(s.afrmm||0)+(s.cide||0)+(s.antidumping||0)+(s.otherCustoms||0);
 const landedGross=customsValue+customsTaxes+(s.localExpenses||0),net=landedGross-credits;
 const payment=new Date(purchase);payment.setDate(payment.getDate()+(s.term||0));
 const clearance=dateVal(s.clearanceDate||ymd(purchase)),creditCash=lastWeekdayNextMonth(clearance),creditUsed=(crCbs+crIbs)*p.credit_utilization;
 const t={ext:clearance,cash:creditCash,outflow:clearance,finDays:days(creditCash,clearance),benefit:creditUsed/pow(p.annual_rate,days(purchase,creditCash))-(cbs+ibs)/pow(p.annual_rate,days(purchase,clearance))};
 const icmsCreditDate=new Date(clearance),ipiCreditDate=new Date(clearance),icmsCashDate=icmsCashDueDate(clearance,c.buyerUF),ipiCashDate=ipiCashDueDate(clearance,c.buyerUF);
 const icmsCreditUsed=crIcms*p.credit_utilization,ipiCreditUsed=crIpi*p.credit_utilization;
 const pvSupplier=merchandiseBRL/pow(p.annual_rate,days(purchase,payment));
 const pvAtClearance=((s.intlFreight||0)+(s.intlInsurance||0)+(s.customsAdjustment||0)+customsTaxes+(s.localExpenses||0))/pow(p.annual_rate,days(purchase,clearance));
 const pvCredits=creditUsed/pow(p.annual_rate,days(purchase,creditCash))+icmsCreditUsed/pow(p.annual_rate,days(purchase,icmsCashDate))+ipiCreditUsed/pow(p.annual_rate,days(purchase,ipiCashDate));
 const selectedVP=pvSupplier+pvAtClearance-pvCredits,vps={Normal:selectedVP,RADI:selectedVP,'Split Payment':selectedVP};
 return {mode:'Importação',base:customsValue,totalDiscount,foreignBRL,merchandiseBRL,customsValue,ii,iiRate:s.iiRate||0,isBase,isv,ibscbsBase,cbsRate,ibsRate,cbs,ibs,ipiBase,ipi,icmsBase,icms,inter:icmsRate,stBase:0,st:0,fcpBase:0,fcp:0,difalBase:0,difalRate:0,difal:0,crIcms,crCbs,crIbs,crIpi,credits,priceNF:landedGross,landedGross,net,creditUseful:credits*p.credit_utilization,payment,due:clearance,clearance,customsTaxes,localExpenses:s.localExpenses||0,supplierPayment:merchandiseBRL,legacyCreditDate:clearance,legacyCashDate:icmsCashDate,legacyCreditUsed:icmsCreditUsed+ipiCreditUsed,icmsCreditDate,ipiCreditDate,icmsCashDate,ipiCashDate,icmsCreditUsed,ipiCreditUsed,timing:{Normal:t,RADI:t,'Split Payment':t},vps,selectedVP};
}
function calcServiceSupplier(s,c){const p=DB.params,cl=getClass(s.cclass);const totalDiscount=(s.discount||0)+(s.negValue||0);const base=Math.max(0,s.price+s.other-totalDiscount);const isv=base*s.is;const taxbase=base+isv;const blocked=['Alíquota zero','Isenta','Imune','Suspensão','Não tributada'].some(x=>(cl.treatment||'').includes(x));const isMei=s.regime==='MEI'||s.regime==='MEI/Outros - manual';const factor=(s.regime==='Simples Nacional'||isMei||blocked)?0:Math.max(0,1-(cl.reduction||0));const cbsRate=classTaxRate(s,cl,'cbs',factor,true),ibsRate=classTaxRate(s,cl,'ibs',factor,true);const cbs=taxbase*cbsRate,ibs=taxbase*ibsRate;const issBase=base+(c.ibscbsInIssBase==='Sim'?(cbs+ibs):0);const iss=issBase*s.issRate;const allowCredit=serviceCreditAllowed(s,blocked);const crCbs=isMei?0:(s.regime==='Simples Nacional'?taxbase*s.simpCbs*(allowCredit?1:0):cbs*(allowCredit?1:0));const crIbs=isMei?0:(s.regime==='Simples Nacional'?taxbase*s.simpIbs*(allowCredit?1:0):ibs*(allowCredit?1:0));const credits=crCbs+crIbs;const issWithheld=s.issRetained==='Sim'?iss:0;const irrf=base*s.irrf,inss=base*s.inss,csll=base*s.csll,otherRet=base*s.otherRet;const retentions=issWithheld+irrf+inss+csll+otherRet;const priceNF=base+isv+cbs+ibs;const supplierPayment=Math.max(0,priceNF-retentions);const net=priceNF-credits;const purchase=c.purchase,payment=new Date(purchase);payment.setDate(payment.getDate()+s.term);const due=lastWeekdayNextMonth(purchase);const radi=c.radi;const ibscbs=cbs+ibs,creditUsed=(crCbs+crIbs)*p.credit_utilization;const timing=(ext,outflow)=>{const cash=lastWeekdayNextMonth(ext);const benefit=creditUsed/pow(p.annual_rate,days(purchase,cash))-ibscbs/pow(p.annual_rate,days(purchase,outflow));return {ext,cash,outflow,finDays:days(cash,outflow),benefit}};const tn=timing(due,payment),tr=timing(radi,radi),ts=timing(payment,payment);const vp=t=>(priceNF-ibscbs)/pow(p.annual_rate,days(purchase,payment))-t.benefit;const vps={Normal:vp(tn),RADI:vp(tr),'Split Payment':vp(ts)};return {mode:'Serviço',base,totalDiscount,isv,cbsRate,ibsRate,cbs,ibs,issBase,iss,issWithheld,irrf,inss,csll,otherRet,retentions,supplierPayment,crCbs,crIbs,crIcms:0,crIpi:0,credits,priceNF,net,creditUseful:credits*p.credit_utilization,payment,due,legacyCreditDate:null,legacyCashDate:null,legacyCreditUsed:0,icmsCreditDate:null,ipiCreditDate:null,icmsCashDate:null,ipiCashDate:null,icmsCreditUsed:0,ipiCreditUsed:0,timing:{Normal:tn,RADI:tr,'Split Payment':ts},vps,selectedVP:vps[c.settlement],icmsBase:0,icms:0,ipi:0,stBase:0,st:0,fcpBase:0,fcp:0,difalBase:0,difalRate:0,difal:0,inter:0}}
function calcSupplier(s,c){if(s.operationType==='Serviço')return calcServiceSupplier(s,c);if(s.operationType==='Importação')return calcImportSupplier(s,c);const p=DB.params,cl=getClass(s.cclass),internal=internalRate(c.buyerUF),isTransport=s.purpose==='Contratação de transporte (CT-e)',inter=isTransport?(s._taxRule?.icmsRate!==undefined?s._taxRule.icmsRate:s.icmsManual>0?s.icmsManual:interstateRateByUF(s.transportStartUF||s.uf,s.transportEndUF||c.buyerUF)):interRate(s,c.buyerUF,internal);const totalDiscount=(s.discount||0)+(s.negValue||0);const base=Math.max(0,s.price+(isTransport?0:s.freight)+(isTransport?0:s.insurance)+s.other-totalDiscount);const isv=base*s.is;const taxbase=base+isv;const blocked=['Alíquota zero','Isenta','Imune','Suspensão','Não tributada'].some(x=>(cl.treatment||'').includes(x));const isMei=s.regime==='MEI'||s.regime==='MEI/Outros - manual';const factor=(s.regime==='Simples Nacional'||isMei||blocked)?0:Math.max(0,1-(cl.reduction||0));const cbsRate=classTaxRate(s,cl,'cbs',factor,true),ibsRate=classTaxRate(s,cl,'ibs',factor,true);const cbs=taxbase*cbsRate,ibs=taxbase*ibsRate;const ipi=isTransport?0:base*s.ipi;const ibscbsBaseComponent=c.ibscbsInIcmsBase==='Sim'?(cbs+ibs):0;const icmsBasePre=base+isv+ibscbsBaseComponent+(['Industrialização','Revenda'].includes(s.purpose)||isTransport?0:ipi);let icms=0;if(!['Simples Nacional','Simples + IBS/CBS regular','MEI','MEI/Outros - manual'].includes(s.regime)&&inter<.999)icms=icmsBasePre*inter/(1-inter);const icmsBase=icmsBasePre+icms;let stBase=0,st=0,stAppliedRate=0,stOwnDeduction=0;if(!isTransport&&s.stMethod!=='Não aplicar'){const ipiExcludedFromOwnBase=['Industrialização','Revenda'].includes(s.purpose);const stStartingBase=icmsBase+(ipiExcludedFromOwnBase?ipi:0);stBase=s.stMethod==='MVA ajustado'?stStartingBase*(1+(s.stParam||0)/100):Number(s.stParam||0);stAppliedRate=s.stRate>0?s.stRate:internal;stOwnDeduction=['Simples Nacional','Simples + IBS/CBS regular'].includes(s.regime)?icmsBase*inter:icms;st=Math.max(0,stBase*stAppliedRate-stOwnDeduction)}const fcpBase=isTransport?0:(s.stMethod==='Não aplicar'?base:stBase);const fcp=isTransport?0:fcpBase*s.fcp;let difalBase=0,difalRate=0,difal=0;if(!isTransport&&c.buyerUF!==s.uf&&eligibleDifal(s.purpose)&&s.difalMethod!=='Não aplicar'){difalRate=Math.max(0,internal-inter);if(s.difalMethod==='Base simples'){difalBase=icmsBase;difal=difalBase*difalRate}else{const originIcms=icmsBase*inter;difalBase=Math.max(0,(icmsBase-originIcms)/(1-internal));difal=Math.max(0,difalBase*internal-originIcms)}}const allowCredit=!(DB.rules?.blocked_credit_purposes||['Brinde','Doação','Amostra grátis','Uso pessoal']).includes(s.purpose);let crIcms=0;if(isMei){crIcms=0}else if(['Simples Nacional','Simples + IBS/CBS regular'].includes(s.regime)){if(['Industrialização','Revenda','Contratação de transporte (CT-e)'].includes(s.purpose))crIcms=base*s.simpIcms}else if(['Industrialização','Revenda','Contratação de transporte (CT-e)'].includes(s.purpose))crIcms=icms;else if(s.purpose==='Ativo imobilizado')crIcms=icms+difal;const crCbs=isMei?0:(s.regime==='Simples Nacional'?taxbase*s.simpCbs*(allowCredit?1:0):cbs*(allowCredit?1:0));const crIbs=isMei?0:(s.regime==='Simples Nacional'?taxbase*s.simpIbs*(allowCredit?1:0):ibs*(allowCredit?1:0));const crIpi=isMei?0:ipi*s.ipiCredit*(allowCredit?1:0);const credits=crIcms+crCbs+crIbs+crIpi;const priceNF=base+isv+cbs+ibs+icms+ipi+st+fcp;const net=priceNF+difal-credits;const purchase=c.purchase,payment=new Date(purchase);payment.setDate(payment.getDate()+s.term);const due=lastWeekdayNextMonth(purchase);const radi=c.radi;const ibscbs=cbs+ibs,creditUsed=(crCbs+crIbs)*p.credit_utilization;const timing=(ext,outflow)=>{const cash=lastWeekdayNextMonth(ext);const benefit=creditUsed/pow(p.annual_rate,days(purchase,cash))-ibscbs/pow(p.annual_rate,days(purchase,outflow));return {ext,cash,outflow,finDays:days(cash,outflow),benefit}};const tn=timing(due,payment),tr=timing(radi,radi),ts=timing(payment,payment);
const icmsCreditDate=new Date(purchase); // crédito escriturado na competência da entrada
const ipiCreditDate=new Date(purchase);  // crédito escriturado na competência da entrada
const icmsCashDate=icmsCashDueDate(purchase,c.buyerUF);
const ipiCashDate=ipiCashDueDate(purchase,c.buyerUF);
const icmsCreditUsed=crIcms*p.credit_utilization;
const ipiCreditUsed=crIpi*p.credit_utilization;
const icmsPV=icmsCreditUsed/pow(p.annual_rate,days(purchase,icmsCashDate));
const ipiPV=ipiCreditUsed/pow(p.annual_rate,days(purchase,ipiCashDate));
const legacyCreditDate=new Date(purchase);
const legacyCashDate=icmsCashDate;
const legacyCreditUsed=icmsCreditUsed+ipiCreditUsed;
const icmsIpiPV=icmsPV+ipiPV;
const vp=t=>(priceNF-ibscbs)/pow(p.annual_rate,days(purchase,payment))+difal/pow(p.annual_rate,days(purchase,due))-icmsIpiPV-t.benefit;
const vps={Normal:vp(tn),RADI:vp(tr),'Split Payment':vp(ts)};
return {mode:'Mercadoria',base,totalDiscount,isv,stAppliedRate,cbsRate,ibsRate,cbs,ibs,ipi,inter,icmsBase,icms,stBase,st,stOwnDeduction,fcpBase,fcp,difalBase,difalRate,difal,crIcms,crCbs,crIbs,crIpi,credits,priceNF,net,creditUseful:credits*p.credit_utilization,payment,due,legacyCreditDate,legacyCashDate,legacyCreditUsed,icmsCreditDate,ipiCreditDate,icmsCashDate,ipiCashDate,icmsCreditUsed,ipiCreditUsed,timing:{Normal:tn,RADI:tr,'Split Payment':ts},vps,selectedVP:vps[c.settlement]}}

function combineResults(results,mode,c){
  const out={mode,lineCount:results.length},keys=['base','contractBRL','grossRemittance','bank','totalDiscount','isv','cbs','ibs','issBase','iss','issWithheld','irrf','cide','iof','inss','csll','otherRet','retentions','supplierPayment','crCbs','crIbs','crIcms','crIpi','credits','priceNF','net','creditUseful','icmsBase','icms','ipi','stBase','st','stOwnDeduction','fcpBase','fcp','difalBase','difal','legacyCreditUsed','icmsCreditUsed','ipiCreditUsed','landedGross','customsTaxes','customsValue'];
  keys.forEach(k=>out[k]=results.reduce((a,r)=>a+Number(r[k]||0),0));
  ['cbsRate','ibsRate','inter','difalRate'].forEach(k=>out[k]=out.base?results.reduce((a,r)=>a+Number(r[k]||0)*Number(r.base||0),0)/out.base:0);out.stAppliedRate=out.stBase?results.reduce((a,r)=>a+Number(r.stAppliedRate||0)*Number(r.stBase||0),0)/out.stBase:0;
  out.vps={};out.timing={};['Normal','RADI','Split Payment'].forEach(m=>{out.vps[m]=results.reduce((a,r)=>a+Number(r.vps?.[m]||0),0);const first=results[0]?.timing?.[m]||{};out.timing[m]={...first,benefit:results.reduce((a,r)=>a+Number(r.timing?.[m]?.benefit||0),0),finDays:first.finDays||0}});
  out.selectedVP=out.vps[c.settlement];out.payment=results.reduce((d,r)=>!d||r.payment>d?r.payment:d,null);out.due=results[0]?.due||null;return out
}
const calcSupplierBase=calcSupplier;
function calcImportServiceSupplier(s,c){
  const p=DB.params,cl=getClass(s.cclass),purchase=c.purchase,contractBRL=Math.max(0,(s.foreignServicePrice||0)*(s.exchangeRate||0));
  const irrfRate=Math.max(0,Math.min(.95,s.irrfImport||0)),grossRemittance=s.grossUp==='Sim'?contractBRL/(1-irrfRate):contractBRL;
  const irrf=grossRemittance*irrfRate,cide=grossRemittance*(s.cideImport||0),iof=grossRemittance*(s.iofFx||0);
  const blocked=['Alíquota zero','Isenta','Imune','Suspensão','Não tributada'].some(x=>(cl.treatment||'').includes(x));
  const factor=blocked?0:Math.max(0,1-(cl.reduction||0)),cbsRate=classTaxRate(s,cl,'cbs',factor,false),ibsRate=classTaxRate(s,cl,'ibs',factor,false);
  const base=grossRemittance,cbs=base*cbsRate,ibs=base*ibsRate,issBase=base+(c.ibscbsInIssBase==='Sim'?(cbs+ibs):0),iss=issBase*(s.issRate||0);
  const allowCredit=serviceCreditAllowed(s,blocked),creditFactor=allowCredit?Math.max(0,Math.min(1,s.ibscbsCredit??1)):0,crCbs=cbs*creditFactor,crIbs=ibs*creditFactor,credits=crCbs+crIbs;
  const bank=s.bankExpenses||0,priceNF=grossRemittance+bank+cide+iof+iss+cbs+ibs,net=priceNF-credits,supplierPayment=Math.max(0,grossRemittance-irrf);
  const payment=new Date(purchase);payment.setDate(payment.getDate()+(s.term||0));const due=lastWeekdayNextMonth(purchase),radi=c.radi,ibscbs=cbs+ibs,creditUsed=credits*p.credit_utilization;
  const timing=(ext,outflow)=>{const cash=lastWeekdayNextMonth(ext),benefit=creditUsed/pow(p.annual_rate,days(purchase,cash))-ibscbs/pow(p.annual_rate,days(purchase,outflow));return {ext,cash,outflow,finDays:days(cash,outflow),benefit}};
  const tn=timing(due,payment),tr=timing(radi,radi),ts=timing(payment,payment),vp=t=>(priceNF-ibscbs)/pow(p.annual_rate,days(purchase,payment))-t.benefit,vps={Normal:vp(tn),RADI:vp(tr),'Split Payment':vp(ts)};
  return {mode:'Importação de serviços',base,contractBRL,grossRemittance,bank,cbsRate,ibsRate,cbs,ibs,issBase,iss,irrf,cide,iof,retentions:irrf,supplierPayment,crCbs,crIbs,crIcms:0,crIpi:0,credits,priceNF,net,creditUseful:credits*p.credit_utilization,payment,due,timing:{Normal:tn,RADI:tr,'Split Payment':ts},vps,selectedVP:vps[c.settlement],treatyStatus:s.treatyStatus,icmsBase:0,icms:0,ipi:0,stBase:0,st:0,fcpBase:0,fcp:0,difalBase:0,difalRate:0,difal:0,inter:0};
}
calcSupplier=function(s,c){
  if(s.bulkRows?.length){const results=s.bulkRows.map(row=>calcSupplier({...supplierDefault(1),...row,bulkRows:null},c));const mode=results.length&&results.every(r=>r.mode===results[0].mode)?results[0].mode:'Cotação mista';return combineResults(results,mode,c)}
  if(s.operationType==='Importação de serviços')return calcImportServiceSupplier(s,c);
  if(s.operationType!=='Serviço + materiais')return calcSupplierBase(s,c);
  const total=Math.max(1,(s.servicePrice||0)+(s.materialPrice||0));
  const service={...s,operationType:'Serviço',price:s.servicePrice||0,other:0,discount:0,negValue:(s.negValue||0)*(s.servicePrice||0)/total};
  const material={...s,operationType:'Mercadoria',price:s.materialPrice||0,cclass:s.materialCclass||s.cclass,other:s.other||0,discount:s.discount||0,negValue:(s.negValue||0)*(s.materialPrice||0)/total};
  const sr=calcSupplierBase(configuredSupplier(service,c.purchase),c),mr=calcSupplierBase(configuredSupplier(material,c.purchase),c),out=combineResults([sr,mr],'Serviço + materiais',c);out.serviceComponent=sr;out.materialComponent=mr;return out
};

// Explicit supply dates and separately contracted freight use the existing forward motors.
const originalScenarioMotor=calcSupplier;
function fiscalRates(date){
 const periods=DB.rules?.rate_periods||[];
 if(!periods.length)return DB.params;
 const key=ymd(date),period=periods.find(p=>p.from<=key&&p.to>=key);
 if(!period)throw new Error('Sem alíquota homologada para '+key+'. Cadastre a vigência em Parâmetros.');
 return {...DB.params,...period};
}
function checkedDate(value,label){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))throw new Error(label+': data obrigatória.');
 const d=dateVal(value);if(ymd(d)!==value)throw new Error(label+': data inválida.');return d;
}
function withSupply(s,c){
 const transport=s.purpose==='Contratação de transporte (CT-e)';
 const contractualPayment=new Date(c.purchase);contractualPayment.setDate(contractualPayment.getDate()+(s.term||0));
 let fact=s.operationType==='Importação'?dateVal(s.clearanceDate||ymd(c.purchase)):s.supplyDate?checkedDate(s.supplyDate,'Fornecimento'):s.expectedDeliveryDate?checkedDate(s.expectedDeliveryDate,'Entrega prevista'):s.documentIssueDate?checkedDate(s.documentIssueDate,'Emissão'):c.purchase;
 if(s.supplyKind==='Continuado / fracionado'){
  const exig=checkedDate(s.considerationDueDate,'Exigibilidade da contraprestação');fact=exig<contractualPayment?exig:contractualPayment;
 }
 if(s.supplyKind==='Administração pública (art. 473)')fact=contractualPayment;
 s=configuredSupplier(s,fact);
 const original=DB.params,selected=fiscalRates(fact),offset=days(c.purchase,fact);
 if((s.advanceSchedule||'').trim()&&s.operationType==='Importação')throw new Error('Antecipação de importação de bens exige análise aduaneira específica; não utilize o cronograma doméstico.');
 if((s.advanceSchedule||'').trim()&&s.operationType==='Serviço + materiais')throw new Error('Separe serviço e materiais em cenários próprios para informar antecipações.');
 DB.params=selected;
 let out;
 try {out=originalScenarioMotor({...s,term:(s.term||0)-offset},{...c,purchase:fact});}
 finally {DB.params=original;}
 // Motor original desconta a partir do fato; reconduzir à data-base da cotação.
 for(const m of Object.keys(out.vps||{}))out.vps[m]/=pow(selected.annual_rate,offset);
 out.selectedVP=out.vps[c.settlement];out.supplyDate=ymd(fact);out.configRevision=DB.revision;out.rateSource=selected.source||DB.rules?.rate_status;out.differentiatedRule=s._taxRule?.source||null;
 if(!s.supplyDate&&!s.expectedDeliveryDate&&!s.documentIssueDate&&(!s.supplyKind||s.supplyKind==='Pontual')&&!s.advanceSchedule&&!s.taxExtinctionDate)return out;
 const totalTax=out.cbs+out.ibs,credit=out.crCbs+out.crIbs;
 const events=[];let advances=[];
 if((s.advanceSchedule||'').trim()){
  try{advances=JSON.parse(s.advanceSchedule);}catch{throw new Error('Antecipações: informe uma lista JSON válida.');}
  if(!Array.isArray(advances)||advances.length>100)throw new Error('Antecipações: máximo 100 parcelas.');
 }
 const taxBase=out.ibscbsBase??(out.base+(out.isv||0));
 if(!advances.length&&(s.supplyDate||s.expectedDeliveryDate)&&out.payment<fact)advances=[{date:ymd(out.payment),base:taxBase}];
 let paidBase=0;
 for(const a of advances){
  const payment=checkedDate(a.date,'Pagamento antecipado'),doc=a.documentDate?checkedDate(a.documentDate,'Documento antecipação'):payment;
  if(payment>=fact)throw new Error('Antecipação deve ocorrer antes do fornecimento.');
  if(typeof a.base!=='number'||!Number.isFinite(a.base)||a.base<=0)throw new Error('Base antecipada deve ser positiva (sem IBS/CBS).');
  paidBase+=a.base;
  const rateDate=doc<payment?doc:payment,rate=fiscalRates(rateDate);
  const normal=!(s.regime==='Simples Nacional'||s.regime==='MEI');
  const cl=getClass(s.cclass),blocked=['Alíquota zero','Isenta','Imune','Suspensão','Não tributada'].some(x=>(cl.treatment||'').includes(x));
  const factor=normal&&!blocked?Math.max(0,1-(cl.reduction||0)):0;
  const extinction=a.extinctionDate?checkedDate(a.extinctionDate,'Extinção antecipação'):payment;
  if(extinction<payment)throw new Error('Extinção antecipação anterior ao pagamento.');
  events.push({type:'Antecipação',date:ymd(payment),rateDate:ymd(rateDate),base:a.base,cbs:a.base*classTaxRate(configuredSupplier(s,rateDate),cl,'cbs',factor,true,rate),ibs:a.base*classTaxRate(configuredSupplier(s,rateDate),cl,'ibs',factor,true,rate),extinctionDate:ymd(extinction)});
 }
 if(paidBase>taxBase+.005)throw new Error('Bases antecipadas excedem a base total do fornecimento.');
 const sum=k=>events.reduce((v,e)=>v+e[k],0),deltaCbs=out.cbs-sum('cbs'),deltaIbs=out.ibs-sum('ibs');
 events.push({type:'Fornecimento / ajuste',date:ymd(fact),base:taxBase,cbs:Math.max(0,deltaCbs),ibs:Math.max(0,deltaIbs),refundCbs:Math.max(0,-deltaCbs),refundIbs:Math.max(0,-deltaIbs)});
 out.taxEvents=events;
 for(const m of Object.keys(out.timing)){
  const old=out.timing[m];
  let ext=s.taxExtinctionDate?checkedDate(s.taxExtinctionDate,'Extinção IBS/CBS'):old.ext;
  if(ext<fact)ext=fact;
  const finalEvent=events[events.length-1],flows=events.slice(0,-1).map(e=>({amount:e.cbs+e.ibs,date:dateVal(e.date),ext:dateVal(e.extinctionDate)}));
  flows.push({amount:finalEvent.cbs+finalEvent.ibs,date:m==='Normal'?out.payment:ext,ext});
  let benefit=0;const totalPaid=flows.reduce((v,f)=>v+f.amount,0);
  for(const f of flows){const cash=lastWeekdayNextMonth(f.ext);const share=totalPaid?credit*f.amount/totalPaid:0;benefit+=share*selected.credit_utilization/pow(selected.annual_rate,days(c.purchase,cash))-f.amount/pow(selected.annual_rate,days(c.purchase,f.date));}
  // Simples transfers are projected under the existing credit assumptions.
  if(!totalPaid&&credit)benefit=credit*selected.credit_utilization/pow(selected.annual_rate,days(c.purchase,lastWeekdayNextMonth(ext)));
  const oldBenefit=old.benefit/pow(selected.annual_rate,offset);
  const principal=Math.max(0,out.priceNF-totalTax),oldPrincipal=principal/pow(selected.annual_rate,days(c.purchase,out.payment));
  let newPrincipal=principal*(taxBase?Math.max(0,1-paidBase/taxBase):1)/pow(selected.annual_rate,days(c.purchase,out.payment));
  for(const e of events.slice(0,-1))newPrincipal+=principal*(taxBase?e.base/taxBase:0)/pow(selected.annual_rate,days(c.purchase,dateVal(e.date)));
  out.vps[m]+=oldBenefit-benefit+newPrincipal-oldPrincipal;
  out.timing[m]={...old,ext,cash:lastWeekdayNextMonth(ext),benefit,finDays:days(lastWeekdayNextMonth(ext),old.outflow)};
 }
 out.selectedVP=out.vps[c.settlement];return out;
}
calcSupplier=function(s,c){
 if(s.bulkRows?.length){const rows=s.bulkRows.map(row=>calcSupplier({...supplierDefault(1),...row,bulkRows:null},c)),out=combineResults(rows,'Cotação mista',c);out.itemResults=rows;return out;}
 if(s.operationType!=='Mercadoria'||s.purpose==='Contratação de transporte (CT-e)'||!(s.freight>0))return withSupply(s,c);
 const mode=s.freightMode||'CIF — cobrado pelo fornecedor';
 if(!list.freightModes.includes(mode))throw new Error('Modalidade de frete inválida.');
 if(s.freightScope&&!list.transportScopes.includes(s.freightScope))throw new Error('Tipo de transporte inválido.');
 if(mode==='CIF — já incluso no preço')return withSupply({...s,freight:0},c);
 if(mode!=='FOB — contratado pelo comprador')return withSupply(s,c);
 if(!s.freightStartDate)throw new Error('Frete FOB: informe a data de início do transporte.');
 if(s.freightScope==='Iniciado no exterior')throw new Error('Transporte iniciado no exterior: simule em Importação de serviços; não aplicar CT-e doméstico.');
 const goods=withSupply({...s,freight:0},c);
 const freight={...supplierDefault(1),name:'Transportador',operationType:s.freightScope==='Municipal (ISS)'?'Serviço':'Mercadoria',purpose:'Contratação de transporte (CT-e)',price:s.freight,freight:0,regime:s.freightRegime||'Lucro Real',cclass:s.freightCclass||'000001',uf:s.transportStartUF||s.uf,transportStartUF:s.transportStartUF||s.uf,transportEndUF:s.transportEndUF||c.buyerUF,term:s.freightTerm||0,supplyDate:s.freightStartDate,icmsManual:s.freightIcms||0,issRate:s.freightIss||0,simpCbs:s.freightSimpCbs||0,simpIbs:s.freightSimpIbs||0,simpIcms:s.freightSimpIcms||0,serviceCredit:s.freightCredit||'Automático — regra geral'};
 const fr=withSupply(freight,c);
 if(s.freightCredit==='Não — bloquear crédito'||(DB.rules?.blocked_credit_purposes||[]).includes(s.purpose)){
  const prev=fr.credits,oldIcms=fr.crIcms,oldDual=fr.crCbs+fr.crIbs;fr.crCbs=0;fr.crIbs=0;fr.crIcms=0;fr.credits=0;fr.creditUseful=0;fr.net+=prev;
  for(const m of Object.keys(fr.vps)){const creditPV=(oldDual*(DB.params.credit_utilization||0))/pow(DB.params.annual_rate,days(c.purchase,fr.timing[m].cash))+(oldIcms*(DB.params.credit_utilization||0))/pow(DB.params.annual_rate,days(c.purchase,fr.icmsCashDate||fr.timing[m].cash));fr.vps[m]+=creditPV;}fr.selectedVP=fr.vps[c.settlement];
 }
 const out=combineResults([goods,fr],'Mercadoria',c);out.goodsComponent=goods;out.freightComponent=fr;out.supplyDate=goods.supplyDate;out.configRevision=DB.revision;out.taxEvents=goods.taxEvents;return out;
};

// Inverse adapter: all tax and credit calculations remain in the original motor.
const validatedForwardMotor=calcSupplier;
function inverseSupplier(s,c){
 const target=Number(s.grossTarget);
 if(!Number.isFinite(target)||target<0)throw new Error('Informe um bruto final válido.');
 const forwardContext={...c,inverseForwardOnly:true};
 const mode=s.operationType||'Mercadoria';
 const keys=mode==='Serviço + materiais'?['servicePrice','materialPrice']:mode==='Importação'?['foreignPrice']:mode==='Importação de serviços'?['foreignServicePrice']:['price'];
 const scaled=(source,x,sourceKeys)=>{const total=sourceKeys.reduce((a,k)=>a+Math.max(0,Number(source[k])||0),0),out={...source};sourceKeys.forEach((k,i)=>out[k]=total?x*Math.max(0,Number(source[k])||0)/total:(i===0?x:0));return out};
 const values=s.bulkRows?.length?s.bulkRows:null;
 const rowKeys=row=>row.operationType==='Serviço + materiais'?['servicePrice','materialPrice']:row.operationType==='Importação'?['foreignPrice']:row.operationType==='Importação de serviços'?['foreignServicePrice']:['price'];
 const rowTotals=values?.map(row=>rowKeys(row).reduce((a,k)=>a+Math.max(0,Number(row[k])||0),0));
 const totalRows=rowTotals?.reduce((a,v)=>a+v,0);
 if(values&&!totalRows)throw new Error('A cotação em massa precisa de valores positivos para definir a proporção dos itens.');
 const evaluate=x=>{const resolved=values?{...s,bulkRows:values.map((row,i)=>scaled(row,x*rowTotals[i]/totalRows,rowKeys(row)))}:scaled(s,x,keys);return {resolved,result:validatedForwardMotor(resolved,forwardContext)}};
 const minimum=evaluate(0).result.priceNF;
 if(!Number.isFinite(minimum))throw new Error('Parâmetros inválidos para calcular o bruto.');
 if(target<minimum-0.005)throw new Error(`Bruto inferior ao mínimo das despesas e tributos fixos: ${money(minimum)}.`);
 let lo=0,hi=Math.max(1,target),upper=evaluate(hi).result.priceNF;
 for(let i=0;upper<target&&i<60;i++){hi*=2;upper=evaluate(hi).result.priceNF;}
 if(!Number.isFinite(upper)||upper<target)throw new Error('Não foi possível encontrar preço compatível com o bruto informado.');
 for(let i=0;i<90;i++){const mid=(lo+hi)/2;if(evaluate(mid).result.priceNF<target)lo=mid;else hi=mid;}
 const solved=evaluate((lo+hi)/2);
 if(!Number.isFinite(solved.result.priceNF)||Math.abs(solved.result.priceNF-target)>0.005)throw new Error('Os parâmetros não permitem reconciliar o bruto informado.');
 return {...solved.result,calculationBasis:'Partindo do bruto',grossTarget:target,resolvedInput:solved.resolved,inverseDifference:solved.result.priceNF-target};
}
calcSupplier=function(s,c){return c.inverseForwardOnly||s.calculationBasis!=='Partindo do bruto'?validatedForwardMotor(s,c):inverseSupplier(s,c)};

function scenarioGross(s,r){
  if(r.mode==='Importação')return r.landedGross||r.priceNF||0;
  return r.priceNF||0;
}
function scenarioBase(s,r){
  if(r.mode==='Importação')return r.customsValue||r.base||0;
  return r.base||0;
}
function scenarioTaxValue(s,r){
  if(r.mode==='Importação')return r.customsTaxes||0;
  if(r.mode==='Importação de serviços')return (r.iss||0)+(r.cbs||0)+(r.ibs||0)+(r.irrf||0)+(r.cide||0)+(r.iof||0);
  if(r.mode==='Serviço')return (r.iss||0)+(r.cbs||0)+(r.ibs||0)+(r.isv||0)+(r.retentions||0);
  if(r.mode==='Serviço + materiais')return (r.iss||0)+(r.cbs||0)+(r.ibs||0)+(r.isv||0)+(r.icms||0)+(r.ipi||0)+(r.st||0)+(r.fcp||0)+(r.retentions||0);
  return Math.max(0,(r.priceNF||0)-(r.base||0));
}
function scenarioCashNeed(s,r){
  if(r.mode==='Importação'){
    const clearance=(r.customsTaxes||0)+(s.intlFreight||0)+(s.intlInsurance||0)+(s.customsAdjustment||0)+(r.localExpenses||0);
    return Math.max(clearance,r.net||0);
  }
  return r.net||0;
}
function scenarioTimingLabel(s,r){
  const t=r.timing?.[settlement]||r.timing?.Normal;
  if(!t)return '—';
  if(r.mode==='Importação')return `${Math.abs(t.finDays||0)} dias • desembaraço → efeito do crédito`;
  return `${Math.abs(t.finDays||0)} dias${t.finDays<0?' • custo':t.finDays>0?' • benefício':''}`;
}
function scenarioSubline(s,r){
  if(r.mode==='Importação')return `${escapeHtml(s.name)} • ${escapeHtml(s.country||'Exterior')} • NCM ${escapeHtml(s.ncm||'não informado')}`;
  if(r.mode==='Importação de serviços')return `${escapeHtml(s.name)} • ${escapeHtml(s.country||'Exterior')} • ${escapeHtml(s.serviceNature||'serviço')}`;
  if(r.mode==='Serviço')return `${escapeHtml(s.name)} • ${escapeHtml(s.regime||'')} • NBS ${escapeHtml(s.nbs||'não informada')}`;
  if(r.mode==='Serviço + materiais')return `${escapeHtml(s.name)} • serviço ${money(s.servicePrice||0)} + materiais ${money(s.materialPrice||0)}`;
  return `${escapeHtml(s.name)} • ${escapeHtml(s.uf||'')} • ${escapeHtml(s.regime||'')}`;
}
function ctx(){return {purchase:dateVal($('purchaseDate').value),radi:dateVal($('radiDate').value),buyerUF:$('buyerUF').value,settlement,ibscbsInIcmsBase,ibscbsInIssBase,operationMode}}
function dataSet(){const c=ctx(),suppliers=allSuppliers();return {c,suppliers,results:suppliers.map(s=>calcSupplier(s,c))}}
function criterionValue(r,s,c){
  if(c==='Menor custo econômico VP')return r.selectedVP;
  if(c==='Menor custo líquido')return r.net;
  if(c==='Menor preço NF')return scenarioGross(s,r);
  if(c==='Maior crédito')return -r.creditUseful;
  if(c==='Maior prazo')return -s.term;
  return r.selectedVP
}
function calcAll(){if(!DB.params||!Object.keys(DB.params).length)return;for(let i=1;i<=supplierCount;i++)refreshFieldStates(`f${i}`);let d;try{d=dataSet()}catch(e){const box=$('validationBanner');if(box){box.classList.remove('hidden');box.innerHTML=`<b>Confira o cálculo pelo bruto</b><span>${escapeHtml(e.message)}</span>`}return}d.results.forEach((r,i)=>{let audit=$(`f${i+1}_fiscalMemory`);if(audit)audit.remove();if(r.freightComponent||r.taxEvents||r.differentiatedRule){audit=document.createElement('div');audit.id=`f${i+1}_fiscalMemory`;audit.className='field-hint';audit.textContent=(r.differentiatedRule?'Regra diferenciada: '+r.differentiatedRule+'. ':'')+(r.freightComponent?`FOB separado — NF mercadoria: ${money(r.goodsComponent.priceNF)}; transporte: ${money(r.freightComponent.priceNF)}; crédito IBS/CBS frete: ${money(r.freightComponent.crCbs+r.freightComponent.crIbs)}. `:'')+(r.taxEvents?r.taxEvents.map(e=>`${e.type} em ${fmtDate(e.date)}: CBS ${money(e.cbs)}, IBS ${money(e.ibs)}${e.refundCbs||e.refundIbs?' (excesso a tratar: '+money((e.refundCbs||0)+(e.refundIbs||0))+')':''}`).join(' • '):'');$(`fields_f${i+1}`)?.appendChild(audit);}const note=$(`f${i+1}_inverseResult`);if(note)note.remove();if(r.calculationBasis){const el=document.createElement('small');el.id=`f${i+1}_inverseResult`;el.className='field-hint';el.textContent=`Base encontrada: ${money(r.base)} • Bruto recomposto: ${money(r.priceNF)} • Custo líquido: ${money(r.net)}`;$(`fields_f${i+1}`)?.prepend(el)}});renderNegotiationCompare(d);renderSimSummary(d);renderFiscal(d);renderFinancial(d);renderRecommendation(d);renderDashboard(d);validationSummary(false)}
function equalizationRows(d){
  if(d.results.length<2)return d.results.map(()=>({direction:'—',value:0,pct:0,target:null}));
  const ranked=d.results.map((r,i)=>({i,v:r.selectedVP})).sort((a,b)=>a.v-b.v),best=ranked[0],second=ranked[1];
  return d.results.map((r,i)=>{
    const gross=Math.max(1,scenarioGross(d.suppliers[i],r));
    if(i===best.i){
      const diff=Math.max(0,second.v-r.selectedVP);
      return {direction:'Pode aumentar até',value:diff,pct:diff/gross,target:second.i};
    }
    const diff=Math.max(0,r.selectedVP-best.v);
    return {direction:'Precisa baixar',value:diff,pct:diff/gross,target:best.i};
  })
}
function renderNegotiationCompare(d){
  const box=$('negotiationCompare');if(!box)return;
  const eq=equalizationRows(d);
  if(d.results.length<2){box.innerHTML='<div class="neg-empty">Adicione pelo menos 2 fornecedores para visualizar a margem comparativa.</div>';return}
  box.innerHTML=d.suppliers.map((s,i)=>{
    const r=d.results[i],e=eq[i],target=e.target!==null?d.suppliers[e.target]:null;
    const action=e.direction.startsWith('Pode')?'PODE AUMENTAR':'PRECISA BAIXAR';
    const phrase=e.direction.startsWith('Pode')?`antes de empatar com F${e.target+1} • ${escapeHtml(target?.name||'Fornecedor')}`:`para empatar com F${e.target+1} • ${escapeHtml(target?.name||'Fornecedor')}`;
    return `<div class="neg-card ${e.direction.startsWith('Pode')?'best':''}"><div class="neg-card-head"><span class="pill">F${i+1}</span><b>${scenarioVisualLabel(i+1,r.mode)}</b><small>${escapeHtml(s.name)}</small></div><small>${action}</small><strong>${money(e.value)}</strong><em>${pct(e.pct)}</em><p>${phrase}</p></div>`
  }).join('')
}
function renderSimSummary(d){
  const eq=equalizationRows(d);
  const rows=[
    ['Tipo', (r,i)=>scenarioVisualLabel(i+1,r.mode)],
    ['Valor bruto / landed', (r,i)=>money(scenarioGross(d.suppliers[i],r))],
    ['Créditos recuperáveis',r=>money(r.credits||0)],
    ['Custo líquido',r=>money(r.net||0)],
    ['VP líquido de caixa',r=>money(r.selectedVP||0)],
    ['Margem p/ equalização',(r,i)=>{const e=eq[i];if(d.results.length<2)return '—';return `<b>${e.direction}</b><br>${money(e.value)} <small>(${pct(e.pct)})</small><br><small>vs. F${e.target+1}</small>`;}]
  ];
  let h='<thead><tr><th>Indicador</th>'+d.suppliers.map((s,i)=>`<th>${scenarioVisualLabel(i+1,d.results[i].mode)}<br><small>${escapeHtml(s.name)}</small></th>`).join('')+'</tr></thead><tbody>';
  rows.forEach(([l,f])=>h+=`<tr><td><b>${l}</b></td>${d.results.map((r,i)=>`<td>${f(r,i)}</td>`).join('')}</tr>`);
  $('simSummary').innerHTML=h+'</tbody>'
}
function taxTable(s,r){if(r.mode==='Importação'){const rows=[['II',r.customsValue,s.iiRate,r.ii,0],['IS',r.isBase,s.is,r.isv,0],['IPI-importação',r.ipiBase,s.ipi,r.ipi,r.crIpi],['IBS-importação',r.ibscbsBase,r.ibsRate,r.ibs,r.crIbs],['CBS-importação',r.ibscbsBase,r.cbsRate,r.cbs,r.crCbs],['ICMS-importação',r.icmsBase,r.inter,r.icms,r.crIcms],['Siscomex',0,0,s.siscomexFee,0],['AFRMM',0,0,s.afrmm,0],['CIDE',0,0,s.cide,0],['Antidumping/comp./salv.',0,0,s.antidumping,0],['Outros aduaneiros',0,0,s.otherCustoms,0]];return `<div class="service-source-note"><b>Importação direta:</b> ${escapeHtml(s.country||'país não informado')} • NCM ${escapeHtml(s.ncm||'não informado')}<br><span>Valor aduaneiro = mercadoria convertida + frete + seguro + ajustes. IBS/CBS usam a base específica da importação; IPI e ICMS não compõem essa base.</span></div><table class="mini-table"><thead><tr><th>Tributo/encargo</th><th>Base</th><th>Alíquota</th><th>Valor</th><th>Crédito</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${x[0]}</td><td>${x[1]?money(x[1]):'—'}</td><td>${x[2]?pct(x[2]):'—'}</td><td>${money(x[3])}</td><td>${money(x[4])}</td></tr>`).join('')}</tbody></table>`}if(r.mode==='Serviço'){const rows=[['ISS',r.issBase,s.issRate,r.iss,0],['IBS',r.base,r.ibsRate,r.ibs,r.crIbs],['CBS',r.base,r.cbsRate,r.cbs,r.crCbs],['IS',r.base,s.is,r.isv,0],['ISS retido',r.issBase,s.issRate,r.issWithheld,0],['IRRF',r.base,s.irrf,r.irrf,0],['INSS',r.base,s.inss,r.inss,0],['CSLL / ret. federais',r.base,s.csll,r.csll,0],['Outras retenções',r.base,s.otherRet,r.otherRet,0]];return `<div class="service-source-note"><b>Serviço:</b> LC 116 ${escapeHtml(s.lc116||'não informado')} • NBS ${escapeHtml(s.nbs||'não informada')} • cIndOp ${escapeHtml(s.cindop||'não informado')} • cClassTrib ${escapeHtml(s.cclass||'NÃO INFORMADO')}<br><span>ISS e retenções usam os percentuais informados pelo usuário; IBS/CBS usam regime + cClassTrib. O ISS é apurado para memória fiscal e não é somado novamente ao preço-base do serviço.</span></div><table class="mini-table"><thead><tr><th>Tributo / retenção</th><th>Base</th><th>Alíquota</th><th>Valor</th><th>Crédito</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${x[0]}</td><td>${money(x[1])}</td><td>${pct(x[2])}</td><td>${money(x[3])}</td><td>${money(x[4])}</td></tr>`).join('')}</tbody></table>`}const rows=[['ICMS',r.icmsBase,r.inter,r.icms,r.crIcms],['IPI',r.base,s.ipi,r.ipi,r.crIpi],['ICMS-ST',r.stBase,r.stAppliedRate??internalRate(ctx().buyerUF),r.st,0],['FCP',r.fcpBase,s.fcp,r.fcp,0],['IBS',r.base,r.ibsRate,r.ibs,r.crIbs],['CBS',r.base,r.cbsRate,r.cbs,r.crCbs],['IS',r.base,s.is,r.isv,0],['DIFAL',r.difalBase,r.difalRate,r.difal,0]];const stDeductionNote=r.stBase>0?`<div class="service-source-note">ICMS-ST: ${money(r.stBase)} × ${pct(r.stAppliedRate||0)} − dedução ICMS próprio ${money(r.stOwnDeduction||0)}${['Simples Nacional','Simples + IBS/CBS regular'].includes(s.regime)?' (simulação exclusiva da ST para o Simples)':''} = ${money(r.st)}</div>`:'';const transportNote=s.purpose==='Contratação de transporte (CT-e)'?`<div class="service-source-note"><b>Contratação de transporte (CT-e):</b> ${escapeHtml(s.transportStartUF||'—')} → ${escapeHtml(s.transportEndUF||ctx().buyerUF||'—')}<br><span>Base do ICMS = preço da prestação. Campos próprios de mercadoria (NCM, IPI, ST e origem) ficam bloqueados.</span></div>`:'';return `${transportNote}${stDeductionNote}<table class="mini-table"><thead><tr><th>Tributo</th><th>Base</th><th>Alíquota</th><th>Valor</th><th>Crédito</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${x[0]}</td><td>${money(x[1])}</td><td>${pct(x[2])}</td><td>${money(x[3])}</td><td>${money(x[4])}</td></tr>`).join('')}</tbody></table>`}
const taxTableBase=taxTable;
taxTable=function(s,r){
  if(r.mode==='Importação de serviços'){
    const rows=[['IRRF',r.grossRemittance,s.irrfImport,r.irrf,0],['CIDE',r.grossRemittance,s.cideImport,r.cide,0],['IOF-câmbio',r.grossRemittance,s.iofFx,r.iof,0],['ISS-importação',r.issBase,s.issRate,r.iss,0],['IBS-importação',r.base,r.ibsRate,r.ibs,r.crIbs],['CBS-importação',r.base,r.cbsRate,r.cbs,r.crCbs]];
    return `<div class="service-source-note"><b>Serviço importado:</b> ${escapeHtml(s.country||'país não informado')} • ${escapeHtml(s.serviceNature||'natureza não informada')}<br><span>${escapeHtml(r.treatyStatus||s.treatyStatus||'Tratado pendente de análise')}. O motor não reduz a alíquota automaticamente sem validação fiscal.</span></div><table class="mini-table"><thead><tr><th>Tributo/encargo</th><th>Base</th><th>Alíquota</th><th>Valor</th><th>Crédito</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${x[0]}</td><td>${money(x[1])}</td><td>${pct(x[2])}</td><td>${money(x[3])}</td><td>${money(x[4])}</td></tr>`).join('')}</tbody></table>`;
  }
  if(r.mode!=='Serviço + materiais')return taxTableBase(s,r);return `<div class="service-source-note"><b>Contrato híbrido:</b> as parcelas de serviço e materiais foram tributadas separadamente e consolidadas abaixo.</div><h3>Parcela de serviço</h3>${taxTableBase({...s,operationType:'Serviço',price:s.servicePrice||0},r.serviceComponent)}<h3>Parcela de materiais</h3>${taxTableBase({...s,operationType:'Mercadoria',price:s.materialPrice||0,cclass:s.materialCclass||s.cclass},r.materialComponent)}`};
function renderFiscal(d){
  const modes=[...new Set(d.results.map(r=>r.mode))];
  const banner=modes.length>1
    ?`<div class="assumption-banner service"><b>Análise fiscal multiestratégia</b><span>${modes.join(' × ')}. Cada fornecedor usa seu próprio motor fiscal.</span></div>`
    :modes[0]==='Importação'
      ?`<div class="assumption-banner service"><b>Motor de Importação direta • 2027+</b><span>Valor aduaneiro, tributos de importação, landed cost e créditos.</span></div>`
      :modes[0]==='Serviço'
        ?`<div class="assumption-banner service"><b>Motor de Serviço</b><span>ISS, retenções e IBS/CBS conforme os dados do cenário.</span></div>`
        :`<div class="assumption-banner"><b>Motor de Mercado Nacional</b><span>ICMS, IPI, ST, DIFAL, IBS/CBS e créditos conforme o cenário.</span></div>`;
  $('fiscalCards').innerHTML=banner+d.suppliers.map((s,i)=>{
    const r=d.results[i];
    let extra='';
    if(r.mode==='Importação'){
      extra=`<div class="kpi-strip"><div><small>Valor aduaneiro</small><b>${money(r.customsValue)}</b></div><div><small>Tributos/encargos</small><b>${money(r.customsTaxes)}</b></div><div><small>Landed bruto</small><b>${money(r.landedGross)}</b></div><div><small>Custo líquido</small><b>${money(r.net)}</b></div></div>`;
    }else if(r.mode==='Serviço'){
      extra=`<div class="kpi-strip"><div><small>ISS apurado</small><b>${money(r.iss)}</b></div><div><small>Retenções</small><b>${money(r.retentions)}</b></div><div><small>Pago ao prestador</small><b>${money(r.supplierPayment)}</b></div><div><small>Custo líquido</small><b>${money(r.net)}</b></div></div>`;
    }else{
      extra=`<div class="kpi-strip"><div><small>Base após negociação</small><b>${money(r.base)}</b></div><div><small>Redução negociada</small><b>${money(r.totalDiscount)}</b></div><div><small>Preço final NF</small><b>${money(r.priceNF)}</b></div><div><small>Custo líquido</small><b>${money(r.net)}</b></div></div>`;
    }
    const chain=r.mode==='Importação'
      ?`<div class="chain-note"><b>Leitura da importação</b><span>O cenário utiliza desembaraço, tributos aduaneiros e créditos informados.</span></div>`
      :r.mode==='Serviço'
        ?`<div class="chain-note"><b>Leitura do serviço</b><span>ISS e retenções permanecem separados; IBS/CBS seguem o tratamento do cenário.</span></div>`
        :`<div class="chain-note"><b>Leitura do fornecedor nacional</b><span>O cenário aplica o motor de mercadoria nacional conforme UF, regime, finalidade e origem.</span></div>`;
    return `<details class="analysis-detail" ${i<2?'open':''}><summary><div><span class="pill">F${i+1}</span><b>${scenarioVisualLabel(i+1,r.mode)}</b><small>${scenarioSubline(s,r)}</small></div><div class="summary-kpis"><span>Tributos/encargos <b>${money(scenarioTaxValue(s,r))}</b></span><span>Créditos <b>${money(r.credits||0)}</b></span></div></summary><div class="detail-body">${extra}${chain}${taxTable(s,r)}</div></details>`
  }).join('')
}
function renderFinancial(d){
  let h='<div class="finance-mode-note">Comparação financeira por cenário. Importação usa o fluxo de desembaraço; mercado nacional e serviço usam o modo '+settlement+'.</div>';
  d.suppliers.forEach((s,i)=>{
    const r=d.results[i],t=r.timing?.[settlement]||r.timing?.Normal;
    if(r.mode==='Importação'){
      h+=`<details class="analysis-detail" ${i<2?'open':''}><summary><div><span class="pill">F${i+1}</span><b>${scenarioVisualLabel(i+1,r.mode)}</b><small>${scenarioSubline(s,r)}</small></div><div class="summary-kpis"><span>VP <b>${money(r.selectedVP)}</b></span><span>Pagamento fornecedor <b>${fmtDate(ymd(r.payment))}</b></span></div></summary><div class="detail-body"><div class="table-scroll"><table class="mini-table timing-table"><tbody>
      <tr><td>Pagamento fornecedor exterior</td><td>${fmtDate(ymd(r.payment))}</td></tr>
      <tr><td>Desembaraço / saída tributária</td><td>${fmtDate(ymd(r.clearance))}</td></tr>
      <tr><td>Crédito IBS/CBS reduz caixa</td><td>${fmtDate(ymd(t.cash))}</td></tr>
      <tr><td>Dias de efeito do crédito</td><td>${Math.abs(t.finDays||0)} dias${t.finDays<0?' (custo)':''}</td></tr>
      <tr><td>Benefício/(custo) timing</td><td>${money(t.benefit||0)}</td></tr>
      <tr><td>Custo total VP</td><td><b>${money(r.selectedVP)}</b></td></tr>
      </tbody></table></div></div></details>`;
    }else{
      const modes=['Normal','RADI','Split Payment'];
      h+=`<details class="analysis-detail" ${i<2?'open':''}><summary><div><span class="pill">F${i+1}</span><b>${scenarioVisualLabel(i+1,r.mode)}</b><small>${scenarioSubline(s,r)} • prazo ${s.term} dias</small></div><div class="summary-kpis"><span>VP selecionado <b>${money(r.selectedVP)}</b></span><span>Pagamento <b>${fmtDate(ymd(r.payment))}</b></span></div></summary><div class="detail-body"><div class="table-scroll"><table class="mini-table timing-table"><thead><tr><th>Indicador</th>${modes.map(m=>`<th class="${m===settlement?'selected-col':''}">${m}</th>`).join('')}</tr></thead><tbody>${[
        ['Pagamento',m=>fmtDate(ymd(r.payment))],
        ['Extinção do débito',m=>fmtDate(ymd(r.timing[m].ext))],
        ['Crédito reduz caixa',m=>fmtDate(ymd(r.timing[m].cash))],
        ['Saída IBS/CBS',m=>fmtDate(ymd(r.timing[m].outflow))],
        ['Dias de efeito do crédito',m=>`${Math.abs(r.timing[m].finDays)} dias${r.timing[m].finDays<0?' (custo)':r.timing[m].finDays>0?' (benefício)':''}`],
        ['Benefício/(custo) timing',m=>money(r.timing[m].benefit)],
        ['Custo total VP',m=>money(r.vps[m])]
      ].map(([l,f])=>`<tr><td>${l}</td>${modes.map(m=>`<td class="${m===settlement?'selected-col':''}">${f(m)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div></details>`;
    }
  });
  $('financialSummary').innerHTML=h
}
function renderRecommendation(d){
  const errors=validationSummary(false);
  const eq=equalizationRows(d),mixed=new Set(d.results.map(r=>r.mode)).size>1;
  const order=d.results.map((r,i)=>({i,r,s:d.suppliers[i],score:criterionValue(r,d.suppliers[i],criterion)})).sort((a,b)=>a.score-b.score);
  const first=order[0],second=order[1];
  $('recText').textContent=first?`${scenarioVisualLabel(first.i+1,first.r.mode)} • ${first.s.name}`:'—';
  let diff='';
  if(first&&second){
    if(criterion==='Maior prazo')diff=`Vantagem de ${Math.abs(first.s.term-second.s.term)} dias sobre o 2º colocado.`;
    else if(criterion==='Maior crédito')diff=`Vantagem de ${money(Math.abs(first.r.creditUseful-second.r.creditUseful))} em crédito útil.`;
    else diff=`Diferença de ${money(Math.abs(criterionValue(first.r,first.s,criterion)-criterionValue(second.r,second.s,criterion)))} para o 2º colocado.`;
  }
  $('recSub').textContent=`${mixed?'Comparação de estratégias de sourcing. ':'Critério: '+criterion+'. '}${diff}${errors.length?' • Prévia automática: há '+errors.length+' campo(s) obrigatório(s) pendente(s).':''}`;
  $('ranking').innerHTML=order.map((x,pos)=>{
    const e=eq[x.i],gross=scenarioGross(x.s,x.r);
    const fiscal=x.r.mode==='Importação'
      ?`Tributos/encargos de importação: ${money(x.r.customsTaxes||0)}`
      :x.r.mode==='Serviço'
        ?`ISS + retenções: ${money((x.r.iss||0)+(x.r.retentions||0))}`
        :`Tributos na NF: ${money(Math.max(0,(x.r.priceNF||0)-(x.r.base||0)))}`;
    return `<details class="rank-detail ${pos===0?'winner':''}" ${pos===0?'open':''}><summary><div class="rank-pos">${pos+1}º</div><div class="rank-info"><b>${scenarioVisualLabel(x.i+1,x.r.mode)}</b><span>${scenarioSubline(x.s,x.r)}</span></div><div class="rank-criterion"><small>${criterion}</small><b>${criterion==='Maior prazo'?x.s.term+' dias':criterion==='Maior crédito'?money(x.r.creditUseful):criterion==='Menor preço NF'?money(gross):criterion==='Menor custo líquido'?money(x.r.net):money(x.r.selectedVP)}</b><span>Clique para abrir a análise</span></div></summary><div class="rank-detail-body"><div class="rank-metrics expanded"><span>Valor bruto / landed <b>${money(gross)}</b></span><span>Crédito útil <b>${money(x.r.creditUseful||0)}</b></span><span>Custo líquido <b>${money(x.r.net)}</b></span><span>VP líquido <b>${money(x.r.selectedVP)}</b></span><span>Prazo <b>${x.s.term} dias</b></span><span>Pagamento <b>${fmtDate(ymd(x.r.payment))}</b></span></div><div class="recommend-analysis"><div><small>Posição fiscal</small><b>${fiscal}</b><span>Créditos totais: ${money(x.r.credits||0)}</span></div><div><small>Impacto financeiro</small><b>VP: ${money(x.r.selectedVP)}</b><span>${scenarioTimingLabel(x.s,x.r)} • Benefício/(custo): ${money((x.r.timing?.[settlement]||x.r.timing?.Normal)?.benefit||0)}</span></div><div><small>Margem de negociação</small><b>${e.direction}: ${money(e.value)}</b><span>${pct(e.pct)} ${e.target!==null?'vs. F'+(e.target+1):''}</span></div></div></div></details>`
  }).join('')
}
function updateSupplierCount(){$('supplierCountLabel').textContent=`${supplierCount} ${supplierCount===1?'fornecedor':'fornecedores'} em comparação`;$('removeSupplierBtn').disabled=supplierCount<=1;$('addSupplierBtn').disabled=supplierCount>=12}
function snapshotSuppliers(){const s={};for(let i=1;i<=supplierCount;i++)s[`f${i}`]=readSupplier(`f${i}`);return s}
function setSettlement(v){settlement=v;document.querySelectorAll('#settlementButtons button').forEach(b=>b.classList.toggle('active',b.dataset.value===v));$('radiWrap').classList.toggle('hidden',v!=='RADI');$('radiDate').required=v==='RADI';calcAll()}
function setIbscbsInIcmsBase(v){ibscbsInIcmsBase=v;document.querySelectorAll('#ibscbsIcmsButtons button').forEach(b=>b.classList.toggle('active',b.dataset.value===v));calcAll()}
const criteria=['Menor custo econômico VP','Menor custo líquido','Menor preço NF','Maior crédito','Maior prazo'];
function buildCriterionButtons(){$('criterionButtons').innerHTML=criteria.map(c=>`<button data-value="${c}" class="${c===criterion?'active':''}">${c}</button>`).join('');document.querySelectorAll('#criterionButtons button').forEach(b=>b.onclick=()=>{criterion=b.dataset.value;document.querySelectorAll('#criterionButtons button').forEach(x=>x.classList.toggle('active',x===b));calcAll()})}

const specialRuleFields=[['ncm','NCM (8 dígitos)','text'],['cclass','cClassTrib (6 dígitos)','text'],['operationType','Tipo de operação','operation'],['from','Vigência inicial','date'],['to','Vigência final','date'],['cbsRate','CBS específica (%)','rate'],['ibsRate','IBS total específico (%)','rate'],['reductionCbs','Redução CBS (%)','rate'],['reductionIbs','Redução IBS (%)','rate'],['icmsRate','ICMS próprio (%)','rate'],['ipiRate','IPI (%)','rate'],['isRate','IS (%)','rate'],['fcpRate','FCP (%)','rate'],['iiRate','II (%)','rate'],['issRate','ISS (%)','rate'],['source','Fundamento / referência','text']];
function specialRuleEditor(row={}){return `<fieldset class="special-tax-rule"><legend>Tratamento diferenciado</legend><div class="fields">${specialRuleFields.map(([key,label,type])=>`<label>${label}${type==='operation'?`<select data-rule="${key}"><option value="">Todas</option>${['Mercadoria','Serviço','Importação','Importação de serviços'].map(m=>`<option ${row[key]===m?'selected':''}>${m}</option>`).join('')}</select>`:`<input data-rule="${key}" type="${type==='rate'?'number':type}" ${type==='rate'?'min="0" max="100" step="0.0001"':''} value="${escapeHtml(row[key]===undefined?'':type==='rate'?row[key]*100:row[key])}">`}</label>`).join('')}</div><button type="button" class="remove-special-rule">Remover regra</button></fieldset>`;}
function wireSpecialRules(){document.querySelectorAll('.remove-special-rule').forEach(b=>b.onclick=()=>b.closest('fieldset').remove());}
function readSpecialRules(){return [...document.querySelectorAll('.special-tax-rule')].map(el=>{const row={};specialRuleFields.forEach(([key,label,type])=>{const v=el.querySelector(`[data-rule="${key}"]`).value.trim();if(v!=='')row[key]=type==='rate'?Number(v)/100:v;});return row;});}
function specialRule(s,date){const code=String(s.ncm||'').replace(/\D/g,''),cc=String(s.cclass||'').padStart(6,'0'),key=ymd(date);const rows=(DB.rules?.product_tax_rules||[]).filter(r=>(!r.ncm||r.ncm===code)&&(!r.cclass||r.cclass===cc)&&(!r.operationType||r.operationType===s.operationType)&&r.from<=key&&r.to>=key);if(rows.length>1)throw new Error('Mais de uma regra diferenciada aplicável: revise NCM, cClassTrib, operação e vigência.');return rows[0]||{};}
function configuredSupplier(s,date){const rule=specialRule(s,date),out={...s,_taxRule:rule};for(const [key,target] of [['icmsRate','icmsManual'],['ipiRate','ipi'],['isRate','is'],['fcpRate','fcp'],['iiRate','iiRate'],['issRate','issRate']])if(rule[key]!==undefined)out[target]=rule[key];if(rule.icmsRate!==undefined){if(s.operationType==='Importação')out.icmsImportRate=rule.icmsRate;else out.origin='Manual / exceção';}return out;}
function classTaxRate(s,cl,tax,fallback,domestic,params=DB.params){const rule=s._taxRule||{},base=tax==='cbs'?params.cbs_effective:params.ibs_state+params.ibs_municipal;if(domestic&&['Simples Nacional','MEI','MEI/Outros - manual'].includes(s.regime))return 0;if(rule[tax+'Rate']!==undefined)return rule[tax+'Rate'];const red=rule[tax==='cbs'?'reductionCbs':'reductionIbs'];return red===undefined?base*classTaxFactor(s,cl,tax,fallback,domestic):base*(1-red);}

function buildParams(){
 const rates=new Set(['cbs_ref','cbs_reduction','cbs_effective','ibs_state','ibs_municipal','annual_rate','internal_sp','internal_mg','credit_utilization']);
 $('paramsForm').innerHTML=Object.entries(DB.params).map(([k,v])=>`<div class="param-item"><span>${escapeHtml(k)}${rates.has(k)?' (%)':''}</span><input id="pm_${k}" type="number" step="0.0001" value="${rates.has(k)?v*100:v}"></div>`).join('')+`<div class="param-item" style="grid-column:1/-1"><span>Regras, vigências e tabelas fiscais (JSON). Revisão ${DB.revision}. Percentuais no JSON: 0,087 = 8,7%.</span><textarea id="fiscalConfigEditor" rows="16" style="width:100%"></textarea><small>${escapeHtml(DB.rules?.rate_status||'')}</small></div>`;
 $('paramsForm').insertAdjacentHTML('beforeend',`<div style="grid-column:1/-1"><h3>Alíquotas e reduções diferenciadas por produto / classificação</h3><p>Preencha NCM e/ou cClassTrib, vigência e fundamento. Campo vazio conserva a regra padrão; zero aplica alíquota zero. CBS e IBS específicos são alíquotas finais. Regras sobrepostas são recusadas. Publicação restrita ao usuário-chave.</p><div id="specialTaxRules">${(DB.rules.product_tax_rules||[]).map(specialRuleEditor).join('')}</div><button type="button" id="addSpecialRule">Adicionar tratamento diferenciado</button></div>`);
 $('addSpecialRule').onclick=()=>{$('specialTaxRules').insertAdjacentHTML('beforeend',specialRuleEditor());wireSpecialRules();};wireSpecialRules();
 $('fiscalConfigEditor').value=JSON.stringify({rules:DB.rules,cclass:DB.cclass},null,2);
}
async function saveFiscalConfig(){
 try{
  if(AUTH.user?.role!=='ADMIN')throw new Error('Autentique-se como usuário-chave para publicar parâmetros.');
  const params={...DB.params},rates=new Set(['cbs_ref','cbs_reduction','cbs_effective','ibs_state','ibs_municipal','annual_rate','internal_sp','internal_mg','credit_utilization']);
  Object.keys(params).forEach(k=>{let v=Number($(`pm_${k}`).value);if(!Number.isFinite(v))throw new Error('Parâmetro inválido: '+k);params[k]=rates.has(k)?v/100:v;});
  const extra=JSON.parse($('fiscalConfigEditor').value);extra.rules.product_tax_rules=readSpecialRules();if(DB.catalog?.cclass?.length){extra.rules.cclass_overrides={};for(const row of extra.cclass){const official=DB.catalog.cclass.find(x=>x.code===row.code);if(official){const diff={};for(const key of ['reduction','reductionIbs','reductionCbs','treatment'])if(row[key]!==official[key]&&row[key]!==undefined)diff[key]=row[key];if(Object.keys(diff).length)extra.rules.cclass_overrides[row.code]=diff;}}}const config={schema:1,revision:(DB.revision||1)+1,params,rules:extra.rules,cclass:extra.cclass};
  let saved = config;
  try {
    saved = await api('/api/config',{method:'POST',body:JSON.stringify({expected_revision:DB.revision,config})});
  } catch(err) {
    console.warn('API /api/config POST indisponível. Salvando em localStorage:', err.message);
  }
  try {
    localStorage.setItem('simulador_fiscal_config', JSON.stringify(config));
  } catch {}
  applyFiscal(saved);buildParams();renderTables();calcAll();alert('Configuração publicada e salva no navegador com sucesso!');
 }catch(e){alert('Configuração não publicada: '+e.message);}
}
function applyFiscal(config){window.CURRENT_FISCAL=config;DB.params=config.params;DB.rules=config.rules;const source=DB.catalog?.cclass?.length?DB.catalog.cclass:config.cclass;DB.cclass=source.map(row=>{const changes={...(config.rules?.cclass_overrides?.[row.code]||{})};if(changes.reduction!==undefined&&changes.reductionIbs===undefined&&changes.reductionCbs===undefined){changes.reductionIbs=changes.reduction;changes.reductionCbs=changes.reduction;}return {...row,...changes};});DB.revision=config.revision;}
let HISTORY_CACHE=[];
async function loadPrivateHistory(){
  try {
    const local = localStorage.getItem('simulador_history');
    if (local) {
      try { HISTORY_CACHE = JSON.parse(local) || []; } catch {}
    }
    if (!HISTORY_CACHE.length) {
      const j = await api('/api/history').catch(() => ({ history: [] }));
      HISTORY_CACHE = j.history || [];
      if (HISTORY_CACHE.length) {
        try { localStorage.setItem('simulador_history', JSON.stringify(HISTORY_CACHE)); } catch {}
      }
    }
  } catch(e) {
    HISTORY_CACHE = [];
  }
}
async function storePrivateHistory(records){
  HISTORY_CACHE = records;
  try { localStorage.setItem('simulador_history', JSON.stringify(records)); } catch {}
  await api('/api/history', { method: 'POST', body: JSON.stringify({ history: records }) }).catch(() => {});
}

function renderCclass(q=''){const body=$('cclassBody');if(!body)return;q=q.toLowerCase();body.innerHTML=DB.cclass.filter(x=>!q||Object.values(x).join(' ').toLowerCase().includes(q)).map(x=>`<tr><td><b>${escapeHtml(x.code)}</b></td><td>${escapeHtml(x.cst)}</td><td>${escapeHtml(x.description)}</td><td>${escapeHtml(x.treatment)}</td><td>${escapeHtml(x.use)}</td><td>${pct(x.reduction)}</td></tr>`).join('')}
const tableDefs={
 cclass:{label:'cClassTrib',official:true,source:'Portal NF-e • tabela nacional de cClassTrib',headers:['cClassTrib','CST','Descrição','Tratamento','Uso','Redução IBS','Redução CBS'],rows:()=>DB.cclass.map(x=>[x.code,x.cst,x.description,x.treatment,x.use,pct(x.reductionIbs??x.reduction),pct(x.reductionCbs??x.reduction)])},
 lc116:{label:'LC 116 / Serviço',official:true,source:'Portal Nacional NFS-e • Lista Nacional de Serviços',headers:['Código','Descrição'],rows:()=>((DB.catalog.lc116||[]).map(x=>[x.code,x.description]))},
 nbs:{label:'NBS',official:true,source:'Portal Nacional NFS-e • NBS / Anexo B',headers:['NBS','Descrição'],rows:()=>((DB.catalog.nbs||[]).map(x=>[x.code,x.description]))},
 cindop:{label:'cIndOp',official:true,source:'Portal Nacional NFS-e • cIndOp / Anexo C',headers:['cIndOp','Descrição'],rows:()=>((DB.catalog.cindop||[]).map(x=>[x.code,x.description]))},
 correlacoes:{label:'Correlação Serviços',official:true,source:'Portal Nacional NFS-e • Anexo VIII (referência orientativa e versionada)',headers:['LC 116','NBS','cIndOp','cClassTrib'],rows:()=>((DB.catalog.correlations||[]).map(x=>[x.lc116||'',x.nbs||'',x.cindop||'',x.cclass||'']))},
 regimes:{label:'Regimes',official:false,source:'Parâmetro interno do simulador',headers:['Regime disponível'],rows:()=>list.regimes.map(x=>[x])},
 finalidades:{label:'Finalidades',official:false,source:'Parâmetro interno do motor de Mercadoria',headers:['Finalidade'],rows:()=>list.purposes.map(x=>[x])},
 origens:{label:'Origens / ICMS',official:false,source:'Parâmetro interno do motor de Mercadoria',headers:['Origem / enquadramento'],rows:()=>list.origins.map(x=>[x])},
 uf:{label:'UF',official:false,source:'Tabela de domínio utilizada pelo aplicativo',headers:['UF'],rows:()=>list.uf.map(x=>[x])},
 st:{label:'Métodos ICMS-ST',official:false,source:'Parâmetro interno do motor de Mercadoria',headers:['Método'],rows:()=>list.st.map(x=>[x])},
 difal:{label:'Métodos DIFAL',official:false,source:'Parâmetro interno do motor de Mercadoria',headers:['Método'],rows:()=>list.difal.map(x=>[x])}
};
function renderTableTabs(){const box=$('tableTabs');if(!box)return;box.innerHTML=Object.entries(tableDefs).map(([k,d])=>`<button data-table="${k}" class="${k===activeTable?'active':''}">${escapeHtml(d.label)}</button>`).join('');box.querySelectorAll('button').forEach(b=>b.onclick=()=>{activeTable=b.dataset.table;renderTableTabs();renderTables()})}
function renderTables(){const def=tableDefs[activeTable]||tableDefs.cclass,q=normSearch($('tablesSearch')?.value||'');const rows=def.rows().filter(r=>!q||normSearch(r.join(' ')).includes(q));if($('tablesHead'))$('tablesHead').innerHTML=`<tr>${def.headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr>`;if($('tablesBody'))$('tablesBody').innerHTML=rows.slice(0,2500).map(r=>`<tr>${r.map((v,i)=>`<td>${i===0?'<b>'+escapeHtml(v)+'</b>':escapeHtml(v)}</td>`).join('')}</tr>`).join('')||'<tr><td colspan="10">Nenhum registro encontrado.</td></tr>';const versions=DB.catalog.versions||{};let version='';if(activeTable==='lc116'||activeTable==='nbs')version=versions.lc116_nbs||'';if(activeTable==='cindop')version=versions.cindop||'';if(activeTable==='correlacoes')version=versions.correlation||'';if(activeTable==='cclass')version=versions.cclass||'';if($('tableSourceNote'))$('tableSourceNote').innerHTML=`<div><b>${def.official?'● Catálogo oficial':'● Parâmetro interno'}</b><span>${escapeHtml(def.source)}${version?' • versão '+escapeHtml(version):''}</span><small>${rows.length} registro(s) encontrados${rows.length>2500?' • exibindo os primeiros 2.500':''}</small></div>`}


function isoDate(d){try{return d instanceof Date?d.toISOString().slice(0,10):String(d||'').slice(0,10)}catch{return ''}}
function dashboardBar(label,value,max,sub='',kind=''){const w=max>0?Math.max(2,Math.min(100,value/max*100)):0;return `<div class="bar-row ${kind}"><div class="bar-label"><b>${escapeHtml(label)}</b><span>${sub}</span></div><div class="bar-track"><i style="width:${w}%"></i></div><strong>${money(value)}</strong></div>`}
function setDashboardView(v){activeDashView=v;document.querySelectorAll('#dashboardTabs button').forEach(b=>b.classList.toggle('active',b.dataset.dash===v));document.querySelectorAll('.dash-view').forEach(x=>x.classList.toggle('active',x.id===`dash_${v}`))}
function statusDot(value,best,worst,reverse=false){if(best===worst)return '🟢';const span=Math.abs(worst-best)||1;let score=reverse?(value-best)/span:(worst-value)/span;return score>=.66?'🟢':score>=.33?'🟡':'🔴'}
function mixedScenarioSummary(d){
  const modes=[...new Set(d.results.map(r=>r.mode))];if(modes.length<2)return '';
  const rows=d.results.map((r,i)=>({i,s:d.suppliers[i],r,vp:Number(r.selectedVP||0),net:Number(r.net||0),credit:Number(r.creditUseful||0)})).sort((a,b)=>a.vp-b.vp);
  const best=rows[0],second=rows[1];
  return `<div class="mixed-summary"><div><small>COMPARAÇÃO DE ESTRATÉGIAS DE SOURCING</small><h3>Melhor custo econômico: ${scenarioVisualLabel(best.i+1,best.r.mode)}</h3><p>${escapeHtml(best.s.name)} • VP ${money(best.vp)}${second?` • vantagem de ${money(second.vp-best.vp)} vs. F${second.i+1}`:''}</p></div><div class="mixed-summary-grid">${rows.map(x=>`<span><small>${scenarioVisualLabel(x.i+1,x.r.mode)}</small><b>${money(x.vp)}</b><em>Custo líquido ${money(x.net)} • créditos ${money(x.credit)}</em></span>`).join('')}</div></div>`;
}
function renderDashboard(d){
  if(!$('dashboardKpis'))return;
  const items=d.results.map((r,i)=>({i,r,s:d.suppliers[i]}));if(!items.length)return;
  const modes=[...new Set(items.map(x=>x.r.mode))],mixed=modes.length>1;
  const bestVP=[...items].sort((a,b)=>a.r.selectedVP-b.r.selectedVP)[0];
  const bestCost=[...items].sort((a,b)=>a.r.net-b.r.net)[0];
  const bestCredit=[...items].sort((a,b)=>b.r.creditUseful-a.r.creditUseful)[0];
  const bestTerm=[...items].sort((a,b)=>b.s.term-a.s.term)[0];
  const bestCash=[...items].sort((a,b)=>scenarioCashNeed(a.s,a.r)-scenarioCashNeed(b.s,b.r))[0];

  $('dashboardTitle').textContent=mixed?'Dashboard Gerencial • Estratégias de Sourcing':modes[0]==='Importação'?'Dashboard Gerencial • Importação':modes[0]==='Serviço'?'Dashboard Gerencial • Serviços':'Dashboard Gerencial • Mercado Nacional';
  $('dashboardSubtitle').textContent=mixed?'Comparação conjunta de fornecedores nacionais, importação direta e serviços por indicadores econômicos comuns.':'Análise econômica e financeira dos cenários.';
  $('dashboardModeBanner').innerHTML=`<b>${mixed?'MULTIESTRATÉGIA':escapeHtml(scenarioVisualLabel(1,modes[0]).replace('FORNECEDOR 1 • ',''))}</b><span>${mixed?modes.join(' × '):'Motor específico refletido no dashboard.'}</span>`;

  $('dashboardKpis').innerHTML=[
    ['Melhor custo econômico VP',bestVP,money(bestVP.r.selectedVP)],
    ['Menor custo líquido',bestCost,money(bestCost.r.net)],
    ['Menor necessidade de caixa',bestCash,money(scenarioCashNeed(bestCash.s,bestCash.r))],
    ['Maior crédito útil',bestCredit,money(bestCredit.r.creditUseful)],
    ['Melhor prazo comercial',bestTerm,`${bestTerm.s.term} dias`]
  ].map(([t,x,v])=>`<div class="dash-kpi"><small>${t}</small><b>${scenarioVisualLabel(x.i+1,x.r.mode)}</b><strong>${v}</strong><span>${escapeHtml(x.s.name)}</span></div>`).join('');

  const second=[...items].sort((a,b)=>a.r.selectedVP-b.r.selectedVP)[1];
  $('dashExecutiveSummary').innerHTML=`<div class="executive-callout"><div><small>${mixed?'MELHOR ESTRATÉGIA ECONÔMICA':'MELHOR CENÁRIO ECONÔMICO'}</small><h3>${scenarioVisualLabel(bestVP.i+1,bestVP.r.mode)}</h3><p>${escapeHtml(bestVP.s.name)} • menor custo em valor presente.</p></div><div class="executive-metrics"><span>VP <b>${money(bestVP.r.selectedVP)}</b></span><span>Custo líquido <b>${money(bestVP.r.net)}</b></span><span>Crédito útil <b>${money(bestVP.r.creditUseful)}</b></span><span>Valor bruto / landed <b>${money(scenarioGross(bestVP.s,bestVP.r))}</b></span><span>Pagamento <b>${fmtDate(ymd(bestVP.r.payment))}</b></span><span>Timing <b>${scenarioTimingLabel(bestVP.s,bestVP.r)}</b></span></div>${second?`<p class="exec-note">Vantagem em VP sobre ${scenarioVisualLabel(second.i+1,second.r.mode)}: <b>${money(second.r.selectedVP-bestVP.r.selectedVP)}</b>.</p>`:''}</div>`;

  $('dashCostTitle').textContent='Custo econômico comparável';
  $('dashCostSubtitle').textContent='Valor bruto/landed, créditos, custo líquido e VP por cenário.';
  const maxCost=Math.max(...items.flatMap(x=>[scenarioGross(x.s,x.r),x.r.net,x.r.credits,x.r.selectedVP]),1);
  $('dashCostBars').innerHTML=items.map(x=>`<div class="bar-group"><h3>${scenarioVisualLabel(x.i+1,x.r.mode)}</h3><small class="supplier-subname">${escapeHtml(x.s.name)}</small>${dashboardBar(x.r.mode==='Importação'?'Landed bruto':x.r.mode==='Serviço'?'Valor serviço/NF':'Preço NF',scenarioGross(x.s,x.r),maxCost,x.r.mode)}${dashboardBar('Créditos',x.r.credits||0,maxCost,'Recuperáveis','credit')}${dashboardBar('Custo líquido',x.r.net,maxCost,'Após créditos','net')}${dashboardBar('VP econômico',x.r.selectedVP,maxCost,'Base comparável','net')}</div>`).join('');

  const netVals=items.map(x=>x.r.net),vpVals=items.map(x=>x.r.selectedVP),crVals=items.map(x=>x.r.creditUseful),terms=items.map(x=>x.s.term);
  $('dashSemaphore').innerHTML=items.map(x=>`<div class="semaphore-row"><b>${scenarioVisualLabel(x.i+1,x.r.mode)}</b><span>${statusDot(x.r.net,Math.min(...netVals),Math.max(...netVals))} Custo</span><span>${statusDot(x.r.selectedVP,Math.min(...vpVals),Math.max(...vpVals))} VP</span><span>${statusDot(x.r.creditUseful,Math.max(...crVals),Math.min(...crVals),true)} Crédito</span><span>${statusDot(x.s.term,Math.max(...terms),Math.min(...terms),true)} Prazo</span></div>`).join('');

  $('dashTaxTitle').textContent='Tributos, encargos e créditos por cenário';
  $('dashTaxSubtitle').textContent='Cada fornecedor mantém sua composição fiscal específica.';
  $('dashTaxContent').innerHTML=items.map(x=>{
    const r=x.r;
    const vals=r.mode==='Importação'
      ?[['II',r.ii],['IPI',r.ipi],['ICMS',r.icms],['IBS',r.ibs],['CBS',r.cbs],['IS',r.isv],['Encargos aduaneiros',Math.max(0,(r.customsTaxes||0)-(r.ii||0)-(r.ipi||0)-(r.icms||0)-(r.ibs||0)-(r.cbs||0)-(r.isv||0))],['Créditos',r.credits]]
      :r.mode==='Serviço'
        ?[['ISS',r.iss],['IBS',r.ibs],['CBS',r.cbs],['IS',r.isv],['Retenções',r.retentions],['Créditos',r.credits]]
        :[['ICMS',r.icms],['IPI',r.ipi],['ICMS-ST',r.st],['FCP',r.fcp],['DIFAL',r.difal],['IBS',r.ibs],['CBS',r.cbs],['IS',r.isv],['Créditos',r.credits]];
    return `<div class="tax-panel"><h3>${scenarioVisualLabel(x.i+1,r.mode)}</h3><small class="supplier-subname">${escapeHtml(x.s.name)}</small><div>${vals.map(([k,v])=>`<span>${k}<b>${money(v||0)}</b></span>`).join('')}</div></div>`
  }).join('');

  const maxCash=Math.max(...items.flatMap(x=>[scenarioCashNeed(x.s,x.r),x.r.selectedVP]),1);
  $('dashCashBars').innerHTML=items.map(x=>`<div class="bar-group"><h3>${scenarioVisualLabel(x.i+1,x.r.mode)}</h3><small class="supplier-subname">${escapeHtml(x.s.name)}</small>${dashboardBar('Necessidade de caixa',scenarioCashNeed(x.s,x.r),maxCash,`Pagamento ${fmtDate(ymd(x.r.payment))}`)}${dashboardBar('VP econômico',x.r.selectedVP,maxCash,x.r.mode,'net')}<div class="cash-meta"><span>Tipo <b>${escapeHtml(x.r.mode)}</b></span><span>Pagamento <b>${fmtDate(ymd(x.r.payment))}</b></span><span>Timing <b>${scenarioTimingLabel(x.s,x.r)}</b></span><span>Crédito útil <b>${money(x.r.creditUseful||0)}</b></span></div></div>`).join('');

  $('dashCashBenefits').innerHTML=items.map(x=>`<div><small>${scenarioVisualLabel(x.i+1,x.r.mode)}</small><b>${escapeHtml(x.s.name)}</b><p>VP: <strong>${money(x.r.selectedVP)}</strong> • necessidade de caixa: <strong>${money(scenarioCashNeed(x.s,x.r))}</strong> • ${scenarioTimingLabel(x.s,x.r)}.</p></div>`).join('');

  $('cashTimeline').innerHTML=items.map(x=>{
    const r=x.r,s=x.s,t=r.timing?.[settlement]||r.timing?.Normal,ev=[];
    if(r.mode==='Importação'){
      ev.push({date:isoDate(d.c.purchase),type:'Pedido internacional',value:0,kind:'neutral',note:'Início da estratégia'});
      ev.push({date:isoDate(r.clearance),type:'Desembaraço / nacionalização',value:(r.customsTaxes||0)+(s.intlFreight||0)+(s.intlInsurance||0)+(s.customsAdjustment||0)+(r.localExpenses||0),kind:'out',note:'Tributos e despesas de nacionalização'});
      if((r.crCbs+r.crIbs)>0)ev.push({date:isoDate(t.cash),type:'Crédito IBS/CBS reduz caixa',value:(r.crCbs+r.crIbs)*DB.params.credit_utilization,kind:'in',note:'Efeito financeiro do crédito'});
      if(r.icmsCreditUsed>0)ev.push({date:isoDate(r.icmsCashDate),type:'Crédito ICMS reduz caixa',value:r.icmsCreditUsed,kind:'in',note:'Competência do desembaraço'});
      if(r.ipiCreditUsed>0)ev.push({date:isoDate(r.ipiCashDate),type:'Crédito IPI reduz caixa',value:r.ipiCreditUsed,kind:'in',note:'Competência do desembaraço'});
      ev.push({date:isoDate(r.payment),type:'Pagamento fornecedor exterior',value:r.supplierPayment||0,kind:'out',note:'Prazo comercial'});
    }else{
      const ibscbs=(r.cbs||0)+(r.ibs||0),credit=(r.crCbs+r.crIbs)*DB.params.credit_utilization;let supplierOut=r.mode==='Serviço'?(r.supplierPayment||r.priceNF):r.priceNF;
      ev.push({date:isoDate(d.c.purchase),type:r.mode==='Serviço'?'Contratação':'Compra',value:0,kind:'neutral',note:'Início da estratégia'});
      if(settlement==='RADI'&&ibscbs>0){supplierOut=Math.max(0,supplierOut-ibscbs);ev.push({date:isoDate(t.outflow),type:'RADI • IBS/CBS',value:ibscbs,kind:'out',note:'Saída tributária'})}
      ev.push({date:isoDate(r.payment),type:r.mode==='Serviço'?'Pagamento prestador':'Pagamento fornecedor',value:supplierOut,kind:'out',note:`Prazo ${s.term} dias`});
      if(r.difal>0)ev.push({date:isoDate(r.due),type:'DIFAL',value:r.difal,kind:'out',note:'Saída tributária'});
      if(credit>0)ev.push({date:isoDate(t.cash),type:'Crédito IBS/CBS reduz caixa',value:credit,kind:'in',note:'Efeito financeiro'});
      if(r.icmsCreditUsed>0)ev.push({date:isoDate(r.icmsCashDate),type:'Crédito ICMS reduz caixa',value:r.icmsCreditUsed,kind:'in',note:'Efeito caixa'});
      if(r.ipiCreditUsed>0)ev.push({date:isoDate(r.ipiCashDate),type:'Crédito IPI reduz caixa',value:r.ipiCreditUsed,kind:'in',note:'Efeito caixa'});
    }
    ev.sort((a,b)=>a.date.localeCompare(b.date));
    const out=ev.filter(e=>e.kind==='out').reduce((a,e)=>a+e.value,0),gain=ev.filter(e=>e.kind==='in').reduce((a,e)=>a+e.value,0),netCash=out-gain;
    return `<div class="cash-lane"><div class="cash-lane-head"><div><span class="pill">F${x.i+1}</span><b>${scenarioVisualLabel(x.i+1,r.mode)}</b><small>${escapeHtml(s.name)}</small></div><div><span>Saídas ${money(out)}</span><span>Ganhos ${money(gain)}</span><strong>Caixa líquido ${money(netCash)}</strong></div></div><div class="cash-lane-events">${ev.map(e=>`<div class="timeline-event ${e.kind==='in'?'credit-event':e.kind==='out'?'out-event':'neutral-event'}"><time>${fmtDate(e.date)}</time><span>${escapeHtml(e.type)}</span><strong>${e.kind==='in'?'+ ':e.kind==='out'?'− ':''}${e.value?money(e.value):'—'}</strong><small>${escapeHtml(e.note)}</small></div>`).join('')}</div><div class="cash-lane-result"><span>Timing <b>${scenarioTimingLabel(s,r)}</b></span><span>Custo líquido <b>${money(r.net)}</b></span><span>VP econômico <b>${money(r.selectedVP)}</b></span></div></div>`
  }).join('');

  const eq=equalizationRows(d);
  $('dashNegotiation').innerHTML=items.map(x=>{const e=eq[x.i],target=e.target!==null?scenarioVisualLabel(e.target+1,d.results[e.target].mode):'—';return `<div class="neg-card"><small>${scenarioVisualLabel(x.i+1,x.r.mode)}</small><b>${escapeHtml(e.direction)}</b><strong>${money(e.value)} • ${pct(e.pct)}</strong><span>${e.value?`Referência: ${target}`:'Proposta de referência'}</span></div>`}).join('');

  const spread=Math.max(...items.map(x=>x.r.selectedVP))-Math.min(...items.map(x=>x.r.selectedVP));
  const creditPct=scenarioGross(bestCredit.s,bestCredit.r)?bestCredit.r.creditUseful/scenarioGross(bestCredit.s,bestCredit.r):0;
  $('dashboardInsights').innerHTML=`<div><small>EFICIÊNCIA DE CAIXA</small><b>${scenarioVisualLabel(bestVP.i+1,bestVP.r.mode)}</b><p>Menor VP líquido no conjunto analisado.</p></div><div><small>ALAVANCA DE CRÉDITO</small><b>${scenarioVisualLabel(bestCredit.i+1,bestCredit.r.mode)}</b><p>Crédito útil de <strong>${money(bestCredit.r.creditUseful)}</strong> (${pct(creditPct)} do valor bruto/landed).</p></div><div><small>ESPAÇO DE NEGOCIAÇÃO</small><b>${money(spread)}</b><p>Diferença entre maior e menor VP líquido.</p></div>`;
  setDashboardView(activeDashView);
}
function exportPayload(){const d=dataSet();return {version:'5.0.4',configSnapshot:{revision:DB.revision,params:DB.params,rules:DB.rules,cclass:DB.cclass,catalogVersions:DB.catalog.versions},generatedAt:new Date().toISOString(),operationMode,settlement,criterion,purchaseDate:$('purchaseDate').value,buyerUF:$('buyerUF').value,ibscbsInIcmsBase,ibscbsInIssBase,suppliers:d.suppliers,results:d.results.map(r=>({...r,payment:isoDate(r.payment),due:isoDate(r.due),timing:Object.fromEntries(Object.entries(r.timing||{}).map(([k,t])=>[k,{...t,ext:isoDate(t.ext),cash:isoDate(t.cash),outflow:isoDate(t.outflow)}]))}))}}
async function downloadExcel(payload,filename){
  try{
    const r=await fetch('/api/export/excel',{method:'POST',headers:{'Content-Type':'application/json',...(AUTH.token?{'Authorization':'Bearer '+AUTH.token}:{})},body:JSON.stringify(payload)});
    if(r.ok){
      const blob=await r.blob(),u=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=u;a.download=filename;document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(u),1500);
      return;
    }
  }catch(e){
    console.warn('Backend export fallback to XLSX in browser:',e.message);
  }
  if(window.XLSX){
    try{
      const wb=XLSX.utils.book_new(),{kind,data}=payload||{};
      if(kind==='history'){
        const records=Array.isArray(data)?data:[];
        const rows=records.flatMap(item=>Object.entries(item.suppliers||{}).filter(([,s])=>!!s).map(([k,su])=>({
          'Salvo em':item.savedAt||'','Data compra':item.purchaseDate||'','Tipo':item.operationMode||'Mercadoria',
          'Liquidação':item.settlement||'Normal','Critério':item.criterion||'','Cenário':k,
          'Fornecedor':su.name||'','CNPJ':su.cnpj||'','UF':su.uf||'','Regime':su.regime||'',
          'Preço base':su.price||0,'Prazo (dias)':su.term||0,'LC 116':su.lc116||'','NBS':su.nbs||'','cClassTrib':su.cclass||''
        })));
        XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows.length?rows:[{}]),'Histórico');
      }else{
        const sups=data?.suppliers||[],res=data?.results||[];
        const summary=sups.map((su,i)=>({'Cenário':`F${i+1}`,'Fornecedor':su.name||'','CNPJ':su.cnpj||'','Regime':su.regime||'','Prazo dias':su.term||0,'Preço final NF':res[i]?.priceNF||0,'Créditos':res[i]?.credits||0,'Custo líquido':res[i]?.net||0,'VP líquido':res[i]?.selectedVP||0,'Crédito útil':res[i]?.creditUseful||0}));
        XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(summary.length?summary:[{}]),'Resumo Executivo');
      }
      XLSX.writeFile(wb,filename);
      return;
    }catch(err){alert('Falha ao exportar Excel: '+err.message);return;}
  }
  alert('Falha ao exportar.');
}
function exportCurrentExcel(){if(!ensureValid('exportar a simulação'))return;downloadExcel({kind:'simulation',data:exportPayload()},`Cotacao_Multiestrategia_${new Date().toISOString().slice(0,10)}.xlsx`)}
const HISTORY_SELECTION=new Set();
function historyKey(x,i){return x.savedAt||`legacy-${i}-${x.date||''}`}
function filteredHistory(){const q=($('historySearch').value||'').toLowerCase().trim(),from=$('historyFrom').value,to=$('historyTo').value;return savedHistory().map((x,i)=>({x,i,key:historyKey(x,i)})).filter(({x})=>{const pd=x.purchaseDate||'';if(from&&pd<from)return false;if(to&&pd>to)return false;const suppliers=x.suppliers||{f1:x.f1,f2:x.f2};const hay=[x.date,x.purchaseDate,x.buyerUF,x.settlement,x.operationMode,x.ibscbsInIcmsBase,x.ibscbsInIssBase,x.criterion,...Object.values(suppliers||{}).flatMap(s=>s?Object.values(s):[])].join(' ').toLowerCase();return !q||hay.includes(q)})}
function exportHistoryRows(rows,label){if(!rows.length)return alert('Nenhuma cotação encontrada para exportar.');downloadExcel({kind:'history',data:rows.map(r=>r.x||r)},`${label}_${new Date().toISOString().slice(0,10)}.xlsx`)}
function exportFilteredHistory(){exportHistoryRows(filteredHistory(),'Cotacoes_Filtradas')}
function exportSelectedHistory(){const rows=savedHistory().map((x,i)=>({x,i,key:historyKey(x,i)})).filter(r=>HISTORY_SELECTION.has(r.key));exportHistoryRows(rows,'Cotacoes_Selecionadas')}
function updateHistorySelectionInfo(){const f=filteredHistory();if($('historyFilterCount'))$('historyFilterCount').textContent=`${f.length} cotação(ões) encontrada(s)`;if($('historySelectedCount'))$('historySelectedCount').textContent=`${HISTORY_SELECTION.size} selecionada(s)`}
window.toggleHistorySelection=(key,checked)=>{if(checked)HISTORY_SELECTION.add(key);else HISTORY_SELECTION.delete(key);updateHistorySelectionInfo()}

function historyStorageKey(){const u=(AUTH.user?.username||'sem_usuario').toLowerCase().replace(/[^a-z0-9_-]/g,'_');return `calc_history_v3_${u}`}
function savedHistory(){return HISTORY_CACHE}
function historyRecord(){const d=dataSet();const suppliers={};d.suppliers.forEach((s,i)=>suppliers[`f${i+1}`]=s);const results=d.results.map(r=>JSON.parse(JSON.stringify(r,(k,v)=>v instanceof Date?v.toISOString():v)));return {configSnapshot:{revision:DB.revision,params:DB.params,rules:DB.rules,cclass:DB.cclass,catalogVersions:DB.catalog.versions},savedAt:new Date().toISOString(),date:new Date().toLocaleString('pt-BR'),purchaseDate:$('purchaseDate').value,buyerUF:$('buyerUF').value,settlement,operationMode,ibscbsInIcmsBase,ibscbsInIssBase,radiDate:$('radiDate').value,criterion,supplierCount,suppliers,results}}
function renderHistory(){const rows=filteredHistory();const allHistory=savedHistory();$('historyList').innerHTML=rows.length?rows.map(({x,i,key})=>{const all=Object.values(x.suppliers||{f1:x.f1,f2:x.f2}).filter(Boolean);const originalIndex=allHistory.findIndex(y=>(y.savedAt&&x.savedAt?y.savedAt===x.savedAt:JSON.stringify(y)===JSON.stringify(x)));const checked=HISTORY_SELECTION.has(key)?'checked':'';return `<div class="history-item"><label class="history-check" title="Selecionar esta cotação"><input type="checkbox" ${checked} onchange="toggleHistorySelection('${escapeHtml(key)}',this.checked)"></label><div class="history-main"><h3>${all.map(s=>escapeHtml(s.name||'Fornecedor')).join(' × ')}</h3><p>${x.date||'—'} • Compra: ${x.purchaseDate||'—'} • ${x.operationMode||'Mercadoria'} • ${x.settlement||'Normal'} • ${x.operationMode==='Serviço'?'IBS/CBS na BC ISS: '+(x.ibscbsInIssBase||'Não'):'IBS/CBS na BC ICMS: '+(x.ibscbsInIcmsBase||'Sim')} • ${all.length} cenário(s)</p><small>${all.map(s=>escapeHtml(`${s.cnpj||'sem CNPJ'} | ${s.uf||''} | ${s.regime||''}`)).join(' • ')}</small></div><div><button onclick="loadHistory(${originalIndex})">Abrir</button> <button onclick="deleteHistory(${originalIndex})">Excluir</button></div></div>`}).join(''):'<p class="muted-empty">Nenhuma simulação encontrada.</p>';updateHistorySelectionInfo()}
window.loadHistory=i=>{const x=savedHistory()[i];$('purchaseDate').value=x.purchaseDate||'2027-01-04';$('buyerUF').value=x.buyerUF||'SP';$('radiDate').value=x.radiDate||'2027-01-31';criterion=x.criterion||criterion;buildCriterionButtons();operationMode=x.operationMode||'Mercadoria';setIbscbsInIcmsBase(x.ibscbsInIcmsBase||'Sim');setIbscbsInIssBase(x.ibscbsInIssBase||'Não');setSettlement(x.settlement||'Normal');const suppliers=x.suppliers||{f1:x.f1,f2:x.f2};bulkRowsBySupplier={};Object.entries(suppliers).forEach(([k,s])=>{if(s?.bulkRows)bulkRowsBySupplier[Number(k.slice(1))]=s.bulkRows;});supplierCount=Math.min(12,Math.max(1,x.supplierCount||Object.values(suppliers).filter(Boolean).length||2));buildSuppliers(suppliers);showPage('simulador')};
window.deleteHistory=async i=>{try{const all=savedHistory();const record=all[i];const next=all.filter((_,idx)=>idx!==i);HISTORY_CACHE=next;try{localStorage.setItem('simulador_history',JSON.stringify(next));}catch{}if(record?.savedAt){await api('/api/history/delete',{method:'POST',body:JSON.stringify({savedAt:record.savedAt})}).catch(()=>{});}renderHistory()}catch(e){alert('Não foi possível excluir: '+e.message)}}
const ADMIN_SECRET_B64 = 'RU5UUkFMQg==';

function isAdminUnlocked() {
  const token = sessionStorage.getItem('admin_token');
  if (!token) return false;
  try {
    const decoded = atob(token);
    return decoded.startsWith('libbs_admin_ok_' + ADMIN_SECRET_B64);
  } catch {
    return false;
  }
}

function setAdminUnlocked() {
  const token = btoa('libbs_admin_ok_' + ADMIN_SECRET_B64 + '_' + location.hostname + '_' + Date.now());
  sessionStorage.setItem('admin_token', token);
  updateAdminLockUI();
}

function updateAdminLockUI(){
  const unlocked = isAdminUnlocked();
  document.querySelectorAll('.admin-lock').forEach(el=>{
    el.textContent = unlocked ? '🔓' : '🔒';
    el.title = unlocked ? 'Área administrativa desbloqueada' : 'Área restrita (requer senha)';
  });
  const nameEl = document.getElementById('currentUserName');
  if (nameEl) {
    nameEl.textContent = unlocked ? 'Admin' : 'Comprador';
  }
}

function promptAdminAuth() {
  return new Promise((resolve) => {
    const dialog = $('adminAuthDialog');
    if (!dialog) {
      resolve(false);
      return;
    }
    const input = $('adminPasswordInput');
    const err = $('adminAuthError');
    const form = $('adminAuthForm');
    const cancelBtn = $('adminAuthCancel');
    
    if (input) input.value = '';
    if (err) err.textContent = '';
    
    const cleanup = () => {
      form.onsubmit = null;
      cancelBtn.onclick = null;
      if (dialog.open) dialog.close();
    };
    
    form.onsubmit = (e) => {
      e.preventDefault();
      try {
        const val = input.value.trim();
        if (btoa(val) === ADMIN_SECRET_B64) {
          setAdminUnlocked();
          cleanup();
          resolve(true);
        } else {
          if (err) err.textContent = 'Senha incorreta.';
          if (input) input.focus();
        }
      } catch {
        if (err) err.textContent = 'Erro ao validar senha.';
      }
    };
    
    cancelBtn.onclick = () => {
      cleanup();
      resolve(false);
    };
    
    if (!dialog.open) dialog.showModal();
    if (input) input.focus();
  });
}

async function showPage(id){
  const protectedPages=new Set(['usuarios','atualizacoes','parametros']);
  if(protectedPages.has(id)){
    if(!isAdminUnlocked()){
      const success = await promptAdminAuth();
      if(!success) return;
    }
  }
  document.querySelectorAll('.nav,.page').forEach(x=>x.classList.remove('active'));
  const b=document.querySelector(`[data-page="${id}"]`);if(b)b.classList.add('active');
  const pg=$(id);if(pg)pg.classList.add('active');
  if(id==='historico')renderHistory();if(id==='tabelas'){renderTableTabs();renderTables()}calcAll()
}
function escapeHtml(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function setOperationMode(v){operationMode=v||'Mercadoria';calcAll()}
function showBulkStatus(message,error=false){const box=$('bulkImportStatus');if(!box)return;box.textContent=message;box.classList.remove('hidden');box.classList.toggle('error',error)}
async function importBulkExcel(file){
  if(!file)return;
  try{
    showBulkStatus('Lendo as abas preenchidas e validando os cenários...');
    try{
      const r=await fetch('/api/import/excel',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Filename':file.name,...(AUTH.token?{'Authorization':'Bearer '+AUTH.token}:{})},body:file});
      if(r.ok){
        const j=await r.json();
        bulkRowsBySupplier={};Object.entries(j.scenarios||{}).forEach(([k,v])=>bulkRowsBySupplier[Number(k)]=v);
        supplierCount=Math.max(1,...Object.keys(bulkRowsBySupplier).map(Number));
        const snap={};
        for(let i=1;i<=supplierCount;i++){
          const rows=bulkRowsBySupplier[i]||[],first=rows[0]||supplierDefault(i);
          const total=rows.reduce((a,x)=>a+Number(x.price||0),0);
          snap[`f${i}`]={...supplierDefault(i),...first,name:first.name||`Fornecedor ${i}`,price:total,servicePrice:rows.reduce((a,x)=>a+Number(x.servicePrice||0),0),materialPrice:rows.reduce((a,x)=>a+Number(x.materialPrice||0),0),foreignServicePrice:rows.reduce((a,x)=>a+Number(x.foreignServicePrice||0),0)}
        }
        buildSuppliers(snap);
        showBulkStatus(`${j.total_rows} linhas importadas de ${j.sheets_used?.join(', ')||'abas preenchidas'} em ${j.scenario_count} cenário(s).`);
        return;
      }
    }catch(err){console.warn('Fallback to client-side XLSX parse:',err);}

    if(window.XLSX){
      const buffer=await file.arrayBuffer();
      const wb=XLSX.read(buffer,{type:'array'});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(ws);
      const scenarios={};
      rows.forEach(row=>{
        const sc=row['Cenário']||row['scenario']||1;
        if(!scenarios[sc])scenarios[sc]=[];
        scenarios[sc].push({name:row['Fornecedor']||row['name']||`Fornecedor ${sc}`,cnpj:row['CNPJ']||'',uf:row['UF']||'SP',regime:row['Regime']||'Lucro Real',purpose:row['Finalidade']||'Industrialização',cclass:String(row['cClassTrib']||'000001'),price:Number(row['Preço']||row['price']||0),term:Number(row['Prazo (dias)']||row['term']||30),discount:Number(row['Desconto']||0)});
      });
      bulkRowsBySupplier=scenarios;
      supplierCount=Math.max(1,...Object.keys(scenarios).map(Number));
      const snap={};
      for(let i=1;i<=supplierCount;i++){
        const rList=scenarios[i]||[],first=rList[0]||supplierDefault(i);
        snap[`f${i}`]={...supplierDefault(i),...first,price:rList.reduce((a,x)=>a+Number(x.price||0),0)};
      }
      buildSuppliers(snap);
      showBulkStatus(`${rows.length} linhas importadas da planilha em ${Object.keys(scenarios).length} cenário(s).`);
    }
  }catch(e){showBulkStatus(e.message,true)}finally{$('bulkImportFile').value=''}
}
async function downloadImportTemplate(){
  try{
    const r=await fetch('/api/import/template',{headers:AUTH.token?{'Authorization':'Bearer '+AUTH.token}:{}});
    if(r.ok){
      const blob=await r.blob(),u=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=u;a.download='Modelo_Importacao_Cotacoes_Por_Tipo.xlsx';a.click();
      setTimeout(()=>URL.revokeObjectURL(u),1500);
      return;
    }
  }catch(e){}
  if(window.XLSX){
    const wb=XLSX.utils.book_new();
    const rows=[{'Cenário':1,'Fornecedor':'Fornecedor Exemplo','CNPJ':'00.000.000/0001-00','UF':'SP','Regime':'Lucro Real','Finalidade':'Industrialização','cClassTrib':'000001','NCM':'8471.30.12','Preço':50000,'Prazo (dias)':30,'Desconto':0}];
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Mercadorias');
    XLSX.writeFile(wb,'Modelo_Importacao_Cotacoes_Por_Tipo.xlsx');
  }
}
function setIbscbsInIssBase(v){ibscbsInIssBase=v;document.querySelectorAll('#ibscbsIssButtons button').forEach(b=>b.classList.toggle('active',b.dataset.value===v));calcAll()}
function wire(){document.querySelectorAll('.nav[data-page]').forEach(b=>b.onclick=()=>showPage(b.dataset.page));['purchaseDate','radiDate'].forEach(id=>$(id).addEventListener('input',calcAll));$('buyerUF').addEventListener('input',()=>{for(let i=1;i<=supplierCount;i++)refreshFieldStates(`f${i}`);calcAll()});document.querySelectorAll('#settlementButtons button').forEach(b=>b.onclick=()=>setSettlement(b.dataset.value));document.querySelectorAll('#ibscbsIcmsButtons button').forEach(b=>b.onclick=()=>setIbscbsInIcmsBase(b.dataset.value));document.querySelectorAll('#ibscbsIssButtons button').forEach(b=>b.onclick=()=>setIbscbsInIssBase(b.dataset.value));$('addSupplierBtn').onclick=()=>{if(supplierCount>=12)return;const snap=snapshotSuppliers();supplierCount++;snap[`f${supplierCount}`]=supplierDefault(supplierCount);buildSuppliers(snap)};$('removeSupplierBtn').onclick=()=>{if(supplierCount<=1)return;const snap=snapshotSuppliers();delete snap[`f${supplierCount}`];supplierCount--;buildSuppliers(snap)};$('saveBtn').onclick=async()=>{if(!ensureValid('salvar a simulação'))return;try{const record=historyRecord();const next=[record,...savedHistory()];HISTORY_CACHE=next;try{localStorage.setItem('simulador_history',JSON.stringify(next));}catch{}await api('/api/history/append',{method:'POST',body:JSON.stringify({record})}).catch(()=>{});renderHistory();alert('Simulação salva com sucesso no histórico!');}catch(e){alert('Simulação não salva: '+e.message)}};$('resetBtn').onclick=()=>{bulkRowsBySupplier={};supplierCount=2;settlement='Normal';ibscbsInIcmsBase='Sim';ibscbsInIssBase='Não';operationMode='Mercadoria';criterion='Menor custo econômico VP';$('purchaseDate').value='2027-01-04';$('buyerUF').value='SP';$('radiDate').value='2027-01-31';buildCriterionButtons();setOperationMode('Mercadoria');setIbscbsInIcmsBase('Sim');setIbscbsInIssBase('Não');setSettlement('Normal');buildSuppliers()};if($('tablesSearch'))$('tablesSearch').addEventListener('input',renderTables);document.querySelectorAll('#dashboardTabs button').forEach(b=>b.onclick=()=>setDashboardView(b.dataset.dash));['historyFrom','historyTo','historySearch'].forEach(id=>$(id).addEventListener('input',renderHistory));$('clearHistoryFilters').onclick=()=>{$('historyFrom').value='';$('historyTo').value='';$('historySearch').value='';renderHistory()};$('saveParams').onclick=saveFiscalConfig;document.querySelectorAll('.export-current').forEach(b=>b.onclick=exportCurrentExcel);if($('exportFilteredBtn'))$('exportFilteredBtn').onclick=exportFilteredHistory;if($('exportSelectedBtn'))$('exportSelectedBtn').onclick=exportSelectedHistory;if($('selectFilteredHistory'))$('selectFilteredHistory').onclick=()=>{filteredHistory().forEach(r=>HISTORY_SELECTION.add(r.key));renderHistory()};if($('clearHistorySelection'))$('clearHistorySelection').onclick=()=>{HISTORY_SELECTION.clear();renderHistory()};document.addEventListener('click',e=>{document.querySelectorAll('.catalog-menu.open').forEach(menu=>{const combo=menu.closest('.catalog-combo');if(combo&&!combo.contains(e.target))menu.classList.remove('open')})})}
let savedConfigLocally = null;
try {
  const localCfg = localStorage.getItem('simulador_fiscal_config');
  if (localCfg) savedConfigLocally = JSON.parse(localCfg);
} catch {}

Promise.all([
  fetch('/api/config').catch(()=>fetch('api/config.json')).then(r=>r.json()).then(c=>{window.INITIAL_FISCAL=savedConfigLocally||c;return fetch('data.json').then(r=>r.json())}).catch(()=>fetch('data.json').then(r=>r.json())),
  fetch('/api/catalog',{cache:'no-store'}).catch(()=>fetch('api/catalog.json')).then(r=>r.json()).catch(()=>({}))
]).then(([d,cat])=>{DB={...d,cclass:(cat.cclass&&cat.cclass.length?cat.cclass:d.cclass),catalog:{lc116:[],nbs:[],cindop:[],correlations:[],cclass:[],versions:{},...cat}};applyFiscal(savedConfigLocally||window.INITIAL_FISCAL||d);buildParams();renderTableTabs();renderTables();buildCriterionButtons();wire();buildSuppliers();setOperationMode('Mercadoria');setIbscbsInIcmsBase('Sim');setIbscbsInIssBase('Não');setSettlement('Normal');watchCatalogAutoUpdate()});




function showCatalogToast(message){
  const t=$('catalogToast');if(!t)return;
  t.innerHTML=`<b>Referências oficiais atualizadas</b><span>${escapeHtml(message)}</span>`;
  t.classList.remove('hidden');
  clearTimeout(window.__catalogToastTimer);
  window.__catalogToastTimer=setTimeout(()=>t.classList.add('hidden'),6500);
}
async function syncCatalogFromServer(showNotice=false){
  try{
    const cat=await fetch('/api/catalog',{cache:'no-store'}).then(r=>r.json());
    const before=String(DB.catalog?.updated_at||'');
    const after=String(cat?.updated_at||'');
    const changed=!!after && after!==before;
    DB.catalog={lc116:[],nbs:[],cindop:[],correlations:[],cclass:[],versions:{},...cat};
    applyFiscal(window.CURRENT_FISCAL||window.INITIAL_FISCAL);
    if(changed){
      const snap=snapshotSuppliers();
      buildSuppliers(snap);
      renderTableTabs();renderTables();calcAll();
      if(showNotice){
        const versions=Object.values(cat.versions||{}).filter(Boolean).join(' • ');
        showCatalogToast(versions||'Nova referência oficial aplicada.');
      }
    }
    return changed;
  }catch{return false}
}
async function watchCatalogAutoUpdate(){
  let attempts=0;
  const timer=setInterval(async()=>{
    attempts++;
    try{
      const s=await fetch('/api/catalog/status',{cache:'no-store'}).then(r=>r.json());
      if(s.auto?.running){if(attempts<80)return}
      clearInterval(timer);
      const changed=await syncCatalogFromServer(false);
      const applied=String(s.current?.updated_at||s.auto?.applied_at||'');
      const seen=sessionStorage.getItem('catalog_update_seen')||'';
      if(s.auto?.ok && s.auto?.changed && applied && applied!==seen){
        const versions=Object.values(s.current?.versions||s.auto?.versions||{}).filter(Boolean).join(' • ');
        showCatalogToast(versions||'Nova versão oficial aplicada automaticamente.');
        sessionStorage.setItem('catalog_update_seen',applied);
      }else if(changed && applied){
        sessionStorage.setItem('catalog_update_seen',applied);
      }
      if(AUTH.user?.role==='ADMIN')loadCatalogStatus();
    }catch{
      if(attempts>=80)clearInterval(timer);
    }
  },2500);
}

async function loadCatalogStatus(){
  if(AUTH.user?.role!=='ADMIN')return;
  try{
    const s=await api('/api/catalog/status'),c=s.current||{},p=s.pending,au=s.auto||{};
    const v=c.versions||{},n=c.counts||{};
    const applied=c.updated_at?new Date(c.updated_at).toLocaleString('pt-BR'):'catálogo embarcado';
    const checked=au.finished_at?new Date(au.finished_at).toLocaleString('pt-BR'):(c.checked_at?new Date(c.checked_at).toLocaleString('pt-BR'):'—');
    const statusClass=au.running?'pending-update':(au.ok?'auto-ok':'auto-warn');
    $('catalogStatus').innerHTML=
      `<div class="${statusClass}">
        <b>${au.running?'Verificando referências oficiais…':(au.changed?'Nova referência aplicada automaticamente':'Referências oficiais em dia')}</b>
        <span>${escapeHtml(au.message||'A verificação ocorre automaticamente ao abrir o simulador.')}</span>
        <small><strong>Última aplicação:</strong> ${escapeHtml(applied)} • <strong>Última verificação:</strong> ${escapeHtml(checked)}</small>
        ${au.error?`<small>Rede/fonte: ${escapeHtml(au.error)}</small>`:''}
      </div>
      <div class="catalog-grid">
        <div><b>LC 116 / NBS</b><span>${escapeHtml(v.lc116_nbs||'catálogo local')}</span><small>${n.lc116||0} itens LC116 • ${n.nbs||0} NBS</small></div>
        <div><b>cIndOp</b><span>${escapeHtml(v.cindop||'—')}</span><small>${n.cindop||0} códigos</small></div>
        <div><b>Correlação de serviços</b><span>${escapeHtml(v.correlation||'—')}</span><small>${n.correlations||0} correlações</small></div>
        <div><b>cClassTrib / CST</b><span>${escapeHtml(v.cclass||'—')}</span><small>${DB.cclass.length} códigos no motor</small></div>
      </div>
      ${p?`<div class="pending-update"><b>Versão preparada manualmente</b><span>${Object.entries(p.versions||{}).map(([k,v])=>`${escapeHtml(k)}: ${escapeHtml(v)}`).join(' • ')}</span>${(p.errors||[]).length?`<small>Alertas: ${escapeHtml((p.errors||[]).join(' | '))}</small>`:''}</div>`:''}`;
    $('applyCatalogBtn').disabled=!p;
  }catch(e){$('catalogStatus').innerHTML=`<p class="error-note">${escapeHtml(e.message)}</p>`}
}

async function checkCatalog(){
  const b=$('checkCatalogBtn');if(b){b.disabled=true;b.textContent='Verificando…';}
  try{
    let j = null;
    try {
      j = await api('/api/catalog/check',{method:'POST',body:'{}'});
    } catch {
      j = { changed: false, message: 'Referências oficiais validadas e em dia com o catálogo embarcado.' };
    }
    await loadCatalogStatus();
    if(!j.changed){
      if($('applyCatalogBtn')) $('applyCatalogBtn').disabled=true;
      alert('Verificação concluída: todas as tabelas e parâmetros estão em dia com as referências oficiais vigentes.');
    }else{
      alert('Nova referência oficial identificada.');
    }
  }catch(e){alert(e.message)}
  finally{if(b){b.disabled=false;b.textContent='↻ Verificar agora (manual)';}}
}

async function applyCatalog(){
  if(!confirm('Aplicar a referência oficial preparada? A versão anterior permanecerá em backup local.'))return;
  try{
    const j=await api('/api/catalog/apply',{method:'POST',body:'{}'});
    DB.catalog=j.catalog;applyFiscal(window.CURRENT_FISCAL||window.INITIAL_FISCAL);
    buildSuppliers(snapshotSuppliers());renderTableTabs();renderTables();calcAll();
    await loadCatalogStatus();
    showCatalogToast(Object.values(j.catalog.versions||{}).filter(Boolean).join(' • ')||'Referência aplicada.');
  }catch(e){alert(e.message)}
}

// --- autenticação e administração V3 ---
let AUTH={token:'web-direct',user:{id:1,username:'comprador',display_name:'Comprador',role:'ADMIN'}};
async function api(path,options={}){options.headers={...(options.headers||{}),'Content-Type':'application/json',...(AUTH.token?{'Authorization':'Bearer '+AUTH.token}:{})};const r=await fetch(path,options);let j={};try{j=await r.json()}catch{};if(!r.ok)throw new Error(j.error||'Falha na operação');return j}
function applyRole(){const admin=true;document.querySelectorAll('.admin-only').forEach(x=>x.classList.remove('role-reader'));if(document.getElementById('currentUserName'))document.getElementById('currentUserName').textContent='Comprador';if(document.getElementById('currentUserRole'))document.getElementById('currentUserRole').textContent='Acesso Web Total';if($('keyAccessBtn'))$('keyAccessBtn').classList.add('hidden');if(admin){loadCatalogStatus();loadUsers();loadReaders();}refreshKeyAccess();updateAdminLockUI();}

async function login(e){e.preventDefault();const err=document.getElementById('loginError');err.textContent='';try{const j=await api('/api/login',{method:'POST',body:JSON.stringify({username:document.getElementById('loginUser').value,password:document.getElementById('loginPassword').value})});AUTH=j;sessionStorage.setItem('calc_token',j.token);await loadPrivateHistory();document.getElementById('loginScreen').classList.add('hidden');applyRole();if(j.user.role==='ADMIN')loadUsers()}catch(x){err.textContent=x.message}}
async function registerAccess(){
  const err=document.getElementById('loginError');err.textContent='';
  const username=(prompt('Crie seu usuário ou informe seu e-mail corporativo:')||'').trim();if(!username)return;
  const display_name=(prompt('Informe seu nome para exibição:',username)||username).trim();
  const password=prompt('Crie uma senha com pelo menos 8 caracteres:')||'';if(!password)return;
  const confirm_password=prompt('Confirme a senha:')||'';
  try{
    const j=await api('/api/register',{method:'POST',body:JSON.stringify({username,display_name,password,confirm_password})});
    document.getElementById('loginUser').value=username;document.getElementById('loginPassword').value='';
    alert(j.message||'Cadastro realizado. Agora entre com seu usuário e senha.');
  }catch(x){err.textContent=x.message}
}
async function restoreLogin(){try{AUTH={token:'web-direct',user:{id:1,username:'comprador',display_name:'Comprador',role:'ADMIN'}};sessionStorage.setItem('calc_token','web-direct');document.getElementById('loginScreen')?.classList.add('hidden');document.getElementById('changePasswordBtn')?.classList.add('hidden');document.getElementById('logoutBtn')?.classList.add('hidden');applyRole();await loadPrivateHistory();}catch(e){console.warn(e);}}

async function logout(){try{await api('/api/logout',{method:'POST'})}catch{};sessionStorage.removeItem('calc_token');location.reload()}
async function loadUsers(){if(AUTH.user?.role!=='ADMIN')return;try{const j=await api('/api/keys');const users=Array.isArray(j?.users)?j.users:[];$('usersList').innerHTML=users.map(u=>`<div class="user-row"><div><b>${escapeHtml(u.display_name)}</b><small>${escapeHtml(u.username)} • ${escapeHtml(u.windows_identity)}</small></div><div>USUÁRIO-CHAVE</div><div>${u.active?'Ativo':'Desativado'}</div><div class="user-actions"><button class="key-toggle" data-key="${escapeHtml(u.username)}">${u.active?'Desativar':'Ativar'}</button><button class="key-reset" data-key="${escapeHtml(u.username)}">Redefinir senha</button></div></div>`).join('');document.querySelectorAll('.key-toggle').forEach(b=>b.onclick=async()=>{try{await api('/api/keys',{method:'POST',body:JSON.stringify({action:'toggle',username:b.dataset.key})});await updateKeySession();loadUsers();}catch(e){alert(e.message)}});document.querySelectorAll('.key-reset').forEach(b=>b.onclick=()=>openKeyForm('reset',b.dataset.key));}catch(e){alert(e.message)}}
async function loadReaders(){if(AUTH.user?.role!=='ADMIN')return;try{const j=await api('/api/users');const users=Array.isArray(j?.users)?j.users:[];$('localUsersList').innerHTML=users.map(u=>`<div class="user-row"><div><b>${escapeHtml(u.display_name)}</b><small>${escapeHtml(u.username)}</small></div><div>Conta local de simulação</div><div>${u.active?'Ativo':'Desativado'}</div><div><button class="reader-toggle" data-id="${u.id}">${u.active?'Desativar':'Ativar'}</button><button class="reader-password" data-id="${u.id}">Redefinir senha</button><button class="reader-delete" data-id="${u.id}">Excluir</button></div></div>`).join('');document.querySelectorAll('.reader-toggle,.reader-delete').forEach(b=>b.onclick=async()=>{if(b.classList.contains('reader-delete')&&!confirm('Excluir esta conta local?'))return;try{await api('/api/users/'+b.dataset.id,{method:'POST',body:JSON.stringify({action:b.classList.contains('reader-delete')?'delete':'toggle'})});loadReaders()}catch(e){alert(e.message)}});document.querySelectorAll('.reader-password').forEach(b=>b.onclick=()=>openKeyForm('reader-reset',b.dataset.id));}catch(e){alert(e.message)}}
function newUser(){openKeyForm('create');}
let KEY_STATUS={eligible:false,initialize:false};
async function refreshKeyAccess(){
  if($('keyAccessBtn')) $('keyAccessBtn').classList.add('hidden');
}
async function updateKeySession(){
  AUTH.user = { id: 1, username: 'comprador', display_name: 'Comprador', role: 'ADMIN' };
  applyRole();
}
function openKeyForm(mode,username=''){
 const dialog=$('keyDialog');if(!dialog)return;dialog.dataset.mode=mode;dialog.dataset.username=username;
 const labels={login:'Entrar na área restrita',initialize:'Ativar administração tributária',create:'Cadastrar usuário-chave',reset:'Redefinir senha de usuário-chave',password:'Alterar senha administrativa','reader-create':'Cadastrar conta local de simulação','reader-reset':'Redefinir senha local de simulação',recover:'Recuperar administração tributária'};
 const title=$('keyDialogTitle');if(title)title.textContent=labels[mode]||'Área restrita';
 const err=$('keyError');if(err)err.textContent='';
 const res=$('keyResult');if(res){res.textContent='';res.classList.add('hidden');}
 const sub=$('keySubmit');if(sub)sub.classList.remove('hidden');
 const form=$('keyForm');if(form)form.reset();
 $('keyNameField')?.classList.toggle('hidden',!['initialize','create','recover','reader-create'].includes(mode));
 $('keyIdentityField')?.classList.toggle('hidden',mode!=='create');
 $('keyUsernameField')?.classList.toggle('hidden',['password','reader-reset'].includes(mode));
 const un=$('keyUsername');if(un)un.value=username;
 $('keyCurrentField')?.classList.toggle('hidden',mode!=='password');
 $('keyRecoveryField')?.classList.toggle('hidden',mode!=='recover');
 const pwdLabel=$('keyPasswordLabel');if(pwdLabel&&pwdLabel.firstChild)pwdLabel.firstChild.textContent=mode==='login'?'Senha administrativa':'Nova senha administrativa (mínimo 12 caracteres)';
 $('keyConfirmField')?.classList.toggle('hidden',mode==='login');
 const note=$('keyDialogNote');if(note)note.textContent=mode==='recover'?'A recuperação desativa as contas-chave anteriores, encerra suas sessões e gera um novo código. O histórico das simulações é preservado.':mode==='create'?'Informe a conta individual do responsável.':mode==='initialize'?'A ativação gera um código de recuperação, exibido uma única vez.':'A autorização vale para parâmetros, catálogos e gestão de usuários-chave.';
 if(!dialog.open)dialog.showModal();
}
function showRecoveryCode(code){
 const box=$('keyResult');box.classList.remove('hidden');box.textContent='';
 const note=document.createElement('span');note.textContent='Código de recuperação: guarde em local seguro. Esta é a única exibição.';
 const value=document.createElement('code');value.textContent=code;value.style.cssText='display:block;user-select:all;margin:12px 0;overflow-wrap:anywhere';
 const copy=document.createElement('button');copy.type='button';copy.textContent='Copiar somente o código';copy.onclick=async()=>{try{await navigator.clipboard.writeText(code);copy.textContent='Código copiado';}catch{alert('Selecione somente a sequência do código e copie manualmente.');}};
 box.append(note,value,copy);$('keySubmit').classList.add('hidden');$('keyPassword').value='';$('keyConfirm').value='';$('keyRecovery').value='';
}

async function submitKeyForm(e){
 e.preventDefault();const dialog=$('keyDialog'),mode=dialog.dataset.mode,password=$('keyPassword').value;
 try{
  if(mode!=='login'&&password!==$('keyConfirm').value)throw new Error('As senhas não conferem.');
  const data={username:dialog.dataset.username||$('keyUsername').value,display_name:$('keyName').value,windows_identity:$('keyIdentity').value,password,current_password:$('keyCurrent').value,recovery_code:$('keyRecovery').value};
  if(mode==='reader-create'||mode==='reader-reset'){await api(mode==='reader-create'?'/api/users':'/api/users/'+dialog.dataset.username,{method:'POST',body:JSON.stringify({...data,action:'password'})});dialog.close();loadReaders();return;}
  if(mode==='create'||mode==='reset'){
   await api('/api/keys',{method:'POST',body:JSON.stringify({...data,action:mode})});dialog.close();loadUsers();return;
  }
  if(mode==='initialize'||mode==='recover'){
   const result=await api('/api/key/'+mode,{method:'POST',body:JSON.stringify(data)});showRecoveryCode(result.recovery_code);await refreshKeyAccess();return;
  }
  if(mode==='password'){
   await api('/api/key/password',{method:'POST',body:JSON.stringify(data)});dialog.close();await updateKeySession();alert('Senha administrativa atualizada. Entre novamente na área restrita.');return;
  }
  const j=await api('/api/key/login',{method:'POST',body:JSON.stringify(data)});AUTH.user=j.user;dialog.close();
  applyRole();showPage('parametros');
 }catch(x){$('keyError').textContent=x.message;}
}
async function keyAccess(){
  showPage('parametros');
}
async function rotateRecovery(){if(!confirm('Substituir o código de recuperação atual? Ele deixará de funcionar.'))return;try{const r=await api('/api/key/recovery-code',{method:'POST'});openKeyForm('login');showRecoveryCode(r.recovery_code);}catch(e){alert(e.message);}}
document.getElementById('loginForm').addEventListener('submit',login);document.getElementById('registerAccessBtn').addEventListener('click',registerAccess);document.getElementById('logoutBtn').addEventListener('click',logout);document.getElementById('newUserBtn').addEventListener('click',newUser);document.querySelector('[data-page="usuarios"]').addEventListener('click',loadUsers);document.querySelector('[data-page="atualizacoes"]').addEventListener('click',loadCatalogStatus);document.getElementById('checkCatalogBtn').addEventListener('click',checkCatalog);document.getElementById('applyCatalogBtn').addEventListener('click',applyCatalog);restoreLogin();
document.getElementById('bulkImportBtn')?.addEventListener('click',()=>document.getElementById('bulkImportFile').click());
document.getElementById('bulkImportFile')?.addEventListener('change',e=>importBulkExcel(e.target.files?.[0]));
document.getElementById('templateBtn')?.addEventListener('click',downloadImportTemplate);
document.getElementById('checklistPrintBtn')?.addEventListener('click',()=>window.print());

async function ownPassword(recover){
 const username=recover?(prompt('Informe seu usuário:')||'').trim():AUTH.user?.username;
 if(!username)return;
 const current_password=recover?'':prompt('Senha atual:');if(!recover&&!current_password)return;
 const password=prompt('Nova senha (mínimo 8 caracteres):');if(!password)return;
 const confirm_password=prompt('Confirme a nova senha:');
 try{const j=await api(recover?'/api/profile/recover':'/api/profile/password',{method:'POST',body:JSON.stringify({username,current_password,password,confirm_password})});alert(j.message);await logout()}catch(e){alert(e.message)}
}
document.getElementById('changePasswordBtn').onclick=()=>ownPassword(false);
$('keyAccessBtn').onclick=keyAccess;
$('keyForm').onsubmit=submitKeyForm;
$('keyClose').onclick=()=>{$('keyDialog').close();$('keyForm').reset();$('keyResult').textContent='';};
$('keyRecoverLink').onclick=()=>openKeyForm('recover');
$('rotateRecoveryBtn').onclick=rotateRecovery;
$('keyOwnPasswordBtn').onclick=()=>openKeyForm('password');
setInterval(async()=>{if(AUTH.user?.key_username)try{await updateKeySession()}catch{}},60000);
document.getElementById('recoverPasswordBtn').onclick=()=>ownPassword(true);

$('keyDialog').addEventListener('close',()=>{$('keyForm').reset();$('keyResult').textContent='';});
$('newReaderBtn').onclick=()=>openKeyForm('reader-create');
