// Feed post content is stored as rich-text HTML (from the web editor). Web renders it
// directly as HTML, so tables show as a grid. Mobile previously stripped ALL tags
// (including <table>/<tr>/<td>) into flat text, collapsing tables into unreadable
// jumbled text. This splits content into plain-text and table blocks so callers can
// render a real grid for tables instead.

export interface TextBlock { type: 'text'; text: string }
export interface TableBlock { type: 'table'; rows: string[][] }
export type ContentBlock = TextBlock | TableBlock;

// Matches web's cap on Post/Appreciation/Feedback content (Feed.jsx). A
// paste that would push the text past this is rejected outright rather than
// silently truncated — losing the tail of a long paste with no feedback is
// more surprising than just blocking it and telling the user why.
export const CONTENT_MAX_LEN = 100000;

export function guardedTextChange(oldText: string, newText: string, maxLen = CONTENT_MAX_LEN): { text: string; blocked: boolean } {
  if (newText.length <= maxLen) return { text: newText, blocked: false };
  // A single keystroke can't add more than a handful of characters — a
  // bigger jump landing in one onChangeText call is a paste, not typing.
  const grew = newText.length - oldText.length;
  if (grew > 20) return { text: oldText, blocked: true };
  return { text: newText.slice(0, maxLen), blocked: false };
}

function decodeEntities(str: string) {
  return str
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

// Content pasted from Word/Outlook embeds a <style> block of mso-* CSS rules (and
// sometimes <script>/conditional comments) — stripping just the tag delimiters leaves
// all that CSS/JS text behind as visible plain text.
export function stripNonContentElements(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

// <ol> items need real "1. 2. 3." numbering — done as its own pass first,
// since the generic <li> handling below has no notion of which list (or what
// position within it) a given <li> belongs to and would otherwise turn every
// list item into the same round bullet, ordered or not. Numbering restarts
// per <ol> (not globally), matching how a real ordered list renders.
function numberOrderedLists(html: string): string {
  return html.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner) => {
    let n = 0;
    return inner.replace(/<li[^>]*>/gi, () => `\n${++n}. `);
  });
}

export function stripTags(str: string) {
  // Block-level boundaries become real line breaks before the generic tag
  // strip below — otherwise every <p>/<li>/<br> just disappears into a single
  // space, collapsing multi-paragraph or bulleted content (e.g. a policy's
  // rich-text body) into one unreadable run-on wall of text.
  const withBreaks = numberOrderedLists(str)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|h[1-6]|tr|ul|ol|blockquote)>/gi, '\n\n')
    .replace(/<[^>]*>/g, '');
  return decodeEntities(withBreaks)
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function hasTable(html?: string | null) {
  return /<table[\s\S]*?<\/table>/i.test(html ?? '');
}

