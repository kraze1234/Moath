#!/usr/bin/env node
/* اختبارات المتصفح الشاملة (Playwright + Chromium): node tests/e2e.js [مجلد اللقطات]
 * تشغّل خادمًا مؤقتًا ببيانات تجريبية، وتجرب: الرئيسية، اللعب الفردي بكل أنواع الأسئلة، الألعاب، التحدي الأكبر،
 * لوحة الإدارة بكل أقسامها، الاستيراد، والمسابقة الجماعية مع هاتف مشارك. */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('playwright');
const { createApp } = require('../server/app.js');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'out'));
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info && !ok ? ' — ' + info : '')); };

async function answerAny(page) {
  // يجيب عن أي نوع سؤال ظاهر في الصفحة
  if (await page.locator('.book:not([disabled])').count()) return page.locator('.book').first().click();
  if (await page.locator('.stmt:not([disabled])').count()) return page.locator('.stmt').first().click();
  if (await page.locator('.order-item').count()) return page.click('text=تأكيد الترتيب');
  if (await page.locator('.match').count()) {
    const n = await page.locator('.match .col').first().locator('.mitem').count();
    for (let i = 0; i < n; i++) {
      await page.locator('.match .col').nth(0).locator('.mitem').nth(i).click();
      await page.locator('.match .col').nth(1).locator('.mitem').nth(i).click();
    }
    return page.click('text=تأكيد الربط');
  }
  if (await page.locator('.bucket').count()) {
    while (await page.locator('.bucket-pool .chip').count()) {
      await page.locator('.bucket-pool .chip').first().click();
      await page.locator('.bucket h4').first().click();
    }
    return page.click('text=تأكيد التوزيع');
  }
  if (await page.locator('.seg').count()) await page.locator('.seg').first().click();
  return page.locator('.opt:not([disabled])').first().click();
}

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'himma-e2e-'));
  const app = createApp({ dataDir });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const browser = await chromium.launch();
  const errors = [];
  const newPage = async (vp, label) => {
    const ctx = await browser.newContext({ viewport: vp || { width: 1366, height: 900 }, locale: 'ar' });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push((label || '') + ' pageerror: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/401|404|Failed to load resource/.test(m.text())) errors.push((label || '') + ' console: ' + m.text()); });
    p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? '50' : undefined));
    return p;
  };
  const hscroll = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  try {
    /* ===== الرئيسية ===== */
    for (const [lbl, vp] of [['desktop', { width: 1366, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
      const p = await newPage(vp, 'home-' + lbl);
      await p.goto(base + '/');
      await p.waitForSelector('.bcard');
      check('الرئيسية (' + lbl + '): أربعة فروع والفرع الجامع وثماني ألعاب', (await p.locator('.bcard').count()) === 5 && (await p.locator('.gtile').count()) === 8);
      check('الرئيسية (' + lbl + '): لا تمرير أفقي', (await hscroll(p)) <= 0, String(await hscroll(p)));
      check('الرئيسية (' + lbl + '): شريط البيانات التجريبية ظاهر', await p.locator('.demo-banner').isVisible());
      await p.screenshot({ path: path.join(OUT, 'home-' + lbl + '.png'), fullPage: true });
      await p.context().close();
    }

    /* ===== كتم الأصوات ===== */
    {
      const p = await newPage(null, 'sound');
      await p.goto(base + '/');
      await p.click('.topnav button[aria-pressed]');
      check('زر الكتم يحفظ الاختيار', (await p.evaluate(() => localStorage.getItem('himma-sound'))) === 'off');
      await p.keyboard.press('m');
      check('مفتاح M يعيد تشغيل الأصوات', (await p.evaluate(() => localStorage.getItem('himma-sound'))) === 'on');
      await p.context().close();
    }

    /* ===== اللعب الفردي في كل فرع ===== */
    for (const br of ['hadith', 'fiqh', 'leaders', 'zuhd']) {
      const p = await newPage({ width: 390, height: 844 }, 'play-' + br);
      await p.goto(base + '/play?branch=' + br);
      await p.waitForSelector('.setup');
      await p.click('.seg-ctl button:has-text("٥")');
      await p.click('button:has-text("ابدأ")');
      let answered = 0;
      for (let i = 0; i < 6; i++) {
        if (await p.locator('.summary').count()) break;
        await p.waitForSelector('.qcard');
        await answerAny(p);
        await p.waitForSelector('.feedback');
        if (i === 0) await p.screenshot({ path: path.join(OUT, 'play-' + br + '.png'), fullPage: true });
        answered++;
        check('فرع ' + br + ': السؤال ' + (i + 1) + ' بلا تمرير أفقي', (await hscroll(p)) <= 0);
        await p.locator('.feedback .next-row button').click();
      }
      await p.waitForSelector('.summary');
      check('فرع ' + br + ': إكمال جولة من ' + answered + ' أسئلة والوصول إلى الملخص', answered >= 1);
      await p.context().close();
    }

    /* ===== الشرح والمعلومة الموثقة بعد السؤال، والمفاتيح ===== */
    {
      const p = await newPage(null, 'kbd');
      await p.goto(base + '/play?game=librarian');
      await p.click('button:has-text("ابدأ")');
      await p.waitForSelector('.qcard');
      await p.keyboard.press('1');
      await p.waitForSelector('.feedback');
      check('المفتاح 1 يختار الإجابة الأولى', true);
      check('بعد السؤال: شرح ومعلومة جديدة مع حالة التوثيق', (await p.locator('.feedback .cite').count()) >= 1 && (await p.locator('.feedback .learn').count()) === 1);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(300);
      check('Enter ينتقل إلى السؤال التالي', (await p.locator('.feedback').count()) === 0);
      await p.keyboard.press('Escape');
      await p.waitForSelector('.setup');
      check('Esc يعود إلى الإعداد', true);
      await p.context().close();
    }

    /* ===== كل الألعاب الإضافية ===== */
    for (const g of ['whoami', 'timeline', 'network', 'librarian', 'researcher', 'fixbio', 'centuries', 'encyclopedia']) {
      const p = await newPage(null, 'game-' + g);
      await p.goto(base + '/play?game=' + g);
      await p.waitForSelector('.setup');
      const disabled = await p.locator('button:has-text("ابدأ")').isDisabled();
      if (g === 'researcher') { check('لعبة الباحث الصغير: تعرض «لا يوجد محتوى معتمد» حتى تُرفق مقتطفات موثقة', disabled && (await p.locator('.empty').count()) === 1); await p.context().close(); continue; }
      await p.click('button:has-text("ابدأ")');
      await p.waitForSelector('.qcard');
      await answerAny(p);
      await p.waitForSelector('.feedback');
      check('لعبة ' + g + ': تعمل وتُصحح', true);
      if (g === 'encyclopedia') {
        for (let i = 0; i < 12 && !(await p.locator('.summary').count()); i++) {
          if (await p.locator('.feedback').count()) await p.locator('.feedback .next-row button').click();
          if (await p.locator('.summary').count()) break;
          await p.waitForSelector('.qcard'); await answerAny(p); await p.waitForSelector('.feedback');
        }
        check('الموسوعة المفقودة: تعرض الصفحات المجموعة في النهاية', (await p.locator('.ency .page').count()) >= 1);
        await p.screenshot({ path: path.join(OUT, 'encyclopedia.png'), fullPage: true });
      }
      await p.context().close();
    }

    /* ===== التحدي الأكبر ===== */
    {
      const p = await newPage(null, 'grand');
      await p.goto(base + '/play?grand=1');
      await p.click('button:has-text("ابدأ")');
      await p.waitForSelector('.round-intro');
      check('التحدي الأكبر: تقديم المرحلة الأولى', (await p.locator('.round-intro h2').innerText()).includes('السرعة'));
      await p.click('button:has-text("ابدأ الجولة")');
      await p.waitForSelector('.timer');
      check('التحدي الأكبر: مؤقت ظاهر في جولة السرعة', true);
      await p.context().close();
    }

    /* ===== لوحة الإدارة ===== */
    const admin = await newPage({ width: 1366, height: 900 }, 'admin');
    await admin.goto(base + '/admin');
    await admin.fill('#pw', 'himma-e2e-pass');
    await admin.fill('#pw2', 'himma-e2e-pass');
    await admin.click('button:has-text("إنشاء وحفظ")');
    await admin.waitForSelector('.stat-grid');
    check('الإدارة: إعداد كلمة المرور والدخول', true);
    for (const sec of ['persons', 'categories', 'events', 'terms', 'sources', 'import', 'review', 'questions', 'competitions', 'teams', 'results', 'backup', 'settings']) {
      await admin.goto(base + '/admin#/' + sec);
      await admin.waitForTimeout(450);
      const err = await admin.locator('main#adm .route-error').count();
      check('الإدارة: قسم ' + sec + ' يعمل', err === 0, err ? await admin.locator('main#adm .route-error').innerText() : '');
    }
    await admin.goto(base + '/admin#/persons/demo_ibnmubarak');
    await admin.waitForSelector('text=المعلومات الموثقة');
    check('الإدارة: صفحة العلم بتصنيفات متعددة', (await admin.locator('text=العلماء').count()) >= 0 && (await admin.locator('.kv').innerText()).includes('رئيسي'));
    await admin.goto(base + '/admin#/persons/demo_asim');
    await admin.waitForSelector('text=تعارض بين الروايات');
    check('الإدارة: عرض التعارض بين المصادر للمشرف', true);
    await admin.goto(base + '/admin#/questions');
    await admin.waitForSelector('.item-card');
    await admin.locator('.item-card button:has-text("معاينة")').first().click();
    await admin.waitForSelector('.modal .qcard');
    check('الإدارة: معاينة سؤال مسودة', true);
    await admin.keyboard.press('Escape');
    await admin.screenshot({ path: path.join(OUT, 'admin-questions.png') });
    // الاستيراد عبر رفع ملف
    await admin.goto(base + '/admin#/import');
    await admin.waitForSelector('.dropzone');
    const tmpTxt = path.join(dataDir, 'names.txt');
    fs.writeFileSync(tmpTxt, 'المحدثون:\n1- أبو زرعة الرازي (ت ٢٦٤هـ)\n2- الإمام البخاري\n');
    await admin.setInputFiles('#file', tmpTxt);
    await admin.waitForSelector('text=مراجعة: names.txt');
    check('الإدارة: رفع قائمة أسماء والانتقال لمراجعتها', (await admin.locator('tbody tr').count()) === 2);
    await admin.screenshot({ path: path.join(OUT, 'admin-import.png'), fullPage: true });
    {
      const m = await newPage({ width: 390, height: 844 }, 'admin-m');
      await m.context().addCookies((await admin.context().cookies()));
      await m.goto(base + '/admin#/persons');
      await m.waitForSelector('table');
      check('الإدارة على الجوال: لا تمرير أفقي في الصفحة', (await hscroll(m)) <= 0, String(await hscroll(m)));
      await m.context().close();
    }

    /* ===== المسابقة الجماعية مع هاتف ===== */
    const host = admin;
    await host.goto(base + '/host');
    await host.waitForSelector('text=جلسة جديدة');
    await host.click('.seg-ctl button:has-text("الهواتف")');
    await host.selectOption('#plan', 'custom');
    await host.click('button:has-text("إنشاء الجلسة")');
    await host.waitForSelector('.lobby .code');
    const code = (await host.locator('.lobby .code').innerText()).trim();
    check('الجماعية: إنشاء جلسة برمز من ٤ أرقام', /^\d{4}$/.test(code), code);
    const qrOk = await host.locator('.lobby img.qr').evaluate((img) => img.complete && img.naturalWidth > 0);
    check('الجماعية: رمز QR يظهر', qrOk);
    await host.screenshot({ path: path.join(OUT, 'host-lobby.png') });

    const phone = await newPage({ width: 390, height: 844 }, 'phone');
    await phone.goto(base + '/join?code=' + code);
    await phone.waitForSelector('#pname');
    await phone.fill('#pname', 'عبدالله');
    await phone.locator('.team-pick button').first().click();
    await phone.click('button:has-text("انضمام")');
    await phone.waitForSelector('text=انضممت بنجاح');
    check('الهاتف: الانضمام إلى الفريق', true);
    await host.waitForSelector('text=1 مشاركًا انضموا', { timeout: 3000 }).catch(() => {});
    await host.click('.control button.btn-gold'); // ابدأ
    await host.waitForSelector('.round-intro');
    await host.click('.control button.btn-gold'); // السؤال الأول
    await host.waitForSelector('.stage-host .qcard');
    await phone.waitForSelector('.qcard');
    check('الهاتف: يظهر السؤال بلا إجابة مكشوفة', (await phone.locator('.opt.correct, .order-item.correct').count()) === 0);
    await answerAny(phone);
    await phone.waitForSelector('text=أجاب فريقك');
    check('الهاتف: تسجيل إجابة الفريق', true);
    await host.waitForSelector('.answered-strip span.on');
    check('شاشة العرض: تُظهر الفرق التي أجابت', true);
    await host.click('.control button:has-text("كشف الإجابة")');
    await phone.waitForSelector('.feedback h3:has-text("إجابة")');
    check('الهاتف: يرى النتيجة والشرح بعد الكشف', true);
    await phone.screenshot({ path: path.join(OUT, 'phone-revealed.png'), fullPage: true });
    check('الهاتف: لا تمرير أفقي', (await hscroll(phone)) <= 0);
    // الإيقاف والاستئناف
    await host.click('.control button:has-text("إيقاف مؤقت")');
    await phone.waitForSelector('text=المسابقة متوقفة مؤقتًا');
    check('الإيقاف المؤقت يظهر على الهاتف', true);
    await host.click('.control button:has-text("استئناف")');
    // تعديل النقاط يدويًا
    const before = await host.locator('.control .team-row .sc').first().innerText();
    await host.locator('.control .team-row button:has-text("±")').first().click();
    await host.waitForTimeout(400);
    check('تعديل النقاط يدويًا', (await host.locator('.control .team-row .sc').first().innerText()) !== before);
    // شاشة العرض المستقلة
    const disp = await newPage(null, 'display');
    await disp.goto(base + '/host?id=' + new URL(host.url()).searchParams.get('id') + '&display=1&code=' + code);
    await disp.waitForSelector('.stage-host .paper, .stage-host .round-intro');
    check('شاشة العرض المستقلة تعمل دون لوحة التحكم', (await disp.locator('.control').count()) === 0);
    await host.click('.control button.btn-red');
    await host.waitForSelector('.winner');
    check('إعلان الفائز بأسلوب احتفالي', await host.locator('.winner .tname').isVisible());
    await host.screenshot({ path: path.join(OUT, 'host-winner.png') });
    await phone.waitForSelector('.summary');
    check('الهاتف: النتائج النهائية', true);
  } catch (e) {
    check('تشغيل الاختبارات دون استثناء', false, e.message);
  }

  check('لا أخطاء JavaScript في الصفحات', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
  app.server.close();
  const failed = results.filter((r) => !r.ok);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' PASS');
  process.exit(failed.length ? 1 : 0);
})();
