"use client";
import { useEffect, useRef, useState } from "react";
export type Settings = {mode:"browser"|"ollama";bridge:string;model:string};
export const defaults:Settings = {mode:"browser",bridge:"http://127.0.0.1:8765",model:"translategemma:4b"};
export function readCache(key:string){try{return JSON.parse(localStorage.getItem(key)||"null");}catch{return null;}}
export function putCache(key:string,value:any){try{localStorage.setItem(key,JSON.stringify(value));}catch{}}
export function hash(text:string){let h=2166136261;for(const c of text)h=Math.imul(h^c.charCodeAt(0),16777619);return(h>>>0).toString(36);}
export function useTranslation(text:string|null,allowed:boolean){
  const [settings,setSettings]=useState<Settings>(defaults),[ready,setReady]=useState(false),[status,setStatus]=useState(""),[error,setError]=useState(""),[result,setResult]=useState(""),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0);
  const translator=useRef<any>(null),worker=useRef<Worker|null>(null),queue=useRef<Promise<any>>(Promise.resolve()),epoch=useRef(0);
  useEffect(()=>{const saved=readCache("citepeek:settings");if(saved?.mode)setSettings({...defaults,...saved});return()=>{worker.current?.terminate();translator.current?.destroy?.();};},[]);
  function update(next:Settings){epoch.current++;queue.current=Promise.resolve();setSettings(next);putCache("citepeek:settings",next);setReady(false);setStatus("");setError("");setResult("");translator.current?.destroy?.();translator.current=null;worker.current?.terminate();worker.current=null;}
  async function enable(){
    setError("");setStatus("翻訳エンジンを準備しています…");
    try{
      if(settings.mode==="ollama"){
        const base=new URL(settings.bridge);if(!["127.0.0.1","localhost","[::1]"].includes(base.hostname))throw new Error("localhostを指定してください。GPUサーバーはSSHで転送できます。");
        const r=await fetch(base.origin+"/api/health",{signal:AbortSignal.timeout(12000)}),b:any=await r.json();if(!r.ok||!b.models?.includes(settings.model))throw new Error(b.error||`モデル ${settings.model} がありません。Ollamaでpullしてください。`);
      }else{
        let chrome=false;
        if("Translator"in window)try{const api=(window as any).Translator;if(await api.availability({sourceLanguage:"en",targetLanguage:"ja"})!=="unavailable"){translator.current=await api.create({sourceLanguage:"en",targetLanguage:"ja",monitor(m:any){m.addEventListener("downloadprogress",(e:any)=>setStatus(`言語パック取得中 ${Math.round(e.loaded*100)}%`));}});chrome=true;}}catch{}
        if(!chrome){
          worker.current?.terminate();worker.current=new Worker("/translation-worker.js",{type:"module"});
          await new Promise<void>((resolve,reject)=>{worker.current!.onmessage=e=>{if(e.data.type==="progress")setStatus(e.data.message);if(e.data.type==="ready")resolve();if(e.data.type==="error")reject(new Error(e.data.message));};worker.current!.onerror=()=>reject(new Error("モデルを読み込めません。通信を確認するかOllamaを選んでください。"));worker.current!.postMessage({type:"init"});});
        }
      }
      setReady(true);setStatus("");return true;
    }catch(e:any){setStatus("");setError(e.message||"接続できません。接続サーバーの起動とローカル接続の許可を確認してください。");return false;}
  }
  useEffect(()=>{
    setResult("");setError("");setBusy(false);
    if(!ready||!text||!allowed)return;
    const key=`${settings.mode}:${settings.mode==="ollama"?settings.bridge+settings.model:"opus-or-chrome"}:${text}`,cacheKey="citepeek:translation:"+hash(key),cached=readCache(cacheKey),version=epoch.current;
    if(cached?.key===key){setResult(cached.text);return;}
    let current=true;const controller=new AbortController();setBusy(true);
    queue.current=queue.current.catch(()=>{}).then(async()=>{
      if(!current||version!==epoch.current)return;
      try{
        let output:string;
        if(settings.mode==="ollama"){const r=await fetch(new URL(settings.bridge).origin+"/api/translate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text,model:settings.model}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(240000)])}),b:any=await r.json();if(!r.ok)throw new Error(b.error||"翻訳に失敗しました。");output=b.translation;}
        else if(translator.current)output=await translator.current.translate(text);
        else output=await new Promise<string>((resolve,reject)=>{if(!worker.current)return reject(new Error("翻訳を再接続してください。"));worker.current.onmessage=e=>{if(e.data.type==="result")resolve(e.data.text);if(e.data.type==="error")reject(new Error(e.data.message));};worker.current.postMessage({type:"translate",text});});
        if(!output?.trim())throw new Error("翻訳結果が空でした。");putCache(cacheKey,{key,text:output});if(current&&version===epoch.current)setResult(output);
      }catch(e:any){if(current)setError(e.message||"翻訳できませんでした。");}finally{if(current)setBusy(false);}
    });
    return()=>{current=false;controller.abort();};
  },[ready,text,allowed,settings.mode,settings.bridge,settings.model,retry]);
  return{settings,update,enable,ready,status,error,result,busy,retry:()=>setRetry(n=>n+1)};
}
