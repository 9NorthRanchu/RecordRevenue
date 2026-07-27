// Icon Selector Logic
const ICON_SETS = {
    zodiac: Array.from({length: 12}, (_, i) => `zodiac_${i+1}.png`),
    hokkaido: Array.from({length: 12}, (_, i) => `hokkaido_${i+1}.png`),
    china: Array.from({length: 12}, (_, i) => `china_${i+1}.png`),
    japan: Array.from({length: 12}, (_, i) => `japan_${i+1}.png`),
    mascot: Array.from({length: 12}, (_, i) => `mascot_${i+1}.png`),
    onepiece: Array.from({length: 12}, (_, i) => `onepiece_${i+1}.png`),
    duffy: Array.from({length: 12}, (_, i) => `duffy_${i+1}.png`)
};
let currentIconTab = 'zodiac';
let selectedIcon = 'zodiac_1.png';

function switchIconTab(tab) {
    currentIconTab = tab;
    const tabs = document.querySelectorAll('.icon-tabs button');
    tabs.forEach(btn => {
        btn.style.background = 'transparent';
        btn.style.color = '#3b82f6';
    });
    const activeBtn = document.querySelector(`.icon-tabs button[data-tab="${tab}"]`);
    if(activeBtn) {
        activeBtn.style.background = '#3b82f6';
        activeBtn.style.color = 'white';
    }
    renderIconGrid();
    setTimeout(() => { document.getElementById('icon-grid')?.focus(); }, 50);
}

let isIconGridInitialized = false;

function renderIconGrid() {
    const container = document.getElementById('icon-grid');
    if (!container) return;
    
    if (!isIconGridInitialized || !container.innerHTML.trim()) {
        container.innerHTML = Object.keys(ICON_SETS).map(tab => {
            return `
                <div id="grid-tab-${tab}" class="icon-tab-grid" style="display: ${tab === currentIconTab ? 'grid' : 'none'}; grid-template-columns: repeat(6, 1fr); gap: 6px; align-content: start;">
                    ${ICON_SETS[tab].map(icon => {
                        const iconId = icon.replace(/\./g, '-');
                        return `
                            <div id="icon-wrapper-${iconId}" onclick="selectIcon('${icon}')" style="cursor:pointer; border-radius: 12px; padding: 4px; border: 2px solid ${selectedIcon === icon ? '#3b82f6' : 'transparent'}; text-align: center; transition: all 0.2s; aspect-ratio: 1 / 1; display: flex; align-items: center; justify-content: center;">
                                <img src="/assets/icons/${icon}" loading="lazy" style="width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }).join('');
        isIconGridInitialized = true;
    } else {
        Object.keys(ICON_SETS).forEach(tab => {
            const grid = document.getElementById(`grid-tab-${tab}`);
            if (grid) {
                grid.style.display = (tab === currentIconTab) ? 'grid' : 'none';
            }
        });
        
        Object.keys(ICON_SETS).forEach(tab => {
            ICON_SETS[tab].forEach(icon => {
                const iconId = icon.replace(/\./g, '-');
                const wrapper = document.getElementById(`icon-wrapper-${iconId}`);
                if (wrapper) {
                    wrapper.style.border = (selectedIcon === icon) ? '2px solid #3b82f6' : '2px solid transparent';
                }
            });
        });
    }
}

function selectIcon(icon) {
    selectedIcon = icon;
    const iconInput = document.getElementById('debt-icon-type');
    if(iconInput) iconInput.value = icon;
    renderIconGrid();
}

// app.js

// API Base URL - ชี้ไปยัง Cloudflare Worker ของคุณที่ deploy สำเร็จแล้ว
const API_BASE = "https://record-revenue.9nimz.workers.dev";

// Global showToast utility
window.showToast = function(message, type = 'success') {
    const toast = document.createElement('div');
    let bgColor = '#10b981'; // green for success
    if (type === 'error') bgColor = '#ef4444'; // red
    if (type === 'info') bgColor = '#3b82f6'; // blue

    // On mobile (≤992px), push toast above the bottom nav (65px) + gap
    const bottomOffset = window.innerWidth <= 992 ? '90px' : '30px';

    toast.style.cssText = `
        position: fixed;
        bottom: ${bottomOffset};
        right: 16px;
        left: 16px;
        max-width: 420px;
        margin: 0 auto;
        z-index: 99999;
        background: ${bgColor};
        color: #fff;
        padding: 12px 18px;
        border-radius: 10px;
        font-weight: 700;
        font-size: 0.9rem;
        box-shadow: 0 4px 12px rgba(0,0,0,0.25);
        display: flex;
        align-items: center;
        gap: 8px;
    `;

    const icon = type === 'error' ? '❌' : (type === 'info' ? 'ℹ️' : '✅');
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};


// ==========================================
// 💡 UTILITY: NUMBER FORMATTING
// ==========================================
function formatCurrency(amount) {
    if (amount == null || isNaN(amount)) return '-';
    const isNegative = amount < 0;
    const absVal = Math.abs(amount);
    const formattedStr = absVal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return isNegative ? `(${formattedStr})` : formattedStr;
}

function formatStatementAmountInput(amount, type) {
    if (amount == null || isNaN(amount)) return '0.00';
    const isNegative = (type === 'EXPENSE' || type === 'CREDIT_AR');
    const val = isNegative ? -Math.abs(amount) : Math.abs(amount);
    const absFormatted = Math.abs(val).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (val < 0) {
        return `(${absFormatted})`;
    }
    return absFormatted;
}

function formatNumberWithCommas(val) {
    const num = parseAmountInput(val);
    if (isNaN(num)) return val;
    const isNegative = num < 0;
    const absVal = Math.abs(num);
    const formatted = absVal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return isNegative ? `(${formatted})` : formatted;
}

function parseAmountInput(valStr) {
    if (valStr == null) return 0;
    let clean = valStr.toString().trim();
    let sign = 1;
    if (clean.startsWith('(') && clean.endsWith(')')) {
        sign = -1;
        clean = clean.substring(1, clean.length - 1);
    } else if (clean.startsWith('-')) {
        sign = -1;
        clean = clean.substring(1);
    }
    const val = parseFloat(clean.replace(/,/g, ''));
    return isNaN(val) ? 0 : val * sign;
}

const AppState = {
    userId: '',
    userName: '',
    userRole: '',
    familyId: '',
    allowedEntities: [],
    categories: [],
    debts: [],
    captions: [],
    contacts: [],
    projects: [],
    accounts: [],
    entities: [],
    settingsViewMode: 'admin', // 'admin' | 'user' — admin sees all; user sees only their own
    settings: {
        entities: [],
        contacts: [],
        captions: [],
        categories: [],
        debts: [],
        projects: [],
        accounts: [],
        users: []
    },
    pendingTransactions: []
};

// ==========================================
// 🎨 THEME SWITCHER
// ==========================================
function initTheme() {
    const VALID_THEMES = ['kawaii','sakura','fuji','hokkaido','anime','ghibli'];
    let savedTheme = localStorage.getItem('app-theme') || 'kawaii';
    if (!VALID_THEMES.includes(savedTheme)) savedTheme = 'kawaii'; // ธีมเก่าที่ยกเลิกแล้ว → กลับเป็นค่าเริ่มต้น
    document.body.setAttribute('data-theme', savedTheme);
    
    const themeSelector = document.getElementById('theme-selector');
    if (themeSelector) {
        themeSelector.value = savedTheme;
        themeSelector.addEventListener('change', (e) => {
            const newTheme = e.target.value;
            document.body.setAttribute('data-theme', newTheme);
            localStorage.setItem('app-theme', newTheme);
        });
    }
}

// ==========================================
// 🚀 APP START
// ==========================================




document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    
    // Sidebar Toggle Logic
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const mainSidebar = document.getElementById('main-sidebar');
    if (sidebarToggle && mainSidebar) {
        sidebarToggle.addEventListener('click', () => {
            mainSidebar.classList.toggle('collapsed');
        });
    }

    initApp();
    bindNavigation();
    bindActions();
    bindGridInputEvents();
    bindModalEvents();
    bindPDFUpload();
    bindPendingPageActions();

    bindBackupRestore();
    bindFlatExport();
});

function getRowPayload(tr) {
    const txId = tr.dataset.txid;
    const txDate = tr.querySelector(".input-date").value;
    const txTime = tr.dataset.time || '00:00:00';
    const accId = tr.querySelector(".select-account").value;
    const rawStmtAmountStr = tr.querySelector(".input-stmt-amount").value;
    const captionId = tr.querySelector(".select-caption").value;
    const captionObj = AppState.captions.find(at => at.type_id === captionId);
    const caption = captionObj ? captionObj.name : '';
    const entityId = tr.querySelector(".select-entity").value;
    const contactId = tr.querySelector(".select-contact").value;
    const categoryId = tr.querySelector(".select-category").value;
    
    const tranAmount = parseAmountInput(tr.querySelector(".input-amount").value);
    const fee = parseAmountInput(tr.querySelector(".input-fee").value);
    const wht = parseAmountInput(tr.querySelector(".input-wht").value);
    let detail = tr.querySelector(".input-detail").value.trim();
    if (!detail && tr.dataset.stmtNote) {
        detail = tr.dataset.stmtNote;
    }
    
    if (!accId || !txDate || !categoryId) {
        alert("กรุณากรอกวันที่ บัญชี และหมวดหมู่ให้ครบถ้วน");
        return null;
    }
    
    const parsedStmtAmount = parseAmountInput(rawStmtAmountStr);

    const stmtAbs = Math.abs(parsedStmtAmount);
    const tranAbs = Math.abs(tranAmount);
    const feeAbs = Math.abs(fee);
    const whtAbs = Math.abs(wht);

    if (stmtAbs === 0) {
        alert("กรุณาระบุยอดเงิน Statement Amount");
        return null;
    }
    if (tranAbs === 0) {
        alert("กรุณาระบุ Transaction Amount");
        return null;
    }

    // Magnitude check: sub-row amounts must add up to statement amount
    const diff = stmtAbs - (tranAbs + feeAbs + whtAbs);
    if (Math.abs(diff) > 0.01) {
        alert(`ยอดรายการย่อยไม่ตรงกับยอด Statement\nStatement: ${stmtAbs.toFixed(2)}\nรายการรวม: ${(tranAbs + feeAbs + whtAbs).toFixed(2)}\nผลต่าง: ${diff.toFixed(2)}`);
        return null;
    }

    // Determine sign from statement amount (positive = income, negative = expense)
    const sign = parsedStmtAmount >= 0 ? 1 : -1;

    // Determine Type from Category default or parent account type behavior
    const catObj = AppState.categories.find(c => c.category_id === categoryId);
    let detailType = sign > 0 ? 'INCOME' : 'EXPENSE';
    if (catObj) {
        if (catObj.default_type) {
            detailType = catObj.default_type;
        } else if (catObj.caption_behavior) {
            if (catObj.caption_behavior === 'REVENUE') detailType = 'INCOME';
            else if (catObj.caption_behavior === 'EXPENSE') detailType = 'EXPENSE';
            else detailType = catObj.caption_behavior;
        }
    }
    
    return {
        transaction_id: txId,
        account_id: accId,
        date: txDate,
        time: txTime,
        statement_desc: caption,
        total_amount: stmtAbs,
        ref_code: tr.dataset.ref || '',
        status: 'PENDING_REVIEW',
        source: tr.dataset.source || 'PDF_IMPORT',
        details: [{
            amount: tranAbs * sign,
            fee: feeAbs * sign,
            wht: whtAbs * sign,
            category_id: categoryId,
            contact_id: contactId || null,
            entity_id: entityId || null,
            note: detail || null,
            type: detailType
        }]
    };
}


// ===================================
// FLAT EXPORT (Transaction + Details JOIN)
// ===================================
const FLAT_COLUMNS = [
    { key: 'date',           label: 'วันที่',                    width: 12 },
    { key: 'time',           label: 'เวลา',                     width: 10 },
    { key: 'account_name',   label: 'บัญชี',                    width: 22 },
    { key: 'account_entity', label: 'บริษัท/เจ้าของบัญชี',      width: 22 },
    { key: 'statement_desc', label: 'Statement Description',    width: 30 },
    { key: 'ref_code',       label: 'Ref Code',                 width: 16 },
    { key: 'total_amount',   label: 'ยอดรวม Transaction (บาท)', width: 20 },
    { key: 'status',         label: 'สถานะ',                    width: 12 },
    { key: 'source',         label: 'แหล่งข้อมูล',              width: 14 },
    { key: 'detail_amount',  label: 'ยอดรายการย่อย (บาท)',      width: 20 },
    { key: 'fee',            label: 'ค่าธรรมเนียม (บาท)',       width: 18 },
    { key: 'wht',            label: 'ภาษีหัก ณ ที่จ่าย (บาท)',  width: 20 },
    { key: 'detail_type',    label: 'ประเภทรายการ',             width: 16 },
    { key: 'caption_name',   label: 'Account Type (Caption)',   width: 22 },
    { key: 'category_name',  label: 'หมวดหมู่ (Category)',      width: 22 },
    { key: 'contact_name',   label: 'คู่ค้า (Contact)',          width: 22 },
    { key: 'entity_name',    label: 'เจ้าของรายการย่อย',        width: 22 },
    { key: 'project_name',   label: 'Trip / Project',           width: 20 },
    { key: 'note',           label: 'หมายเหตุ',                 width: 30 },
    { key: 'transaction_id', label: 'Transaction ID',           width: 20 },
    { key: 'detail_id',      label: 'Detail ID',                width: 20 },
];

function toCSV(rows) {
    const headers = FLAT_COLUMNS.map(c => `"${c.label}"`).join(',');
    const lines = rows.map(r =>
        FLAT_COLUMNS.map(c => {
            const v = r[c.key] ?? '';
            return `"${String(v).replace(/"/g, '""')}"`;
        }).join(',')
    );
    return '﻿' + [headers, ...lines].join('\r\n'); // BOM for Thai Excel
}

async function fetchFlatData() {
    const startDate = document.getElementById('flat-start-date')?.value || '';
    const endDate   = document.getElementById('flat-end-date')?.value   || '';
    const status    = document.getElementById('flat-status')?.value     || '';
    const accountId = document.getElementById('flat-account-id')?.value || '';
    let url = `${API_BASE}/api/export/flat`;
    const p = [];
    if (startDate) p.push(`startDate=${startDate}`);
    if (endDate)   p.push(`endDate=${endDate}`);
    if (status)    p.push(`status=${status}`);
    if (accountId) p.push(`accountId=${encodeURIComponent(accountId)}`);
    if (p.length)  url += '?' + p.join('&');
    const res = await fetch(url, { headers: { 'x-user-id': encodeURIComponent(getUserIdHeader()) } });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
}

function populateFlatAccountDropdown() {
    const sel = document.getElementById('flat-account-id');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">— ทุก Statement —</option>';
    // Group by entity
    const byEntity = {};
    (AppState.accounts || []).forEach(a => {
        const grp = a.entity_name || a.entity_id || 'อื่นๆ';
        if (!byEntity[grp]) byEntity[grp] = [];
        byEntity[grp].push(a);
    });
    Object.entries(byEntity).forEach(([entity, accs]) => {
        const og = document.createElement('optgroup');
        og.label = entity;
        accs.forEach(a => {
            const opt = document.createElement('option');
            opt.value = a.account_id;
            opt.textContent = a.name;
            if (a.account_id === current) opt.selected = true;
            og.appendChild(opt);
        });
        sel.appendChild(og);
    });
}

function bindFlatExport() {
    const btnExcel = document.getElementById('btn-flat-excel');
    const btnCsv   = document.getElementById('btn-flat-csv');

    // Populate account dropdown now and whenever accounts update
    populateFlatAccountDropdown();

    async function doExport(format) {
        const btn = format === 'excel' ? btnExcel : btnCsv;
        if (!btn) return;
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> กำลังดึงข้อมูล...`;
        try {
            const rows = await fetchFlatData();
            if (!rows || rows.length === 0) { alert('ไม่มีข้อมูลในช่วงเวลาที่เลือก'); return; }

            const dateStr = new Date().toISOString().slice(0, 10);
            const accId = document.getElementById('flat-account-id')?.value || '';
            const accObj = (AppState.accounts || []).find(a => a.account_id === accId);
            const accSuffix = accObj ? `_${accObj.name.replace(/[^a-zA-Z0-9ก-๙]/g, '_').slice(0,20)}` : '';

            if (format === 'csv') {
                const csv = toCSV(rows);
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `RecordRevenue_Flat${accSuffix}_${dateStr}.csv`;
                a.click();
            } else {
                // Excel — build with styled headers using SheetJS
                const wb = XLSX.utils.book_new();

                // Header row (Thai labels)
                const headerRow = FLAT_COLUMNS.map(c => c.label);
                // Data rows (in column order)
                const dataRows = rows.map(r => FLAT_COLUMNS.map(c => r[c.key] ?? ''));

                const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);

                // Column widths
                ws['!cols'] = FLAT_COLUMNS.map(c => ({ wch: c.width }));

                // Freeze top row (header stays when scrolling)
                ws['!freeze'] = { xSplit: 0, ySplit: 1 };

                // Auto-filter on header row
                ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(FLAT_COLUMNS.length - 1)}1` };

                XLSX.utils.book_append_sheet(wb, ws, 'รายการละเอียด');

                // Summary sheet
                const txCount    = new Set(rows.map(r => r.transaction_id)).size;
                const detailCount = rows.filter(r => r.detail_id).length;
                const totalIn  = rows.filter(r => (r.detail_type||'').includes('INCOME') || (r.detail_type||'').includes('REVENUE') || r.detail_type === 'CREDIT_AR').reduce((s,r) => s + (Number(r.detail_amount)||0), 0);
                const totalOut = rows.filter(r => (r.detail_type||'').includes('EXPENSE') || r.detail_type === 'DEBIT_AR').reduce((s,r) => s + Math.abs(Number(r.detail_amount)||0), 0);

                const summaryData = [
                    ['📊 สรุปรายการที่ Export', ''],
                    ['Export วันที่', new Date().toLocaleString('th-TH')],
                    ['ผู้ Export', AppState.userName || ''],
                    ['Statement / บัญชี', accObj ? `${accObj.name} (${accObj.account_id})` : 'ทั้งหมด'],
                    ['จำนวน Transaction', txCount],
                    ['จำนวนรายการย่อย (Detail)', detailCount],
                    ['รวมยอดเงินเข้า (บาท)', totalIn.toFixed(2)],
                    ['รวมยอดเงินออก (บาท)', totalOut.toFixed(2)],
                    ['ช่วงวันที่', `${document.getElementById('flat-start-date')?.value || 'ทั้งหมด'} ถึง ${document.getElementById('flat-end-date')?.value || 'ทั้งหมด'}`],
                    ['สถานะ', document.getElementById('flat-status')?.value || 'ทั้งหมด'],
                ];
                const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
                wsSummary['!cols'] = [{ wch: 35 }, { wch: 30 }];
                XLSX.utils.book_append_sheet(wb, wsSummary, 'สรุป');

                XLSX.writeFile(wb, `RecordRevenue_Flat${accSuffix}_${dateStr}.xlsx`);
                alert(`✅ Export สำเร็จ! ${txCount} transactions · ${detailCount} รายการย่อย`);
            }
        } catch(e) {
            console.error(e);
            alert('เกิดข้อผิดพลาด: ' + e.message);
        }
        btn.disabled = false;
        btn.innerHTML = format === 'excel'
            ? `<i class="fa-solid fa-file-excel"></i> Excel (.xlsx)`
            : `<i class="fa-solid fa-file-csv"></i> CSV`;
    }

    btnExcel?.addEventListener('click', () => doExport('excel'));
    btnCsv?.addEventListener('click',   () => doExport('csv'));
}

// ===================================
// DB SCHEMA DEFINITION (for viewer)
// ===================================
const DB_SCHEMA = {
    Transactions:       ['transaction_id','account_id','date','time','total_amount','statement_desc','ref_code','status','source','created_at'],
    TransactionDetails: ['detail_id','transaction_id','amount','fee','wht','category_id','entity_id','contact_id','project_id','note','type','created_at'],
    Settlements:        ['settlement_id','parent_detail_id','child_detail_id','settled_amount','created_at'],
    Debts:              ['debt_id','family_id','name','type','contact_id','principal_category_id','interest_category_id','start_balance','installment_amount','start_date','icon_type','status','members','created_at'],
    Contacts:           ['contact_id','family_id','name','contact_type','members','created_at'],
    Projects:           ['project_id','family_id','name','status','members','created_at'],
    Entities:           ['entity_id','family_id','name','is_company','created_at'],
    Accounts:           ['account_id','entity_id','name','bank_name','account_number','balance','pdf_password','created_at'],
    Categories:         ['category_id','family_id','name','caption_id','default_entity_id','default_contact_id','default_type','created_at'],
    Captions:           ['type_id','family_id','name','behavior','default_entity_id','default_contact_id','default_type','created_at'],
    TripStops:          ['stop_id','project_id','stop_date','time','city','accommodation','restaurants','notes','location_type','created_at'],
    TripExpenses:       ['trip_expense_id','project_id','expense_date','member_id','amount','category','note','created_at'],
};

// Sheet name → JSON key mapping (Export/Import)
const BACKUP_SHEET_MAP = [
    { sheet: 'Transactions',       key: 'transactions' },
    { sheet: 'TransactionDetails', key: 'transaction_details' },
    { sheet: 'Settlements',        key: 'settlements' },
    { sheet: 'Debts',              key: 'debts' },
    { sheet: 'Contacts',           key: 'contacts' },
    { sheet: 'Projects',           key: 'projects' },
    { sheet: 'Entities',           key: 'entities' },
    { sheet: 'Accounts',           key: 'accounts' },
    { sheet: 'Categories',         key: 'categories' },
    { sheet: 'Captions',           key: 'captions' },
    { sheet: 'TripStops',          key: 'trip_stops' },
    { sheet: 'TripExpenses',       key: 'trip_expenses' },
    { sheet: 'UserPermissions',    key: 'user_permissions' },
];

function renderSchemaViewer() {
    const container = document.getElementById('schema-tables');
    if (!container) return;
    container.innerHTML = Object.entries(DB_SCHEMA).map(([table, cols]) => `
        <div style="background:rgba(0,0,0,0.25);border-radius:10px;padding:12px;border:1px solid rgba(255,255,255,0.08);">
            <div style="font-weight:700;color:#a78bfa;font-size:0.85rem;margin-bottom:8px;">📋 ${table}</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;">
                ${cols.map((c,i) => `
                    <span style="padding:2px 8px;border-radius:12px;font-size:0.7rem;
                        background:${i===0?'rgba(167,139,250,0.25)':'rgba(255,255,255,0.07)'};
                        color:${i===0?'#a78bfa':'#94a3b8'};
                        border:1px solid ${i===0?'rgba(167,139,250,0.4)':'rgba(255,255,255,0.1)'};">
                        ${i===0?'🔑 ':''}${c}
                    </span>`).join('')}
            </div>
            <div style="font-size:0.68rem;color:#475569;margin-top:6px;">${cols.length} คอลัมน์</div>
        </div>
    `).join('');
}

// ── สำรองข้อมูลอัตโนมัติตามเวลา (client-side, เก็บใน localStorage ต่อเครื่อง) ──
const SCHED_KEY = 'rr_backup_schedule';
function getBackupSchedule() {
    try { return JSON.parse(localStorage.getItem(SCHED_KEY)) || { freq: 'off' }; } catch { return { freq: 'off' }; }
}
function dv2SchedFreqChange() {
    const f = document.getElementById('sched-freq')?.value || 'off';
    const show = (id, on) => { const el = document.getElementById(id); if (el) el.style.display = on ? '' : 'none'; };
    show('sched-dow-wrap', f === 'weekly');
    show('sched-dom-wrap', f === 'monthly');
    show('sched-time-wrap', f !== 'off');
}
function dv2SaveSchedule() {
    const s = {
        freq: document.getElementById('sched-freq').value,
        dow: Number(document.getElementById('sched-dow').value),
        dom: Number(document.getElementById('sched-dom').value),
        time: document.getElementById('sched-time').value || '09:00',
        lastRun: getBackupSchedule().lastRun || null
    };
    localStorage.setItem(SCHED_KEY, JSON.stringify(s));
    renderScheduleStatus();
    alert('บันทึกกำหนดเวลาสำรองข้อมูลแล้ว');
}
// หาช่วงเวลาที่ "ควรสำรองล่าสุด" ที่ <= ตอนนี้ (null = ปิด)
function lastScheduledMoment(s, now) {
    if (!s || s.freq === 'off') return null;
    const [hh, mm] = (s.time || '09:00').split(':').map(Number);
    const atTime = (d) => { const x = new Date(d); x.setHours(hh, mm, 0, 0); return x; };
    if (s.freq === 'daily') {
        let c = atTime(now); if (c > now) c.setDate(c.getDate() - 1); return c;
    }
    if (s.freq === 'weekly') {
        for (let i = 0; i < 7; i++) { const d = new Date(now); d.setDate(d.getDate() - i); if (d.getDay() === s.dow) { const c = atTime(d); if (c <= now) return c; } }
        const d = new Date(now); d.setDate(d.getDate() - 7); while (d.getDay() !== s.dow) d.setDate(d.getDate() - 1); return atTime(d);
    }
    if (s.freq === 'monthly') {
        const dom = Math.min(Math.max(s.dom || 1, 1), 28);
        let c = atTime(new Date(now.getFullYear(), now.getMonth(), dom));
        if (c > now) c = atTime(new Date(now.getFullYear(), now.getMonth() - 1, dom));
        return c;
    }
    return null;
}
function renderScheduleStatus() {
    const s = getBackupSchedule();
    const el = document.getElementById('sched-status');
    const freqSel = document.getElementById('sched-freq');
    if (freqSel) freqSel.value = s.freq || 'off';
    if (s.dow != null && document.getElementById('sched-dow')) document.getElementById('sched-dow').value = s.dow;
    if (s.dom != null && document.getElementById('sched-dom')) document.getElementById('sched-dom').value = s.dom;
    if (s.time && document.getElementById('sched-time')) document.getElementById('sched-time').value = s.time;
    dv2SchedFreqChange();
    if (!el) return;
    if (!s || s.freq === 'off') { el.textContent = '⏸ ปิดการสำรองอัตโนมัติอยู่'; return; }
    const last = s.lastRun ? new Date(s.lastRun).toLocaleString('th-TH') : 'ยังไม่เคย';
    el.textContent = `✅ เปิดอยู่ · สำรองล่าสุด: ${last} · จะสำรองอัตโนมัติเมื่อถึงกำหนดและเปิดแอป`;
}
// เรียกตอนเปิดแอป — ถ้าเลยกำหนด ให้สำรองเงียบๆ แล้วอัปเดต lastRun
async function checkScheduledBackup() {
    if (AppState.userRole !== 'admin') return;
    const s = getBackupSchedule();
    const moment = lastScheduledMoment(s, new Date());
    if (!moment) return;
    if (s.lastRun && new Date(s.lastRun) >= moment) return; // สำรองไปแล้วในรอบนี้
    const ok = await runFullBackup('', '', { silent: true, tag: 'auto' });
    if (ok) { s.lastRun = new Date().toISOString(); localStorage.setItem(SCHED_KEY, JSON.stringify(s)); }
}

// ดาวน์โหลด Full Backup (.xlsx) — ใช้ซ้ำได้ทั้งปุ่ม, ก่อน reset, และตามกำหนดเวลา
async function runFullBackup(startDate = '', endDate = '', opts = {}) {
    try {
        let url = `${API_BASE}/api/backup/full`;
        const params = [];
        if (startDate) params.push(`startDate=${startDate}`);
        if (endDate)   params.push(`endDate=${endDate}`);
        if (params.length) url += '?' + params.join('&');

        const res = await fetch(url, { headers: { 'x-user-id': encodeURIComponent(getUserIdHeader()) } });
        if (!res.ok) throw new Error(await res.text());
        const db = await res.json();

        const wb = XLSX.utils.book_new();
        const infoData = [
            { ข้อมูล: 'Exported At', ค่า: db.exported_at },
            { ข้อมูล: 'Family ID', ค่า: db.family_id },
            { ข้อมูล: 'Exported By', ค่า: AppState.userName },
            { ข้อมูล: 'Filter Start', ค่า: startDate || 'ทั้งหมด' },
            { ข้อมูล: 'Filter End', ค่า: endDate || 'ทั้งหมด' },
            ...BACKUP_SHEET_MAP.map(m => ({ ข้อมูล: `จำนวน ${m.sheet}`, ค่า: (db[m.key] || []).length + ' rows' }))
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(infoData), '_Info');
        for (const { sheet, key } of BACKUP_SHEET_MAP) {
            const rows = db[key] || [];
            const ws = rows.length > 0 ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([['(ไม่มีข้อมูล)']]);
            XLSX.utils.book_append_sheet(wb, ws, sheet);
        }
        const tag = opts.tag ? `_${opts.tag}` : '';
        const filename = `RecordRevenue_Backup${tag}_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.xlsx`;
        XLSX.writeFile(wb, filename);
        return true;
    } catch (e) {
        console.error("Backup failed", e);
        if (!opts.silent) alert("สำรองข้อมูลไม่สำเร็จ: " + e.message);
        return false;
    }
}

function bindBackupRestore() {
    const btnBackup = document.getElementById("btn-backup-excel");
    const btnRestore = document.getElementById("btn-restore-excel");
    const restoreInput = document.getElementById("restore-excel-input");

    renderSchemaViewer();
    renderScheduleStatus();

    // Load date range status
    fetchDateRange();

    // Clear date range button
    document.getElementById('btn-backup-clear-dates')?.addEventListener('click', () => {
        document.getElementById('backup-start-date').value = '';
        document.getElementById('backup-end-date').value = '';
    });

    // Template download buttons
    document.getElementById('btn-template-2sheet')?.addEventListener('click', downloadTemplate2Sheet);
    document.getElementById('btn-template-flat')?.addEventListener('click', downloadTemplateFlat);

    if (btnBackup) {
        btnBackup.addEventListener("click", async () => {
            const startDate = document.getElementById("backup-start-date").value;
            const endDate = document.getElementById("backup-end-date").value;
            btnBackup.disabled = true;
            btnBackup.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> กำลังดึงข้อมูล...`;
            const ok = await runFullBackup(startDate, endDate);
            if (ok) alert(`✅ Export สำเร็จ!`);
            btnBackup.disabled = false;
            btnBackup.innerHTML = `<i class="fa-solid fa-file-excel"></i> ดาวน์โหลด Full Backup (.xlsx)`;
        });
    }

    if (btnRestore && restoreInput) {
        btnRestore.addEventListener("click", () => {
            const file = restoreInput.files[0];
            if (!file) { alert("กรุณาเลือกไฟล์ Excel ก่อน"); return; }
            const replaceMode = document.getElementById("restore-replace-mode")?.checked;
            if (replaceMode) {
                if (AppState.userRole !== 'admin') { alert('โหมดแทนที่ทั้งหมดใช้ได้เฉพาะ Admin'); return; }
                if (!confirm(`⚠️ โหมดแทนที่ทั้งหมด\n\nระบบจะ "ลบข้อมูลเดิมทั้งหมด" แล้วนำเข้าจากไฟล์ "${file.name}"\nสภาพข้อมูลจะกลับไปตรงกับไฟล์ backup เป๊ะ (แถวที่ไม่มีในไฟล์จะหายไป)\n\nลบถาวร กู้คืนไม่ได้ — ดำเนินการต่อ?`)) return;
                const typed = prompt('พิมพ์  RESET  เพื่อยืนยันการแทนที่ทั้งหมด:');
                if (typed !== 'RESET') { alert('ยกเลิก'); return; }
            } else {
                if (!confirm(`ระบบจะ Upsert ข้อมูลจาก "${file.name}" เข้าสู่ฐานข้อมูล\n(อัปเดตถ้ามี ID ซ้ำ / เพิ่มใหม่ถ้าไม่มี — ไม่ลบของเดิม)\n\nดำเนินการต่อหรือไม่?`)) return;
            }

            btnRestore.disabled = true;
            btnRestore.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> กำลังอ่านไฟล์...`;
            const progress = document.getElementById('restore-progress');
            if (progress) { progress.style.display = 'block'; progress.textContent = 'กำลังอ่านไฟล์...'; }

            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
                    const payload = {};

                    for (const { sheet, key } of BACKUP_SHEET_MAP) {
                        if (!wb.SheetNames.includes(sheet)) continue;
                        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet]);
                        if (rows.length > 0) payload[key] = rows;
                    }

                    if (Object.keys(payload).length === 0) { alert("ไม่พบชีตข้อมูลในไฟล์"); return; }

                    const summary = Object.entries(payload).map(([k,v]) => `${k}: ${v.length} rows`).join(', ');
                    if (progress) progress.textContent = `อ่านข้อมูล: ${summary}\nกำลังส่งไปยังเซิร์ฟเวอร์...`;

                    btnRestore.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${replaceMode ? 'กำลังแทนที่...' : 'กำลัง Upsert...'}`;
                    if (replaceMode) payload.mode = 'replace';

                    const res = await fetch(`${API_BASE}/api/restore/full`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(getUserIdHeader()) },
                        body: JSON.stringify(payload)
                    });

                    if (!res.ok) throw new Error(await res.text());
                    const result = await res.json();

                    const statsText = Object.entries(result.stats || {}).map(([k,v]) => `${k}: ${v}`).join('\n');
                    if (progress) progress.textContent = `✅ Restore สำเร็จ!\n${statsText}`;
                    alert(`✅ Restore สำเร็จ!\n\n${statsText}`);
                    fetchMasterData();
                } catch(err) {
                    console.error("Restore failed", err);
                    if (progress) progress.textContent = `❌ ล้มเหลว: ${err.message}`;
                    alert("เกิดข้อผิดพลาด: " + err.message);
                }

                btnRestore.disabled = false;
                btnRestore.innerHTML = `<i class="fa-solid fa-upload"></i> เริ่ม Restore`;
                restoreInput.value = '';
            };
            reader.readAsArrayBuffer(file);
        });
    }

    // Old single-sheet restore path removed. Kept only full backup/restore.
    // Dummy stubs for removed code below:
    void 0;
    if (false) {
                    void 0;
                         void 0;
                         const payload_stub = {
                             account_id: null,
                             date: null,
                             time: '12:00:00',
                             statement_desc: '',
                             total_amount: 0,
                             ref_code: '',
                             status: 'CONFIRMED',
                             source: 'PDF_IMPORT',
                         };
                         void payload_stub;
    } // end if(false)
}

// =============================================
// Date Range Status
// =============================================
async function fetchDateRange() {
    const el = document.getElementById('data-range-status');
    if (!el) return;
    try {
        const res = await fetch(`${API_BASE}/api/stats/date-range`, {
            headers: { 'x-user-id': encodeURIComponent(getUserIdHeader()) }
        });
        if (!res.ok) { el.textContent = ''; return; }
        const { min_date, max_date, total_count } = await res.json();
        if (!min_date) {
            el.textContent = '📅 ยังไม่มีข้อมูล Transaction ในระบบ';
        } else {
            el.textContent = `📅 ข้อมูลในระบบ: ${min_date} ถึง ${max_date} (${total_count.toLocaleString()} transactions)`;
        }
    } catch(e) {
        el.textContent = '';
    }
}

// =============================================
// Import Templates
// =============================================

function buildReferenceSheet() {
    // Build a reference list from AppState for use in templates
    const rows = [
        ['📚 Reference Data — รหัสที่ใช้ได้ในระบบ (ณ วันที่ดาวน์โหลด Template นี้)', '', '', ''],
        [''],
        ['=== ACCOUNTS (account_id) ===', 'ชื่อบัญชี', 'ธนาคาร', 'บริษัท/เจ้าของ'],
    ];
    (AppState.accounts || []).forEach(a => {
        const ent = (AppState.entities || []).find(e => e.entity_id === a.entity_id);
        rows.push([a.account_id, a.name, a.bank_name || '', ent ? ent.name : '']);
    });
    rows.push(['']);
    rows.push(['=== CATEGORIES (category_id) ===', 'ชื่อหมวดหมู่', 'Caption', '']);
    (AppState.categories || []).forEach(c => {
        const cap = (AppState.captions || []).find(cp => cp.type_id === c.caption_id);
        rows.push([c.category_id, c.name, cap ? cap.name : '', '']);
    });
    rows.push(['']);
    rows.push(['=== CONTACTS (contact_id) ===', 'ชื่อคู่ค้า', 'ประเภท', '']);
    (AppState.contacts || []).forEach(c => {
        rows.push([c.contact_id, c.name, c.contact_type || '', '']);
    });
    rows.push(['']);
    rows.push(['=== ENTITIES (entity_id) ===', 'ชื่อบริษัท/เจ้าของ', '', '']);
    (AppState.entities || []).forEach(e => {
        rows.push([e.entity_id, e.name, '', '']);
    });
    rows.push(['']);
    rows.push(['=== PROJECTS (project_id) ===', 'ชื่อ Trip/Project', 'สถานะ', '']);
    (AppState.projects || []).forEach(p => {
        rows.push([p.project_id, p.name, p.status || '', '']);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 38 }, { wch: 30 }, { wch: 22 }, { wch: 22 }];
    return ws;
}

function downloadTemplate2Sheet() {
    try {
        const wb = XLSX.utils.book_new();

        // Sheet 1: Instructions
        const instrRows = [
            ['📋 วิธีใช้ Template นำเข้าข้อมูล (2 Sheet)', ''],
            [''],
            ['วัตถุประสงค์', 'ใช้นำเข้า Transaction และ TransactionDetails พร้อมกัน'],
            [''],
            ['📄 Sheet "Transactions"', '— หัวตาราง Transaction หลัก 1 แถวต่อ 1 รายการ'],
            ['  transaction_id', 'รหัสรายการ — สร้างเอง เช่น TX_20260101_001 (ต้องไม่ซ้ำ)'],
            ['  account_id', 'รหัสบัญชี — ดูได้จาก Sheet "📚 Reference"'],
            ['  date', 'วันที่ รูปแบบ YYYY-MM-DD เช่น 2026-01-15'],
            ['  time', 'เวลา รูปแบบ HH:MM:SS เช่น 14:30:00 (ถ้าไม่มีใส่ 00:00:00)'],
            ['  total_amount', 'ยอดรวม (บาท) ตัวเลขเท่านั้น เช่น 5000.00'],
            ['  statement_desc', 'คำอธิบาย Statement เช่น "โอนเงิน บริษัท ABC"'],
            ['  ref_code', 'รหัสอ้างอิง (ถ้ามี)'],
            ['  status', 'CONFIRMED หรือ PENDING'],
            ['  source', 'แหล่งข้อมูล เช่น MANUAL / PDF_IMPORT'],
            [''],
            ['📄 Sheet "TransactionDetails"', '— รายละเอียดย่อย 1+ แถวต่อ 1 transaction'],
            ['  detail_id', 'รหัสรายการย่อย — สร้างเอง เช่น D_20260101_001'],
            ['  transaction_id', '⚠️ ต้องตรงกับ transaction_id ใน Sheet Transactions'],
            ['  amount', 'ยอด (บาท) — เงินออกใส่ลบ เช่น -1500.00 / เงินเข้าใส่บวก'],
            ['  fee', 'ค่าธรรมเนียม (บาท) ถ้าไม่มีใส่ 0'],
            ['  wht', 'ภาษีหัก ณ ที่จ่าย (บาท) ถ้าไม่มีใส่ 0'],
            ['  type', 'ประเภท: INCOME / EXPENSE / TRANSFER_IN / TRANSFER_OUT'],
            ['  category_id', 'รหัสหมวดหมู่ — ดูจาก Sheet "📚 Reference"'],
            ['  entity_id', 'รหัสบริษัท/เจ้าของ — ดูจาก Sheet "📚 Reference"'],
            ['  contact_id', 'รหัสคู่ค้า — ดูจาก Sheet "📚 Reference" (ถ้าไม่มีเว้นว่าง)'],
            ['  project_id', 'รหัส Trip/Project — ดูจาก Sheet "📚 Reference" (ถ้าไม่มีเว้นว่าง)'],
            ['  note', 'หมายเหตุ (ถ้าไม่มีเว้นว่าง)'],
            [''],
            ['⚠️ ข้อควรระวัง', ''],
            ['  1. transaction_id ใน Details ต้องตรงกับที่สร้างใน Transactions'],
            ['  2. ไม่ควรใส่รหัสที่มีอยู่แล้วในระบบ (จะ overwrite ด้วย Upsert)'],
            ['  3. ลบแถวตัวอย่างออกก่อน Import'],
            ['  4. ไม่ต้องกรอกคอลัมน์ที่ไม่มีข้อมูล — เว้นว่างได้'],
        ];
        const wsInstr = XLSX.utils.aoa_to_sheet(instrRows);
        wsInstr['!cols'] = [{ wch: 36 }, { wch: 60 }];
        XLSX.utils.book_append_sheet(wb, wsInstr, '📋 วิธีใช้');

        // Sheet 2: Transactions
        const txHeader = ['transaction_id', 'account_id', 'date', 'time', 'total_amount', 'statement_desc', 'ref_code', 'status', 'source'];
        const txExample = [
            ['TX_20260101_001', (AppState.accounts[0]||{}).account_id || 'ACC_XXXX', '2026-01-15', '14:30:00', 5000.00, 'โอนเงิน ตัวอย่าง', 'REF001', 'CONFIRMED', 'MANUAL'],
            ['TX_20260101_002', (AppState.accounts[0]||{}).account_id || 'ACC_XXXX', '2026-01-16', '09:00:00', -1200.50, 'ค่าน้ำมัน', '', 'CONFIRMED', 'MANUAL'],
        ];
        const wsTx = XLSX.utils.aoa_to_sheet([txHeader, ...txExample]);
        wsTx['!cols'] = [22, 22, 12, 10, 16, 30, 16, 12, 14].map(w => ({ wch: w }));
        wsTx['!freeze'] = { xSplit: 0, ySplit: 1 };
        wsTx['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(txHeader.length - 1)}1` };
        XLSX.utils.book_append_sheet(wb, wsTx, 'Transactions');

        // Sheet 3: TransactionDetails
        const dtHeader = ['detail_id', 'transaction_id', 'amount', 'fee', 'wht', 'type', 'category_id', 'entity_id', 'contact_id', 'project_id', 'note'];
        const catId = (AppState.categories[0]||{}).category_id || 'CAT_XXXX';
        const entId = (AppState.entities[0]||{}).entity_id || 'ENT_XXXX';
        const dtExample = [
            ['D_20260101_001', 'TX_20260101_001', 5000.00, 0, 0, 'INCOME', catId, entId, '', '', 'ตัวอย่างรายการเงินเข้า'],
            ['D_20260101_002', 'TX_20260101_002', -1200.50, 0, 0, 'EXPENSE', catId, entId, '', '', 'ตัวอย่างค่าใช้จ่าย'],
        ];
        const wsDt = XLSX.utils.aoa_to_sheet([dtHeader, ...dtExample]);
        wsDt['!cols'] = [20, 22, 16, 12, 12, 16, 22, 22, 22, 22, 30].map(w => ({ wch: w }));
        wsDt['!freeze'] = { xSplit: 0, ySplit: 1 };
        wsDt['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(dtHeader.length - 1)}1` };
        XLSX.utils.book_append_sheet(wb, wsDt, 'TransactionDetails');

        // Sheet 4: Reference
        XLSX.utils.book_append_sheet(wb, buildReferenceSheet(), '📚 Reference');

        const dateStr = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `RecordRevenue_Template_2Sheet_${dateStr}.xlsx`);
    } catch(e) {
        console.error(e);
        alert('เกิดข้อผิดพลาด: ' + e.message);
    }
}

function downloadTemplateFlat() {
    try {
        const wb = XLSX.utils.book_new();

        // Sheet 1: Instructions
        const instrRows = [
            ['📋 วิธีใช้ Template นำเข้าข้อมูลแบบ Flat (1 Sheet)', ''],
            [''],
            ['วัตถุประสงค์', 'ใช้นำเข้าข้อมูล 1 ชีต — รายการย่อยที่มี Transaction เดียวกัน'],
            ['รูปแบบ', '1 แถว = 1 รายการย่อย — ระบบจะแยก Transaction และ Detail ให้อัตโนมัติ'],
            [''],
            ['คำอธิบายคอลัมน์:', ''],
            ['  transaction_id', 'รหัส Transaction — แถวที่มี transaction_id เดียวกัน = Transaction เดียวกัน'],
            ['  account_id', 'รหัสบัญชี — ดูจาก Sheet "📚 Reference"'],
            ['  date', 'วันที่ YYYY-MM-DD เช่น 2026-01-15'],
            ['  time', 'เวลา HH:MM:SS (ถ้าไม่มีใส่ 00:00:00)'],
            ['  total_amount', 'ยอดรวม Transaction — ใส่ในแถวแรกของแต่ละ transaction_id เท่านั้น'],
            ['  statement_desc', 'คำอธิบาย Statement'],
            ['  ref_code', 'รหัสอ้างอิง'],
            ['  status', 'CONFIRMED หรือ PENDING'],
            ['  source', 'MANUAL / PDF_IMPORT'],
            ['  detail_id', 'รหัส Detail — ต้องไม่ซ้ำกัน เช่น D_20260115_001'],
            ['  amount', 'ยอดรายการย่อย (บาท) — ลบ=ออก บวก=เข้า'],
            ['  fee', 'ค่าธรรมเนียม (0 ถ้าไม่มี)'],
            ['  wht', 'ภาษีหัก ณ ที่จ่าย (0 ถ้าไม่มี)'],
            ['  type', 'INCOME / EXPENSE / TRANSFER_IN / TRANSFER_OUT'],
            ['  category_id', 'รหัสหมวดหมู่ — ดูจาก Sheet "📚 Reference"'],
            ['  entity_id', 'รหัสบริษัท/เจ้าของ'],
            ['  contact_id', 'รหัสคู่ค้า (เว้นว่างได้)'],
            ['  project_id', 'รหัส Project/Trip (เว้นว่างได้)'],
            ['  note', 'หมายเหตุ'],
            [''],
            ['⚠️ ข้อควรระวัง', ''],
            ['  1. แถวที่มี transaction_id เดียวกัน ระบบจะรวมเป็น Transaction เดียว'],
            ['  2. total_amount ควรกรอกแค่แถวแรกของ Transaction นั้น (แถวถัดไปเว้นว่างได้)'],
            ['  3. ลบแถวตัวอย่างออกก่อน Import'],
        ];
        const wsInstr = XLSX.utils.aoa_to_sheet(instrRows);
        wsInstr['!cols'] = [{ wch: 34 }, { wch: 60 }];
        XLSX.utils.book_append_sheet(wb, wsInstr, '📋 วิธีใช้');

        // Sheet 2: Flat Data
        const accId = (AppState.accounts[0]||{}).account_id || 'ACC_XXXX';
        const catId = (AppState.categories[0]||{}).category_id || 'CAT_XXXX';
        const entId = (AppState.entities[0]||{}).entity_id || 'ENT_XXXX';

        const flatHeader = [
            'transaction_id', 'account_id', 'date', 'time', 'total_amount',
            'statement_desc', 'ref_code', 'status', 'source',
            'detail_id', 'amount', 'fee', 'wht', 'type',
            'category_id', 'entity_id', 'contact_id', 'project_id', 'note'
        ];
        const flatExample = [
            // TX with 2 details
            ['TX_20260115_001', accId, '2026-01-15', '14:30:00', 3500.00, 'ค่าบริการลูกค้า ABC', 'REF001', 'CONFIRMED', 'MANUAL',
             'D_20260115_001', 3000.00, 0, 300, 'INCOME', catId, entId, '', '', 'รายได้หลัก'],
            ['TX_20260115_001', '', '', '', '', '', '', '', '',
             'D_20260115_002', 800.00, 0, 80, 'INCOME', catId, entId, '', '', 'รายได้เพิ่มเติม'],
            // TX with 1 detail
            ['TX_20260116_001', accId, '2026-01-16', '09:00:00', -1200.50, 'ค่าน้ำมัน', '', 'CONFIRMED', 'MANUAL',
             'D_20260116_001', -1200.50, 0, 0, 'EXPENSE', catId, entId, '', '', 'ค่าน้ำมันรถ'],
        ];
        const wsFlat = XLSX.utils.aoa_to_sheet([flatHeader, ...flatExample]);
        wsFlat['!cols'] = [22,22,12,10,16,28,14,12,12,20,14,10,10,16,22,22,22,22,28].map(w => ({ wch: w }));
        wsFlat['!freeze'] = { xSplit: 0, ySplit: 1 };
        wsFlat['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(flatHeader.length - 1)}1` };
        XLSX.utils.book_append_sheet(wb, wsFlat, 'Import_Flat');

        // Sheet 3: Reference
        XLSX.utils.book_append_sheet(wb, buildReferenceSheet(), '📚 Reference');

        const dateStr = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `RecordRevenue_Template_Flat_${dateStr}.xlsx`);
    } catch(e) {
        console.error(e);
        alert('เกิดข้อผิดพลาด: ' + e.message);
    }
}

async function initApp() {
    // Restore session if exists
    const storedUser = sessionStorage.getItem("logged_in_user");
    if (storedUser) {
        const user = JSON.parse(storedUser);
        AppState.userId = user.user_id;
        AppState.userName = user.name;
        AppState.userRole = user.role;
        AppState.familyId = user.family_id;
        AppState.allowedEntities = user.allowed_entities || [];

        document.getElementById("current-user-name").innerText = AppState.userName;
        document.querySelector(".user-role").innerText = AppState.userRole === 'admin' ? 'ผู้ดูแลระบบ (Admin)' : 'สมาชิกครอบครัว';
        document.getElementById("login-page").classList.remove("active");
        document.getElementById("login-page").classList.add("hidden");
        document.getElementById("workspace").classList.remove("hidden");
        
        // Show/hide admin options
        if (AppState.userRole === 'admin') {
            document.querySelectorAll(".admin-only").forEach(el => el.classList.remove("hidden"));
        } else {
            document.querySelectorAll(".admin-only").forEach(el => el.classList.add("hidden"));
        }

        // Show mobile bottom navigation
        const isMobile = window.innerWidth <= 992;
        if (isMobile) {
            document.querySelector(".bottom-nav").classList.remove("hidden");
        }

        await fetchMasterData();

        // สำรองข้อมูลอัตโนมัติถ้าเลยกำหนด (Admin เท่านั้น) — ไม่รอผล
        checkScheduledBackup();

        // Check if redirect query exists (from LINE flex link)
        const urlParams = new URLSearchParams(window.location.search);
        const txIdParam = urlParams.get('txId');
        if (txIdParam) {
            switchView('pending');
        } else {
            switchView('dashboard');
        }
    } else {
        // Go to login page
        document.getElementById("login-page").classList.remove("hidden");
        document.getElementById("login-page").classList.add("active");
        document.getElementById("workspace").classList.add("hidden");
        document.querySelector(".bottom-nav").classList.add("hidden");
    }
}

// ==========================================
// 🗺️ NAVIGATION & VIEW SWITCHING
// ==========================================
function bindNavigation() {
    const navItems = document.querySelectorAll(".nav-item");
    navItems.forEach(item => {
        item.addEventListener("click", (e) => {
            e.preventDefault();
            const target = item.getAttribute("data-target");
            switchView(target);
        });
    });

    // Login Action
    const doLogin = async () => {
        const usernameInput = document.getElementById("login-username").value.trim();
        const passwordInput = document.getElementById("login-password").value.trim();
        const errDiv = document.getElementById("login-error");

        if (!usernameInput || !passwordInput) {
            errDiv.innerText = "กรุณากรอกผู้ใช้และรหัสผ่าน";
            errDiv.classList.remove("hidden");
            return;
        }

        errDiv.classList.add("hidden");

        // Show loading spinner
        Swal.fire({
            title: 'กำลังเข้าสู่ระบบ...',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        try {
            const res = await fetch(`${API_BASE}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: usernameInput, password: passwordInput })
            });

            if (!res.ok) {
                const errData = await res.json();
                Swal.close();
                errDiv.innerText = errData.error || "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง";
                errDiv.classList.remove("hidden");
                return;
            }

            const data = await res.json();
            const user = data.user;
            
            AppState.userId = user.user_id;
            AppState.userName = user.name;
            AppState.userRole = user.role;
            AppState.familyId = user.family_id;
            AppState.allowedEntities = user.allowed_entities || [];

            sessionStorage.setItem("logged_in_user", JSON.stringify(user));

            document.getElementById("current-user-name").innerText = AppState.userName;
            document.querySelector(".user-role").innerText = AppState.userRole === 'admin' ? 'ผู้ดูแลระบบ (Admin)' : 'สมาชิกครอบครัว';
            document.getElementById("login-page").classList.remove("active");
            document.getElementById("login-page").classList.add("hidden");
            document.getElementById("workspace").classList.remove("hidden");
            
            // Show/hide admin options
            if (AppState.userRole === 'admin') {
                document.querySelectorAll(".admin-only").forEach(el => el.classList.remove("hidden"));
            } else {
                document.querySelectorAll(".admin-only").forEach(el => el.classList.add("hidden"));
            }

            // Show mobile bottom navigation
            const isMobile = window.innerWidth <= 992;
            if (isMobile) {
                document.querySelector(".bottom-nav").classList.remove("hidden");
            }

            // Fetch master data on login
            await fetchMasterData();
            checkScheduledBackup();
            Swal.close();
            switchView('dashboard');
        } catch (err) {
            Swal.close();
            console.error("Login Error:", err);
            errDiv.innerText = "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์หลังบ้านได้";
            errDiv.classList.remove("hidden");
        }
    };

    document.getElementById("btn-login").addEventListener("click", doLogin);
    document.getElementById("login-password").addEventListener("keypress", (e) => {
        if (e.key === "Enter") doLogin();
    });
    document.getElementById("login-username").addEventListener("keypress", (e) => {
        if (e.key === "Enter") document.getElementById("login-password").focus();
    });

    // Logout Action
    document.getElementById("btn-logout").addEventListener("click", () => {
        sessionStorage.removeItem("logged_in_user");
        document.getElementById("workspace").classList.add("hidden");
        document.querySelector(".bottom-nav").classList.add("hidden");
        document.getElementById("login-page").classList.remove("hidden");
        document.getElementById("login-page").classList.add("active");
        
        document.getElementById("login-username").value = '';
        document.getElementById("login-password").value = '';
        document.getElementById("login-error").classList.add("hidden");
    });
}

function switchView(viewName) {
    // grid-input merged into pending
    if (viewName === 'grid-input') viewName = 'pending';
    AppState.activeView = viewName;

    // หน้า Settings: ล็อกไม่ให้ main-content เลื่อน (เลื่อนเฉพาะกรอบข้อมูลด้านใน)
    const _mc = document.querySelector('.main-content');
    if (_mc) _mc.style.overflowY = (viewName === 'settings') ? 'hidden' : 'auto';
    
    // Update active nav items
    const navItems = document.querySelectorAll(".nav-item");
    navItems.forEach(item => {
        if (item.getAttribute("data-target") === viewName) {
            item.classList.add("active");
        } else {
            item.classList.remove("active");
        }
    });

    // Show active view, hide others
    const views = document.querySelectorAll(".content-view");
    views.forEach(view => {
        if (view.id === `view-${viewName}`) {
            view.classList.remove("hidden");
            view.classList.add("active");
        } else {
            view.classList.add("hidden");
            view.classList.remove("active");
        }
    });

    // Update Header Title
    const titleMap = {
        'dashboard': 'ภาพรวมระบบการเงิน',
        'pending': 'รายการรอตรวจสอบ',
        'history': 'ประวัติธุรกรรมที่ยืนยันแล้ว',

        'debtor': 'ทะเบียนลูกหนี้/เจ้าหนี้คงค้าง',
        'reports': 'รายงานสรุปทางการเงิน',
        'settings': 'ตั้งค่าระบบข้อมูลหลัก',
        'travel': '✈️ TRIPS',
        'puppup': '🗺️ Prototype Trip'
    };
    document.getElementById("page-title").innerText = titleMap[viewName] || 'ระบบบันทึกรายได้';

    // Toggle header action buttons based on view
    const confirmPendingBtn = document.getElementById("btn-confirm-selected-pending");
    const pendingImportActions = document.getElementById("pending-import-actions");
    const gridInputActions = document.getElementById("grid-input-actions");
    const pendingFilterContainer = document.getElementById("pending-filter-container");
    const gridFilterContainer = document.getElementById("grid-filter-container");
    const historyFilterContainer = document.getElementById("history-filter-container");
    
    if (viewName === 'pending') {
        if (pendingImportActions) pendingImportActions.style.display = "flex";
        if (gridInputActions) gridInputActions.style.display = "none";
        if (pendingFilterContainer) pendingFilterContainer.style.display = "flex";
        if (gridFilterContainer) gridFilterContainer.style.display = "none";
        if (historyFilterContainer) historyFilterContainer.style.display = "none";
        // btn-confirm-selected-pending visibility will be managed dynamically by loadPending()
    } else if (viewName === 'history') {
        if (confirmPendingBtn) confirmPendingBtn.style.display = "none";
        if (pendingImportActions) pendingImportActions.style.display = "none";
        if (gridInputActions) gridInputActions.style.display = "none";
        if (pendingFilterContainer) pendingFilterContainer.style.display = "none";
        if (gridFilterContainer) gridFilterContainer.style.display = "none";
        if (historyFilterContainer) historyFilterContainer.style.display = "flex";
    } else {
        if (confirmPendingBtn) confirmPendingBtn.style.display = "none";
        if (pendingImportActions) pendingImportActions.style.display = "none";
        if (gridInputActions) gridInputActions.style.display = "none";
        if (pendingFilterContainer) pendingFilterContainer.style.display = "none";
        if (gridFilterContainer) gridFilterContainer.style.display = "none";
        if (historyFilterContainer) historyFilterContainer.style.display = "none";
    }

    // Trigger specific view loaders
    if (viewName === 'dashboard') loadDashboard();
    else if (viewName === 'pending') loadPending();
    else if (viewName === 'history') loadHistory();
    // grid-input redirected to pending (no loadGridInput needed)
    else if (viewName === 'debtor') { Promise.all([fetchDebts(), fetchTransactions()]).then(() => renderDebtsDashboard()); }
    else if (viewName === 'reports') loadReports();
    else if (viewName === 'settings') { loadSettings(); fitSettingsHeight(); }
    else if (viewName === 'travel') loadTrips();
    else if (viewName === 'puppup') { if (typeof loadPuppupTrip === 'function') loadPuppupTrip(); }
}

// ล็อกความสูงหน้า Settings ให้พอดีจอเป๊ะ (วัดตำแหน่งจริง ไม่เดาตัวเลข)
// → พื้นที่ข้อมูลเลื่อนภายใน หน้าเว็บทั้งหน้าไม่เลื่อน
function fitSettingsHeight() {
    const v = document.getElementById('view-settings');
    if (!v || v.classList.contains('hidden')) return;
    // เลื่อน main-content ขึ้นบนสุดก่อนวัด เพื่อให้ตำแหน่งแม่นยำ
    const main = v.closest('.main-content');
    if (main) main.scrollTop = 0;
    requestAnimationFrame(() => {
        const top = v.getBoundingClientRect().top;
        const avail = window.innerHeight - top - 20;
        if (avail > 220) v.style.height = avail + 'px';
    });
}
window.addEventListener('resize', () => { clearTimeout(window._fitST); window._fitST = setTimeout(fitSettingsHeight, 120); });

// ==========================================
// 📥 MASTER DATA & API FETCHERS
// ==========================================
async function fetchMasterData() {
    try {
        const headers = { 'x-user-id': encodeURIComponent(getUserIdHeader()) };
        
        const safeJson = async (url) => {
            try {
                const r = await fetch(url, { headers });
                const data = await r.json();
                return Array.isArray(data) ? data : [];
            } catch(e) {
                console.error(`fetchMasterData: failed to fetch ${url}`, e);
                return [];
            }
        };

        const [captions, categories, contacts, projects, accounts, entities] = await Promise.all([
            safeJson(`${API_BASE}/api/account-types`),
            safeJson(`${API_BASE}/api/categories`),
            safeJson(`${API_BASE}/api/contacts`),
            safeJson(`${API_BASE}/api/projects`),
            safeJson(`${API_BASE}/api/accounts`),
            safeJson(`${API_BASE}/api/entities`)
        ]);

        AppState.captions = captions;
        AppState.categories = categories;
        AppState.contacts = contacts;
        AppState.projects = projects;
        AppState.accounts = accounts;
        AppState.entities = entities;

        // Populate History Filters
        const statementSelect = document.getElementById("filter-statement");
        if (statementSelect) {
            statementSelect.innerHTML = '<option value="ALL">ทั้งหมด</option>' + accounts.map(a => `<option value="${a.name}">${a.name}</option>`).join('');
        }
        const captionSelect = document.getElementById("filter-caption");
        if (captionSelect) {
            captionSelect.innerHTML = '<option value="ALL">ทั้งหมด</option>' + captions.map(c => `<option value="${c.type_id}">${c.name}</option>`).join('');
        }
        const categorySelect = document.getElementById("filter-category");
        if (categorySelect) {
            categorySelect.innerHTML = '<option value="ALL">ทั้งหมด</option>' + categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
        }
        const companySelect = document.getElementById("filter-company");
        if (companySelect) {
            companySelect.innerHTML = '<option value="ALL">ทั้งหมด</option>' + entities.map(e => `<option value="${e.name}">${e.name}</option>`).join('');
        }
        const customerSelect = document.getElementById("filter-customer");
        if (customerSelect) {
            customerSelect.innerHTML = '<option value="ALL">ทั้งหมด</option>' + contacts.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
        }

        // Update badges
        updatePendingBadge();
    } catch (e) {
        console.error("Error fetching master data:", e);
    }
}

async function updatePendingBadge() {
    try {
        const res = await fetch(`${API_BASE}/api/transactions?status=PENDING_REVIEW`, {
            headers: { 'x-user-id': encodeURIComponent(getUserIdHeader()) }
        });
        const pending = await res.json();
        const badge = document.getElementById("badge-pending");
        const badgeMobile = document.getElementById("badge-pending-mobile");
        if (pending.length > 0) {
            badge.style.display = "inline-block";
            badge.innerText = pending.length;
            if (badgeMobile) { badgeMobile.style.display = "inline-block"; badgeMobile.innerText = pending.length; }
        } else {
            badge.style.display = "none";
            if (badgeMobile) badgeMobile.style.display = "none";
        }
    } catch (e) {}
}

// ==========================================
// 📈 LOAD VIEW: DASHBOARD (Redesigned)
// ==========================================

// State for dashboard v2 (Kawaii Soft)
const DashState = {
    month: null,             // '01'..'12'
    year: null,              // '2026'
    member: 'ALL',           // 'ALL' or user_id — ตัวกรองหลักคือ "สมาชิก" ไม่ใช่บริษัท
    data: null,              // last /api/dashboard/summary response
    openWht: { received: null, withheld: null },  // open month key 'YYYY-MM' per direction
    openPlanIdx: -1,          // which month-tab is open in the calendar
    selPlanDay: null,         // selected day-of-month in the open calendar
    ownerColor: {},           // id -> color index (0-5)
    planMonths: []            // computed list of {key:'YYYY-MM', lbl, days, dow}
};

const DV2_MONTH_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const DV2_DOW_TH = ['อา','จ','อ','พ','พฤ','ศ','ส'];

function dv2F(n) {
    n = Number(n) || 0;
    const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return n < 0 ? '(' + abs + ')' : abs;
}
function dv2Sum(arr, fn) { return (arr || []).reduce((s, x) => s + (fn ? fn(x) : Number(x.amount) || 0), 0); }
function dv2Desc(arr, keyFn) {
    return [...(arr || [])].sort((a, b) => Math.abs((keyFn ? keyFn(b) : b.amount)) - Math.abs((keyFn ? keyFn(a) : a.amount)));
}
function dv2MonthLabel(moStr) {
    if (!moStr) return '-';
    const [y, m] = moStr.split('-');
    return `${DV2_MONTH_TH[parseInt(m, 10) - 1]} ${y}`;
}
function dv2OwnerClass(entityId) {
    if (!entityId) return 'dv2-own-0';
    if (!(entityId in DashState.ownerColor)) {
        DashState.ownerColor[entityId] = Object.keys(DashState.ownerColor).length % 6;
    }
    return 'dv2-own-' + DashState.ownerColor[entityId];
}
function dv2OwnerName(entityId) {
    const e = ((DashState.data && DashState.data.entities) || []).find(x => x.entity_id === entityId);
    return e ? e.name : (entityId || '-');
}
function dv2OwnerTag(entityId) {
    if (DashState.member !== 'ALL' || !entityId) return '';
    return `<span class="dv2-own ${dv2OwnerClass(entityId)}">${dv2OwnerName(entityId)}</span>`;
}
// User Member (สมาชิกที่บันทึกรายการ) — ต่างจาก Owner/Entity (Company ผู้รับรายได้-ค่าใช้จ่าย)
// ใช้แท็กนี้เพื่อบอกว่า "ใครทำรายการ" ส่วน Owner ใช้บอกว่า "รายการนี้เป็นของบริษัทไหน" เท่านั้น
function dv2UserClass(userId) {
    if (!userId) return 'dv2-own-0';
    if (!(userId in DashState.ownerColor)) {
        DashState.ownerColor[userId] = Object.keys(DashState.ownerColor).length % 6;
    }
    return 'dv2-own-' + DashState.ownerColor[userId];
}
function dv2UserTag(userId, userName) {
    if (DashState.member !== 'ALL' || !userId) return '';
    return `<span class="dv2-own ${dv2UserClass(userId)}">${userName || '-'}</span>`;
}
function dv2StopSign(id) {
    return `<svg viewBox="0 0 26 34" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="pole${id}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#8A95A3"/><stop offset=".35" stop-color="#D6DDE6"/>
        <stop offset=".62" stop-color="#AEB8C4"/><stop offset="1" stop-color="#6E7A88"/>
      </linearGradient>
      <linearGradient id="face${id}" x1=".2" y1="0" x2=".8" y2="1">
        <stop offset="0" stop-color="#F0574C"/><stop offset=".5" stop-color="#D8342B"/>
        <stop offset="1" stop-color="#A81F19"/>
      </linearGradient>
      <linearGradient id="edge${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#B02A22"/><stop offset="1" stop-color="#7C140F"/>
      </linearGradient>
    </defs>
    <rect x="11.2" y="17" width="3.6" height="16" rx="1.2" fill="url(#pole${id})"/>
    <ellipse cx="13" cy="32.6" rx="5" ry="1.5" fill="rgba(0,0,0,.2)"/>
    <path d="M8.6 20.4 L4.2 16 v-5.6 L8.6 6 h8.8 L21.8 10.4 V16 L17.4 20.4 z"
      fill="url(#edge${id})" transform="translate(0,1.1)"/>
    <path d="M8.6 20.4 L4.2 16 v-5.6 L8.6 6 h8.8 L21.8 10.4 V16 L17.4 20.4 z"
      fill="url(#face${id})" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M8.9 7.4 h8.2 L20.5 10.8 v1.1 L17 8.6 H9 z" fill="rgba(255,255,255,.32)"/>
    <text x="13" y="14.6" text-anchor="middle" font-family="Kanit,sans-serif"
      font-size="5.4" font-weight="700" fill="#fff" letter-spacing=".2">STOP</text>
  </svg>`;
}

async function loadDashboardV2Data() {
    const headers = { 'x-user-id': encodeURIComponent(getUserIdHeader()) };
    const now = new Date();
    if (!DashState.month) {
        DashState.month = String(now.getMonth() + 1).padStart(2, '0');
        DashState.year = String(now.getFullYear());
    }
    const monthStr = `${DashState.year}-${DashState.month}`;
    const res = await fetch(`${API_BASE}/api/dashboard/summary?month=${monthStr}&member=${encodeURIComponent(DashState.member)}`, { headers });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    DashState.data = data;
}

function dv2SetMember(id) { DashState.member = id; loadDashboard(); }
function dv2ChangeMonth(delta) {
    let m = parseInt(DashState.month, 10) + delta;
    let y = parseInt(DashState.year, 10);
    if (m < 1) { m = 12; y--; } else if (m > 12) { m = 1; y++; }
    DashState.month = String(m).padStart(2, '0');
    DashState.year = String(y);
    loadDashboard();
}

// ── Hero ──
function dv2Hero() {
    const d = DashState.data;
    const accounts = (d.accounts || []).filter(a => a.account_type !== 'CREDIT');
    const sBal = dv2Sum(accounts, a => a.balance);
    const sIn = dv2Sum(d.income);
    const sOut = dv2Sum(d.expense, x => Math.abs(x.amount));
    const tot = sIn + sOut;
    const pIn = tot ? (sIn / tot * 100) : 50;
    const pOut = 100 - pIn;
    const mLabel = dv2MonthLabel(`${DashState.year}-${DashState.month}`);
    const memberChips = [`<span class="dv2-chip${DashState.member==='ALL'?' on':''}" onclick="dv2SetMember('ALL')">ทั้งครอบครัว</span>`]
        .concat((d.members || []).map(m => `<span class="dv2-chip${DashState.member===m.user_id?' on':''}" onclick="dv2SetMember('${m.user_id}')">${m.name}</span>`)).join('');
    return `<div class="dv2-hero">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:13px">
        <div><div class="dv2-sm">ยอดเงินคงเหลือรวม · เงินฝาก/เงินสด ${DashState.member==='ALL'?'· ทั้งครอบครัว':''}</div>
          <div class="dv2-big">${dv2F(sBal)}</div>
          <div class="dv2-xs" style="margin-top:6px">กระแสเงินสด ${mLabel} · <b>${dv2F(sIn-sOut)}</b></div></div>
        <div style="display:flex;gap:5px;flex-wrap:wrap">${memberChips}</div>
      </div>
      <div class="dv2-hgauge"><div class="dv2-hseg dv2-hin" style="width:${pIn}%"><span>รับ ${dv2F(sIn)}</span></div>
        <div class="dv2-hseg dv2-hout" style="width:${pOut}%"><span>จ่าย ${dv2F(sOut)}</span></div></div>
      <div style="display:flex;justify-content:space-between;font-size:.7rem;margin-top:7px;color:rgba(255,255,255,.95)">
        <span>▲ รับเข้า ${pIn.toFixed(1)}%</span><span>${pOut.toFixed(1)}% จ่ายออก ▼</span></div></div>`;
}

function dv2LI(arr, cls) {
    return arr.map(x => `<div class="dv2-item">
      <div class="dv2-itxt"><div class="dv2-iname">${x.title}</div>
        <div class="dv2-imeta">${(x.date||'').substring(0,10)}${dv2UserTag(x.user_id, x.user_name)}</div></div>
      <div class="dv2-iamt ${cls}">${dv2F(x.amount)}</div></div>`).join('');
}

function dv2Income() {
    const a = dv2Desc(DashState.data.income, x => x.amount);
    return `<div class="dv2-card"><h3><span class="dv2-ti"><span class="dv2-ico">📥</span>รายรับ</span>
      <span class="dv2-xs">${a.length} รายการ</span></h3>
      <div class="dv2-mid dv2-pos" style="margin-bottom:9px">${dv2F(dv2Sum(a))}</div>
      <div class="dv2-list">${a.length ? dv2LI(a,'dv2-pos') : '<div class="dv2-xs" style="text-align:center;padding:14px 0">ไม่มีรายการ</div>'}</div></div>`;
}
function dv2Expense() {
    const a = dv2Desc(DashState.data.expense, x => x.amount);
    return `<div class="dv2-card"><h3><span class="dv2-ti"><span class="dv2-ico">📤</span>รายจ่าย</span>
      <span class="dv2-xs">${a.length} รายการ</span></h3>
      <div class="dv2-mid dv2-neg" style="margin-bottom:9px">${dv2F(Math.abs(dv2Sum(a)))}</div>
      <div class="dv2-list">${a.length ? dv2LI(a.map(x=>({...x,amount:Math.abs(x.amount)})),'dv2-neg') : '<div class="dv2-xs" style="text-align:center;padding:14px 0">ไม่มีรายการ</div>'}</div></div>`;
}
function dv2Avg() {
    const d = DashState.data;
    const daysInMonth = new Date(parseInt(DashState.year), parseInt(DashState.month), 0).getDate();
    const today = new Date();
    const isCurrentMonth = DashState.year === String(today.getFullYear()) && DashState.month === String(today.getMonth()+1).padStart(2,'0');
    const dayOfMonth = isCurrentMonth ? today.getDate() : daysInMonth;
    const sOut = dv2Sum(d.expense, x => Math.abs(x.amount));
    const perDay = dayOfMonth ? sOut / dayOfMonth : 0;
    const worst = d.expense.length ? d.expense.reduce((m,x)=>Math.abs(x.amount)>Math.abs(m.amount)?x:m, d.expense[0]) : null;
    return `<div class="dv2-card"><h3><span class="dv2-ti"><span class="dv2-ico">📊</span>เฉลี่ย</span></h3>
      <div class="dv2-mid dv2-accent" style="margin-bottom:9px">${dv2F(perDay)}</div>
      <div class="dv2-list">
        <div class="dv2-item"><div class="dv2-itxt"><div class="dv2-iname">เฉลี่ยรายจ่ายต่อวัน</div>
          <div class="dv2-imeta">${dayOfMonth} วันผ่านไป</div></div><div class="dv2-iamt">${dv2F(perDay)}</div></div>
        <div class="dv2-item"><div class="dv2-itxt"><div class="dv2-iname">รายจ่ายสูงสุดรายการเดียว</div>
          <div class="dv2-imeta">${worst ? (worst.date||'').substring(0,10) : '—'}${worst?dv2UserTag(worst.user_id, worst.user_name):''}</div></div>
          <div class="dv2-iamt dv2-neg">${dv2F(worst?Math.abs(worst.amount):0)}</div></div>
        <div class="dv2-item"><div class="dv2-itxt"><div class="dv2-iname">คาดการณ์ทั้งเดือน</div>
          <div class="dv2-imeta">${daysInMonth} วัน</div></div><div class="dv2-iamt">${dv2F(perDay*daysInMonth)}</div></div>
        <div class="dv2-item"><div class="dv2-itxt"><div class="dv2-iname">เฉลี่ยรายรับ/รายการ</div>
          <div class="dv2-imeta">${d.income.length} รายการ</div></div>
          <div class="dv2-iamt dv2-pos">${dv2F(d.income.length ? dv2Sum(d.income)/d.income.length : 0)}</div></div>
        <div class="dv2-item"><div class="dv2-itxt"><div class="dv2-iname">เฉลี่ยรายจ่าย/รายการ</div>
          <div class="dv2-imeta">${d.expense.length} รายการ</div></div>
          <div class="dv2-iamt dv2-neg">${dv2F(d.expense.length ? sOut/d.expense.length : 0)}</div></div>
      </div></div>`;
}

// ── Statement / Credit / Investment ──
function dv2Stmt() {
    const a = dv2Desc((DashState.data.accounts||[]).filter(x=>x.account_type!=='CREDIT'), x=>x.balance);
    return `<div class="dv2-card"><h3><span class="dv2-ti"><span class="dv2-ico">🏦</span>Statement · เงินฝาก/เงินสด</span>
      <span class="dv2-xs">${a.length} บัญชี</span></h3>
      <div class="dv2-mid dv2-accent" style="margin-bottom:9px">${dv2F(dv2Sum(a,x=>x.balance))}</div>
      <div class="dv2-list">${a.length ? a.map(x=>`<div class="dv2-item">
        <div class="dv2-itxt"><div class="dv2-iname"><span class="dv2-ico" style="font-size:.95rem">${x.account_type==='CASH'?'💵':'🏦'}</span> ${x.name}</div>
          <div class="dv2-imeta">${x.bank_name||''}${dv2OwnerTag(x.entity_id)}</div></div>
        <div class="dv2-iamt">${dv2F(x.balance)}</div></div>`).join('') : '<div class="dv2-xs" style="text-align:center;padding:14px 0">ยังไม่มีบัญชี</div>'}</div></div>`;
}
function dv2Credit() {
    const a = dv2Desc((DashState.data.accounts||[]).filter(x=>x.account_type==='CREDIT'), x=>x.balance);
    const uTot = dv2Sum(a, x=>Math.abs(x.balance));
    const lTot = dv2Sum(a, x=>x.credit_limit||0);
    return `<div class="dv2-card"><h3><span class="dv2-ti"><span class="dv2-ico">💳</span>Credit Card · ยอดใช้ไป</span>
      <span class="dv2-xs">${a.length} ใบ</span></h3>
      <div class="dv2-mid dv2-neg" style="margin-bottom:4px">${dv2F(uTot)}</div>
      <div class="dv2-xs" style="margin-bottom:9px">วงเงินรวม ${dv2F(lTot)} · ใช้ไป ${lTot?(uTot/lTot*100).toFixed(1):0}% · เหลือ ${dv2F(lTot-uTot)}</div>
      <div class="dv2-list">${a.length ? a.map(x=>{
        const use = Math.abs(x.balance); const lim = x.credit_limit || 0;
        const p = lim ? Math.min(100, use/lim*100) : 0;
        const col = p>=80?'#C9352C':(p>=50?'#DE8E12':'#3E8F58');
        const due = x.due_day ? `ครบกำหนดวันที่ ${x.due_day}` : 'ยังไม่ตั้งวันครบกำหนด';
        return `<div class="dv2-item" style="display:block">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:9px">
            <div class="dv2-itxt"><div class="dv2-iname"><span class="dv2-ico" style="font-size:.95rem">💳</span> ${x.name}</div>
              <div class="dv2-imeta">${due} · วงเงิน ${dv2F(lim)}${dv2OwnerTag(x.entity_id)}</div></div>
            <div class="dv2-iamt ${use>0?'dv2-neg':''}">${dv2F(use)}</div></div>
          <div style="position:relative;height:6px;background:rgba(0,0,0,.07);border-radius:4px;margin-top:6px">
            <div style="position:absolute;left:0;top:0;height:100%;border-radius:4px;width:${p}%;background:${col};box-shadow:inset 0 1px 0 rgba(255,255,255,.4)"></div></div></div>`;
      }).join('') : '<div class="dv2-xs" style="text-align:center;padding:14px 0">ยังไม่มีบัตรเครดิต</div>'}</div></div>`;
}
function dv2Invest() {
    const a = dv2Desc(DashState.data.investment, x=>x.amount);
    const tot = dv2Sum(a), pos = dv2Sum(a.filter(x=>x.amount>0)), neg = dv2Sum(a.filter(x=>x.amount<0));
    return `<div class="dv2-card"><h3><span class="dv2-ti"><span class="dv2-ico">💎</span>Investment · เงินลงทุน</span>
      <span class="dv2-xs">${a.length} รายการ</span></h3>
      <div class="dv2-mid ${tot>=0?'dv2-pos':'dv2-neg'}" style="margin-bottom:4px">${dv2F(tot)}</div>
      <div class="dv2-xs" style="margin-bottom:9px">กำไร/ถือครอง ${dv2F(pos)} · ขาดทุน ${dv2F(neg)}</div>
      <div class="dv2-list">${a.length ? a.map(x=>`<div class="dv2-item">
        <div class="dv2-itxt"><div class="dv2-iname"><span class="dv2-ico" style="font-size:.95rem">${x.amount>=0?'📈':'📉'}</span> ${x.category_name||x.title}</div>
          <div class="dv2-imeta">${x.title||''}${dv2UserTag(x.user_id, x.user_name)}</div></div>
        <div class="dv2-iamt ${x.amount>=0?'dv2-pos':'dv2-neg'}">${dv2F(x.amount)}</div></div>`).join('') : '<div class="dv2-xs" style="text-align:center;padding:14px 0">ยังไม่มีเงินลงทุน</div>'}</div></div>`;
}

// ── เงินไปไหน ──
function dv2BudgetRow(b, i) {
    const scale = Math.max(b.spent, b.budget) * 1.15 || 1;
    const wUse = Math.min(100, b.spent/scale*100);
    const wBud = Math.min(100, b.budget/scale*100);
    const over = b.spent > b.budget && b.budget > 0;
    const diff = Math.abs(b.spent - b.budget);
    const pct = b.budget ? (b.spent/b.budget*100) : 0;
    const grad = over ? 'linear-gradient(180deg,#F0625A,#C9352C)' : (pct>=80?'linear-gradient(180deg,#F5B34D,#DE8E12)':'linear-gradient(180deg,#6BBB80,#3E8F58)');
    const amtCls = over?'dv2-neg':(pct>=80?'':'dv2-pos');
    return `<div>
      <div class="dv2-split"><span style="font-size:.8rem;font-weight:500;cursor:pointer" onclick="dv2OpenBudgetModal('${b.category_id}')">${b.category_name}</span>
        <span class="dv2-iamt ${amtCls}">${dv2F(b.spent)} / ${b.budget?dv2F(b.budget):'ยังไม่ตั้งงบ'}</span></div>
      <div class="dv2-gauge"><div class="dv2-gfill" style="width:${wUse}%;background:${grad}"></div>
        ${b.budget ? `<div class="dv2-gstop" style="left:${wBud}%">${dv2StopSign('b'+i)}</div>` : ''}</div>
      <div class="dv2-xs ${over?'dv2-neg':''}">${b.budget ? (over?`เกินงบ ${dv2F(diff)}`:`เหลือ ${dv2F(diff)}`) : 'แตะชื่อหมวดเพื่อตั้งงบ'}</div></div>`;
}
function dv2Budget() {
    const b = DashState.data.budget || [];
    return `<div class="dv2-card"><h3><span class="dv2-ti"><span class="dv2-ico">🎯</span>เงินไปไหน · เทียบงบ</span>
      <span class="dv2-xs">รวมทั้งครอบครัว · ${b.length} หมวด · ใช้ ${dv2F(dv2Sum(b,x=>x.spent))} / งบ ${dv2F(dv2Sum(b,x=>x.budget))}</span></h3>
      <div class="dv2-bcols">${b.length ? b.map((x,i)=>dv2BudgetRow(x,i)).join('') : '<div class="dv2-xs">ยังไม่มีค่าใช้จ่ายในเดือนนี้</div>'}</div></div>`;
}

// ── AR / AP ──
function dv2AR() {
    const a = dv2Desc(DashState.data.ar, x=>x.amount);
    return `<div class="dv2-card"><h3><span class="dv2-ti"><span class="dv2-ico">💰</span>ลูกหนี้ · รับเข้า</span>
      <span style="display:flex;gap:5px"><span class="dv2-chip" onclick="dv2ExportList('ar','PDF')">PDF</span><span class="dv2-chip" onclick="dv2ExportList('ar','Excel')">XLS</span></span></h3>
      <div class="dv2-mid dv2-pos" style="margin-bottom:9px">${dv2F(dv2Sum(a))}</div>
      <div class="dv2-list">${a.length ? a.map(x=>`<div class="dv2-item"><div class="dv2-itxt"><div class="dv2-iname">${x.party}</div>
        <div class="dv2-imeta">${x.count} รายการ${dv2OwnerTag(x.entity_id)}</div></div><div class="dv2-iamt dv2-pos">${dv2F(x.amount)}</div></div>`).join('') : '<div class="dv2-xs" style="text-align:center;padding:14px 0">ไม่มีลูกหนี้คงค้าง</div>'}</div></div>`;
}
function dv2AP() {
    const a = dv2Desc(DashState.data.ap, x=>x.amount);
    return `<div class="dv2-card"><h3><span class="dv2-ti"><span class="dv2-ico">🧾</span>เจ้าหนี้ · ต้องจ่าย</span>
      <span style="display:flex;gap:5px"><span class="dv2-chip" onclick="dv2ExportList('ap','PDF')">PDF</span><span class="dv2-chip" onclick="dv2ExportList('ap','Excel')">XLS</span></span></h3>
      <div class="dv2-mid dv2-neg" style="margin-bottom:9px">${dv2F(dv2Sum(a))}</div>
      <div class="dv2-list">${a.length ? a.map(x=>`<div class="dv2-item"><div class="dv2-itxt"><div class="dv2-iname">${x.party}</div>
        <div class="dv2-imeta">${x.count} รายการ${dv2OwnerTag(x.entity_id)}</div></div><div class="dv2-iamt dv2-neg">${dv2F(x.amount)}</div></div>`).join('') : '<div class="dv2-xs" style="text-align:center;padding:14px 0">ไม่มีเจ้าหนี้ค้างจ่าย</div>'}</div></div>`;
}
function dv2ExportList(key, kind) {
    const src = key === 'ar' ? DashState.data.ar : DashState.data.ap;
    const rows = dv2Desc(src, x=>x.amount);
    const title = key === 'ar' ? 'ลูกหนี้ (รับเข้า)' : 'เจ้าหนี้ (ต้องจ่าย)';
    const cols = [
        { h: 'คู่ค้า', w: 240, get: r => r.party },
        { h: 'จำนวนรายการ', w: 100, get: r => r.count, align:'c' },
        { h: 'บริษัท/เจ้าของ', w: 160, get: r => r.entity_name || '-' },
        { h: 'ยอดคงเหลือ', w: 120, get: r => dv2F(r.amount), raw: r => r.amount, align:'r', num:true, total:true }
    ];
    if (kind === 'PDF') dv2OpenReportWindow(title, `ณ วันที่ ${new Date().toLocaleDateString('th-TH')}`, cols, rows);
    else dv2ExportExcel(title, cols, rows);
}

// ── WHT ──
function dv2WhtCard(key, title, sub, baseLbl) {
    const arr = (DashState.data.wht && DashState.data.wht[key]) || [];
    const g = {};
    arr.forEach(x => { (g[x.mo] = g[x.mo] || []).push(x); });
    const months = Object.keys(g).sort((p,q) => dv2Sum(g[q],x=>x.wht) - dv2Sum(g[p],x=>x.wht));
    const open = DashState.openWht[key];
    return `<div class="dv2-card"><h3><span class="dv2-ti"><span class="dv2-ico">${key==='received'?'📋':'🏛️'}</span>${title}</span>
      <span class="dv2-xs">${sub}</span></h3>
      <div class="dv2-mid dv2-accent" style="margin-bottom:9px">${dv2F(dv2Sum(arr,x=>x.wht))}</div>
      <div class="dv2-list">${months.length ? months.map(mo => {
        const rows = dv2Desc(g[mo], x=>x.wht);
        const on = open === mo;
        return `<div style="border-bottom:1px solid var(--line)">
          <div class="dv2-item" style="border-bottom:none;cursor:pointer" onclick="dv2ToggleWht('${key}','${mo}')">
            <div class="dv2-itxt"><div class="dv2-iname"><span style="display:inline-block;width:12px;color:var(--ac)">${on?'▾':'▸'}</span> ${dv2MonthLabel(mo)}</div>
              <div class="dv2-imeta">${rows.length} รายการ</div></div>
            <div class="dv2-iamt">${dv2F(dv2Sum(rows,x=>x.wht))}</div></div>
          ${on ? `<div class="dv2-whtdetail">
            <div class="dv2-whthd"><span>วันที่</span><span>รายการ</span><span>Company</span><span>Customer</span><span>ค่าบริการ</span><span>${baseLbl}</span><span>User</span></div>
            ${rows.map(r => `<div class="dv2-whtrow">
              <span>${r.date}</span><span title="${r.title}">${r.title}</span>
              <span title="${r.company}">${r.company}</span><span title="${r.customer}">${r.customer}</span>
              <span class="dv2-num">${dv2F(r.base)}</span><span class="dv2-num">${dv2F(r.wht)}</span>
              <span>${r.user_id?`<span class="dv2-own ${dv2UserClass(r.user_id)}">${r.user_name||'-'}</span>`:'—'}</span></div>`).join('')}
            <div class="dv2-whtrow dv2-whtsum">
              <span></span><span></span><span></span><span>รวมเดือนนี้</span>
              <span class="dv2-num">${dv2F(dv2Sum(rows,x=>x.base))}</span><span class="dv2-num">${dv2F(dv2Sum(rows,x=>x.wht))}</span><span></span></div>
            <div class="dv2-whtexp">
              <span class="dv2-chip" onclick="event.stopPropagation();dv2ExportWht('PDF','${key}','${title}','${baseLbl}','${mo}')">📄 PDF · ${dv2MonthLabel(mo)}</span>
              <span class="dv2-chip" onclick="event.stopPropagation();dv2ExportWht('Excel','${key}','${title}','${baseLbl}','${mo}')">📊 Excel · ${dv2MonthLabel(mo)}</span></div></div>` : ''}
        </div>`;
      }).join('') : '<div class="dv2-xs" style="text-align:center;padding:14px 0">ไม่มีรายการในปีนี้</div>'}</div>
      <div class="dv2-row dv2-tot"><span>รวมทั้งปี</span><span class="dv2-iamt dv2-accent">${dv2F(dv2Sum(arr,x=>x.wht))}</span></div></div>`;
}
function dv2ToggleWht(key, mo) {
    DashState.openWht[key] = (DashState.openWht[key] === mo) ? null : mo;
    dv2Render();
}

// ── Export: report window (print→PDF) + styled Excel ──
function dv2ColTotals(cols, rows) {
    return cols.map(c => c.total ? dv2Sum(rows, c.raw || (r => parseFloat(String(c.get(r)).replace(/[(),]/g, m => m === '(' ? '-' : '')) || 0)) : null);
}
function dv2ReportWindowHTML(title, subtitle, cols, rows) {
    const totals = dv2ColTotals(cols, rows);
    const firstTotalIdx = totals.findIndex(t => t !== null);
    const tb = rows.map((r,i) => `<tr class="${i%2?'alt':''}"><td class="c">${i+1}</td>${cols.map(c=>`<td class="${c.align==='r'?'r':(c.align==='c'?'c':'')}">${c.get(r)}</td>`).join('')}</tr>`).join('');
    const tfootCells = cols.map((c,i) => {
        if (totals[i] !== null) return `<td class="r">${dv2F(totals[i])}</td>`;
        if (i === firstTotalIdx - 1) return `<td style="text-align:right">รวมทั้งสิ้น</td>`;
        return `<td></td>`;
    }).join('');
    return `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Sarabun',sans-serif;background:#F4F7FB;padding:28px;color:#16233A}
.sheet{max-width:1000px;margin:0 auto;background:#fff;border:1px solid #C9D9EC;border-radius:10px;overflow:hidden;box-shadow:0 6px 26px rgba(20,60,110,.1)}
.hd{background:linear-gradient(135deg,#0B2E63,#164A96);color:#fff;padding:20px 26px}
.hd h1{font-size:1.22rem;font-weight:700}
.hd .sub{font-size:.83rem;color:#A9CDF5;margin-top:5px;font-weight:400}
table{width:100%;border-collapse:collapse;font-size:.81rem}
thead th{background:#164A96;color:#B9D8FA;font-weight:600;font-size:.76rem;padding:11px 10px;text-align:center;border-right:1px solid rgba(255,255,255,.16);border-bottom:2px solid #0B2E63;white-space:nowrap}
thead th:last-child{border-right:none}
tbody td{padding:9px 10px;border-right:1px solid #DCE7F4;border-bottom:1px solid #E7EFF8;font-weight:400;color:#1D2C42}
tbody td:last-child{border-right:none}
tbody tr.alt td{background:#F7FAFE}
td.r{text-align:right;font-variant-numeric:tabular-nums} td.c{text-align:center}
tfoot td{background:#EEF4FC;font-weight:700;color:#0B2E63;padding:12px 10px;border-top:2px solid #164A96;border-right:1px solid #DCE7F4}
tfoot td:last-child{border-right:none} tfoot td.r{text-align:right;font-variant-numeric:tabular-nums}
.ft{padding:15px 26px;font-size:.71rem;color:#63758E;display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;border-top:1px solid #E7EFF8}
.bar{max-width:1000px;margin:0 auto 16px;display:flex;gap:9px;justify-content:flex-end}
.bar button{padding:9px 18px;border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-size:.82rem;font-weight:600;background:#164A96;color:#fff}
.bar button.alt{background:#fff;color:#164A96;border:1.5px solid #164A96}
@media print{body{background:#fff;padding:0}.bar{display:none}.sheet{border:none;box-shadow:none;border-radius:0}}
</style></head><body>
<div class="bar"><button onclick="window.print()">🖨️ พิมพ์ / บันทึกเป็น PDF</button><button class="alt" onclick="window.close()">ปิด</button></div>
<div class="sheet"><div class="hd"><h1>${title}</h1><div class="sub">${subtitle}</div></div>
<table><thead><tr><th style="width:42px">ลำดับ</th>${cols.map(c=>`<th style="width:${c.w}px">${c.h}</th>`).join('')}</tr></thead>
<tbody>${tb}</tbody>
<tfoot><tr><td></td>${tfootCells}</tr></tfoot></table>
<div class="ft"><span>เอกสารนี้จัดทำโดยระบบ RecordRevenue</span><span>วันที่ออกรายงาน ${new Date().toLocaleDateString('th-TH')}</span></div></div>
</body></html>`;
}
function dv2OpenReportWindow(title, subtitle, cols, rows) {
    const w = window.open('', '_blank', 'width=1080,height=760');
    if (!w) { alert('เบราว์เซอร์บล็อกป๊อปอัป — กรุณาอนุญาตแล้วลองใหม่'); return; }
    w.document.write(dv2ReportWindowHTML(title, subtitle, cols, rows));
    w.document.close();
}
function dv2ExportExcel(filename, cols, rows) {
    const XL = (typeof XLSXStyle !== 'undefined') ? XLSXStyle : XLSX;
    if (typeof XL === 'undefined') { alert('ไม่พบไลบรารีส่งออกไฟล์ กรุณารีเฟรชหน้าเว็บ'); return; }
    const numFmt = '#,##0.00_);(#,##0.00)';
    const blueHdr = { font:{bold:true,color:{rgb:'FFFFFF'},sz:11}, fill:{fgColor:{rgb:'2563EB'},patternType:'solid'},
        alignment:{horizontal:'center',vertical:'center'}, border:{top:{style:'thin',color:{rgb:'BFDBFE'}},bottom:{style:'thin',color:{rgb:'BFDBFE'}},left:{style:'thin',color:{rgb:'BFDBFE'}},right:{style:'thin',color:{rgb:'BFDBFE'}}} };
    const cellStyle = { font:{color:{rgb:'1D4ED8'}}, border:{top:{style:'thin',color:{rgb:'DBEAFE'}},bottom:{style:'thin',color:{rgb:'DBEAFE'}},left:{style:'thin',color:{rgb:'DBEAFE'}},right:{style:'thin',color:{rgb:'DBEAFE'}}} };
    const totals = dv2ColTotals(cols, rows);
    const firstTotalIdx = totals.findIndex(t => t !== null);
    const header = ['ลำดับ', ...cols.map(c=>c.h)];
    const aoa = [header];
    rows.forEach((r,i) => aoa.push([i+1, ...cols.map(c => c.num ? (c.raw ? c.raw(r) : (parseFloat(String(c.get(r)).replace(/[(),]/g, m => m === '(' ? '-' : '')) || 0)) : c.get(r))]));
    aoa.push(['', ...cols.map((c,i) => totals[i] !== null ? totals[i] : (i === firstTotalIdx - 1 ? 'รวมทั้งสิ้น' : ''))]);
    const ws = XL.utils.aoa_to_sheet(aoa);
    const range = XL.utils.decode_range(ws['!ref']);
    for (let C = range.s.c; C <= range.e.c; C++) {
        const hc = XL.utils.encode_cell({ r:0, c:C });
        if (ws[hc]) ws[hc].s = blueHdr;
    }
    for (let R = 1; R <= range.e.r; R++) {
        for (let C = range.s.c; C <= range.e.c; C++) {
            const cellRef = XL.utils.encode_cell({ r:R, c:C });
            if (ws[cellRef]) {
                ws[cellRef].s = { ...cellStyle, font: R === range.e.r ? { ...cellStyle.font, bold: true } : cellStyle.font };
                if (C > 0 && cols[C-1] && cols[C-1].num) ws[cellRef].z = numFmt;
            }
        }
    }
    ws['!cols'] = [{wch:6}, ...cols.map(c=>({wch:Math.round((c.w||100)/7)}))];
    const wb = XL.utils.book_new();
    XL.utils.book_append_sheet(wb, ws, filename.slice(0,28));
    XL.writeFile(wb, `${filename}_${new Date().toISOString().slice(0,10)}.xlsx`);
}
function dv2ExportWht(kind, key, title, baseLbl, mo) {
    const arr = ((DashState.data.wht && DashState.data.wht[key]) || []).filter(x => x.mo === mo);
    const rows = dv2Desc(arr, x=>x.wht);
    const cols = [
        { h:'วันที่', w:90, get:r=>r.date },
        { h:'รายการ', w:160, get:r=>r.title },
        { h:'Company', w:160, get:r=>r.company },
        { h:'Customer', w:160, get:r=>r.customer },
        { h:'ค่าบริการ', w:100, get:r=>dv2F(r.base), raw:r=>r.base, align:'r', num:true, total:true },
        { h:baseLbl, w:100, get:r=>dv2F(r.wht), raw:r=>r.wht, align:'r', num:true, total:true },
        { h:'User', w:100, get:r=>r.user_id?(r.user_name||'-'):'—', align:'c' }
    ];
    if (kind === 'PDF') dv2OpenReportWindow(`รายงาน${title}`, `ประจำเดือน ${dv2MonthLabel(mo)} · RecordRevenue`, cols, rows);
    else dv2ExportExcel(`${title}_${mo}`, cols, rows);
}

// ── แผนรายจ่ายล่วงหน้า + ปฏิทิน ──
function dv2BuildPlanMonths() {
    const now = new Date();
    const months = [];
    for (let i = 0; i < 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const y = d.getFullYear(), m = d.getMonth();
        const days = new Date(y, m + 1, 0).getDate();
        const dow = new Date(y, m, 1).getDay();
        months.push({ key: `${y}-${String(m+1).padStart(2,'0')}`, lbl: DV2_MONTH_TH[m], y, days, dow });
    }
    DashState.planMonths = months;
    return months;
}
function dv2PlanItemsForMonth(mkey) {
    return (DashState.data.plans || []).filter(p => (p.due_date||'').substring(0,7) === mkey);
}
function dv2PlanMonthTotal(mkey) { return dv2Sum(dv2PlanItemsForMonth(mkey), x=>x.amount); }
function dv2PlanActionIcons(p) {
    return `<span class="dv2-actions">
      <span onclick="event.stopPropagation();dv2OpenPlanModal('${p.plan_id}')" title="แก้ไข">✏️</span>
      <span onclick="event.stopPropagation();dv2DonePlan('${p.plan_id}')" title="ทำแล้ว">✅</span>
      <span onclick="event.stopPropagation();dv2DeletePlan('${p.plan_id}')" title="ลบ">🗑️</span></span>`;
}
function dv2CalHTML(mi) {
    const m = DashState.planMonths[mi];
    const items = dv2PlanItemsForMonth(m.key);
    const byDay = {};
    items.forEach(x => { const day = parseInt((x.due_date||'').substring(8,10),10); (byDay[day]=byDay[day]||[]).push(x); });
    let c = '';
    for (let i=0; i<m.dow; i++) c += '<div class="dv2-cday empty"></div>';
    for (let d=1; d<=m.days; d++) {
        const has = byDay[d];
        const sum = has ? dv2Sum(has) : 0;
        const sel = (DashState.selPlanDay === d) ? ' sel' : '';
        c += `<div class="dv2-cday${has?' has':''}${sel}" ${has?`onclick="dv2PickPlanDay(${d})"`:''}>
          <span class="dv2-cn">${d}</span>${has?`<span class="dv2-ca">${dv2F(sum)}</span>`:''}</div>`;
    }
    let detail = '';
    if (DashState.selPlanDay && byDay[DashState.selPlanDay]) {
        const dItems = byDay[DashState.selPlanDay];
        detail = `<div class="dv2-caldetail"><div class="dv2-xs" style="margin-bottom:7px">
          <b style="color:var(--h3);font-size:.8rem">${DashState.selPlanDay} ${m.lbl} ${m.y}</b> · ${dItems.length} รายการ</div>
          ${dItems.map(x => `<div class="dv2-item">
            <div class="dv2-itxt"><div class="dv2-iname"><span class="dv2-ico" style="font-size:.94rem">${x.icon||'💡'}</span> ${x.title}
              ${x.recurrence && x.recurrence!=='NONE' ? `<span class="dv2-chip" style="font-size:.62rem;padding:1px 7px">${x.recurrence==='MONTHLY'?'ทุกเดือน':x.recurrence==='QUARTERLY'?'ทุกไตรมาส':'ทุกปี'}</span>` : ''}</div>
              <div class="dv2-imeta">${dv2UserTag(x.created_by_user_id, x.user_name)}</div></div>
            <div style="display:flex;align-items:center;gap:9px"><span class="dv2-iamt dv2-neg">${dv2F(x.amount)}</span>${dv2PlanActionIcons(x)}</div></div>`).join('')}</div>`;
    } else {
        detail = `<div class="dv2-caldetail dv2-xs" style="text-align:center;padding:6px 0">แตะวันที่มีเงินเพื่อดูรายละเอียด</div>`;
    }
    return `<div class="dv2-calwrap">
      <div class="dv2-calhd"><b>📅 ${m.lbl} ${m.y}</b><span class="dv2-iamt dv2-neg">รวม ${dv2F(dv2PlanMonthTotal(m.key))}</span></div>
      <div class="dv2-cal">${DV2_DOW_TH.map(d=>`<div class="dv2-cdow">${d}</div>`).join('')}${c}</div>${detail}</div>`;
}
function dv2UpcomingHTML() {
    const items = [...(DashState.data.plans || [])].sort((a,b) => (a.due_date||'').localeCompare(b.due_date||''));
    if (!items.length) return `<div class="dv2-xs" style="text-align:center;padding:14px 0">ยังไม่มีแผนรายจ่าย</div>`;
    return `<div class="dv2-list">${items.map(x => `<div class="dv2-item">
      <div class="dv2-itxt"><div class="dv2-iname"><span class="dv2-ico" style="font-size:.95rem">${x.icon||'💡'}</span> ${x.title}
        ${x.recurrence && x.recurrence!=='NONE' ? `<span class="dv2-chip" style="font-size:.62rem;padding:1px 7px">${x.recurrence==='MONTHLY'?'ทุกเดือน':x.recurrence==='QUARTERLY'?'ทุกไตรมาส':'ทุกปี'}</span>` : ''}</div>
        <div class="dv2-imeta">${(x.due_date||'').substring(0,10)}${dv2UserTag(x.created_by_user_id, x.user_name)}</div></div>
      <div style="display:flex;align-items:center;gap:9px"><span class="dv2-iamt dv2-neg">${dv2F(x.amount)}</span>${dv2PlanActionIcons(x)}</div></div>`).join('')}</div>`;
}
function dv2Plan() {
    const months = dv2BuildPlanMonths();
    const monthsRow = `<div class="dv2-mrow">${months.map((m,i) => `<div class="dv2-mbox${DashState.openPlanIdx===i?' on':''}" onclick="dv2PickPlanMonth(${i})">
      <div class="dv2-xs">${m.lbl}</div><b>${dv2F(dv2PlanMonthTotal(m.key))}</b></div>`).join('')}</div>`;
    const listSide = `<div class="dv2-pl-list"><div class="dv2-pl-abs">
        <div class="dv2-xs" style="margin-bottom:6px;font-weight:500">รายการที่จะมาถึง · ${(DashState.data.plans||[]).length} รายการ</div>${dv2UpcomingHTML()}</div></div>`;
    const body = DashState.openPlanIdx >= 0
        ? `<div class="dv2-plansplit">${listSide}<div class="dv2-pl-cal">${dv2CalHTML(DashState.openPlanIdx)}</div></div>`
        : listSide;
    return `<div class="dv2-card"><h3><span class="dv2-ti"><span class="dv2-ico">📅</span>แผนรายจ่ายล่วงหน้า</span>
      <span class="dv2-chip on" onclick="dv2OpenPlanModal()">+ เพิ่ม</span></h3>${monthsRow}${body}</div>`;
}
function dv2PickPlanMonth(i) {
    DashState.openPlanIdx = (DashState.openPlanIdx === i) ? -1 : i;
    DashState.selPlanDay = null;
    dv2Render();
}
function dv2PickPlanDay(d) {
    DashState.selPlanDay = (DashState.selPlanDay === d) ? null : d;
    dv2Render();
}

// ── Planned Expense modal (add/edit) ──
function dv2FillPlanFormSelects() {
    const entSel = document.getElementById('plan-entity');
    if (entSel) {
        entSel.innerHTML = '<option value="">-- ทั้งครอบครัว --</option>' +
            ((DashState.data && DashState.data.entities) || []).map(e => `<option value="${e.entity_id}">${e.name}</option>`).join('');
    }
    const catSel = document.getElementById('plan-category');
    if (catSel) {
        const cats = (AppState.categories || []).filter(c => {
            const cap = (AppState.captions || []).find(x => x.type_id === c.caption_id);
            return cap && (cap.behavior === 'EXPENSE' || cap.behavior === 'LIABILITY') && cap.sub_behavior !== 'INVESTMENT';
        });
        catSel.innerHTML = '<option value="">-- ไม่ระบุ --</option>' + cats.map(c => `<option value="${c.category_id}">${c.name}</option>`).join('');
    }
}
function dv2OpenPlanModal(planId) {
    dv2FillPlanFormSelects();
    const modal = document.getElementById('plan-modal');
    const form = document.getElementById('plan-form');
    form.reset();
    document.getElementById('plan-id').value = planId || '';
    document.getElementById('plan-icon').value = '💡';
    if (planId) {
        const p = (DashState.data.plans || []).find(x => x.plan_id === planId);
        if (p) {
            document.getElementById('plan-modal-title').textContent = 'แก้ไขแผนรายจ่าย';
            document.getElementById('plan-icon').value = p.icon || '💡';
            document.getElementById('plan-title').value = p.title || '';
            document.getElementById('plan-amount').value = p.amount || 0;
            document.getElementById('plan-due-date').value = (p.due_date||'').substring(0,10);
            document.getElementById('plan-entity').value = p.entity_id || '';
            document.getElementById('plan-recurrence').value = p.recurrence || 'NONE';
            document.getElementById('plan-category').value = p.category_id || '';
            document.getElementById('plan-note').value = p.note || '';
        }
    } else {
        document.getElementById('plan-modal-title').textContent = 'เพิ่มแผนรายจ่าย';
        if (DashState.selPlanDay && DashState.openPlanIdx >= 0) {
            const d = DashState.planMonths[DashState.openPlanIdx];
            document.getElementById('plan-due-date').value = `${d.key}-${String(DashState.selPlanDay).padStart(2,'0')}`;
        }
    }
    modal.classList.remove('hidden');
}
function dv2ClosePlanModal() { document.getElementById('plan-modal').classList.add('hidden'); }
async function dv2SavePlan(evt) {
    evt.preventDefault();
    const id = document.getElementById('plan-id').value;
    const payload = {
        icon: document.getElementById('plan-icon').value,
        title: document.getElementById('plan-title').value,
        amount: parseFloat(document.getElementById('plan-amount').value) || 0,
        due_date: document.getElementById('plan-due-date').value,
        entity_id: document.getElementById('plan-entity').value || null,
        recurrence: document.getElementById('plan-recurrence').value,
        category_id: document.getElementById('plan-category').value || null,
        note: document.getElementById('plan-note').value || null
    };
    const headers = { 'x-user-id': encodeURIComponent(getUserIdHeader()), 'Content-Type': 'application/json' };
    try {
        const res = await fetch(`${API_BASE}/api/planned-expenses${id ? '/'+id : ''}`, {
            method: id ? 'PUT' : 'POST', headers, body: JSON.stringify(payload)
        });
        const j = await res.json();
        if (j.error) { showToast('บันทึกไม่สำเร็จ: ' + j.error, 'error'); return; }
        showToast('บันทึกแผนรายจ่ายแล้ว', 'success');
        dv2ClosePlanModal();
        loadDashboard();
    } catch (e) { showToast('บันทึกไม่สำเร็จ: ' + e.message, 'error'); }
}
async function dv2DonePlan(planId) {
    if (!confirm('ทำรายการนี้แล้วใช่ไหม?')) return;
    const headers = { 'x-user-id': encodeURIComponent(getUserIdHeader()), 'Content-Type': 'application/json' };
    try {
        await fetch(`${API_BASE}/api/planned-expenses/${planId}/done`, { method: 'POST', headers, body: JSON.stringify({}) });
        showToast('บันทึกว่าทำแล้ว', 'success');
        loadDashboard();
    } catch (e) { showToast('ผิดพลาด: ' + e.message, 'error'); }
}
async function dv2DeletePlan(planId) {
    if (!confirm('ลบแผนรายจ่ายนี้?')) return;
    const headers = { 'x-user-id': encodeURIComponent(getUserIdHeader()) };
    try {
        await fetch(`${API_BASE}/api/planned-expenses/${planId}`, { method: 'DELETE', headers });
        showToast('ลบแล้ว', 'success');
        loadDashboard();
    } catch (e) { showToast('ผิดพลาด: ' + e.message, 'error'); }
}

// ── Budget modal ──
function dv2OpenBudgetModal(categoryId) {
    const catSel = document.getElementById('budget-category');
    const cats = (AppState.categories || []).filter(c => {
        const cap = (AppState.captions || []).find(x => x.type_id === c.caption_id);
        return cap && (cap.behavior === 'EXPENSE' || cap.behavior === 'LIABILITY') && cap.sub_behavior !== 'INVESTMENT';
    });
    catSel.innerHTML = cats.map(c => `<option value="${c.category_id}">${c.name}</option>`).join('');
    if (categoryId) catSel.value = categoryId;
    const existing = (DashState.data.budget || []).find(b => b.category_id === catSel.value);
    document.getElementById('budget-amount').value = existing ? (existing.budget || '') : '';
    document.getElementById('budget-modal').classList.remove('hidden');
}
function dv2CloseBudgetModal() { document.getElementById('budget-modal').classList.add('hidden'); }
async function dv2SaveBudget(evt) {
    evt.preventDefault();
    const payload = {
        category_id: document.getElementById('budget-category').value,
        period_type: 'MONTHLY',
        period: `${DashState.year}-${DashState.month}`,
        amount: parseFloat(document.getElementById('budget-amount').value) || 0
    };
    const headers = { 'x-user-id': encodeURIComponent(getUserIdHeader()), 'Content-Type': 'application/json' };
    try {
        const res = await fetch(`${API_BASE}/api/budgets`, { method: 'POST', headers, body: JSON.stringify(payload) });
        const j = await res.json();
        if (j.error) { showToast('บันทึกไม่สำเร็จ: ' + j.error, 'error'); return; }
        showToast('บันทึกงบประมาณแล้ว', 'success');
        dv2CloseBudgetModal();
        loadDashboard();
    } catch (e) { showToast('บันทึกไม่สำเร็จ: ' + e.message, 'error'); }
}

// ── Top bar + master render ──
function dv2TopBar() {
    const mLabel = dv2MonthLabel(`${DashState.year}-${DashState.month}`);
    return `<div class="dv2-topbar">
      <h2>💰 ภาพรวมระบบการเงิน</h2>
      <div class="dv2-period">
        <button onclick="dv2ChangeMonth(-1)"><i class="fa-solid fa-chevron-left"></i></button>
        <span class="dv2-chip on" style="cursor:default">${mLabel}</span>
        <button onclick="dv2ChangeMonth(1)"><i class="fa-solid fa-chevron-right"></i></button>
        <button onclick="loadDashboard()"><i class="fa-solid fa-rotate-right"></i></button>
      </div>
    </div>`;
}
function dv2Render() {
    const root = document.getElementById('dv2-root');
    if (!root || !DashState.data) return;
    root.innerHTML = `${dv2TopBar()}
      <div class="dv2-sec dv2-g1">${dv2Hero()}</div>
      <div class="dv2-sec dv2-g3">${dv2Stmt()}${dv2Credit()}${dv2Invest()}</div>
      <div class="dv2-sec dv2-g1">${dv2Budget()}</div>
      <div class="dv2-sec dv2-g3">${dv2Income()}${dv2Expense()}${dv2Avg()}</div>
      <div class="dv2-sec dv2-g2">${dv2AR()}${dv2AP()}</div>
      <div class="dv2-sec dv2-g2">${dv2WhtCard('received','ถูกหัก ณ ที่จ่าย','เครดิตภาษีขอคืนได้','ถูกหัก')}${dv2WhtCard('withheld','หัก ณ ที่จ่ายไว้','ต้องนำส่งสรรพากร','หักไว้')}</div>
      <div class="dv2-sec dv2-g1">${dv2Plan()}</div>`;
}

async function loadDashboard() {
    try {
        await loadDashboardV2Data();
        dv2Render();
    } catch (err) {
        console.error('Dashboard Load Error:', err);
        const root = document.getElementById('dv2-root');
        if (root) root.innerHTML = `<div style="text-align:center;padding:40px;color:#993720;">โหลดข้อมูลไม่สำเร็จ: ${err.message}</div>`;
    }
}

// Removed pure canvas renderBarChart function as we now use Chart.js



function getBankIcon(bankName) {
    if (!bankName) return '💵';
    const name = bankName.toLowerCase();
    if (name.includes('kbank')) return '🟢';
    if (name.includes('scb')) return '🟣';
    if (name.includes('bay') || name.includes('krungsri')) return '🟡';
    if (name.includes('ktb')) return '🔵';
    if (name.includes('bbl')) return '🔵';
    return '💵';
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const datePart = dateStr.split(' ')[0];
    const parts = datePart.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return datePart;
}

function updateRowCategories(tr, captionId, selectedCatId) {
    const catSel = tr.querySelector('.select-category');
    if (!catSel) return;
    const cleanCats = AppState.categories.filter(c =>
        !c.name?.toLowerCase().includes('uncategor') &&
        !c.name?.includes('รอการระบุ') &&
        !c.category_id?.toLowerCase().includes('uncategor')
    );
    const filteredCats = captionId
        ? cleanCats.filter(c => c.caption_id === captionId)
        : cleanCats;

    const placeholder = captionId ? '-- เลือกหมวดหมู่ --' : 'Category';
    let html = `<option value="">${placeholder}</option>`;
    html += filteredCats.map(item => `<option value="${item.category_id}" ${item.category_id == selectedCatId ? 'selected' : ''}>${item.name}</option>`).join('');
    catSel.innerHTML = html;
}

// ==========================================
// 🕒 LOAD VIEW: PENDING REVIEW
// ==========================================

// ── Transaction ID generation ──────────────────────────────────────────────
function simpleHash(str) {
    let h = 5381;
    for (let i = 0; i < (str || '').length; i++) {
        h = ((h << 5) + h) + str.charCodeAt(i);
        h = h & 0xFFFFFFFF;
    }
    return Math.abs(h).toString(36).toUpperCase().padStart(6, '0').substring(0, 6);
}

// Format: {User}_{YYYYMMDD}_{AccSuffix}_{AmtKey}_{DedupKey}
// channel: 'WEB_GRID' | 'EXCEL' | 'PDF'
// opts: { refCode, statementDesc, time, note }
function generateTxId(date, accountId, amount, channel, opts = {}) {
    const user    = (AppState.userName || 'User').replace(/[^a-zA-Z0-9ก-๙]/g, '').substring(0, 12);
    const dateKey = (date || '').replace(/-/g, '').substring(0, 8);
    const accKey  = (accountId || '').replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();
    const amtAbs  = Math.round(Math.abs(amount || 0));
    const amtKey  = ((amount || 0) < 0 ? 'N' : 'P') + amtAbs;

    let dedupKey;
    if (channel === 'PDF') {
        dedupKey = opts.refCode
            ? opts.refCode.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10)
            : simpleHash((opts.statementDesc || '') + (opts.time || ''));
    } else if (channel === 'EXCEL') {
        dedupKey = simpleHash((opts.note || '') + dateKey + amtAbs);
    } else {
        // WEB_GRID: timestamp-based (always unique for manual entries)
        dedupKey = 'T' + Date.now().toString(36).toUpperCase();
    }

    return `${user}_${dateKey}_${accKey}_${amtKey}_${dedupKey}`;
}

function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

async function autoSaveCard(cardEl) {
    const txId = cardEl.dataset.txid;
    if (!txId) return;

    // Read account
    const accSel = cardEl.querySelector(".input-account");
    const accId = accSel ? accSel.value : (cardEl.dataset.accid || '');

    // Read date
    const dateInput = cardEl.querySelector(".input-date");
    const txDate = dateInput ? dateInput.value : (cardEl.dataset.date || new Date().toLocaleDateString('en-CA'));

    // Read time
    const timeInput = cardEl.querySelector(".input-time");
    const txTime = timeInput ? (timeInput.value ? timeInput.value + ':00' : '00:00:00') : (cardEl.dataset.time || '00:00:00');

    // Read stmt amount
    const stmtInput = cardEl.querySelector(".input-stmt-amount");
    const stmtAmount = stmtInput ? parseAmountInput(stmtInput.value) : 0;

    // Read note
    const noteInput = cardEl.querySelector(".input-note");
    const note = noteInput ? noteInput.value : '';

    // Read sub-rows
    const details = [];
    cardEl.querySelectorAll(".sub-row-item").forEach(row => {
        const amt = parseAmountInput(row.querySelector(".input-amount")?.value || '0');
        const fee = Math.abs(parseAmountInput(row.querySelector(".input-fee")?.value || '0'));
        const wht = Math.abs(parseAmountInput(row.querySelector(".input-wht")?.value || '0'));
        const rowNote = row.querySelector(".input-sub-note")?.value || '';
        details.push({ amount: amt, fee, wht, note: rowNote, type: amt >= 0 ? 'INCOME' : 'EXPENSE' });
    });

    if (details.length === 0) details.push({ amount: stmtAmount, fee: 0, wht: 0, note: '', type: stmtAmount >= 0 ? 'INCOME' : 'EXPENSE' });

    const payload = {
        transaction_id: txId,
        date: txDate,
        time: txTime,
        account_id: accId,
        total_amount: stmtAmount,
        note,
        status: 'PENDING_REVIEW',
        source: 'WEB_GRID',
        details
    };

    try {
        await fetch(`${API_BASE}/api/transactions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(getUserIdHeader()) },
            body: JSON.stringify(payload)
        });
        // Refresh status summary so pending totals reflect latest typed values
        updatePendingStatusSummary();
    } catch (_) { /* silent fail */ }
}

function updateCardSum(cardEl) {
    const rawStmtAmountStr = cardEl.querySelector(".input-stmt-amount").value;
    const parsedStmtAmount = parseAmountInput(rawStmtAmountStr);

    // Signed formula: diff = stmtAmount − Σ(amt − sign(amt)*(|fee|+|wht|))
    let subNetTotal = 0;
    cardEl.querySelectorAll(".sub-row-item").forEach(row => {
        const amt = parseAmountInput(row.querySelector(".input-amount").value);
        const fee = Math.abs(parseAmountInput(row.querySelector(".input-fee").value));
        const wht = Math.abs(parseAmountInput(row.querySelector(".input-wht").value));
        const s = amt >= 0 ? 1 : -1;
        subNetTotal += amt - s * (fee + wht);
    });

    const diff = parsedStmtAmount - subNetTotal;

    const sumValueEl = cardEl.querySelector(".zero-sum-value");
    const sumStatusEl = cardEl.querySelector(".zero-sum-status");
    const sumLabelEl  = cardEl.querySelector(".zero-sum-label");

    if (sumValueEl && sumStatusEl) {
        const absD = Math.abs(diff);
        const fmt = absD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        sumValueEl.textContent = diff < 0 ? `(${fmt})` : fmt;
        if (sumLabelEl) sumLabelEl.textContent = 'คงเหลือ:';
        if (Math.abs(diff) <= 0.01) {
            sumStatusEl.textContent = "✅";
            sumStatusEl.style.color = "#059669";
        } else {
            sumStatusEl.textContent = diff > 0 ? "⬇️" : "❌";
            sumStatusEl.style.color = diff > 0 ? "#F59E0B" : "#DC2626";
        }
    }

    // Update sub-row count badge
    const countBadge = cardEl.querySelector(".subrow-count");
    if (countBadge) {
        const n = cardEl.querySelectorAll(".sub-row-item").length;
        countBadge.textContent = n + ' รายการย่อย';
        countBadge.style.background = n > 0 ? '#EDE9FE' : '#F3F4F6';
        countBadge.style.color = n > 0 ? '#7C3AED' : '#6B7280';
    }
}

function updateCardStyle(cardEl) {
    const rawStmtAmountStr = cardEl.querySelector(".input-stmt-amount").value;
    const parsedStmtAmount = parseAmountInput(rawStmtAmountStr);
    const isExpense = parsedStmtAmount < 0;
    
    const headerEl = cardEl.querySelector(".tx-card-header");
    const stmtAmtInput = cardEl.querySelector(".input-stmt-amount");
    
    if (headerEl && stmtAmtInput) {
        // Keep V4 dark header, only update accent border and amount text color
        const accentColor = isExpense ? '#BE123C' : '#0F766E';
        headerEl.style.borderLeft = `5px solid ${accentColor}`;
        // Amount color: red-tinted for expense, green-tinted for income (on dark bg)
        stmtAmtInput.style.color = isExpense ? '#FCA5A5' : '#6EE7B7';
    }
}

function formatSubRowAmount(amount) {
    if (amount == null || isNaN(amount)) return '0.00';
    const isNegative = amount < 0;
    const absVal = Math.abs(amount);
    const formattedStr = absVal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return isNegative ? `(${formattedStr})` : formattedStr;
}

function refreshSubRowLabels(cardEl) {
    const container = cardEl.querySelector(".sub-rows-container");
    if (!container) return;
    const subRows = container.querySelectorAll(".sub-row-item");
    subRows.forEach((row, idx) => {
        const labels = ["Caption", "Company", "Customer", "Category", "Transaction Amt.", "Fee", "Wht", "Detail"];
        const isFirst = idx === 0;
        const cols = row.querySelectorAll(".sub-row-col");
        cols.forEach((col, colIdx) => {
            const existingLabel = col.querySelector(".sub-row-label");
            if (existingLabel) {
                existingLabel.remove();
            }
            if (isFirst && colIdx < labels.length) {
                const subRowLabelStyle = "font-size: 10px; font-weight: 700; color: #6B7280; letter-spacing: 0.6px; text-transform: none; margin-bottom: 2px; padding: 0 2px; text-align: center;";
                const lblDiv = document.createElement("div");
                lblDiv.className = "sub-row-label";
                lblDiv.style.cssText = subRowLabelStyle;
                lblDiv.textContent = labels[colIdx];
                col.insertBefore(lblDiv, col.firstChild);
            }
        });
    });
}

function addInlineSubRow(cardEl, detailData = {}) {
    const container = cardEl.querySelector(".sub-rows-container");
    if (!container) return;
    
    const captionOptions = AppState.captions.map(at => 
        `<option value="${at.type_id}" ${detailData.caption_id === at.type_id ? 'selected' : ''}>${at.name}</option>`
    ).join('');
    
    const entityOptions = AppState.entities.map(ent => 
        `<option value="${ent.entity_id}" ${detailData.entity_id === ent.entity_id ? 'selected' : ''}>${ent.name}</option>`
    ).join('');
    
    const contactOptions = AppState.contacts.map(cont => 
        `<option value="${cont.contact_id}" ${detailData.contact_id === cont.contact_id ? 'selected' : ''}>${cont.name}</option>`
    ).join('');
    
    let categoryOptions = '<option value="">-- เลือกหมวดหมู่ --</option>';
    
    const rowEl = document.createElement("div");
    rowEl.className = "sub-row-grid sub-row-item";
    rowEl.style.minHeight = "26px";
    
    const amountRaw = detailData.amount !== undefined ? Number(detailData.amount) : 0;
    const feeRaw    = detailData.fee    !== undefined ? Number(detailData.fee)    : 0;
    const whtRaw    = detailData.wht    !== undefined ? Number(detailData.wht)    : 0;
    const amountVal = amountRaw !== 0 ? formatNumberWithCommas(String(amountRaw)) : '';
    const feeVal    = feeRaw    !== 0 ? formatNumberWithCommas(String(feeRaw))    : '';
    const whtVal    = whtRaw    !== 0 ? formatNumberWithCommas(String(whtRaw))    : '';
    const noteVal   = detailData.note !== undefined ? detailData.note : '';

    const amtColor = amountRaw < 0 ? '#EF4444' : '#16A34A';
    const feeColor = feeRaw    < 0 ? '#EF4444' : '#16A34A';
    const whtColor = whtRaw    < 0 ? '#EF4444' : '#16A34A';

    const subRowInputStyle = "min-height: 28px; padding: 4px 6px; font-size: 13px; background: #ffffff; color: #1E293B; border: 1px solid #D1D5DB; border-radius: 5px; width: 100%;";

    rowEl.innerHTML = `
        <div class="sub-row-col">
            <select class="form-select select-caption" style="${subRowInputStyle}">
                <option value="">Caption</option>
                ${captionOptions}
            </select>
        </div>
        <div class="sub-row-col">
            <select class="form-select select-entity" style="${subRowInputStyle} color: ${detailData.entity_id ? '#1E293B' : '#9CA3AF'};" onchange="this.style.color = this.value ? '#1E293B' : '#9CA3AF'">
                <option value="">Company</option>
                ${entityOptions}
            </select>
        </div>
        <div class="sub-row-col">
            <select class="form-select select-contact" style="${subRowInputStyle} color: ${detailData.contact_id ? '#1E293B' : '#9CA3AF'};" onchange="this.style.color = this.value ? '#1E293B' : '#9CA3AF'">
                <option value="">Customer</option>
                ${contactOptions}
            </select>
        </div>
        <div class="sub-row-col">
            <select class="form-select select-category" style="${subRowInputStyle}">
                ${categoryOptions}
            </select>
        </div>
        <div class="sub-row-col">
            <input type="text" class="form-control input-amount" value="${amountVal}" placeholder="+/- ยอด" oninput="this.value = this.value.replace(/[^0-9.,()\\-]/g, ''); const v=parseAmountInput(this.value); this.style.color=v<0?'#EF4444':'#16A34A';" onblur="this.value = formatNumberWithCommas(this.value); const v=parseAmountInput(this.value); this.style.color=v<0?'#EF4444':'#16A34A';" onfocus="this.value = this.value.replace(/,/g, '')" style="${subRowInputStyle} text-align: right; font-weight: 600; color: ${amtColor};">
        </div>
        <div class="sub-row-col">
            <input type="text" class="form-control input-fee" value="${feeVal}" placeholder="0.00" oninput="this.value = this.value.replace(/[^0-9.,()\\-]/g, ''); const v=parseAmountInput(this.value); this.style.color=v<0?'#EF4444':'#16A34A';" onblur="this.value = formatNumberWithCommas(this.value); const v=parseAmountInput(this.value); this.style.color=v<0?'#EF4444':'#16A34A';" onfocus="this.value = this.value.replace(/,/g, '')" style="${subRowInputStyle} text-align: right; color: ${feeColor};">
        </div>
        <div class="sub-row-col">
            <input type="text" class="form-control input-wht" value="${whtVal}" placeholder="0.00" oninput="this.value = this.value.replace(/[^0-9.,()\\-]/g, ''); const v=parseAmountInput(this.value); this.style.color=v<0?'#EF4444':'#16A34A';" onblur="this.value = formatNumberWithCommas(this.value); const v=parseAmountInput(this.value); this.style.color=v<0?'#EF4444':'#16A34A';" onfocus="this.value = this.value.replace(/,/g, '')" style="${subRowInputStyle} text-align: right; color: ${whtColor};">
        </div>
        <div class="sub-row-col">
            <input type="text" class="form-control input-detail" value="${noteVal}" placeholder="รายละเอียด..." style="${subRowInputStyle}">
        </div>
        <div class="sub-row-col" style="display: flex; gap: 4px; justify-content: center; align-items: flex-end; padding-bottom: 1px;">
            <button type="button" class="btn btn-move-up-subrow" style="height: 26px; width: 22px; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; border-radius: 5px; background: rgba(59,130,246,0.1); color: #3B82F6; border: 1px solid rgba(59,130,246,0.3); cursor: pointer; transition: all 0.15s;" title="เลื่อนขึ้น" onmouseover="this.style.background='rgba(59,130,246,0.2)'" onmouseout="this.style.background='rgba(59,130,246,0.1)'">
                <i class="fa-solid fa-chevron-up"></i>
            </button>
            <button type="button" class="btn btn-move-down-subrow" style="height: 26px; width: 22px; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; border-radius: 5px; background: rgba(59,130,246,0.1); color: #3B82F6; border: 1px solid rgba(59,130,246,0.3); cursor: pointer; transition: all 0.15s;" title="เลื่อนลง" onmouseover="this.style.background='rgba(59,130,246,0.2)'" onmouseout="this.style.background='rgba(59,130,246,0.1)'">
                <i class="fa-solid fa-chevron-down"></i>
            </button>
            <button type="button" class="btn btn-remove-subrow" style="height: 26px; width: 22px; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 12px; border-radius: 5px; background: transparent; color: #EF4444; border: 1px solid rgba(239,68,68,0.3); cursor: pointer; transition: all 0.15s;" title="ลบรายการย่อย" onmouseover="this.style.background='rgba(239,68,68,0.1)'" onmouseout="this.style.background='transparent'">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>
    `;
    
    container.appendChild(rowEl);
    refreshSubRowLabels(cardEl);
    
    const captionSel = rowEl.querySelector(".select-caption");
    const categorySel = rowEl.querySelector(".select-category");
    
    const updateCategories = (selectedCaptionId, selectedCategoryId) => {
        let cats = AppState.categories.filter(c =>
            !c.name?.toLowerCase().includes('uncategor') &&
            !c.name?.includes('รอการระบุ') &&
            !c.category_id?.toLowerCase().includes('uncategor')
        );
        if (selectedCaptionId) {
            cats = cats.filter(c => c.caption_id === selectedCaptionId);
        }
        const placeholder = selectedCaptionId ? '-- เลือกหมวดหมู่ --' : 'Category';
        let html = `<option value="">${placeholder}</option>`;
        cats.forEach(c => {
            html += `<option value="${c.category_id}" ${c.category_id === selectedCategoryId ? 'selected' : ''}>${c.name}</option>`;
        });
        categorySel.innerHTML = html;
    };
    
    const initialCaptionId = detailData.caption_id || '';
    const initialCategoryId = detailData.category_id || '';
    updateCategories(initialCaptionId, initialCategoryId);
    
    captionSel.addEventListener("change", (e) => {
        const capId = e.target.value;
        updateCategories(capId, '');
        
        const captionObj = AppState.captions.find(at => at.type_id === capId);
        if (captionObj) {
            if (captionObj.default_entity_id) {
                rowEl.querySelector('.select-entity').value = captionObj.default_entity_id;
            }
            if (captionObj.default_contact_id) {
                rowEl.querySelector('.select-contact').value = captionObj.default_contact_id;
            }
        }
        updateCardSum(cardEl);
    });
    
    categorySel.addEventListener("change", (e) => {
        const catId = e.target.value;
        const catObj = AppState.categories.find(c => c.category_id === catId);
        if (catObj) {
            if (catObj.caption_id) {
                captionSel.value = catObj.caption_id;
                updateCategories(catObj.caption_id, catId);
            }
        }
        updateCardSum(cardEl);
    });
    
    rowEl.querySelector(".btn-move-up-subrow").addEventListener("click", () => {
        if (rowEl.previousElementSibling) {
            container.insertBefore(rowEl, rowEl.previousElementSibling);
            refreshSubRowLabels(cardEl);
            updateCardSum(cardEl);
        }
    });
    
    rowEl.querySelector(".btn-move-down-subrow").addEventListener("click", () => {
        if (rowEl.nextElementSibling) {
            container.insertBefore(rowEl.nextElementSibling, rowEl);
            refreshSubRowLabels(cardEl);
            updateCardSum(cardEl);
        }
    });
    
    rowEl.querySelector(".btn-remove-subrow").addEventListener("click", () => {
        rowEl.remove();
        refreshSubRowLabels(cardEl);
        updateCardSum(cardEl);
    });
    
    rowEl.querySelectorAll(".input-amount, .input-fee, .input-wht").forEach(input => {
        input.addEventListener("change", (e) => {
            const parsed = parseAmountInput(e.target.value);
            e.target.value = formatSubRowAmount(parsed);
            updateCardSum(cardEl);
            if (typeof updatePendingStatusSummary === 'function') {
                updatePendingStatusSummary();
            }
        });
    });
    
    rowEl.querySelectorAll(".input-detail, select").forEach(input => {
        input.addEventListener("change", () => updateCardSum(cardEl));
    });
    
    updateCardSum(cardEl);
}

function getCardPayload(cardEl) {
    const txId = cardEl.dataset.txid;
    const txDate = cardEl.querySelector(".input-date").value;
    const timeInput = cardEl.querySelector(".input-time");
    const txTime = timeInput ? (timeInput.value + ':00') : (cardEl.dataset.time || '00:00:00');
    const accId = cardEl.dataset.accid;
    
    const rawStmtAmountStr = cardEl.querySelector(".input-stmt-amount").value;
    const parsedStmtAmount = parseAmountInput(rawStmtAmountStr);
    
    const refCode = cardEl.dataset.ref || '';
    const source = cardEl.dataset.source || 'PDF_IMPORT';
    const note = cardEl.querySelector(".input-stmt-note").value.trim();
    
    if (!txDate) {
        alert("กรุณาระบุวันที่ (Date)");
        return null;
    }
    if (!accId) {
        alert("กรุณาเลือกช่องทางบัญชี (Statement)");
        return null;
    }
    if (!rawStmtAmountStr || parsedStmtAmount === 0) {
        alert("กรุณาระบุยอดเงิน (Statement Amount)");
        return null;
    }
    
    const details = [];
    let isSubRowsValid = true;
    let hasTranAmount = false;

    const subRows = cardEl.querySelectorAll(".sub-row-item");
    if (subRows.length === 0) {
        alert("กรุณาเพิ่มรายการย่อยอย่างน้อย 1 รายการ");
        return null;
    }

    subRows.forEach((row, idx) => {
        const captionId    = row.querySelector(".select-caption").value;
        const categoryId   = row.querySelector(".select-category").value;
        const entityId     = row.querySelector(".select-entity").value;
        const contactId    = row.querySelector(".select-contact").value;
        const tranAmountStr = row.querySelector(".input-amount").value;
        const tranAmount   = parseAmountInput(tranAmountStr);  // signed
        const fee          = parseAmountInput(row.querySelector(".input-fee").value);
        const wht          = parseAmountInput(row.querySelector(".input-wht").value);
        const detailNote   = row.querySelector(".input-detail").value.trim();

        if (!captionId) {
            alert(`รายการย่อยที่ ${idx + 1}: กรุณาเลือก Caption`);
            isSubRowsValid = false; return;
        }
        if (!categoryId) {
            alert(`รายการย่อยที่ ${idx + 1}: กรุณาเลือก Category`);
            isSubRowsValid = false; return;
        }
        if (!tranAmountStr || tranAmount === 0) {
            alert(`รายการย่อยที่ ${idx + 1}: กรุณาระบุ Transaction Amount`);
            isSubRowsValid = false; return;
        }

        hasTranAmount = true;
        const catObj = AppState.categories.find(c => c.category_id === categoryId);
        let detailType = tranAmount >= 0 ? 'INCOME' : 'EXPENSE';
        if (catObj?.default_type) detailType = catObj.default_type;
        else if (catObj?.caption_behavior === 'REVENUE') detailType = 'INCOME';
        else if (catObj?.caption_behavior === 'EXPENSE') detailType = 'EXPENSE';

        // Store signed amounts; fee/wht kept as-is (signed from input)
        const s = tranAmount >= 0 ? 1 : -1;
        details.push({
            amount: tranAmount,
            fee: Math.abs(fee) * s,
            wht: Math.abs(wht) * s,
            category_id: categoryId,
            contact_id: contactId || null,
            entity_id: entityId || null,
            note: detailNote || null,
            type: detailType
        });
    });

    if (!isSubRowsValid) return null;
    if (!hasTranAmount) {
        alert("กรุณาระบุ Transaction Amount อย่างน้อย 1 รายการ");
        return null;
    }

    // Signed balance check: stmt − Σ(amt − sign*(|fee|+|wht|)) ≈ 0
    let subNetTotal = 0;
    details.forEach(d => {
        const s = d.amount >= 0 ? 1 : -1;
        subNetTotal += d.amount - s * (Math.abs(d.fee) + Math.abs(d.wht));
    });
    const balance = parsedStmtAmount - subNetTotal;
    if (Math.abs(balance) > 0.01) {
        showGridModal('ยอดรายการย่อยไม่ตรงกับยอด Statement', [
            { label: 'Statement Amount', value: parsedStmtAmount },
            { label: 'รายการย่อยสุทธิ',  value: subNetTotal },
            { label: 'ผลต่าง',            value: balance }
        ]);
        return null;
    }

    const firstCaptionId  = subRows[0].querySelector(".select-caption").value;
    const firstCaptionObj = AppState.captions.find(at => at.type_id === firstCaptionId);
    const captionName     = firstCaptionObj ? firstCaptionObj.name : '';

    return {
        transaction_id: txId,
        account_id: accId,
        date: txDate,
        time: txTime,
        statement_desc: captionName || note || 'Imported Transaction',
        total_amount: parsedStmtAmount,   // signed
        ref_code: refCode,
        status: 'PENDING_REVIEW',
        source: source,
        details
    };
}

// ==========================================
// ➕ NEW BLANK PENDING CARD — auto-saves to DB immediately
// ==========================================
async function createNewPendingCard() {
    const container = document.getElementById("pending-cards-container");
    if (!container) return;

    if (!AppState.accounts || AppState.accounts.length === 0) {
        alert("กรุณาตั้งค่าบัญชีธนาคารก่อนเพิ่มรายการ (Settings → Accounts)");
        return;
    }

    const today = new Date().toLocaleDateString('en-CA');
    const nowTime = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + ':00';
    const firstAccId = AppState.accounts[0].account_id;
    const txId = generateTxId(today, firstAccId, 0, 'WEB_GRID');

    const payload = {
        transaction_id: txId,
        date: today,
        time: nowTime,
        account_id: firstAccId,
        total_amount: 0,
        note: '',
        status: 'PENDING_REVIEW',
        source: 'WEB_GRID',
        details: [{ amount: 0, fee: 0, wht: 0, note: '', type: 'EXPENSE' }]
    };

    try {
        const res = await fetch(`${API_BASE}/api/transactions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(getUserIdHeader()) },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            await loadPending();
            // Scroll new card into view (sorted desc = today first)
            const firstCard = container.querySelector('.tx-card');
            if (firstCard) firstCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            const errText = await res.text().catch(() => res.statusText);
            let errMsg = errText;
            try { const j = JSON.parse(errText); errMsg = j.error || j.message || errText; } catch {}
            alert(`❌ สร้างรายการไม่สำเร็จ (HTTP ${res.status})\n${errMsg}`);
        }
    } catch (e) {
        alert("Network Error: " + e.message);
    }
}

async function loadPending() {
    try {
        const res = await fetch(`${API_BASE}/api/transactions?status=PENDING_REVIEW`, {
            headers: { 'x-user-id': encodeURIComponent(getUserIdHeader()) }
        });
        AppState.pendingTransactions = await res.json();
        
        // Populate the account select for PDF import
        const importAccSel = document.getElementById("import-account-selector");
        if (importAccSel) {
            const prevVal = importAccSel.value;
            importAccSel.innerHTML = '<option value="">Statement</option>' +
                AppState.accounts.map(acc => `<option value="${acc.account_id}">${acc.name}</option>`).join('');
            if (prevVal) {
                importAccSel.value = prevVal;
            }
        }
        
        // Populate the filter
        const filterContainer = document.getElementById("pending-filter-container");
        const filterSel = document.getElementById("pending-account-filter");
        
        if (!AppState.pendingTransactions || AppState.pendingTransactions.length === 0) {
            // Do not force display: flex here
        } else {
            if (filterSel) {
                const prevFilter = filterSel.value;
                const uniqueAccountIds = [...new Set(AppState.pendingTransactions.map(tx => tx.account_id))];
                filterSel.innerHTML = '<option value="ALL">All</option>' +
                    uniqueAccountIds.map(accId => {
                        const accObj = AppState.accounts.find(a => a.account_id === accId);
                        const accName = accObj ? accObj.name : accId;
                        return `<option value="${accId}">${accName}</option>`;
                    }).join('');
                
                if (uniqueAccountIds.includes(prevFilter) || prevFilter === 'ALL') {
                    filterSel.value = prevFilter;
                } else {
                    filterSel.value = 'ALL';
                }
                
                // Bind event listener only once
                if (!filterSel.dataset.bound) {
                    filterSel.addEventListener('change', renderPendingTransactions);
                    filterSel.dataset.bound = 'true';
                }
                
                const sortSel = document.getElementById("pending-sort-filter");
                if (sortSel && !sortSel.dataset.bound) {
                    sortSel.addEventListener('change', renderPendingTransactions);
                    sortSel.dataset.bound = 'true';
                }
            }
        }

        renderPendingTransactions();

        // If triggered from dashboard quick-action, create blank card AFTER render
        if (AppState._createNewAfterLoad) {
            AppState._createNewAfterLoad = false;
            createNewPendingCard();
        }

    } catch (e) {
        console.error("Pending Review Load Error:", e);
    }
}

function renderPendingTransactions() {
    const container = document.getElementById("pending-cards-container");
    if (!container) return;

    // Preserve unsaved draft cards (data-is-new="true") before wiping the container
    const unsavedCards = Array.from(container.querySelectorAll('[data-is-new="true"]'));
    container.innerHTML = '';
    
    if (!AppState.pendingTransactions || AppState.pendingTransactions.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #888; padding: 40px; background: rgba(255,255,255,0.4); border-radius: 12px; border: 1px dashed #cccccc;">ไม่มีรายการรอตรวจสอบในระบบ</div>';
        updatePendingStatusSummary();
        return;
    }
    
    const filterSel = document.getElementById("pending-account-filter");
    const filterVal = filterSel ? filterSel.value : 'ALL';
    
    let displayList = AppState.pendingTransactions;
    if (filterVal && filterVal !== 'ALL') {
        displayList = displayList.filter(tx => String(tx.account_id) === String(filterVal));
    }
    
    const sortSel = document.getElementById("pending-sort-filter");
    const sortVal = sortSel ? sortSel.value : 'desc';
    displayList.sort((a, b) => {
        const datetimeA = a.date + ' ' + (a.time || '00:00:00');
        const datetimeB = b.date + ' ' + (b.time || '00:00:00');
        return sortVal === 'asc' ? datetimeA.localeCompare(datetimeB) : datetimeB.localeCompare(datetimeA);
    });
    
    if (displayList.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #888; padding: 40px; background: rgba(255,255,255,0.4); border-radius: 12px; border: 1px dashed #cccccc;">ไม่มีรายการในบัญชีที่เลือก</div>';
        updatePendingStatusSummary();
        return;
    }

    displayList.forEach((tx, idx) => {
        const accountObj = AppState.accounts.find(acc => String(acc.account_id) === String(tx.account_id));
        const accountName = accountObj ? accountObj.name : 'Unknown Account';
        
        const am = tx.auto_match || {};
        const dType = am.type || tx.details?.[0]?.type || 'INCOME';
        
        const isExpense = dType === 'EXPENSE' || dType === 'CREDIT_AR';
        const headerClass = isExpense ? 'header-expense' : 'header-income';
        const accentColor = isExpense ? '#BE123C' : '#0F766E';
        const formattedStmtAmount = formatStatementAmountInput(tx.total_amount, dType);
        
        const stmtNote = tx.details?.[0]?.note || '';
        const displayNote = (tx.source === 'PDF_IMPORT' && stmtNote) ? stmtNote : (am.note || '');

        const cardEl = document.createElement("div");
        cardEl.className = "tx-card";
        cardEl.dataset.txid = tx.transaction_id;
        cardEl.dataset.accid = tx.account_id;
        cardEl.dataset.ref = tx.ref_code || '';
        cardEl.dataset.source = tx.source;
        cardEl.dataset.time = tx.time || '';
        
        const displayTime = tx.time ? tx.time.substring(0, 5) : '';
        const isWebGrid = tx.source === 'WEB_GRID';

        // WEB_GRID cards: editable account dropdown + time input
        // PDF/import cards: static account name + time span
        const accFieldHtml = isWebGrid
            ? `<select class="form-select input-account" style="width: 314px; min-width: 120px; flex-shrink: 1; height: 28px; padding: 2px 8px; font-size: 14px; font-weight: 700; background: rgba(255,255,255,0.12); color: #38BDF8; border: 1px solid rgba(255,255,255,0.2); border-radius: 6px;">
                ${AppState.accounts.map(a => `<option value="${a.account_id}" ${a.account_id === tx.account_id ? 'selected' : ''}>${a.name}</option>`).join('')}
               </select>`
            : `<span class="stmt-account-name" style="width: 314px; min-width: 100px; flex-shrink: 1; color: #38BDF8; font-size: 14px; font-weight: 700; letter-spacing: 0.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${accountName}</span>`;

        const timeFieldHtml = isWebGrid
            ? `<input type="time" class="form-control input-time" value="${displayTime}" style="width: 72px; min-width: 72px; height: 28px; padding: 2px 4px; font-size: 0.78rem; font-weight: 700; color: #38BDF8; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; flex-shrink: 0;">`
            : `<span class="row-time" style="width: 72px; min-width: 72px; flex-shrink: 0; color: ${displayTime ? '#38BDF8' : 'rgba(255,255,255,0.2)'}; font-size: 0.78rem; font-weight: 700; text-align: center; letter-spacing: 0.5px;">${displayTime || '--:--'}</span>`;

        cardEl.innerHTML = `
            <div class="tx-card-header ${headerClass}" style="display: flex; align-items: center; padding: 10px 14px; gap: 8px; border-left: 5px solid ${accentColor}; background: linear-gradient(135deg, #1E293B 0%, #0F172A 100%); border-radius: 10px 10px 0 0; flex-wrap: nowrap; overflow: hidden;">
                    <input type="date" class="form-control input-date" value="${tx.date.split(' ')[0]}" style="padding: 2px 6px; font-size: 0.8rem; width: 118px; min-width: 118px; height: 28px; background: rgba(255,255,255,0.12); color: #E2E8F0; border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; font-weight: 600; flex-shrink: 0;">
                    ${timeFieldHtml}
                    ${accFieldHtml}
                    <input type="text" class="form-control input-stmt-amount" value="${formattedStmtAmount}" oninput="this.value = this.value.replace(/[^0-9.,()\\-]/g, '')" onblur="this.value = formatNumberWithCommas(this.value)" onfocus="this.value = this.value.replace(/,/g, '')" style="width: 130px; min-width: 90px; flex-shrink: 0; height: 28px; padding: 2px 8px; font-size: 0.85rem; font-weight: 800; text-align: right; color: ${isExpense ? '#FCA5A5' : '#6EE7B7'}; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; letter-spacing: 0.5px;">
                    <input type="text" class="form-control input-stmt-note" value="${displayNote}" placeholder="หมายเหตุ..." style="flex: 1 1 40px; min-width: 40px; height: 28px; padding: 2px 8px; font-size: 0.8rem; background: rgba(255,255,255,0.07); color: #94A3B8; border: 1px solid rgba(255,255,255,0.12); border-radius: 6px;">
                <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                    <button class="btn btn-add-subrow-header" style="width: 34px; height: 34px; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 1rem; border-radius: 8px; background: #3B82F6; color: #ffffff; border: none; cursor: pointer; box-shadow: 0 2px 6px rgba(59,130,246,0.4); transition: all 0.2s;" title="เพิ่มรายการย่อย" onmouseover="this.style.background='#2563EB'" onmouseout="this.style.background='#3B82F6'"><i class="fa-solid fa-plus"></i></button>
                    <button class="btn btn-confirm-single-pending" style="width: 34px; height: 34px; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 1rem; border-radius: 8px; background: #10B981; color: #ffffff; border: none; cursor: pointer; box-shadow: 0 2px 6px rgba(16,185,129,0.4); transition: all 0.2s;" title="บันทึกรายการ" onmouseover="this.style.background='#059669'" onmouseout="this.style.background='#10B981'"><i class="fa-solid fa-floppy-disk"></i></button>
                    <button class="btn btn-delete-pending" style="width: 34px; height: 34px; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 1rem; border-radius: 8px; background: #EF4444; color: #ffffff; border: none; cursor: pointer; box-shadow: 0 2px 6px rgba(239,68,68,0.4); transition: all 0.2s;" title="ลบ" onmouseover="this.style.background='#DC2626'" onmouseout="this.style.background='#EF4444'"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
            <div class="tx-card-body" style="padding: 12px 14px; background: #ffffff;">
                <div class="sub-rows-container" style="display: flex; flex-direction: column; gap: 4px;">
                    <!-- Sub-rows populated here -->
                </div>
            </div>
            <div class="tx-card-footer" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 14px; background: #F8FAFC; border-top: 1px solid #E2E8F0;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <button class="btn btn-outline-purple btn-add-subrow" type="button">
                        <i class="fa-solid fa-plus"></i> เพิ่มรายการย่อย
                    </button>
                    <span class="subrow-count" style="font-size: 0.75rem; font-weight: 600; padding: 2px 8px; border-radius: 10px; background: #F3F4F6; color: #6B7280;">0 รายการย่อย</span>
                </div>
                <div class="zero-sum-indicator" style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; font-weight: 700; color: #374151;">
                    <span class="zero-sum-label">คงเหลือ:</span>
                    <span class="zero-sum-value">0.00</span>
                    <span class="zero-sum-status">✅</span>
                </div>
            </div>
        `;
        
        container.appendChild(cardEl);
        
        const detailsToRender = tx.details && tx.details.length > 0 ? tx.details : [{}];
        detailsToRender.forEach((detail, subIdx) => {
            const dCat = detail.category_id || (subIdx === 0 ? (am.category_id || '') : '');
            let dCont = detail.contact_id || (subIdx === 0 ? (am.contact_id || '') : '');
            let dEntity = detail.entity_id || (subIdx === 0 ? (am.entity_id || '') : '');
            const stmtSignedAmount = isExpense ? -Math.abs(tx.total_amount) : Math.abs(tx.total_amount);
            // sub-row amount has SAME sign as stmt (new signed model)
            let dAmt = 0;
            if (detail.amount !== undefined && detail.amount !== '') {
                // preserve sign for new-model data; re-apply stmt sign for old positive-only data
                const rawAmt = Number(detail.amount);
                dAmt = stmtSignedAmount < 0 ? -Math.abs(rawAmt) : Math.abs(rawAmt);
            } else {
                dAmt = subIdx === 0 ? stmtSignedAmount : 0;
            }
            
            const dFee = detail.fee !== undefined ? detail.fee : 0;
            const dWht = detail.wht !== undefined ? detail.wht : 0;
            const dNote = detail.note || (subIdx === 0 ? (tx.source === 'PDF_IMPORT' ? '' : (am.note || '')) : '');
            
            let dCaption = '';
            if (subIdx === 0 && tx.statement_desc) {
                const matchedAt = AppState.captions.find(at => 
                    at.name.toLowerCase() === tx.statement_desc.toLowerCase() || 
                    at.type_id.toLowerCase() === tx.statement_desc.toLowerCase()
                );
                if (matchedAt) {
                    dCaption = matchedAt.type_id;
                }
            }
            if (!dCaption && dCat) {
                const catObj = AppState.categories.find(c => c.category_id === dCat);
                if (catObj) {
                    dCaption = catObj.caption_id;
                }
            }
            
            addInlineSubRow(cardEl, {
                caption_id: dCaption,
                category_id: dCat,
                entity_id: dEntity,
                contact_id: dCont,
                amount: dAmt,
                fee: dFee,
                wht: dWht,
                note: dNote
            });
        });

        const stmtAmtInput = cardEl.querySelector(".input-stmt-amount");
        stmtAmtInput.addEventListener('change', (e) => {
            const parsed = parseAmountInput(e.target.value);
            const absFormatted = Math.abs(parsed).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            e.target.value = parsed < 0 ? `(${absFormatted})` : absFormatted;
            updateCardStyle(cardEl);
            updateCardSum(cardEl);
            updatePendingStatusSummary();
        });
        
        const addSubRowHandler = () => {
            addInlineSubRow(cardEl, {
                caption_id: '',
                category_id: '',
                entity_id: '',
                contact_id: '',
                amount: 0,
                fee: 0,
                wht: 0,
                note: ''
            });
        };
        cardEl.querySelector(".btn-add-subrow").addEventListener("click", addSubRowHandler);
        const headerAddBtn = cardEl.querySelector(".btn-add-subrow-header");
        if (headerAddBtn) headerAddBtn.addEventListener("click", addSubRowHandler);

        cardEl.querySelector(".btn-confirm-single-pending").addEventListener("click", async () => {
            const btn = cardEl.querySelector(".btn-confirm-single-pending");
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            btn.disabled = true;
            
            const payload = getCardPayload(cardEl);
            if (!payload) {
                btn.innerHTML = originalHTML;
                btn.disabled = false;
                return;
            }
            
            try {
                const res = await fetch(`${API_BASE}/api/transactions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(getUserIdHeader()) },
                    body: JSON.stringify(payload)
                });
                
                if (res.ok) {
                    const confirmRes = await fetch(`${API_BASE}/api/transactions/confirm`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ transaction_id: payload.transaction_id })
                    });
                    if (confirmRes.ok) {
                        alert("✅ ยืนยันรายการบัญชีสำเร็จ!");
                        fetchMasterData();
                        loadPending();
                    } else {
                        alert("เกิดข้อผิดพลาดในการยืนยันรายการ");
                        btn.innerHTML = originalHTML;
                        btn.disabled = false;
                    }
                } else {
                    const err = await res.json();
                    alert(`เกิดข้อผิดพลาด: ${err.error}`);
                    btn.innerHTML = originalHTML;
                    btn.disabled = false;
                }
            } catch (err) {
                console.error(err);
                alert("Network Error");
                btn.innerHTML = originalHTML;
                btn.disabled = false;
            }
        });

        cardEl.querySelector(".btn-delete-pending").addEventListener("click", async () => {
            if (confirm("คุณแน่ใจว่าต้องการลบรายการนี้ใช่หรือไม่?")) {
                const res = await fetch(`${API_BASE}/api/transactions/delete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ transaction_id: tx.transaction_id })
                });
                if (res.ok) {
                    fetchMasterData();
                    loadPending();
                }
            }
        });
        
        // WEB_GRID: wire up editable account dropdown → update dataset.accid + card style
        // Also: auto-save on any field change/blur
        if (isWebGrid) {
            const accSel = cardEl.querySelector(".input-account");
            if (accSel) {
                accSel.addEventListener("change", (e) => {
                    cardEl.dataset.accid = e.target.value;
                    updateCardStyle(cardEl);
                });
            }

            const debouncedSave = debounce(() => autoSaveCard(cardEl), 800);
            cardEl.addEventListener('change', debouncedSave);
            cardEl.addEventListener('blur', debouncedSave, true);
        }

        updateCardStyle(cardEl);
        updateCardSum(cardEl);
    });

    // Re-insert unsaved draft cards at the top (legacy safety — should be empty now)
    unsavedCards.forEach(c => container.insertBefore(c, container.firstChild));

    updatePendingStatusSummary();
}

async function updatePendingStatusSummary() {
    await renderSharedStatusSummary();
}

async function updateGridStatusSummary() {
    await renderSharedStatusSummary();
}

async function renderSharedStatusSummary() {
    const gridContainer = document.getElementById("grid-status-summary-container");
    const pendingContainer = document.getElementById("pending-status-summary-container");
    if (!gridContainer && !pendingContainer) return;
    
    // 1. Grid (รอบันทึก) - Calculate sum from grid cards in DOM
    const gridGroups = {};
    const gridCards = document.querySelectorAll("#grid-input-cards-container .tx-card");
    gridCards.forEach(cardEl => {
        const accSelect = cardEl.querySelector(".grid-account");
        const accId = accSelect ? accSelect.value : null;
        if (!accId) return;
        const rawStmtAmountStr = cardEl.querySelector(".grid-total").value;
        const parsedStmtAmount = parseAmountInput(rawStmtAmountStr);
        if (!gridGroups[accId]) gridGroups[accId] = 0;
        gridGroups[accId] += parsedStmtAmount;
    });

    // 2. Pending (รอตรวจสอบ) - from API (non-WEB_GRID) + DOM (WEB_GRID cards, live values)
    const savedPendingGroups = {};
    const confirmedGroups = {};

    // Populate confirmedGroups from AppState.accounts (calculated dynamically on backend)
    if (AppState.accounts) {
        AppState.accounts.forEach(acc => {
            confirmedGroups[acc.account_id] = acc.balance || 0;
        });
    }

    try {
        const pendingRes = await fetch(`${API_BASE}/api/transactions?status=PENDING_REVIEW`, { headers: { 'x-user-id': encodeURIComponent(getUserIdHeader()) } });

        if (pendingRes.ok) {
            const pending = await pendingRes.json();
            (pending || []).forEach(tx => {
                if (!tx.account_id) return;
                // Skip WEB_GRID — we'll read those live from DOM below
                if (tx.source === 'WEB_GRID') return;
                if (!savedPendingGroups[tx.account_id]) savedPendingGroups[tx.account_id] = 0;

                const am = tx.auto_match || {};
                const dType = am.type || tx.details?.[0]?.type || 'INCOME';
                const isExpense = (dType === 'EXPENSE' || dType === 'CREDIT_AR');
                const stmtAmountVal = isExpense ? -Math.abs(tx.total_amount) : Math.abs(tx.total_amount);

                savedPendingGroups[tx.account_id] += stmtAmountVal;
            });
        }
    } catch(e) { console.error("Error fetching summary data", e); }

    // Add WEB_GRID card values direct from DOM (always up-to-date, even mid-edit)
    const pendingCardsContainer = document.getElementById("pending-cards-container");
    if (pendingCardsContainer) {
        pendingCardsContainer.querySelectorAll('.tx-card[data-source="WEB_GRID"]').forEach(cardEl => {
            const accId = cardEl.querySelector(".input-account")?.value || cardEl.dataset.accid;
            if (!accId) return;
            const stmtInput = cardEl.querySelector(".input-stmt-amount");
            const stmtAmount = stmtInput ? parseAmountInput(stmtInput.value) : 0;
            if (!savedPendingGroups[accId]) savedPendingGroups[accId] = 0;
            savedPendingGroups[accId] += stmtAmount;
        });
    }

    const allAccIds = new Set([...Object.keys(gridGroups), ...Object.keys(savedPendingGroups)]);
    
    let html = `
        <div class="pending-status-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; margin-top: 10px;">
    `;
    
    allAccIds.forEach(accId => {
        const acc = AppState.accounts.find(a => a.account_id === accId);
        const accName = acc ? acc.name : 'Unknown Account';
        const bankName = acc ? acc.bank_name : '';
        
        const confirmedSum = confirmedGroups[accId] || 0;
        const pendingSum = savedPendingGroups[accId] || 0;
        const totalSum = confirmedSum + pendingSum;

        const isConfirmedNeg = confirmedSum < 0;
        const isPendingNeg = pendingSum < 0;
        const isTotalNeg = totalSum < 0;
        
        html += `
            <div class="status-summary-card" style="background: #ffffff; border: 1px solid #E2E8F0; border-radius: 12px; padding: 10px 14px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); display: flex; flex-direction: column; gap: 8px; border-left: 4px solid #6366f1;">
                <div style="display: flex; align-items: center; justify-content: space-between; font-weight: 700; color: #1E293B; font-size: 0.9rem;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span>${getBankIcon(bankName)}</span>
                        <span style="color: #4F46E5; font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;">${accName}</span>
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 6px; border-top: 1px solid #F1F5F9; padding-top: 8px;">
                    <div style="display: flex; align-items: center; justify-content: space-between;" title="ยอดยกมา (Confirmed)">
                        <span style="font-size: 1rem;">🏦</span>
                        <span style="font-weight: 700; font-size: 0.9rem; color: ${isConfirmedNeg ? '#DC2626' : '#1E293B'};">${formatCurrency(confirmedSum)}</span>
                    </div>
                    <div style="display: flex; align-items: center; justify-content: space-between;" title="รายการรอตรวจสอบ (Pending)">
                        <span style="font-size: 1rem;">⏳</span>
                        <span style="font-weight: 700; font-size: 0.9rem; color: ${isPendingNeg ? '#DC2626' : '#10B981'};">${formatCurrency(pendingSum)}</span>
                    </div>
                    <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px dashed #E2E8F0; padding-top: 4px;" title="รวม (Total)">
                        <span style="font-size: 1rem;">💰</span>
                        <span style="font-weight: 700; font-size: 0.9rem; color: ${isTotalNeg ? '#DC2626' : '#4F46E5'};">${formatCurrency(totalSum)}</span>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += `</div>`;
    
    if (allAccIds.size === 0) {
        if (gridContainer) { gridContainer.innerHTML = ''; gridContainer.style.display = 'none'; }
        if (pendingContainer) { pendingContainer.innerHTML = ''; pendingContainer.style.display = 'none'; }
    } else {
        if (gridContainer) { gridContainer.innerHTML = html; gridContainer.style.display = 'block'; }
        if (pendingContainer) { pendingContainer.innerHTML = html; pendingContainer.style.display = 'block'; }
    }
}

// ==========================================
// 📂 LOAD VIEW: HISTORY & DETAILS
// ==========================================

function getCrystalCaptionHtml(captionName) {
    if (!captionName) return '';
    let hash = 0;
    for (let i = 0; i < captionName.length; i++) {
        hash = captionName.charCodeAt(i) + ((hash << 5) - hash);
    }
    // Use a slightly different hue offset or saturation to distinguish from Category
    const hue = Math.abs((hash + 45) % 360);
    return `<span style="
        display: inline-flex;
        align-items: center;
        background: linear-gradient(135deg, hsl(${hue}, 85%, 96%), hsl(${hue}, 75%, 92%));
        color: hsl(${hue}, 85%, 35%);
        border: 1px solid rgba(255,255,255,0.9);
        box-shadow: 0 2px 4px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.7);
        border-radius: 20px;
        padding: 2px 10px;
        font-size: 0.75rem;
        font-weight: 700;
        margin-right: 4px;
        margin-bottom: 4px;
        white-space: nowrap;
    "><i class="fa-solid fa-tag" style="font-size: 0.65rem; margin-right: 4px; opacity: 0.85;"></i> ${captionName}</span>`;
}

function getCrystalCategoryHtml(categoryName) {
    if (!categoryName) return '';
    let hash = 0;
    for (let i = 0; i < categoryName.length; i++) {
        hash = categoryName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `<span style="
        display: inline-flex;
        align-items: center;
        background: linear-gradient(135deg, hsl(${hue}, 80%, 95%), hsl(${hue}, 70%, 90%));
        color: hsl(${hue}, 80%, 30%);
        border: 1px solid rgba(255,255,255,0.8);
        box-shadow: 0 2px 4px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.6);
        border-radius: 20px;
        padding: 2px 10px;
        font-size: 0.75rem;
        font-weight: 700;
        margin-right: 4px;
        margin-bottom: 4px;
        white-space: nowrap;
    "><i class="fa-solid fa-cube" style="font-size: 0.65rem; margin-right: 4px; opacity: 0.8;"></i> ${categoryName}</span>`;
}

function getCompactCrystalCategoryHtml(categoryName) {
    if (!categoryName) return '';
    let hash = 0;
    for (let i = 0; i < categoryName.length; i++) {
        hash = categoryName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `<span style="
        display: flex;
        align-items: center;
        color: #64748b;
        font-size: 0.65rem;
        line-height: 1.1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    "><div style="width:4px; height:4px; border-radius:50%; flex-shrink: 0; background:hsl(${hue}, 80%, 50%); margin-right:3px;"></div>${categoryName}</span>`;
}

async function loadHistory() {
    const monthYear = document.getElementById("filter-month-year")?.value || '';
    const startDateRaw = document.getElementById("filter-start-date")?.value || '';
    const endDateRaw = document.getElementById("filter-end-date")?.value || '';
    const search = document.getElementById("filter-search")?.value || '';
    const statementFilter = document.getElementById("filter-statement")?.value || 'ALL';
    const captionFilter = document.getElementById("filter-caption")?.value || 'ALL';
    const categoryFilter = document.getElementById("filter-category")?.value || 'ALL';
    const companyFilter = document.getElementById("filter-company")?.value || 'ALL';
    const customerFilter = document.getElementById("filter-customer")?.value || 'ALL';
    const sortFilter = document.getElementById("history-sort-filter")?.value || 'desc';

    let url = `${API_BASE}/api/transactions?status=CONFIRMED`;
    if (monthYear) url += `&month=${monthYear}`;
    if (startDateRaw) url += `&startDate=${normalizeDateToYYYYMMDD(startDateRaw)}`;
    if (endDateRaw) url += `&endDate=${normalizeDateToYYYYMMDD(endDateRaw)}`;
    
    try {
        const res = await fetch(url, {
            headers: { 'x-user-id': encodeURIComponent(getUserIdHeader()) }
        });
        let history = await res.json();

        // Apply dropdown filters
        history = history.filter(tx => {
            if (statementFilter !== 'ALL' && tx.account_name !== statementFilter) return false;
            
            if (captionFilter !== 'ALL' || categoryFilter !== 'ALL' || companyFilter !== 'ALL' || customerFilter !== 'ALL') {
                const hasMatchingDetail = (tx.details || []).some(d => {
                    const matchCap = (captionFilter === 'ALL' || d.type === captionFilter);
                    const matchCat = (categoryFilter === 'ALL' || d.category_name === categoryFilter);
                    const matchComp = (companyFilter === 'ALL' || d.entity_name === companyFilter);
                    const matchCust = (customerFilter === 'ALL' || d.contact_name === customerFilter);
                    return matchCap && matchCat && matchComp && matchCust;
                });
                if (!hasMatchingDetail) return false;
            }
            return true;
        });
        
        // Client-side text filter for Keyword
        if (search) {
            const s = search.toLowerCase();
            history = history.filter(tx => {
                if (tx.account_name && tx.account_name.toLowerCase().includes(s)) return true;
                if (tx.total_amount && tx.total_amount.toString().includes(s)) return true;
                if (tx.statement_desc && tx.statement_desc.toLowerCase().includes(s)) return true;
                
                for (let d of (tx.details || [])) {
                    if (d.category_name && d.category_name.toLowerCase().includes(s)) return true;
                    if (d.project_name && d.project_name.toLowerCase().includes(s)) return true;
                    if (d.note && d.note.toLowerCase().includes(s)) return true;
                    if (d.fee && d.fee.toString().includes(s)) return true;
                }
                return false;
            });
        }
        
        // Sort
        history.sort((a, b) => {
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            return sortFilter === 'asc' ? dateA - dateB : dateB - dateA;
        });
        
        const listContainer = document.getElementById("history-master-list");
        if (!listContainer) return; 
        listContainer.innerHTML = '';
        
        // Hide detail view initially
        document.getElementById("history-detail-placeholder").style.display = 'flex';
        document.getElementById("history-detail-content").style.display = 'none';

        if (history.length === 0) {
            listContainer.innerHTML = '<div style="text-align: center; color: #888; padding: 20px;">ไม่พบรายการที่ค้นหา</div>';
            return;
        }

        history.forEach(tx => {
            const item = document.createElement("div");
            item.className = "history-master-item";
            item.style.cssText = "padding: 8px 12px; margin-bottom: 4px; background: #ffffff; border: none; border-radius: 8px; cursor: pointer; transition: all 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.05);";
            
            let totalFee = 0;
            let totalWht = 0;
            (tx.details || []).forEach(d => {
                totalFee += (d.fee || 0);
                totalWht += (d.wht || 0);
            });

            // Get unique category names from sub-transactions
            const uniqueCats = [...new Set((tx.details || []).map(d => d.category_name || 'อื่นๆ'))];
            const compactCatHtml = uniqueCats.map(c => getCompactCrystalCategoryHtml(c)).join('');

            // Get unique company, customer, caption
            const uniqueComps = [...new Set((tx.details || []).map(d => d.entity_name || (AppState.entities.find(e => String(e.entity_id) === String(d.entity_id))?.name)).filter(n => n))];
            const compStr = uniqueComps.join(', ') || '-';
            const uniqueCusts = [...new Set((tx.details || []).map(d => d.contact_name || ((AppState.contacts || []).find(c => String(c.contact_id) === String(d.contact_id))?.name)).filter(n => n))];
            const custStr = uniqueCusts.join(', ') || '-';
            const uniqueCaps = [...new Set((tx.details || []).map(d => {
                const capId = d.caption_id || d.behavior;
                const capObj = AppState.captions.find(c => c.type_id === capId || c.behavior === capId);
                return capObj ? capObj.name : capId;
            }).filter(n => n))];
            const compactCapHtml = uniqueCaps.map(c => getCompactCrystalCategoryHtml(c)).join('') || '-';

            const amountColor = tx.total_amount < 0 ? '#db2777' : '#0ea5e9';

            item.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1.5;">
                        <span style="font-size: 0.75rem; color: #10b981; font-weight: 600; white-space: nowrap;">${tx.date.split(' ')[0]}</span>
                        <div style="display: flex; flex-direction: column; min-width: 0; flex: 1;">
                            <span style="font-weight: 600; color: #0369a1; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: none;" title="${tx.account_name || '-'}">${tx.account_name || '-'}</span>
                            <div style="display: flex; gap: 6px; font-size: 0.75rem; color: #334155; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                <span style="color: #0f172a; font-weight: 700;">🏢 ${compStr}</span>
                                <span style="color: #0f172a; font-weight: 700;">🧑‍💼 ${custStr}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div style="display: flex; align-items: center; justify-content: flex-end; gap: 10px; font-size: 0.75rem; white-space: nowrap; flex: 1; min-width: 0;">
                        <div style="display: flex; flex-direction: column; gap: 2px; justify-content: center; flex: 1; color: #64748b; font-size: 0.7rem; overflow: hidden;">
                            ${compactCapHtml}
                            ${compactCatHtml}
                        </div>
                        <div style="display: flex; gap: 8px; flex-shrink: 0; align-items: center;">
                            <div style="display: flex; flex-direction: column; align-items: flex-end; justify-content: center; gap: 2px; font-size: 12px; line-height: 1;">
                                ${totalWht ? `<span style="color: #f97316;" title="WHT"><i class="fa-solid fa-file-invoice" style="opacity:0.6;"></i> ${formatCurrency(totalWht)}</span>` : ''}
                                ${totalFee ? `<span style="color: #f97316;" title="Fee"><i class="fa-solid fa-bolt" style="opacity:0.6;"></i> ${formatCurrency(totalFee)}</span>` : ''}
                            </div>
                            <span style="font-weight: 700; color: ${amountColor}; font-size: 0.9rem; min-width: 80px; text-align: right;">${formatCurrency(tx.total_amount)}</span>
                        </div>
                    </div>
                </div>
            `;
            
            item.onmouseover = () => item.style.background = '#f0fdfa';
            item.onmouseout = () => { if (!item.classList.contains('active')) item.style.background = '#ffffff'; };
            
            item.addEventListener("click", () => {
                document.querySelectorAll(".history-master-item").forEach(el => {
                    el.classList.remove('active');
                    el.style.background = '#ffffff';
                    el.style.borderLeft = 'none';
                });
                item.classList.add('active');
                item.style.background = '#e0f2fe';
                item.style.borderLeft = '4px solid #0ea5e9';
                
                renderHistoryDetail(tx);
            });
            listContainer.appendChild(item);
        });

    } catch (e) {
        console.error("History Load Error:", e);
    }
}
function openTransactionModalFromHistory(txId) {
    if (AppState.currentHistoryTx && AppState.currentHistoryTx.transaction_id === txId) {
        openTransactionModal(txId, [AppState.currentHistoryTx]);
    }
}
window.deleteHistoryTransaction = async function(txId) {
    if (confirm("คุณแน่ใจว่าต้องการลบรายการนี้ใช่หรือไม่?")) {
        try {
            const res = await fetch(`${API_BASE}/api/transactions/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transaction_id: txId })
            });
            if (res.ok) {
                document.getElementById('history-detail-placeholder').style.display = 'flex';
                document.getElementById('history-detail-content').style.display = 'none';
                loadHistory();
            } else {
                alert("ลบรายการไม่สำเร็จ");
            }
        } catch(e) {
            alert("เกิดข้อผิดพลาดในการลบรายการ");
        }
    }
};

// State for inline editing
AppState.draftHistoryTx = null;
AppState.editingDetailIds = new Set();
AppState.editingMaster = false;
AppState.hasDraftChanges = false;

function initDraftState(tx) {
    if (!AppState.draftHistoryTx || AppState.draftHistoryTx.transaction_id !== tx.transaction_id) {
        AppState.draftHistoryTx = JSON.parse(JSON.stringify(tx));
        AppState.draftHistoryTx.details.forEach((d, i) => {
            if (!d.detail_id) d.detail_id = 'temp_' + i + '_' + Date.now();
        });
        AppState.editingDetailIds.clear();
        AppState.editingMaster = false;
        AppState.hasDraftChanges = false;
    }
}

function renderHistoryDetail(tx) {
    AppState.currentHistoryTx = tx;
    initDraftState(tx);
    
    document.getElementById("history-detail-placeholder").style.display = 'none';
    const detailContent = document.getElementById("history-detail-content");
    detailContent.style.display = 'block';
    
    renderDraftHistoryDetail();
}

function renderDraftHistoryDetail() {
    const detailContent = document.getElementById("history-detail-content");
    const tx = AppState.draftHistoryTx;
    if (!tx) return;
    
    let subTxHtml = '';
    let totalFee = 0;
    let totalWht = 0;

    tx.details.forEach(d => {
        const capObj = AppState.captions.find(at => at.type_id === d.caption_id || at.behavior === d.behavior);
        const resolvedTypeId = capObj ? capObj.type_id : d.caption_id;
        const resolvedTypeName = capObj ? capObj.name : (d.caption_id || '-');
        
        const isExp = (resolvedTypeId && String(resolvedTypeId).includes('Expense')) || (d.behavior === 'EXPENSE' || d.behavior === 'LIABILITY');
        const cColor = isExp ? '#ef4444' : '#10b981';
        
        totalFee += Number(d.fee || 0);
        totalWht += Number(d.wht || 0);
        
        const isEditing = AppState.editingDetailIds.has(d.detail_id);
        
        const cardStyle = "background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); position: relative;";
        // Advanced seamless styles
        const inputStyle = "width: 100%; border: none; border-radius: 0; font-size: 0.85rem; font-weight: 700; background: transparent; outline: none; box-shadow: none;";
        const selectStyle = "width: 100%; border: none; border-radius: 0; font-size: 0.8rem; font-weight: 700; background: transparent; color: #0f172a; outline: none; box-shadow: none; appearance: none; -webkit-appearance: none; cursor: pointer;";
        
        // Inject global style for hiding number spinners if not present
        if (!document.getElementById('seamless-styles')) {
            const style = document.createElement('style');
            style.id = 'seamless-styles';
            style.innerHTML = `
                .seamless-num::-webkit-outer-spin-button,
                .seamless-num::-webkit-inner-spin-button {
                    -webkit-appearance: none;
                    margin: 0;
                }
                .seamless-num {
                    -moz-appearance: textfield;
                }
                .seamless-input, select.seamless-input, input.seamless-input {
                    margin: 0 !important;
                    padding: 0 !important;
                    font: inherit !important;
                    letter-spacing: inherit !important;
                    color: inherit !important;
                    box-sizing: border-box;
                    vertical-align: baseline !important;
                    box-shadow: none !important;
                    background: transparent !important;
                    border: none !important;
                    border-radius: 0 !important;
                    outline: none !important;
                    appearance: none !important;
                    -webkit-appearance: none !important;
                    -webkit-font-smoothing: inherit !important;
                    -moz-osx-font-smoothing: inherit !important;
                    text-rendering: optimizeLegibility !important;
                }
                select.seamless-input {
                    padding-right: 0 !important;
                }
            `;
            document.head.appendChild(style);
        }

        
        let txTypeOptions = `<option value="">Caption</option>`;
        AppState.captions.forEach(at => {
            txTypeOptions += `<option value="${at.type_id}" ${resolvedTypeId === at.type_id ? 'selected' : ''}>${at.name}</option>`;
        });

        let entityOptions = '<option value="">Company</option>';
        AppState.entities.forEach(ent => {
            entityOptions += `<option value="${ent.entity_id}" ${d.entity_id === ent.entity_id ? 'selected' : ''}>${ent.name}</option>`;
        });

        let contactOptions = '<option value="">Customer</option>';
        AppState.contacts.forEach(cont => {
            contactOptions += `<option value="${cont.contact_id}" ${d.contact_id === cont.contact_id ? 'selected' : ''}>${cont.name}</option>`;
        });
        
        let categoryOpts = '<option value="">-</option>';
        AppState.categories
            .filter(c => c.caption_id === resolvedTypeId)
            .forEach(c => {
                const sel = String(c.category_id) === String(d.category_id) ? 'selected' : '';
                categoryOpts += `<option value="${c.category_id}" ${sel}>${c.name}</option>`;
            });


        subTxHtml += `
            <div style="${cardStyle}">
                <div style="position: absolute; top: 10px; right: 10px; display: flex; gap: 6px;">
                    ${isEditing 
                        ? `<button onclick="finishEditDetail('${d.detail_id}')" style="border: none; background: #dcfce7; color: #16a34a; width: 24px; height: 24px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 2px rgba(22,163,74,0.2); transition: all 0.2s;" title="Done"><i class="fa-solid fa-check" style="font-size: 0.7rem;"></i></button>`
                        : `<button onclick="enterEditDetail('${d.detail_id}')" style="border: none; background: #e0f2fe; color: #0284c7; width: 24px; height: 24px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 2px rgba(2,132,199,0.2); transition: all 0.2s;" title="Edit"><i class="fa-solid fa-pencil" style="font-size: 0.7rem;"></i></button>`
                    }
                    <button onclick="deleteDraftDetail('${d.detail_id}')" style="border: none; background: #fee2e2; color: #ef4444; width: 24px; height: 24px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 2px rgba(239,68,68,0.2); transition: all 0.2s;" title="Delete"><i class="fa-solid fa-trash-can" style="font-size: 0.7rem;"></i></button>
                </div>
                <div style="display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 6px; margin-bottom: 8px; padding-right: 55px;">
                    <div style="min-width: 0;">
                        <div style="font-size: 0.65rem; color: #64748b; margin-bottom: 2px;">Caption</div>
                        ${isEditing 
                            ? `<div style="position: relative; display: block; width: 100%;">
                                 ${getCrystalCaptionHtml(resolvedTypeName)}
                                 <select class="seamless-input" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; appearance: none; -webkit-appearance: none;" onchange="updateDraftDetail('${d.detail_id}', 'caption_id', this.value)">${txTypeOptions}</select>
                               </div>`
                            : `${getCrystalCaptionHtml(resolvedTypeName)}`
                        }
                    </div>
                    <div style="min-width: 0;">
                        <div style="font-size: 0.65rem; color: #64748b; margin-bottom: 2px;">Category</div>
                        ${isEditing 
                            ? `<div style="position: relative; display: block; width: 100%;">
                                 <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 0.8rem;">${getCrystalCategoryHtml(d.category_name || 'อื่นๆ')}</div>
                                 <select id="cat-${d.detail_id}" class="seamless-input" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; appearance: none; -webkit-appearance: none;" onchange="updateDraftDetail('${d.detail_id}', 'category_id', this.value)">${categoryOpts}</select>
                               </div>`
                            : `<div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 0.8rem;">${getCrystalCategoryHtml(d.category_name || 'อื่นๆ')}</div>`
                        }
                    </div>
                    <div style="min-width: 0;">
                        <div style="font-size: 0.65rem; color: #64748b; margin-bottom: 2px;">Company</div>
                        ${isEditing
                            ? `<div style="position: relative; display: block; width: 100%;">
                                 <div style="font-weight: 700; color: #0f172a; font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${d.entity_name || (AppState.entities.find(e => String(e.entity_id) === String(d.entity_id))?.name) || (d.entity_id ? `ID:${d.entity_id}` : '-')}</div>
                                 <select class="seamless-input" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; appearance: none; -webkit-appearance: none;" onchange="updateDraftDetail('${d.detail_id}', 'entity_id', this.value)">${entityOptions}</select>
                               </div>`
                            : `<div style="font-weight: 700; color: #0f172a; font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${d.entity_name || (AppState.entities.find(e => String(e.entity_id) === String(d.entity_id))?.name) || (d.entity_id ? `ID:${d.entity_id}` : '-')}</div>`
                        }
                    </div>
                    <div style="min-width: 0;">
                        <div style="font-size: 0.65rem; color: #64748b; margin-bottom: 2px;">Customer</div>
                        ${isEditing
                            ? `<div style="position: relative; display: block; width: 100%;">
                                 <div style="font-weight: 700; color: #0f172a; font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${d.contact_name || ((AppState.contacts || []).find(c => String(c.contact_id) === String(d.contact_id))?.name) || '-'}</div>
                                 <select class="seamless-input" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; appearance: none; -webkit-appearance: none;" onchange="updateDraftDetail('${d.detail_id}', 'contact_id', this.value)">${contactOptions}</select>
                               </div>`
                            : `<div style="font-weight: 700; color: #0f172a; font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${d.contact_name || ((AppState.contacts || []).find(c => String(c.contact_id) === String(d.contact_id))?.name) || '-'}</div>`
                        }
                    </div>
                </div>
                <div style="display: flex; align-items: center; border-top: 1px dashed #cbd5e1; padding-top: 8px; width: 100%; gap: 12px; height: 28px;">
                    <div style="flex: 1.4; display: flex; align-items: center; min-width: 0; height: 100%;">
                        <span style="font-size: 0.75rem; color: #64748b; white-space: nowrap; margin-right: 4px;">Amount:</span>
                        <div style="font-weight: 700; color: ${Number(d.amount) < 0 ? '#ef4444' : '#10b981'}; font-size: 0.85rem; flex: 1; width: 100%; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: right; display: flex; align-items: center; justify-content: flex-end; height: 100%;">
                        ${isEditing
                            ? `<input type="text" inputmode="decimal" class="seamless-input" style="width: 100%; text-align: right;" value="${formatCurrency(d.amount)}" onfocus="this.value = (this.value === '' || parseFormattedNum(this.value) === 0) ? '' : parseFormattedNum(this.value)" oninput="updateDraftDetail('${d.detail_id}', 'amount', parseFormattedNum(this.value))" onblur="let num = parseFormattedNum(this.value); updateDraftDetail('${d.detail_id}', 'amount', num); this.value = formatCurrency(num)">`
                            : `<span>${formatCurrency(d.amount)}</span>`
                        }
                        </div>
                    </div>
                    <div style="flex: 1; display: flex; align-items: center; min-width: 0; height: 100%;">
                        <span style="font-size: 0.75rem; color: #64748b; white-space: nowrap; margin-right: 4px;">WHT:</span>
                        <div style="font-weight: 600; color: ${Number(d.wht || 0) < 0 ? '#ef4444' : '#10b981'}; font-size: 0.85rem; flex: 1; width: 100%; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: right; display: flex; align-items: center; justify-content: flex-end; height: 100%;">
                        ${isEditing
                            ? `<input type="text" inputmode="decimal" class="seamless-input" style="width: 100%; text-align: right;" value="${formatCurrency(d.wht || 0)}" onfocus="this.value = (this.value === '' || parseFormattedNum(this.value) === 0) ? '' : parseFormattedNum(this.value)" oninput="updateDraftDetail('${d.detail_id}', 'wht', parseFormattedNum(this.value))" onblur="let num = parseFormattedNum(this.value); updateDraftDetail('${d.detail_id}', 'wht', num); this.value = formatCurrency(num)">`
                            : `<span>${formatCurrency(d.wht || 0)}</span>`
                        }
                        </div>
                    </div>
                    <div style="flex: 1; display: flex; align-items: center; min-width: 0; height: 100%;">
                        <span style="font-size: 0.75rem; color: #64748b; white-space: nowrap; margin-right: 4px;">Fee:</span>
                        <div style="font-weight: 600; color: ${Number(d.fee || 0) < 0 ? '#ef4444' : '#10b981'}; font-size: 0.85rem; flex: 1; width: 100%; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: right; display: flex; align-items: center; justify-content: flex-end; height: 100%;">
                        ${isEditing
                            ? `<input type="text" inputmode="decimal" class="seamless-input" style="width: 100%; text-align: right;" value="${formatCurrency(d.fee || 0)}" onfocus="this.value = (this.value === '' || parseFormattedNum(this.value) === 0) ? '' : parseFormattedNum(this.value)" oninput="updateDraftDetail('${d.detail_id}', 'fee', parseFormattedNum(this.value))" onblur="let num = parseFormattedNum(this.value); updateDraftDetail('${d.detail_id}', 'fee', num); this.value = formatCurrency(num)">`
                            : `<span>${formatCurrency(d.fee || 0)}</span>`
                        }
                        </div>
                    </div>
                </div>
                ${(isEditing || d.note) ? `
                    <div style="margin-top: 8px;">
                        <div style="font-size: 0.8rem; color: #334155; font-weight: normal; background: #f8fafc; border: 1px solid #e2e8f0; padding: 6px 8px; border-radius: 6px; display: flex; align-items: center; width: 100%; box-sizing: border-box; height: 32px;">
                            <i class="fa-solid fa-note-sticky" style="color:#94a3b8; margin-right:5px; flex-shrink: 0;"></i>
                            ${isEditing 
                                ? `<input type="text" class="seamless-input" style="flex: 1; width: 100%; min-width: 0; font-size: 0.8rem;" value="${d.note || ''}" placeholder="รายละเอียด..." oninput="updateDraftDetail('${d.detail_id}', 'note', this.value)" onchange="updateDraftDetail('${d.detail_id}', 'note', this.value)">`
                                : `<span style="flex: 1; width: 100%; min-width: 0; font-size: 0.8rem;">${d.note}</span>`
                            }
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    });

    let globalActionButtons = '';
    if (AppState.hasDraftChanges || AppState.editingDetailIds.size > 0 || AppState.editingMaster) {
        globalActionButtons = `
            <div style="display: flex; justify-content: center; gap: 10px; margin-top: 15px; padding-top: 15px; border-top: 1px solid #e2e8f0;">
                <button onclick="cancelDraftHistory()" class="btn btn-secondary" style="padding: 6px 15px; font-size: 0.85rem; border-radius: 6px;"><i class="fa-solid fa-xmark" style="margin-right: 4px;"></i> ยกเลิกการแก้ไข</button>
                <button onclick="saveDraftHistory()" class="btn btn-primary" style="padding: 6px 15px; font-size: 0.85rem; border-radius: 6px; background: #10b981; border-color: #10b981; color: white;"><i class="fa-solid fa-floppy-disk" style="margin-right: 4px;"></i> บันทึกรายการที่แก้ไข</button>
            </div>
        `;
    }

    const inputStyle = "border: none; border-bottom: 1px dashed #94a3b8; border-radius: 0; padding: 0 0 2px 0; font-size: 0.8rem; background: transparent; color: inherit; outline: none; box-shadow: none;";

    detailContent.innerHTML = `
        <div style="margin-bottom: 20px; padding: 10px; border-bottom: 1px solid #e2e8f0; background: #f1f5f9; border-radius: 10px; position: relative;">
            
            <div style="display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: flex-start; margin-bottom: 12px; gap: 10px;">
                <div>
                    <h3 style="margin: 0 0 5px 0; color: #0284c7; font-size: 1.1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${tx.account_name || 'ไม่ระบุบัญชี'}</h3>
                    <div style="font-size: 0.8rem; color: #475569; display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
                        <span><i class="fa-regular fa-calendar"></i> ${tx.date.split(' ')[0]}</span>
                        ${tx.time ? `<span><i class="fa-regular fa-clock"></i> ${tx.time.substring(0,5)}</span>` : ''}
                        ${tx.ref_code ? `<span><i class="fa-solid fa-receipt"></i> Ref: ${tx.ref_code}</span>` : ''}
                    </div>
                </div>
                <div style="text-align: right; min-width: 130px;">
                    <div style="font-size: 0.75rem; color: #64748b; margin-bottom: 2px;">Statement Amount</div>
                    <div style="font-size: 1.25rem; font-weight: 800; color: #0ea5e9; outline: none; min-width: 50px;" 
                        ${AppState.editingMaster ? 'contenteditable="true" inputmode="decimal"' : ''}
                        onfocus="let val = parseFormattedNum(this.innerText); if(val === 0) this.innerText = ''; else this.innerText = val;"
                        onblur="let num = parseFormattedNum(this.innerText); updateMasterDraft('total_amount', num); this.innerText = formatCurrency(num);"
                    >${formatCurrency(tx.total_amount)}</div>
                </div>
            </div>

            <!-- Main Transaction Highlights -->
            <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
                <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 8px; flex: 1; min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
                    <span style="font-size: 0.75rem; color: #64748b; white-space: nowrap;">Total Fee</span>
                    <span style="font-size: 0.85rem; font-weight: 700; color: #f97316;">${formatCurrency(totalFee)}</span>
                </div>
                <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 8px; flex: 1; min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
                    <span style="font-size: 0.75rem; color: #64748b; white-space: nowrap;">Total WHT</span>
                    <span style="font-size: 0.85rem; font-weight: 700; color: #f97316;">${formatCurrency(totalWht)}</span>
                </div>
                
                <div style="display: flex; gap: 6px; padding-left: 5px;">
                    ${AppState.editingMaster
                        ? `<button onclick="toggleMasterEdit()" style="border: none; background: #dcfce7; color: #16a34a; width: 28px; height: 28px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 2px rgba(22,163,74,0.2); transition: all 0.2s;" title="Done"><i class="fa-solid fa-check" style="font-size: 0.8rem;"></i></button>`
                        : `<button onclick="toggleMasterEdit()" style="border: none; background: #e0f2fe; color: #0284c7; width: 28px; height: 28px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 2px rgba(2,132,199,0.2); transition: all 0.2s;" title="Edit Statement"><i class="fa-solid fa-pencil" style="font-size: 0.8rem;"></i></button>`
                    }
                    <button onclick="deleteHistoryTransaction(${tx.transaction_id})" style="border: none; background: #fee2e2; color: #ef4444; width: 28px; height: 28px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 2px rgba(239,68,68,0.2); transition: all 0.2s;" title="Delete Entire Transaction"><i class="fa-solid fa-trash-can" style="font-size: 0.8rem;"></i></button>
                </div>
            </div>
        </div>
        
        <h5 style="margin-bottom: 12px; color: #1e293b; font-size: 1rem; display: flex; justify-content: space-between; align-items: center;">
            <div><i class="fa-solid fa-layer-group" style="color:#0ea5e9;"></i> รายการย่อย (Sub-transactions) <span style="font-size: 0.8rem; font-weight: normal; color: #64748b; margin-left: 5px;">${tx.details.length} รายการ</span></div>
            ${AppState.hasDraftChanges ? '<span style="font-size: 0.75rem; background: #fef08a; color: #854d0e; padding: 2px 6px; border-radius: 4px; font-weight: normal;">*มีการเปลี่ยนแปลง</span>' : ''}
        </h5>
        ${subTxHtml}
        ${globalActionButtons}
    `;
}

// Inline editing functions

window.parseFormattedNum = function(val) {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    let str = String(val).trim();
    let isNeg = false;
    if (str.startsWith('(') && str.endsWith(')')) {
        isNeg = true;
        str = str.substring(1, str.length - 1);
    } else if (str.startsWith('-')) {
        isNeg = true;
        str = str.substring(1);
    }
    str = str.replace(/,/g, '');
    let num = Number(str);
    return isNeg ? -num : num;
};

window.enterEditDetail = function(detailId) {
    AppState.editingDetailIds.add(detailId);
    renderDraftHistoryDetail();
};

window.finishEditDetail = function(detailId) {
    AppState.editingDetailIds.delete(detailId);
    renderDraftHistoryDetail();
};

window.updateDraftDetail = function(detailId, field, value) {
    const tx = AppState.draftHistoryTx;
    const d = tx.details.find(d => String(d.detail_id) === String(detailId));
    if (!d) return;
    
    d[field] = value;
    let needsRender = false;
    
    // Update names for display if needed
    if (field === 'category_id') {
        const cat = AppState.categories.find(c => String(c.category_id) === String(value));
        if (cat) d.category_name = cat.name;
        needsRender = true;
    }
    if (field === 'entity_id') {
        const ent = AppState.entities.find(e => String(e.entity_id) === String(value));
        if (ent) d.entity_name = ent.name;
        needsRender = true;
    }
    if (field === 'contact_id') {
        const con = (AppState.contacts || []).find(c => String(c.contact_id) === String(value));
        if (con) d.contact_name = con.name;
        needsRender = true;
    }
    if (field === 'caption_id') {
        d.category_id = '';
        d.category_name = '';
        // Update d.behavior based on caption behavior
        const cap = AppState.captions.find(c => String(c.type_id) === String(value));
        if (cap) {
            d.behavior = cap.behavior;
        }
        needsRender = true;
    }
    
    AppState.hasDraftChanges = true;
    if (needsRender && AppState.editingDetailIds.has(detailId)) {
        renderDraftHistoryDetail();
    }
};

window.toggleMasterEdit = function() {
    AppState.editingMaster = !AppState.editingMaster;
    renderDraftHistoryDetail();
};

window.updateMasterDraft = function(field, value) {
    AppState.draftHistoryTx[field] = value;
    AppState.hasDraftChanges = true;
};

window.deleteDraftDetail = function(detailId) {
    if (confirm("ลบรายการย่อยนี้หรือไม่? (ยังไม่บันทึกจนกว่าจะกด 'บันทึกรายการที่แก้ไข')")) {
        AppState.draftHistoryTx.details = AppState.draftHistoryTx.details.filter(d => d.detail_id !== detailId);
        AppState.editingDetailIds.delete(detailId);
        AppState.hasDraftChanges = true;
        renderDraftHistoryDetail();
    }
};

window.updateDraftCategoryOptions = function(captionId, selectId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    let opts = '<option value="">-</option>';
    AppState.categories
        .filter(c => c.caption_id === captionId)
        .forEach(c => {
            opts += `<option value="${c.category_id}">${c.name}</option>`;
        });
    sel.innerHTML = opts;
    const detailId = selectId.replace('cat-', '');
    updateDraftDetail(detailId, 'category_id', sel.value);
};

window.cancelDraftHistory = function() {
    if (confirm("คุณต้องการยกเลิกการแก้ไขทั้งหมดและกลับไปใช้ข้อมูลเดิมใช่หรือไม่?")) {
        AppState.draftHistoryTx = null;
        renderHistoryDetail(AppState.currentHistoryTx);
    }
};

window.saveDraftHistory = async function() {
    const tx = AppState.draftHistoryTx;
    if (!tx) return;
    
    const stmtAmount = Number(tx.total_amount) || 0;
    let calculatedTotal = 0;
    
    tx.details.forEach(d => {
        let amt = Number(d.amount || 0);
        let f = Number(d.fee || 0);
        let w = Number(d.wht || 0);
        calculatedTotal += (amt + f + w);
    });
    
    if (Math.abs(Math.abs(calculatedTotal) - stmtAmount) > 0.01) {
        alert(`ผลรวมยอดรายการย่อย (${Math.abs(calculatedTotal)}) ไม่ตรงกับยอด Statement (${stmtAmount})\nกรุณาแก้ไขให้ผลต่างเป็น 0`);
        return;
    }
    
    try {
        const btn = document.querySelector('button[onclick="saveDraftHistory()"]');
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';
            btn.disabled = true;
        }
        
        const payload = {
            transaction_id: tx.transaction_id,
            account_id: tx.account_id,
            date: tx.date,
            time: tx.time || '',
            total_amount: tx.total_amount,
            note: tx.note || '',
            ref_code: tx.ref_code || '',
            status: tx.status || 'CONFIRMED',
            details: tx.details.map(d => ({
                detail_id: d.detail_id && !String(d.detail_id).startsWith('temp_') ? d.detail_id : undefined,
                caption_id: d.caption_id || d.behavior,
                category_id: d.category_id,
                entity_id: d.entity_id || null,
                contact_id: d.contact_id || null,
                amount: d.amount,
                wht: d.wht,
                fee: d.fee,
                note: d.note
            }))
        };
        
        const res = await fetch(`${API_BASE}/api/transactions`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-user-id': encodeURIComponent(getUserIdHeader())
            },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            AppState.draftHistoryTx = null;
            AppState.hasDraftChanges = false;
            AppState.editingDetailIds.clear();
            AppState.editingMaster = false;
            fetchMasterData();
            loadHistory();
            
            document.getElementById('history-detail-placeholder').style.display = 'flex';
            document.getElementById('history-detail-content').style.display = 'none';
        } else {
            let errorMsg = 'บันทึกไม่สำเร็จ';
            try {
                const errData = await res.json();
                if (errData.error) errorMsg += '\nสาเหตุ: ' + errData.error;
            } catch (ex) {}
            alert(errorMsg);
            if (btn) {
                btn.innerHTML = '<i class="fa-solid fa-floppy-disk" style="margin-right: 4px;"></i> บันทึกรายการที่แก้ไข';
                btn.disabled = false;
            }
        }
    } catch (e) {
        alert('เกิดข้อผิดพลาดในการบันทึก');
        console.error(e);
    }
};


function bindActions() {
    // Month Year Filter Init
    const mySelect = document.getElementById("filter-month-year");
    if (mySelect) {
        mySelect.innerHTML = '<option value="">ทั้งหมด</option>';
        const d = new Date();
        const curM = String(d.getMonth() + 1).padStart(2, '0');
        const curY = d.getFullYear();
        const defaultVal = `${curY}-${curM}`;
        
        for (let i = 0; i < 24; i++) {
            const m = d.getMonth() + 1;
            const y = d.getFullYear();
            const mm = m < 10 ? '0' + m : m;
            const val = `${y}-${mm}`;
            const label = `${mm}/${y}`;
            mySelect.innerHTML += `<option value="${val}">${label}</option>`;
            d.setMonth(d.getMonth() - 1);
        }
        mySelect.value = defaultVal;
    }

    // History Filter Action
    document.getElementById("btn-filter-search").addEventListener("click", loadHistory);
    document.getElementById("btn-filter-clear").addEventListener("click", () => {
        if(mySelect) mySelect.value = '';
        document.getElementById("filter-start-date").value = '';
        document.getElementById("filter-end-date").value = '';
        document.getElementById("filter-search").value = '';
        const filterStatement = document.getElementById("filter-statement");
        if (filterStatement) filterStatement.value = 'ALL';
        const filterCaption = document.getElementById("filter-caption");
        if (filterCaption) filterCaption.value = 'ALL';
        const filterCategory = document.getElementById("filter-category");
        if (filterCategory) filterCategory.value = 'ALL';
        const filterCompany = document.getElementById("filter-company");
        if (filterCompany) filterCompany.value = 'ALL';
        const filterCustomer = document.getElementById("filter-customer");
        if (filterCustomer) filterCustomer.value = 'ALL';
        const sortFilter = document.getElementById("history-sort-filter");
        if (sortFilter) sortFilter.value = 'desc';
        loadHistory();
    });
}

// ==========================================
// ⚡ LOAD VIEW: INTERACTIVE GRID INPUT (EXCEL STYLE)
// ==========================================
function loadGridInput() {
    const container = document.getElementById("grid-input-cards-container");
    container.innerHTML = '';

    // Try to restore draft from localStorage
    const draftJson = localStorage.getItem('gridInputDraft');
    let restored = false;
    if (draftJson) {
        try {
            const drafts = JSON.parse(draftJson);
            if (Array.isArray(drafts) && drafts.length > 0) {
                drafts.forEach(cardData => {
                    container.appendChild(createGridCard(cardData));
                });
                restored = true;
            }
        } catch(e) { /* ignore bad draft */ }
    }
    
    if (!restored) {
        // Add 1 empty card initially
        container.appendChild(createGridCard());
    }

    // Setup the shared account filter (pending-account-filter) for grid view
    const accFilter = document.getElementById("pending-account-filter");
    if (accFilter) {
        // Remove old listener to avoid duplicate bindings
        const newAccFilter = accFilter.cloneNode(true);
        accFilter.parentNode.replaceChild(newAccFilter, accFilter);
        newAccFilter.addEventListener("change", applyGridFilters);
    }
    refreshGridAccountFilter();
    
    const textFilter = document.getElementById("grid-filter-input");
    if (textFilter) {
        const newTextFilter = textFilter.cloneNode(true);
        textFilter.parentNode.replaceChild(newTextFilter, textFilter);
        newTextFilter.addEventListener("input", applyGridFilters);
    }
    
    const sortFilter = document.getElementById("grid-sort-filter");
    if (sortFilter) {
        const newSortFilter = sortFilter.cloneNode(true);
        sortFilter.parentNode.replaceChild(newSortFilter, sortFilter);
        newSortFilter.addEventListener("change", applyGridFilters);
    }
    
    updateGridStatusSummary();
    
    // Show draft restore indicator in toolbar (not a banner)
    const clearDraftBtn = document.getElementById('btn-clear-draft');
    if (clearDraftBtn) {
        if (restored) {
            clearDraftBtn.style.display = 'flex';
            clearDraftBtn.title = 'พบข้อมูลค้างไว้ — คลิกเพื่อลบร่าง';
        } else {
            clearDraftBtn.style.display = 'none';
        }
    }
}

function applyGridFilters() {
    const accVal = document.getElementById("pending-account-filter")?.value || "ALL";
    const textVal = document.getElementById("grid-filter-input")?.value.toLowerCase() || "";
    const sortVal = document.getElementById("grid-sort-filter")?.value || "desc";
    
    const container = document.getElementById("grid-input-cards-container");
    const cards = Array.from(container.querySelectorAll(".tx-card"));
    
    // Sort cards
    cards.sort((a, b) => {
        const dateA = a.querySelector(".grid-date")?.value || '';
        const timeA = a.querySelector(".grid-time")?.value || '00:00';
        const dateB = b.querySelector(".grid-date")?.value || '';
        const timeB = b.querySelector(".grid-time")?.value || '00:00';
        const datetimeA = dateA + ' ' + timeA;
        const datetimeB = dateB + ' ' + timeB;
        return sortVal === 'asc' ? datetimeA.localeCompare(datetimeB) : datetimeB.localeCompare(datetimeA);
    });
    
    cards.forEach(card => {
        const accId = card.querySelector(".grid-account")?.value || "";
        const textContent = card.innerText.toLowerCase() + " " + (card.querySelector(".grid-note")?.value.toLowerCase() || "");
        
        let matchAcc = (accVal === "ALL" || accVal === accId);
        let matchText = (textVal === "" || textContent.includes(textVal));
        
        if (matchAcc && matchText) {
            card.style.display = "block";
        } else {
            card.style.display = "none";
        }
        
        // Re-append to container to change DOM order
        container.appendChild(card);
    });
}

function normalizeDateToYYYYMMDD(dateStr) {
    if (!dateStr) return '';
    // If it's already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    
    // Check if it's DD/MM/YYYY or DD-MM-YYYY or similar
    const parts = dateStr.split(/[\/\-\.]/);
    if (parts.length === 3) {
        let day, month, year;
        if (parts[0].length === 4) {
            // It is YYYY/MM/DD
            year = parts[0];
            month = parts[1].padStart(2, '0');
            day = parts[2].padStart(2, '0');
        } else {
            // It is DD/MM/YYYY
            day = parts[0].padStart(2, '0');
            month = parts[1].padStart(2, '0');
            year = parts[2];
            // If year is 2 digits, assume 20xx
            if (year.length === 2) {
                year = '20' + year;
            }
        }
        return `${year}-${month}-${day}`;
    }
    
    // Try standard Date parsing
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
    }
    return '';
}

function refreshGridAccountFilter() {
    const accFilter = document.getElementById("pending-account-filter");
    if (!accFilter) return;
    const cards = document.querySelectorAll("#grid-input-cards-container .tx-card");
    const uniqueIds = new Set();
    cards.forEach(c => {
        const val = c.querySelector(".grid-account")?.value;
        if (val) uniqueIds.add(val);
    });
    
    const prevVal = accFilter.value;
    let options = '<option value="ALL">ทั้งหมด</option>';
    [...uniqueIds].forEach(accId => {
        const acc = AppState.accounts.find(a => a.account_id === accId);
        if (acc) options += `<option value="${acc.account_id}">${acc.name}</option>`;
    });
    accFilter.innerHTML = options;
    
    if (uniqueIds.has(prevVal) || prevVal === 'ALL') {
        accFilter.value = prevVal;
    } else {
        accFilter.value = 'ALL';
    }
}

// ==========================================
// 💬 STYLED MODAL HELPER (replaces alert())
// ==========================================
function showGridModal(title, rows) {
    // rows: [{label, value, isAmount}]
    const fmt = (n) => {
        if (typeof n !== 'number') return n;
        const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return n < 0 ? `(${abs})` : abs;
    };
    const existing = document.getElementById('grid-info-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'grid-info-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);';
    const rowsHtml = rows.map(r => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #E2E8F0;">
            <span style="color:#64748B;font-size:0.85rem;">${r.label}</span>
            <span style="font-weight:700;font-size:0.95rem;color:${(typeof r.value === 'number' && r.value < 0) ? '#EF4444' : '#1E293B'};">${fmt(r.value)}</span>
        </div>`).join('');
    modal.innerHTML = `
        <div style="background:#fff;border-radius:14px;padding:24px 28px;max-width:380px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.25);">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
                <span style="font-size:1.5rem;">⚠️</span>
                <span style="font-weight:700;font-size:1.05rem;color:#1E293B;">${title}</span>
            </div>
            <div style="margin-bottom:20px;">${rowsHtml}</div>
            <div style="text-align:right;">
                <button onclick="document.getElementById('grid-info-modal').remove();" style="background:#3B82F6;color:#fff;border:none;border-radius:8px;padding:8px 22px;font-size:0.9rem;font-weight:600;cursor:pointer;">Close</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

// ==========================================
// 🎨 COLOR-CODE SIGNED AMOUNT INPUT
// ==========================================
window.colorCodeAmountInput = function(el) {
    const val = parseAmountInput(el.value);
    el.style.color = val < 0 ? '#FCA5A5' : '#6EE7B7';
    // Update card header accent too
    const card = el.closest('.tx-card');
    if (card) {
        const header = card.querySelector('.tx-card-header');
        if (header) header.style.borderLeftColor = val < 0 ? '#EF4444' : '#10B981';
    }
    saveGridDraft();
};

function createGridCard(data = {}) {
    const cardEl = document.createElement("div");
    cardEl.className = "tx-card";
    cardEl.style.background = "#ffffff";
    
    // Generate Options
    let stmtOptions = '<option value="">เลือกบัญชี...</option>';
    AppState.accounts.forEach(acc => {
        stmtOptions += `<option value="${acc.account_id}" ${data.account_id === acc.account_id ? 'selected' : ''}>${acc.name}</option>`;
    });

    const dateVal = normalizeDateToYYYYMMDD(data.date) || new Date().toLocaleDateString('en-CA');

    // Signed amount: positive = income (green), negative = expense (red)
    const rawAmt = data.total_amount !== undefined ? Number(data.total_amount) : 0;
    const accentColor = rawAmt < 0 ? '#EF4444' : '#10B981';
    const amtColor    = rawAmt < 0 ? '#FCA5A5' : '#6EE7B7';
    const amtVal = rawAmt !== 0 ? formatNumberWithCommas(String(rawAmt)) : '';

    cardEl.innerHTML = `
        <div class="tx-card-header" style="display: flex; align-items: center; padding: 10px 14px; gap: 8px; border-left: 5px solid ${accentColor}; background: linear-gradient(135deg, #1E293B 0%, #0F172A 100%); border-radius: 10px 10px 0 0; flex-wrap: nowrap; overflow: hidden;">
                <input type="date" class="grid-date form-control" style="padding: 2px 6px; font-size: 0.8rem; line-height: 24px; width: 118px; min-width: 118px; height: 28px; background: rgba(255,255,255,0.12); color: #E2E8F0; border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; font-weight: 600;" value="${dateVal}">
                <select class="grid-account form-control" style="width: 280px; min-width: 160px; height: 28px; padding: 2px 8px; line-height: 24px; font-size: 13px; font-weight: 700; background: rgba(255,255,255,0.12); color: #FBBF24; border: 1px solid rgba(255,255,255,0.2); border-radius: 6px;">
                    ${stmtOptions}
                </select>
                <input type="text" class="grid-total form-control" placeholder="+ เข้า  /  - ออก" oninput="this.value = this.value.replace(/[^0-9.,()\-]/g, ''); colorCodeAmountInput(this);" onblur="this.value = formatNumberWithCommas(this.value); colorCodeAmountInput(this);" onfocus="this.value = this.value.replace(/,/g, '')" style="width: 150px; min-width: 100px; height: 28px; padding: 2px 8px; line-height: 24px; font-size: 0.85rem; font-weight: 800; text-align: right; color: ${amtColor}; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px;" value="${amtVal}">
                <input type="text" class="grid-note form-control" placeholder="หมายเหตุ..." style="flex: 1 1 40px; min-width: 40px; height: 28px; padding: 2px 8px; line-height: 24px; font-size: 0.8rem; background: rgba(255,255,255,0.07); color: #94A3B8; border: 1px solid rgba(255,255,255,0.12); border-radius: 6px;" value="${data.note || ''}">
            <div style="display: flex; gap: 6px; flex-shrink: 0;">
                <button class="btn btn-add-subrow-header" style="height: 34px; padding: 0 10px; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; border-radius: 8px; background: #3B82F6; color: white; border: 1px solid #2563EB; cursor: pointer; transition: all 0.2s; font-weight: 600;" title="เพิ่มรายการย่อย" onmouseover="this.style.background='#2563EB'" onmouseout="this.style.background='#3B82F6'"><i class="fa-solid fa-plus"></i></button>
                <button class="btn btn-save-pending" style="width: 34px; height: 34px; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 1rem; border-radius: 8px; background: #F97316; color: #ffffff; border: none; cursor: pointer; box-shadow: 0 2px 6px rgba(249,115,22,0.4); transition: all 0.2s;" title="ส่งไปรอตรวจสอบ" onmouseover="this.style.background='#EA580C'" onmouseout="this.style.background='#F97316'"><i class="fa-solid fa-clock-rotate-left"></i></button>
                <button class="btn btn-save-confirmed" style="width: 34px; height: 34px; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 1rem; border-radius: 8px; background: #10B981; color: #ffffff; border: none; cursor: pointer; box-shadow: 0 2px 6px rgba(16,185,129,0.4); transition: all 0.2s;" title="บันทึกสำเร็จ (Confirmed)" onmouseover="this.style.background='#059669'" onmouseout="this.style.background='#10B981'"><i class="fa-solid fa-floppy-disk"></i></button>
                <button class="btn btn-delete-card" style="width: 34px; height: 34px; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 1rem; border-radius: 8px; background: #EF4444; color: #ffffff; border: none; cursor: pointer; box-shadow: 0 2px 6px rgba(239,68,68,0.4); transition: all 0.2s;" title="ลบรายการ" onmouseover="this.style.background='#DC2626'" onmouseout="this.style.background='#EF4444'"><i class="fa-solid fa-trash-can"></i></button>
            </div>
        </div>
        <div class="grid-sub-rows" style="border: 1px solid #E2E8F0; border-top: none; padding: 8px; border-radius: 0 0 10px 10px; display: flex; flex-direction: column; gap: 6px; background: #F8FAFC;">
            <!-- Column Headers -->
            <!-- Sub Rows Container -->
            <div class="sub-rows-container" style="display: flex; flex-direction: column; gap: 6px;"></div>
            <!-- Add Button and Summary row -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; padding: 8px 14px; border-top: 1px dashed #CBD5E1; padding-top: 8px;">
                <button class="btn btn-outline-purple btn-add-subrow" type="button">
                    <i class="fa-solid fa-plus"></i> เพิ่มรายการย่อย
                </button>
                <div class="zero-sum-indicator" style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; font-weight: 700; color: #374151;">
                    <span class="zero-sum-label">ผลรวม:</span>
                    <span class="zero-sum-value">0.00</span>
                    <span class="zero-sum-status">✅</span>
                </div>
            </div>
        </div>
    `;

    const subRowsContainer = cardEl.querySelector(".sub-rows-container");

    // Add initial sub-row
    const initialDetails = data.details && data.details.length > 0 ? data.details : [{}];
    initialDetails.forEach(detail => {
        subRowsContainer.appendChild(createGridSubRow(detail, cardEl));
    });

    const formatNumber = (num) => {
        const isNeg = num < 0;
        const absVal = Math.abs(num);
        const str = absVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return isNeg ? `(${str})` : str;
    };

    // Balance check: header_amount − Σ(sub_amount − sign(sub_amount)*(|fee|+|wht|)) = 0
    const updateZeroSum = () => {
        const totalInput = cardEl.querySelector(".grid-total");
        const headerAmount = parseAmountInput(totalInput.value); // signed

        let subTotal = 0;
        cardEl.querySelectorAll(".sub-row").forEach(row => {
            const amt = parseAmountInput(row.querySelector(".grid-tx-amount")?.value || '0');
            const fee = Math.abs(parseAmountInput(row.querySelector(".grid-fee")?.value || '0'));
            const wht = Math.abs(parseAmountInput(row.querySelector(".grid-wht")?.value || '0'));
            const sign = amt >= 0 ? 1 : -1;
            subTotal += amt - sign * (fee + wht);
        });

        const diff = headerAmount - subTotal;

        const zeroSumValEl = cardEl.querySelector(".zero-sum-value");
        const zeroSumLabelEl = cardEl.querySelector(".zero-sum-label");
        const zeroSumStatusEl = cardEl.querySelector(".zero-sum-status");

        if (zeroSumValEl) zeroSumValEl.innerText = formatNumber(diff);
        if (zeroSumLabelEl) zeroSumLabelEl.innerText = 'คงเหลือ:';
        if (zeroSumStatusEl) {
            if (Math.abs(diff) < 0.01) {
                zeroSumStatusEl.innerText = "✅";
                zeroSumStatusEl.style.color = "#10B981";
            } else {
                zeroSumStatusEl.innerText = diff > 0 ? "⬇️" : "❌";
                zeroSumStatusEl.style.color = diff > 0 ? "#F59E0B" : "#EF4444";
            }
        }
    };

    const addSubRowHandler = () => {
        subRowsContainer.appendChild(createGridSubRow({}, cardEl));
        updateZeroSum();
    };

    cardEl.querySelector(".btn-add-subrow").addEventListener("click", addSubRowHandler);
    const headerAddBtn = cardEl.querySelector(".btn-add-subrow-header");
    if (headerAddBtn) headerAddBtn.addEventListener("click", addSubRowHandler);
    // Auto-fill sub-row amount when statement amount changes (positive only)
    cardEl.querySelector(".grid-total").addEventListener("input", (e) => {
        const stmtAmount = parseAmountInput(e.target.value); // signed
        const subRows = cardEl.querySelectorAll(".sub-row");
        if (subRows.length === 1 && stmtAmount !== 0) {
            const amtInput = subRows[0].querySelector(".grid-tx-amount");
            if (amtInput) {
                amtInput.value = formatNumberWithCommas(String(stmtAmount));
                // color-code sub-row amount too
                amtInput.style.color = stmtAmount < 0 ? '#EF4444' : '#16A34A';
            }
        }
        updateZeroSum();
        renderSharedStatusSummary();
        saveGridDraft();
    });
    // Also recalculate after blur (when value gets formatted with commas)
    cardEl.querySelector(".grid-total").addEventListener("blur", () => {
        setTimeout(updateZeroSum, 50); // after onblur formatNumberWithCommas fires
    });
    
    // Auto-save draft on account change
    cardEl.querySelector(".grid-account").addEventListener("change", () => {
        renderSharedStatusSummary();
        refreshGridAccountFilter();
        saveGridDraft();
    });

    // Auto-save draft on date/note change
    cardEl.querySelector(".grid-date").addEventListener("change", saveGridDraft);
    cardEl.querySelector(".grid-note").addEventListener("input", saveGridDraft);

    // Save buttons logic
    cardEl.querySelector(".btn-save-pending").addEventListener("click", () => saveGridCard(cardEl, 'PENDING_REVIEW'));
    cardEl.querySelector(".btn-save-confirmed").addEventListener("click", () => saveGridCard(cardEl, 'CONFIRMED'));
    
    // Delete button logic
    cardEl.querySelector(".btn-delete-card").addEventListener("click", () => {
        if(confirm("คุณต้องการลบรายการนี้ใช่หรือไม่?")) {
            cardEl.remove();
            updateGridStatusSummary();
            saveGridDraft();
        }
    });

    // Run initial calculate
    setTimeout(() => {
        updateZeroSum();
        refreshGridSubRowLabels(cardEl);
    }, 10);

    return cardEl;
}

// ==========================================
// 💾 GRID DRAFT PERSISTENCE (localStorage)
// ==========================================

function getGridCardData(cardEl) {
    const date = cardEl.querySelector(".grid-date")?.value || '';
    const account_id = cardEl.querySelector(".grid-account")?.value || '';
    const total_amount = parseAmountInput(cardEl.querySelector(".grid-total")?.value || '0'); // signed
    const note = cardEl.querySelector(".grid-note")?.value || '';
    const details = [];
    cardEl.querySelectorAll(".sub-row").forEach(row => {
        details.push({
            caption: row.querySelector(".grid-caption")?.value || '',
            entity_id: row.querySelector(".grid-entity")?.value || '',
            contact_id: row.querySelector(".grid-contact")?.value || '',
            category_id: row.querySelector(".grid-category")?.value || '',
            amount: parseAmountInput(row.querySelector(".grid-tx-amount")?.value || '0'), // signed
            fee: Math.abs(parseAmountInput(row.querySelector(".grid-fee")?.value || '0')),
            wht: Math.abs(parseAmountInput(row.querySelector(".grid-wht")?.value || '0')),
            note: row.querySelector(".grid-detail")?.value || ''
        });
    });
    return { date, account_id, total_amount, note, details };
}

function saveGridDraft() {
    const container = document.getElementById("grid-input-cards-container");
    if (!container) return;
    const cards = container.querySelectorAll(".tx-card");
    const drafts = [];
    cards.forEach(cardEl => {
        drafts.push(getGridCardData(cardEl));
    });
    try {
        localStorage.setItem('gridInputDraft', JSON.stringify(drafts));
    } catch(e) { /* storage full */ }
}

function clearGridDraft() {
    localStorage.removeItem('gridInputDraft');
    // Hide the draft indicator button in toolbar
    const clearDraftBtn = document.getElementById('btn-clear-draft');
    if (clearDraftBtn) clearDraftBtn.style.display = 'none';
    const container = document.getElementById("grid-input-cards-container");
    if (container) {
        container.innerHTML = '';
        container.appendChild(createGridCard());
        updateGridStatusSummary();
    }
}

// ==========================================
// 💾 SAVE GRID CARD (submit to API)
// ==========================================
async function saveGridCard(cardEl, targetStatus) {
    const date = cardEl.querySelector(".grid-date")?.value;
    const account_id = cardEl.querySelector(".grid-account")?.value;
    const totalRaw = cardEl.querySelector(".grid-total")?.value;
    const note = cardEl.querySelector(".grid-note")?.value || '';

    // --- Validation ---
    if (!date) { alert("กรุณาระบุวันที่ (Date)"); return; }
    if (!account_id) { alert("กรุณาเลือกช่องทางบัญชี (Statement)"); return; }

    const stmtAmount = parseAmountInput(totalRaw);
    if (!totalRaw || stmtAmount === 0) {
        alert("กรุณาระบุยอดเงิน (Statement Amount)");
        return;
    }

    // Collect sub-rows and validate
    const details = [];
    let totalTranAmount = 0;
    let totalFee = 0;
    let totalWht = 0;
    let isValid = true;

    const subRows = cardEl.querySelectorAll(".sub-row");
    if (subRows.length === 0) {
        alert("กรุณาเพิ่มรายการย่อยอย่างน้อย 1 รายการ");
        return;
    }

    // Use signed amounts directly — no toggle needed
    subRows.forEach((row, idx) => {
        if (!isValid) return;

        const categoryId = row.querySelector(".grid-category")?.value || '';
        const txType = row.querySelector(".grid-tx-type")?.value || '';
        const tranAmountStr = row.querySelector(".grid-tx-amount")?.value || '';
        const tranAmount = parseAmountInput(tranAmountStr); // signed
        const feeAbs = Math.abs(parseAmountInput(row.querySelector(".grid-fee")?.value || '0'));
        const whtAbs = Math.abs(parseAmountInput(row.querySelector(".grid-wht")?.value || '0'));

        if (!txType) {
            alert(`รายการย่อยที่ ${idx + 1}: กรุณาเลือกหมวดหมู่หลัก (Caption)`);
            isValid = false;
            return;
        }
        if (!categoryId) {
            alert(`รายการย่อยที่ ${idx + 1}: กรุณาเลือกหมวดหมู่ย่อย (Categories)`);
            isValid = false;
            return;
        }
        if (!tranAmountStr || tranAmount === 0) {
            alert(`รายการย่อยที่ ${idx + 1}: กรุณาระบุยอดเงิน (Transaction Amount)`);
            isValid = false;
            return;
        }

        const cat = AppState.categories.find(c => c.category_id === categoryId);
        // detailType derived from sub-row amount sign (override by category default_type)
        let detailType = cat?.default_type || (tranAmount >= 0 ? 'INCOME' : 'EXPENSE');

        const subSign = tranAmount >= 0 ? 1 : -1;
        details.push({
            amount: tranAmount,                    // signed as-entered
            fee: feeAbs * subSign,                 // fee takes same sign as amount
            wht: whtAbs * subSign,                 // wht takes same sign as amount
            category_id: categoryId || null,
            entity_id: row.querySelector(".grid-entity")?.value || null,
            contact_id: row.querySelector(".grid-contact")?.value || null,
            note: row.querySelector(".grid-detail")?.value || null,
            type: detailType
        });

        totalTranAmount += tranAmount;
        totalFee += feeAbs * subSign;
        totalWht += whtAbs * subSign;
    });

    if (!isValid) return;

    // Balance check: header_amount − Σ(sub_amount − sign*(fee+wht)) must ≈ 0
    let subNetTotal = 0;
    details.forEach(d => {
        const s = d.amount >= 0 ? 1 : -1;
        subNetTotal += d.amount - s * (Math.abs(d.fee) + Math.abs(d.wht));
    });
    const balance = stmtAmount - subNetTotal;
    if (Math.abs(balance) > 0.01) {
        showGridModal('ยอดรายการย่อยไม่ตรงกับยอด Statement', [
            { label: 'Statement Amount', value: stmtAmount },
            { label: 'รายการย่อยสุทธิ', value: subNetTotal },
            { label: 'ผลต่าง', value: balance }
        ]);
        return;
    }

    const payload = {
        account_id,
        date,
        time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        statement_desc: note || 'นำเข้าข้อมูลด่วน',
        total_amount: stmtAmount,  // signed: positive=income, negative=expense
        ref_code: '',
        status: targetStatus,
        source: 'WEB_GRID',
        details
    };

    const saveBtns = cardEl.querySelectorAll(".btn-save-pending, .btn-save-confirmed");
    saveBtns.forEach(b => { b.disabled = true; b.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; });

    try {
        const res = await fetch(`${API_BASE}/api/transactions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(getUserIdHeader()) },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errText = await res.text().catch(() => res.statusText);
            let errMsg = errText;
            try { const j = JSON.parse(errText); errMsg = j.error || j.message || errText; } catch {}
            alert(`❌ บันทึกไม่สำเร็จ (HTTP ${res.status})\n\nสาเหตุ: ${errMsg}`);
            saveBtns.forEach(b => { b.disabled = false; b.innerHTML = b.classList.contains('btn-save-pending') ? '<i class="fa-solid fa-clock-rotate-left"></i>' : '<i class="fa-solid fa-floppy-disk"></i>'; });
            return;
        }

        // Remove the card on success
        cardEl.remove();
        saveGridDraft();
        updateGridStatusSummary();
        await updatePendingBadge();

        // Show success toast
        const label = targetStatus === 'PENDING_REVIEW' ? 'รอตรวจสอบ' : 'ยืนยันแล้ว';
        const toastColor = targetStatus === 'PENDING_REVIEW' ? '#F97316' : '#10B981';
        const toast = document.createElement('div');
        toast.style.cssText = `position:fixed;bottom:30px;right:30px;z-index:9999;background:${toastColor};color:#fff;padding:12px 20px;border-radius:10px;font-weight:700;font-size:0.9rem;box-shadow:0 4px 12px rgba(0,0,0,0.2);`;
        toast.innerHTML = `<i class="fa-solid fa-check-circle"></i> บันทึกสำเร็จ (${label})`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);

    } catch(e) {
        alert(`เกิดข้อผิดพลาด: ${e.message}`);
        saveBtns.forEach(b => {
            b.disabled = false;
            b.innerHTML = b.classList.contains('btn-save-pending') ? '<i class="fa-solid fa-clock-rotate-left"></i>' : '<i class="fa-solid fa-floppy-disk"></i>';
        });
    }
}

function refreshGridSubRowLabels(cardEl) {
    const container = cardEl.querySelector(".sub-rows-container");
    if (!container) return;
    const subRows = container.querySelectorAll(".sub-row");
    subRows.forEach((row, idx) => {
        const labels = ["Caption", "Company", "Customer", "Category", "Transaction Amt.", "Fee", "Wht", "Detail"];
        const isFirst = idx === 0;
        const cols = row.querySelectorAll(".sub-row-col");
        cols.forEach((col, colIdx) => {
            const existingLabel = col.querySelector(".sub-row-label");
            if (existingLabel) {
                existingLabel.remove();
            }
            if (isFirst && colIdx < labels.length) {
                const subRowLabelStyle = "font-size: 10px; font-weight: 700; color: #6B7280; letter-spacing: 0.6px; text-transform: none; margin-bottom: 2px; padding: 0 2px; text-align: center;";
                const lblDiv = document.createElement("div");
                lblDiv.className = "sub-row-label";
                lblDiv.style.cssText = subRowLabelStyle;
                lblDiv.textContent = labels[colIdx];
                col.insertBefore(lblDiv, col.firstChild);
            }
        });
    });
}

function createGridSubRow(data = {}, parentCardEl) {
    const rowEl = document.createElement("div");
    rowEl.className = "sub-row-grid sub-row-item sub-row";

    // Options mapping
    let initialTxType = "";
    if (data.category_id) {
        const cat = AppState.categories.find(c => c.category_id === data.category_id);
        if (cat) initialTxType = cat.caption_id || "";
    }

    let txTypeOptions = `<option value="" ${initialTxType === '' ? 'selected' : ''}>Caption</option>`;
    AppState.captions.forEach(at => {
        txTypeOptions += `<option value="${at.type_id}" ${initialTxType === at.type_id ? 'selected' : ''}>${at.name}</option>`;
    });

    const getCategoryOptions = (filterTypeId, selectedCategoryId) => {
        let opts = '<option value="">Category</option>';
        const groupedCats = {};
        AppState.categories.forEach(cat => {
            if (filterTypeId && cat.caption_id !== filterTypeId) return;
            const tName = cat.caption_name || 'อื่นๆ';
            if (!groupedCats[tName]) groupedCats[tName] = [];
            groupedCats[tName].push(cat);
        });

        Object.keys(groupedCats).forEach(gName => {
            opts += `<optgroup label="${gName}">`;
            groupedCats[gName].forEach(c => {
                opts += `<option value="${c.category_id}" ${selectedCategoryId === c.category_id ? 'selected' : ''}>${c.name}</option>`;
            });
            opts += `</optgroup>`;
        });
        return opts;
    };

    let entityOptions = '<option value="">Company</option>';
    AppState.entities.forEach(ent => {
        entityOptions += `<option value="${ent.entity_id}" ${data.entity_id === ent.entity_id ? 'selected' : ''}>${ent.name}</option>`;
    });

    let contactOptions = '<option value="">Customer</option>';
    AppState.contacts.forEach(cont => {
        contactOptions += `<option value="${cont.contact_id}" ${data.contact_id === cont.contact_id ? 'selected' : ''}>${cont.name}</option>`;
    });

    const subRowInputStyle = "min-height: 28px; padding: 4px 6px; font-size: 13px; background: #ffffff; color: #1E293B; border: 1px solid #D1D5DB; border-radius: 5px; width: 100%;";

    rowEl.innerHTML = `
        <div class="sub-row-col">
            <select class="grid-tx-type form-select" style="${subRowInputStyle} color: ${initialTxType ? '#1E293B' : '#9CA3AF'};" onchange="this.style.color = this.value ? '#1E293B' : '#9CA3AF'">
                ${txTypeOptions}
            </select>
        </div>
        <div class="sub-row-col">
            <select class="grid-entity form-select" style="${subRowInputStyle} color: ${data.entity_id ? '#1E293B' : '#9CA3AF'};" onchange="this.style.color = this.value ? '#1E293B' : '#9CA3AF'">
                ${entityOptions}
            </select>
        </div>
        <div class="sub-row-col">
            <select class="grid-contact form-select" style="${subRowInputStyle} color: ${data.contact_id ? '#1E293B' : '#9CA3AF'};" onchange="this.style.color = this.value ? '#1E293B' : '#9CA3AF'">
                ${contactOptions}
            </select>
        </div>
        <div class="sub-row-col">
            <select class="grid-category form-select" style="${subRowInputStyle} color: ${data.category_id ? '#1E293B' : '#9CA3AF'};" onchange="this.style.color = this.value ? '#1E293B' : '#9CA3AF'">
                ${getCategoryOptions(initialTxType, data.category_id)}
            </select>
        </div>
        <div class="sub-row-col">
            <input type="text" class="grid-tx-amount form-control" placeholder="+/- ยอด" oninput="this.value = this.value.replace(/[^0-9.,()\-]/g, ''); const v=parseAmountInput(this.value); this.style.color=v<0?'#EF4444':'#16A34A';" onblur="this.value = formatNumberWithCommas(this.value); const v=parseAmountInput(this.value); this.style.color=v<0?'#EF4444':'#16A34A';" onfocus="this.value = this.value.replace(/,/g, '')" style="${subRowInputStyle} text-align: right; font-weight: 600; color: ${(data.amount !== undefined && Number(data.amount) < 0) ? '#EF4444' : '#16A34A'};" value="${data.amount !== undefined && data.amount !== '' && data.amount !== 0 ? formatNumberWithCommas(String(Number(data.amount))) : ''}">
        </div>
        <div class="sub-row-col">
            <input type="text" class="grid-fee form-control" placeholder="0.00" oninput="this.value = this.value.replace(/[^0-9.,()\-]/g, ''); const fv=parseAmountInput(this.value); this.style.color=fv<0?'#EF4444':'#16A34A';" onblur="this.value = formatNumberWithCommas(this.value); const fv=parseAmountInput(this.value); this.style.color=fv<0?'#EF4444':'#16A34A';" onfocus="this.value = this.value.replace(/,/g, '')" style="${subRowInputStyle} text-align: right; color: ${(data.fee !== undefined && Number(data.fee) < 0) ? '#EF4444' : '#16A34A'};" value="${data.fee !== undefined && data.fee !== '' && data.fee !== 0 ? formatNumberWithCommas(String(Number(data.fee))) : ''}">
        </div>
        <div class="sub-row-col">
            <input type="text" class="grid-wht form-control" placeholder="0.00" oninput="this.value = this.value.replace(/[^0-9.,()\-]/g, ''); const wv=parseAmountInput(this.value); this.style.color=wv<0?'#EF4444':'#16A34A';" onblur="this.value = formatNumberWithCommas(this.value); const wv=parseAmountInput(this.value); this.style.color=wv<0?'#EF4444':'#16A34A';" onfocus="this.value = this.value.replace(/,/g, '')" style="${subRowInputStyle} text-align: right; color: ${(data.wht !== undefined && Number(data.wht) < 0) ? '#EF4444' : '#16A34A'};" value="${data.wht !== undefined && data.wht !== '' && data.wht !== 0 ? formatNumberWithCommas(String(Number(data.wht))) : ''}">
        </div>
        <div class="sub-row-col">
            <input type="text" class="grid-detail form-control" placeholder="รายละเอียด..." style="${subRowInputStyle}" value="${data.note || ''}">
        </div>
        <div class="sub-row-col" style="display: flex; gap: 4px; justify-content: center; align-items: flex-end; padding-bottom: 1px;">
            <button class="btn btn-move-up-subrow" style="width: 28px; height: 28px; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; border-radius: 6px; background: rgba(59, 130, 246, 0.05); color: #3B82F6; border: 1px solid rgba(59, 130, 246, 0.2); cursor: pointer; transition: all 0.2s;" title="เลื่อนขึ้น" onmouseover="this.style.background='#DBEAFE';" onmouseout="this.style.background='rgba(59, 130, 246, 0.05)';"><i class="fa-solid fa-chevron-up"></i></button>
            <button class="btn btn-move-down-subrow" style="width: 28px; height: 28px; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; border-radius: 6px; background: rgba(59, 130, 246, 0.05); color: #3B82F6; border: 1px solid rgba(59, 130, 246, 0.2); cursor: pointer; transition: all 0.2s;" title="เลื่อนลง" onmouseover="this.style.background='#DBEAFE';" onmouseout="this.style.background='rgba(59, 130, 246, 0.05)';"><i class="fa-solid fa-chevron-down"></i></button>
            <button class="btn btn-remove-subrow" style="width: 28px; height: 28px; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 1rem; border-radius: 6px; background: rgba(239, 68, 68, 0.05); color: #EF4444; border: 1px solid rgba(239, 68, 68, 0.2); cursor: pointer; transition: all 0.2s;" title="ลบ" onmouseover="this.style.background='#FEE2E2';" onmouseout="this.style.background='rgba(239, 68, 68, 0.05)';"><i class="fa-solid fa-xmark"></i></button>
        </div>
    `;

    // Behaviors
    const txTypeSel = rowEl.querySelector(".grid-tx-type");
    const catSel = rowEl.querySelector(".grid-category");

    txTypeSel.addEventListener("change", (e) => {
        catSel.innerHTML = getCategoryOptions(e.target.value, "");
    });

    // Magnitude check in sub-row: sub-row totals must match statement amount
    const triggerZeroSumUpdate = () => {
        if (parentCardEl) {
            // Signed balance: header − Σ(sub_amount − sign*(|fee|+|wht|))
            const headerAmount = parseAmountInput(parentCardEl.querySelector(".grid-total")?.value || '0');
            let subNetTotal = 0;
            parentCardEl.querySelectorAll(".sub-row").forEach(r => {
                const amt = parseAmountInput(r.querySelector(".grid-tx-amount")?.value || '0');
                const fee = Math.abs(parseAmountInput(r.querySelector(".grid-fee")?.value || '0'));
                const wht = Math.abs(parseAmountInput(r.querySelector(".grid-wht")?.value || '0'));
                const s = amt >= 0 ? 1 : -1;
                subNetTotal += amt - s * (fee + wht);
            });

            const diff = headerAmount - subNetTotal;
            const absVal = Math.abs(diff);
            const displayBalance = absVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

            const zeroSumValEl = parentCardEl.querySelector(".zero-sum-value");
            const zeroSumStatusEl = parentCardEl.querySelector(".zero-sum-status");

            if (zeroSumValEl) zeroSumValEl.innerText = displayBalance;
            if (zeroSumStatusEl) {
                if (absVal < 0.01) {
                    zeroSumStatusEl.innerText = "✅";
                    zeroSumStatusEl.style.color = "#10B981";
                } else if (diff > 0) {
                    zeroSumStatusEl.innerText = "⬇️";
                    zeroSumStatusEl.style.color = "#F59E0B";
                } else {
                    zeroSumStatusEl.innerText = "❌";
                    zeroSumStatusEl.style.color = "#EF4444";
                }
            }
        }
    };

    // Fire zero-sum update: on input (live) and on blur (after formatting is applied)
    const recalcAndSave = () => { triggerZeroSumUpdate(); saveGridDraft(); };
    const recalcAfterBlur = () => setTimeout(triggerZeroSumUpdate, 50);

    rowEl.querySelector(".grid-tx-amount").addEventListener("input", recalcAndSave);
    rowEl.querySelector(".grid-tx-amount").addEventListener("blur", recalcAfterBlur);
    rowEl.querySelector(".grid-fee").addEventListener("input", recalcAndSave);
    rowEl.querySelector(".grid-fee").addEventListener("blur", recalcAfterBlur);
    rowEl.querySelector(".grid-wht").addEventListener("input", recalcAndSave);
    rowEl.querySelector(".grid-wht").addEventListener("blur", recalcAfterBlur);
    rowEl.querySelector(".grid-category").addEventListener("change", saveGridDraft);

    rowEl.querySelector(".btn-remove-subrow").addEventListener("click", () => {
        if (parentCardEl && parentCardEl.querySelectorAll(".sub-row").length > 1) {
            rowEl.remove();
            triggerZeroSumUpdate();
            refreshGridSubRowLabels(parentCardEl);
            saveGridDraft();
        } else {
            alert("ต้องมีรายการย่อยอย่างน้อย 1 รายการ");
        }
    });

    rowEl.querySelector(".btn-move-up-subrow").addEventListener("click", () => {
        const container = rowEl.parentElement;
        if (!container) return;
        const prev = rowEl.previousElementSibling;
        if (prev) { container.insertBefore(rowEl, prev); refreshGridSubRowLabels(parentCardEl); saveGridDraft(); }
    });

    rowEl.querySelector(".btn-move-down-subrow").addEventListener("click", () => {
        const container = rowEl.parentElement;
        if (!container) return;
        const next = rowEl.nextElementSibling;
        if (next) { container.insertBefore(next, rowEl); refreshGridSubRowLabels(parentCardEl); saveGridDraft(); }
    });

    return rowEl;
}

function bindGridInputEvents() {
    // Add Row Action
    document.getElementById("btn-grid-add-row").addEventListener("click", () => {
        const container = document.getElementById("grid-input-cards-container");
        container.appendChild(createGridCard());
        saveGridDraft();
    });

    // CSV Template Download
    document.getElementById("btn-grid-download-template").addEventListener("click", () => {
        downloadCSVTemplate();
    });

    // CSV File Import
    document.getElementById("btn-upload-statement").addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        parseCSVFileToGrid(file);
        e.target.value = ''; // Reset input
    });

    // Global Save Action Removed
}

// Helper Matchers for Paste
function matchAccountByName(name) {
    if (!name) return '';
    const acc = AppState.accounts.find(a => a.name.toLowerCase().includes(name.toLowerCase()) || a.account_id.toLowerCase() === name.toLowerCase());
    return acc ? acc.account_id : '';
}
function matchCategoryByName(name) {
    if (!name) return '';
    const cat = AppState.categories.find(c => c.name.toLowerCase().includes(name.toLowerCase()) || c.category_id.toLowerCase() === name.toLowerCase());
    return cat ? cat.category_id : '';
}
function matchEntityByName(name) {
    if (!name) return '';
    const ent = AppState.entities.find(e => e.name.toLowerCase().includes(name.toLowerCase()) || e.entity_id.toLowerCase() === name.toLowerCase());
    return ent ? ent.entity_id : '';
}
function matchContactByName(name) {
    if (!name) return '';
    const cont = (AppState.contacts || []).find(c => c.name.toLowerCase().includes(name.toLowerCase()) || c.contact_id.toLowerCase() === name.toLowerCase());
    return cont ? cont.contact_id : '';
}

// ==========================================
// 💸 LOAD VIEW: DEBTOR / CREDITOR REGISTRY
// ==========================================
async function loadDebtor() {
    try {
        const res = await fetch(`${API_BASE}/api/outstanding_ar`, {
            headers: { 'x-user-id': encodeURIComponent(getUserIdHeader()) }
        });
        const debtors = await res.json();
        
        const tbody = document.getElementById("debtor-list-body");
        tbody.innerHTML = '';

        if (!debtors || debtors.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #888;">ไม่มีลูกหนี้ค้างชำระคงค้างในขณะนี้</td></tr>';
            return;
        }

        debtors.forEach(item => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td class="date">${formatDate(item.date)}</td>
                <td>${item.entity_name || '-'}</td>
                <td>${item.contact_name || '-'}</td>
                <td class="amount">${formatNumber(item.amount)}</td>
                <td class="amount text-danger">${formatNumber(item.remaining_amount)}</td>
                <td>${item.note || '-'}</td>
                <td>
                    <button class="btn btn-success btn-sm btn-settle-debt" data-id="${item.detail_id}" data-amount="${item.remaining_amount}"><i class="fa-solid fa-hand-holding-dollar"></i> ตัดชำระหนี้</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Settle Debt Action
        document.querySelectorAll(".btn-settle-debt").forEach(btn => {
            btn.addEventListener("click", () => {
                const id = btn.getAttribute("data-id");
                const amount = btn.getAttribute("data-amount");
                openSettlementModal(id, amount);
            });
        });

    } catch (e) {
        console.error("Debtor Load Error:", e);
    }
}

// ==========================================
// 📊 LOAD VIEW: FINANCIAL REPORTS
// ==========================================
function loadReports() {
    // Populate entities select
    const tbEntitySelect = document.getElementById("report-tb-entity");
    tbEntitySelect.innerHTML = '';
    AppState.entities.forEach(ent => {
        tbEntitySelect.innerHTML += `<option value="${ent.entity_id}">${ent.name}</option>`;
    });

    // Populate entities select for WHT (with All option)
    const whtEntitySelect = document.getElementById("report-wht-entity");
    if (whtEntitySelect) {
        whtEntitySelect.innerHTML = '<option value="">-- แสดงทั้งหมด (All Company) --</option>';
        AppState.entities.forEach(ent => {
            whtEntitySelect.innerHTML += `<option value="${ent.entity_id}">${ent.name}</option>`;
        });
    }

    // Populate projects select
    const projSelect = document.getElementById("report-project-select");
    projSelect.innerHTML = '';
    AppState.projects.forEach(p => {
        projSelect.innerHTML += `<option value="${p.project_id}">${p.name}</option>`;
    });

    // Default load WHT
    runWhtReport();
}

async function runWhtReport() {
    const month = document.getElementById("report-wht-month").value;
    const entitySelect = document.getElementById("report-wht-entity");
    const entityId = entitySelect ? entitySelect.value : '';
    try {
        let url = `${API_BASE}/api/reports/wht?month=${month}`;
        if (entityId) {
            url += `&entityId=${entityId}`;
        }
        const res = await fetch(url, {
            headers: { 'x-user-id': encodeURIComponent(getUserIdHeader()) }
        });
        const data = await res.json();
        
        const tbody = document.getElementById("wht-report-body");
        tbody.innerHTML = '';

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #888;">ไม่พบข้อมูลภาษีหัก ณ ที่จ่าย ในเดือนนี้</td></tr>';
            return;
        }

        data.forEach(row => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td class="date">${row.date.split(' ')[0]}</td>
                <td>${row.contact_name}</td>
                <td>${row.entity_name}</td>
                <td class="amount">${formatCurrency(row.amount_before_tax)}</td>
                <td class="amount text-danger">${formatCurrency(row.wht_amount)}</td>
                <td class="ref-code">${row.ref_code || '-'}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {}
}

async function runTrialBalanceReport() {
    const entityId = document.getElementById("report-tb-entity").value;
    try {
        const res = await fetch(`${API_BASE}/api/reports/trial-balance?entityId=${entityId}`);
        const data = await res.json();
        
        const tbody = document.getElementById("tb-report-body");
        tbody.innerHTML = '';

        let totalDebit = 0;
        let totalCredit = 0;

        data.forEach(row => {
            totalDebit += row.debit;
            totalCredit += row.credit;

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${row.category_name}</td>
                <td>${row.category_type}</td>
                <td class="amount">${row.debit > 0 ? formatCurrency(row.debit) : '-'}</td>
                <td class="amount">${row.credit > 0 ? formatCurrency(row.credit) : '-'}</td>
            `;
            tbody.appendChild(tr);
        });

        document.getElementById("tb-total-debit").innerText = formatCurrency(totalDebit);
        document.getElementById("tb-total-credit").innerText = formatCurrency(totalCredit);
    } catch (e) {}
}

async function runProjectReport() {
    const projectId = document.getElementById("report-project-select").value;
    try {
        // Fetch all transactions for this user
        const res = await fetch(`${API_BASE}/api/transactions`, {
            headers: { 'x-user-id': encodeURIComponent(getUserIdHeader()) }
        });
        const txs = await res.json();
        
        const tbody = document.getElementById("project-report-body");
        tbody.innerHTML = '';

        let totalIncome = 0;
        let totalExpense = 0;

        txs.forEach(tx => {
            tx.details.forEach(d => {
                if (d.project_id === projectId) {
                    // เงินลงทุน / โอนระหว่างบัญชี ไม่ใช่ทั้งรายรับและรายจ่ายของทริป — ข้ามไป
                    if (d.sub_behavior === 'INVESTMENT' || d.behavior === 'TRANSFER') return;
                    const isIncome = (d.behavior === 'REVENUE' || d.behavior === 'ASSET');
                    const amountVal = Math.abs(d.amount);

                    if (isIncome) totalIncome += amountVal;
                    else totalExpense += amountVal;

                    const tr = document.createElement("tr");
                    tr.innerHTML = `
                        <td class="date">${tx.date.split(' ')[0]}</td>
                        <td>${d.category_name}</td>
                        <td>${tx.account_name}</td>
                        <td>${d.note || '-'}</td>
                        <td class="amount ${isIncome ? 'text-success' : 'text-danger'}">
                            ${isIncome ? '+' + formatCurrency(amountVal) : formatCurrency(-amountVal)}
                        </td>
                    `;
                    tbody.appendChild(tr);
                }
            });
        });

        document.getElementById("project-total-income").innerText = formatCurrency(totalIncome);
        document.getElementById("project-total-expense").innerText = formatCurrency(totalExpense);
        
        const net = totalIncome - totalExpense;
        const netEl = document.getElementById("project-net-balance");
        netEl.innerText = formatCurrency(net);
        netEl.className = net >= 0 ? 'text-success' : 'text-danger';

    } catch (e) {}
}

// Bind report actions
document.getElementById("btn-run-wht").addEventListener("click", runWhtReport);
document.getElementById("btn-run-tb").addEventListener("click", runTrialBalanceReport);
document.getElementById("btn-run-project").addEventListener("click", runProjectReport);

const reportTabs = document.querySelectorAll(".report-tab");
reportTabs.forEach(tab => {
    tab.addEventListener("click", () => {
        reportTabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");

        const target = tab.getAttribute("data-report");
        const sections = document.querySelectorAll(".report-section");
        sections.forEach(s => {
            if (s.id === `report-${target}-section`) {
                s.classList.remove("hidden");
                s.classList.add("active");
            } else {
                s.classList.add("hidden");
                s.classList.remove("active");
            }
        });

        // Preload report data
        if (target === 'wht') runWhtReport();
        else if (target === 'tb') runTrialBalanceReport();
        else if (target === 'project') runProjectReport();
    });
});

// ==========================================
// ✏️ LOAD MODAL: ADD/EDIT TRANSACTION
// ==========================================
let splitRowCount = 0;

function openTxModal(tx = null) {
    if (tx) {
        openTransactionModal(tx.transaction_id, [tx]);
    } else {
        openTransactionModal(null);
    }
}

function openTransactionModal(txId = null, list = []) {
    const modal = document.getElementById("tx-modal");
    modal.classList.remove("hidden");
    
    // Clear and populate dropdowns in form
    const accSelect = document.getElementById("tx-account");
    accSelect.innerHTML = '';
    AppState.accounts.forEach(acc => {
        accSelect.innerHTML += `<option value="${acc.account_id}">${acc.name}</option>`;
    });

    const body = document.getElementById("split-lines-container");
    if(body) body.innerHTML = '';
    splitRowCount = 0;
    
    document.getElementById("tx-form").reset();
    document.getElementById("tx-id-input").value = '';
    document.getElementById("modal-title").innerText = txId ? "แก้ไขและยืนยันธุรกรรม" : "บันทึกธุรกรรมใหม่";

    if (txId) {
        // Edit flow
        const tx = list.find(t => t.transaction_id === txId);
        if (tx) {
            document.getElementById("tx-id-input").value = tx.transaction_id;
            document.getElementById("tx-account").value = tx.account_id;
            document.getElementById("tx-date").value = tx.date.split(' ')[0];
            document.getElementById("tx-total-amount").value = tx.total_amount;
            document.getElementById("tx-refcode").value = tx.ref_code || '';
            
            tx.details.forEach(d => {
                addSplitRow(d);
            });
            validateSplitSums();
        }
    } else {
        // New flow
        // Default today's date
        const today = new Date().toISOString().split('T')[0];
        document.getElementById("tx-date").value = today;
        
        // Add 1 default split line
        addSplitRow();
        validateSplitSums();
    }
}

function addSplitRow(data = {}) {
    const body = document.getElementById("split-lines-container");
    const id = splitRowCount++;
    const tr = document.createElement("div");
    tr.className = "split-card glass";
    tr.style.padding = "15px";
    tr.style.position = "relative";
    tr.style.marginBottom = "10px";
    tr.id = `split-row-${id}`;
    
    // Type
    const types = [
        {val: 'INCOME', label: 'รายรับ'},
        {val: 'EXPENSE', label: 'รายจ่าย'},
        {val: 'TRANSFER', label: 'โอน/อื่น ๆ'}
    ];
    let typeOptions = '';
    types.forEach(t => {
        typeOptions += `<option value="${t.val}" ${data.type === t.val ? 'selected' : (t.val==='EXPENSE'?'selected':'')}>${t.label}</option>`;
    });

    // Entities
    let entOptions = '';
    AppState.entities.forEach(ent => {
        entOptions += `<option value="${ent.entity_id}" ${data.entity_id === ent.entity_id ? 'selected' : ''}>${ent.name}</option>`;
    });

    // Categories
    let catOptions = '';
    const groupedCatsEdit = {};
    AppState.categories.forEach(cat => {
        const tName = cat.caption_name || 'อื่นๆ';
        if (!groupedCatsEdit[tName]) groupedCatsEdit[tName] = [];
        groupedCatsEdit[tName].push(cat);
    });
    for (const [tName, cats] of Object.entries(groupedCatsEdit)) {
        catOptions += `<optgroup label="${tName}">`;
        cats.forEach(cat => {
            catOptions += `<option value="${cat.category_id}" ${data.category_id === cat.category_id ? 'selected' : ''}>${cat.name}</option>`;
        });
        catOptions += `</optgroup>`;
    }

    // Contacts
    let contOptions = '<option value=""></option>';
    AppState.contacts.forEach(cont => {
        contOptions += `<option value="${cont.contact_id}" ${data.contact_id === cont.contact_id ? 'selected' : ''}>${cont.name}</option>`;
    });

    // Projects
    let projOptions = '<option value="">--ทริปคุม--</option>';
    AppState.projects.forEach(p => {
        projOptions += `<option value="${p.project_id}" ${data.project_id === p.project_id ? 'selected' : ''}>${p.name}</option>`;
    });

    tr.innerHTML = `
        <div style="position: absolute; top: 15px; right: 15px; cursor: pointer; color: var(--danger-color);" class="btn-delete-split" title="ลบรายการนี้"><i class="fa-solid fa-trash"></i></div>
        <div class="grid-two-cols" style="margin-bottom: 10px;">
            <div class="input-group">
                <label>Company (Entity)</label>
                <select class="split-entity" required>${entOptions}</select>
            </div>
            <div class="input-group">
                <label>Caption / Categories</label>
                <div style="display:flex; gap:5px;">
                    <select class="split-type" style="width: 35%;" required>${typeOptions}</select>
                    <select class="split-category" style="width: 65%;" required>${catOptions}</select>
                </div>
            </div>
        </div>
        <div class="grid-two-cols" style="margin-bottom: 10px;">
            <div class="input-group">
                <label>Customer (Contact)</label>
                <select class="split-contact">${contOptions}</select>
            </div>
            <div class="input-group">
                <label>Project / Trip</label>
                <select class="split-project">${projOptions}</select>
            </div>
        </div>
        <div class="grid-two-cols" style="margin-bottom: 10px;">
            <div class="input-group">
                <label>Transaction Amount</label>
                <input type="number" class="split-amount" step="0.01" value="${data.amount || ''}" required>
            </div>
            <div class="input-group">
                <label>Detail</label>
                <input type="text" class="split-note" placeholder="รายละเอียด..." value="${data.note || ''}">
            </div>
        </div>
        <div class="grid-two-cols">
            <div class="input-group">
                <label>Fee</label>
                <input type="number" class="split-fee" step="0.01" value="${data.fee !== undefined ? data.fee : '0.00'}">
            </div>
            <div class="input-group">
                <label>WHT</label>
                <input type="number" class="split-wht" step="0.01" value="${data.wht !== undefined ? data.wht : '0.00'}">
            </div>
        </div>
    `;

    body.appendChild(tr);

    // Bind split dynamic validations
    tr.querySelector(".split-amount").addEventListener("input", validateSplitSums);
    tr.querySelector(".split-fee").addEventListener("input", validateSplitSums);
    tr.querySelector(".split-wht").addEventListener("input", validateSplitSums);
    
    tr.querySelector(".btn-delete-split").addEventListener("click", () => {
        tr.remove();
        validateSplitSums();
    });
}

function validateSplitSums() {
    const totalAmountInput = document.getElementById("tx-total-amount").value;
    const total = Number(totalAmountInput || 0);

    const splitAmounts = document.querySelectorAll(".split-amount");
    const splitFees = document.querySelectorAll(".split-fee");
    const splitWhts = document.querySelectorAll(".split-wht");
    
    let sum = 0;
    splitAmounts.forEach(el => sum += Number(el.value || 0));
    splitFees.forEach(el => sum += Number(el.value || 0));
    splitWhts.forEach(el => sum += Number(el.value || 0));

    const warning = document.getElementById("split-validation-msg");
    const diff = Math.abs(sum - total);
    
    if (diff > 0.01) {
        warning.classList.remove("hidden");
        document.getElementById("split-diff-amount").innerText = diff.toFixed(2);
        return false;
    } else {
        warning.classList.add("hidden");
        return true;
    }
}

function bindModalEvents() {
    // Check total amount change
    document.getElementById("tx-total-amount").addEventListener("input", validateSplitSums);

    // Add split line button
    document.getElementById("btn-add-split-line").addEventListener("click", () => addSplitRow());

    // Submit form action
    document.getElementById("tx-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        
        if (!validateSplitSums()) {
            alert("⚠️ ผลรวมของรายการย่อยต้องตรงกับจำนวนเงินหลักก่อนจึงจะบันทึกได้ครับ!");
            return;
        }

        const txId = document.getElementById("tx-id-input").value;
        const accountId = document.getElementById("tx-account").value;
        const date = document.getElementById("tx-date").value;
        const totalAmount = Number(document.getElementById("tx-total-amount").value);
        const refCode = document.getElementById("tx-refcode").value;

        // Build details payload
        const splitRows = document.querySelectorAll("#split-lines-container .split-card");
        const details = [];

        splitRows.forEach(row => {
            const amount = Number(row.querySelector(".split-amount").value);
            const fee = Number(row.querySelector(".split-fee").value || 0);
            const wht = Number(row.querySelector(".split-wht").value || 0);
            const categoryId = row.querySelector(".split-category").value;
            const entityId = row.querySelector(".split-entity").value;
            const contactId = row.querySelector(".split-contact").value;
            const projectId = row.querySelector(".split-project").value;
            const note = row.querySelector(".split-note").value.trim();
            const type = row.querySelector(".split-type").value;

            details.push({
                amount: amount,
                fee: fee,
                wht: wht,
                category_id: categoryId,
                entity_id: entityId,
                contact_id: contactId || null,
                project_id: projectId || null,
                note: note,
                type: type
            });
        });

        const payload = {
            transaction_id: txId || null,
            account_id: accountId,
            ref_code: refCode || null,
            date: date + ' 12:00:00',
            total_amount: totalAmount,
            status: 'CONFIRMED', // Immediately confirmed on confirmation page
            source: txId ? 'LINE_SLIP' : 'WEB_GRID',
            details: details
        };

        try {
            const res = await fetch(`${API_BASE}/api/transactions`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-user-id': encodeURIComponent(getUserIdHeader())
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                alert("✅ บันทึกรายการเข้าคลาวด์ D1 เรียบร้อย!");
                document.getElementById("tx-modal").classList.add("hidden");
                fetchMasterData();
                if (AppState.activeView === 'pending') loadPending();
                else if (AppState.activeView === 'history') loadHistory();
                else loadDashboard();
            } else {
                const err = await res.json();
                alert(`ล้มเหลว: ${err.error}`);
            }
        } catch (err) {
            alert(`เกิดข้อผิดพลาดเครือข่าย: ${err.message}`);
        }
    });

    // Close Modal Events
    const closeModalElements = document.querySelectorAll(".close-modal, .close-modal-btn");
    closeModalElements.forEach(el => {
        el.addEventListener("click", () => {
            document.getElementById("tx-modal").classList.add("hidden");
        });
    });

    // Close Settings Modal
    document.querySelectorAll(".close-setting-modal, .close-setting-btn").forEach(el => {
        el.addEventListener("click", () => {
            document.getElementById("setting-modal").classList.add("hidden");
        });
    });

    // Close User Modal
    document.querySelectorAll(".close-user-modal, .close-user-btn").forEach(el => {
        el.addEventListener("click", () => {
            document.getElementById("user-modal").classList.add("hidden");
        });
    });

    // Forms submit
    document.getElementById("setting-form").addEventListener("submit", saveSettingItem);
    document.getElementById("user-form").addEventListener("submit", saveUserItem);
}

// ==========================================
// 🤝 SETTLEMENT DIALOG (AR/AP CAPPING)
// ==========================================
async function openSettlementModal(parentDetailId, outstandingAmount) {
    const modal = document.getElementById("settlement-modal");
    modal.classList.remove("hidden");
    
    document.getElementById("settle-parent-id").value = parentDetailId;
    document.getElementById("settle-outstanding-display").innerText = formatCurrency(Number(outstandingAmount));
    document.getElementById("settle-amount").value = outstandingAmount;

    // Fetch confirmed transactions (receipt slips) to choose from as repayment matching
    try {
        const res = await fetch(`${API_BASE}/api/transactions?status=CONFIRMED`, {
            headers: { 'x-user-id': encodeURIComponent(getUserIdHeader()) }
        });
        const list = await res.json();
        
        const select = document.getElementById("settle-transaction-select");
        select.innerHTML = '';

        list.forEach(tx => {
            tx.details.forEach(d => {
                // Look for positive credit items or transfers that received money
                if ((d.behavior === 'ASSET') || (d.behavior === 'REVENUE' || d.behavior === 'ASSET')) {
                    select.innerHTML += `
                        <option value="${d.detail_id}">
                            ${tx.date.split(' ')[0]} - [${tx.account_name}] - ${formatCurrency(Math.abs(d.amount))} (${d.note || 'รับเงิน'})
                        </option>
                    `;
                }
            });
        });
    } catch (e) {}
}

document.getElementById("settlement-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const parentId = document.getElementById("settle-parent-id").value;
    const childId = document.getElementById("settle-transaction-select").value;
    const amount = Number(document.getElementById("settle-amount").value);

    if (!parentId || !childId || !amount) return;

    try {
        const res = await fetch(`${API_BASE}/api/settlements`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                parent_detail_id: parentId,
                child_detail_id: childId,
                settled_amount: amount
            })
        });

        if (res.ok) {
            alert("✅ ตัดยอดรับชำระคืนหนี้สำเร็จ!");
            document.getElementById("settlement-modal").classList.add("hidden");
            loadDebtor();
        } else {
            const err = await res.json();
            alert(`ล้มเหลว: ${err.error}`);
        }
    } catch (err) {
        alert("ข้อผิดพลาดทางเทคนิค: " + err.message);
    }
});

// Close Settlement modal
document.querySelectorAll(".close-settlement-modal, .close-settlement-btn").forEach(el => {
    el.addEventListener("click", () => {
        document.getElementById("settlement-modal").classList.add("hidden");
    });
});

// ==========================================
// ⚙️ LOAD VIEW: SETTINGS (MASTER DATA)
// ==========================================
async function loadSettings() {
    try {
        const headers = { 'x-user-id': encodeURIComponent(getUserIdHeader()) };
        const res = await fetch(`${API_BASE}/api/settings`, { headers });
        if (!res.ok) {
            console.error("Failed to load settings data");
            return;
        }
        const data = await res.json();
        AppState.settings = data;

        // Also fetch family members (if user is admin)
        if (AppState.userRole === 'admin') {
            const usersRes = await fetch(`${API_BASE}/api/users`, { headers });
            if (usersRes.ok) {
                AppState.settings.users = await usersRes.json();
            }
        }

        renderSettingsTabs();
        setupSettingsEvents();
        setTimeout(() => {
            initTableSorting();
            initSettingsResizableColumns();
        }, 100);
    } catch (e) {
        console.error("Settings load error:", e);
    }
}

function setSettingsViewMode(mode) {
    AppState.settingsViewMode = mode;
    const btnAdmin = document.getElementById('btn-view-admin');
    const btnUser = document.getElementById('btn-view-user');
    const label = document.getElementById('settings-view-label');
    if (btnAdmin && btnUser) {
        const INACTIVE_BG = '#eef0f6', INACTIVE_TX = '#64748b';
        if (mode === 'admin') {
            btnAdmin.style.background = '#6366f1';
            btnAdmin.style.color = '#fff';
            btnAdmin.style.fontWeight = '700';
            btnUser.style.background = INACTIVE_BG;
            btnUser.style.color = INACTIVE_TX;
            btnUser.style.fontWeight = '600';
            if (label) label.textContent = 'แสดงข้อมูลทั้งหมดในระบบ';
        } else {
            btnUser.style.background = '#10b981';
            btnUser.style.color = '#fff';
            btnUser.style.fontWeight = '700';
            btnAdmin.style.background = INACTIVE_BG;
            btnAdmin.style.color = INACTIVE_TX;
            btnAdmin.style.fontWeight = '600';
            if (label) label.textContent = 'แสดงเฉพาะข้อมูลที่คุณเข้าถึงได้';
        }
    }
    renderSettingsTabs();
}

function renderSettingsTabs() {
    const isAdmin = (AppState.userRole === 'admin');
    // In user-view mode (even for admin), filter data as if they were a regular user
    const viewAsUser = isAdmin && AppState.settingsViewMode === 'user';
    const effectiveIsAdmin = isAdmin && !viewAsUser;

    // Show/hide admin view toggle
    const toggleEl = document.getElementById('settings-view-toggle');
    if (toggleEl) {
        if (isAdmin) {
            toggleEl.classList.remove('hidden');
            toggleEl.style.display = 'flex';
        } else {
            toggleEl.classList.add('hidden');
            toggleEl.style.display = 'none';
        }
    }

    // Show/hide add buttons based on effective role
    document.querySelectorAll(".btn-add-setting, #btn-add-user").forEach(btn => {
        btn.style.display = isAdmin ? 'inline-flex' : 'none';
    });

    if (!AppState.settings) AppState.settings = {};
    const safeArray = (arr) => Array.isArray(arr) ? arr : [];

    // Helper: should this entity be visible?
    const canSeeEntity = (entityId) => effectiveIsAdmin || AppState.allowedEntities.includes(entityId);
    // Helper: should this contact be visible?
    const canSeeContact = (c) => {
        if (effectiveIsAdmin) return true;
        if (!c.members) return true;
        try { const m = JSON.parse(c.members); return !Array.isArray(m) || m.length === 0 || m.includes(AppState.userId); } catch { return true; }
    };
    // Helper: should this project be visible?
    const canSeeProject = (p) => {
        if (effectiveIsAdmin) return true;
        if (!p.members) return true;
        try { const m = JSON.parse(p.members); return !Array.isArray(m) || m.length === 0 || m.includes(AppState.userId); } catch { return true; }
    };
    // Helper: should this debt be visible?
    const canSeeDebt = (d) => {
        if (effectiveIsAdmin) return true;
        if (!d.members) return true;
        try { const m = JSON.parse(d.members); return !Array.isArray(m) || m.length === 0 || m.includes(AppState.userId); } catch { return true; }
    };

    // 1. Entities (Owners / Statements)
    const entitiesBody = document.getElementById("settings-entities-body");
    if (entitiesBody) entitiesBody.innerHTML = '';
    safeArray(AppState.settings.entities).forEach(ent => {
        if (!canSeeEntity(ent.entity_id)) {
            return;
        }

        const entityUserObjs = (AppState.settings.entity_users || []).filter(eu => eu.entity_id === ent.entity_id);
        const isShared = entityUserObjs.length > 1;
        const ownersList = entityUserObjs.map(eu => eu.user_name).join(', ') || '-';
        const sharedBadge = isShared
            ? `<span style="display:inline-block;margin-left:6px;padding:1px 7px;border-radius:10px;background:#DBEAFE;color:#1D4ED8;font-size:0.7rem;font-weight:700;">🔗 แชร์</span>`
            : '';

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><code>${ent.entity_id}</code></td>
            <td>${ent.name}${sharedBadge}</td>
            <td>${ownersList}</td>
            <td>${ent.is_company ? 'บริษัท' : 'ส่วนบุคคล'}</td>
            <td>
                ${isAdmin ? `
                    <button class="btn btn-icon-only edit-entity" data-id="${ent.entity_id}" title="แก้ไข">✏️</button>
                    <button class="btn btn-icon-only delete-setting" data-type="entity" data-id="${ent.entity_id}" title="ลบ">🗑️</button>
                ` : '-'}
            </td>
        `;
        entitiesBody.appendChild(tr);
    });

    // 2. Contacts (ลูกหนี้/เจ้าหนี้)
    const contactsBody = document.getElementById("settings-contacts-body");
    if (contactsBody) contactsBody.innerHTML = '';
    safeArray(AppState.settings.contacts).filter(canSeeContact).forEach(c => {
        const tr = document.createElement("tr");
        const typeLabel = c.contact_type === 'CUSTOMER' ? '🟢 ลูกค้า' : c.contact_type === 'VENDOR' ? '🔴 เจ้าหนี้' : '⚪ อื่นๆ';
        let contactMembers = [];
        try { contactMembers = c.members ? JSON.parse(c.members) : []; } catch {}
        const memberBadge = (Array.isArray(contactMembers) && contactMembers.length > 0)
            ? contactMembers.map(uid => {
                const u = (AppState.settings.users || []).find(x => x.user_id === uid);
                return `<span style="display:inline-block;margin-left:4px;padding:1px 7px;border-radius:10px;background:#FEF3C7;color:#92400E;font-size:0.7rem;font-weight:700;">🔒 ${u ? u.name : uid}</span>`;
              }).join('')
            : `<span style="display:inline-block;margin-left:6px;padding:1px 7px;border-radius:10px;background:#DBEAFE;color:#1D4ED8;font-size:0.7rem;font-weight:700;">🔗 ร่วมกัน</span>`;
        tr.innerHTML = `
            <td><code>${c.contact_id}</code></td>
            <td>${c.name}${memberBadge}</td>
            <td>${typeLabel}</td>
            <td>
                ${isAdmin ? `
                    <button class="btn btn-icon-only edit-contact" data-id="${c.contact_id}" title="แก้ไข">✏️</button>
                    <button class="btn btn-icon-only delete-setting" data-type="contact" data-id="${c.contact_id}" title="ลบ">🗑️</button>
                ` : '-'}
            </td>
        `;
        contactsBody.appendChild(tr);
    });

    // Helpers to resolve ID to names
    const getEntityName = (id) => {
        if (!id) return '-';
        const ent = safeArray(AppState.settings.entities).find(e => e.entity_id === id);
        return ent ? ent.name : id;
    };
    const getContactName = (id) => {
        if (!id) return '-';
        const c = safeArray(AppState.settings.contacts).find(con => con.contact_id === id);
        return c ? c.name : id;
    };
    const getTypeLabel = (t) => {
        if (!t) return '-';
        if (t === 'INCOME') return 'เงินเข้า (INCOME)';
        if (t === 'EXPENSE') return 'เงินออก (EXPENSE)';
        if (t === 'TRANSFER') return 'โอนเงิน (TRANSFER)';
        return t;
    };

    // 3. Captions (Account Types)
    const captionsBody = document.getElementById("settings-captions-body");
    if (captionsBody) captionsBody.innerHTML = '';
    safeArray(AppState.settings.captions).forEach(at => {
        if (!captionsBody) return;
        const tr = document.createElement("tr");
        const bLabel = at.sub_behavior === 'INVESTMENT' ? 'เงินลงทุน' : at.behavior === 'REVENUE' ? 'เงินเข้า (รายรับ / อื่นๆ)' : at.behavior === 'EXPENSE' ? 'เงินออก (รายจ่าย / อื่นๆ)' : at.behavior === 'ASSET' ? 'สินทรัพย์ / ทดรองจ่าย' : at.behavior === 'LIABILITY' ? 'หนี้สิน' : 'โอนเงินระหว่างบัญชี';
        const entName = getEntityName(at.default_entity_id);
        const conName = getContactName(at.default_contact_id);
        const typeLbl = getTypeLabel(at.default_type);
        tr.innerHTML = `
            <td><code>${at.type_id}</code></td>
            <td>${at.name}</td>
            <td>${bLabel}</td>
            <td>${entName}</td>
            <td>${conName}</td>
            
            <td>
                ${isAdmin ? `
                    <button class="btn btn-icon-only edit-account-type" data-id="${at.type_id}" title="แก้ไข">✏️</button>
                    <button class="btn btn-icon-only delete-setting" data-type="caption" data-id="${at.type_id}" title="ลบ">🗑️</button>
                ` : '-'}
            </td>
        `;
        captionsBody.appendChild(tr);
    });

    // 4. Categories (Subtypes)
    const categoriesBody = document.getElementById("settings-categories-body");
    if (categoriesBody) categoriesBody.innerHTML = '';
    safeArray(AppState.settings.categories).forEach(cat => {
        const tr = document.createElement("tr");
        const entName = getEntityName(cat.default_entity_id);
        const conName = getContactName(cat.default_contact_id);
        const typeLbl = getTypeLabel(cat.default_type);
        tr.innerHTML = `
            <td><code>${cat.category_id}</code></td>
            <td>${cat.name}</td>
            <td>${cat.caption_name || ''}</td>
            <td>${entName}</td>
            <td>${conName}</td>
            
            <td>
                ${isAdmin ? `
                    <button class="btn btn-icon-only edit-category" data-id="${cat.category_id}" title="แก้ไข">✏️</button>
                    <button class="btn btn-icon-only delete-setting" data-type="category" data-id="${cat.category_id}" title="ลบ">🗑️</button>
                ` : '-'}
            </td>
        `;
        categoriesBody.appendChild(tr);
    });

    // 5. Accounts (บัญชีการเงิน)
    const accountsBody = document.getElementById("settings-accounts-body");
    if (accountsBody) accountsBody.innerHTML = '';
    safeArray(AppState.settings.accounts).forEach(acc => {
        if (!canSeeEntity(acc.entity_id)) {
            return;
        }

        // Show which users have access to this account (via entity permissions)
        const accUserObjs = (AppState.settings.entity_users || []).filter(eu => eu.entity_id === acc.entity_id);
        const isShared = accUserObjs.length > 1;
        const userBadges = accUserObjs.map(eu =>
            `<span style="display:inline-block;margin:1px 2px;padding:1px 6px;border-radius:8px;font-size:0.68rem;background:${isShared ? '#DCFCE7' : '#F1F5F9'};color:${isShared ? '#166534' : '#475569'};font-weight:600;">${eu.user_name}</span>`
        ).join('') || '<span style="color:#9CA3AF;font-size:0.75rem;">-</span>';

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><code>${acc.account_id}</code></td>
            <td>${acc.entity_name}${isShared ? ' <span style="font-size:0.7rem;color:#2563EB;">🔗</span>' : ''}</td>
            <td>${acc.name}</td>
            <td><code>${acc.bank_name || '-'}</code></td>
            <td>${acc.account_number || '-'}</td>
            <td class="amount">${formatCurrency((acc.balance || 0))}</td>
            <td>${userBadges}</td>
            <td>
                ${isAdmin ? `
                    <button class="btn btn-icon-only edit-account" data-id="${acc.account_id}" title="แก้ไข">✏️</button>
                    <button class="btn btn-icon-only delete-setting" data-type="account" data-id="${acc.account_id}" title="ลบ">🗑️</button>
                ` : '-'}
            </td>
        `;
        accountsBody.appendChild(tr);
    });

    // 6. Projects (ทริป/โปรเจกต์)
    const projectsBody = document.getElementById("settings-projects-body");
    if (projectsBody) projectsBody.innerHTML = '';
    safeArray(AppState.settings.projects).filter(canSeeProject).forEach(p => {
        const tr = document.createElement("tr");
        const statusLabel = p.status === 'closed' ? '🔴 ปิดแล้ว' : '🟢 กำลังใช้';
        let membersArr = [];
        try { membersArr = p.members ? JSON.parse(p.members) : []; } catch {}
        const isSharedTrip = !Array.isArray(membersArr) || membersArr.length === 0;
        const memberNames = isSharedTrip
            ? '<span style="display:inline-block;padding:1px 7px;border-radius:10px;background:#DBEAFE;color:#1D4ED8;font-size:0.7rem;font-weight:700;">🔗 ทุกคน</span>'
            : membersArr.map(uid => {
                const u = safeArray(AppState.settings.users).find(us => us.user_id === uid);
                return `<span style="display:inline-block;margin:1px 2px;padding:1px 6px;border-radius:8px;font-size:0.68rem;background:#FEF3C7;color:#92400E;font-weight:600;">${u ? u.name : uid}</span>`;
              }).join('');
        tr.innerHTML = `
            <td><code>${p.project_id}</code></td>
            <td>${p.name}</td>
            <td>${statusLabel}</td>
            <td>${memberNames}</td>
            <td>
                ${isAdmin ? `
                    <button class="btn btn-icon-only edit-project" data-id="${p.project_id}" title="แก้ไข">✏️</button>
                    <button class="btn btn-icon-only delete-setting" data-type="project" data-id="${p.project_id}" title="ลบ">🗑️</button>
                ` : '-'}
            </td>
        `;
        projectsBody.appendChild(tr);
    });

    // 7. Users (สมาชิกครอบครัว) — card layout
    if (isAdmin) {
        // ── Member: แถวกระชับ (คลิกเพื่อขยายดูบริษัทที่ถือ) ──
        const usersCards = document.getElementById("settings-users-cards");
        if (usersCards) {
            usersCards.style.cssText = 'display:block;background:#fff;border:1px solid var(--dv-amtbd,#e2e6f0);border-radius:14px;overflow:hidden;';
            usersCards.innerHTML = '';
        }
        const avatarColors = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6'];
        safeArray(AppState.settings.users).forEach(u => {
            const allowedEntities = (u.allowed_entities || []);
            const hasPerm = allowedEntities.length > 0;
            const chips = allowedEntities.map(entId => {
                const ent = (AppState.settings.entities || []).find(e => e.entity_id === entId);
                return `<span style="display:inline-block;padding:2px 9px;border-radius:8px;font-size:0.72rem;font-weight:500;background:var(--dv-chipbg,#EEF0FB);color:var(--dv-h3,#3C3489);">${ent ? ent.name : entId}</span>`;
            }).join('');

            const roleAdmin = u.role === 'admin';
            const roleLabel = roleAdmin ? 'Admin' : 'Member';
            const roleStyle = roleAdmin ? 'background:#FBEAF0;color:#993556' : 'background:#E6F1FB;color:#185FA5';
            const initials = (u.name || u.user_id).substring(0, 2).toUpperCase();
            const avatarColor = avatarColors[(u.user_id.charCodeAt(0) || 0) % avatarColors.length];
            const canDelete = (AppState.userRole === 'admin' && u.user_id !== AppState.userId);

            const wrap = document.createElement('div');
            wrap.style.cssText = 'border-bottom:1px solid var(--dv-amtbd,#eef0f6);';
            wrap.innerHTML = `
                <div style="display:flex;align-items:center;gap:11px;padding:9px 14px;">
                    <div style="width:36px;height:36px;border-radius:50%;background:${avatarColor};display:flex;align-items:center;justify-content:center;font-size:0.85rem;font-weight:700;color:#fff;flex-shrink:0;">${initials}</div>
                    <div style="flex:1;min-width:0;${hasPerm ? 'cursor:pointer;' : ''}" ${hasPerm ? `onclick="dv2ToggleMember('${u.user_id}')"` : ''}>
                        <div style="font-size:0.9rem;font-weight:600;color:var(--text-primary,#1e293b);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${u.name}
                            <span style="margin-left:4px;padding:2px 8px;border-radius:20px;font-size:0.66rem;font-weight:600;${roleStyle}">${roleLabel}</span></div>
                        <div style="font-size:0.72rem;color:var(--text-secondary,#64748b);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${u.email || u.user_id} · ${hasPerm ? `🔑 ${allowedEntities.length} บริษัท <span id="mchv-${u.user_id}" style="display:inline-block;transition:transform .15s;">▸</span>` : '🔒 ยังไม่มีสิทธิ์เข้าถึงข้อมูล'}</div>
                    </div>
                    ${canDelete ? `<button class="btn btn-icon-only delete-user" data-id="${u.user_id}" data-name="${u.name}" title="ลบสมาชิก" style="background:#FDECEC;border:1px solid #F3C1C1;color:#b91c1c;">🗑️</button>` : ''}
                    <button class="btn btn-icon-only edit-user" data-id="${u.user_id}" title="แก้ไขสิทธิ์">✏️</button>
                </div>
                <div id="mrow-${u.user_id}" style="display:none;padding:0 14px 12px 61px;background:var(--dv-amtbg,#fafbfe);">
                    <div style="font-size:0.68rem;color:var(--text-secondary,#64748b);margin:8px 0 6px;">รหัส: <code>${u.user_id}</code>${u.line_user_id ? ` · LINE: <code>${u.line_user_id}</code>` : ''}</div>
                    <div style="display:flex;flex-wrap:wrap;gap:5px;">${hasPerm ? chips : '<span style="font-size:0.72rem;color:var(--text-muted,#94a3b8);font-style:italic;">ไม่มีสิทธิ์เข้าถึงข้อมูล</span>'}</div>
                </div>
            `;
            usersCards.appendChild(wrap);
        });
        // Show member tab
        document.querySelector('.settings-tab[data-settings-tab="users"]')?.classList.remove('hidden');
    }

    // Danger Zone (ล้างข้อมูล) แสดงเฉพาะ Admin
    const dz = document.getElementById('danger-zone-card');
    if (dz) dz.style.display = (AppState.userRole === 'admin') ? '' : 'none';

    // Re-rendering complete
}

// ── Settings event delegation (called ONCE on page load, survives re-renders) ──
let _settingsEventsInit = false;
function setupSettingsEvents() {
    // ── Tab switching ──
    const tabs = document.querySelectorAll(".settings-tab");
    tabs.forEach(tab => { tab.replaceWith(tab.cloneNode(true)); });
    document.querySelectorAll(".settings-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".settings-tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            const targetTab = tab.getAttribute("data-settings-tab");
            document.querySelectorAll(".settings-section-content").forEach(sec => {
                sec.classList.add("hidden");
                sec.classList.remove("active");
            });
            const activeSec = document.getElementById(`settings-${targetTab}`);
            if (activeSec) {
                if (targetTab === 'debts') renderDebtsSettings();
                activeSec.classList.remove("hidden");
                activeSec.classList.add("active");
            }
        });
    });

    // ── Add buttons ──
    document.querySelectorAll(".btn-add-setting").forEach(btn => { btn.replaceWith(btn.cloneNode(true)); });
    document.querySelectorAll(".btn-add-setting").forEach(btn => {
        btn.addEventListener("click", () => {
            openSettingModal(btn.getAttribute("data-type"), '', { catType: btn.getAttribute("data-cat-type") });
        });
    });
    const btnAddUser = document.getElementById("btn-add-user");
    if (btnAddUser) {
        btnAddUser.replaceWith(btnAddUser.cloneNode(true));
        document.getElementById("btn-add-user").addEventListener("click", () => openUserModal(''));
    }

    // ── Event delegation for dynamically-rendered buttons ──
    // Attach ONCE to #view-settings; survives every renderSettingsTabs() re-render
    if (!_settingsEventsInit) {
        _settingsEventsInit = true;
        const container = document.getElementById("view-settings");
        if (container) {
            container.addEventListener("click", (e) => {
                const btn = e.target.closest("button[class]");
                if (!btn) return;

                if (btn.classList.contains("edit-entity")) {
                    openSettingModal('entity', btn.dataset.id); return;
                }
                if (btn.classList.contains("edit-contact")) {
                    openSettingModal('contact', btn.dataset.id); return;
                }
                if (btn.classList.contains("edit-account-type")) {
                    openSettingModal('caption', btn.dataset.id); return;
                }
                if (btn.classList.contains("edit-category")) {
                    openSettingModal('category', btn.dataset.id); return;
                }
                if (btn.classList.contains("edit-account")) {
                    openSettingModal('account', btn.dataset.id); return;
                }
                if (btn.classList.contains("edit-project")) {
                    openSettingModal('project', btn.dataset.id); return;
                }
                if (btn.classList.contains("edit-user")) {
                    openUserModal(btn.dataset.id); return;
                }
                if (btn.classList.contains("delete-user")) {
                    deleteMember(btn.dataset.id, btn.dataset.name); return;
                }
                if (btn.classList.contains("delete-setting")) {
                    deleteSettingItem(btn.dataset.type, btn.dataset.id); return;
                }
            });
        }
    }
}

function openSettingModal(type, oldId = '', extraData = {}) {
    const modal = document.getElementById("setting-modal");
    modal.classList.remove("hidden");
    
    document.getElementById("setting-type").value = type;
    document.getElementById("setting-old-id").value = oldId;
    document.getElementById("setting-new-id").value = oldId;
    
    const helpLabel = document.getElementById("setting-id-help");
    if (oldId) {
        helpLabel.style.display = "block";
        document.getElementById("setting-modal-title").innerText = `แก้ไขรายการ [${oldId}]`;
    } else {
        helpLabel.style.display = "none";
        document.getElementById("setting-modal-title").innerText = "เพิ่มรายการข้อมูลหลักใหม่";
    }

        const nameLabel = document.getElementById("setting-name-label");
    if (nameLabel) {
        if (type === 'entity') nameLabel.innerText = "ชื่อ Company (Company Name)";
        else if (type === 'contact') nameLabel.innerText = "ชื่อ คู่ค้า (Contact Name)";
        else if (type === 'caption') nameLabel.innerText = "ชื่อ ประเภทหลัก (Caption Name)";
        else if (type === 'category') nameLabel.innerText = "ชื่อ ประเภทย่อย (Category Name)";
        else if (type === 'account') nameLabel.innerText = "ชื่อ บัญชี (Account Name)";
        else if (type === 'project') nameLabel.innerText = "ชื่อ โครงการ (Project Name)";
        else nameLabel.innerText = "ชื่อรายการ (Name)";
    }

    document.getElementById("setting-name").value = '';
    document.getElementById("setting-bank-name").value = '';
    document.getElementById("setting-account-number").value = '';
    document.getElementById("setting-is-company").value = '0';
    document.getElementById("setting-contact-type").value = 'CUSTOMER';
    const behaviorEl = document.getElementById("setting-behavior");
    if (behaviorEl) behaviorEl.value = 'EXPENSE';
    const catAccountTypeEl = document.getElementById("setting-category-caption");
    if (catAccountTypeEl) catAccountTypeEl.value = '';
    const pdfPasswordEl = document.getElementById("setting-pdf-password");
    if (pdfPasswordEl) pdfPasswordEl.value = '';

    document.getElementById("group-setting-entity").classList.add("hidden");
    document.getElementById("group-setting-bank").classList.add("hidden");
    document.getElementById("group-setting-accnum").classList.add("hidden");
    document.getElementById("group-setting-pdfpassword")?.classList.add("hidden");
    document.getElementById("group-setting-iscompany").classList.add("hidden");
    document.getElementById("group-setting-contacttype").classList.add("hidden");
    document.getElementById("group-setting-behavior")?.classList.add("hidden");
    document.getElementById("group-setting-caption")?.classList.add("hidden");
    document.getElementById("group-setting-projectstatus").classList.add("hidden");
    document.getElementById("group-setting-members")?.classList.add("hidden");
    document.getElementById("group-setting-defaults").classList.add("hidden");
    document.getElementById("group-setting-accounttype")?.classList.add("hidden");
    document.getElementById("group-setting-credit")?.classList.add("hidden");
    if (document.getElementById("setting-account-type")) document.getElementById("setting-account-type").value = 'BANK';
    ['setting-credit-limit','setting-statement-day','setting-due-day'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

    // Populate default dropdowns options
    const defaultEntitySelect = document.getElementById("setting-default-entity-id");
    if (defaultEntitySelect) {
        defaultEntitySelect.innerHTML = '<option value="">-- ไม่กำหนด --</option>';
        (AppState.settings.entities || []).forEach(ent => {
            defaultEntitySelect.innerHTML += `<option value="${ent.entity_id}">${ent.name}</option>`;
        });
    }

    const defaultContactSelect = document.getElementById("setting-default-contact-id");
    if (defaultContactSelect) {
        defaultContactSelect.innerHTML = '<option value="">-- ไม่กำหนด --</option>';
        (AppState.settings.contacts || []).forEach(c => {
            defaultContactSelect.innerHTML += `<option value="${c.contact_id}">${c.name}</option>`;
        });
    }

    if (type === 'entity') {
        document.getElementById("group-setting-iscompany").classList.remove("hidden");
        // สมาชิกผู้ถือ Company นี้ (many-to-many ผ่าน UserPermissions)
        document.getElementById("group-setting-members")?.classList.remove("hidden");
        const entMembersLabel = document.getElementById("setting-members-label");
        if (entMembersLabel) entMembersLabel.textContent = '👑 สมาชิกผู้ถือ Company นี้ (ไม่เลือก = เฉพาะคุณ)';
        const entMembersContainer = document.getElementById("setting-members-checkboxes");
        if (entMembersContainer) {
            entMembersContainer.innerHTML = '';
            (AppState.settings.users || []).forEach(u => {
                entMembersContainer.innerHTML += `
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.85rem; color: rgba(255,255,255,0.9);">
                        <input type="checkbox" class="setting-member-checkbox" value="${u.user_id}" style="width:15px;height:15px;cursor:pointer;">
                        ${u.name}
                    </label>
                `;
            });
        }
        if (oldId) {
            const ent = AppState.settings.entities.find(e => e.entity_id === oldId);
            if (ent) {
                document.getElementById("setting-name").value = ent.name;
                document.getElementById("setting-is-company").value = ent.is_company ? '1' : '0';
            }
            // pre-check เจ้าของปัจจุบันจาก entity_users
            const currentOwners = (AppState.settings.entity_users || [])
                .filter(eu => eu.entity_id === oldId).map(eu => eu.user_id);
            if (entMembersContainer) {
                entMembersContainer.querySelectorAll('.setting-member-checkbox').forEach(chk => {
                    chk.checked = currentOwners.includes(chk.value);
                });
            }
        }
    } else if (type === 'contact') {
        document.getElementById("group-setting-contacttype").classList.remove("hidden");
        document.getElementById("group-setting-members")?.classList.remove("hidden");
        const contactMembersLabel = document.getElementById("setting-members-label");
        if (contactMembersLabel) contactMembersLabel.textContent = '👥 ใครเห็น Contact นี้ได้ (ไม่เลือก = ทุกคน)';

        // สร้าง checkboxes สำหรับเลือกสมาชิกที่เห็น contact นี้
        const membersContainer = document.getElementById("setting-members-checkboxes");
        if (membersContainer) {
            membersContainer.innerHTML = '';
            (AppState.settings.users || []).forEach(u => {
                membersContainer.innerHTML += `
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.85rem; color: rgba(255,255,255,0.9);">
                        <input type="checkbox" class="setting-member-checkbox" value="${u.user_id}" style="width:15px;height:15px;cursor:pointer;">
                        ${u.name}
                    </label>
                `;
            });
        }

        if (oldId) {
            const c = AppState.settings.contacts.find(con => con.contact_id === oldId);
            if (c) {
                document.getElementById("setting-name").value = c.name;
                document.getElementById("setting-contact-type").value = c.contact_type;
                let existingMembers = [];
                try { existingMembers = c.members ? JSON.parse(c.members) : []; } catch {}
                if (membersContainer) {
                    membersContainer.querySelectorAll('.setting-member-checkbox').forEach(chk => {
                        chk.checked = existingMembers.includes(chk.value);
                    });
                }
            }
        }
    } else if (type === 'caption') {
        document.getElementById("group-setting-behavior").classList.remove("hidden");
        document.getElementById("group-setting-defaults").classList.remove("hidden");
        if (oldId) {
            const at = AppState.settings.captions.find(a => a.type_id === oldId);
            if (at) {
                document.getElementById("setting-name").value = at.name;
                // DB เก็บเงินลงทุนเป็น behavior=ASSET + sub_behavior=INVESTMENT
                // แต่ UI แสดงเป็นตัวเลือกเดียว
                document.getElementById("setting-behavior").value =
                    (at.sub_behavior === 'INVESTMENT') ? 'INVESTMENT' : at.behavior;
                document.getElementById("setting-default-entity-id").value = at.default_entity_id || '';
                document.getElementById("setting-default-contact-id").value = at.default_contact_id || '';
                document.getElementById("setting-default-type").value = at.default_type || '';
            }
        } else {
            document.getElementById("setting-default-entity-id").value = '';
            document.getElementById("setting-default-contact-id").value = '';
            document.getElementById("setting-default-type").value = '';
        }
    } else if (type === 'category') {
        const catTypeSelect = document.getElementById("setting-category-caption");
        catTypeSelect.innerHTML = '';
        AppState.settings.captions.forEach(at => {
            catTypeSelect.innerHTML += `<option value="${at.type_id}">${at.name}</option>`;
        });
        document.getElementById("group-setting-caption").classList.remove("hidden");
        document.getElementById("group-setting-defaults").classList.remove("hidden");
        if (oldId) {
            const cat = AppState.settings.categories.find(ca => ca.category_id === oldId);
            if (cat) {
                document.getElementById("setting-name").value = cat.name;
                document.getElementById("setting-category-caption").value = cat.caption_id;
                document.getElementById("setting-default-entity-id").value = cat.default_entity_id || '';
                document.getElementById("setting-default-contact-id").value = cat.default_contact_id || '';
                document.getElementById("setting-default-type").value = cat.default_type || '';
            }
        } else {
            document.getElementById("setting-default-entity-id").value = '';
            document.getElementById("setting-default-contact-id").value = '';
            document.getElementById("setting-default-type").value = '';
        }
    } else if (type === 'account') {
        const entSelect = document.getElementById("setting-entity-id");
        entSelect.innerHTML = '';
        AppState.settings.entities.forEach(ent => {
            entSelect.innerHTML += `<option value="${ent.entity_id}">${ent.name}</option>`;
        });
        const entLabel = document.querySelector('label[for="setting-entity-id"]');
        if (entLabel) entLabel.textContent = 'เจ้าของบัญชี (Company)';

        document.getElementById("group-setting-entity").classList.remove("hidden");
        document.getElementById("group-setting-bank").classList.remove("hidden");
        document.getElementById("group-setting-accnum").classList.remove("hidden");
        document.getElementById("group-setting-pdfpassword")?.classList.remove("hidden");
        document.getElementById("group-setting-accounttype")?.classList.remove("hidden");

        if (oldId) {
            const acc = AppState.settings.accounts.find(a => a.account_id === oldId);
            if (acc) {
                document.getElementById("setting-name").value = acc.name;
                document.getElementById("setting-entity-id").value = acc.entity_id;
                document.getElementById("setting-bank-name").value = acc.bank_name || '';
                document.getElementById("setting-account-number").value = acc.account_number || '';
                if (document.getElementById("setting-pdf-password")) {
                    document.getElementById("setting-pdf-password").value = acc.pdf_password || '';
                }
                if (document.getElementById("setting-account-type")) document.getElementById("setting-account-type").value = acc.account_type || 'BANK';
                if (document.getElementById("setting-credit-limit")) document.getElementById("setting-credit-limit").value = acc.credit_limit || '';
                if (document.getElementById("setting-statement-day")) document.getElementById("setting-statement-day").value = acc.statement_day || '';
                if (document.getElementById("setting-due-day")) document.getElementById("setting-due-day").value = acc.due_day || '';
            }
        }
        dv2ToggleCreditFields();
    } else if (type === 'project') {
        document.getElementById("group-setting-projectstatus").classList.remove("hidden");
        document.getElementById("group-setting-members")?.classList.remove("hidden");
        const projMembersLabel = document.getElementById("setting-members-label");
        if (projMembersLabel) projMembersLabel.textContent = 'สมาชิกที่เข้าถึงได้ (ไม่เลือก = ทุกคนเห็น)';
        document.getElementById("setting-project-status").value = 'active';

        // สร้าง checkboxes สำหรับเลือกสมาชิก
        const membersContainer = document.getElementById("setting-members-checkboxes");
        if (membersContainer) {
            membersContainer.innerHTML = '';
            (AppState.settings.users || []).forEach(u => {
                membersContainer.innerHTML += `
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.85rem; color: rgba(255,255,255,0.9);">
                        <input type="checkbox" class="setting-member-checkbox" value="${u.user_id}" style="width:15px;height:15px;cursor:pointer;">
                        ${u.name}
                    </label>
                `;
            });
        }

        if (oldId) {
            const p = AppState.settings.projects.find(proj => proj.project_id === oldId);
            if (p) {
                document.getElementById("setting-name").value = p.name;
                document.getElementById("setting-project-status").value = p.status || 'active';
                // Pre-check existing members
                let existingMembers = [];
                try { existingMembers = p.members ? JSON.parse(p.members) : []; } catch {}
                if (membersContainer) {
                    membersContainer.querySelectorAll('.setting-member-checkbox').forEach(chk => {
                        chk.checked = existingMembers.includes(chk.value);
                    });
                }
            }
        }
    }
}

// แสดง/ซ่อนช่องข้อมูลบัตรเครดิตตามประเภทบัญชีที่เลือก
function dv2ToggleCreditFields() {
    const sel = document.getElementById("setting-account-type");
    const grp = document.getElementById("group-setting-credit");
    if (!sel || !grp) return;
    grp.classList.toggle("hidden", sel.value !== 'CREDIT');
}

async function saveSettingItem(e) {
    e.preventDefault();

    const type = document.getElementById("setting-type").value;
    const oldId = document.getElementById("setting-old-id").value;
    const newId = document.getElementById("setting-new-id").value.trim();
    const name = document.getElementById("setting-name").value.trim();

    if (!type || !newId || !name) {
        alert("กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน");
        return;
    }

    // Collect members checkboxes (project / contact / entity)
    const memberCheckboxes = document.querySelectorAll('.setting-member-checkbox:checked');
    const selectedMembers = memberCheckboxes.length > 0 ? Array.from(memberCheckboxes).map(c => c.value) : null;

    const payload = {
        type,
        old_id: oldId || null,
        new_id: newId,
        name,
        entity_id: document.getElementById("setting-entity-id").value || null,
        bank_name: document.getElementById("setting-bank-name").value.trim(),
        account_number: document.getElementById("setting-account-number").value.trim(),
        pdf_password: document.getElementById("setting-pdf-password") ? document.getElementById("setting-pdf-password").value.trim() : null,
        is_company: Number(document.getElementById("setting-is-company").value),
        contact_type: document.getElementById("setting-contact-type").value,
        category_type: type === 'caption' ? document.getElementById("setting-behavior").value : (type === 'category' ? document.getElementById("setting-category-caption").value : null),
        project_status: document.getElementById("setting-project-status").value,
        project_members: type === 'project' ? selectedMembers : undefined,
        contact_members: type === 'contact' ? selectedMembers : undefined,
        entity_members: type === 'entity' ? selectedMembers : undefined,
        // ข้อมูลบัญชี/บัตรเครดิต (เฉพาะ type=account)
        account_type: type === 'account' ? (document.getElementById("setting-account-type")?.value || 'BANK') : undefined,
        credit_limit: type === 'account' ? (parseFloat(document.getElementById("setting-credit-limit")?.value) || 0) : undefined,
        statement_day: type === 'account' ? (document.getElementById("setting-statement-day")?.value || null) : undefined,
        due_day: type === 'account' ? (document.getElementById("setting-due-day")?.value || null) : undefined,
        default_entity_id: document.getElementById("setting-default-entity-id") ? (document.getElementById("setting-default-entity-id").value || null) : null,
        default_contact_id: document.getElementById("setting-default-contact-id") ? (document.getElementById("setting-default-contact-id").value || null) : null,
        default_type: document.getElementById("setting-default-type") ? (document.getElementById("setting-default-type").value || null) : null
    };

    try {
        const res = await fetch(`${API_BASE}/api/settings/save`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-user-id': encodeURIComponent(getUserIdHeader())
            },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            alert("✅ บันทึกรายการตั้งค่าสำเร็จ!");
            document.getElementById("setting-modal").classList.add("hidden");
            await loadSettings();
            await fetchMasterData();
        } else {
            const err = await res.json();
            alert(`ล้มเหลว: ${err.error}`);
        }
    } catch (e) {
        alert(`เกิดข้อผิดพลาดในการเชื่อมต่อ: ${e.message}`);
    }
}

// ขยาย/ยุบแถวสมาชิก เพื่อดูรายชื่อบริษัทที่ถือ
window.dv2ToggleMember = function(uid) {
    const p = document.getElementById('mrow-' + uid);
    const chv = document.getElementById('mchv-' + uid);
    if (!p) return;
    const open = (p.style.display === 'none');
    p.style.display = open ? 'block' : 'none';
    if (chv) chv.style.transform = open ? 'rotate(90deg)' : '';
};

// ── ลบสมาชิก (Admin เท่านั้น) ──
// ลบ "ข้อมูลของ user นี้ทั้งหมด" (บริษัทที่ถือคนเดียว + ธุรกรรมในนั้น)
// แต่ "ข้อมูลที่ใช้ร่วมกัน" (บริษัทถือร่วมกับคนอื่น) จะถูกเก็บไว้
async function deleteMember(userId, userName) {
    if (AppState.userRole !== 'admin') { alert('เฉพาะ Admin เท่านั้นที่ลบสมาชิกได้'); return; }
    if (!confirm(`ลบสมาชิก "${userName}" และข้อมูลทั้งหมดของเขา?\n\n• บริษัทที่ "${userName}" ถือคนเดียว + ธุรกรรมในนั้น → ลบถาวร\n• บริษัทที่ถือร่วมกับคนอื่น → เก็บไว้ (แค่ถอนสิทธิ์ของคนนี้)\n\nกู้คืนไม่ได้`)) return;
    try {
        const res = await fetch(`${API_BASE}/api/users/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(getUserIdHeader()) },
            body: JSON.stringify({ user_id: userId })
        });
        const j = await res.json();
        if (!res.ok) { alert('ลบไม่สำเร็จ: ' + (j.error || '')); return; }
        const rep = j.report || {};
        let msg = `ลบสมาชิก "${userName}" เรียบร้อย`;
        if (rep.deleted_companies && rep.deleted_companies.length)
            msg += `\n\n🗑️ ลบข้อมูลบริษัท (ถือคนเดียว): ${rep.deleted_companies.join(', ')}`;
        if (rep.kept_shared_companies && rep.kept_shared_companies.length)
            msg += `\n\n🔗 คงไว้เพราะใช้ร่วมกัน: ${rep.kept_shared_companies.join(', ')}\n(ธุรกรรมที่เขาบันทึกในบริษัทเหล่านี้โอนเป็นของคุณ)`;
        alert(msg);
        await loadSettings();
        await fetchMasterData();
    } catch (e) { alert('เกิดข้อผิดพลาด: ' + e.message); }
}

// ── ล้างข้อมูล (Admin เท่านั้น) — scope: 'transactions' | 'all' ──
async function resetData(scope) {
    if (AppState.userRole !== 'admin') { alert('เฉพาะ Admin เท่านั้นที่ล้างข้อมูลได้'); return; }
    const label = scope === 'all' ? 'ล้างข้อมูลทั้งหมด (ธุรกรรม + ข้อมูลหลักทุกอย่าง)' : 'ล้างเฉพาะธุรกรรม (เก็บ Company/Customer/Caption/Category/Statement/Trip)';
    if (!confirm(`⚠️ ${label}\n\nการกระทำนี้ลบถาวร กู้คืนไม่ได้!\nแนะนำให้ Export Full Backup เก็บไว้ก่อน\n\nกดตกลงเพื่อไปขั้นยืนยันสุดท้าย`)) return;
    const typed = prompt('พิมพ์คำว่า  RESET  (ตัวใหญ่) เพื่อยืนยันการลบถาวร:');
    if (typed !== 'RESET') { alert('ยกเลิก — คุณไม่ได้พิมพ์ RESET'); return; }
    // #1 สำรองข้อมูลอัตโนมัติก่อนล้าง (ตาข่ายกันพลาด)
    alert('ระบบจะดาวน์โหลด Full Backup ให้อัตโนมัติก่อนล้างข้อมูล...');
    const backedUp = await runFullBackup('', '', { tag: 'before-reset' });
    if (!backedUp) {
        if (!confirm('⚠️ สำรองข้อมูลอัตโนมัติไม่สำเร็จ!\nยังต้องการล้างข้อมูลต่อโดยไม่มี backup หรือไม่?')) return;
    }
    try {
        const res = await fetch(`${API_BASE}/api/reset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(getUserIdHeader()) },
            body: JSON.stringify({ scope, confirm: 'RESET' })
        });
        const j = await res.json();
        if (!res.ok) { alert('ล้างข้อมูลไม่สำเร็จ: ' + (j.error || '')); return; }
        alert(`ล้างข้อมูลเรียบร้อย (${j.steps_done} ตาราง)` + (j.skipped && j.skipped.length ? `\nข้าม: ${j.skipped.length} รายการ` : ''));
        await loadSettings();
        await fetchMasterData();
        location.reload();
    } catch (e) { alert('เกิดข้อผิดพลาด: ' + e.message); }
}

function openUserModal(userId = '') {
    const modal = document.getElementById("user-modal");
    modal.classList.remove("hidden");

    const idInput = document.getElementById("user-id-input");
    const title = document.getElementById("user-modal-title");

    const permsContainer = document.getElementById("user-permissions-checkboxes");
    permsContainer.innerHTML = '';
    
    AppState.settings.entities.forEach(ent => {
        permsContainer.innerHTML += `
            <div style="margin-bottom:6px;">
                <label style="font-weight:normal; cursor:pointer;">
                    <input type="checkbox" class="user-perm-checkbox" value="${ent.entity_id}"> ${ent.name}
                </label>
            </div>
        `;
    });

    if (userId) {
        title.innerText = `แก้ไขสิทธิ์สมาชิก: ${userId}`;
        idInput.value = userId;
        idInput.readOnly = false; // Allow editing
        document.getElementById("user-old-id-input").value = userId;

        const u = AppState.settings.users.find(user => user.user_id === userId);
        if (u) {
            document.getElementById("user-name-input").value = u.name;
            document.getElementById("user-email-input").value = u.email;
            document.getElementById("user-password-input").value = '';
            document.getElementById("user-role-select").value = u.role;
            document.getElementById("user-line-id-input").value = u.line_user_id || '';

            document.querySelectorAll(".user-perm-checkbox").forEach(chk => {
                if ((u.allowed_entities || []).includes(chk.value)) {
                    chk.checked = true;
                }
            });
        }
    } else {
        title.innerText = "ลงทะเบียนสมาชิกครอบครัวใหม่";
        idInput.value = '';
        idInput.readOnly = false;
        document.getElementById("user-old-id-input").value = '';
        document.getElementById("user-name-input").value = '';
        document.getElementById("user-email-input").value = '';
        document.getElementById("user-password-input").value = '';
        document.getElementById("user-role-select").value = 'member';
        document.getElementById("user-line-id-input").value = '';
    }
}

async function saveUserItem(e) {
    e.preventDefault();

    const userId = document.getElementById("user-id-input").value.trim();
    const name = document.getElementById("user-name-input").value.trim();
    const email = document.getElementById("user-email-input").value.trim();
    const password = document.getElementById("user-password-input").value;
    const role = document.getElementById("user-role-select").value;
    const lineUserId = document.getElementById("user-line-id-input").value.trim();

    if (!userId || !name || !email) {
        alert("กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน");
        return;
    }

    const allowed_entities = [];
    document.querySelectorAll(".user-perm-checkbox:checked").forEach(chk => {
        allowed_entities.push(chk.value);
    });

    const oldUserId = document.getElementById("user-old-id-input").value;

    const payload = {
        user_id: userId,
        old_user_id: oldUserId || null,
        name,
        email,
        password: password || '1234',
        role,
        line_user_id: lineUserId || null,
        allowed_entities
    };

    try {
        const res = await fetch(`${API_BASE}/api/users`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-user-id': encodeURIComponent(getUserIdHeader())
            },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            alert("✅ บันทึกข้อมูลสมาชิกเรียบร้อย!");
            document.getElementById("user-modal").classList.add("hidden");
            await loadSettings();
        } else {
            const err = await res.json();
            alert(`ล้มเหลว: ${err.error}`);
        }
    } catch (err) {
        alert("ข้อผิดพลาดทางเทคนิค: " + err.message);
    }
}

// ==========================================
// 🔍 CLIENT-SIDE TABLE SORTING AND RESIZING
// ==========================================
function initTableSorting() {
    const tables = document.querySelectorAll(".settings-section-content table");
    tables.forEach(table => {
        const headers = table.querySelectorAll("th");
        headers.forEach((th, colIndex) => {
            // Check if it's the actions column
            if (th.textContent.trim() === 'การจัดการ' || th.textContent.trim() === '') return;

            th.style.cursor = 'pointer';
            th.title = "คลิกเพื่อเรียงลำดับ (Sort)";
            
            // Ensure no duplicate icon spans
            if (!th.querySelector('.sort-icon')) {
                const iconSpan = document.createElement('span');
                iconSpan.classList.add('sort-icon');
                iconSpan.style.marginLeft = '5px';
                iconSpan.style.fontSize = '0.8rem';
                th.appendChild(iconSpan);
            }

            th.addEventListener('click', (e) => {
                // Don't sort if clicking on resizer
                if (e.target.classList.contains('resizer')) return;

                const tbody = table.querySelector('tbody');
                const rows = Array.from(tbody.querySelectorAll('tr'));
                
                const isAscending = th.getAttribute('data-sort') === 'asc';
                const direction = isAscending ? -1 : 1;
                
                // Reset all headers
                headers.forEach(h => {
                    h.removeAttribute('data-sort');
                    const icon = h.querySelector('.sort-icon');
                    if(icon) icon.textContent = '';
                });

                th.setAttribute('data-sort', isAscending ? 'desc' : 'asc');
                const myIcon = th.querySelector('.sort-icon');
                if(myIcon) myIcon.textContent = isAscending ? '🔽' : '🔼';

                rows.sort((a, b) => {
                    if (!a.cells[colIndex] || !b.cells[colIndex]) return 0;
                    const cellA = a.cells[colIndex].textContent.trim();
                    const cellB = b.cells[colIndex].textContent.trim();
                    
                    const numA = parseFloat(cellA.replace(/,/g, ''));
                    const numB = parseFloat(cellB.replace(/,/g, ''));
                    
                    if (cellA.includes('฿') && cellB.includes('฿') && !isNaN(numA) && !isNaN(numB)) {
                        return (numA - numB) * direction;
                    }
                    return cellA.localeCompare(cellB, 'th', {numeric: true}) * direction;
                });

                rows.forEach(row => tbody.appendChild(row));
            });
        });
    });
}

function initSettingsResizableColumns() {
    const tables = document.querySelectorAll(".settings-section-content table");
    tables.forEach((table, tableIndex) => {
        const headers = table.querySelectorAll('th');
        // Unique storage key based on tab id or index
        const parentPane = table.closest('.tab-pane');
        const tabId = parentPane ? parentPane.id : 'tab_' + tableIndex;
        const storageKey = 'settingsColWidths_' + tabId;
        
        let savedWidths = {};
        try { savedWidths = JSON.parse(localStorage.getItem(storageKey)) || {}; } catch(e){}

        headers.forEach((th, index) => {
            if (savedWidths[index]) {
                th.style.width = savedWidths[index] + 'px';
                th.style.minWidth = savedWidths[index] + 'px';
                th.style.maxWidth = savedWidths[index] + 'px';
            }

            if (!th.querySelector('.resizer')) {
                const resizer = document.createElement('div');
                resizer.classList.add('resizer');
                th.appendChild(resizer);
                
                createSettingsResizableColumn(th, resizer, index, storageKey);
            }
        });
    });
}

function createSettingsResizableColumn(th, resizer, colIndex, storageKey) {
    let x = 0;
    let w = 0;

    const mouseDownHandler = function(e) {
        x = e.clientX;
        const styles = window.getComputedStyle(th);
        w = parseInt(styles.width, 10);
        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
        resizer.classList.add('resizing');
    };

    const mouseMoveHandler = function(e) {
        const dx = e.clientX - x;
        const newWidth = Math.max(40, w + dx);
        th.style.width = `${newWidth}px`;
        th.style.minWidth = `${newWidth}px`;
        th.style.maxWidth = `${newWidth}px`;
    };

    const mouseUpHandler = function() {
        resizer.classList.remove('resizing');
        document.removeEventListener('mousemove', mouseMoveHandler);
        document.removeEventListener('mouseup', mouseUpHandler);

        const width = parseInt(th.style.width, 10);
        if (isNaN(width)) return;
        let savedWidths = {};
        try { savedWidths = JSON.parse(localStorage.getItem(storageKey)) || {}; } catch (e) {}
        savedWidths[colIndex] = width;
        localStorage.setItem(storageKey, JSON.stringify(savedWidths));
    };

    resizer.addEventListener('mousedown', mouseDownHandler);
}


// ==========================================
// 📄 PDF STATEMENT UPLOAD LOGIC
// ==========================================
function bindPendingPageActions() {
    // + เพิ่มรายการ
    document.getElementById("btn-pending-add-row")?.addEventListener("click", () => {
        createNewPendingCard();
    });

    // ดาวน์โหลด Template Excel (flat format with column widths)
    document.getElementById("btn-pending-download-template")?.addEventListener("click", () => {
        downloadCSVTemplate();
    });

    // นำเข้า Excel (normal — PENDING_REVIEW, check dups)
    document.getElementById("btn-pending-upload-csv")?.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        parseExcelFileToPending(file);
        e.target.value = '';
    });

    // Bulk Import Excel (ข้อมูลเก่าจำนวนมาก — ส่ง batch 500 ต่อ call)
    document.getElementById("bulk-import-file-input")?.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const statusSel = document.getElementById("bulk-import-status-select");
        const importStatus = statusSel ? statusSel.value : 'PENDING_REVIEW';
        bulkImportExcelFile(file, importStatus);
        e.target.value = '';
    });
}

function bindPDFUpload() {
    const triggerUploadBtn = document.getElementById("btn-trigger-statement-upload");
    const pdfInput = document.getElementById("statement-pdf-input");
    
    if (triggerUploadBtn && pdfInput) {
        triggerUploadBtn.addEventListener("click", () => {
            const importAccSel = document.getElementById("import-account-selector");
            if (importAccSel && !importAccSel.value) {
                alert("กรุณาเลือกบัญชีธนาคารก่อนอัปโหลดไฟล์ PDF");
                return;
            }
            pdfInput.click();
        });

        pdfInput.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const importAccSel = document.getElementById("import-account-selector");
            const selectedAccId = importAccSel ? importAccSel.value : '';
            if (!selectedAccId) {
                alert("กรุณาเลือกบัญชีธนาคารก่อนอัปโหลดไฟล์ PDF");
                pdfInput.value = '';
                return;
            }
            
            const btnIcon = triggerUploadBtn.querySelector("i");
            const originalIconClass = btnIcon ? btnIcon.className : 'fa-solid fa-upload';
            if(btnIcon) btnIcon.className = "fa-solid fa-spinner fa-spin";
            triggerUploadBtn.disabled = true;
            triggerUploadBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> กำลังประมวลผล...`;

            try {
                const accObj = AppState.accounts.find(a => a.account_id === selectedAccId);
                const pdfPassword = accObj ? accObj.pdf_password : null;

                const reader = new FileReader();
                reader.readAsArrayBuffer(file);
                reader.onload = async (evt) => {
                    const fileBytes = evt.target.result;
                    let finalPdfBase64 = null;
                    let finalImagesBase64 = null;
                    
                    try {
                        let pdfDoc = await PDFLib.PDFDocument.load(fileBytes);
                        const unencryptedBytes = await pdfDoc.save();
                        let binary = '';
                        const bytes = new Uint8Array(unencryptedBytes);
                        for (let i = 0; i < bytes.byteLength; i++) {
                            binary += String.fromCharCode(bytes[i]);
                        }
                        finalPdfBase64 = "data:application/pdf;base64," + window.btoa(binary);
                    } catch (err) {
                        if (err.message && (err.message.toLowerCase().includes('encrypted') || err.message.toLowerCase().includes('password'))) {
                            if (!pdfPassword) {
                                alert("ไฟล์ PDF นี้ถูกเข้ารหัสไว้ แต่คุณยังไม่ได้ตั้งค่า 'รหัสผ่าน PDF' สำหรับบัญชีนี้ในการตั้งค่าระบบ");
                                if(btnIcon) btnIcon.className = originalIconClass;
                                triggerUploadBtn.disabled = false;
                                triggerUploadBtn.innerHTML = `<i class="${originalIconClass}"></i> เริ่มนำเข้าข้อมูล`;
                                return;
                            }
                            
                            // [DEBUG] Show password being used
                            alert(`[ระบบทดสอบ] กำลังใช้รหัสผ่าน: "${pdfPassword}" สำหรับบัญชี ${accObj.name || selectedAccId}\n(ถ้ากด OK จะเริ่มถอดรหัส)`);

                            try {
                                let pdfDoc = await PDFLib.PDFDocument.load(fileBytes, { password: pdfPassword });
                                const unencryptedBytes = await pdfDoc.save();
                                let binary = '';
                                const bytes = new Uint8Array(unencryptedBytes);
                                for (let i = 0; i < bytes.byteLength; i++) {
                                    binary += String.fromCharCode(bytes[i]);
                                }
                                finalPdfBase64 = "data:application/pdf;base64," + window.btoa(binary);
                            } catch (pwdErr) {
                                // Fallback to pdf.js for unsupported encryption (e.g., AES-256)
                                try {
                                    if (typeof pdfjsLib === 'undefined') {
                                        throw new Error("pdf.js library is not loaded.");
                                    }
                                    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(fileBytes), password: pdfPassword });
                                    const pdfDocument = await loadingTask.promise;
                                    const numPages = pdfDocument.numPages;
                                    const imagesBase64 = [];
                                    
                                    for (let i = 1; i <= numPages; i++) {
                                        const page = await pdfDocument.getPage(i);
                                        const viewport = page.getViewport({ scale: 2.0 });
                                        const canvas = document.createElement('canvas');
                                        const context = canvas.getContext('2d');
                                        canvas.height = viewport.height;
                                        canvas.width = viewport.width;
                                        await page.render({ canvasContext: context, viewport: viewport }).promise;
                                        imagesBase64.push(canvas.toDataURL('image/jpeg', 0.85));
                                    }
                                    finalImagesBase64 = imagesBase64;
                                } catch (fallbackErr) {
                                    alert("ไม่สามารถถอดรหัส PDF ได้ รหัสผ่านที่ตั้งไว้ในระบบอาจไม่ถูกต้อง (หรือไฟล์เสียหาย)");
                                    if(btnIcon) btnIcon.className = originalIconClass;
                                    triggerUploadBtn.disabled = false;
                                    triggerUploadBtn.innerHTML = `<i class="${originalIconClass}"></i> เริ่มนำเข้าข้อมูล`;
                                    return;
                                }
                            }
                        } else {
                            alert("เกิดข้อผิดพลาดในการอ่านไฟล์ PDF: " + err.message);
                            if(btnIcon) btnIcon.className = originalIconClass;
                            triggerUploadBtn.disabled = false;
                            triggerUploadBtn.innerHTML = `<i class="${originalIconClass}"></i> เริ่มนำเข้าข้อมูล`;
                            return;
                        }
                    }

                    const payload = {};
                    if (finalPdfBase64) payload.pdfBase64 = finalPdfBase64;
                    if (finalImagesBase64) payload.imagesBase64 = finalImagesBase64;

                    const res = await fetch(`${API_BASE}/api/statement-ocr`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'x-user-id': encodeURIComponent(getUserIdHeader())
                        },
                        body: JSON.stringify(payload)
                    });
                    
                    if (res.ok) {
                        const data = await res.json();
                        if (data && data.transactions && data.transactions.length > 0) {
                            let importedCount = 0;
                            let skippedCount = 0;
                            
                            // Force-use the pre-selected account ID
                            const accId = selectedAccId;
                            
                            const entityId = AppState.allowedEntities[0] || null;

                            const skippedDetails = [];
                            const promises = data.transactions.map(tx => {
                                const payload = {
                                    transaction_id: generateTxId(tx.date, accId, tx.amount, 'PDF', { refCode: tx.ref_code, statementDesc: tx.statement_desc, time: tx.time }),
                                    account_id: accId,
                                    date: tx.date,
                                    time: tx.time,
                                    statement_desc: tx.statement_desc,
                                    total_amount: tx.amount,
                                    ref_code: tx.ref_code,
                                    status: 'PENDING_REVIEW',
                                    source: 'PDF_IMPORT',
                                    details: [{
                                        amount: tx.amount,
                                        fee: 0,
                                        wht: 0,
                                        category_id: null,
                                        entity_id: entityId,
                                        note: tx.note,
                                        type: tx.type
                                    }]
                                };

                                return fetch(`${API_BASE}/api/transactions`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(getUserIdHeader()) },
                                    body: JSON.stringify(payload)
                                }).then(async r => {
                                    const json = await r.json().catch(() => ({}));
                                    if (!r.ok) return 'error';
                                    if (json.skipped) {
                                        skippedDetails.push(json.message || `${tx.date} | ${tx.amount}`);
                                        return 'skipped';
                                    }
                                    return 'success';
                                }).catch(() => 'error');
                            });

                            const results = await Promise.all(promises);
                            results.forEach(resType => {
                                if (resType === 'success') importedCount++;
                                else if (resType === 'skipped') skippedCount++;
                            });

                            let msg = `อัปโหลดสำเร็จ: นำเข้า ${importedCount} รายการ`;
                            if (skippedCount > 0) {
                                msg += `\n\nข้ามรายการซ้ำ ${skippedCount} รายการ:\n` + skippedDetails.slice(0, 10).join('\n');
                                if (skippedDetails.length > 10) msg += `\n...และอีก ${skippedDetails.length - 10} รายการ`;
                            }
                            alert(msg);
                            loadPending();
                        } else {
                            alert("ไม่พบรายการธุรกรรมในไฟล์นี้");
                        }
                    } else {
                        const err = await res.json();
                        alert(`เกิดข้อผิดพลาด: ${err.error}`);
                    }
                    
                    triggerUploadBtn.disabled = false;
                    triggerUploadBtn.innerHTML = `<i class="${originalIconClass}"></i> เลือกไฟล์ PDF เพื่อนำเข้า`;
                    pdfInput.value = '';
                };
            } catch (err) {
                console.error("PDF Upload Error:", err);
                alert("เกิดข้อผิดพลาดในการประมวลผลไฟล์");
                triggerUploadBtn.disabled = false;
                triggerUploadBtn.innerHTML = `<i class="${originalIconClass}"></i> เลือกไฟล์ PDF เพื่อนำเข้า`;
                pdfInput.value = '';
            }
        });
    }
}

// ==========================================
// 🗑️ DELETE SETTING ITEM (CRUD Helper)
// ==========================================
async function deleteSettingItem(type, id) {
    if (!confirm(`⚠️ คุณต้องการลบรายการนี้ใช่หรือไม่? การลบข้อมูลหลักอาจมีผลกระทบกับประวัติธุรกรรมที่เชื่อมโยงอยู่`)) {
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/api/settings/delete`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-user-id': encodeURIComponent(getUserIdHeader())
            },
            body: JSON.stringify({ type, id })
        });

        if (res.ok) {
            alert("✅ ลบข้อมูลตั้งค่าสำเร็จ!");
            await loadSettings();
            await fetchMasterData();
        } else {
            const err = await res.json();
            alert(`ลบไม่สำเร็จ: ${err.error}`);
        }
    } catch (e) {
        console.error("Delete setting error:", e);
        alert("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    }
}

// ==========================================
// ↔️ RESIZABLE COLUMNS (Grid View)
// ==========================================
function initResizableColumns() {
    const table = document.getElementById('grid-input-table');
    if (!table) return;

    // Load saved widths
    const savedWidthsStr = localStorage.getItem('gridColumnWidths');
    let savedWidths = {};
    if (savedWidthsStr) {
        try { savedWidths = JSON.parse(savedWidthsStr); } catch (e) { console.warn("Invalid saved column widths"); }
    }

    const headers = table.querySelectorAll('th');
    headers.forEach((th, index) => {
        // Apply saved width (if any)
        if (savedWidths[index]) {
            th.style.width = savedWidths[index] + 'px';
            th.style.minWidth = savedWidths[index] + 'px';
            th.style.maxWidth = savedWidths[index] + 'px';
        }

        // Avoid adding multiple resizers if already initialized
        if (!th.querySelector('.resizer')) {
            const resizer = document.createElement('div');
            resizer.classList.add('resizer');
            th.appendChild(resizer);
            createResizableColumn(th, resizer, index);
        }
    });
}

function createResizableColumn(th, resizer, colIndex) {
    let x = 0;
    let w = 0;

    const mouseDownHandler = function(e) {
        x = e.clientX;
        const styles = window.getComputedStyle(th);
        w = parseInt(styles.width, 10);

        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
        
        resizer.classList.add('resizing');
        document.getElementById('grid-input-table').classList.add('resizing');
    };

    const mouseMoveHandler = function(e) {
        const dx = e.clientX - x;
        const newWidth = Math.max(50, w + dx); // Set a minimum width of 50px
        th.style.width = `${newWidth}px`;
        th.style.minWidth = `${newWidth}px`;
        th.style.maxWidth = `${newWidth}px`;
    };

    const mouseUpHandler = function() {
        resizer.classList.remove('resizing');
        document.getElementById('grid-input-table').classList.remove('resizing');
        document.removeEventListener('mousemove', mouseMoveHandler);
        document.removeEventListener('mouseup', mouseUpHandler);

        // Save new width to localStorage
        saveColumnWidth(colIndex, th.style.width);
    };

    resizer.addEventListener('mousedown', mouseDownHandler);
}

function saveColumnWidth(colIndex, widthStr) {
    const width = parseInt(widthStr, 10);
    if (isNaN(width)) return;

    const savedWidthsStr = localStorage.getItem('gridColumnWidths');
    let savedWidths = {};
    if (savedWidthsStr) {
        try { savedWidths = JSON.parse(savedWidthsStr); } catch (e) {}
    }

    savedWidths[colIndex] = width;
    localStorage.setItem('gridColumnWidths', JSON.stringify(savedWidths));
}

// Ensure features are initialized on load




document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        // applySavedColumnOrderToHeader(); // Apply order first
        // initResizableColumns(); // Disable resizable columns
        // initDraggableColumns(); // Disable draggable columns
    }, 500); 
});

// ==========================================
// 🔄 DRAGGABLE COLUMNS (Grid View)
// ==========================================
function initDraggableColumns() {
    const table = document.getElementById('grid-input-table');
    if (!table) return;

    const headers = Array.from(table.querySelectorAll('thead th'));
    let dragSrcEl = null;

    headers.forEach((th) => {
        const colId = th.getAttribute('data-col-id');
        // Do not make actions column draggable
        if (colId === 'actions') return;

        th.setAttribute('draggable', 'true');
        th.classList.add('draggable-col');

        th.addEventListener('dragstart', function(e) {
            // Prevent dragging if clicked on the resizer handle
            if (e.target.classList.contains('resizer')) {
                e.preventDefault();
                return;
            }
            dragSrcEl = this;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', this.innerHTML);
            this.classList.add('dragging');
        });

        th.addEventListener('dragover', function(e) {
            e.preventDefault(); // Necessary to allow dropping
            e.dataTransfer.dropEffect = 'move';
            return false;
        });

        th.addEventListener('dragenter', function(e) {
            if (this !== dragSrcEl && this.getAttribute('data-col-id') !== 'actions') {
                this.classList.add('drag-over');
            }
        });

        th.addEventListener('dragleave', function(e) {
            this.classList.remove('drag-over');
        });

        th.addEventListener('drop', function(e) {
            e.stopPropagation();
            this.classList.remove('drag-over');
            
            // Cannot drop on itself or on actions column
            if (dragSrcEl !== this && this.getAttribute('data-col-id') !== 'actions') {
                reorderTableColumns(table, dragSrcEl, this);
            }
            return false;
        });

        th.addEventListener('dragend', function(e) {
            this.classList.remove('dragging');
            table.querySelectorAll('th').forEach(h => h.classList.remove('drag-over'));
        });
    });
}

function getElementIndex(node) {
    let index = 0;
    while ((node = node.previousElementSibling)) {
        index++;
    }
    return index;
}

function reorderTableColumns(table, draggedTh, targetTh) {
    const fromIndex = getElementIndex(draggedTh);
    const toIndex = getElementIndex(targetTh);

    if (fromIndex === toIndex) return;

    // 1. Reorder TH
    const theadRow = table.querySelector('thead tr');
    moveNode(theadRow, fromIndex, toIndex);

    // 2. Reorder TD in all TBODY rows
    const tbodyRows = table.querySelectorAll('tbody tr');
    tbodyRows.forEach(tr => {
        moveNode(tr, fromIndex, toIndex);
    });

    // 3. Save new order based on data-col-id
    saveColumnOrder(table);
}

function moveNode(parent, fromIndex, toIndex) {
    const children = Array.from(parent.children);
    if (fromIndex >= children.length || toIndex >= children.length) return;
    
    const draggedEl = children[fromIndex];
    const targetEl = children[toIndex];
    
    if (fromIndex < toIndex) {
        parent.insertBefore(draggedEl, targetEl.nextSibling);
    } else {
        parent.insertBefore(draggedEl, targetEl);
    }
}

function saveColumnOrder(table) {
    const headers = Array.from(table.querySelectorAll('thead th'));
    const order = headers.map(th => th.getAttribute('data-col-id')).filter(id => id);
    localStorage.setItem('gridColumnOrder', JSON.stringify(order));
}

function applySavedColumnOrderToHeader() {
    const savedOrderStr = localStorage.getItem('gridColumnOrder');
    if (!savedOrderStr) return;
    
    let savedOrder;
    try { savedOrder = JSON.parse(savedOrderStr); } catch (e) { return; }
    
    const table = document.getElementById('grid-input-table');
    if (!table) return;
    
    const theadRow = table.querySelector('thead tr');
    const ths = Array.from(theadRow.children);
    const thMap = {};
    ths.forEach(th => {
        const colId = th.getAttribute('data-col-id');
        if (colId) thMap[colId] = th;
    });
    
    // Re-append TH in saved order
    savedOrder.forEach(colId => {
        if (thMap[colId]) {
            theadRow.appendChild(thMap[colId]);
        }
    });
    
    // Ensure actions is at the end
    if (thMap['actions'] && !savedOrder.includes('actions')) {
        theadRow.appendChild(thMap['actions']);
    }
    
    // We don't need to reorder existing tbody rows here because grid is empty on load, 
    // and when addRow/paste triggers, createGridRow() applies the order to the new row!
}

// ==========================================
// 📥 EXCEL IMPORT / EXPORT FOR SETTINGS TABS
// ==========================================
function exportSettingExcel(type) {
    let data = [];
    let filename = '';
    
    if (type === 'entity') {
        filename = 'settings_companies.xlsx';
        const list = AppState.settings.entities || [];
        const euAll = AppState.settings.entity_users || [];
        data = list.map(item => {
            const owners = euAll.filter(eu => eu.entity_id === item.entity_id).map(eu => eu.user_id);
            return {
                "ID": item.entity_id,
                "Name": item.name,
                "Is Company (1 or 0)": item.is_company ? 1 : 0,
                "Members (User IDs คั่นด้วยจุลภาค — เว้นว่าง = เฉพาะผู้สร้าง)": owners.join(',')
            };
        });
    } else if (type === 'contact') {
        filename = 'settings_customers.xlsx';
        const list = AppState.settings.contacts || [];
        data = list.map(item => {
            let members = [];
            try { members = item.members ? JSON.parse(item.members) : []; } catch {}
            return {
                "ID": item.contact_id,
                "Name": item.name,
                "Contact Type (CUSTOMER or VENDOR or OTHER)": item.contact_type || 'CUSTOMER',
                "Members (User IDs คั่นด้วยจุลภาค — เว้นว่าง = ทุกคน)": Array.isArray(members) ? members.join(',') : ''
            };
        });
    } else if (type === 'caption') {
        filename = 'settings_captions.xlsx';
        const list = AppState.settings.captions || [];
        data = list.map(item => ({
            "ID": item.type_id,
            "Name": item.name,
            "Behavior (REVENUE or EXPENSE or ASSET or INVESTMENT or LIABILITY or TRANSFER)": item.sub_behavior === 'INVESTMENT' ? 'INVESTMENT' : (item.behavior || 'EXPENSE'),
            "Default Company (Entity ID)": item.default_entity_id || '',
            "Default Customer (Contact ID)": item.default_contact_id || '',
            "Default Type (INCOME or EXPENSE or TRANSFER)": item.default_type || ''
        }));
    } else if (type === 'category') {
        filename = 'settings_categories.xlsx';
        const list = AppState.settings.categories || [];
        data = list.map(item => ({
            "ID": item.category_id,
            "Name": item.name,
            "Account Type (Caption ID)": item.caption_id || '',
            "Default Company (Entity ID)": item.default_entity_id || '',
            "Default Customer (Contact ID)": item.default_contact_id || '',
            "Default Type (INCOME or EXPENSE or TRANSFER)": item.default_type || ''
        }));
    } else if (type === 'account') {
        filename = 'settings_statements.xlsx';
        const list = AppState.settings.accounts || [];
        data = list.map(item => ({
            "ID": item.account_id,
            "Company (Entity ID)": item.entity_id || '',
            "Name": item.name,
            "Bank Name": item.bank_name || '',
            "Account Number": item.account_number || '',
            "Account Type (BANK or CASH or CREDIT)": item.account_type || 'BANK',
            "Credit Limit": item.credit_limit || 0,
            "Statement Day (1-31)": item.statement_day || '',
            "Due Day (1-31)": item.due_day || ''
        }));
    } else if (type === 'project') {
        filename = 'settings_trips.xlsx';
        const list = AppState.settings.projects || [];
        data = list.map(item => {
            let membersArr = [];
            try { membersArr = item.members ? JSON.parse(item.members) : []; } catch {}
            return {
                "ID": item.project_id,
                "Name": item.name,
                "Status (active or closed)": item.status || 'active',
                "Members (User IDs คั่นด้วยจุลภาค — เว้นว่าง = ทุกคน)": Array.isArray(membersArr) ? membersArr.join(',') : ''
            };
        });
    }
    
    if (data.length === 0) {
        if (type === 'entity') data.push({ "ID": "ENT-NEW", "Name": "บริษัท ตัวอย่าง จำกัด", "Is Company (1 or 0)": 1, "Members (User IDs คั่นด้วยจุลภาค — เว้นว่าง = เฉพาะผู้สร้าง)": "" });
        else if (type === 'contact') data.push({ "ID": "CON-NEW", "Name": "คุณสมชาย ใจดี", "Contact Type (CUSTOMER or VENDOR or OTHER)": "CUSTOMER", "Members (User IDs คั่นด้วยจุลภาค — เว้นว่าง = ทุกคน)": "" });
        else if (type === 'caption') data.push({ "ID": "TYPE-NEW", "Name": "รายได้ค่าบริการ", "Behavior (REVENUE or EXPENSE or ASSET or INVESTMENT or LIABILITY or TRANSFER)": "REVENUE", "Default Company (Entity ID)": "", "Default Customer (Contact ID)": "", "Default Type (INCOME or EXPENSE or TRANSFER)": "" });
        else if (type === 'category') data.push({ "ID": "CAT-NEW", "Name": "ค่าธรรมเนียมธนาคาร", "Account Type (Caption ID)": "", "Default Company (Entity ID)": "", "Default Customer (Contact ID)": "", "Default Type (INCOME or EXPENSE or TRANSFER)": "" });
        else if (type === 'account') data.push({ "ID": "ACC-NEW", "Company (Entity ID)": "", "Name": "บัญชีธนาคาร กสิกรไทย", "Bank Name": "KBANK", "Account Number": "1234567890", "Account Type (BANK or CASH or CREDIT)": "BANK", "Credit Limit": 0, "Statement Day (1-31)": "", "Due Day (1-31)": "" });
        else if (type === 'project') data.push({ "ID": "PRJ-NEW", "Name": "ทริปญี่ปุ่น 2026", "Status (active or closed)": "active", "Members (User IDs คั่นด้วยจุลภาค — เว้นว่าง = ทุกคน)": "" });
    }
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Settings");
    XLSX.writeFile(wb, filename);
}

function importSettingExcel(fileInput, type) {
    const file = fileInput.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(worksheet);
            
            if (rows.length === 0) {
                alert("⚠️ ไม่พบข้อมูลในไฟล์ Excel");
                fileInput.value = '';
                return;
            }
            
            document.body.style.cursor = 'wait';
            
            let successCount = 0;
            let errorCount = 0;
            let errors = [];
            
            for (const row of rows) {
                const idVal = String(row["ID"] || "").trim();
                if (!idVal) continue;
                
                let payload = {
                    type,
                    new_id: idVal,
                    name: String(row["Name"] || "").trim() || idVal
                };
                
                let exists = false;
                if (type === 'entity') {
                    exists = (AppState.settings.entities || []).some(item => item.entity_id === idVal);
                    payload.is_company = Number(row["Is Company (1 or 0)"]) || 0;
                    const entMembersRaw = String(row["Members (User IDs คั่นด้วยจุลภาค — เว้นว่าง = เฉพาะผู้สร้าง)"] || "").trim();
                    payload.entity_members = entMembersRaw ? entMembersRaw.split(',').map(s => s.trim()).filter(Boolean) : null;
                } else if (type === 'contact') {
                    exists = (AppState.settings.contacts || []).some(item => item.contact_id === idVal);
                    payload.contact_type = String(row["Contact Type (CUSTOMER or VENDOR or OTHER)"] || "CUSTOMER").toUpperCase().trim();
                    const membersRaw = String(row["Members (User IDs คั่นด้วยจุลภาค — เว้นว่าง = ทุกคน)"] || "").trim();
                    payload.contact_members = membersRaw ? membersRaw.split(',').map(s => s.trim()).filter(Boolean) : null;
                } else if (type === 'caption') {
                    exists = (AppState.settings.captions || []).some(item => item.type_id === idVal);
                    payload.category_type = String(row["Behavior (REVENUE or EXPENSE or ASSET or INVESTMENT or LIABILITY or TRANSFER)"] || "EXPENSE").toUpperCase().trim();
                    payload.default_entity_id = String(row["Default Company (Entity ID)"] || "").trim() || null;
                    payload.default_contact_id = String(row["Default Customer (Contact ID)"] || "").trim() || null;
                    payload.default_type = String(row["Default Type (INCOME or EXPENSE or TRANSFER)"] || "").trim() || null;
                } else if (type === 'category') {
                    exists = (AppState.settings.categories || []).some(item => item.category_id === idVal);
                    payload.category_type = String(row["Account Type (Caption ID)"] || "").trim();
                    payload.default_entity_id = String(row["Default Company (Entity ID)"] || "").trim() || null;
                    payload.default_contact_id = String(row["Default Customer (Contact ID)"] || "").trim() || null;
                    payload.default_type = String(row["Default Type (INCOME or EXPENSE or TRANSFER)"] || "").trim() || null;
                } else if (type === 'account') {
                    exists = (AppState.settings.accounts || []).some(item => item.account_id === idVal);
                    payload.entity_id = String(row["Company (Entity ID)"] || row["Owner (Entity ID)"] || "").trim();
                    payload.bank_name = String(row["Bank Name"] || "").trim();
                    payload.account_number = String(row["Account Number"] || "").trim();
                    payload.account_type = String(row["Account Type (BANK or CASH or CREDIT)"] || "BANK").toUpperCase().trim();
                    payload.credit_limit = parseFloat(row["Credit Limit"]) || 0;
                    const sDay = String(row["Statement Day (1-31)"] ?? "").trim();
                    const dDay = String(row["Due Day (1-31)"] ?? "").trim();
                    payload.statement_day = sDay ? Number(sDay) : null;
                    payload.due_day = dDay ? Number(dDay) : null;
                } else if (type === 'project') {
                    exists = (AppState.settings.projects || []).some(item => item.project_id === idVal);
                    payload.project_status = String(row["Status (active or closed)"] || "active").toLowerCase().trim();
                    const membersStr = String(row["Members (User IDs คั่นด้วยจุลภาค — เว้นว่าง = ทุกคน)"] || "").trim();
                    payload.project_members = membersStr ? membersStr.split(',').map(s => s.trim()).filter(Boolean) : null;
                }
                
                payload.old_id = exists ? idVal : null;
                
                try {
                    const res = await fetch(`${API_BASE}/api/settings/save`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'x-user-id': encodeURIComponent(getUserIdHeader())
                        },
                        body: JSON.stringify(payload)
                    });
                    
                    if (res.ok) {
                        successCount++;
                    } else {
                        const err = await res.json();
                        errorCount++;
                        errors.push(`ID: ${idVal} - ${err.error || 'Unknown error'}`);
                    }
                } catch (err) {
                    errorCount++;
                    errors.push(`ID: ${idVal} - Connection error: ${err.message}`);
                }
            }
            
            document.body.style.cursor = 'default';
            
            await loadSettings();
            await fetchMasterData();
            
            let msg = `✅ นำเข้าข้อมูลสำเร็จ ${successCount} รายการ`;
            if (errorCount > 0) {
                msg += `\n❌ ล้มเหลว ${errorCount} รายการ:\n` + errors.slice(0, 5).join('\n');
                if (errors.length > 5) msg += `\n...และอื่นๆ`;
            }
            alert(msg);
            
        } catch (err) {
            document.body.style.cursor = 'default';
            alert("เกิดข้อผิดพลาดในการอ่านไฟล์ Excel: " + err.message);
        }
        fileInput.value = '';
    };
    reader.readAsArrayBuffer(file);
}

// ==========================================
// ⚡ GRID IMPORT & EXPORT EXCEL/CSV
// ==========================================
function downloadCSVTemplate() {
    // Use xlsx-js-style (XLSXStyle) for cell colour support; fall back to plain XLSX
    const XL = (typeof XLSXStyle !== 'undefined') ? XLSXStyle : XLSX;
    if (typeof XL === 'undefined') {
        alert("ไม่พบไลบรารีส่งออกไฟล์ กรุณารีเฟรชหน้าเว็บ");
        return;
    }

    // Helper: today as DD/MM/YYYY
    const today = new Date();
    const todayStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;

    // Pull real IDs from AppState (fallback to placeholders)
    const acc0 = (AppState.accounts || [])[0];
    const cap0 = (AppState.captions  || [])[0];
    const cat0 = (AppState.categories|| [])[0];
    const ent0 = (AppState.entities  || [])[0];
    const con0 = (AppState.contacts  || [])[0];

    const accId = acc0 ? acc0.account_id  : 'ACC-01';
    const capId = cap0 ? cap0.type_id     : 'CAP-01';
    const catId = cat0 ? cat0.category_id : 'CAT-01';
    const entId = ent0 ? ent0.entity_id   : 'ENT-01';
    const conId = con0 ? con0.contact_id  : 'CONT-01';

    // Number format string for Excel: "1,234.56" / "(1,234.56)" for negatives
    const numFmt = '#,##0.00_);(#,##0.00)';

    // Cell style helpers
    const blueHdr = {
        font:      { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
        fill:      { fgColor: { rgb: '2563EB' }, patternType: 'solid' },
        alignment: { horizontal: 'center', vertical: 'center' },
        border:    { bottom: { style: 'thin', color: { rgb: 'BFDBFE' } } }
    };
    const numStyle = { numFmt, alignment: { horizontal: 'right' } };

    // Helper: build a styled cell object
    const sc = (v, s) => ({ v, s, t: typeof v === 'number' ? 'n' : 's' });

    // ── Sheet 1: Import Template ──────────────────────────────────────────
    const hdrs = [
        'Date (DD/MM/YYYY)', 'Statement Account ID', 'Total Amount', 'Note',
        'Caption (Account Type ID)', 'Category ID', 'Company Entity ID',
        'Customer Contact ID', 'Transaction Amount', 'Fee', 'WHT', 'Detail'
    ];

    // Example 1 — 1 transaction, 1 sub-item
    const ex1 = [
        todayStr, accId, -6000.00, 'ค่าใช้จ่ายประจำเดือน',
        capId, catId, entId, conId,
        -6000.00, 0.00, 0.00, 'รายละเอียดย่อย'
    ];
    // Example 2 — 1 transaction, 2 sub-items (row 2 leaves header cols blank)
    const ex2a = [
        todayStr, accId, 15000.00, 'รายได้ขายสินค้า',
        capId, catId, entId, conId,
        8000.00, 0.00, 0.00, 'สินค้า A'
    ];
    const ex2b = ['', '', '', '', '', '', '', '', 7000.00, 0.00, 0.00, 'สินค้า B'];

    // Build AOA with styled header cells
    const numCols = new Set([2, 8, 9, 10]); // Total Amount, Transaction Amt, Fee, WHT
    const wsData = [
        hdrs.map(h => sc(h, blueHdr)),
        ex1.map((v, ci) => sc(v, numCols.has(ci) ? numStyle : {})),
        ex2a.map((v, ci) => sc(v, numCols.has(ci) ? numStyle : {})),
        ex2b.map((v, ci) => sc(v, numCols.has(ci) ? numStyle : {}))
    ];

    const ws = XL.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [
        {wch:18},{wch:24},{wch:16},{wch:28},
        {wch:24},{wch:16},{wch:20},{wch:22},
        {wch:20},{wch:12},{wch:12},{wch:28}
    ];
    ws['!freeze']     = { xSplit: 0, ySplit: 1 };
    ws['!autofilter'] = { ref: 'A1:L1' };

    // ── Master Data Sheets ────────────────────────────────────────────────
    function makeMasterSheet(colHdrs, rows) {
        const data = [
            colHdrs.map(h => sc(h, blueHdr)),
            ...rows.map(r => r.map(v => sc(v, {})))
        ];
        const wsm = XL.utils.aoa_to_sheet(data);
        wsm['!cols']       = colHdrs.map(() => ({ wch: 28 }));
        wsm['!freeze']     = { xSplit: 0, ySplit: 1 };
        wsm['!autofilter'] = { ref: XL.utils.encode_range({ s:{r:0,c:0}, e:{r:0,c:colHdrs.length-1} }) };
        return wsm;
    }

    const wsAcc = makeMasterSheet(
        ['Account ID','ชื่อบัญชี','ธนาคาร'],
        (AppState.accounts||[]).map(a=>[a.account_id, a.name, a.bank_name||''])
    );
    const wsCap = makeMasterSheet(
        ['Caption ID','ชื่อ Caption'],
        (AppState.captions||[]).map(c=>[c.type_id, c.name||''])
    );
    const wsCat = makeMasterSheet(
        ['Category ID','ชื่อหมวดหมู่','Caption ID'],
        (AppState.categories||[]).map(c=>[c.category_id, c.name||'', c.caption_id||''])
    );
    const wsEnt = makeMasterSheet(
        ['Entity ID','ชื่อบริษัท/หน่วยงาน'],
        (AppState.entities||[]).map(e=>[e.entity_id, e.name||''])
    );
    const wsCon = makeMasterSheet(
        ['Contact ID','ชื่อผู้ติดต่อ','Entity ID'],
        (AppState.contacts||[]).map(c=>[c.contact_id, c.name||'', c.entity_id||''])
    );

    // ── Assemble & write ──────────────────────────────────────────────────
    const wb = XL.utils.book_new();
    XL.utils.book_append_sheet(wb, ws,    '📥 Import Template');
    XL.utils.book_append_sheet(wb, wsAcc, '🏦 Statement Accounts');
    XL.utils.book_append_sheet(wb, wsCap, '🏷 Captions');
    XL.utils.book_append_sheet(wb, wsCat, '📂 Categories');
    XL.utils.book_append_sheet(wb, wsEnt, '🏢 Entities');
    XL.utils.book_append_sheet(wb, wsCon, '👤 Contacts');

    XL.writeFile(wb, 'Pending_Import_Template.xlsx');
}

function parseCSVFileToGrid(file) {
    if (typeof XLSX === 'undefined') {
        alert("ไม่พบไลบรารีอ่านไฟล์ กรุณารีเฟรชหน้าเว็บ");
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            const json = XLSX.utils.sheet_to_json(worksheet, {header: 1});
            
            if (json.length <= 1) {
                alert("ไม่พบข้อมูลในไฟล์");
                return;
            }

            const container = document.getElementById("grid-input-cards-container");
            
            // Group rows by Date + Account + Total Amount to form cards with subrows if they match
            // For simplicity, we just create 1 card per row for now.
            for (let i = 1; i < json.length; i++) {
                const row = json[i];
                if (!row || row.length === 0 || (!row[0] && !row[1] && !row[2])) continue; 
                
                let dateVal = '';
                if (row[0]) {
                    dateVal = normalizeDateToYYYYMMDD(String(row[0]).trim());
                }

                const parsed = {
                    date: dateVal,
                    account_id: row[1] ? String(row[1]).trim() : '',
                    total_amount: Number(row[2]) || '',
                    note: row[3] ? String(row[3]).trim() : '',
                    details: [{
                        caption: row[4] ? String(row[4]).trim() : '',
                        category_id: row[5] ? String(row[5]).trim() : '',
                        entity_id: row[6] ? String(row[6]).trim() : '',
                        contact_id: row[7] ? String(row[7]).trim() : '',
                        amount: row[8] !== undefined ? Number(row[8]) : '',
                        fee: row[9] !== undefined ? Number(row[9]) : 0,
                        wht: row[10] !== undefined ? Number(row[10]) : 0,
                        note: row[11] ? String(row[11]).trim() : ''
                    }]
                };

                container.appendChild(createGridCard(parsed));
            }
            
            alert(`นำเข้าข้อมูลสำเร็จ (สามารถตรวจสอบและกดบันทึกได้)`);
        } catch (err) {
            console.error(err);
            alert("เกิดข้อผิดพลาดในการอ่านไฟล์: " + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

// ==========================================
// 📊 EXCEL IMPORT → PENDING PAGE
// ==========================================
function parseExcelFileToPending(file) {
    if (typeof XLSX === 'undefined') {
        alert("ไม่พบไลบรารีอ่านไฟล์ กรุณารีเฟรชหน้าเว็บ");
        return;
    }

    // Parse number from cell: handles raw numbers, "1,234.56", "(1,234.56)" → -1234.56
    const parseImportNum = (v) => {
        if (v === undefined || v === null || v === '') return 0;
        if (typeof v === 'number') return v;
        const s = String(v).trim();
        const isNeg = s.startsWith('(') && s.endsWith(')');
        const clean = parseFloat(s.replace(/[(),\s]/g, ''));
        if (isNaN(clean)) return 0;
        return isNeg ? -Math.abs(clean) : clean;
    };

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            // Prefer the "📥 Import Template" sheet; fall back to first sheet
            const targetSheet = workbook.SheetNames.find(n => n.includes('Import Template')) || workbook.SheetNames[0];
            const ws = workbook.Sheets[targetSheet];
            const json = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

            if (json.length <= 1) {
                alert("ไม่พบข้อมูลในไฟล์");
                return;
            }

            // ── Step 1: Parse rows into groups ────────────────────────────
            const groups = [];
            let currentGroup = null;

            for (let i = 1; i < json.length; i++) {
                const row = json[i];
                if (!row || row.length === 0) continue;

                const isSubRow = !row[0] && !row[1] && row[8] !== undefined && row[8] !== '';

                if (isSubRow && currentGroup) {
                    currentGroup.details.push({
                        excelRow:    i + 1,
                        caption:     row[4] ? String(row[4]).trim() : '',
                        category_id: row[5] ? String(row[5]).trim() : '',
                        entity_id:   row[6] ? String(row[6]).trim() : '',
                        contact_id:  row[7] ? String(row[7]).trim() : '',
                        amount: parseImportNum(row[8]),
                        fee:    parseImportNum(row[9]),
                        wht:    parseImportNum(row[10]),
                        note:   row[11] ? String(row[11]).trim() : ''
                    });
                    continue;
                }

                if (!row[0] && !row[1]) continue;

                const dateVal   = row[0] ? normalizeDateToYYYYMMDD(String(row[0]).trim()) : '';
                const accountId = row[1] ? String(row[1]).trim() : '';
                const totalAmt  = parseImportNum(row[2]);
                const note      = row[3] ? String(row[3]).trim() : '';

                if (!dateVal || !accountId) continue;

                const detail = {
                    excelRow:    i + 1,
                    caption:     row[4] ? String(row[4]).trim() : '',
                    category_id: row[5] ? String(row[5]).trim() : '',
                    entity_id:   row[6] ? String(row[6]).trim() : '',
                    contact_id:  row[7] ? String(row[7]).trim() : '',
                    amount: parseImportNum(row[8]) || totalAmt,
                    fee:    parseImportNum(row[9]),
                    wht:    parseImportNum(row[10]),
                    note:   row[11] ? String(row[11]).trim() : ''
                };

                currentGroup = {
                    excelRow: i + 1,
                    transaction_id: generateTxId(dateVal, accountId, totalAmt, 'EXCEL', { note }),
                    date: dateVal, account_id: accountId,
                    total_amount: totalAmt, note,
                    details: [detail]
                };
                groups.push(currentGroup);
            }

            if (groups.length === 0) {
                alert("ไม่พบข้อมูลที่ถูกต้องในไฟล์ (ตรวจสอบ Date และ Account ID)");
                return;
            }

            // ── Step 2: Validate each group (balance check) ───────────────
            const fmt2 = (n) => {
                const abs = Math.abs(n).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
                return n < 0 ? `(${abs})` : abs;
            };

            const validationErrors = [];
            groups.forEach(g => {
                // Missing account check
                const accObj = (AppState.accounts||[]).find(a => a.account_id === g.account_id);
                if (!accObj) {
                    validationErrors.push(`แถว ${g.excelRow}: Account ID "${g.account_id}" ไม่พบในระบบ`);
                }

                // Balance check: Σ(amt - sign(amt)*(|fee|+|wht|)) must equal total_amount
                let subNetTotal = 0;
                g.details.forEach(d => {
                    const s = d.amount >= 0 ? 1 : -1;
                    subNetTotal += d.amount - s * (Math.abs(d.fee) + Math.abs(d.wht));
                });
                if (Math.abs(subNetTotal - g.total_amount) > 0.01) {
                    validationErrors.push(
                        `แถว ${g.excelRow} (${g.date}): ผลรวมรายการย่อย ${fmt2(subNetTotal)} ≠ Total Amount ${fmt2(g.total_amount)} (ต่างกัน ${fmt2(g.total_amount - subNetTotal)})`
                    );
                }

                // Date check
                if (!g.date) {
                    validationErrors.push(`แถว ${g.excelRow}: วันที่ไม่ถูกต้อง`);
                }
            });

            if (validationErrors.length > 0) {
                const maxShow = 8;
                const shown = validationErrors.slice(0, maxShow);
                const more = validationErrors.length > maxShow ? `\n...และอีก ${validationErrors.length - maxShow} รายการ` : '';
                const proceed = confirm(
                    `⚠️ พบข้อผิดพลาด ${validationErrors.length} รายการ:\n\n` +
                    shown.join('\n') + more +
                    `\n\nต้องการนำเข้าเฉพาะรายการที่ถูกต้องต่อไหม?`
                );
                if (!proceed) return;
            }

            // ── Step 3: Pre-check duplicates (check_only) — cancel ALL if any dup ──
            const dupErrors = [];
            const validGroups = groups.filter(g => !validationErrors.some(e => e.startsWith(`แถว ${g.excelRow}`)));

            for (const g of validGroups) {
                try {
                    const checkPayload = {
                        transaction_id: g.transaction_id,
                        date: g.date, account_id: g.account_id, total_amount: g.total_amount,
                        note: g.note, status: 'PENDING_REVIEW', source: 'WEB_GRID',
                        details: [{ amount: g.total_amount, fee: 0, wht: 0, type: g.total_amount >= 0 ? 'INCOME' : 'EXPENSE' }],
                        check_only: true
                    };
                    const checkResp = await fetch(`${API_BASE}/api/transactions`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(getUserIdHeader()) },
                        body: JSON.stringify(checkPayload)
                    });
                    const checkJson = await checkResp.json().catch(() => ({}));
                    if (checkJson.isDuplicate) {
                        dupErrors.push(
                            `แถว ${g.excelRow}: ซ้ำกับรายการที่มีอยู่ (${checkJson.date} | ${fmt2(checkJson.amount)} | สถานะ: ${checkJson.status})`
                        );
                    }
                } catch (_) { /* network error — let save phase handle */ }
            }

            if (dupErrors.length > 0) {
                alert(
                    `❌ พบรายการซ้ำ ${dupErrors.length} รายการ — ยกเลิกการนำเข้าทั้งหมด\n\n` +
                    dupErrors.slice(0, 10).join('\n') +
                    (dupErrors.length > 10 ? `\n...และอีก ${dupErrors.length - 10} รายการ` : '')
                );
                return;
            }

            // ── Step 4: Save all valid groups via API ──────────────────────
            let saved = 0, skipped = 0;
            const saveErrors = [];

            for (const g of validGroups) {
                try {
                    const payload = {
                        transaction_id: g.transaction_id,
                        date:         g.date,
                        account_id:   g.account_id,
                        total_amount: g.total_amount,
                        note:         g.note,
                        status:       'PENDING_REVIEW',
                        source:       'WEB_GRID',
                        details:      g.details.map(({ excelRow: _r, ...d }) => ({
                            ...d,
                            type: (d.amount || 0) >= 0 ? 'INCOME' : 'EXPENSE'
                        }))
                    };
                    const resp = await fetch(`${API_BASE}/api/transactions`, {
                        method:  'POST',
                        headers: { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(getUserIdHeader()) },
                        body:    JSON.stringify(payload)
                    });
                    if (resp.ok) {
                        saved++;
                    } else {
                        const errJson = await resp.json().catch(() => ({}));
                        saveErrors.push(`แถว ${g.excelRow}: ${errJson.error || `HTTP ${resp.status}`}`);
                        skipped++;
                    }
                } catch (ex) { saveErrors.push(`แถว ${g.excelRow}: ${ex.message}`); skipped++; }
            }

            // ── Step 5: Report & refresh ───────────────────────────────────
            const allIssues = [...validationErrors, ...saveErrors];
            if (allIssues.length > 0) {
                alert(
                    `นำเข้าสำเร็จ ${saved} รายการ / ข้ามไป ${skipped + (groups.length - validGroups.length)} รายการ\n\n` +
                    `รายการที่มีปัญหา:\n` + allIssues.slice(0, 10).join('\n')
                );
            } else {
                showToast(`✅ นำเข้าสำเร็จ ${saved} รายการ`);
            }

            // Refresh immediately — loadPending() fetches from API then re-renders
            await loadPending();
        } catch (err) {
            console.error(err);
            alert("เกิดข้อผิดพลาดในการอ่านไฟล์: " + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

// ==========================================
// 📦 BULK IMPORT LOGIC (20k+ rows)
// ==========================================
function bulkImportExcelFile(file, importStatus) {
    if (typeof XLSX === 'undefined') {
        alert("ไม่พบไลบรารีอ่านไฟล์ กรุณารีเฟรชหน้าเว็บ");
        return;
    }

    // Parse number: handles raw numbers, "1,234.56", "(1,234.56)" → -1234.56
    const parseNum = (v) => {
        if (v === undefined || v === null || v === '') return 0;
        if (typeof v === 'number') return v;
        const s = String(v).trim();
        const isNeg = s.startsWith('(') && s.endsWith(')');
        const clean = parseFloat(s.replace(/[(),\s]/g, ''));
        if (isNaN(clean)) return 0;
        return isNeg ? -Math.abs(clean) : clean;
    };

    // Show progress UI
    const showBulkProgress = (text, pct) => {
        let overlay = document.getElementById('bulk-import-overlay');
        if (!overlay) return;
        overlay.style.display = 'flex';
        const bar = document.getElementById('bulk-import-bar');
        const label = document.getElementById('bulk-import-label');
        if (bar) bar.style.width = pct + '%';
        if (label) label.textContent = text;
    };
    const hideBulkProgress = () => {
        const overlay = document.getElementById('bulk-import-overlay');
        if (overlay) overlay.style.display = 'none';
    };

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            showBulkProgress('กำลังอ่านไฟล์...', 2);
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            const targetSheet = workbook.SheetNames.find(n => n.includes('Import Template')) || workbook.SheetNames[0];
            const ws = workbook.Sheets[targetSheet];
            const json = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

            if (json.length <= 1) {
                hideBulkProgress();
                alert("ไม่พบข้อมูลในไฟล์");
                return;
            }

            showBulkProgress('กำลังแปลงข้อมูล...', 5);

            // ── Parse rows into groups ────────────────────────────────
            const groups = [];
            let currentGroup = null;

            for (let i = 1; i < json.length; i++) {
                const row = json[i];
                if (!row || row.length === 0) continue;

                const isSubRow = !row[0] && !row[1] && row[8] !== undefined && row[8] !== '';

                if (isSubRow && currentGroup) {
                    currentGroup.details.push({
                        caption:     row[4] ? String(row[4]).trim() : '',
                        category_id: row[5] ? String(row[5]).trim() : '',
                        entity_id:   row[6] ? String(row[6]).trim() : '',
                        contact_id:  row[7] ? String(row[7]).trim() : '',
                        amount: parseNum(row[8]),
                        fee:    parseNum(row[9]),
                        wht:    parseNum(row[10]),
                        note:   row[11] ? String(row[11]).trim() : ''
                    });
                    continue;
                }

                if (!row[0] && !row[1]) continue;

                const dateVal   = row[0] ? normalizeDateToYYYYMMDD(String(row[0]).trim()) : '';
                const accountId = row[1] ? String(row[1]).trim() : '';
                const totalAmt  = parseNum(row[2]);
                const note      = row[3] ? String(row[3]).trim() : '';

                if (!dateVal || !accountId) continue;

                const detail = {
                    caption:     row[4] ? String(row[4]).trim() : '',
                    category_id: row[5] ? String(row[5]).trim() : '',
                    entity_id:   row[6] ? String(row[6]).trim() : '',
                    contact_id:  row[7] ? String(row[7]).trim() : '',
                    amount: parseNum(row[8]) || totalAmt,
                    fee:    parseNum(row[9]),
                    wht:    parseNum(row[10]),
                    note:   row[11] ? String(row[11]).trim() : ''
                };

                currentGroup = {
                    excelRow: i + 1,
                    transaction_id: generateTxId(dateVal, accountId, totalAmt, 'EXCEL', { note }),
                    date: dateVal, account_id: accountId,
                    total_amount: totalAmt, note,
                    details: [detail]
                };
                groups.push(currentGroup);
            }

            if (groups.length === 0) {
                hideBulkProgress();
                alert("ไม่พบข้อมูลที่ถูกต้องในไฟล์");
                return;
            }

            // ── Validate (client side, no API calls) ──────────────────
            showBulkProgress(`กำลังตรวจสอบ ${groups.length.toLocaleString()} รายการ...`, 8);

            const validationErrors = [];
            const validGroups = [];

            groups.forEach(g => {
                const errs = [];
                if (!(AppState.accounts||[]).find(a => a.account_id === g.account_id)) {
                    errs.push(`Account ID "${g.account_id}" ไม่พบในระบบ`);
                }
                if (!g.date) errs.push('วันที่ไม่ถูกต้อง');

                // Balance check
                let subNet = 0;
                g.details.forEach(d => {
                    const s = d.amount >= 0 ? 1 : -1;
                    subNet += d.amount - s * (Math.abs(d.fee) + Math.abs(d.wht));
                });
                if (Math.abs(subNet - g.total_amount) > 0.01) {
                    errs.push(`ผลรวมย่อย ${subNet.toFixed(2)} ≠ Total ${g.total_amount.toFixed(2)}`);
                }

                if (errs.length > 0) {
                    validationErrors.push(`แถว ${g.excelRow}: ${errs.join(', ')}`);
                } else {
                    validGroups.push(g);
                }
            });

            if (validationErrors.length > 0) {
                const maxShow = 10;
                const msg = `⚠️ พบข้อผิดพลาด ${validationErrors.length} รายการ (ข้ามทั้งหมด):\n\n` +
                    validationErrors.slice(0, maxShow).join('\n') +
                    (validationErrors.length > maxShow ? `\n...และอีก ${validationErrors.length - maxShow} รายการ` : '') +
                    `\n\nต้องการนำเข้าเฉพาะ ${validGroups.length.toLocaleString()} รายการที่ถูกต้องต่อไหม?`;
                if (!confirm(msg)) {
                    hideBulkProgress();
                    return;
                }
            }

            if (validGroups.length === 0) {
                hideBulkProgress();
                alert("ไม่มีรายการที่ถูกต้องให้นำเข้า");
                return;
            }

            // ── Master Data Validation (warnings only — ยังนำเข้าได้) ───
            showBulkProgress('กำลังตรวจสอบ Master Data...', 9);

            // Build lookup sets from AppState
            const knownCategories = new Set((AppState.categories || []).map(c => c.category_id));
            const knownEntities   = new Set(
                ((AppState.settings && AppState.settings.entities) || AppState.entities || []).map(e => e.entity_id)
            );
            const knownContacts   = new Set((AppState.contacts || []).map(c => c.contact_id));

            // Track: missingId → { rows: [], count: 0 }
            const missingCatMap = new Map();
            const missingEntMap = new Map();
            const missingConMap = new Map();

            validGroups.forEach(g => {
                g.details.forEach(d => {
                    if (d.category_id && d.category_id !== 'Cat_Uncategorized' && !knownCategories.has(d.category_id)) {
                        if (!missingCatMap.has(d.category_id)) missingCatMap.set(d.category_id, { rows: [], count: 0 });
                        const entry = missingCatMap.get(d.category_id);
                        entry.count++;
                        if (entry.rows.length < 5) entry.rows.push(g.excelRow);
                    }
                    if (d.entity_id && !knownEntities.has(d.entity_id)) {
                        if (!missingEntMap.has(d.entity_id)) missingEntMap.set(d.entity_id, { rows: [], count: 0 });
                        const entry = missingEntMap.get(d.entity_id);
                        entry.count++;
                        if (entry.rows.length < 5) entry.rows.push(g.excelRow);
                    }
                    if (d.contact_id && !knownContacts.has(d.contact_id)) {
                        if (!missingConMap.has(d.contact_id)) missingConMap.set(d.contact_id, { rows: [], count: 0 });
                        const entry = missingConMap.get(d.contact_id);
                        entry.count++;
                        if (entry.rows.length < 5) entry.rows.push(g.excelRow);
                    }
                });
            });

            // Build warning lines for end-of-import report
            const masterDataWarnings = [];
            missingCatMap.forEach((v, id) => {
                masterDataWarnings.push(`  [Category] "${id}" ไม่พบ: ${v.count.toLocaleString()} รายการ (แถว ${v.rows.join(', ')}${v.count > 5 ? '...' : ''})`);
            });
            missingEntMap.forEach((v, id) => {
                masterDataWarnings.push(`  [Entity]   "${id}" ไม่พบ: ${v.count.toLocaleString()} รายการ (แถว ${v.rows.join(', ')}${v.count > 5 ? '...' : ''})`);
            });
            missingConMap.forEach((v, id) => {
                masterDataWarnings.push(`  [Contact]  "${id}" ไม่พบ: ${v.count.toLocaleString()} รายการ (แถว ${v.rows.join(', ')}${v.count > 5 ? '...' : ''})`);
            });
            // ── End Master Data Validation ───────────────────────────────

            // ── Send in chunks of 500 groups per API call ──────────────
            const CHUNK_SIZE = 500;
            const totalChunks = Math.ceil(validGroups.length / CHUNK_SIZE);
            let totalSaved = 0, totalErrors = 0;
            const allErrors = [];

            for (let ci = 0; ci < totalChunks; ci++) {
                const pct = Math.round(10 + (ci / totalChunks) * 85);
                showBulkProgress(
                    `กำลังส่ง batch ${ci + 1} / ${totalChunks} (${(ci * CHUNK_SIZE).toLocaleString()}–${Math.min((ci + 1) * CHUNK_SIZE, validGroups.length).toLocaleString()} จาก ${validGroups.length.toLocaleString()} รายการ)`,
                    pct
                );

                const chunk = validGroups.slice(ci * CHUNK_SIZE, (ci + 1) * CHUNK_SIZE);
                const payload = {
                    status: importStatus || 'PENDING_REVIEW',
                    transactions: chunk.map(g => ({
                        transaction_id: g.transaction_id,
                        account_id:     g.account_id,
                        date:           g.date,
                        total_amount:   g.total_amount,
                        statement_desc: g.note || null,
                        details: g.details.map(d => ({
                            category_id: d.category_id || 'Cat_Uncategorized',
                            entity_id:   d.entity_id   || null,
                            contact_id:  d.contact_id  || null,
                            amount: d.amount,
                            fee:    d.fee    || 0,
                            wht:    d.wht    || 0,
                            note:   d.note   || null,
                            type:   d.amount >= 0 ? 'INCOME' : 'EXPENSE'
                        }))
                    }))
                };

                try {
                    const resp = await fetch(`${API_BASE}/api/bulk-import`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(getUserIdHeader()) },
                        body: JSON.stringify(payload)
                    });
                    const json2 = await resp.json().catch(() => ({}));
                    if (resp.ok) {
                        totalSaved  += json2.saved  || 0;
                        totalErrors += (json2.errors || []).length;
                        allErrors.push(...(json2.errors || []).map(e => `${e.transaction_id}: ${e.error}`));
                    } else {
                        allErrors.push(`Batch ${ci + 1}: ${json2.error || `HTTP ${resp.status}`}`);
                        totalErrors += chunk.length;
                    }
                } catch (ex) {
                    allErrors.push(`Batch ${ci + 1}: ${ex.message}`);
                    totalErrors += chunk.length;
                }
            }

            showBulkProgress('เสร็จสิ้น!', 100);
            await loadPending();

            setTimeout(() => {
                hideBulkProgress();
                const totalFailed = totalErrors + validationErrors.length;
                let summary = `✅ Bulk Import เสร็จสิ้น\n\n` +
                    `นำเข้าสำเร็จ : ${totalSaved.toLocaleString()} รายการ\n` +
                    `ข้ามไป (Error): ${totalFailed.toLocaleString()} รายการ\n` +
                    `สถานะ         : ${importStatus === 'CONFIRMED' ? 'ยืนยันแล้ว' : 'รอตรวจสอบ'}`;

                if (allErrors.length > 0) {
                    summary += `\n\n❌ รายละเอียดข้อผิดพลาด:\n` +
                        allErrors.slice(0, 8).join('\n') +
                        (allErrors.length > 8 ? `\n...และอีก ${allErrors.length - 8} รายการ` : '');
                }

                if (masterDataWarnings.length > 0) {
                    const totalMissing = missingCatMap.size + missingEntMap.size + missingConMap.size;
                    summary += `\n\n⚠️ Master Data ไม่ตรง ${totalMissing} รายการ (ข้อมูลนำเข้าแล้ว แต่ field เหล่านี้ถูกตั้งเป็นค่าว่าง):\n` +
                        masterDataWarnings.slice(0, 12).join('\n') +
                        (masterDataWarnings.length > 12 ? `\n  ...และอีก ${masterDataWarnings.length - 12} รายการ` : '');
                }

                alert(summary);
            }, 300);

        } catch (err) {
            hideBulkProgress();
            console.error(err);
            alert("เกิดข้อผิดพลาดในการอ่านไฟล์: " + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

// opening_balance.js
function initOpeningBalance() {
    const btnLoad = document.getElementById('btn-load-ob-categories');
    const userSelect = document.getElementById('ob-user-select');
    const dateSelect = document.getElementById('ob-date-select');
    const container = document.getElementById('ob-accordion-container');
    const btnSave = document.getElementById('btn-save-opening-balance');

    if (!btnLoad || !userSelect || !dateSelect) return;

    // Set default date to today
    const tzoffset = (new Date()).getTimezoneOffset() * 60000; //offset in milliseconds
    const localISOTime = (new Date(Date.now() - tzoffset)).toISOString().slice(0, 10);
    dateSelect.value = localISOTime;

    // Load users (Members)
    userSelect.addEventListener('focus', () => {
        if (userSelect.options.length <= 1) {
            userSelect.innerHTML = '<option value="">-- เลือก Member --</option>';
            if (AppState.settings && AppState.settings.users && AppState.settings.users.length > 0) {
                // For Admins who can see all users
                AppState.settings.users.forEach(u => {
                    const opt = document.createElement('option');
                    opt.value = u.user_id;
                    opt.textContent = u.name || u.user_id;
                    userSelect.appendChild(opt);
                });
            } else {
                // For normal users, only themselves
                const opt = document.createElement('option');
                opt.value = AppState.userId;
                opt.textContent = AppState.userName || AppState.userId;
                userSelect.appendChild(opt);
            }
        }
    });

    // Auto-select current user by default
    setTimeout(() => {
        if (userSelect.options.length <= 1) {
            userSelect.innerHTML = `<option value="${AppState.userId}">${AppState.userName || AppState.userId}</option>`;
            userSelect.value = AppState.userId;
        }
    }, 500);

    // Handle load categories
    btnLoad.addEventListener('click', () => {
        if (!userSelect.value) {
            alert('กรุณาเลือกผู้ใช้งาน (Owner)');
            return;
        }
        if (!dateSelect.value) {
            alert('กรุณาเลือกวันที่');
            return;
        }
        
        container.style.display = 'flex';
        renderOpeningBalanceInputs();
    });

    // Calculate totals
    const calcTotals = () => {
        let totalAssets = 0;
        let totalLiabilities = 0;

        document.querySelectorAll('.ob-asset-input').forEach(input => {
            totalAssets += parseFloat(input.value) || 0;
        });

        document.querySelectorAll('.ob-liability-input').forEach(input => {
            totalLiabilities += parseFloat(input.value) || 0;
        });

        const diff = totalAssets - totalLiabilities;

        document.getElementById('ob-assets-total').textContent = formatCurrency(totalAssets);
        document.getElementById('ob-footer-assets').textContent = formatCurrency(totalAssets);
        
        document.getElementById('ob-liabilities-total').textContent = formatCurrency(totalLiabilities);
        document.getElementById('ob-footer-liabilities').textContent = formatCurrency(totalLiabilities);
        
        const diffEl = document.getElementById('ob-footer-diff');
        diffEl.textContent = formatCurrency(diff);
        
        if (diff > 0) {
            diffEl.style.color = 'var(--success-color)';
            diffEl.textContent += ' (กำไรสะสม / ทุน)';
        } else if (diff < 0) {
            diffEl.style.color = 'var(--danger-color)';
            diffEl.textContent += ' (ขาดทุนสะสม)';
        } else {
            diffEl.style.color = '#fff';
        }

        // Always allow save, even if 0, because it will just save what was inputted + the difference
        btnSave.disabled = false;
    };

    const createDynamicRow = (type, optionsHTML) => {
        const div = document.createElement('div');
        div.className = 'ob-row';
        div.style.display = 'flex';
        div.style.gap = '10px';
        div.style.alignItems = 'center';
        div.style.marginBottom = '5px';
        div.innerHTML = `
            <select class="form-control ob-item-select" style="flex: 2; height: 38px;">
                <option value="">-- เลือกรายการ --</option>
                ${optionsHTML}
            </select>
            <input type="number" class="form-control ${type === 'asset' ? 'ob-asset-input' : 'ob-liability-input'}" 
                step="0.01" placeholder="0.00" style="flex: 1; height: 38px;" oninput="window.calcOBTotals()">
            <button class="btn btn-sm btn-outline-danger" style="height: 38px; width: 38px; padding: 0; display: flex; align-items: center; justify-content: center; flex-shrink: 0;" onclick="this.parentElement.remove(); window.calcOBTotals();"><i class="fa-solid fa-trash"></i></button>
        `;
        return div;
    };

    window.calcOBTotals = calcTotals;

    let assetOptionsHTML = '';
    let liabilityOptionsHTML = '';

    function renderOpeningBalanceInputs() {
        const assetsRows = document.getElementById('ob-assets-rows');
        const liabilitiesRows = document.getElementById('ob-liabilities-rows');
        
        assetsRows.innerHTML = '';
        liabilitiesRows.innerHTML = '';
        
        let accountsHTML = '';
        if (AppState.settings.accounts) {
            AppState.settings.accounts.forEach(acc => {
                accountsHTML += `<option value="account_\${acc.account_id}" data-source="account" data-id="\${acc.account_id}" data-name="\${acc.name}">💳 \${acc.name}</option>`;
            });
        }
        
        let assetCatsHTML = '';
        let liabCatsHTML = '';
        if (AppState.settings.categories && AppState.settings.captions) {
            const captionsMap = {}, subBehaviorMap = {};
            AppState.settings.captions.forEach(c => {
                captionsMap[c.type_id] = c.behavior;
                subBehaviorMap[c.type_id] = c.sub_behavior || null;
            });

            AppState.settings.categories.forEach(cat => {
                const behavior = captionsMap[cat.category_type];
                // เงินลงทุนไม่ใช่หมวดหนี้สิน — ไม่แสดงในตัวเลือกทะเบียนลูกหนี้/เจ้าหนี้
                if (subBehaviorMap[cat.category_type] === 'INVESTMENT') return;
                if (behavior === 'ASSET' || behavior === 'REVENUE') {
                    assetCatsHTML += `<option value="category_\${cat.category_id}" data-source="category" data-id="\${cat.category_id}" data-name="\${cat.name}">📈 \${cat.name}</option>`;
                } else if (behavior === 'LIABILITY' || behavior === 'EXPENSE') {
                    liabCatsHTML += `<option value="category_\${cat.category_id}" data-source="category" data-id="\${cat.category_id}" data-name="\${cat.name}">📉 \${cat.name}</option>`;
                }
            });
        }

        assetOptionsHTML = '';
        if (accountsHTML) assetOptionsHTML += `<optgroup label="Statements / Accounts">\${accountsHTML}</optgroup>`;
        if (assetCatsHTML) assetOptionsHTML += `<optgroup label="Asset Categories">\${assetCatsHTML}</optgroup>`;

        liabilityOptionsHTML = '';
        if (liabCatsHTML) liabilityOptionsHTML += `<optgroup label="Liability Categories">\${liabCatsHTML}</optgroup>`;
        
        document.getElementById('btn-add-asset-row').onclick = () => {
            assetsRows.appendChild(createDynamicRow('asset', assetOptionsHTML));
        };
        
        document.getElementById('btn-add-liability-row').onclick = () => {
            liabilitiesRows.appendChild(createDynamicRow('liability', liabilityOptionsHTML));
        };

        if (assetsRows.children.length === 0) {
            assetsRows.appendChild(createDynamicRow('asset', assetOptionsHTML));
        }
        if (liabilitiesRows.children.length === 0) {
            liabilitiesRows.appendChild(createDynamicRow('liability', liabilityOptionsHTML));
        }
        
        calcTotals();
    }

    btnSave.addEventListener('click', async () => {
        const selectedUserId = userSelect.value;
        const dateVal = dateSelect.value;
        
        if (!selectedUserId || !dateVal) return;

        const defaultEntityId = (AppState.settings && AppState.settings.entities && AppState.settings.entities.length > 0) 
                                ? AppState.settings.entities[0].entity_id : null;

        btnSave.disabled = true;
        btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';

        const promises = [];
        let totalAssets = 0;
        let totalLiabilities = 0;
        
        // Collect all inputs that have a value
        document.querySelectorAll('.ob-asset-input, .ob-liability-input').forEach(input => {
            const val = parseFloat(input.value);
            if (val && val !== 0) {
                const row = input.closest('.ob-row');
                const select = row.querySelector('.ob-item-select');
                if (!select.value) return; // Skip if no option selected

                const option = select.options[select.selectedIndex];
                const isAsset = input.classList.contains('ob-asset-input');
                const source = option.dataset.source;
                const id = option.dataset.id;
                const name = option.dataset.name;
                
                if (isAsset) totalAssets += val;
                else totalLiabilities += val;

                const payload = {
                    account_id: source === 'account' ? id : null,
                    date: dateVal,
                    time: '00:00:00',
                    statement_desc: 'Opening Balance',
                    total_amount: Math.abs(val),
                    ref_code: 'OB_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
                    status: 'CONFIRMED',
                    source: 'WEB_GRID',
                    details: [{
                        amount: Math.abs(val),
                        fee: 0,
                        wht: 0,
                        category_id: source === 'category' ? id : null,
                        contact_id: null,
                        entity_id: defaultEntityId,
                        user_id: selectedUserId,
                        note: 'Opening Balance - ' + name,
                        type: isAsset ? 'INCOME' : 'EXPENSE'
                    }]
                };

                promises.push(
                    fetch(`${API_BASE}/api/transactions`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(selectedUserId) },
                        body: JSON.stringify(payload)
                    })
                );
            }
        });

        // Add balancing entry (Open Balance) if diff != 0
        const diff = totalAssets - totalLiabilities;
        if (diff !== 0) {
            // If diff > 0 (Assets > Liab), we need a Liability/Equity entry to balance (type: EXPENSE side in a way, or INCOME on Equity)
            // In double entry, Assets = Liab + Equity. So Equity = Assets - Liab.
            // A positive equity is a credit balance. We'll record it as INCOME to an "Open Balance" category or without category.
            const payload = {
                account_id: null,
                date: dateVal,
                time: '00:00:00',
                statement_desc: 'Opening Balance (Balancing)',
                total_amount: Math.abs(diff),
                ref_code: 'OB_BAL_' + Date.now(),
                status: 'CONFIRMED',
                source: 'WEB_GRID',
                details: [{
                    amount: Math.abs(diff),
                    fee: 0,
                    wht: 0,
                    category_id: null, // No category, just use note
                    contact_id: null,
                    entity_id: defaultEntityId,
                    user_id: selectedUserId,
                    note: 'Open Balance (ทุนยกมา)',
                    type: diff > 0 ? 'INCOME' : 'EXPENSE'
                }]
            };

            promises.push(
                fetch(`${API_BASE}/api/transactions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(selectedUserId) },
                    body: JSON.stringify(payload)
                })
            );
        }

        try {
            await Promise.all(promises);
            alert("✅ บันทึกยอดยกมาเรียบร้อยแล้ว");
            document.getElementById('ob-accordion-container').style.display = 'none';
        } catch (err) {
            console.error(err);
            alert("❌ เกิดข้อผิดพลาดในการบันทึก");
        } finally {
            btnSave.innerHTML = '<i class="fa-solid fa-save"></i> บันทึกยอดยกมา';
            btnSave.disabled = false;
        }
    });
}

// Hook it up after settings load




document.addEventListener('DOMContentLoaded', () => {
    // Add a small delay to ensure DOM is ready
    setTimeout(initOpeningBalance, 1000);
});



// ── DEBTS MANAGEMENT LOGIC ──

async function fetchDebts() {
    try {
        const res = await fetch(`${API_BASE}/api/debts`, { headers: { 'x-user-id': encodeURIComponent(getUserIdHeader()) } });
        if (res.ok) {
            AppState.debts = await res.json();
        }
    } catch (e) {
        console.error("Error fetching debts", e);
    }
}

async function renderDebtsSettings() {
    await fetchDebts();
    const tbody = document.getElementById("settings-debts-body");
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (!AppState.debts || AppState.debts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">ไม่มีข้อมูลโปรไฟล์หนี้สิน</td></tr>';
        return;
    }
    
    AppState.debts.forEach(d => {
        const tr = document.createElement("tr");
        let debtMembers = [];
        try { debtMembers = d.members ? JSON.parse(d.members) : []; } catch {}
        const debtOwnerBadge = (Array.isArray(debtMembers) && debtMembers.length > 0)
            ? debtMembers.map(uid => {
                const u = (AppState.settings?.users || []).find(x => x.user_id === uid);
                return `<span style="display:inline-block;margin-left:4px;padding:1px 7px;border-radius:10px;background:#FEF3C7;color:#92400E;font-size:0.7rem;font-weight:700;">🔒 ${u ? u.name : uid}</span>`;
              }).join('')
            : `<span style="display:inline-block;margin-left:6px;padding:1px 7px;border-radius:10px;background:#DBEAFE;color:#1D4ED8;font-size:0.7rem;font-weight:700;">🔗 ร่วมกัน</span>`;
        tr.innerHTML = `
            <td>${d.name}${debtOwnerBadge}</td>
            <td><span class="badge ${d.type === 'PAYABLE' ? 'bg-danger' : 'bg-success'}">${d.type === 'PAYABLE' ? 'หนี้ที่ต้องจ่าย' : 'เงินให้กู้ยืม'}</span></td>
            <td>${formatCurrency(d.start_balance)}</td>
            <td>${d.installment_amount ? formatCurrency(d.installment_amount) : '-'}</td>
            <td>
                <button class="btn btn-sm btn-outline" onclick=\"showDebtModal('${d.debt_id}')\"><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-sm btn-danger" onclick=\"deleteDebtProfile('${d.debt_id}')\"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function showDebtModal(id = null) {
    document.getElementById('debt-modal').classList.remove('hidden');
    setTimeout(() => { document.getElementById('icon-grid')?.focus(); }, 100);
    
    // Populate members checkboxes for debt
    const debtMembersContainer = document.getElementById('debt-members-checkboxes');
    if (debtMembersContainer) {
        debtMembersContainer.innerHTML = '';
        (AppState.settings?.users || []).forEach(u => {
            debtMembersContainer.innerHTML += `
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.85rem;color:#334155;">
                    <input type="checkbox" class="debt-member-checkbox" value="${u.user_id}" style="width:15px;height:15px;cursor:pointer;">
                    ${u.name}
                </label>
            `;
        });
    }

    // Populate dropdowns
    const contactSel = document.getElementById('debt-contact');
    let contactHtml = '<option value="">-- ไม่ระบุ --</option>';
    AppState.contacts.forEach(c => {
        contactHtml += `<option value="${c.contact_id}">${c.name}</option>`;
    });
    contactSel.innerHTML = contactHtml;
    
    const prinSel = document.getElementById('debt-principal-category');
    const intSel = document.getElementById('debt-interest-category');
    let prinHtml = '<option value="">-- ไม่ระบุ --</option>';
    let intHtml = '<option value="">-- ไม่ระบุ --</option>';
    
    AppState.categories.forEach(c => {
        const opt = `<option value="${c.category_id}">${c.name}</option>`;
        prinHtml += opt;
        intHtml += opt;
    });
    prinSel.innerHTML = prinHtml;
    intSel.innerHTML = intHtml;

    if (id) {
        const d = AppState.debts.find(x => x.debt_id === id || x.id === id);
        document.getElementById('debt-id').value = d.debt_id || d.id;
        document.getElementById('debt-type').value = d.type;
        document.getElementById('debt-name').value = d.name;
        document.getElementById('debt-contact').value = d.contact_id || '';
        document.getElementById('debt-start-balance').value = formatCurrency(d.start_balance);
        document.getElementById('debt-installment').value = d.installment_amount ? formatCurrency(d.installment_amount) : '';
        document.getElementById('debt-start-date').value = d.start_date || '';
        document.getElementById('debt-principal-category').value = d.principal_category_id || '';
        document.getElementById('debt-interest-category').value = d.interest_category_id || '';
        // Pre-check existing members
        let existingDebtMembers = [];
        try { existingDebtMembers = d.members ? JSON.parse(d.members) : []; } catch {}
        if (debtMembersContainer) {
            debtMembersContainer.querySelectorAll('.debt-member-checkbox').forEach(chk => {
                chk.checked = existingDebtMembers.includes(chk.value);
            });
        }
        
        let foundTab = 'zodiac';
        for(let tab in ICON_SETS) {
            if(ICON_SETS[tab].includes(d.icon_type)) {
                foundTab = tab;
                break;
            }
        }
        selectedIcon = d.icon_type || 'zodiac_1.png';
        document.getElementById('debt-icon-type').value = selectedIcon;
        switchIconTab(foundTab);
    } else {
        document.getElementById('debt-form').reset();
        document.getElementById('debt-id').value = '';
        selectedIcon = 'zodiac_1.png';
        document.getElementById('debt-icon-type').value = selectedIcon;
        switchIconTab('zodiac');
    }
}

function closeDebtModal() {
    document.getElementById('debt-modal').classList.add('hidden');
}

async function saveDebtProfile(e) {
    e.preventDefault();
    const id = document.getElementById('debt-id').value;
    const payload = {
        debt_id: id || null,
        type: document.getElementById('debt-type').value,
        name: document.getElementById('debt-name').value,
        contact_id: document.getElementById('debt-contact').value || null,
        start_balance: parseFormattedNum(document.getElementById('debt-start-balance').value),
        installment_amount: document.getElementById('debt-installment').value ? parseFormattedNum(document.getElementById('debt-installment').value) : null,
        start_date: document.getElementById('debt-start-date').value || null,
        principal_category_id: document.getElementById('debt-principal-category').value || null,
        interest_category_id: document.getElementById('debt-interest-category').value || null,
        icon_type: document.getElementById('debt-icon-type').value || 'zodiac_1.png',
        debt_members: (() => {
            const checked = document.querySelectorAll('.debt-member-checkbox:checked');
            return checked.length > 0 ? Array.from(checked).map(c => c.value) : null;
        })()
    };

    try {
        const res = await fetch(`${API_BASE}/api/debts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(getUserIdHeader()) },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            closeDebtModal();
            await renderDebtsSettings();
            alert("บันทึกสำเร็จ");
        } else {
            alert("เกิดข้อผิดพลาด");
        }
    } catch (err) {
        console.error(err);
        alert("Error saving debt");
    }
}

async function deleteDebtProfile(id) {
    if (!confirm("คุณต้องการลบโปรไฟล์หนี้นี้ใช่หรือไม่?")) return;
    try {
        const res = await fetch(`${API_BASE}/api/debts/${id}`, {
            method: 'DELETE',
            headers: { 'x-user-id': encodeURIComponent(getUserIdHeader()) }
        });
        if (res.ok) {
            await renderDebtsSettings();
        }
    } catch(e) {
        console.error(e);
    }
}

let currentDebtTab = 'RECEIVABLE';
function switchDebtTab(tab) {
    currentDebtTab = tab;
    const tabRec = document.getElementById('tab-receivable');
    const tabPay = document.getElementById('tab-payable');
    
    if (tabRec && tabPay) {
        tabRec.style.background = 'transparent';
        tabRec.style.color = '#64748b';
        tabRec.style.border = '1px solid #cbd5e1';
        tabRec.style.boxShadow = 'none';
        tabRec.style.fontWeight = 'normal';
        
        tabPay.style.background = 'transparent';
        tabPay.style.color = '#64748b';
        tabPay.style.border = '1px solid #cbd5e1';
        tabPay.style.boxShadow = 'none';
        tabPay.style.fontWeight = 'normal';
        
        if(tab === 'RECEIVABLE') {
            tabRec.style.background = 'linear-gradient(135deg, #10b981, #34d399)';
            tabRec.style.color = 'white';
            tabRec.style.border = 'none';
            tabRec.style.boxShadow = '0 4px 6px rgba(16, 185, 129, 0.3)';
            tabRec.style.fontWeight = 'bold';
        } else {
            tabPay.style.background = 'linear-gradient(135deg, #f43f5e, #fb7185)';
            tabPay.style.color = 'white';
            tabPay.style.border = 'none';
            tabPay.style.boxShadow = '0 4px 6px rgba(244, 63, 94, 0.3)';
            tabPay.style.fontWeight = 'bold';
        }
    }
    renderDebtsDashboard();
}



window.fetchTransactions = async function() {
    try {
        const res = await fetch(`${API_BASE}/api/transactions?status=CONFIRMED`, { headers: { 'x-user-id': encodeURIComponent(getUserIdHeader()) } });
        if (res.ok) {
            AppState.transactions = await res.json();
        }
    } catch (e) {
        console.error("Error fetching transactions", e);
    }
};

window.getDebtTransactions = function(debt) {
    if (!AppState.transactions) return [];
    let txs = [];
    AppState.transactions.forEach(tx => {
        let principal = 0;
        let interest = 0;
        let involved = false;
        
        if (tx.details) {
            tx.details.forEach(det => {
                if (det.contact_id == debt.contact_id) {
                    if (debt.principal_category_id && det.category_id == debt.principal_category_id) {
                        principal += Number(det.amount || 0);
                        involved = true;
                    }
                    if (debt.interest_category_id && det.category_id == debt.interest_category_id) {
                        interest += Number(det.amount || 0);
                        involved = true;
                    }
                }
            });
        }
        if (involved) {
            let accountName = '-';
            if (tx.account_id && AppState.accounts) {
                const acc = AppState.accounts.find(a => a.account_id == tx.account_id);
                if (acc) accountName = acc.name;
            }
            
            txs.push({
                date: tx.date,
                statement_desc: accountName,
                principal: principal,
                interest: interest
            });
        }
    });
    return txs;
};

async function renderDebtsDashboard() {
    const listContainer = document.getElementById('debts-sidebar-list');
    if (!listContainer) return;
    
    // Filter by tab
    const filtered = AppState.debts.filter(d => d.type === currentDebtTab && d.status === 'active');
    
    let totalStartBalance = 0;
    let totalPaidOverall = 0;
    
    listContainer.innerHTML = filtered.map(debt => {
        const contact = (AppState.contacts || []).find(c => c.contact_id === debt.contact_id);
        const icon = debt.icon_type || 'zodiac_1.png';
        
        let innerIcon = '';
        let bgColor = '#a2d2ff'; // default blue
        
        if (icon.endsWith('.png')) {
            innerIcon = `<img src="/assets/icons/${icon}" style="width: 100%; height: 100%; border-radius: 12px; object-fit: contain;">`;
            bgColor = 'transparent';
        } else {
            let iconHtml = '';
            if(icon === 'car') { iconHtml = 'fa-car'; bgColor = '#ffb5a7'; }
            else if(icon === 'house') { iconHtml = 'fa-house'; bgColor = '#bde0fe'; }
            else if(icon === 'personal') { iconHtml = 'fa-sack-dollar'; bgColor = '#ffd6a5'; }
            else if(icon === 'student') { iconHtml = 'fa-graduation-cap'; bgColor = '#caffbf'; }
            else { iconHtml = 'fa-credit-card'; bgColor = '#a2d2ff'; }
            innerIcon = `<i class="fa-solid ${iconHtml}" style="color: #1e293b; font-size: 1.2rem;"></i>`;
        }
        
        const txs = window.getDebtTransactions(debt);
        const paidAmount = txs.reduce((sum, t) => sum + (t.principal || 0), 0);
        const balance = debt.start_balance - paidAmount;
        
        totalStartBalance += debt.start_balance;
        totalPaidOverall += paidAmount;
        
        let progressPct = debt.start_balance > 0 ? (paidAmount / debt.start_balance) * 100 : 0;
        if(progressPct > 100) progressPct = 100;

        const barGradient = currentDebtTab === 'RECEIVABLE' ? '#34d399, #10b981' : '#fb7185, #f43f5e';
        const cardBg = currentDebtTab === 'RECEIVABLE' ? 'linear-gradient(135deg, #f0fdfa, #ffffff)' : 'linear-gradient(135deg, #fff1f2, #ffffff)';
        const cardBorder = currentDebtTab === 'RECEIVABLE' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(244, 63, 94, 0.3)';

        return `
            <div class="debt-card neumorph-card" onclick="viewDebtDetails('${(debt.debt_id || debt.id)}')" style="cursor: pointer; padding: 8px 12px; border-radius: 15px; background: ${cardBg}; display: flex; align-items: center; justify-content: space-between; transition: all 0.2s; border: ${cardBorder}; margin-bottom: 4px; box-shadow: 0 4px 10px rgba(0,0,0,0.04);">
                <div style="display: flex; gap: 12px; align-items: flex-start; width: 100%;">
                    <div style="width: 42px; height: 42px; border-radius: 12px; background: ${bgColor}; display: flex; align-items: center; justify-content: center; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1), inset 0 2px 4px rgba(255,255,255,0.5); margin-top: 2px;">
                        ${innerIcon}
                    </div>
                    <div style="flex: 1;">
                        <div style="display: flex; justify-content: space-between;">
                            <h4 style="margin: 0; color: #1e293b; font-size: 0.95rem; font-weight: 700;">${debt.name}</h4>
                            <span style="font-weight: 700; color: #3b82f6;">${formatCurrency(balance)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-top: 2px;">
                            <span style="color: #64748b; font-weight: 500;">${contact ? contact.name : 'Unknown'}</span>
                            <span style="color: #10b981; font-weight: 600;"><i class="fa-solid fa-check"></i> ${debt.status}</span>
                        </div>
                        <div style="margin-top: 8px; width: 100%; height: 8px; background: rgba(226, 232, 240, 0.7); border-radius: 4px; overflow: hidden; position: relative; box-shadow: inset 0 1px 2px rgba(0,0,0,0.05); border: 1px solid rgba(255,255,255,0.6);">
                            <div style="width: ${progressPct}%; height: 100%; background: linear-gradient(90deg, ${barGradient}); border-radius: 4px; position: relative; overflow: hidden;">
                                <div style="position: absolute; top: 0; left: 0; width: 100%; height: 50%; background: linear-gradient(180deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 100%);"></div>
                            </div>
                        </div>
                        <div style="font-size: 0.75rem; color: ${currentDebtTab === 'RECEIVABLE' ? '#10b981' : '#f43f5e'}; text-align: right; margin-top: 4px; font-weight: 800; text-shadow: 0 1px 2px rgba(255,255,255,0.8);">${progressPct.toFixed(0)}% Paid</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (filtered.length === 0) {
        listContainer.innerHTML = `<div style="text-align:center; padding: 20px; color: #94a3b8; font-weight: 500;">ไม่มีข้อมูล</div>`;
    }
    
    // Update Summary Chart
    const summaryChart = document.getElementById('debt-summary-chart');
    if (summaryChart) {
        let paidPct = totalStartBalance > 0 ? (totalPaidOverall / totalStartBalance) * 100 : 0;
        let remPct = 100 - paidPct;
        
        let primaryColor = currentDebtTab === 'RECEIVABLE' ? '#10b981' : '#f43f5e';
        let secondaryColor = currentDebtTab === 'RECEIVABLE' ? '#d1fae5' : '#ffe4e6';
        let gradientStr = `conic-gradient(${primaryColor} 0% ${paidPct}%, ${secondaryColor} ${paidPct}% 100%)`;
        
        summaryChart.innerHTML = `
            <h4 style="margin: 0 0 10px 0; color: #1e293b; font-size: 1rem; font-weight: 700;">Summary</h4>
            <div style="display: flex; align-items: center; gap: 20px;">
                <div style="position: relative; width: 75px; height: 75px; border-radius: 50%; background: ${gradientStr}; box-shadow: 0 4px 10px rgba(0,0,0,0.1), inset 0 2px 4px rgba(255,255,255,0.8);">
                    <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; border-radius: 50%; background: linear-gradient(135deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 50%, rgba(255,255,255,0.1) 100%); pointer-events: none;"></div>
                    <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 45px; height: 45px; border-radius: 50%; background: #f8fafc; box-shadow: inset 0 2px 4px rgba(0,0,0,0.1), 0 2px 4px rgba(255,255,255,0.8); display: flex; align-items: center; justify-content: center;"></div>
                </div>
                <div style="font-size: 0.85rem; color: #475569; font-weight: 600;">
                    <div style="margin-bottom: 8px; display: flex; align-items: center;"><span style="display:inline-block; width:12px; height:12px; background:${primaryColor}; border-radius:50%; margin-right:8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"></span> จ่ายแล้ว ${formatCurrency(totalPaidOverall)}</div>
                    <div style="display: flex; align-items: center;"><span style="display:inline-block; width:12px; height:12px; background:${secondaryColor}; border-radius:50%; margin-right:8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border: 1px solid #cbd5e1;"></span> คงเหลือ ${formatCurrency(totalStartBalance - totalPaidOverall)}</div>
                </div>
            </div>
        `;
    }
}

async function viewDebtDetails(debtId) {
    const debt = AppState.debts.find(d => d.debt_id === debtId || d.id === debtId);
    if (!debt) return;
    
    document.getElementById('debt-empty-state').style.display = 'none';
    const panel = document.getElementById('debt-details-panel');
    panel.style.display = 'block';
    
    const contact = (AppState.contacts || []).find(c => c.contact_id === debt.contact_id);
    const txs = window.getDebtTransactions(debt);
    
    // Sort transactions by date descending
    txs.sort((a,b) => new Date(b.date) - new Date(a.date));
    
    const allPaidPrincipal = txs.reduce((sum, t) => sum + (t.principal || 0), 0);
    const paidPrincipal = allPaidPrincipal;
    const paidInterest = txs.reduce((sum, t) => sum + (t.interest || 0), 0);
    const totalAmount = paidPrincipal + paidInterest;
    const balance = debt.start_balance - allPaidPrincipal;
    
    // Get unique years for filter
    const years = [...new Set(txs.map(t => t.date.substring(0,4)))].sort((a,b) => b - a);
    const yearOptions = years.map(y => `<option value="${y}">${y}</option>`).join('');

    let txRows = txs.map(t => `
        <tr class="tx-row" data-year="${t.date.substring(0,4)}">
            <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; color: #1e293b; font-weight: 500;">${t.date}</td>
            <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; color: #3b82f6;">${t.statement_desc || '-'}</td>
            <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #0f172a; font-weight: 600;">${formatCurrency((t.principal||0) + (t.interest||0))}</td>
            <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; color: #10b981; text-align: right; font-weight: 500;">${formatCurrency(t.principal || 0)}</td>
            <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; color: #f59e0b; text-align: right; font-weight: 500;">${formatCurrency(t.interest || 0)}</td>
            <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; color: #22c55e; text-align: center;"><i class="fa-solid fa-circle-check"></i></td>
        </tr>
    `).join('');
    
    if(txs.length === 0) {
        txRows = `<tr><td colspan="6" style="text-align:center; padding: 15px; color: #94a3b8;">No payment history</td></tr>`;
    }
    
    const iconType = debt.icon_type || 'zodiac_1.png';
    let innerIcon = '';
    let bgColor = '#a2d2ff';
    let iconHtml = 'fa-credit-card'; // Fallback so it is always defined
    if (iconType.endsWith('.png')) {
        innerIcon = `<img src="/assets/icons/${iconType}" style="width: 100%; height: 100%; border-radius: 16px; object-fit: contain;">`;
        bgColor = 'transparent';
    } else {
        if(iconType === 'car') { iconHtml = 'fa-car'; bgColor = '#ffb5a7'; }
        else if(iconType === 'house') { iconHtml = 'fa-house'; bgColor = '#bde0fe'; }
        else if(iconType === 'personal') { iconHtml = 'fa-sack-dollar'; bgColor = '#ffd6a5'; }
        else if(iconType === 'student') { iconHtml = 'fa-graduation-cap'; bgColor = '#caffbf'; }
        innerIcon = `<i class="fa-solid ${iconHtml}" style="color: #1e293b; font-size: 2rem;"></i>`;
    }

    let headerIconHtml = '';
    if (iconType.endsWith('.png')) {
        headerIconHtml = `<div style="width: 38px; height: 38px; border-radius: 10px; overflow: hidden; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; background: rgba(255,255,255,0.8); border: 1px solid rgba(226,232,240,0.8); box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-right: 4px;">
            <img src="/assets/icons/${iconType}" style="width: 100%; height: 100%; object-fit: contain;">
        </div>`;
    } else {
        headerIconHtml = `<i class="fa-solid ${iconHtml}" style="color: #3b82f6; -webkit-text-fill-color: initial;"></i>`;
    }

    panel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
            <div>
                <h2 style="margin: 0; font-weight: bold; font-size: 1.6rem; display: flex; align-items: center; gap: 8px;">
                    ${headerIconHtml}
                    <span style="background: linear-gradient(90deg, #3b82f6, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${debt.name}</span>
                </h2>
                <div style="color: #f472b6; margin-top: 5px; font-weight: 600; font-size: 1.0rem;"><i class="fa-solid fa-user"></i> ${contact ? contact.name : 'Unknown'}</div>
            </div>
            <!-- Removed Edit button -->
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; margin-bottom: 20px;">
            <div style="background: #ffffff; padding: 12px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <div style="font-size: 0.8rem; color: #64748b; margin-bottom: 4px; font-weight: 500;">Remaining Balance</div>
                <div id="summary-balance" style="font-size: 1.25rem; font-weight: 700; color: #3b82f6;">${formatCurrency(balance)}</div>
            </div>
            <div style="background: #ffffff; padding: 12px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <div style="font-size: 0.8rem; color: #64748b; margin-bottom: 4px; font-weight: 500;">Principal</div>
                <div id="summary-principal" style="font-size: 1.25rem; font-weight: 700; color: #10b981;">${formatCurrency(paidPrincipal)}</div>
            </div>
            <div style="background: #ffffff; padding: 12px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <div style="font-size: 0.8rem; color: #64748b; margin-bottom: 4px; font-weight: 500;">Interest</div>
                <div id="summary-interest" style="font-size: 1.25rem; font-weight: 700; color: #f59e0b;">${formatCurrency(paidInterest)}</div>
            </div>
            <div style="background: #ffffff; padding: 12px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <div style="font-size: 0.8rem; color: #64748b; margin-bottom: 4px; font-weight: 500;">Total Amount</div>
                <div id="summary-total" style="font-size: 1.25rem; font-weight: 700; color: #8b5cf6;">${formatCurrency(totalAmount)}</div>
            </div>
        </div>
        
        <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <h4 style="margin:0; font-weight: 700; font-size: 1.05rem; color: #ec4899;"><i class="fa-solid fa-clock-rotate-left"></i> PAYMENT HISTORY</h4>
                <select id="year-filter" data-debt-id="${debt.debt_id || debt.id}" onchange="filterDebtHistory()" style="padding: 4px 10px; border-radius: 6px; border: 1px solid #cbd5e1; background: #f8fafc; color: #0f172a; font-weight: 500; outline: none; cursor: pointer; font-size: 0.9rem;">
                    <option value="ALL">All Years</option>
                    ${yearOptions}
                </select>
            </div>
            <div style="background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
                    <thead>
                        <tr style="background: #f8fafc; color: #475569; text-align: left; border-bottom: 2px solid #e2e8f0;">
                            <th style="padding: 8px 10px; width: 15%; font-weight: 600;">Date</th>
                            <th style="padding: 8px 10px; width: 30%; font-weight: 600;">Statement</th>
                            <th style="padding: 8px 10px; width: 15%; text-align: right; font-weight: 600;">Amount</th>
                            <th style="padding: 8px 10px; width: 15%; text-align: right; font-weight: 600;">Principal</th>
                            <th style="padding: 8px 10px; width: 15%; text-align: right; font-weight: 600;">Interest</th>
                            <th style="padding: 8px 10px; width: 10%; text-align: center; font-weight: 600;">Status</th>
                        </tr>
                    </thead>
                    <tbody id="debt-tx-tbody">
                        ${txRows}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

window.prefillDebtTransaction = function(debtId) {
    const d = AppState.debts.find(x => x.id === debtId || x.debt_id === debtId);
    if(!d) return;
    
    // Setup Draft
    AppState.draftHistoryTx = {
        tx_id: null,
        date: new Date().toISOString().split('T')[0],
        total_amount: 0,
        account_name: '',
        details: []
    };
    
    // Push principal row
    if (d.principal_category_id) {
        AppState.draftHistoryTx.details.push({
            detail_id: 'new-' + Date.now() + 1,
            behavior: d.type === 'PAYABLE' ? 'EXPENSE' : 'INCOME',
            contact_id: d.contact_id,
            entity_id: null,
            caption_id: d.principal_category_id,
            fee: d.installment_amount ? d.installment_amount * 0.8 : 0, // Mock 80% principal
            wht: 0,
            vat: 0
        });
    }
    
    // Push interest row
    if (d.interest_category_id) {
        AppState.draftHistoryTx.details.push({
            detail_id: 'new-' + Date.now() + 2,
            behavior: d.type === 'PAYABLE' ? 'EXPENSE' : 'INCOME',
            contact_id: d.contact_id,
            entity_id: null,
            caption_id: d.interest_category_id,
            fee: d.installment_amount ? d.installment_amount * 0.2 : 0, // Mock 20% interest
            wht: 0,
            vat: 0
        });
    }
    
    // Calculate total
    AppState.draftHistoryTx.total_amount = AppState.draftHistoryTx.details.reduce((acc, curr) => acc + curr.fee, 0);
    
    // Open standard modal
    AppState.editingDetailIds.clear();
    AppState.draftHistoryTx.details.forEach(dx => AppState.editingDetailIds.add(dx.detail_id));
    openTxModal(); // Standard modal from app.js
};

window.filterDebtHistory = function() {
    const year = document.getElementById('year-filter').value;
    const debtId = document.getElementById('year-filter').getAttribute('data-debt-id');
    const debt = AppState.debts.find(d => d.debt_id === debtId || d.id === debtId);
    
    if (debt) {
        const txs = window.getDebtTransactions(debt);
        const filteredTxs = year === 'ALL' ? txs : txs.filter(t => t.date.substring(0,4) === year);
        
        const paidPrincipal = filteredTxs.reduce((sum, t) => sum + (t.principal || 0), 0);
        const paidInterest = filteredTxs.reduce((sum, t) => sum + (t.interest || 0), 0);
        const totalAmount = paidPrincipal + paidInterest;
        
        // Remaining balance is always based on total principal paid (not filtered)
        const allPaidPrincipal = txs.reduce((sum, t) => sum + (t.principal || 0), 0);
        const balance = debt.start_balance - allPaidPrincipal;
        
        document.getElementById('summary-balance').innerText = formatCurrency(balance);
        document.getElementById('summary-principal').innerText = formatCurrency(paidPrincipal);
        document.getElementById('summary-interest').innerText = formatCurrency(paidInterest);
        document.getElementById('summary-total').innerText = formatCurrency(totalAmount);
    }
    
    const rows = document.querySelectorAll('#debt-tx-tbody .tx-row');
    rows.forEach(row => {
        if(year === 'ALL' || row.getAttribute('data-year') === year) {
            row.style.display = 'table-row';
        } else {
            row.style.display = 'none';
        }
    });
};


// Keydown navigation for icon grid
document.addEventListener('DOMContentLoaded', () => {
    const iconGrid = document.getElementById('icon-grid');
    if(iconGrid) {
        iconGrid.addEventListener('keydown', (e) => {
            const icons = ICON_SETS[currentIconTab];
            if(!icons || icons.length === 0) return;
            
            let currentIndex = icons.indexOf(selectedIcon);
            if(currentIndex === -1) currentIndex = 0;
            
            let newIndex = currentIndex;
            const columns = 6; // We set repeat(4, 1fr) in HTML
            const rows = Math.ceil(icons.length / columns);
            
            if (e.key === 'ArrowRight') {
                newIndex = (currentIndex + 1) % icons.length;
                e.preventDefault();
            } else if (e.key === 'ArrowLeft') {
                newIndex = (currentIndex - 1 + icons.length) % icons.length;
                e.preventDefault();
            } else if (e.key === 'ArrowDown') {
                newIndex = currentIndex + columns;
                if (newIndex >= icons.length) {
                    newIndex = newIndex % columns; // Wrap to top of same column
                    // If the wrapped index is still out of bounds (shouldn't happen if full row, but just in case)
                    if (newIndex >= icons.length) newIndex = icons.length - 1;
                }
                e.preventDefault();
            } else if (e.key === 'ArrowUp') {
                newIndex = currentIndex - columns;
                if (newIndex < 0) {
                    // Wrap to bottom of same column
                    newIndex = ((rows - 1) * columns) + currentIndex;
                    if (newIndex >= icons.length) newIndex -= columns;
                }
                e.preventDefault();
            }
            
            if (newIndex !== currentIndex && newIndex >= 0 && newIndex < icons.length) {
                selectIcon(icons[newIndex]);
                // Ensure the selected item is scrolled into view
                setTimeout(() => {
                    const selectedElem = iconGrid.querySelector(`div[onclick="selectIcon('${icons[newIndex]}')"]`);
        if(selectedElem) {
                        selectedElem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                }, 50);
            }
        });
    }
});

// ==========================================
// 🌏 TRAVEL MODULE
// ==========================================
const TravelState = {
    trips: [],
    currentTrip: null,
    expenses: [],
    expenseChart: null,
    categoryChart: null,
    memberChart: null,
};

const EXPENSE_CATEGORIES = [
    { id: 'food',          label: 'อาหาร',        icon: '🍜', color: '#FF6B6B' },
    { id: 'transport',     label: 'เดินทาง',       icon: '✈️', color: '#4ECDC4' },
    { id: 'hotel',         label: 'ที่พัก',         icon: '🏨', color: '#45B7D1' },
    { id: 'shopping',      label: 'ช้อปปิ้ง',      icon: '🛍️', color: '#96CEB4' },
    { id: 'entertainment', label: 'ท่องเที่ยว',    icon: '🎡', color: '#FFEAA7' },
    { id: 'health',        label: 'สุขภาพ',        icon: '💊', color: '#DDA0DD' },
    { id: 'other',         label: 'อื่นๆ',          icon: '📦', color: '#B0C4DE' },
];

const TRIP_THEMES = [
    { id: 'pastel-pink',   label: 'ชมพู',      icon: '', gradient: 'linear-gradient(135deg, #ffb3ba, #ffdfba)' },
    { id: 'pastel-orange', label: 'ส้ม',       icon: '', gradient: 'linear-gradient(135deg, #ffdfba, #ffffba)' },
    { id: 'pastel-yellow', label: 'เหลือง',    icon: '', gradient: 'linear-gradient(135deg, #ffffba, #baffc9)' },
    { id: 'pastel-green',  label: 'เขียว',     icon: '', gradient: 'linear-gradient(135deg, #baffc9, #bae1ff)' },
    { id: 'pastel-blue',   label: 'ฟ้า',       icon: '', gradient: 'linear-gradient(135deg, #bae1ff, #d4a5a5)' },
    { id: 'pastel-purple', label: 'ม่วง',      icon: '', gradient: 'linear-gradient(135deg, #d4a5a5, #ffb3ba)' },
    { id: 'pastel-mint',   label: 'มิ้นต์',     icon: '', gradient: 'linear-gradient(135deg, #a8e6cf, #dcedc1)' },
    { id: 'pastel-lilac',  label: 'ไลแลค',     icon: '', gradient: 'linear-gradient(135deg, #e1bee7, #c5cae9)' },
    { id: 'pastel-peach',  label: 'พีช',       icon: '', gradient: 'linear-gradient(135deg, #ffdac1, #e2f0cb)' },
];

// ---- Helpers ----
function getTripTheme(themeId) {
    return TRIP_THEMES.find(t => t.id === themeId) || TRIP_THEMES[TRIP_THEMES.length - 1];
}

function getCategoryInfo(catId) {
    return EXPENSE_CATEGORIES.find(c => c.id === catId) || EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];
}

function formatTripDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getTripDays(startDate, endDate) {
    if (!startDate || !endDate) return 0;
    const s = new Date(startDate);
    const e = new Date(endDate);
    return Math.max(1, Math.ceil((e - s) / (1000 * 60 * 60 * 24)) + 1);
}

function tripFmtNum(n) {
    if (n === null || n === undefined || isNaN(n)) return '0';
    return Number(n).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// ---- LOAD TRIPS (main list view) ----
// Backend returns: Array of { project_id, name, status, start_date, end_date, destination, members, total_budget, created_at }
// "destination" field is repurposed to store theme id
async function loadTrips() {
    const container = document.getElementById('travel-trips-list');
    if (container) container.innerHTML = '<div style="text-align:center;padding:40px;color:#888;">⏳ กำลังโหลดทริป...</div>';
    try {
        const userId = AppState.userId || '';
        const headers = { 'x-user-id': encodeURIComponent(userId) };
        console.log('[loadTrips] userId:', userId, '| encoded:', encodeURIComponent(userId));
        const res = await fetch(`${API_BASE}/api/trips`, { headers });
        console.log('[loadTrips] response status:', res.status);
        if (!res.ok) {
            const errText = await res.text();
            console.error('[loadTrips] error body:', errText);
            if (container) container.innerHTML = `<div style="text-align:center;padding:40px;color:#ef4444;">❌ โหลดทริปไม่สำเร็จ (${res.status}): ${errText}<br><small>userId: ${userId}</small></div>`;
            return;
        }
        const data = await res.json();
        // Backend returns plain array
        TravelState.trips = Array.isArray(data) ? data : (data.trips || []);
        renderTripsView();
    } catch (e) {
        console.error('[loadTrips] exception:', e);
        if (container) container.innerHTML = `<div style="text-align:center;padding:40px;color:#ef4444;">❌ เกิดข้อผิดพลาด: ${e.message}</div>`;
        showToast('ไม่สามารถโหลดข้อมูลทริปได้ 😢', 'error');
    }
}


window.switchTripTab = function(tab) {
    TravelState.currentTripTab = tab;
    document.querySelectorAll('#view-travel .tabs .btn').forEach(b => {
        b.classList.remove('active');
        b.style.background = '#f8fafc';
        b.style.color = '#64748b';
        b.style.border = '2px solid #e2e8f0';
        b.style.boxShadow = 'none';
    });
    
    let activeBtn = null;
    let bgGradient = '';
    let shadow = '';
    if (tab === 'ONGOING') {
        activeBtn = document.getElementById('tab-trip-ongoing');
        bgGradient = 'linear-gradient(135deg, #f472b6, #fb7185)';
        shadow = '0 4px 6px rgba(244, 114, 182, 0.3)';
    } else if (tab === 'INCOMING') {
        activeBtn = document.getElementById('tab-trip-incoming');
        bgGradient = 'linear-gradient(135deg, #38bdf8, #7dd3fc)';
        shadow = '0 4px 6px rgba(56, 189, 248, 0.3)';
    } else if (tab === 'MEMORY') {
        activeBtn = document.getElementById('tab-trip-memory');
        bgGradient = 'linear-gradient(135deg, #a78bfa, #c4b5fd)';
        shadow = '0 4px 6px rgba(167, 139, 250, 0.3)';
    }
    
    if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.style.background = bgGradient;
        activeBtn.style.color = 'white';
        activeBtn.style.border = 'none';
        activeBtn.style.boxShadow = shadow;
    }
    
    TravelState.currentTrip = null;
    const emptyState = document.getElementById('travel-empty-state');
    const detailPanel = document.getElementById('travel-details-panel');
    if (emptyState) emptyState.style.display = 'flex';
    if (detailPanel) detailPanel.style.display = 'none';
    
    renderTripsView();
};



const TRIP_HIGHLIGHTS = [
    { id: 'hl_ramen', label: 'Ramen', img: 'assets/images/highlights/hl_ramen.jpg' },
    { id: 'hl_onsen', label: 'Onsen', img: 'assets/images/highlights/hl_onsen.jpg' },
    { id: 'hl_yakiniku', label: 'Yakiniku', img: 'assets/images/highlights/hl_yakiniku.jpg' },
    { id: 'hl_jingisukan', label: 'Jingisukan', img: 'assets/images/highlights/hl_jingisukan.jpg' },
    { id: 'hl_ski', label: 'Ski', img: 'assets/images/highlights/hl_ski.jpg' },
    { id: 'hl_snow', label: 'Snow', img: 'assets/images/highlights/hl_snow.jpg' },
    { id: 'hl_mountain', label: 'Mountain', img: 'assets/images/highlights/hl_mountain.jpg' },
    { id: 'hl_waterfall', label: 'Waterfall', img: 'assets/images/highlights/hl_waterfall.jpg' },
    { id: 'hl_sunrise', label: 'Sunrise', img: 'assets/images/highlights/hl_sunrise.jpg' },
    { id: 'hl_shima_enaga', label: 'Shima Enaga', img: 'assets/images/highlights/hl_shima_enaga.jpg' },
    { id: 'hl_sushi', label: 'Sushi', img: 'assets/images/highlights/hl_sushi.jpg' },
    { id: 'hl_snowmobile', label: 'Snow Mobile', img: 'assets/images/highlights/hl_snowmobile.jpg' },
    { id: 'hl_shopping', label: 'Shopping', img: 'assets/images/highlights/hl_shopping.jpg' },
    { id: 'hl_figure', label: 'Figure', img: 'assets/images/highlights/hl_figure.jpg' },
    { id: 'hl_temple', label: 'Temple', img: 'assets/images/highlights/hl_temple.jpg' },
    { id: 'hl_train', label: 'Train', img: 'assets/images/highlights/hl_train.jpg' },
    { id: 'hl_great_wall', label: 'Great Wall', img: 'assets/images/highlights/hl_great_wall.jpg' },
    { id: 'hl_palace', label: 'Palace', img: 'assets/images/highlights/hl_palace.jpg' },
    { id: 'hl_dim_sum', label: 'Dim Sum', img: 'assets/images/highlights/hl_dim_sum.jpg' },
    { id: 'hl_toys', label: 'Toys', img: 'assets/images/highlights/hl_toys.jpg' },
    { id: 'hl_disneyland', label: 'Disneyland', img: 'assets/images/highlights/hl_disneyland.jpg' },
    { id: 'hl_universal', label: 'Universal', img: 'assets/images/highlights/hl_universal.jpg' }
];

function toggleHighlightSelection(el) {
    el.classList.toggle('selected-highlight');
    if (el.classList.contains('selected-highlight')) {
        el.style.borderColor = '#3b82f6';
        el.style.background = '#eff6ff';
        el.style.transform = 'scale(1.05)';
    } else {
        el.style.borderColor = '#e2e8f0';
        el.style.background = 'white';
        el.style.transform = 'scale(1)';
    }
}

function getThemeBoldColor(themeId) {
    const map = {
        'pastel-pink': '#e11d48',
        'pastel-orange': '#ea580c',
        'pastel-yellow': '#ca8a04',
        'pastel-green': '#16a34a',
        'pastel-blue': '#2563eb',
        'pastel-purple': '#7c3aed',
        'pastel-mint': '#059669',
        'pastel-lilac': '#9333ea',
        'pastel-peach': '#ea580c'
    };
    return map[themeId] || '#334155';
}

function renderTripHighlights(trip) {
    let icons = [];
    try {
        if (trip.highlights && trip.highlights.length > 0) {
            let hlIds = typeof trip.highlights === 'string' ? JSON.parse(trip.highlights) : trip.highlights;
            icons = hlIds.map(id => TRIP_HIGHLIGHTS.find(h => h.id === id)).filter(Boolean);
        }
    } catch(e) {}
    
    if (icons.length === 0) return '';
    
    return icons.map(icon => `<div style="background: white; border-radius: 8px; border: 1px solid #e2e8f0; padding: 2px; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05);"><img src="${icon.img}" style="width: 24px; height: 24px; border-radius: 6px; object-fit: cover;" onerror="this.src='https://placehold.co/100x100?text=NA'"></div>`).join('');
}

function renderTripsView() {
    const container = document.getElementById('travel-trips-list');
    if (!container) return;

    if (!TravelState.trips || TravelState.trips.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">ยังไม่มีทริปในระบบ</div>';
        return;
    }
    
    const tab = TravelState.currentTripListTab || 'ONGOING';
    let filteredTrips = [];
    if (tab === 'ONGOING') {
        filteredTrips = TravelState.trips.filter(t => t.status === 'active');
    } else if (tab === 'INCOMING') {
        filteredTrips = TravelState.trips.filter(t => t.status === 'planned');
    } else if (tab === 'MEMORY') {
        filteredTrips = TravelState.trips.filter(t => t.status === 'closed');
    }
    
    if (filteredTrips.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">ไม่มีทริปในหมวดหมู่นี้</div>';
        return;
    }

    container.innerHTML = filteredTrips.map(trip => {
        const spent   = parseFloat(trip.total_spent)  || 0;
        
        let bannerImg = trip.theme_banner || 'assets/images/banner_japan.jpg';
        if (!bannerImg.startsWith('/')) bannerImg = '/' + bannerImg;
        
        const startDateStr = typeof formatTripDate === 'function' ? formatTripDate(trip.start_date) : new Date(trip.start_date).toLocaleDateString();
        const endDateStr = typeof formatTripDate === 'function' ? formatTripDate(trip.end_date) : new Date(trip.end_date).toLocaleDateString();
        const dest = trip.destination || 'Not set';

        let members = [];
        try { if(trip.members) members = JSON.parse(trip.members); } 
        catch(e) { members = (trip.members || '').split(',').map(m => m.trim()).filter(Boolean); }

        let destPins = dest;
        if (dest.includes(',')) {
            const parts = dest.split(',').map(p => p.trim());
            if (parts.length > 2) {
                destPins = parts.slice(0, 2).join(' · ') + ` +${parts.length - 2} จุด`;
            } else {
                destPins = parts.join(' · ');
            }
        }

        // Determine unique Ghibli/Anime theme based on project_id hash
        const styles = ['theme-ghibli-forest', 'theme-ghibli-sky', 'theme-ghibli-wood', 'theme-ghibli-sunset', 'theme-ghibli-ocean'];
        let hash = 0;
        for (let i = 0; i < trip.project_id.length; i++) {
            hash = trip.project_id.charCodeAt(i) + ((hash << 5) - hash);
        }
        const themeIndex = Math.abs(hash) % styles.length;
        const themeClass = styles[themeIndex];

        const statusBadgeText = trip.status === 'closed' ? 'Memory' : trip.status === 'planned' ? 'Incoming' : 'Ongoing';

        const cleanTripName = (trip.name || '').replace(/^[^\w\sก-๙a-zA-Z0-9]+/, '').trim();

        return `
            <div class="trip-card-v4-hybrid ${themeClass}" onclick="openTripDetail('${trip.project_id}')">
                <!-- Left illustration thumbnail -->
                <div class="trip-card-v4-hybrid-left">
                    <img class="trip-card-v4-hybrid-img" src="${bannerImg}" onerror="this.src='/assets/images/banner_japan.jpg'" />
                </div>
                
                <!-- Right 5 details fields -->
                <div class="trip-card-v4-hybrid-right">
                    <h4 class="trip-card-v4-hybrid-title">✨ ${cleanTripName}</h4>
                    <div class="trip-card-v4-hybrid-row">📅 ${startDateStr} – ${endDateStr}</div>
                    <div class="trip-card-v4-hybrid-row">📍 ${destPins}</div>
                    <div class="trip-card-v4-hybrid-row">👥 ${members.length > 0 ? members.join(', ') : 'ไม่มีสมาชิก'}</div>
                    <div class="trip-card-v4-hybrid-spent-row">
                        <span>ใช้ไป</span>
                        <span class="trip-card-v4-hybrid-spent-val">฿${tripFmtNum(spent)}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

window.openTripDetail = async function(projectId) {
    try {
        const headers = { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(getUserIdHeader()) };
        const res = await fetch(`${API_BASE}/api/travel?projectId=${projectId}`, { headers });
        const data = await res.json();
        
        TravelState.currentTrip = data.trip;
        TravelState.expenses = data.expenses || [];
        TravelState.stops = data.stops || [];
        TravelState.wallets = data.wallets || [];
        TravelState.weatherData = data.weatherData || null;
        TravelState.documents = data.documents || [];
        TravelState.currentTripTab = 'itinerary'; // Default to route mode

        // แสดงแผงรายละเอียดด้านขวา (ซ่อน empty state)
        const emptyState = document.getElementById('travel-empty-state');
        const detailPanel = document.getElementById('travel-details-panel');
        if (emptyState) emptyState.style.display = 'none';
        if (detailPanel) detailPanel.style.display = 'block';

        renderTripDetailModal();
    } catch (e) {
        console.error('openTripDetail error', e);
        showToast('โหลดข้อมูลทริปล้มเหลว: ' + (e && e.message ? e.message : e), 'error');
    }
}

window.closeTripDetail = function() {
    const emptyState = document.getElementById('travel-empty-state');
    const detailPanel = document.getElementById('travel-details-panel');
    if (detailPanel) detailPanel.style.display = 'none';
    if (emptyState) emptyState.style.display = 'flex';
    TravelState.currentTrip = null;
};

window.renderTripDetailModal = function() {
    const trip = TravelState.currentTrip;
    if (!trip) return;

    const theme = getTripTheme(trip.destination || trip.color_theme || trip.theme_icon || 'default');
    const expenses = TravelState.expenses || [];
    const stops = TravelState.stops || [];
    const tab = TravelState.currentTripTab || 'itinerary';
    const budget = parseFloat(trip.total_budget) || 0;
    const spent = expenses.reduce((s, e) => s + parseFloat(e.amount_thb || 0), 0);
    const remaining = budget - spent;
    let members = [];
    try { if(trip.members) members = JSON.parse(trip.members); } 
    catch(e) { members = (trip.members || '').split(',').map(m => m.trim()); }

    const container = document.querySelector('#travel-details-panel .trip-detail-content') || document.querySelector('.trip-detail-content');
    if (!container) return;
    
    // Header
    let bannerImg = trip.theme_banner || 'assets/images/banner_japan.jpg';
    if (!bannerImg.startsWith('/')) bannerImg = '/' + bannerImg;
    
    const cleanTripName = (trip.name || '').replace(/^[^\w\sก-๙a-zA-Z0-9]+/, '').trim();
    
    let headerHtml = `
        <!-- V3 Header -->
        <div class="trip-detail-v3-header">
            <div class="trip-detail-v3-nav">
                <button class="trip-detail-v3-back" onclick="closeTripDetail()">
                    <i class="fa-solid fa-chevron-left"></i> กลับ
                </button>
                <div class="trip-detail-v3-status">
                    ${trip.status === 'closed' ? '🌸 Memory' : trip.status === 'planned' ? '💧 Incoming' : '🌸 กำลังเที่ยว'}
                </div>
            </div>
            <h2 class="trip-detail-v3-title">✨ ${cleanTripName}</h2>
            <div class="trip-detail-v3-meta">
                📅 ${formatTripDate(trip.start_date)} – ${formatTripDate(trip.end_date)} · ✈️ ${getTripDays(trip.start_date, trip.end_date)} วัน · 👥 ${members.length > 0 ? members.join(' · ') : 'ไม่มีสมาชิก'}
            </div>
        </div>

        <!-- Budget summary cards -->
        <div class="trip-detail-v3-stats">
            <div class="trip-detail-v3-stat-card budget">
                <div class="trip-detail-v3-stat-label budget">งบทั้งหมด</div>
                <div class="trip-detail-v3-stat-val budget">฿${tripFmtNum(budget)}</div>
            </div>
            <div class="trip-detail-v3-stat-card spent">
                <div class="trip-detail-v3-stat-label spent">ใช้ไป</div>
                <div class="trip-detail-v3-stat-val spent">฿${tripFmtNum(spent)}</div>
            </div>
            <div class="trip-detail-v3-stat-card ${remaining < 0 ? 'overbudget' : 'remaining'}">
                <div class="trip-detail-v3-stat-label ${remaining < 0 ? 'overbudget' : 'remaining'}">${remaining < 0 ? 'เกินงบ' : 'เหลือ'}</div>
                <div class="trip-detail-v3-stat-val ${remaining < 0 ? 'overbudget' : 'remaining'}">฿${tripFmtNum(Math.abs(remaining))}</div>
            </div>
        </div>

        <!-- Tab Navigation -->
        <div style="display:flex; padding: 10px 15px; background: #fff; border-bottom: 1px solid #f1f5f9; position: sticky; top: 0; z-index: 9; overflow-x: auto; gap: 8px;">
            ${[['itinerary','📍 แผนเดินทาง','linear-gradient(135deg,#a78bfa,#c4b5fd)'],['expenses','💸 ค่าใช้จ่าย','linear-gradient(135deg,#f472b6,#fb7185)'],['wallets','👛 กระเป๋าเงิน','linear-gradient(135deg,#10b981,#6ee7b7)'],['members','👥 สมาชิก','linear-gradient(135deg,#f59e0b,#fcd34d)'],['docs','📄 เอกสาร','linear-gradient(135deg,#6366f1,#818cf8)'],['settings','⚙️ ตั้งค่า','linear-gradient(135deg,#64748b,#94a3b8)']].map(([id,label,grad]) => `
                <button onclick="switchTravelTab('${id}')" style="white-space:nowrap; padding:8px 16px; border-radius:20px; border:none; font-weight:bold; cursor:pointer; transition:all 0.2s; background:${tab === id ? grad : '#f1f5f9'}; color:${tab === id ? 'white' : '#64748b'}; box-shadow:${tab === id ? '0 3px 8px rgba(0,0,0,0.12)' : 'none'};">${label}</button>
            `).join('')}
        </div>
    `;

    let contentHtml = '';
    
    if (tab === 'itinerary') {
        const parentStops = stops.filter(s => !s.parent_stop_id).sort((a,b) => (a.stop_date || '').localeCompare(b.stop_date || ''));
        
        contentHtml = `
            <div class="trip-detail-section" style="padding: 15px; background: #FFFDF9;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3 style="margin: 0; font-size: 16px; color: #43553E; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-map-location-dot"></i> ลำดับการเดินทาง
                    </h3>
                    <div style="display: flex; gap: 8px;">
                        <button onclick="toggleTimelineEditMode()" class="btn-trip-add-sm" style="background: #F0EBE1; color: #43553E; border: 1.5px solid #E6DFD3;"><i class="fa-solid fa-arrows-up-down-left-right"></i> ย้าย</button>
                        <button onclick="openAddStopModal('${trip.project_id}')" class="btn-trip-add-sm" style="background: #43553E; color: white;">+ จุดแวะ</button>
                    </div>
                </div>
                <div id="timeline-container" style="position: relative; padding: 10px 5px;">
                    <div class="trip-timeline-v3">
                        ${(() => {
                            return parentStops.map((parent, parentIndex) => {
                                const isFirst = parentIndex === 0;
                                const isLast = parentIndex === parentStops.length - 1;
                                const routeIcon = (isFirst || isLast) ? '✈️' : '🚂';

                                const isMainDay = parent.is_main_day === 1 && ((parent.location_type || '').includes('เมือง') || (parent.location_type || '').includes('City'));
                                const dateStr = parent.stop_date ? formatTripDate(parent.stop_date) : 'รอระบุวัน';
                                const dKey = parent.stop_date ? parent.stop_date.substring(0, 10) : 'รอระบุวัน';
                                const _sd = trip.start_date ? trip.start_date.substring(0, 10) : null;
                                const dayNum = (_sd && dKey !== 'รอระบุวัน') ? Math.max(1, Math.round((new Date(dKey) - new Date(_sd)) / 86400000) + 1) : null;
                                const dayLabel = dayNum ? `วันที่ ${dayNum} · ` : '';

                                const wData = TravelState.weatherData;
                                let weatherSummaryHtml = '';
                                if (wData && wData.daily && dKey !== 'รอระบุวัน') {
                                    const dayIndex = wData.daily.time.indexOf(dKey);
                                    if (dayIndex !== -1) {
                                        const code = wData.daily.weathercode[dayIndex];
                                        const maxTemp = Math.round(wData.daily.temperature_2m_max[dayIndex]);
                                        const minTemp = Math.round(wData.daily.temperature_2m_min[dayIndex]);
                                        
                                        let emoji = '🌤️';
                                        if (code === 0) emoji = '☀️';
                                        else if (code >= 51 && code <= 67) emoji = '🌧️';
                                        else if (code >= 71 && code <= 77) emoji = '❄️';
                                        else if (code >= 80 && code <= 82) emoji = '🌧️';
                                        else if (code >= 85 && code <= 86) emoji = '❄️';
                                        else if (code >= 95) emoji = '⚡';
                                        
                                        weatherSummaryHtml = `<span onclick="event.stopPropagation(); window.showWeatherTooltip(event, '${parent.stop_id}')" style="cursor: pointer; margin-left: 6px; background: rgba(255,255,255,0.85); border:1px solid #cbd5e1; padding: 2px 5px; border-radius: 6px; color: #1e293b; font-size:10px; font-weight:bold;">${emoji} ${maxTemp}°/${minTemp}°C</span>`;
                                    }
                                }

                                const getDocsHtml = (stopId) => {
                                    const stopDocs = (TravelState.documents || []).filter(d => d.related_entity_id === stopId);
                                    if (stopDocs.length === 0) return '';
                                    return `
                                        <div style="display:inline-flex; gap:6px; margin-left:8px; align-items:center; vertical-align:middle; flex-shrink:0;">
                                            ${stopDocs.map(d => {
                                                const isImage = d.file_url.startsWith('data:image/');
                                                const iconHtml = isImage 
                                                    ? `<i class="fa-solid fa-file-image" style="color: #e11d48; font-size: 16px;" title="${d.description || 'ดูรูปภาพ'}"></i>` 
                                                    : `<i class="fa-solid fa-file-lines" style="color: #0284c7; font-size: 16px;" title="${d.description || 'ดูเอกสาร'}"></i>`;
                                                return `<span onclick="event.stopPropagation(); window.openDocumentAttachment('${d.document_id}', '${d.file_url}')" style="cursor:pointer; display:inline-flex; align-items:center; justify-content:center; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.15));" title="${d.description || 'ดูเอกสาร'}">${iconHtml}</span>`;
                                            }).join('')}
                                        </div>
                                    `;
                                };

                                const renderStopNode = (stopItem, level = 1) => {
                                    if (level > 10) return '';
                                    const children = stops.filter(s => s.parent_stop_id === stopItem.stop_id).sort((a,b) => (a.time || '').localeCompare(b.time || ''));
                                    const isItemMainDay = stopItem.is_main_day === 1 && ((stopItem.location_type || '').includes('เมือง') || (stopItem.location_type || '').includes('City'));
                                    
                                    let nodeHtml = '';
                                    if (!isItemMainDay) {
                                        nodeHtml = `
                                            <div id="stop-item-${stopItem.stop_id}" draggable="true" 
                                                 ondragstart="window.handleTimelineStopDragStart(event, '${stopItem.stop_id}')" 
                                                 ondragover="event.preventDefault(); this.style.background='#eff6ff';" 
                                                 ondragleave="this.style.background='#ffffff';" 
                                                 ondrop="event.stopPropagation(); this.style.background='#ffffff'; window.handleTimelineStopDrop(event, '${stopItem.stop_date || ''}', '${stopItem.stop_id}')"
                                                 class="trip-timeline-subitem-v3">
                                                
                                                <div style="display:flex; width:100%; align-items:center; justify-content:space-between; gap:6px;">
                                                    <div style="display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1;">
                                                        ${stopItem.time ? `<span class="time">${stopItem.time}</span>` : ''}
                                                        <span>${stopItem.icon || '📍'} ${stopItem.accommodation}</span>
                                                        ${getDocsHtml(stopItem.stop_id)}
                                                    </div>
                                                    
                                                    <div class="timeline-edit-controls" style="display: ${TravelState.editModeEnabled ? 'flex' : 'none'}; gap: 8px; flex-shrink: 0; align-items: center;">
                                                        <span onclick="event.stopPropagation(); openAddStopModal('${stopItem.project_id}', '${stopItem.stop_id}')" style="cursor:pointer; font-size:13px;">✏️</span>
                                                        <span onclick="event.stopPropagation(); deleteTripStop('${stopItem.stop_id}')" style="cursor:pointer; font-size:13px;">🗑️</span>
                                                    </div>
                                                </div>
                                            </div>
                                        `;
                                    }

                                    let childrenHtml = '';
                                    if (children.length > 0) {
                                        childrenHtml = `
                                            <div style="margin-left: 14px; padding-left: 12px; border-left: 2px dashed #cbd5e1; margin-top: 4px; display: flex; flex-direction: column; gap: 4px; position: relative; margin-bottom: 4px;">
                                                ${children.map(child => renderStopNode(child, level + 1)).join('')}
                                            </div>
                                        `;
                                    }

                                    return `
                                        ${nodeHtml}
                                        ${childrenHtml}
                                    `;
                                };

                                const statusClass = trip.status === 'closed' ? 'memory' : trip.status === 'planned' ? 'incoming' : '';
                                
                                return `
                                    <div class="trip-timeline-day-v3">
                                        <div class="trip-timeline-dot-v3 ${statusClass}"></div>
                                        <div class="trip-timeline-day-card-v3 ${statusClass}">
                                            <div style="display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 6px; line-height: 1.2;">
                                                <div style="display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1;">
                                                    <span>${routeIcon}</span>
                                                    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 850;">${dayLabel}${dateStr} · ${parent.accommodation}</span>
                                                </div>
                                                <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                                                    ${weatherSummaryHtml}
                                                    <div class="timeline-edit-controls" style="display: ${TravelState.editModeEnabled ? 'inline-flex' : 'none'}; gap: 5px; align-items: center; margin-left: 2px;">
                                                        <span onclick="event.stopPropagation(); openAddStopModal('${parent.project_id}', '${parent.stop_id}')" style="cursor:pointer; font-size:11px;" title="แก้ไข">✏️</span>
                                                        <span onclick="event.stopPropagation(); deleteTripStop('${parent.stop_id}')" style="cursor:pointer; font-size:11px;" title="ลบ">🗑️</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        ${renderStopNode(parent, 1)}
                                    </div>
                                `;
                            }).join('');
                        })()}
                    </div>
                    <button class="trip-timeline-add-btn-v3" onclick="openAddStopModal('${trip.project_id}')">+ เพิ่มจุดแวะ</button>
                </div>
                
                <!-- Center: Custom Game Board Map (No Leaflet!) -->
                <div class="itinerary-center-col" style="background: white; border-radius: 16px; border: 2px dashed #D6D2C4; overflow: hidden; position: relative; height: 520px; box-shadow: 0 4px 10px rgba(0,0,0,0.02); display: flex; flex-direction: column;">
                    <style>
                        @keyframes boardPinBob {
                            0%, 100% { transform: translate(-50%, -100%) translateY(0); }
                            50% { transform: translate(-50%, -100%) translateY(-6px); }
                        }
                        .board-pin-animated {
                            animation: boardPinBob 1.6s ease-in-out infinite;
                        }
                    </style>
                    <div style="background: #F1EFEA; padding: 6px 12px; border-bottom: 2px dashed #D6D2C4; display: flex; justify-content: space-between; align-items: center; font-size: 11px; z-index: 10;">
                        <span style="font-weight: 800; color: #43553E;">🗺️ แผนที่ท่องเที่ยวท่องเที่ยว (ลากหมุดเพื่อปรับตำแหน่งบนแผนที่จำลอง)</span>
                    </div>
                    <div id="custom-game-board" style="position: relative; width: 100%; flex: 1; overflow: hidden; background: #fbf9f4;">
                        <img src="/assets/images/hokkaido_ghibli_map.jpg" style="width: 100%; height: 100%; object-fit: cover; display: block;" />
                        
                        <!-- Stop Markers -->
                        ${stops.map((s, idx) => {
                            let x = s.longitude ? parseFloat(s.longitude) : (40 + (idx * 6));
                            let y = s.latitude ? parseFloat(s.latitude) : (40 + (idx * 5));
                            
                            if (x < 5) x = 5; if (x > 95) x = 95;
                            if (y < 5) y = 5; if (y > 95) y = 95;
                            
                            const markerColor = s.notes && s.notes.includes('#') ? s.notes.split('#')[1].trim().substring(0, 7) : '#A8C3A0';
                            const displayColor = s.marker_color || markerColor;

                            const pos = s.label_position || 'auto';
                            let labelStyle = '';
                            if (pos === 'top') {
                                labelStyle = 'top: -18px; left: 50%; transform: translateX(-50%);';
                            } else if (pos === 'bottom') {
                                labelStyle = 'top: 42px; left: 50%; transform: translateX(-50%);';
                            } else if (pos === 'left') {
                                labelStyle = 'top: 10px; right: 46px; left: auto; transform: none;';
                            } else if (pos === 'right') {
                                labelStyle = 'top: 10px; left: 46px; right: auto; transform: none;';
                            } else {
                                labelStyle = idx % 2 === 0 
                                    ? 'top: -18px; left: 50%; transform: translateX(-50%);' 
                                    : 'top: 42px; left: 50%; transform: translateX(-50%);';
                            }

                            return `
                                <div id="board-pin-${s.stop_id}" class="board-pin board-pin-animated" 
                                     style="position: absolute; left: ${x}%; top: ${y}%; transform: translate(-50%, -100%); cursor: grab; z-index: 100; transition: transform 0.1s;"
                                     onmousedown="window.initMarkerDrag(event, '${s.stop_id}')">
                                    
                                    <div style="width:40px; height:40px; display:flex; align-items:center; justify-content:center; background: #ffffff; border: 2px solid ${displayColor}; box-shadow: 0 4px 8px rgba(0,0,0,0.15); border-radius: 50%;">
                                        <span style="font-size: 20px;">${s.icon || '📍'}</span>
                                    </div>
                                    
                                    <!-- Mini Label (Custom position to avoid overlapping) -->
                                    <div style="position: absolute; ${labelStyle} background: rgba(0,0,0,0.75); color: white; font-size: 8.5px; padding: 2px 6px; border-radius: 4px; white-space: nowrap; font-weight: bold; pointer-events: none; border: 0.5px solid rgba(255,255,255,0.25); z-index: 110;">
                                        ${s.accommodation}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            </div>
        `;

        // Load weather and auto-select first stop
        setTimeout(() => {
            initWeatherForecast(trip, stops);
            if (stops.length > 0) {
                selectItineraryStop(stops[0].stop_id);
            }
        }, 100);

    } else if (tab === 'expenses') {
        // --- EXPENSES TAB ---
        const activeWallets = TravelState.wallets || [];
        const walletTotal = activeWallets.reduce((s, w) => s + parseFloat(w.initial_balance_thb || 0), 0);
        
        // Exclude totals flag calculation
        const excludedWallets = activeWallets.filter(w => w.exclude_on_close === 1).map(w => w.wallet_id);
        const totalSpentWithExclude = expenses
            .filter(e => e.approved !== 0 && !excludedWallets.includes(e.wallet_id))
            .reduce((s, e) => s + parseFloat(e.amount_thb || 0), 0);

        // Group expenses by Date -> Main Location
        const byDay = {};
        expenses.filter(e => e.approved !== 0).forEach(e => {
            const day = (e.expense_date || '').substring(0, 10) || 'ทั่วไป';
            if (!byDay[day]) byDay[day] = {};
            
            const stopId = e.stop_id || 'general';
            if (!byDay[day][stopId]) byDay[day][stopId] = [];
            byDay[day][stopId].push(e);
        });

        // Pending approvals count for Admin
        const pendingExpenses = expenses.filter(e => e.approved === 0);

        contentHtml = `
            <!-- Multi-currency Wallets Dashboard -->
            <div class="trip-detail-section" style="padding:0 15px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <h3 class="trip-section-title" style="margin:0;">👛 กระเป๋าเงินทริป</h3>
                    <div style="display:flex; gap:6px;">
                        ${trip.status !== 'closed' && !TravelState.isGuest ? `<button class="btn-trip-add-sm" style="background:#0ea5e9;" onclick="switchTravelTab('settings')">👛 สร้างกระเป๋า</button>` : ''}
                        <button class="btn-trip-add-sm" style="background:#10b981;" onclick="openFundWalletModal('${trip.project_id}')">💰 เติมเงิน</button>
                        <button class="btn-trip-add-sm" style="background:#6366f1;" onclick="openTripCalcModal('${trip.project_id}')">🧮 คิดเงิน</button>
                        ${trip.status !== 'closed' && !TravelState.isGuest ? `<button class="btn-trip-add-sm" style="background:#ef4444;" onclick="openCloseTripModal('${trip.project_id}')">🔒 ปิดทริป</button>` : ''}
                    </div>
                </div>
                <div class="trip-wallets-grid">
                    ${activeWallets.length === 0 ? `<div style="padding:14px; border:1px dashed #94a3b8; border-radius:12px; color:#64748b; font-size:12px;">ยังไม่มีกระเป๋าเงินสำหรับทริปนี้ · กด <b>👛 สร้างกระเป๋า</b> เพื่อเพิ่มสกุลเงินก่อนเติมเงิน</div>` : activeWallets.map(w => {
                        // ใช้ค่าคำนวณจาก backend (funded = ตั้งต้น + ทุกล็อตเติม), spent = Σบิล
                        const funded = (w.funded_foreign != null) ? parseFloat(w.funded_foreign) : parseFloat(w.initial_balance_foreign || 0);
                        const spent = (w.spent_foreign != null) ? parseFloat(w.spent_foreign)
                            : expenses.filter(e => e.wallet_id === w.wallet_id && e.approved !== 0).reduce((s, e) => s + parseFloat(e.amount_foreign || e.amount_thb || 0), 0);
                        const remForeign = (w.leftover_foreign != null) ? parseFloat(w.leftover_foreign) : (funded - spent);
                        const avgRate = (w.avg_rate != null && parseFloat(w.avg_rate) > 0) ? parseFloat(w.avg_rate)
                            : (parseFloat(w.initial_balance_thb || 0) / (parseFloat(w.initial_balance_foreign) || 1));
                        const remThb = (w.leftover_thb != null) ? parseFloat(w.leftover_thb) : (remForeign * avgRate);
                        const isThb = (w.currency || '').toUpperCase() === 'THB';
                        return `
                            <div class="trip-wallet-card">
                                <div class="trip-wallet-title">💳 ${w.name}</div>
                                <div class="trip-wallet-balance-foreign">${w.currency} ${tripFmtNum(remForeign)}</div>
                                <div class="trip-wallet-balance-thb">≈ ฿${tripFmtNum(remThb)}</div>
                                ${!isThb && avgRate > 0 ? `<div class="trip-wallet-rate-chip" style="font-size:10px; margin-top:4px; background:rgba(99,102,241,0.12); color:#4338ca; padding:1px 6px; border-radius:8px; display:inline-block;">เรทเฉลี่ย ${avgRate.toFixed(3)} ฿/${w.currency}</div>` : ''}
                                <div style="font-size:10px; color:#94a3b8; margin-top:3px;">เติม ${tripFmtNum(funded)} · ใช้ ${tripFmtNum(spent)}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
                <div style="font-size:12px; color:#475569; background:#eff6ff; padding:8px 12px; border-radius:10px; margin-bottom:15px; font-weight:bold;">
                    💰 ยอดเงินคงเหลือรวมทุกกระเป๋า: ฿${tripFmtNum(activeWallets.reduce((s,w) => {
                        const wSpent = expenses.filter(e => e.wallet_id === w.wallet_id && e.approved !== 0).reduce((sum, e) => sum + parseFloat(e.amount_foreign || e.amount_thb || 0), 0);
                        const remForeign = parseFloat(w.initial_balance_foreign) - wSpent;
                        return s + (remForeign * (parseFloat(w.initial_balance_thb) / (parseFloat(w.initial_balance_foreign) || 1)));
                    }, 0))}
                </div>
            </div>

            <!-- Admin approval queue banner if any -->
            ${pendingExpenses.length > 0 && !TravelState.isGuest ? `
                <div class="trip-detail-section" style="padding:0 15px; background:#fffbeb; border:1px solid #fef3c7; border-radius:12px; margin:0 15px 15px 15px;">
                    <h4 style="margin:0 0 6px 0; color:#b45309; font-size:12px;">⚠️ บิลรออนุมัติจากผู้เข้าชม (${pendingExpenses.length} บิล)</h4>
                    <div style="max-height:100px; overflow-y:auto; font-size:11px;">
                        ${pendingExpenses.map(pe => `
                            <div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid #fde68a;">
                                <span>📝 ${pe.note || 'ค่าใช้จ่าย'} (฿${tripFmtNum(pe.amount_thb)})</span>
                                <button onclick="approveGuestExpense('${pe.trip_expense_id}')" style="background:#059669; color:white; border:none; padding:2px 6px; border-radius:4px; cursor:pointer;">อนุมัติ</button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}

            <!-- Charts Section -->
            <div class="trip-detail-section" style="padding:0 15px;">
                <h3 class="trip-section-title">📊 สรุปงบประมาณเปรียบเทียบ</h3>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; font-size:12px; font-weight:bold;">
                    <span>งบรวม: ฿${tripFmtNum(budget)}</span>
                    <span style="color:#ef4444;">ใช้จริง: ฿${tripFmtNum(spent)}</span>
                </div>
                <div class="trip-budget-bar-lg" style="margin-bottom:20px; border-radius:8px; overflow:hidden;">
                    <div class="trip-budget-fill-lg" style="width:${budget > 0 ? Math.min(100, (spent/budget)*100) : 0}%; height:14px;"></div>
                </div>
                <canvas id="trip-budget-chart-canvas" style="max-height:150px; margin-bottom:20px;"></canvas>
            </div>

            <!-- Expense logs hierarchical view -->
            <div class="trip-detail-section" style="padding:0 15px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <h3 class="trip-section-title" style="margin:0;">📋 รายงานการใช้จ่าย</h3>
                    <button class="btn-trip-add-sm" onclick="openAddExpenseModal('${trip.project_id}')">+ เพิ่มบิล</button>
                </div>

                ${Object.entries(byDay).sort((a,b)=>b[0].localeCompare(a[0])).map(([day, stopsMap]) => `
                    <div class="trip-day-group" style="margin-bottom:15px;">
                        <div class="trip-day-header" style="background:#f8fafc; font-weight:bold; font-size:12px; padding:4px 8px; border-radius:6px; color:#475569; display:flex; justify-content:space-between;">
                            <span>📅 ${day === 'ทั่วไป' ? 'ทั่วไป' : formatTripDate(day)}</span>
                            <span>฿${tripFmtNum(Object.values(stopsMap).flat().reduce((sum, e) => sum + parseFloat(e.amount_thb), 0))}</span>
                        </div>
                        <div style="margin-top:6px; padding-left:10px;">
                            ${Object.entries(stopsMap).map(([stopId, list]) => {
                                const stopName = stopId === 'general' ? '📦 ทั่วไป' : (stops.find(s=>s.stop_id === stopId)?.accommodation || '📍 สถานที่แวะพัก');
                                return `
                                    <div style="margin-bottom:8px;">
                                        <div style="font-size:11px; font-weight:bold; color:#64748b; margin-bottom:4px;">${stopName}</div>
                                        ${list.map(e => {
                                            const cat = getCategoryInfo(e.category_id);
                                            const wallet = activeWallets.find(w=>w.wallet_id === e.wallet_id);
                                            return `
                                                <div class="trip-expense-row" style="display:flex; justify-content:space-between; align-items:center; font-size:12px; border-bottom:1px solid #f1f5f9; padding:4px 0;">
                                                    <div style="display:flex; gap:6px; align-items:center;">
                                                        <span>${cat.icon}</span>
                                                        <span>${e.note || cat.label}</span>
                                                        <span style="color:#94a3b8; font-size:10px;">(${e.member_id || 'ไม่ระบุ'}${wallet ? ` · ${wallet.name}` : ''})</span>
                                                    </div>
                                                    <div style="display:flex; align-items:center; gap:8px;">
                                                        <div style="font-weight:bold; color:#0f172a;">฿${tripFmtNum(parseFloat(e.amount_thb))}</div>
                                                        <button class="btn-del-exp" onclick="deleteExpense('${e.trip_expense_id}', '${trip.project_id}')" style="background:none; border:none; cursor:pointer; color:#ef4444; font-size:11px; padding:0;">🗑️</button>
                                                    </div>
                                                </div>
                                            `;
                                        }).join('')}
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>

            <!-- Recent Expenses List (10 newest first) -->
            <div class="trip-detail-section" style="padding:0 15px; margin-top:20px;">
                <h3 class="trip-section-title">🕒 รายการใช้จ่ายล่าสุด</h3>
                <div style="font-size:11px;">
                    ${expenses.filter(e => e.approved !== 0).slice(0, 10).map(e => {
                        const cat = getCategoryInfo(e.category_id);
                        return `
                            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #f1f5f9;">
                                <span>${(e.expense_date||'').substring(0,10)} · ${e.note || cat.label} (${cat.icon})</span>
                                <span style="font-weight:bold;">฿${tripFmtNum(parseFloat(e.amount_thb))}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

        setTimeout(() => {
            renderExpenseChart(trip, expenses);
        }, 100);

    } else if (tab === 'settings') {
        // --- SETTINGS TAB ---
        const activeCurrencies = safeParseJson(trip.active_currencies, ['THB', 'JPY']);
        const allCurrencies = ["THB", "JPY", "USD", "HKD", "CNY", "SGD", "VND", "EUR", "KRW"];
        const activeTheme = localStorage.getItem(`trip_theme_${trip.project_id}`) || 'ghibli';
        
        contentHtml = `
            <!-- Edit Trip Metadata Form -->
            <div class="trip-detail-section" style="padding:0 15px;">
                <h3 class="trip-section-title">⚙️ ตั้งค่าข้อมูลทริป</h3>
                <form id="edit-trip-settings-form" style="display:flex; flex-direction:column; gap:10px;">
                    <div>
                        <label style="font-size:12px; font-weight:bold; margin-bottom:4px; display:block;">ชื่อทริป</label>
                        <input type="text" id="edit-trip-name" class="trip-input" value="${trip.name}" required>
                    </div>
                    <div>
                        <label style="font-size:12px; font-weight:bold; margin-bottom:4px; display:block;">สไตล์ / ธีมหน้าต่างทริป (Theme)</label>
                        <select id="edit-trip-theme" class="trip-input" style="appearance:auto;">
                            <option value="ghibli" ${activeTheme === 'ghibli' ? 'selected' : ''}>Cozy Anime Ghibli 🍃</option>
                            <option value="glass" ${activeTheme === 'glass' ? 'selected' : ''}>Modern Glassmorphism ❄️</option>
                            <option value="kawaii" ${activeTheme === 'kawaii' ? 'selected' : ''}>Playful Kawaii Grid 🌸</option>
                            <option value="retro" ${activeTheme === 'retro' ? 'selected' : ''}>Retro Journal Scrapbook 🪵</option>
                            <option value="forest" ${activeTheme === 'forest' ? 'selected' : ''}>Cozy Nature Forest 🌲</option>
                        </select>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <div style="flex:1;">
                            <label style="font-size:12px; font-weight:bold; margin-bottom:4px; display:block;">วันเริ่มเดินทาง</label>
                            <input type="date" id="edit-trip-start" class="trip-input" value="${trip.start_date ? trip.start_date.substring(0,10) : ''}">
                        </div>
                        <div style="flex:1;">
                            <label style="font-size:12px; font-weight:bold; margin-bottom:4px; display:block;">วันสิ้นสุดเดินทาง</label>
                            <input type="date" id="edit-trip-end" class="trip-input" value="${trip.end_date ? trip.end_date.substring(0,10) : ''}">
                        </div>
                    </div>
                    <div>
                        <label style="font-size:12px; font-weight:bold; margin-bottom:4px; display:block;">จุดหมายปลายทาง (จังหวัด/ประเทศ)</label>
                        <input type="text" id="edit-trip-dest" class="trip-input" value="${trip.destination || ''}">
                    </div>
                    <div>
                        <label style="font-size:12px; font-weight:bold; margin-bottom:4px; display:block;">ผู้ร่วมทริป (คั่นด้วยจุลภาค ,)</label>
                        <input type="text" id="edit-trip-members" class="trip-input" value="${members.join(', ')}">
                    </div>
                    
                    <!-- Trip Password settings -->
                    <div>
                        <label style="font-size:12px; font-weight:bold; margin-bottom:4px; display:block;">รหัสผ่านทริป (Trip Password)</label>
                        <div style="display:flex; gap:8px;">
                            <input type="text" id="edit-trip-password" class="trip-input" value="${trip.trip_password || ''}" placeholder="ว่างไว้หากไม่ต้องใส่รหัสผ่าน">
                            <button type="button" onclick="generateTripPassword()" style="background:#475569; color:white; border:none; padding:8px 12px; border-radius:8px; font-size:11px; cursor:pointer;">สุ่มรหัส</button>
                        </div>
                    </div>

                    <!-- Active currencies selection -->
                    <div>
                        <label style="font-size:12px; font-weight:bold; margin-bottom:6px; display:block;">สกุลเงินที่ใช้งานในทริป</label>
                        <div style="display:flex; flex-wrap:wrap; gap:8px;">
                            ${allCurrencies.map(cur => `
                                <label style="display:flex; align-items:center; gap:4px; font-size:11px; background:#f1f5f9; padding:4px 8px; border-radius:6px; cursor:pointer;">
                                    <input type="checkbox" name="active-currency-opt" value="${cur}" ${activeCurrencies.includes(cur) ? 'checked' : ''}>
                                    ${cur}
                                </label>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Highlights Selection -->
                    <div>
                        <label style="font-size:12px; font-weight:bold; margin-bottom:6px; display:block;">ไฮไลท์กิจกรรม (Highlights)</label>
                        <div style="display:flex; flex-wrap:wrap; gap:8px; max-height:120px; overflow-y:auto; padding:5px; border:1px solid #e2e8f0; border-radius:8px;">
                            ${TRIP_HIGHLIGHTS.map(h => {
                                const highlightList = safeParseJson(trip.highlights, []);
                                const selected = highlightList.includes(h.id);
                                return `
                                    <div class="highlight-item ${selected ? 'selected-highlight' : ''}" data-id="${h.id}" onclick="toggleHighlightSelection(this)" style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 50px; height: 50px; border: ${selected ? '2px solid #3b82f6' : '1px solid #e2e8f0'}; border-radius: 8px; cursor: pointer; background: white; transition: all 0.2s;">
                                        <img src="${h.img}" style="width:25px; height:25px; border-radius:4px; object-fit:cover;">
                                        <span style="font-size:8px; margin-top:2px;">${h.label}</span>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>

                    <button type="button" onclick="saveTripSettings()" style="background:#10b981; color:white; border:none; padding:12px; border-radius:12px; font-weight:bold; cursor:pointer; margin-top:10px;">💾 บันทึกการตั้งค่าทริป</button>
                </form>
            </div>

            <!-- Manage Wallets Section -->
            <div class="trip-detail-section" style="padding:0 15px; border-top:1px solid #e2e8f0; margin-top:15px; padding-top:15px;">
                <h3 class="trip-section-title">👛 จัดการกระเป๋าเงินทริป</h3>
                <div id="settings-wallets-list" style="margin-bottom:12px;">
                    ${TravelState.wallets.map(w => `
                        <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; padding:8px 12px; border-radius:10px; margin-bottom:6px; font-size:12px;">
                            <span>💳 <b>${w.name}</b> (${w.currency}) · ยอดเริ่มต้น: ${tripFmtNum(w.initial_balance_foreign)} (${w.exclude_on_close ? '❌ ไม่นำมาคิดยอดรวม' : '✅ รวมยอด'})</span>
                            <button onclick="deleteWallet('${w.wallet_id}')" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:12px;">🗑️</button>
                        </div>
                    `).join('')}
                </div>
                
                <h4 style="margin:10px 0 6px 0; font-size:12px;">+ สร้างกระเป๋าเงินใหม่</h4>
                <form id="new-wallet-form" style="display:flex; flex-direction:column; gap:8px; background:#f1f5f9; padding:10px; border-radius:12px;">
                    <div style="display:flex; gap:6px;">
                        <input type="text" id="new-wallet-name" class="trip-input" placeholder="ชื่อกระเป๋า เช่น บัตร Travel Card" required style="flex:1;">
                        <select id="new-wallet-currency" class="trip-input" style="width:80px; appearance:auto;">
                            ${activeCurrencies.map(c=>`<option value="${c}">${c}</option>`).join('')}
                        </select>
                    </div>
                    <p style="margin:0; font-size:11px; color:#64748b;">เริ่มต้นที่ยอด 0 แล้วใช้ปุ่ม “เติมเงิน” เพื่อโอนจากบัญชีจริงเข้ากระเป๋าทริป</p>
                    <button type="button" onclick="createNewWallet()" style="background:#3b82f6; color:white; border:none; padding:8px; border-radius:8px; font-size:12px; font-weight:bold; cursor:pointer;">+ เพิ่มกระเป๋าเงิน</button>
                </form>
            </div>

            <!-- Close Trip / End Trip -->
            <div class="trip-detail-section" style="padding:0 15px; border-top:1px solid #e2e8f0; margin-top:15px; padding-top:15px; text-align:center;">
                <h3 class="trip-section-title" style="color:#ef4444;">🏁 สรุปและปิดทริป</h3>
                <p style="font-size:11px; color:#64748b;">ตรวจสรุปเงินเหลือและเลือกคืนบัญชีหรือย้ายไปทริปถัดไปก่อนยืนยันปิดทริป</p>
                <button class="btn-trip-close" onclick="openCloseTripModal('${trip.project_id}')" style="background:#ef4444; width:100%; font-weight:bold;">🏁 ตรวจสรุปและปิดทริป</button>
            </div>
        `;
    }

    container.innerHTML = headerHtml + contentHtml;
}

window.switchTravelTab = function(tabName) {
    TravelState.currentTripTab = tabName;
    renderTripDetailModal();
};
function buildRouteMap(expenses) {
    const locs = expenses.filter(e => e.latitude && e.longitude);
    if (!locs.length) return '<p class="trip-route-empty">💡 บันทึก GPS Location ตอนเพิ่มค่าใช้จ่ายเพื่อดูเส้นทาง</p>';

    return `<div class="trip-route-timeline">
        ${locs.map((e, i) => `
            <div class="trip-route-stop">
                <div class="trip-route-dot" style="background: ${getCategoryInfo(e.category_id).color}"></div>
                ${i < locs.length - 1 ? '<div class="trip-route-line"></div>' : ''}
                <div class="trip-route-info">
                    <div class="tri-name">📍 ${parseFloat(e.latitude).toFixed(4)}, ${parseFloat(e.longitude).toFixed(4)}</div>
                    <div class="tri-sub">${getCategoryInfo(e.category_id).icon} ${e.note || ''}</div>
                </div>
            </div>
        `).join('')}
    </div>`;
}

function renderTripDailyChart(expenses, byDay) {
    const canvas = document.getElementById('trip-daily-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    if (TravelState.expenseChart) {
        TravelState.expenseChart.destroy();
        TravelState.expenseChart = null;
    }

    const days   = Object.keys(byDay).sort();
    const totals = days.map(d => byDay[d].reduce((s, e) => s + parseFloat(e.amount_thb || 0), 0));

    const colors = ['#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD','#B0C4DE','#FFB347','#87CEEB','#98FB98'];

    TravelState.expenseChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: days.map(d => formatTripDate(d)),
            datasets: [{
                label: 'ค่าใช้จ่ายรายวัน (฿)',
                data: totals,
                backgroundColor: days.map((_, i) => colors[i % colors.length]),
                borderRadius: 10,
                borderSkipped: false,
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => `฿${tripFmtNum(ctx.parsed.y)}` } }
            },
            scales: {
                y: { ticks: { callback: v => `฿${tripFmtNum(v)}` }, grid: { color: 'rgba(0,0,0,0.05)' } },
                x: { grid: { display: false } }
            }
        }
    });
}

// ---- CLOSE TRIP (settle to main ledger) ----
async function closeTrip(projectId) {
    const trip = TravelState.trips.find(t => t.project_id === projectId) || TravelState.currentTrip;
    if (!trip) { showToast('ไม่พบข้อมูลทริป', 'error'); return; }

    // Use total_spent from the trip list (reliable, includes aggregation from backend)
    // Fallback: sum from loaded expenses if available and non-zero
    let totalSpent = parseFloat(trip.total_spent) || 0;
    if (totalSpent === 0 && TravelState.currentTrip?.project_id === projectId && TravelState.expenses.length > 0) {
        totalSpent = TravelState.expenses.reduce((s, e) => s + parseFloat(e.amount_thb || 0), 0);
    }

    // Build account picker HTML
    const accounts = (AppState.accounts || []);
    const accountOpts = accounts.length
        ? accounts.map(a => `<option value="${a.account_id}">${a.name}${a.bank_name ? ' (' + a.bank_name + ')' : ''}</option>`).join('')
        : '<option value="">-- ไม่มีบัญชี --</option>';

    // Show settlement dialog
    const theme = getTripTheme(trip.destination || 'default');
    const settlementHtml = `
        <div id="close-trip-overlay" style="
            position:fixed; inset:0; background:rgba(0,0,0,0.6); backdrop-filter:blur(6px);
            z-index:10000; display:flex; align-items:center; justify-content:center; padding:16px;
            animation: fadeInOverlay 0.2s ease;
        " onclick="if(event.target===this)document.getElementById('close-trip-overlay').remove()">
            <div style="
                background:#fff; border-radius:24px; box-shadow:0 24px 64px rgba(0,0,0,0.25);
                width:100%; max-width:440px; overflow:hidden;
                animation: slideUpModal 0.25s cubic-bezier(0.34,1.56,0.64,1);
            ">
                <div style="background:${theme.gradient}; padding:24px; color:#fff; text-align:center;">
                    <div style="font-size:2.5rem; margin-bottom:8px;">${theme.icon}</div>
                    <h2 style="margin:0 0 4px; font-size:1.3rem; font-weight:900;">🏁 จบทริป: ${trip.name}</h2>
                    <p style="margin:0; opacity:0.9; font-size:0.85rem;">บันทึกค่าใช้จ่ายรวมลงบัญชีหลัก</p>
                </div>
                <div style="padding:24px;">
                    <div style="
                        background:rgba(255,107,107,0.08); border:2px solid rgba(255,107,107,0.2);
                        border-radius:14px; padding:16px; text-align:center; margin-bottom:20px;
                    ">
                        <div style="font-size:0.8rem; color:#888; font-weight:600; margin-bottom:4px;">ค่าใช้จ่ายรวมทั้งทริป</div>
                        <div style="font-size:2rem; font-weight:900; color:#FF6B6B;">฿${tripFmtNum(totalSpent)}</div>
                    </div>
                    <div style="margin-bottom:16px;">
                        <label style="display:block; font-size:0.82rem; font-weight:700; color:#555; margin-bottom:6px;">
                            💳 บัญชีที่ใช้จ่าย (ตัดค่าใช้จ่ายออกจากบัญชีใด)
                        </label>
                        <select id="close-trip-account" class="trip-input" style="font-size:0.9rem;">
                            ${accountOpts}
                        </select>
                    </div>
                    <div style="margin-bottom:16px;">
                        <label style="display:block; font-size:0.82rem; font-weight:700; color:#555; margin-bottom:6px;">
                            📝 หมายเหตุ
                        </label>
                        <input type="text" id="close-trip-note" class="trip-input"
                            value="รวมค่าใช้จ่ายทริป ${trip.name} (จบ ${new Date().toLocaleDateString('th-TH')})"
                            placeholder="หมายเหตุ...">
                    </div>
                    <div style="display:flex; gap:10px; justify-content:flex-end;">
                        <button class="btn-travel-secondary" onclick="document.getElementById('close-trip-overlay').remove()">
                            ยกเลิก
                        </button>
                        <button class="btn-trip-close" onclick="confirmCloseTrip('${projectId}', ${totalSpent})" style="flex:none; padding:10px 20px;">
                            🏁 ยืนยันจบทริป
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Inject dialog
    const div = document.createElement('div');
    div.innerHTML = settlementHtml;
    document.body.appendChild(div.firstElementChild);
}

async function confirmCloseTrip(projectId, totalSpent) {
    const overlay = document.getElementById('close-trip-overlay');
    const accountId = document.getElementById('close-trip-account')?.value;
    const note = document.getElementById('close-trip-note')?.value || '';
    const trip = TravelState.trips.find(t => t.project_id === projectId) || TravelState.currentTrip;

    if (!accountId) { showToast('กรุณาเลือกบัญชี', 'error'); return; }
    if (!totalSpent || totalSpent <= 0) {
        showToast('ไม่มีค่าใช้จ่ายในทริปนี้ จะปิดทริปโดยไม่บันทึกบัญชี', 'info');
    }

    // Disable button to prevent double-click
    const btn = overlay?.querySelector('.btn-trip-close');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ กำลังบันทึก...'; }

    try {
        const headers = { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(getUserIdHeader()) };

        // Step 1: Mark trip as closed
        const closeRes = await fetch(`${API_BASE}/api/trips`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                project_id: projectId,
                status: 'closed',
                name: trip?.name,
                total_budget: trip?.total_budget,
                start_date: trip?.start_date,
                end_date: trip?.end_date,
                destination: trip?.destination,
                members: trip?.members,
            })
        });
        const closeData = await closeRes.json();
        if (!closeData.success) {
            showToast('เกิดข้อผิดพลาดในการจบทริป: ' + (closeData.error || ''), 'error');
            if (btn) { btn.disabled = false; btn.textContent = '🏁 ยืนยันจบทริป'; }
            return;
        }

        // Step 2: Record lump-sum expense to main ledger
        if (totalSpent > 0 && accountId) {
            // Find a travel category or fall back to first expense category
            const travelCatId = (AppState.categories || []).find(c =>
                (c.name || '').toLowerCase().includes('travel') ||
                (c.name || '').toLowerCase().includes('ท่องเที่ยว') ||
                (c.name || '').toLowerCase().includes('เดินทาง')
            )?.category_id || (AppState.categories?.[0]?.category_id) || 'Cat_Uncategorized';

            const entityId = AppState.allowedEntities?.[0] || null;
            const txDate   = new Date().toISOString().slice(0, 10);
            const txPayload = {
                account_id:    accountId,
                date:          txDate,
                time:          null,
                total_amount:  totalSpent,
                statement_desc: `🌏 ค่าใช้จ่ายทริป: ${trip?.name}`,
                status:        'CONFIRMED',
                source:        'WEB_GRID',
                details: [{
                    amount:      totalSpent,
                    fee:         0,
                    wht:         0,
                    category_id: travelCatId,
                    project_id:  projectId,
                    entity_id:   entityId,
                    note:        note || `รวมค่าใช้จ่ายจากทริป ${trip?.name}`,
                }]
            };

            const txRes = await fetch(`${API_BASE}/api/transactions`, {
                method: 'POST', headers,
                body: JSON.stringify(txPayload)
            });
            const txData = await txRes.json();
            if (!txData.success && !txData.skipped) {
                console.warn('Ledger post warning:', txData);
                // Non-fatal — trip is already closed
            }
        }

        // Done
        if (overlay) overlay.remove();
        showToast('🏁 จบทริปและบันทึกลงบัญชีหลักแล้ว!', 'success');
        closeTripDetailModal();
        loadTrips();

        // Refresh main transaction list if visible
        if (AppState.activeView === 'transactions') {
            try { loadTransactions?.(); } catch (_) {}
        }

    } catch (e) {
        console.error('closeTrip error:', e);
        showToast('ไม่สามารถจบทริปได้: ' + e.message, 'error');
        if (btn) { btn.disabled = false; btn.textContent = '🏁 ยืนยันจบทริป'; }
    }
}

async function closeTripMember(projectId, memberName, amount) {
    const trip = TravelState.trips.find(t => t.project_id === projectId) || TravelState.currentTrip;
    if (!trip) { showToast('ไม่พบข้อมูลทริป', 'error'); return; }

    const accounts = (AppState.accounts || []);
    const accountOpts = accounts.length
        ? accounts.map(a => `<option value="${a.account_id}">${a.name}${a.bank_name ? ' (' + a.bank_name + ')' : ''}</option>`).join('')
        : '<option value="">-- ไม่มีบัญชี --</option>';

    const theme = getTripTheme(trip.destination || 'default');
    const settlementHtml = `
        <div id="close-trip-member-overlay" style="
            position:fixed; inset:0; background:rgba(0,0,0,0.6); backdrop-filter:blur(6px);
            z-index:10000; display:flex; align-items:center; justify-content:center; padding:16px;
            animation: fadeInOverlay 0.2s ease;
        " onclick="if(event.target===this)document.getElementById('close-trip-member-overlay').remove()">
            <div style="
                background:#fff; border-radius:24px; box-shadow:0 24px 64px rgba(0,0,0,0.25);
                width:100%; max-width:440px; overflow:hidden;
                animation: slideUpModal 0.25s cubic-bezier(0.34,1.56,0.64,1);
            ">
                <div style="background:${theme.gradient}; padding:24px; color:#fff; text-align:center;">
                    <h2 style="margin:0 0 4px; font-size:1.3rem; font-weight:900;">👤 เคลียร์ยอดของ: ${memberName}</h2>
                    <p style="margin:0; opacity:0.9; font-size:0.85rem;">บันทึกเฉพาะส่วนของ ${memberName}</p>
                </div>
                <div style="padding:24px;">
                    <div style="
                        background:rgba(255,107,107,0.08); border:2px solid rgba(255,107,107,0.2);
                        border-radius:14px; padding:16px; text-align:center; margin-bottom:20px;
                    ">
                        <div style="font-size:0.8rem; color:#888; font-weight:600; margin-bottom:4px;">ยอดใช้จ่ายของ ${memberName}</div>
                        <div style="font-size:2rem; font-weight:900; color:#FF6B6B;">฿${tripFmtNum(amount)}</div>
                    </div>
                    <div style="margin-bottom:16px;">
                        <label style="display:block; font-size:0.82rem; font-weight:700; color:#555; margin-bottom:6px;">
                            💳 ตัดจากบัญชี
                        </label>
                        <select id="close-member-account" class="trip-input" style="font-size:0.9rem;">
                            ${accountOpts}
                        </select>
                    </div>
                    <div style="margin-bottom:16px;">
                        <label style="display:block; font-size:0.82rem; font-weight:700; color:#555; margin-bottom:6px;">
                            📝 หมายเหตุ
                        </label>
                        <input type="text" id="close-member-note" class="trip-input"
                            value="ยอดค่าใช้จ่าย ${memberName} ทริป ${trip.name}"
                            placeholder="หมายเหตุ...">
                    </div>
                    <div style="display:flex; gap:10px; justify-content:flex-end;">
                        <button class="btn-travel-secondary" onclick="document.getElementById('close-trip-member-overlay').remove()">ยกเลิก</button>
                        <button class="btn-trip-close" onclick="confirmCloseTripMember('${projectId}', '${memberName}', ${amount})" style="flex:none; padding:10px 20px;">✅ ยืนยันบันทึกยอด</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    const div = document.createElement('div');
    div.innerHTML = settlementHtml;
    document.body.appendChild(div.firstElementChild);
}

async function confirmCloseTripMember(projectId, memberName, amount) {
    const overlay = document.getElementById('close-trip-member-overlay');
    const accountId = document.getElementById('close-member-account')?.value;
    const note = document.getElementById('close-member-note')?.value || '';
    const trip = TravelState.trips.find(t => t.project_id === projectId) || TravelState.currentTrip;

    if (!accountId) { showToast('กรุณาเลือกบัญชี', 'error'); return; }
    if (!amount || amount <= 0) {
        showToast('ไม่มียอดใช้จ่าย', 'info'); return;
    }

    const btn = overlay?.querySelector('.btn-trip-close');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ กำลังบันทึก...'; }

    try {
        const headers = { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(getUserIdHeader()) };
        const travelCatId = (AppState.categories || []).find(c =>
            (c.name || '').toLowerCase().includes('travel') ||
            (c.name || '').toLowerCase().includes('ท่องเที่ยว') ||
            (c.name || '').toLowerCase().includes('เดินทาง')
        )?.category_id || (AppState.categories?.[0]?.category_id) || 'Cat_Uncategorized';

        const entityId = AppState.allowedEntities?.[0] || null;
        const txDate   = new Date().toISOString().slice(0, 10);
        const txPayload = {
            account_id:    accountId,
            date:          txDate,
            time:          null,
            total_amount:  amount,
            statement_desc: `🌏 ยอดทริป ${trip?.name} (${memberName})`,
            status:        'CONFIRMED',
            source:        'WEB_GRID',
            details: [{
                amount:      amount,
                fee:         0,
                wht:         0,
                category_id: travelCatId,
                project_id:  projectId,
                entity_id:   entityId,
                note:        note,
            }]
        };

        const txRes = await fetch(`${API_BASE}/api/transactions`, {
            method: 'POST', headers,
            body: JSON.stringify(txPayload)
        });
        const txData = await txRes.json();
        if (!txData.success && !txData.skipped) {
            console.warn('Ledger post warning:', txData);
        }

        if (overlay) overlay.remove();
        showToast('✅ บันทึกยอดของ ' + memberName + ' ลงบัญชีแล้ว!', 'success');
        
        // Refresh transaction list if visible
        if (AppState.activeView === 'transactions') {
            try { loadTransactions?.(); } catch (_) {}
        }
    } catch (e) {
        console.error(e);
        showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
        if (btn) { btn.disabled = false; btn.textContent = '✅ ยืนยันบันทึกยอด'; }
    }
}

function closeTripDetailModal() {
    const modal = document.getElementById('trip-detail-modal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('active'); }
    if (TravelState.expenseChart) { TravelState.expenseChart.destroy(); TravelState.expenseChart = null; }
    TravelState.currentTrip = null;
}

// ---- NEW TRIP MODAL ----
window.openNewTripModal = function() {
    const today    = new Date().toISOString().slice(0, 10);
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

    const themeOptions = TRIP_THEMES.map(t =>
        `<div data-theme="${t.id}" onclick="selectTripTheme('${t.id}', this)" title="${t.label}" class="theme-pick-btn" style="width: 30px; height: 30px; border-radius: 50%; background: ${t.gradient}; cursor: pointer; border: 2px solid transparent; flex-shrink: 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"></div>`
    ).join('');

    document.getElementById('new-trip-modal-body').innerHTML = `
        <form id="new-trip-form" style="display: flex; flex-direction: column; gap: 4px;">
            <div class="form-row" style="display: flex; gap: 8px;">
                <div class="form-group" style="flex: 7; margin-bottom: 0;">
                    <label style="margin-bottom: 2px; font-size: 11px;">Trip Name *</label>
                    <input type="text" id="new-trip-name" placeholder="เช่น ญี่ปุ่น 2025" required class="trip-input" style="padding: 4px 8px; font-size: 13px;">
                </div>
                <div class="form-group" style="flex: 3; margin-bottom: 0;">
                    <label style="margin-bottom: 2px; font-size: 11px;">Type</label>
                    <select id="new-trip-status" class="trip-input" style="padding: 4px 8px; font-size: 13px;">
                        <option value="active">Ongoing</option>
                        <option value="planned">Future Plan</option>
                    </select>
                </div>
            </div>
            
            <div class="form-row" style="display: flex; flex-direction: column; gap: 4px;">
                <div class="form-group" style="margin-bottom: 0;">
                    <label style="margin-bottom: 2px; font-size: 11px;">เรทเงิน (Exchange Rate)</label>
                    <input type="number" step="0.0001" id="new-trip-exchange-rate" placeholder="เช่น 0.22 (เรทเยนเป็นบาท)" class="trip-input" style="padding: 4px 8px; font-size: 13px;">
                </div>
            </div>
            
            <div class="form-row" style="display: flex; flex-direction: column; gap: 4px;">
                <div class="form-group" style="margin-bottom: 0;">
                    <label style="margin-bottom: 2px; font-size: 11px;">Destination</label>
                    <input type="text" id="new-trip-destination" placeholder="เช่น BKK-HKD HKD CTS BKK" class="trip-input" style="padding: 4px 8px; font-size: 13px;">
                </div>
                <div class="form-group" style="margin-bottom: 0; margin-top: 10px;">
                    <label style="margin-bottom: 6px; font-size: 11px; display:block;">Highlights (กิจกรรม/จุดเด่น)</label>
                    <div id="new-trip-highlights-container" style="display: flex; flex-wrap: wrap; gap: 8px; max-height: 120px; overflow-y: auto; padding: 5px;">
                        ${TRIP_HIGHLIGHTS.map(h => `
                            <div class="highlight-item" data-id="${h.id}" onclick="toggleHighlightSelection(this)" style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 60px; height: 60px; border: 2px solid #e2e8f0; border-radius: 12px; cursor: pointer; transition: all 0.2s; background: white;">
                                <img src="${h.img}" style="width: 32px; height: 32px; border-radius: 6px; object-fit: cover;" onerror="this.src='https://placehold.co/100x100?text=${h.label}'">
                                <span style="font-size: 9px; text-align: center; margin-top: 2px; line-height: 1.1; color: #475569;">${h.label}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="form-group" style="margin-bottom: 0;">
                    <label style="margin-bottom: 2px; font-size: 11px;">Members</label>
                    <input type="text" id="new-trip-members" placeholder="เช่น นอร์ท, ปาน" class="trip-input" style="padding: 4px 8px; font-size: 13px;">
                </div>
            </div>

            <div class="form-row" style="display: flex; gap: 8px; align-items: flex-end;">
                <div class="form-group" style="flex: 1; margin-bottom: 0;">
                    <label style="margin-bottom: 2px; font-size: 11px;">Start Date</label>
                    <input type="date" id="new-trip-start" value="${today}" class="trip-input" style="padding: 4px 8px; font-size: 13px; height: 36px; box-sizing: border-box;">
                </div>
                <div class="form-group" style="flex: 1; margin-bottom: 0;">
                    <label style="margin-bottom: 2px; font-size: 11px;">End Date</label>
                    <input type="date" id="new-trip-end" value="${nextWeek}" class="trip-input" style="padding: 4px 8px; font-size: 13px; height: 36px; box-sizing: border-box;">
                </div>
                <div class="form-group" style="flex: 0 0 auto; margin-bottom: 0; padding-bottom: 0px;">
                    <button type="button" onclick="openThemePickerSubModal()" style="width: 44px; height: 36px; border-radius: 8px; background: #e0f2fe; border: 2px solid #3b82f6; display: flex; align-items: center; justify-content: center; font-size: 18px; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.1); padding: 0; box-sizing: border-box;" title="เลือกธีมและรูปภาพ">🎨</button>
                </div>
            </div>

            <!-- Hidden inputs to store selection from sub-modal -->
            <input type="hidden" id="new-trip-banner" value="assets/images/banner_japan.jpg">
            <input type="hidden" id="new-trip-thumb" value="assets/images/thumb_girl.jpg">
            <input type="hidden" id="new-trip-icon" value="assets/images/cloud_smile_1.jpg">
            <input type="hidden" id="new-trip-theme" value="pastel-pink">
        </form>
    `;

    // Ensure sub-modal exists in body
    if (!document.getElementById('theme-picker-submodal')) {
        const subModalHtml = `
            <div id="theme-picker-submodal" class="travel-modal-overlay hidden" style="z-index: 10001; display:flex; align-items:center; justify-content:center;">
                <div class="travel-modal-wrap travel-modal-sm" style="max-height: 90vh; overflow-y: auto; background: white; border-radius: 16px; padding: 10px 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); width: 90%; max-width: 400px; position: relative;">
                    <div class="travel-modal-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
                        <h2 style="margin:0; font-size: 15px; color: #3b82f6;">🎨 เลือกธีมและรูปภาพ</h2>
                        <button class="travel-modal-close" onclick="closeThemePickerSubModal()" style="background:none; border:none; font-size:16px; cursor:pointer; color:#94a3b8; padding:0;">✕</button>
                    </div>
                    <div class="travel-modal-body" style="display: flex; flex-direction: column; gap: 6px;">
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 2px; font-size: 12px; font-weight: bold; color: #475569; display:block;">Banner (หน้าปก)</label>
                            <div style="display:flex; flex-wrap:wrap; gap:4px;">
                                ${PRESET_BANNERS.map(b => 
                                    `<img src="${b}" class="banner-pick-img-sub" onclick="document.querySelectorAll('.banner-pick-img-sub').forEach(el=>el.style.border='2px solid transparent'); this.style.border='3px solid #3b82f6'; document.getElementById('new-trip-banner').value='${b}';" style="width:100px; height:60px; object-fit:cover; border-radius:6px; cursor:pointer; border:2px solid transparent;">`
                                ).join('')}
                            </div>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 2px; font-size: 12px; font-weight: bold; color: #475569; display:block;">Thumb (รูปเล็ก)</label>
                            <div style="display:flex; flex-wrap:wrap; gap:4px;">
                                ${PRESET_THUMBS.map(b => 
                                    `<img src="${b}" class="thumb-pick-img-sub" onclick="document.querySelectorAll('.thumb-pick-img-sub').forEach(el=>el.style.border='2px solid transparent'); this.style.border='3px solid #3b82f6'; document.getElementById('new-trip-thumb').value='${b}';" style="width:50px; height:50px; object-fit:cover; border-radius:6px; cursor:pointer; border:2px solid transparent;">`
                                ).join('')}
                            </div>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 2px; font-size: 12px; font-weight: bold; color: #475569; display:block;">Icon (เมฆ)</label>
                            <div style="display:flex; flex-wrap:wrap; gap:4px;">
                                ${PRESET_ICONS.map(b => 
                                    `<img src="${b}" class="icon-pick-img-sub" onclick="document.querySelectorAll('.icon-pick-img-sub').forEach(el=>el.style.border='2px solid transparent'); this.style.border='3px solid #3b82f6'; document.getElementById('new-trip-icon').value='${b}';" style="width:40px; height:40px; object-fit:cover; border-radius:50%; cursor:pointer; border:2px solid transparent;">`
                                ).join('')}
                            </div>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 2px; font-size: 12px; font-weight: bold; color: #475569; display:block;">Color Theme (โทนสี)</label>
                            <div style="display:flex; flex-wrap:wrap; gap:4px;">
                                ${themeOptions}
                            </div>
                        </div>
                    </div>
                    <div class="travel-modal-footer" style="display: flex; justify-content: center; margin-top: 20px;">
                        <button onclick="closeThemePickerSubModal()" style="width: 100%; background: #10b981; color: white; border: none; padding: 12px; border-radius: 12px; font-weight: 600; font-size: 15px; cursor: pointer; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.3);">✔️ ยืนยัน / ปิด</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', subModalHtml);
    }
    
    // Auto-select defaults in submodal based on hidden input values
    setTimeout(() => {
        const bVal = document.getElementById('new-trip-banner').value;
        const tVal = document.getElementById('new-trip-thumb').value;
        const iVal = document.getElementById('new-trip-icon').value;
        const thVal = document.getElementById('new-trip-theme').value;
        
        document.querySelectorAll('.banner-pick-img-sub').forEach(el => { if(el.src.includes(bVal)) el.style.border='3px solid #3b82f6'; else el.style.border='2px solid transparent'; });
        document.querySelectorAll('.thumb-pick-img-sub').forEach(el => { if(el.src.includes(tVal)) el.style.border='3px solid #3b82f6'; else el.style.border='2px solid transparent'; });
        document.querySelectorAll('.icon-pick-img-sub').forEach(el => { if(el.src.includes(iVal)) el.style.border='3px solid #3b82f6'; else el.style.border='2px solid transparent'; });
        document.querySelectorAll('.theme-pick-btn').forEach(el => { if(el.dataset.theme === thVal) el.style.border='3px solid #3b82f6'; else el.style.border='2px solid transparent'; });
    }, 100);

    const modal = document.getElementById('new-trip-modal');
    if (modal) { modal.classList.remove('hidden'); modal.classList.add('active'); }
}

function selectTripTheme(themeId, btn) {
    document.querySelectorAll('.theme-pick-btn').forEach(b => b.style.border = '3px solid transparent');
    btn.style.border = '3px solid #3b82f6';
    document.getElementById('new-trip-theme').value = themeId;
}

window.closeNewTripModal = function() {
    const modal = document.getElementById('new-trip-modal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('active'); }
}

window.openThemePickerSubModal = function() {
    const modal = document.getElementById('theme-picker-submodal');
    if (modal) modal.classList.remove('hidden');
};

window.closeThemePickerSubModal = function() {
    const modal = document.getElementById('theme-picker-submodal');
    if (modal) modal.classList.add('hidden');
};

window.saveNewTrip = async function() {
    const name = document.getElementById('new-trip-name')?.value?.trim();
    if (!name) { showToast('กรุณาใส่ชื่อทริป', 'error'); return; }

    const membersRaw = document.getElementById('new-trip-members')?.value || '';
    const members    = membersRaw.split(',').map(m => m.trim()).filter(Boolean);

    // "destination" field stores the theme id
    const payload = {
        name,
        destination:  document.getElementById('new-trip-destination')?.value || '',
        start_date:   document.getElementById('new-trip-start')?.value || null,
        end_date:     document.getElementById('new-trip-end')?.value   || null,
        total_budget: 0,
        exchange_rate: document.getElementById('new-trip-exchange-rate')?.value || 1.0,
        members:      JSON.stringify(members),
        note:         '',
        status:       document.getElementById('new-trip-status')?.value || 'active',
        color_theme:  document.getElementById('new-trip-theme')?.value || 'pastel-pink',
        theme_banner: document.getElementById('new-trip-banner')?.value || '',
        theme_thumb:  document.getElementById('new-trip-thumb')?.value || '',
        theme_icon:   document.getElementById('new-trip-icon')?.value || '',
    };
    
    // Get selected highlights
    const selectedHighlights = Array.from(document.querySelectorAll('#new-trip-highlights-container .selected-highlight')).map(el => el.getAttribute('data-id'));
    payload.highlights = JSON.stringify(selectedHighlights);

    try {
        const headers = { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(getUserIdHeader()) };
        const res  = await fetch(`${API_BASE}/api/trips`, { method: 'POST', headers, body: JSON.stringify(payload) });
        if (!res.ok) {
            const errText = await res.text();
            showToast('เกิดข้อผิดพลาด: ' + errText, 'error');
            return;
        }
        const data = await res.json();
        if (data.success || data.project_id) {
            showToast('✅ สร้างทริปใหม่สำเร็จ!', 'success');
            closeNewTripModal();
            loadTrips();
        } else {
            showToast('เกิดข้อผิดพลาด: ' + (data.error || ''), 'error');
        }
    } catch (e) {
        console.error('saveNewTrip exception:', e);
        showToast('ไม่สามารถบันทึกได้: ' + e.message, 'error');
    }
}

function getUserIdHeader() {
    if (typeof AppState !== 'undefined' && AppState.userId) return AppState.userId;
    return localStorage.getItem('current_user_id') || 'Puii';
}

function getTravelApiBase() {
    if (typeof API_BASE !== 'undefined') return API_BASE;
    return 'https://record-revenue.9nimz.workers.dev';
}

window.deleteTrip = async function(projectId) {
    if(!confirm('คุณแน่ใจหรือไม่ที่จะลบทริปนี้? ข้อมูลทั้งหมดจะถูกลบและไม่สามารถกู้คืนได้')) return;
    try {
        const res = await fetch(`${getTravelApiBase()}/api/trips/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-id': getUserIdHeader() },
            body: JSON.stringify({ project_id: projectId })
        });
        if(res.ok) {
            showToast('ลบทริปสำเร็จ', 'success');
            loadTrips(); // Reload after delete
        } else {
            showToast('ลบทริปไม่สำเร็จ', 'error');
        }
    } catch(err) {
        console.error('deleteTrip exception:', err);
        showToast('เกิดข้อผิดพลาดในการลบ: ' + err.message, 'error');
    }
}

window.endTrip = async function(projectId) {
    if(!confirm('คุณต้องการจบทริปนี้ใช่หรือไม่? ทริปที่จบแล้วจะไม่สามารถแก้ไขค่าใช้จ่ายได้อีก')) return;
    try {
        const res = await fetch(`${getTravelApiBase()}/api/trips`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-id': getUserIdHeader() },
            body: JSON.stringify({ project_id: projectId, status: 'closed' })
        });
        if(res.ok) {
            showToast('จบทริปสำเร็จ', 'success');
            loadTrips();
        } else {
            showToast('บันทึกไม่สำเร็จ', 'error');
        }
    } catch(err) {
        console.error(err);
        showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
    }
}


// ---- ADD EXPENSE MODAL ----
function openAddExpenseModal(projectId, stopId = '') {
    const today = new Date().toISOString().slice(0, 10);
    const trip  = TravelState.trips.find(t => t.project_id === projectId) || TravelState.currentTrip;
    let members = [];
    try { if(trip?.members) members = JSON.parse(trip.members); } 
    catch(e) { members = trip?.members ? trip.members.split(',').map(m => m.trim()) : []; }

    const rate = parseFloat(trip?.exchange_rate) || 1.0;

    const catOpts = EXPENSE_CATEGORIES.map(c =>
        `<button type="button" class="exp-cat-btn" data-cat="${c.id}" onclick="selectExpCat('${c.id}', this)" style="--cat-color:${c.color}">
            <span>${c.icon}</span><span>${c.label}</span>
        </button>`
    ).join('');

    const memberOpts = members.length
        ? members.map(m => `<option value="${m}">${m}</option>`).join('')
        : '<option value="">ไม่ระบุ</option>';

    // Wallet options dropdown
    const walletOpts = TravelState.wallets && TravelState.wallets.length > 0
        ? `<option value="">-- ไม่ใช้กระเป๋าเงิน (จ่ายบาทตรงๆ) --</option>` + TravelState.wallets.map(w => `<option value="${w.wallet_id}" data-currency="${w.currency}" data-rate="${(w.initial_balance_thb / (w.initial_balance_foreign || 1)).toFixed(4)}">${w.name} (${w.currency})</option>`).join('')
        : '<option value="">-- ไม่มีกระเป๋าเงินที่เปิดใช้งาน --</option>';

    document.getElementById('add-expense-modal-body').innerHTML = `
        <form id="add-expense-form">
            <input type="hidden" id="exp-project-id" value="${projectId}">
            <input type="hidden" id="exp-stop-id" value="${stopId}">
            <div class="form-group">
                <label>ประเภท *</label>
                <div class="exp-cat-picker">${catOpts}</div>
                <input type="hidden" id="exp-category" value="">
            </div>

            <div class="form-group">
                <label>กระเป๋าเงินที่ใช้จ่าย (Wallet)</label>
                <select id="exp-wallet-id" class="trip-input" onchange="onWalletSelectChange(this)" style="appearance:auto;">
                    ${walletOpts}
                </select>
            </div>
            
            <div class="form-group" style="background:#f1f5f9; padding:10px; border-radius:8px;">
                <label style="display:flex; justify-content:space-between;">
                    <span>สกุลเงินที่จ่าย</span>
                    <label style="font-size:11px; display:flex; align-items:center; gap:4px; font-weight:normal; cursor:pointer;">
                        <input type="checkbox" id="exp-use-foreign" onchange="toggleForeignCurrency()"> จ่ายด้วยเงิน ตปท.
                    </label>
                </label>
                
                <div id="foreign-currency-wrap" style="display:none; margin-top:8px;">
                    <div style="display:flex; gap:10px; margin-bottom:8px;">
                        <div style="flex:2;">
                            <label style="font-size:11px;">ยอดเงิน ตปท.</label>
                            <input type="number" id="exp-amount-foreign" placeholder="0.00" min="0" step="0.01" class="trip-input exp-amount-big" style="color:#0ea5e9;" oninput="calcThbFromForeign()">
                        </div>
                        <div style="flex:1;">
                            <label style="font-size:11px;">เรทเงิน (Rate)</label>
                            <input type="number" id="exp-custom-rate" value="${rate}" step="0.0001" class="trip-input" style="height:44px;" oninput="calcThbFromForeign()">
                        </div>
                    </div>
                </div>
                
                <label style="font-size:11px; margin-top:4px;">ยอดเงินบาท (THB) *</label>
                <input type="number" id="exp-amount" placeholder="0.00" min="0" step="0.01" required class="trip-input exp-amount-big">
            </div>

            <div class="form-group">
                <label>รายละเอียด / Note</label>
                <input type="text" id="exp-note" placeholder="เช่น อาหารกลางวัน ราเมง" class="trip-input">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>วันที่</label>
                    <input type="date" id="exp-date" value="${today}" class="trip-input">
                </div>
                <div class="form-group">
                    <label>ผู้จ่าย (Member)</label>
                    <select id="exp-member" class="trip-input">
                        ${memberOpts}
                        <option value="ฉัน">ฉัน</option>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label>📍 Location</label>
                <div class="location-row">
                    <input type="text" id="exp-location-name" placeholder="ชื่อสถานที่ (Optional)" class="trip-input">
                    <button type="button" class="btn-get-location" onclick="getCurrentLocation()">📍 GPS</button>
                </div>
                <input type="hidden" id="exp-lat">
                <input type="hidden" id="exp-lng">
                <div id="location-status" class="location-status"></div>
            </div>
            <div class="form-group">
                <label>📸 ถ่ายรูปสลิป / ที่เที่ยว</label>
                <div class="receipt-upload-area" id="receipt-upload-area" onclick="document.getElementById('exp-receipt').click()">
                    <span id="receipt-preview-text">📷 แตะเพื่อถ่ายรูปหรืออัพโหลด</span>
                    <img id="receipt-preview-img" src="" alt="" style="display:none; max-height:120px; border-radius:8px; margin-top:8px;">
                </div>
                <div style="margin-top: 8px; text-align: center;">
                    <button type="button" id="btn-scan-receipt" class="btn-travel-secondary" style="display:none; width:100%;" onclick="scanSlipWithAI()">✨ สแกนยอดเงินด้วย AI</button>
                </div>
                <input type="file" id="exp-receipt" accept="image/*" capture="environment" style="display:none" onchange="previewReceipt(this)">
            </div>
        </form>
    `;

    window.onWalletSelectChange = function(select) {
        const opt = select.options[select.selectedIndex];
        const useForeign = document.getElementById('exp-use-foreign');
        const currencyWrap = document.getElementById('foreign-currency-wrap');
        const rateInput = document.getElementById('exp-custom-rate');
        const thbInput = document.getElementById('exp-amount');
        
        if (select.value) {
            useForeign.checked = true;
            currencyWrap.style.display = 'block';
            thbInput.readOnly = true;
            thbInput.style.background = '#e2e8f0';
            
            const rate = opt.getAttribute('data-rate');
            rateInput.value = rate;
            calcThbFromForeign();
        } else {
            useForeign.checked = false;
            currencyWrap.style.display = 'none';
            thbInput.readOnly = false;
            thbInput.style.background = 'white';
            document.getElementById('exp-amount-foreign').value = '';
        }
    };

    const modal = document.getElementById('add-expense-modal');
    if (modal) { modal.classList.remove('hidden'); modal.classList.add('active'); }
}

window.toggleForeignCurrency = function() {
    const isForeign = document.getElementById('exp-use-foreign').checked;
    const wrap = document.getElementById('foreign-currency-wrap');
    const thbInput = document.getElementById('exp-amount');
    
    if (isForeign) {
        wrap.style.display = 'block';
        thbInput.readOnly = true;
        thbInput.style.background = '#e2e8f0';
    } else {
        wrap.style.display = 'none';
        thbInput.readOnly = false;
        thbInput.style.background = 'white';
        document.getElementById('exp-amount-foreign').value = '';
    }
}

window.calcThbFromForeign = function() {
    const fVal = parseFloat(document.getElementById('exp-amount-foreign').value) || 0;
    const rate = parseFloat(document.getElementById('exp-custom-rate').value) || 0;
    const thbInput = document.getElementById('exp-amount');
    if (fVal > 0 && rate > 0) {
        thbInput.value = (fVal * rate).toFixed(2);
    } else {
        thbInput.value = '';
    }
}


function selectExpCat(catId, btn) {
    document.querySelectorAll('.exp-cat-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    document.getElementById('exp-category').value = catId;
}

function closeAddExpenseModal() {
    const modal = document.getElementById('add-expense-modal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('active'); }
}

function previewReceipt(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = document.getElementById('receipt-preview-img');
        const txt = document.getElementById('receipt-preview-text');
        const btnScan = document.getElementById('btn-scan-receipt');
        if (img) { img.src = e.target.result; img.style.display = 'block'; }
        if (txt) txt.style.display = 'none';
        if (btnScan) btnScan.style.display = 'block';
        TravelState.currentReceiptBase64 = e.target.result;
    };
    reader.readAsDataURL(file);
}

async function scanSlipWithAI() {
    if (!TravelState.currentReceiptBase64) return;
    const btn = document.getElementById('btn-scan-receipt');
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ กำลังสแกน...'; }
    
    try {
        let base64 = TravelState.currentReceiptBase64;
        if (base64.includes(',')) base64 = base64.split(',')[1];

        const res = await fetch(`${API_BASE}/api/slip-ocr`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(getUserIdHeader()) },
            body: JSON.stringify({ imageBase64: base64 })
        });
        const data = await res.json();
        
        if (data.amount) {
            const amountInput = document.getElementById('exp-amount');
            if (amountInput) amountInput.value = data.amount;
            if (data.date) {
                const dateInput = document.getElementById('exp-date');
                if (dateInput) dateInput.value = data.date;
            }
            showToast('✅ สแกนยอดเงินสำเร็จ: ' + data.amount + ' บาท', 'success');
        } else {
            showToast('❌ ไม่พบยอดเงินในสลิป', 'error');
        }
    } catch (e) {
        console.error('Scan error:', e);
        showToast('เกิดข้อผิดพลาดในการสแกน', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '✨ สแกนยอดเงินด้วย AI'; }
    }
}

function getCurrentLocation() {
    const status = document.getElementById('location-status');
    if (status) status.textContent = '📡 กำลังหาตำแหน่ง...';

    if (!navigator.geolocation) {
        if (status) status.textContent = '❌ Browser ไม่รองรับ GPS';
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            document.getElementById('exp-lat').value = pos.coords.latitude;
            document.getElementById('exp-lng').value = pos.coords.longitude;
            if (status) status.innerHTML = `✅ พิกัด: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)} <a href="https://maps.google.com/?q=${pos.coords.latitude},${pos.coords.longitude}" target="_blank">🗺️ ดูแผนที่</a>`;
        },
        () => { if (status) status.textContent = '❌ ไม่สามารถหาตำแหน่งได้'; },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

async function saveExpense() {
    const projectId  = document.getElementById('exp-project-id')?.value;
    const amountRaw  = parseFloat(document.getElementById('exp-amount')?.value);
    const categoryId = document.getElementById('exp-category')?.value || 'other';

    if (!projectId || !amountRaw || amountRaw <= 0) {
        showToast('กรุณาใส่จำนวนเงิน', 'error');
        return;
    }

    // Match backend field names exactly
    const payload = {
        project_id:   projectId,
        amount_thb:   amountRaw,
        amount_foreign: parseFloat(document.getElementById('exp-amount-foreign')?.value) || null,
        stop_id:      document.getElementById('exp-stop-id')?.value || null,
        category_id:  categoryId,
        note:         document.getElementById('exp-note')?.value || '',
        expense_date: document.getElementById('exp-date')?.value || new Date().toISOString().slice(0, 10),
        member_id:    document.getElementById('exp-member')?.value || null,
        latitude:     parseFloat(document.getElementById('exp-lat')?.value) || null,
        longitude:    parseFloat(document.getElementById('exp-lng')?.value) || null,
        receipt_image_url: TravelState.currentReceiptBase64 || null,
        wallet_id:    document.getElementById('exp-wallet-id')?.value || null,
        approved:     TravelState.isGuest ? 0 : 1
    };

    try {
        const headers = { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(getUserIdHeader()) };
        const res  = await fetch(`${API_BASE}/api/trip-expenses`, { method: 'POST', headers, body: JSON.stringify(payload) });
        const data = await res.json();
        if (data.success || data.trip_expense_id) {
            showToast('✅ บันทึกค่าใช้จ่ายสำเร็จ!', 'success');
            closeAddExpenseModal();
            if (TravelState.currentTrip?.project_id === projectId) {
                openTripDetail(projectId);
            } else {
                loadTrips();
            }
        } else {
            showToast('เกิดข้อผิดพลาด: ' + (data.error || ''), 'error');
        }
    } catch (e) {
        console.error(e);
        showToast('ไม่สามารถบันทึกได้', 'error');
    }
}

async function deleteExpense(tripExpenseId, projectId) {
    if (!confirm('ลบรายการนี้?')) return;
    try {
        const headers = { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(getUserIdHeader()) };
        const res = await fetch(`${API_BASE}/api/trip-expenses/delete`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ trip_expense_id: tripExpenseId })
        });
        if (res.ok) {
            showToast('ลบสำเร็จ', 'success');
            openTripDetail(projectId);
        }
    } catch (e) {
        showToast('ไม่สามารถลบได้', 'error');
    }
}


// --- Banner Selection Feature ---
const PRESET_BANNERS = [
    'assets/images/banner_japan.jpg',
    'assets/images/banner_beach.jpg',
    'assets/images/banner_europe.jpg',
    'assets/images/banner_beijing.jpg',
    'assets/images/banner_hokkaido.jpg',
    'assets/images/banner_kushiro.jpg',
    'assets/images/banner_shanghai.jpg',
    'assets/images/banner_okinawa.jpg',
    'assets/images/banner_nagoya.jpg'
];

const PRESET_THUMBS = [
    'assets/images/thumb_girl.jpg',
    'assets/images/thumb_boy.jpg',
    'assets/images/thumb_fam1.jpg',
    'assets/images/thumb_fam2.jpg',
    'assets/images/thumb_fam3.jpg',
    'assets/images/thumb_fam4.jpg',
    'assets/images/thumb_fam5.jpg',
    'assets/images/thumb_fam6.jpg'
];

const PRESET_ICONS = [
    'assets/images/cloud_smile_1.jpg',
    'assets/images/cloud_smile_2.jpg',
    'assets/images/cloud_smile_3.jpg',
    'assets/images/icon_japan_1.jpg',
    'assets/images/icon_hokkaido_1.jpg',
    'assets/images/icon_tokyo_1.jpg',
    'assets/images/icon_shanghai_1.jpg',
    'assets/images/icon_nagoya_1.jpg',
    ...Array.from({length: 5}, (_, i) => `assets/icons/japan_${i+1}.png`),
    ...Array.from({length: 5}, (_, i) => `assets/icons/hokkaido_${i+1}.png`),
    ...Array.from({length: 5}, (_, i) => `assets/icons/china_${i+1}.png`),
    ...Array.from({length: 6}, (_, i) => `assets/icons/mascot_${i+1}.png`),
    ...Array.from({length: 6}, (_, i) => `assets/icons/zodiac_${i+1}.png`)
];

function injectBannerModal() {
    if(!document.getElementById('banner-modal')) {
        const modalHtml = `
        <div id="banner-modal" class="travel-modal-overlay hidden">
            <div class="travel-modal-wrap travel-modal-sm">
                <div class="travel-modal-header">
                    <h2>🎨 เลือกรูปภาพหน้าปก</h2>
                    <button class="travel-modal-close" onclick="closeBannerModal()">✕</button>
                </div>
                <div class="travel-modal-body" style="display:flex; flex-direction:column; gap:10px; max-height:400px; overflow-y:auto;" id="banner-list">
                </div>
                <div class="travel-modal-footer">
                    <input type="hidden" id="banner-project-id">
                    <input type="hidden" id="selected-banner-url">
                    <button class="btn-travel-secondary" onclick="closeBannerModal()">ยกเลิก</button>
                    <button class="btn-travel-primary" onclick="saveBannerSelection()">✅ บันทึก</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
}

function openBannerModal(projectId, currentBanner) {
    injectBannerModal();
    document.getElementById('banner-project-id').value = projectId;
    
    // Add current banner to preset list if it's custom
    let banners = [...PRESET_BANNERS];
    if(currentBanner && !banners.includes(currentBanner)) {
        banners.unshift(currentBanner);
    }

    const list = document.getElementById('banner-list');
    list.innerHTML = banners.map(url => `
        <img src="${url}" class="banner-option" onclick="selectBanner(this, '${url}')" style="width:100%; height:100px; object-fit:cover; border-radius:10px; cursor:pointer; border: ${url === currentBanner ? '4px solid #f472b6' : '4px solid transparent'}; box-sizing:border-box;">
    `).join('');
    
    // Custom URL input
    list.innerHTML += `
        <div style="margin-top:10px;">
            <label style="font-size:0.8rem; font-weight:bold; color:#555;">หรือใส่ URL รูปภาพ:</label>
            <input type="text" id="custom-banner-url" placeholder="https://..." style="width:100%; padding:8px; border-radius:8px; border:1px solid #ccc; margin-top:5px;" onchange="selectBanner(null, this.value)">
        </div>
    `;

    document.getElementById('selected-banner-url').value = currentBanner || '';
    document.getElementById('banner-modal').classList.remove('hidden');
}

function selectBanner(imgEl, url) {
    if(imgEl) {
        document.querySelectorAll('.banner-option').forEach(el => el.style.border = '4px solid transparent');
        imgEl.style.border = '4px solid #f472b6';
        document.getElementById('custom-banner-url').value = '';
    } else {
        document.querySelectorAll('.banner-option').forEach(el => el.style.border = '4px solid transparent');
    }
    document.getElementById('selected-banner-url').value = url;
}

function closeBannerModal() {
    document.getElementById('banner-modal').classList.add('hidden');
}

async function saveBannerSelection() {
    const projectId = document.getElementById('banner-project-id').value;
    const url = document.getElementById('selected-banner-url').value;
    if(!url || !projectId) return;

    const btn = document.querySelector('#banner-modal .btn-travel-primary');
    btn.innerText = 'กำลังบันทึก...';
    btn.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/api/trips/theme`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(getUserIdHeader()) },
            body: JSON.stringify({ project_id: projectId, theme_banner: url })
        });
        if(res.ok) {
            // Update local state
            const trip = TravelState.trips.find(t => t.project_id === projectId);
            if(trip) trip.theme_banner = url;
            
            closeBannerModal();
            renderTripsView(); // Re-render
        } else {
            alert('Failed to save banner');
        }
    } catch(e) {
        alert('Error saving banner');
    } finally {
        btn.innerText = '✅ บันทึก';
        btn.disabled = false;
    }
}

// --- TRIP STOPS ---

window.openAddStopModal = function(projectId, editStopId = null) {
    if (!document.getElementById('add-stop-modal')) {
        const modalHtml = `
            <div id="add-stop-modal" class="travel-modal-overlay hidden" style="z-index: 10005; display:flex; align-items:center; justify-content:center;">
                <div class="travel-modal-wrap" style="max-height: 90vh; overflow-y: auto; background: white; border-radius: 16px; padding: 15px; width: 95%; max-width: 400px; position: relative;">
                    <div class="travel-modal-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 15px;">
                        <h2 id="add-stop-modal-title" style="margin:0; font-size: 16px; color: #1e293b;">📍 เพิ่มสถานที่ / จุดแวะพัก</h2>
                        <button onclick="document.getElementById('add-stop-modal').classList.add('hidden')" style="background:none; border:none; font-size:18px; cursor:pointer; color:#94a3b8; padding:0;">✕</button>
                    </div>
                    <form id="add-stop-form" style="display:flex; flex-direction:column; gap:10px;">
                        <input type="hidden" id="stop-id">
                        <input type="hidden" id="stop-project-id">
                        
                        <div style="display:flex; gap:10px;">
                            <div style="flex:1;">
                                <label style="font-size:12px; margin-bottom:4px; display:block;">วันที่</label>
                                <input type="date" id="stop-date" class="trip-input" required>
                            </div>
                            <div style="flex:1;">
                                <label style="font-size:12px; margin-bottom:4px; display:block;">เวลา</label>
                                <input type="time" id="stop-time" class="trip-input">
                            </div>
                        </div>

                        <div style="display:flex; gap:10px;">
                            <div style="flex:1;">
                                <label style="font-size:12px; margin-bottom:4px; display:block;">ประเภทสถานที่</label>
                                <select id="stop-location-type" class="trip-input" style="appearance: auto;">
                                    <option value="🏙️ เมือง (City)">🏙️ เมือง (City)</option>
                                    <option value="🏨 โรงแรม (Hotel)">🏨 โรงแรม (Hotel)</option>
                                    <option value="🍽️ ร้านอาหาร (Restaurant)">🍽️ ร้านอาหาร (Restaurant)</option>
                                    <option value="⛩️ วัด (Temple)">⛩️ วัด (Temple)</option>
                                    <option value="🛍️ ห้าง (Mall)">🛍️ ห้าง (Mall)</option>
                                    <option value="🏛️ พิพิธภัณฑ์ (Museum)">🏛️ พิพิธภัณฑ์ (Museum)</option>
                                    <option value="♨️ ออนเซ็น (Onsen)">♨️ ออนเซ็น (Onsen)</option>
                                    <option value="🏞️ น้ำตก (Waterfall)">🏞️ น้ำตก (Waterfall)</option>
                                    <option value="⛰️ ภูเขา (Mountain)">⛰️ ภูเขา (Mountain)</option>
                                    <option value="📸 จุดถ่ายรูป (Photo spot)">📸 จุดถ่ายรูป (Photo spot)</option>
                                    <option value="🏖️ ทะเล (Sea)">🏖️ ทะเล (Sea)</option>
                                    <option value="🥩 ปิ้งย่าง (BBQ)">🥩 ปิ้งย่าง (BBQ)</option>
                                    <option value="🍣 Sushi">🍣 Sushi</option>
                                    <option value="🌳 สวนสาธารณะ (Park)">🌳 สวนสาธารณะ (Park)</option>
                                    <option value="✈️ สนามบิน (Airport)">✈️ สนามบิน (Airport)</option>
                                    <option value="☕ Cafe">☕ Cafe</option>
                                    <option value="🚆 รถไฟ (Train)">🚆 รถไฟ (Train)</option>
                                    <option value="⛴️ เรือ (Boat)">⛴️ เรือ (Boat)</option>
                                    <option value="🗼 หอคอย (Tower)">🗼 หอคอย (Tower)</option>
                                    <option value="🍺 โรงเบียร์ (Brewery)">🍺 โรงเบียร์ (Brewery)</option>
                                    <option value="🛶 คลอง (Canal)">🛶 คลอง (Canal)</option>
                                    <option value="📍 อื่นๆ (Other)">📍 อื่นๆ (Other)</option>
                                </select>
                            </div>
                            <div style="width:70px;">
                                <label style="font-size:12px; margin-bottom:4px; display:block;">เลือกไอคอน</label>
                                <select id="stop-custom-icon" class="trip-input" style="appearance: auto; font-size:16px; text-align:center;">
                                    <option value="📍">📍</option>
                                    <option value="🏨">🏨</option>
                                    <option value="🍜">🍜</option>
                                    <option value="♨️">♨️</option>
                                    <option value="🏂">🏂</option>
                                    <option value="🛍️">🛍️</option>
                                    <option value="🚂">🚂</option>
                                    <option value="🏞️">🏞️</option>
                                    <option value="⛰️">⛰️</option>
                                    <option value="🎢">🎢</option>
                                    <option value="📸">📸</option>
                                    <option value="🏙️">🏙️</option>
                                    <option value="🥩">🥩</option>
                                    <option value="☕">☕</option>
                                    <option value="🏖️">🏖️</option>
                                    <option value="🦊">🦊</option>
                                    <option value="🌳">🌳</option>
                                </select>
                            </div>
                            <div style="width:70px;">
                                <label style="font-size:12px; margin-bottom:4px; display:block;">สีหมุด</label>
                                <input type="color" id="stop-marker-color" style="width:100%; height:32px; padding:0; border:1px solid #cbd5e1; border-radius:8px; cursor:pointer; background:none;" value="#A8C3A0">
                            </div>
                            <div style="width:70px;">
                                <label style="font-size:12px; margin-bottom:4px; display:block;">สีป้าย</label>
                                <input type="color" id="stop-header-color" style="width:100%; height:32px; padding:0; border:1px solid #cbd5e1; border-radius:8px; cursor:pointer; background:none;" value="#8CA9C4">
                            </div>
                        </div>

                        <!-- Customize Styling Row -->
                        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px; background:#f8fafc; padding:8px; border-radius:8px; border:1px solid #cbd5e1; align-items: center;">
                            <div style="flex:1; min-width:70px;">
                                <label style="font-size:11px; margin-bottom:4px; display:block; font-weight:bold; color:#475569;">ขนาด Font</label>
                                <select id="stop-font-size" style="width:100%; height:32px; padding:4px; border:1px solid #cbd5e1; border-radius:8px; font-size:11px; background:#fff; cursor:pointer; appearance:auto; outline:none;">
                                    <option value="12px">12px</option>
                                    <option value="13px">13px</option>
                                    <option value="14px">14px</option>
                                    <option value="15px" selected>15px</option>
                                    <option value="16px">16px</option>
                                    <option value="18px">18px</option>
                                </select>
                            </div>
                            <div style="flex:1; min-width:90px;">
                                <label style="font-size:11px; margin-bottom:4px; display:block; font-weight:bold; color:#475569;">ตำแหน่งป้าย</label>
                                <select id="stop-label-position" style="width:100%; height:32px; padding:4px; border:1px solid #cbd5e1; border-radius:8px; font-size:11px; background:#fff; cursor:pointer; appearance:auto; outline:none;">
                                    <option value="auto">สลับ (Auto)</option>
                                    <option value="top">บน (Top)</option>
                                    <option value="bottom">ล่าง (Bottom)</option>
                                    <option value="left">ซ้าย (Left)</option>
                                    <option value="right">ขวา (Right)</option>
                                </select>
                            </div>
                            <div style="width:40px;">
                                <label style="font-size:11px; margin-bottom:4px; display:block; font-weight:bold; color:#475569; text-align:center;">อักษร</label>
                                <input type="color" id="stop-text-color" style="width:100%; height:32px; padding:0; border:1px solid #cbd5e1; border-radius:8px; cursor:pointer; background:none;" value="#4a5568">
                            </div>
                            <div style="width:40px;">
                                <label style="font-size:11px; margin-bottom:4px; display:block; font-weight:bold; color:#475569; text-align:center;">เวลา</label>
                                <input type="color" id="stop-time-color" style="width:100%; height:32px; padding:0; border:1px solid #cbd5e1; border-radius:8px; cursor:pointer; background:none;" value="#3b82f6">
                            </div>
                            <div style="width:40px;">
                                <label style="font-size:11px; margin-bottom:4px; display:block; font-weight:bold; color:#475569; text-align:center;">กรอบ</label>
                                <input type="color" id="stop-border-color" style="width:100%; height:32px; padding:0; border:1px solid #cbd5e1; border-radius:8px; cursor:pointer; background:none;" value="#E6DFD3">
                            </div>
                        </div>

                        <div>
                            <label style="font-size:12px; margin-bottom:4px; display:block;">ชื่อสถานที่ *</label>
                            <input type="text" id="stop-name" class="trip-input" placeholder="เช่น Tokyo, Asakusa" required>
                        </div>
                        
                        <div>
                            <label style="font-size:12px; margin-bottom:4px; display:block;">อยู่ภายใต้สถานที่ (Parent)</label>
                            <select id="stop-parent-id" class="trip-input" style="appearance: auto;">
                                <option value="">- ไม่มี (เป็นสถานที่หลัก) -</option>
                            </select>
                        </div>

                        <div style="display:flex; align-items:center; gap:6px; margin: 4px 0;">
                            <input type="checkbox" id="stop-is-main-day" style="width:16px; height:16px; cursor:pointer;">
                            <label for="stop-is-main-day" style="font-size:12px; font-weight:bold; color:#43553E; cursor:pointer;">🌟 ตั้งเป็นวันหลักของเมืองนี้ (Main Day)</label>
                        </div>

                        <div>
                            <label style="font-size:12px; margin-bottom:4px; display:block;">บันทึกย่อ / Note</label>
                            <input type="text" id="stop-notes" class="trip-input" placeholder="รายละเอียดเพิ่มเติม">
                        </div>

                        <div>
                            <label style="font-size:12px; margin-bottom:4px; display:block; font-weight:bold; color:#0284c7;">🔗 ลิงก์ Google Drive หรือเอกสารการจอง</label>
                            <input type="text" id="stop-drive-link" class="trip-input" placeholder="วางลิงก์ เช่น https://drive.google.com/...">
                        </div>

                        <div>
                            <label style="font-size:12px; margin-bottom:4px; display:block; font-weight:bold; color:#0284c7;">📁 หรือ อัปโหลดใบจองจากเครื่อง (PDF/รูปภาพ)</label>
                            <input type="file" id="stop-file-upload" class="trip-input" style="padding:4px 8px;" accept="image/*,application/pdf">
                            <input type="hidden" id="stop-file-base64">
                            <input type="hidden" id="stop-file-name">
                            <div id="stop-file-status" style="font-size:11px; margin-top:4px; color:#10b981; font-weight:bold; display:none;"></div>
                        </div>
                        
                        <button type="button" onclick="saveAddStop()" style="margin-top:10px; width:100%; background:#3b82f6; color:white; border:none; padding:12px; border-radius:12px; font-weight:bold; cursor:pointer; box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);">✅ บันทึกสถานที่</button>
                    </form>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Attach file change listener for reading base64
        document.getElementById('stop-file-upload').addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(evt) {
                document.getElementById('stop-file-base64').value = evt.target.result;
                document.getElementById('stop-file-name').value = file.name;
                const status = document.getElementById('stop-file-status');
                status.textContent = `📎 พร้อมอัปโหลดไฟล์: ${file.name}`;
                status.style.display = 'block';
            };
            reader.readAsDataURL(file);
        });
    }
    
    // Populate parent dropdown
    const parentSelect = document.getElementById('stop-parent-id');
    parentSelect.innerHTML = '<option value="">- ไม่มี (เป็นสถานที่หลัก) -</option>';
    if (TravelState.stops) {
        TravelState.stops.forEach(s => {
            if (s.stop_id !== editStopId) { // Prevent setting parent to itself
                const icon = s.icon || '📍';
                const opt = document.createElement('option');
                opt.value = s.stop_id;
                opt.textContent = `${icon} ${s.accommodation}`;
                parentSelect.appendChild(opt);
            }
        });
    }

    if (editStopId) {
        const stop = TravelState.stops.find(s => s.stop_id === editStopId);
        if (stop) {
            document.getElementById('add-stop-modal-title').textContent = '✏️ แก้ไขสถานที่';
            document.getElementById('stop-id').value = stop.stop_id;
            document.getElementById('stop-project-id').value = stop.project_id;
            document.getElementById('stop-date').value = (stop.stop_date || '').substring(0, 10);
            document.getElementById('stop-time').value = stop.time || '';
            document.getElementById('stop-name').value = stop.accommodation || '';
            
            // Set custom icon and marker color
            document.getElementById('stop-custom-icon').value = stop.icon || '📍';
            document.getElementById('stop-marker-color').value = stop.marker_color || '#A8C3A0';
            document.getElementById('stop-header-color').value = stop.header_color || '#8CA9C4';
            document.getElementById('stop-font-size').value = stop.font_size || '15px';
            document.getElementById('stop-label-position').value = stop.label_position || 'auto';
            document.getElementById('stop-text-color').value = stop.text_color || '#4a5568';
            document.getElementById('stop-time-color').value = stop.time_color || '#3b82f6';
            document.getElementById('stop-border-color').value = stop.border_color || '#E6DFD3';
            
            const fullType = stop.icon && stop.location_type ? `${stop.icon} ${stop.location_type}` : '📍 อื่นๆ (Other)';
            const typeSelect = document.getElementById('stop-location-type');
            let typeExists = false;
            for(let i=0; i<typeSelect.options.length; i++){
                if(typeSelect.options[i].value === fullType) typeExists = true;
            }
            if(!typeExists && stop.icon && stop.location_type) {
                const opt = document.createElement('option');
                opt.value = fullType;
                opt.textContent = fullType;
                typeSelect.appendChild(opt);
            }
            typeSelect.value = fullType;
            
            document.getElementById('stop-parent-id').value = stop.parent_stop_id || '';
            document.getElementById('stop-is-main-day').checked = stop.is_main_day === 1;
            document.getElementById('stop-notes').value = stop.notes || '';

            // Reset document fields
            document.getElementById('stop-drive-link').value = '';
            document.getElementById('stop-file-upload').value = '';
            document.getElementById('stop-file-base64').value = '';
            document.getElementById('stop-file-name').value = '';
            document.getElementById('stop-file-status').style.display = 'none';

            // Query existing document for this stop
            fetch(`${API_BASE}/api/trips/documents?projectId=${projectId}`)
                .then(r => r.json())
                .then(docs => {
                    const stopDoc = docs.find(d => d.related_entity_id === editStopId);
                    if (stopDoc) {
                        if (stopDoc.file_url.startsWith('http')) {
                            document.getElementById('stop-drive-link').value = stopDoc.file_url;
                        } else {
                            const status = document.getElementById('stop-file-status');
                            status.textContent = `📎 มีไฟล์แนบอยู่แล้ว: ${stopDoc.description || 'ไฟล์ใบจอง'}`;
                            status.style.display = 'block';
                        }
                    }
                })
                .catch(err => console.error('Error fetching stop document:', err));
        }
    } else {
        document.getElementById('add-stop-modal-title').textContent = '📍 เพิ่มสถานที่ / จุดแวะพัก';
        document.getElementById('stop-id').value = '';
        document.getElementById('stop-project-id').value = projectId;
        document.getElementById('stop-date').value = new Date().toISOString().slice(0, 10);
        document.getElementById('stop-time').value = '12:00';
        document.getElementById('stop-name').value = '';
        document.getElementById('stop-custom-icon').value = '📍';
        document.getElementById('stop-marker-color').value = '#A8C3A0';
        document.getElementById('stop-header-color').value = '#8CA9C4';
        document.getElementById('stop-font-size').value = '15px';
        document.getElementById('stop-label-position').value = 'auto';
        document.getElementById('stop-text-color').value = '#4a5568';
        document.getElementById('stop-time-color').value = '#3b82f6';
        document.getElementById('stop-border-color').value = '#E6DFD3';
        document.getElementById('stop-location-type').selectedIndex = 0;
        document.getElementById('stop-parent-id').value = '';
        document.getElementById('stop-is-main-day').checked = false;
        document.getElementById('stop-notes').value = '';

        document.getElementById('stop-drive-link').value = '';
        document.getElementById('stop-file-upload').value = '';
        document.getElementById('stop-file-base64').value = '';
        document.getElementById('stop-file-name').value = '';
        document.getElementById('stop-file-status').style.display = 'none';
    }
    
    document.getElementById('add-stop-modal').classList.remove('hidden');
};

window.saveAddStop = async function() {
    const stopId = document.getElementById('stop-id').value;
    const projectId = document.getElementById('stop-project-id').value;
    const stop_date = document.getElementById('stop-date').value;
    const time = document.getElementById('stop-time').value;
    const name = document.getElementById('stop-name').value;
    const parent_stop_id = document.getElementById('stop-parent-id').value;
    const notes = document.getElementById('stop-notes').value;
    const customIcon = document.getElementById('stop-custom-icon').value;
    const markerColor = document.getElementById('stop-marker-color').value;
    const headerColor = document.getElementById('stop-header-color').value;
    const fontSize = document.getElementById('stop-font-size').value;
    const labelPosition = document.getElementById('stop-label-position').value;
    const textColor = document.getElementById('stop-text-color').value;
    const timeColor = document.getElementById('stop-time-color').value;
    const borderColor = document.getElementById('stop-border-color').value;
    const is_main_day = document.getElementById('stop-is-main-day').checked ? 1 : 0;
    
    const driveLink = document.getElementById('stop-drive-link').value.trim();
    const fileBase64 = document.getElementById('stop-file-base64').value;
    const fileName = document.getElementById('stop-file-name').value;

    const locationTypeVal = document.getElementById('stop-location-type').value;
    let location_type = 'อื่นๆ';
    
    const parts = locationTypeVal.split(' ');
    if(parts.length > 1) {
        location_type = parts.slice(1).join(' ');
    } else {
        location_type = locationTypeVal;
    }
    
    if (!name) { showToast('กรุณาใส่ชื่อสถานที่', 'error'); return; }
    
    const payload = {
        stop_id: stopId || null,
        project_id: projectId,
        stop_date: stop_date || null,
        time: time || null,
        city: '',
        accommodation: name,
        notes: notes || '',
        location_type: location_type,
        parent_stop_id: parent_stop_id || null,
        icon: customIcon,
        marker_color: markerColor,
        header_color: headerColor,
        font_size: fontSize,
        label_position: labelPosition,
        text_color: textColor,
        time_color: timeColor,
        border_color: borderColor,
        is_main_day: is_main_day
    };
    
    try {
        const headers = { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(getUserIdHeader()) };
        const res  = await fetch(`${API_BASE}/api/trip-stops`, { method: 'POST', headers, body: JSON.stringify(payload) });
        const data = await res.json();
        
        if (data.success || data.stop_id) {
            const savedStopId = data.stop_id || stopId;
            
            // Save document/link if present
            if (driveLink) {
                const docPayload = {
                    project_id: projectId,
                    related_entity_id: savedStopId,
                    file_url: driveLink,
                    description: 'Google Drive Link',
                    type: 'booking'
                };
                await fetch(`${API_BASE}/api/trips/documents`, { method: 'POST', headers, body: JSON.stringify(docPayload) });
            } else if (fileBase64) {
                const docPayload = {
                    project_id: projectId,
                    related_entity_id: savedStopId,
                    file_url: fileBase64,
                    description: fileName || 'Uploaded Document',
                    type: 'general'
                };
                await fetch(`${API_BASE}/api/trips/documents`, { method: 'POST', headers, body: JSON.stringify(docPayload) });
            }

            showToast('✅ บันทึกสถานที่สำเร็จ!', 'success');
            document.getElementById('add-stop-modal').classList.add('hidden');
            openTripDetail(projectId);
        } else {
            showToast('เกิดข้อผิดพลาด: ' + (data.error || ''), 'error');
        }
    } catch (e) {
        console.error(e);
        showToast('ไม่สามารถบันทึกได้', 'error');
    }
};

window.toggleStopCollapse = function(stopId) {
    const el = document.getElementById('stop-children-' + stopId);
    const btn = document.getElementById('stop-collapse-btn-' + stopId);
    if (el) {
        if (el.classList.contains('hidden')) {
            el.classList.remove('hidden');
            if(btn) btn.innerHTML = '▼';
        } else {
            el.classList.add('hidden');
            if(btn) btn.innerHTML = '▶';
        }
    }
};
window.deleteTripStop = async function(stopId) {
    if (!confirm('แน่ใจหรือไม่ว่าต้องการลบสถานที่นี้?')) return;
    try {
        const headers = { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(getUserIdHeader()) };
        const res = await fetch(`${API_BASE}/api/trip-stops`, {
            method: 'DELETE',
            headers,
            body: JSON.stringify({ stop_id: stopId })
        });
        const data = await res.json();
        if (data.success) {
            showToast('ลบสถานที่สำเร็จ', 'success');
            if (TravelState.currentTrip) openTripDetail(TravelState.currentTrip.project_id);
        }
    } catch (e) {
        showToast('ลบสถานที่ล้มเหลว', 'error');
    }
};

window.openAddDocModal = function(stopId) {
    const docUrl = prompt('📎 ใส่ลิงก์เอกสารใบจอง/ตั๋วเดินทาง (เช่น Google Drive PDF หรือลิงก์รูปภาพ):');
    if (docUrl) {
        showToast('แนบลิงก์เอกสารแล้ว', 'success');
        // Simulate save
    }
};

// Weather & Leaflet Helper Functions
function loadLeaflet(callback) {
    if (window.L) {
        callback();
        return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = callback;
    document.head.appendChild(script);
}

window.initLeafletMap = function(stops) {
    const mapDiv = document.getElementById('trip-map');
    if (!mapDiv) return;

    loadLeaflet(() => {
        if (window.activeTripMap) {
            window.activeTripMap.remove();
        }

        // Use flat simple coordinates for game-like custom board map placement!
        const w = 1000, h = 600;
        const bounds = [[0, 0], [h, w]];
        
        const map = L.map('trip-map', {
            crs: L.CRS.Simple,
            minZoom: -1.2,
            maxZoom: 1.5,
            zoomSnap: 0.1
        });
        window.activeTripMap = map;

        // Use current trip banner as background canvas
        let bannerImg = '/assets/images/banner_japan.jpg';
        if (TravelState.currentTrip && TravelState.currentTrip.theme_banner) {
            bannerImg = TravelState.currentTrip.theme_banner;
        }
        if (!bannerImg.startsWith('/')) bannerImg = '/' + bannerImg;

        L.imageOverlay(bannerImg, bounds).addTo(map);
        map.fitBounds(bounds);

        window.tripMarkers = {};
        
        stops.forEach((s, idx) => {
            // Treat lat/lng as flat pixel offsets inside bounds (h = 600, w = 1000)
            let stopLat = s.latitude && parseFloat(s.latitude) <= h ? parseFloat(s.latitude) : (h/2 + (idx * 40) - 80);
            let stopLng = s.longitude && parseFloat(s.longitude) <= w ? parseFloat(s.longitude) : (w/2 + (idx * 50) - 100);

            // Cute 3D Isometric Speech Bubble marker
            const labelIcon = L.divIcon({
                html: `<div class="leaflet-marker-3d-bubble" style="width:36px; height:36px; display:flex; align-items:center; justify-content:center;"><span>${s.icon || '📍'}</span></div>`,
                className: 'custom-3d-div-icon',
                iconSize: [36, 36],
                iconAnchor: [18, 36]
            });

            // Make marker DRAGGABLE so user can drag locations around the map!
            const marker = L.marker([stopLat, stopLng], { 
                icon: labelIcon,
                draggable: !TravelState.isGuest
            }).addTo(map);
            
            marker.on('click', () => {
                selectItineraryStop(s.stop_id);
            });

            // On dragend, save new flat coordinates to the backend database!
            marker.on('dragend', async (event) => {
                const position = event.target.getLatLng();
                const newLat = Math.round(position.lat);
                const newLng = Math.round(position.lng);
                
                // Update locally
                s.latitude = newLat.toString();
                s.longitude = newLng.toString();
                
                try {
                    const headers = { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(getUserIdHeader()) };
                    await fetch(`${API_BASE}/api/trip-stops`, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({
                            stop_id: s.stop_id,
                            project_id: s.project_id,
                            latitude: newLat.toString(),
                            longitude: newLng.toString(),
                            stop_date: s.stop_date,
                            time: s.time,
                            accommodation: s.accommodation,
                            notes: s.notes,
                            location_type: s.location_type,
                            parent_stop_id: s.parent_stop_id,
                            icon: s.icon
                        })
                    });
                    showToast(`ย้ายหมุด ${s.accommodation} ไปยังตำแหน่ง (${newLng}, ${newLat}) บนกระดานสำเร็จ`, 'success');
                } catch(e) {
                    console.error(e);
                    showToast('บันทึกพิกัดหมุดไม่สำเร็จ', 'error');
                }
            });
            
            marker.bindPopup(`
                <div style="font-family:'Sarabun','Outfit',sans-serif; font-size:12px; padding:2px; min-width:140px;">
                    <b style="font-size:13px; color:#43553E;">${s.icon || '📍'} ${s.accommodation || 'สถานที่'}</b>
                    ${s.time ? `<div style="color:#2563eb; font-weight:bold; margin-top:2px;">⏱️ เวลา: ${s.time}</div>` : ''}
                    ${s.notes ? `<div style="margin-top:4px; font-style:italic; opacity:0.8;">💬 ${s.notes}</div>` : ''}
                    ${!TravelState.isGuest ? `<div style="font-size:9px; color:#6B8B77; margin-top:6px; font-weight:bold; border-top:1px dashed #cbd5e1; padding-top:4px;">💡 ลากหมุดเพื่อปรับตำแหน่งได้อิสระ</div>` : ''}
                </div>
            `);
            
            window.tripMarkers[s.stop_id] = marker;
        });
    });
};

window.initWeatherForecast = async function(trip, stops) {
    const loader = document.getElementById('trip-weather-loader');

    let lat = 43.06, lng = 141.35;
    const dest = (trip.destination || '').toLowerCase();
    if (dest.includes('tokyo')) { lat = 35.67; lng = 139.65; }
    else if (dest.includes('beijing')) { lat = 39.90; lng = 116.40; }
    else if (dest.includes('okinawa')) { lat = 26.21; lng = 127.68; }
    else if (dest.includes('nagoya')) { lat = 35.18; lng = 136.90; }
    else if (dest.includes('shanghai')) { lat = 31.23; lng = 121.47; }

    try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weathercode,temperature_2m_max,temperature_2m_min&hourly=weathercode,temperature_2m&forecast_days=16&timezone=auto`);
        const data = await res.json();
        
        if (data && data.daily) {
            // Save in TravelState for inline itinerary access
            TravelState.weatherData = data;

            const days = data.daily.time;
            const codes = data.daily.weathercode;
            const maxTemps = data.daily.temperature_2m_max;
            const minTemps = data.daily.temperature_2m_min;
            
            const start = trip.start_date ? trip.start_date.substring(0, 10) : '';
            const end = trip.end_date ? trip.end_date.substring(0, 10) : '';
            
            if (loader) {
                let filteredHtml = '';
                for (let i = 0; i < days.length; i++) {
                    const dayStr = days[i];
                    if ((!start || dayStr >= start) && (!end || dayStr <= end)) {
                        const code = codes[i];
                        let emoji = '🌤️';
                        if (code === 0) emoji = '☀️';
                        else if (code >= 51 && code <= 67) emoji = '🌧️';
                        else if (code >= 71 && code <= 77) emoji = '❄️';
                        else if (code >= 80 && code <= 82) emoji = '🌧️';
                        else if (code >= 85 && code <= 86) emoji = '❄️';
                        else if (code >= 95) emoji = '⚡';
                        
                        const formattedDay = dayStr.substring(8, 10) + '/' + dayStr.substring(5, 7);
                        
                        filteredHtml += `
                            <div class="weather-day-card">
                                <div style="font-size:10px; font-weight:bold; color:#64748b;">${formattedDay}</div>
                                <div style="font-size:20px; margin:4px 0;">${emoji}</div>
                                <div style="font-size:10px; font-weight:bold; color:#0f172a;">${Math.round(maxTemps[i])}°/${Math.round(minTemps[i])}°</div>
                            </div>
                        `;
                    }
                }
                loader.innerHTML = filteredHtml || '<p style="font-size:11px; color:#94a3b8; text-align:center; width:100%;">ไม่มีพยากรณ์อากาศวันเดินทาง (เกิน 16 วันล่วงหน้า)</p>';
            }
            
            // Re-render itinerary section quietly to inject the loaded inline weather icons!
            const parentStops = stops.filter(s => !s.parent_stop_id);
            if (parentStops.length > 0 && !TravelState.weatherInjected) {
                TravelState.weatherInjected = true;
                renderTripDetailModal();
            }
        }
    } catch (e) {
        console.error('Weather error', e);
        loader.innerHTML = '<p style="font-size:11px; color:#ef4444; text-align:center; width:100%;">ไม่สามารถโหลดพยากรณ์อากาศได้</p>';
    }
};

window.toggleWeatherDetail = function(stopId) {
    const el = document.getElementById(`weather-detail-${stopId}`);
    if (el) {
        el.style.display = el.style.display === 'none' ? 'block' : 'none';
    }
};

window.renderExpenseChart = function(trip, expenses) {
    const canvas = document.getElementById('trip-budget-chart-canvas');
    if (!canvas) return;

    const byCat = {};
    EXPENSE_CATEGORIES.forEach(c => { byCat[c.id] = 0; });
    expenses.filter(e => e.approved !== 0).forEach(e => {
        const cat = e.category_id || 'other';
        byCat[cat] = (byCat[cat] || 0) + parseFloat(e.amount_thb || 0);
    });

    if (window.tripBudgetChartInstance) {
        window.tripBudgetChartInstance.destroy();
    }

    const ctx = canvas.getContext('2d');
    window.tripBudgetChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: EXPENSE_CATEGORIES.map(c => c.label),
            datasets: [{
                label: 'ใช้จริง (บาท)',
                data: EXPENSE_CATEGORIES.map(c => byCat[c.id] || 0),
                backgroundColor: EXPENSE_CATEGORIES.map(c => c.color),
                borderWidth: 0,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: { x: { grid: { display: false } }, y: { grid: { display: false } } }
        }
    });
};

window.generateTripPassword = function() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let pwd = '';
    for(let i=0; i<6; i++) {
        pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    document.getElementById('edit-trip-password').value = pwd;
};

window.saveTripSettings = async function() {
    const trip = TravelState.currentTrip;
    if(!trip) return;

    const name = document.getElementById('edit-trip-name').value;
    const start = document.getElementById('edit-trip-start').value;
    const end = document.getElementById('edit-trip-end').value;
    const dest = document.getElementById('edit-trip-dest').value;
    const members = document.getElementById('edit-trip-members').value.split(',').map(m=>m.trim()).filter(Boolean);
    const password = document.getElementById('edit-trip-password').value;

    const activeCurrencies = Array.from(document.querySelectorAll('input[name="active-currency-opt"]:checked')).map(cb=>cb.value);
    const highlights = Array.from(document.querySelectorAll('.highlight-item.selected-highlight')).map(el=>el.getAttribute('data-id'));
    
    const themeVal = document.getElementById('edit-trip-theme').value;
    localStorage.setItem(`trip_theme_${trip.project_id}`, themeVal);

    const payload = {
        project_id: trip.project_id,
        name,
        status: trip.status,
        start_date: start,
        end_date: end,
        destination: dest,
        members: JSON.stringify(members),
        trip_password: password,
        active_currencies: JSON.stringify(activeCurrencies),
        highlights: JSON.stringify(highlights)
    };

    try {
        const res = await fetch(`${API_BASE}/api/trips`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(getUserIdHeader()) },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if(data.success) {
            showToast('บันทึกการตั้งค่าแล้ว', 'success');
            openTripDetail(trip.project_id);
            if (typeof loadTrips === 'function') loadTrips();
        }
    } catch(e) {
        showToast('บันทึกการตั้งค่าล้มเหลว', 'error');
    }
};

window.createNewWallet = async function() {
    const trip = TravelState.currentTrip;
    if(!trip) return;

    const name = document.getElementById('new-wallet-name').value;
    const currency = document.getElementById('new-wallet-currency').value;
    const foreign = 0;
    const thb = 0;
    const exclude = 0;

    if(!name) {
        showToast('กรุณากรอกชื่อกระเป๋าเงิน', 'warning');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/api/wallets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(getUserIdHeader()) },
            body: JSON.stringify({
                project_id: trip.project_id,
                name, currency,
                initial_balance_foreign: foreign,
                initial_balance_thb: thb,
                exclude_on_close: exclude
            })
        });
        const data = await res.json().catch(() => ({}));
        if(data.success) {
            showToast('เพิ่มกระเป๋าเงินสำเร็จ', 'success');
            openTripDetail(trip.project_id);
        } else {
            showToast(data.error || `เพิ่มกระเป๋าเงินไม่สำเร็จ (HTTP ${res.status})`, 'error');
        }
    } catch(e) {
        showToast('เพิ่มกระเป๋าเงินล้มเหลว: ' + (e.message || 'เชื่อมต่อ API ไม่ได้'), 'error');
    }
};

window.deleteWallet = async function(walletId) {
    if(!confirm('แน่ใจหรือไม่ว่าต้องการลบกระเป๋าเงินนี้? (ยอดใช้จ่ายที่ผูกไว้จะกลายเป็นไม่มีกระเป๋าเงิน)')) return;

    try {
        const res = await fetch(`${API_BASE}/api/wallets/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(getUserIdHeader()) },
            body: JSON.stringify({ wallet_id: walletId })
        });
        const data = await res.json().catch(() => ({}));
        if(data.success) {
            showToast('ลบกระเป๋าเงินแล้ว', 'success');
            openTripDetail(TravelState.currentTrip.project_id);
        } else {
            showToast(data.error || `ลบกระเป๋าเงินไม่สำเร็จ (HTTP ${res.status})`, 'error');
        }
    } catch(e) {
        showToast('ลบกระเป๋าเงินล้มเหลว: ' + (e.message || 'เชื่อมต่อ API ไม่ได้'), 'error');
    }
};

// ══════════ Trip Finance P1 — เติมเงินเข้ากระเป๋าทริป ══════════
window.openFundWalletModal = function(projectId) {
    const trip = TravelState.currentTrip;
    const wallets = TravelState.wallets || [];
    if (wallets.length === 0) { showToast('ยังไม่มีกระเป๋าเงิน กรุณาเพิ่มกระเป๋าก่อน', 'warning'); return; }
    const accts = (AppState.accounts || []);
    const modal = document.createElement('div');
    modal.id = 'fund-wallet-modal';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.45); display:flex; align-items:center; justify-content:center; z-index:9999;';
    modal.innerHTML = `
        <div style="background:var(--card-bg,#fff); border-radius:18px; padding:22px; width:92%; max-width:420px; box-shadow:0 12px 40px rgba(0,0,0,0.2);">
            <h3 style="margin:0 0 14px 0; font-size:17px;">💰 เติมเงินเข้ากระเป๋าทริป</h3>
            <label style="font-size:12px; font-weight:bold; color:#64748b;">กระเป๋าปลายทาง</label>
            <select id="fund-wallet-select" onchange="fundWalletOnChange()" style="width:100%; padding:9px; margin:4px 0 12px; border:1px solid #e2e8f0; border-radius:10px;">
                ${wallets.map(w => `<option value="${w.wallet_id}" data-currency="${w.currency}">${w.name} (${w.currency})</option>`).join('')}
            </select>
            <label style="font-size:12px; font-weight:bold; color:#64748b;">บัญชีต้นทาง (หักเงินบาท)</label>
            <select id="fund-source-account" style="width:100%; padding:9px; margin:4px 0 12px; border:1px solid #e2e8f0; border-radius:10px;">
                <option value="">-- เลือกบัญชีต้นทาง --</option>
                ${accts.map(a => `<option value="${a.account_id}">${a.name}</option>`).join('')}
            </select>
            <div style="display:flex; gap:10px;">
                <div style="flex:1;">
                    <label style="font-size:12px; font-weight:bold; color:#64748b;">จำนวนเงินบาท (฿)</label>
                    <input id="fund-thb" type="number" step="0.01" oninput="fundWalletCalcRate()" placeholder="0.00" style="width:100%; padding:9px; margin:4px 0 12px; border:1px solid #e2e8f0; border-radius:10px;">
                </div>
                <div style="flex:1;" id="fund-foreign-wrap">
                    <label style="font-size:12px; font-weight:bold; color:#64748b;">ได้เงิน <span id="fund-cur-label">ตปท.</span></label>
                    <input id="fund-foreign" type="number" step="0.01" oninput="fundWalletCalcRate()" placeholder="0.00" style="width:100%; padding:9px; margin:4px 0 12px; border:1px solid #e2e8f0; border-radius:10px;">
                </div>
            </div>
            <div id="fund-rate-preview" style="font-size:12px; color:#4338ca; background:rgba(99,102,241,0.1); padding:6px 10px; border-radius:8px; margin-bottom:12px; display:none;"></div>
            <label style="font-size:12px; font-weight:bold; color:#64748b;">วันที่</label>
            <input id="fund-date" type="date" value="${new Date().toISOString().substring(0,10)}" style="width:100%; padding:9px; margin:4px 0 12px; border:1px solid #e2e8f0; border-radius:10px;">
            <label style="font-size:12px; font-weight:bold; color:#64748b;">หมายเหตุ (ถ้ามี)</label>
            <input id="fund-note" type="text" placeholder="เช่น แลกเงินที่สนามบิน" style="width:100%; padding:9px; margin:4px 0 16px; border:1px solid #e2e8f0; border-radius:10px;">
            <div style="display:flex; gap:10px;">
                <button onclick="closeFundWalletModal()" style="flex:1; padding:11px; border:1px solid #e2e8f0; background:#f8fafc; border-radius:10px; cursor:pointer; font-weight:bold;">ยกเลิก</button>
                <button onclick="submitFundWallet('${projectId}')" style="flex:1; padding:11px; border:none; background:#10b981; color:#fff; border-radius:10px; cursor:pointer; font-weight:bold;">✓ เติมเงิน</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    fundWalletOnChange();
};
window.fundWalletOnChange = function() {
    const sel = document.getElementById('fund-wallet-select');
    if (!sel) return;
    const cur = sel.selectedOptions[0].dataset.currency || '';
    const isThb = cur.toUpperCase() === 'THB';
    const fw = document.getElementById('fund-foreign-wrap');
    const label = document.getElementById('fund-cur-label');
    if (label) label.textContent = cur || 'ตปท.';
    if (fw) fw.style.display = isThb ? 'none' : 'block';   // THB wallet: no exchange
    fundWalletCalcRate();
};
window.fundWalletCalcRate = function() {
    const sel = document.getElementById('fund-wallet-select');
    const cur = sel ? (sel.selectedOptions[0].dataset.currency || '') : '';
    const isThb = cur.toUpperCase() === 'THB';
    const thb = parseFloat((document.getElementById('fund-thb')||{}).value) || 0;
    const foreign = parseFloat((document.getElementById('fund-foreign')||{}).value) || 0;
    const box = document.getElementById('fund-rate-preview');
    if (!box) return;
    if (!isThb && thb > 0 && foreign > 0) {
        box.style.display = 'block';
        box.textContent = `เรทที่ได้ ≈ ${(thb/foreign).toFixed(4)} ฿ ต่อ 1 ${cur}`;
    } else { box.style.display = 'none'; }
};
window.closeFundWalletModal = function() { const m = document.getElementById('fund-wallet-modal'); if (m) m.remove(); };
window.submitFundWallet = async function(projectId) {
    const walletSel = document.getElementById('fund-wallet-select');
    const wallet_id = walletSel.value;
    const currency = walletSel.selectedOptions[0].dataset.currency || '';
    const isThb = currency.toUpperCase() === 'THB';
    const source_account_id = document.getElementById('fund-source-account').value || null;
    const thb_amount = parseFloat(document.getElementById('fund-thb').value) || 0;
    const foreign_amount = isThb ? thb_amount : (parseFloat(document.getElementById('fund-foreign').value) || 0);
    const funding_date = document.getElementById('fund-date').value;
    const note = document.getElementById('fund-note').value;
    if (!source_account_id) { showToast('กรุณาเลือกบัญชีต้นทางสำหรับการโอน', 'warning'); return; }
    if (thb_amount <= 0) { showToast('กรุณากรอกจำนวนเงินบาท', 'warning'); return; }
    if (!isThb && foreign_amount <= 0) { showToast('กรุณากรอกจำนวนเงินตปท.ที่ได้', 'warning'); return; }
    try {
        const res = await fetch(`${API_BASE}/api/trips/fund`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(getUserIdHeader()) },
            body: JSON.stringify({ project_id: projectId, wallet_id, source_account_id, thb_amount, foreign_amount, currency, funding_date, note })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`เติมเงินสำเร็จ (เรท ${Number(data.rate).toFixed(3)})`, 'success');
            closeFundWalletModal();
            openTripDetail(projectId);
        } else { showToast(data.error || 'เติมเงินล้มเหลว', 'error'); }
    } catch(e) { showToast('เติมเงินล้มเหลว', 'error'); }
};

// ══════════ Trip Finance — เครื่องคิดเลขแปลงเงินเฉพาะทริป (เรทเฉลี่ย) ══════════
window.openTripCalcModal = function(projectId) {
    const wallets = (TravelState.wallets || []).filter(w => (w.currency||'').toUpperCase() !== 'THB');
    const modal = document.createElement('div');
    modal.id = 'trip-calc-modal';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.45); display:flex; align-items:center; justify-content:center; z-index:9999;';
    const rateOf = w => {
        const r = (w.avg_rate != null && parseFloat(w.avg_rate) > 0) ? parseFloat(w.avg_rate) : (parseFloat(w.initial_balance_thb||0) / (parseFloat(w.initial_balance_foreign)||1));
        return r;
    };
    modal.innerHTML = `
        <div style="background:var(--card-bg,#fff); border-radius:18px; padding:22px; width:92%; max-width:380px; box-shadow:0 12px 40px rgba(0,0,0,0.2);">
            <h3 style="margin:0 0 6px 0; font-size:17px;">🧮 คิดเงินทริปนี้</h3>
            <p style="font-size:11px; color:#94a3b8; margin:0 0 14px;">ใช้เรทเฉลี่ยของกระเป๋าในทริปนี้ (ค่าประมาณ)</p>
            ${wallets.length === 0 ? '<p style="font-size:13px; color:#64748b;">ยังไม่มีกระเป๋าเงินตปท.ในทริปนี้</p>' : `
            <label style="font-size:12px; font-weight:bold; color:#64748b;">สกุลเงิน</label>
            <select id="calc-wallet" onchange="tripCalcCompute()" style="width:100%; padding:9px; margin:4px 0 12px; border:1px solid #e2e8f0; border-radius:10px;">
                ${wallets.map(w => `<option value="${rateOf(w)}" data-cur="${w.currency}">${w.name} (${w.currency}) · เรท ${rateOf(w).toFixed(3)}</option>`).join('')}
            </select>
            <div style="display:flex; gap:10px; align-items:end;">
                <div style="flex:1;">
                    <label style="font-size:12px; font-weight:bold; color:#64748b;">ยอด <span id="calc-cur">ตปท.</span></label>
                    <input id="calc-foreign" type="number" step="0.01" oninput="tripCalcCompute('f')" placeholder="0.00" style="width:100%; padding:9px; margin:4px 0; border:1px solid #e2e8f0; border-radius:10px;">
                </div>
                <div style="padding-bottom:14px; color:#94a3b8;">⇄</div>
                <div style="flex:1;">
                    <label style="font-size:12px; font-weight:bold; color:#64748b;">บาท (฿)</label>
                    <input id="calc-thb" type="number" step="0.01" oninput="tripCalcCompute('t')" placeholder="0.00" style="width:100%; padding:9px; margin:4px 0; border:1px solid #e2e8f0; border-radius:10px;">
                </div>
            </div>`}
            <button onclick="closeTripCalcModal()" style="width:100%; margin-top:14px; padding:11px; border:none; background:#6366f1; color:#fff; border-radius:10px; cursor:pointer; font-weight:bold;">ปิด</button>
        </div>`;
    document.body.appendChild(modal);
    if (wallets.length) tripCalcCompute();
};
window.tripCalcCompute = function(src) {
    const sel = document.getElementById('calc-wallet');
    if (!sel) return;
    const rate = parseFloat(sel.value) || 0;
    const cur = sel.selectedOptions[0].dataset.cur || 'ตปท.';
    const lbl = document.getElementById('calc-cur'); if (lbl) lbl.textContent = cur;
    const fEl = document.getElementById('calc-foreign'), tEl = document.getElementById('calc-thb');
    if (src === 't') { const thb = parseFloat(tEl.value)||0; fEl.value = rate>0 ? (thb/rate).toFixed(2) : ''; }
    else { const f = parseFloat(fEl.value)||0; tEl.value = (f*rate).toFixed(2); }
};
window.closeTripCalcModal = function() { const m = document.getElementById('trip-calc-modal'); if (m) m.remove(); };

// ══════════ Trip Finance P3 — ปิดทริป (สรุป → ยืนยัน) ══════════
window.openCloseTripModal = async function(projectId) {
    let s, targetWallets = [];
    try {
        const headers = { 'x-user-id': encodeURIComponent(getUserIdHeader()) };
        const [res, targetsRes] = await Promise.all([
            fetch(`${API_BASE}/api/trips/close-preview?projectId=${projectId}`, { headers }),
            fetch(`${API_BASE}/api/trips/wallet-options?projectId=${projectId}`, { headers })
        ]);
        s = await res.json();
        if (targetsRes.ok) targetWallets = await targetsRes.json();
    } catch(e) { showToast('โหลดสรุปปิดทริปล้มเหลว', 'error'); return; }
    const t = s.totals || {};
    const modal = document.createElement('div');
    modal.id = 'close-trip-modal';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:9999; padding:16px;';
    const memberRows = (s.members || []).map(m => {
        const caps = Object.entries(m.byCaption || {}).map(([c,v]) => `<div style="display:flex; justify-content:space-between; font-size:11px; color:#64748b; padding:1px 0 1px 12px;"><span>· ${c}</span><span>฿${tripFmtNum(v)}</span></div>`).join('');
        return `<div style="border-bottom:1px solid #f1f5f9; padding:8px 0;">
            <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:13px;"><span>👤 ${m.member_name}</span><span>฿${tripFmtNum(m.total_thb)}</span></div>
            ${caps}
        </div>`;
    }).join('') || '<p style="font-size:12px; color:#94a3b8;">ไม่มีบิลค่าใช้จ่าย</p>';
    const keptRows = (s.wallets || []).filter(w => Number(w.exclude_on_close) === 1).map(w =>
        `<div style="font-size:11px; color:#0369a1;">📌 เก็บ ${w.name}: ${w.currency} ${tripFmtNum(w.leftover_foreign)} (≈฿${tripFmtNum(w.leftover_thb)}) ไว้ทริปหน้า</div>`).join('');
    const leftoverControls = (s.wallets || []).filter(w => Number(w.leftover_foreign || 0) > 0.005).map(w => {
        const targets = targetWallets.filter(t => String(t.currency || '').toUpperCase() === String(w.currency || '').toUpperCase());
        return `<div style="margin:8px 0; padding:9px; background:#f8fafc; border-radius:9px; font-size:12px;">
            <div style="font-weight:bold; margin-bottom:5px;">${w.name}: ${tripFmtNum(w.leftover_foreign)} ${w.currency} เหลือ</div>
            <select id="close-leftover-${w.wallet_id}" style="width:100%; padding:7px; border:1px solid #cbd5e1; border-radius:7px;">
                <option value="RETURN">คืนเข้าบัญชีต้นทาง (≈฿${tripFmtNum(w.leftover_thb)})</option>
                ${targets.map(t => `<option value="MOVE_TO_WALLET:${t.wallet_id}">ย้ายไป ${t.trip_name} › ${t.name} (${t.currency})</option>`).join('')}
            </select>
        </div>`;
    }).join('');
    modal.innerHTML = `
        <div style="background:var(--card-bg,#fff); border-radius:18px; padding:22px; width:100%; max-width:460px; max-height:88vh; overflow-y:auto; box-shadow:0 12px 40px rgba(0,0,0,0.25);">
            <h3 style="margin:0 0 4px 0; font-size:18px;">🔒 ปิดทริป & สรุปยอด</h3>
            <p style="font-size:11px; color:#94a3b8; margin:0 0 14px;">ค่าบาทของทุกบิลจะล็อกด้วยเรทเฉลี่ย · ลงบัญชีหลักถาวร · เปลี่ยนทริปเป็น Memory</p>
            <div style="background:#f8fafc; border-radius:12px; padding:12px; margin-bottom:14px; font-size:13px;">
                <div style="display:flex; justify-content:space-between; padding:2px 0;"><span>💰 เติมเข้าทริปรวม</span><span>฿${tripFmtNum(t.funded_thb)}</span></div>
                <div style="display:flex; justify-content:space-between; padding:2px 0; color:#ef4444;"><span>🧾 ใช้จริงรวม</span><span>฿${tripFmtNum(t.spent_thb)}</span></div>
                <div style="display:flex; justify-content:space-between; padding:2px 0; color:#059669;"><span>↩️ คืนเข้าบัญชี</span><span>฿${tripFmtNum(t.leftover_thb)}</span></div>
                ${t.kept_thb > 0 ? `<div style="display:flex; justify-content:space-between; padding:2px 0; color:#0369a1;"><span>📌 เก็บไว้ทริปหน้า</span><span>฿${tripFmtNum(t.kept_thb)}</span></div>` : ''}
                <div style="border-top:1px dashed #cbd5e1; margin-top:6px; padding-top:6px; display:flex; justify-content:space-between; font-size:12px; color:${s.balanced ? '#059669' : '#ef4444'};">
                    <span>${s.balanced ? '✅ สมดุล' : '⚠️ ไม่สมดุล'}</span><span>ต่าง ฿${tripFmtNum(Math.abs(t.diff || 0))}</span>
                </div>
            </div>
            <div style="font-size:13px; font-weight:bold; margin-bottom:4px;">สรุปรายจ่ายต่อคน</div>
            <div style="margin-bottom:12px;">${memberRows}</div>
            ${keptRows ? `<div style="background:#eff6ff; border-radius:10px; padding:8px 10px; margin-bottom:12px;">${keptRows}</div>` : ''}
            ${leftoverControls ? `<div style="font-size:13px; font-weight:bold; margin:10px 0 4px;">เลือกปลายทางเงินเหลือ</div><div style="margin-bottom:12px;">${leftoverControls}</div>` : ''}
            <div style="display:flex; gap:10px;">
                <button onclick="closeCloseTripModal()" style="flex:1; padding:11px; border:1px solid #e2e8f0; background:#f8fafc; border-radius:10px; cursor:pointer; font-weight:bold;">ยกเลิก</button>
                <button id="btn-confirm-close-trip" onclick="submitCloseTrip('${projectId}')" style="flex:1.4; padding:11px; border:none; background:#ef4444; color:#fff; border-radius:10px; cursor:pointer; font-weight:bold;">🔒 ยืนยันปิดทริป</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
};
window.closeCloseTripModal = function() { const m = document.getElementById('close-trip-modal'); if (m) m.remove(); };
window.submitCloseTrip = async function(projectId) {
    const btn = document.getElementById('btn-confirm-close-trip');
    if (btn) { btn.disabled = true; btn.textContent = 'กำลังปิดทริป...'; }
    try {
        const leftover_actions = {};
        (TravelState.wallets || []).forEach(w => {
            const select = document.getElementById(`close-leftover-${w.wallet_id}`);
            if (!select) return;
            const [mode, target_wallet_id] = select.value.split(':');
            leftover_actions[w.wallet_id] = mode === 'MOVE_TO_WALLET' ? { mode, target_wallet_id } : { mode: 'RETURN' };
        });
        const res = await fetch(`${API_BASE}/api/trips/close`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(getUserIdHeader()) },
            body: JSON.stringify({ project_id: projectId, confirm: 'CLOSE', leftover_actions })
        });
        const data = await res.json();
        if (data.success) {
            const r = data.report || {};
            showToast(`ปิดทริปแล้ว · ลงบิล ${r.posted_bills} รายการ · คืนเงิน ฿${tripFmtNum(r.refunded_thb || 0)}`, 'success');
            closeCloseTripModal();
            if (typeof loadTrips === 'function') loadTrips();
            closeTripDetail();
        } else {
            showToast(data.error || 'ปิดทริปล้มเหลว', 'error');
            if (btn) { btn.disabled = false; btn.textContent = '🔒 ยืนยันปิดทริป'; }
        }
    } catch(e) {
        showToast('ปิดทริปล้มเหลว', 'error');
        if (btn) { btn.disabled = false; btn.textContent = '🔒 ยืนยันปิดทริป'; }
    }
};

window.approveGuestExpense = async function(expenseId) {
    try {
        const res = await fetch(`${API_BASE}/api/trip-expenses/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(getUserIdHeader()) },
            body: JSON.stringify({ trip_expense_id: expenseId })
        });
        const data = await res.json();
        if(data.success) {
            showToast('อนุมัติบิลรายจ่ายแล้ว', 'success');
            openTripDetail(TravelState.currentTrip.project_id);
        }
    } catch(e) {
        showToast('อนุมัติบิลล้มเหลว', 'error');
    }
};

window.closeAndSettleTrip = async function() {
    const trip = TravelState.currentTrip;
    if(!trip) return;

    const pwdInput = prompt('🔒 กรุณาใส่รหัสผ่านทริปเพื่อยืนยันการจบทริป:');
    if (pwdInput !== trip.trip_password) {
        showToast('รหัสผ่านยืนยันไม่ถูกต้อง', 'error');
        return;
    }

    if(!confirm('ยืนยันที่จะปิดทริปและบันทึกข้อมูลรายจ่ายทั้งหมดไปยังประวัติหลัก?')) return;

    try {
        // Exclude flag filtering
        const excludedWallets = (TravelState.wallets || []).filter(w => w.exclude_on_close === 1).map(w => w.wallet_id);
        const validExpenses = (TravelState.expenses || []).filter(e => e.approved !== 0 && !excludedWallets.includes(e.wallet_id));

        // Send valid expenses to general transactions in database
        for (const e of validExpenses) {
            const catInfo = getCategoryInfo(e.category_id);
            await fetch(`${API_BASE}/api/transactions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(getUserIdHeader()) },
                body: JSON.stringify({
                    type: 'expense',
                    amount: parseFloat(e.amount_thb),
                    category_id: e.category_id || 'other',
                    note: `[ปิดทริป: ${trip.name}] ${e.note || catInfo.label}`,
                    date: e.expense_date || new Date().toISOString()
                })
            });
        }

        // Close the project
        await fetch(`${API_BASE}/api/trips`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(getUserIdHeader()) },
            body: JSON.stringify({
                project_id: trip.project_id,
                name: trip.name,
                status: 'closed'
            })
        });

        showToast('ปิดทริปและโอนรายจ่ายหลักสำเร็จแล้ว! 🎉', 'success');
        closeTripDetail();
        if (typeof loadTrips === 'function') loadTrips();

    } catch(e) {
        showToast('จบทริปล้มเหลว', 'error');
    }
};

window.selectItineraryStop = function(stopId) {
    const isCurrentlySelected = TravelState.selectedStopId === stopId;
    
    // Hide and clear all other accordions first
    document.querySelectorAll('.itinerary-accordion-docs').forEach(el => {
        if (el.id !== `accordion-docs-${stopId}`) {
            el.style.display = 'none';
            el.innerHTML = '';
        }
    });

    // Reset all highlights
    document.querySelectorAll('.itinerary-item').forEach(el => {
        el.style.border = '1.5px solid #E6DFD3';
        el.style.background = '#FFFDF9';
        el.style.transform = 'none';
        el.style.boxShadow = 'none';
    });

    if (isCurrentlySelected) {
        // Toggle off if clicking the already selected card
        TravelState.selectedStopId = null;
        const accordionEl = document.getElementById(`accordion-docs-${stopId}`);
        if (accordionEl) {
            accordionEl.style.display = 'none';
            accordionEl.innerHTML = '';
        }
        return;
    }

    TravelState.selectedStopId = stopId;
    
    const selectedEl = document.getElementById(`stop-item-${stopId}`);
    if (selectedEl) {
        selectedEl.style.border = '2.5px solid #43553E';
        selectedEl.style.background = '#F0EBE1';
        selectedEl.style.transform = 'translateY(-1px)';
        selectedEl.style.boxShadow = '0 4px 8px rgba(67, 85, 62, 0.1)';
    }
    
    const stop = TravelState.stops.find(s => s.stop_id === stopId);
    if (stop) {
        const accordionEl = document.getElementById(`accordion-docs-${stopId}`);
        if (accordionEl) {
            const tripDocs = TravelState.documents || [];
            const stopDocs = tripDocs.filter(d => d.related_entity_id === stopId);
            
            if (stopDocs.length > 0) {
                const docsHtml = `
                    <div style="display:flex; flex-direction:column; gap:6px; text-align:left; width:100%;">
                        ${stopDocs.map(d => {
                            const isImage = d.file_url.startsWith('data:image/');
                            return `
                                <div style="border:1px solid #cbd5e1; border-radius:8px; padding:6px; background:white; font-size:10px;">
                                    <div style="font-weight:bold; color:#475569; margin-bottom:4px;">${d.description || 'ไฟล์แนบ'}</div>
                                    ${isImage ? `
                                        <img src="${d.file_url}" style="width:100%; border-radius:6px; max-height:100px; object-fit:cover; cursor:pointer;" onclick="event.stopPropagation(); window.openDocumentAttachment('${d.document_id}', '${d.file_url}')">
                                    ` : `
                                        <a href="#" onclick="event.stopPropagation(); window.openDocumentAttachment('${d.document_id}', '${d.file_url}')" style="color:#43553E; font-weight:bold; text-decoration:underline;">เปิดลิงก์ / เอกสาร</a>
                                    `}
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
                accordionEl.innerHTML = docsHtml;
                accordionEl.style.display = 'block';
            } else {
                accordionEl.innerHTML = '';
                accordionEl.style.display = 'none';
            }
        }
    }
};

window.setMapTheme = function(theme) {
    const mapEl = document.getElementById('trip-map');
    if (mapEl) {
        mapEl.classList.remove('map-theme-ghibli', 'map-theme-onepiece');
        mapEl.classList.add(`map-theme-${theme}`);
        showToast(`สลับแผนที่เป็นธีม ${theme === 'ghibli' ? 'Ghibli สีน้ำ 🍃' : 'One Piece ล่าสมบัติ 🏴‍☠️'}`, 'success');
    }
};

window.openDocumentAttachment = function(docId, url) {
    if (url.startsWith('data:')) {
        const newWindow = window.open();
        if (url.includes('application/pdf')) {
            newWindow.document.write(`<iframe src="${url}" style="width:100%; height:100%; border:none;"></iframe>`);
        } else {
            newWindow.document.write(`<img src="${url}" style="max-width:100%; max-height:100%; display:block; margin:auto;">`);
        }
    } else {
        window.open(url, '_blank');
    }
};

window.deleteDocumentAttachment = async function(docId) {
    if (!confirm('ต้องการลบไฟล์แนบนี้ใช่หรือไม่?')) return;
    try {
        const headers = { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(getUserIdHeader()) };
        const res = await fetch(`${API_BASE}/api/trips/documents/delete`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ document_id: docId })
        });
        const data = await res.json();
        if (data.success) {
            showToast('ลบเอกสารสำเร็จ', 'success');
            const tripRes = await fetch(`${API_BASE}/api/travel?projectId=${TravelState.currentTrip.project_id}`, { headers });
            const tripData = await tripRes.json();
            TravelState.documents = tripData.documents || [];
            selectItineraryStop(TravelState.selectedStopId);
        }
    } catch (e) {
        console.error(e);
        showToast('ลบเอกสารไม่สำเร็จ', 'error');
    }
};

window.promptAddDriveLink = async function(stopId) {
    const link = prompt('กรุณาวางลิงก์ Google Drive หรือลิงก์ใบจองของคุณ:');
    if (!link || !link.trim()) return;
    
    try {
        const headers = { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(getUserIdHeader()) };
        const payload = {
            project_id: TravelState.currentTrip.project_id,
            related_entity_id: stopId,
            file_url: link.trim(),
            description: 'Google Drive Link',
            type: 'booking'
        };
        const res = await fetch(`${API_BASE}/api/trips/documents`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            showToast('บันทึกลิงก์สำเร็จ', 'success');
            const tripRes = await fetch(`${API_BASE}/api/travel?projectId=${TravelState.currentTrip.project_id}`, { headers });
            const tripData = await tripRes.json();
            TravelState.documents = tripData.documents || [];
            selectItineraryStop(stopId);
        }
    } catch (e) {
        console.error(e);
        showToast('ไม่สามารถบันทึกลิงก์ได้', 'error');
    }
};

window.handleBentoFileUpload = function(input, stopId) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(evt) {
        try {
            const headers = { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(getUserIdHeader()) };
            const payload = {
                project_id: TravelState.currentTrip.project_id,
                related_entity_id: stopId,
                file_url: evt.target.result,
                description: file.name,
                type: 'general'
            };
            const res = await fetch(`${API_BASE}/api/trips/documents`, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                showToast('อัปโหลดไฟล์สำเร็จ', 'success');
                const tripRes = await fetch(`${API_BASE}/api/travel?projectId=${TravelState.currentTrip.project_id}`, { headers });
                const tripData = await tripRes.json();
                TravelState.documents = tripData.documents || [];
                selectItineraryStop(stopId);
            }
        } catch (e) {
            console.error(e);
            showToast('อัปโหลดล้มเหลว', 'error');
        }
    };
    reader.readAsDataURL(file);
};

window.toggleTimelineEditMode = function() {
    TravelState.editModeEnabled = !TravelState.editModeEnabled;
    const controls = document.querySelectorAll('.timeline-edit-controls');
    controls.forEach(el => {
        el.style.display = TravelState.editModeEnabled ? 'flex' : 'none';
    });
    showToast(TravelState.editModeEnabled ? 'เปิดโหมดแก้ไขแล้ว' : 'ปิดโหมดแก้ไขแล้ว', 'info');
};

window.handleTimelineStopDragStart = function(event, stopId) {
    event.dataTransfer.setData('text/plain', stopId);
};

window.handleTimelineStopDrop = async function(event, targetDate, targetParentId = null) {
    event.preventDefault();
    event.stopPropagation();
    
    const stopId = event.dataTransfer.getData('text/plain');
    if (!stopId) return;
    if (stopId === targetParentId) return; // Prevent self-parenting
    
    // Cyclic drop validation helper
    const isDescendant = (parent, child) => {
        let current = TravelState.stops.find(s => s.stop_id === child);
        while (current && current.parent_stop_id) {
            if (current.parent_stop_id === parent) return true;
            current = TravelState.stops.find(s => s.stop_id === current.parent_stop_id);
        }
        return false;
    };

    if (targetParentId && isDescendant(stopId, targetParentId)) {
        showToast('ไม่สามารถย้ายสถานที่แม่ไปเป็นสถานที่ย่อยของตัวเองได้', 'error');
        return;
    }
    
    const stop = TravelState.stops.find(s => s.stop_id === stopId);
    if (stop) {
        let parentId = targetParentId;
        
        // If dropped on day header/group (targetParentId is null) but there is a Main Day City on that date,
        // automatically make it a child of that City.
        if (!parentId && targetDate) {
            const mainDays = TravelState.stops.filter(s => 
                !s.parent_stop_id &&
                (s.stop_date || '').substring(0, 10) === targetDate && 
                s.is_main_day === 1 && 
                ((s.location_type || '').includes('เมือง') || (s.location_type || '').includes('City'))
            );
            if (mainDays.length > 0 && mainDays[0].stop_id !== stopId) {
                parentId = mainDays[0].stop_id;
            }
        }

        if (parentId) {
            stop.parent_stop_id = parentId;
            const targetStop = TravelState.stops.find(s => s.stop_id === parentId);
            if (targetStop && targetStop.stop_date) {
                stop.stop_date = targetStop.stop_date;
            }
        } else {
            stop.parent_stop_id = null;
            if (targetDate) {
                stop.stop_date = targetDate;
            }
        }
        
        try {
            const headers = { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(getUserIdHeader()) };
            const res = await fetch(`${API_BASE}/api/trip-stops`, {
                method: 'POST',
                headers,
                body: JSON.stringify(stop)
            });
            const data = await res.json();
            if (data.success) {
                showToast(`ย้ายสลับโครงสร้างสถานที่สำเร็จ`, 'success');
                openTripDetail(TravelState.currentTrip.project_id);
            }
        } catch(e) {
            console.error(e);
            showToast('ไม่สามารถเปลี่ยนโครงสร้างลำดับสถานที่ได้', 'error');
        }
    }
};

window.showWeatherTooltip = async function(event, stopId) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    document.querySelectorAll('.app-tooltip').forEach(el => el.remove());
    
    const stop = TravelState.stops.find(s => s.stop_id === stopId);
    if (!stop) return;
    
    TravelState.weatherCache = TravelState.weatherCache || {};
    let wData = TravelState.weatherCache[stop.accommodation];
    
    const rect = event.currentTarget.getBoundingClientRect();
    const tooltip = document.createElement('div');
    tooltip.className = 'app-tooltip';
    tooltip.style = `
        position: absolute;
        z-index: 10000;
        background: white;
        border: 2px solid #43553E;
        border-radius: 12px;
        padding: 10px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.15);
        width: 210px;
        left: ${rect.left + window.scrollX + (rect.width / 2) - 105}px;
        top: ${rect.top + window.scrollY - 188}px;
        pointer-events: auto;
    `;
    
    tooltip.innerHTML = `
        <div style="font-size:11px; text-align:center; padding:10px; color:#64748b;">
            <i class="fa-solid fa-spinner fa-spin" style="margin-right:6px;"></i>กำลังโหลดพยากรณ์อากาศ...
        </div>
    `;
    document.body.appendChild(tooltip);
    
    const closeHandler = () => {
        tooltip.remove();
        document.removeEventListener('click', closeHandler);
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 10);
    
    try {
        if (!wData) {
            let lat = 43.06, lng = 141.35;
            const cityName = stop.accommodation;
            
            const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityName)}&format=json&limit=1`);
            const geoData = await geoRes.json();
            if (geoData && geoData.length > 0) {
                lat = parseFloat(geoData[0].lat);
                lng = parseFloat(geoData[0].lon);
            }
            
            const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weathercode,temperature_2m_max,temperature_2m_min&hourly=weathercode,temperature_2m&forecast_days=16&timezone=auto`);
            wData = await weatherRes.json();
            TravelState.weatherCache[cityName] = wData;
        }
        
        const stopDateStr = stop.stop_date ? stop.stop_date.substring(0, 10) : '';
        const dayIndex = wData.daily.time.indexOf(stopDateStr);
        if (dayIndex === -1) {
            tooltip.innerHTML = `
                <div style="font-size:10px; text-align:center; padding:10px; color:#f43f5e;">
                    ไม่มีพยากรณ์อากาศสำหรับวันนี้
                </div>
            `;
            return;
        }
        
        const code = wData.daily.weathercode[dayIndex];
        const maxTemp = Math.round(wData.daily.temperature_2m_max[dayIndex]);
        const minTemp = Math.round(wData.daily.temperature_2m_min[dayIndex]);
        
        let emoji = '🌤️';
        let statusText = 'มีเมฆบางส่วน';
        if (code === 0) { emoji = '☀️'; statusText = 'ท้องฟ้าแจ่มใส'; }
        else if (code >= 51 && code <= 67) { emoji = '🌧️'; statusText = 'ฝนตก'; }
        else if (code >= 71 && code <= 77) { emoji = '❄️'; statusText = 'หิมะตก'; }
        else if (code >= 80 && code <= 82) { emoji = '🌧️'; statusText = 'ฝนตกหนัก'; }
        else if (code >= 85 && code <= 86) { emoji = '❄️'; statusText = 'หิมะตกหนัก'; }
        else if (code >= 95) { emoji = '⚡'; statusText = 'พายุฝนฟ้าคะนอง'; }
        
        let hourlyHtml = '';
        if (wData.hourly) {
            const morningTime = `${stopDateStr}T09:00`;
            const eveningTime = `${stopDateStr}T17:00`;
            const nightTime = `${stopDateStr}T22:00`;
            
            const hTimes = wData.hourly.time;
            const idxM = hTimes.indexOf(morningTime);
            const idxE = hTimes.indexOf(eveningTime);
            const idxN = hTimes.indexOf(nightTime);
            
            const getPeriodEmoji = (c) => {
                if (c === 0) return '☀️';
                if (c >= 51 && c <= 67) return '🌧️';
                if (c >= 71 && c <= 77) return '❄️';
                if (c >= 80 && c <= 82) return '🌧️';
                if (c >= 85 && c <= 86) return '❄️';
                if (c >= 95) return '⚡';
                return '🌤️';
            };
            
            const tempM = idxM !== -1 ? Math.round(wData.hourly.temperature_2m[idxM]) : '-';
            const codeM = idxM !== -1 ? wData.hourly.weathercode[idxM] : null;
            const tempE = idxE !== -1 ? Math.round(wData.hourly.temperature_2m[idxE]) : '-';
            const codeE = idxE !== -1 ? wData.hourly.weathercode[idxE] : null;
            const tempN = idxN !== -1 ? Math.round(wData.hourly.temperature_2m[idxN]) : '-';
            const codeN = idxN !== -1 ? wData.hourly.weathercode[idxN] : null;
            
            hourlyHtml = `
                <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:6px; text-align:center; margin-top:10px; background:#f8fafc; padding:8px; border-radius:10px;">
                    <div>
                        <div style="font-weight:bold; color:#d97706; font-size:9px;">เช้า (9:00)</div>
                        <div style="font-size:16px; margin:2px 0;">${getPeriodEmoji(codeM)}</div>
                        <div style="font-weight:800; font-size:11px; color:#1e293b;">${tempM}°C</div>
                    </div>
                    <div style="border-left:1px dashed #cbd5e1;">
                        <div style="font-weight:bold; color:#b45309; font-size:9px;">เย็น (17:00)</div>
                        <div style="font-size:16px; margin:2px 0;">${getPeriodEmoji(codeE)}</div>
                        <div style="font-weight:800; font-size:11px; color:#1e293b;">${tempE}°C</div>
                    </div>
                    <div style="border-left:1px dashed #cbd5e1;">
                        <div style="font-weight:bold; color:#1e3a8a; font-size:9px;">ดึก (22:00)</div>
                        <div style="font-size:16px; margin:2px 0;">${getPeriodEmoji(codeN)}</div>
                        <div style="font-weight:800; font-size:11px; color:#1e293b;">${tempN}°C</div>
                    </div>
                </div>
            `;
        }
        
        tooltip.innerHTML = `
            <div style="text-align:center;">
                <div style="font-size:9.5px; font-weight:bold; color:#64748b;">${formatTripDate(stop.stop_date)}</div>
                <div style="font-size:11px; font-weight:800; color:#1e293b; margin-top:1px;">📍 ${stop.accommodation}</div>
                <div style="display:flex; align-items:center; justify-content:center; gap:8px; margin:4px 0;">
                    <span style="font-size:28px;">${emoji}</span>
                    <div style="text-align:left;">
                        <div style="font-weight:800; font-size:12px; color:#0f172a;">${maxTemp}°C / ${minTemp}°C</div>
                        <div style="font-size:8.5px; color:#64748b;">${statusText}</div>
                    </div>
                </div>
                ${hourlyHtml}
            </div>
            <div style="position: absolute; bottom: -8px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 8px solid transparent; border-right: 8px solid transparent; border-top: 8px solid #43553E;"></div>
            <div style="position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 7px solid transparent; border-right: 7px solid transparent; border-top: 7px solid white;"></div>
        `;
    } catch (err) {
        console.error(err);
        tooltip.innerHTML = `
            <div style="font-size:10px; text-align:center; padding:10px; color:#f43f5e;">
                เกิดข้อผิดพลาดในการโหลดสภาพอากาศ
            </div>
        `;
    }
};

window.initMarkerDrag = function(event, stopId) {
    event.preventDefault();
    event.stopPropagation();
    
    const pin = document.getElementById(`board-pin-${stopId}`);
    if (!pin) return;
    
    let isDragged = false;
    const startX = event.clientX;
    const startY = event.clientY;
    
    pin.classList.remove('board-pin-animated');
    
    const board = document.getElementById('custom-game-board');
    if (!board) return;
    const boardRect = board.getBoundingClientRect();
    
    function onMouseMove(e) {
        if (Math.abs(e.clientX - startX) > 4 || Math.abs(e.clientY - startY) > 4) {
            isDragged = true;
        }
        
        let leftPx = e.clientX - boardRect.left;
        let topPx = e.clientY - boardRect.top;
        
        let leftPct = (leftPx / boardRect.width) * 100;
        let topPct = (topPx / boardRect.height) * 100;
        
        if (leftPct < 2) leftPct = 2;
        if (leftPct > 98) leftPct = 98;
        if (topPct < 2) topPct = 2;
        if (topPct > 98) topPct = 98;
        
        pin.style.left = `${leftPct}%`;
        pin.style.top = `${topPct}%`;
    }
    
    async function onMouseUp(e) {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        
        pin.classList.add('board-pin-animated');
        
        if (!isDragged) {
            window.showStopNotePopup(stopId);
            return;
        }
        
        if (TravelState.isGuest) return;
        
        const leftPct = parseFloat(pin.style.left);
        const topPct = parseFloat(pin.style.top);
        
        const stop = TravelState.stops.find(s => s.stop_id === stopId);
        if (stop) {
            stop.latitude = topPct.toFixed(2);
            stop.longitude = leftPct.toFixed(2);
            
            try {
                const headers = { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(getUserIdHeader()) };
                await fetch(`${API_BASE}/api/trip-stops`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(stop)
                });
                showToast(`ปรับตำแหน่ง ${stop.accommodation} บนกระดานสำเร็จ`, 'success');
            } catch(err) {
                console.error(err);
                showToast('ไม่สามารถบันทึกตำแหน่งบนกระดานได้', 'error');
            }
        }
    }
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
};

window.showStopNotePopup = function(stopId) {
    const stop = TravelState.stops.find(s => s.stop_id === stopId);
    if (!stop) return;
    
    const noteContent = (stop.notes || '').trim();
    if (!noteContent) {
        showToast('ไม่มีโน้ตสำหรับสถานที่นี้', 'info');
        return;
    }
    
    const pin = document.getElementById(`board-pin-${stopId}`);
    if (!pin) return;
    
    document.querySelectorAll('.app-tooltip').forEach(el => el.remove());
    
    const rect = pin.getBoundingClientRect();
    const tooltip = document.createElement('div');
    tooltip.className = 'app-tooltip';
    tooltip.style = `
        position: absolute;
        z-index: 10000;
        background: white;
        border: 2px solid #43553E;
        border-radius: 12px;
        padding: 8px 10px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.15);
        width: 180px;
        left: ${rect.left + window.scrollX + (rect.width / 2) - 90}px;
        top: ${rect.top + window.scrollY - 85}px;
        pointer-events: auto;
    `;
    
    tooltip.innerHTML = `
        <div style="font-weight:800; color:#43553E; margin-bottom:4px; font-size:9.5px; text-align:center;">${stop.icon || '📍'} ${stop.accommodation}</div>
        <div style="background:#f8fafc; padding:6px; border-radius:6px; font-size:9.5px; color:#475569; white-space:pre-wrap; max-height:100px; overflow-y:auto; text-align:left;">${noteContent}</div>
        <div style="position: absolute; bottom: -8px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 8px solid transparent; border-right: 8px solid transparent; border-top: 8px solid #43553E;"></div>
        <div style="position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 7px solid transparent; border-right: 7px solid transparent; border-top: 7px solid white;"></div>
    `;
    
    document.body.appendChild(tooltip);
    
    const closeHandler = () => {
        tooltip.remove();
        document.removeEventListener('click', closeHandler);
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 10);
};

window.showStopDocumentsPopup = function(stopId) {
    const stop = TravelState.stops.find(s => s.stop_id === stopId);
    if (!stop) return;
    
    const tripDocs = TravelState.documents || [];
    const stopDocs = tripDocs.filter(d => d.related_entity_id === stopId);
    
    if (stopDocs.length === 0) {
        return;
    }
    
    const modal = document.createElement('div');
    modal.style = "position:fixed; inset:0; background:rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; z-index:9999; backdrop-filter:blur(4px);";
    modal.onclick = () => modal.remove();
    
    modal.innerHTML = `
        <div style="background:white; border-radius:18px; width:340px; padding:18px; box-shadow:0 10px 25px rgba(0,0,0,0.1); position:relative;" onclick="event.stopPropagation()">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1.5px dashed #cbd5e1; padding-bottom:8px; margin-bottom:12px;">
                <h3 style="margin:0; font-size:13px; font-weight:800; color:#43553E;">🎫 เอกสารและรูปแนบ (${stop.accommodation})</h3>
                <button onclick="this.closest('div').parentElement.remove()" style="background:none; border:none; font-size:14px; cursor:pointer; color:#94a3b8; font-weight:bold;">✕</button>
            </div>
            <div style="display:flex; flex-direction:column; gap:10px; max-height:300px; overflow-y:auto;">
                ${stopDocs.map(d => {
                    const isImage = d.file_url.startsWith('data:image/');
                    return `
                        <div style="border:1.5px solid #E6DFD3; border-radius:10px; padding:8px; background:#FFFDF9;">
                            <div style="font-weight:bold; font-size:11px; color:#4a5568; margin-bottom:6px;">${d.description || 'ไฟล์แนบ'}</div>
                            ${isImage ? `
                                <img src="${d.file_url}" style="width:100%; border-radius:8px; display:block; max-height:160px; object-fit:cover;" onclick="window.openDocumentAttachment('${d.document_id}', '${d.file_url}')" title="คลิกเพื่อดูรูปขนาดเต็ม">
                            ` : `
                                <button class="btn-trip-add-sm" onclick="window.openDocumentAttachment('${d.document_id}', '${d.file_url}')" style="width:100%; font-size:10px; background:#43553E; color:white; padding:4px; border-radius:6px;">เปิดลิงก์ / เอกสาร</button>
                            `}
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};

// ============================================================================
// Trip workspace 2026
// The former trip dashboard above remains only as an API compatibility layer.
// These renderers are the single UI entry point for the responsive trip workspace.
// ============================================================================
function tripUiEscape(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
}

function tripUiMembers(trip) {
    try { return Array.isArray(trip.members) ? trip.members : JSON.parse(trip.members || '[]'); }
    catch (_) { return String(trip.members || '').split(',').map(item => item.trim()).filter(Boolean); }
}

function tripUiBanner(trip) {
    const banner = trip.theme_banner || 'assets/images/banner_japan.jpg';
    if (/^https?:\/\//i.test(banner) || banner.startsWith('data:')) return banner;
    return banner.replace(/^\/+/, '');
}

function tripUiMapAsset(trip) {
    const location = `${trip.name || ''} ${trip.destination || ''}`.toLowerCase();
    if (location.includes('hokkaido') || location.includes('ฮอกไกโด')) return 'assets/images/hokkaido_ghibli_map.jpg';
    return 'assets/images/banner_japan.jpg';
}

function tripUiStopImage(stop, index) {
    const text = `${stop.accommodation || ''} ${stop.notes || ''}`.toLowerCase();
    if (/วัด|temple|ศาลเจ้า/.test(text)) return 'assets/images/highlights/hl_temple.jpg';
    if (/รถไฟ|train|jr|flight|บิน/.test(text)) return 'assets/images/highlights/hl_train.jpg';
    if (/อาหาร|ramen|ราเมง|sushi|ซูชิ/.test(text)) return 'assets/images/highlights/hl_ramen.jpg';
    if (/ช้อป|shop|market|ตลาด/.test(text)) return 'assets/images/highlights/hl_shopping.jpg';
    if (/ออนเซ็น|onsen/.test(text)) return 'assets/images/highlights/hl_onsen.jpg';
    return ['assets/images/highlights/hl_mountain.jpg', 'assets/images/highlights/hl_snow.jpg', 'assets/images/highlights/hl_sunrise.jpg'][index % 3];
}

function tripUiPinPositions(trip, rootStops) {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(`trip_map_pins_${trip.project_id}`) || '{}'); } catch (_) {}
    const defaults = [[18,65],[51,76],[82,57],[68,38],[31,44]];
    return rootStops.map((stop, index) => ({
        id: stop.stop_id,
        x: Number(saved[stop.stop_id]?.x ?? defaults[index % defaults.length][0]),
        y: Number(saved[stop.stop_id]?.y ?? defaults[index % defaults.length][1])
    }));
}

window.tripUiSelectPlace = function(stopId) {
    TravelState.currentItineraryStopId = stopId;
    window.renderTripDetailModal();
};

window.tripUiBeginPinDrag = function(event, projectId, stopId) {
    event.preventDefault();
    event.stopPropagation();
    const pin = event.currentTarget;
    const hero = pin.closest('.it-map-hero');
    if (!hero) return;
    let moved = false;
    const move = moveEvent => {
        moved = true;
        const rect = hero.getBoundingClientRect();
        const x = Math.max(6, Math.min(94, ((moveEvent.clientX - rect.left) / rect.width) * 100));
        const y = Math.max(22, Math.min(86, ((moveEvent.clientY - rect.top) / rect.height) * 100));
        pin.style.left = `${x}%`;
        pin.style.top = `${y}%`;
        const points = [...hero.querySelectorAll('.it-map-pin')].map(item => `${parseFloat(item.style.left)} ${parseFloat(item.style.top)}`).join(', ');
        hero.querySelector('.it-route-svg polyline')?.setAttribute('points', points);
    };
    const up = () => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        let saved = {};
        try { saved = JSON.parse(localStorage.getItem(`trip_map_pins_${projectId}`) || '{}'); } catch (_) {}
        saved[stopId] = { x: parseFloat(pin.style.left), y: parseFloat(pin.style.top) };
        localStorage.setItem(`trip_map_pins_${projectId}`, JSON.stringify(saved));
        if (!moved) window.tripUiSelectPlace(stopId);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
};

function tripUiItineraryScreen(trip, members, stops, rootStops) {
    const first = rootStops.find(stop => stop.stop_id === TravelState.currentItineraryStopId) || rootStops[0] || {};
    const routeStops = rootStops.slice(0, 3);
    const pinPositions = tripUiPinPositions(trip, routeStops);
    const dateLabel = `${formatTripDate(trip.start_date)} – ${formatTripDate(trip.end_date)}`;
    const dayNumber = first.stop_date && trip.start_date ? Math.max(1, Math.round((new Date(first.stop_date) - new Date(trip.start_date)) / 86400000) + 1) : 1;
    const mapPins = routeStops.map((stop, index) => { const pos = pinPositions[index]; return `<button class="it-map-pin pin-${index} ${first.stop_id === stop.stop_id ? 'active' : ''}" style="left:${pos.x}%;top:${pos.y}%" onclick="tripUiSelectPlace('${stop.stop_id}')" onpointerdown="tripUiBeginPinDrag(event,'${trip.project_id}','${stop.stop_id}')" title="ลากเพื่อจัดตำแหน่งหมุด"><i>${['📍','📍','📍'][index % 3]}</i><b>${tripUiEscape(stop.accommodation || stop.location || `เมือง ${index + 1}`)}</b><small>${tripUiEscape(stop.stop_date ? formatTripDate(stop.stop_date) : '')}</small></button>`; }).join('');
    const routePoints = pinPositions.map(pos => `${pos.x} ${pos.y}`).join(', ');
    const placesHtml = rootStops.length ? rootStops.map((place, placeIndex) => {
        const children = stops.filter(stop => stop.parent_stop_id === place.stop_id).sort((a,b) => String(a.time || '').localeCompare(String(b.time || '')));
        const placeName = tripUiEscape(place.accommodation || place.location || `สถานที่ ${placeIndex + 1}`);
        return `<article class="it-place-card"><div class="it-main-pin">📍</div><div class="it-place-heading"><div><h3>${placeName}</h3><p>${tripUiEscape(place.notes || 'วางแผนกิจกรรมและจุดแวะในสถานที่นี้')}</p></div><button class="it-collapse" aria-label="ย่อรายการ">⌃</button></div><div class="it-substeps">${children.length ? children.map((child, childIndex) => `<div class="it-substep"><span class="it-branch"></span><img src="${tripUiStopImage(child, childIndex)}" alt=""><div class="it-substep-copy"><b>${tripUiEscape(child.accommodation || child.location || 'จุดแวะ')}</b><small>${tripUiEscape(child.notes || 'รายละเอียดกิจกรรม')}</small></div><div class="it-substep-time"><span>◷ ${tripUiEscape(child.time || '—')}</span><small>◷ ${tripUiEscape(child.duration || '—')}</small></div><button class="it-more" aria-label="ตัวเลือก">⋮</button></div>`).join('') : `<div class="it-empty-substep"><span>＋</span><div><b>ยังไม่มีจุดย่อย</b><small>เพิ่มกิจกรรมภายใต้ ${placeName}</small></div></div>`}</div><button class="it-add-substep" onclick="openAddStopModal('${trip.project_id}', '${place.stop_id}')">＋ เพิ่มกิจกรรมใน ${placeName}</button></article>`;
    }).join('') : `<div class="it-empty-plan"><b>ยังไม่มีสถานที่ในแผน</b><span>เริ่มจากการเพิ่มเมืองหรือสถานที่หลักของวันแรก</span></div>`;
    return `<div class="trip-itinerary-screen"><header class="it-map-hero" style="background-image:linear-gradient(90deg,rgba(255,255,255,.92) 0%,rgba(255,255,255,.58) 48%,rgba(255,255,255,.08) 100%),url('${tripUiEscape(tripUiMapAsset(trip))}')"><button class="it-back" onclick="closeTripDetail()">← ทริปทั้งหมด</button><span class="it-status">${trip.status === 'closed' ? 'ความทรงจำ' : trip.status === 'planned' ? 'กำลังจะไป' : 'กำลังเดินทาง'}</span><div class="it-hero-copy"><h1>แผนเที่ยว</h1><h2>${tripUiEscape(trip.name || 'ทริปใหม่')}</h2><div class="it-date-card"><span>▣ ${tripUiEscape(dateLabel)}</span><span>♟ ${members.length || 1}</span></div></div><svg class="it-route-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${routePoints}" /></svg>${mapPins}</header><main class="it-day-sheet"><div class="it-day-heading"><span class="it-day-bubble">วัน<br><b>${dayNumber}</b></span><div><span class="it-city-icon">🏙️</span><h2>${tripUiEscape(first.accommodation || first.location || 'เริ่มวางแผนวันแรก')}</h2><p>📅 ${tripUiEscape(first.stop_date ? formatTripDate(first.stop_date) : dateLabel)}</p></div></div><section class="it-weather-card"><div class="it-weather-title"><b>สภาพอากาศ</b><span>📍 ${tripUiEscape(first.accommodation || 'ยังไม่ระบุเมือง')}</span></div><div class="it-weather-row">${tripUiWeather(trip, first)}</div></section><section class="it-places">${placesHtml}</section></main><button class="it-fab-add" onclick="openAddStopModal('${trip.project_id}')"><b>＋</b><span>เพิ่มสถานที่</span></button><nav class="it-bottom-nav"><button class="active">📍<span>แผนเที่ยว</span></button><button onclick="switchTravelTab('wallets')">👛<span>กระเป๋าเงิน</span></button><button onclick="switchTravelTab('expenses')">🧾<span>รายจ่าย</span></button><button onclick="switchTravelTab('settings')">•••<span>เพิ่มเติม</span></button></nav></div>`;
}

function tripUiWalletStats(wallet, expenses) {
    const funded = Number(wallet.funded_foreign ?? wallet.initial_balance_foreign ?? 0);
    const spent = Number(wallet.spent_foreign ?? expenses.filter(expense => expense.wallet_id === wallet.wallet_id && expense.approved !== 0)
        .reduce((sum, expense) => sum + Number(expense.amount_foreign ?? expense.amount_thb ?? 0), 0));
    const remaining = Number(wallet.leftover_foreign ?? (funded - spent));
    const rate = Number(wallet.avg_rate || (Number(wallet.initial_balance_thb || 0) / (Number(wallet.initial_balance_foreign) || 1)) || 0);
    return { funded, spent, remaining, rate, thb: Number(wallet.leftover_thb ?? (remaining * rate)) };
}

function tripUiWeather(trip, stop) {
    const date = String(stop.stop_date || '').slice(0, 10);
    const daily = TravelState.weatherData?.daily;
    const index = daily?.time?.indexOf(date);
    const max = index >= 0 ? Math.round(daily.temperature_2m_max?.[index] ?? 0) : null;
    const min = index >= 0 ? Math.round(daily.temperature_2m_min?.[index] ?? 0) : null;
    if (max === null) return `<div>🌤️ เช้า<strong>—</strong></div><div>☀️ บ่าย<strong>—</strong></div><div>🌙 ค่ำ<strong>—</strong></div>`;
    const middle = Math.round((max + min) / 2);
    return `<div>🌤️ เช้า<strong>${min}°</strong><small>ฝน 10%</small></div><div>☀️ บ่าย<strong>${max}°</strong><small>ฝน 20%</small></div><div>🌙 ค่ำ<strong>${middle}°</strong><small>ฝน 10%</small></div>`;
}

window.renderTripsView = function renderTripsWorkspace() {
    const container = document.getElementById('travel-trips-list');
    if (!container) return;
    const tab = TravelState.currentTripListTab || 'ONGOING';
    const status = { ONGOING:'active', INCOMING:'planned', MEMORY:'closed' }[tab] || 'active';
    const trips = (TravelState.trips || []).filter(trip => trip.status === status);
    container.innerHTML = trips.length ? trips.map(trip => {
        const selected = TravelState.currentTrip?.project_id === trip.project_id ? ' active' : '';
        const statusText = trip.status === 'closed' ? 'ความทรงจำ' : trip.status === 'planned' ? 'กำลังจะไป' : 'กำลังเดินทาง';
        return `<button class="trip-list-card${selected}" onclick="openTripDetail('${trip.project_id}')">
            <img src="${tripUiEscape(tripUiBanner(trip))}" alt="" onerror="this.src='assets/images/banner_japan.jpg'">
            <span><strong>${tripUiEscape(trip.name || 'ทริปใหม่')}</strong><small>📍 ${tripUiEscape(trip.destination || 'ยังไม่ระบุปลายทาง')}</small><small>📅 ${tripUiEscape(formatTripDate(trip.start_date))} – ${tripUiEscape(formatTripDate(trip.end_date))}</small><span class="trip-list-status">${statusText}</span></span>
        </button>`;
    }).join('') : `<div style="padding:24px 10px;text-align:center;color:#7b8aa3;font-size:.85rem">ยังไม่มีทริปในหมวดนี้<br><button class="trip-btn soft" style="margin-top:10px" onclick="openNewTripModal()">+ สร้างทริป</button></div>`;
};

window.switchTripTab = function switchTripWorkspaceTab(tab) {
    TravelState.currentTripListTab = tab;
    document.querySelectorAll('.trip-filter-tabs button').forEach(button => button.classList.toggle('active', button.id === `tab-trip-${tab.toLowerCase()}`));
    renderTripsView();
};

window.openTripDetail = async function openTripWorkspace(projectId) {
    try {
        const response = await fetch(`${API_BASE}/api/travel?projectId=${encodeURIComponent(projectId)}`, {
            headers: { 'x-user-id': encodeURIComponent(getUserIdHeader()) }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        TravelState.currentTrip = data.trip;
        TravelState.expenses = data.expenses || [];
        TravelState.stops = data.stops || [];
        TravelState.wallets = data.wallets || [];
        TravelState.weatherData = data.weatherData || null;
        TravelState.documents = data.documents || [];
        TravelState.currentTripTabDetail = TravelState.currentTripTabDetail || 'itinerary';
        document.getElementById('travel-empty-state')?.style.setProperty('display', 'none');
        document.getElementById('travel-details-panel')?.style.setProperty('display', 'block');
        renderTripsView();
        window.renderTripDetailModal();
    } catch (error) {
        console.error('openTripDetail error', error);
        showToast(`โหลดทริปล้มเหลว: ${error.message}`, 'error');
    }
};

window.closeTripDetail = function closeTripWorkspace() {
    TravelState.currentTrip = null;
    document.getElementById('travel-details-panel')?.style.setProperty('display', 'none');
    document.getElementById('travel-empty-state')?.style.setProperty('display', 'grid');
    renderTripsView();
};

window.switchTravelTab = function switchTripWorkspaceDetail(tab) {
    TravelState.currentTripTabDetail = tab;
    window.renderTripDetailModal();
};

window.renderTripDetailModal = function renderTripWorkspaceDetail() {
    const trip = TravelState.currentTrip;
    const container = document.querySelector('#travel-details-panel .trip-detail-content');
    if (!trip || !container) return;
    const tab = TravelState.currentTripTabDetail || 'itinerary';
    const expenses = TravelState.expenses || [];
    const wallets = TravelState.wallets || [];
    const stops = TravelState.stops || [];
    const members = tripUiMembers(trip);
    const budget = Number(trip.total_budget || 0);
    const spent = expenses.filter(expense => expense.approved !== 0).reduce((sum, expense) => sum + Number(expense.amount_thb || 0), 0);
    const remaining = budget - spent;
    const rootStops = stops.filter(stop => !stop.parent_stop_id).sort((a,b) => String(a.stop_date || '').localeCompare(String(b.stop_date || '')) || String(a.time || '').localeCompare(String(b.time || '')));
    if (tab === 'itinerary') {
        container.innerHTML = tripUiItineraryScreen(trip, members, stops, rootStops);
        return;
    }
    const navigation = [['itinerary','🗺️ แผนเที่ยว'],['wallets','👛 กระเป๋าเงิน'],['expenses','🧾 บิล'],['settings','⚙️ จัดการทริป']];
    const hero = `<header class="trip-map-hero" style="background-image:linear-gradient(90deg,rgba(255,255,255,.94) 0%,rgba(255,255,255,.72) 46%,rgba(218,244,249,.18) 100%),url('${tripUiEscape(tripUiMapAsset(trip))}')">
        <div class="trip-hero-actions"><button class="trip-back" onclick="closeTripDetail()">← ทริปทั้งหมด</button><span class="trip-status">${trip.status === 'closed' ? 'ความทรงจำ' : trip.status === 'planned' ? 'กำลังจะไป' : 'กำลังเดินทาง'}</span></div>
        <h1>${tripUiEscape(trip.name || 'ทริปใหม่')}</h1><p>📅 ${tripUiEscape(formatTripDate(trip.start_date))} – ${tripUiEscape(formatTripDate(trip.end_date))} &nbsp;·&nbsp; 👥 ${members.length || 1} คน</p>
    </header>
    <div class="trip-summary-row"><div class="trip-summary-card"><span>งบประมาณ</span><strong>฿${tripFmtNum(budget)}</strong></div><div class="trip-summary-card"><span>ใช้ไป</span><strong>฿${tripFmtNum(spent)}</strong></div><div class="trip-summary-card"><span>${remaining < 0 ? 'เกินงบ' : 'คงเหลือ'}</span><strong>฿${tripFmtNum(Math.abs(remaining))}</strong></div></div>
    <nav class="trip-nav">${navigation.map(([id,label]) => `<button class="${tab === id ? 'active' : ''}" onclick="switchTravelTab('${id}')">${label}</button>`).join('')}</nav>`;
    let content = '';
    if (tab === 'itinerary') {
        content = `<div class="trip-page-grid"><section class="trip-panel"><div class="trip-panel-head"><h3>แผนเที่ยวรายวัน</h3><button class="trip-btn" onclick="openAddStopModal('${trip.project_id}')">+ เพิ่มสถานที่</button></div>${rootStops.length ? `<div class="trip-itinerary">${rootStops.map((place, index) => {
            const children = stops.filter(stop => stop.parent_stop_id === place.stop_id).sort((a,b) => String(a.time || '').localeCompare(String(b.time || '')));
            const placeName = tripUiEscape(place.accommodation || place.location || `สถานที่ ${index + 1}`);
            return `<article class="trip-place"><div class="trip-place-title"><span>📍 ${placeName}</span><small>${tripUiEscape(place.stop_date ? formatTripDate(place.stop_date) : 'รอระบุวัน')}</small></div><div class="trip-substops">${children.length ? children.map(child => `<div class="trip-substop"><time>${tripUiEscape(child.time || '—')}</time><i>${tripUiEscape(child.icon || '📍')}</i><span><b>${tripUiEscape(child.accommodation || child.location || 'จุดแวะ')}</b><small>${tripUiEscape(child.notes || child.duration || '')}</small></span></div>`).join('') : `<div class="trip-substop"><time>—</time><i>＋</i><span><b>ยังไม่มีจุดย่อย</b><small>เพิ่มกิจกรรมภายใต้ ${placeName}</small></span></div>`}</div><button class="trip-btn soft" style="margin:8px 0 0 12px" onclick="openAddStopModal('${trip.project_id}', '${place.stop_id}')">+ เพิ่มจุดย่อย</button></article>`;
        }).join('')}</div>` : `<div style="text-align:center;padding:30px;color:#71809b">ยังไม่มีแผนเที่ยว<br><button class="trip-btn" style="margin-top:10px" onclick="openAddStopModal('${trip.project_id}')">เริ่มเพิ่มสถานที่</button></div>`}</section>
        <aside class="trip-panel"><div class="trip-panel-head"><h3>อากาศตามแผน</h3><span style="font-size:.72rem;color:#71809b">${rootStops[0]?.accommodation || 'ยังไม่ระบุเมือง'}</span></div><div class="trip-weather">${tripUiWeather(trip, rootStops[0] || {})}</div><p style="font-size:.75rem;color:#71809b;margin:14px 0 0">พยากรณ์จะแสดงตามเมืองและวันที่ของจุดแวะแรกในแต่ละวัน</p></aside></div>`;
    } else if (tab === 'wallets') {
        const walletTotal = wallets.reduce((sum,wallet) => sum + tripUiWalletStats(wallet, expenses).thb, 0);
        content = `<div class="trip-wallet-hero"><div class="trip-total-card"><span>ยอดเงินคงเหลือทุกกระเป๋า</span><strong>฿${tripFmtNum(walletTotal)}</strong><small>${wallets.length} กระเป๋าเงินในทริปนี้</small></div><div class="trip-wallet-action"><b>👛 กระเป๋าเงินทริป</b><button class="trip-btn soft" style="margin-top:10px" onclick="switchTravelTab('settings')">สร้างกระเป๋า</button></div></div><div style="display:flex;gap:8px;margin:12px 0"><button class="trip-btn" onclick="openFundWalletModal('${trip.project_id}')">+ เติมเงินเข้าทริป</button><button class="trip-btn soft" onclick="openTripCalcModal('${trip.project_id}')">คำนวณเรท</button></div><div class="trip-wallet-grid">${wallets.map(wallet => { const stats = tripUiWalletStats(wallet, expenses); return `<article class="trip-wallet-card-new"><small>${tripUiEscape(wallet.name || 'Wallet')} · ${tripUiEscape(wallet.currency || 'THB')}</small><div class="amount">${tripUiEscape(wallet.currency || 'THB')} ${tripFmtNum(stats.remaining)}</div><small>≈ ฿${tripFmtNum(stats.thb)} · เรทเฉลี่ย ${stats.rate ? stats.rate.toFixed(4) : '—'}</small><div class="trip-wallet-meta"><span>เติม ${tripFmtNum(stats.funded)}</span><span>ใช้ ${tripFmtNum(stats.spent)}</span></div></article>`; }).join('') || `<div class="trip-wallet-action"><b>ยังไม่มีกระเป๋าเงิน</b><p>สร้างกระเป๋า ก่อนเติมเงินเข้าทริป</p><button class="trip-btn" onclick="switchTravelTab('settings')">สร้างกระเป๋า</button></div>`}</div>`;
    } else if (tab === 'expenses') {
        const categories = {}; expenses.filter(expense => expense.approved !== 0).forEach(expense => { const item = getCategoryInfo(expense.category_id); categories[item.label] = (categories[item.label] || 0) + Number(expense.amount_thb || 0); });
        content = `<div class="trip-page-grid"><section class="trip-panel"><div class="trip-panel-head"><h3>บิลล่าสุด</h3><button class="trip-btn" onclick="openAddExpenseModal('${trip.project_id}')">+ เพิ่มบิล</button></div>${expenses.length ? expenses.filter(expense => expense.approved !== 0).sort((a,b) => String(b.expense_date || '').localeCompare(String(a.expense_date || ''))).map(expense => { const category = getCategoryInfo(expense.category_id); const stop = stops.find(item => item.stop_id === expense.stop_id); return `<div class="trip-expense-row-new"><div class="trip-expense-icon">${category.icon || '🧾'}</div><div><b>${tripUiEscape(expense.note || category.label)}</b><small>${tripUiEscape(stop?.accommodation || 'ทั่วไป')} · ${tripUiEscape(expense.member_id || 'ไม่ระบุผู้จ่าย')}</small></div><div class="value">฿${tripFmtNum(expense.amount_thb)}<small>${tripUiEscape(expense.amount_foreign ? `${expense.amount_foreign} ${expense.currency || ''}` : '')}</small></div></div>`; }).join('') : `<div style="text-align:center;padding:30px;color:#71809b">ยังไม่มีบิล<br><button class="trip-btn" style="margin-top:10px" onclick="openAddExpenseModal('${trip.project_id}')">เพิ่มบิลแรก</button></div>`}</section><aside class="trip-panel"><h3>ภาพรวมการใช้จ่าย</h3><div class="trip-expense-summary"><div><strong style="font-size:1.5rem">฿${tripFmtNum(spent)}</strong><p style="color:#71809b;font-size:.75rem">รวมค่าใช้จ่ายทั้งหมด</p><button class="trip-btn soft" onclick="openTripCalcModal('${trip.project_id}')">คำนวณเงิน</button></div><div class="trip-donut" aria-label="สัดส่วนค่าใช้จ่าย"></div></div><div style="margin-top:14px;font-size:.78rem;color:#53627d">${Object.entries(categories).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,value]) => `<div style="display:flex;justify-content:space-between;padding:5px 0"><span>${tripUiEscape(name)}</span><b>฿${tripFmtNum(value)}</b></div>`).join('') || 'ยังไม่มีข้อมูลหมวดหมู่'}</div></aside></div>`;
    } else {
        const currentBanner = tripUiBanner(trip);
        content = `<div class="trip-page-grid"><section class="trip-panel"><h3>จัดการทริป</h3><div class="trip-settings-list"><div class="trip-setting"><span class="icon">👥</span><span><b>สมาชิกทริป</b><small>${members.length ? tripUiEscape(members.join(', ')) : 'เพิ่มผู้ร่วมทริป'}</small></span><span class="arrow">›</span></div><div class="trip-setting"><span class="icon">💰</span><span><b>งบประมาณ</b><small>฿${tripFmtNum(budget)} · ใช้แล้ว ฿${tripFmtNum(spent)}</small></span><span class="arrow">›</span></div><div class="trip-setting"><span class="icon">📄</span><span><b>เอกสาร</b><small>${(TravelState.documents || []).length} รายการ</small></span><span class="arrow">›</span></div><div class="trip-setting"><span class="icon">☀️</span><span><b>การแจ้งเตือนอากาศ</b><small>แจ้งสภาพอากาศตามวันที่ในแผน</small></span><span class="arrow">›</span></div></div></section><aside class="trip-panel"><div class="trip-panel-head"><h3>ภาพ banner</h3><button class="trip-btn soft" onclick="openBannerModal('${trip.project_id}','${tripUiEscape(currentBanner)}')">เปลี่ยนภาพ</button></div><p style="font-size:.75rem;color:#71809b">เลือกภาพหน้าปกของทริปได้ทุกเมื่อ</p><div class="trip-banner-options"><img class="selected" src="${tripUiEscape(currentBanner)}" alt="ภาพหน้าปก" onerror="this.src='assets/images/banner_japan.jpg'"><img src="assets/images/banner_japan.jpg" alt="ตัวอย่าง"><img src="assets/images/hokkaido_ghibli_map.jpg" alt="ตัวอย่าง"></div><div style="margin-top:18px;padding-top:14px;border-top:1px solid #fee2e2"><h3 style="color:#df5577">ปิดทริปนี้</h3><p style="font-size:.75rem;color:#71809b">ตรวจเงินเหลือและเลือกคืนบัญชีหรือย้ายไปทริปถัดไป</p><button class="trip-btn pink full" onclick="openCloseTripModal('${trip.project_id}')">ตรวจสรุปและปิดทริป</button></div></aside></div>`;
    }
    container.innerHTML = `<div class="trip-screen">${hero}${content}</div>`;
};
