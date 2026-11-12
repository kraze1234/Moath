/* عرض أنواع الأسئلة التفاعلية — يُستعمل في اللعب الفردي وشاشة العرض والهاتف
 * HimmaQ.render(q, opts) → { el, showResult(grade), lock() }
 * opts: { onAnswer(answer), big, readonly, external: { clueStep, revealed } , onClue(), onSegment(i) } */
(function () {
  'use strict';
  const { h, num, Sound } = window.HimmaUI;
  const Catalog = window.HimmaCatalog;
  const KEYS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];
  const PAIR_COLORS = ['#2f7a5b', '#22406b', '#a5483a', '#8f7130', '#6f4f8e', '#3b7d8c'];
  const BOOK_COLORS = ['#1e4d3b', '#5a2a22', '#22406b', '#5d4a1c', '#3c2f55', '#2c5a5a'];

  function render(q, opts) {
    opts = opts || {};
    const d = q.data;
    const ro = !!opts.readonly;
    let locked = ro;
    const root = h('div', { class: 'qcard' + (opts.big ? ' big' : '') + (q.style ? ' style-' + q.style : '') });
    const mode = Catalog.MODES[q.mode] || {};
    const diff = Catalog.DIFFICULTY[q.difficulty] || {};
    root.append(h('div', { class: 'qmeta' },
      h('span', { class: 'mode' }, mode.title || ''),
      h('span', { class: 'diff' }, '• ' + (diff.name || '') + ' • ' + num(diff.points || 0) + ' نقطة'),
      q.demo ? h('span', { class: 'badge badge-demo' }, 'تجريبي') : null));
    if (d.excerpt) root.append(h('blockquote', { class: 'excerpt' }, d.excerpt));
    root.append(q.style === 'scroll'
      ? h('div', { class: 'scroll-card' }, h('div', { class: 'prompt', id: 'qprompt' }, q.prompt))
      : h('div', { class: 'prompt', id: 'qprompt' }, q.prompt));
    const body = h('div');
    root.append(body);
    const api = { el: root, lock() { locked = true; root.querySelectorAll('button').forEach((b) => b.setAttribute('disabled', '')); }, showResult() {} };
    const commit = (ans) => { if (locked) return; locked = true; opts.onAnswer && opts.onAnswer(ans); };

    /* ===== اختيار ===== */
    function optionButtons(options, onPick) {
      const grid = h('div', { class: 'options', role: 'group', 'aria-labelledby': 'qprompt' });
      const btns = options.map((o, i) => h('button', { class: 'opt', type: 'button', disabled: ro, onclick: () => { if (locked) return; btns.forEach((b) => b.classList.remove('picked')); btns[i].classList.add('picked'); onPick(i); } },
        h('span', { class: 'k' }, KEYS[i] || num(i + 1)), h('span', null, o)));
      grid.append(...btns);
      grid.btns = btns;
      return grid;
    }
    function markChoice(btns, answer, picked) {
      btns.forEach((b, i) => { b.disabled = true; if (i === answer) b.classList.add('correct'); else if (i === picked) b.classList.add('wrong'); });
    }

    if (q.type === 'choice' && q.style === 'shelf') {
      const shelf = h('div', { class: 'shelf' });
      const row = h('div', { class: 'shelf-row' });
      const books = d.options.map((t, i) => h('button', { class: 'book', type: 'button', disabled: ro, style: { '--c': BOOK_COLORS[i % BOOK_COLORS.length], minHeight: (170 + (i * 37) % 50) + 'px' }, 'aria-label': t,
        onclick: () => { if (locked) return; books[i].classList.add('picked'); picked = i; commit(i); } }, t));
      let picked = null;
      row.append(...books); shelf.append(row); body.append(shelf);
      api.showResult = (g, full) => markChoice(books, (full || q).data.answer, picked);
      api.keys = (i) => books[i] && books[i].click();
    } else if (q.type === 'choice' && q.style === 'map') {
      body.append(mapView(d.pins || [], (i) => { picked = i; commit(i); }, ro));
      let picked = null;
      const grid = optionButtons(d.options, (i) => { picked = i; commit(i); });
      body.append(grid);
      api.showResult = (g, full) => {
        const ans = (full || q).data.answer;
        markChoice(grid.btns, ans, picked);
        root.querySelectorAll('.pin').forEach((p, i) => p.classList.add(i === ans ? 'correct' : i === picked ? 'wrong' : 'x'));
      };
      api.keys = (i) => grid.btns[i] && grid.btns[i].click();
    } else if (q.type === 'choice') {
      let picked = null;
      const grid = optionButtons(d.options, (i) => { picked = i; commit(i); });
      body.append(grid);
      api.showResult = (g, full) => markChoice(grid.btns, (full || q).data.answer, picked);
      api.keys = (i) => grid.btns[i] && grid.btns[i].click();
    }

    /* ===== اكتشف الشخصية ===== */
    else if (q.type === 'reveal') {
      let step = (opts.external && opts.external.clueStep) || 1;
      const list = h('ol', { class: 'clues', 'aria-live': 'polite' });
      const worth = h('div', { class: 'worth' });
      const more = h('button', { class: 'btn btn-sm', type: 'button', onclick: () => { if (step < d.clues.length) { step++; Sound.reveal(); paint(); opts.onClue && opts.onClue(step); } } }, 'اكشف معلومة أخرى');
      const paint = () => {
        list.innerHTML = '';
        d.clues.forEach((c, i) => list.append(h('li', { class: i < step ? '' : 'locked' }, h('span', { class: 'n' }, num(i + 1)), h('span', null, i < step ? c : '•••••••••••'))));
        const f = Math.max(25, 100 - 20 * (step - 1));
        worth.textContent = 'قيمة الإجابة الآن: ' + num(f) + '% من النقاط';
        more.disabled = step >= d.clues.length || locked;
        more.classList.toggle('hidden', ro || !!opts.external);
      };
      paint();
      let picked = null;
      const grid = optionButtons(d.options, (i) => { picked = i; commit({ choice: i, used: step }); });
      body.append(list, h('div', { class: 'row', style: { marginBottom: '1rem' } }, more, worth), grid);
      api.setStep = (s) => { step = s; paint(); };
      api.showResult = (g, full) => { step = d.clues.length; paint(); markChoice(grid.btns, (full || q).data.answer, picked); };
      api.keys = (i) => grid.btns[i] && grid.btns[i].click();
    }

    /* ===== بطاقة العالم المجهول ===== */
    else if (q.type === 'card') {
      const open = new Set((opts.external && opts.external.revealed) || []);
      const worth = h('div', { class: 'worth' });
      const segs = d.segments.map((s, i) => {
        const b = h('button', { class: 'seg', type: 'button', 'aria-label': 'اكشف: ' + s.label,
          onclick: () => {
            if (locked || open.has(i) || ro) return;
            if (opts.external) { opts.onSegment && opts.onSegment(i); return; }
            open.add(i); Sound.reveal(); paint();
          } },
          h('span', { class: 'face front' }, s.label, h('small', null, 'اكشف (−١٥٪)')),
          h('span', { class: 'face back' }, h('small', null, s.label), h('b', null, s.value || '—')));
        return b;
      });
      const paint = () => {
        segs.forEach((b, i) => b.classList.toggle('open', open.has(i)));
        worth.textContent = 'كشفت ' + num(open.size) + ' — قيمة الإجابة: ' + num(Math.max(25, 100 - 15 * open.size)) + '%';
      };
      paint();
      let picked = null;
      const grid = optionButtons(d.options, (i) => { picked = i; commit({ choice: i, revealed: open.size }); });
      body.append(h('div', { class: 'segments' }, segs), worth, h('div', { style: { height: '.8rem' } }), grid);
      api.setRevealed = (arr) => { arr.forEach((i) => open.add(i)); paint(); };
      api.showResult = (g, full) => { d.segments.forEach((_, i) => open.add(i)); paint(); markChoice(grid.btns, (full || q).data.answer, picked); };
      api.keys = (i) => grid.btns[i] && grid.btns[i].click();
    }

    /* ===== الترتيب ===== */
    else if (q.type === 'order') {
      let order = d.items.map((_, i) => i);
      const list = h('ol', { class: 'order-list', 'aria-label': 'العناصر المطلوب ترتيبها' });
      const paint = () => {
        list.innerHTML = '';
        order.forEach((idx, pos) => {
          const it = d.items[idx];
          const li = h('li', { class: 'order-item', 'data-idx': idx },
            h('span', { class: 'pos' }, num(pos + 1)), h('span', { class: 'lbl' }, it.label), h('span', { class: 'shown' }),
            ro ? null : h('span', { class: 'mv' },
              h('button', { type: 'button', 'aria-label': 'تقديم ' + it.label, disabled: pos === 0, onclick: () => move(pos, -1) }, '▲'),
              h('button', { type: 'button', 'aria-label': 'تأخير ' + it.label, disabled: pos === order.length - 1, onclick: () => move(pos, 1) }, '▼')));
          if (!ro) dragify(li, pos);
          list.append(li);
        });
      };
      const move = (pos, dir) => {
        if (locked) return;
        const np = pos + dir;
        if (np < 0 || np >= order.length) return;
        [order[pos], order[np]] = [order[np], order[pos]];
        paint();
        const btn = list.children[np] && list.children[np].querySelectorAll('.mv button')[dir < 0 ? 0 : 1];
        if (btn && !btn.disabled) btn.focus();
      };
      function dragify(li, pos) {
        li.addEventListener('pointerdown', (e) => {
          if (locked || e.target.closest('button')) return;
          e.preventDefault();
          li.setPointerCapture(e.pointerId);
          li.classList.add('dragging');
          let cur = pos;
          const onMove = (ev) => {
            const items = [...list.children];
            for (let i = 0; i < items.length; i++) {
              const r = items[i].getBoundingClientRect();
              if (ev.clientY > r.top && ev.clientY < r.bottom && i !== cur) {
                const [x] = order.splice(cur, 1); order.splice(i, 0, x);
                if (i < cur) list.insertBefore(li, items[i]); else list.insertBefore(li, items[i].nextSibling);
                cur = i; break;
              }
            }
          };
          const onUp = () => { li.releasePointerCapture(e.pointerId); li.removeEventListener('pointermove', onMove); li.removeEventListener('pointerup', onUp); li.removeEventListener('pointercancel', onUp); paint(); };
          li.addEventListener('pointermove', onMove);
          li.addEventListener('pointerup', onUp);
          li.addEventListener('pointercancel', onUp);
        });
      }
      paint();
      const confirm = h('button', { class: 'btn btn-gold', type: 'button', onclick: () => commit(order.slice()) }, 'تأكيد الترتيب');
      body.append(h('div', { class: 'timeline-axis' }, h('span', null, '↑ الأقدم'), h('span', null, 'الأحدث ↓')), list, ro ? null : confirm);
      api.submit = () => commit(order.slice());
      api.showResult = (g, full) => {
        const fq = full || q;
        const key = window.HimmaEngine.orderKey(fq);
        // نعرض ترتيب اللاعب ملوّنًا، ثم الترتيب الصحيح مع السنوات
        const lis = [...list.children];
        lis.forEach((li, pos) => {
          li.classList.add(g && g.detail && g.detail[pos] ? 'correct' : 'wrong');
          const idx = +li.dataset.idx;
          li.querySelector('.shown').textContent = fq.data.items[idx].shown || '';
          const mv = li.querySelector('.mv'); if (mv) mv.remove();
        });
        confirm.remove();
        if (!g || !g.correct) {
          body.append(h('div', { class: 'muted small', style: { margin: '.6rem 0 .3rem' } }, 'الترتيب الصحيح:'),
            h('ol', { class: 'order-list' }, key.map((i, pos) => h('li', { class: 'order-item correct' }, h('span', { class: 'pos' }, num(pos + 1)), h('span', { class: 'lbl' }, fq.data.items[i].label), h('span', { class: 'shown' }, fq.data.items[i].shown || '')))));
        }
      };
    }

    /* ===== الربط ===== */
    else if (q.type === 'match') {
      const pairs = new Array(d.left.length).fill(null); // pairs[leftIdx] = rightIdx
      let selL = null, selR = null;
      const L = d.left.map((t, i) => h('button', { class: 'mitem', type: 'button', disabled: ro, onclick: () => pick('L', i) }, t));
      const R = d.right.map((t, i) => h('button', { class: 'mitem', type: 'button', disabled: ro, onclick: () => pick('R', i) }, t));
      const confirm = h('button', { class: 'btn btn-gold', type: 'button', disabled: true, onclick: () => commit(pairs.slice()) }, 'تأكيد الربط');
      function pick(side, i) {
        if (locked) return;
        if (side === 'L') {
          if (pairs[i] != null) { pairs[i] = null; selL = null; paint(); return; }
          selL = selL === i ? null : i;
        } else {
          const owner = pairs.indexOf(i);
          if (owner >= 0) { pairs[owner] = null; selR = null; paint(); return; }
          selR = selR === i ? null : i;
        }
        if (selL != null && selR != null) { pairs[selL] = selR; selL = selR = null; Sound.tick(); }
        paint();
      }
      function paint() {
        L.forEach((b, i) => {
          b.classList.toggle('sel', selL === i);
          if (pairs[i] != null) { b.dataset.pair = num(i + 1); b.style.setProperty('--pc', PAIR_COLORS[i % PAIR_COLORS.length]); } else { delete b.dataset.pair; }
        });
        R.forEach((b, j) => {
          b.classList.toggle('sel', selR === j);
          const owner = pairs.indexOf(j);
          if (owner >= 0) { b.dataset.pair = num(owner + 1); b.style.setProperty('--pc', PAIR_COLORS[owner % PAIR_COLORS.length]); } else { delete b.dataset.pair; }
        });
        confirm.disabled = pairs.some((p) => p == null) || locked;
      }
      const net = q.style === 'network';
      body.append(h('div', { class: 'match' },
        h('div', { class: 'col' }, h('h4', null, net ? 'الشيوخ' : 'العمود الأول'), L),
        h('div', { class: 'col' }, h('h4', null, net ? 'التلاميذ' : 'العمود الثاني'), R)),
        ro ? null : h('div', { class: 'row' }, confirm, h('span', { class: 'muted small' }, 'اختر عنصرًا من كل عمود لربطهما، واضغط عنصرًا مربوطًا لفكّه.')));
      api.showResult = (g, full) => {
        const fq = full || q;
        L.forEach((b, i) => { b.disabled = true; b.classList.add(g && g.detail && g.detail[i] ? 'correct' : 'wrong'); });
        R.forEach((b) => { b.disabled = true; });
        confirm.remove();
        if (!g || !g.correct) body.append(h('div', { class: 'excerpt small', style: { marginTop: '.8rem' } }, 'الربط الصحيح: ' + window.HimmaEngine.answerText(fq)));
      };
    }

    /* ===== السلال ===== */
    else if (q.type === 'bucket') {
      const place = new Array(d.items.length).fill(null);
      let sel = null;
      const pool = h('div', { class: 'bucket-pool', 'aria-label': 'العناصر' });
      const zones = d.buckets.map((b, bi) => {
        const z = h('div', { class: 'bucket', role: 'button', tabindex: ro ? -1 : 0, 'aria-label': 'ضع في ' + b,
          onclick: (e) => { if (e.target.closest('.chip')) return; drop(bi); }, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drop(bi); } } },
          h('h4', null, b), h('div', { class: 'chips' }));
        return z;
      });
      const confirm = h('button', { class: 'btn btn-gold', type: 'button', disabled: true, onclick: () => commit(place.slice()) }, 'تأكيد التوزيع');
      const chips = d.items.map((it, i) => h('button', { class: 'chip', type: 'button', disabled: ro,
        onclick: () => {
          if (locked) return;
          if (place[i] != null) { place[i] = null; sel = i; } else sel = sel === i ? null : i;
          paint();
        } }, it.label));
      function drop(bi) { if (locked || sel == null) return; place[sel] = bi; sel = null; Sound.tick(); paint(); }
      const beam = q.style === 'scale' ? h('div', { class: 'scale-beam', 'aria-hidden': 'true' }, h('i', { class: 'post' }), h('i', { class: 'bar' })) : null;
      function paint() {
        pool.innerHTML = ''; zones.forEach((z) => (z.querySelector('.chips').innerHTML = ''));
        chips.forEach((c, i) => {
          c.classList.toggle('sel', sel === i);
          if (place[i] == null) pool.append(c); else zones[place[i]].querySelector('.chips').append(c);
        });
        if (!pool.children.length) pool.append(h('span', { class: 'muted small' }, 'وُزعت كل العناصر'));
        if (beam) {
          // الكفة الأولى (التوثيق) على اليمين: كلما ثقلت مال الذراع نحوها
          const n0 = place.filter((p) => p === 0).length, n1 = place.filter((p) => p === 1).length;
          beam.querySelector('.bar').style.transform = 'rotate(' + Math.max(-14, Math.min(14, (n0 - n1) * 5)) + 'deg)';
        }
        confirm.disabled = place.some((p) => p == null) || locked;
      }
      paint();
      body.append(h('div', { class: 'muted small', style: { marginBottom: '.4rem' } }, ro ? '' : 'اختر عنصرًا ثم اضغط على الخانة المناسبة.'), pool, beam, h('div', { class: 'buckets' }, zones), ro ? null : confirm);
      api.showResult = (g) => {
        chips.forEach((c, i) => { c.disabled = true; c.classList.remove('sel'); c.classList.add(g && g.detail && g.detail[i] ? 'correct' : 'wrong'); });
        confirm.remove();
      };
    }

    /* ===== صحح الترجمة ===== */
    else if (q.type === 'spot') {
      let picked = null;
      const card = h('div', { class: 'bio-card', role: 'group', 'aria-labelledby': 'qprompt' });
      const st = d.statements.map((t, i) => h('button', { class: 'stmt', type: 'button', disabled: ro, onclick: () => { if (locked) return; picked = i; st[i].classList.add('picked'); commit(i); } },
        h('span', { class: 'ic' }), h('span', null, t)));
      card.append(...st);
      body.append(card);
      api.showResult = (g, full) => {
        const fq = full || q;
        st.forEach((b, i) => { b.disabled = true; if (i === fq.data.wrong) b.classList.add('wrong'); else if (i === picked) b.classList.add('picked'); else b.classList.add('correct'); });
        if (fq.data.correction) body.append(h('div', { class: 'excerpt' }, '✎ التصحيح: ' + fq.data.correction));
      };
      api.keys = (i) => st[i] && st[i].click();
    }

    return api;
  }

  /* خريطة مبسطة: إسقاط خطي للإحداثيات مع شبكة خطوط وعلامات المواقع (بلا نصوص عربية داخل SVG) */
  function mapView(pins, onPick, ro) {
    const wrap = h('div', { class: 'map-wrap' });
    if (!pins.length) return wrap;
    const lats = pins.map((p) => p.lat), lons = pins.map((p) => p.lon);
    const minLat = Math.min(...lats) - 3, maxLat = Math.max(...lats) + 3, minLon = Math.min(...lons) - 4, maxLon = Math.max(...lons) + 4;
    const W = 800, H = Math.max(320, Math.min(520, W * (maxLat - minLat) / (maxLon - minLon)));
    const X = (lon) => ((lon - minLon) / (maxLon - minLon)) * W;
    const Y = (lat) => H - ((lat - minLat) / (maxLat - minLat)) * H;
    let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="خريطة المواقع"><rect width="' + W + '" height="' + H + '" fill="#e9e1cc"/>';
    for (let lo = Math.ceil(minLon / 5) * 5; lo < maxLon; lo += 5) svg += '<line x1="' + X(lo) + '" y1="0" x2="' + X(lo) + '" y2="' + H + '" stroke="#c9b78c" stroke-width="1" stroke-dasharray="4 6"/>';
    for (let la = Math.ceil(minLat / 5) * 5; la < maxLat; la += 5) svg += '<line x1="0" y1="' + Y(la) + '" x2="' + W + '" y2="' + Y(la) + '" stroke="#c9b78c" stroke-width="1" stroke-dasharray="4 6"/>';
    svg += '<g transform="translate(40 40)" stroke="#8f7130" fill="none" stroke-width="2"><circle r="22"/><path d="M0 -30 L6 0 L0 30 L-6 0 Z" fill="#c9a24a"/></g>';
    pins.forEach((p, i) => { svg += '<g class="pin" data-i="' + i + '" tabindex="' + (ro ? -1 : 0) + '"><circle class="dot" cx="' + X(p.lon) + '" cy="' + Y(p.lat) + '" r="11"/></g>'; });
    svg += '</svg>';
    wrap.innerHTML = svg;
    pins.forEach((p, i) => {
      const lab = h('span', { class: 'pin-label', style: { right: (100 - (X(p.lon) / W) * 100) + '%', top: (Y(p.lat) / H) * 100 + '%' } }, KEYS[i] + ' — ' + p.label);
      wrap.append(lab);
    });
    if (!ro) wrap.querySelectorAll('.pin').forEach((g) => {
      const go = () => { const i = +g.dataset.i; if (!wrap.dataset.done) { wrap.dataset.done = '1'; g.classList.add('picked'); onPick(i); } };
      g.addEventListener('click', go);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    });
    return wrap;
  }

  window.HimmaQ = { render };
})();
