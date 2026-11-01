// ทดสอบ ปิดระบบทริป + ล้างข้อมูลทริป (v271) — รัน: node backend/test/trip-purge.test.mjs
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tpg-'));
fs.writeFileSync(path.join(TMP, 'package.json'), '{"type":"module"}');
for (const f of fs.readdirSync(SRC)) if (f.endsWith('.js')) fs.copyFileSync(path.join(SRC, f), path.join(TMP, f));
const worker = (await import(pathToFileURL(path.join(TMP, 'index.js')).href)).default;
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE Users (user_id TEXT PRIMARY KEY, family_id TEXT NOT NULL, name TEXT NOT NULL, email TEXT, line_user_id TEXT UNIQUE, role TEXT, password TEXT, created_at DATETIME, ledger_mode TEXT DEFAULT 'MAIN');
CREATE TABLE Entities (entity_id TEXT PRIMARY KEY, family_id TEXT, name TEXT, is_company INTEGER);
CREATE TABLE UserPermissions (user_id TEXT, entity_id TEXT, PRIMARY KEY (user_id, entity_id));
CREATE TABLE Accounts (account_id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, name TEXT NOT NULL, bank_name TEXT, account_number TEXT, balance REAL DEFAULT 0, created_at DATETIME, pdf_password TEXT, account_type TEXT DEFAULT 'BANK', credit_limit REAL DEFAULT 0, statement_day INTEGER, due_day INTEGER);
CREATE TABLE Transactions (transaction_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, ref_code TEXT, date TEXT NOT NULL, time TEXT, total_amount REAL NOT NULL, statement_desc TEXT, status TEXT, source TEXT, slip_image_url TEXT, created_by_user_id TEXT, created_at DATETIME);
CREATE TABLE TransactionDetails (detail_id TEXT PRIMARY KEY, transaction_id TEXT NOT NULL, amount REAL NOT NULL, fee REAL DEFAULT 0, wht REAL DEFAULT 0, category_id TEXT, entity_id TEXT, contact_id TEXT, project_id TEXT, note TEXT, type TEXT);
CREATE TABLE Categories (category_id TEXT PRIMARY KEY, family_id TEXT, caption_id TEXT, name TEXT);
CREATE TABLE Contacts (contact_id TEXT PRIMARY KEY, family_id TEXT, name TEXT);
CREATE TABLE Sessions (token_hash TEXT PRIMARY KEY, user_id TEXT, expires_at TEXT);
INSERT INTO Users VALUES ('North','F1','North',NULL,NULL,'admin',NULL,NULL,'MAIN'),('Puii','F1','Puii',NULL,NULL,'member',NULL,NULL,'MAIN');
INSERT INTO Entities VALUES ('E_N','F1','North',0),('E_P','F1','Puii',0);
INSERT INTO UserPermissions VALUES ('North','E_N'),('North','E_P'),('Puii','E_P');
INSERT INTO Accounts (account_id,entity_id,name,account_type) VALUES ('KB','E_N','[A02] KBank','BANK'),('SCB','E_N','[A03] SCB','BANK'),('CASH','E_N','[A01] เงินสด','CASH'),('PA','E_P','[P1] Puii Bank','BANK');
INSERT INTO Categories VALUES ('Bank_Transfer','F1','CapAsset','Bank Transfer'),('Food','F1','CapExp','อาหาร');
INSERT INTO Transactions (transaction_id,account_id,date,time,total_amount,status) VALUES
 ('o1','KB','2026-10-01','10:00:00',-5000,'PENDING_REVIEW'),('i1','SCB','2026-10-01','10:01:00',5000,'PENDING_REVIEW'),
 ('i1b','SCB','2026-10-03','09:00:00',5000,'PENDING_REVIEW'),
 ('o2','KB','2026-10-05','12:00:00',-300,'PENDING_REVIEW'),('i2','KB','2026-10-05','12:00:00',300,'PENDING_REVIEW'),
 ('o3','KB','2026-10-10','08:00:00',-2000,'PENDING_REVIEW'),('i3','SCB','2026-10-20','08:00:00',2000,'PENDING_REVIEW'),
 ('o4','KB','2026-10-12','08:00:00',-1000,'PENDING_REVIEW'),('o5','KB','2026-10-15','08:00:00',-700,'PENDING_REVIEW'),('i5','SCB','2026-10-16',NULL,700,'PENDING_REVIEW'),
 ('o6','KB','2026-10-18','08:00:00',-450,'PENDING_REVIEW'),('pp','PA','2026-10-01','10:00:00',5001,'PENDING_REVIEW');
