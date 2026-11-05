import { identifiers, guessTitle } from "./references";
export type Paper = { id: string; title: string; authors: string; year?: number; doi?: string; url: string; abstract: string | null; source: string; confidence: number; method: string };
const timeout = 11000;
export function plain(s = ""): string { return s.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, " ").trim(); }
async function get(url: string) {
  const r = await fetch(url, { headers: { "User-Agent": "Citepeek/1.0 (academic reference reader)" }, signal: AbortSignal.timeout(timeout) });
  if (!r.ok) throw new Error(`upstream ${r.status}`);
  return r;
}
const words = (s: string) => new Set(s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(w => w.length > 2));
export function matchScore(title: string, ref: string) {
  const a = words(title), b = words(ref);
  if (!a.size) return 0;
  return [...a].filter(w => b.has(w)).length / a.size;
}
function crossref(p: any, ref: string, exact = false): Paper {
  const title = plain(p.title?.[0] || "タイトル未登録");
  return { id: `doi:${p.DOI}`, title, authors: (p.author || []).slice(0, 5).map((a: any) => [a.given, a.family].filter(Boolean).join(" ")).join(", "), year: p.published?.["date-parts"]?.[0]?.[0], doi: p.DOI, url: `https://doi.org/${p.DOI}`, abstract: p.abstract ? plain(p.abstract) : null, source: "Crossref", confidence: exact ? 1 : matchScore(title, ref), method: exact ? "DOI一致" : "タイトル照合" };
}
function semantic(p: any, ref: string, exact = false): Paper {
  return { id: p.paperId, title: p.title, authors: (p.authors || []).slice(0, 5).map((a: any) => a.name).join(", "), year: p.year, doi: p.externalIds?.DOI, url: p.url || `https://www.semanticscholar.org/paper/${p.paperId}`, abstract: p.abstract || null, source: "Semantic Scholar", confidence: exact ? 1 : matchScore(p.title, ref), method: exact ? "識別子一致" : "タイトル照合" };
}
function xmlTag(s: string, tag: string) { return plain(s.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`))?.[1] || ""); }
async function arxiv(id: string | undefined, title: string, ref: string): Promise<Paper[]> {
  const url = id ? `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}` : `https://export.arxiv.org/api/query?search_query=${encodeURIComponent('ti:"' + title.replace(/["\n]/g, " ") + '"')}&max_results=3`;
  const xml = await (await get(url)).text();
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].flatMap(m => {
    const entry = m[1], paperTitle = xmlTag(entry, "title"), link = xmlTag(entry, "id").replace("http:", "https:");
    if (!link.includes("arxiv.org/abs/")) return [];
    return [{ id: link, title: paperTitle, authors: [...entry.matchAll(/<author>([\s\S]*?)<\/author>/g)].slice(0, 5).map(a => xmlTag(a[1], "name")).join(", "), year: +xmlTag(entry, "published").slice(0, 4), url: link, abstract: xmlTag(entry, "summary") || null, source: "arXiv", confidence: id ? 1 : matchScore(paperTitle, ref), method: id ? "arXiv ID一致" : "タイトル照合" }];
  });
}
const memory = new Map<string, { at: number; papers: Paper[]; warnings: string[] }>();
export async function resolveReference(ref: string) {
  const key = ref.trim();
  const hit = memory.get(key);
  if (hit && Date.now() - hit.at < 86400000) return hit;
  const ids = identifiers(ref), warnings: string[] = [];
  let papers: Paper[] = [];
  const fields = "title,abstract,authors,year,externalIds,url";
  const attempt = async (name: string, fn: () => Promise<Paper[]>) => { try { return await fn(); } catch { warnings.push(`${name}に接続できませんでした。時間をおいて再取得できます。`); return []; } };
  // Exact identifiers always take precedence over title retrieval.
  if (ids.doi || ids.arxiv) {
    const results = await Promise.all([
      ids.doi ? attempt("Crossref", async () => [crossref((await (await get(`https://api.crossref.org/works/${encodeURIComponent(ids.doi!)}`)).json() as any).message, ref, true)]) : Promise.resolve([]),
      ids.arxiv ? attempt("arXiv", () => arxiv(ids.arxiv, "", ref)) : Promise.resolve([]),
      attempt("Semantic Scholar", async () => [semantic(await (await get(`https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(ids.doi ? 'DOI:' + ids.doi : 'ARXIV:' + ids.arxiv)}?fields=${fields}`)).json(), ref, true)]),
    ]);
    papers = results.flat();
  }
  if (!papers.length) {
    const title = guessTitle(ref);
    const results = await Promise.all([
      attempt("Crossref", async () => ((await (await get(`https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(ref.slice(0, 1200))}&rows=3`)).json() as any).message.items || []).map((p: any) => crossref(p, ref))),
      attempt("Semantic Scholar", async () => ((await (await get(`https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(title.slice(0, 300))}&limit=3&fields=${fields}`)).json() as any).data || []).map((p: any) => semantic(p, ref))),
    ]);
    papers = results.flat().filter(p => p.confidence >= .45);
    if (!papers.some(p => p.abstract && p.confidence >= .8)) papers.push(...await attempt("arXiv", () => arxiv(undefined, papers.sort((a, b) => b.confidence - a.confidence)[0]?.title || title, ref)));
  }
  papers.sort((a, b) => b.confidence - a.confidence || Number(!!b.abstract) - Number(!!a.abstract));
  // Fill missing abstracts by DOI without substituting a different paper.
  const best = papers[0];
  if (best?.doi && !best.abstract) {
    try {
      const data: any = await (await get(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent('DOI:"' + best.doi + '"')}&resultType=core&format=json`)).json();
      const p = data.resultList?.result?.find((p: any) => p.doi?.toLowerCase() === best.doi?.toLowerCase());
      if (p?.abstractText) { best.abstract = plain(p.abstractText); best.source += " / Europe PMC"; }
    } catch { /* Missing abstract remains explicit in the UI. */ }
  }
  const unique = papers.filter((p, i, all) => all.findIndex(q => q.title.toLowerCase().replace(/\W/g, "") === p.title.toLowerCase().replace(/\W/g, "")) === i).slice(0, 4);
  const result = { at: Date.now(), papers: unique, warnings };
  // Do not cache transient provider failures or failed lookups.
  if (unique.some(p => p.abstract) && !warnings.length) { if (memory.size >= 100) memory.delete(memory.keys().next().value!); memory.set(key, result); }
  return result;
}
