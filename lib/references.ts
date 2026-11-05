export type Reference = { number: number; text: string; page: number };
export type PdfLine = { text: string; x: number; y: number; width: number; height: number; page: number };

export function citationNumbers(text: string): number[] {
  const out = new Set<number>();
  for (const part of text.replace(/[\[\]]/g, "").split(/[,;，]/)) {
    const range = part.trim().match(/^(\d{1,4})\s*[-–—]\s*(\d{1,4})$/);
    if (range) {
      const a = +range[1], b = +range[2];
      if (b >= a && b - a < 50) for (let i = a; i <= b; i++) out.add(i);
    } else if (/^\s*\d{1,4}\s*$/.test(part)) out.add(+part);
  }
  return [...out];
}

// Reconstruct reading order independently for each column. Whole-width headings
// are kept before columns at the same vertical position.
export function orderedLines(items: any[], width: number, page: number): PdfLine[] {
  const text = items.filter(i => typeof i.str === "string" && i.str.trim());
  const hasTwoColumns = text.filter(i => i.transform[4] > width * .48 && i.transform[4] < width * .68).length > 7
    && text.filter(i => i.transform[4] < width * .3).length > 7;
  const buckets: any[][] = hasTwoColumns ? [[], []] : [[]];
  for (const item of text) buckets[hasTwoColumns && item.transform[4] >= width * .48 ? 1 : 0].push(item);
  return buckets.flatMap(bucket => {
    bucket.sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);
    const rows: any[][] = [];
    for (const item of bucket) {
      const row = rows.at(-1);
      if (row && Math.abs(row[0].transform[5] - item.transform[5]) < Math.max(2, Math.abs(item.transform[3]) * .25)) row.push(item);
      else rows.push([item]);
    }
    return rows.map(row => {
      row.sort((a, b) => a.transform[4] - b.transform[4]);
      let value = "";
      row.forEach((item, index) => {
        const prev = row[index - 1];
        if (prev && item.transform[4] - (prev.transform[4] + prev.width) > 1.4) value += " ";
        value += item.str;
      });
      const first = row[0], last = row.at(-1);
      return { text: value, x: first.transform[4], y: first.transform[5], width: last.transform[4] + last.width - first.transform[4], height: Math.max(...row.map(i => Math.hypot(i.transform[2], i.transform[3]))), page };
    });
  });
}

export function extractReferences(lines: PdfLine[]): Reference[] {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(?:\d+\.?\s+)?(?:references|bibliography|参考文献)\s*$/i.test(lines[i].text)) start = i + 1;
  }
  // Some PDFs have no extractable heading. Accept only a consecutive run,
  // never a lone [1] in the body.
  if (start < 0) {
    for (let i = Math.floor(lines.length * .35); i < lines.length; i++) {
      if (/^\s*\[1\]\s*\S/.test(lines[i].text)) {
        const tail = lines.slice(i + 1, i + 40);
        if (tail.some(l => /^\s*\[2\]\s*\S/.test(l.text))) { start = i; break; }
      }
    }
  }
  if (start < 0) return [];
  const refs = new Map<number, Reference>();
  let current: Reference | null = null;
  for (const line of lines.slice(start)) {
    const text = line.text.trim();
    if (/^(?:appendix|appendices|supplementary|acknowledg)/i.test(text) && refs.size) break;
    const match = text.match(/^(?:\[(\d{1,4})\]|(\d{1,4})\.)\s+(.+)/);
    if (match) {
      const number = +(match[1] || match[2]);
      if (number < 1 || refs.has(number)) continue;
      current = { number, text: match[3], page: line.page };
      refs.set(number, current);
    } else if (current && text.length > 2 && !/^\d+$/.test(text) && !/^references$/i.test(text)) {
      current.text += current.text.endsWith("-") ? text : " " + text;
    }
  }
  return [...refs.values()].sort((a, b) => a.number - b.number);
}

export function identifiers(text: string) {
  const doi = text.match(/10\.\d{4,9}\/[\w.\-;()/:%+]+/i)?.[0]?.replace(/[.,;:]+$/, "");
  const arxiv = text.match(/(?:arxiv\s*:?\s*|arxiv\.org\/(?:abs|pdf)\/)(\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+\/\d{7})/i)?.[1];
  return { doi, arxiv };
}

export function guessTitle(text: string): string {
  const quoted = text.match(/[“"]([^”"]{15,})[”"]/);
  if (quoted) return quoted[1];
  const cleaned = text.replace(/https?:\/\/\S+/g, "").replace(/arxiv\s*:?\s*\S+/ig, "");
  const parts = cleaned.split(/\.\s+(?=[A-Z\d])/).map(p => p.trim());
  const possible = parts.filter(p => p.length > 18 && p.split(/\s+/).length >= 4 && !/^(?:In |Proceedings|Advances|Journal|vol\.|pp\.)/i.test(p));
  // Authors usually precede the title and contain many commas/initials.
  return possible.find(p => !/(?:\b[A-Z]\.\s*){2}|,.*?,/.test(p)) || possible[1] || possible[0] || text;
}
