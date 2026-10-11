import re

app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

old_icon_grid = """        <div onclick="selectIcon('${icon}')" style="cursor:pointer; border-radius: 8px; padding: 2px; border: 2px solid ${selectedIcon === icon ? '#3b82f6' : 'transparent'}; text-align: center; transition: all 0.2s;">
            <img src="/assets/icons/${icon}" style="width: 100%; height: auto; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        </div>"""
new_icon_grid = """        <div onclick="selectIcon('${icon}')" style="cursor:pointer; border-radius: 8px; padding: 2px; border: 2px solid ${selectedIcon === icon ? '#3b82f6' : 'transparent'}; text-align: center; transition: all 0.2s;">
            <div style="width: 100%; padding-top: 100%; position: relative; border-radius: 6px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <img src="/assets/icons/${icon}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; transform: scale(1.15);">
            </div>
        </div>"""
app = app.replace(old_icon_grid, new_icon_grid)

with open(app_js_path, 'w') as f:
    f.write(app)
print("Patched icon grid")
