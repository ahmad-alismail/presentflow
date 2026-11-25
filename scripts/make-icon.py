"""Generates build/icon.png (512 px) and build/icon.ico: script lines, the current one highlighted."""
from PIL import Image, ImageDraw
S = 4 * 512  # supersample for smooth edges
img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
u = S / 512
d.rounded_rectangle([16 * u, 16 * u, 496 * u, 496 * u], radius=110 * u, fill=(31, 86, 184, 255))
d.rounded_rectangle([104 * u, 150 * u, 112 * u + 18 * u, 250 * u], radius=9 * u, fill=(255, 212, 0, 255))       # focus bar
d.rounded_rectangle([146 * u, 158 * u, 410 * u, 196 * u], radius=19 * u, fill=(255, 255, 255, 255))             # current line
d.rounded_rectangle([146 * u, 212 * u, 352 * u, 244 * u], radius=16 * u, fill=(255, 255, 255, 255))
d.rounded_rectangle([110 * u, 296 * u, 400 * u, 322 * u], radius=13 * u, fill=(176, 197, 234, 255))             # next
d.rounded_rectangle([110 * u, 346 * u, 330 * u, 370 * u], radius=12 * u, fill=(122, 156, 214, 255))              # later
icon = img.resize((512, 512), Image.LANCZOS)
icon.save('build/icon.png')
icon.save('build/icon.ico', sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
print('ok')
