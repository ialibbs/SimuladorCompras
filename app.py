from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

def resource_root():
    import sys
    if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
        return Path(sys._MEIPASS)
    return Path(__file__).resolve().parent

from urllib.parse import urlparse, urljoin, urlencode
import html as html_module
import webbrowser, threading, os, sys, shutil, json, sqlite3, hashlib, secrets, time, re, io, zipfile, urllib.request, urllib.error, ssl, tempfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

BASE=resource_root()
DEPLOY=Path(sys.executable).resolve().parent if getattr(sys,'frozen',False) else BASE
ACCESS_MODE='direct' if '--direct' in sys.argv else 'login'
from governance import Governance
from key_accounts import KeyAccounts
GOV=Governance(DEPLOY)
KEYS=KeyAccounts(DEPLOY/'administration',GOV.policy().get('initial_key_windows_identities',[]))
WEB=BASE/'web'
ROOT=BASE/'web'
SEED_DATA=BASE/'data'

def load_security_policy():
    path=DEPLOY/'security_policy.json' if (DEPLOY/'security_policy.json').exists() else BASE/'security_policy.json'
    try:return json.loads(path.read_text(encoding='utf-8'))
    except:return {'require_corporate_domain':False,'allowed_domains':[]}

def validate_corporate_environment():
    """Trava opcional definida antes da compilação do executável corporativo."""
    policy=load_security_policy()
    if not policy.get('require_corporate_domain'):return True,''
    allowed={str(x).strip().casefold() for x in policy.get('allowed_domains',[]) if str(x).strip()}
    current=windows_identity().split('\\',1)[0].casefold()
    if current and current in allowed:return True,''
    return False,('Este aplicativo é restrito ao ambiente corporativo autorizado. '
                  f'Domínio identificado: {current or "não identificado"}.')

def writable_data_dir():
    # Versão portátil: cada usuário do Windows mantém sua própria base.
    # O executável pode ficar na rede sem compartilhar senhas, parâmetros ou histórico.
    if os.name=='nt':
        root=os.environ.get('LOCALAPPDATA')
        if root:
            return Path(root)/'Simulador de Compras'/'5.0'/ACCESS_MODE/'data'
    root=os.environ.get('XDG_DATA_HOME')
    return (Path(root) if root else Path.home()/'.local'/'share')/'simulador-compras-5.0'/ACCESS_MODE

DATA=writable_data_dir()
DATA.mkdir(parents=True,exist_ok=True)

def ensure_seed_data():
    DATA.mkdir(parents=True,exist_ok=True)
    for name in ('catalogo_servicos.json',):
        src=SEED_DATA/name
        dst=DATA/name
        if src.exists() and not dst.exists():
            shutil.copy2(src,dst)
    seed=load_json(SEED_DATA/'catalogo_servicos.json',{})
    current=load_json(CATALOG,{})
    # Recover incomplete caches and adopt a newer bundled official catalog.
    if valid_catalog(seed) and (not valid_catalog(current) or str(seed.get('updated_at',''))>str(current.get('updated_at',''))):
        atomic_apply_catalog(seed)


PROFILE_ROOT=DATA.parent.parent if os.name=='nt' else DATA.parent
CATALOG_DATA=PROFILE_ROOT/'catalogos';CATALOG_DATA.mkdir(parents=True,exist_ok=True)
DBFILE=PROFILE_ROOT/'usuarios.db'; CATALOG=CATALOG_DATA/'catalogo_servicos.json'; PENDING=CATALOG_DATA/'catalogo_pendente.json'; BACKUP=CATALOG_DATA/'catalogo_servicos_backup.json'; AUTOSTATUS=CATALOG_DATA/'catalogo_auto_status.json'
LAUNCH_TOKEN=secrets.token_urlsafe(32)
PORT=0; HOST='127.0.0.1'; URL=f'http://127.0.0.1:{PORT}/?v=5.0.4'; SESSIONS={}; APP_VERSION='5.0.4'
PROD='https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual'
RTC='https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc'
LC116_PAGE='https://www.gov.br/nfse/pt-br/mei-e-demais-empresas/codigos-de-tributacao-nacional-nbs'
CCLASS_PAGE='https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=/NJarYc9nus='
UA={'User-Agent':'Mozilla/5.0 SimuladorCompras/5.0.0','Accept':'*/*'}
NBS_DIRECT='https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/anexo_b-nbs2-lista_servico_nacional-snnfse-v1-01-20260122.xlsx'
CINDOP_DIRECT='https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/anexo-c-indop-ibscbs-snnfse-v1-01.xlsx'
CINDOP_RTC_DIRECT='https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/anexovii-indop_ibscbs_v1-02-00.xlsx'
CORR_DIRECT='https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/anexoviii-correlacaoitemnbsindopcclasstrib_ibscbs_v1-01-00.xlsx'

def db():
    c=sqlite3.connect(DBFILE); c.row_factory=sqlite3.Row; return c

def hash_pw(p,s=None):
    s=s or secrets.token_hex(16); h=hashlib.pbkdf2_hmac('sha256',p.encode(),bytes.fromhex(s),180000).hex(); return s,h

def windows_identity():
    """Identidade do token Windows do processo; não usa variáveis de ambiente."""
    if os.name != 'nt': return ''
    import ctypes
    from ctypes import wintypes
    size = wintypes.ULONG(0)
    api = ctypes.windll.secur32.GetUserNameExW
    api(2, None, ctypes.byref(size))
    buf = ctypes.create_unicode_buffer(size.value or 256)
    if not api(2, buf, ctypes.byref(size)): return ''
    return buf.value.casefold()

def init_db():
    with db() as c:
        c.execute('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE COLLATE NOCASE, display_name TEXT, role TEXT, salt TEXT, password_hash TEXT, active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP)')
        if 'windows_owner' not in [r[1] for r in c.execute('PRAGMA table_info(users)')]:
            c.execute("ALTER TABLE users ADD COLUMN windows_owner TEXT NOT NULL DEFAULT ''")
        c.execute("UPDATE users SET role='LEITOR' WHERE role='ADMIN'")

def user_public(r): return {'id':r['id'],'username':r['username'],'display_name':r['display_name'],'role':r['role'],'active':bool(r['active'])}
def load_json(path,default):
    try:return json.loads(path.read_text(encoding='utf-8'))
    except:return default

def fetch(url,binary=False):
    """Consulta referências oficiais por HTTPS, sem executar comandos externos."""
    if urlparse(url).scheme!='https' or not (urlparse(url).hostname or '').endswith(('.gov.br','.jus.br')):
        raise ValueError('Fonte não autorizada; somente HTTPS governamental.')
    last=None
    urls=[url]
    if url and url.endswith('/view'): urls.append(url[:-5])
    for u in urls:
        try:
            req=urllib.request.Request(u,headers=UA)
            ctx=ssl.create_default_context()
            with urllib.request.urlopen(req,timeout=35,context=ctx) as r:
                final=urlparse(r.geturl())
                if final.scheme!='https' or not (final.hostname or '').endswith(('.gov.br','.jus.br')):raise ValueError('Redirecionamento para fonte não autorizada')
                b=r.read(60*1024*1024+1)
                if len(b)>60*1024*1024:raise ValueError('Fonte excede 60 MB')
            if binary and not b.startswith(b'PK'):
                raise ValueError('a fonte respondeu HTML em vez do arquivo XLSX')
            return b if binary else b.decode('utf-8','ignore')
        except Exception as e:
            last=e
    raise RuntimeError(f'falha ao baixar fonte oficial: {last}')

def links_from_page(url):
    html=fetch(url); out=[]
    for href,label in re.findall(r'<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)</a>',html,re.I|re.S):
        txt=html_module.unescape(re.sub('<[^>]+>',' ',label)); txt=re.sub(r'\s+',' ',txt).strip(); out.append((urljoin(url,html_module.unescape(href)),txt))
    return out,html

def source_version(value):
    match=re.search(r'v[.\s_-]*(\d+(?:[._-]\d+){1,3})',value,re.I)
    return tuple(int(x) for x in re.split('[._-]',match.group(1))) if match else ()

def newest_source(links,predicate):
    choices=[(u,label) for u,label in links if predicate(norm(u+' '+label))]
    return max(choices,key=lambda x:source_version(x[0]+' '+x[1])) if choices else (None,None)

def discover_sources():
    found={
      'lc116_nbs':{'url':NBS_DIRECT,'label':'Anexo B NBS e serviços','version':'fallback 20260122'},
      'cindop':{'url':CINDOP_RTC_DIRECT,'label':'cIndOp RTC','version':'fallback v1.02.00'},
      'correlation':{'url':CORR_DIRECT,'label':'Correlação RTC','version':'fallback v1.01.00'},
      'cclass':{'url':CCLASS_PAGE,'label':'cClassTrib Portal NF-e','version':'não verificada'},
      'checked_at':datetime.now(timezone.utc).isoformat()
    }
    def assign(key,pair):
        u,label=pair
        if not u:return
        if u.endswith('/view'):u=u[:-5]
        version=source_version(u+' '+(label or ''))
        found[key].update({'url':u,'label':label or key,'version':'v'+'.'.join(map(str,version)) if version else 'versão não identificada'})
    try:
        links,_=links_from_page(PROD)
        assign('lc116_nbs',newest_source(links,lambda z:'anexo b' in z and 'nbs' in z))
    except Exception:pass
    try:
        links,_=links_from_page(RTC)
        assign('cindop',newest_source(links,lambda z:('anexovii ' in z or 'anexo vii ' in z) and 'indop' in z))
        assign('correlation',newest_source(links,lambda z:('anexoviii' in z or 'anexo viii' in z) and 'correlacao' in z))
    except Exception:pass
    return found

def xlsx_sheets_rows(blob):
    """Lê todas as planilhas do XLSX; os anexos oficiais podem separar LC116 e NBS em abas distintas."""
    z=zipfile.ZipFile(io.BytesIO(blob))
    if len(z.infolist())>10000 or sum(x.file_size for x in z.infolist())>200*1024*1024:raise ValueError('XLSX excede o limite de conteúdo descompactado')
    ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    shared=[]
    if 'xl/sharedStrings.xml' in z.namelist():
        root=ET.fromstring(z.read('xl/sharedStrings.xml'))
        for si in root.findall('m:si',ns): shared.append(''.join(t.text or '' for t in si.iter('{%s}t'%ns['m'])))
    sheets=[]
    for sheet in sorted(n for n in z.namelist() if n.startswith('xl/worksheets/sheet') and n.endswith('.xml')):
        root=ET.fromstring(z.read(sheet)); rows=[]
        for row in root.findall('.//m:row',ns):
            number=int(row.get('r',len(rows)+1))
            if number>100000:raise ValueError('Planilha oficial excede 100.000 linhas')
            while len(rows)<number-1:rows.append([])
            vals=[]
            for c in row.findall('m:c',ns):
                ref=c.get('r','A1'); mm=re.match(r'[A-Z]+',ref)
                if not mm: continue
                idx=0
                for ch in mm.group(): idx=idx*26+ord(ch)-64
                if idx>512:raise ValueError('Planilha oficial excede 512 colunas')
                while len(vals)<idx:vals.append('')
                typ=c.get('t'); v=c.find('m:v',ns); inline=c.find('m:is',ns); val=''
                if typ=='s' and v is not None:
                    try:val=shared[int(v.text)]
                    except:val=v.text or ''
                elif typ=='inlineStr' and inline is not None: val=''.join(t.text or '' for t in inline.iter('{%s}t'%ns['m']))
                elif v is not None: val=v.text or ''
                vals[idx-1]=str(val).strip()
            rows.append(vals)
        # Expande somente mesclagens verticais declaradas, sem inferir células vazias.
        for merge in root.findall('.//m:mergeCell',ns):
            m=re.fullmatch(r'([A-Z]+)(\d+):([A-Z]+)(\d+)',merge.get('ref',''))
            if not m or m[1]!=m[3]:continue
            column=0
            for ch in m[1]:column=column*26+ord(ch)-64
            first,last=int(m[2])-1,int(m[4])-1
            if column>512 or last>=100000:raise ValueError('Mesclagem fora do limite seguro')
            if first>=len(rows) or column>len(rows[first]):continue
            value=rows[first][column-1]
            for index in range(first+1,min(last+1,len(rows))):
                while len(rows[index])<column:rows[index].append('')
                if not rows[index][column-1]:rows[index][column-1]=value
        sheets.append(rows)
    return sheets

