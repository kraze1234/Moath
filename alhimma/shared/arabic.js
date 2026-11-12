/* أدوات النص العربي — مشتركة بين الخادم والمتصفح (UMD) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HimmaArabic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g; // الحركات والتطويل
  const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
  const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

  function toLatinDigits(s) {
    return String(s == null ? '' : s).replace(/[٠-٩۰-۹]/g, (d) => {
      const i = AR_DIGITS.indexOf(d);
      return String(i >= 0 ? i : FA_DIGITS.indexOf(d));
    });
  }

  function toArabicDigits(n) {
    return String(n).replace(/[0-9]/g, (d) => AR_DIGITS[+d]);
  }

  function stripTashkeel(s) {
    return String(s == null ? '' : s).replace(TASHKEEL, '');
  }

  /** تطبيع للمقارنة والبحث: بلا حركات، توحيد الألف والياء والتاء المربوطة، مسافات مفردة */
  function normalize(s) {
    return stripTashkeel(toLatinDigits(s))
      .replace(/[إأآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[«»"'“”‘’()\[\]{}<>.,،؛;:!؟?\-_/\\|*~`]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ألقاب وعبارات تُحذف عند توحيد الأسماء (لا تمس أصل الاسم)
  const HONORIFICS = [
    'الامام', 'الشيخ', 'العلامه', 'الحافظ', 'شيخ الاسلام', 'الصحابي', 'التابعي', 'القاضي', 'الفقيه', 'المحدث', 'السلطان', 'القائد',
    'رحمه الله تعالي', 'رحمه الله', 'رحمهم الله', 'رضي الله عنهما', 'رضي الله عنها', 'رضي الله عنه', 'رضي الله عنهم', 'عليه السلام',
  ];

  /** توحيد حالات الإعراب في الكنى: أبي/أبا ← أبو (للبحث والمطابقة فقط) */
  function canonKunya(n) {
    return (' ' + n + ' ').replace(/ اب[يا](?= )/g, ' ابو').replace(/\s+/g, ' ').trim();
  }

  /** مفتاح مطابقة للاسم: تطبيع + حذف الألقاب الشائعة */
  function nameKey(s) {
    let n = ' ' + canonKunya(normalize(s)) + ' ';
    for (const h of HONORIFICS) n = n.split(' ' + h + ' ').join(' ');
    return n.replace(/\s+/g, ' ').trim();
  }

  /** تشابه بين اسمين (0..1) — معامل دايس على ثنائيات الحروف مع مكافأة احتواء الكلمات */
  function similarity(a, b) {
    a = nameKey(a); b = nameKey(b);
    if (!a || !b) return 0;
    if (a === b) return 1;
    const bigrams = (s) => {
      const m = new Map();
      const t = s.replace(/\s/g, '');
      for (let i = 0; i < t.length - 1; i++) {
        const g = t.slice(i, i + 2);
        m.set(g, (m.get(g) || 0) + 1);
      }
      return m;
    };
    const A = bigrams(a), B = bigrams(b);
    let inter = 0, total = 0;
    A.forEach((v) => (total += v));
    B.forEach((v) => (total += v));
    A.forEach((v, g) => { if (B.has(g)) inter += Math.min(v, B.get(g)); });
    let score = total ? (2 * inter) / total : 0;
    const wa = a.split(' '), wb = b.split(' ');
    const short = wa.length <= wb.length ? wa : wb, long = wa.length <= wb.length ? wb : wa;
    if (short.length && short.every((w) => long.includes(w))) score = Math.max(score, 0.85);
    return Math.round(score * 100) / 100;
  }

  /** القرن الهجري من سنة الوفاة */
  function century(year) {
    const y = parseInt(year, 10);
    if (!y || y < 1) return null;
    return Math.floor((y - 1) / 100) + 1;
  }

  const ORDINALS = ['', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر',
    'الحادي عشر', 'الثاني عشر', 'الثالث عشر', 'الرابع عشر', 'الخامس عشر'];
  function centuryName(c) {
    return c ? 'القرن ' + (ORDINALS[c] || toArabicDigits(c)) + ' الهجري' : 'غير محدد';
  }

  /** عبارة المكان: «ارتبط اسمه ب» + «القاهرة» ← «ارتبط اسمه بالقاهرة» (حرف الباء يتصل بالاسم) */
  function placePhrase(relation, name) {
    const rel = String(relation || 'ارتبط اسمه ب').trim().replace(/بـ$/, 'ب');
    return /(^|\s)ب$/.test(rel) ? rel + name : rel + ' ' + name;
  }

  return { canonKunya, placePhrase, normalize, stripTashkeel, toLatinDigits, toArabicDigits, nameKey, similarity, century, centuryName };
});
