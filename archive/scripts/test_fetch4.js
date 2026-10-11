const API_BASE = "https://record-revenue.9nimz.workers.dev";
async function run() {
    const res = await fetch(`${API_BASE}/api/transactions?status=CONFIRMED`, { headers: { 'x-user-id': encodeURIComponent('์Admin') } });
    const transactions = await res.json();
    const debt = {
        contact_id: "W03",
        principal_category_id: "Expense"
    };

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
            txs.push({
                date: tx.date,
                statement_desc: tx.account_name || '-',
                principal: principal,
                interest: interest
            });
        }
    });
    console.log(txs);
}
run();
