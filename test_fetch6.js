const API_BASE = "https://record-revenue.9nimz.workers.dev";
async function run() {
    const r2 = await fetch(`${API_BASE}/api/debts`, { headers: { 'x-user-id': encodeURIComponent('์Admin') } });
    const debts = await r2.json();
    console.log(JSON.stringify(debts, null, 2));
}
run();
