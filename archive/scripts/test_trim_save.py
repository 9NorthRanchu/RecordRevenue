from PIL import Image, ImageChops

def trim(im):
    # Convert to RGB to ensure getpixel returns a simple tuple
    im = im.convert("RGB")
    bg = Image.new("RGB", im.size, (255, 255, 255))
    diff = ImageChops.difference(im, bg)
    
    # We want to ignore very slight off-white compression artifacts
    # so we can use a threshold.
    # Convert diff to grayscale
    diff = diff.convert("L")
    # Anything below threshold (say 20) is considered background
    diff = diff.point(lambda p: p > 20 and 255)
    
    bbox = diff.getbbox()
    if bbox:
        return im.crop(bbox)
    return im

for prefix in ['zodiac', 'hokkaido', 'china', 'japan']:
    for i in range(1, 13):
        path = f'frontend/assets/icons/{prefix}_{i}.png'
        try:
            im = Image.open(path)
            trimmed = trim(im)
            # Make sure it's square
            w, h = trimmed.size
            if w != h:
                # crop to a perfect square from the center
                size = min(w, h)
                left = (w - size) // 2
                top = (h - size) // 2
                trimmed = trimmed.crop((left, top, left+size, top+size))
            
            # Save it back
            trimmed.save(path)
            print(f"Trimmed {path} to {trimmed.size}")
        except Exception as e:
            print(f"Error trimming {path}: {e}")

