import re
with open('/Users/DNorth/.gemini/antigravity/brain/c9d0ffa8-00c4-4a6f-9000-a486ecdcca8e/task.md', 'r') as f:
    text = f.read()

text = text.replace('- [ ] 1. Backend: Update Database Schema (add `debts` table)', '- [x] 1. Backend: Update Database Schema (add `debts` table)')
text = text.replace('- [ ] 2. Backend: Add API endpoints for Debts (GET, POST, DELETE)', '- [x] 2. Backend: Add API endpoints for Debts (GET, POST, DELETE)')
text = text.replace('- [ ] 3. Frontend: Add "Debts" menu to Sidebar', '- [/] 3. Frontend: Add "Debts" menu to Sidebar')
text = text.replace('- [ ] 4. Frontend: Create Debt Dashboard View (Progress Bars, Totals)', '- [/] 4. Frontend: Create Debt Dashboard View (Progress Bars, Totals)')

with open('/Users/DNorth/.gemini/antigravity/brain/c9d0ffa8-00c4-4a6f-9000-a486ecdcca8e/task.md', 'w') as f:
    f.write(text)
