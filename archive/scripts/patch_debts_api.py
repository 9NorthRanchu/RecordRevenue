import re

file_path = "backend/src/index.js"
with open(file_path, 'r') as f:
    content = f.read()

# I will replace the debts api I just injected with a better one.
old_debts_api = """      if (url.pathname === '/api/debts' && request.method === 'GET') {
        const debts = await env.DB.prepare('SELECT * FROM Debts ORDER BY name').all();
        return new Response(JSON.stringify(debts.results), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (url.pathname === '/api/debts' && request.method === 'POST') {
        const data = await request.json();
        if (data.debt_id) {
          await env.DB.prepare(`
            UPDATE Debts SET name=?, type=?, contact_id=?, principal_category_id=?, interest_category_id=?, start_balance=?, installment_amount=?, start_date=?
            WHERE debt_id=?
          `).bind(data.name, data.type, data.contact_id, data.principal_category_id, data.interest_category_id || null, data.start_balance, data.installment_amount || null, data.start_date || null, data.debt_id).run();
        } else {
          const debt_id = 'DBT' + Date.now();
          // Fallback family_id from user logic or settings, for now assume 'FAM001' or grab from another table
          await env.DB.prepare(`
            INSERT INTO Debts (debt_id, family_id, name, type, contact_id, principal_category_id, interest_category_id, start_balance, installment_amount, start_date)
            VALUES (?, 'FAM001', ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(debt_id, data.name, data.type, data.contact_id, data.principal_category_id, data.interest_category_id || null, data.start_balance, data.installment_amount || null, data.start_date || null).run();
        }
        return new Response(JSON.stringify({success:true}), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (url.pathname === '/api/debts/delete' && request.method === 'POST') {
        const data = await request.json();
        await env.DB.prepare('DELETE FROM Debts WHERE debt_id=?').bind(data.debt_id).run();
        return new Response(JSON.stringify({success:true}), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }"""

new_debts_api = """      if (url.pathname === '/api/debts' && request.method === 'GET') {
        const userId = request.headers.get('Authorization');
        const userCheck = await env.DB.prepare(`SELECT role, family_id FROM Users WHERE user_id = ?`).bind(userId).first();
        if (!userCheck) return new Response('Unauthorized', { status: 401, headers: corsHeaders });
        const debts = await env.DB.prepare('SELECT * FROM Debts WHERE family_id = ? ORDER BY name').bind(userCheck.family_id).all();
        return new Response(JSON.stringify(debts.results), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (url.pathname === '/api/debts' && request.method === 'POST') {
        const userId = request.headers.get('Authorization');
        const userCheck = await env.DB.prepare(`SELECT role, family_id FROM Users WHERE user_id = ?`).bind(userId).first();
        if (!userCheck) return new Response('Unauthorized', { status: 401, headers: corsHeaders });
        const data = await request.json();
        if (data.debt_id) {
          await env.DB.prepare(`
            UPDATE Debts SET name=?, type=?, contact_id=?, principal_category_id=?, interest_category_id=?, start_balance=?, installment_amount=?, start_date=?
            WHERE debt_id=? AND family_id=?
          `).bind(data.name, data.type, data.contact_id, data.principal_category_id, data.interest_category_id || null, data.start_balance, data.installment_amount || null, data.start_date || null, data.debt_id, userCheck.family_id).run();
        } else {
          const debt_id = 'DBT' + Date.now();
          await env.DB.prepare(`
            INSERT INTO Debts (debt_id, family_id, name, type, contact_id, principal_category_id, interest_category_id, start_balance, installment_amount, start_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(debt_id, userCheck.family_id, data.name, data.type, data.contact_id, data.principal_category_id, data.interest_category_id || null, data.start_balance, data.installment_amount || null, data.start_date || null).run();
        }
        return new Response(JSON.stringify({success:true}), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (url.pathname === '/api/debts/delete' && request.method === 'POST') {
        const userId = request.headers.get('Authorization');
        const userCheck = await env.DB.prepare(`SELECT role, family_id FROM Users WHERE user_id = ?`).bind(userId).first();
        if (!userCheck) return new Response('Unauthorized', { status: 401, headers: corsHeaders });
        const data = await request.json();
        await env.DB.prepare('DELETE FROM Debts WHERE debt_id=? AND family_id=?').bind(data.debt_id, userCheck.family_id).run();
        return new Response(JSON.stringify({success:true}), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }"""

if old_debts_api in content:
    content = content.replace(old_debts_api, new_debts_api)
    with open(file_path, 'w') as f:
        f.write(content)
    print("Repatched Debts API with Auth.")
else:
    print("Could not find old debts api block to replace.")
