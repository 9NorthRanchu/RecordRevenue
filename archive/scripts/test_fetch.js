const API_BASE = "https://record-revenue.9nimz.workers.dev";
async function run() {
    const res = await fetch(`${API_BASE}/api/transactions?status=CONFIRMED`, { headers: { 'x-user-id': 'Usr_A' } });
    const txs = await res.json();
    let found = 0;
    txs.forEach(tx => {
        if(tx.details) {
            tx.details.forEach(det => {
                if (det.contact_id === 'W03') {
                    console.log("Found detail! cat:", det.category_id, "amt:", det.amount);
                    found++;
                }
            });
        }
    });
    console.log("Total found for W03:", found);
}
run();
