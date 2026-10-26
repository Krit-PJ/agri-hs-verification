#!/usr/bin/env node
/* รวมไฟล์ apps-script/*.gs เป็นไฟล์เดียว (docs/AppsScript-v30-All.gs) สำหรับคัดลอกไปวางใน Apps Script Editor */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ORDER = ['Config.gs', 'Utils.gs', 'Db.gs', 'Setup.gs', 'Audit.gs', 'Auth.gs', 'Accounts.gs', 'Hotspots.gs', 'Verification.gs', 'Code.gs'];
const dir = path.join(__dirname, '..', 'apps-script');
function bundle() {
  return '/* ไฟล์รวมอัตโนมัติจาก apps-script/ — อย่าแก้ไฟล์นี้โดยตรง (npm run bundle)\n * วางไฟล์นี้เป็น Code.gs ใน Apps Script แล้วสร้าง Secrets.gs จาก apps-script/Secrets.example.gs */\n\n'
    + ORDER.map(f => '/* ===== ' + f + ' ===== */\n' + fs.readFileSync(path.join(dir, f), 'utf8').trim() + '\n').join('\n');
}
module.exports = { bundle, ORDER, target: path.join(__dirname, '..', 'docs', 'AppsScript-v30-All.gs') };
if (require.main === module) { fs.writeFileSync(module.exports.target, bundle()); console.log('wrote', module.exports.target); }
