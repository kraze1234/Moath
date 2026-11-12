#!/usr/bin/env node
'use strict';
/* تشغيل منصة الهمّة: node server.js  (المنفذ الافتراضي 3000، أو PORT=8080 node server.js) */
const { createApp } = require('./server/app.js');

const port = parseInt(process.env.PORT, 10) || 3000;
const host = process.env.HOST || '0.0.0.0';
const { server, auth } = createApp({ dataDir: process.env.HIMMA_DATA || undefined });

server.listen(port, host, () => {
  const os = require('os');
  const lan = Object.values(os.networkInterfaces()).flat().filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => 'http://' + a.address + ':' + port);
  console.log('\n  منصة الهمّة تعمل الآن');
  console.log('  على هذا الجهاز:   http://localhost:' + port);
  for (const u of lan) console.log('  للهواتف على الشبكة: ' + u);
  console.log('  لوحة الإدارة:     http://localhost:' + port + '/admin' + (auth.isConfigured() ? '' : '  (أول دخول: أنشئ كلمة مرور المشرف)'));
  console.log('');
});
const stop = () => server.close(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
