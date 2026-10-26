#!/usr/bin/env node
/*
 * เครื่องทดสอบในเครื่อง: เสิร์ฟหน้าเว็บ + จำลอง Apps Script ด้วยโค้ด apps-script/*.gs จริง (ฐานข้อมูลในหน่วยความจำ)
 * ใช้ข้อมูล HS ตัวอย่างจาก tests/fixtures/source-db.json · ไม่เชื่อม Google จริง
 *   node scripts/dev-server.js [port]
 * บัญชีทดสอบ: Super Admin root / password-123 · Mini Super Admin (กำแพงเพชร) 0811111111
 */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createContext, Spreadsheet } = require('../tests/helpers/gas-mock');

const root = path.join(__dirname, '..');
const port = Number(process.argv[2] || 8085);
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'fixtures', 'source-db.json'), 'utf8'));
const env = createContext({ sources: { '178jFMiZLLsq4f1Juq2FADERx_mYs8bAB2yzdYa5cp-A': new Spreadsheet(fixture) } });
env.api.setup();

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.geojson': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/__api') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      env.api.resetRequestCache_();
      const out = req.method === 'POST' ? env.api.doPost({ postData: { contents: body } }) : env.api.doGet({ parameter: Object.fromEntries(url.searchParams) });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(out.text);
    });
    return;
  }
  if (url.pathname === '/site-config.js') {
    res.writeHead(200, { 'Content-Type': types['.js'] });
    res.end("window.HS_SITE_CONFIG=Object.freeze({apiEndpoint:'http://127.0.0.1:" + port + "/__api',sourceSheetUrl:'',riskMapUrl:'https://krit-pj.github.io/TH-Agri-Risk-Maps-Burning/',greenGainHubUrl:'https://krit-pj.github.io/Green_Gain_Hub-KPP/'});");
    return;
  }
  const file = path.normalize(path.join(root, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log('preview http://127.0.0.1:' + port + '/'));
