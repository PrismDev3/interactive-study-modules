# DEVLOG

Running log for the 84-day plan in `docs/ROADMAP.md`. One entry per day, newest at the bottom.

---

## Template

Copy this for each day:

```
### Day NN — <title>
- **Shipped:** what is now true that wasn't yesterday (one sentence, plain language).
- **Number:** one measurable thing (fps, ms, MB, count, seconds).
- **Broke:** what fought back, and how it was fixed (or "nothing, suspiciously").
- **Clip:** tools/devlog/dNN.mp4  (or dNN.png)
- **Post:** the line that went out publicly.
```

---

## Day index

| Day | Title | Clip | Posted |
|---|---|---|---|
| 1 | Baseline, not vibes | | ☐ |
| 2 | Break the 104 MB wall | | ☐ |
| 3 | Slim the city | | ☐ |
| 4 | Zero console errors | | ☐ |
| 5 | The frame budget | | ☐ |
| 6 | Input latency | | ☐ |
| 7 | Week 1 recap | | ☐ |
| 8 | Three landings, not one | | ☐ |
| 9 | Fall → swing hand-off | | ☐ |
| 10 | Air control | | ☐ |
| 11 | Camera language | | ☐ |
| 12 | Wall run + crawl polish | | ☐ |
| 13 | Footsteps that match the ground | | ☐ |
| 14 | Week 2 recap: traversal montage | | ☐ |
| 15 | Impact | | ☐ |
| 16 | Enemies that warn you | | ☐ |
| 17 | Dodge with a purpose | | ☐ |
| 18 | Combo and finisher | | ☐ |
| 19 | Boss framework | | ☐ |
| 20 | Death and retry | | ☐ |
| 21 | Week 3 recap: boss clip | | ☐ |
| 22 | Web-zip points | | ☐ |
| 23 | Fast travel | | ☐ |
| 24 | Race mode | | ☐ |
| 25 | Civilians react | | ☐ |
| 26 | Collectibles | | ☐ |
| 27 | Landmark set dressing | | ☐ |
| 28 | Week 4 recap: city tour | | ☐ |
| 29 | A real audio bus | | ☐ |
| 30 | Menu theme | | ☐ |
| 31 | City exploration music | | ☐ |
| 32 | Combat and boss music | | ☐ |
| 33 | Ambience | | ☐ |
| 34 | SFX coverage audit | | ☐ |
| 35 | Week 5 recap: sound before/after | | ☐ |
| 36 | HUD rebuild | | ☐ |
| 37 | Ability bar | | ☐ |
| 38 | Objectives | | ☐ |
| 39 | Minimap | | ☐ |
| 40 | Pause menu | | ☐ |
| 41 | Transitions | | ☐ |
| 42 | Week 6 recap: UI before/after | | ☐ |
| 43 | Cutscene framing | | ☐ |
| 44 | Dialogue camera | | ☐ |
| 45 | Subtitles and skip | | ☐ |
| 46 | Chapter cards | | ☐ |
| 47 | Photo mode | | ☐ |
| 48 | Options screen | | ☐ |
| 49 | Week 7 recap: cutscene clip | | ☐ |
| 50 | Server profile | | ☐ |
| 51 | Story ↔ online | | ☐ |
| 52 | Save slots | | ☐ |
| 53 | Offline and conflicts | | ☐ |
| 54 | Achievements | | ☐ |
| 55 | Stats screen | | ☐ |
| 56 | Week 8 recap: sync demo | | ☐ |
| 57 | First ten minutes | | ☐ |
| 58 | Hint system | | ☐ |
| 59 | Difficulty | | ☐ |
| 60 | Accessibility basics | | ☐ |
| 61 | Remap and motion | | ☐ |
| 62 | Controller, end to end | | ☐ |
| 63 | Week 9 recap: stranger test | | ☐ |
| 64 | Chapter 1 | | ☐ |
| 65 | Chapter 2 | | ☐ |
| 66 | Chapter 3 | | ☐ |
| 67 | Chapter 4 | | ☐ |
| 68 | Chapter 5 | | ☐ |
| 69 | Chapter 6 and the Gauntlet | | ☐ |
| 70 | Week 10 recap: chapter reel | | ☐ |
| 71 | New enemy type | | ☐ |
| 72 | Encounter variety | | ☐ |
| 73 | Boss rework: Vulture, Goblin | | ☐ |
| 74 | Boss rework: Doc Ock, Lizard | | ☐ |
| 75 | Boss rework: Sandman, Venom | | ☐ |
| 76 | Side activities | | ☐ |
| 77 | Week 11 recap: showcase | | ☐ |
| 78 | Content freeze | | ☐ |
| 79 | Bug bash | | ☐ |
| 80 | Final performance | | ☐ |
| 81 | Trailer | | ☐ |
| 82 | Press kit and store page | | ☐ |
| 83 | Devlog archive in-game | | ☐ |
| 84 | Ship the demo | | ☐ |

---

## Hook bank

Openers that don't sound like a press release:

- "spent the whole day on 60 milliseconds."
- "deleted 41% of the city today."
- "the punch was coming out 3 frames late. it's 1 now."
- "i've had 19 silent actions in this game for months and never noticed."
- "nothing looks broken today, which means i probably broke something invisible."
- "watched someone play blind. they got stuck in the same doorway twice."
- "this took 6 hours and the clip is 4 seconds long."
- "the boss fight used to be a punching bag. now it has a phase 2."
- "cut a whole mission today. the game is better for it."
- "audio makes a 3-hour build feel like a real game. it's also the least fun thing to do."

Closers that invite a reply:

- "what would you fix first?"
- "does the landing read to you or is it just me?"
- "if this looks slow on your machine tell me your gpu."
- "clip is unedited, judge it."

---

## Entries

### Day 1 — Baseline, not vibes
- **Shipped:** F3 overlay and load marks; recorded the numbers before changing anything.
- **Number:** 47 fps downtown, 104 MB city, 3,271 draw calls.
- **Broke:** nothing yet — first day was measurement only.
- **Clip:** tools/devlog/d01.png
- **Post:** "day 1: didn't touch the game, just measured it. 104MB city, 3,271 draw calls, 47fps downtown. now i know what to fix."
