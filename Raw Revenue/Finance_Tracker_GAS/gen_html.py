import os
BASE = '/sessions/intelligent-laughing-bardeen/mnt/Self Money/Finance_Tracker_GAS'

html = r'''<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>💰 Finance Tracker</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;background:#F0F4F8;color:#2D3748;font-size:14px}
:root{
  --navy:#1565C0;--navy-dark:#0D47A1;--navy-light:#E3F2FD;
  --green:#2E7D32;--green-light:#E8F5E9;
  --red:#C62828;--red-light:#FFEBEE;
  --orange:#E65100;--orange-light:#FFF3E0;
  --purple:#4A148C;--purple-light:#F3E5F5;
  --gray:#607D8B;--gray-light:#ECEFF1;
  --white:#FFFFFF;--shadow:0 2px 8px rgba(0,0,0,0.1);
}

/* Layout */
#app{display:flex;height:100vh;overflow:hidden}
#sidebar{width:220px;min-width:220px;background:var(--navy-dark);display:flex;flex-direction:column}
#main{flex:1;display:flex;flex-direction:column;overflow:hidden}

/* Sidebar */
.sidebar-logo{padding:20px 16px 12px;border-bottom:1px solid rgba(255,255,255,0.15)}
.sidebar-logo h1{font-size:18px;font-weight:700;color:#fff}
.sidebar-logo small{font-size:11px;color:rgba(255,255,255,0.6)}
.sidebar-nav{flex:1;padding:8px 0}
.nav-item{display:flex;align-items:center;gap:10px;padding:11px 16px;cursor:pointer;color:rgba(255,255,255,0.75);transition:all 0.15s;border-left:3px solid transparent;font-size:13px}
.nav-item:hover{background:rgba(255,255,255,0.1);color:#fff}
.nav-item.active{background:rgba(255,255,255,0.15);color:#fff;border-left-color:#90CAF9;font-weight:600}
.nav-item .icon{width:20px;text-align:center;font-size:16px}
.nav-badge{margin-left:auto;background:#EF5350;color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:10px;min-width:20px;text-align:center}
.sidebar-footer{padding:12px 16px;border-top:1px solid rgba(255,255,255,0.15);font-size:11px;color:rgba(255,255,255,0.45)}

/* Top bar */
#topbar{background:var(--white);border-bottom:1px solid #E2E8F0;padding:10px 20px;display:flex;align-items:center;gap:12px;min-height:52px}
#topbar h2{font-size:16px;font-weight:600;color:#2D3748;flex:1}
.btn{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;transition:all 0.15s}
.btn-primary{background:var(--navy);color:#fff}.btn-primary:hover{background:var(--navy-dark)}
.btn-success{background:var(--green);color:#fff}.btn-success:hover{background:#1B5E20}
.btn-danger{background:var(--red);color:#fff}.btn-danger:hover{background:#B71C1C}
.btn-gray{background:var(--gray-light);color:#2D3748}.btn-gray:hover{background:#CFD8DC}
.btn-sm{padding:5px 10px;font-size:12px}
.btn:disabled{opacity:0.5;cursor:not-allowed}

/* Content area */
#content{flex:1;overflow-y:auto;padding:20px}
.page{display:none}.page.active{display:block}

/* Stats cards */
.stats-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:20px}
.stat-card{background:var(--white);border-radius:10px;padding:16px;box-shadow:var(--shadow);border-top:4px solid transparent}
.stat-card.blue{border-color:var(--navy)}.stat-card.green{border-color:var(--green)}
.stat-card.orange{border-color:var(--orange)}.stat-card.purple{border-color:var(--purple)}
.stat-card.red{border-color:var(--red)}
.stat-value{font-size:26px;font-weight:700;line-height:1.1;margin-bottom:4px}
.stat-label{font-size:12px;color:var(--gray)}
.stat-card.blue .stat-value{color:var(--navy)}
.stat-card.green .stat-value{color:var(--green)}
.stat-card.orange .stat-value{color:var(--orange)}
.stat-card.red .stat-value{color:var(--red)}
.stat-card.purple .stat-value{color:var(--purple)}

/* Filter bar */
.filter-bar{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;align-items:center}
.filter-bar select,.filter-bar input{padding:6px 10px;border:1px solid #CBD5E0;border-radius:6px;font-size:13px;background:#fff;color:#2D3748}
.filter-bar select:focus,.filter-bar input:focus{outline:none;border-color:var(--navy)}

/* Staging table */
.table-wrap{background:var(--white);border-radius:10px;box-shadow:var(--shadow);overflow:hidden}
table{width:100%;border-collapse:collapse}
thead tr{background:#F7FAFC}
th{padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:var(--gray);text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #E2E8F0;white-space:nowrap}
td{padding:10px 12px;border-bottom:1px solid #EDF2F7;vertical-align:middle;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
tr:last-child td{border-bottom:none}
tr:hover td{background:#F7FAFC}
.amount{text-align:right;font-weight:600;font-family:monospace}
.amount.out{color:var(--red)}
.amount.in{color:var(--green)}
.badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600}
.badge-pending{background:#FFF9C4;color:#F57F17}
.badge-transfer{background:#E3F2FD;color:#1565C0}
.badge-review{background:#FCE4EC;color:#C62828}
.badge-matched{background:#E8F5E9;color:#2E7D32}
.badge-done{background:#E8F5E9;color:#1B5E20}
.badge-dup{background:#FCE4EC;color:#C62828}
.source-chip{display:inline-block;padding:1px 6px;background:#ECEFF1;border-radius:4px;font-size:11px;color:#607D8B}
.empty-state{padding:60px 20px;text-align:center;color:var(--gray)}
.empty-state .emoji{font-size:48px;margin-bottom:12px}
.empty-state p{font-size:15px}
.loading{padding:40px;text-align:center;color:var(--gray)}
.loading::after{content:'...';animation:dots 1.2s infinite}
@keyframes dots{0%,100%{content:''}33%{content:'.'}66%{content:'..'}100%{content:'...'}}

/* Modal */
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:100;display:none;align-items:center;justify-content:center}
.modal-overlay.open{display:flex}
.modal{background:#fff;border-radius:12px;width:640px;max-width:95vw;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.3)}
.modal-header{padding:16px 20px;border-bottom:1px solid #E2E8F0;display:flex;align-items:center;justify-content:space-between}
.modal-header h3{font-size:16px;font-weight:600}
.modal-close{background:none;border:none;font-size:20px;cursor:pointer;color:var(--gray);padding:2px 6px;border-radius:4px}
.modal-close:hover{background:var(--gray-light)}
.modal-body{padding:20px;overflow-y:auto;flex:1}
.modal-footer{padding:14px 20px;border-top:1px solid #E2E8F0;display:flex;gap:8px;justify-content:flex-end}

/* Form */
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.form-group{display:flex;flex-direction:column;gap:4px}
.form-group.full{grid-column:1/-1}
.form-group label{font-size:12px;font-weight:600;color:var(--gray);text-transform:uppercase;letter-spacing:0.3px}
.form-group input,.form-group select,.form-group textarea{padding:8px 10px;border:1px solid #CBD5E0;border-radius:6px;font-size:13px;color:#2D3748;background:#fff}
.form-group input:focus,.form-group select:focus,.form-group textarea:focus{outline:none;border-color:var(--navy);box-shadow:0 0 0 3px rgba(21,101,192,0.1)}
.form-group textarea{resize:vertical;min-height:60px}
.info-box{background:var(--navy-light);border:1px solid #90CAF9;border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:13px}
.info-row{display:flex;justify-content:space-between;padding:3px 0}
.info-label{color:var(--gray);font-weight:500}
.info-value{font-weight:600}
.info-value.amount{color:var(--red);font-size:16px}
.calc-box{background:#F7FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:10px 14px;margin-top:8px;font-size:13px}
.calc-row{display:flex;justify-content:space-between;padding:3px 0}
.calc-total{font-weight:700;color:var(--green);border-top:1px solid #CBD5E0;margin-top:4px;padding-top:6px}

/* Upload area */
.upload-area{border:2px dashed #CBD5E0;border-radius:10px;padding:32px;text-align:center;cursor:pointer;transition:all 0.2s;background:#FAFAFA}
.upload-area:hover,.upload-area.drag{border-color:var(--navy);background:var(--navy-light)}
.upload-area input[type=file]{display:none}
.upload-area .icon{font-size:40px;margin-bottom:8px}
.upload-area p{color:var(--gray);font-size:14px}
.upload-area strong{color:var(--navy)}

/* Toast */
#toast{position:fixed;bottom:24px;right:24px;z-index:999;display:flex;flex-direction:column;gap:8px;pointer-events:none}
.toast{background:#2D3748;color:#fff;padding:12px 18px;border-radius:8px;font-size:13px;box-shadow:var(--shadow);pointer-events:auto;max-width:320px;animation:slideIn 0.3s ease}
.toast.success{background:#2E7D32}.toast.error{background:#C62828}.toast.info{background:var(--navy)}
@keyframes slideIn{from{transform:translateX(100px);opacity:0}to{transform:translateX(0);opacity:1}}

/* Manual entry */
.section-card{background:#fff;border-radius:10px;box-shadow:var(--shadow);padding:20px;margin-bottom:16px}
.section-card h3{font-size:15px;font-weight:600;margin-bottom:14px;color:#2D3748;border-bottom:1px solid #EDF2F7;padding-bottom:10px}

/* Responsive */
@media(max-width:768px){
  #sidebar{display:none}
  .form-grid{grid-template-columns:1fr}
}
</style>
</head>
<body>
<div id="app">
  <!-- Sidebar -->
  <aside id="sidebar">
    <div class="sidebar-logo">
      <h1>💰 Finance</h1>
      <small>Tracker v1.0</small>
    </div>
    <nav class="sidebar-nav">
      <div class="nav-item active" onclick="showPage('dashboard')">
        <span class="icon">📊</span> Dashboard
      </div>
      <div class="nav-item" onclick="showPage('staging')" id="nav-staging">
        <span class="icon">📥</span> Staging Inbox
        <span class="nav-badge" id="badge-pending">0</span>
      </div>
      <div class="nav-item" onclick="showPage('confirmed')">
        <span class="icon">✅</span> Confirmed
      </div>
      <div class="nav-item" onclick="showPage('manual')">
        <span class="icon">✏️</span> Manual Entry
      </div>
      <div class="nav-item" onclick="showPage('import')">
        <span class="icon">📤</span> Import CSV
      </div>
    </nav>
    <div class="sidebar-footer">Finance Tracker GAS v1.0</div>
  </aside>

  <!-- Main -->
  <div id="main">
    <div id="topbar">
      <h2 id="page-title">Dashboard</h2>
      <button class="btn btn-gray btn-sm" onclick="refreshAll()">🔄 Refresh</button>
    </div>
    <div id="content">

      <!-- ── Dashboard ── -->
      <div id="page-dashboard" class="page active">
        <div class="stats-grid" id="stats-grid">
          <div class="loading">กำลังโหลด</div>
        </div>
        <div class="section-card">
          <h3>🕐 รายการล่าสุด (Confirmed)</h3>
          <div class="table-wrap" style="margin-top:0;box-shadow:none">
            <table id="recent-table">
              <thead><tr>
                <th>วันที่</th><th>บัญชี</th><th>รายการ</th><th>หมวด</th>
                <th>จำนวน</th><th>ประเภท</th>
              </tr></thead>
              <tbody id="recent-body"><tr><td colspan="6" class="loading">กำลังโหลด</td></tr></tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- ── Staging Inbox ── -->
      <div id="page-staging" class="page">
        <div class="filter-bar">
          <select id="filter-status" onchange="filterStaging()">
            <option value="">ทุกสถานะ</option>
            <option value="Pending" selected>Pending</option>
            <option value="Transfer_Unmatched">Transfer_Unmatched</option>
            <option value="NeedReview">NeedReview</option>
          </select>
          <select id="filter-owner" onchange="filterStaging()">
            <option value="">ทุก Owner</option>
          </select>
          <input type="text" id="filter-search" placeholder="🔍 ค้นหา..." oninput="filterStaging()" style="width:200px">
          <span style="margin-left:auto;color:#718096;font-size:13px" id="staging-count">0 รายการ</span>
        </div>
        <div class="table-wrap">
          <table id="staging-table">
            <thead><tr>
              <th>Trans ID</th><th>วันที่</th><th>Owner</th>
              <th>บัญชี Out</th><th>บัญชี In</th>
              <th>รายการ</th><th>จำนวน (฿)</th>
              <th>สถานะ</th><th>Source</th><th style="min-width:120px">Action</th>
            </tr></thead>
            <tbody id="staging-body">
              <tr><td colspan="10" class="loading">กำลังโหลด</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ── Confirmed ── -->
      <div id="page-confirmed" class="page">
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Trans ID</th><th>วันที่</th><th>Owner</th>
              <th>บัญชี</th><th>ลูกค้า</th><th>หมวด</th>
              <th>รายการ</th><th>ยอดสุทธิ (฿)</th><th>ประเภท</th>
            </tr></thead>
            <tbody id="confirmed-body">
              <tr><td colspan="9" class="loading">กำลังโหลด</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ── Manual Entry ── -->
      <div id="page-manual" class="page">
        <div class="section-card" style="max-width:680px">
          <h3>✏️ บันทึกรายการ Manual</h3>
          <div class="form-grid">
            <div class="form-group">
              <label>วันที่ *</label>
              <input type="date" id="m-date">
            </div>
            <div class="form-group">
              <label>เจ้าของ (Head Owner)</label>
              <select id="m-owner"><option value="">-- เลือก --</option></select>
            </div>
            <div class="form-group">
              <label>ประเภทรายการ *</label>
              <select id="m-group" onchange="onGroupChange('m')">
                <option value="">-- เลือก --</option>
                <option value="Expense">Expense</option>
                <option value="Income">Income</option>
                <option value="Transfer">Transfer</option>
                <option value="AR">AR (ลูกหนี้)</option>
                <option value="AP">AP (เจ้าหนี้)</option>
              </select>
            </div>
            <div class="form-group">
              <label>หมวดหมู่</label>
              <select id="m-cat" onchange="onCatChange('m')"><option value="">-- เลือก --</option></select>
            </div>
            <div class="form-group">
              <label>หมวดย่อย</label>
              <select id="m-subcat"><option value="">-- เลือก --</option></select>
            </div>
            <div class="form-group">
              <label>บัญชีที่จ่าย (Account Out)</label>
              <select id="m-acc-out"><option value="">-- เลือก --</option></select>
            </div>
            <div class="form-group">
              <label>บัญชีที่รับ (Account In)</label>
              <select id="m-acc-in"><option value="">-- เลือก --</option></select>
            </div>
            <div class="form-group">
              <label>ลูกค้า / คู่ค้า</label>
              <select id="m-customer"><option value="">-- เลือก / พิมพ์ --</option></select>
            </div>
            <div class="form-group">
              <label>ยอดรวม (Gross Amount) *</label>
              <input type="number" id="m-gross" step="0.01" placeholder="0.00" oninput="calcWHT('m')">
            </div>
            <div class="form-group">
              <label>ค่าธรรมเนียม (Fee)</label>
              <input type="number" id="m-fee" step="0.01" placeholder="0.00" oninput="calcWHT('m')">
            </div>
            <div class="form-group">
              <label>อัตรา WHT (%)</label>
              <select id="m-wht" onchange="calcWHT('m')">
                <option value="0">0% (ไม่มี WHT)</option>
                <option value="1">1%</option>
                <option value="3" selected>3% (ค่าบริการ)</option>
                <option value="5">5%</option>
                <option value="15">15% (ดอกเบี้ย/เงินปันผล)</option>
              </select>
            </div>
            <div class="form-group">
              <label>ทริป (Trip Tag)</label>
              <select id="m-trip"><option value="">-- ไม่ระบุ --</option></select>
            </div>
            <div class="form-group full">
              <label>รายละเอียด / Note</label>
              <textarea id="m-detail" rows="2" placeholder="รายละเอียดเพิ่มเติม..."></textarea>
            </div>
          </div>
          <div class="calc-box" id="m-calc">
            <div class="calc-row"><span>Gross Amount</span><span id="m-c-gross">฿0.00</span></div>
            <div class="calc-row"><span>- Fee</span><span id="m-c-fee">฿0.00</span></div>
            <div class="calc-row"><span>- WHT</span><span id="m-c-wht">฿0.00</span></div>
            <div class="calc-row calc-total"><span>💵 Net Amount</span><span id="m-c-net">฿0.00</span></div>
          </div>
          <div style="margin-top:16px;display:flex;gap:8px">
            <button class="btn btn-success" onclick="submitManual()">✅ บันทึก</button>
            <button class="btn btn-gray" onclick="resetManual()">🔄 Clear</button>
          </div>
        </div>
      </div>

      <!-- ── Import CSV ── -->
      <div id="page-import" class="page">
        <div class="section-card" style="max-width:680px">
          <h3>📤 Import Statement CSV</h3>
          <div class="form-grid" style="margin-bottom:16px">
            <div class="form-group">
              <label>ธนาคาร *</label>
              <select id="imp-bank">
                <option value="kbank">KBank (กสิกรไทย)</option>
                <option value="scb">SCB (ไทยพาณิชย์)</option>
                <option value="ktb">KTB (กรุงไทย)</option>
                <option value="krungsri">Krungsri (กรุงศรี)</option>
                <option value="bbl">BBL (กรุงเทพ)</option>
                <option value="cc">Credit Card</option>
              </select>
            </div>
            <div class="form-group">
              <label>บัญชีหลัก (Default Account)</label>
              <select id="imp-account"><option value="">-- เลือก --</option></select>
            </div>
          </div>
          <div class="upload-area" id="upload-area" onclick="document.getElementById('imp-file').click()"
               ondragover="event.preventDefault();this.classList.add('drag')"
               ondragleave="this.classList.remove('drag')"
               ondrop="handleDrop(event)">
            <input type="file" id="imp-file" accept=".csv,.txt" onchange="handleFileSelect(event)">
            <div class="icon">📂</div>
            <p>คลิกเพื่อเลือกไฟล์ หรือ <strong>ลากวาง</strong> ที่นี่</p>
            <p style="font-size:12px;margin-top:4px">รองรับ .csv และ .txt</p>
          </div>
          <div id="imp-preview" style="display:none;margin-top:14px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <strong id="imp-filename" style="color:var(--navy)"></strong>
              <button class="btn btn-success" onclick="doImport()">🚀 Import</button>
            </div>
            <div class="table-wrap" style="max-height:280px;overflow-y:auto">
              <table>
                <thead><tr id="imp-head"></tr></thead>
                <tbody id="imp-body"></tbody>
              </table>
            </div>
          </div>
          <div id="imp-result" style="display:none;margin-top:14px"></div>
        </div>
      </div>

    </div><!-- /content -->
  </div><!-- /main -->
</div><!-- /app -->

<!-- Classify Modal -->
<div class="modal-overlay" id="modal-overlay">
  <div class="modal">
    <div class="modal-header">
      <h3>🏷️ Classify รายการ</h3>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="info-box" id="modal-info"></div>
      <div class="form-grid">
        <div class="form-group">
          <label>เจ้าของ (Head Owner)</label>
          <select id="cl-owner"><option value="">-- เลือก --</option></select>
        </div>
        <div class="form-group">
          <label>ประเภทรายการ</label>
          <select id="cl-group" onchange="onGroupChange('cl')">
            <option value="">-- เลือก --</option>
            <option value="Expense">Expense</option>
            <option value="Income">Income</option>
            <option value="Transfer">Transfer</option>
            <option value="AR">AR (ลูกหนี้)</option>
            <option value="AP">AP (เจ้าหนี้)</option>
          </select>
        </div>
        <div class="form-group">
          <label>หมวดหมู่</label>
          <select id="cl-cat" onchange="onCatChange('cl')"><option value="">-- เลือก --</option></select>
        </div>
        <div class="form-group">
          <label>หมวดย่อย</label>
          <select id="cl-subcat"><option value="">-- เลือก --</option></select>
        </div>
        <div class="form-group">
          <label>บัญชีที่จ่าย (Out)</label>
          <select id="cl-acc-out"><option value="">-- เลือก --</option></select>
        </div>
        <div class="form-group">
          <label>บัญชีที่รับ (In)</label>
          <select id="cl-acc-in"><option value="">-- เลือก --</option></select>
        </div>
        <div class="form-group">
          <label>ลูกค้า / คู่ค้า</label>
          <select id="cl-customer"><option value="">-- เลือก --</option></select>
        </div>
        <div class="form-group">
          <label>อัตรา WHT (%)</label>
          <select id="cl-wht" onchange="calcWHT('cl')">
            <option value="0">0%</option>
            <option value="1">1%</option>
            <option value="3" selected>3%</option>
            <option value="5">5%</option>
            <option value="15">15%</option>
          </select>
        </div>
        <div class="form-group">
          <label>ทริป (Trip Tag)</label>
          <select id="cl-trip"><option value="">-- ไม่ระบุ --</option></select>
        </div>
        <div class="form-group full">
          <label>รายละเอียด / Note</label>
          <input type="text" id="cl-detail" placeholder="แก้ไข note ได้">
        </div>
      </div>
      <div class="calc-box" id="cl-calc" style="margin-top:10px">
        <div class="calc-row"><span>Gross</span><span id="cl-c-gross">฿0</span></div>
        <div class="calc-row"><span>- WHT</span><span id="cl-c-wht">฿0</span></div>
        <div class="calc-row calc-total"><span>💵 Net</span><span id="cl-c-net">฿0</span></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-gray" onclick="skipItem()">⏭ Skip</button>
      <button class="btn btn-success" onclick="confirmClassify()" id="btn-confirm">✅ Confirm</button>
    </div>
  </div>
</div>

<div id="toast"></div>

<script>
// ══════════════════════════════════════════════════════════════
// State
// ══════════════════════════════════════════════════════════════
var state = {
  dropdowns  : { headOwners:[], accounts:[], customers:[], trips:[], categories:{}, subCategories:{} },
  staging    : [],
  currentId  : null,
  currentGross: 0,
  csvContent  : null,
};

// ══════════════════════════════════════════════════════════════
// Init
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function(){
  document.getElementById('m-date').value = new Date().toISOString().split('T')[0];
  loadAll();
});

function loadAll() {
  google.script.run
    .withSuccessHandler(function(data){
      state.dropdowns = data.dropdowns;
      state.staging   = data.staging || [];
      renderStats(data.stats);
      populateAllDropdowns();
      renderStaging();
      loadConfirmed();
    })
    .withFailureHandler(function(e){ toast('โหลดข้อมูลล้มเหลว: '+e.message,'error'); })
    .api_getPageData();
}

function refreshAll() { loadAll(); toast('🔄 Refreshed','info'); }

// ══════════════════════════════════════════════════════════════
// Navigation
// ══════════════════════════════════════════════════════════════
var pages = { dashboard:'Dashboard', staging:'Staging Inbox', confirmed:'Confirmed',
              manual:'Manual Entry', import:'Import CSV' };

function showPage(id) {
  document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(function(n){ n.classList.remove('active'); });
  document.getElementById('page-'+id).classList.add('active');
  document.querySelector('[onclick="showPage(\''+id+'\')"]').classList.add('active');
  document.getElementById('page-title').textContent = pages[id]||id;
  if (id==='confirmed') loadConfirmed();
}

// ══════════════════════════════════════════════════════════════
// Stats
// ══════════════════════════════════════════════════════════════
function renderStats(s) {
  if (!s) return;
  document.getElementById('badge-pending').textContent = s.pending||0;
  document.getElementById('stats-grid').innerHTML =
    card('blue','📥','Pending',s.pending||0,'รอ Review') +
    card('orange','🔄','Transfer',s.unmatched||0,'รอจับคู่') +
    card('red','🚩','NeedReview',s.needReview||0,'ต้องตรวจ') +
    card('green','✅','Confirmed',s.confirmed||0,'รายการ') +
    card('green','💰','รายรับ '+(s.month||''),'฿'+(s.totalIn||0).toLocaleString(),'เดือนนี้') +
    card('red','💸','รายจ่าย '+(s.month||''),'฿'+(s.totalOut||0).toLocaleString(),'เดือนนี้');
}
function card(color,icon,label,value,sub){
  return '<div class="stat-card '+color+'"><div class="stat-value">'+value+'</div>'+
    '<div class="stat-label">'+icon+' '+label+'</div>'+
    (sub?'<div class="stat-label" style="font-size:11px;margin-top:2px">'+sub+'</div>':'')+
    '</div>';
}

// ══════════════════════════════════════════════════════════════
// Dropdowns
// ══════════════════════════════════════════════════════════════
function populateAllDropdowns() {
  var d = state.dropdowns;
  fillSelect('filter-owner', d.headOwners, true);
  ['m-owner','cl-owner'].forEach(function(id){ fillSelect(id, d.headOwners, true); });
  ['m-acc-out','m-acc-in','cl-acc-out','cl-acc-in','imp-account'].forEach(function(id){
    fillSelect(id, d.accounts, true);
  });
  ['m-customer','cl-customer'].forEach(function(id){ fillSelect(id, d.customers, true); });
  ['m-trip','cl-trip'].forEach(function(id){ fillSelect(id, d.trips, true); });
}

function fillSelect(id, arr, blank) {
  var el = document.getElementById(id); if(!el) return;
  var val = el.value;
  el.innerHTML = blank ? '<option value="">-- เลือก --</option>' : '';
  (arr||[]).forEach(function(v){ el.innerHTML+='<option value="'+v+'">'+v+'</option>'; });
  if(val) el.value = val;
}

function onGroupChange(prefix) {
  var gd = document.getElementById(prefix+'-group').value;
  var cats = (state.dropdowns.categories||{})[gd] || [];
  fillSelect(prefix+'-cat', cats, true);
  fillSelect(prefix+'-subcat', [], true);
}

function onCatChange(prefix) {
  var cat = document.getElementById(prefix+'-cat').value;
  var subs = (state.dropdowns.subCategories||{})[cat] || [];
  fillSelect(prefix+'-subcat', subs, true);
}

// ══════════════════════════════════════════════════════════════
// Staging table
// ══════════════════════════════════════════════════════════════
function renderStaging() {
  var items = filterItems();
  document.getElementById('staging-count').textContent = items.length + ' รายการ';
  var tbody = document.getElementById('staging-body');
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="10"><div class="empty-state"><div class="emoji">📭</div><p>ไม่มีรายการ</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = items.map(function(it){
    var amt  = it.grossAmount || 0;
    var cls  = it.groupDetail==='Income' ? 'in' : 'out';
    var sign = it.groupDetail==='Income' ? '+' : '-';
    var badge = getBadge(it.status);
    var acc  = it.accountOut || it.accountIn || '-';
    return '<tr>'+
      '<td style="font-family:monospace;font-size:12px;color:#718096">'+it.transId+'</td>'+
      '<td>'+it.date+'</td>'+
      '<td>'+(it.headOwner||'<span style="color:#CBD5E0">-</span>')+'</td>'+
      '<td>'+(it.accountOut||'<span style="color:#CBD5E0">-</span>')+'</td>'+
      '<td>'+(it.accountIn||'<span style="color:#CBD5E0">-</span>')+'</td>'+
      '<td style="max-width:180px" title="'+(it.detail||'')+'">'+(it.detail||'<span style="color:#CBD5E0">-</span>')+'</td>'+
      '<td class="amount '+cls+'">'+sign+'฿'+Number(amt).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})+'</td>'+
      '<td>'+badge+'</td>'+
      '<td><span class="source-chip">'+(it.source||'-')+'</span></td>'+
      '<td><button class="btn btn-primary btn-sm" onclick="openClassify(\''+it.transId+'\')">Classify</button></td>'+
    '</tr>';
  }).join('');
}

function filterItems() {
  var status = document.getElementById('filter-status').value;
  var owner  = document.getElementById('filter-owner').value;
  var search = (document.getElementById('filter-search').value||'').toLowerCase();
  return state.staging.filter(function(it){
    if (status && it.status !== status) return false;
    if (owner  && it.headOwner !== owner) return false;
    if (search && !(
      (it.detail||'').toLowerCase().includes(search) ||
      (it.transId||'').toLowerCase().includes(search) ||
      (it.accountOut||'').toLowerCase().includes(search) ||
      (it.accountIn||'').toLowerCase().includes(search)
    )) return false;
    return true;
  });
}

function filterStaging() { renderStaging(); }

function getBadge(status) {
  var map = {
    'Pending':'badge-pending','Transfer_Unmatched':'badge-transfer',
    'Transfer_Matched':'badge-matched','NeedReview':'badge-review',
    'Done':'badge-done',
  };
  var cls = map[status] || (status&&status.startsWith('Duplicate')?'badge-dup':'badge-pending');
  return '<span class="badge '+cls+'">'+status+'</span>';
}

// ══════════════════════════════════════════════════════════════
// Classify Modal
// ══════════════════════════════════════════════════════════════
function openClassify(transId) {
  var item = state.staging.find(function(it){ return it.transId===transId; });
  if (!item) return;
  state.currentId    = transId;
  state.currentGross = item.grossAmount || 0;

  // Fill info box
  document.getElementById('modal-info').innerHTML =
    '<div class="info-row"><span class="info-label">Trans ID</span><span class="info-value" style="font-family:monospace">'+item.transId+'</span></div>'+
    '<div class="info-row"><span class="info-label">วันที่</span><span class="info-value">'+item.date+'</span></div>'+
    '<div class="info-row"><span class="info-label">บัญชี Out</span><span class="info-value">'+(item.accountOut||'-')+'</span></div>'+
    '<div class="info-row"><span class="info-label">บัญชี In</span><span class="info-value">'+(item.accountIn||'-')+'</span></div>'+
    '<div class="info-row"><span class="info-label">Note</span><span class="info-value">'+(item.detail||'-')+'</span></div>'+
    '<div class="info-row"><span class="info-label">จำนวน</span><span class="info-value amount">฿'+Number(item.grossAmount||0).toLocaleString(undefined,{minimumFractionDigits:2})+'</span></div>';

  // Pre-fill fields
  setVal('cl-owner',   item.headOwner);
  setVal('cl-group',   item.groupDetail);
  setVal('cl-detail',  item.detail);
  setVal('cl-acc-out', item.accountOut);
  setVal('cl-acc-in',  item.accountIn);
  setVal('cl-customer',item.customer);
  setVal('cl-wht',     item.whtRate||'3');
  setVal('cl-trip',    item.tripTag);
  onGroupChange('cl');
  setVal('cl-cat', item.category);
  onCatChange('cl');
  setVal('cl-subcat', item.subCategory);
  calcWHT('cl');

  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  state.currentId = null;
}

function setVal(id, val) {
  var el = document.getElementById(id);
  if (el && val !== undefined && val !== null) el.value = val;
}

function confirmClassify() {
  if (!state.currentId) return;
  var data = {
    headOwner  : document.getElementById('cl-owner').value,
    groupDetail: document.getElementById('cl-group').value,
    category   : document.getElementById('cl-cat').value,
    subCategory: document.getElementById('cl-subcat').value,
    accountOut : document.getElementById('cl-acc-out').value,
    accountIn  : document.getElementById('cl-acc-in').value,
    customer   : document.getElementById('cl-customer').value,
    whtRate    : parseFloat(document.getElementById('cl-wht').value)||0,
    tripTag    : document.getElementById('cl-trip').value,
    detail     : document.getElementById('cl-detail').value,
  };
  document.getElementById('btn-confirm').disabled = true;
  document.getElementById('btn-confirm').textContent = '⏳ กำลังบันทึก...';

  google.script.run
    .withSuccessHandler(function(res){
      closeModal();
      document.getElementById('btn-confirm').disabled = false;
      document.getElementById('btn-confirm').textContent = '✅ Confirm';
      if (res.success) {
        toast('✅ Confirmed: '+state.currentId,'success');
        state.staging = state.staging.filter(function(it){ return it.transId !== state.currentId; });
        renderStaging();
        refreshStats();
      } else { toast('❌ Error: '+res.error,'error'); }
    })
    .withFailureHandler(function(e){
      document.getElementById('btn-confirm').disabled = false;
      document.getElementById('btn-confirm').textContent = '✅ Confirm';
      toast('❌ Error: '+e.message,'error');
    })
    .api_classify(state.currentId, data);
}

function skipItem() {
  if (!state.currentId) return;
  google.script.run
    .withSuccessHandler(function(){ closeModal(); toast('⏭ Skipped','info'); loadAll(); })
    .api_skipItem(state.currentId);
}

// ══════════════════════════════════════════════════════════════
// WHT Calculator
// ══════════════════════════════════════════════════════════════
function calcWHT(prefix) {
  var gross = prefix==='cl' ? state.currentGross :
              parseFloat(document.getElementById('m-gross').value)||0;
  var fee   = prefix==='cl' ? 0 :
              parseFloat(document.getElementById('m-fee').value)||0;
  var rate  = parseFloat(document.getElementById(prefix+'-wht').value)||0;
  var wht   = Math.round(gross * rate) / 100;
  var net   = gross - fee - wht;
  var fmt   = function(n){ return '฿'+n.toLocaleString(undefined,{minimumFractionDigits:2}); };
  document.getElementById(prefix+'-c-gross').textContent = fmt(gross);
  if (prefix==='m') document.getElementById('m-c-fee').textContent = fmt(fee);
  document.getElementById(prefix+'-c-wht').textContent  = fmt(wht);
  document.getElementById(prefix+'-c-net').textContent  = fmt(net);
}

// ══════════════════════════════════════════════════════════════
// Manual Entry
// ══════════════════════════════════════════════════════════════
function submitManual() {
  var gross = parseFloat(document.getElementById('m-gross').value)||0;
  var fee   = parseFloat(document.getElementById('m-fee').value)||0;
  var rate  = parseFloat(document.getElementById('m-wht').value)||0;
  var wht   = Math.round(gross * rate) / 100;
  if (!gross) { toast('กรุณาใส่ยอดเงิน','error'); return; }
  if (!document.getElementById('m-group').value) { toast('กรุณาเลือกประเภทรายการ','error'); return; }

  var data = {
    date       : document.getElementById('m-date').value,
    headOwner  : document.getElementById('m-owner').value,
    groupDetail: document.getElementById('m-group').value,
    category   : document.getElementById('m-cat').value,
    subCategory: document.getElementById('m-subcat').value,
    accountOut : document.getElementById('m-acc-out').value,
    accountIn  : document.getElementById('m-acc-in').value,
    customer   : document.getElementById('m-customer').value,
    tripTag    : document.getElementById('m-trip').value,
    detail     : document.getElementById('m-detail').value,
    grossAmount: gross, fee: fee, whtRate: rate, whtAmount: wht,
    netAmount  : gross-fee-wht, source: 'manual',
  };

  google.script.run
    .withSuccessHandler(function(res){
      if (res.success) {
        toast('✅ บันทึกแล้ว: '+res.transId,'success');
        resetManual();
        google.script.run.withSuccessHandler(function(items){
          state.staging = items;
          document.getElementById('badge-pending').textContent =
            items.filter(function(i){ return i.status==='Pending'; }).length;
        }).api_getStagingItems({});
      } else { toast('❌ Error: '+res.error,'error'); }
    })
    .api_addManual(data);
}

function resetManual() {
  ['m-owner','m-group','m-cat','m-subcat','m-acc-out','m-acc-in',
   'm-customer','m-trip','m-wht'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.value='';
  });
  ['m-gross','m-fee','m-detail'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.value='';
  });
  document.getElementById('m-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('m-wht').value = '3';
  calcWHT('m');
}

// ══════════════════════════════════════════════════════════════
// Confirmed table
// ══════════════════════════════════════════════════════════════
function loadConfirmed() {
  google.script.run
    .withSuccessHandler(function(items){
      var tbody = document.getElementById('confirmed-body');
      if (!items.length) {
        tbody.innerHTML='<tr><td colspan="9" class="empty-state"><div class="emoji">📭</div><p>ยังไม่มีรายการ</p></td></tr>';
        return;
      }
      tbody.innerHTML = items.map(function(it){
        var cls = it.groupDetail==='Income'?'in':'out';
        var sign= it.groupDetail==='Income'?'+':'-';
        return '<tr>'+
          '<td style="font-family:monospace;font-size:11px;color:#718096">'+it.transId+'</td>'+
          '<td>'+it.date+'</td>'+
          '<td>'+(it.headOwner||'-')+'</td>'+
          '<td style="font-size:12px">'+(it.accountOut||it.accountIn||'-')+'</td>'+
          '<td>'+(it.customer||'-')+'</td>'+
          '<td>'+(it.category||'-')+'</td>'+
          '<td style="max-width:180px" title="'+(it.detail||'')+'">'+(it.detail||'-')+'</td>'+
          '<td class="amount '+cls+'">'+sign+'฿'+Number(it.netAmount||0).toLocaleString(undefined,{minimumFractionDigits:2})+'</td>'+
          '<td>'+getBadge(it.groupDetail)+'</td>'+
        '</tr>';
      }).join('');
    })
    .api_getConfirmed(100);
}

// ══════════════════════════════════════════════════════════════
// CSV Import
// ══════════════════════════════════════════════════════════════
function handleFileSelect(e) { loadCSV(e.target.files[0]); }
function handleDrop(e) { e.preventDefault(); document.getElementById('upload-area').classList.remove('drag'); loadCSV(e.dataTransfer.files[0]); }

function loadCSV(file) {
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    state.csvContent = e.target.result;
    previewCSV(file.name, state.csvContent);
  };
  reader.readAsText(file,'utf-8');
}

function previewCSV(name, content) {
  var lines = content.split('\n').slice(0,6);
  document.getElementById('imp-filename').textContent = '📄 '+name;
  var firstRow = lines[0] ? lines[0].split(',') : [];
  document.getElementById('imp-head').innerHTML = firstRow.map(function(h){ return '<th>'+h.replace(/"/g,'')+'</th>'; }).join('');
  document.getElementById('imp-body').innerHTML = lines.slice(1,6).map(function(l){
    return '<tr>'+l.split(',').map(function(c){ return '<td>'+c.replace(/"/g,'')+'</td>'; }).join('')+'</tr>';
  }).join('');
  document.getElementById('imp-preview').style.display='block';
  document.getElementById('imp-result').style.display='none';
}

function doImport() {
  if (!state.csvContent) { toast('กรุณาเลือกไฟล์ก่อน','error'); return; }
  var bank    = document.getElementById('imp-bank').value;
  var account = document.getElementById('imp-account').value;
  toast('⏳ กำลัง import...','info');
  google.script.run
    .withSuccessHandler(function(res){
      var div = document.getElementById('imp-result');
      div.style.display='block';
      if (res.success) {
        div.innerHTML='<div style="background:#E8F5E9;border:1px solid #A5D6A7;border-radius:8px;padding:14px">'+
          '<strong style="color:#2E7D32">✅ Import สำเร็จ!</strong><br>'+
          'เพิ่ม: <strong>'+res.added+'</strong> รายการ | ข้าม: '+res.skipped+' รายการ | ทั้งหมด: '+res.total+' รายการ'+
          '</div>';
        toast('✅ Import '+res.added+' รายการ','success');
        loadAll();
      } else {
        div.innerHTML='<div style="background:#FFEBEE;border:1px solid #EF9A9A;border-radius:8px;padding:14px">'+
          '<strong style="color:#C62828">❌ Error:</strong> '+res.error+'</div>';
        toast('❌ Import failed','error');
      }
    })
    .withFailureHandler(function(e){ toast('❌ Error: '+e.message,'error'); })
    .api_importCSV(state.csvContent, bank, account);
}

// ══════════════════════════════════════════════════════════════
// Stats refresh
// ══════════════════════════════════════════════════════════════
function refreshStats() {
  google.script.run
    .withSuccessHandler(renderStats)
    .api_getStats();
}

// ══════════════════════════════════════════════════════════════
// Toast notifications
// ══════════════════════════════════════════════════════════════
function toast(msg, type) {
  var c = document.getElementById('toast');
  var d = document.createElement('div');
  d.className='toast '+(type||'');
  d.textContent=msg;
  c.appendChild(d);
  setTimeout(function(){ if(d.parentNode) d.parentNode.removeChild(d); }, 3500);
}
</script>
</body>
</html>'''

with open(os.path.join(BASE, 'WebApp.html'), 'w', encoding='utf-8') as f:
    f.write(html)
print(f'✓ WebApp.html ({len(html):,} chars)')
