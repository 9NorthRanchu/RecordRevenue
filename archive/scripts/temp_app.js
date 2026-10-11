// app.js

// API Base URL - ชี้ไปยัง Cloudflare Worker ของคุณที่ deploy สำเร็จแล้ว
const API_BASE = "https://record-revenue.9nimz.workers.dev";


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
    const savedTheme = localStorage.getItem('app-theme') || 'modern-clean';
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

    bindBackupRestore();
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

    // 1. Transaction Amount ต้องเป็นยอดตรงข้ามกับ Statement Amount เสมอ
    if (parsedStmtAmount > 0 && tranAmount >= 0) {
        alert("Transaction Amount ต้องเป็นยอดตรงข้ามกับ Statement Amount เสมอ (Statement Amount เป็นบวก Transaction Amount ต้องเป็นลบ)");
        return null;
    }
    if (parsedStmtAmount < 0 && tranAmount <= 0) {
        alert("Transaction Amount ต้องเป็นยอดตรงข้ามกับ Statement Amount เสมอ (Statement Amount เป็นลบ Transaction Amount ต้องเป็นบวก)");
        return null;
    }
    if (parsedStmtAmount === 0 || tranAmount === 0) {
        alert("Statement Amount และ Transaction Amount ห้ามเป็น 0");
        return null;
    }

    // 2. เมื่อรวมรายการทั้งหมดแล้วต้องเป็น 0 จึงจะบันทึกรายการ
    const sumAll = parsedStmtAmount + tranAmount + fee + wht;
    if (Math.abs(sumAll) > 0.01) {
        alert(`ยอดรวมรายการทั้งหมดต้องเป็น 0 (Statement Amount: ${parsedStmtAmount.toFixed(2)}, Transaction Amount: ${tranAmount.toFixed(2)}, Fee: ${fee.toFixed(2)}, WHT: ${wht.toFixed(2)}, รวมปัจจุบัน: ${sumAll.toFixed(2)})`);
        return null;
    }
    
    // Determine Type from Category default or parent account type behavior
    const catObj = AppState.categories.find(c => c.category_id === categoryId);
    let detailType = parsedStmtAmount < 0 ? 'EXPENSE' : 'INCOME';
    if (catObj) {
        if (catObj.default_type) {
            detailType = catObj.default_type;
        } else if (catObj.caption_behavior) {
            if (catObj.caption_behavior === 'REVENUE') detailType = 'INCOME';
            else if (catObj.caption_behavior === 'EXPENSE') detailType = 'EXPENSE';
            else detailType = catObj.caption_behavior;
        }
    }
    
    const calculatedTotal = tranAmount + fee + wht;
    
    return {
        transaction_id: txId,
        account_id: accId,
        date: txDate,
        time: txTime,
        statement_desc: caption,
        total_amount: Math.abs(calculatedTotal), // Header total positive in DB
        ref_code: tr.dataset.ref || '',
        status: 'PENDING_REVIEW', // To be updated to CONFIRMED on backend confirm
        source: tr.dataset.source || 'PDF_IMPORT',
        details: [{
            amount: tranAmount,
            fee: fee,
            wht: wht,
            category_id: categoryId,
            contact_id: contactId || null,
            entity_id: entityId || null,
            note: detail || null,
            type: detailType
        }]
    };
}


function bindBackupRestore() {
    const btnBackup = document.getElementById("btn-backup-excel");
    const btnRestore = document.getElementById("btn-restore-excel");
    const restoreInput = document.getElementById("restore-excel-input");

    if (btnBackup) {
        btnBackup.addEventListener("click", async () => {
            const startDate = document.getElementById("backup-start-date").value;
            const endDate = document.getElementById("backup-end-date").value;
            
            btnBackup.disabled = true;
            btnBackup.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> กำลังดึงข้อมูล...`;
            
            try {
                // Fetch all history data
                let url = `${API_BASE}/api/transactions?status=CONFIRMED`;
                if(startDate) url += `&startDate=${startDate}`;
                if(endDate) url += `&endDate=${endDate}`;
                
                const res = await fetch(url, { headers: { 'x-user-id': encodeURIComponent(AppState.userId) } });
                const txs = await res.json();
                
                // Format for Excel
                const data = txs.map(tx => {
                    const detail = tx.details[0] || {};
                    return {
                        'Transaction ID': tx.transaction_id,
                        'Date': tx.date,
                        'Time': tx.time || '',
                        'Account': tx.account_name,
                        'Statement Desc': tx.statement_desc || '',
                        'Ref Code': tx.ref_code || '',
                        'Amount': tx.total_amount,
                        'Type': detail.type || '',
                        'Category': detail.category_name || '',
                        'Contact': detail.contact_name || '',
                        'Note': detail.note || '',
                        'Source': tx.source,
                        'Status': tx.status,
                        'Exported By': AppState.userName,
                        'Export Time': new Date().toLocaleString()
                    };
                });
                
                if (data.length === 0) {
                    alert("ไม่พบข้อมูลในช่วงเวลาที่เลือก");
                } else {
                    const ws = XLSX.utils.json_to_sheet(data);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, "Transactions");
                    XLSX.writeFile(wb, `Backup_Transactions_${new Date().toISOString().split('T')[0]}.xlsx`);
                }
            } catch(e) {
                console.error("Backup failed", e);
                alert("เกิดข้อผิดพลาดในการสำรองข้อมูล");
            }
            
            btnBackup.disabled = false;
            btnBackup.innerHTML = `<i class="fa-solid fa-download"></i> ดาวน์โหลด Backup`;
        });
    }

    if (btnRestore && restoreInput) {
        btnRestore.addEventListener("click", () => {
            const file = restoreInput.files[0];
            if (!file) {
                alert("กรุณาเลือกไฟล์ Excel เพื่อกู้คืนข้อมูล");
                return;
            }
            
            if(!confirm("การนำเข้าข้อมูลอาจใช้เวลาและจะเพิ่มข้อมูลใหม่เข้าระบบ คุณต้องการดำเนินการต่อหรือไม่?")) return;
            
            btnRestore.disabled = true;
            btnRestore.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> กำลังนำเข้า...`;
            
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, {type: 'array'});
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(firstSheet);
                    
                    if (rows.length === 0) {
                        alert("ไฟล์ว่างเปล่า");
                        return;
                    }
                    
                    let count = 0;
                    // Note: We don't implement full bulk insert backend API yet. We can do simple POST per row or require backend change.
                    // To be safe and stable, we'll alert that it's a mock implementation if backend doesn't support bulk.
                    // I'll send them one by one.
                    for(const row of rows) {
                         // Find match IDs by name
                         const accountObj = AppState.accounts.find(a => a.name === row['Account']);
                         const catObj = AppState.categories.find(c => c.name === row['Category']);
                         const contObj = (AppState.contacts || []).find(c => c.name === row['Contact']);
                         
                         if(!accountObj) continue; // Must have valid account
                         
                         const payload = {
                             account_id: accountObj.account_id,
                             date: row['Date'],
                             time: row['Time'] || '12:00:00',
                             statement_desc: row['Statement Desc'] || '',
                             total_amount: row['Amount'],
                             ref_code: row['Ref Code'] || '',
                             status: row['Status'] || 'CONFIRMED',
                             source: 'PDF_IMPORT',
                             details: [{
                                 amount: row['Amount'],
                                 fee: 0,
                                 wht: 0,
                                 category_id: catObj ? catObj.category_id : null,
                                 contact_id: contObj ? contObj.contact_id : null,
                                 entity_id: AppState.allowedEntities[0] || null,
                                 note: row['Note'] || '',
                                 type: row['Type'] || 'INCOME'
                             }]
                         };
                         
                         await fetch(`${API_BASE}/api/transactions`, {
                             method: 'POST',
                             headers: { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(AppState.userId) },
                             body: JSON.stringify(payload)
                         });
                         count++;
                    }
                    alert(`กู้คืนข้อมูลสำเร็จ ${count} รายการ`);
                    fetchMasterData();
                } catch(err) {
                    console.error("Restore failed", err);
                    alert("เกิดข้อผิดพลาดในการอ่านไฟล์หรือนำเข้าข้อมูล");
                }
                
                btnRestore.disabled = false;
                btnRestore.innerHTML = `<i class="fa-solid fa-upload"></i> เริ่มกู้คืนข้อมูล`;
                restoreInput.value = '';
            };
            reader.readAsArrayBuffer(file);
        });
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
    AppState.activeView = viewName;
    
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
        'grid-input': 'นำเข้าข้อมูลด่วน',
        'debtor': 'ทะเบียนลูกหนี้/เจ้าหนี้คงค้าง',
        'reports': 'รายงานสรุปทางการเงิน',
        'settings': 'ตั้งค่าระบบข้อมูลหลัก'
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
    } else if (viewName === 'grid-input') {
        if (confirmPendingBtn) confirmPendingBtn.style.display = "none";
        if (pendingImportActions) pendingImportActions.style.display = "none";
        if (gridInputActions) gridInputActions.style.display = "flex";
        if (pendingFilterContainer) pendingFilterContainer.style.display = "flex"; // keep account filter visible
        if (gridFilterContainer) gridFilterContainer.style.display = "none";       // hide lower filter
        if (historyFilterContainer) historyFilterContainer.style.display = "none";
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
    else if (viewName === 'grid-input') loadGridInput();
    else if (viewName === 'debtor') { Promise.all([fetchDebts(), fetchTransactions()]).then(() => renderDebtsDashboard()); }
    else if (viewName === 'reports') loadReports();
    else if (viewName === 'settings') loadSettings();
}

// ==========================================
// 📥 MASTER DATA & API FETCHERS
// ==========================================
async function fetchMasterData() {
    try {
        const headers = { 'x-user-id': encodeURIComponent(AppState.userId) };
        
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
            headers: { 'x-user-id': encodeURIComponent(AppState.userId) }
        });
        const pending = await res.json();
        const badge = document.getElementById("badge-pending");
        if (pending.length > 0) {
            badge.style.display = "inline-block";
            badge.innerText = pending.length;
        } else {
            badge.style.display = "none";
        }
    } catch (e) {}
}

// ==========================================
// 📈 LOAD VIEW: DASHBOARD (Redesigned)
// ==========================================

// State for dashboard
const DashState = {
    activeEntityId: 'all',  // 'all' or an entity_id
    month: null,            // '01' .. '12'
    year: null,             // '2025'
    txsRes: [],
    accountsRes: [],
    outstandingRes: [],
    pendingRes: [],
};

