'use strict';
/* بيانات تجريبية موسومة بوضوح (demo: true) لتجربة المنصة قبل استلام القائمة والمصادر الحقيقية.
 * - لا تحمل أي إحالة إلى مصدر أو رقم صفحة؛ تظهر في الواجهة بعلامة «تجريبي — بانتظار التوثيق».
 * - تُحذف كلها بزر واحد من لوحة الإدارة (الإعدادات ← حذف البيانات التجريبية).
 * - لا تحتوي أقوالًا منسوبة ولا تعريفات اصطلاحية، لأن ذلك يتطلب نصًا موثقًا من مصدره. */

const NOTE = 'بيانات تجريبية للتجربة فقط — غير موثقة، بانتظار المطابقة بالمصادر';

// [id, الاسم, التصنيفات (الأول رئيسي), الشهرة 1-3, الوفاة, البلد, المذهب, المؤلفات, الشيوخ]
const P = [
  ['malik', 'مالك بن أنس', ['faqih', 'muhaddith'], 1, 179, 'المدينة', 'المالكي', ['الموطأ'], []],
  ['shafii', 'محمد بن إدريس الشافعي', ['faqih', 'muhaddith'], 1, 204, 'مصر', 'الشافعي', ['الرسالة', 'الأم'], ['malik']],
  ['ahmad', 'أحمد بن حنبل', ['muhaddith', 'faqih', 'zahid'], 1, 241, 'بغداد', 'الحنبلي', ['المسند'], ['shafii']],
  ['abuhanifa', 'أبو حنيفة النعمان بن ثابت', ['faqih'], 1, 150, 'الكوفة', 'الحنفي', [], []],
  ['bukhari', 'محمد بن إسماعيل البخاري', ['muhaddith'], 1, 256, 'بخارى', null, ['الجامع الصحيح', 'التاريخ الكبير'], ['ahmad']],
  ['muslim', 'مسلم بن الحجاج النيسابوري', ['muhaddith'], 1, 261, 'نيسابور', null, ['صحيح مسلم'], ['bukhari']],
  ['abudawud', 'أبو داود السجستاني', ['muhaddith'], 2, 275, 'البصرة', null, ['سنن أبي داود'], ['ahmad']],
  ['tirmidhi', 'محمد بن عيسى الترمذي', ['muhaddith'], 2, 279, 'ترمذ', null, ['جامع الترمذي'], ['bukhari']],
  ['nasai', 'أحمد بن شعيب النسائي', ['muhaddith'], 2, 303, null, null, ['السنن الصغرى (المجتبى)'], []],
  ['ibnmajah', 'محمد بن يزيد ابن ماجه', ['muhaddith'], 2, 273, 'قزوين', null, ['سنن ابن ماجه'], []],
  ['tabari', 'محمد بن جرير الطبري', ['mufassir', 'mawsui'], 2, 310, 'بغداد', null, ['جامع البيان عن تأويل آي القرآن', 'تاريخ الرسل والملوك'], []],
  ['ibnqudama', 'موفق الدين ابن قدامة المقدسي', ['faqih'], 2, 620, 'دمشق', 'الحنبلي', ['المغني', 'روضة الناظر'], []],
  ['nawawi', 'يحيى بن شرف النووي', ['muhaddith', 'faqih'], 1, 676, 'دمشق', 'الشافعي', ['رياض الصالحين', 'الأربعون النووية'], []],
  ['ibntaymiyya', 'أحمد بن عبد الحليم ابن تيمية', ['faqih', 'mawsui'], 1, 728, 'دمشق', 'الحنبلي', ['درء تعارض العقل والنقل', 'السياسة الشرعية'], []],
  ['ibnalqayyim', 'ابن قيم الجوزية', ['faqih'], 1, 751, 'دمشق', 'الحنبلي', ['زاد المعاد', 'مدارج السالكين'], ['ibntaymiyya']],
  ['dhahabi', 'شمس الدين الذهبي', ['muhaddith', 'mawsui'], 2, 748, 'دمشق', 'الشافعي', ['سير أعلام النبلاء', 'تذكرة الحفاظ'], ['ibntaymiyya']],
  ['ibnkathir', 'إسماعيل بن عمر ابن كثير', ['mufassir', 'muhaddith'], 1, 774, 'دمشق', null, ['تفسير القرآن العظيم', 'البداية والنهاية'], []],
  ['ibnhajar', 'ابن حجر العسقلاني', ['muhaddith'], 1, 852, 'القاهرة', 'الشافعي', ['فتح الباري', 'بلوغ المرام'], []],
  ['suyuti', 'جلال الدين السيوطي', ['mawsui', 'mufassir'], 2, 911, 'القاهرة', null, ['الإتقان في علوم القرآن', 'الدر المنثور'], []],
  ['hasan', 'الحسن البصري', ['zahid'], 1, 110, 'البصرة', null, [], []],
  ['ibnmubarak', 'عبد الله بن المبارك', ['zahid', 'muhaddith', 'qaid'], 1, 181, 'مرو', null, ['كتاب الزهد', 'كتاب الجهاد'], ['thawri']],
  ['fudayl', 'الفضيل بن عياض', ['zahid'], 2, 187, 'مكة', null, [], []],
  ['thawri', 'سفيان الثوري', ['muhaddith', 'zahid', 'faqih'], 1, 161, 'الكوفة', null, [], []],
  ['ibnaljawzi', 'أبو الفرج ابن الجوزي', ['mawsui', 'zahid'], 2, 597, 'بغداد', 'الحنبلي', ['صفة الصفوة', 'صيد الخاطر'], []],
  ['abunuaym', 'أبو نعيم الأصبهاني', ['muhaddith'], 3, 430, 'أصبهان', null, ['حلية الأولياء'], []],
  ['ibnabdalbarr', 'ابن عبد البر', ['muhaddith', 'faqih'], 3, 463, 'قرطبة', 'المالكي', ['التمهيد', 'الاستيعاب في معرفة الأصحاب'], []],
  ['khatib', 'الخطيب البغدادي', ['muhaddith'], 3, 463, 'بغداد', null, ['تاريخ بغداد'], []],
  ['shatibi', 'القاسم بن فيره الشاطبي', ['qari'], 2, 590, 'القاهرة', null, ['حرز الأماني ووجه التهاني'], []],
  ['ibnaljazari', 'محمد بن محمد ابن الجزري', ['qari'], 2, 833, null, null, ['النشر في القراءات العشر'], []],
  ['khalid', 'خالد بن الوليد', ['qaid'], 1, 21, 'حمص', null, [], []],
  ['saladin', 'صلاح الدين الأيوبي', ['qaid'], 1, 589, 'دمشق', null, [], []],
  ['nuraldin', 'نور الدين محمود زنكي', ['qaid'], 2, 569, 'دمشق', null, [], []],
  ['qutuz', 'سيف الدين قطز', ['qaid'], 2, 658, null, null, [], []],
  ['tariq', 'طارق بن زياد', ['qaid'], 1, null, null, null, [], []],
  ['yusuf', 'يوسف بن تاشفين', ['qaid'], 2, 500, null, null, [], []],
  ['fatih', 'محمد الفاتح', ['qaid'], 1, 886, null, null, [], []],
];

