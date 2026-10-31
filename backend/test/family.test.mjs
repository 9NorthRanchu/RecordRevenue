// ทดสอบ ภาพรวมครอบครัว — รัน: node backend/test/family.test.mjs
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fam-'));
fs.writeFileSync(path.join(TMP, 'package.json'), '{"type":"module"}');
for (const f of fs.readdirSync(SRC)) if (f.endsWith('.js')) fs.copyFileSync(path.join(SRC, f), path.join(TMP, f));
const worker = (await import(pathToFileURL(path.join(TMP, 'index.js')).href)).default;
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE Users (user_id TEXT PRIMARY KEY, family_id TEXT NOT NULL, name TEXT NOT NULL, email TEXT, line_user_id TEXT UNIQUE, role TEXT, password TEXT, created_at DATETIME);
CREATE TABLE Entities (entity_id TEXT PRIMARY KEY, family_id TEXT, name TEXT, is_company INTEGER);
CREATE TABLE UserPermissions (user_id TEXT, entity_id TEXT, PRIMARY KEY (user_id, entity_id));
CREATE TABLE Accounts (account_id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, name TEXT NOT NULL, bank_name TEXT, account_number TEXT, balance REAL DEFAULT 0, created_at DATETIME, pdf_password TEXT, account_type TEXT DEFAULT 'BANK', credit_limit REAL DEFAULT 0, statement_day INTEGER, due_day INTEGER);
CREATE TABLE Transactions (transaction_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, ref_code TEXT, date TEXT NOT NULL, time TEXT, total_amount REAL NOT NULL, statement_desc TEXT, status TEXT, source TEXT, slip_image_url TEXT, created_by_user_id TEXT, created_at DATETIME);
CREATE TABLE TransactionDetails (detail_id TEXT PRIMARY KEY, transaction_id TEXT NOT NULL, amount REAL NOT NULL, fee REAL DEFAULT 0, wht REAL DEFAULT 0, category_id TEXT, entity_id TEXT, contact_id TEXT, project_id TEXT, note TEXT, type TEXT);
CREATE TABLE Categories (category_id TEXT PRIMARY KEY, family_id TEXT, caption_id TEXT, name TEXT);
CREATE TABLE Captions (type_id TEXT PRIMARY KEY, name TEXT, behavior TEXT, sub_behavior TEXT);
CREATE TABLE LedgerRules (family_id TEXT, kind TEXT, rkey TEXT, rval TEXT);
CREATE TABLE Sessions (token_hash TEXT PRIMARY KEY, user_id TEXT, expires_at TEXT);
INSERT INTO Users VALUES ('North','F1','North',NULL,NULL,'admin',NULL,NULL),('Puii','F1','Puii',NULL,NULL,'member',NULL,NULL),('Zed','F2','Zed',NULL,NULL,'admin',NULL,NULL);
INSERT INTO Entities VALUES ('E_N','F1','North (ส่วนตัว)',0),('E_P','F1','Puii (ส่วนตัว)',0),('E_B','F1','[S06] PUII',1),('E_S1','F1','[S01] Bookkeeper',1),('E_Z','F2','Zed',0);
INSERT INTO UserPermissions VALUES ('North','E_N'),('Puii','E_P'),('Puii','E_B'),('Zed','E_Z');
INSERT INTO Accounts (account_id,entity_id,name) VALUES ('AN','E_N','North bank'),('AP','E_P','Puii bank'),('AB','E_B','PUII biz'),('AS','E_S1','BKP bank'),('AZ','E_Z','Zed bank');
INSERT INTO Transactions VALUES ('t1','AN',NULL,'2026-10-05',NULL,-100,'x','CONFIRMED','WEB_GRID',NULL,'North','2026-10-05 10:00'),
 ('t2','AP',NULL,'2026-10-06',NULL,-50,'x','CONFIRMED','WEB_GRID',NULL,'Puii','2026-10-06 10:00'),
 ('t3','AB',NULL,'2026-10-07',NULL,1000,'x','CONFIRMED','PDF_IMPORT',NULL,'Puii','2026-10-07 10:00'),
 ('t4','AB',NULL,'2026-10-08',NULL,-300,'x','CONFIRMED','WEB_GRID',NULL,'North','2026-10-08 10:00'),
 ('t5','AS',NULL,'2026-10-09',NULL,5000,'x','CONFIRMED','PDF_IMPORT',NULL,'North','2026-10-09 10:00'),
 ('t6','AZ',NULL,'2026-10-09',NULL,-999,'x','CONFIRMED','WEB_GRID',NULL,'Zed','2026-10-09 10:00'),
 ('t7','AB',NULL,'2026-10-10',NULL,-20,'x','PENDING_REVIEW','PDF_IMPORT',NULL,'Puii','2026-10-10 10:00');
