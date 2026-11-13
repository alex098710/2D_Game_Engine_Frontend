"""Draw the eleven heroes: standing and two walking steps each.

Usage:  python tools/make_heroes.py
Writes public/textures/hero-<id>-idle.png, -walk1.png and -walk2.png. Original
pixel art on the same 16 px grid as the rest of the game (scaled 2x), lit from
the top left with a dark outline. Every hero shares one body (so they read as
a cast) and gets its own head gear, outfit, colours and back item. The weapon
is not painted: the game draws the held weapon in the hand, and swaps it when
the hero picks up another one.
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from make_western import Canvas  # noqa: E402

OUTLINE = "1a1218"
SKIN = ("e8b48a", "c98a62")          # light, shade
SKIN_DARK = ("b07850", "8a5a38")


def body(c: Canvas, h: dict, step: int) -> None:
    """The shared body: legs (with the walking step), torso, belt, arms and face."""
    pants, boots = h["pants"], h["boots"]
    # Legs: step 0 stands, 1 puts the left foot forward, 2 the right one.
    left_down = 1 if step == 1 else 0
    right_down = 1 if step == 2 else 0
    left_up = 1 if step == 2 else 0
    right_up = 1 if step == 1 else 0
    c.rect(5, 11, 2, 3 + left_down - left_up, pants)
    c.rect(9, 11, 2, 3 + right_down - right_up, pants)
    c.rect(5, 13 + left_down - left_up, 2, 2, boots)
    c.rect(9, 13 + right_down - right_up, 2, 2, boots)
    # Torso with a lit left side and a shaded right side.
    o0, o1, o2 = h["outfit"]
    c.rect(4, 7, 8, 5, o1)
    c.vline(4, 7, 5, o0)
    c.vline(5, 7, 4, o2)
    c.vline(11, 7, 5, o0)
    c.hline(4, 10, 8, h["belt"])
    c.set(7, 10, h.get("buckle", "e8c45a"))
    # Arms swing a little with the step.
    arm0, arm1 = h["sleeve"]
    skin, skin_shade = h.get("skin", SKIN)
    swing_l = -1 if step == 2 else 0
    swing_r = -1 if step == 1 else 0
    c.rect(3, 7 + swing_l, 1, 3, arm1)
    c.rect(12, 7 + swing_r, 1, 3, arm0)
    c.set(3, 10 + swing_l, skin)
    c.set(12, 10 + swing_r, skin_shade)
    # Face.
    c.rect(5, 3, 6, 4, skin)
    c.vline(10, 3, 4, skin_shade)
    c.set(6, 5, "1a1218")
    c.set(9, 5, "1a1218")
    c.set(6, 4, h.get("brow", "3a2418"))
    c.set(9, 4, h.get("brow", "3a2418"))


def draw(h: dict, step: int) -> Canvas:
    c = Canvas(16, 16, seed=40 + step)
    if h.get("back"):
        h["back"](c)
    body(c, h, step)
    h["head"](c)
    if h.get("front"):
        h["front"](c)
    c.outline(OUTLINE)
    return c


# ----------------------------------------------------------------------------- head gear

def knight_head(c):
    c.rect(4, 1, 8, 5, "b8c2cf")        # steel helmet
    c.hline(4, 1, 8, "e3e9f0")
    c.vline(11, 1, 5, "7d8896")
    c.hline(5, 4, 6, "2a313b")           # visor slit
    c.set(6, 4, "9fdcff")
    c.set(9, 4, "9fdcff")
    c.rect(7, 0, 2, 2, "2f6fd6")         # blue plume
    c.set(8, 0, "5ea0ff")


def wizard_head(c):
    for i, y in enumerate(range(0, 4)):  # tall pointed hat
        c.hline(7 - i, y, 2 + i * 2, "5b2fa8")
    c.hline(3, 3, 10, "7a4ad1")
    c.set(8, 1, "ffd65c")                # a star
    c.set(5, 3, "ffd65c")
    c.rect(5, 6, 6, 2, "eef0f5")         # white beard
    c.set(7, 8, "eef0f5")
    c.set(8, 8, "d6dae3")


def archer_head(c):
    c.rect(4, 1, 8, 3, "2f7a3a")         # green hood
    c.vline(4, 2, 5, "2f7a3a")
    c.vline(11, 2, 5, "215a2a")
    c.hline(5, 1, 6, "45a352")
    c.set(12, 3, "2f7a3a")               # the hood's tip


def barbarian_head(c):
    c.rect(4, 1, 8, 3, "d9772e")         # wild orange hair
    c.set(3, 2, "d9772e")
    c.set(12, 2, "b85a1c")
    c.vline(4, 3, 4, "d9772e")
    c.vline(11, 3, 4, "b85a1c")
    c.hline(5, 1, 5, "f09a4c")
    c.hline(6, 6, 4, "b85a1c")           # beard stubble


def rogue_head(c):
    c.rect(4, 1, 8, 3, "2b2236")         # dark hood
    c.vline(4, 2, 5, "2b2236")
    c.vline(11, 2, 5, "1c1626")
    c.hline(5, 1, 6, "40345a")
    c.rect(5, 5, 6, 2, "6b2f8f")         # purple mask over the mouth
    c.set(6, 5, "1a1218")
    c.set(9, 5, "1a1218")


def viking_head(c):
    c.rect(4, 1, 8, 3, "9aa6b4")         # helmet
    c.hline(4, 1, 8, "cfd6df")
    c.rect(2, 0, 2, 3, "eee6cf")         # horns
    c.rect(12, 0, 2, 3, "d6ccb0")
    c.rect(5, 6, 6, 2, "c4502a")         # red braided beard
    c.set(6, 8, "c4502a")
    c.set(9, 8, "a03a1c")


def lancer_head(c):
    c.rect(4, 1, 8, 4, "c2a04a")         # bronze helmet
    c.hline(4, 1, 8, "e6c66a")
    c.vline(11, 1, 4, "8f7230")
    c.rect(5, 0, 6, 1, "c8243a")         # red crest
    c.set(4, 0, "c8243a")


def druid_head(c):
    c.rect(4, 1, 8, 2, "6b4a2a")         # brown hair
    c.vline(4, 2, 4, "6b4a2a")
    c.vline(11, 2, 4, "4f3418")
    for x in (4, 7, 10):                 # leaf crown
        c.set(x, 0, "4fbf5a")
        c.set(x + 1, 1, "3a9a44")
    c.rect(6, 6, 4, 2, "8a6a4a")         # short beard


def soldier_head(c):
    c.rect(4, 1, 8, 3, "2f5fa8")         # blue helmet
    c.hline(4, 1, 8, "4f86d6")
    c.hline(3, 3, 10, "234a86")          # brim
    c.vline(11, 1, 3, "234a86")


def commando_head(c):
    c.rect(4, 1, 8, 3, "3a4a3a")         # dark beret
    c.set(11, 1, "2a3a2a")
    c.hline(4, 1, 7, "4f604f")
    c.rect(5, 4, 6, 1, "1f2a2f")         # goggles
    c.set(6, 4, "5ee3ff")
    c.set(9, 4, "5ee3ff")


def warrior_head(c):
    c.rect(4, 1, 8, 4, "8f96a0")         # steel helmet with cheek guards
    c.hline(4, 1, 8, "c0c7cf")
    c.rect(4, 5, 1, 2, "8f96a0")
    c.rect(11, 5, 1, 2, "6a717b")
    c.rect(6, 0, 4, 1, "c8243a")         # red crest
    c.rect(7, 0, 2, 2, "e04050")


# ----------------------------------------------------------------------------- back items and capes

def cape(colour, shade):
    def draw_cape(c):
        c.rect(3, 7, 10, 6, shade)
        c.vline(3, 8, 5, colour)
    return draw_cape


def quiver(c):
    c.rect(11, 4, 2, 6, "8a5a30")
    for x in (11, 12):
        c.set(x, 3, "f2e6c8")            # feathers


def axe_on_back(c):
    c.vline(4, 3, 7, "6b4a2a")
    c.rect(2, 3, 2, 3, "b8c2cf")


def knight_front(c):
    c.vline(8, 7, 3, "ffd65c")           # yellow cross on the tabard
    c.hline(7, 8, 3, "ffd65c")


def chainmail(c):
    for y in range(7, 10):
        for x in range(5 + y % 2, 11, 2):
            c.set(x, y, "aab2bd")


def soldier_front(c):
    c.rect(5, 7, 1, 3, "c9a23c")         # strap
    c.set(9, 8, "1f3f75")                # pocket


def commando_front(c):
    c.rect(5, 8, 6, 2, "2a3a2a")         # tactical vest
    c.set(6, 8, "c9a23c")
    c.set(9, 8, "c9a23c")


def warrior_front(c):
    c.rect(5, 7, 6, 2, "c2a04a")         # bronze breastplate
    c.hline(5, 7, 6, "e6c66a")
    for x in (5, 7, 9):                  # grenades on the belt
        c.set(x, 11, "4b6b3a")


HEROES = {
    "knight": {"head": knight_head, "front": knight_front, "back": cape("3a7be0", "24539e"),
               "outfit": ("1f4a9e", "2f6fd6", "5ea0ff"), "sleeve": ("8a96a6", "b8c2cf"),
               "pants": "5a6574", "boots": "3a3030", "belt": "6b4a2a"},
    "wizard": {"head": wizard_head, "outfit": ("3d1f78", "5b2fa8", "7a4ad1"), "sleeve": ("3d1f78", "5b2fa8"),
               "pants": "3d1f78", "boots": "2a1a40", "belt": "c9a23c", "buckle": "5ee3ff"},
    "archer": {"head": archer_head, "back": quiver, "outfit": ("5a3a1e", "7a5230", "9a6c40"),
               "sleeve": ("215a2a", "2f7a3a"), "pants": "4a3a2a", "boots": "3a2614", "belt": "3a2614"},
    "barbarian": {"head": barbarian_head, "back": axe_on_back, "outfit": ("6b4a2a", "8a6238", "a87c4a"),
                  "sleeve": SKIN_DARK, "skin": SKIN_DARK, "pants": "5a3a20", "boots": "3a2614", "belt": "3a2614"},
    "rogue": {"head": rogue_head, "back": cape("3a2f4a", "2b2236"), "outfit": ("2b2236", "40345a", "5a4a7a"),
              "sleeve": ("2b2236", "40345a"), "pants": "2b2236", "boots": "1a1420", "belt": "6b2f8f",
              "buckle": "c9ced6"},
    "viking": {"head": viking_head, "front": chainmail, "back": cape("a8323a", "7a1f28"),
               "outfit": ("4a5260", "6a7482", "8a96a6"), "sleeve": ("5a3a20", "7a5230"),
               "pants": "5a3a20", "boots": "3a2614", "belt": "3a2614"},
    "lancer": {"head": lancer_head, "back": cape("c8243a", "8f1a28"), "outfit": ("8f1a28", "c8243a", "e04050"),
               "sleeve": ("8f7230", "c2a04a"), "pants": "5a3a20", "boots": "3a2614", "belt": "c2a04a",
               "buckle": "e6c66a"},
    "druid": {"head": druid_head, "outfit": ("3a5a2a", "4f7a38", "6a9a4a"), "sleeve": ("5a3a20", "7a5230"),
              "pants": "4f3418", "boots": "3a2614", "belt": "8a6238", "buckle": "4fbf5a"},
    "soldier": {"head": soldier_head, "front": soldier_front, "outfit": ("1f3f75", "2f5fa8", "4f86d6"),
                "sleeve": ("1f3f75", "2f5fa8"), "pants": "2a3a5a", "boots": "1a1a24", "belt": "3a2a1a"},
    "commando": {"head": commando_head, "front": commando_front, "outfit": ("3a4a3a", "4f604f", "6a7f6a"),
                 "sleeve": ("3a4a3a", "4f604f"), "pants": "2f3a2f", "boots": "1a1a1a", "belt": "1a1a1a",
                 "skin": SKIN_DARK},
    "warrior": {"head": warrior_head, "front": warrior_front, "back": cape("c8243a", "8f1a28"),
                "outfit": ("8f1a28", "c8243a", "e04050"), "sleeve": ("8f96a0", "c0c7cf"),
                "pants": "5a3a20", "boots": "3a2614", "belt": "6b4a2a"},
}

POSES = {"idle": 0, "walk1": 1, "walk2": 2}


def main() -> None:
    for hero, spec in HEROES.items():
        for pose, step in POSES.items():
            draw(spec, step).save(f"hero-{hero}-{pose}")
    print(f"wrote {len(HEROES) * len(POSES)} hero textures")


if __name__ == "__main__":
    main()
