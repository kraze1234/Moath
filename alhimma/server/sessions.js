'use strict';
/* المسابقة الجماعية المباشرة: جلسات برمز دخول، فرق، جولات، مؤقت، نقاط، إيقاف واستئناف، بث مباشر (SSE).
 * تُحفظ حالة كل جلسة على القرص بعد كل تغيير، فيمكن استكمالها بعد إعادة تشغيل الخادم. */
const crypto = require('crypto');
const Catalog = require('../shared/catalog.js');
const Engine = require('../shared/engine.js');
const { uid } = require('./db.js');

const TEAM_COLORS = ['#c9a24a', '#2f7a5b', '#a5483a', '#6f7fa8', '#8a6d3b', '#4f8c8c', '#7a5c8e', '#b5763a'];
const PHASE_NAMES = { lobby: 'الانتظار', intro: 'تقديم الجولة', betting: 'المراهنة', question: 'السؤال', locked: 'انتهى الوقت', revealed: 'الإجابة', finished: 'النهاية' };

class SessionManager {
  constructor(db, kb) {
    this.db = db; this.kb = kb;
    this.sessions = new Map();
    this.clients = new Map(); // sessionId -> Set<{res, role, playerId}>
    this.timers = new Map();
    for (const s of db.loadSessions()) {
      this.sessions.set(s.id, s);
      if (s.status === 'running' && s.phase === 'question' && s.current && s.current.deadline) this.armTimer(s);
    }
    this.keepAlive = setInterval(() => {
      for (const set of this.clients.values()) for (const c of set) { try { c.res.write(': ping\n\n'); } catch {} }
    }, 20000);
    this.keepAlive.unref();
  }

  newCode() {
    const active = new Set([...this.sessions.values()].filter((s) => s.status !== 'finished').map((s) => s.code));
    for (let i = 0; i < 1000; i++) {
      const c = String(crypto.randomInt(1000, 10000));
      if (!active.has(c)) return c;
    }
    throw new Error('تعذر توليد رمز جلسة');
  }

