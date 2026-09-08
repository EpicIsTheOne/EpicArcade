#!/usr/bin/env python3
"""Dependency-free Epic Bench Community API client."""
import argparse, getpass, json, os, secrets, socket, subprocess, sys, tempfile, shutil, ipaddress, re
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, build_opener, HTTPRedirectHandler

DEFAULT_ROOT='https://epic.techexplore.us/api/community/v1'; ALLOWED={'description','models','harness','tags','thumbnailUrl','sourceUrl','remixOf','visibility'}
def profile_path(): return Path(os.environ.get('APPDATA',str(Path.home()/'.config')))/'EpicBench'/'community'/'community-profile.json'
def load():
 p=profile_path()
 if not p.exists(): return {'server':DEFAULT_ROOT,'projects':{}}
 try: d=json.loads(p.read_text(encoding='utf-8')); d.setdefault('server',DEFAULT_ROOT); d.setdefault('projects',{}); return d
 except Exception as e: raise SystemExit('Profile is unreadable: '+str(e))
def secure_path(p, directory=False):
 if p.is_symlink(): raise SystemExit('Private credential paths must not be symbolic links')
 if os.name!='nt':
  os.chmod(p,0o700 if directory else 0o600); return
 # Construct a fresh ACL rather than adding one grant to potentially permissive
 # existing explicit grants. No secrets or shell-interpolated paths are passed.
 script=r'''$ErrorActionPreference='Stop'
$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User
if ($env:EPIC_ACL_DIRECTORY -eq '1') {
 $acl=New-Object System.Security.AccessControl.DirectorySecurity
 $rule=New-Object System.Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
} else {
 $acl=New-Object System.Security.AccessControl.FileSecurity
 $rule=New-Object System.Security.AccessControl.FileSystemAccessRule($sid,'FullControl','Allow')
}
$acl.SetOwner($sid)
$acl.SetAccessRuleProtection($true,$false)
$acl.AddAccessRule($rule)
if ($env:EPIC_ACL_DIRECTORY -eq '1') { [System.IO.Directory]::SetAccessControl($env:EPIC_ACL_PATH,$acl) } else { [System.IO.File]::SetAccessControl($env:EPIC_ACL_PATH,$acl) }
'''
 env=os.environ.copy(); env['EPIC_ACL_PATH']=str(p); env['EPIC_ACL_DIRECTORY']='1' if directory else '0'
 result=subprocess.run(['powershell.exe','-NoProfile','-NonInteractive','-Command',script],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 if result.returncode: raise SystemExit('Unable to secure private credential permissions; no credentials were written')

def save(d):
 p=profile_path(); p.parent.mkdir(parents=True,exist_ok=True)
 if any((parent/'.git').exists() for parent in p.resolve().parents): raise SystemExit('Credential storage must be outside a Git repository')
 secure_path(p.parent,True)
 fd,tmp=tempfile.mkstemp(dir=str(p.parent),prefix='.profile-',text=True)
 try:
  secure_path(Path(tmp))
  with os.fdopen(fd,'w',encoding='utf-8') as f: json.dump(d,f,indent=2); f.write('\n'); f.flush(); os.fsync(f.fileno())
  os.replace(tmp,p)
  if os.name!='nt': os.chmod(p,0o600)
 finally:
  try: os.close(fd)
  except OSError: pass
  if os.path.exists(tmp): os.unlink(tmp)
def server_url(s,explicit=False):
 u=urlparse(s)
 if u.scheme not in ('https','http') or not u.netloc or u.username or u.password or u.query or u.fragment: raise SystemExit('Server must be an absolute HTTPS URL without credentials, query or fragment')
 if u.scheme=='http' and not (explicit and u.hostname in ('localhost','127.0.0.1','::1')): raise SystemExit('HTTP is allowed only for explicit loopback testing')
 return s.rstrip('/')
def backup():
 p=profile_path()
 if p.exists():
  secure_path(p.parent,True)
  b=p.with_name(p.name+'.bak.'+str(int(__import__('time').time()*1000))+'-'+secrets.token_hex(3)); shutil.copy2(p,b)
  secure_path(b)
def safe_url(value,field='URL'):
 if not isinstance(value,str): raise SystemExit(field+' must be a URL string')
 u=urlparse(value)
 if u.scheme not in ('https','http') or not u.netloc or u.username or u.password: raise SystemExit(field+' must be an absolute HTTP(S) URL without embedded credentials')
 try:
  ip=ipaddress.ip_address(u.hostname.strip('[]'))
  if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved: raise SystemExit(field+' cannot target a private or loopback address')
 except ValueError: pass
 if len(value)>2048: raise SystemExit(field+' is too long')
 return value
class NoRedirect(HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs): return None
class API:
 def __init__(self,p): self.p=p; self.root=server_url(p.get('server',DEFAULT_ROOT),True); self.token=p.get('token'); self.cookie=p.get('sessionCookie'); self.csrf=p.get('csrfToken'); self.opener=build_opener(NoRedirect())
 def call(self,m,path,body=None,session=False,auth=True,headers=None):
  h={'Accept':'application/json',**(headers or {})}
  if session:
   u=urlparse(self.root); h['Origin']=u.scheme+'://'+u.netloc
  if body is not None: h['Content-Type']='application/json'
  if auth and self.token and not session: h['Authorization']='Bearer '+self.token
  if session and self.cookie: h['Cookie']=self.cookie
  if session and self.csrf: h['X-CSRF-Token']=self.csrf
  req=Request(self.root+path,data=json.dumps(body).encode() if body is not None else None,headers=h,method=m)
  try:
   with self.opener.open(req,timeout=20) as r:
    sc=r.headers.get('Set-Cookie'); self.cookie=sc.split(';',1)[0] if sc else self.cookie; raw=r.read(); return json.loads(raw) if raw else {}
  except HTTPError as e:
   try: msg=json.loads(e.read()).get('error','request failed')
   except Exception: msg='request failed'
   raise SystemExit('Community API error %s: %s'%(e.code,msg))
  except (URLError,TimeoutError) as e: raise SystemExit('Community API unavailable: '+str(e))
def validate_metadata(d):
 if not isinstance(d,dict) or set(d)-ALLOWED: raise SystemExit('Metadata contains unsupported fields')
 for k,limit in [('description',4000),('harness',40)]:
  if k in d and (not isinstance(d[k],str) or len(d[k])>limit): raise SystemExit(k+' exceeds the text limit')
 for k,limit in [('models',120),('tags',32)]:
  if k in d and (not isinstance(d[k],list) or len(d[k])>8 or any(not isinstance(x,str) or not x.strip() or len(x)>limit for x in d[k])): raise SystemExit(k+' must contain up to eight short identifiers')
 for k in ('thumbnailUrl','sourceUrl'):
  if k in d and d[k]: d[k]=safe_url(d[k],k)
 if d.get('thumbnailUrl') and urlparse(d['thumbnailUrl']).scheme!='https': raise SystemExit('thumbnailUrl requires HTTPS')
 if d.get('remixOf') and (not isinstance(d['remixOf'],str) or not re.fullmatch(r'[0-9a-fA-F-]{20,80}',d['remixOf'])): raise SystemExit('remixOf must be a Community project identifier')
 if 'visibility' in d and d['visibility'] not in ('public','unlisted'): raise SystemExit('visibility must be public or unlisted')
 return d
def metadata(a):
 d={}
 if a.metadata:
  try: d=json.loads(Path(a.metadata).read_text(encoding='utf-8'))
  except Exception as e: raise SystemExit('Invalid metadata JSON: '+str(e))
 for k,v in [('description',a.description),('harness',a.harness),('thumbnailUrl',a.thumbnail_url),('sourceUrl',a.source_url),('visibility',a.visibility)]:
  if v is not None: d[k]=v
 if a.models: d['models']=a.models
 if a.tags: d['tags']=a.tags
 return validate_metadata(d)
def auth(a,register):
 p=load(); c=API(p); user=(a.username or ('epic-agent-'+secrets.token_hex(4) if register else p.get('username') or input('Community username: ').strip())).strip().lower(); pw=a.password
 if register and pw is None: pw=secrets.token_urlsafe(18)
 if pw is None: pw=p.get('password') if p.get('username')==user else None
 if pw is None: pw=getpass.getpass('Community password: ')
 if not user or not pw: raise SystemExit('Username and password are required')
 b={'username':user,'password':pw};
 if a.display_name: b['displayName']=a.display_name
 r=c.call('POST','/auth/register' if register else '/auth/login',b,auth=False); c.csrf=r.get('csrfToken')
 switching=p.get('username') and p.get('username')!=user
 if switching: backup(); p={'server':p.get('server',DEFAULT_ROOT),'projects':{}}
 p.update(username=user,password=pw,sessionCookie=c.cookie,csrfToken=c.csrf,token=None,tokenId=None)
 if r.get('recoveryCode'): p['recoveryCode']=r['recoveryCode']
 save(p)
 t=c.call('POST','/tokens',{'label':'Epic Bench Community agent','harness':a.harness},session=True,auth=False)
 if not t.get('token'): raise SystemExit('Token creation failed; account was not saved as ready for publishing')
 p['token']=t['token']; p['tokenId']=t.get('id'); save(p)
 print('Community %s; private profile: %s'%('account created' if register else 'login succeeded',profile_path()))
def pid(p,a):
 if a.id:return str(a.id)
 if a.project_path:
  x=str(Path(a.project_path).resolve());
  if x in p.get('projects',{}): return str(p['projects'][x])
 raise SystemExit('Provide --id or a previously associated --project-path')
def main(argv=None):
 ap=argparse.ArgumentParser(prog='epic-bench-community'); s=ap.add_subparsers(dest='cmd',required=True)
 q=s.add_parser('configure'); q.add_argument('--server',required=True); q.add_argument('--force-new-profile',action='store_true')
 for n in ('register','login'):
  q=s.add_parser(n); q.add_argument('--username'); q.add_argument('--password'); q.add_argument('--display-name'); q.add_argument('--harness',default='agent')
 def common(q,required=False):
  q.add_argument('--metadata'); q.add_argument('--description'); q.add_argument('--models',nargs='*'); q.add_argument('--tags',nargs='*'); q.add_argument('--harness'); q.add_argument('--thumbnail-url'); q.add_argument('--source-url'); q.add_argument('--visibility',choices=['public','unlisted'])
 q=s.add_parser('publish'); q.add_argument('--name',required=True); q.add_argument('--url',required=True); q.add_argument('--project-path',default=os.getcwd()); q.add_argument('--new',action='store_true'); common(q)
 q=s.add_parser('update'); q.add_argument('--id'); q.add_argument('--project-path',default=os.getcwd()); q.add_argument('--name'); q.add_argument('--url'); common(q)
 q=s.add_parser('delete'); q.add_argument('--id'); q.add_argument('--project-path',default=os.getcwd())
 s.add_parser('list'); s.add_parser('catalog')
 q=s.add_parser('token'); z=q.add_subparsers(dest='token_cmd',required=True); z.add_parser('list'); x=z.add_parser('revoke'); x.add_argument('id'); x=z.add_parser('create'); x.add_argument('--label',default='Epic Bench Community agent'); x.add_argument('--harness',default='agent'); x.add_argument('--rotate',action='store_true')
 s.add_parser('logout')
 q=s.add_parser('recover'); q.add_argument('--username',required=True); q.add_argument('--recovery-code'); q.add_argument('--password')
 a=ap.parse_args(argv); p=load()
 if a.cmd=='configure':
  u=server_url(a.server,True)
  if (p.get('token') or p.get('password')) and u!=p.get('server') and not a.force_new_profile: raise SystemExit('Refusing to move saved credentials to another server; use --force-new-profile')
  if a.force_new_profile and u!=p.get('server'): backup(); p={'server':u,'projects':{}}
  p['server']=u; save(p); print('Configured server; private profile: '+str(profile_path())); return
 if a.cmd in ('register','login'): auth(a,a.cmd=='register'); return
 c=API(p)
 if a.cmd=='catalog': print(json.dumps(c.call('GET','/catalog',auth=False),indent=2)); return
 if a.cmd=='list': print(json.dumps(c.call('GET','/projects?mine=1'),indent=2)); return
 if a.cmd=='token':
  if a.token_cmd=='list': print(json.dumps(c.call('GET','/tokens'),indent=2))
  elif a.token_cmd=='revoke': c.call('DELETE','/tokens/'+a.id); print('Token revoked')
  elif a.token_cmd=='create':
   t=c.call('POST','/tokens',{'label':a.label,'harness':a.harness},session=True,auth=False)
   if not t.get('token'): raise SystemExit('Token creation failed')
   old=p.get('tokenId'); p['token']=t['token']; p['tokenId']=t.get('id'); save(p)
   if a.rotate and old: c.call('DELETE','/tokens/'+str(old),auth=True)
   print('Token created; private profile updated: '+str(profile_path()))
  return
 if a.cmd=='logout':
  if p.get('tokenId') and p.get('token'): c.call('DELETE','/tokens/'+str(p['tokenId']))
  if p.get('sessionCookie'): c.call('POST','/auth/logout',{},session=True,auth=False)
  p.update(token=None,tokenId=None,sessionCookie=None,csrfToken=None); save(p); print('Logged out; private profile updated: '+str(profile_path())); return
 if a.cmd=='recover':
  code=a.recovery_code or getpass.getpass('Recovery code: '); pw=a.password or getpass.getpass('New password: '); r=c.call('POST','/auth/recover',{'username':a.username,'recoveryCode':code,'password':pw},auth=False); p.update(username=a.username,password=pw,token=None,sessionCookie=None,csrfToken=None,recoveryCode=r.get('recoveryCode',p.get('recoveryCode'))); save(p); print('Recovery succeeded; private profile updated: '+str(profile_path())); return
 if a.cmd=='publish':
  association=str(Path(a.project_path).resolve())
  if association in p.get('projects',{}) and not a.new: raise SystemExit('This directory already has a Community project. Use update, or publish --new for a separate entry.')
  b={'name':a.name,'url':safe_url(a.url),'models':[],'tags':[]}; b.update(metadata(a))
  fingerprint=__import__('hashlib').sha256(json.dumps(b,sort_keys=True).encode()).hexdigest()
  pending=p.setdefault('pending',{}).get(association)
  if not pending or pending.get('fingerprint')!=fingerprint:
   pending={'fingerprint':fingerprint,'key':secrets.token_urlsafe(24)}; p['pending'][association]=pending; save(p)
  r=c.call('POST','/projects',b,headers={'Idempotency-Key':pending['key']}); pr=r.get('project',r); ident=pr.get('id') or pr.get('slug')
  if not ident: raise SystemExit('API response did not include stable project ID')
  p.setdefault('projects',{})[association]=ident; p['pending'].pop(association,None); save(p)
  print(json.dumps({'project':pr},indent=2)); return
 ident=pid(p,a)
 if a.cmd=='delete':
  c.call('DELETE','/projects/'+ident)
  p['projects']={key:value for key,value in p.get('projects',{}).items() if value!=ident}
  save(p); print('Project deleted'); return
 b=metadata(a)
 if a.url is not None:b['url']=safe_url(a.url)
 if a.name is not None:b['name']=a.name
 print(json.dumps(c.call('PATCH','/projects/'+ident,b).get('project'),indent=2))
if __name__=='__main__': main()
