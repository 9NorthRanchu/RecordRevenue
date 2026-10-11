const API_BASE = "https://record-revenue.9nimz.workers.dev";
async function run() {
    const r1 = await fetch(`${API_BASE}/api/transactions?status=CONFIRMED`, { headers: { 'x-user-id': encodeURIComponent('์Admin') } });
    const transactions = await r1.json();
    
    const r2 = await fetch(`${API_BASE}/api/debts`, { headers: { 'x-user-id': encodeURIComponent('์Admin') } });
    const debts = await r2.json();

    let totalTxs = 0;
    debts.forEach(debt => {
        let txs = [];
        transactions.forEach(tx => {
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
                txs.push({ date: tx.date, principal, interest });
            }
        });
        if (txs.length > 0) {
            console.log(`Debt ${debt.name} (Contact: ${debt.contact_id}) has ${txs.length} transactions`);
            totalTxs += txs.length;
        } else {
            console.log(`Debt ${debt.name} (Contact: ${debt.contact_id}) has 0 transactions`);
        }
    });
    console.log("Total matched transactions across all debts:", totalTxs);
}
run();
