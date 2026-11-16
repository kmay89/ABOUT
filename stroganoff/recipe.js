/* recipe.js — the stroganoff, written as data instead of prose.

   Same format as the chili (see chili/recipe.js and chili/README.md for
   every field), read by the same calculator, chili/app.js. Every amount
   lives here once, written per **one pound of steak** — which feeds
   about four over noodles — so scaling is a single multiply.

   What's different from the chili is all said here, not in the code:

   dial      what the dial weighs (steak, not ground beef), its presets,
             and how far it goes.
   yield     counted in plates (`serves`, `kids` per pound) rather than
             ladled from a volume, because it goes onto noodles.
   pans      the pan to use, by how much steak: a skillet for a weeknight,
             a Dutch oven for a crowd.
   no cans   so the whole-cans switch hides itself.                    */
(function () {
"use strict";

window.RECIPE = {
  id: "weeknight-beef-stroganoff",
  title: "Weeknight Beef Stroganoff",
  url: "kmay89.com/stroganoff",
  storageKey: "stroganoff.v1",
  timesUp: "Time's up. Check the noodles.",

  /* one pound of steak, sliced into strips */
  base: { id: "steak", grams: 453.592 },
  yield: { serves: 4, kids: 6, word: "plate", over: "over noodles" },
  pans: [
    { upToLb: 2,  us: "a 12-inch skillet, and a big pot for the noodles",
                  metric: "a 30 cm frying pan, and a big pot for the noodles" },
    { upToLb: 4,  us: "a 5- or 6-quart Dutch oven, and your biggest pot for the noodles",
                  metric: "a 5- or 6-litre casserole pot, and your biggest pot for the noodles" },
    { upToLb: 99, us: "a 7-quart Dutch oven or bigger, and two pots for the noodles",
                  metric: "a 7-litre pot or bigger, and two pots for the noodles" }
  ],

  dial: {
    protein: "steak",
    title: "How much steak have you got?",
    of: "of sirloin steak",
    us: [{ lb: 1 }, { lb: 1.5 }, { lb: 2 }, { lb: 3 }],
    metric: [{ g: 500 }, { g: 750 }, { g: 1000 }, { g: 1500 }],
    maxLb: 6
  },

  groups: [
    { id: "meat",   name: "Steak & veg",   hint: "All the slicing can be done sitting down." },
    { id: "pan",    name: "For the pan",   hint: "" },
    { id: "sauce",  name: "The sauce",     hint: "Broth, Worcestershire and Dijon can wait together in one jug." },
    { id: "noodle", name: "Noodles",       hint: "" }
  ],

  items: [
    { id: "steak", group: "meat", name: "Sirloin steak, cut into thin strips", short: "steak", measure: "mass", per: 453.592,
      note: "Top sirloin is tender, beefy and not too dear. Ribeye if it's a special night." },

    { id: "mushrooms", group: "meat", name: "Cremini mushrooms, sliced", short: "mushrooms", measure: "mass", per: 227,
      note: "An 8 oz package per pound of steak. White button mushrooms work too." },

    { id: "onion", group: "meat", name: "Yellow onion, diced", measure: "mass", per: 110,
      each: { g: 110, one: "small yellow onion", many: "small yellow onions" },
      note: "Or half a big one." },

    { id: "garlic", group: "meat", name: "Garlic, minced", measure: "mass", per: 10,
      each: { g: 5, one: "garlic clove", many: "garlic cloves" } },

    { id: "oil", group: "pan", name: "Vegetable or olive oil", short: "oil", measure: "volume", per: 15,
      note: "For searing. It has to get hotter than butter can." },

    { id: "butter", group: "pan", name: "Butter", short: "butter", measure: "volume", per: 30,
      note: "For the mushrooms. If it's salted, go easy on salt at the end." },

    { id: "salt", group: "pan", name: "Kosher salt, for the steak", short: "kosher salt", measure: "spice", per: 0.75,
      note: "Use half as much if it's table salt. The broth brings salt too." },

    { id: "pepper", group: "pan", name: "Black pepper, freshly ground", short: "black pepper", measure: "spice", per: 0.5 },

    { id: "flour", group: "sauce", name: "All-purpose flour", short: "flour", measure: "spice", per: 4.5,
      note: "This is what thickens the sauce." },

    { id: "paprika", group: "sauce", name: "Paprika, sweet or smoked", short: "paprika", measure: "spice", per: 0.5, optional: true,
      note: "Warmth and a little colour. Not heat." },

    { id: "broth", group: "sauce", name: "Beef broth", short: "beef broth", measure: "volume", per: 240,
      note: "Low-sodium if you can, so you're the one deciding the salt." },

    { id: "worcestershire", group: "sauce", name: "Worcestershire sauce", short: "Worcestershire", measure: "spice", per: 3,
      note: "The secret to the deep, savoury flavour." },

    { id: "dijon", group: "sauce", name: "Dijon mustard", short: "Dijon", measure: "spice", per: 1,
      note: "You won't taste mustard. It keeps the cream from tasting flat." },

    { id: "sourCream", group: "sauce", name: "Sour cream, full-fat", short: "sour cream", measure: "volume", per: 160,
      note: "Out of the fridge while you cook. Cold or light sour cream is the kind that splits." },

    { id: "noodles", group: "noodle", name: "Wide egg noodles", short: "egg noodles", measure: "mass", per: 227,
      note: "Wide or extra-wide. A 12 oz bag does 1½ lb of steak." },

    { id: "noodleButter", group: "noodle", name: "Butter, for the noodles", short: "butter", measure: "volume", per: 15, optional: true,
      note: "Keeps them from sticking while the sauce finishes." },

    { id: "parsley", group: "noodle", name: "Fresh parsley, chopped", short: "parsley", measure: "spice", per: 6, optional: true,
      note: "For the top. Dill is the old-school choice." }
  ],

  steps: [
    { id: "prep", title: "Line it all up",
      effort: ["sit"], minutes: 10,
      uses: ["steak", "mushrooms", "onion", "garlic", "broth", "worcestershire", "dijon"],
      go: [
        "Slice the steak across the grain into strips about as thick as a pencil and as long as a finger.",
        "Slice the mushrooms. Dice the onion. Mince the garlic.",
        "Measure the broth, Worcestershire and Dijon into one jug.",
        "Take the sour cream out of the fridge."
      ],
      why: "Steak slices thinnest half-frozen. Fifteen minutes in the freezer and the knife glides." },

    { id: "water", title: "Noodle water on",
      effort: ["hot", "lift"], minutes: 2,
      go: [
        "Set your biggest pot on the stove and fill it there with a jug, so nobody carries a full pot.",
        "High heat, lid on. It takes a while to boil."
      ],
      why: "Starting it now means the noodles and the sauce finish together." },

    { id: "sear", title: "Sear the steak",
      effort: ["hot"], minutes: 6,
      uses: ["oil", "steak", "salt", "pepper"],
      go: [
        "Pat the strips dry, then toss them with the salt and pepper.",
        "Big skillet, medium-high heat. Add the oil and let it shimmer.",
        "Lay the strips in one layer with room between them. Do it in batches.",
        "About a minute a side, until brown outside and still pink inside. Out onto a plate."
      ],
      why: "Crowd the pan and the steak steams grey. It finishes in the sauce later, so pink is right.",
      bigPotNote: "At this size, sear in three or four batches. Add a little more oil if the pan looks dry." },

    { id: "mushrooms", title: "Mushrooms and onion",
      effort: ["hot"], minutes: 8,
      uses: ["butter", "mushrooms", "onion", "garlic"],
      go: [
        "Turn the heat to medium. Melt the butter in the same pan. Don't wash it.",
        "Add the mushrooms and leave them alone for 3 minutes so they brown.",
        "Add the onion. Stir now and then until it's soft and the mushrooms are golden, about 5 minutes.",
        "Garlic in for the last 30 seconds."
      ],
      why: "Mushrooms let out water first and brown once it cooks off. Stir too early and they just go soggy." },

    { id: "noodles", title: "Noodles in",
      effort: ["hot", "lift"], minutes: 8, timer: 7,
      uses: ["noodles", "noodleButter"],
      go: [
        "Once the water boils, salt it well and add the noodles.",
        "Cook until tender, 6–8 minutes. Keep going on the sauce while they cook.",
        "Drain, then toss with the butter so they don't stick."
      ],
      why: "Draining is the one heavy pour. Or lift the noodles out with tongs or a spider and skip it." },

    { id: "sauce", title: "Flour, then the broth",
      effort: ["hot"], minutes: 4,
      uses: ["flour", "paprika", "broth", "worcestershire", "dijon"],
      go: [
        "Sprinkle the flour and paprika over the mushrooms. Stir for 1 minute.",
        "Pour in the jug slowly, stirring and scraping the bottom as you go.",
        "Simmer 3–4 minutes, until it coats the back of a spoon."
      ],
      why: "The minute of stirring cooks out the raw flour taste. The brown bits from the steak become the gravy." },

    { id: "back", title: "Steak back in",
      effort: ["hot"], minutes: 2,
      go: [
        "Add the steak and any juice on the plate.",
        "Heat 1–2 minutes, just until it's warmed through."
      ],
      why: "Any longer and thin steak turns tough." },

    { id: "cream", title: "Sour cream, off the heat",
      effort: ["hot"], minutes: 2,
      uses: ["sourCream"],
      go: [
        "Take the pan off the heat.",
        "Stir a big spoonful of the hot sauce into the sour cream to warm it.",
        "Stir it all into the pan until smooth and creamy."
      ],
      why: "Boiled sour cream splits and goes grainy. Off the heat it stays silky." },

    { id: "taste", title: "Taste, then control",
      effort: ["sit"], minutes: 3,
      go: [
        "Taste a strip of steak with plenty of sauce.",
        "Use the card below. One change at a time: stir, wait a minute, taste again."
      ],
      why: "It should be rich, tangy and savoury all at once." },

    { id: "serve", title: "Plates",
      effort: ["sit"], minutes: 3,
      uses: ["parsley"],
      go: [
        "Noodles first, stroganoff over the top.",
        "Parsley and a grind of black pepper.",
        "Green beans, peas or a crisp salad on the side."
      ] }
  ],

  /* the taste-and-control card. `per` is per pound of steak. */
  taste: [
    { id: "flat", karl: true,
      when: "It tastes like not much.",
      fix: "Salt", item: "salt", per: 0.25,
      how: "Stir in, wait a full minute, taste. Salt turns up every flavour already there." },

    { id: "shallow", karl: true,
      when: "Creamy, but not much depth.",
      fix: "Worcestershire", item: "worcestershire", per: 1,
      how: "The quickest way to make it taste deeper and more savoury." },

    { id: "heavy", karl: true,
      when: "Rich and heavy, nothing cuts it.",
      fix: "Dijon", item: "dijon", per: 0.5,
      how: "A little sharpness wakes the whole pan up. A squeeze of lemon works too." },

    { id: "bland",
      when: "Not tangy or creamy enough.",
      fix: "Sour cream", item: "sourCream", per: 30,
      how: "Off the heat, always. Warm it with a spoonful of sauce first." },

    { id: "tangy",
      when: "Too tangy.",
      fix: "Butter", item: "butter", per: 15,
      how: "Stir it in off the heat. It rounds off the sour edge." },

    { id: "bite",
      when: "Needs a little bite.",
      fix: "Black pepper", item: "pepper", per: 0.25,
      how: "Freshly ground, stirred in. It's the classic match for sour cream." },

    { id: "thick",
      when: "Too thick, or gluey.",
      fix: "Broth", item: "broth", per: 60,
      how: "A splash at a time, off the heat. The noodles drink sauce, so leave it a little loose." },

    { id: "thin",
      when: "Too thin.",
      fix: "Time, gently",
      how: "Back on low for 2–3 minutes. Don't let it boil, or the sour cream splits." }
  ],

  notes: [
    { title: "Which steak",
      body: "Top sirloin is the sweet spot. Flank and ribeye work too. Skip stew meat: it needs hours, not minutes." },
    { title: "Slicing it",
      body: "Look for the lines running through the meat and cut across them. Short fibres are what make each strip tender." },
    { title: "Keeping it",
      body: "Three days in the fridge, stored apart from the noodles. Warm it gently with a splash of broth and don't let it boil. It doesn't freeze well; the sour cream turns grainy." },
    { title: "Where the numbers came from",
      body: "Everything is written per pound of steak, which feeds about four over noodles. Set the dial and the rest follows." }
  ],

  /* ---- the mushroom pot -------------------------------------------
     Thick-sliced portobellos stand in for the steak, pound for pound.
     The broth goes vegetable and the Worcestershire goes vegetarian,
     because the regular kind has anchovies in it. Salt waits until the
     mushrooms have browned, since it pulls water out of them.          */
  swaps: {
    veg: {
      label: "Vegetarian",
      protein: "portobellos",
      dialTitle: "How many portobellos have you got?",
      dialOf: "of portobello mushrooms",
      items: {
        steak: { name: "Portobello mushrooms, thick-sliced", short: "portobellos",
                 note: "Stand-ins for the steak, pound for pound. Scrape out the dark gills so the sauce stays pale." },
        salt:  { name: "Kosher salt, for the portobellos" },
        broth: { name: "Vegetable or mushroom broth", short: "vegetable broth",
                 note: "Mushroom broth is best." },
        worcestershire: { name: "Vegetarian Worcestershire, or soy sauce", short: "vegetarian Worcestershire",
                 note: "Regular Worcestershire has anchovies in it." }
      },
      steps: {
        prep: { go: [
            "Scrape the gills out of the portobellos with a spoon, then slice them as thick as a finger.",
            "Slice the cremini. Dice the onion. Mince the garlic.",
            "Measure the broth, Worcestershire and Dijon into one jug.",
            "Take the sour cream out of the fridge."
          ],
          why: "The gills turn the sauce grey. Everything else is the same as the steak version." },
        sear: { title: "Brown the portobellos",
          go: [
            "Big skillet, medium-high heat. Add the oil and let it shimmer.",
            "Lay the slices in one layer and leave them alone for 3 minutes.",
            "Turn them, brown the other side, then season with the salt and pepper.",
            "Out onto a plate."
          ],
          why: "Salt pulls water out of mushrooms, so it goes on after they've browned." },
        back: { title: "Portobellos back in",
          go: [
            "Add the portobellos and any juice on the plate.",
            "Heat 1–2 minutes, just until warmed through."
          ],
          why: "They're already cooked. This just warms them and lets them soak up the sauce." }
      }
    }
  }
};

})();