def xlsx_rows(blob):
    ss=xlsx_sheets_rows(blob)
    return ss[0] if ss else []

def norm(s):return re.sub(r'[^a-z0-9]+',' ',str(s).lower().replace('ç','c').replace('ã','a').replace('á','a').replace('é','e').replace('í','i').replace('ó','o').replace('ú','u')).strip()
def find_header(rows,keywords):
    best=(-1,-1)
    for i,r in enumerate(rows[:35]):
        score=sum(any(k in norm(c) for c in r) for k in keywords)
        if score>best[0]:best=(score,i)
    return best[1]
def col_idx(header,groups):
    hh=[norm(x) for x in header]
    for terms in groups:
        for i,h in enumerate(hh):
            if all(t in h for t in terms):return i
    return None
def get(r,i):return r[i].strip() if i is not None and i<len(r) else ''

def parse_nbs(blob):
    """Extrai separadamente Código de Tributação Nacional/LC116 e NBS + descrições."""
    nbs={}; lc={}
    for rows in xlsx_sheets_rows(blob):
        if not rows: continue
        # Procura cabeçalho em cada aba, evitando confundir Código Nacional com NBS.
        best=(-1,-1)
        for i,r in enumerate(rows[:60]):
            joined=' | '.join(norm(c) for c in r)
            score=sum(x in joined for x in ('nbs','descricao','tributacao nacional','servico'))
            if score>best[0]: best=(score,i)
        hi=best[1]; h=rows[hi] if hi>=0 else []
        hh=[norm(x) for x in h]
        def idx_exact_any(groups):
            for terms in groups:
                for i,x in enumerate(hh):
                    if all(t in x for t in terms): return i
            return None
        ncode=idx_exact_any([('codigo','nbs'),('cod','nbs'),('nbs',)])
        # Se a coluna se chama apenas NBS, aceite; nunca use 'código nacional' como NBS.
        if ncode is not None and ('tributacao nacional' in hh[ncode] or 'codigo nacional' in hh[ncode]): ncode=None
        ndesc=idx_exact_any([('descricao','nbs'),('descr','nbs')])
        scode=idx_exact_any([('codigo','tributacao','nacional'),('cod','tributacao','nacional'),('codigo','nacional'),('item','servico')])
        sdesc=idx_exact_any([('descricao','servico'),('descr','servico'),('descricao','tributacao')])
        # Em alguns anexos a descrição fica em uma coluna genérica ao lado do código.
        generic_desc=idx_exact_any([('descricao',),('descr',)])
        for r in rows[hi+1:]:
            nc=get(r,ncode); nd=get(r,ndesc)
            sc=get(r,scode); sd=get(r,sdesc)
            if not sd and scode is not None and generic_desc is not None: sd=get(r,generic_desc)
            if not nd and ncode is not None:
                # Prefere a primeira coluna de descrição à direita da NBS.
                for j in range(ncode+1,min(len(r),ncode+4)):
                    if j<len(hh) and ('descr' in hh[j] or 'servic' in hh[j]): nd=get(r,j); break
            # Valida formatos para impedir LC116 e NBS de se misturarem.
            sc_clean=re.sub(r'\D','',sc)
            if sc and len(sc_clean)==6:
                sc=sc_clean
                if sc not in lc: lc[sc]={'code':sc,'description':sd}
            if nc:
                nc=str(nc).strip()
                # NBS normalmente é apresentada como 1.xxxx.xx.xx; preserve pontuação oficial.
                digits=re.sub(r'\D','',nc)
                if len(digits)>=9 and not (len(digits)==6 and digits==sc_clean):
                    if nc not in nbs: nbs[nc]={'code':nc,'description':nd}
    return list(lc.values()),list(nbs.values())

def parse_indop(blob):
    rows=xlsx_rows(blob); hi=find_header(rows,['indop','descricao']); h=rows[hi] if hi>=0 else []
    ci=col_idx(h,[('cindop',),('codigo','operacao'),('codigo',)]); di=col_idx(h,[('descricao',),('operacao',)])
    out=[]; seen=set()
    for r in rows[hi+1:]:
        c=get(r,ci); d=get(r,di)
        if c and c not in seen:seen.add(c);out.append({'code':c,'description':d})
    return out

def parse_corr(blob):
    out=[]; seen=set()
    for rows in xlsx_sheets_rows(blob):
        hi=find_header(rows,['nbs','indop','cclasstrib','servico']); h=rows[hi] if hi>=0 else []
        li=col_idx(h,[('item','lc','116'),('codigo','tributacao','nacional'),('item','servico'),('codigo','servico'),('servico',)])
        ni=col_idx(h,[('nbs',)]); ii=col_idx(h,[('cindop',),('indop',)]); ci=col_idx(h,[('cclasstrib',),('classificacao','tributaria')])
        if ni is None or ci is None:continue
        for r in rows[hi+1:]:
            lc=get(r,li); nbs=get(r,ni); ind=get(r,ii); cc=get(r,ci)
            lcd=re.sub(r'\D','',lc)
            if len(lcd) in (4,6):lc=lcd
            x={'lc116':lc,'nbs':nbs,'cindop':ind,'cclass':cc}; key=tuple(x.values())
            if any(key) and key not in seen:seen.add(key);out.append(x)
    return out

def parse_lc116_html(html):
    text=re.sub('<[^>]+>','\n',html); text=re.sub(r'&nbsp;',' ',text)
    out=[]; seen=set()
    for code,desc in re.findall(r'(?m)^\s*(\d{6})\s*[-–]\s*(.{3,500}?)(?=\n|$)',text):
        desc=re.sub(r'\s+',' ',desc).strip()
        if code not in seen:seen.add(code);out.append({'code':code,'description':desc})
    return out

def discover_cclass_file():
    # Fonte nacional preferencial; espelho oficial SVRS quando o portal nacional falha.
    try:
        links,_=links_from_page(CCLASS_PAGE)
        candidate=newest_source(links,lambda z:('classificacao tributaria' in z or 'cclasstrib' in z) and ('ibs' in z or 'cclass' in z))
        if candidate[0]:return candidate
    except Exception:pass
    try:
        page='https://dfe-portal.svrs.rs.gov.br/One/Documentos'
        html=fetch(page);candidates=[]
        for system,kind,filename in re.findall(r"download_arquivo_estatico\('([A-Z]+)',\s*(\d+),\s*'([^']+)'\)",html):
            filename=html_module.unescape(filename)
            if 'cclasstrib' in filename.casefold() and filename.casefold().endswith('.xlsx'):
                url='https://dfe-portal.svrs.rs.gov.br/'+system+'/DownloadArquivoEstatico/?'+urlencode({'sistema':system,'tipoArquivo':kind,'nomeArquivo':filename})
                candidates.append((url,filename))
        return max(candidates,key=lambda x:source_version(x[1])) if candidates else (None,None)
    except Exception:return (None,None)

def parse_cclass(blob):
    rows=xlsx_rows(blob);hi=find_header(rows,['cclasstrib','descricao']);h=rows[hi] if hi>=0 else []
    if hi<0:raise ValueError('Cabeçalho cClassTrib não reconhecido')
    ci=col_idx(h,[('cclasstrib',),('classificacao','tributaria')]);di=col_idx(h,[('descricao','cclasstrib'),('nome','cclasstrib'),('descricao',)]);csti=col_idx(h,[('cst',)]);ribi=col_idx(h,[('predibs',),('reducao','ibs')]);rcbi=col_idx(h,[('predcbs',),('reducao','cbs')])
    out=[];seen=set()
    for row in rows[hi+1:]:
        raw=get(row,ci).strip();code=raw.zfill(6) if raw.isdigit() else raw
        if not re.fullmatch(r'\d{6}',code) or code in seen:continue
        seen.add(code)
        def reduction(index):
            if index is None:return None
            value=get(row,index).strip()
            if not value:return 0.0
            number=float(value.replace('%','').replace(',','.'))
            if not 0<=number<=100:raise ValueError('Redução fora do intervalo 0 a 100')
            return number/100
        ri=reduction(ribi);rc=reduction(rcbi);red=max(ri or 0,rc or 0)
        cst=get(row,csti).strip().zfill(3);treatment={'400':'Isenta','410':'Imune / não incidência','550':'Suspensão','800':'Não tributada','810':'Não tributada','811':'Não tributada'}.get(cst,'Conforme tabela oficial')
        if ri==1 and rc==1:treatment='Alíquota zero'
        entry={'code':code,'cst':cst,'description':get(row,di),'treatment':treatment,'use':'Oficial','version':'fonte consultada','note':'Portal NF-e','reduction':red}
        if ri is not None:entry['reductionIbs']=ri
        if rc is not None:entry['reductionCbs']=rc
        out.append(entry)
    if not out:raise ValueError('Nenhum cClassTrib reconhecido')
    return out

def fetch_xlsx_candidates(urls):
    errs=[]
    for u in [x for x in urls if x]:
        for candidate in (u, u.rstrip('/')+'/@@download/file' if '@@download/file' not in u else u):
            try:return fetch(candidate,True),candidate
            except Exception as e: errs.append(f'{candidate}: {e}')
    raise RuntimeError(' | '.join(errs[-4:]))

