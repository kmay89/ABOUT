/* data.js — everything in Hive Mind that is a list.

   Flowers, the things a hive can learn, the years, and the field notes.
   Adding a flower or an instinct means adding a row here; nothing in sim.js
   or gfx.js knows any of them by name.

   The facts are the part to be careful with. Every `fact` and every field
   note is something a beekeeper or an entomologist would sign: they are the
   reason the game exists, and a charming line that is not true is worse than
   no line at all.                                                          */
(function (root) {
"use strict";

/* ---------- flowers ----------
   value   honey one bee carries home from one visit
   nectar  how many visits the flower holds [min, max]
   seats   how many bees can work it at once
   life    seconds it stays open [min, max]
   band    where it grows, as a fraction of the hive's reach [near, far]
   w       how common it is in its season
   look    what gfx.js needs to draw it: a shape and its colours
   honey   the colour of the honey it makes, for the jar                    */
const SPECIES = {
  crocus: {
    name: "Crocus", seasons: ["spring"], value: 1, nectar: [4, 6], seats: 2, life: [20, 26],
    band: [0, 0.5], w: 3,
    look: { shape: "cup", petals: 6, r: 0.036, c1: "#b79cff", c2: "#7d5fd6", core: "#ffb84a" },
    honey: "#f6d97a"
  },
  dandelion: {
    name: "Dandelion", seasons: ["spring", "summer"], value: 1, nectar: [5, 8], seats: 2, life: [22, 30],
    band: [0, 0.75], w: 4,
    look: { shape: "puff", petals: 22, r: 0.038, c1: "#ffd94a", c2: "#f0a81e", core: "#e8920c" },
    honey: "#f2c230"
  },
  apple: {
    name: "Apple blossom", seasons: ["spring"], value: 2, nectar: [9, 13], seats: 4, life: [24, 32],
    band: [0.45, 1], w: 2,
    look: { shape: "round", petals: 5, r: 0.05, c1: "#ffe9f1", c2: "#ff9dbd", core: "#f6d04a" },
    honey: "#f7e3a0"
  },
  clover: {
    name: "Clover", seasons: ["summer"], value: 1, nectar: [8, 12], seats: 3, life: [22, 30],
    band: [0, 0.6], w: 4,
    look: { shape: "ball", petals: 18, r: 0.04, c1: "#fdfbf4", c2: "#f3bfd6", core: "#d98fb4" },
    honey: "#f8e6a6"
  },
  lavender: {
    name: "Lavender", seasons: ["summer"], value: 2, nectar: [11, 15], seats: 4, life: [24, 32],
    band: [0.35, 1], w: 3,
    look: { shape: "spike", petals: 9, r: 0.05, c1: "#a98bff", c2: "#6c4fd0", core: "#4f3aa6" },
    honey: "#eec65a"
  },
  sunflower: {
    name: "Sunflower", seasons: ["summer"], value: 3, nectar: [13, 18], seats: 5, life: [26, 34],
    band: [0.6, 1], w: 1.4,
    look: { shape: "ray", petals: 16, r: 0.066, c1: "#ffd23a", c2: "#f39a12", core: "#5b3a1c" },
    honey: "#e9a91f"
  },
  aster: {
    name: "Aster", seasons: ["autumn"], value: 1, nectar: [5, 8], seats: 2, life: [20, 26],
    band: [0, 0.6], w: 4,
    look: { shape: "ray", petals: 14, r: 0.04, c1: "#c7a6ff", c2: "#8c63e0", core: "#ffcc3e" },
    honey: "#e6b54a"
  },
  goldenrod: {
    name: "Goldenrod", seasons: ["autumn"], value: 2, nectar: [9, 13], seats: 4, life: [22, 30],
    band: [0.3, 1], w: 3,
    look: { shape: "plume", petals: 11, r: 0.052, c1: "#ffd447", c2: "#e2a216", core: "#c4860b" },
    honey: "#d99a18"
  },
  ivy: {
    name: "Ivy", seasons: ["autumn"], value: 2, nectar: [7, 10], seats: 3, life: [22, 28],
    band: [0.55, 1], w: 1.6,
    look: { shape: "umbel", petals: 7, r: 0.046, c1: "#d9e88a", c2: "#9fbf4a", core: "#f1e27a" },
    honey: "#e9e2c0"
  }
};

/* ---------- what a hive can learn ----------
   One is offered every night, three to choose from. `max` is how many times
   it can be learned. `text` is the whole effect, in as few words as carry
   it. `fact` is true, and is what the card is really for.                  */
const CARDS = {
  wings: {
    name: "Strong wings", icon: "wings", max: 3, text: "Bees fly faster",
    fact: "A honeybee beats her wings about 230 times a second. The buzz is the sound of it."
  },
  tongue: {
    name: "Long tongues", icon: "drop", max: 3, text: "Every load is bigger",
    fact: "A forager drinks nectar into a second stomach, and can carry nearly half her own weight home."
  },
  memory: {
    name: "Flower memory", icon: "flower", max: 3, text: "Bees work a flower quicker",
    fact: "A forager learns one kind of flower and keeps to it for the whole trip. Botanists call it flower constancy."
  },
  dance: {
    name: "Waggle dance", icon: "dance", max: 3, text: "Far flowers pay more",
    fact: "A bee tells the others where a flower is by dancing: the angle of her run is the direction from the sun, and its length is the distance."
  },
  jelly: {
    name: "Royal jelly", icon: "egg", max: 2, text: "Eggs cost less honey",
    fact: "Every larva gets royal jelly for three days. One fed on it the whole way grows into a queen."
  },
  nurses: {
    name: "Good nurses", icon: "cradle", max: 2, text: "Bees hatch sooner",
    fact: "Nurse bees look in on every single larva more than a thousand times a day."
  },
  twins: {
    name: "A busy queen", icon: "twin", max: 2, text: "Some eggs hatch two bees",
    fact: "In early summer a queen can lay well over a thousand eggs a day, more than her own weight."
  },
  guards: {
    name: "Guard bees", icon: "shield", max: 2, text: "Hornets are beaten faster",
    fact: "Japanese honeybees kill a hornet by wrapping it in a ball of bees and shivering until it overheats."
  },
  scouts: {
    name: "Sharp scouts", icon: "eye", max: 2, text: "Flowers stay open longer",
    fact: "Bees see ultraviolet. Many petals carry markings we cannot see that point straight at the nectar."
  },
  bloom: {
    name: "Wild seeds", icon: "seed", max: 2, text: "One more flower in bloom",
    fact: "About one bite of food in three comes from a plant that does better when an insect visits it."
  },
  giant: {
    name: "The big bloom", icon: "sun", max: 1, text: "A giant flower opens every day",
    fact: "A sunflower head is not one flower. It is a thousand or more small ones, opening in rings from the outside in."
  },
  early: {
    name: "Early risers", icon: "dawn", max: 2, text: "Days last longer",
    fact: "Foragers keep time. They come back to a flower at the hour of the day it gave nectar yesterday."
  },
  propolis: {
    name: "Propolis", icon: "resin", max: 2, text: "Winter needs less honey",
    fact: "Bees gather tree resin and use it to seal every gap in the nest against draughts and germs."
  },
  winterbees: {
    name: "Winter bees", icon: "snow", max: 1, text: "A smaller cluster is enough",
    fact: "A summer bee lives about six weeks. A bee raised in autumn is built differently and lives until spring."
  }
};

/* the first three ever offered: each changes something you can see at once */
const FIRST_OFFER = ["wings", "tongue", "jelly"];

/* ---------- the years ----------
   Year one is the founding. After that each year has one thing about it
   that is different, named so it can be told afterwards. From the fifth
   year on they come round again, harder.                                   */
const YEARS = [
  { name: "The Founding",   blurb: "A new hive, and one whole year to get ready for winter." },
  { name: "Hornet Summer",  blurb: "The hornets have found you. They hunt in summer.", hornets: 2 },
  { name: "The Dry Year",   blurb: "Fewer flowers. Watch for the rain, and what comes up after it.", flowers: 0.78, rain: 2 },
  { name: "The Long Frost", blurb: "Winter will come early and stay late.", winter: 1.3, autumn: 0.85 }
];

/* ---------- field notes ----------
   One true thing, filed the first time you see it happen. `on` is the event
   or the species or the card that files it.                                */
const NOTES = [
  { id: "forage",  on: "deliver",   title: "Nectar",        text: "Nectar is sugar and water. A flower makes it for one reason: to be visited." },
  { id: "honey",   on: "cell",      title: "Honey",         text: "Bees fan nectar with their wings until most of the water is gone. What is left is honey, and it keeps for years." },
  { id: "wax",     on: "grow",      title: "Wax",           text: "Bees sweat wax in small flakes and chew it into comb. A hive eats about seven grams of honey to make one gram of it." },
  { id: "hex",     on: "ring",      title: "Hexagons",      text: "Six-sided cells hold the most honey for the least wax. It took until 1999 to prove that no other shape does better." },
  { id: "egg",     on: "lay",       title: "The queen",     text: "The queen is the only bee who lays eggs. She does not rule the hive. Nobody does." },
  { id: "hatch",   on: "hatch",     title: "Twenty-one days", text: "Three days an egg, six a larva, twelve sealed under wax. Then a worker chews her way out." },
  { id: "recruit", on: "recruit",   title: "Recruits",      text: "One bee finds a flower. She dances, a few follow, and each of them dances too. That is how a hive changes its mind." },
  { id: "dusk",    on: "dusk",      title: "Home by dark",  text: "Bees steer by the sun and by the pattern it makes across the sky. At dusk they come home." },
  { id: "hornet",  on: "hornetIn",  title: "Hornets",       text: "A hornet hunts bees at flowers and at the hive door, and carries them off to feed her own young." },
  { id: "ball",    on: "hornetDown", title: "The heat ball", text: "A bee can stand a little more heat than a hornet can. So the bees surround her and shiver, and it is enough." },
  { id: "rain",    on: "rain",      title: "Rain",          text: "A big raindrop weighs nearly as much as a bee. When it rains, foragers wait it out." },
  { id: "fresh",   on: "refresh",   title: "After rain",    text: "Flowers make more nectar after a good rain, and bees are quick to go and see." },
  { id: "idle",    on: "idle",      title: "Bees at home",  text: "At any moment most of a hive is not out flying. They nurse, build, guard, clean, and wait to be told where the flowers are." },
  { id: "cluster", on: "winter",    title: "The winter cluster", text: "Bees do not sleep through winter. They hold on to each other in a ball and shiver to stay warm, with the queen in the middle." },
  { id: "huddle",  on: "huddle",    title: "Taking turns",  text: "The bees on the cold outside of the cluster work their way in, and the warm ones move out. Everybody gets a turn in the middle." },
  { id: "spring",  on: "thaw",      title: "Spring",        text: "A hive that sees spring has done the hardest thing it ever has to do." },
  { id: "jar",     on: "jar",       title: "A jar of honey", text: "A small jar of honey is the life's work of about five hundred bees, and more than a million visits to flowers." },
  { id: "mono",    on: "pure",      title: "One flower",    text: "Honey made mostly from a single kind of flower tastes of it. Lavender honey really does taste of lavender." }
].concat(Object.keys(SPECIES).map(function (k) {
  const facts = {
    crocus: "Crocuses open on the first warm days, when almost nothing else is out. For a hungry hive they are breakfast.",
    dandelion: "A lawn full of dandelions is one of the best things a hive can find in spring.",
    apple: "An apple tree cannot make apples from its own pollen. Every apple you have eaten began with a bee.",
    clover: "Clover honey is the mild, pale honey most people grew up on.",
    lavender: "Lavender opens a few florets at a time for weeks, so the same bees come back to the same bush day after day.",
    sunflower: "Young sunflowers turn to follow the sun. Grown ones stop and face east, and warm up early for the bees.",
    aster: "Asters flower late, when the nights are already cold. Bees fill the last gaps in the comb from them.",
    goldenrod: "Goldenrod is the last big meal of the year. A hive in goldenrod smells like old socks, and beekeepers are glad of it.",
    ivy: "Ivy flowers when everything else has finished. Its honey sets hard in the comb within days."
  };
  return { id: "sp-" + k, on: "sp:" + k, title: SPECIES[k].name, text: facts[k], species: k };
}));

const api = { SPECIES: SPECIES, CARDS: CARDS, FIRST_OFFER: FIRST_OFFER, YEARS: YEARS, NOTES: NOTES };
root.HiveData = api;
if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : this);
