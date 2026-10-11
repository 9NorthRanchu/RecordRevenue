from PIL import Image
import os
import glob

sprites = {
    'zodiac': 'zodiac_sprites_unique_*.png',
    'hokkaido': 'hokkaido_sprites_unique_*.png',
    'china': 'china_sprites_unique_*.png',
    'japan': 'japan_sprites_unique_*.png'
}

base_dir = '/Users/DNorth/.gemini/antigravity/brain/c9d0ffa8-00c4-4a6f-9000-a486ecdcca8e'
out_dir = '/Users/DNorth/Library/CloudStorage/GoogleDrive-nimz.4.april@gmail.com/My Drive/Anti Gravity/RecordRevenue/frontend/assets/icons'

for name, pattern in sprites.items():
    matches = glob.glob(os.path.join(base_dir, pattern))
    if not matches:
        print(f"No match for {pattern}")
        continue
    latest = sorted(matches)[-1]
    
    img = Image.open(latest)
    width, height = img.size
    cell_w = width // 4
    cell_h = height // 4
    
    count = 0
    # we need 12 unique
    for r in range(4):
        for c in range(4):
            if count >= 12:
                break
            box = (c * cell_w, r * cell_h, (c + 1) * cell_w, (r + 1) * cell_h)
            cropped = img.crop(box)
            cropped.save(os.path.join(out_dir, f"{name}_{count+1}.png"))
            count += 1
            
print("Done slicing!")
