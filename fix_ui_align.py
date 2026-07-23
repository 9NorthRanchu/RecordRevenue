import re

app_js_path = "/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/app.js"
with open(app_js_path, 'r') as f:
    app = f.read()

# 1. Dashboard align-items and image cropping (scale)
old_dash_flex = """<div style="display: flex; gap: 12px; align-items: center; width: 100%;">"""
new_dash_flex = """<div style="display: flex; gap: 12px; align-items: flex-start; width: 100%;">"""
app = app.replace(old_dash_flex, new_dash_flex)

old_dash_img = """        if (icon.endsWith('.png')) {
            innerIcon = `<img src="/assets/icons/${icon}" style="width: 100%; height: 100%; border-radius: 12px; object-fit: cover;">`;
            bgColor = 'transparent';
        }"""
new_dash_img = """        if (icon.endsWith('.png')) {
            innerIcon = `<img src="/assets/icons/${icon}" style="width: 100%; height: 100%; border-radius: 12px; object-fit: cover; transform: scale(1.2);">`;
            bgColor = 'transparent';
        }"""
app = app.replace(old_dash_img, new_dash_img)

old_dash_wrapper = """<div style="width: 45px; height: 45px; border-radius: 12px; background: ${bgColor}; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1), inset 0 2px 4px rgba(255,255,255,0.5);">"""
new_dash_wrapper = """<div style="width: 45px; height: 45px; border-radius: 12px; background: ${bgColor}; display: flex; align-items: center; justify-content: center; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1), inset 0 2px 4px rgba(255,255,255,0.5); margin-top: 2px;">"""
app = app.replace(old_dash_wrapper, new_dash_wrapper)


# 2. Details panel image cropping
old_detail_img = """    if (iconType.endsWith('.png')) {
        innerIcon = `<img src="/assets/icons/${iconType}" style="width: 100%; height: 100%; border-radius: 16px; object-fit: cover;">`;
        bgColor = 'transparent';
    }"""
new_detail_img = """    if (iconType.endsWith('.png')) {
        innerIcon = `<img src="/assets/icons/${iconType}" style="width: 100%; height: 100%; border-radius: 16px; object-fit: cover; transform: scale(1.2);">`;
        bgColor = 'transparent';
    }"""
app = app.replace(old_detail_img, new_detail_img)

old_detail_wrapper = """<div style="width: 60px; height: 60px; border-radius: 16px; background: ${bgColor === 'transparent' ? 'transparent' : '#e0f2fe'}; display: flex; align-items: center; justify-content: center; box-shadow: inset 0 2px 4px rgba(255,255,255,0.5), 0 4px 6px rgba(0,0,0,0.05);">"""
new_detail_wrapper = """<div style="width: 60px; height: 60px; border-radius: 16px; background: ${bgColor === 'transparent' ? 'transparent' : '#e0f2fe'}; display: flex; align-items: center; justify-content: center; overflow: hidden; box-shadow: inset 0 2px 4px rgba(255,255,255,0.5), 0 4px 6px rgba(0,0,0,0.05);">"""
app = app.replace(old_detail_wrapper, new_detail_wrapper)

with open(app_js_path, 'w') as f:
    f.write(app)
print("Patched app.js UI")