def build_pending(found):
    current=load_json(CATALOG,{})
    base_data=load_json(ROOT/'data.json',{})
    pending={'versions':{},'sources':current.get('sources',{}),'lc116':current.get('lc116',[]),'nbs':current.get('nbs',[]),'cindop':current.get('cindop',[]),'correlations':current.get('correlations',[]),'cclass':current.get('cclass',base_data.get('cclass',[])),'checked_at':found['checked_at'],'updated_at':current.get('updated_at'),'note':'Atualização preparada a partir das fontes oficiais; aguarda aprovação do ADMIN.'}
    errors=[]; successes=[]
    try:
        html=fetch(LC116_PAGE); lc=parse_lc116_html(html)
        if lc: pending['lc116']=lc; successes.append(f'LC116: {len(lc)} itens')
        else: errors.append('LC116: a página foi lida, mas nenhum item foi reconhecido')
    except Exception as e: errors.append('LC116: '+str(e))
    try:
        blob,used=fetch_xlsx_candidates([found['lc116_nbs'].get('url'),NBS_DIRECT])
        lc2,nbs=parse_nbs(blob)
        if nbs: pending['nbs']=nbs; successes.append(f'NBS: {len(nbs)} itens')
        else: errors.append('NBS: arquivo oficial baixado, mas o layout não pôde ser interpretado')
        if lc2 and len(lc2)>len(pending['lc116']): pending['lc116']=lc2
        found['lc116_nbs']['url']=used
    except Exception as e: errors.append('NBS: '+str(e))
    try:
        blob,used=fetch_xlsx_candidates([found['cindop'].get('url'),CINDOP_RTC_DIRECT,CINDOP_DIRECT])
        x=parse_indop(blob)
        if x: pending['cindop']=x; successes.append(f'cIndOp: {len(x)} itens')
        else: errors.append('cIndOp: arquivo oficial baixado, mas o layout não pôde ser interpretado')
        found['cindop']['url']=used
    except Exception as e: errors.append('cIndOp: '+str(e))
    try:
        blob,used=fetch_xlsx_candidates([found['correlation'].get('url'),CORR_DIRECT])
        x=parse_corr(blob)
        if x: pending['correlations']=x; successes.append(f'Anexo VIII: {len(x)} correlações')
        else: errors.append('Anexo VIII: arquivo oficial baixado, mas o layout não pôde ser interpretado')
        found['correlation']['url']=used
    except Exception as e: errors.append('Anexo VIII: '+str(e))
    try:
        cu,ct=discover_cclass_file()
        if cu:
            blob,used=fetch_xlsx_candidates([cu])
            x=parse_cclass(blob)
            if x:
                version=source_version((ct or '')+' '+used)
                found['cclass'].update({'url':used,'label':ct or 'cClassTrib','version':'v'+'.'.join(map(str,version)) if version else 'fonte consultada'})
                for row in x:row.update({'version':found['cclass']['version'],'source':used,'note':'Fonte oficial NF-e/SVRS'})
                pending['cclass']=x;successes.append(f'cClassTrib: {len(x)} itens')
        else:errors.append('cClassTrib: link de tabela não encontrado no portal oficial')
    except Exception as e: errors.append('cClassTrib: '+str(e))
    pending['versions']=dict(current.get('versions',{}))
    for key,prefix in [('lc116_nbs','NBS:'),('cindop','cIndOp:'),('correlation','Anexo VIII:'),('cclass','cClassTrib:')]:
        if any(s.startswith(prefix) for s in successes):pending['versions'][key]=found[key]['version']
    pending['sources']={**current.get('sources',{}),**{key:value for key,value in found.items() if isinstance(value,dict)}}
    pending['detected']=found; pending['errors']=errors; pending['successes']=successes
    PENDING.write_text(json.dumps(pending,ensure_ascii=False,indent=2),encoding='utf-8')
    return pending



def catalog_counts(cat):
    return {k:len(cat.get(k,[])) for k in ('lc116','nbs','cindop','correlations','cclass')}

def valid_catalog(cat):
    if not isinstance(cat,dict):return False
    for key in ('lc116','nbs','cindop','cclass'):
        rows=cat.get(key)
        if not isinstance(rows,list) or not rows:return False
        if any(not isinstance(row,dict) or not row.get('code') for row in rows):return False
        if not any(row.get('description') for row in rows):return False
    if any(not re.fullmatch(r'\d{6}',str(row['code'])) for row in cat['cclass']):return False
    rows=cat.get('correlations')
    return isinstance(rows,list) and bool(rows) and all(isinstance(row,dict) and row.get('lc116') for row in rows) and any(row.get('nbs') for row in rows)

def atomic_apply_catalog(new_cat, mode='manual'):
    """Aplica catálogo com backup/rollback. Se algo falhar, restaura o estado anterior."""
    with GOV.lock:
        marker=CATALOG.with_suffix('.lock')
        try:marker.mkdir()
        except FileExistsError:raise ValueError('Catálogo em atualização por outra instância')
        name=None
        try:
            old_text=CATALOG.read_text(encoding='utf-8') if CATALOG.exists() else '{}'
            BACKUP.write_text(old_text,encoding='utf-8')
            new_cat['updated_at']=datetime.now(timezone.utc).isoformat();new_cat['update_mode']=mode
            new_cat['previous_versions']=json.loads(old_text or '{}').get('versions',{})
            fd,name=tempfile.mkstemp(prefix='catalog_',suffix='.tmp',dir=CATALOG.parent)
            with os.fdopen(fd,'w',encoding='utf-8') as f:json.dump(new_cat,f,ensure_ascii=False,indent=2)
            os.replace(name,CATALOG)
            return True
        finally:
            if name and os.path.exists(name):os.unlink(name)
            marker.rmdir()



