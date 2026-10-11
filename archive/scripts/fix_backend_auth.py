import re

backend_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/backend/src/index.js"
with open(backend_path, 'r') as f:
    js = f.read()

# Replace Authorization with x-user-id for debts APIs
js = js.replace(
    "const userId = request.headers.get('Authorization');",
    "const userId = decodeURIComponent(request.headers.get('x-user-id') || '') || 'Usr_A';"
)

with open(backend_path, 'w') as f:
    f.write(js)
print("Auth fixed in backend")