const PLACES = [
  ['المدينة', 24.47, 39.61], ['مكة', 21.42, 39.83], ['بغداد', 33.31, 44.36], ['دمشق', 33.51, 36.29], ['القاهرة', 30.04, 31.24],
  ['الكوفة', 32.03, 44.4], ['البصرة', 30.51, 47.81], ['بخارى', 39.77, 64.42], ['نيسابور', 36.21, 58.79], ['قرطبة', 37.88, -4.78],
  ['بيت المقدس', 31.78, 35.23], ['حطين', 32.8, 35.45], ['عين جالوت', 32.55, 35.35], ['اليرموك', 32.8, 35.95], ['مؤتة', 31.08, 35.7],
  ['الزلاقة', 38.85, -6.9], ['وادي لكة', 36.7, -6.1], ['القسطنطينية', 41.01, 28.98], ['بدر', 23.78, 38.79],
];

// [id, العنوان, السنة, سنة بديلة (رواية أخرى), المكان, القادة, السياق, ما حدث]
const EVENTS = [
  ['badr', 'غزوة بدر الكبرى', 2, null, 'بدر', [], null, null],
  ['muta', 'غزوة مؤتة', 8, null, 'مؤتة', ['khalid'], 'استشهد القادة الثلاثة في مواجهة جيش الروم الكبير',
    'تولى خالد بن الوليد القيادة وانحاز بالجيش انسحابًا منظمًا'],
  ['yarmuk', 'معركة اليرموك', 15, 13, 'اليرموك', ['khalid'], 'التقى جيش المسلمين بجيش الروم عند نهر اليرموك', 'انتصر المسلمون على الروم'],
  ['guadalete', 'معركة وادي لكة', 92, null, 'وادي لكة', ['tariq'], 'عبر جيش المسلمين إلى الأندلس والتقى بجيش القوط',
    'انتصر المسلمون وكانت المعركة بداية الفتح الإسلامي للأندلس'],
  ['zallaqa', 'معركة الزلاقة', 479, null, 'الزلاقة', ['yusuf'], 'استنجد أهل الأندلس بالمرابطين أمام زحف قشتالة',
    'انتصر المرابطون وأهل الأندلس على جيش قشتالة'],
  ['hattin', 'معركة حطين', 583, null, 'حطين', ['saladin'], 'التقى جيش صلاح الدين بجيوش الصليبيين قرب طبرية',
    'انتصر المسلمون انتصارًا كبيرًا مهّد لاسترداد بيت المقدس'],
  ['quds', 'استرداد بيت المقدس', 583, null, 'بيت المقدس', ['saladin'], null, null],
  ['aynjalut', 'معركة عين جالوت', 658, null, 'عين جالوت', ['qutuz'], 'زحف المغول نحو الشام ومصر فخرج إليهم جيش المماليك',
    'انتصر المسلمون على المغول وأوقفوا زحفهم نحو مصر'],
  ['qustantiniya', 'فتح القسطنطينية', 857, null, 'القسطنطينية', ['fatih'], 'حاصر الجيش العثماني المدينة الحصينة',
    'فُتحت المدينة وصارت عاصمة للدولة العثمانية'],
];