  list() {
    return [...this.sessions.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((s) => ({
      id: s.id, code: s.code, name: s.name, status: s.status, phase: s.phase, createdAt: s.createdAt, answerMode: s.answerMode,
      teams: s.teams.map((t) => ({ name: t.name, score: t.score })),
    }));
  }

  get(id) { return this.sessions.get(id) || null; }
  byCode(code) { return [...this.sessions.values()].find((s) => s.code === String(code) && s.status !== 'finished') || null; }

  /** إنشاء جلسة: { name, answerMode: 'screen'|'phones', teams:[names|{name,color}], rounds:[{type,count,difficulty,timer,branch,categories}] } */
  create(opts) {
    const teams = (opts.teams || []).map((t, i) => {
      const name = typeof t === 'string' ? t : t.name;
      return { id: 't' + (i + 1), name: String(name || 'فريق ' + (i + 1)).slice(0, 40), color: (t && t.color) || TEAM_COLORS[i % TEAM_COLORS.length], score: 0 };
    });
    if (teams.length < 1) throw new Error('أضف فريقًا واحدًا على الأقل (أو لاعبًا فرديًا)');
    if (teams.length > 12) throw new Error('الحد الأعلى 12 فريقًا');
    const plan = (opts.rounds && opts.rounds.length ? opts.rounds : Catalog.GRAND_PLAN).map((r) => {
      const rt = Catalog.ROUND_TYPES[r.type] || Catalog.ROUND_TYPES.standard;
      return {
        type: Catalog.ROUND_TYPES[r.type] ? r.type : 'standard', title: r.title || rt.title,
        count: Math.max(1, Math.min(30, parseInt(r.count, 10) || 3)),
        timer: Math.max(5, Math.min(300, parseInt(r.timer, 10) || rt.timer)),
        multiplier: r.multiplier || rt.multiplier || 1,
        difficulty: Array.isArray(r.difficulty) && r.difficulty.length ? r.difficulty.map(Number) : [1, 2, 3],
        modes: r.modes && r.modes.length ? r.modes : Catalog.modesFor(rt.modes),
        categories: r.categories && r.categories.length ? r.categories : null,
        risk: !!rt.risk, speedBonus: !!rt.speedBonus, questionIds: [],
      };
    });
    const s = {
      id: uid('ses'), code: this.newCode(), name: String(opts.name || 'مسابقة الهمّة').slice(0, 80),
      answerMode: opts.answerMode === 'phones' ? 'phones' : 'screen',
      status: 'lobby', phase: 'lobby', teams, players: [], rounds: plan, ri: -1, qi: -1, current: null,
      used: [], history: [], log: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    this.sessions.set(s.id, s);
    this.persist(s, 'أُنشئت الجلسة');
    return s;
  }

  remove(id) {
    this.clearTimer(id);
    this.sessions.delete(id);
    this.db.removeSession(id);
  }

  persist(s, logText) {
    if (logText) s.log.push({ at: new Date().toISOString(), text: logText });
    if (s.log.length > 400) s.log = s.log.slice(-400);
    s.updatedAt = new Date().toISOString();
    this.db.saveSession(s);
    this.broadcast(s);
  }

  /* ===== اختيار الأسئلة: معتمدة فقط، بلا تكرار داخل الجلسة، مع تخفيف الشروط تدريجيًا إن قلّت ===== */
  pickQuestions(s, round) {
    const used = new Set(s.used.concat(s.rounds.flatMap((r) => r.questionIds)));
    const all = this.db.data.questions.filter((q) => this.kb.usable(q) && !used.has(q.id));
    const inCats = (q) => !round.categories || (q.categories || []).some((c) => round.categories.includes(c));
    const tiers = [
      (q) => round.modes.includes(q.mode) && round.difficulty.includes(q.difficulty) && inCats(q),
      (q) => round.modes.includes(q.mode) && inCats(q),
      (q) => round.difficulty.includes(q.difficulty) && inCats(q),
      (q) => inCats(q),
    ];
    const picked = [];
    for (const t of tiers) {
      for (const q of Engine.shuffle(all.filter(t))) {
        if (picked.length >= round.count) break;
        if (!picked.includes(q)) picked.push(q);
      }
      if (picked.length >= round.count) break;
    }
    // تدرج الصعوبة داخل الجولة
    picked.sort((a, b) => a.difficulty - b.difficulty);
    return picked.map((q) => q.id);
  }

  /* ===== المؤقت ===== */
  clearTimer(id) { const t = this.timers.get(id); if (t) clearTimeout(t); this.timers.delete(id); }
  armTimer(s) {
    this.clearTimer(s.id);
    const ms = s.current.deadline - Date.now();
    if (ms <= 0) { this.lock(s, 'انتهى الوقت'); return; }
    const t = setTimeout(() => { if (s.phase === 'question' && s.status === 'running') this.lock(s, 'انتهى الوقت'); }, ms + 300);
    t.unref && t.unref();
    this.timers.set(s.id, t);
  }

  lock(s, why) {
    if (s.phase !== 'question') return;
    this.clearTimer(s.id);
    s.phase = 'locked';
    s.current.remainingMs = 0;
    this.persist(s, why || 'أُغلقت الإجابات');
  }

  round(s) { return s.rounds[s.ri] || null; }

  showQuestion(s) {
    const r = this.round(s);
    const qid = r.questionIds[s.qi];
    const q = this.db.get('questions', qid);
    if (!q) { s.phase = 'revealed'; s.current = { qid, missing: true, answers: {} }; return; }
    const prepared = Engine.prepare(q, s.id + ':' + qid);
    s.current = Object.assign(s.current || {}, {
      qid, q: prepared, startedAt: Date.now(), deadline: Date.now() + r.timer * 1000, remainingMs: null,
      clueStep: 1, revealed: [], answers: {}, bets: (s.current && s.current.bets) || {},
      turnTeamId: s.answerMode === 'screen' ? s.teams[(s.history.length) % s.teams.length].id : null,
    });
    s.phase = 'question';
    if (!s.used.includes(qid)) s.used.push(qid);
    this.armTimer(s);
  }

  /** حساب نتيجة فريق لسؤال */
  score(s, q, answer, teamId, meta) {
    const r = this.round(s);
    const g = Engine.grade(q, answer);
    let pts;
    if (r.risk) {
      const bet = (s.current.bets && s.current.bets[teamId]) || 0;
      pts = g.correct ? bet : -bet;
    } else {
      const aug = q.type === 'reveal' ? { used: meta.clueStep } : q.type === 'card' ? { revealed: meta.revealed } : null;
      const speedFactor = r.speedBonus && meta.remainingMs != null ? meta.remainingMs / (r.timer * 1000) : 0;
      pts = Engine.points(q, g.fraction, { multiplier: r.multiplier, answer: aug, speedFactor });
    }
    return { fraction: g.fraction, correct: g.correct, detail: g.detail, points: pts };
  }

  /** كشف الإجابة: تطبيق النقاط وحفظ السجل */
  reveal(s) {
    this.clearTimer(s.id);
    const c = s.current;
    const entry = { qid: c.qid, ri: s.ri, qi: s.qi, results: {} };
    for (const [teamId, a] of Object.entries(c.answers || {})) {
      if (!a.result) continue;
      const t = s.teams.find((x) => x.id === teamId);
      if (t) { t.score += a.result.points; entry.results[teamId] = a.result.points; }
    }
    s.history.push(entry);
    if (c.q) {
      const q = this.db.get('questions', c.qid);
      c.learn = q ? this.kb.learnFor(q) : null;
      c.citations = q ? this.kb.citationsFor((q.refs || {}).claimIds) : [];
      if (q) { q.usedCount = (q.usedCount || 0) + 1; this.db.save(); }
    }
    s.phase = 'revealed';
  }

  /** إجراء من المشرف */
  action(id, a) {
    const s = this.get(id);
    if (!s) throw new Error('الجلسة غير موجودة');
    const type = a && a.type;
    const r = this.round(s);
    const c = s.current;
    const team = a.teamId ? s.teams.find((t) => t.id === a.teamId) : null;
    if (a.teamId && !team) throw new Error('الفريق غير موجود');
    switch (type) {
      case 'start': {
        if (s.status !== 'lobby') throw new Error('بدأت المسابقة مسبقًا');
        s.status = 'running';
        return this.goRound(s, 0);
      }
      case 'next': {
        if (s.status === 'paused') throw new Error('المسابقة متوقفة مؤقتًا');
        if (s.status === 'finished') throw new Error('انتهت المسابقة');
        if (s.status === 'lobby') { s.status = 'running'; return this.goRound(s, 0); }
        if (s.phase === 'intro' || s.phase === 'revealed') return this.goNextQuestion(s);
        if (s.phase === 'betting') { this.showQuestion(s); return this.persist(s, 'عُرض السؤال'); }
        if (s.phase === 'question') return this.lock(s, 'أغلق المشرف الإجابات');
        if (s.phase === 'locked') { this.reveal(s); return this.persist(s, 'كُشفت الإجابة'); }
        return;
      }
      case 'reveal': {
        if (s.phase !== 'question' && s.phase !== 'locked') throw new Error('لا يوجد سؤال مفتوح');
        this.reveal(s);
        return this.persist(s, 'كُشفت الإجابة');
      }
      case 'clue': {
        if (s.phase !== 'question' || !c.q || c.q.type !== 'reveal') throw new Error('لا توجد تلميحات لهذا السؤال');
        c.clueStep = Math.min(c.q.data.clues.length, (c.clueStep || 1) + 1);
        return this.persist(s, 'كُشف تلميح جديد');
      }
      case 'segment': {
        if (s.phase !== 'question' || !c.q || c.q.type !== 'card') throw new Error('لا توجد بطاقة لهذا السؤال');
        const i = parseInt(a.index, 10);
        if (!(i >= 0 && i < c.q.data.segments.length)) throw new Error('جزء غير صالح');
        if (!c.revealed.includes(i)) c.revealed.push(i);
        return this.persist(s, 'كُشف جزء من البطاقة');
      }
      case 'pause': {
        if (s.status !== 'running') throw new Error('المسابقة ليست قيد التشغيل');
        s.status = 'paused';
        if (s.phase === 'question' && c) { c.remainingMs = Math.max(0, c.deadline - Date.now()); this.clearTimer(s.id); }
        return this.persist(s, 'إيقاف مؤقت');
      }
      case 'resume': {
        if (s.status !== 'paused') throw new Error('المسابقة ليست متوقفة');
        s.status = 'running';
        if (s.phase === 'question' && c && c.remainingMs != null) { c.deadline = Date.now() + c.remainingMs; c.remainingMs = null; this.armTimer(s); }
        return this.persist(s, 'استئناف');
      }
      case 'skip': {
        if (!c || !['question', 'locked', 'betting'].includes(s.phase)) throw new Error('لا يوجد سؤال لتجاوزه');
        this.clearTimer(s.id);
        s.history.push({ qid: c.qid, ri: s.ri, qi: s.qi, results: {}, skipped: true });
        s.phase = 'revealed'; c.skipped = true;
        return this.goNextQuestion(s, 'تُجووز السؤال');
      }
      case 'cancel': {
        // إلغاء السؤال الحالي وإرجاع أي نقاط مُنحت عليه
        if (!c) throw new Error('لا يوجد سؤال لإلغائه');
        this.clearTimer(s.id);
        const h = s.history.find((x) => x.qid === c.qid && x.ri === s.ri && x.qi === s.qi);
        if (h) {
          for (const [tid, p] of Object.entries(h.results)) { const t = s.teams.find((x) => x.id === tid); if (t) t.score -= p; }
          h.results = {}; h.cancelled = true;
        } else s.history.push({ qid: c.qid, ri: s.ri, qi: s.qi, results: {}, cancelled: true });
        c.cancelled = true; s.phase = 'revealed';
        return this.persist(s, 'أُلغي السؤال وأُعيدت نقاطه');
      }
      case 'adjust': {
        const delta = parseInt(a.delta, 10);
        if (!team || !delta) throw new Error('حدد الفريق ومقدار التعديل');
        team.score += delta;
        return this.persist(s, 'تعديل يدوي: ' + team.name + ' ' + (delta > 0 ? '+' : '') + delta + (a.reason ? ' (' + String(a.reason).slice(0, 80) + ')' : ''));
      }
      case 'turn': {
        if (!team) throw new Error('حدد الفريق');
        if (c) c.turnTeamId = team.id;
        return this.persist(s);
      }
      case 'screenAnswer': {
        // وضع الشاشة الواحدة: الفريق صاحب الدور يجيب على الشاشة المشتركة
        if (!['question', 'locked'].includes(s.phase)) throw new Error('لا يوجد سؤال مفتوح');
        const tid = (team || {}).id || c.turnTeamId;
        if (!tid) throw new Error('حدد الفريق المجيب');
        c.answers[tid] = { answer: a.answer, at: Date.now(), by: 'screen', result: this.score(s, c.q, a.answer, tid, this.meta(s)) };
        this.lock(s, 'أجاب ' + s.teams.find((t) => t.id === tid).name);
        this.reveal(s);
        return this.persist(s, 'كُشفت الإجابة');
      }
      case 'award': {
        // منح يدوي بعد السؤال (مثل الإجابة الشفهية): fraction من 0 إلى 1
        if (!team || !c || !c.q) throw new Error('حدد الفريق');
        const fraction = Math.max(0, Math.min(1, Number(a.fraction == null ? 1 : a.fraction)));
        const pts = r && r.risk ? (fraction === 1 ? 1 : -1) * ((c.bets || {})[team.id] || 0) : Engine.points(c.q, fraction, { multiplier: r ? r.multiplier : 1 });
        const prev = c.answers[team.id];
        c.answers[team.id] = { answer: null, at: Date.now(), by: 'moderator', result: { fraction, correct: fraction === 1, points: pts } };
        if (s.phase === 'revealed') {
          const h = s.history[s.history.length - 1];
          const old = (prev && prev.result && h && h.results[team.id]) || 0;
          team.score += pts - old;
          if (h) h.results[team.id] = pts;
        }
        return this.persist(s, 'منح يدوي: ' + team.name + ' ' + pts);
      }
      case 'bet': {
        if (!team) throw new Error('حدد الفريق');
        return this.placeBet(s, team, a.amount);
      }
      case 'setTeams': {
        if (s.status !== 'lobby') throw new Error('لا يمكن تعديل الفرق بعد البدء');
        const names = (a.teams || []).map((x) => String(x).trim()).filter(Boolean);
        if (!names.length) throw new Error('أضف فريقًا واحدًا على الأقل');
        s.teams = names.map((n, i) => ({ id: 't' + (i + 1), name: n.slice(0, 40), color: TEAM_COLORS[i % TEAM_COLORS.length], score: 0 }));
        return this.persist(s, 'عُدلت الفرق');
      }
      case 'kick': {
        s.players = s.players.filter((p) => p.id !== a.playerId);
        return this.persist(s, 'أُزيل مشارك');
      }
      case 'end': return this.finish(s);
      default: throw new Error('إجراء غير معروف');
    }
  }

  meta(s) {
    const c = s.current;
    return { clueStep: c.clueStep || 1, revealed: (c.revealed || []).length, remainingMs: s.phase === 'question' ? Math.max(0, c.deadline - Date.now()) : 0 };
  }

  placeBet(s, team, amount) {
    if (s.phase !== 'betting') throw new Error('ليست مرحلة المراهنة');
    const max = Math.max(0, team.score);
    const bet = Math.max(0, Math.min(max, parseInt(amount, 10) || 0));
    s.current.bets = s.current.bets || {};
    s.current.bets[team.id] = bet;
    this.persist(s, team.name + ' راهن بـ ' + bet);
    return bet;
  }

  goRound(s, ri, logText) {
    if (ri >= s.rounds.length) return this.finish(s);
    s.ri = ri; s.qi = -1;
    const r = this.round(s);
    r.questionIds = this.pickQuestions(s, r);
    if (!r.questionIds.length) {
      s.log.push({ at: new Date().toISOString(), text: 'لا توجد أسئلة معتمدة كافية لـ ' + r.title + ' — تُجووزت' });
      return this.goRound(s, ri + 1);
    }
    s.phase = 'intro';
    s.current = null;
    return this.persist(s, logText || ('بدأت ' + r.title));
  }

  goNextQuestion(s, logText) {
    const r = this.round(s);
    if (!r) return this.finish(s);
    if (s.qi + 1 >= r.questionIds.length) return this.goRound(s, s.ri + 1, logText);
    s.qi++;
    s.current = { bets: {} };
    if (r.risk) {
      s.phase = 'betting';
      s.current.qid = r.questionIds[s.qi];
      const q = this.db.get('questions', s.current.qid);
      s.current.preview = q ? { difficulty: q.difficulty, mode: q.mode } : null;
      return this.persist(s, logText || 'مرحلة المراهنة');
    }
    this.showQuestion(s);
    return this.persist(s, logText || 'عُرض السؤال');
  }

  finish(s) {
    this.clearTimer(s.id);
    s.status = 'finished'; s.phase = 'finished';
    const ranked = s.teams.slice().sort((a, b) => b.score - a.score);
    const top = ranked.length ? ranked[0].score : 0;
    s.winners = ranked.filter((t) => t.score === top).map((t) => t.id);
    if (!this.db.data.results.some((r) => r.sessionId === s.id)) {
      this.db.insert('results', {
        sessionId: s.id, name: s.name, date: new Date().toISOString(), answerMode: s.answerMode,
        teams: ranked.map((t) => ({ name: t.name, score: t.score })), winners: ranked.filter((t) => t.score === top).map((t) => t.name),
        questions: s.history.filter((h) => !h.skipped && !h.cancelled).length, rounds: s.rounds.map((r) => r.title),
        players: s.players.length,
      }, 'res');
    }
    this.persist(s, 'انتهت المسابقة');
  }

  /* ===== المشاركون من الهواتف ===== */
  join(code, name, teamId) {
    const s = this.byCode(code);
    if (!s) throw new Error('رمز الجلسة غير صحيح أو انتهت الجلسة');
    const team = s.teams.find((t) => t.id === teamId);
    if (!team) throw new Error('اختر فريقًا');
    name = String(name || '').trim().slice(0, 30);
    if (!name) throw new Error('اكتب اسمك');
    if (s.players.length >= 200) throw new Error('اكتمل عدد المشاركين');
    const p = { id: uid('ply'), name, teamId, token: crypto.randomBytes(16).toString('hex'), joinedAt: new Date().toISOString() };
    s.players.push(p);
    this.persist(s, 'انضم ' + name + ' إلى ' + team.name);
    return { sessionId: s.id, playerId: p.id, token: p.token, teamId };
  }

  playerBy(s, token) { return token ? s.players.find((p) => p.token === token) || null : null; }

  answer(id, token, answer) {
    const s = this.get(id);
    if (!s) throw new Error('الجلسة غير موجودة');
    const p = this.playerBy(s, token);
    if (!p) throw new Error('انضم إلى الجلسة أولًا');
    if (s.status !== 'running' || s.phase !== 'question') throw new Error('الإجابات مغلقة الآن');
    const c = s.current;
    if (Date.now() > c.deadline + 1000) throw new Error('انتهى الوقت');
    if (c.answers[p.teamId]) throw new Error('أجاب فريقك مسبقًا');
    c.answers[p.teamId] = { answer, at: Date.now(), by: p.name, result: this.score(s, c.q, answer, p.teamId, this.meta(s)) };
    const team = s.teams.find((t) => t.id === p.teamId);
    // إذا أجابت كل الفرق تُغلق الإجابات تلقائيًا
    if (s.teams.every((t) => c.answers[t.id])) { this.lock(s, 'أجابت جميع الفرق'); }
    else this.persist(s, 'أجاب ' + team.name);
    return { ok: true };
  }

  bet(id, token, amount) {
    const s = this.get(id);
    if (!s) throw new Error('الجلسة غير موجودة');
    const p = this.playerBy(s, token);
    if (!p) throw new Error('انضم إلى الجلسة أولًا');
    return this.placeBet(s, s.teams.find((t) => t.id === p.teamId), amount);
  }

  /* ===== العرض ===== */
  view(s, role, playerId) {
    const c = s.current;
    const r = this.round(s);
    const base = {
      id: s.id, code: s.code, name: s.name, status: s.status, phase: s.phase, phaseName: PHASE_NAMES[s.phase], answerMode: s.answerMode,
      serverNow: Date.now(), teams: s.teams, winners: s.winners || null,
      round: r ? { index: s.ri, total: s.rounds.length, title: r.title, type: r.type, count: r.questionIds.length, timer: r.timer, risk: r.risk, multiplier: r.multiplier } : null,
      qi: s.qi, playersCount: s.players.length,
    };
    if (c) {
      base.current = {
        qid: c.qid, deadline: c.deadline, remainingMs: c.remainingMs, clueStep: c.clueStep, revealed: c.revealed, turnTeamId: c.turnTeamId,
        bets: c.bets || {}, preview: c.preview || null, skipped: !!c.skipped, cancelled: !!c.cancelled, missing: !!c.missing,
        answered: Object.keys(c.answers || {}),
      };
      if (c.q) {
        const showFull = role === 'host' || s.phase === 'revealed';
        base.current.q = showFull ? c.q : Engine.strip(c.q);
        if (s.phase === 'revealed') {
          base.current.answerText = Engine.answerText(c.q);
          base.current.learn = c.learn || null;
          base.current.citations = c.citations || [];
          base.current.results = Object.fromEntries(Object.entries(c.answers || {}).map(([k, v]) => [k, v.result]));
        }
        if (role === 'host') base.current.answers = c.answers;
      }
    }
    if (role === 'host') { base.players = s.players.map((p) => ({ id: p.id, name: p.name, teamId: p.teamId })); base.log = s.log.slice(-30); base.roundsPlan = s.rounds.map((x) => ({ title: x.title, count: x.count, n: x.questionIds.length })); }
    if (role === 'player') {
      const p = s.players.find((x) => x.id === playerId);
      base.me = p ? { id: p.id, name: p.name, teamId: p.teamId } : null;
      if (p && c && c.answers && c.answers[p.teamId]) base.myAnswer = { by: c.answers[p.teamId].by, answer: c.answers[p.teamId].answer };
    }
    return base;
  }

  subscribe(s, res, role, playerId) {
    if (!this.clients.has(s.id)) this.clients.set(s.id, new Set());
    const client = { res, role, playerId };
    this.clients.get(s.id).add(client);
    res.write('data: ' + JSON.stringify(this.view(s, role, playerId)) + '\n\n');
    return () => { const set = this.clients.get(s.id); if (set) set.delete(client); };
  }

  broadcast(s) {
    const set = this.clients.get(s.id);
    if (!set) return;
    for (const c of set) {
      try { c.res.write('data: ' + JSON.stringify(this.view(s, c.role, c.playerId)) + '\n\n'); } catch {}
    }
  }

  close() {
    clearInterval(this.keepAlive);
    for (const id of this.timers.keys()) this.clearTimer(id);
    for (const set of this.clients.values()) for (const c of set) { try { c.res.end(); } catch {} }
  }
}

module.exports = { SessionManager, TEAM_COLORS };
