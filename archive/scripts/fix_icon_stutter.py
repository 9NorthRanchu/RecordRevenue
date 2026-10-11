import re

app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

old_render = """        <div onclick="selectIcon('${icon}')" style="cursor:pointer; border-radius: 12px; padding: 4px; border: 2px solid ${selectedIcon === icon ? '#3b82f6' : 'transparent'}; text-align: center; transition: all 0.2s;">
            <img src="/assets/icons/${icon}" style="width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        </div>"""

new_render = """        <div onclick="selectIcon('${icon}')" style="cursor:pointer; border-radius: 12px; padding: 4px; border: 2px solid ${selectedIcon === icon ? '#3b82f6' : 'transparent'}; text-align: center; transition: all 0.2s; aspect-ratio: 1 / 1; display: flex; align-items: center; justify-content: center;">
            <img src="/assets/icons/${icon}" style="width: 100%; height: 100%; object-fit: contain; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        </div>"""

app = app.replace(old_render, new_render)

with open(app_js_path, 'w') as f:
    f.write(app)
print("app.js updated")

style_css_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/style.css"
with open(style_css_path, 'r') as f:
    style = f.read()

old_icon_grid = """.icon-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 6px;
    outline: none;
    padding-right: 2px;
    max-height: 140px;
    overflow-y: auto;
}"""

new_icon_grid = """.icon-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 6px;
    outline: none;
    padding-right: 2px;
    height: 110px; /* Fixed height to prevent layout shift */
    overflow-y: auto;
    align-content: start;
}"""

style = style.replace(old_icon_grid, new_icon_grid)

with open(style_css_path, 'w') as f:
    f.write(style)
print("style.css updated")