// مداخل مرجعية لكتب تراجم معروفة (لم تُربط بأرقام كتب الشاملة بعد)
const SOURCES = [
  ['سير أعلام النبلاء', 'شمس الدين الذهبي', 748], ['تذكرة الحفاظ', 'شمس الدين الذهبي', 748],
  ['تهذيب التهذيب', 'ابن حجر العسقلاني', 852], ['حلية الأولياء وطبقات الأصفياء', 'أبو نعيم الأصبهاني', 430],
  ['صفة الصفوة', 'أبو الفرج ابن الجوزي', 597], ['البداية والنهاية', 'ابن كثير', 774],
  ['تاريخ بغداد', 'الخطيب البغدادي', 463], ['طبقات الحنابلة', 'ابن أبي يعلى', 526], ['الطبقات الكبرى', 'ابن سعد', 230],
];

function buildDemo() {
  const demo = { demo: true, note: NOTE };
  const persons = [], claims = [], places = [], events = [], sources = [];
  const placeId = (name) => 'demo_pl_' + PLACES.findIndex((p) => p[0] === name);
  PLACES.forEach(([name, lat, lon], i) => places.push({ id: 'demo_pl_' + i, name, lat, lon, demo: true }));
  let n = 0;
  const claim = (personId, kind, value, extra) => claims.push({ id: 'demo_c' + (++n), personId, kind, value, citations: [], status: 'approved', ...demo, ...(extra || {}) });

  for (const [id, name, cats, level, death, place, madhhab, works, teachers] of P) {
    const pid = 'demo_' + id;
    persons.push({ id: pid, name, aliases: [], categories: cats, primaryCategory: cats[0], level, bio: '', status: 'approved', ...demo });
    if (death) claim(pid, 'death', { year: death });
    if (place) claim(pid, 'place', { name: place, relation: 'ارتبط اسمه ب', placeId: PLACES.some((p) => p[0] === place) ? placeId(place) : null });
    if (madhhab) claim(pid, 'madhhab', { name: madhhab });
    for (const w of works) claim(pid, 'work', { title: w });
    for (const t of teachers) claim(pid, 'teacher', { personId: 'demo_' + t });
  }
  // مثال تعليمي على عرض الاختلاف بين المصادر: روايتان في سنة وفاة عاصم، تظهران للمشرف «قيد المراجعة»
  persons.push({ id: 'demo_asim', name: 'عاصم بن أبي النجود', aliases: [], categories: ['qari'], primaryCategory: 'qari', level: 2, bio: '', status: 'approved', ...demo });
  claim('demo_asim', 'place', { name: 'الكوفة', relation: 'ارتبط اسمه ب', placeId: placeId('الكوفة') });
  claim('demo_asim', 'death', { year: 127 }, { status: 'review', note: NOTE + ' — مثال على تعارض الروايات' });
  claim('demo_asim', 'death', { year: 128 }, { status: 'review', note: NOTE + ' — مثال على تعارض الروايات' });

  for (const [id, title, year, yearAlt, place, leaders, context, outcome] of EVENTS) {
    events.push({ id: 'demo_ev_' + id, title, year, yearAlt, placeId: placeId(place), personIds: leaders.map((l) => 'demo_' + l), context, outcome, citations: [], status: 'approved', ...demo });
  }
  SOURCES.forEach(([title, author, authorDeath], i) => sources.push({
    id: 'src_ref_' + i, title, author, authorDeath, shamelaId: null, url: null,
    notes: 'مدخل مرجعي: أضف رقم الكتاب في المكتبة الشاملة عند التحقق منه.',
  }));
  return { persons, claims, places, events, sources };
}

