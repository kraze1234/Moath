/* كتالوج المنصة: التصنيفات، الفروع، الأنماط، الألعاب، أنواع الجولات — مشترك (UMD)
 * لإضافة فرع أو لعبة جديدة: أضف عنصرًا هنا، والواجهة والخادم يلتقطانه تلقائيًا. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HimmaCatalog = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // تصنيفات الأعلام الافتراضية (قابلة للتعديل والإضافة من لوحة الإدارة)
  const DEFAULT_CATEGORIES = [
    { id: 'muhaddith', name: 'المحدثون', color: '#c9a24a' },
    { id: 'faqih', name: 'الفقهاء', color: '#2f7a5b' },
    { id: 'qaid', name: 'المجاهدون والقادة', color: '#a5483a' },
    { id: 'zahid', name: 'الزهاد والعباد', color: '#6f7fa8' },
    { id: 'mufassir', name: 'المفسرون', color: '#8a6d3b' },
    { id: 'qari', name: 'القراء', color: '#4f8c8c' },
    { id: 'mawsui', name: 'العلماء الموسوعيون', color: '#7a5c8e' },
  ];

  // الأنماط = طريقة توليد السؤال وشكله. type = طريقة العرض والتصحيح.
  const MODES = {
    'work-author':   { title: 'من صاحب الكتاب؟', type: 'choice', desc: 'يظهر اسم مؤلَّف وتختار مؤلفه.' },
    'shelf':         { title: 'أمين المكتبة', type: 'choice', style: 'shelf', desc: 'اختر كتاب العالم من رفوف المكتبة.' },
    'reveal':        { title: 'من أنا؟', type: 'reveal', desc: 'معلومات تنكشف تدريجيًا، وكلما عرفته أبكر نلت أكثر.' },
    'card':          { title: 'بطاقة العالم المجهول', type: 'card', desc: 'اكشف أجزاء البطاقة مقابل خصم من النقاط.' },
    'order-death':   { title: 'رحلة عبر الزمن', type: 'order', style: 'timeline', desc: 'رتّب الأعلام بحسب سنة الوفاة من الأقدم.' },
    'match-work':    { title: 'صل العالم بمؤلَّفه', type: 'match', desc: 'اربط كل عالم بكتابه.' },
    'teacher':       { title: 'من الشيخ ومن التلميذ؟', type: 'choice', desc: 'علاقة تتلمذ مثبتة في المصادر.' },
    'match-teacher': { title: 'شيخ وتلميذ', type: 'match', style: 'network', desc: 'صل كل علم بشيوخه وتلاميذه.' },
    'bucket-century':{ title: 'رحلة عبر القرون', type: 'bucket', desc: 'ضع كل عالم في قرنه الهجري.' },
    'bucket-madhhab':{ title: 'خريطة المدارس الفقهية', type: 'bucket', desc: 'ضع كل فقيه في مدرسته.' },
    'term':          { title: 'تحدي المصطلحات', type: 'choice', desc: 'المصطلح الفقهي وشرحه من مصدر معتمد.' },
    'spot':          { title: 'صحّح المعلومة', type: 'spot', desc: 'بطاقة فيها معلومة واحدة خاطئة: اكتشفها.' },
    'order-event':   { title: 'الخط الزمني للوقائع', type: 'order', desc: 'رتّب الوقائع التاريخية زمنيًا.' },
    'match-event':   { title: 'اربط القائد بالحدث', type: 'match', desc: 'صل كل قائد بالواقعة التي ارتبط بها.' },
    'map':           { title: 'خريطة الأحداث', type: 'choice', style: 'map', desc: 'حدّد موقع الواقعة على الخريطة.' },
    'decision':      { title: 'قرارات القادة', type: 'choice', desc: 'واقعة تاريخية: ما الذي حدث فعلًا؟' },
    'quote':         { title: 'لمن هذه المقولة؟', type: 'choice', desc: 'مقولة موثقة النسبة: من قائلها؟' },
    'match-stance':  { title: 'صل الشخصية بموقفها', type: 'match', desc: 'اربط كل شخصية بموقف ثابت عنها.' },
    'cloze':         { title: 'أكمل المعلومة', type: 'choice', desc: 'معلومة ناقصة: أكملها.' },
    'lesson':        { title: 'الدرس المستفاد', type: 'choice', desc: 'ما الدرس الذي يُستفاد من الموقف؟' },
    'excerpt':       { title: 'الباحث الصغير', type: 'choice', desc: 'استخرج الإجابة من مقتطف علمي موثق.' },
    'mizan':         { title: 'كفتا الميزان', type: 'bucket', style: 'scale', desc: 'ضع أقوال النقاد في كفة التوثيق أو التجريح.' },
    'mizan-q':       { title: 'أحكام النقاد', type: 'choice', desc: 'ما خلاصة أقوال النقاد في الراوي؟ مع بيان الاختلاف.' },
    'ashath':        { title: 'لوحة الأشاعثة', type: 'bucket', style: 'trio', desc: 'انسب كل معلومة إلى صاحبها من الأشاعثة الثلاثة.' },
    'ashath-q':      { title: 'تمييز الأشاعثة', type: 'choice', desc: 'أيّ الأشاعثة الثلاثة المقصود؟' },
    'stance-who':    { title: 'صاحب الموقف', type: 'choice', style: 'scroll', desc: 'تعرّف على العلم من موقفه أو قوله.' },
  };

  const BRANCHES = [
    {
      id: 'hadith', title: 'فرسان الحديث', category: 'muhaddith', emblem: 'ink', accent: '#c9a24a',
      tagline: 'استكشف المحدثين ومؤلفاتهم ومناهجهم',
      modes: ['work-author', 'reveal', 'order-death', 'match-work', 'teacher', 'card'],
    },
    {
      id: 'fiqh', title: 'مجالس الفقه', category: 'faqih', emblem: 'scale', accent: '#2f7a5b',
      tagline: 'الفقهاء ومؤلفاتهم ومذاهبهم وعصورهم',
      modes: ['match-work', 'order-death', 'reveal', 'bucket-madhhab', 'teacher', 'term'],
    },
    {
      id: 'leaders', title: 'ميادين العزيمة', category: 'qaid', emblem: 'banner', accent: '#a5483a',
      tagline: 'القادة والوقائع بطابع تاريخي تعليمي',
      modes: ['reveal', 'order-event', 'match-event', 'map', 'decision', 'card'],
    },
    {
      id: 'zuhd', title: 'مدارج الهمّة', category: 'zahid', emblem: 'lantern', accent: '#6f7fa8',
      tagline: 'سير الزهاد ومواقفهم وأقوالهم الثابتة',
      modes: ['quote', 'reveal', 'match-stance', 'cloze', 'order-death', 'lesson'],
    },
  ];

  // ألعاب الإصدار الحالي (الطبقة الخامسة) — لكل لعبة أسلوب تفاعل مختلف
  const GAMES = [
    { id: 'whoami', title: 'من أنا؟', modes: ['reveal'], emblem: 'mask', priority: true, desc: 'معلومات تنكشف تدريجيًا، وكلما عرفت العلم أبكر نلت نقاطًا أكثر.' },
    { id: 'mizan', title: 'ميزان الرواة', modes: ['mizan', 'mizan-q'], emblem: 'scale', priority: true, desc: 'وازن أقوال النقاد في الرواة: توثيق وتجريح واختلاف.' },
    { id: 'timeline', title: 'رحلة عبر الزمن', modes: ['order-death'], emblem: 'hourglass', priority: true, desc: 'رتّب الأعلام على خط الزمن بحسب سنوات الوفاة.' },
    { id: 'ashath', title: 'الأشاعثة الثلاثة', modes: ['ashath', 'ashath-q'], emblem: 'trio', desc: 'ميّز بين الحداني وابن سوار والحمراني.' },
    { id: 'links', title: 'شيخ وتلميذ', modes: ['match-teacher'], emblem: 'net', desc: 'صل الأعلام بشيوخهم وتلاميذهم.' },
    { id: 'stances', title: 'مواقف من سير الأعلام', modes: ['stance-who'], emblem: 'lantern', desc: 'تعرّف على العلم من موقفه أو قوله.' },
    { id: 'fixbio', title: 'صحّح المعلومة', modes: ['spot'], emblem: 'quill', desc: 'في بطاقة العالم معلومة خاطئة: اكتشفها.' },
  ];

  // أنواع الجولات في المسابقة الجماعية
  const ROUND_TYPES = {
    speed:    { title: 'جولة السرعة', timer: 20, multiplier: 1, speedBonus: true, modes: ['stance-who', 'ashath-q', 'mizan-q', 'work-author', 'cloze'] },
    discover: { title: 'جولة «من أنا؟»', timer: 60, multiplier: 1, modes: ['reveal', 'card'] },
    order:    { title: 'جولة رحلة عبر الزمن', timer: 60, multiplier: 1, modes: ['order-death', 'order-event', 'bucket-century'] },
    link:     { title: 'جولة الميزان والربط', timer: 75, multiplier: 1, modes: ['mizan', 'ashath', 'match-teacher', 'match-work'] },
    standard: { title: 'جولة متنوعة', timer: 30, multiplier: 1, modes: '*' },
    final:    { title: 'جولة التحدي النهائي', timer: 45, multiplier: 2, minDifficulty: 2, modes: '*' },
    risk:     { title: 'جولة المخاطرة بالنقاط', timer: 30, multiplier: 1, risk: true, modes: ['spot', 'mizan-q', 'ashath-q', 'stance-who', 'work-author'] },
  };

  // المسابقة الكبرى الافتراضية: صعوبة متدرجة
  const GRAND_PLAN = [
    { type: 'speed', count: 5, difficulty: [1] },
    { type: 'discover', count: 3, difficulty: [1, 2] },
    { type: 'order', count: 3, difficulty: [1, 2] },
    { type: 'link', count: 3, difficulty: [2] },
    { type: 'risk', count: 3, difficulty: [2, 3] },
    { type: 'final', count: 3, difficulty: [3] },
  ];

  const DIFFICULTY = { 1: { name: 'سهل', points: 100 }, 2: { name: 'متوسط', points: 200 }, 3: { name: 'صعب', points: 300 } };

  const STATUS = { draft: 'مسودة', review: 'قيد المراجعة', approved: 'معتمد', rejected: 'مرفوض' };

  const CLAIM_KINDS = {
    death: 'سنة الوفاة', birth: 'سنة الولادة', work: 'مؤلَّف', teacher: 'شيخ', place: 'بلد/موطن', madhhab: 'المذهب',
    event: 'حدث', quote: 'مقولة', jarh: 'حكم النقاد', nasab: 'النسب', stance: 'موقف', trait: 'صفة/مكانة', other: 'أخرى',
  };

  function modesFor(target) {
    if (target === '*' || !target) return Object.keys(MODES);
    return target;
  }

  return { DEFAULT_CATEGORIES, MODES, BRANCHES, GAMES, ROUND_TYPES, GRAND_PLAN, DIFFICULTY, STATUS, CLAIM_KINDS, modesFor };
});
