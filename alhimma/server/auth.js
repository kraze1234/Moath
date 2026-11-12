'use strict';
/* حماية لوحة الإدارة: كلمة مرور مشفرة بـ scrypt، وجلسة بملف تعريف ارتباط HttpOnly، وحدّ لمحاولات الدخول. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { writeAtomic } = require('./db.js');

const SESSION_HOURS = 12;

class Auth {
  constructor(dir) {
    this.file = path.join(dir, 'auth.json');
    this.tokens = new Map(); // token -> expiry
    this.attempts = new Map(); // ip -> {count, until}
    this.conf = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : null;
    if (!this.conf && process.env.HIMMA_ADMIN_PASSWORD) this.setPassword(process.env.HIMMA_ADMIN_PASSWORD);
  }

  isConfigured() { return !!(this.conf && this.conf.hash); }

  setPassword(pw) {
    if (typeof pw !== 'string' || pw.length < 8) throw new Error('كلمة المرور يجب ألا تقل عن 8 أحرف');
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
    this.conf = { salt, hash, updatedAt: new Date().toISOString() };
    writeAtomic(this.file, JSON.stringify(this.conf));
    this.tokens.clear();
  }

  verify(pw) {
    if (!this.isConfigured() || typeof pw !== 'string') return false;
    const h = crypto.scryptSync(pw, this.conf.salt, 64);
    const ref = Buffer.from(this.conf.hash, 'hex');
    return h.length === ref.length && crypto.timingSafeEqual(h, ref);
  }

  blocked(ip) {
    const a = this.attempts.get(ip);
    return a && a.until && a.until > Date.now();
  }

  login(ip, pw) {
    if (this.blocked(ip)) return { ok: false, error: 'محاولات كثيرة. حاول بعد دقائق.' };
    if (!this.verify(pw)) {
      const a = this.attempts.get(ip) || { count: 0 };
      a.count++;
      if (a.count >= 5) { a.until = Date.now() + 5 * 60 * 1000; a.count = 0; }
      this.attempts.set(ip, a);
      return { ok: false, error: 'كلمة المرور غير صحيحة' };
    }
    this.attempts.delete(ip);
    const token = crypto.randomBytes(32).toString('hex');
    this.tokens.set(token, Date.now() + SESSION_HOURS * 3600 * 1000);
    return { ok: true, token };
  }

  logout(token) { this.tokens.delete(token); }

  check(token) {
    if (!token) return false;
    const exp = this.tokens.get(token);
    if (!exp) return false;
    if (exp < Date.now()) { this.tokens.delete(token); return false; }
    return true;
  }

  cookie(token, maxAge) {
    return 'himma_admin=' + token + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + (maxAge == null ? SESSION_HOURS * 3600 : maxAge);
  }
}

function readCookie(req, name) {
  const h = req.headers.cookie || '';
  for (const part of h.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

module.exports = { Auth, readCookie };
