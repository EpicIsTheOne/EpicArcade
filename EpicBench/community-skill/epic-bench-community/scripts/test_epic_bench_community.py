import http.server, json, os, subprocess, sys, tempfile, threading, unittest
from pathlib import Path

CLI=Path(__file__).with_name('epic_bench_community.py')
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*a): pass
 def sendj(self,obj,code=200,headers=None):
  raw=json.dumps(obj).encode(); self.send_response(code); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(raw)))
  for k,v in (headers or {}).items(): self.send_header(k,v)
  self.end_headers(); self.wfile.write(raw)
 def do_POST(self):
  n=int(self.headers.get('Content-Length',0)); b=json.loads(self.rfile.read(n) or b'{}')
  if self.path=='/auth/register':
   self.sendj({'user':{'id':'u1'},'csrfToken':'csrf','recoveryCode':'recovery'},headers={'Set-Cookie':'sid=abc; Path=/'})
  elif self.path=='/auth/login':
   self.sendj({'user':{'id':'u1'},'csrfToken':'csrf'},headers={'Set-Cookie':'sid=abc; Path=/'})
  elif self.path=='/auth/recover': self.sendj({'recoveryCode':'rotated'})
  elif self.path=='/tokens':
   assert self.headers.get('Cookie')=='sid=abc'; assert self.headers.get('X-CSRF-Token')=='csrf'; self.sendj({'token':'bearer-secret','id':'t1'})
  elif self.path=='/projects': self.sendj({'project':dict({'id':'p1'},**b)})
  else:self.sendj({})
 def do_GET(self):
  if self.path=='/catalog': self.sendj({'models':[],'tags':[],'harnesses':[]})
  elif self.path.startswith('/projects'): self.sendj({'projects':[],'total':0})
  elif self.path=='/tokens': self.sendj({'tokens':[{'id':'t1'}]})
  else:self.sendj({})
 def do_PATCH(self): self.do_POST()
 def do_DELETE(self): self.sendj({})
class TestCLI(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(); self.env=os.environ.copy(); self.env['APPDATA']=self.tmp.name
  self.server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler); threading.Thread(target=self.server.serve_forever,daemon=True).start(); self.root='http://127.0.0.1:%s'%self.server.server_port
 def tearDown(self): self.server.shutdown(); self.server.server_close(); self.tmp.cleanup()
 def invoke(self,*args): return subprocess.run([sys.executable,str(CLI),*args],env=self.env,text=True,capture_output=True)
 def test_register_publish_and_association(self):
  self.assertEqual(self.invoke('configure','--server',self.root).returncode,0)
  r=self.invoke('register','--username','agent','--password','pw'); self.assertEqual(r.returncode,0)
  project=Path(self.tmp.name)/'work'; project.mkdir()
  r=self.invoke('publish','--name','Demo','--url','https://example.test','--project-path',str(project),'--models','m1','m2','--tags','Game'); self.assertEqual(r.returncode,0,r.stderr); self.assertIn('p1',r.stdout)
  r=self.invoke('update','--project-path',str(project),'--url','https://new.example'); self.assertEqual(r.returncode,0,r.stderr)
  profile=Path(self.tmp.name)/'EpicBench'/'community'/'community-profile.json'; self.assertTrue(profile.exists()); self.assertNotIn('bearer-secret',r.stdout)
 def test_http_requires_explicit_loopback(self):
  r=self.invoke('configure','--server','http://example.test'); self.assertNotEqual(r.returncode,0)
 def test_recovery_login_delete_and_account_switch_backup(self):
  self.assertEqual(self.invoke('configure','--server',self.root).returncode,0)
  self.assertEqual(self.invoke('register','--username','agent','--password','pw').returncode,0)
  project=Path(self.tmp.name)/'work'; project.mkdir()
  self.assertEqual(self.invoke('publish','--name','Demo','--url','https://example.test','--project-path',str(project)).returncode,0)
  self.assertEqual(self.invoke('recover','--username','agent','--recovery-code','recovery','--password','newpw').returncode,0)
  profile=Path(self.tmp.name)/'EpicBench'/'community'/'community-profile.json'; data=json.loads(profile.read_text()); self.assertEqual(data['recoveryCode'],'rotated')
  self.assertEqual(self.invoke('login','--username','agent','--password','newpw').returncode,0)
  data=json.loads(profile.read_text()); self.assertEqual(data['recoveryCode'],'rotated'); self.assertIn(str(project.resolve()),data['projects'])
  self.assertEqual(self.invoke('delete','--project-path',str(project)).returncode,0); data=json.loads(profile.read_text()); self.assertNotIn(str(project.resolve()),data['projects'])
  self.assertEqual(self.invoke('login','--username','second','--password','pw2').returncode,0); data=json.loads(profile.read_text()); self.assertEqual(data['projects'],{}); self.assertTrue(list(profile.parent.glob(profile.name+'.bak.*')))
if __name__=='__main__': unittest.main()
