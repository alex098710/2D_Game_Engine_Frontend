"""Draw the industrial combat arena: metal floor, hazard stripes, steel wall,
shipping container, pipes, reactor, warning beacon, barrier, and two enemies:
the turret and the drone.

Usage:  python tools/make_industrial.py
Writes public/textures/<name>.png. Original pixel art drawn in code, with the
same small canvas as tools/make_western.py, but a cold palette: steel greys,
a cyan glow and hazard yellow, so the arena reads apart from the town.
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import make_western as west  # noqa: E402

# A cold palette for the arena (dark -> light per material).
west.P.update({
    "edge": "0e1218",
    "steel0": "1b2028", "steel1": "2a313b", "steel2": "3b4450", "steel3": "56616f", "steel4": "7d8a99",
    "rivet": "9aa6b4",
    "cyan0": "0f5a6e", "cyan1": "1fa3c4", "cyan2": "5ee3ff", "cyan3": "d8fbff",
    "warn": "f2c230", "warn2": "c99a1c", "black": "15171c",
    "rust0": "7a3416", "rust1": "a8481f", "rust2": "c8662e", "rust3": "e08a4e",
    "teal0": "1d5e5a", "teal1": "2a7f79", "teal2": "3aa59c",
    "red0": "7a1020", "red1": "c8243a", "red2": "ff5a6e", "red3": "ffd0d6",
    "concrete0": "6f7480", "concrete1": "8e939e", "concrete2": "b3b8c2",
})
Canvas = west.Canvas


def metalfloor() -> Canvas:
    c = Canvas(16, 16, seed=21)
    c.rect(0, 0, 16, 16, "steel2")
    c.grain(0, 0, 16, 16, ["steel1", "steel3"], 0.1)
    for y in range(2, 16, 4):  # tread pattern
        for x in range((y // 4) % 2 * 2 + 1, 16, 4):
            c.set(x, y, "steel3")
    c.hline(0, 0, 16, "steel3")
    c.vline(0, 0, 16, "steel3")
    c.hline(0, 15, 16, "steel0")
    c.vline(15, 0, 16, "steel0")
    for x, y in ((2, 2), (13, 2), (2, 13), (13, 13)):
        c.set(x, y, "rivet")
    return c


def hazard() -> Canvas:
    c = Canvas(16, 16, seed=22)
    for y in range(16):
        for x in range(16):
            c.set(x, y, "warn" if ((x + y) // 4) % 2 == 0 else "black")
    c.grain(0, 0, 16, 16, ["warn2", "steel1"], 0.06)
    c.hline(0, 0, 16, "steel3")
    c.hline(0, 15, 16, "steel0")
    return c


def steelwall() -> Canvas:
    c = Canvas(16, 16, seed=23)
    c.rect(0, 0, 16, 5, "steel3")  # top face, lit
    c.hline(0, 0, 16, "steel4")
    c.rect(0, 5, 16, 11, "steel1")  # front face
    for x in (5, 10):
        c.vline(x, 5, 10, "steel0")
    c.hline(0, 5, 16, "steel0")
    c.hline(0, 14, 16, "steel0")
    c.hline(0, 15, 16, "edge")
    for x in (2, 7, 12):
        c.set(x, 7, "rivet")
        c.set(x, 12, "rivet")
    c.rect(1, 9, 14, 1, "warn2")  # a thin warning line
    return c


def container() -> Canvas:
    c = Canvas(32, 16, seed=24)
    c.rect(0, 0, 32, 4, "rust3")  # roof, lit
    c.hline(0, 0, 32, "rust3")
    c.rect(0, 4, 32, 11, "rust2")
    for x in range(1, 25, 3):  # ribs
        c.vline(x, 4, 11, "rust1")
        c.vline(x + 1, 4, 11, "rust3")
    # Doors with lock bars at the right end.
    c.rect(25, 4, 7, 11, "rust1")
    for x in (27, 30):
        c.vline(x, 5, 9, "steel4")
    c.hline(25, 9, 7, "steel3")
    c.hline(0, 15, 32, "rust0")
    c.grain(0, 4, 24, 11, ["rust0", "rust1"], 0.05)
    c.rect(6, 7, 8, 3, "cream")  # a stencil panel
    c.hline(7, 8, 6, "rust0")
    c.outline("edge")
    return c


def pipes() -> Canvas:
    c = Canvas(32, 16, seed=25)
    for y in (1, 9):
        c.rect(0, y, 32, 6, "steel2")
        c.hline(0, y, 32, "steel4")
        c.hline(0, y + 1, 32, "steel3")
        c.hline(0, y + 4, 32, "steel1")
        c.hline(0, y + 5, 32, "steel0")
        for x in (4, 16, 27):  # flanges
            c.rect(x, y - 1, 2, 8, "steel3")
            c.vline(x + 1, y - 1, 8, "steel1")
    # A red valve wheel.
    c.rect(20, 2, 5, 5, "red1")
    c.rect(21, 3, 3, 3, "steel1")
    c.set(22, 4, "red2")
    c.set(20, 2, "red2")
    c.outline("edge")
    return c


def reactor() -> Canvas:
    c = Canvas(32, 32, seed=26)
    c.rect(1, 1, 30, 30, "steel1")
    c.rect(1, 1, 30, 3, "steel3")
    c.hline(1, 1, 30, "steel4")
    # Hazard band along the base.
    for x in range(1, 31):
        c.vline(x, 27, 4, "warn" if (x // 3) % 2 == 0 else "black")
    # Vents on the sides.
    for y in range(7, 25, 3):
        c.hline(3, y, 5, "steel0")
        c.hline(24, y, 5, "steel0")
    # The glowing core in a ring.
    for y in range(-8, 9):
        for x in range(-8, 9):
            d = x * x + y * y
            px, py = 16 + x, 15 + y
            if 49 <= d <= 64:
                c.set(px, py, "steel3")
            elif 30 <= d < 49:
                c.set(px, py, "cyan0")
            elif 12 <= d < 30:
                c.set(px, py, "cyan1")
            elif 4 <= d < 12:
                c.set(px, py, "cyan2")
            elif d < 4:
                c.set(px, py, "cyan3")
    for x, y in ((3, 3), (28, 3), (3, 24), (28, 24)):
        c.set(x, y, "rivet")
    c.outline("edge")
    return c


def beacon() -> Canvas:
    c = Canvas(16, 24, seed=27)
    c.rect(7, 8, 2, 13, "steel2")
    c.vline(7, 8, 13, "steel3")
    c.rect(4, 20, 8, 3, "steel1")
    c.hline(4, 20, 8, "steel3")
    # The red warning light and its glow.
    c.rect(5, 1, 6, 7, "red1")
    c.rect(6, 2, 4, 4, "red2")
    c.rect(7, 3, 2, 2, "red3")
    c.rect(4, 0, 8, 1, "steel1")
    c.rect(4, 7, 8, 1, "steel1")
    c.outline("edge")
    return c


def barrier() -> Canvas:
    c = Canvas(16, 8, seed=28)
    c.rect(0, 1, 16, 7, "concrete1")
    c.hline(0, 1, 16, "concrete2")
    c.hline(0, 7, 16, "concrete0")
    for x in range(0, 16, 4):  # red and white band
        c.rect(x, 3, 2, 2, "red1")
        c.rect(x + 2, 3, 2, 2, "cream")
    c.grain(0, 1, 16, 7, ["concrete0", "concrete2"], 0.08)
    c.outline("edge")
    return c


def turret() -> Canvas:
    c = Canvas(16, 16, seed=29)
    # Armoured base plate.
    c.rect(2, 8, 12, 6, "steel2")
    c.hline(2, 8, 12, "steel4")
    c.hline(2, 13, 12, "steel0")
    for x in (3, 12):
        c.set(x, 11, "rivet")
    # Head with the barrel to the right and a cyan sensor.
    c.rect(4, 3, 8, 7, "steel3")
    c.hline(4, 3, 8, "rivet")
    c.vline(4, 3, 7, "steel4")
    c.rect(11, 5, 5, 2, "steel4")
    c.set(15, 5, "steel0")
    c.set(15, 6, "steel0")
    c.rect(6, 5, 2, 2, "cyan2")
    c.set(6, 5, "cyan3")
    for x in range(2, 14, 4):  # hazard ring on the base
        c.set(x, 12, "warn")
    c.outline("edge")
    return c


def drone() -> Canvas:
    c = Canvas(16, 16, seed=30)
    for x, y in ((1, 1), (11, 1), (1, 11), (11, 11)):  # rotors
        c.rect(x, y, 4, 4, "steel3")
        c.rect(x + 1, y + 1, 2, 2, "cyan0")
        c.set(x, y + 1, "cyan2")
    for i in range(4, 12):  # arms
        c.set(i, i, "steel1")
        c.set(15 - i, i, "steel1")
    c.rect(5, 5, 6, 6, "steel2")
    c.hline(5, 5, 6, "steel4")
    c.rect(7, 7, 2, 2, "red1")
    c.set(7, 7, "red3")
    c.outline("edge")
    return c


SPRITES = {
    "metalfloor": metalfloor, "hazard": hazard, "steelwall": steelwall, "container": container,
    "pipes": pipes, "reactor": reactor, "beacon": beacon, "barrier": barrier, "turret": turret, "drone": drone,
}


def main() -> None:
    for name, draw in SPRITES.items():
        draw().save(name)
        print(f"wrote {name}.png")


if __name__ == "__main__":
    main()
