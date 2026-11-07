import type { MonthClose } from "@/lib/domain/finance/close";
import { monthLabel } from "@/lib/domain/history";
import { formatDate, formatMoney } from "@/lib/ui/format";

const FROM: Record<MonthClose["lines"][number]["forecast_from"], string> = {
  budget: "orçamento",
  bills: "contas que se repetem",
  spent: "igual a este mês",
};

/** WinAnsi bytes for the letters the report uses. Anything else becomes "?". */
const EXTRA: Record<string, number> = {
  "á": 0xe1, "à": 0xe0, "â": 0xe2, "ã": 0xe3,
  "é": 0xe9, "ê": 0xea,
  "í": 0xed,
  "ó": 0xf3, "ô": 0xf4, "õ": 0xf5,
  "ú": 0xfa, "ü": 0xfc,
  "ç": 0xe7,
  "Á": 0xc1, "À": 0xc0, "Â": 0xc2, "Ã": 0xc3,
  "É": 0xc9, "Ê": 0xca,
  "Í": 0xcd,
  "Ó": 0xd3, "Ô": 0xd4, "Õ": 0xd5,
  "Ú": 0xda, "Ü": 0xdc,
  "Ç": 0xc7,
  "–": 0x96, "—": 0x97,
};

function escapePdf(text: string): string {
  let out = "";
  for (const char of text) {
    const code = char.charCodeAt(0);
    const byte = code < 128 ? code : EXTRA[char] ?? 0x3f;
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) out += `\\${String.fromCharCode(byte)}`;
    else if (byte < 32 || byte > 126) out += `\\${byte.toString(8).padStart(3, "0")}`;
    else out += String.fromCharCode(byte);
  }
  return out;
}

function clip(text: string, max = 64): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}...`;
}

type PdfLine = { text: string; size: number; gap: number };

function linesOf(close: MonthClose): PdfLine[] {
  const spentName = monthLabel(close.month);
  const nextName = monthLabel(close.next_month);
  const lines: PdfLine[] = [
    { text: "Casa", size: 22, gap: 8 },
    { text: `Fechamento de ${spentName}`, size: 16, gap: 4 },
    { text: `Fechado em ${formatDate(close.closed_on)}`, size: 11, gap: 18 },
    { text: "O mês", size: 13, gap: 8 },
    { text: `Entrou  ${formatMoney(close.income_cents)}`, size: 12, gap: 4 },
    { text: `Saiu  ${formatMoney(close.expense_cents)}`, size: 12, gap: 4 },
    { text: `Resultado  ${formatMoney(close.result_cents)}`, size: 12, gap: 18 },
    { text: "Gastos", size: 13, gap: 8 },
  ];
  if (close.lines.length === 0) lines.push({ text: "Nenhuma saída neste mês.", size: 11, gap: 8 });
  for (const line of close.lines) {
    lines.push({ text: clip(line.name), size: 12, gap: 2 });
    lines.push({ text: `   ${formatMoney(line.spent_cents)}`, size: 11, gap: 6 });
  }
  lines.push({ text: `Previsão de ${nextName}`, size: 13, gap: 8 });
  lines.push({ text: `Deve sair  ${formatMoney(close.forecast_expense_cents)}`, size: 12, gap: 4 });
  lines.push({
    text: `Deve entrar  ${formatMoney(close.forecast_income_cents)}${close.income_forecast_from === "bills" ? "  (contas)" : ""}`,
    size: 12,
    gap: 14,
  });
  for (const line of close.lines) {
    lines.push({ text: clip(`${line.name}  ${formatMoney(line.forecast_cents)}`), size: 11, gap: 1 });
    lines.push({ text: `   ${FROM[line.forecast_from]}`, size: 10, gap: 5 });
  }
  lines.push({
    text: "A previsão usa o orçamento do próximo mês, se houver.",
    size: 9,
    gap: 3,
  });
  lines.push({ text: "Sem orçamento, usa as contas que se repetem.", size: 9, gap: 3 });
  lines.push({ text: "Sem as duas, repete o gasto deste mês.", size: 9, gap: 3 });
  return lines;
}

function pageStream(lines: PdfLine[]): string {
  let y = 790;
  const commands = ["BT"];
  for (const line of lines) {
    commands.push(`/F1 ${line.size} Tf`, `1 0 0 1 48 ${y} Tm`, `(${escapePdf(line.text)}) Tj`);
    y -= line.size + line.gap;
  }
  commands.push("ET");
  return commands.join("\n");
}

/** Splits the report so a long category list stays on the page. */
function paginate(lines: PdfLine[]): PdfLine[][] {
  const pages: PdfLine[][] = [];
  let page: PdfLine[] = [];
  let y = 790;
  for (const line of lines) {
    const next = y - (line.size + line.gap);
    if (page.length > 0 && next < 48) {
      pages.push(page);
      page = [];
      y = 790;
    }
    page.push(line);
    y -= line.size + line.gap;
  }
  if (page.length > 0) pages.push(page);
  return pages.length > 0 ? pages : [[]];
}

/** A small PDF, Helvetica, one report. No extra library: the text is WinAnsi. */
export function renderClosePdf(close: MonthClose): Uint8Array {
  const contents = paginate(linesOf(close)).map(pageStream);
  const fontId = 3 + contents.length * 2;
  const blobs = new Map<number, string>();
  const pageIds: number[] = [];
  contents.forEach((stream, index) => {
    const pageId = 3 + index * 2;
    const contentId = pageId + 1;
    pageIds.push(pageId);
    blobs.set(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`);
    blobs.set(contentId, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  blobs.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  blobs.set(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  blobs.set(fontId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");

  const encoder = new TextEncoder();
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id <= fontId; id += 1) {
    offsets[id] = encoder.encode(body).length;
    body += `${id} 0 obj\n${blobs.get(id)}\nendobj\n`;
  }
  const xrefAt = encoder.encode(body).length;
  let xref = `xref\n0 ${fontId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= fontId; id += 1) xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  body += `${xref}trailer\n<< /Size ${fontId + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return encoder.encode(body);
}
