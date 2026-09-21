from collections import Counter, deque
from PIL import Image

path = r"C:\Users\CloudDX\Downloads\s3_01_03_03_seat.jpg"
image = Image.open(path).convert("RGB")
width, height = image.size
pixels = image.load()
def matches(name, pixel):
    red, green, blue = pixel
    if name == "red":
        return red > 145 and green < 125 and blue < 135 and red > green * 1.45
    if name == "blue":
        return blue > 95 and green > 65 and red < 110 and blue > red * 1.35
    return green > 115 and red < 105 and blue > 75 and green > red * 1.35

for name in ("red", "blue", "green"):
    seen = bytearray(width * height)
    components = []
    for y in range(height):
        for x in range(width):
            index = y * width + x
            if seen[index] or not matches(name, pixels[x, y]):
                continue
            seen[index] = 1
            queue = deque([(x, y)])
            area = 0
            min_x = max_x = x
            min_y = max_y = y
            while queue:
                current_x, current_y = queue.popleft()
                area += 1
                min_x = min(min_x, current_x)
                max_x = max(max_x, current_x)
                min_y = min(min_y, current_y)
                max_y = max(max_y, current_y)
                for next_x, next_y in (
                    (current_x - 1, current_y),
                    (current_x + 1, current_y),
                    (current_x, current_y - 1),
                    (current_x, current_y + 1),
                ):
                    if 0 <= next_x < width and 0 <= next_y < height:
                        next_index = next_y * width + next_x
                        if not seen[next_index] and matches(name, pixels[next_x, next_y]):
                            seen[next_index] = 1
                            queue.append((next_x, next_y))
            components.append((area, max_x - min_x + 1, max_y - min_y + 1))

    bins = Counter((area, width, height) for area, width, height in components)
    seat_like = sum(
        count for (area, component_width, component_height), count in bins.items()
        if 20 <= area <= 300 and component_width <= 35 and component_height <= 35
    )
    print(name, "components=", len(components), "seatLike=", seat_like)
    print("shapes=", sorted((shape, count) for shape, count in bins.items() if 20 <= shape[0] <= 300 and shape[1] <= 35 and shape[2] <= 35)[:80])
