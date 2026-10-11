from PIL import Image
import os
import glob

def is_bg_color(p):
    # Consider pixel white if RGB are all > 230
    return p[0] > 230 and p[1] > 230 and p[2] > 230

def robust_trim(im):
    im_rgb = im.convert("RGB")
    w, h = im_rgb.size
    
    # Find left
    left = 0
    for x in range(w):
        bg_count = sum(1 for y in range(h) if is_bg_color(im_rgb.getpixel((x, y))))
        if bg_count < h * 0.90: # If less than 90% is white, we found the edge!
            left = x
            break
            
    # Find right
    right = w - 1
    for x in range(w - 1, -1, -1):
        bg_count = sum(1 for y in range(h) if is_bg_color(im_rgb.getpixel((x, y))))
        if bg_count < h * 0.90:
            right = x
            break
            
    # Find top
    top = 0
    for y in range(h):
        bg_count = sum(1 for x in range(w) if is_bg_color(im_rgb.getpixel((x, y))))
        if bg_count < w * 0.90:
            top = y
            break
            
    # Find bottom
    bottom = h - 1
    for y in range(h - 1, -1, -1):
        bg_count = sum(1 for x in range(w) if is_bg_color(im_rgb.getpixel((x, y))))
        if bg_count < w * 0.90:
            bottom = y
            break
            
    # Add a tiny safety margin of 2 pixels inwards to ensure NO white is left
    left = min(left + 2, w//2 - 10)
    right = max(right - 2, w//2 + 10)
    top = min(top + 2, h//2 - 10)
    bottom = max(bottom - 2, h//2 + 10)
            
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
        print(f"Missing {sheet_path}")
        continue
    sheet = Image.open(sheet_path)
    sw, sh = sheet.size
    cell_w = sw // 4
    cell_h = sh // 4
    
    idx = 1
    for y in range(4):
        for x in range(4):
            # Extract cell
            cell = sheet.crop((x * cell_w, y * cell_h, (x + 1) * cell_w, (y + 1) * cell_h))
            
            # Robust trim
            trimmed = robust_trim(cell)
            
            # Save
            path = f'frontend/assets/icons/{prefix}_{idx}.png'
            trimmed.save(path)
            print(f"Saved {path} (size {trimmed.size})")
            idx += 1
            if idx > 12:
                break
        if idx > 12:
            break

