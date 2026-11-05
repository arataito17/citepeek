import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {resolveReference} from './papers.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.CITEPEEK_PORT||8765);
const ollama=process.env.CITEPEEK_OLLAMA_URL||'http://127.0.0.1:11434';
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(ollama).hostname))throw Error('Use loopback or an SSH tunnel for Ollama.');
const origins=new Set(['http://localhost:8765',`http://127.0.0.1:${port}`,`http://localhost:${port}`]);
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
async function models(){const r=await fetch(new URL('/api/tags',ollama),{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Ollama is unavailable');const b=await r.json();return(b.models||[]).filter(m=>!m.remote_host&&!m.remote_model&&!m.name.includes('cloud')).map(m=>m.name);}
async function body(req){let size=0;const parts=[];for await(const p of req){size+=p.length;if(size>80000)throw Error('Request too large');parts.push(p);}return JSON.parse(Buffer.concat(parts).toString());}
http.createServer(async(req,res)=>{
  const disconnected=new AbortController();
  res.on("close",()=>{if(!res.writableEnded)disconnected.abort();});
  const origin=req.headers.origin;
  if(!['127.0.0.1','localhost'].includes((req.headers.host||'').split(':')[0])||(origin&&!origins.has(origin))){res.writeHead(403,headers);res.end(JSON.stringify({error:'Origin not allowed'}));return;}
  if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Private-Network','true');
  const send=(code,b)=>{if(res.destroyed)return;res.writeHead(code,headers);res.end(JSON.stringify(b));};
  const url=new URL(req.url,`http://127.0.0.1:${port}`);
  try{
    if(req.method==='OPTIONS')return send(200,{});
    if(url.pathname==='/api/health'&&req.method==='GET')return send(200,{models:await models()});
    if(url.pathname==='/api/resolve'&&req.method==='POST'){const b=await body(req);if(typeof b.reference!=='string'||b.reference.length<5||b.reference.length>5000)return send(400,{error:'文献情報は5〜5000文字で入力してください。'});return send(200,await resolveReference(b.reference));}
    if(url.pathname==='/api/translate'&&req.method==='POST'){
      const b=await body(req);if(typeof b.text!=='string'||!b.text.length||b.text.length>20000||!(await models()).includes(b.model))return send(400,{error:'文面とローカルモデル名を確認してください。'});
      const prompt=`You are a professional English (en) to Japanese (ja) translator. Your goal is to accurately convey the meaning and nuances of the original English text while adhering to Japanese grammar, vocabulary, and cultural sensitivities.\nProduce only the Japanese translation, without any additional explanations or commentary. Please translate the following English text into Japanese:\n\n\n${b.text}`;
      const r=await fetch(new URL('/api/chat',ollama),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:b.model,messages:[{role:'user',content:prompt}],stream:false,options:{temperature:0,num_predict:4096}}),signal:AbortSignal.any([disconnected.signal,AbortSignal.timeout(230000)])});
      const value=await r.json();if(!r.ok||!value.message?.content||value.done_reason==='length')return send(502,{error:'翻訳できませんでした。Ollamaのモデルを確認してください。'});return send(200,{translation:value.message.content});
    }
    if(url.pathname==='/api/demo'&&req.method==='GET'){const r=await fetch('https://arxiv.org/pdf/1706.03762',{signal:AbortSignal.timeout(25000)});if(!r.ok)return send(502,{error:'サンプル取得に失敗しました。'});res.writeHead(200,{'Content-Type':'application/pdf'});res.end(Buffer.from(await r.arrayBuffer()));return;}
    if(req.method!=='GET')return send(405,{error:'Method not allowed'});
    const name=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).slice(1),file=path.resolve(root,name);
    if(!file.startsWith(root+path.sep))return send(403,{error:'Forbidden'});
    if(!['index.html','reader.js','reader.css','translation-worker.js','favicon.svg'].includes(name))return send(404,{error:'Not found'});
    const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
    const bytes=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(bytes);
  }catch(e){send(502,{error:url.pathname.includes('translate')||url.pathname.includes('health')?'Ollamaへ接続できません。Ollamaの起動・モデル取得・SSH転送を確認してください。':'取得に失敗しました。入力とネットワーク接続を確認してください。'});}
}).listen(port,'127.0.0.1',()=>console.log(`Citepeek: http://127.0.0.1:${port}\nPress Ctrl+C to stop.`));
