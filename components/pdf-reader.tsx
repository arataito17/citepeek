"use client";
import {useEffect,useRef,useState} from "react";
import {LoaderCircle,Minus,Plus,ScanLine} from "lucide-react";
import type {Reference} from "@/lib/references";
import {citationTokens,clampZoom,cleanSelection} from "@/lib/pdf-interactions";
const CDN="https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
let module:Promise<any>|undefined;
export const loadPdf=()=>module||=import(/* @vite-ignore */ CDN).then(m=>{m.GlobalWorkerOptions.workerSrc="https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";return m;});
type Spot={x:number;y:number;w:number;h:number;number:number;group:number[];key:string};
type Anchor={x:number;y:number;screenX:number;screenY:number};
type Props={doc:any;page:number;zoom:number;refs:Reference[];active:number|null;onZoom:(n:number)=>void;onSelect:(n:number,group?:number[])=>void;onTextSelection:(text:string)=>void};
const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
function textNodes(root:Node){
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes:{node:Text;start:number;end:number}[]=[];
  let position=0,node;
  while((node=walker.nextNode())){const end=position+(node.textContent||'').length;nodes.push({node:node as Text,start:position,end});position=end;}
  return nodes;
}
export default function PdfReader({doc,page,zoom,refs,active,onZoom,onSelect,onTextSelection}:Props){
  const pane=useRef<HTMLDivElement>(null),viewport=useRef<HTMLDivElement>(null),sheet=useRef<HTMLDivElement>(null),surface=useRef<HTMLDivElement>(null);
  const [size,setSize]=useState({width:620,height:800}),[spots,setSpots]=useState<Spot[]>([]),[width,setWidth]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(""),[hovered,setHovered]=useState<number|null>(null);
  const spotsRef=useRef<Spot[]>([]),down=useRef<{x:number;y:number}|null>(null),hoverTimer=useRef<any>(null),hoverKey=useRef(""),selectionTimer=useRef<any>(null),lastSelection=useRef("");
  const anchor=useRef<Anchor|null>(null),lastView=useRef<{page:number;zoom:number;width:number;height:number}|null>(null),zoomValue=useRef(zoom),previousZoom=useRef(zoom),gesture=useRef<{active:boolean;start:number}>({active:false,start:zoom});
  const callbacks=useRef({onZoom,onSelect,onTextSelection});callbacks.current={onZoom,onSelect,onTextSelection};
  if(previousZoom.current!==zoom){zoomValue.current=zoom;previousZoom.current=zoom;}
  function stopHover(){clearTimeout(hoverTimer.current);hoverKey.current="";setHovered(null);}
  function findSpot(clientX:number,clientY:number){
    const box=sheet.current?.getBoundingClientRect();if(!box)return;
    const x=clientX-box.left,y=clientY-box.top;
    return spotsRef.current.find(s=>x>=s.x-1&&x<=s.x+s.w+1&&y>=s.y-1&&y<=s.y+s.h+1);
  }
  function captureSelection(){
    const selection=window.getSelection(),root=surface.current;
    if(!selection||selection.isCollapsed||!root||!selection.anchorNode||!selection.focusNode||!root.contains(selection.anchorNode)||!root.contains(selection.focusNode))return "";
    const text=cleanSelection(selection.toString());
    if(text&&/[\p{L}\p{N}]/u.test(text)&&text!==lastSelection.current){lastSelection.current=text;callbacks.current.onTextSelection(text);}
    return text;
  }
  function requestZoom(next:number,clientX?:number,clientY?:number){
    next=clampZoom(next);if(next===zoomValue.current)return;
    const box=sheet.current?.getBoundingClientRect(),view=viewport.current?.getBoundingClientRect();
    if(box&&view){
      const x=clientX??view.left+view.width/2,y=clientY??view.top+view.height/2;
      anchor.current={x:Math.max(0,Math.min(1,(x-box.left)/box.width)),y:Math.max(0,Math.min(1,(y-box.top)/box.height)),screenX:x-view.left,screenY:y-view.top};
    }
    stopHover();zoomValue.current=next;callbacks.current.onZoom(next);
  }
  useEffect(()=>{
    const observer=new ResizeObserver(entries=>setWidth(Math.round(entries[0].contentRect.width)));
    if(viewport.current)observer.observe(viewport.current);return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    const root=pane.current;if(!root)return;
    const wheel=(event:WheelEvent)=>{
      if(!event.ctrlKey&&!event.metaKey)return;
      event.preventDefault();if(gesture.current.active)return;
      requestZoom(zoomValue.current*Math.exp(-event.deltaY*.008),event.clientX,event.clientY);
    };
    const start=(event:any)=>{event.preventDefault();gesture.current={active:true,start:zoomValue.current};stopHover();};
    const change=(event:any)=>{event.preventDefault();requestZoom(gesture.current.start*event.scale,event.clientX||undefined,event.clientY||undefined);};
    const end=(event:any)=>{event.preventDefault();gesture.current.active=false;};
    root.addEventListener('wheel',wheel,{passive:false});root.addEventListener('gesturestart',start,{passive:false});root.addEventListener('gesturechange',change,{passive:false});root.addEventListener('gestureend',end,{passive:false});
    return()=>{root.removeEventListener('wheel',wheel);root.removeEventListener('gesturestart',start);root.removeEventListener('gesturechange',change);root.removeEventListener('gestureend',end);};
  },[]);
  useEffect(()=>{
    const finish=(event:PointerEvent)=>{
      const started=down.current;if(!started)return;down.current=null;
      requestAnimationFrame(()=>{
        const text=captureSelection();if(text||gesture.current.active)return;
        if(Math.hypot(event.clientX-started.x,event.clientY-started.y)>5)return;
        const spot=findSpot(event.clientX,event.clientY);if(spot)callbacks.current.onSelect(spot.number,spot.group);
      });
    };
    const cancel=()=>{down.current=null;};
    const changed=()=>{clearTimeout(selectionTimer.current);if(!down.current)selectionTimer.current=setTimeout(captureSelection,180);};
    window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',cancel);document.addEventListener('selectionchange',changed);
    return()=>{window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',cancel);document.removeEventListener('selectionchange',changed);clearTimeout(selectionTimer.current);};
  },[]);
  useEffect(()=>{lastSelection.current="";},[doc,page]);
  useEffect(()=>{
    let cancelled=false,task:any,textLayer:any;
    async function render(){
      setBusy(true);setError("");setSpots([]);spotsRef.current=[];stopHover();
      try{
        const lib=await loadPdf(),pg=await doc.getPage(page);if(cancelled||!surface.current||!sheet.current||!viewport.current)return;
        const old=lastView.current,oldBox=sheet.current.getBoundingClientRect(),viewBox=viewport.current.getBoundingClientRect();
        const selection=window.getSelection(),oldNodes=textNodes(surface.current);
        const selectedAnchor=oldNodes.find(n=>n.node===selection?.anchorNode),selectedFocus=oldNodes.find(n=>n.node===selection?.focusNode);
        const savedSelection=old?.page===page&&selection&&!selection.isCollapsed&&selectedAnchor&&selectedFocus
          ?{anchor:selectedAnchor.start+selection.anchorOffset,focus:selectedFocus.start+selection.focusOffset}:null;
        if(old&&old.page===page&&!anchor.current){
          const x=viewBox.left+viewBox.width/2,y=viewBox.top+viewBox.height/2;
          anchor.current={x:Math.max(0,Math.min(1,(x-oldBox.left)/oldBox.width)),y:Math.max(0,Math.min(1,(y-oldBox.top)/oldBox.height)),screenX:viewBox.width/2,screenY:viewBox.height/2};
        }
        const base=pg.getViewport({scale:1}),view=pg.getViewport({scale:Math.max(260,width)/base.width*zoom}),ratio=Math.min(devicePixelRatio||1,2);
        const cv=document.createElement('canvas'),container=document.createElement('div');container.className='textLayer';container.setAttribute('aria-label','選択できるPDF本文');
        cv.width=Math.floor(view.width*ratio);cv.height=Math.floor(view.height*ratio);cv.style.width=`${view.width}px`;cv.style.height=`${view.height}px`;cv.setAttribute('aria-hidden','true');
        container.style.setProperty('--scale-factor',String(view.scale));
        task=pg.render({canvasContext:cv.getContext('2d'),viewport:view,transform:[ratio,0,0,ratio,0,0]});
        const content=await pg.getTextContent();await task.promise;if(cancelled)return;
        textLayer=new lib.TextLayer({textContentSource:content,container,viewport:view});await textLayer.render();if(cancelled)return;
        // Commit matching canvas and text together; cancelled renders never touch the visible surface.
        sheet.current!.style.width=`${view.width}px`;sheet.current!.style.height=`${view.height}px`;setSize({width:view.width,height:view.height});
        surface.current!.replaceChildren(cv,container);await frame();if(cancelled)return;
        if(savedSelection){
          const nodes=textNodes(container),find=(offset:number)=>nodes.find(n=>n.start<=offset&&n.end>=offset);
          const a=find(savedSelection.anchor),b=find(savedSelection.focus),current=window.getSelection();
          if(a&&b&&current&&(current.isCollapsed||!current.anchorNode?.isConnected))current.setBaseAndExtent(a.node,savedSelection.anchor-a.start,b.node,savedSelection.focus-b.start);
        }
        const position=anchor.current;
        if(old?.page!==page){viewport.current!.scrollTop=0;viewport.current!.scrollLeft=Math.max(0,(view.width-viewport.current!.clientWidth)/2);}
        else if(position){
          const box=sheet.current!.getBoundingClientRect(),vp=viewport.current!.getBoundingClientRect();
          viewport.current!.scrollLeft+=box.left+position.x*box.width-vp.left-position.screenX;
          viewport.current!.scrollTop+=box.top+position.y*box.height-vp.top-position.screenY;
        }
        anchor.current=null;lastView.current={page,zoom,width:view.width,height:view.height};
        function measure(){
          if(cancelled||!sheet.current)return;
          const walker=document.createTreeWalker(container,NodeFilter.SHOW_TEXT),nodes:{node:Text;start:number;end:number}[]=[];
          let full='',node;while((node=walker.nextNode())){const value=node.textContent||'';nodes.push({node:node as Text,start:full.length,end:full.length+value.length});full+=value;}
          const origin=sheet.current.getBoundingClientRect(),next:Spot[]=[];
          for(const token of citationTokens(full,refs.map(r=>r.number))){
            // A range across ELEMENT nodes includes their complete bounding boxes.
            // Restrict each Range to a single text node so only the actual digits count.
            const rects:{left:number;top:number;right:number;bottom:number}[]=[];
            for(const text of nodes){
              if(text.end<=token.start||text.start>=token.end)continue;
              const range=document.createRange();range.setStart(text.node,Math.max(0,token.start-text.start));range.setEnd(text.node,Math.min(text.end,token.end)-text.start);
              for(const rect of Array.from(range.getClientRects())){
                if(rect.width<.2||rect.height<.2)continue;
                const prev=rects.find(r=>Math.abs(r.top-rect.top)<1&&r.right>=rect.left-1&&r.left<=rect.right+1);
                if(prev){prev.left=Math.min(prev.left,rect.left);prev.right=Math.max(prev.right,rect.right);prev.bottom=Math.max(prev.bottom,rect.bottom);}
                else rects.push({left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom});
              }
            }
            rects.forEach((r,index)=>next.push({x:r.left-origin.left,y:r.top-origin.top,w:r.right-r.left,h:r.bottom-r.top,number:token.number,group:token.group,key:`${token.start}:${token.number}:${index}`}));
          }
          spotsRef.current=next;setSpots(next);
        }
        measure();void document.fonts?.ready.then(measure);
      }catch(e:any){if(!cancelled&&e.name!=='RenderingCancelledException')setError('ページを表示できませんでした。別のページへ移動して再試行してください。');}
      finally{if(!cancelled)setBusy(false);}
    }
    if(width>0)void render();
    return()=>{cancelled=true;task?.cancel?.();textLayer?.cancel?.();clearTimeout(hoverTimer.current);};
  },[doc,page,zoom,refs,width]);
  return <section className="pdf-pane" ref={pane} aria-label="PDFリーダー">
    <div className="pdf-toolbar"><span className="pdf-gesture-hint">ピンチ / ⌘・Ctrl＋ホイールで拡大縮小</span><div className="pdf-zoom-controls"><button className="icon-button" aria-label="PDFを縮小" disabled={zoom<=.5} onClick={()=>requestZoom(zoomValue.current-.1)}><Minus size={15}/></button><output aria-label="PDFの倍率">{Math.round(zoom*100)}%</output><button className="icon-button" aria-label="PDFを拡大" disabled={zoom>=3} onClick={()=>requestZoom(zoomValue.current+.1)}><Plus size={15}/></button><button className="text-button fit-page" onClick={()=>requestZoom(1)}><ScanLine size={14}/>幅に合わせる</button></div></div>
    <div className="pdf-viewport" ref={viewport}>
      <div className={`pdf-sheet${hovered!==null&&!down.current?' citation-hover':''}`} ref={sheet} style={size}
        onPointerDown={event=>{if(event.button===0){down.current={x:event.clientX,y:event.clientY};lastSelection.current='';stopHover();}}}
        onPointerMove={event=>{
          if(down.current||busy)return;
          const spot=findSpot(event.clientX,event.clientY),key=spot?.key||'';
          if(key===hoverKey.current)return;
          stopHover();hoverKey.current=key;setHovered(spot?.number??null);
          if(spot)hoverTimer.current=setTimeout(()=>{if(window.getSelection()?.isCollapsed!==false)callbacks.current.onSelect(spot.number,spot.group);},240);
        }} onPointerLeave={stopHover}>
        <div className="pdf-surface" ref={surface}/>
        <div className="hotspots">{spots.map(s=><button type="button" key={s.key} className={s.number===active?'citation-hotspot selected':'citation-hotspot'} style={{left:s.x-1,top:s.y,width:s.w+2,height:s.h}} data-citation-number={s.number} data-citation-group={s.group.join(',')} aria-label={`引用 [${s.number}] のアブストラクト`} onClick={()=>callbacks.current.onSelect(s.number,s.group)}/>)}</div>
        {(busy||error)&&<div className="canvas-status">{busy?<LoaderCircle className="spin" size={22}/>:error}</div>}
      </div><div className="pdf-page-caption">{page} / {doc.numPages}</div>
    </div>
  </section>;
}
