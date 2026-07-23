const API_BASE = "https://record-revenue.9nimz.workers.dev";
async function run() {
    const res = await fetch(`${API_BASE}/api/transactions?status=CONFIRMED`, { headers: { 'x-user-id': 'Usr_A' } });
    const txs = await res.json();
    let found = txs.find(t => t.transaction_id === 'TX-1783437167766');
    console.log("Found TX?", !!found);
    if(found) console.log(JSON.stringify(found.details, null, 2));
}
run();