/** تحميل البيانات التجريبية وتوليد أسئلتها؛ تُعتمد أسئلتها التجريبية تلقائيًا ليمكن تجربة الألعاب،
 *  مع ترك عيّنة مسودات لتجربة سير المراجعة. لا ينطبق هذا على أي محتوى حقيقي. */
function loadDemo(db, kb, generate) {
  const d = buildDemo();
  for (const col of ['persons', 'claims', 'places', 'events']) {
    const ids = new Set(db.data[col].map((x) => x.id));
    db.data[col].push(...d[col].filter((x) => !ids.has(x.id)).map((x) => ({ ...x, createdAt: new Date().toISOString() })));
  }
  const sids = new Set(db.data.sources.map((x) => x.id));
  db.data.sources.push(...d.sources.filter((x) => !sids.has(x.id)));
  db.data.settings.demoInPlay = true;
  db.save();
  const qs = generate(kb, { seed: 1446, limitPerMode: 14 });
  qs.forEach((q, i) => {
    q.demo = true;
    if (i % 6 !== 5) { q.status = 'approved'; q.approvedNote = 'اعتماد تلقائي لبيانات تجريبية فقط'; }
  });
  db.insertMany('questions', qs, 'q');
  return { persons: d.persons.length, claims: d.claims.length, events: d.events.length, questions: qs.length };
}

function removeDemo(db) {
  const counts = {};
  for (const col of ['persons', 'claims', 'places', 'events', 'questions', 'terms']) {
    const before = db.data[col].length;
    db.data[col] = db.data[col].filter((x) => !x.demo);
    counts[col] = before - db.data[col].length;
  }
  db.save();
  return counts;
}

module.exports = { buildDemo, loadDemo, removeDemo, NOTE };
