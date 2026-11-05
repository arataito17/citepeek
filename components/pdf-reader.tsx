"use client";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { citationNumbers, type Reference } from "@/lib/references";
const CDN = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
let module: Promise<any> | undefined;
export const loadPdf = () => module ||= import(/* @vite-ignore */ CDN).then(m => { m.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs"; return m; });
type Spot = { x: number; y: number; w: number; h: number; numbers: number[]; label: string };
export default function PdfReader({ doc, page, zoom, refs, active, onSelect }: { doc: any; page: number; zoom: number; refs: Reference[]; active: number | null; onSelect: (n: number) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null), layer = useRef<HTMLDivElement>(null), viewport = useRef<HTMLDivElement>(null), timer = useRef<any>(null);
  const [size,setSize] = useState({width:620,height:800}), [spots,setSpots] = useState<Spot[]>([]), [busy,setBusy] = useState(false), [error,setError] = useState("");
  const [width,setWidth] = useState(0);
  useEffect(() => { const observer = new ResizeObserver(entries => setWidth(Math.round(entries[0].contentRect.width))); if (viewport.current) observer.observe(viewport.current); return () => observer.disconnect(); }, []);
  useEffect(() => {
    let cancelled = false, task: any, textLayer: any;
    async function render() {
      setBusy(true); setError(""); setSpots([]);
      try {
        const lib = await loadPdf(), pg = await doc.getPage(page);
        if (cancelled || !canvas.current || !layer.current) return;
        const base = pg.getViewport({scale:1}), view = pg.getViewport({scale:Math.min(920,Math.max(260,width-56))/base.width*zoom}), ratio = Math.min(devicePixelRatio||1,2);
        const cv = canvas.current, container = layer.current;
        cv.width = Math.floor(view.width*ratio); cv.height = Math.floor(view.height*ratio); cv.style.width = `${view.width}px`; cv.style.height = `${view.height}px`;
        setSize({width:view.width,height:view.height}); container.replaceChildren(); container.style.setProperty("--scale-factor",String(view.scale));
        task = pg.render({canvasContext:cv.getContext("2d"),viewport:view,transform:[ratio,0,0,ratio,0,0]});
        const content = await pg.getTextContent(); await task.promise; if (cancelled) return;
        textLayer = new lib.TextLayer({textContentSource:content,container,viewport:view}); await textLayer.render(); if (cancelled) return;
        // Use the actual text-layer glyph bounds, also for [n] split across runs.
        const walker = document.createTreeWalker(container,NodeFilter.SHOW_TEXT), nodes: {node:Text;start:number;end:number}[] = [];
        let full = "", node; while ((node=walker.nextNode())) { const value=node.textContent||""; nodes.push({node:node as Text,start:full.length,end:full.length+value.length}); full+=value; }
        const box = container.getBoundingClientRect(), next: Spot[] = [];
        for (const m of full.matchAll(/\[\s*\d{1,4}(?:\s*[,;–—-]\s*\d{1,4})*\s*\]/g)) {
          const numbers = citationNumbers(m[0]).filter(n=>refs.some(r=>r.number===n)); if (!numbers.length) continue;
          const start=m.index!, end=start+m[0].length, a=nodes.find(n=>n.start<=start&&n.end>start), b=nodes.find(n=>n.start<end&&n.end>=end); if(!a||!b)continue;
          const range=document.createRange(); range.setStart(a.node,start-a.start); range.setEnd(b.node,end-b.start);
          const merged: {left:number;top:number;right:number;bottom:number}[] = [];
          for(const rect of Array.from(range.getClientRects())){
            if(rect.width<=1)continue;
            const prev=merged.find(r=>Math.abs(r.top-rect.top)<3&&r.right>=rect.left-3&&r.left<=rect.right+3);
            if(prev){prev.left=Math.min(prev.left,rect.left);prev.right=Math.max(prev.right,rect.right);prev.top=Math.min(prev.top,rect.top);prev.bottom=Math.max(prev.bottom,rect.bottom);}
            else merged.push({left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom});
          }
          for(const r of merged)next.push({x:r.left-box.left,y:r.top-box.top,w:r.right-r.left,h:r.bottom-r.top,numbers,label:m[0]});
        }
        setSpots(next);
      } catch(e:any){if(!cancelled&&e.name!=="RenderingCancelledException")setError("ページを表示できませんでした。別のページへ移動して再試行してください。");}
      finally{if(!cancelled)setBusy(false);}
    }
    if(width>0)void render(); return()=>{cancelled=true;task?.cancel?.();textLayer?.cancel?.();clearTimeout(timer.current);};
  },[doc,page,zoom,refs,width]);
  return <div className="pdf-viewport" ref={viewport}><div className="pdf-sheet" style={size}><canvas ref={canvas}/><div className="textLayer" ref={layer}/><div className="hotspots">{spots.map((s,i)=><button key={i} className={s.numbers.includes(active!)?"citation-hotspot selected":"citation-hotspot"} style={{left:s.x-2,top:s.y-1,width:s.w+4,height:s.h+2}} aria-label={`引用 ${s.label} のアブストラクト`} title={`引用 ${s.label}`} onMouseEnter={()=>{timer.current=setTimeout(()=>onSelect(s.numbers[0]),160);}} onMouseLeave={()=>clearTimeout(timer.current)} onFocus={()=>onSelect(s.numbers[0])} onClick={()=>onSelect(s.numbers[0])}/>)}</div>{(busy||error)&&<div className="canvas-status">{busy?<LoaderCircle className="spin" size={22}/>:error}</div>}</div><div className="pdf-page-caption">{page} / {doc.numPages}</div></div>;
}
