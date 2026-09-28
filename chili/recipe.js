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
  tagline: "The pot I actually make, scaled to whatever you've got.",
  intro: "Thick, well spiced, kid-approved. Set the amount of beef and the whole recipe follows.",

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
    { id: "meat",   name: "Meat & veg",     hint: "All the knife work can be done sitting down." },
    { id: "cans",   name: "Cans",           hint: "Drain and rinse the beans. Not the tomatoes." },
    { id: "pantry", name: "Wet, sweet & smoky", hint: "" },
    { id: "spice",  name: "The spice bowl", hint: "Measure into one bowl; they go in together." }
  ],

  items: [
    { id: "beef", group: "meat", name: "Ground beef, 80/20", short: "ground beef", measure: "mass", per: 453.592,
      note: "The fat is flavour. Leaner beef makes a thinner chili." },

    { id: "salt", group: "meat", name: "Kosher salt, for the beef", short: "kosher salt", measure: "spice", per: 1,
      note: "Use half as much if it's table salt." },

    { id: "onion", group: "meat", name: "Yellow onion, diced", measure: "mass", per: 150,
      each: { g: 150, one: "medium yellow onion", many: "medium yellow onions" },
      note: "Or two large for the full pot — one white and one yellow is good too." },

    { id: "pepper", group: "meat", name: "Green bell pepper, diced", measure: "mass", per: 55, optional: true,
      each: { g: 165, one: "large green pepper", many: "large green peppers" },
      note: "You'll taste it. Leave it out for a rounder, sweeter pot." },

    { id: "jalapeno", group: "meat", name: "Jalapeño, finely diced", measure: "mass", per: 20,
      each: { g: 30, one: "jalapeño", many: "jalapeños" },
      note: "Seeds and ribs out for kids; in for heat." },

    { id: "tomatoes", group: "cans", name: "Fire-roasted diced tomatoes", short: "fire-roasted diced tomatoes",
      measure: "can", can: "tomato", per: 1,
      note: "Juice and all. Fire-roasted matters — plain diced tastes flatter." },

    { id: "kidneyDark", group: "cans", name: "Dark red kidney beans", short: "dark red kidney beans",
      measure: "can", can: "bean", per: 2 / 3,
      apportion: "beans", drain: true, note: "The main bean." },

    { id: "kidneyLight", group: "cans", name: "Light red kidney beans", short: "light red kidney beans",
      measure: "can", can: "bean", per: 2 / 3,
      apportion: "beans", drain: true, note: "Softer, and a lighter red." },

    { id: "black", group: "cans", name: "Black beans", short: "black beans", measure: "can", can: "bean", per: 1 / 3,
      apportion: "beans", drain: true, note: "Depth, and dark flecks in the bowl." },

    { id: "white", group: "cans", name: "Great northern or white beans", short: "white beans",
      measure: "can", can: "bean", per: 1 / 3,
      apportion: "beans", drain: true, optional: true,
      note: "Just for looks — pale beans in a dark pot." },

    { id: "paste", group: "pantry", name: "Tomato paste", short: "tomato paste", measure: "volume", per: 30,
      note: "Stir until it disappears; lumps taste raw." },

    { id: "sauce", group: "pantry", name: "Tomato sauce", short: "tomato sauce", measure: "volume", per: 60,
      note: "Just a little — more and it turns into pasta sauce." },

    { id: "chipotle", group: "pantry", name: "Chipotle in adobo, minced", measure: "mass", per: 8, optional: true,
      each: { g: 12, one: "chipotle pepper", many: "chipotle peppers" },
      note: "Smoke and slow heat. Freeze the rest of the can, one pepper per ice-cube slot." },

    { id: "broth", group: "pantry", name: "Beef broth", short: "beef broth", measure: "volume", per: 315,
      note: "A quart for every three pounds of beef." },

    { id: "sugar", group: "pantry", name: "Sugar", short: "sugar", measure: "spice", per: 1,
      note: "Balances the salt. You won't taste it as sweet." },

    { id: "chili", group: "spice", name: "Chili powder", short: "chili powder", measure: "spice", per: 7.5, hold: 1.5,
      note: "The main flavour. Some is kept back for tasting — and have extra, since the taste test often wants more." },

    { id: "paprika",      group: "spice", name: "Smoked paprika", short: "smoked paprika", measure: "spice", per: 1,
      note: "Smoke without heat, and a deeper red." },
    { id: "cumin",        group: "spice", name: "Ground cumin",  short: "ground cumin", measure: "spice", per: 1,
      note: "Earthy and warm. Don't add more — it takes over." },
    { id: "garlicPowder", group: "spice", name: "Garlic powder", short: "garlic powder", measure: "spice", per: 1 },
    { id: "onionPowder",  group: "spice", name: "Onion powder",  short: "onion powder", measure: "spice", per: 1 },
    { id: "oregano",      group: "spice", name: "Dried oregano, Mexican if you can", short: "dried oregano", measure: "spice", per: 0.5,
      note: "Crush it between your palms as it goes in. Italian works too." },
    { id: "flakes",       group: "spice", name: "Red pepper flakes", short: "red pepper flakes", measure: "spice", per: 0.5,
      note: "Heat that builds slowly." },
    { id: "cayenne",      group: "spice", name: "Cayenne", short: "cayenne", measure: "spice", per: 0.125, optional: true,
      note: "Skip it for kids. Keep it handy — the taste test may call for it." }
  ],

  steps: [
    { id: "prep", title: "Line it all up",
      effort: ["sit"], minutes: 10,
      uses: ["onion", "pepper", "jalapeno", "chipotle", "kidneyDark", "kidneyLight", "black", "white",
             "chili", "paprika", "cumin", "garlicPowder", "onionPowder", "oregano", "flakes", "cayenne"],
      go: [
        "Dice the onion and bell pepper. Dice the jalapeño fine, then wash your hands.",
        "Mince the chipotle, if using.",
        "Drain and rinse the beans.",
        "Measure the spices into one bowl. Put the kept-back chili powder in a separate cup."
      ],
      why: "Everything after this moves fast. Do the slow work now, sitting down." },

    { id: "brown", title: "Brown the beef",
      effort: ["hot"], minutes: 8,
      uses: ["beef", "salt"],
      go: [
        "Big pot, medium-high heat, no oil.",
        "Add the beef and salt. Break it up, then let it sit a minute at a time to brown.",
        "Done when no pink is left and some of it is deep brown."
      ],
      why: "The brown bits on the bottom are the best flavour in the pot. The broth lifts them later." },

    { id: "fat", title: "Pour off most of the fat",
      effort: ["hot", "lift"], minutes: 2,
      go: [
        "Ladle the fat off — no need to lift the pot.",
        "Leave about a tablespoon for the spices."
      ],
      why: "All the fat makes it greasy; none makes it flat." },

    { id: "veg", title: "Onion, peppers and jalapeño in",
      effort: ["hot"], minutes: 5,
      uses: ["onion", "pepper", "jalapeno"],
      go: [
        "Add them to the beef.",
        "Stir now and then until the onion is soft and clear, 4–5 minutes."
      ] },

    { id: "bloom", title: "Wake the spices up",
      effort: ["hot"], minutes: 1,
      uses: ["chili", "paprika", "cumin", "garlicPowder", "onionPowder", "oregano", "flakes", "cayenne"],
      go: [
        "Add the spice bowl. Leave the kept-back chili powder in its cup.",
        "Stir constantly for one minute."
      ],
      why: "A minute in hot fat wakes the spices up. Skip it and the chili tastes dusty." },

    { id: "tomato", title: "Tomatoes, paste, sauce, chipotle",
      effort: ["hot"], minutes: 3,
      uses: ["tomatoes", "paste", "sauce", "chipotle"],
      go: [
        "Add the tomatoes with their juice, then the paste, sauce and chipotle.",
        "Stir until no lumps of paste are left."
      ] },

    { id: "beans", title: "Beans in",
      effort: ["hot"], minutes: 2,
      uses: ["kidneyDark", "kidneyLight", "black", "white"],
      go: [
        "Add them all at once.",
        "Fold gently so they don't break."
      ] },

    { id: "broth", title: "Broth and sugar",
      effort: ["hot"], minutes: 3,
      uses: ["broth", "sugar"],
      go: [
        "Pour in the broth, scraping the bottom as you go.",
        "Add the sugar. Bring to a slow bubble."
      ],
      why: "The sugar balances the salt; it won't taste sweet." },

    { id: "simmer", title: "Simmer",
      effort: ["wait"], minutes: 15, timer: 15,
      go: [
        "Lid off, low heat, a lazy bubble.",
        "Stir every few minutes so nothing sticks.",
        "15 minutes is enough; an hour is better."
      ],
      why: "Keep the lid off — that's how it thickens.",
      bigPotNote: "At this size, give it 25–30 minutes." },

    { id: "taste", title: "Taste, then control",
      effort: ["sit"], minutes: 5,
      go: [
        "Taste a cooled spoonful from the middle of the pot.",
        "Use the card below. One change at a time: stir, wait a minute, taste again."
      ],
      why: "This is where it becomes your chili." },

    { id: "serve", title: "Bowls",
      effort: ["sit"], minutes: 5,
      go: [
        "Cheddar first so it melts, then sour cream, onion, whatever's in the fridge.",
        "Serve with cornbread, oyster crackers or Fritos."
      ] }
  ],

  /* the taste-and-control card. `per` is per pound of beef. */
  taste: [
    { id: "flat", karl: true,
      when: "It tastes like not much.",
      fix: "Salt", item: "salt", per: 0.25,
      how: "Stir in, wait a full minute, taste. Salt turns up every flavour already there." },

    { id: "savoury", karl: true,
      when: "Heavy and savoury, nothing to balance it.",
      fix: "Sugar", item: "sugar", per: 0.25,
      how: "Balances the salt. It won't taste sweet." },

    { id: "meaty", karl: true,
      when: "Tastes like meat and beans, not chili.",
      fix: "The chili powder you kept back", item: "chili", per: 1.5,
      how: "Stir it all in and simmer two minutes before tasting — it tastes raw at first. Still not there? Add more from the jar, a little at a time." },

    { id: "mild",
      when: "Not hot enough for the grown-ups.",
      fix: "Cayenne", item: "cayenne", per: 0.125,
      how: "A pinch at a time; wait two minutes between. Heat builds as it sits. Feeding kids? Add it to the grown-up bowls instead." },

    { id: "hot",
      when: "Too spicy for the kids.",
      fix: "Broth, and a pinch of sugar", item: "broth", per: 60,
      how: "Broth dilutes, sugar softens, and sour cream in the bowl does the rest. Next time: seed the jalapeño and skip the cayenne and chipotle." },

    { id: "thin",
      when: "Too thin — more soup than chili.",
      fix: "Time, lid off",
      how: "Ten more minutes at a lazy bubble, uncovered." },

    { id: "thick",
      when: "Too thick, or sticking to the bottom.",
      fix: "Broth", item: "broth", per: 60,
      how: "A splash at a time. Turn the heat down and scrape the bottom." }
  ],

  notes: [
    { title: "It's better tomorrow",
      body: "It improves overnight. Reheat low with a splash of broth." },
    { title: "Keeping it",
      body: "Four days in the fridge, three months frozen. Freeze it flat in bags to thaw fast." },
    { title: "Where the numbers came from",
      body: "My pot is three pounds of beef, two large onions, three cans of tomatoes, six cans of beans and a quart of broth. The 3 lb setting is that pot exactly; everything else is scaled from it." }
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
                 note: "Swap it pound for pound. Or use 1 cup dry brown lentils per pound, cooked until just tender." },
        salt:  { name: "Kosher salt, for the crumbles" },
        broth: { name: "Vegetable broth", short: "vegetable broth",
                 note: "A rich one — mushroom broth is best." }
      },
      add: [
        { after: "salt", item: { id: "oil", group: "meat", name: "Olive or vegetable oil", short: "oil", measure: "volume", per: 15,
          note: "Replaces the beef fat, so the spices have something to bloom in." } },
        { after: "sugar", item: { id: "soy", group: "pantry", name: "Soy sauce", short: "soy sauce", measure: "spice", per: 1,
          note: "Adds the savoury depth beef would. You won't taste the soy." } }
      ],
      drop: ["fat"],
      steps: {
        brown: { title: "Brown the crumbles",
          uses: ["oil", "beef", "salt"],
          go: [
            "Big pot, medium-high heat. Add the oil and let it shimmer.",
            "Add the crumbles and salt. Break them up, then let them sit a minute at a time to brown.",
            "Done when the edges are crisp and brown. Don't stir it to mush."
          ],
          why: "It browns faster than beef and gives off no fat — the oil does that job." },
        veg: { go: [
            "Add them to the crumbles.",
            "Stir now and then until the onion is soft and clear, 4–5 minutes."
          ] },
        broth: { title: "Broth, soy and sugar",
          uses: ["broth", "soy", "sugar"],
          go: [
            "Pour in the broth, scraping the bottom as you go.",
            "Add the soy sauce and sugar. Bring to a slow bubble."
          ] }
      }
    }
  }
};

})();
