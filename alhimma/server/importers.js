'use strict';
/* قراءة الملفات المستوردة: CSV / TSV / XLSX / JSON / TXT / PDF / DOCX / HTML
 * تُعيد شكلًا موحدًا: { format, rows: [[...]] , pages: [{vol, page, text}], text, warnings } */
const zlib = require('zlib');
const path = require('path');

const SUPPORTED = ['.csv', '.tsv', '.xlsx', '.json', '.txt', '.pdf', '.docx', '.html', '.htm'];
const HINTS = {
  '.xls': 'صيغة Excel القديمة (.xls) غير مدعومة. احفظ الملف بصيغة .xlsx أو .csv ثم أعد رفعه.',
  '.doc': 'صيغة Word القديمة (.doc) غير مدعومة. احفظ الملف بصيغة .docx أو .txt ثم أعد رفعه.',
  '.rar': 'الملفات المضغوطة غير مدعومة. فك الضغط وارفع الملفات منفردة.',
  '.zip': 'الملفات المضغوطة غير مدعومة. فك الضغط وارفع الملفات منفردة.',
  '.bok': 'ملفات .bok من برنامج الشاملة القديم غير مدعومة مباشرة. صدّر الكتاب من البرنامج إلى نص أو Word ثم ارفعه.',
};

class ImportError extends Error {}

/* ===== CSV ===== */
function detectDelimiter(text) {
  const sample = text.split(/\r?\n/).slice(0, 10).join('\n');
  const cands = [',', '\t', ';', '،'];
  let best = ',', bestCount = 0;
  for (const c of cands) {
    const n = sample.split(c).length - 1;
    if (n > bestCount) { best = c; bestCount = n; }
  }
  return best;
}

function parseCSV(text, delim) {
  text = text.replace(/^﻿/, '');
  delim = delim || detectDelimiter(text);
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += ch;
    } else if (ch === '"' && field === '') q = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows.map((r) => r.map((c) => c.trim()));
}

/* ===== ZIP (لـ XLSX و DOCX) ===== */
function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new ImportError('الملف تالف أو ليس ملفًا مضغوطًا صالحًا (xlsx/docx).');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = {};
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new ImportError('بنية الملف المضغوط غير صالحة.');
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const local = buf.readUInt32LE(off + 42);
    const name = buf.slice(off + 46, off + 46 + nameLen).toString('utf8');
    entries[name] = { method, csize, local };
    off += 46 + nameLen + extraLen + commentLen;
  }
  return {
    names: Object.keys(entries),
    read(name) {
      const e = entries[name];
      if (!e) return null;
      const lnl = buf.readUInt16LE(e.local + 26), lel = buf.readUInt16LE(e.local + 28);
      const start = e.local + 30 + lnl + lel;
      const raw = buf.slice(start, start + e.csize);
      if (e.method === 0) return raw.toString('utf8');
      if (e.method === 8) return zlib.inflateRawSync(raw).toString('utf8');
      throw new ImportError('طريقة ضغط غير مدعومة داخل الملف.');
    },
  };
}

function xmlDecode(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

function colIndex(ref) {
  const letters = (ref.match(/^[A-Z]+/) || ['A'])[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseXLSX(buf) {
  const zip = readZip(buf);
  const shared = [];
  const ss = zip.read('xl/sharedStrings.xml');
  if (ss) {
    for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      const parts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => xmlDecode(x[1]));
      shared.push(parts.join(''));
    }
  }
  // أول ورقة بحسب ترتيب المصنف
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wb = zip.read('xl/workbook.xml'), rels = zip.read('xl/_rels/workbook.xml.rels');
  if (wb && rels) {
    const first = wb.match(/<sheet\b[^>]*r:id="([^"]+)"/);
    if (first) {
      const rel = rels.match(new RegExp('<Relationship\\b[^>]*Id="' + first[1] + '"[^>]*Target="([^"]+)"')) ||
        rels.match(new RegExp('<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="' + first[1] + '"'));
      if (rel) sheetPath = rel[1].startsWith('/') ? rel[1].slice(1) : 'xl/' + rel[1].replace(/^\.\//, '');
    }
  }
  const sheet = zip.read(sheetPath);
  if (!sheet) throw new ImportError('لم أجد ورقة بيانات داخل ملف Excel.');
  const rows = [];
  for (const rm of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1], body = cm[2] || '';
      const ref = (attrs.match(/\br="([A-Z]+\d+)"/) || [])[1];
      const t = (attrs.match(/\bt="([^"]+)"/) || [])[1];
      let val = '';
      if (t === 's') { const v = body.match(/<v>([\s\S]*?)<\/v>/); val = v ? shared[+v[1]] || '' : ''; }
      else if (t === 'inlineStr') val = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => xmlDecode(x[1])).join('');
      else { const v = body.match(/<v>([\s\S]*?)<\/v>/); val = v ? xmlDecode(v[1]) : ''; }
      const idx = ref ? colIndex(ref) : row.length;
      while (row.length < idx) row.push('');
      row[idx] = String(val).trim();
    }
    if (row.some((c) => c !== '')) rows.push(row);
  }
  return rows;
}

