/* recipe.js — the chili, written as data instead of prose.

   The whole point of this file is that the page never contains a
   number. Every amount lives here, once, written per **one pound of
   ground beef** — so scaling the pot is a single multiply and nothing
   can drift out of step with anything else. Change a number here and
   the shopping list, the steps, and the taste-and-control card all
   change together.

   THE FORMAT ------------------------------------------------------

   base      how much beef one unit of this recipe is built around.
             Everything else is "per that". 1 lb, always, because a
             pound of beef is the one thing every cook can picture.

   items[]   the ingredients. Each carries:
       id        referenced by steps and by the taste card
       group     which block of the shopping list it lands in
       name      what it's called on the page
       short     what it's called mid-sentence, inside a step
       measure   how the number is meant:
                   "mass"   → per is GRAMS
                   "volume" → per is MILLILITRES
                   "spice"  → per is TEASPOONS (spoons stay spoons in
                              both unit systems — no home cook weighs
                              cumin, in any country)
                   "can"    → per is CANS, of the size named in `can`
       per       the amount for one pound of beef
       each      optional: what one of the whole thing weighs, so 150 g
                 of onion can be shown as "1 medium onion" and 450 g as
                 "3 medium onions"
       apportion optional: a family name. Everything in a family gets
                 shared out to whole cans together (see app.js) so a
                 half-pound pot doesn't ask for a third of a can of
                 black beans.
       optional  true if the pot is still the pot without it
       hold      optional: teaspoons per pound kept OUT of the pot until
                 the taste test. The list shows the whole amount (it's
                 what you buy); the steps show "this much now, this much
                 kept back", and the taste card spends the rest.
       note      the one line worth knowing about it

   steps[]   the order of operations. `uses` names item ids, and the
             step renders their scaled amounts inline — which is what
             makes the page glanceable while you cook: the number is
             where your eyes already are, not back up in a list.
             `effort` is not decoration. It marks which steps are hot,
             which are heavy, and which can be done sitting down, so a
             pot can be cooked by two people with different amounts of
             strength between them and everybody knows who has what.

   taste[]   the taste-and-control card: a symptom, its fix, and how
             much of the fix per pound of beef.

   swaps     alternative versions of the pot. Each one renames items,
             adds items, rewrites or drops steps — by id — and the page
             applies it on top of the recipe above, so the amounts are
             still written exactly once.

   Karl's original, for the record, is a three-pound pot. Every number
   below is that pot divided by three.                                */