def catalog_signature(cat):
    """Hash somente do conteúdo efetivo/versionado; ignora timestamps e mensagens."""
    core={
        'versions':cat.get('versions',{}),
        'lc116':cat.get('lc116',[]),
        'nbs':cat.get('nbs',[]),
        'cindop':cat.get('cindop',[]),
        'correlations':cat.get('correlations',[]),
        'cclass':cat.get('cclass',[])
    }
    raw=json.dumps(core,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')
    return hashlib.sha256(raw).hexdigest()

def catalog_changed(current, candidate):
    return catalog_signature(current or {}) != catalog_signature(candidate or {})


def auto_update_catalog():
    """Verifica ao iniciar. Só grava/aplica se o conteúdo oficial mudou; rollback em qualquer falha."""
    started=datetime.now(timezone.utc).isoformat()
    status={'running':True,'started_at':started,'mode':'automatico','ok':False,'changed':False,
            'message':'Verificando referências oficiais em segundo plano.'}
    AUTOSTATUS.write_text(json.dumps(status,ensure_ascii=False,indent=2),encoding='utf-8')
    try:
        current=load_json(CATALOG,{})
        found=discover_sources()
        pend=build_pending(found)
        if not valid_catalog(pend):
            raise RuntimeError('catálogo oficial incompleto; versão anterior preservada')
        changed=catalog_changed(current,pend)
        if changed:
            atomic_apply_catalog(pend, mode='automatico')
            applied=load_json(CATALOG,pend)
            msg='Nova versão oficial identificada e aplicada automaticamente.'
            versions=applied.get('versions',{})
            counts=catalog_counts(applied)
            applied_at=applied.get('updated_at')
        else:
            applied=current
            msg='Nenhuma nova versão oficial identificada. Catálogo atual mantido.'
            versions=current.get('versions',{})
            counts=catalog_counts(current)
            applied_at=current.get('updated_at')
        try:PENDING.unlink()
        except Exception: pass
        status.update({
            'running':False,'ok':True,'changed':changed,
            'finished_at':datetime.now(timezone.utc).isoformat(),
            'message':msg,'counts':counts,'errors':pend.get('errors',[]),
            'versions':versions,'applied_at':applied_at
        })
    except Exception as e:
        cur=load_json(CATALOG,{})
        status.update({
            'running':False,'ok':False,'changed':False,
            'finished_at':datetime.now(timezone.utc).isoformat(),
            'message':'Não foi possível concluir a verificação automática; a última versão válida foi preservada.',
            'error':str(e),'counts':catalog_counts(cur),'versions':cur.get('versions',{}),
            'applied_at':cur.get('updated_at')
        })
    AUTOSTATUS.write_text(json.dumps(status,ensure_ascii=False,indent=2),encoding='utf-8')


def excel_bytes(payload):
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        from openpyxl.utils import get_column_letter
    except Exception as e:
        raise RuntimeError('Exportação Excel requer o pacote openpyxl instalado neste Python.') from e
    wb=Workbook(); wb.remove(wb.active)
    navy='173B60'; light='EAF1F7'; green='EAF6EF'; gray='F4F6F8'; white='FFFFFF'; thin=Side(style='thin',color='D9E2EC')
    def safe(v):
        if v is None:return ''
        if isinstance(v,str) and v.startswith(('=','+','-','@')):return chr(39)+v
        if isinstance(v,(str,int,float,bool)):return v
        return str(v)
    def sheet(name,headers,rows):
        ws=wb.create_sheet(name[:31]); ws.freeze_panes='F2'; ws.row_dimensions[1].height=62; ws.auto_filter.ref=f"A1:{get_column_letter(max(1,len(headers)))}1"
        for j,h in enumerate(headers,1):
            c=ws.cell(1,j,safe(h)); c.font=Font(bold=True,color=white); c.fill=PatternFill('solid',fgColor=navy); c.alignment=Alignment(horizontal='center',vertical='center'); c.border=Border(bottom=thin)
        for i,row in enumerate(rows,2):
            for j,v in enumerate(row,1):
                c=ws.cell(i,j,safe(v)); c.border=Border(bottom=thin); c.alignment=Alignment(vertical='top')
                if isinstance(v,(int,float)) and not isinstance(v,bool): c.number_format='#,##0.00'
            if i%2==0:
                for c in ws[i]: c.fill=PatternFill('solid',fgColor='FAFCFE')
        for j,h in enumerate(headers,1):
            vals=[len(str(h))]+[len(str(ws.cell(i,j).value or '')) for i in range(2,min(ws.max_row,80)+1)]
            ws.column_dimensions[get_column_letter(j)].width=min(38,max(11,max(vals)+2))
        return ws
    kind=payload.get('kind'); data=payload.get('data') or {}
    if kind=='history':
        rows=[]
        for x in data if isinstance(data,list) else []:
            sups=x.get('suppliers') or {}
            for k,su in sups.items():
                if not su:continue
                rows.append([x.get('savedAt',''),x.get('purchaseDate',''),x.get('operationMode','Mercadoria'),x.get('settlement','Normal'),x.get('criterion',''),k,su.get('name',''),su.get('cnpj',''),su.get('uf',''),su.get('regime',''),su.get('price',0),su.get('term',0),su.get('lc116',''),su.get('nbs',''),su.get('cclass','')])
        sheet('Histórico',['Salvo em','Data compra','Tipo','Liquidação','Critério','Cenário','Fornecedor','CNPJ','UF','Regime','Preço base','Prazo (dias)','LC 116','NBS','cClassTrib'],rows)
        # Saída técnica completa para consumo por outros sistemas.
        meta_rows=[]; supplier_detail=[]; result_detail=[]
        def flatten(prefix,obj,out):
            if isinstance(obj,dict):
                for kk,vv in obj.items(): flatten(f"{prefix}.{kk}" if prefix else str(kk),vv,out)
            elif isinstance(obj,list): out[prefix]=json.dumps(obj,ensure_ascii=False,default=str)
            else: out[prefix]=obj
        hist=data if isinstance(data,list) else []
        for qi,x in enumerate(hist,1):
            qid=x.get('savedAt') or f'COT-{qi}'
            meta_rows.append([qid,x.get('savedAt',''),x.get('date',''),x.get('purchaseDate',''),x.get('buyerUF',''),x.get('operationMode',''),x.get('settlement',''),x.get('criterion',''),x.get('ibscbsInIcmsBase',''),x.get('ibscbsInIssBase',''),x.get('radiDate','')])
            sups=x.get('suppliers') or {}
            for sk,su in sups.items():
                if not su: continue
                flat={}; flatten('',su,flat); supplier_detail.append({'Cotacao_ID':qid,'Cenario':sk,**flat})
            for ri,res in enumerate(x.get('results') or [],1):
                flat={}; flatten('',res,flat); result_detail.append({'Cotacao_ID':qid,'Cenario':f'f{ri}',**flat})
        sheet('Cotações',['Cotacao_ID','Salvo em ISO','Salvo em local','Data compra','UF comprador','Tipo','Liquidação','Critério','IBS/CBS BC ICMS','IBS/CBS BC ISS','Data RADI'],meta_rows)
        def dynamic_sheet(name,records):
            if not records:return
            headers=[]
            for rec in records:
                for k in rec:
                    if k not in headers:headers.append(k)
            sheet(name,headers,[[rec.get(h,'') for h in headers] for rec in records])
        dynamic_sheet('Dados Fornecedores',supplier_detail)
        dynamic_sheet('Resultados Calculados',result_detail)
    else:
        suppliers=data.get('suppliers') or []; results=data.get('results') or []
        summary=[]; fiscal=[]; financial=[]; cash=[]; supplier_rows=[]
        for i,su in enumerate(suppliers):
            r=results[i] if i<len(results) else {}; tag=f'F{i+1}'
            summary.append([tag,su.get('name',''),su.get('cnpj',''),su.get('regime',''),su.get('term',0),r.get('priceNF',0),r.get('credits',0),r.get('net',0),r.get('selectedVP',0),r.get('creditUseful',0)])
            supplier_rows.append([tag,su.get('name',''),su.get('cnpj',''),su.get('uf',''),su.get('regime',''),su.get('purpose',''),su.get('ncm',''),su.get('lc116',''),su.get('nbs',''),su.get('cindop',''),su.get('cclass',''),su.get('price',0),su.get('discount',0),su.get('negPct',0),su.get('negValue',0),su.get('term',0)])
            taxes=[('ICMS',r.get('icmsBase',0),r.get('inter',0),r.get('icms',0),r.get('crIcms',0)),('IPI',r.get('base',0),su.get('ipi',0),r.get('ipi',0),r.get('crIpi',0)),('ICMS-ST',r.get('stBase',0),r.get('stAppliedRate',0),r.get('st',0),0),('Dedução ICMS próprio na ST',r.get('icmsBase',0),r.get('inter',0),r.get('stOwnDeduction',0),0),('FCP',r.get('fcpBase',0),su.get('fcp',0),r.get('fcp',0),0),('IBS',r.get('base',0),r.get('ibsRate',0),r.get('ibs',0),r.get('crIbs',0)),('CBS',r.get('base',0),r.get('cbsRate',0),r.get('cbs',0),r.get('crCbs',0)),('IS',r.get('base',0),su.get('is',0),r.get('isv',0),0),('DIFAL',r.get('difalBase',0),r.get('difalRate',0),r.get('difal',0),0)]
            if r.get('mode')=='Serviço':
                taxes=[('ISS',r.get('issBase',0),su.get('issRate',0),r.get('iss',0),0),('IBS',r.get('base',0),r.get('ibsRate',0),r.get('ibs',0),r.get('crIbs',0)),('CBS',r.get('base',0),r.get('cbsRate',0),r.get('cbs',0),r.get('crCbs',0)),('IS',r.get('base',0),su.get('is',0),r.get('isv',0),0),('ISS retido',r.get('issBase',0),su.get('issRate',0),r.get('issWithheld',0),0),('IRRF',r.get('base',0),su.get('irrf',0),r.get('irrf',0),0),('INSS',r.get('base',0),su.get('inss',0),r.get('inss',0),0),('CSLL/Ret. fed.',r.get('base',0),su.get('csll',0),r.get('csll',0),0),('Outras retenções',r.get('base',0),su.get('otherRet',0),r.get('otherRet',0),0)]
            for tx in taxes:fiscal.append([tag,su.get('name',''),*tx])
            for mode,t in (r.get('timing') or {}).items():
                financial.append([tag,su.get('name',''),mode,r.get('vps',{}).get(mode,0),r.get('payment',''),t.get('ext',''),t.get('outflow',''),t.get('cash',''),t.get('benefit',0),t.get('finDays',0)])
            selected=(r.get('timing') or {}).get(data.get('settlement','Normal'),{})
            pay_amount=r.get('supplierPayment',r.get('priceNF',0)) if r.get('mode')=='Serviço' else r.get('priceNF',0)
            cash.append([tag,su.get('name',''),r.get('payment',''),'Pagamento fornecedor',pay_amount])
            if (r.get('cbs',0)+r.get('ibs',0))>0:cash.append([tag,su.get('name',''),selected.get('outflow',''),'Saída IBS/CBS',r.get('cbs',0)+r.get('ibs',0)])
            if r.get('creditUseful',0)>0:cash.append([tag,su.get('name',''),selected.get('cash',''),'Crédito reduz caixa',-r.get('creditUseful',0)])
        inverse_rows=[]
        for i,su in enumerate(suppliers):
            r=results[i] if i<len(results) else {}
            if su.get('calculationBasis')!='Partindo do bruto':continue
            resolved=r.get('resolvedInput') or {}
            inverse_rows.append([f'F{i+1}',su.get('name',''),su.get('grossTarget',0),r.get('priceNF',0),r.get('inverseDifference',0),r.get('base',0),r.get('net',0),resolved.get('price',0),resolved.get('servicePrice',0),resolved.get('materialPrice',0),resolved.get('foreignPrice',0),resolved.get('foreignServicePrice',0),json.dumps(resolved.get('bulkRows') or [],ensure_ascii=False)])
        if inverse_rows:sheet('Cálculo Inverso',['Cenário','Fornecedor','Bruto informado','Bruto recomposto','Diferença','Base encontrada','Custo líquido','Preço entrada encontrado','Serviços encontrados','Materiais encontrados','Valor exterior mercadoria','Valor exterior serviço','Itens resolvidos JSON'],inverse_rows)
        ws=sheet('Resumo Executivo',['Cenário','Fornecedor','CNPJ','Regime','Prazo dias','Preço final NF','Créditos','Custo líquido','VP líquido','Crédito útil'],summary)
        ws.insert_rows(1,6); ws['A1']='Simulador de Compras — Relatório Gerencial'; ws['A1'].font=Font(size=16,bold=True,color=navy); ws.merge_cells(start_row=1,start_column=1,end_row=1,end_column=10)
        meta=[('Versão',data.get('version','3.6.5')),('Gerado em',data.get('generatedAt','')),('Tipo',data.get('operationMode','')),('Liquidação',data.get('settlement','')),('Critério',data.get('criterion',''))]
        for idx,(k,v) in enumerate(meta,2): ws.cell(idx,1,k).font=Font(bold=True,color=navy); ws.cell(idx,2,safe(v))
        sheet('Fornecedores',['Cenário','Fornecedor','CNPJ','UF','Regime','Finalidade','NCM','LC 116','NBS','cIndOp','cClassTrib','Preço base','Desconto','Negociação %','Negociação R$','Prazo dias'],supplier_rows)
        sheet('Fiscal',['Cenário','Fornecedor','Tributo/Retenção','Base','Alíquota','Valor','Crédito'],fiscal)
        sheet('Financeiro',['Cenário','Fornecedor','Modelo','VP total','Pagamento fornecedor','Extinção débito','Saída IBS/CBS','Crédito reduz caixa','Benefício timing','Dias financiamento'],financial)
        ws=sheet('Fluxo de Caixa',['Cenário','Fornecedor','Data','Evento','Valor (+saída / -benefício)'],sorted(cash,key=lambda x:str(x[2])))
        for row in range(2,ws.max_row+1):
            if isinstance(ws.cell(row,5).value,(int,float)) and ws.cell(row,5).value<0:
                ws.cell(row,5).fill=PatternFill('solid',fgColor=green)
    # Memória adicional preserva componentes e premissas sem perder a estrutura gerencial.
    records=data if kind=='history' and isinstance(data,list) else [data]
    trace=[]
    def trace_value(qid,scenario,field,value):
        raw=json.dumps(value,ensure_ascii=False,default=str)
        chunks=[raw[i:i+30000] for i in range(0,len(raw),30000)] or ['']
        for i,chunk in enumerate(chunks,1):trace.append([qid,scenario,field+(f' [parte {i}/{len(chunks)}]' if len(chunks)>1 else ''),chunk])
    for qi,rec in enumerate(records,1):
        for i,res in enumerate(rec.get('results',[]),1):
            for k in ('supplyDate','configRevision','rateSource','goodsComponent','freightComponent','taxEvents','itemResults'):
                if k in res:trace_value(qi,'F'+str(i),k,res[k])
        if rec.get('configSnapshot'):trace_value(qi,'','configSnapshot',rec['configSnapshot'])
    if trace:sheet('Memória e Parâmetros',['Cotação','Cenário','Campo','Conteúdo'],trace)
    out=io.BytesIO(); wb.save(out); return out.getvalue()

def import_quote_xlsx(blob):
    try:
        from openpyxl import load_workbook
    except Exception as e:
        raise RuntimeError('Importação Excel requer o pacote openpyxl instalado.') from e
    with zipfile.ZipFile(io.BytesIO(blob)) as archive:
        if sum(x.file_size for x in archive.infolist())>200*1024*1024:raise ValueError('XLSX excede 200 MB descompactado')
    wb=load_workbook(io.BytesIO(blob),data_only=True,read_only=True)
    norm=lambda x:re.sub(r'[^a-z0-9]+','_',str(x or '').lower().replace('ç','c').replace('ã','a').replace('á','a').replace('é','e').replace('í','i').replace('ó','o').replace('ú','u')).strip('_')
    aliases={
      'cenario':'scenario','fornecedor':'name','cnpj_id_fiscal':'cnpj','cnpj':'cnpj','id_fiscal_exterior':'foreignTaxId','tipo':'operationType','uf':'uf','pais':'country','regime_tributario':'regime','finalidade':'purpose','moeda':'currency','cambio':'exchangeRate','prazo_dias':'term','codigo_item':'itemCode','descricao_item':'itemDescription','quantidade':'quantity','preco_unitario':'unitPrice','valor_total':'price','ncm':'ncm','origem_cst':'origin','cclasstrib':'cclass','frete':'freight','seguro':'insurance','outras_despesas':'other','desconto':'discount','icms_manual':'icmsManual','ipi':'ipi','fcp':'fcp','is':'is','metodo_st':'stMethod','parametro_st':'stParam','aliquota_interna_st':'stRate','metodo_difal':'difalMethod','credito_icms_simples':'simpIcms','credito_cbs_simples':'simpCbs','credito_ibs_simples':'simpIbs','credito_ipi':'ipiCredit','uf_inicio_transporte':'transportStartUF','uf_fim_transporte':'transportEndUF','descricao_servico':'serviceDescription','lc_116':'lc116','nbs':'nbs','cindop':'cindop','valor_servico':'servicePrice','valor_materiais':'materialPrice','cclasstrib_materiais':'materialCclass','iss':'issRate','iss_importacao':'issRate','iss_retido':'issRetained','credito_ibscbs_servico':'serviceCredit','credito_ibscbs':'ibscbsCredit','irrf':'irrf','irrf_importacao':'irrfImport','inss':'inss','csll':'csll','outras_retencoes':'otherRet','valor_exterior':'foreignPrice','valor_servico_exterior':'foreignServicePrice','cambio_aduaneiro':'exchangeRate','frete_internacional':'intlFreight','seguro_internacional':'intlInsurance','ajuste_valor_aduaneiro':'customsAdjustment','data_desembaraco':'clearanceDate','ii':'iiRate','taxa_siscomex':'siscomexFee','afrmm':'afrmm','cide':'cide','cide_importacao':'cideImport','iof_cambio':'iofFx','antidumping':'antidumping','outros_aduaneiros':'otherCustoms','icms_importacao':'icmsImportRate','despesas_locais':'localExpenses','natureza_servico':'serviceNature','despesas_bancarias':'bankExpenses','gross_up_irrf':'grossUp','tratado':'treatyMode','observacao_tratado':'treatyNote'
    }
    aliases.update({'natureza_temporal':'supplyKind','data_emissao':'documentIssueDate','entrega_prevista':'expectedDeliveryDate','exigibilidade':'considerationDueDate','modalidade_frete':'freightMode','tipo_transporte_fob':'freightScope','regime_transportador':'freightRegime','cclasstrib_frete':'freightCclass','inicio_frete':'freightStartDate','fim_frete':'freightEndDate','prazo_frete_dias':'freightTerm','icms_frete':'freightIcms','iss_frete':'freightIss','credito_cbs_simples_frete':'freightSimpCbs','credito_ibs_simples_frete':'freightSimpIbs','credito_icms_simples_frete':'freightSimpIcms','credito_frete':'freightCredit','data_fornecimento':'supplyDate','data_extincao':'taxExtinctionDate','antecipacoes':'advanceSchedule'})
    ui=load_json(SEED_DATA/'import_layout.json',{})
    for fields in ui.get('sheets',{}).values():
        for field in fields:
            aliases[norm(field['label'])]=field['key']
            aliases[norm(field['key'])]=field['key']
    def sheet_records(ws):
        rows=ws.iter_rows(values_only=True);headers=next(rows,None)
        if not headers:return []
        local_aliases={**aliases,**{norm(f['label']):f['key'] for f in ui.get('sheets',{}).get(ws.title,[])}}
        cols=[local_aliases.get(norm(h),norm(h)) for h in headers];out=[]
        for excel_row,vals in enumerate(rows,2):
            if any(v not in (None,'') for v in vals):out.append((excel_row,{cols[i]:v for i,v in enumerate(vals) if i<len(cols) and v not in (None,'')}))
        return out
    masters={}
    if 'Cenarios' in wb.sheetnames:
        for excel_row,raw in sheet_records(wb['Cenarios']):
            try:scenario=int(raw.get('scenario',0))
            except:raise ValueError(f'Aba Cenarios, linha {excel_row}: Cenário inválido.')
            if scenario<1 or scenario>12:raise ValueError(f'Aba Cenarios, linha {excel_row}: Cenário deve estar entre 1 e 12.')
            masters[scenario]={k:v for k,v in raw.items() if k!='scenario'}
    sheet_modes={'Mercadorias':'Mercadoria','CTe':'Mercadoria','Servicos':'Serviço','Servico_Materiais':'Serviço + materiais','Import_Mercadorias':'Importação','Import_Servicos':'Importação de serviços'}
    selected=[(name,mode) for name,mode in sheet_modes.items() if name in wb.sheetnames]
    if not selected and 'Cotacao' in wb.sheetnames:selected=[('Cotacao',None)]
    scenarios={};total=0;sheets_used=[]
    pct_fields={'icmsManual','stRate','ipi','fcp','is','simpIcms','simpCbs','simpIbs','ipiCredit','issRate','irrf','irrfImport','cideImport','iofFx','inss','csll','otherRet','iiRate','icmsImportRate','ibscbsCredit'}
    pct_fields.update({'freightIcms','freightIss','freightSimpCbs','freightSimpIbs','freightSimpIcms'})
    pct_fields.update(f['key'] for fields in ui.get('sheets',{}).values() for f in fields if f.get('type')=='percent')
    num_fields=('freightTerm','price','quantity','unitPrice','freight','insurance','other','discount','term','stParam','servicePrice','materialPrice','foreignPrice','foreignServicePrice','exchangeRate','bankExpenses','intlFreight','intlInsurance','customsAdjustment','siscomexFee','afrmm','cide','antidumping','otherCustoms','localExpenses')
    num_fields=set(num_fields)|{f['key'] for fields in ui.get('sheets',{}).values() for f in fields if f.get('type')=='number'}
    for sheet_name,forced_mode in selected:
      used=False
      for excel_row,detail in sheet_records(wb[sheet_name]):
        try:detail_scenario=int(detail.get('scenario',0))
        except:detail_scenario=0
        raw={**masters.get(detail_scenario,{}),**detail}
        try:scenario=int(raw.get('scenario',0))
        except:raise ValueError(f'Aba {sheet_name}, linha {excel_row}: Cenário inválido.')
        if scenario<1 or scenario>12:raise ValueError(f'Aba {sheet_name}, linha {excel_row}: Cenário deve estar entre 1 e 12.')
        if masters and scenario not in masters:raise ValueError(f'Aba {sheet_name}, linha {excel_row}: cenário {scenario} não cadastrado na aba Cenarios.')
        item={k:v for k,v in raw.items() if k!='scenario'}
        for k in pct_fields:
            if k in item:
                try:
                    v=float(str(item[k]).replace(',','.'))
                except (TypeError,ValueError):
                    raise ValueError(f'Aba {sheet_name}, linha {excel_row}: percentual inválido em {k}. Digite 0,02 para 0,02%, sem o símbolo %.')
                item[k]=v/100
        for k in num_fields:
            if k in item:
                try:item[k]=float(item[k] or 0)
                except:raise ValueError(f'Aba {sheet_name}, linha {excel_row}: valor inválido em {k}.')
        if not item.get('price') and item.get('quantity') is not None and item.get('unitPrice') is not None:item['price']=item['quantity']*item['unitPrice']
        if item.get('clearanceDate') and hasattr(item['clearanceDate'],'date'):item['clearanceDate']=item['clearanceDate'].date().isoformat()
        for key in ('supplyDate','taxExtinctionDate','freightStartDate','freightEndDate','documentIssueDate','expectedDeliveryDate','considerationDueDate'):
            if key in item and hasattr(item[key],'date'):item[key]=item[key].date().isoformat()
        for key,width in [('cclass',6),('materialCclass',6),('freightCclass',6),('ncm',8)]:
            if key in item:
                value=str(item[key]).strip();value=value[:-2] if value.endswith('.0') else value
                digits=re.sub(r'\D','',value)
                if not digits or len(digits)>width:raise ValueError(f'Aba {sheet_name}, linha {excel_row}: código inválido em {key}.')
                item[key]=digits.zfill(width)
        # Canoniza campos de lista exatamente para os mesmos domínios da interface.
        domains={
          'uf':['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'],
          'country':['África do Sul','Alemanha','Argentina','Áustria','Bélgica','Brasil','Canadá','Chile','China','Coreia do Sul','Dinamarca','Emirados Árabes Unidos','Equador','Eslováquia','Espanha','Estados Unidos','Filipinas','Finlândia','França','Hungria','Índia','Irlanda','Israel','Itália','Japão','Luxemburgo','México','Noruega','Países Baixos','Peru','Portugal','Reino Unido','República Tcheca','Rússia','Singapura','Suécia','Suíça','Trinidad e Tobago','Turquia','Ucrânia','Uruguai','Outro'],
          'regime':['Lucro Real','Lucro Presumido','Simples Nacional','Simples + IBS/CBS regular','MEI'],
          'purpose':['Industrialização','Revenda','Contratação de transporte (CT-e)','Ativo imobilizado','Uso e consumo empresarial','Brinde','Bonificação','Doação','Amostra grátis','Uso pessoal','Outra'],
          'origin':['CST 0 — Nacional (regra geral)','CST 1 — Estrangeira: importação direta','CST 2 — Estrangeira: adquirida no mercado interno','CST 3 — Nacional: conteúdo importado >40% e ≤70%','CST 4 — Nacional: PPB','CST 5 — Nacional: conteúdo importado ≤40%','CST 6 — Estrangeira: importação direta sem similar / CAMEX','CST 7 — Estrangeira: mercado interno sem similar / CAMEX','CST 8 — Nacional: conteúdo importado >70%','Manual / exceção'],
          'stMethod':['Não aplicar','MVA ajustado','PMC','PMPF','Pauta / preço fixo'],
          'difalMethod':['Base dupla','Base simples','Não aplicar'],
          'issRetained':['Não','Sim'],'grossUp':['Não','Sim'],
          'currency':['USD','EUR','GBP','JPY','CNY','CHF','CAD','MXN','BRL','Outra'],
          'serviceCredit':['Automático — regra geral','Sim — permitir crédito','Não — bloquear crédito'],
          'serviceNature':['Serviço técnico / assistência técnica','Serviço administrativo','Software / SaaS','Licença / royalty','Consultoria','Marketing / publicidade','Pesquisa e desenvolvimento','Treinamento','Frete internacional','Outro'],
          'treatyMode':['Automático assistido','Não aplicar tratado','Manual / validado pelo Fiscal']
        }
        for fields in ui.get('sheets',{}).values():
            for field in fields:
                if field.get('type')=='select' and field.get('domain') in ui.get('domains',{}):domains[field['key']]=ui['domains'][field['domain']]
        def canonical(field):
            if field not in item or item[field] in (None,''): return
            rawv=str(item[field]).strip(); opts=domains[field]; match=next((x for x in opts if x.casefold()==rawv.casefold()),None)
            if not match: raise ValueError(f'Aba {sheet_name}, linha {excel_row}: valor inválido em {field}: {rawv}. Use a lista suspensa do modelo.')
            item[field]=match
        for fld in domains: canonical(fld)
        cat=load_json(CATALOG,load_json(SEED_DATA/'catalogo_servicos.json',{}))
        for field,kind in [('cclass','cclass'),('materialCclass','cclass'),('freightCclass','cclass'),('lc116','lc116'),('nbs','nbs'),('cindop','cindop')]:
            if item.get(field) and cat.get(kind):
                code=str(item[field]).strip()
                valid={str(x.get('code','')) for x in cat[kind]}
                if code not in valid:raise ValueError(f'Aba {sheet_name}, linha {excel_row}: {field} não encontrado no catálogo: {code}.')
        item['operationType']=forced_mode or str(item.get('operationType') or 'Mercadoria').strip()
        if sheet_name=='CTe':item['purpose']='Contratação de transporte (CT-e)'
        if item['operationType'] not in ('Mercadoria','Importação','Serviço','Serviço + materiais','Importação de serviços'):raise ValueError(f'Aba {sheet_name}, linha {excel_row}: Tipo não reconhecido.')
        required_values={'Mercadoria':['price'],'Serviço':['price'],'Importação':['foreignPrice','exchangeRate'],'Importação de serviços':['foreignServicePrice','exchangeRate'],'Serviço + materiais':['servicePrice','materialPrice']}[item['operationType']]
        for key in required_values:
            if key not in item:raise ValueError(f'Aba {sheet_name}, linha {excel_row}: valor obrigatório ausente: {key}.')
        item.setdefault('purpose','Industrialização');item.setdefault('regime','Lucro Real');item.setdefault('term',0)
        scenarios.setdefault(str(scenario),[]).append(item);total+=1;used=True
      if used:sheets_used.append(sheet_name)
    if not total:raise ValueError('Nenhuma linha encontrada nas abas de cotação. Preencha somente as abas aplicáveis.')
    if len(scenarios)>12:raise ValueError('O arquivo excede o limite de 12 cenários.')
    return {'scenarios':scenarios,'total_rows':total,'scenario_count':len(scenarios),'sheets_used':sheets_used}

def build_import_template_bytes():
    """Gera o modelo usando os mesmos domínios de seleção da interface."""
    from openpyxl import Workbook
    from openpyxl.worksheet.datavalidation import DataValidation
    from openpyxl.styles import Font, PatternFill, Alignment
    from openpyxl.utils import get_column_letter
    wb=Workbook(); wb.remove(wb.active)
    schemas={
      'Cenarios':['Cenário','Fornecedor','CNPJ/ID Fiscal','Tipo','UF','País','Regime Tributário','Finalidade','Moeda','Câmbio','Prazo Dias'],
      'Mercadorias':['Cenário','Código Item','Descrição Item','Quantidade','Preço Unitário','Valor Total','NCM','Origem CST','cClassTrib','Frete','Seguro','Outras Despesas','Desconto','ICMS Manual','IPI','FCP','Método ST','Parâmetro ST','Alíquota Interna ST','Método DIFAL','Crédito ICMS Simples','Crédito CBS Simples','Crédito IBS Simples','Crédito IPI'],
      'CTe':['Cenário','Descrição Serviço','Valor Total','UF Início Transporte','UF Fim Transporte','cClassTrib','ICMS Manual','Crédito ICMS Simples','Crédito CBS Simples','Crédito IBS Simples'],
      'Servicos':['Cenário','Descrição Serviço','LC 116','NBS','cIndOp','cClassTrib','Valor Total','Outras Despesas','Desconto','ISS','ISS Retido','Crédito IBSCBS Serviço','IRRF','INSS','CSLL','Outras Retenções'],
      'Servico_Materiais':['Cenário','Descrição Serviço','LC 116','NBS','cIndOp','cClassTrib','Valor Serviço','Descrição Item','NCM','cClassTrib Materiais','Valor Materiais','Origem CST','ISS','ISS Retido','Crédito IBSCBS Serviço','IPI','FCP','Método ST','Parâmetro ST','Alíquota Interna ST','Método DIFAL'],
      'Import_Mercadorias':['Cenário','Código Item','Descrição Item','Quantidade','Valor Exterior','NCM','cClassTrib','Frete Internacional','Seguro Internacional','Ajuste Valor Aduaneiro','Data Desembaraço','II','IPI','IS','Taxa Siscomex','AFRMM','CIDE','Antidumping','Outros Aduaneiros','ICMS Importação','Despesas Locais'],
      'Import_Servicos':['Cenário','Descrição Serviço','Natureza Serviço','LC 116','NBS','cIndOp','cClassTrib','Valor Serviço Exterior','Despesas Bancárias','Gross-up IRRF','Tratado','IRRF Importação','CIDE Importação','IOF Câmbio','ISS Importação','Crédito IBSCBS','Observação Tratado']}
    ui=load_json(SEED_DATA/'import_layout.json',{})
    if ui.get('sheets'):
        for name,fields in ui['sheets'].items():
            schemas[name]=['Cenário','Código Item','Descrição Item','Quantidade','Preço Unitário']+[f['label'] for f in fields]
    for name in [] if ui.get('sheets') else schemas:
        if name!='Cenarios':schemas[name]+= ['Data Fornecimento','Data Extinção','Antecipações','Natureza Temporal','Data Emissão','Entrega Prevista','Exigibilidade']
    if not ui.get('sheets'):schemas['Mercadorias']+=['Modalidade Frete','Tipo Transporte FOB','Regime Transportador','cClassTrib Frete','Início Frete','Fim Frete','Prazo Frete Dias','ICMS Frete','ISS Frete','Crédito CBS Simples Frete','Crédito IBS Simples Frete','Crédito ICMS Simples Frete','Crédito Frete','UF Início Transporte','UF Fim Transporte']
    class_codes=sorted({str(r['code']) for r in (load_json(CATALOG,{}).get('cclass') or load_json(SEED_DATA/'catalogo_servicos.json',{}).get('cclass') or GOV.read().get('cclass',[])) if r.get('code')})
    lists={
      'cClassTrib':class_codes,
      'Tipo':['Mercadoria','Importação','Serviço','Serviço + materiais','Importação de serviços'],
      'País':['África do Sul','Alemanha','Argentina','Áustria','Bélgica','Brasil','Canadá','Chile','China','Coreia do Sul','Dinamarca','Emirados Árabes Unidos','Equador','Eslováquia','Espanha','Estados Unidos','Filipinas','Finlândia','França','Hungria','Índia','Irlanda','Israel','Itália','Japão','Luxemburgo','México','Noruega','Países Baixos','Peru','Portugal','Reino Unido','República Tcheca','Rússia','Singapura','Suécia','Suíça','Trinidad e Tobago','Turquia','Ucrânia','Uruguai','Outro'],
      'UF':['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'],
      'Regime':['Lucro Real','Lucro Presumido','Simples Nacional','Simples + IBS/CBS regular','MEI'],
      'Finalidade':['Industrialização','Revenda','Contratação de transporte (CT-e)','Ativo imobilizado','Uso e consumo empresarial','Brinde','Bonificação','Doação','Amostra grátis','Uso pessoal','Outra'],
      'Moeda':['USD','EUR','GBP','JPY','CNY','CHF','CAD','MXN','BRL','Outra'],
      'Origem':['CST 0 — Nacional (regra geral)','CST 1 — Estrangeira: importação direta','CST 2 — Estrangeira: adquirida no mercado interno','CST 3 — Nacional: conteúdo importado >40% e ≤70%','CST 4 — Nacional: PPB','CST 5 — Nacional: conteúdo importado ≤40%','CST 6 — Estrangeira: importação direta sem similar / CAMEX','CST 7 — Estrangeira: mercado interno sem similar / CAMEX','CST 8 — Nacional: conteúdo importado >70%','Manual / exceção'],
      'ST':['Não aplicar','MVA ajustado','PMC','PMPF','Pauta / preço fixo'],'DIFAL':['Base dupla','Base simples','Não aplicar'],
      'SimNao':['Não','Sim'],'CreditoServico':['Automático — regra geral','Sim — permitir crédito','Não — bloquear crédito'],
      'Natureza':['Serviço técnico / assistência técnica','Serviço administrativo','Software / SaaS','Licença / royalty','Consultoria','Marketing / publicidade','Pesquisa e desenvolvimento','Treinamento','Frete internacional','Outro'],
      'Tratado':['Automático assistido','Não aplicar tratado','Manual / validado pelo Fiscal']}
    lists.update({'Frete':['CIF — cobrado pelo fornecedor','CIF — já incluso no preço','FOB — contratado pelo comprador'],'EscopoFrete':['Nacional intermunicipal/interestadual','Municipal (ISS)','Iniciado no exterior']})
    catalog=load_json(CATALOG,load_json(SEED_DATA/'catalogo_servicos.json',{}))
    for kind in ('lc116','nbs','cindop'):
        lists[kind]=[str(x['code']) for x in catalog.get(kind,[]) if x.get('code')]
    lists.update(ui.get('domains',{}))
    inst=wb.create_sheet('Instrucoes'); inst.append(['MODELO DE IMPORTAÇÃO — 5.0.4','']); inst.append(['Regra de alíquotas','Digite o número em pontos percentuais, sem símbolo %: 0,02 = 0,02%; 2 = 2%; 18 = 18%.']); inst.append(['Campos com lista','Escolha na lista suspensa; valores divergentes são recusados na importação.']); inst.append(['Consolidação','Cada linha é calculada separadamente; tributos e créditos são somados por cenário.']); inst.append(['ICMS-ST / MVA','Digite a MVA já ajustada em pontos percentuais: 40 = 40%. A calculadora não ajusta a MVA original automaticamente.']); inst.append(['ICMS-ST / preço','Para PMC, PMPF ou pauta, digite a base total da linha em reais. Alíquota Interna ST: 0 usa a alíquota padrão da UF.']); inst.append(['ICMS reduzido','O modelo atual não tem campo de redução da base do ICMS. Não presuma que ICMS Manual representa redução de base.']); inst.column_dimensions['A'].width=26; inst.column_dimensions['B'].width=110
    for c in inst[1]: c.font=Font(bold=True); c.fill=PatternFill('solid',fgColor='D9EAF7')
    ls=wb.create_sheet('_Listas')
    for j,(name,vals) in enumerate(lists.items(),1):
        ls.cell(1,j,name)
        for i,v in enumerate(vals,2): ls.cell(i,j,v)
    ls.sheet_state='hidden'
    from openpyxl.workbook.defined_name import DefinedName
    refs={}
    for j,(name,vals) in enumerate(lists.items(),1):
        defined=f'ListaImportacao{j}'
        wb.defined_names.add(DefinedName(defined,attr_text=f"'_Listas'!${get_column_letter(j)}$2:${get_column_letter(j)}${len(vals)+1}"))
        refs[name]='='+defined
    valmap={
      'Cenarios':{'Tipo':'Tipo','UF':'UF','País':'País','Regime Tributário':'Regime','Finalidade':'Finalidade','Moeda':'Moeda'},
      'Mercadorias':{'cClassTrib':'cClassTrib','Origem CST':'Origem','Método ST':'ST','Método DIFAL':'DIFAL'},
      'CTe':{'cClassTrib':'cClassTrib','UF Início Transporte':'UF','UF Fim Transporte':'UF'},
      'Servicos':{'cClassTrib':'cClassTrib','ISS Retido':'SimNao','Crédito IBSCBS Serviço':'CreditoServico'},
      'Servico_Materiais':{'cClassTrib':'cClassTrib','cClassTrib Materiais':'cClassTrib','Origem CST':'Origem','ISS Retido':'SimNao','Crédito IBSCBS Serviço':'CreditoServico','Método ST':'ST','Método DIFAL':'DIFAL'},
      'Import_Mercadorias':{'cClassTrib':'cClassTrib'},
      'Import_Servicos':{'cClassTrib':'cClassTrib','Natureza Serviço':'Natureza','Gross-up IRRF':'SimNao','Tratado':'Tratado'}}
    valmap['Mercadorias'].update({'Modalidade Frete':'Frete','Tipo Transporte FOB':'EscopoFrete','Regime Transportador':'Regime','cClassTrib Frete':'cClassTrib','Crédito Frete':'CreditoServico','UF Início Transporte':'UF','UF Fim Transporte':'UF'})
    if ui.get('sheets'):
        valmap={}
        for name,fields in ui['sheets'].items():
            valmap[name]={f['label']:f['domain'] for f in fields if f.get('domain') in refs}
    pct_headers={f['label'] for fields in ui.get('sheets',{}).values() for f in fields if f.get('type')=='percent'}
    legacy_pct_headers={'ICMS Frete','ISS Frete','Crédito CBS Simples Frete','Crédito IBS Simples Frete','Crédito ICMS Simples Frete','ICMS Manual','Alíquota Interna ST','IPI','FCP','Crédito ICMS Simples','Crédito CBS Simples','Crédito IBS Simples','Crédito IPI','ISS','IRRF','INSS','CSLL','Outras Retenções','II','IS','ICMS Importação','IRRF Importação','CIDE Importação','IOF Câmbio','ISS Importação','Crédito IBSCBS','Crédito IBSCBS Serviço'}
    for sn,headers in schemas.items():
        ws=wb.create_sheet(sn); ws.append(headers); ws.freeze_panes='F2'; ws.row_dimensions[1].height=62; ws.auto_filter.ref=f'A1:{get_column_letter(len(headers))}1'
        for cell in ws[1]: cell.font=Font(bold=True); cell.fill=PatternFill('solid',fgColor='D9EAF7'); cell.alignment=Alignment(wrap_text=True)
        for field in ui.get('sheets',{}).get(sn,[]):
            if field.get('type') in ('cclass','catalog') or field['key'] in ('ncm','cnpj','foreignTaxId'):
                j=headers.index(field['label'])+1
                for row in range(2,101):ws.cell(row,j).number_format='@'
        for j,h in enumerate(headers,1): ws.column_dimensions[get_column_letter(j)].width=min(max(len(h)+3,12),28)
        for h,listname in valmap.get(sn,{}).items():
            col=headers.index(h)+1; dv=DataValidation(type='list',formula1=refs[listname],allow_blank=True); dv.error='Selecione uma opção da lista.'; dv.errorTitle='Valor inválido'; dv.showErrorMessage=True; dv.showInputMessage=True; dv.prompt='Escolha uma opção da lista.'; ws.add_data_validation(dv); dv.add(f'{get_column_letter(col)}2:{get_column_letter(col)}5000')
    # Template is blank: no sample supplier or taxable transaction is imported accidentally.
    for sn,headers in schemas.items():
        ws=wb[sn]
        for j,h in enumerate(headers,1):
            if h in pct_headers:
                ws.cell(2,j).number_format='0.0000'
    bio=io.BytesIO(); wb.save(bio); return bio.getvalue()

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*a,**kw): super().__init__(*a,directory=str(WEB),**kw)
    def log_message(self,*a): pass
    def end_headers(self):
        self.send_header('Cache-Control','no-store, no-cache, must-revalidate, max-age=0'); self.send_header('Pragma','no-cache'); self.send_header('Expires','0'); super().end_headers()
    def send_json(self,obj,status=200):
        b=json.dumps(obj,ensure_ascii=False).encode(); self.send_response(status); self.send_header('Content-Type','application/json; charset=utf-8'); self.send_header('Content-Length',str(len(b))); self.end_headers(); self.wfile.write(b)
    def send_file(self,b,filename):
        self.send_response(200); self.send_header('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); self.send_header('Content-Disposition',f'attachment; filename="{filename}"'); self.send_header('Content-Length',str(len(b))); self.end_headers(); self.wfile.write(b)
    def body(self):
        try:return json.loads(self.rfile.read(int(self.headers.get('Content-Length','0') or 0)) or b'{}')
        except:return {}
    def auth(self,admin=False):
        tok=self.headers.get('Authorization','').replace('Bearer ',''); s=SESSIONS.get(tok)
        if not s:return None
        if time.time()-s.get('last',0)>28800:SESSIONS.pop(tok,None); return None
        if s.get('role')=='ADMIN' and (time.time()>s.get('admin_until',0) or not KEYS.valid(s,windows_identity())):
            s['role']='LEITOR'
        if admin and s.get('role')!='ADMIN':return None
        return s
    def key_session(self):
        s=self.auth()
        if not s:return None
        if time.time()>s.get('admin_until',0) or not KEYS.valid(s,windows_identity(),True):return None
        return s
    def save_history(self,path,records):
        fd,name=tempfile.mkstemp(prefix='history_',suffix='.tmp',dir=path.parent)
        try:
            with os.fdopen(fd,'w',encoding='utf-8') as f:json.dump(records,f,ensure_ascii=False)
            os.replace(name,path)
        finally:
            if os.path.exists(name):os.unlink(name)
    def valid_request(self):
        host=self.headers.get('Host','')
        origin=self.headers.get('Origin')
        return host==f'127.0.0.1:{PORT}' and (not origin or origin==f'http://127.0.0.1:{PORT}') and (not urlparse(self.path).path.startswith('/api/') or secrets.compare_digest(self.headers.get('X-Launch-Token',''),LAUNCH_TOKEN))
    def history_path(self,u):
        key=hashlib.sha256((windows_identity()+'|'+ACCESS_MODE+'|'+u['username']).encode()).hexdigest()
        folder=DATA/'historicos';folder.mkdir(exist_ok=True)
        return folder/(key+'.json')
    def do_GET(self):
        if not self.valid_request():return self.send_json({'error':'Origem inválida'},403)
        p=urlparse(self.path).path
        if p=='/api/bootstrap':
            if ACCESS_MODE!='direct':return self.send_json({'mode':'login'})
            identity=windows_identity()
            if not identity:return self.send_json({'error':'Acesso direto exige identidade Windows.'},403)
            u={'id':0,'username':identity,'display_name':identity,'role':'LEITOR','active':True}
            tok=secrets.token_urlsafe(32); SESSIONS[tok]={**u,'last':time.time()}
            return self.send_json({'mode':'direct','token':tok,'user':u})
        if p=='/api/key/status':
            return self.send_json({**KEYS.status(windows_identity()),'windows_identity':windows_identity()})
        if p=='/api/keys':
            if not self.auth(True):return self.send_json({'error':'Acesso negado'},403)
            try:return self.send_json({'users':KEYS.list_users()})
            except OSError:return self.send_json({'error':'Base administrativa indisponível'},503)
        if p=='/api/config':
            return self.send_json(GOV.read())
        if p=='/api/history':
            u=self.auth()
            if not u:return self.send_json({'error':'Acesso negado'},403)
            return self.send_json({'history':load_json(self.history_path(u),[])})
        if p=='/api/me':
            u=self.auth(); return self.send_json({'ok':bool(u),'user':u},200 if u else 401)
        if p=='/api/users':
            if not self.auth(True):return self.send_json({'error':'Acesso negado'},403)
            with db() as c: rows=c.execute('SELECT * FROM users ORDER BY role,display_name').fetchall()
            return self.send_json({'users':[user_public(r) for r in rows]})
        if p=='/api/version':return self.send_json({'version':APP_VERSION,'access_mode':ACCESS_MODE})
        if p=='/api/catalog':
            cat=load_json(CATALOG,{})
            return self.send_json(cat if valid_catalog(cat) else load_json(SEED_DATA/'catalogo_servicos.json',{}))
        if p=='/api/catalog/status':
            cur=load_json(CATALOG,{}); pend=load_json(PENDING,None); aut=load_json(AUTOSTATUS,{})
            return self.send_json({'current':{'versions':cur.get('versions',{}),'checked_at':cur.get('checked_at'),'updated_at':cur.get('updated_at'),'update_mode':cur.get('update_mode','manual'),'counts':catalog_counts(cur)},'auto':aut,'pending':None if not pend else {'versions':pend.get('versions',{}),'checked_at':pend.get('checked_at'),'errors':pend.get('errors',[]),'counts':catalog_counts(pend)}})
        if p=='/api/import/template':
            if not self.auth():return self.send_json({'error':'Acesso negado'},403)
            try:return self.send_file(build_import_template_bytes(),'Modelo_Importacao_Cotacoes_Por_Tipo.xlsx')
            except Exception as e:return self.send_json({'error':'Falha ao gerar modelo: '+str(e)},500)
        return super().do_GET()
    def do_POST(self):
        if not self.valid_request():return self.send_json({'error':'Origem inválida'},403)
        p=urlparse(self.path).path
        if p=='/api/import/excel':
            if not self.auth():return self.send_json({'error':'Acesso negado'},403)
            try:
                size=int(self.headers.get('Content-Length','0') or 0)
                if size<=0:return self.send_json({'error':'Arquivo vazio.'},400)
                if size>25*1024*1024:return self.send_json({'error':'Arquivo excede 25 MB.'},413)
                return self.send_json(import_quote_xlsx(self.rfile.read(size)))
            except Exception as e:return self.send_json({'error':'Falha ao importar: '+str(e)},400)
        if int(self.headers.get('Content-Length','0') or 0)>25*1024*1024:return self.send_json({'error':'Requisição excede 25 MB'},413)
        d=self.body()
        if not isinstance(d,dict):return self.send_json({'error':'Objeto JSON obrigatório'},400)
        if p in ('/api/key/initialize','/api/key/login','/api/key/recover','/api/key/password','/api/key/recovery-code','/api/keys'):
            try:
                identity=windows_identity()
                if p=='/api/key/initialize':return self.send_json(KEYS.initialize(d,identity),201)
                if p=='/api/key/recover':return self.send_json(KEYS.recover(d,identity))
                if p=='/api/key/login':
                    s=self.auth()
                    if not s:return self.send_json({'error':'Entre no simulador antes de autenticar a área restrita'},403)
                    k=KEYS.authenticate(d.get('username',''),d.get('password',''),identity)
                    s.update({'key_username':k['username'],'key_epoch':k['epoch'],'vault_epoch':k['vault_epoch'],'admin_until':time.time()+1800,'role':'LEITOR' if k['must_change'] else 'ADMIN'})
                    return self.send_json({'ok':True,'must_change':k['must_change'],'user':s})
                if p=='/api/key/password':
                    s=self.key_session()
                    if not s:return self.send_json({'error':'Sessão administrativa inválida'},403)
                    result=KEYS.change_password(s,identity,d.get('current_password',''),d.get('password',''));s['role']='LEITOR';s['admin_until']=0
                    return self.send_json(result)
                s=self.auth(True)
                if not s:return self.send_json({'error':'Acesso negado'},403)
                if p=='/api/key/recovery-code':return self.send_json(KEYS.rotate_recovery(s,identity))
                return self.send_json(KEYS.mutate(d.get('action'),d,s['key_username'],identity,s))
            except PermissionError as e:return self.send_json({'error':str(e)},403)
            except (ValueError,KeyError) as e:return self.send_json({'error':str(e)},400)
            except OSError:return self.send_json({'error':'Não foi possível acessar a base administrativa compartilhada. Verifique permissões e disponibilidade.'},503)
        if p=='/api/key/exit':
            s=self.auth()
            if s:s['role']='LEITOR';s['admin_until']=0
            return self.send_json({'ok':True})
        if p=='/api/config':
            u=self.auth(True)
            if not u:return self.send_json({'error':'Acesso negado'},403)
            try:return self.send_json(GOV.save(d,u.get('key_username',''),authorized=True))
            except Exception as e:return self.send_json({'error':str(e)},400)
        if p in ('/api/history','/api/history/append','/api/history/delete'):
            u=self.auth()
            if not u:return self.send_json({'error':'Acesso negado'},403)
            path=self.history_path(u)
            try:
                # Lock de pasta coordena instâncias do mesmo histórico, sem truncar registros.
                with GOV.lock:
                    marker=path.with_suffix('.lock')
                    try:marker.mkdir()
                    except FileExistsError:return self.send_json({'error':'Histórico em atualização; tente novamente.'},409)
                    try:
                        records=load_json(path,[])
                        if p.endswith('/append'):
                            record=d.get('record')
                            if not isinstance(record,dict) or not record.get('savedAt'):return self.send_json({'error':'Simulação inválida'},400)
                            records=[record]+records
                        elif p.endswith('/delete'):
                            key=d.get('savedAt')
                            if not key:return self.send_json({'error':'Identificador obrigatório'},400)
                            records=[r for r in records if r.get('savedAt')!=key]
                        else:
                            records=d.get('history')
                            if not isinstance(records,list):return self.send_json({'error':'Histórico inválido'},400)
                        self.save_history(path,records)
                    finally:marker.rmdir()
                return self.send_json({'ok':True,'count':len(records)})
            except OSError:return self.send_json({'error':'Não foi possível salvar o histórico local'},500)
        if p=='/api/export/excel':
            if not self.auth():return self.send_json({'error':'Acesso negado'},403)
            try:
                b=excel_bytes(d); kind=d.get('kind','simulation'); fn=('Historico_Cotacoes.xlsx' if kind=='history' else 'Relatorio_Cotacao.xlsx'); return self.send_file(b,fn)
            except Exception as e:return self.send_json({'error':'Falha ao gerar Excel: '+str(e)},500)
        if p=='/api/login':
            if ACCESS_MODE=='direct':return self.send_json({'error':'Use o acesso Windows'},403)
            with db() as c:r=c.execute('SELECT * FROM users WHERE username=?',(str(d.get('username','')).strip(),)).fetchone()
            if not r or not r['active']:return self.send_json({'error':'Usuário ou senha inválidos.'},401)
            _,h=hash_pw(str(d.get('password','')),r['salt'])
            if not secrets.compare_digest(h,r['password_hash']):return self.send_json({'error':'Usuário ou senha inválidos.'},401)
            tok=secrets.token_urlsafe(32); u=user_public(r); u['role']='LEITOR'; SESSIONS[tok]={**u,'last':time.time()}; return self.send_json({'token':tok,'user':u})
        if p=='/api/register':
            username=str(d.get('username','')).strip()
            name=str(d.get('display_name','')).strip() or username
            password=str(d.get('password',''))
            confirm=str(d.get('confirm_password',''))
            if len(username)<3:return self.send_json({'error':'Informe um usuário com pelo menos 3 caracteres.'},400)
            if not re.fullmatch(r'[A-Za-z0-9._@-]+',username):return self.send_json({'error':'Use somente letras, números, ponto, hífen, sublinhado ou @ no usuário.'},400)
            if len(password)<8:return self.send_json({'error':'A senha precisa ter pelo menos 8 caracteres.'},400)
            if password!=confirm:return self.send_json({'error':'As senhas não conferem.'},400)
            s,h=hash_pw(password)
            try:
                with db() as c:
                    c.execute('INSERT INTO users(username,display_name,role,salt,password_hash,active,windows_owner) VALUES(?,?,?,?,?,1,?)',(username,name,'LEITOR',s,h,windows_identity()))
            except sqlite3.IntegrityError:return self.send_json({'error':'Esse usuário já está cadastrado neste computador.'},400)
            return self.send_json({'ok':True,'message':'Cadastro realizado. Use seu usuário e senha para entrar.'},201)
        if p in ('/api/profile/password','/api/profile/recover'):
            if p.endswith('/password'):
                a=self.auth()
                if not a:return self.send_json({'error':'Acesso negado'},403)
                username=a['username']
            else:username=str(d.get('username','')).strip()
            with db() as c:
                r=c.execute('SELECT * FROM users WHERE username=?',(username,)).fetchone()
                if not r or not r['active']:return self.send_json({'error':'Acesso indisponível.'},403)
                if p.endswith('/recover'):
                    if not windows_identity() or r['windows_owner']!=windows_identity():return self.send_json({'error':'Recuperação disponível somente na identidade Windows que cadastrou este usuário.'},403)
                else:
                    _,old=hash_pw(str(d.get('current_password','')),r['salt'])
                    if not secrets.compare_digest(old,r['password_hash']):return self.send_json({'error':'Senha atual incorreta.'},400)
                pw=str(d.get('password',''))
                if len(pw)<8 or pw!=d.get('confirm_password'):return self.send_json({'error':'Use ao menos 8 caracteres e confirme a mesma senha.'},400)
                salt,h=hash_pw(pw)
                c.execute('UPDATE users SET salt=?,password_hash=? WHERE id=?',(salt,h,r['id']))
            for tok in list(SESSIONS):
                if SESSIONS[tok]['id']==r['id']:SESSIONS.pop(tok,None)
            return self.send_json({'ok':True,'message':'Senha atualizada. Entre novamente.'})
        if p=='/api/logout':
            tok=self.headers.get('Authorization','').replace('Bearer ',''); SESSIONS.pop(tok,None); return self.send_json({'ok':True})
        if p=='/api/catalog/check':
            if not self.auth(True):return self.send_json({'error':'Acesso negado'},403)
            try:
                found=discover_sources(); pend=build_pending(found); return self.send_json({'ok':True,'pending':{'versions':pend.get('versions',{}),'counts':{k:len(pend.get(k,[])) for k in ('lc116','nbs','cindop','correlations','cclass')},'errors':pend.get('errors',[])}})
            except Exception as e:return self.send_json({'error':'Não foi possível consultar as fontes oficiais: '+str(e)},502)
        if p=='/api/catalog/apply':
            if not self.auth(True):return self.send_json({'error':'Acesso negado'},403)
            pend=load_json(PENDING,None)
            if not pend:return self.send_json({'error':'Nenhuma atualização preparada.'},400)
            if not valid_catalog(pend):return self.send_json({'error':'Atualização preparada está incompleta. Catálogo atual preservado.'},400)
            atomic_apply_catalog(pend, mode='manual')
            pend=load_json(CATALOG,pend)
            try:PENDING.unlink()
            except:pass
            return self.send_json({'ok':True,'catalog':pend})
        if p=='/api/users':
            if not self.auth(True):return self.send_json({'error':'Acesso negado'},403)
            username=str(d.get('username','')).strip(); name=str(d.get('display_name','')).strip() or username; password=str(d.get('password',''))
            if len(username)<3 or len(password)<6:return self.send_json({'error':'Usuário mínimo 3 caracteres e senha mínimo 6.'},400)
            s,h=hash_pw(password)
            try:
                with db() as c:c.execute('INSERT INTO users(username,display_name,role,salt,password_hash,active) VALUES(?,?,?,?,?,1)',(username,name,'LEITOR',s,h))
            except sqlite3.IntegrityError:return self.send_json({'error':'Esse usuário já existe.'},400)
            return self.send_json({'ok':True})
        if p.startswith('/api/users/'):
            a=self.auth(True)
            if not a:return self.send_json({'error':'Acesso negado'},403)
            try:uid=int(p.split('/')[3])
            except:return self.send_json({'error':'ID inválido'},400)
            action=d.get('action')
            with db() as c:
                target=c.execute('SELECT * FROM users WHERE id=?',(uid,)).fetchone()
                if not target:return self.send_json({'error':'Usuário não encontrado'},404)
                if target['role']=='ADMIN' and action in ('toggle','delete'):return self.send_json({'error':'O administrador principal não pode ser desativado/excluído.'},400)
                if action=='toggle':c.execute('UPDATE users SET active=? WHERE id=?',(0 if target['active'] else 1,uid))
                elif action=='password':
                    pw=str(d.get('password',''))
                    if len(pw)<6:return self.send_json({'error':'Senha deve ter ao menos 6 caracteres.'},400)
                    s,h=hash_pw(pw); c.execute('UPDATE users SET salt=?,password_hash=? WHERE id=?',(s,h,uid))
                elif action=='delete':c.execute('DELETE FROM users WHERE id=?',(uid,))
                else:return self.send_json({'error':'Ação inválida'},400)
            for token,session in list(SESSIONS.items()):
                if session.get('id')==uid:SESSIONS.pop(token,None)
            return self.send_json({'ok':True})
        return self.send_json({'error':'Rota não encontrada'},404)

def can_reuse_instance(existing):
    return existing.get('version')==APP_VERSION and existing.get('access_mode')==ACCESS_MODE

def open_browser(): webbrowser.open(URL)
if __name__=='__main__':
    ok,security_message=validate_corporate_environment()
    if not ok:
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(0,security_message,'Simulador de Compras — acesso bloqueado',0x10)
        except Exception:print(security_message)
        raise SystemExit(3)
    ensure_seed_data(); init_db(); os.chdir(ROOT)
    instance=DATA/'instance.json'
    try:
        previous=load_json(instance,{})
        previous_url=previous['url']
        parsed=urlparse(previous_url)
        if parsed.hostname=='127.0.0.1' and parsed.scheme=='http':
            request=urllib.request.Request(previous_url.split('#')[0].split('?')[0]+'api/version',headers={'X-Launch-Token':previous['launch_token']})
            with urllib.request.urlopen(request,timeout=1) as response:existing=json.loads(response.read())
            if can_reuse_instance(existing):
                webbrowser.open(previous_url.replace('#launch=','&adminRecovery=1#launch=') if '--recover-admin' in sys.argv and 'adminRecovery=1' not in previous_url else previous_url);raise SystemExit(0)
    except (KeyError,OSError,ValueError):pass
    try:
        server=ThreadingHTTPServer((HOST,PORT),Handler)
    except OSError as e:
        raise SystemExit('Não foi possível iniciar o servidor local: '+str(e))
    PORT=server.server_address[1]
    URL=f'http://127.0.0.1:{PORT}/?v=5.0.4'+('&adminRecovery=1' if '--recover-admin' in sys.argv else '')+'#launch='+LAUNCH_TOKEN
    instance.write_text(json.dumps({'url':URL,'launch_token':LAUNCH_TOKEN}),encoding='utf-8')
    if GOV.policy().get('automatic_catalog_updates',False):threading.Thread(target=auto_update_catalog,daemon=True).start()
    threading.Timer(.8,open_browser).start()
    try:server.serve_forever()
    except KeyboardInterrupt:pass
