html_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/index.html"
with open(html_path, 'r') as f:
    html = f.read()

import re
html = re.sub(r'style\.css\?v=\d+', 'style.css?v=1783505510', html)
html = re.sub(r'app\.js\?v=\d+', 'app.js?v=1783505510', html)

with open(html_path, 'w') as f:
    f.write(html)
print("Updated versions!")
