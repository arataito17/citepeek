import {pipeline,env} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
env.allowLocalModels=false;
let translator;
self.onmessage=async({data})=>{
  try{
    if(data.type==='init'){
      translator=await pipeline('translation','Xenova/opus-mt-en-jap',{dtype:'q8',device:'wasm',progress_callback:p=>{
        if(p.status==='progress')self.postMessage({type:'progress',message:`モデル取得中 ${p.progress?.toFixed(0)||0}% · ${p.file?.split('/').pop()||''}`});
        if(p.status==='done')self.postMessage({type:'progress',message:'翻訳モデルを読み込んでいます…'});
      }});self.postMessage({type:'ready'});
    }
    if(data.type==='translate'){
      if(!translator)throw new Error('翻訳を再接続してください。');
      const sentences=data.text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)||[data.text],chunks=[];
      for(const sentence of sentences){const words=sentence.trim().split(/\s+/);for(let i=0;i<words.length;i+=100)chunks.push(words.slice(i,i+100).join(' '));}
      const out=[];for(const chunk of chunks){const value=await translator(chunk,{max_new_tokens:512});out.push(value[0].translation_text);}
      self.postMessage({type:'result',text:out.join('\n')});
    }
  }catch(e){self.postMessage({type:'error',message:e.message||'翻訳に失敗しました。'});}
};
