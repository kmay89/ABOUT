# The chili — a recipe written as code

Three files, no build step, no dependencies, same as everything else on
this desk:

| file | what it is |
| --- | --- |
| `recipe.js` | **the recipe.** Every amount, written once, per one pound of ground beef. This is the only file to edit when the pot changes. |
| `app.js` | the calculator: the unit engine, the whole-can arithmetic, and cook mode. It knows nothing about chili. |
| `index.html` | the page and its styles. |

Live at [kmay89.com/chili](https://kmay89.com/chili/).

## Why per one pound

The pot I actually make is three pounds of beef. Writing the recipe at
three pounds means every other size is somebody's mental arithmetic, in
a kitchen, with the pan already hot. Writing it at **one pound** makes
scaling a single multiply — and it makes the smallest useful test batch
the default, so a change to the recipe can be tried on a pound before
it's trusted with a Sunday.

At the 3 lb setting the page shows the original, unrounded: two large
onions' worth, three cans of tomatoes, 2/2/1/1 on the beans, a quart of
broth.

## Editing the recipe

Open `recipe.js`. Change a number. That's the whole procedure — the
shopping list, the amounts inside the steps, the taste-and-control
doses, the yield, and the pot size all follow from it.

### An ingredient

```js
{ id: "cumin", group: "spice", name: "Ground cumin", short: "ground cumin",
  measure: "spice", per: 0.5,
  note: "A touch. Cumin is loud and this is not a cumin chili." }
```

| field | meaning |
| --- | --- |
| `id` | how steps and the taste card refer to it |
| `group` | which block of the shopping list it lands in (see `groups`) |
| `name` | what it's called in the list |
| `short` | what it's called mid-sentence, inside a step |
| `measure` | how `per` is meant — see below |
| `per` | **the amount for one pound of beef** |
| `each` | optional `{ g, one, many }` so 150 g of onion reads "1 medium yellow onion" and 450 g reads "3 medium yellow onions" |
| `apportion` | optional family name — see *whole cans* |
| `optional` | true if the pot is still the pot without it |
| `note` | the one line worth knowing |

`measure` is one of:

- `"mass"` — `per` is **grams**. Shown as g/kg, or lb/oz.
- `"volume"` — `per` is **millilitres**. Shown as ml/L, or tsp → Tbsp → cups → quarts.
- `"spice"` — `per` is **teaspoons**. Spoons stay spoons in both systems; no home cook weighs cumin, in any country. Metric gets millilitres alongside.
- `"can"` — `per` is **cans**, of the size named in `can` (`"tomato"` or `"bean"`, defined at the top of the file).

### A step

```js
{ id: "bloom", title: "Wake the spices up",
  effort: ["hot"], minutes: 1,
  uses: ["chili", "garlicPowder", "onionPowder", "cumin", "flakes"],
  go: ["The whole spice bowl into the pot…", "Stir constantly for one minute."],
  why: "Chili powder is mostly oil-soluble…" }
```

`uses` names ingredient ids, and the step prints their scaled amounts as
chips at the top of itself. That is what makes the page glanceable while
you cook: the number is where your eyes already are, not back up in a
list you have to scroll to.

`effort` is not decoration. `"hot"`, `"lift"`, `"sit"` and `"wait"` mark
which steps are hot, which are heavy enough to be worth sharing, and
which can be done sitting down — so a pot can be cooked by two people
with different amounts of strength between them, and everybody can see
at a glance who has what.

`timer` (in minutes) puts an optional countdown on the step. Nothing on
the page is ever *on* a clock; the timer is a convenience and says so.

### The taste card

```js
{ id: "meaty", karl: true,
  when: "You taste meat and beans — not chili.",
  fix: "Chili powder", item: "chili", per: 1,
  how: "In, stirred, then two minutes of simmering before you judge it…" }
```

`per` is again per pound of beef, so the dose scales with the pot.
`karl: true` marks the three I reach for every time; they get a red edge.

## Whole cans, shared out honestly

The four beans are 2 : 2 : 1 : 1 in the original. Scaled to one pound
that's 0.67 : 0.67 : 0.33 : 0.33 cans, which is a silly thing to ask
anybody to open.

So with **whole cans** on, `canPlan()` rounds the family's *total* to
whole cans, hands every line its floor, and gives the leftovers to
whichever lines came closest to earning one — largest remainder, the
same apportionment used to hand out seats in a legislature. The totals
stay right and nobody opens a third of a can:

| beef | dark | light | black | white |
| --- | --- | --- | --- | --- |
| ½ lb | 1 | — | — | — |
| 1 lb | 1 | 1 | — | — |
| 1½ lb | 1 | 1 | 1 | — |
| 2 lb | 1 | 1 | 1 | 1 |
| 3 lb | 2 | 2 | 1 | 1 |

Turn whole cans off and every line shows its exact fraction with the
drained weight beside it, for anyone happy to keep half a can.

## What the page promises

- **Nothing needs a steady hand.** No dragging, no hovering, no holding,
  no double taps, no gestures, and nothing that has to happen before a
  timer runs out. Every control is a plain button of at least 48 px,
  most of them a good deal bigger.
- **Cook mode is one step at a time**, in type you can read from across
  the kitchen, with two enormous buttons fixed to the bottom of the
  screen so they're always in reach without scrolling. Left and right
  arrow keys walk it. Every step can be read out loud.
- **It remembers.** Batch size, units, ticked ingredients and which step
  you're on survive closing the page, and the size and units ride in the
  address bar so a link carries them.
- **It prints** onto a fridge-worthy page with the controls stripped out.
- **It works offline and stores nothing anywhere but your own browser.**

## Checking it

There's no test runner here; it's three files with no dependencies. What
is worth checking by hand after any change to `recipe.js`:

1. At 3 lb the shopping list matches the original pot: 3 cans of
   tomatoes, 2/2/1/1 on the beans, 4 cups (1 quart) of broth, and 450 g
   of onion — which is two large ones, or the three medium the page
   counts in.
2. The bean table above still holds at ½, 1, 1½, 2 and 3 lb.
3. Switching American ⇄ metric changes only the words, never the size of
   the pot.
