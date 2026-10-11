from PIL import Image, ImageChops

def trim(im):
    bg = Image.new(im.mode, im.size, im.getpixel((0,0)))
    diff = ImageChops.difference(im, bg)
    diff = ImageChops.add(diff, diff, 2.0, -100)
    bbox = diff.getbbox()
    if bbox:
        return im.crop(bbox)
    return im

im = Image.open('frontend/assets/icons/japan_1.png')
print(f"Original size: {im.size}")
trimmed = trim(im)
print(f"Trimmed size: {trimmed.size}")