async function loadDashboard() {
    try {
        const headers = { 'x-user-id': encodeURIComponent(AppState.userId) };
        const now = new Date();

        // ── 1. Init period selectors (first load) ──
        const monthSel = document.getElementById('dash-period-month');
        const yearSel = document.getElementById('dash-period-year');

        if (!DashState.month) {
            DashState.month = String(now.getMonth() + 1).padStart(2, '0');
            DashState.year = String(now.getFullYear());
        }

        // Populate year dropdown (current year and 2 previous)
        if (yearSel && yearSel.options.length === 0) {
            for (let y = now.getFullYear(); y >= now.getFullYear() - 2; y--) {
                const opt = document.createElement('option');
                opt.value = String(y);
                opt.text = String(y);
                yearSel.appendChild(opt);
            }
        }
        if (monthSel) monthSel.value = DashState.month;
        if (yearSel) yearSel.value = DashState.year;

        const selectedMonthStr = `${DashState.year}-${DashState.month}`;

        // Bind period change + reload button (only once)
        const reloadBtn = document.getElementById('dash-reload-btn');
        if (reloadBtn && !reloadBtn._bound) {
            reloadBtn._bound = true;
            reloadBtn.addEventListener('click', () => {
                DashState.month = monthSel.value;
                DashState.year = yearSel.value;
                loadDashboard();
            });
        }

        // ── 2. Fetch data ──
        // Compute start date of 6-month period for dashboard charts
        const startPeriodDate = new Date(parseInt(DashState.year), parseInt(DashState.month) - 1 - 5, 1);
        const startPeriodStr = `${startPeriodDate.getFullYear()}-${String(startPeriodDate.getMonth() + 1).padStart(2, '0')}-01`;

        const [accountsRes, txsRes, outstandingRes, pendingRes] = await Promise.all([
            fetch(`${API_BASE}/api/accounts`, { headers }).then(r => r.json()),
            fetch(`${API_BASE}/api/transactions?status=CONFIRMED&startDate=${startPeriodStr}`, { headers }).then(r => r.json()),
            fetch(`${API_BASE}/api/reports/outstanding`, { headers }).then(r => r.json()),
            fetch(`${API_BASE}/api/transactions?status=PENDING_REVIEW`, { headers }).then(r => r.json())
        ]);

        DashState.txsRes = txsRes;
        DashState.accountsRes = accountsRes;
        DashState.outstandingRes = outstandingRes;
        DashState.pendingRes = pendingRes;

        // ── 3. Build Entity (user) tab switcher ──
        const tabsContainer = document.getElementById('dash-user-tabs');
        if (tabsContainer) {
            // Build unique entities from accounts
            const entityMap = new Map();
            accountsRes.forEach(acc => {
                if (acc.entity_id && !entityMap.has(acc.entity_id)) {
                    entityMap.set(acc.entity_id, acc.entity_name || acc.entity_id);
                }
            });

            tabsContainer.innerHTML = '';
            // "ทั้งหมด" tab
            const allTab = document.createElement('button');
            allTab.className = 'dash-user-tab' + (DashState.activeEntityId === 'all' ? ' active' : '');
            allTab.textContent = 'ทั้งหมด';
            allTab.dataset.entityId = 'all';
            tabsContainer.appendChild(allTab);

            entityMap.forEach((name, id) => {
                const btn = document.createElement('button');
                btn.className = 'dash-user-tab' + (DashState.activeEntityId === id ? ' active' : '');
                btn.textContent = name;
                btn.dataset.entityId = id;
                tabsContainer.appendChild(btn);
            });

            tabsContainer.querySelectorAll('.dash-user-tab').forEach(btn => {
                btn.addEventListener('click', () => {
                    DashState.activeEntityId = btn.dataset.entityId;
                    loadDashboard();
                });
            });
        }

        // ── 4. Filter txs by entity tab + period ──
        const filterEntity = DashState.activeEntityId;
        const filteredTxs = txsRes.filter(tx => {
            const txMonth = tx.date.substring(0, 7);
            const entityMatch = filterEntity === 'all' || tx.entity_id === filterEntity || !tx.entity_id;
            return entityMatch;
        });

        const periodTxs = filteredTxs.filter(tx => tx.date.substring(0, 7) === selectedMonthStr);

        let totalIncome = 0, totalExpense = 0;
        periodTxs.forEach(tx => {
            tx.details.forEach(d => {
                const v = Math.abs(d.amount);
                if ((d.behavior === 'REVENUE' || d.behavior === 'ASSET')) totalIncome += v;
                else if ((d.behavior === 'EXPENSE' || d.behavior === 'LIABILITY')) totalExpense += v;
            });
        });

        // ── 5. Filter accounts by entity ──
        const filteredAccounts = filterEntity === 'all'
            ? accountsRes
            : accountsRes.filter(a => a.entity_id === filterEntity);

        const totalBalance = filteredAccounts.reduce((s, a) => s + (a.balance || 0), 0);
        const pendingCount = pendingRes.length;

        // ── 6. KPI Cards ──
        document.getElementById('kpi-balance').textContent = formatCurrency(totalBalance);
        document.getElementById('kpi-income').textContent = formatCurrency(totalIncome);
        document.getElementById('kpi-expense').textContent = formatCurrency(totalExpense);
        document.getElementById('kpi-pending').textContent = pendingCount + ' รายการ';

        const monthNames = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
        const mLabel = monthNames[parseInt(DashState.month, 10) - 1];
        document.getElementById('kpi-income-period').textContent = mLabel + ' ' + DashState.year;
        document.getElementById('kpi-expense-period').textContent = mLabel + ' ' + DashState.year;

        // ── 7. 6-Month Bar Chart (Chart.js) ──
        const canvas = document.getElementById('dash-bar-canvas');
        if (canvas) {
            // Build 6-month buckets
            const months6 = [];
            for (let i = 5; i >= 0; i--) {
                const d = new Date(parseInt(DashState.year), parseInt(DashState.month) - 1 - i, 1);
                months6.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
            }
            const incomeData = months6.map(m => {
                let s = 0;
                filteredTxs.forEach(tx => {
                    if (tx.date.substring(0, 7) === m) tx.details.forEach(d => { if ((d.behavior === 'REVENUE' || d.behavior === 'ASSET')) s += Math.abs(d.amount); });
                });
                return s;
            });
            const expenseData = months6.map(m => {
                let s = 0;
                filteredTxs.forEach(tx => {
                    if (tx.date.substring(0, 7) === m) tx.details.forEach(d => { if ((d.behavior === 'EXPENSE' || d.behavior === 'LIABILITY')) s += Math.abs(d.amount); });
                });
                return s;
            });
            
            const labels = months6.map(m => {
                const parts = m.split('-');
                return monthNames[parseInt(parts[1], 10) - 1];
            });

            if (window.dashBarChart) window.dashBarChart.destroy();
            window.dashBarChart = new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'รายได้',
                            data: incomeData,
                            backgroundColor: 'rgba(67, 160, 71, 0.8)',
                            borderRadius: 4
                        },
                        {
                            label: 'ค่าใช้จ่าย',
                            data: expenseData,
                            backgroundColor: 'rgba(229, 57, 53, 0.8)',
                            borderRadius: 4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { font: { family: 'Noto Sans Thai' } } },
                        tooltip: { titleFont: { family: 'Noto Sans Thai' }, bodyFont: { family: 'Noto Sans Thai' } }
                    },
                    scales: {
                        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { callback: function(val) { return val >= 1000 ? (val/1000)+'k' : val; } } },
                        x: { grid: { display: false }, ticks: { font: { family: 'Noto Sans Thai' } } }
                    }
                }
            });
        }

        // ── 8. Donut Chart (Chart.js) ──
        const donutChartEl = document.getElementById('expense-donut-chart');
        const donutContainer = document.querySelector('.donut-chart-box');
        if (donutContainer) {
            // We need a canvas element for Chart.js
            let dCanvas = document.getElementById('dash-donut-canvas');
            if (!dCanvas) {
                donutContainer.innerHTML = '<canvas id="dash-donut-canvas" width="200" height="200"></canvas>';
                dCanvas = document.getElementById('dash-donut-canvas');
            }
            
            const expenseGroups = {};
            let totalExpCat = 0;
            periodTxs.forEach(tx => {
                tx.details.forEach(d => {
                    if ((d.behavior === 'EXPENSE' || d.behavior === 'LIABILITY')) {
                        const v = Math.abs(d.amount);
                        totalExpCat += v;
                        expenseGroups[d.category_name || 'อื่นๆ'] = (expenseGroups[d.category_name || 'อื่นๆ'] || 0) + v;
                    }
                });
            });

            const palette = ['#5C6BC0','#43A047','#FB8C00','#E53935','#8E24AA','#00ACC1','#F4511E','#6D4C41','#546E7A'];
            const labels = [];
            const data = [];
            const colors = [];

            if (totalExpCat === 0) {
                labels.push('ไม่มีรายจ่าย');
                data.push(1);
                colors.push('#e0e0e0');
            } else {
                const cats = Object.entries(expenseGroups).sort((a, b) => b[1] - a[1]);
                cats.forEach((c, i) => {
                    labels.push(c[0]);
                    data.push(c[1]);
                    colors.push(palette[i % palette.length]);
                });
            }

            if (window.dashDonutChart) window.dashDonutChart.destroy();
            window.dashDonutChart = new Chart(dCanvas, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: data,
                        backgroundColor: colors,
                        borderWidth: 2,
                        borderColor: 'transparent'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '70%',
                    plugins: {
                        legend: { position: 'right', labels: { font: { family: 'Noto Sans Thai', size: 12 }, boxWidth: 12 } },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    if(totalExpCat === 0) return ' 0 ฿';
                                    let val = context.raw;
                                    let pct = ((val / totalExpCat) * 100).toFixed(1);
                                    return ` ${formatCurrency(val)} (${pct}%)`;
                                }
                            },
                            titleFont: { family: 'Noto Sans Thai' }, bodyFont: { family: 'Noto Sans Thai' }
                        }
                    }
                }
            });
        }

        // ── 9. Statement (Account Balance) list ──
        const accList = document.getElementById('dash-accounts-list');
        if (accList) {
            accList.innerHTML = '';
            if (filteredAccounts.length === 0) {
                accList.innerHTML = '<li class="dash-balance-item"><span style="color:#aaa;">ไม่มีบัญชี</span></li>';
            } else {
                filteredAccounts.forEach(acc => {
                    const li = document.createElement('li');
                    li.className = 'dash-balance-item';
                    const isLow = acc.balance < 500;
                    li.innerHTML = `
                        <div class="dbi-left">
                            <span class="dbi-icon">${getBankIcon(acc.bank_name)}</span>
                            <div>
                                <div class="dbi-name">${acc.name}</div>
                                <div class="dbi-sub">${acc.entity_name || ''}</div>
                            </div>
                        </div>
                        <div class="dbi-amount ${isLow ? 'text-danger' : ''}">${formatCurrency(acc.balance)}</div>
                    `;
                    accList.appendChild(li);
                });
            }
        }

        // ── 10. AR (Assets/Debtors) list ──
        const arList = document.getElementById('dash-ar-list');
        if (arList) {
            arList.innerHTML = '';
            const arFiltered = filterEntity === 'all' ? outstandingRes : outstandingRes.filter(o => o.entity_id === filterEntity);
            const arGroups = {};
            arFiltered.forEach(item => {
                const key = item.contact_name || 'ไม่ระบุ';
                arGroups[key] = (arGroups[key] || 0) + (item.remaining_amount || 0);
            });
            const arEntries = Object.entries(arGroups).sort((a, b) => b[1] - a[1]);
            if (arEntries.length === 0) {
                arList.innerHTML = '<li class="dash-balance-item"><span style="color:#aaa;">ไม่มีลูกหนี้คงค้าง</span></li>';
            } else {
                arEntries.forEach(([name, amount]) => {
                    const li = document.createElement('li');
                    li.className = 'dash-balance-item';
                    li.innerHTML = `
                        <div class="dbi-left">
                            <span class="dbi-icon" style="color:#43A047;"><i class="fa-solid fa-user-check"></i></span>
                            <div class="dbi-name">${name}</div>
                        </div>
                        <div class="dbi-amount text-success">${formatCurrency(amount)}</div>
                    `;
                    arList.appendChild(li);
                });
            }
        }

        // ── 11. AP (Liabilities/Creditors) list ──
        const apList = document.getElementById('dash-ap-list');
        if (apList) {
            apList.innerHTML = '';
            // Expense categories with amounts for the period as a proxy for liabilities
            const expCatGroups = {};
            periodTxs.forEach(tx => {
                tx.details.forEach(d => {
                    if ((d.behavior === 'EXPENSE' || d.behavior === 'LIABILITY')) {
                        const v = Math.abs(d.amount);
                        const key = d.category_name || 'อื่นๆ';
                        expCatGroups[key] = (expCatGroups[key] || 0) + v;
                    }
                });
            });
            const apEntries = Object.entries(expCatGroups).sort((a, b) => b[1] - a[1]);
            if (apEntries.length === 0) {
                apList.innerHTML = '<li class="dash-balance-item"><span style="color:#aaa;">ไม่มีค่าใช้จ่ายในช่วงนี้</span></li>';
            } else {
                apEntries.forEach(([name, amount]) => {
                    const li = document.createElement('li');
                    li.className = 'dash-balance-item';
                    li.innerHTML = `
                        <div class="dbi-left">
                            <span class="dbi-icon" style="color:#E53935;"><i class="fa-solid fa-receipt"></i></span>
                            <div class="dbi-name">${name}</div>
                        </div>
                        <div class="dbi-amount text-danger">${formatCurrency(amount)}</div>
                    `;
                    apList.appendChild(li);
                });
            }
        }

        // ── 12. Recent Transactions table ──
        const recentBody = document.getElementById('dash-recent-body');
        if (recentBody) {
            recentBody.innerHTML = '';
            const recentTxs = [...filteredTxs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
            if (recentTxs.length === 0) {
                recentBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#aaa;padding:20px;">ไม่พบรายการ</td></tr>';
            } else {
                recentTxs.forEach(tx => {
                    // Determine type label from first detail
                    const firstDetail = tx.details[0];
                    const typeLabel = firstDetail?.type === 'INCOME' ? '<span class="badge-type income">รายได้</span>' :
                        firstDetail?.type === 'EXPENSE' ? '<span class="badge-type expense">ค่าใช้จ่าย</span>' :
                        firstDetail?.type === 'DEBIT_AR' ? '<span class="badge-type ar">ลูกหนี้</span>' :
                        '<span class="badge-type other">อื่นๆ</span>';
                    const isIncome = firstDetail?.type === 'INCOME';
                    const amountClass = isIncome ? 'text-success' : 'text-danger';
                    const amountSign = isIncome ? '+' : '-';
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td style="white-space:nowrap;">${tx.date.substring(0, 10)}</td>
                        <td>${tx.account_name || '-'}</td>
                        <td>${typeLabel}</td>
                        <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${firstDetail?.note || '-'}</td>
                        <td style="text-align:right;" class="${amountClass} amount">${tx.behavior === 'INCOME' ? '+' + formatCurrency(tx.total_amount) : formatCurrency(-tx.total_amount)}</td>
                    `;
                    recentBody.appendChild(tr);
                });
            }
        }

        // ── 13. Alerts ──
        const alertList = document.getElementById('alert-summary-list');
        if (alertList) {
            alertList.innerHTML = '';
            let alertCount = 0;
            if (pendingCount > 0) {
                alertCount++;
                alertList.innerHTML += `<div class="alert-item" style="border-left:4px solid var(--warning-color);">
                    <div class="alert-item-icon" style="color:var(--warning-color);"><i class="fa-solid fa-circle-exclamation"></i></div>
                    <div class="alert-item-text">สลิปรอตรวจสอบ <strong>${pendingCount}</strong> รายการ</div></div>`;
            }
            let overdueCount = 0;
            const thirtyAgo = new Date(); thirtyAgo.setDate(thirtyAgo.getDate() - 30);
            outstandingRes.forEach(item => { if (new Date(item.date?.substring(0,10)) < thirtyAgo) overdueCount++; });
            if (overdueCount > 0) {
                alertCount++;
                alertList.innerHTML += `<div class="alert-item" style="border-left:4px solid var(--danger-color);">
                    <div class="alert-item-icon" style="color:var(--danger-color);"><i class="fa-solid fa-circle-xmark"></i></div>
                    <div class="alert-item-text">ลูกหนี้เกิน 30 วัน <strong>${overdueCount}</strong> รายการ</div></div>`;
            }
            filteredAccounts.forEach(acc => {
                if (acc.balance < 500) {
                    alertCount++;
                    alertList.innerHTML += `<div class="alert-item" style="border-left:4px solid #7F8C8D;">
                        <div class="alert-item-icon" style="color:#7F8C8D;"><i class="fa-solid fa-triangle-exclamation"></i></div>
                        <div class="alert-item-text">บัญชี <strong>${acc.name}</strong> ยอดต่ำ (${formatCurrency(acc.balance)})</div></div>`;
                }
            });
            if (alertCount === 0) {
                alertList.innerHTML = `<div class="alert-item" style="border-left:4px solid var(--success-color);">
                    <div class="alert-item-icon" style="color:var(--success-color);"><i class="fa-solid fa-circle-check"></i></div>
                    <div class="alert-item-text">สถานะการเงินปกติ ไม่มีการแจ้งเตือน</div></div>`;
            }
        }

        // ── 14. Quick Actions ──
        const qaAddTx = document.querySelector('.action-add-tx');
        const qaGrid = document.querySelector('.action-grid-input');
        const qaWHT = document.querySelector('.action-report-wht');
        const qaTB = document.querySelector('.action-report-tb');
        if (qaAddTx) qaAddTx.onclick = () => openTxModal();
        if (qaGrid) qaGrid.onclick = () => switchView('grid-input');
        if (qaWHT) qaWHT.onclick = () => { switchView('reports'); document.querySelector(".report-tab[data-report='wht']")?.click(); };
        if (qaTB) qaTB.onclick = () => { switchView('reports'); document.querySelector(".report-tab[data-report='tb']")?.click(); };

    } catch (err) {
        console.error('Dashboard Load Error:', err);
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
    const filteredCats = captionId 
        ? AppState.categories.filter(c => c.caption_id === captionId)
        : AppState.categories;
        
    let html = '<option value="">-- เลือกหมวดหมู่ --</option>';
    html += filteredCats.map(item => `<option value="${item.category_id}" ${item.category_id == selectedCatId ? 'selected' : ''}>${item.name}</option>`).join('');
    catSel.innerHTML = html;
}

// ==========================================
// 🕒 LOAD VIEW: PENDING REVIEW
// ==========================================
function updateCardSum(cardEl) {
    const rawStmtAmountStr = cardEl.querySelector(".input-stmt-amount").value;
    const parsedStmtAmount = parseAmountInput(rawStmtAmountStr);
    
    let totalTranAmount = 0;
    let totalFee = 0;
    let totalWht = 0;
    
    cardEl.querySelectorAll(".sub-row-item").forEach(row => {
        totalTranAmount += parseAmountInput(row.querySelector(".input-amount").value);
        totalFee += parseAmountInput(row.querySelector(".input-fee").value);
        totalWht += parseAmountInput(row.querySelector(".input-wht").value);
    });
    
    const sumAll = parsedStmtAmount + totalTranAmount + totalFee + totalWht;
    
    const sumValueEl = cardEl.querySelector(".zero-sum-value");
    const sumStatusEl = cardEl.querySelector(".zero-sum-status");
    
    if (sumValueEl && sumStatusEl) {
        const absSum = Math.abs(sumAll);
        const formattedSum = absSum.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        sumValueEl.textContent = sumAll < 0 ? `(${formattedSum})` : formattedSum;
        if (Math.abs(sumAll) <= 0.01) {
            sumStatusEl.textContent = "✅";
            sumStatusEl.style.color = "#059669";
        } else {
            sumStatusEl.textContent = "❌";
            sumStatusEl.style.color = "#DC2626";
        }
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
    
    const amountVal = formatSubRowAmount(detailData.amount !== undefined ? detailData.amount : 0);
    const feeVal = formatSubRowAmount(detailData.fee !== undefined ? detailData.fee : 0);
    const whtVal = formatSubRowAmount(detailData.wht !== undefined ? detailData.wht : 0);
    const noteVal = detailData.note !== undefined ? detailData.note : '';
    
    const subRowInputStyle = "min-height: 28px; padding: 4px 6px; font-size: 13px; background: #ffffff; color: #1E293B; border: 1px solid #D1D5DB; border-radius: 5px; width: 100%;";
    
    rowEl.innerHTML = `
        <div class="sub-row-col">
            <select class="form-select select-caption" style="${subRowInputStyle}">
                <option value="">-- Caption --</option>
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
            <input type="text" class="form-control input-amount" value="${amountVal}" oninput="this.value = this.value.replace(/[^0-9.()-]/g, '')" onblur="this.value = formatNumberWithCommas(this.value);" onfocus="this.value = this.value.replace(/,/g, '')" style="${subRowInputStyle} text-align: right; font-weight: 600;">
        </div>
        <div class="sub-row-col">
            <input type="text" class="form-control input-fee" value="${feeVal}" oninput="this.value = this.value.replace(/[^0-9.()-]/g, '')" onblur="this.value = formatNumberWithCommas(this.value);" onfocus="this.value = this.value.replace(/,/g, '')" style="${subRowInputStyle} text-align: right;">
        </div>
        <div class="sub-row-col">
            <input type="text" class="form-control input-wht" value="${whtVal}" oninput="this.value = this.value.replace(/[^0-9.()-]/g, '')" onblur="this.value = formatNumberWithCommas(this.value);" onfocus="this.value = this.value.replace(/,/g, '')" style="${subRowInputStyle} text-align: right;">
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
        let cats = AppState.categories;
        if (selectedCaptionId) {
            cats = cats.filter(c => c.caption_id === selectedCaptionId);
        }
        let html = '<option value="">-- เลือกหมวดหมู่ --</option>';
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
    const txTime = cardEl.dataset.time || '00:00:00';
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
    let totalTranAmount = 0;
    let totalFee = 0;
    let totalWht = 0;
    let isSubRowsValid = true;
    
    const subRows = cardEl.querySelectorAll(".sub-row-item");
    if (subRows.length === 0) {
        alert("กรุณาเพิ่มรายการย่อยอย่างน้อย 1 รายการ");
        return null;
    }
    
    subRows.forEach((row, idx) => {
        const captionId = row.querySelector(".select-caption").value;
        const categoryId = row.querySelector(".select-category").value;
        const entityId = row.querySelector(".select-entity").value;
        const contactId = row.querySelector(".select-contact").value;
        const tranAmountStr = row.querySelector(".input-amount").value;
        const tranAmount = parseAmountInput(tranAmountStr);
        const fee = parseAmountInput(row.querySelector(".input-fee").value);
        const wht = parseAmountInput(row.querySelector(".input-wht").value);
        const detailNote = row.querySelector(".input-detail").value.trim();
        
        if (!captionId) {
            alert(`รายการย่อยที่ ${idx + 1}: กรุณาเลือกหมวดหมู่หลัก (Caption)`);
            isSubRowsValid = false;
            return;
        }
        if (!categoryId) {
            alert(`รายการย่อยที่ ${idx + 1}: กรุณาเลือกหมวดหมู่ย่อย (Categories)`);
            isSubRowsValid = false;
            return;
        }
        if (!tranAmountStr || tranAmount === 0) {
            alert(`รายการย่อยที่ ${idx + 1}: กรุณาระบุยอดเงิน (Transaction Amount)`);
            isSubRowsValid = false;
            return;
        }
        
        const catObj = AppState.categories.find(c => c.category_id === categoryId);
        let detailType = parsedStmtAmount < 0 ? 'EXPENSE' : 'INCOME';
        if (catObj) {
            if (catObj.default_type) {
                detailType = catObj.default_type;
            } else if (catObj.caption_behavior) {
                if (catObj.caption_behavior === 'REVENUE') detailType = 'INCOME';
                else if (catObj.caption_behavior === 'EXPENSE') detailType = 'EXPENSE';
                else detailType = catObj.caption_behavior;
            }
        }
        
        details.push({
            amount: tranAmount,
            fee: fee,
            wht: wht,
            category_id: categoryId,
            contact_id: contactId || null,
            entity_id: entityId || null,
            note: detailNote || null,
            type: detailType
        });
        
        totalTranAmount += tranAmount;
        totalFee += fee;
        totalWht += wht;
    });
    
    if (!isSubRowsValid) return null;
    
    let isSignsValid = true;
    subRows.forEach((row, i) => {
        const tranAmount = parseAmountInput(row.querySelector(".input-amount").value);
        if (parsedStmtAmount > 0 && tranAmount >= 0) {
            alert(`รายการย่อยที่ ${i+1}: Transaction Amount ต้องเป็นยอดตรงข้ามกับ Statement Amount เสมอ (Statement Amount เป็นบวก Transaction Amount ต้องเป็นลบ)`);
            isSignsValid = false;
        }
        if (parsedStmtAmount < 0 && tranAmount <= 0) {
            alert(`รายการย่อยที่ ${i+1}: Transaction Amount ต้องเป็นยอดตรงข้ามกับ Statement Amount เสมอ (Statement Amount เป็นลบ Transaction Amount ต้องเป็นบวก)`);
            isSignsValid = false;
        }
    });
    if (!isSignsValid) return null;

    if (parsedStmtAmount === 0 || totalTranAmount === 0) {
        alert("Statement Amount และ Transaction Amount ห้ามเป็น 0");
        return null;
    }
    
    const sumAll = parsedStmtAmount + totalTranAmount + totalFee + totalWht;
    if (Math.abs(sumAll) > 0.01) {
        alert(`ยอดรวมรายการทั้งหมดต้องเป็น 0 (Statement Amount: ${parsedStmtAmount.toFixed(2)}, Transaction Amount: ${totalTranAmount.toFixed(2)}, Fee: ${totalFee.toFixed(2)}, WHT: ${totalWht.toFixed(2)}, รวมปัจจุบัน: ${sumAll.toFixed(2)})`);
        return null;
    }
    
    const calculatedTotal = totalTranAmount + totalFee + totalWht;
    
    const firstCaptionId = subRows[0].querySelector(".select-caption").value;
    const firstCaptionObj = AppState.captions.find(at => at.type_id === firstCaptionId);
    const captionName = firstCaptionObj ? firstCaptionObj.name : '';
    
    return {
        transaction_id: txId,
        account_id: accId,
        date: txDate,
        time: txTime,
        statement_desc: captionName || note || 'Imported Transaction',
        total_amount: Math.abs(calculatedTotal),
        ref_code: refCode,
        status: 'PENDING_REVIEW',
        source: source,
        details: details
    };
}

async function loadPending() {
    try {
        const res = await fetch(`${API_BASE}/api/transactions?status=PENDING_REVIEW`, {
            headers: { 'x-user-id': encodeURIComponent(AppState.userId) }
        });
        AppState.pendingTransactions = await res.json();
        
        // Populate the account select for PDF import
        const importAccSel = document.getElementById("import-account-selector");
        if (importAccSel) {
            const prevVal = importAccSel.value;
            importAccSel.innerHTML = '<option value="">-- เลือกบัญชีธนาคาร --</option>' + 
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
                filterSel.innerHTML = '<option value="ALL">ทั้งหมด</option>' + 
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

    } catch (e) {
        console.error("Pending Review Load Error:", e);
    }
}

function renderPendingTransactions() {
    const container = document.getElementById("pending-cards-container");
    if (!container) return;
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
        
        cardEl.innerHTML = `
            <div class="tx-card-header ${headerClass}" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; gap: 10px; border-left: 5px solid ${accentColor}; background: linear-gradient(135deg, #1E293B 0%, #0F172A 100%); border-radius: 10px 10px 0 0;">
                <div style="display: flex; align-items: center; gap: 10px; flex-grow: 1; flex-wrap: wrap;">
                    <input type="date" class="form-control input-date" value="${tx.date.split(' ')[0]}" style="padding: 2px 6px; font-size: 0.8rem; line-height: 24px; width: 118px; height: 28px; background: rgba(255,255,255,0.12); color: #E2E8F0; border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; font-weight: 600;">
                    <span class="row-time" style="color: #38BDF8; font-size: 0.75rem; white-space: nowrap; font-weight: 700;">${tx.time ? tx.time.substring(0,5) : '00:00'}</span>
                    <span class="stmt-account-name" style="color: #FBBF24; font-size: 14px; font-weight: 700; letter-spacing: 0.5px; white-space: nowrap;">${accountName}</span>
                    <span style="color: rgba(255,255,255,0.25); font-size: 1rem;">|</span>
                    <input type="text" class="form-control input-stmt-amount" value="${formattedStmtAmount}" oninput="this.value = this.value.replace(/[^0-9.()-]/g, '')" onblur="this.value = formatNumberWithCommas(this.value)" onfocus="this.value = this.value.replace(/,/g, '')" style="width: 150px; height: 28px; padding: 2px 8px; line-height: 24px; font-size: 0.85rem; font-weight: 800; text-align: right; color: ${isExpense ? '#FCA5A5' : '#6EE7B7'}; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; letter-spacing: 0.5px;">
                    <input type="text" class="form-control input-stmt-note" value="${displayNote}" placeholder="หมายเหตุ Statement..." style="flex-grow: 1; min-width: 150px; height: 28px; padding: 2px 8px; line-height: 24px; font-size: 0.8rem; background: rgba(255,255,255,0.07); color: #94A3B8; border: 1px solid rgba(255,255,255,0.12); border-radius: 6px;">
                </div>
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
                <button class="btn btn-outline-purple btn-add-subrow" type="button">
                    <i class="fa-solid fa-plus"></i> เพิ่มรายการย่อย
                </button>
                <div class="zero-sum-indicator" style="font-size: 0.85rem; font-weight: 700; color: #374151;">
                    ผลรวม: <span class="zero-sum-value">0.00</span> <span class="zero-sum-status">✅</span>
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
            const autoTxAmt = -stmtSignedAmount; // opposite of stmt
            
            let dAmt = 0;
            if (detail.amount !== undefined && detail.amount !== '') {
                dAmt = stmtSignedAmount < 0 ? Math.abs(detail.amount) : -Math.abs(detail.amount);
            } else {
                dAmt = subIdx === 0 ? autoTxAmt : 0;
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
                    headers: { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(AppState.userId) },
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
        
        updateCardStyle(cardEl);
        updateCardSum(cardEl);
    });

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

    // 2. Pending (รอตรวจสอบ) - from API, Confirmed (ยอดยกมา) - from AppState.accounts
    const savedPendingGroups = {};
    const confirmedGroups = {};

    // Populate confirmedGroups from AppState.accounts (calculated dynamically on backend)
    if (AppState.accounts) {
        AppState.accounts.forEach(acc => {
            confirmedGroups[acc.account_id] = acc.balance || 0;
        });
    }
    
    try {
        const pendingRes = await fetch(`${API_BASE}/api/transactions?status=PENDING_REVIEW`, { headers: { 'x-user-id': encodeURIComponent(AppState.userId) } });
        
        if (pendingRes.ok) {
            const pending = await pendingRes.json();
            (pending || []).forEach(tx => {
                if (!tx.account_id) return;
                if (!savedPendingGroups[tx.account_id]) savedPendingGroups[tx.account_id] = 0;
                
                const am = tx.auto_match || {};
                const dType = am.type || tx.details?.[0]?.type || 'INCOME';
                const isExpense = (dType === 'EXPENSE' || dType === 'CREDIT_AR');
                const stmtAmountVal = isExpense ? -Math.abs(tx.total_amount) : Math.abs(tx.total_amount);
                
                savedPendingGroups[tx.account_id] += stmtAmountVal;
            });
        }
    } catch(e) { console.error("Error fetching summary data", e); }

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
        const gridSum = gridGroups[accId] || 0;
        const totalSum = confirmedSum + pendingSum + gridSum;
        
        const isConfirmedNeg = confirmedSum < 0;
        const isPendingNeg = pendingSum < 0;
        const isGridNeg = gridSum < 0;
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
                        <span style="font-size: 1rem;">💾</span>
                        <span style="font-weight: 700; font-size: 0.9rem; color: ${isPendingNeg ? '#DC2626' : '#F97316'};">${formatCurrency(pendingSum)}</span>
                    </div>
                    <div style="display: flex; align-items: center; justify-content: space-between;" title="รายการรอบันทึก (In Grid)">
                        <span style="font-size: 1rem;">⏳</span>
                        <span style="font-weight: 700; font-size: 0.9rem; color: ${isGridNeg ? '#DC2626' : '#10B981'};">${formatCurrency(gridSum)}</span>
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
            headers: { 'x-user-id': encodeURIComponent(AppState.userId) }
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
                'x-user-id': encodeURIComponent(AppState.userId)
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

    // Pending review style matching
    const headerClass = 'header-income';
    const accentColor = '#0F766E';

    cardEl.innerHTML = `
        <div class="tx-card-header ${headerClass}" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; gap: 10px; border-left: 5px solid ${accentColor}; background: linear-gradient(135deg, #1E293B 0%, #0F172A 100%); border-radius: 10px 10px 0 0;">
            <div style="display: flex; align-items: center; gap: 10px; flex-grow: 1; flex-wrap: wrap;">
                <input type="date" class="grid-date form-control" style="padding: 2px 6px; font-size: 0.8rem; line-height: 24px; width: 118px; height: 28px; background: rgba(255,255,255,0.12); color: #E2E8F0; border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; font-weight: 600;" value="${dateVal}">
                <span style="color: rgba(255,255,255,0.25); font-size: 1rem;">|</span>
                <select class="grid-account form-control" style="width: 200px; height: 28px; padding: 2px 24px 2px 8px; line-height: 24px; font-size: 14px; font-weight: 700; background: rgba(255,255,255,0.12); color: #FBBF24; border: 1px solid rgba(255,255,255,0.2); border-radius: 6px;">
                    ${stmtOptions}
                </select>
                <span style="color: rgba(255,255,255,0.25); font-size: 1rem;">|</span>
                <input type="text" class="grid-total form-control" placeholder="0.00" oninput="this.value = this.value.replace(/[^0-9.()-]/g, '')" onblur="this.value = formatNumberWithCommas(this.value)" onfocus="this.value = this.value.replace(/,/g, '')" style="width: 150px; height: 28px; padding: 2px 8px; line-height: 24px; font-size: 0.85rem; font-weight: 800; text-align: right; color: #6EE7B7; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; letter-spacing: 0.5px;" value="${data.total_amount ? formatNumberWithCommas(data.total_amount) : ''}">
                <input type="text" class="grid-note form-control" placeholder="Notes (คำอธิบายรายการ)..." style="flex-grow: 1; min-width: 150px; height: 28px; padding: 2px 8px; line-height: 24px; font-size: 0.8rem; background: rgba(255,255,255,0.07); color: #94A3B8; border: 1px solid rgba(255,255,255,0.12); border-radius: 6px;" value="${data.note || ''}">
            </div>
            <div style="display: flex; gap: 6px;">
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

    // Zero-sum calculation logic: Statement + TX + Fee + WHT must = 0
    const updateZeroSum = () => {
        const totalInput = cardEl.querySelector(".grid-total");
        const stmtAmount = parseAmountInput(totalInput.value);  // Statement Amount
        
        let subSum = 0;  // TX + Fee + WHT
        cardEl.querySelectorAll(".grid-tx-amount").forEach(el => {
            subSum += parseAmountInput(el.value);
        });
        cardEl.querySelectorAll(".grid-fee").forEach(el => {
            subSum += parseAmountInput(el.value);
        });
        cardEl.querySelectorAll(".grid-wht").forEach(el => {
            subSum += parseAmountInput(el.value);
        });

        // Total balance = Statement + all sub-row items (must equal 0)
        const balance = stmtAmount + subSum;

        const zeroSumValEl = cardEl.querySelector(".zero-sum-value");
        const zeroSumLabelEl = cardEl.querySelector(".zero-sum-label");
        const zeroSumStatusEl = cardEl.querySelector(".zero-sum-status");

        if (zeroSumValEl) zeroSumValEl.innerText = formatNumber(balance);
        if (zeroSumLabelEl) zeroSumLabelEl.innerText = 'ผลรวม:';
        if (zeroSumStatusEl) {
            if (Math.abs(balance) < 0.01) {
                zeroSumStatusEl.innerText = "✅";
                zeroSumStatusEl.style.color = "#10B981";
            } else {
                zeroSumStatusEl.innerText = "❌";
                zeroSumStatusEl.style.color = "#EF4444";
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
    // Auto-save draft on grid-total change — also recalculate zero-sum on every keystroke
    cardEl.querySelector(".grid-total").addEventListener("input", (e) => {
        const stmtAmt = parseAmountInput(e.target.value);
        const subRows = cardEl.querySelectorAll(".sub-row");
        if (subRows.length === 1 && stmtAmt !== 0) {
            const amtInput = subRows[0].querySelector(".grid-tx-amount");
            // Auto fill only if the user hasn't explicitly typed something else, 
            // or if we just want to keep it in sync for convenience.
            // Let's just forcefully keep it in sync if it's the only row, to save them typing!
            if (amtInput) {
                const isNeg = -stmtAmt < 0;
                const formatted = Math.abs(stmtAmt).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                amtInput.value = isNeg ? `(${formatted})` : formatted;
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
    const total_amount = parseAmountInput(cardEl.querySelector(".grid-total")?.value || '0');
    const note = cardEl.querySelector(".grid-note")?.value || '';
    const details = [];
    cardEl.querySelectorAll(".sub-row").forEach(row => {
        details.push({
            caption: row.querySelector(".grid-caption")?.value || '',
            entity_id: row.querySelector(".grid-entity")?.value || '',
            contact_id: row.querySelector(".grid-contact")?.value || '',
            category_id: row.querySelector(".grid-category")?.value || '',
            amount: parseAmountInput(row.querySelector(".grid-tx-amount")?.value || '0'),
            fee: parseAmountInput(row.querySelector(".grid-fee")?.value || '0'),
            wht: parseAmountInput(row.querySelector(".grid-wht")?.value || '0'),
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

    subRows.forEach((row, idx) => {
        if (!isValid) return;

        const categoryId = row.querySelector(".grid-category")?.value || '';
        const txType = row.querySelector(".grid-tx-type")?.value || '';
        const tranAmountStr = row.querySelector(".grid-tx-amount")?.value || '';
        const tranAmount = parseAmountInput(tranAmountStr);
        const fee = parseAmountInput(row.querySelector(".grid-fee")?.value || '0');
        const wht = parseAmountInput(row.querySelector(".grid-wht")?.value || '0');

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
        // Sign check: TX must be opposite sign to Statement
        if (stmtAmount > 0 && tranAmount >= 0) {
            alert(`รายการย่อยที่ ${idx + 1}: Statement Amount เป็นบวก ดังนั้น Transaction Amount ต้องเป็นลบ (เช่น -1,000.00)`);
            isValid = false;
            return;
        }
        if (stmtAmount < 0 && tranAmount <= 0) {
            alert(`รายการย่อยที่ ${idx + 1}: Statement Amount เป็นลบ ดังนั้น Transaction Amount ต้องเป็นบวก (เช่น 1,000.00)`);
            isValid = false;
            return;
        }

        const cat = AppState.categories.find(c => c.category_id === categoryId);
        const txTypeName = AppState.captions.find(at => at.type_id === txType)?.name || '';
        let detailType = cat?.default_type || (stmtAmount < 0 ? 'EXPENSE' : 'INCOME');

        details.push({
            amount: tranAmount,
            fee,
            wht,
            category_id: categoryId || null,
            entity_id: row.querySelector(".grid-entity")?.value || null,
            contact_id: row.querySelector(".grid-contact")?.value || null,
            note: row.querySelector(".grid-detail")?.value || null,
            type: detailType
        });

        totalTranAmount += tranAmount;
        totalFee += fee;
        totalWht += wht;
    });

    if (!isValid) return;

    // Zero-sum check: Statement + TX + Fee + WHT = 0
    const balance = stmtAmount + totalTranAmount + totalFee + totalWht;
    if (Math.abs(balance) > 0.01) {
        const fmt = (n) => {
            const neg = n < 0;
            return neg ? `(${Math.abs(n).toFixed(2)})` : n.toFixed(2);
        };
        alert(`ยอดรวมต้องเป็น 0\n\nStatement: ${fmt(stmtAmount)}\nTransaction: ${fmt(totalTranAmount)}\nFee: ${fmt(totalFee)}\nWHT: ${fmt(totalWht)}\nผลรวม: ${fmt(balance)}`);
        return;
    }

    const payload = {
        account_id,
        date,
        time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        statement_desc: note || 'นำเข้าข้อมูลด่วน',
        total_amount: Math.abs(stmtAmount),
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
            headers: { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(AppState.userId) },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            alert(`เกิดข้อผิดพลาด: ${err.error || res.statusText}`);
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
            <input type="text" class="grid-tx-amount form-control" placeholder="0.00" oninput="this.value = this.value.replace(/[^0-9.()-]/g, '')" onblur="this.value = formatNumberWithCommas(this.value)" onfocus="this.value = this.value.replace(/,/g, '')" style="${subRowInputStyle} text-align: right; font-weight: 600;" value="${data.amount !== undefined && data.amount !== '' ? formatNumberWithCommas(String(data.amount)) : ''}">
        </div>
        <div class="sub-row-col">
            <input type="text" class="grid-fee form-control" placeholder="0.00" oninput="this.value = this.value.replace(/[^0-9.()-]/g, '')" onblur="this.value = formatNumberWithCommas(this.value)" onfocus="this.value = this.value.replace(/,/g, '')" style="${subRowInputStyle} text-align: right;" value="${data.fee !== undefined && data.fee !== '' ? formatNumberWithCommas(String(data.fee)) : ''}">
        </div>
        <div class="sub-row-col">
            <input type="text" class="grid-wht form-control" placeholder="0.00" oninput="this.value = this.value.replace(/[^0-9.()-]/g, '')" onblur="this.value = formatNumberWithCommas(this.value)" onfocus="this.value = this.value.replace(/,/g, '')" style="${subRowInputStyle} text-align: right;" value="${data.wht !== undefined && data.wht !== '' ? formatNumberWithCommas(String(data.wht)) : ''}">
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

    // Zero-sum in sub-row: Statement + TX + Fee + WHT must = 0
    const triggerZeroSumUpdate = () => {
        if (parentCardEl) {
            const stmtAmount = parseAmountInput(parentCardEl.querySelector(".grid-total")?.value || '0');
            
            let subSum = 0;
            parentCardEl.querySelectorAll(".grid-tx-amount").forEach(el => {
                subSum += parseAmountInput(el.value);
            });
            parentCardEl.querySelectorAll(".grid-fee").forEach(el => {
                subSum += parseAmountInput(el.value);
            });
            parentCardEl.querySelectorAll(".grid-wht").forEach(el => {
                subSum += parseAmountInput(el.value);
            });

            const balance = stmtAmount + subSum;
            const isNeg = balance < 0;
            const absVal = Math.abs(balance);
            const displayBalance = isNeg
                ? `(${absVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
                : absVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

            const zeroSumValEl = parentCardEl.querySelector(".zero-sum-value");
            const zeroSumStatusEl = parentCardEl.querySelector(".zero-sum-status");

            if (zeroSumValEl) zeroSumValEl.innerText = displayBalance;
            if (zeroSumStatusEl) {
                if (Math.abs(balance) < 0.01) {
                    zeroSumStatusEl.innerText = "✅";
                    zeroSumStatusEl.style.color = "#10B981";
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
            headers: { 'x-user-id': encodeURIComponent(AppState.userId) }
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
        whtEntitySelect.innerHTML = '<option value="">-- แสดงทั้งหมด (All Owners) --</option>';
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
            headers: { 'x-user-id': encodeURIComponent(AppState.userId) }
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
            headers: { 'x-user-id': encodeURIComponent(AppState.userId) }
        });
        const txs = await res.json();
        
        const tbody = document.getElementById("project-report-body");
        tbody.innerHTML = '';

        let totalIncome = 0;
        let totalExpense = 0;

        txs.forEach(tx => {
            tx.details.forEach(d => {
                if (d.project_id === projectId) {
                    const isIncome = (d.behavior === 'REVENUE' || d.behavior === 'ASSET') || (d.behavior === 'ASSET');
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
                    'x-user-id': encodeURIComponent(AppState.userId)
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
            headers: { 'x-user-id': encodeURIComponent(AppState.userId) }
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
        const headers = { 'x-user-id': encodeURIComponent(AppState.userId) };
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

function renderSettingsTabs() {
    const isAdmin = (AppState.userRole === 'admin');

    // Show/hide add buttons based on role
    document.querySelectorAll(".btn-add-setting, #btn-add-user").forEach(btn => {
        btn.style.display = isAdmin ? 'inline-flex' : 'none';
    });

    if (!AppState.settings) AppState.settings = {};
    const safeArray = (arr) => Array.isArray(arr) ? arr : [];

    // 1. Entities (Owners / Statements)
    const entitiesBody = document.getElementById("settings-entities-body");
    if (entitiesBody) entitiesBody.innerHTML = '';
    safeArray(AppState.settings.entities).forEach(ent => {
        if (!isAdmin && !AppState.allowedEntities.includes(ent.entity_id)) {
            return;
        }

        const ownersList = (AppState.settings.entity_users || [])
            .filter(eu => eu.entity_id === ent.entity_id)
            .map(eu => eu.user_name)
            .join(', ') || '-';

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><code>${ent.entity_id}</code></td>
            <td>${ent.name}</td>
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
    safeArray(AppState.settings.contacts).forEach(c => {
        const tr = document.createElement("tr");
        const typeLabel = c.contact_type === 'CUSTOMER' ? '🟢 ลูกค้า (Customer)' : c.contact_type === 'VENDOR' ? '🔴 เจ้าหนี้/ผู้ส่งมอบ (Vendor)' : '⚪ อื่นๆ (Other)';
        tr.innerHTML = `
            <td><code>${c.contact_id}</code></td>
            <td>${c.name}</td>
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
        const bLabel = at.behavior === 'REVENUE' ? 'เงินเข้า (รายรับ / อื่นๆ)' : at.behavior === 'EXPENSE' ? 'เงินออก (รายจ่าย / อื่นๆ)' : at.behavior === 'ASSET' ? 'สินทรัพย์ / ทดรองจ่าย' : at.behavior === 'LIABILITY' ? 'หนี้สิน' : 'โอนเงินระหว่างบัญชี';
        const entName = getEntityName(at.default_entity_id);
        const conName = getContactName(at.default_contact_id);
        const typeLbl = getTypeLabel(at.default_type);
        tr.innerHTML = `
            <td><code>${at.type_id}</code></td>
            <td>${at.name}</td>
            <td>${bLabel}</td>
            <td>${entName}</td>
            <td>${conName}</td>
            <td>${typeLbl}</td>
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
            <td>${typeLbl}</td>
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
        if (!isAdmin && !AppState.allowedEntities.includes(acc.entity_id)) {
            return;
        }

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><code>${acc.account_id}</code></td>
            <td>${acc.entity_name}</td>
            <td>${acc.name}</td>
            <td><code>${acc.bank_name || '-'}</code></td>
            <td>${acc.account_number || '-'}</td>
            <td class="amount">${formatCurrency((acc.balance || 0))}</td>
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
    safeArray(AppState.settings.projects).forEach(p => {
        const tr = document.createElement("tr");
        const statusLabel = p.status === 'closed' ? '🔴 ปิดแล้ว (Closed)' : '🟢 กำลังดำเนินอยู่ (Active)';
        tr.innerHTML = `
            <td><code>${p.project_id}</code></td>
            <td>${p.name}</td>
            <td>${statusLabel}</td>
            <td>
                ${isAdmin ? `
                    <button class="btn btn-icon-only edit-project" data-id="${p.project_id}" title="แก้ไข">✏️</button>
                    <button class="btn btn-icon-only delete-setting" data-type="project" data-id="${p.project_id}" title="ลบ">🗑️</button>
                ` : '-'}
            </td>
        `;
        projectsBody.appendChild(tr);
    });

    // 7. Users (สมาชิกครอบครัว)
    if (isAdmin) {
        const usersBody = document.getElementById("settings-users-body");
        if (usersBody) usersBody.innerHTML = '';
        safeArray(AppState.settings.users).forEach(u => {
            const tr = document.createElement("tr");
            const allowedEntitiesList = (u.allowed_entities || []).map(entId => {
                const entObj = (AppState.settings.entities || []).find(e => e.entity_id === entId);
                return entObj ? entObj.name : entId;
            }).join(', ') || 'ไม่มีสิทธิ์';

            tr.innerHTML = `
                <td><code>${u.user_id}</code></td>
                <td>${u.name}</td>
                <td>${u.email}</td>
                <td><span class="badge ${u.role === 'admin' ? 'bg-danger' : 'bg-primary'}">${u.role === 'admin' ? 'Admin' : 'Member'}</span></td>
                <td><code>${u.line_user_id || '-'}</code></td>
                <td><small style="color: #666;">${allowedEntitiesList}</small></td>
                <td>
                    <button class="btn btn-icon-only edit-user" data-id="${u.user_id}" title="แก้ไขสิทธิ์">✏️</button>
                </td>
            `;
            usersBody.appendChild(tr);
        });
    }

    // Re-rendering complete
}

function setupSettingsEvents() {
    // Tab switching (already has data-settings-tab bindings in HTML)
    const tabs = document.querySelectorAll(".settings-tab");
    tabs.forEach(tab => {
        tab.replaceWith(tab.cloneNode(true));
    });

    const newTabs = document.querySelectorAll(".settings-tab");
    newTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            newTabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");

            const targetTab = tab.getAttribute("data-settings-tab");
            
            // Hide all sections
            document.querySelectorAll(".settings-section-content").forEach(sec => {
                sec.classList.add("hidden");
                sec.classList.remove("active");
            });

            // Show active section
            const activeSec = document.getElementById(`settings-${targetTab}`);
            if (activeSec) {
                if (targetTab === 'debts') renderDebtsSettings();
                activeSec.classList.remove("hidden");
                activeSec.classList.add("active");
            }
        });
    });

    // Add setting button
    document.querySelectorAll(".btn-add-setting").forEach(btn => {
        btn.replaceWith(btn.cloneNode(true));
    });

    document.querySelectorAll(".btn-add-setting").forEach(btn => {
        btn.addEventListener("click", () => {
            const type = btn.getAttribute("data-type");
            const catType = btn.getAttribute("data-cat-type");
            openSettingModal(type, '', { catType });
        });
    });

    // Add user button
    const btnAddUser = document.getElementById("btn-add-user");
    if (btnAddUser) {
        btnAddUser.replaceWith(btnAddUser.cloneNode(true));
        document.getElementById("btn-add-user").addEventListener("click", () => {
            openUserModal('');
        });
    }

    // Edit button clicks on tables
    document.querySelectorAll(".edit-entity").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-id");
            openSettingModal('entity', id);
        });
    });

    document.querySelectorAll(".edit-contact").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-id");
            openSettingModal('contact', id);
        });
    });

    document.querySelectorAll(".edit-account-type").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-id");
            openSettingModal('caption', id);
        });
    });

    document.querySelectorAll(".edit-category").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-id");
            openSettingModal('category', id);
        });
    });

    document.querySelectorAll(".edit-account").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-id");
            openSettingModal('account', id);
        });
    });

    document.querySelectorAll(".edit-project").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-id");
            openSettingModal('project', id);
        });
    });

    document.querySelectorAll(".edit-user").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-id");
            openUserModal(id);
        });
    });

    // Delete button clicks
    document.querySelectorAll(".delete-setting").forEach(btn => {
        btn.addEventListener("click", () => {
            const type = btn.getAttribute("data-type");
            const id = btn.getAttribute("data-id");
            deleteSettingItem(type, id);
        });
    });
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

    document.getElementById("setting-name").value = '';
    document.getElementById("setting-bank-name").value = '';
    document.getElementById("setting-account-number").value = '';
    document.getElementById("setting-is-company").value = '0';
    document.getElementById("setting-contact-type").value = 'CUSTOMER';
    const behaviorEl = document.getElementById("setting-behavior");
    if (behaviorEl) behaviorEl.value = 'EXPENSE';
    const catAccountTypeEl = document.getElementById("setting-category-account-type");
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
    document.getElementById("group-setting-account-type")?.classList.add("hidden");
    document.getElementById("group-setting-projectstatus").classList.add("hidden");
    document.getElementById("group-setting-defaults").classList.add("hidden");

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
        if (oldId) {
            const ent = AppState.settings.entities.find(e => e.entity_id === oldId);
            if (ent) {
                document.getElementById("setting-name").value = ent.name;
                document.getElementById("setting-is-company").value = ent.is_company ? '1' : '0';
            }
        }
    } else if (type === 'contact') {
        document.getElementById("group-setting-contacttype").classList.remove("hidden");
        if (oldId) {
            const c = AppState.settings.contacts.find(con => con.contact_id === oldId);
            if (c) {
                document.getElementById("setting-name").value = c.name;
                document.getElementById("setting-contact-type").value = c.contact_type;
            }
        }
    } else if (type === 'caption') {
        document.getElementById("group-setting-behavior").classList.remove("hidden");
        document.getElementById("group-setting-defaults").classList.remove("hidden");
        if (oldId) {
            const at = AppState.settings.captions.find(a => a.type_id === oldId);
            if (at) {
                document.getElementById("setting-name").value = at.name;
                document.getElementById("setting-behavior").value = at.behavior;
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
        const catTypeSelect = document.getElementById("setting-category-account-type");
        catTypeSelect.innerHTML = '';
        AppState.settings.captions.forEach(at => {
            catTypeSelect.innerHTML += `<option value="${at.type_id}">${at.name}</option>`;
        });
        document.getElementById("group-setting-account-type").classList.remove("hidden");
        document.getElementById("group-setting-defaults").classList.remove("hidden");
        if (oldId) {
            const cat = AppState.settings.categories.find(ca => ca.category_id === oldId);
            if (cat) {
                document.getElementById("setting-name").value = cat.name;
                document.getElementById("setting-category-account-type").value = cat.caption_id;
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

        document.getElementById("group-setting-entity").classList.remove("hidden");
        document.getElementById("group-setting-bank").classList.remove("hidden");
        document.getElementById("group-setting-accnum").classList.remove("hidden");
        document.getElementById("group-setting-pdfpassword")?.classList.remove("hidden");

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
            }
        }
    } else if (type === 'project') {
        document.getElementById("group-setting-projectstatus").classList.remove("hidden");
        document.getElementById("setting-project-status").value = 'active';

        if (oldId) {
            const p = AppState.settings.projects.find(proj => proj.project_id === oldId);
            if (p) {
                document.getElementById("setting-name").value = p.name;
                document.getElementById("setting-project-status").value = p.status || 'active';
            }
        }
    }
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

    const payload = {
        type,
        old_id: oldId || null,
        new_id: newId,
        name,
        entity_id: document.getElementById("setting-entity-id").value,
        bank_name: document.getElementById("setting-bank-name").value.trim(),
        account_number: document.getElementById("setting-account-number").value.trim(),
        pdf_password: document.getElementById("setting-pdf-password") ? document.getElementById("setting-pdf-password").value.trim() : null,
        is_company: Number(document.getElementById("setting-is-company").value),
        contact_type: document.getElementById("setting-contact-type").value,
        category_type: type === 'caption' ? document.getElementById("setting-behavior").value : (type === 'category' ? document.getElementById("setting-category-account-type").value : null),
        project_status: document.getElementById("setting-project-status").value,
        default_entity_id: document.getElementById("setting-default-entity-id") ? (document.getElementById("setting-default-entity-id").value || null) : null,
        default_contact_id: document.getElementById("setting-default-contact-id") ? (document.getElementById("setting-default-contact-id").value || null) : null,
        default_type: document.getElementById("setting-default-type") ? (document.getElementById("setting-default-type").value || null) : null
    };

    try {
        const res = await fetch(`${API_BASE}/api/settings/save`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-user-id': encodeURIComponent(AppState.userId)
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
                'x-user-id': encodeURIComponent(AppState.userId)
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
                            'x-user-id': encodeURIComponent(AppState.userId)
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

                            const promises = data.transactions.map(tx => {
                                const payload = {
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
                                    headers: { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(AppState.userId) },
                                    body: JSON.stringify(payload)
                                }).then(async r => {
                                    if (!r.ok) return 'error';
                                    const json = await r.json();
                                    if (json.skipped) return 'skipped';
                                    return 'success';
                                }).catch(() => 'error');
                            });

                            const results = await Promise.all(promises);
                            results.forEach(resType => {
                                if (resType === 'success') importedCount++;
                                else if (resType === 'skipped') skippedCount++;
                            });

                            alert(`อัปโหลดสำเร็จ: นำเข้า ${importedCount} รายการ, ข้ามรายการซ้ำ ${skippedCount} รายการ`);
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
                'x-user-id': encodeURIComponent(AppState.userId)
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
        filename = 'settings_owners.xlsx';
        const list = AppState.settings.entities || [];
        data = list.map(item => ({
            "ID": item.entity_id,
            "Name": item.name,
            "Is Company (1 or 0)": item.is_company ? 1 : 0
        }));
    } else if (type === 'contact') {
        filename = 'settings_customers.xlsx';
        const list = AppState.settings.contacts || [];
        data = list.map(item => ({
            "ID": item.contact_id,
            "Name": item.name,
            "Contact Type (CUSTOMER or VENDOR or OTHER)": item.contact_type || 'CUSTOMER'
        }));
    } else if (type === 'caption') {
        filename = 'settings_captions.xlsx';
        const list = AppState.settings.captions || [];
        data = list.map(item => ({
            "ID": item.type_id,
            "Name": item.name,
            "Behavior (REVENUE or EXPENSE or ASSET or LIABILITY or TRANSFER)": item.behavior || 'EXPENSE',
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
            "Owner (Entity ID)": item.entity_id || '',
            "Name": item.name,
            "Bank Name": item.bank_name || '',
            "Account Number": item.account_number || ''
        }));
    } else if (type === 'project') {
        filename = 'settings_trips.xlsx';
        const list = AppState.settings.projects || [];
        data = list.map(item => ({
            "ID": item.project_id,
            "Name": item.name,
            "Status (active or closed)": item.status || 'active'
        }));
    }
    
    if (data.length === 0) {
        if (type === 'entity') data.push({ "ID": "ENT-NEW", "Name": "บริษัท ตัวอย่าง จำกัด", "Is Company (1 or 0)": 1 });
        else if (type === 'contact') data.push({ "ID": "CON-NEW", "Name": "คุณสมชาย ใจดี", "Contact Type (CUSTOMER or VENDOR or OTHER)": "CUSTOMER" });
        else if (type === 'caption') data.push({ "ID": "TYPE-NEW", "Name": "รายได้ค่าบริการ", "Behavior (REVENUE or EXPENSE or ASSET or LIABILITY or TRANSFER)": "REVENUE", "Default Company (Entity ID)": "", "Default Customer (Contact ID)": "", "Default Type (INCOME or EXPENSE or TRANSFER)": "" });
        else if (type === 'category') data.push({ "ID": "CAT-NEW", "Name": "ค่าธรรมเนียมธนาคาร", "Account Type (Caption ID)": "", "Default Company (Entity ID)": "", "Default Customer (Contact ID)": "", "Default Type (INCOME or EXPENSE or TRANSFER)": "" });
        else if (type === 'account') data.push({ "ID": "ACC-NEW", "Owner (Entity ID)": "", "Name": "บัญชีธนาคาร กสิกรไทย", "Bank Name": "KBANK", "Account Number": "1234567890" });
        else if (type === 'project') data.push({ "ID": "PRJ-NEW", "Name": "ทริปญี่ปุ่น 2026", "Status (active or closed)": "active" });
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
                } else if (type === 'contact') {
                    exists = (AppState.settings.contacts || []).some(item => item.contact_id === idVal);
                    payload.contact_type = String(row["Contact Type (CUSTOMER or VENDOR or OTHER)"] || "CUSTOMER").toUpperCase().trim();
                } else if (type === 'caption') {
                    exists = (AppState.settings.captions || []).some(item => item.type_id === idVal);
                    payload.category_type = String(row["Behavior (REVENUE or EXPENSE or ASSET or LIABILITY or TRANSFER)"] || "EXPENSE").toUpperCase().trim();
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
                    payload.entity_id = String(row["Owner (Entity ID)"] || "").trim();
                    payload.bank_name = String(row["Bank Name"] || "").trim();
                    payload.account_number = String(row["Account Number"] || "").trim();
                } else if (type === 'project') {
                    exists = (AppState.settings.projects || []).some(item => item.project_id === idVal);
                    payload.project_status = String(row["Status (active or closed)"] || "active").toLowerCase().trim();
                }
                
                payload.old_id = exists ? idVal : null;
                
                try {
                    const res = await fetch(`${API_BASE}/api/settings/save`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'x-user-id': encodeURIComponent(AppState.userId)
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
    // Generate headers
    const headers = [
        "Date (YYYY-MM-DD)",
        "Statement Account ID",
        "Total Amount",
        "Note",
        "Caption (Account Type ID)",
        "Category ID",
        "Company Entity ID",
        "Customer Contact ID",
        "Transaction Amount",
        "Fee",
        "WHT",
        "Detail"
    ];

    // Example row
    const exampleRow = [
        "2023-12-31",
        "ACC-01",
        "1000.00",
        "Main Note",
        "",
        "CAT-01",
        "ENT-01",
        "CONT-01",
        "1000.00",
        "0.00",
        "0.00",
        "Sub-row detail"
    ];

    if (typeof XLSX !== 'undefined') {
        const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
        const csv = XLSX.utils.sheet_to_csv(ws);
        
        const blob = new Blob(["\ufeff", csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "Grid_Import_Template.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } else {
        alert("ไม่พบไลบรารีส่งออกไฟล์ กรุณารีเฟรชหน้าเว็บ");
    }
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
            const captionsMap = {};
            AppState.settings.captions.forEach(c => captionsMap[c.type_id] = c.behavior);

            AppState.settings.categories.forEach(cat => {
                const behavior = captionsMap[cat.category_type];
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
                    source: 'MANUAL',
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
                source: 'MANUAL',
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
        const res = await fetch(`${API_BASE}/api/debts`, { headers: { 'x-user-id': encodeURIComponent(AppState.userId) } });
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
        tr.innerHTML = `
            <td>${d.name}</td>
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
        const d = AppState.debts.find(x => x.debt_id === id);
        document.getElementById('debt-id').value = d.debt_id;
        document.getElementById('debt-type').value = d.type;
        document.getElementById('debt-name').value = d.name;
        document.getElementById('debt-contact').value = d.contact_id || '';
        document.getElementById('debt-start-balance').value = formatCurrency(d.start_balance);
        document.getElementById('debt-installment').value = d.installment_amount ? formatCurrency(d.installment_amount) : '';
        document.getElementById('debt-start-date').value = d.start_date || '';
        document.getElementById('debt-principal-category').value = d.principal_category_id || '';
        document.getElementById('debt-interest-category').value = d.interest_category_id || '';
    } else {
        document.getElementById('debt-form').reset();
        document.getElementById('debt-id').value = '';
    }
}

function closeDebtModal() {
    document.getElementById('debt-modal').classList.add('hidden');
}

async function saveDebtProfile(e) {
    e.preventDefault();
    const id = document.getElementById('debt-id').value;
    const payload = {
        type: document.getElementById('debt-type').value,
        name: document.getElementById('debt-name').value,
        contact_id: document.getElementById('debt-contact').value || null,
        start_balance: parseFormattedNum(document.getElementById('debt-start-balance').value),
        installment_amount: document.getElementById('debt-installment').value ? parseFormattedNum(document.getElementById('debt-installment').value) : null,
        start_date: document.getElementById('debt-start-date').value || null,
        principal_category_id: document.getElementById('debt-principal-category').value || null,
        interest_category_id: document.getElementById('debt-interest-category').value || null
    };

    try {
        const method = id ? 'PUT' : 'POST';
        const url = id ? `${API_BASE}/api/debts/${id}` : `${API_BASE}/api/debts`;
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(AppState.userId) },
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
            headers: { 'x-user-id': encodeURIComponent(AppState.userId) }
        });
        if (res.ok) {
            await renderDebtsSettings();
        }
    } catch(e) {
        console.error(e);
    }
}

let currentDebtTab = 'PAYABLE';
function switchDebtTab(tab) {
    currentDebtTab = tab;
    document.querySelectorAll('.debts-dashboard .tabs button').forEach(btn => btn.classList.remove('active'));
    if(tab === 'PAYABLE') document.getElementById('tab-payable').classList.add('active');
    else document.getElementById('tab-receivable').classList.add('active');
    renderDebtsDashboard();
}



window.fetchTransactions = async function() {
    try {
        const res = await fetch(`${API_BASE}/api/transactions?status=CONFIRMED`, { headers: { 'x-user-id': encodeURIComponent(AppState.userId) } });
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
        const icon = debt.icon_type || 'credit_card';
        
        let iconHtml = '';
        let bgColor = '#a2d2ff'; // default blue
        if(icon === 'car') { iconHtml = 'fa-car'; bgColor = '#ffb5a7'; }
        else if(icon === 'house') { iconHtml = 'fa-house'; bgColor = '#bde0fe'; }
        else if(icon === 'personal') { iconHtml = 'fa-sack-dollar'; bgColor = '#ffd6a5'; }
        else if(icon === 'student') { iconHtml = 'fa-graduation-cap'; bgColor = '#caffbf'; }
        else { iconHtml = 'fa-credit-card'; bgColor = '#a2d2ff'; }
        
        const txs = window.getDebtTransactions(debt);
        const paidAmount = txs.reduce((sum, t) => sum + (t.principal || 0), 0);
        const balance = debt.start_balance - paidAmount;
        
        totalStartBalance += debt.start_balance;
        totalPaidOverall += paidAmount;
        
        let progressPct = debt.start_balance > 0 ? (paidAmount / debt.start_balance) * 100 : 0;
        if(progressPct > 100) progressPct = 100;

        return `
            <div class="debt-card neumorph-card" onclick="viewDebtDetails('${(debt.debt_id || debt.id)}')" style="cursor: pointer; padding: 12px; border-radius: 15px; background: rgba(255,255,255,0.8); display: flex; align-items: center; justify-content: space-between; transition: all 0.2s; border: 1px solid rgba(255,255,255,1);">
                <div style="display: flex; gap: 12px; align-items: center; width: 100%;">
                    <div style="width: 45px; height: 45px; border-radius: 12px; background: ${bgColor}; display: flex; align-items: center; justify-content: center; box-shadow: 2px 2px 5px rgba(0,0,0,0.1), inset -2px -2px 5px rgba(255,255,255,0.5);">
                        <i class="fa-solid ${iconHtml}" style="color: #2c3e50; font-size: 1.2rem;"></i>
                    </div>
                    <div style="flex: 1;">
                        <div style="display: flex; justify-content: space-between;">
                            <h4 style="margin: 0; color: #2c3e50; font-size: 0.95rem;">${debt.name}</h4>
                            <span style="font-weight: bold; color: #3d5a80;">${formatCurrency(balance)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-top: 2px;">
                            <span style="color: #74b9ff; font-weight: 500;">${contact ? contact.name : 'Unknown'}</span>
                            <span style="color: #27ae60;"><i class="fa-solid fa-check"></i> ${debt.status}</span>
                        </div>
                        <div style="margin-top: 6px; width: 100%; height: 6px; background: #e0fbfc; border-radius: 3px; overflow: hidden; position: relative;">
                            <div style="width: ${progressPct}%; height: 100%; background: linear-gradient(90deg, #a2d2ff, #74b9ff); border-radius: 3px;"></div>
                        </div>
                        <div style="font-size: 0.65rem; color: #7f8c8d; text-align: right; margin-top: 2px;">${progressPct.toFixed(0)}% Paid</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (filtered.length === 0) {
        listContainer.innerHTML = `<div style="text-align:center; padding: 20px; color: #95a5a6;">ไม่มีข้อมูล</div>`;
    }
    
    // Update Summary Chart
    const summaryChart = document.getElementById('debt-summary-chart');
    if (summaryChart) {
        let paidPct = totalStartBalance > 0 ? (totalPaidOverall / totalStartBalance) * 100 : 0;
        let remPct = 100 - paidPct;
        
        let gradientStr = `conic-gradient(#a2d2ff 0% ${paidPct}%, #ffb5a7 ${paidPct}% 100%)`;
        
        summaryChart.innerHTML = `
            <h4 style="margin: 0 0 10px 0; color: #3d5a80; font-size: 0.9rem;">Summary</h4>
            <div style="display: flex; align-items: center; gap: 15px;">
                <div style="width: 60px; height: 60px; border-radius: 50%; background: ${gradientStr}; box-shadow: 3px 3px 8px rgba(0,0,0,0.1), -3px -3px 8px #fff;"></div>
                <div style="font-size: 0.8rem; color: #666;">
                    <div style="margin-bottom: 4px;"><span style="display:inline-block; width:8px; height:8px; background:#a2d2ff; border-radius:50%; margin-right:5px;"></span> จ่ายแล้ว ${formatCurrency(totalPaidOverall)}</div>
                    <div><span style="display:inline-block; width:8px; height:8px; background:#ffb5a7; border-radius:50%; margin-right:5px;"></span> คงเหลือ ${formatCurrency(totalStartBalance - totalPaidOverall)}</div>
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
    
    const paidPrincipal = txs.reduce((sum, t) => sum + (t.principal || 0), 0);
    const paidInterest = txs.reduce((sum, t) => sum + (t.interest || 0), 0);
    const balance = debt.start_balance - paidPrincipal;
    
    // Get unique years for filter
    const years = [...new Set(txs.map(t => t.date.substring(0,4)))].sort((a,b) => b - a);
    const yearOptions = years.map(y => `<option value="${y}">${y}</option>`).join('');

    let txRows = txs.map(t => `
        <tr class="tx-row" data-year="${t.date.substring(0,4)}">
            <td style="padding: 8px 12px; border-bottom: 1px dashed rgba(162, 210, 255, 0.4);">${t.date}</td>
            <td style="padding: 8px 12px; border-bottom: 1px dashed rgba(162, 210, 255, 0.4); color: #7f8c8d; font-size: 0.85rem;">${t.statement_desc || '-'}</td>
            <td style="padding: 8px 12px; border-bottom: 1px dashed rgba(162, 210, 255, 0.4); text-align: right;">${formatCurrency((t.principal||0) + (t.interest||0))}</td>
            <td style="padding: 8px 12px; border-bottom: 1px dashed rgba(162, 210, 255, 0.4); color: #2c3e50; text-align: right;">${formatCurrency(t.principal || 0)}</td>
            <td style="padding: 8px 12px; border-bottom: 1px dashed rgba(162, 210, 255, 0.4); color: #d35400; text-align: right;">${formatCurrency(t.interest || 0)}</td>
            <td style="padding: 8px 12px; border-bottom: 1px dashed rgba(162, 210, 255, 0.4); color: #27ae60; text-align: center;"><i class="fa-solid fa-circle-check"></i></td>
        </tr>
    `).join('');
    
    if(txs.length === 0) {
        txRows = `<tr><td colspan="6" style="text-align:center; padding: 20px; color: #95a5a6;">ไม่มีประวัติการชำระ</td></tr>`;
    }

    panel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
            <div>
                <h2 style="margin: 0; color: #2c3e50; font-weight: bold; font-size: 1.5rem;">${debt.name}</h2>
                <div style="color: #ffb5a7; margin-top: 5px; font-weight: 500;"><i class="fa-solid fa-user"></i> ${contact ? contact.name : 'Unknown'}</div>
            </div>
            <div style="display: flex; gap: 10px;">
                <button class="btn btn-outline" onclick="openDebtModal('${(debt.debt_id || debt.id) || debt.id}')" style="border-radius: 10px; background: transparent; color: #3d5a80; border: 1px solid #3d5a80;"><i class="fa-solid fa-pen"></i> Edit</button>
            </div>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 20px;">
            <div style="background: rgba(255,255,255,0.6); padding: 15px; border-radius: 15px; border: 1px solid #fff;">
                <div style="font-size: 0.8rem; color: #7f8c8d; margin-bottom: 5px;">ยอดคงเหลือปัจจุบัน</div>
                <div style="font-size: 1.5rem; font-weight: bold; color: #3d5a80;">${formatCurrency(balance)}</div>
            </div>
            <div style="background: rgba(255,255,255,0.6); padding: 15px; border-radius: 15px; border: 1px solid #fff;">
                <div style="font-size: 0.8rem; color: #7f8c8d; margin-bottom: 5px;">เงินต้นชำระแล้ว (Principal)</div>
                <div style="font-size: 1.5rem; font-weight: bold; color: #27ae60;">${formatCurrency(paidPrincipal)}</div>
            </div>
            <div style="background: rgba(255,255,255,0.6); padding: 15px; border-radius: 15px; border: 1px solid #fff;">
                <div style="font-size: 0.8rem; color: #7f8c8d; margin-bottom: 5px;">ดอกเบี้ยจ่าย (Interest)</div>
                <div style="font-size: 1.5rem; font-weight: bold; color: #d35400;">${formatCurrency(paidInterest)}</div>
            </div>
        </div>
        
        <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h4 style="margin:0; color: #3d5a80;"><i class="fa-solid fa-clock-rotate-left"></i> PAYMENT HISTORY</h4>
                <select id="year-filter" onchange="filterDebtHistory()" style="padding: 5px 10px; border-radius: 8px; border: 1px solid #a2d2ff; background: #fff; color: #3d5a80; outline: none;">
                    <option value="ALL">All Years</option>
                    ${yearOptions}
                </select>
            </div>
            <div style="background: rgba(255,255,255,0.8); border-radius: 15px; overflow: hidden; border: 1px solid #fff;">
                <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
                    <thead>
                        <tr style="background: rgba(162, 210, 255, 0.2); color: #3d5a80; text-align: left;">
                            <th style="padding: 10px 12px; width: 15%;">Date</th>
                            <th style="padding: 10px 12px; width: 30%;">Statement</th>
                            <th style="padding: 10px 12px; width: 15%; text-align: right;">Amount</th>
                            <th style="padding: 10px 12px; width: 15%; text-align: right;">Principal</th>
                            <th style="padding: 10px 12px; width: 15%; text-align: right;">Interest</th>
                            <th style="padding: 10px 12px; width: 10%; text-align: center;">Status</th>
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
    const d = AppState.debts.find(x => x.id === debtId);
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
    const rows = document.querySelectorAll('#debt-tx-tbody .tx-row');
    rows.forEach(row => {
        if(year === 'ALL' || row.getAttribute('data-year') === year) {
            row.style.display = 'table-row';
        } else {
            row.style.display = 'none';
        }
    });
};
