// Gerador mínimo de PDF (tabela paginada) sem dependências. Usa Helvetica padrão com codificação WinAnsi
// (cobre acentos do português). Texto fora dessa codificação vira "?".

export type PCol = { header: string; align?: "left" | "right" };

// Larguras da Helvetica (por 1000 unidades) para os caracteres ASCII 32..126
const W = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,
  1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,
  333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];

const SPECIAL: Record<string, number> = { "…": 0x85, "–": 0x96, "—": 0x97, "“": 0x93, "”": 0x94, "‘": 0x91, "’": 0x92, "€": 0x80, "•": 0x95 };

function winAnsi(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (SPECIAL[ch] !== undefined) out += String.fromCharCode(SPECIAL[ch]);
    else if (c >= 32 && c <= 126) out += ch;
    else if (c >= 160 && c <= 255) out += ch;
    else out += "?";
  }
  return out;
}
const pdfEscape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

function width(s: string, size: number, bold = false): number {
  let w = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    w += c >= 32 && c <= 126 ? W[c - 32] : c === 0x85 ? 1000 : 556;
  }
  return (w * size * (bold ? 1.06 : 1)) / 1000;
}

function fit(s: string, maxW: number, size: number, bold = false): string {
  if (width(s, size, bold) <= maxW) return s;
  let t = s;
  while (t.length > 1 && width(t + "\x85", size, bold) > maxW) t = t.slice(0, -1);
  return t + "\x85";
}

export function buildPdf(opts: { title: string; subtitle: string; columns: PCol[]; rows: string[][]; footer?: string }): Buffer {
  const landscape = opts.columns.length > 6;
  const PW = landscape ? 842 : 595;
  const PH = landscape ? 595 : 842;
  const M = 36, ROW = 14, HEAD = 18, FS = 8;

  const cols = opts.columns.map((c) => ({ ...c, header: winAnsi(c.header) }));
  const rows = opts.rows.map((r) => r.map((c) => winAnsi(c ?? "")));

  // larguras das colunas
  const avail = PW - 2 * M;
  const nat = cols.map((c, i) => {
    let w = width(c.header, FS, true);
    for (const r of rows.slice(0, 300)) w = Math.max(w, width(r[i] ?? "", FS));
    return Math.min(Math.max(w + 10, 36), 200);
  });
  const sum = nat.reduce((a, b) => a + b, 0);
  const scale = sum > avail ? avail / sum : Math.min(avail / sum, 1.5);
  const cw = nat.map((w) => Math.max(w * scale, 24));

  const firstTop = PH - M - 14 - 20; // abaixo do título e do subtítulo
  const otherTop = PH - M;
  const bottom = M + 16;
  const cap = (top: number) => Math.max(1, Math.floor((top - HEAD - bottom) / ROW));
  const pages: string[][][] = [];
  let i = 0;
  let first = true;
  do {
    const n = cap(first ? firstTop : otherTop);
    pages.push(rows.slice(i, i + n));
    i += n;
    first = false;
  } while (i < rows.length);

  const streams = pages.map((pageRows, p) => {
    let c = "";
    const top = p === 0 ? firstTop : otherTop;
    if (p === 0) {
      c += `BT /F2 14 Tf 0.12 0.23 0.17 rg ${M} ${PH - M - 12} Td (${pdfEscape(winAnsi(opts.title))}) Tj ET\n`;
      c += `BT /F1 9 Tf 0.3 0.35 0.31 rg ${M} ${PH - M - 28} Td (${pdfEscape(fit(winAnsi(opts.subtitle), avail, 9))}) Tj ET\n`;
    }
    // cabeçalho
    c += `0.12 0.23 0.17 rg ${M} ${top - HEAD} ${avail} ${HEAD} re f\n`;
    let x = M;
    cols.forEach((col, ci) => {
      const t = fit(col.header, cw[ci] - 8, FS, true);
      const tx = col.align === "right" ? x + cw[ci] - 4 - width(t, FS, true) : x + 4;
      c += `BT /F2 ${FS} Tf 1 1 1 rg ${tx.toFixed(1)} ${top - HEAD + 6} Td (${pdfEscape(t)}) Tj ET\n`;
      x += cw[ci];
    });
    // linhas
    pageRows.forEach((r, ri) => {
      const y = top - HEAD - (ri + 1) * ROW;
      if (ri % 2 === 1) c += `0.95 0.96 0.94 rg ${M} ${y} ${avail} ${ROW} re f\n`;
      let cx = M;
      cols.forEach((col, ci) => {
        const t = fit(r[ci] ?? "", cw[ci] - 8, FS);
        const tx = col.align === "right" ? cx + cw[ci] - 4 - width(t, FS) : cx + 4;
        c += `BT /F1 ${FS} Tf 0.1 0.16 0.13 rg ${tx.toFixed(1)} ${y + 4} Td (${pdfEscape(t)}) Tj ET\n`;
        cx += cw[ci];
      });
    });
    // rodapé
    const foot = `Página ${p + 1} de ${pages.length}`;
    c += `BT /F1 8 Tf 0.3 0.35 0.31 rg ${PW - M - width(winAnsi(foot), 8)} ${M - 4} Td (${pdfEscape(winAnsi(foot))}) Tj ET\n`;
    if (opts.footer) c += `BT /F1 8 Tf 0.3 0.35 0.31 rg ${M} ${M - 4} Td (${pdfEscape(fit(winAnsi(opts.footer), avail - 120, 8))}) Tj ET\n`;
    return c;
  });

  // objetos: 1 catálogo, 2 páginas, 3 e 4 fontes, 5 informações; depois (conteúdo, página) para cada página
  const objs: string[] = [];
  const pageIds = pages.map((_, p) => 7 + p * 2);
  objs[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objs[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objs[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;
  objs[4] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`;
  objs[5] = `<< /Title (${pdfEscape(winAnsi(opts.title))}) /Producer (Fazenda Gado) >>`;
  streams.forEach((s, p) => {
    objs[pageIds[p] - 1] = `<< /Length ${s.length} >>\nstream\n${s}endstream`;
    objs[pageIds[p]] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageIds[p] - 1} 0 R >>`;
  });

  let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [];
  const last = objs.length - 1;
  for (let id = 1; id <= last; id++) {
    offsets[id] = out.length;
    out += `${id} 0 obj\n${objs[id]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${last + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= last; id++) out += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${last + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
