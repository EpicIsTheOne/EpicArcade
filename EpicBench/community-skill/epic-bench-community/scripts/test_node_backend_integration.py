import json, os, subprocess, sys, tempfile, time, unittest
from pathlib import Path

CLI=Path(__file__).with_name('epic_bench_community.py')
BACKEND=Path(__file__).resolve().parents[3]/'community.js'
NODE_CODE=r'''const http=require("node:http"),{createCommunity}=require(process.argv[1]);let c;const s=http.createServer((req,res)=>c.handle(req,res,new URL(req.url,"http://127.0.0.1")).then(ok=>{if(!ok&&!res.writableEnded)res.end()}).catch(e=>{res.writeHead(500);res.end(JSON.stringify({error:e.message}))}));s.listen(0,"127.0.0.1",()=>{const p=s.address().port;c=createCommunity({dataDir:process.argv[2],origin:"http://127.0.0.1:"+p});console.log(p)});process.on("SIGTERM",()=>{c&&c.close();s.close(()=>process.exit(0))})'''
class LiveBackend(unittest.TestCase):
 def test_actual_node_auth_publish_edit_list_delete_logout_recover(self):
  with tempfile.TemporaryDirectory() as root:
   app=Path(root)/'app'; data=Path(root)/'db'; app.mkdir(); data.mkdir(); env=os.environ.copy(); env['APPDATA']=str(app)
   proc=subprocess.Popen(['node','-e',NODE_CODE,str(BACKEND),str(data)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
   try:
    port=int(proc.stdout.readline().strip()); server='http://127.0.0.1:'+str(port)+'/api/community/v1'
    def run(*args): return subprocess.run([sys.executable,str(CLI),*args],env=env,text=True,capture_output=True,timeout=20)
    self.assertEqual(run('configure','--server',server).returncode,0)
    r=run('register','--username','liveagent','--password','secure-live-password','--harness','opencode'); self.assertEqual(r.returncode,0,r.stderr)
    project=Path(root)/'build'; project.mkdir()
    r=run('catalog'); self.assertEqual(r.returncode,0,r.stderr); self.assertIn('harnesses',r.stdout)
    r=run('publish','--name','Live Build','--url','https://example.com/live','--project-path',str(project),'--models','astra','--tags','game','--visibility','unlisted'); self.assertEqual(r.returncode,0,r.stderr); self.assertIn('agent',r.stdout)
    r=run('update','--project-path',str(project),'--url','https://example.com/edited','--visibility','public'); self.assertEqual(r.returncode,0,r.stderr)
    self.assertEqual(run('list').returncode,0)
    self.assertEqual(run('delete','--project-path',str(project)).returncode,0)
    r=run('logout'); self.assertEqual(r.returncode,0,r.stderr)
    self.assertEqual(run('login','--username','liveagent','--password','secure-live-password').returncode,0)
    # Recovery is checked against the same live database and must persist rotation.
    profile=Path(app)/'EpicBench'/'community'/'community-profile.json'; before=json.loads(profile.read_text()); code=before['recoveryCode']
    r=run('recover','--username','liveagent','--recovery-code',code,'--password','secure-live-password-2'); self.assertEqual(r.returncode,0,r.stderr)
    after=json.loads(profile.read_text()); self.assertTrue(after['recoveryCode'] and after['recoveryCode']!=code)
   finally:
    proc.terminate(); proc.wait(timeout=10); proc.stdout.close(); proc.stderr.close()
if __name__=='__main__': unittest.main()
