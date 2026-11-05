import {citationNumbers} from './references.ts';
export type CitationToken={start:number;end:number;number:number;group:number[]};
export function citationTokens(text:string,valid:Iterable<number>):CitationToken[]{
  const allowed=new Set(valid),tokens:CitationToken[]=[];
  for(const match of text.matchAll(/\[\s*\d{1,4}(?:\s*[,;–—-]\s*\d{1,4})*\s*\]/g)){
    const group=citationNumbers(match[0]).filter(n=>allowed.has(n));
    if(!group.length)continue;
    for(const number of match[0].matchAll(/\d{1,4}/g)){
      const value=+number[0];if(!allowed.has(value))continue;
      const start=match.index!+number.index!;
      tokens.push({start,end:start+number[0].length,number:value,group});
    }
  }
  return tokens;
}
export function clampZoom(value:number){return Math.min(3,Math.max(.5,Math.round(value*100)/100));}
export function pageDelta(key:string){return key==='ArrowLeft'?-1:key==='ArrowRight'||key==='Enter'?1:0;}
export function cleanSelection(text:string){return text.replace(/\u00ad\s*\n?/g,'').replace(/[ \t]+/g,' ').replace(/\n[ \t]*/g,'\n').trim();}
