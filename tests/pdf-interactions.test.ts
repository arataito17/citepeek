import assert from 'node:assert/strict';
import {test} from 'node:test';
import {citationTokens,clampZoom,pageDelta,cleanSelection} from '../lib/pdf-interactions.ts';
test('each member of a grouped citation has its own exact text range',()=>{
 const text='Read [1, 20, 3] for details.';
 const tokens=citationTokens(text,[1,20,3]);
 assert.deepEqual(tokens.map(t=>[text.slice(t.start,t.end),t.number]),[['1',1],['20',20],['3',3]]);
 assert.ok(tokens.every(t=>t.group.join(',')==='1,20,3'));
});
test('range endpoints are individually clickable and implicit members remain available',()=>{
 const tokens=citationTokens('[2–4]',[2,3,4]);
 assert.deepEqual(tokens.map(t=>t.number),[2,4]);assert.deepEqual(tokens[0].group,[2,3,4]);
});
test('nonexistent citation members and non-citation brackets are ignored',()=>{
 assert.deepEqual(citationTokens('[1, 9] [text] [4–1]',[1,2]).map(t=>t.number),[1]);
});
test('PDF zoom has bounded stable values',()=>{assert.equal(clampZoom(.01),.5);assert.equal(clampZoom(8),3);assert.equal(clampZoom(1.1000000001),1.1);});
test('page shortcuts map both right arrow and Enter to the next page',()=>{assert.equal(pageDelta('ArrowRight'),1);assert.equal(pageDelta('Enter'),1);assert.equal(pageDelta('ArrowLeft'),-1);assert.equal(pageDelta('ArrowUp'),0);});
test('selection cleanup removes soft hyphens while preserving hard hyphens and paragraphs',()=>{assert.equal(cleanSelection('  long- term\n  transduc\u00ad\ntion  '),'long- term\ntransduction');});