export function parsePostContent(rawHtml?: string | null): ContentBlock[] {
  if (!rawHtml) return [];
  const html = stripNonContentElements(rawHtml);
  const blocks: ContentBlock[] = [];
  const tableRe = /<table[\s\S]*?<\/table>/gi;
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = tableRe.exec(html))) {
    const beforeText = stripTags(html.slice(lastIndex, m.index));
    if (beforeText) blocks.push({ type: 'text', text: beforeText });

    const rows: string[][] = [];
    const rowRe = /<tr[\s\S]*?<\/tr>/gi;
    let rm: RegExpExecArray | null;
    while ((rm = rowRe.exec(m[0]))) {
      const cells: string[] = [];
      // Capture the opening <td>/<th> tag's attributes too, so a colspan on a
      // merged cell (common in tables pasted from Excel/Word/Sheets) can push
      // that many cells instead of just one — otherwise a merged cell eats a
      // column and every cell after it in that row shifts left of where the
      // header says it should be.
      const cellRe = /<t[dh]([^>]*)>([\s\S]*?)<\/t[dh]>/gi;
      let cm: RegExpExecArray | null;
      while ((cm = cellRe.exec(rm[0]))) {
        const span = Math.max(1, parseInt(cm[1].match(/colspan\s*=\s*["']?(\d+)/i)?.[1] ?? '1', 10));
        const text = stripTags(cm[2]);
        cells.push(text);
        for (let i = 1; i < span; i++) cells.push('');
      }
      if (cells.length) rows.push(cells);
    }
    // Rows can still come out ragged (a colspan the regex above can't fully
    // reconcile, or a row that's simply missing trailing cells in the source
    // HTML) — pad every row to the widest row's column count so cell index i
    // always means the same column across all rows.
    const colCount = Math.max(0, ...rows.map((r) => r.length));
    for (const row of rows) {
      while (row.length < colCount) row.push('');
    }
    if (rows.length) blocks.push({ type: 'table', rows });
    lastIndex = tableRe.lastIndex;
  }

  const rest = stripTags(html.slice(lastIndex));
  if (rest) blocks.push({ type: 'text', text: rest });
  return blocks;
}

function escapeHtml(str: string) {
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Markdown pipe tables (`| Col A | Col B |`, pasted from GitHub, Notion, docs,
// or an LLM's answer) need their own parsing rather than the whitespace
// heuristic below: cells are delimited by `|` (not spaces — a cell's own text
// can contain runs of spaces for alignment padding), and the `| :---: | ---: |`
// row markdown puts directly under the header is a column-alignment marker,
// not a data row, so it has to be recognized and dropped rather than rendered
// as a garbage row of dashes.
function parseMarkdownPipeTable(lines: string[]): string[][] | null {
  const pipeLines = lines.filter((l) => l.includes('|'));
  if (pipeLines.length < 2 || pipeLines.length < lines.length * 0.5) return null;

  const splitPipeRow = (line: string): string[] => {
    let l = line.trim();
    if (l.startsWith('|')) l = l.slice(1);
    if (l.endsWith('|')) l = l.slice(0, -1);
    return l.split('|').map((c) => c.trim());
  };
  const isSeparatorRow = (cells: string[]) => cells.every((c) => /^:?-+:?$/.test(c));

  const rows = pipeLines.map(splitPipeRow).filter((cells) => !isSeparatorRow(cells));
  const maxCols = Math.max(0, ...rows.map((r) => r.length));
  if (maxCols < 2 || rows.length === 0) return null;

  return rows.map((r) => {
    const padded = [...r];
    while (padded.length < maxCols) padded.push('');
    return padded;
  });
}

// Detects a pasted spreadsheet-style block (tab-separated, or space-padded columns,
// across 2+ lines) so a copy from Excel/Sheets/anywhere else can be turned into a
// real table automatically instead of landing as one jumbled line of text.
export function parseTabularPaste(text: string): string[][] | null {
  const lines = text.split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return null;

  const pipeRows = parseMarkdownPipeTable(lines);
  if (pipeRows) return pipeRows;

  const splitLine = (line: string): string[] => {
    if (line.includes('\t')) return line.split('\t');
    if (/ {2,}/.test(line)) return line.split(/ {2,}/);
    return [line];
  };

  const rows = lines.map(splitLine);
  const maxCols = Math.max(...rows.map((r) => r.length));
  if (maxCols < 2) return null;
  if (rows.filter((r) => r.length > 1).length < 2) return null;

  return rows.map((r) => {
    const padded = [...r];
    while (padded.length < maxCols) padded.push('');
    return padded;
  });
}

// Finds the substring a single onChangeText call actually added (the common
// prefix/suffix between old and new are unchanged; whatever's left in the middle
// is what got typed or pasted in one go).
function diffInserted(oldText: string, newText: string): string {
  let prefixLen = 0;
  const maxPrefix = Math.min(oldText.length, newText.length);
  while (prefixLen < maxPrefix && oldText[prefixLen] === newText[prefixLen]) prefixLen++;

  let suffixLen = 0;
  const maxSuffix = maxPrefix - prefixLen;
  while (
    suffixLen < maxSuffix &&
    oldText[oldText.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]
  ) suffixLen++;

  return newText.slice(prefixLen, newText.length - suffixLen);
}

export interface DetectedPaste {
  rows: string[][];
  textWithoutPaste: string;
}

// Plain RN TextInput has no onPaste event, so a real paste is inferred from a big
// jump in length in a single onChangeText call (typing adds ~1 char per call; a
// paste adds a whole chunk at once). If that chunk looks like spreadsheet data,
// pull it out so the caller can offer to insert it as a real table instead of
// leaving it as one jumbled line of text.
export function detectPastedTable(oldText: string, newText: string): DetectedPaste | null {
  if (newText.length - oldText.length < 15) return null;
  const inserted = diffInserted(oldText, newText);
  const rows = parseTabularPaste(inserted);
  if (!rows) return null;
  return { rows, textWithoutPaste: newText.replace(inserted, '') };
}

// Inverse of parsePostContent's table extraction — builds the same <table><tr><td>
// markup web's rich-text editor produces, so a table composed on mobile renders
// identically (as a real grid) both on mobile and on web.
export function tableToHtml(rows: string[][], hasHeaderRow: boolean): string {
  if (rows.length === 0) return '';
  const rowsHtml = rows.map((row, ri) => {
    const tag = ri === 0 && hasHeaderRow ? 'th' : 'td';
    const cells = row.map((cell) => `<${tag}>${escapeHtml(cell)}</${tag}>`).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  return `<table><tbody>${rowsHtml}</tbody></table>`;
}
