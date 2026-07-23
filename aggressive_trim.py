from PIL import Image
import os

def is_bg_color(p):
    return p[0] > 220 and p[1] > 220 and p[2] > 220

def aggressive_trim(im):
    im_rgb = im.convert("RGB")
    w, h = im_rgb.size
    
    # We want to find the first column/row that has a SIGNIFICANT amount of non-background pixels.
    # For a rounded square, the edge column will have non-bg pixels except at the corners.
    # The corners might be 20-30% of the height. So the edge column should be at least 40% non-bg.
    
    left = 0
    for x in range(w):
        non_bg = sum(1 for y in range(h) if not is_bg_color(im_rgb.getpixel((x, y))))
        if non_bg > h * 0.40:
            left = x
            break
            
    right = w - 1
    for x in range(w - 1, -1, -1):
        non_bg = sum(1 for y in range(h) if not is_bg_color(im_rgb.getpixel((x, y))))
        if non_bg > h * 0.40:
            right = x
            break
            
    top = 0
    for y in range(h):
        non_bg = sum(1 for x in range(w) if not is_bg_color(im_rgb.getpixel((x, y))))
        if non_bg > w * 0.40:
            top = y
            break
            
    bottom = h - 1
    for y in range(h - 1, -1, -1):
        non_bg = sum(1 for x in range(w) if not is_bg_color(im_rgb.getpixel((x, y))))
        if non_bg > w * 0.40:
            bottom = y
            break
            
    # Crop to bounding box
    trimmed = im.crop((left, top, right + 1, bottom + 1))
    
    # Make square
    tw, th = trimmed.size
    size = min(tw, th)
    l = (tw - size) // 2
    t = (th - size) // 2
    trimmed = trimmed.crop((l, t, l + size, t + size))
    
    return trimmed

sprites = {
    'zodiac': '/Users/DNorth/.gemini/antigravity/brain/c9d0ffa8-00c4-4a6f-9000-a486ecdcca8e/zodiac_sprites_unique_1783494207548.png',
    'hokkaido': '/Users/DNorth/.gemini/antigravity/brain/c9d0ffa8-00c4-4a6f-9000-a486ecdcca8e/hokkaido_sprites_unique_1783494219553.png',
    'china': '/Users/DNorth/.gemini/antigravity/brain/c9d0ffa8-00c4-4a6f-9000-a486ecdcca8e/china_sprites_unique_1783494234962.png',
    'japan': '/Users/DNorth/.gemini/antigravity/brain/c9d0ffa8-00c4-4a6f-9000-a486ecdcca8e/japan_sprites_unique_1783494244837.png'
}

for prefix, sheet_path in sprites.items():
    if not os.path.exists(sheet_path):
        continue
    sheet = Image.open(sheet_path)
    sw, sh = sheet.size
    cell_w = sw // 4
    cell_h = sh // 4
    
    idx = 1
    for y in range(4):
        for x in range(4):
            cell = sheet.crop((x * cell_w, y * cell_h, (x + 1) * cell_w, (y + 1) * cell_h))
            trimmed = aggressive_trim(cell)
            path = f'frontend/assets/icons/{prefix}_{idx}.png'
            trimmed.save(path)
            print(f"Aggressive trimmed {path} to size {trimmed.size}")
            idx += 1
            if idx > 12: break
        if idx > 12: break