(function () {
"use strict";

window.CHILI = {
  id: "kitchen-table-chili",
  title: "Kitchen Table Chili",
  tagline: "The pot I actually make, divided by three so you can test it.",
  intro: "Properly spiced, thick, kid-approved. It is not a competition chili and does not want to be — " +
         "it wants to be a bowl on a Tuesday with cheese melting into it. Everything below is per pound " +
         "of beef; turn the dial and the whole recipe follows.",

  /* one pound of 80/20, and the finished volume it turns into */
  base: { id: "beef", grams: 453.592 },
  yield: { mlPerLb: 1800, bowlMl: 350, kidBowlMl: 240 },
  pot: { headroom: 1.35 },         /* the pot wants this much room over the food: an 8-quart pot for the 3 lb original */

  /* the cans as they sit on the shelf */
  cans: {
    tomato: { name: "diced tomatoes", oz: 14.5, g: 411, usableG: 411 },
    bean:   { name: "beans",          oz: 15.5, g: 439, usableG: 255 }
  },

  groups: [
    { id: "meat",   name: "Meat & veg",     hint: "The knife work — all of it can be done sitting down." },
    { id: "cans",   name: "Cans",           hint: "Beans get drained and rinsed. Tomatoes do not." },
    { id: "pantry", name: "Wet, sweet & smoky", hint: "" },
    { id: "spice",  name: "The spice bowl", hint: "Measure these into one bowl and they go in as one move." }
  ],

  items: [
    { id: "beef", group: "meat", name: "Ground beef, 80/20", short: "ground beef", measure: "mass", per: 453.592,
      note: "The 20 is the point. Leaner beef makes a thinner, quieter chili." },

    { id: "salt", group: "meat", name: "Kosher salt, for the beef", short: "kosher salt", measure: "spice", per: 1,
      note: "Half as much if it's fine table salt. This is the salt you'll be balancing later with sugar." },

    { id: "onion", group: "meat", name: "Yellow onion, diced", measure: "mass", per: 150,
      each: { g: 150, one: "medium yellow onion", many: "medium yellow onions" },
      note: "Two large yellow — or one white and one yellow — is how the full pot goes." },

    { id: "pepper", group: "meat", name: "Green bell pepper, diced", measure: "mass", per: 55, optional: true,
      each: { g: 165, one: "large green pepper", many: "large green peppers" },
      note: "Optional, and it does show up. Leave it out for a rounder, sweeter pot." },

    { id: "jalapeno", group: "meat", name: "Jalapeño, finely diced", measure: "mass", per: 20,
      each: { g: 30, one: "jalapeño", many: "jalapeños" },
      note: "Fresh chile, green and bright. Seeds and ribs out for the kids' pot; left in if it's only grown-ups." },

    { id: "tomatoes", group: "cans", name: "Fire-roasted diced tomatoes", short: "fire-roasted diced tomatoes",
      measure: "can", can: "tomato", per: 1,
      note: "Juice and all — these are not drained. Fire-roasted is doing real work here; plain diced is a different chili." },

    { id: "kidneyDark", group: "cans", name: "Dark red kidney beans", short: "dark red kidney beans",
      measure: "can", can: "bean", per: 2 / 3,
      apportion: "beans", drain: true, note: "The backbone bean." },

    { id: "kidneyLight", group: "cans", name: "Light red kidney beans", short: "light red kidney beans",
      measure: "can", can: "bean", per: 2 / 3,
      apportion: "beans", drain: true, note: "Softer than the dark, and a lighter red in the bowl." },

    { id: "black", group: "cans", name: "Black beans", short: "black beans", measure: "can", can: "bean", per: 1 / 3,
      apportion: "beans", drain: true, note: "For depth and for the dark flecks." },

    { id: "white", group: "cans", name: "Great northern or white beans", short: "white beans",
      measure: "can", can: "bean", per: 1 / 3,
      apportion: "beans", drain: true, optional: true,
      note: "Optional, and purely for colour — pale beans through a dark pot make it look like somebody cared." },

    { id: "paste", group: "pantry", name: "Tomato paste", short: "tomato paste", measure: "volume", per: 30,
      note: "Stir it until you can't see it. Undissolved paste tastes like a mistake." },

    { id: "sauce", group: "pantry", name: "Tomato sauce", short: "tomato sauce", measure: "volume", per: 60,
      note: "A bit, not a lot. It rounds the edges; too much and you've made pasta sauce." },

    { id: "chipotle", group: "pantry", name: "Chipotle in adobo, minced", measure: "mass", per: 8, optional: true,
      each: { g: 12, one: "chipotle pepper", many: "chipotle peppers" },
      note: "Smoke and a slow, deep heat. The rest of the can freezes fine in an ice-cube tray, one pepper per cube." },

    { id: "broth", group: "pantry", name: "Beef broth", short: "beef broth", measure: "volume", per: 315,
      note: "A quart to three pounds of beef, which is where this number comes from." },

    { id: "sugar", group: "pantry", name: "Sugar", short: "sugar", measure: "spice", per: 1,
      note: "One spoonful, to answer the salt. You will not taste it as sweet — you'll taste it as balanced." },

    { id: "chili", group: "spice", name: "Chili powder", short: "chili powder", measure: "spice", per: 7.5, hold: 1.5,
      note: "Lots of it — this is what makes it taste like chili and not beef stew. A fifth of it stays out of the pot " +
            "until the taste test, and the jar wants a little more than this in it: the taste test usually asks for it." },

    { id: "paprika",      group: "spice", name: "Smoked paprika", short: "smoked paprika", measure: "spice", per: 1,
      note: "Smoke without heat, and a deeper red in the bowl." },
    { id: "cumin",        group: "spice", name: "Ground cumin",  short: "ground cumin", measure: "spice", per: 1,
      note: "Earthy and warm. Enough to know it's there; any more and it's a cumin chili." },
    { id: "garlicPowder", group: "spice", name: "Garlic powder", short: "garlic powder", measure: "spice", per: 1 },
    { id: "onionPowder",  group: "spice", name: "Onion powder",  short: "onion powder", measure: "spice", per: 1 },
    { id: "oregano",      group: "spice", name: "Dried oregano, Mexican if you can", short: "dried oregano", measure: "spice", per: 0.5,
      note: "Rub it between your palms as it goes in. Mexican oregano is citrusy; the Italian kind is fine too." },
    { id: "flakes",       group: "spice", name: "Red pepper flakes", short: "red pepper flakes", measure: "spice", per: 0.5,
      note: "The heat that arrives late; chili powder is the heat that arrives on time." },
    { id: "cayenne",      group: "spice", name: "Cayenne", short: "cayenne", measure: "spice", per: 0.125, optional: true,
      note: "Leave it out for kids. Have the jar out anyway — the taste card reaches for it if the pot needs more fire." }
  ],

  steps: [
    { id: "prep", title: "Line it all up",
      effort: ["sit"], minutes: 10,
      uses: ["onion", "pepper", "jalapeno", "chipotle", "kidneyDark", "kidneyLight", "black", "white",
             "chili", "paprika", "cumin", "garlicPowder", "onionPowder", "oregano", "flakes", "cayenne"],
      go: [
        "Dice the onion, and the bell pepper if you're using one. Dice the jalapeño fine — wash your hands after.",
        "Mince the chipotle, if it's going in.",
        "Open the beans, tip them into a strainer, rinse them and leave them to drain.",
        "Measure every spice into one small bowl — except the chili powder you're keeping back. That goes in a cup of its own, beside the stove."
      ],
      why: "Everything after this happens hot and fast. Do the slow work first, sitting down, and the rest of the recipe is just pouring things in." },

    { id: "brown", title: "Brown the beef",
      effort: ["hot"], minutes: 8,
      uses: ["beef", "salt"],
      go: [
        "Big pot on medium-high. No oil — the beef brings its own.",
        "Beef in, salt over the top, then break it apart and leave it alone for a minute at a time.",
        "Done when there's no pink left and some of it has gone properly brown."
      ],
      why: "The brown bits stuck to the bottom of the pot are the deepest flavour in the whole recipe. You'll lift them off with the broth later." },

    { id: "fat", title: "Pour off most of the fat",
      effort: ["hot", "lift"], minutes: 2,
      go: [
        "Tip the pot and spoon or pour the fat off — a ladle works and never needs the pot lifted.",
        "Leave about a tablespoon in. The spices need fat to bloom in."
      ],
      why: "80/20 gives up a lot of fat. All of it left in makes a greasy pot; all of it out makes a flat one." },

    { id: "veg", title: "Onion, peppers and jalapeño in",
      effort: ["hot"], minutes: 5,
      uses: ["onion", "pepper", "jalapeno"],
      go: [
        "Straight in on top of the beef.",
        "Stir now and then for four or five minutes, until the onion has gone soft and see-through."
      ] },

    { id: "bloom", title: "Wake the spices up",
      effort: ["hot"], minutes: 1,
      uses: ["chili", "paprika", "cumin", "garlicPowder", "onionPowder", "oregano", "flakes", "cayenne"],
      go: [
        "The whole spice bowl into the pot. The kept-back chili powder stays in its cup — that's for the taste test.",
        "Stir constantly for one minute, no longer."
      ],
      why: "Chili powder is mostly oil-soluble. One minute in hot fat is the difference between chili that smells like chili and chili that tastes dusty." },

    { id: "tomato", title: "Tomatoes, paste, sauce, chipotle",
      effort: ["hot"], minutes: 3,
      uses: ["tomatoes", "paste", "sauce", "chipotle"],
      go: [
        "Tomatoes in with their juice. Paste, sauce and chipotle after them.",
        "Stir until there is not one orange lump of paste left."
      ] },

    { id: "beans", title: "Beans in",
      effort: ["hot"], minutes: 2,
      uses: ["kidneyDark", "kidneyLight", "black", "white"],
      go: [
        "Drained and rinsed, all of them at once.",
        "Fold rather than stir — beans break if you're rough with them."
      ] },

    { id: "broth", title: "Broth and sugar",
      effort: ["hot"], minutes: 3,
      uses: ["broth", "sugar"],
      go: [
        "Pour the broth in and scrape the bottom of the pot while you do it.",
        "Sugar in. Bring it up until it bubbles slowly."
      ],
      why: "The sugar is here to answer the salt you put on the beef, not to make it sweet." },

    { id: "simmer", title: "Simmer",
      effort: ["wait"], minutes: 15, timer: 15,
      go: [
        "Lid off, heat low, a lazy bubble.",
        "Stir every few minutes so nothing catches on the bottom.",
        "Fifteen minutes is enough. Longer is better, and an hour is better still."
      ],
      why: "Lid off matters — that's how it thickens.",
      bigPotNote: "Bigger pot, more time: give it 25–30 minutes at this size." },

    { id: "taste", title: "Taste, then control",
      effort: ["sit"], minutes: 5,
      go: [
        "Take a spoonful off the middle of the pot and let it cool a second.",
        "Then use the card below — one change at a time, stir, wait a minute, taste again."
      ],
      why: "This step is the actual recipe. Everything above it is just getting to a pot worth adjusting." },

    { id: "serve", title: "Bowls",
      effort: ["sit"], minutes: 5,
      go: [
        "Shredded cheddar first, so it melts into it. Then sour cream, onion, whatever else is in the door of the fridge.",
        "Cornbread, oyster crackers, or Fritos, which the kids will pick anyway."
      ] }
  ],

  /* the taste-and-control card. `per` is per pound of beef. */
  taste: [
    { id: "flat", karl: true,
      when: "It tastes like… not much.",
      fix: "Salt", item: "salt", per: 0.25,
      how: "Stir it in, wait a full minute, taste again. Salt doesn't add a flavour — it turns up every flavour already in the pot, and it needs a moment to spread." },

    { id: "savoury", karl: true,
      when: "It's heavy and savoury, with nothing to balance it.",
      fix: "Sugar", item: "sugar", per: 0.25,
      how: "This is the answer to having salted the meat. You are not making it sweet; you're giving the salt something to push against." },

    { id: "meaty", karl: true,
      when: "You taste meat and beans — not chili.",
      fix: "The chili powder you kept back", item: "chili", per: 1.5,
      how: "All of it, stirred in, then two minutes of simmering before you judge it — powder tastes raw for the first minute. Still not chili? More from the jar, a little at a time, simmering between. This is the one to keep reaching for until it's right." },

    { id: "mild",
      when: "Not enough fire for the grown-ups.",
      fix: "Cayenne", item: "cayenne", per: 0.125,
      how: "A pinch at a time, stirred, two minutes, taste. Heat builds as it sits, so go slower than you want to. Feeding kids too? Stir it into the grown-up bowls instead of the pot." },

    { id: "hot",
      when: "Too spicy for the kids.",
      fix: "Broth, and a little sugar", item: "broth", per: 60,
      how: "Broth to dilute, a pinch of sugar to soften the edge, and a bowl with sour cream stirred in fixes almost anything. Next time: jalapeño seeds out, and no cayenne or chipotle. Don't chase it with more tomato — that flattens it." },

    { id: "thin",
      when: "Too thin, more soup than chili.",
      fix: "Time, lid off",
      how: "Ten more minutes at a lazy bubble with nothing over it. Thickening chili is almost always evaporation, not flour." },

    { id: "thick",
      when: "Too thick, or it's catching on the bottom.",
      fix: "Broth", item: "broth", per: 60,
      how: "A splash at a time, heat down, and scrape the bottom properly with a flat spoon." }
  ],

  notes: [
    { title: "It's better tomorrow",
      body: "Every part of this improves overnight in the fridge. Make it the day before if you can; reheat it low and slow with a splash of broth." },
    { title: "Keeping it",
      body: "Four days in the fridge, three months in the freezer. Freeze it flat in bags and it thaws in minutes." },
    { title: "Where the numbers came from",
      body: "The pot I make is three pounds of beef, two large onions, three cans of fire-roasted tomatoes, six cans of beans and a quart of broth. Everything on this page is that pot divided by three, so at the 3 lb setting you are looking at the original, unrounded. The spice bowl has since been turned up: more chili powder, smoked paprika, oregano, a jalapeño or two and a chipotle for smoke." }
  ],

  /* ---- the vegetarian pot -----------------------------------------
     Same dial, same spice, same beans. Plant-based ground stands in for
     the beef pound for pound; what the beef brought besides itself has
     to be put back on purpose: fat to brown in and bloom the spices
     (oil), and the deep savoury note (a little soy sauce). Nothing
     renders out, so the fat step goes.                                */
  swaps: {
    veg: {
      label: "Vegetarian",
      protein: "plant-based ground",
      dialTitle: "How much plant-based ground have you got?",
      dialOf: "of plant-based ground",
      items: {
        beef:  { name: "Plant-based ground (Impossible, Beyond or similar)", short: "plant-based ground",
                 note: "Pound for pound where the beef was. Or 1 cup of dry brown lentils per pound, simmered until just tender." },
        salt:  { name: "Kosher salt, for the crumbles" },
        broth: { name: "Vegetable broth", short: "vegetable broth",
                 note: "A rich one — mushroom broth is even better. The broth is doing the beef's job now." }
      },
      add: [
        { after: "salt", item: { id: "oil", group: "meat", name: "Olive or vegetable oil", short: "oil", measure: "volume", per: 15,
          note: "The beef brought its own fat. This is that fat, put back on purpose so the spices have something to bloom in." } },
        { after: "sugar", item: { id: "soy", group: "pantry", name: "Soy sauce", short: "soy sauce", measure: "spice", per: 1,
          note: "The savoury depth the beef used to bring. You won't taste soy — you'll taste chili that isn't missing anything." } }
      ],
      drop: ["fat"],
      steps: {
        brown: { title: "Brown the crumbles",
          uses: ["oil", "beef", "salt"],
          go: [
            "Big pot on medium-high, oil in, and wait until it shimmers.",
            "Crumbles in, salt over the top. Break them up, then leave them alone for a minute at a time.",
            "Done when there are properly browned, crisp edges. Don't stir it to mush."
          ],
          why: "Plant-based ground browns faster than beef and never gives up fat, so the oil is doing that job. The brown bits on the pot are still the deepest flavour you'll get." },
        veg: { go: [
            "Straight in on top of the crumbles.",
            "Stir now and then for four or five minutes, until the onion has gone soft and see-through."
          ] },
        broth: { title: "Broth, soy and sugar",
          uses: ["broth", "soy", "sugar"],
          go: [
            "Pour the broth in and scrape the bottom of the pot while you do it.",
            "Soy sauce and sugar in. Bring it up until it bubbles slowly."
          ] }
      }
    }
  }
};

})();
