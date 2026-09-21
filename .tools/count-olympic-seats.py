from collections import Counter
from pathlib import Path
from PIL import Image

IMAGE_PATHS = [
    Path(r"C:\Users\CloudDX\Downloads\서울 올림픽홀 좌석 좌표\올림픽홀.jpg"),
    Path(r"C:\Users\CloudDX\Downloads\s3_01_03_03_seat.jpg"),
]
path = next(p for p in IMAGE_PATHS if p.exists())
image = Image.open(path).convert("RGB")
width, height = image.size
pixels = image.load()

def matches(name, pixel):
    red, green, blue = pixel
    if name == "red":
        return red > 145 and green < 125 and blue < 135 and red > green * 1.45
    if name == "blue":
        return blue > 95 and green < 155 and green > 65 and red < 110 and blue > green * 1.12
    return green > 140 and red < 105 and blue > 90 and green > red * 1.35 and green > blue * 1.12

def components(name):
    seen = bytearray(width * height)
    result = []
    for y in range(height):
        for x in range(width):
            index = y * width + x
            if seen[index] or not matches(name, pixels[x, y]):
                continue
            seen[index] = 1
            stack = [(x, y)]
            area = 0
            min_x = max_x = x
            min_y = max_y = y
            while stack:
                current_x, current_y = stack.pop()
                area += 1
                min_x = min(min_x, current_x)
                max_x = max(max_x, current_x)
                min_y = min(min_y, current_y)
                max_y = max(max_y, current_y)
                for next_x, next_y in ((current_x - 1, current_y), (current_x + 1, current_y),
                                       (current_x, current_y - 1), (current_x, current_y + 1)):
                    if 0 <= next_x < width and 0 <= next_y < height:
                        next_index = next_y * width + next_x
                        if not seen[next_index] and matches(name, pixels[next_x, next_y]):
                            seen[next_index] = 1
                            stack.append((next_x, next_y))
            result.append((area, min_x, min_y, max_x - min_x + 1, max_y - min_y + 1))
    return result

print("image", path, image.size)
for name in ("red", "blue", "green"):
    comps = components(name)
    if name in ("red", "blue"):
        seats = [c for c in comps if (
            (80 <= c[0] <= 145 and 8 <= c[3] <= 14 and 9 <= c[4] <= 13)
            or (125 <= c[0] <= 180 and 14 <= c[3] <= 18 and 14 <= c[4] <= 18)
        )]
    else:
        seats = [c for c in comps if 70 <= c[0] <= 130 and 8 <= c[3] <= 14 and 9 <= c[4] <= 13]
    shapes = Counter((c[3], c[4]) for c in seats)
    print(name, "components", len(comps), "seatLike", len(seats))
    print("shapes", sorted(shapes.items()))
    for band_name, y0, y1 in (("upper", 200, 550), ("middle", 550, 1000), ("lower", 1000, 1450)):
        band = [c for c in seats if y0 <= c[2] < y1]
        print(" ", band_name, len(band))
