export type TextBox={left:number;top:number;right:number;bottom:number};
const gap=(value:number,start:number,end:number)=>Math.max(start-value,0,value-end);

// Prefer the visual line, then the closest run on that line. DOM order and
// Euclidean distance can jump to a page header or a different wrapped line.
export function nearestTextBox<T extends TextBox>(boxes:readonly T[],x:number,y:number,columnX?:number):T|undefined{
  let best:T|undefined,vertical=Infinity,horizontal=Infinity;
  for(const box of boxes){
    const dy=gap(y,box.top,box.bottom),dx=gap(x,box.left,box.right);
    if(dy<vertical-.5||(Math.abs(dy-vertical)<=.5&&dx<horizontal)){
      best=box;vertical=dy;horizontal=dx;
    }
  }
  if(best&&columnX!==undefined&&gap(x,best.left,best.right)>(best.bottom-best.top)*.6){
    const tolerance=(best.bottom-best.top)*.4;
    let columnDistance=Infinity,lineDistance=Infinity;
    for(const box of boxes){
      const dy=gap(y,box.top,box.bottom);if(dy>vertical+tolerance)continue;
      const dx=gap(columnX,box.left,box.right);
      if(dx<columnDistance||(dx===columnDistance&&dy<lineDistance)){
        best=box;columnDistance=dx;lineDistance=dy;
      }
    }
  }
  return best;
}
type Position={node:Text;offset:number};
type Run=TextBox&{node:Text};
export function selectionColumn(boxes:readonly TextBox[],x:number,y:number,pageWidth:number):number|undefined{
  let best:TextBox|undefined,dx=Infinity,dy=Infinity;
  for(const box of boxes){
    const width=box.right-box.left,vertical=gap(y,box.top,box.bottom),horizontal=gap(x,box.left,box.right);
    if(width<pageWidth*.2||width>pageWidth*.6||vertical>(box.bottom-box.top)*8)continue;
    if(horizontal<dx||(horizontal===dx&&vertical<dy)){best=box;dx=horizontal;dy=vertical;}
  }
  return best?(best.left+best.right)/2:undefined;
}
type CaretDocument=Document&{
  caretPositionFromPoint?:(x:number,y:number)=>{offsetNode:Node;offset:number}|null;
  caretRangeFromPoint?:(x:number,y:number)=>Range|null;
};

