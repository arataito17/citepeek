export function decodeText(value: string): string {
  return value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (all, code: string) => {
      const n = code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : Number(code);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : all;
    })
    .replace(/&(amp|lt|gt|quot|apos|nbsp|ndash|mdash);/gi, (_, name: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—" }[name.toLowerCase()] || " "))
    .replace(/\s+/g, " ").trim();
}

export function normalizeDoi(value: string | undefined): string {
  let doi = (value || "").trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "");
  try { doi = decodeURIComponent(doi); } catch { /* Keep an already decoded identifier. */ }
  doi = doi.replace(/[.,;:]+$/, "");
  while (doi.endsWith(")") && (doi.match(/\)/g)?.length || 0) > (doi.match(/\(/g)?.length || 0)) doi = doi.slice(0, -1);
  return doi.toLowerCase();
}

export function acmUrl(doi: string): string {
  return `https://dl.acm.org/doi/${normalizeDoi(doi)}`;
}

// OpenAlex distributes abstracts as word -> position[] rather than plain text.
export function invertedAbstract(index: unknown): string | null {
  if (!index || typeof index !== "object" || Array.isArray(index)) return null;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) {
    if (!Array.isArray(positions)) continue;
    for (const position of positions) {
      if (Number.isInteger(position) && position >= 0 && position < 10000) words[position] = word;
    }
  }
  const text = words.filter(Boolean).join(" ").trim();
  return text || null;
}

export function parseAcmAbstract(html: string): string | null {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = Object.fromEntries([...match[0].matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g)].map(m => [m[1].toLowerCase(), m[3]]));
    if (/^(citation_abstract|dc\.description|dcterms\.abstract)$/i.test(attributes.name || "") && attributes.content) {
      const text = decodeText(attributes.content);
      if (text.length > 60) return text;
    }
  }
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(match[1]);
      const entries = Array.isArray(data) ? data : [data, ...(data["@graph"] || [])];
      for (const entry of entries) {
        if (!entry || !String(entry["@type"]).includes("ScholarlyArticle")) continue;
        const text = decodeText(typeof entry.abstract === "string" ? entry.abstract : typeof entry.description === "string" ? entry.description : "");
        if (text.length > 60) return text;
      }
    } catch { /* Other page metadata can be malformed without invalidating the abstract. */ }
  }
  const opening = /<(div|section)\b[^>]*class\s*=\s*["'][^"']*\babstractSection\b[^"']*["'][^>]*>/i.exec(html);
  if (!opening) return null;
  const start = opening.index + opening[0].length;
  const tags = new RegExp(`<\\/?${opening[1]}\\b[^>]*>`, "gi");
  tags.lastIndex = start;
  let depth = 1, tag;
  while ((tag = tags.exec(html))) {
    if (tag[0].startsWith("</")) depth--; else if (!tag[0].endsWith("/>")) depth++;
    if (depth === 0) {
      const text = decodeText(html.slice(start, tag.index)).replace(/^Abstract\s*/i, "");
      return text.length > 60 ? text : null;
    }
  }
  return null;
}

export async function publisherAbstract(doi: string): Promise<{ abstract: string | null; warning?: string }> {
  const clean = normalizeDoi(doi);
  if (!/^10\.1145\/[a-z0-9._-]+$/i.test(clean)) return { abstract: null };
  try {
    const response = await fetch(acmUrl(clean), { headers: { "User-Agent": "Citepeek/1.0 (academic reference reader)", Accept: "text/html" }, redirect: "error", signal: AbortSignal.timeout(8000) });
    if (response.status === 403 || response.headers.get("cf-mitigated") === "challenge") return { abstract: null, warning: "ACMは自動取得にブラウザ確認を要求しています。ACMの論文ページはリンクから開けます。" };
    if (!response.ok) return { abstract: null, warning: `ACMからの直接取得はHTTP ${response.status}でした。` };
    return { abstract: parseAcmAbstract(await response.text()) };
  } catch { return { abstract: null, warning: "ACMの論文ページから直接取得できませんでした。" }; }
}
