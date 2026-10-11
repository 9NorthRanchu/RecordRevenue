import re

html_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"

with open(html_path, 'r') as f:
    content = f.read()

# Let's just find where `saveDraftHistory` logic came from.
match = re.search(r'function saveDraftHistory[\s\S]{0,1000}', content)
if match:
    print(match.group(0))
