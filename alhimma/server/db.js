'use strict';
/* قاعدة بيانات JSON محلية: ملف واحد للمحتوى + مجلد للنصوص المستوردة + مجلد للجلسات + نسخ احتياطية.
 * الكتابة ذرية (ملف مؤقت ثم إعادة تسمية) حتى لا يتلف الملف عند انقطاع مفاجئ. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Catalog = require('../shared/catalog.js');

const COLLECTIONS = ['categories', 'persons', 'sources', 'claims', 'events', 'places', 'terms',
  'questions', 'imports', 'documents', 'teams', 'competitions', 'results'];

function uid(prefix) {
  return (prefix || 'id') + '_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
}

function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

class DB {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'db.json');
    this.docsDir = path.join(dir, 'documents');
    this.sessionsDir = path.join(dir, 'sessions');
    this.backupsDir = path.join(dir, 'backups');
    for (const d of [dir, this.docsDir, this.sessionsDir, this.backupsDir]) fs.mkdirSync(d, { recursive: true });
    this.load();
  }

  empty() {
    const data = { version: 1, meta: { createdAt: new Date().toISOString() }, settings: { demoInPlay: true } };
    for (const c of COLLECTIONS) data[c] = [];
    data.categories = Catalog.DEFAULT_CATEGORIES.map((c) => ({ ...c }));
    return data;
  }

  load() {
    if (fs.existsSync(this.file)) {
      this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      for (const c of COLLECTIONS) if (!Array.isArray(this.data[c])) this.data[c] = [];
      this.data.settings = this.data.settings || { demoInPlay: true };
    } else {
      this.data = this.empty();
      this.save();
    }
  }

  save() {
    this.data.meta.updatedAt = new Date().toISOString();
    writeAtomic(this.file, JSON.stringify(this.data, null, 1));
  }

  list(col) { return this.data[col]; }
  get(col, id) { return this.data[col].find((x) => x.id === id) || null; }

  insert(col, obj, prefix) {
    const now = new Date().toISOString();
    const rec = { id: obj.id || uid(prefix || col.slice(0, 3)), ...obj, createdAt: obj.createdAt || now, updatedAt: now };
    this.data[col].push(rec);
    this.save();
    return rec;
  }

  insertMany(col, arr, prefix) {
    const now = new Date().toISOString();
    const out = arr.map((obj) => ({ id: obj.id || uid(prefix || col.slice(0, 3)), ...obj, createdAt: obj.createdAt || now, updatedAt: now }));
    this.data[col].push(...out);
    this.save();
    return out;
  }

  update(col, id, patch) {
    const rec = this.get(col, id);
    if (!rec) return null;
    delete patch.id; delete patch.createdAt;
    Object.assign(rec, patch, { updatedAt: new Date().toISOString() });
    this.save();
    return rec;
  }

  remove(col, id) {
    const i = this.data[col].findIndex((x) => x.id === id);
    if (i < 0) return false;
    this.data[col].splice(i, 1);
    this.save();
    return true;
  }

  /* نصوص الكتب المستوردة تُحفظ منفصلة لأنها كبيرة */
  saveDocumentText(id, pages) { writeAtomic(path.join(this.docsDir, id + '.json'), JSON.stringify(pages)); }
  loadDocumentText(id) {
    const f = path.join(this.docsDir, path.basename(id) + '.json');
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : [];
  }
  removeDocumentText(id) {
    const f = path.join(this.docsDir, path.basename(id) + '.json');
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  /* الجلسات */
  saveSession(s) { writeAtomic(path.join(this.sessionsDir, s.id + '.json'), JSON.stringify(s)); }
  loadSessions() {
    return fs.readdirSync(this.sessionsDir).filter((f) => f.endsWith('.json')).map((f) => {
      try { return JSON.parse(fs.readFileSync(path.join(this.sessionsDir, f), 'utf8')); } catch { return null; }
    }).filter(Boolean);
  }
  removeSession(id) {
    const f = path.join(this.sessionsDir, path.basename(id) + '.json');
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  /* النسخ الاحتياطي: لقطة كاملة تشمل نصوص الكتب */
  snapshot() {
    const docs = {};
    for (const d of this.data.documents) docs[d.id] = this.loadDocumentText(d.id);
    return { kind: 'himma-backup', version: 1, exportedAt: new Date().toISOString(), data: JSON.parse(JSON.stringify(this.data)), documentsText: docs };
  }

  backupToDisk(label) {
    const name = 'backup-' + new Date().toISOString().replace(/[:.]/g, '-') + (label ? '-' + label : '') + '.json';
    writeAtomic(path.join(this.backupsDir, name), JSON.stringify(this.snapshot()));
    return name;
  }

  listBackups() {
    return fs.readdirSync(this.backupsDir).filter((f) => f.endsWith('.json')).sort().reverse().map((f) => ({
      name: f, size: fs.statSync(path.join(this.backupsDir, f)).size,
    }));
  }

  readBackup(name) {
    const f = path.join(this.backupsDir, path.basename(name));
    if (!fs.existsSync(f)) return null;
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  }

  /** الاستعادة: تحقق من البنية، ثم نسخة احتياطية تلقائية للحالة الحالية، ثم الاستبدال */
  restore(snap) {
    if (!snap || snap.kind !== 'himma-backup' || !snap.data || typeof snap.data !== 'object') {
      throw new Error('الملف ليس نسخة احتياطية صالحة لمنصة الهمّة');
    }
    for (const c of COLLECTIONS) {
      if (snap.data[c] != null && !Array.isArray(snap.data[c])) throw new Error('بنية غير صالحة في: ' + c);
    }
    const before = this.backupToDisk('before-restore');
    this.data = snap.data;
    for (const c of COLLECTIONS) if (!Array.isArray(this.data[c])) this.data[c] = [];
    this.data.meta = this.data.meta || {};
    this.data.settings = this.data.settings || { demoInPlay: true };
    for (const [id, pages] of Object.entries(snap.documentsText || {})) this.saveDocumentText(id, pages);
    this.save();
    return before;
  }
}

module.exports = { DB, uid, COLLECTIONS, writeAtomic };