INSERT INTO TransactionDetails (detail_id,transaction_id,amount,category_id,entity_id,type) VALUES ('d1','t1',-100,'C','E_N','EXPENSE'),('d2','t2',-50,'C','E_P','EXPENSE'),('d3','t3',1000,'C','E_B','INCOME'),('d4','t4',-300,'C','E_B','EXPENSE'),('d5','t5',5000,'C','E_S1','INCOME'),('d6','t6',-999,'C','E_Z','EXPENSE'),('d7','t7',-20,'C','E_B','EXPENSE');`);
const toD1 = sql => { const st = { _args: [], bind(...a) { st._args = a; return st; }, async first() { return db.prepare(sql).get(...st._args) ?? null; }, async all() { return { results: db.prepare(sql).all(...st._args) }; }, async run() { const r = db.prepare(sql).run(...st._args); return { meta: { changes: Number(r.changes) } }; }, _run() { db.prepare(sql).run(...st._args); } }; return st; };
const env = { DB: { prepare: toD1, batch: async ops => { for (const o of ops) o._run(); } } };
const hashTok = async t => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t))).toString('base64url');
for (const u of ['North', 'Puii', 'Zed']) db.prepare(`INSERT INTO Sessions VALUES (?,?,?)`).run(await hashTok(`tok-${u}`), u, '2099-01-01T00:00:00Z');
const call = async (p, user) => { const res = await worker.fetch(new Request('https://w.test' + p, { headers: { Authorization: `Bearer tok-${user}` } }), env, {}); let j = null; try { j = await res.json(); } catch {} return { s: res.status, j }; };
let ok = 0, bad = 0; const check = (n, c, x) => { if (c) ok++; else { bad++; console.log('  ❌', n, JSON.stringify(x)?.slice(0, 300)); } };
let r = await call('/api/family/overview?month=2026-10', 'North');
check('ผู้ดูแลได้สิทธิ์ทุก Company ในครอบครัวอัตโนมัติ', db.prepare(`SELECT COUNT(*) n FROM UserPermissions WHERE user_id='North'`).get().n === 4, null);
check('ผู้ดูแล: รวมทั้งครอบครัว (ไม่รวมครอบครัวอื่น)', r.s === 200 && r.j.totals.in === 6000 && r.j.totals.out === 450 && r.j.totals.personal_out === 150 && r.j.totals.business_in === 6000, r.j?.totals);
check('ผู้ดูแล: ของฉัน = ส่วนตัวของ North', r.j.mine.out === 100 && r.j.mine.in === 0, r.j.mine);
check('ผู้ดูแล: เห็นสมาชิกครบ 2 คน · Puii ส่วนตัวจ่าย 50', r.j.members.length === 2 && r.j.members.find(m => m.user_id === 'Puii')?.out === 50, r.j.members);
const pb = r.j.businesses.find(b => b.entity_id === 'E_B');
check('ธุรกิจร่วม: ใช้ได้ 2 คน · รับ 1000 จ่าย 300 · รอตรวจ 1', pb && pb.users.length === 2 && pb.in === 1000 && pb.out === 300 && pb.pending === 1, pb);
check('กิจกรรมล่าสุดมีชื่อคนบันทึก', r.j.activity.some(a => a.user_name === 'Puii') && !r.j.activity.some(a => a.user_name === 'Zed'), r.j.activity);
r = await call('/api/family/overview?month=2026-10', 'Puii');
check('user: ไม่เห็นของ North ส่วนตัว / BKP · เห็นของตัวเอง + ธุรกิจร่วม', r.s === 200 && r.j.totals.in === 1000 && r.j.totals.out === 350 && !r.j.businesses.some(b => b.entity_id === 'E_S1') && !r.j.is_admin, r.j.totals);
check('user: ของฉัน = Puii ส่วนตัว', r.j.mine.out === 50, r.j.mine);
check('user: ไม่ได้สิทธิ์เพิ่มเอง', db.prepare(`SELECT COUNT(*) n FROM UserPermissions WHERE user_id='Puii'`).get().n === 2, null);
console.log(`family: ${ok} ผ่าน · ${bad} ไม่ผ่าน`); if (bad) process.exitCode = 1;
