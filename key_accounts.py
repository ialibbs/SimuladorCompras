"""Contas-chave individuais e recuperação, compartilhadas entre os dois inicializadores.
A proteção física dos arquivos depende das ACLs do compartilhamento corporativo.
"""
import json, os, time, secrets, hashlib, re, tempfile, threading, shutil
from pathlib import Path
from contextlib import contextmanager
from datetime import datetime, timezone

class KeyAccounts:
    iterations=600000
    def __init__(self,folder,initial_identities):
        self.folder=Path(folder); self.path=self.folder/'key_accounts.json'
        self.initial={x.casefold() for x in initial_identities}; self.lock=threading.RLock()
    def read(self):
        if not self.path.exists():return None
        with self.path.open(encoding='utf-8') as f:return json.load(f)
    @contextmanager
    def transaction(self):
        self.folder.mkdir(parents=True,exist_ok=True)
        with self.lock:
            marker=self.folder/'.key_accounts_lock'
            try:marker.mkdir()
            except FileExistsError:raise ValueError('Administração de acessos em atualização; tente novamente.')
            try:yield
            finally:marker.rmdir()
    def digest(self,password,salt=None):
        salt=salt or secrets.token_hex(16)
        return {'salt':salt,'hash':hashlib.pbkdf2_hmac('sha256',password.encode(),bytes.fromhex(salt),self.iterations).hex()}
    def verify(self,password,hashed):
        return secrets.compare_digest(self.digest(password,hashed['salt'])['hash'],hashed['hash'])
    def write(self,state,actor,action,detail):
        item={'at':datetime.now(timezone.utc).isoformat(),'actor':actor,'action':action,'detail':detail}
        state.setdefault('audit',[]).append(item);state['revision']=state.get('revision',0)+1
        fd,name=tempfile.mkstemp(prefix='keys_',suffix='.tmp',dir=self.folder)
        try:
            with os.fdopen(fd,'w',encoding='utf-8') as f:json.dump(state,f,ensure_ascii=False,indent=2)
            if self.path.exists():shutil.copy2(self.path,self.folder/'key_accounts.previous.json')
            os.replace(name,self.path)
        finally:
            if os.path.exists(name):os.unlink(name)
    @staticmethod
    def public(user):
        return {k:user[k] for k in ('username','display_name','windows_identity','active','epoch')}
    def status(self,identity):
        identity=identity.casefold()
        try:
            state=self.read()
            if state is None:return {'eligible':bool(identity and identity in self.initial),'initialize':bool(identity and identity in self.initial)}
            return {'eligible':any(u['active'] and u['windows_identity']==identity for u in state['users']),'initialize':False}
        except PermissionError:return {'eligible':False,'initialize':False}
    def credentials(self,data,identity):
        username=str(data.get('username','')).strip().casefold()
        if not re.fullmatch(r'[a-z0-9._@-]{3,80}',username):raise ValueError('Usuário-chave: use 3 a 80 letras, números, ponto, @, hífen ou sublinhado.')
        password=str(data.get('password',''))
        if len(password)<12 or len(password)>256:raise ValueError('Senha de usuário-chave: use 12 a 256 caracteres.')
        owner=str(data.get('windows_identity') or identity).strip().casefold()
        if not re.fullmatch(r'[^\\\s]{1,100}\\[^\\\s]{1,100}',owner):raise ValueError('Informe a identidade corporativa no formato DOMÍNIO\\usuário.')
        if not identity:raise PermissionError('Identidade Windows indisponível.')
        return {'username':username,'display_name':str(data.get('display_name') or username).strip()[:120],'windows_identity':owner,'active':True,'epoch':1,'password':self.digest(password),'must_change':bool(data.get('must_change',False))}
    def initialize(self,data,identity):
        if identity.casefold() not in self.initial:raise PermissionError('Ativação inicial reservada ao responsável designado.')
        user=self.credentials({**data,'windows_identity':identity,'must_change':False},identity)
        with self.transaction():
            if self.read() is not None:raise ValueError('Administração já ativada. Utilize entrar ou recuperar.')
            code=secrets.token_urlsafe(32)
            state={'schema':1,'revision':0,'epoch':1,'users':[user],'recovery':self.digest(code),'failures':{},'audit':[]}
            self.write(state,user['username'],'initialize',{'username':user['username']})
        return {'user':self.public(user),'recovery_code':code}
    def check_throttle(self,state,key):
        failure=state.get('failures',{}).get(key,{})
        if failure.get('until',0)>time.time():raise PermissionError('Muitas tentativas. Aguarde 15 minutos e tente novamente.')
    def failure(self,state,key):
        f=state.setdefault('failures',{}).get(key,{'count':0})
        f['count']+=1
        if f['count']>=5:f={'count':0,'until':time.time()+900}
        state['failures'][key]=f
        self.write(state,'authentication','authentication_failed',{'target':key})
    def authenticate(self,username,password,identity):
        username=str(username).strip().casefold()
        with self.transaction():
            state=self.read()
            if not state:raise PermissionError('Administração ainda não ativada.')
            self.check_throttle(state,'login')
            user=next((u for u in state['users'] if u['username']==username),None)
            if not user or not user['active'] or user['windows_identity']!=identity.casefold() or not self.verify(str(password),user['password']):
                self.failure(state,'login');raise PermissionError('Credencial administrativa inválida para esta identidade Windows.')
            state['failures'].pop('login',None)
            self.write(state,username,'key_login',{'windows_identity':identity})
            return {**self.public(user),'vault_epoch':state['epoch'],'must_change':user.get('must_change',False)}
    def valid(self,session,identity,allow_password_change=False):
        try:
            state=self.read()
            if not state or state['epoch']!=session.get('vault_epoch'):return False
            user=next((u for u in state['users'] if u['username']==session.get('key_username')),None)
            return bool(user and user['active'] and user['epoch']==session.get('key_epoch') and user['windows_identity']==identity.casefold() and (allow_password_change or not user.get('must_change',False)))
        except (OSError,ValueError,KeyError):return False
    def list_users(self):
        state=self.read();return [self.public(u) for u in state['users']]
    def mutate(self,action,data,actor,identity,session):
        with self.transaction():
            if not self.valid(session,identity):raise PermissionError('Autenticação administrativa inválida ou expirada.')
            state=self.read()
            if action=='create':
                if not str(data.get('windows_identity','')).strip():raise ValueError('Informe a conta Windows individual do novo responsável.')
                user=self.credentials({**data,'must_change':True},identity)
                if any(u['username']==user['username'] for u in state['users']):raise ValueError('Usuário-chave já cadastrado.')
                state['users'].append(user);detail={'username':user['username'],'windows_identity':user['windows_identity']}
            else:
                user=next((u for u in state['users'] if u['username']==data.get('username')),None)
                if not user:raise ValueError('Usuário-chave não encontrado.')
                if action=='toggle':
                    if user['active'] and not any(u['active'] and not u.get('must_change',False) and u['username']!=user['username'] for u in state['users']):raise ValueError('Cadastre e valide outro responsável antes de desativar o último usuário-chave.')
                    user['active']=not user['active'];user['epoch']+=1
                elif action=='reset':
                    pw=self.credentials({**user,'password':data.get('password')},identity)['password'];user['password']=pw;user['must_change']=True;user['epoch']+=1
                else:raise ValueError('Ação administrativa inválida.')
                detail={'username':user['username'],'active':user['active']}
            self.write(state,actor,action,detail)
            return {'ok':True}
    def change_password(self,session,identity,current,new):
        with self.transaction():
            if not self.valid(session,identity,True):raise PermissionError('Sessão de usuário-chave inválida.')
            state=self.read();user=next(u for u in state['users'] if u['username']==session['key_username'])
            if not self.verify(str(current),user['password']):raise PermissionError('Senha atual incorreta.')
            user['password']=self.credentials({**user,'password':new},identity)['password'];user['must_change']=False;user['epoch']+=1
            self.write(state,user['username'],'change_password',{'username':user['username']})
            return {'ok':True}
    def rotate_recovery(self,session,identity):
        with self.transaction():
            if not self.valid(session,identity):raise PermissionError('Autenticação administrativa inválida.')
            state=self.read();code=secrets.token_urlsafe(32);state['recovery']=self.digest(code)
            self.write(state,session['key_username'],'rotate_recovery',{})
            return {'recovery_code':code}
    def recover(self,data,identity):
        user=self.credentials({**data,'windows_identity':identity,'must_change':False},identity)
        with self.transaction():
            state=self.read()
            if not state:raise ValueError('Administração ainda não ativada.')
            self.check_throttle(state,'recovery')
            if not self.verify(str(data.get('recovery_code','')),state['recovery']):
                self.failure(state,'recovery');raise PermissionError('Código de recuperação inválido.')
            # A recuperação invalida as sessões existentes e todas as contas anteriores.
            for old in state['users']:old['active']=False;old['epoch']+=1
            state['users']=[u for u in state['users'] if u['username']!=user['username']]+[user]
            state['epoch']+=1;code=secrets.token_urlsafe(32);state['recovery']=self.digest(code);state['failures']={}
            self.write(state,user['username'],'recover_administration',{'windows_identity':identity})
            return {'ok':True,'recovery_code':code}
