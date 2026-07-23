app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

app = app.replace("const columns = 4;", "const columns = 6;")
app = app.replace("object-fit: cover; transform: scale(1.05);", "object-fit: contain;")

with open(app_js_path, 'w') as f:
    f.write(app)
print("Fixed columns and object fit!")
