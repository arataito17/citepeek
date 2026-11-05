import http from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import path from 'node:path';
let started,closed;
const upstreamStarted=new Promise(r=>started=r),upstreamClosed=new Promise(r=>closed=r);
const fake=http.createServer((req,res)=>{
  if(req.url==='/api/tags'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({models:[{name:'translategemma:12b'}]}));return;}
  if(req.url==='/api/chat'){req.resume();res.on('close',()=>closed());started();return;}
  res.writeHead(404);res.end();
});
await new Promise(r=>fake.listen(18766,'127.0.0.1',r));
const child=spawn(process.execPath,[path.resolve('.sites-runtime/local/server.mjs')],{env:{...process.env,CITEPEEK_PORT:'18765',CITEPEEK_OLLAMA_URL:'http://127.0.0.1:18766'},stdio:['ignore','pipe','pipe']});
try{
  await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>setTimeout(()=>reject(Error('Server startup timed out')),5000))]);
  const localOrigin='http://127.0.0.1:18765';
  const health=await fetch(localOrigin+'/api/health',{headers:{Origin:localOrigin}});
  assert.equal(health.status,200);
  assert.equal(health.headers.get('Access-Control-Allow-Origin'),localOrigin);
  const remote=await fetch(localOrigin+'/api/health',{headers:{Origin:'https://reader.example.org'}});
  assert.equal(remote.status,403,'A remote website must not be allowed by default');
  assert.equal(remote.headers.get('Access-Control-Allow-Origin'),null);
  const controller=new AbortController();
  const response=fetch('http://127.0.0.1:18765/api/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'translategemma:12b',text:'A short scientific abstract.'}),signal:controller.signal}).catch(e=>e);
  await Promise.race([upstreamStarted,new Promise((_,reject)=>setTimeout(()=>reject(Error('Upstream request missing')),5000))]);
  controller.abort();await response;
  const didClose=await Promise.race([upstreamClosed.then(()=>true),new Promise(r=>setTimeout(()=>r(false),2000))]);
  assert.equal(didClose,true,'Leaving a citation must cancel the upstream inference request');
  console.log('PASS: local origins work, remote origins are rejected, and cancellation aborts upstream inference.');
}finally{child.kill('SIGTERM');fake.closeAllConnections();await new Promise(r=>fake.close(r));}
