import re

app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

# 1. Fix getDebtTransactions logic for stmt
# Old: let stmt = detailNote || tx.statement_desc || '';
# New: let stmt = tx.statement_desc || '';
app = app.replace("let stmt = detailNote || tx.statement_desc || '';", "let stmt = tx.statement_desc || '';")
app = app.replace("if (stmt === 'นำเข้าข้อมูลด่วน' || stmt === 'Imported Transaction') stmt = detailNote || '-';", "if (stmt === 'นำเข้าข้อมูลด่วน' || stmt === 'Imported Transaction') stmt = '-';")

# 2. Fix table styling in viewDebtDetails
# Remove font-weight: bold from Amount column data
app = app.replace('<td style="padding: 8px 12px; border-bottom: 1px dashed rgba(162, 210, 255, 0.4); font-weight: bold;">${formatCurrency((t.principal||0) + (t.interest||0))}</td>', '<td style="padding: 8px 12px; border-bottom: 1px dashed rgba(162, 210, 255, 0.4); text-align: right;">${formatCurrency((t.principal||0) + (t.interest||0))}</td>')

# Right align Principal and Interest
app = app.replace('<td style="padding: 8px 12px; border-bottom: 1px dashed rgba(162, 210, 255, 0.4); color: #2c3e50;">${formatCurrency(t.principal || 0)}</td>', '<td style="padding: 8px 12px; border-bottom: 1px dashed rgba(162, 210, 255, 0.4); color: #2c3e50; text-align: right;">${formatCurrency(t.principal || 0)}</td>')
app = app.replace('<td style="padding: 8px 12px; border-bottom: 1px dashed rgba(162, 210, 255, 0.4); color: #d35400;">${formatCurrency(t.interest || 0)}</td>', '<td style="padding: 8px 12px; border-bottom: 1px dashed rgba(162, 210, 255, 0.4); color: #d35400; text-align: right;">${formatCurrency(t.interest || 0)}</td>')

# Center align Status
app = app.replace('<td style="padding: 8px 12px; border-bottom: 1px dashed rgba(162, 210, 255, 0.4); color: #27ae60;"><i class="fa-solid fa-circle-check"></i></td>', '<td style="padding: 8px 12px; border-bottom: 1px dashed rgba(162, 210, 255, 0.4); color: #27ae60; text-align: center;"><i class="fa-solid fa-circle-check"></i></td>')

# Also right align headers, center Status header, and balance widths
old_thead = """<tr style="background: rgba(162, 210, 255, 0.2); color: #3d5a80; text-align: left;">
                            <th style="padding: 10px 12px;">Date</th>
                            <th style="padding: 10px 12px;">Statement</th>
                            <th style="padding: 10px 12px;">Amount</th>
                            <th style="padding: 10px 12px;">Principal</th>
                            <th style="padding: 10px 12px;">Interest</th>
                            <th style="padding: 10px 12px;">Status</th>
                        </tr>"""

new_thead = """<tr style="background: rgba(162, 210, 255, 0.2); color: #3d5a80; text-align: left;">
                            <th style="padding: 10px 12px; width: 15%;">Date</th>
                            <th style="padding: 10px 12px; width: 30%;">Statement</th>
                            <th style="padding: 10px 12px; width: 15%; text-align: right;">Amount</th>
                            <th style="padding: 10px 12px; width: 15%; text-align: right;">Principal</th>
                            <th style="padding: 10px 12px; width: 15%; text-align: right;">Interest</th>
                            <th style="padding: 10px 12px; width: 10%; text-align: center;">Status</th>
                        </tr>"""

app = app.replace(old_thead, new_thead)

with open(app_js_path, 'w') as f:
    f.write(app)

print("App JS Fixed Statement and Table Styling.")