// Keep a real browser Selection (copy, keyboard extension, and accessibility),
// but resolve mouse endpoints against PDF glyphs instead of an absolute-position
// container's empty inline flow. Touch and multi-click selection stay native.
export function bindPdfSelection(layer:HTMLElement,viewport:HTMLElement){
  const doc=layer.ownerDocument as CaretDocument,events=new AbortController();
  const options={signal:events.signal};
  let runs:Run[]=[],anchor:Position|null=null,last:{x:number;y:number}|null=null,scrollFrame=0,columnX:number|undefined;
  function measure(){
    const origin=layer.getBoundingClientRect(),walker=doc.createTreeWalker(layer,NodeFilter.SHOW_TEXT);
    runs=[];let node;
    while((node=walker.nextNode())){
      if(!node.textContent?.trim())continue;
      const range=doc.createRange();range.selectNodeContents(node);
      for(const r of Array.from(range.getClientRects()))if(r.width>0&&r.height>0){
        runs.push({node:node as Text,left:r.left-origin.left,top:r.top-origin.top,right:r.right-origin.left,bottom:r.bottom-origin.top});
      }
    }
  }
  function position(x:number,y:number):Position|undefined{
    const origin=layer.getBoundingClientRect(),px=x-origin.left,py=y-origin.top,run=nearestTextBox(runs,px,py,columnX);
    if(!run)return;
    // Retain the current column in its trailing whitespace. Change columns only
    // when the pointer reaches actual text there, not merely its nearby gutter.
    if(columnX===undefined||(px>=run.left&&px<=run.right&&py>=run.top&&py<=run.bottom)){
      let left=run.left,right=run.right,changed=true;
      while(changed){
        changed=false;
        for(const r of runs)if(r.top<run.bottom&&r.bottom>run.top&&r.left<=right+(run.bottom-run.top)*1.2&&r.right>=left-(run.bottom-run.top)*1.2){
          if(r.left<left||r.right>right){left=Math.min(left,r.left);right=Math.max(right,r.right);changed=true;}
        }
      }
      columnX=(left+right)/2;
    }
    const cx=Math.max(run.left+.1,Math.min(run.right-.1,x-origin.left))+origin.left;
    const cy=Math.max(run.top+.1,Math.min(run.bottom-.1,y-origin.top))+origin.top;
    const caret=doc.caretPositionFromPoint?.(cx,cy),range=caret?null:doc.caretRangeFromPoint?.(cx,cy);
    const node=caret?.offsetNode??range?.startContainer,offset=caret?.offset??range?.startOffset;
    if(node===run.node&&offset!==undefined)return{node:run.node,offset};
    // Some WebKit versions return the parent container even after clamping.
    // Measure graphemes so the fallback cannot split a surrogate or combining mark.
    const glyphs:(TextBox&{start:number;end:number})[]=[],r=doc.createRange();
    for(const part of new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(run.node.data)){
      r.setStart(run.node,part.index);r.setEnd(run.node,part.index+part.segment.length);
      const b=r.getBoundingClientRect();
      if(b.width>0)glyphs.push({left:b.left,top:b.top,right:b.right,bottom:b.bottom,start:part.index,end:part.index+part.segment.length});
    }
    const glyph=nearestTextBox(glyphs,cx,cy);if(!glyph)return;
    const rtl=getComputedStyle(run.node.parentElement!).direction==='rtl';
    return{node:run.node,offset:(cx<(glyph.left+glyph.right)/2)!==rtl?glyph.start:glyph.end};
  }
  function extend(){
    if(!anchor||!last||!layer.isConnected)return;
    const end=position(last.x,last.y);
    if(end)doc.getSelection()?.setBaseAndExtent(anchor.node,anchor.offset,end.node,end.offset);
  }
  function autoScroll(){
    if(!anchor||!last)return;
    const box=viewport.getBoundingClientRect();
    const speed=(n:number,min:number,max:number)=>n<min?-Math.min(24,(min-n)/3):n>max?Math.min(24,(n-max)/3):0;
    const dx=speed(last.x,box.left,box.right),dy=speed(last.y,box.top,box.bottom);
    if(dx||dy){viewport.scrollLeft+=dx;viewport.scrollTop+=dy;extend();}
    scrollFrame=requestAnimationFrame(autoScroll);
  }
  function finish(){anchor=null;last=null;cancelAnimationFrame(scrollFrame);}
  layer.addEventListener('pointerdown',event=>{
    if(event.button!==0||event.pointerType==='touch'||event.detail>1||event.ctrlKey||event.metaKey||event.altKey)return;
    measure();const box=layer.getBoundingClientRect();
    columnX=selectionColumn(runs,event.clientX-box.left,event.clientY-box.top,box.width);
    const start=position(event.clientX,event.clientY);if(!start)return;
    const selection=doc.getSelection();
    anchor=event.shiftKey&&selection?.anchorNode?.nodeType===Node.TEXT_NODE&&layer.contains(selection.anchorNode)
      ?{node:selection.anchorNode as Text,offset:selection.anchorOffset}:start;
    last={x:event.clientX,y:event.clientY};event.preventDefault();layer.focus({preventScroll:true});extend();
    scrollFrame=requestAnimationFrame(autoScroll);
  },options);
  window.addEventListener('pointermove',event=>{
    if(!anchor)return;if(!(event.buttons&1)){finish();return;}
    last={x:event.clientX,y:event.clientY};event.preventDefault();extend();
  },{...options,passive:false});
  window.addEventListener('pointerup',event=>{if(anchor){last={x:event.clientX,y:event.clientY};extend();finish();}},options);
  window.addEventListener('pointercancel',finish,options);window.addEventListener('blur',finish,options);
  return()=>{finish();events.abort();};
}