function parseDOCX(buf) {
  const zip = readZip(buf);
  const doc = zip.read('word/document.xml');
  if (!doc) throw new ImportError('لم أجد نص المستند داخل ملف Word.');
  const paras = [];
  for (const pm of doc.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)) {
    let t = '';
    for (const x of pm[1].matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g)) t += x[1] != null ? xmlDecode(x[1]) : (x[0] === '<w:tab/>' ? '\t' : '\n');
    paras.push(t);
  }
  return paras.join('\n');
}

function htmlToText(html) {
  return xmlDecode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h\d|li|tr)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' '))
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
}

/* ===== PDF ===== */
function fixVisualArabic(line) {
  // بعض ملفات PDF تخزن العربية بترتيب بصري معكوس؛ نكتشف ذلك من كثرة "لا" في أواخر الكلمات بدل "ال" في أوائلها
  const words = line.split(/\s+/).filter((w) => /[؀-ۿ]/.test(w));
  if (words.length < 3) return line;
  const startsAl = words.filter((w) => /^ال/.test(w)).length;
  const endsLa = words.filter((w) => /لا$/.test(w)).length;
  if (endsLa > startsAl && endsLa >= 2) return [...line].reverse().join('');
  return line;
}

async function parsePDF(buf) {
  let pdfjs;
  try { pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs'); } catch (e) {
    throw new ImportError('مكتبة قراءة PDF غير مثبتة. شغّل npm install داخل مجلد المنصة.');
  }
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(buf), disableFontFace: true, useSystemFonts: false, isEvalSupported: false, verbosity: 0 }).promise;
  } catch (e) {
    throw new ImportError('تعذر فتح ملف PDF: ' + (e.message || 'ملف تالف أو محمي بكلمة مرور'));
  }
  const pages = [];
  let reversedLines = 0;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let text = '';
    for (const it of content.items) { text += it.str; text += it.hasEOL ? '\n' : (it.str && !/\s$/.test(it.str) ? ' ' : ''); }
    text = text.normalize('NFKC').split('\n').map((l) => {
      const f = fixVisualArabic(l);
      if (f !== l) reversedLines++;
      return f;
    }).join('\n');
    pages.push({ vol: null, page: p, text: text.trim() });
  }
  const warnings = [];
  if (!pages.some((p) => p.text)) warnings.push('لم يُستخرج نص من ملف PDF؛ قد يكون صورًا ممسوحة ضوئيًا وتحتاج إلى تحويل نصي (OCR) قبل الاستيراد.');
  if (reversedLines) warnings.push('عُكس اتجاه ' + reversedLines + ' سطرًا بدا مخزنًا بترتيب بصري. راجع المعاينة.');
  warnings.push('أرقام الصفحات المستخرجة من PDF هي ترتيب صفحات الملف، وقد تختلف عن ترقيم الطبعة المطبوعة. تحقق منها قبل الاعتماد.');
  return { pages, warnings };
}

/* ===== تقسيم النص إلى صفحات بحسب علامات الصفحات الشائعة في نصوص الشاملة ===== */
const PAGE_MARKERS = [
  /\[\s*ج\s*:?\s*([0-9٠-٩]+)\s*[-–،,/]?\s*ص\s*:?\s*([0-9٠-٩]+)\s*\]/g,  // [ج 1 - ص 12]
  /\(\s*ج\s*([0-9٠-٩]+)\s*[/،,-]\s*ص\s*([0-9٠-٩]+)\s*\)/g,               // (ج1/ص12)
  /\[\s*ص\s*:?\s*([0-9٠-٩]+)\s*\]/g,                                   // [ص: 12]
  /-{2,}\s*(?:الصفحة|صفحة)\s*([0-9٠-٩]+)\s*-{2,}/g,                    // -- الصفحة 12 --
];
const toNum = (s) => parseInt(String(s).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)), 10);

