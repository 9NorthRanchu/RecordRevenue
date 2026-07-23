import re
import time

index_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/index.html"
with open(index_path, 'r') as f:
    html = f.read()

version = int(time.time())
html = re.sub(r'src="app\.js(\?v=\d+)?"', f'src="app.js?v={version}"', html)

with open(index_path, 'w') as f:
    f.write(html)

print("Index HTML cache busted.")
