// Reads PDF, Word (.docx) and plain-text files entirely inside the panel (nothing is uploaded).
// Output uses the same shape the step-maker expects: one paragraph per line, "# " marks a heading.
(function (FF) {
  const MAX_BYTES = 40 * 1024 * 1024, MAX_PAGES = 150, MAX_CHARS = 80000;
  const fail = (code) => { const e = new Error(code); e.code = code; return e; };
  const median = (a) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const ext = (name) => (String(name).toLowerCase().match(/\.([a-z0-9]+)$/) || [, ''])[1];

  function kindOf(file) {
    const e = ext(file.name), t = file.type || '';
    if (e === 'pdf' || t === 'application/pdf') return 'pdf';
    if (e === 'docx' || t.includes('wordprocessingml')) return 'docx';
    if (e === 'doc' || t === 'application/msword') return 'doc';
    if (e === 'txt' || e === 'md' || t.startsWith('text/')) return 'txt';
    return null;
  }

  /* ---------------- Word (.docx is a zip of XML) ---------------- */
  async function unzipEntry(buf, wanted) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    let e = buf.byteLength - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw fail('bad_file');
    const count = dv.getUint16(e + 10, true);
    let p = dv.getUint32(e + 16, true);
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const lho = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen));
      if (name === wanted) {
        const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
        const raw = u8.subarray(start, start + csize);
        if (method === 0) return raw;
        if (method === 8) {
          const out = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
          return new Uint8Array(await new Response(out).arrayBuffer());
        }
        throw fail('bad_file');
      }
      p += 46 + nlen + elen + clen;
    }
    throw fail('bad_file');
  }

  async function readDocx(file) {
    const xmlBytes = await unzipEntry(await file.arrayBuffer(), 'word/document.xml');
    const doc = new DOMParser().parseFromString(new TextDecoder().decode(xmlBytes), 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw fail('bad_file');
    const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const lines = []; let title = '';
    Array.from(doc.getElementsByTagNameNS(W, 'p')).forEach((p) => {
      let t = '';
      const walk = (n) => {
        for (const c of Array.from(n.childNodes)) {
          if (c.nodeType !== 1 || c.namespaceURI !== W) { if (c.nodeType === 1) walk(c); continue; }
          if (c.localName === 't') t += c.textContent;
          else if (c.localName === 'tab' || c.localName === 'br') t += ' ';
          else walk(c);
        }
      };
      walk(p);
      t = t.replace(/\s+/g, ' ').trim();
      if (!t) return;
      const st = p.getElementsByTagNameNS(W, 'pStyle')[0];
      const style = st ? st.getAttributeNS(W, 'val') || st.getAttribute('w:val') || '' : '';
      const head = /^(title|subtitle|heading\s*\d*)$/i.test(style.replace(/[-_]/g, ''));
      if (head && !title) title = t;
      lines.push(head && t.length < 140 ? '# ' + t : t);
    });
    return { text: lines.join('\n'), title };
  }

  /* ---------------- PDF ---------------- */
  async function readPdf(file, onProgress) {
    const lib = self.pdfjsLib;
    if (!lib) throw fail('no_pdf_lib');
    lib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('vendor/pdf.worker.min.js');
    let doc;
    try { doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, disableFontFace: true }).promise; } catch (e) {
      throw fail(e && e.name === 'PasswordException' ? 'locked' : 'bad_file');
    }
    const pages = Math.min(doc.numPages, MAX_PAGES);
    const lines = []; // { text, y, size, page }
    for (let n = 1; n <= pages; n++) {
      if (onProgress) onProgress('Reading page ' + n + ' of ' + pages + '…');
      const tc = await (await doc.getPage(n)).getTextContent();
      const rows = [];
      tc.items.forEach((it) => {
        if (!it.str || !it.transform) return;
        const y = it.transform[5], h = it.height || Math.abs(it.transform[3]) || 10;
        let row = rows.find((r) => Math.abs(r.y - y) < h * 0.45);
        if (!row) { row = { y, items: [], size: 0 }; rows.push(row); }
        row.items.push({ x: it.transform[4], w: it.width || 0, s: it.str, h });
        row.size = Math.max(row.size, h);
      });
      rows.sort((a, b) => b.y - a.y).forEach((r) => {
        r.items.sort((a, b) => a.x - b.x);
        let t = '', end = null;
        r.items.forEach((it) => {
          if (end !== null && it.x - end > it.h * 0.2 && !/\s$/.test(t) && !/^\s/.test(it.s)) t += ' ';
          t += it.s; end = it.x + it.w;
        });
        t = t.replace(/\s+/g, ' ').trim();
        if (t) lines.push({ text: t, y: r.y, size: r.size, page: n });
      });
    }
    // drop page numbers and running headers/footers
    const seen = {};
    lines.forEach((l) => { seen[l.text] = (seen[l.text] || 0) + 1; });
    const repeat = Math.max(3, Math.floor(pages * 0.5));
    const keep = lines.filter((l) => !/^(page\s*)?\d{1,4}(\s*(\/|of)\s*\d{1,4})?$/i.test(l.text) && !(pages > 2 && seen[l.text] >= repeat && l.text.length < 80));
    if (!keep.length) throw fail('no_text');

    const body = median(keep.map((l) => l.size)), gaps = [];
    for (let i = 1; i < keep.length; i++) if (keep[i].page === keep[i - 1].page) { const g = keep[i - 1].y - keep[i].y; if (g > 0) gaps.push(g); }
    const gap = median(gaps) || body * 1.3;
    const out = []; let cur = '', title = '';
    const flush = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
    keep.forEach((l, i) => {
      const prev = keep[i - 1];
      const head = l.size > body * 1.2 && l.text.length < 90 && !/[.,;]$/.test(l.text);
      if (head) { flush(); out.push('# ' + l.text); if (!title) title = l.text; return; }
      const newPara = !prev || (prev.page === l.page ? prev.y - l.y > gap * 1.55 : /[.!?:]$/.test(cur.trim())) || prev.size > body * 1.2 && prev.text.length < 90;
      if (newPara) flush();
      if (cur && /[a-z]-$/.test(cur) && /^[a-z]/.test(l.text)) cur = cur.slice(0, -1) + l.text; else cur += (cur ? ' ' : '') + l.text;
    });
    flush();
    return { text: out.join('\n'), title };
  }

  /* ---------------- entry points ---------------- */
  async function extract(file, onProgress) {
    if (file.size > MAX_BYTES) throw fail('too_big');
    const kind = kindOf(file);
    if (!kind) throw fail('unsupported');
    if (kind === 'doc') throw fail('legacy_doc');
    let r;
    if (kind === 'pdf') r = await readPdf(file, onProgress);
    else if (kind === 'docx') r = await readDocx(file);
    else { const t = await file.text(); r = { text: t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join('\n'), title: '' }; }
    if (!r.text || r.text.replace(/\s/g, '').length < 40) throw fail('no_text');
    return { text: r.text.slice(0, MAX_CHARS), title: r.title || file.name.replace(/\.[a-z0-9]+$/i, ''), kind };
  }

  // A PDF open in a browser tab: fetch it (the extension has host access) and read it.
  async function extractFromUrl(url, onProgress) {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw fail('bad_file');
    const blob = await res.blob();
    const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
    if (String.fromCharCode.apply(null, head) !== '%PDF-') throw fail('not_pdf');
    const name = decodeURIComponent((new URL(url).pathname.split('/').pop() || 'document.pdf'));
    return extract(new File([blob], /\.pdf$/i.test(name) ? name : name + '.pdf', { type: 'application/pdf' }), onProgress);
  }

  const MESSAGES = {
    no_text: "This looks like a scanned PDF with no selectable text, and I can't read scans yet. Try a text version.",
    legacy_doc: "Old .doc files aren't supported. Save it as .docx or PDF and try again.",
    too_big: 'That file is over 40 MB. Try a smaller one, or paste the part you need.',
    unsupported: 'I can read PDF, Word (.docx) and .txt files.',
    locked: 'That PDF is password protected. Unlock it first, then try again.',
    bad_file: "I couldn't open that file. It may be damaged.",
    no_pdf_lib: "The PDF reader didn't load. Reload the panel and try again.",
  };
  FF.files = { extract, extractFromUrl, kindOf, message: (e) => MESSAGES[e && e.code] || "I couldn't read that file." };
})(self.FF);