INSERT INTO TransactionDetails (detail_id,transaction_id,amount,category_id,type,project_id) VALUES ('d_o1','o1',-5000,'Food','EXPENSE','TRP-1'),('d_o2','o2',-300,'Food','EXPENSE','PRJ-OFFICE');
CREATE TABLE Projects (project_id TEXT PRIMARY KEY, family_id TEXT, name TEXT, status TEXT);
INSERT INTO Projects VALUES ('TRP-1','F1','Hokkaido','active'),('TRP-2','F1','Swiss','active'),('PRJ-OFFICE','F1','ออฟฟิศ','active');
CREATE TABLE TripStops (stop_id TEXT, project_id TEXT); INSERT INTO TripStops VALUES ('s1','TRP-1'),('s2','TRP-2');
CREATE TABLE TripExpenses (trip_expense_id TEXT, project_id TEXT, amount REAL); INSERT INTO TripExpenses VALUES ('e1','TRP-1',100);
CREATE TABLE TripMembers (member_id TEXT, project_id TEXT); INSERT INTO TripMembers VALUES ('m1','TRP-1');
CREATE TABLE TripHoldingAccounts (wallet_id TEXT, account_id TEXT); INSERT INTO TripHoldingAccounts VALUES ('w1','THA-w1');
CREATE TABLE Settlements (id TEXT); INSERT INTO Settlements VALUES ('keep');
INSERT INTO Accounts (account_id,entity_id,name,account_type) VALUES ('THA-w1','E_N','🔒 wallet','TRIP_HOLDING'),('THA-used','E_N','🔒 used','TRIP_HOLDING');
INSERT INTO Transactions (transaction_id,account_id,date,total_amount,status,created_by_user_id) VALUES ('th','THA-used','2026-01-01',-1,'CONFIRMED','North'),('gx','KB','2026-01-01',-1,'CONFIRMED','Guest2');
INSERT INTO Users (user_id,family_id,name,role,ledger_mode) VALUES ('Guest1','F1','Guest1','member','TRIP_ONLY'),('Guest2','F1','Guest2','member','TRIP_ONLY');`);
const toD1 = sql => { const st = { _args: [], bind(...a) { st._args = a; return st; }, async first() { return db.prepare(sql).get(...st._args) ?? null; }, async all() { return { results: db.prepare(sql).all(...st._args) }; }, async run() { const r = db.prepare(sql).run(...st._args); return { meta: { changes: Number(r.changes) } }; } }; return st; };
const env = { DB: { prepare: toD1, batch: async ops => { for (const o of ops) await o.run(); } } };
const hashTok = async t => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t))).toString('base64url');
for (const u of ['North', 'Puii']) db.prepare(`INSERT INTO Sessions VALUES (?,?,?)`).run(await hashTok(`tok-${u}`), u, '2099-01-01T00:00:00Z');
const call = async (p, user, body) => { const res = await worker.fetch(new Request('https://w.test' + p, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer tok-${user}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env, {}); let j = null; try { j = await res.json(); } catch {} return { s: res.status, j }; };
let ok = 0, bad = 0; const check = (n, c, x) => { if (c) ok++; else { bad++; console.log('  ❌', n, JSON.stringify(x)?.slice(0, 300)); } };
const n = sql => db.prepare(sql).get().n;
const before = n(`SELECT COUNT(*) n FROM Transactions`);

// API ทริปปิดแล้ว
for (const p of ['/api/trips', '/api/travel?projectId=TRP-1', '/api/trip-stops', '/api/trips/fund', '/api/wallets', '/api/unified-trip/x']) { const r = await call(p, 'North'); check('410 ' + p, r.s === 410, r); }
const okRoute = await call('/api/transfers/suggest', 'North'); check('route อื่นยังทำงาน', okRoute.s === 200, okRoute);

// สิทธิ์
check('member ห้าม', (await call('/api/admin/trip-purge', 'Puii')).s === 403);
const pv = await call('/api/admin/trip-purge', 'North');
check('preview นับ', pv.s === 200 && pv.j.counts.TripStops === 2 && pv.j.counts.Projects === 2 && pv.j.counts['Accounts (TRIP_HOLDING)'] === 1 && pv.j.counts['Users (TRIP_ONLY)'] === 1 && pv.j.linked_details === 1, pv.j);
check('preview ไม่ลบ', n(`SELECT COUNT(*) n FROM TripStops`) === 2);
check('ต้องยืนยัน', (await call('/api/admin/trip-purge', 'North', { confirm: 'x' })).s === 400);

const r = await call('/api/admin/trip-purge', 'North', { confirm: 'ลบทริป' });
check('ลบสำเร็จ', r.s === 200 && r.j.success, r.j);
check('สำรองครบ', r.j.backup.tables.TripStops.length === 2 && r.j.backup.projects.length === 2 && r.j.backup.tables.TripExpenses[0].amount === 100, r.j.backup);
for (const t of ['TripStops', 'TripExpenses', 'TripMembers', 'TripHoldingAccounts']) check('ว่าง ' + t, n(`SELECT COUNT(*) n FROM ${t}`) === 0);
check('Projects ทริปหาย เหลือโปรเจกต์อื่น', db.prepare(`SELECT group_concat(project_id) g FROM Projects`).get().g === 'PRJ-OFFICE');
check('รายการบัญชีครบ', n(`SELECT COUNT(*) n FROM Transactions`) === before);
check('ตัด project ทริปออกจากรายการ', db.prepare(`SELECT project_id p FROM TransactionDetails WHERE detail_id='d_o1'`).get().p === null);
check('project อื่นไม่แตะ', db.prepare(`SELECT project_id p FROM TransactionDetails WHERE detail_id='d_o2'`).get().p === 'PRJ-OFFICE');
check('บัญชี holding ที่มีรายการยังอยู่', !!db.prepare(`SELECT 1 x FROM Accounts WHERE account_id='THA-used'`).get() && !db.prepare(`SELECT 1 x FROM Accounts WHERE account_id='THA-w1'`).get());
check('ผู้ใช้ TRIP_ONLY ที่เคยบันทึกยังอยู่', !!db.prepare(`SELECT 1 x FROM Users WHERE user_id='Guest2'`).get() && !db.prepare(`SELECT 1 x FROM Users WHERE user_id='Guest1'`).get());
check('ผู้ใช้ปกติอยู่', n(`SELECT COUNT(*) n FROM Users WHERE ledger_mode='MAIN' OR ledger_mode IS NULL`) === 2);
check('Settlements ไม่แตะ', n(`SELECT COUNT(*) n FROM Settlements`) === 1);
const again = await call('/api/admin/trip-purge', 'North'); check('รอบสองไม่มีอะไรเหลือ', again.j.total === 0, again.j);

// 📱 QR บอท LINE: ใช้ basicId จริงจาก LINE
{ const L = await import(pathToFileURL(path.join(TMP, 'line-info.js')).href);
  const call2 = (e, f, user = 'u') => L.handleLineInfo({ url: new URL('https://w.test/api/line/bot-info'), env: e, cors: {}, authUserId: user, fetchImpl: f }).then(r => r.json());
  let seenAuth = '';
  const j = await call2({ LINE_CHANNEL_ACCESS_TOKEN: 'TKN' }, async (u, o) => { seenAuth = o.headers.Authorization; return { ok: true, status: 200, json: async () => ({ basicId: '@123abcde', displayName: 'RR Bot' }) }; });
  check('line basicId', j.ok && j.basicId === '@123abcde' && j.addUrl === 'https://line.me/R/ti/p/%40123abcde' && seenAuth === 'Bearer TKN', j);
  L._resetLineInfoCache();
  const e = await call2({ LINE_CHANNEL_ACCESS_TOKEN: 'BAD' }, async () => ({ ok: false, status: 401, json: async () => ({ message: 'Authentication failed' }) }));
  check('line token ผิด', !e.ok && /401/.test(e.error), e);
  const n = await call2({}, async () => { throw new Error('x'); }); check('line ไม่มี token', !n.ok, n);
  const un = await L.handleLineInfo({ url: new URL('https://w.test/api/line/bot-info'), env: {}, cors: {}, authUserId: '' }); check('line ต้องล็อกอิน', un.status === 401);
}
console.log(`trip-purge: ${ok} ผ่าน, ${bad} ไม่ผ่าน`); if (bad) process.exit(1);
