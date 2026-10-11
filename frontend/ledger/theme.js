/* ธีมสีของหน้าใหม่ (ledger/*) — 2026-10-12
   เลือกที่ ตั้งค่า → อื่น ๆ → ธีมสี · จำไว้ในเครื่องนี้ (localStorage 'ledger-theme')
   วิธีทำงาน: ทุกหน้าเขียนสีม่วงเป็นค่าเริ่มต้น → ไฟล์นี้ (โหลดท้าย <head>) แทนรหัสสีม่วงด้วยสีของธีมที่เลือก
   ทั้งใน <style> และ style="" ที่สร้างภายหลัง · สีเขียว/แดงของตัวเลขไม่เปลี่ยน */
(function () {
  'use strict';
  // ลำดับ: เข้ม · หลัก · อ่อน · พื้นอ่อนมาก · ขอบอ่อน · เส้น · พื้นหน้า · hover · rgb(เข้ม)
  var KEYS = ['#5f3dc4', '#7950f2', '#9775fa', '#f3f0ff', '#e5dbff', '#ece8f8', '#f8f7fd', '#faf8ff', '95,61,196'];
  var T = {
    violet: { name: 'ม่วง (ค่าเริ่มต้น)', c: KEYS },
    indigo: { name: 'คราม', c: ['#364fc7', '#4c6ef5', '#748ffc', '#edf2ff', '#dbe4ff', '#e6ebf8', '#f7f8fd', '#f8f9ff', '54,79,199'] },
    blue: { name: 'ฟ้า', c: ['#1864ab', '#1c7ed6', '#339af0', '#e7f5ff', '#d0ebff', '#e3eef7', '#f6f9fc', '#f5faff', '24,100,171'] },
    cyan: { name: 'น้ำทะเล', c: ['#0b7285', '#1098ad', '#22b8cf', '#e3fafc', '#c5f6fa', '#e0f0f2', '#f5fafb', '#f4fcfd', '11,114,133'] },
    green: { name: 'เขียว', c: ['#2b8a3e', '#37b24d', '#51cf66', '#ebfbee', '#d3f9d8', '#e3f1e6', '#f6faf7', '#f4fcf5', '43,138,62'] },
    pink: { name: 'ชมพู', c: ['#a61e4d', '#d6336c', '#f06595', '#fff0f6', '#ffdeeb', '#f6e6ec', '#fcf7f9', '#fff7fa', '166,30,77'] },
    orange: { name: 'ส้ม', c: ['#d9480f', '#f76707', '#ff922b', '#fff4e6', '#ffe8cc', '#f5e9de', '#fcf9f5', '#fffaf3', '217,72,15'] },
    slate: { name: 'เทาเข้ม', c: ['#343a40', '#495057', '#868e96', '#f1f3f5', '#e9ecef', '#e9ecef', '#f8f9fa', '#f8f9fa', '52,58,64'] },
  };
  var cur = 'violet';
  try { cur = localStorage.getItem('ledger-theme') || 'violet'; } catch (e) { /* ใช้ค่าเริ่มต้น */ }
  if (!T[cur]) cur = 'violet';
  window.LEDGER_THEMES = T;
  window.LEDGER_THEME = cur;
  window.setLedgerTheme = function (id) { try { localStorage.setItem('ledger-theme', T[id] ? id : 'violet'); } catch (e) { /* ไม่มีที่เก็บ */ } location.reload(); };
  if (cur === 'violet') return;
  var c = T[cur].c;
  // สีม่วงรองที่ใช้บางจุด (#7048e8 · #b197fc · #d0bfff) → ใช้สีหลัก/อ่อน/ขอบอ่อนของธีม
  var to = c.concat([c[1], c[2], c[4]]);
  KEYS = KEYS.concat(['#7048e8', '#b197fc', '#d0bfff']);
  var re = new RegExp(KEYS.map(function (k) { return k.replace(/[(),.]/g, '\\$&'); }).join('|').replace('95,61,196', '95,\\s*61,\\s*196'), 'gi');
  var map = {}; KEYS.forEach(function (k, i) { map[k] = to[i]; });
  var swap = function (s) { return s.replace(re, function (m) { return map[m.toLowerCase().replace(/\s+/g, '')] || m; }); };
  var fixStyles = function () { var ss = document.querySelectorAll('style'); for (var i = 0; i < ss.length; i++) { var t = ss[i].textContent; if (re.test(t)) { re.lastIndex = 0; ss[i].textContent = swap(t); } re.lastIndex = 0; } };
  var fixEl = function (el) {
    if (!el || el.nodeType !== 1) return;
    var list = el.hasAttribute('style') ? [el] : [];
    var inner = el.querySelectorAll ? el.querySelectorAll('[style]') : [];
    for (var i = 0; i < inner.length; i++) list.push(inner[i]);
    for (var j = 0; j < list.length; j++) { var v = list[j].getAttribute('style'); re.lastIndex = 0; if (re.test(v)) { re.lastIndex = 0; list[j].setAttribute('style', swap(v)); } }
    re.lastIndex = 0;
  };
  fixStyles();
  var start = function () {
    fixStyles(); fixEl(document.body);
    new MutationObserver(function (ms) { for (var i = 0; i < ms.length; i++) { var a = ms[i].addedNodes; for (var j = 0; j < a.length; j++) fixEl(a[j]); if (ms[i].type === 'attributes') fixEl(ms[i].target); } })
      .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
