import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseAcmAbstract,invertedAbstract,publisherAbstract,normalizeDoi} from '../lib/abstract-sources';
import {resolveReference} from '../lib/papers';
const abstract='We introduce an efficient method for understanding references in scientific documents, and evaluate the method using several realistic research collections.';
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});

test('ACM nested abstract container excludes unrelated footer text',()=>{
  const html=`<div class="abstractSection abstractInFull"><h2>Abstract</h2><div role="paragraph"><p>${abstract}</p></div></div><footer>Unrelated contents</footer>`;
  assert.equal(parseAcmAbstract(html),abstract);
});
test('ACM structured article metadata and numeric entities',()=>{
  assert.equal(parseAcmAbstract(`<script type="application/ld+json">${JSON.stringify({'@type':'ScholarlyArticle',abstract})}</script>`),abstract);
  assert.equal(parseAcmAbstract(`<meta name="citation_abstract" content="${abstract} &#x3B1; &amp; &#946;">`),abstract+' α & β');
  assert.equal(parseAcmAbstract('<title>Just a moment...</title>'),null);
});
test('OpenAlex word positions reconstruct ordering and ignore invalid positions',()=>{
  assert.equal(invertedAbstract({'references.':[3],'We':[0],'read':[1],'scientific':[2],'bad':[-1,Infinity,1000000]}),'We read scientific references.');
  assert.equal(invertedAbstract(null),null);
  assert.equal(normalizeDoi('https://doi.org/10.1145/ABC.123).'),'10.1145/abc.123');
});
test('ACM challenge becomes an explicit warning without treating it as an abstract',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response('<title>Just a moment...</title>',{status:403,headers:{'cf-mitigated':'challenge'}});
  try{const value=await publisherAbstract('10.1145/0000000.0000001');assert.equal(value.abstract,null);assert.match(value.warning!,/ブラウザ確認/);}finally{globalThis.fetch=original;}
});
test('an ACM DOI with missing Crossref abstract is supplemented by exact OpenAlex DOI',async()=>{
  const original=globalThis.fetch,doi='10.1145/0000000.0000101',seen:string[]=[];
  globalThis.fetch=async(input:any)=>{
    const url=String(input);seen.push(url);
    if(url.includes('api.crossref.org'))return json({message:{DOI:doi,title:['A reference study'],author:[]}});
    if(url.includes('api.semanticscholar.org'))return json({},429);
    if(url.includes('api.openalex.org'))return json({doi:'https://doi.org/'+doi,abstract_inverted_index:{'A':[0],'verified':[1],'abstract.':[2]}});
    if(url.includes('dl.acm.org'))return new Response('challenge',{status:403});
    throw new Error('Unexpected request '+url);
  };
  try{
    const value=await resolveReference(doi);
    assert.equal(value.papers[0].abstract,'A verified abstract.');assert.match(value.papers[0].source,/OpenAlex/);
    assert.equal(value.papers[0].url,'https://dl.acm.org/doi/'+doi);
    assert.ok(seen.includes('https://dl.acm.org/doi/'+doi));
    assert.ok(value.warnings.some(w=>w.includes('ACM')));
  }finally{globalThis.fetch=original;}
});
test('a different OpenAlex DOI is never used to fill an abstract',async()=>{
  const original=globalThis.fetch,doi='10.1145/0000000.0000102';
  globalThis.fetch=async(input:any)=>{
    const url=String(input);
    if(url.includes('api.crossref.org'))return json({message:{DOI:doi,title:['Different DOI validation'],author:[]}});
    if(url.includes('api.semanticscholar.org'))return json({},429);
    if(url.includes('api.openalex.org'))return json({doi:'https://doi.org/10.1145/9999999',abstract_inverted_index:{'Wrong':[0],'paper.':[1]}});
    if(url.includes('dl.acm.org'))return new Response('challenge',{status:403});
    if(url.includes('europepmc'))return json({resultList:{result:[]}});
    throw new Error('Unexpected request '+url);
  };
  try{assert.equal((await resolveReference(doi)).papers[0].abstract,null);}finally{globalThis.fetch=original;}
});
test('provider title variations for the same DOI are merged with the abstract',async()=>{
  const original=globalThis.fetch,doi='10.1145/0000000.0000103';
  globalThis.fetch=async(input:any)=>{
    const url=String(input);
    if(url.includes('api.crossref.org'))return json({message:{DOI:doi,title:['Short title'],author:[]}});
    if(url.includes('api.semanticscholar.org'))return json({paperId:'example',title:'Short title: an additional subtitle',abstract,externalIds:{DOI:doi},authors:[]});
    throw new Error('Should not need another provider: '+url);
  };
  try{const value=await resolveReference(doi);assert.equal(value.papers.length,1);assert.equal(value.papers[0].abstract,abstract);assert.match(value.papers[0].source,/Semantic Scholar/);}finally{globalThis.fetch=original;}
});
