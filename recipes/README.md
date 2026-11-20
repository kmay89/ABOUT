# The recipe book

Every recipe on the kitchen table, and the parts they share. Live at
[kmay89.com/recipes](https://kmay89.com/recipes/).

| file | what it is |
| --- | --- |
| `index.html` | **the book**: a contents page with a card for every recipe. |
| `book.js` | **the table of contents.** One entry per recipe. The book page lists them, and every recipe page shows the others on its "More from the recipe book" shelf. |
| `app.js` | the calculator every recipe page runs on: the unit engine, the whole-can arithmetic, cook mode, read-aloud and the timer. It knows nothing about any one dish. |
| `kitchen.css` | the look every recipe page shares. |

The recipes themselves:

| recipe | folder |
| --- | --- |
| Kitchen Table Chili | [`chili/`](../chili/) — the first one, and where the recipe format is documented in full |
| Weeknight Beef Stroganoff | [`stroganoff/`](../stroganoff/) |

New recipes go in a folder of their own **inside this one**, as
`recipes/<name>/`, and live at `kmay89.com/recipes/<name>/`.

## Adding a recipe

The easy way is to ask Claude: *"Add a recipe for chicken pot pie to the
recipe book."* It follows the steps below.

By hand, it's five steps and no build:

1. **Make the folder.** Copy `stroganoff/index.html` and
   `stroganoff/recipe.js` into `recipes/<name>/`, say
   `recipes/chicken-pot-pie/`. Use lowercase and hyphens.

2. **Write the recipe** in its `recipe.js`. Every amount is written once,
   per one unit of the main ingredient — a pound of steak, a pound of
   chicken — and the page multiplies. The fields are documented in
   [`chili/README.md`](../chili/README.md). The ones most worth setting:
   - `id`, `title`, `url` (`"kmay89.com/recipes/<name>"`) and
     `storageKey` (`"<name>.v1"`, so the page remembers its own ticks)
   - `base`: the main ingredient, in grams, usually `453.592` for a pound
   - `dial`: what the dial weighs (`protein`, `title`, `of`), its
     presets, and `maxLb`
   - `yield`: `{ serves, kids, word, over }` for plates, or the chili's
     `{ mlPerLb, bowlMl, kidBowlMl }` and `pot` for a ladled pot
   - `pans`: the pan to use, by how much is in it
   - `items`, `steps`, `taste`, `notes`, and optionally `swaps.veg` for a
     vegetarian version. Leave `swaps` out and the Beef / Vegetarian
     switch hides itself.

3. **Fix the page's words** in its `index.html`: the `<meta>`
   description, canonical and `og:` lines, the `<title>`, the `h1`,
   tagline and intro, the dial's heading and "of …" line, the "about
   how long" line above the steps, the footer's "per pound of …", and
   `data-here="<name>"` on the shelf. Change the accent colours in the
   small `<style>` block, or delete it to use the chili's red.

4. **Put it in the book.** Add an entry at the top of `recipes` in
   `book.js`, with `id: "<name>"` and `href: "/recipes/<name>/"`. That
   one entry puts it on the book page and on every other recipe's shelf.

5. **Add it to `sitemap.xml`.**

## Checking it

The pages load their shared files from `/recipes/`, so open them through
a server rather than straight from disk. From the top of the repo:

```sh
python3 -m http.server 8000
```

Then visit `localhost:8000/recipes/` and open the new card. Walk the dial
from smallest to largest in both American and metric, and read every
line: no "0 tsp", no spoon that isn't in a drawer, nothing that reads
oddly said out loud. Flip to the vegetarian version if there is one.
