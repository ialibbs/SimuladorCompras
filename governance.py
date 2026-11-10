"""Configuração fiscal externa, validação e trilha de publicação; sem execução de regras."""
import json, os, hashlib, threading, tempfile
from contextlib import contextmanager
from pathlib import Path
from datetime import datetime, timezone
class Governance:
    def __init__(self,folder):
        self.folder=Path(folder);self.rules_folder=self.folder/'config';self.lock=threading.RLock()
    def policy(self):
        return json.loads((self.folder/'governance.json').read_text(encoding='utf-8'))
    def read(self):
        return json.loads((self.rules_folder/'fiscal_rules.json').read_text(encoding='utf-8'))
    def validate(self,c):
        if not isinstance(c,dict) or c.get('schema')!=1:raise ValueError('Schema fiscal inválido')
        if not isinstance(c.get('params'),dict) or not isinstance(c.get('rules'),dict):raise ValueError('params e rules obrigatórios')
        for k,v in c['params'].items():
            if isinstance(v,bool) or not isinstance(v,(int,float)) or not 0<=v<=100000:raise ValueError('Parâmetro inválido: '+k)
        for k in ('cbs_effective','ibs_state','ibs_municipal','credit_utilization'):
            if not 0<=c['params'].get(k,-1)<=1:raise ValueError('Percentual inválido: '+k)
        if not isinstance(c['rules'].get('rate_periods'),list):raise ValueError('Vigências devem ser lista')
        periods=sorted(c['rules']['rate_periods'],key=lambda x:x['from'])
        previous=''
        for x in periods:
            start=datetime.strptime(x['from'],'%Y-%m-%d');end=datetime.strptime(x['to'],'%Y-%m-%d')
            if start>end or x['from']<=previous:raise ValueError('Vigências sobrepostas ou invertidas')
            previous=x['to']
            for k in ('cbs_effective','ibs_state','ibs_municipal'):
                if not isinstance(x.get(k),(int,float)) or not 0<=x[k]<1:raise ValueError('Alíquota da vigência inválida')
            if not x.get('source'):raise ValueError('Fonte da vigência obrigatória')
        for k,v in c['rules'].get('internal_rates',{}).items():
            if not isinstance(v,(int,float)) or not 0<=v<1:raise ValueError('Alíquota interna inválida')
        for k in ('interstate_7','interstate_12','imported_4'):
            if not 0<=c['rules'].get(k,-1)<1:raise ValueError('Regra interestadual inválida')
        for x in c.get('cclass',[]):
            if not x.get('code') or not 0<=x.get('reduction',0)<=1:raise ValueError('cClassTrib inválido')
        rules=c['rules']
        overrides=rules.get('cclass_overrides',{})
        if not isinstance(overrides,dict):raise ValueError('cclass_overrides deve ser tabela')
        for code,changes in overrides.items():
            if len(code)!=6 or not code.isdigit() or not isinstance(changes,dict):raise ValueError('Exceção cClassTrib inválida')
            if set(changes)-{'reduction','reductionIbs','reductionCbs','treatment'}:raise ValueError('Campo de exceção não permitido')
            for key,value in changes.items():
                if key=='treatment':
                    if not isinstance(value,str) or len(value)>200:raise ValueError('Tratamento inválido')
                elif isinstance(value,bool) or not isinstance(value,(int,float)) or not 0<=value<=1:raise ValueError('Redução inválida')

        products=rules.get('product_tax_rules',[])
        if not isinstance(products,list) or len(products)>5000:raise ValueError('Tabela de regras diferenciadas inválida (máximo 5.000)')
        allowed={'ncm','cclass','operationType','from','to','source','cbsRate','ibsRate','reductionCbs','reductionIbs','icmsRate','ipiRate','isRate','fcpRate','iiRate','issRate'}
        numeric={'cbsRate','ibsRate','reductionCbs','reductionIbs','icmsRate','ipiRate','isRate','fcpRate','iiRate','issRate'}
        import re, math
        for row in products:
            if not isinstance(row,dict) or set(row)-allowed:raise ValueError('Campo de regra diferenciada inválido')
            if not row.get('ncm') and not row.get('cclass'):raise ValueError('Informe NCM e/ou cClassTrib para a regra diferenciada')
            for key,width in [('ncm',8),('cclass',6)]:
                if row.get(key) and (not isinstance(row[key],str) or not re.fullmatch(r'\d{'+str(width)+'}',row[key])):raise ValueError('Código inválido: '+key)
            if row.get('operationType','') not in ('','Mercadoria','Serviço','Importação','Importação de serviços'):raise ValueError('Operação inválida na regra diferenciada')
            try:
                start=datetime.strptime(row['from'],'%Y-%m-%d');end=datetime.strptime(row['to'],'%Y-%m-%d')
                if start>end:raise ValueError()
            except (KeyError,TypeError,ValueError):raise ValueError('Vigência inválida na regra diferenciada')
            if not isinstance(row.get('source'),str) or not row['source'].strip():raise ValueError('Fundamento obrigatório na regra diferenciada')
            if not numeric.intersection(row):raise ValueError('Informe ao menos uma alíquota ou redução diferenciada')
            for key in numeric.intersection(row):
                value=row[key]
                if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or not 0<=value<=1:raise ValueError('Percentual diferenciado inválido: '+key)
            if row.get('icmsRate',0)>=1:raise ValueError('ICMS específico deve ser menor que 100%')
            for tax in ('cbs','ibs'):
                if tax+'Rate' in row and ('reductionCbs' if tax=='cbs' else 'reductionIbs') in row:raise ValueError('Use alíquota final OU redução para cada tributo')
        for i,a in enumerate(products):
            for b in products[i+1:]:
                same_domain=all(not a.get(k) or not b.get(k) or a[k]==b[k] for k in ('ncm','cclass','operationType'))
                if same_domain and a['from']<=b['to'] and b['from']<=a['to']:raise ValueError('Regras diferenciadas sobrepostas; segregar NCM, classificação, operação ou vigência')

        for key in ('blocked_credit_purposes','difal_purposes'):
            if not isinstance(rules.get(key),list) or not all(isinstance(x,str) for x in rules[key]):raise ValueError('Lista inválida: '+key)
        if not isinstance(rules.get('mg_import_zero'),bool):raise ValueError('mg_import_zero deve ser true ou false')
        if not isinstance(rules.get('internal_rates'),dict):raise ValueError('internal_rates deve ser tabela')
        for k,v in rules.get('icms_due_days',{}).items():
            if not isinstance(v,int) or not 1<=v<=28:raise ValueError('Dia ICMS inválido')
        if not isinstance(rules.get('ipi_due_day'),int) or not 1<=rules['ipi_due_day']<=28:raise ValueError('Dia IPI inválido')
        return c
    @contextmanager
    def publication_lock(self):
        lock=self.rules_folder/'.fiscal_publication_lock'
        try:lock.mkdir()
        except FileExistsError:raise ValueError('Outra publicação em andamento; tente novamente. Se persistir, TI deve verificar o bloqueio abandonado.')
        try:yield
        finally:lock.rmdir()
    def save(self,request,identity,authorized=False):
        if not authorized:raise PermissionError('Autenticação de usuário-chave obrigatória')
        with self.lock, self.publication_lock():
            current=self.read()
            if request.get('expected_revision')!=current['revision']:raise ValueError('Configuração mudou; recarregue antes de salvar')
            candidate=self.validate(request['config'])
            candidate['revision']=current['revision']+1
            candidate['published_at']=datetime.now(timezone.utc).isoformat();candidate['published_by']=identity
            raw=json.dumps(candidate,ensure_ascii=False,indent=2)
            archive=self.rules_folder/'config_audit';archive.mkdir(exist_ok=True)
            # A revisão é arquivada antes da substituição. A ACL de rede controla publicadores.
            stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f')
            (archive/(stamp+'.json')).write_text(json.dumps({'before':current,'after':candidate,'sha256':hashlib.sha256(raw.encode()).hexdigest()},ensure_ascii=False,indent=2),encoding='utf-8')
            fd,name=tempfile.mkstemp(prefix='fiscal_',suffix='.tmp',dir=self.rules_folder)
            try:
                with os.fdopen(fd,'w',encoding='utf-8') as f:f.write(raw)
                os.replace(name,self.rules_folder/'fiscal_rules.json')
            finally:
                if os.path.exists(name):os.unlink(name)
            return candidate
