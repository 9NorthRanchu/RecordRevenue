from PIL import Image
import os

sprites = {
    'zodiac': '/Users/DNorth/.gemini/antigravity/brain/c9d0ffa8-00c4-4a6f-9000-a486ecdcca8e/zodiac_new_grid_1783505020879.png',
    'hokkaido': '/Users/DNorth/.gemini/antigravity/brain/c9d0ffa8-00c4-4a6f-9000-a486ecdcca8e/hokkaido_new_grid_1783505030436.png',
    'china': '/Users/DNorth/.gemini/antigravity/brain/c9d0ffa8-00c4-4a6f-9000-a486ecdcca8e/china_new_grid_1783504993007.png',
    'japan': '/Users/DNorth/.gemini/antigravity/brain/c9d0ffa8-00c4-4a6f-9000-a486ecdcca8e/japan_new_grid_1783505001898.png'
}

for prefix, sheet_path in sprites.items():
    if not os.path.exists(sheet_path):
        print(f"Missing {sheet_path}")
        continue
    sheet = Image.open(sheet_path)
    sw, sh = sheet.size
    
    # Calculate cell dimensions (exactly 1/4 of the width/height)
    cell_w = sw / 4.0
    cell_h = sh / 4.0
    
    # We will chop off 15 pixels from every side of the cell to guarantee no borders/lines.
    margin = 15
    
    idx = 1
    for y in range(4):
        for x in range(4):
            # Calculate pixel coordinates for the cell
            left = int(x * cell_w)
            upper = int(y * cell_h)
            right = int((x + 1) * cell_w)
            lower = int((y + 1) * cell_h)
            
            # Crop the cell
            cell = sheet.crop((left, upper, right, lower))
            
            # Crop 15 pixels inward
            cw, ch = cell.size
            final_cell = cell.crop((margin, margin, cw - margin, ch - margin))
            
            # Save
            path = f'frontend/assets/icons/{prefix}_{idx}.png'
            final_cell.save(path)
            print(f"Saved {path}")
            idx += 1
            if idx > 12: break
        if idx > 12: break

print("Done processing grids.")
