"""Entrada centralizada para homologação atrás de proxy HTTPS corporativo."""
import os, json, shutil, secrets, getpass, argparse, time, threading
from pathlib import Path
from urllib.parse import urlparse
from http.server import ThreadingHTTPServer
ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get('SIM_DATA_DIR', str(ROOT.parent / 'dados'))).resolve()
if DATA == ROOT or ROOT in DATA.parents:
    raise SystemExit('SIM_DATA_DIR deve ficar fora da pasta aplicacao.')
DATA.mkdir(parents=True, exist_ok=True)
# Redireciona desde a importação todos os dados locais do aplicativo original.
os.environ['XDG_DATA_HOME'] = str(DATA / 'perfil')
# Windows usa LOCALAPPDATA; esta variável afeta apenas este processo.
os.environ['LOCALAPPDATA'] = str(DATA / 'perfil')
for name in ('governance.json', 'security_policy.json'):
    if not (DATA/name).exists(): shutil.copy2(ROOT/name, DATA/name)
(DATA/'config').mkdir(exist_ok=True)
if not (DATA/'config/fiscal_rules.json').exists():
    shutil.copy2(ROOT/'config/fiscal_rules.json', DATA/'config/fiscal_rules.json')
import app
from governance import Governance
from key_accounts import KeyAccounts
IDENTITY = 'aplicacao\\administrador'
app.GOV = Governance(DATA)
app.KEYS = KeyAccounts(DATA/'administration', [IDENTITY])
app.windows_identity = lambda: IDENTITY
app.ACCESS_MODE = 'login'
app.ensure_seed_data(); app.init_db()

def provision(username, admin=False):
    password = getpass.getpass('Senha (mínimo 12 caracteres): ')
    if len(password)<12 or password != getpass.getpass('Confirme a senha: '):
        raise SystemExit('Senha curta ou confirmação divergente.')
    if admin and app.KEYS.read() is not None:
        raise SystemExit('Administração já criada. Use a troca de senha na aplicação.')
    with app.db() as c:
        if c.execute('SELECT 1 FROM users WHERE username=?', (username,)).fetchone():
            raise SystemExit('Usuário já existe.')
        salt, hashed = app.hash_pw(password)
        c.execute('INSERT INTO users(username,display_name,role,salt,password_hash,active) VALUES(?,?,?,?,?,1)',
                  (username, username, 'LEITOR', salt, hashed))
    if admin:
        result=app.KEYS.initialize({'username':username,'password':password}, IDENTITY)
        print('Guarde o código de recuperação em cofre corporativo:', result['recovery_code'])
    print('Conta criada:', username)

class WebHandler(app.Handler):
    attempts={}; attempts_lock=threading.Lock()
    def valid_request(self):
        # O proxy deve remover qualquer cabeçalho recebido do cliente e injetar este segredo.
        supplied=self.headers.get('X-Simulador-Proxy-Secret','')
        if not secrets.compare_digest(supplied, PROXY_SECRET): return False
        if self.headers.get('Host','') != urlparse(PUBLIC_URL).netloc: return False
        origin=self.headers.get('Origin')
        if origin and origin != PUBLIC_URL: return False
        if self.command=='POST' and origin != PUBLIC_URL: return False
        return True
    def do_POST(self):
        if not self.valid_request(): return self.send_json({'error':'Origem inválida'},403)
        path=urlparse(self.path).path
        if path in ('/api/register','/api/key/initialize','/api/key/recover','/api/keys','/api/users'):
            return self.send_json({'error':'Operação disponível somente à TI no servidor.'},403)
        if path=='/api/login':
            # Limite global adicional; o login administrativo já possui bloqueio próprio.
            with self.attempts_lock:
                now=time.monotonic()
                self.attempts['login']=[t for t in self.attempts.get('login',[]) if now-t<60]
                if len(self.attempts['login'])>=30:
                    return self.send_json({'error':'Aguarde um minuto para tentar novamente.'},429)
                self.attempts['login'].append(now)
        return super().do_POST()
    def end_headers(self):
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('X-Frame-Options','DENY')
        super().end_headers()

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--criar-admin', metavar='USUARIO')
    parser.add_argument('--criar-usuario', metavar='USUARIO')
    args=parser.parse_args()
    if args.criar_admin or args.criar_usuario:
        provision(args.criar_admin or args.criar_usuario, bool(args.criar_admin))
    else:
        PUBLIC_URL=os.environ.get('SIM_PUBLIC_URL','').rstrip('/')
        PROXY_SECRET=os.environ.get('SIM_PROXY_SECRET','')
        if not PUBLIC_URL.startswith('https://') or len(PROXY_SECRET)<32:
            raise SystemExit('Configure SIM_PUBLIC_URL (HTTPS) e SIM_PROXY_SECRET (mínimo 32 caracteres).')
        if not app.KEYS.read(): raise SystemExit('Crie primeiro o administrador com --criar-admin.')
        port=int(os.environ.get('SIM_PORT','8080'))
        # Não abre navegador e não expõe o backend na rede.
        server=ThreadingHTTPServer(('127.0.0.1',port),WebHandler)
        print('Simulador iniciado em loopback; acesso exclusivamente pelo proxy HTTPS.')
        try: server.serve_forever()
        except KeyboardInterrupt: server.server_close()