function splitPages(text) {
  if (text.includes('\f')) {
    return text.split('\f').map((t, i) => ({ vol: null, page: i + 1, text: t.trim() })).filter((p) => p.text);
  }
  for (const re of PAGE_MARKERS) {
    re.lastIndex = 0;
    const marks = [...text.matchAll(re)];
    if (marks.length >= 2) {
      // في نصوص الشاملة يأتي رقم الصفحة في نهاية نصها
      const pages = [];
      let last = 0;
      for (const m of marks) {
        const chunk = text.slice(last, m.index).trim();
        const two = m.length > 2 && m[2] !== undefined;
        if (chunk) pages.push({ vol: two ? toNum(m[1]) : null, page: toNum(two ? m[2] : m[1]), text: chunk });
        last = m.index + m[0].length;
      }
      const tail = text.slice(last).trim();
      if (tail) pages.push({ vol: null, page: null, text: tail });
      return pages;
    }
  }
  // بلا علامات: مقاطع من 40 سطرًا، دون أرقام صفحات (لا نخترع أرقامًا)
  const lines = text.split(/\r?\n/);
  const pages = [];
  for (let i = 0; i < lines.length; i += 40) {
    const t = lines.slice(i, i + 40).join('\n').trim();
    if (t) pages.push({ vol: null, page: null, section: pages.length + 1, text: t });
  }
  return pages;
}

/** نقطة الدخول: يعيد { format, rows?, text?, pages?, warnings } */
async function parseFile(filename, buf) {
  const ext = path.extname(filename || '').toLowerCase();
  if (!buf || !buf.length) throw new ImportError('الملف فارغ.');
  if (HINTS[ext]) throw new ImportError(HINTS[ext]);
  if (!SUPPORTED.includes(ext)) {
    throw new ImportError('صيغة غير مدعومة' + (ext ? ' (' + ext + ')' : '') + '. الصيغ المدعومة: ' + SUPPORTED.join(' '));
  }
  const warnings = [];
  const asText = () => {
    const t = buf.toString('utf8').replace(/^﻿/, '');
    if (t.includes('�')) warnings.push('في الملف حروف لم تُقرأ بترميز UTF-8. إن ظهرت رموز غريبة فاحفظ الملف بترميز UTF-8.');
    return t;
  };
  switch (ext) {
    case '.csv': case '.tsv': {
      const text = asText();
      return { format: ext.slice(1), rows: parseCSV(text, ext === '.tsv' ? '\t' : null), text, warnings };
    }
    case '.xlsx': {
      const rows = parseXLSX(buf);
      return { format: 'xlsx', rows, text: rows.map((r) => r.join('\t')).join('\n'), warnings };
    }
    case '.json': {
      let data;
      try { data = JSON.parse(asText()); } catch (e) { throw new ImportError('ملف JSON غير صالح: ' + e.message); }
      return { format: 'json', json: data, rows: jsonToRows(data), text: null, warnings };
    }
    case '.txt': {
      const text = asText();
      return { format: 'txt', text, rows: text.split(/\r?\n/).map((l) => [l.trim()]).filter((r) => r[0]), pages: splitPages(text), warnings };
    }
    case '.docx': {
      const text = parseDOCX(buf);
      return { format: 'docx', text, rows: text.split('\n').map((l) => [l.trim()]).filter((r) => r[0]), pages: splitPages(text), warnings };
    }
    case '.html': case '.htm': {
      const text = htmlToText(asText());
      return { format: 'html', text, rows: text.split('\n').map((l) => [l.trim()]).filter((r) => r[0]), pages: splitPages(text), warnings };
    }
    case '.pdf': {
      const r = await parsePDF(buf);
      const text = r.pages.map((p) => p.text).join('\n');
      return { format: 'pdf', text, pages: r.pages, rows: text.split('\n').map((l) => [l.trim()]).filter((x) => x[0]), warnings: warnings.concat(r.warnings) };
    }
  }
}

function jsonToRows(data) {
  const arr = Array.isArray(data) ? data : (data && (data.names || data.persons || data.items)) || null;
  if (!Array.isArray(arr)) return [];
  if (arr.every((x) => typeof x === 'string')) return arr.map((s) => [s]);
  const keys = [...new Set(arr.filter((x) => x && typeof x === 'object').flatMap((o) => Object.keys(o)))];
  return [keys].concat(arr.map((o) => keys.map((k) => (o && o[k] != null ? (Array.isArray(o[k]) ? o[k].join('، ') : String(o[k])) : ''))));
}

module.exports = { parseFile, parseCSV, parseXLSX, parseDOCX, splitPages, readZip, ImportError, SUPPORTED, fixVisualArabic };
