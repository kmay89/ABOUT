/* words.js — the deck, for both party games.

   The one thing a party game cannot fake. An engine is worth nothing here:
   what makes these fun is entirely whether the word that comes up is a word
   worth shouting about, and there is no clever way to get that — somebody has
   to write the list.

   **Two lists, not one with a flag on it.** The describing game and the acting
   game want genuinely different words and pretending otherwise ruins both. A
   *silver lining* is a lovely thing to describe and impossible to mime; *
   threading a needle* is a joy to mime and takes four words to describe, at
   which point you have said it. So `SAY` and `ACT` are separate lists written
   for their own game, and the overlap is only where a word honestly belongs
   in both.

   **Three difficulties, and the middle one is the game.** Easy is for
   children and for the first round while everybody works out what they are
   doing. Hard is for the people who have played it before and want to lose.

   ## The rules the list follows

   · Nothing that needs a particular country, decade, or television schedule.
     "Quarterback" and "the Chunnel" are out; "referee" and "tunnel" are in.
   · No brand names. They date, they exclude, and half the room mishears them.
   · Nothing built from another entry's word, so the describer is never
     accidentally forbidden from the only sentence that works.
   · For ACT, everything is a thing a body can do standing up, in a room, in
     under thirty seconds, without props.

   No DOM, no state, no dependencies — it is a list, and it is shipped
   byte-identical to both rooms, which tools/room-parity.js checks.        */
(function (root) {
"use strict";

var Words = {};

/* ================================================================
   SAY — for the describing game. You may say anything at all except
   the words on the card and any part of them.
   ================================================================ */
Words.SAY = {
  easy: [
    "toothbrush", "birthday cake", "traffic light", "swimming pool", "postman",
    "rainbow", "snowman", "fire engine", "umbrella", "elephant",
    "washing machine", "front door", "shopping list", "alarm clock", "guitar",
    "sandcastle", "football", "kettle", "bicycle", "pillow",
    "chocolate", "helicopter", "dentist", "library", "moustache",
    "wheelbarrow", "seagull", "campfire", "hairbrush", "spider web",
    "orange juice", "roller coaster", "sunglasses", "candle", "goldfish",
    "playground", "suitcase", "windmill", "penguin", "ice cream",
    "paint brush", "farmyard", "carpet", "lighthouse", "balloon",
    "toaster", "raincoat", "butterfly", "dustbin", "wellington boot",
    "scarecrow", "piggy bank", "school bus", "haircut", "jigsaw puzzle"
  ],
  medium: [
    "silver lining", "traffic jam", "cold feet", "wild goose chase", "spilt milk",
    "green thumb", "elbow grease", "small talk", "night shift", "sweet tooth",
    "double take", "close shave", "second wind", "blind spot", "long shot",
    "red tape", "dark horse", "last straw", "open secret", "rush hour",
    "melting pot", "safety net", "false alarm", "heavy weather", "loose end",
    "revolving door", "escalator", "conveyor belt", "weather vane", "hourglass",
    "compass", "microscope", "waiting room", "lost property", "fire drill",
    "greenhouse", "crossword", "tightrope", "treadmill", "vending machine",
    "parking meter", "jury duty", "message in a bottle", "needle in a haystack",
    "elephant in the room", "storm in a teacup", "wet blanket", "hot potato",
    "paper trail", "ghost town", "roundabout", "cul-de-sac", "wisdom tooth",
    "tongue twister", "pin drop", "chain reaction"
  ],
  hard: [
    "diminishing returns", "conflict of interest", "leap of faith", "vicious circle",
    "point of no return", "benefit of the doubt", "process of elimination",
    "figment of the imagination", "law of averages", "clean slate",
    "moving goalposts", "cutting corners", "burning bridges", "reading between the lines",
    "preaching to the choir", "moving the needle", "throwing in the towel",
    "biting off more than you can chew", "putting all your eggs in one basket",
    "barking up the wrong tree", "letting the cat out of the bag",
    "gift horse", "olive branch", "trojan horse", "acid test", "pyrrhic victory",
    "catch-22", "domino effect", "butterfly effect", "placebo", "déjà vu",
    "sleight of hand", "poetic licence", "devil's advocate", "wild card",
    "grey area", "glass ceiling", "level playing field", "moving target",
    "square one", "eleventh hour", "eye of the storm", "tip of the iceberg",
    "brainstorm", "afterthought", "understatement", "chain of command",
    "flash in the pan", "labour of love", "necessary evil", "rite of passage"
  ]
};

/* ================================================================
   ACT — for the miming game. No talking, no pointing at objects in the
   room, no drawing in the air with the shape of the word.

   The number beside each one is what it is worth, and it is a judgement
   about how hard it is to *get across*, not how hard it is to do.
   ================================================================ */
Words.ACT = {
  easy: [
    "brushing your teeth", "sneezing", "swimming", "driving a car", "eating spaghetti",
    "playing the piano", "climbing a ladder", "sleeping", "washing your hair",
    "riding a horse", "shivering", "fishing", "reading a newspaper", "taking a photograph",
    "boxing", "skipping", "digging", "waving goodbye", "drinking tea",
    "putting on socks", "hammering a nail", "blowing out candles", "tying a shoelace",
    "carrying something heavy", "sweeping the floor", "shooting a basketball",
    "playing a violin", "flying a kite", "rowing a boat", "juggling",
    "pushing a shopping trolley", "opening an umbrella", "typing", "dancing",
    "laughing", "crying", "smelling something awful", "tiptoeing", "yawning",
    "counting money"
  ],
  medium: [
    "threading a needle", "changing a tyre", "conducting an orchestra", "milking a cow",
    "hailing a taxi", "walking a dog that will not walk", "putting up a tent",
    "carrying a full cup down stairs", "picking a lock", "shuffling cards",
    "reeling in a big fish", "getting into a cold sea", "putting on a tie",
    "escaping a room with no doors", "arm wrestling", "walking into a glass door",
    "peeling an onion", "revving a motorbike", "playing hopscotch", "limbo dancing",
    "wallpapering", "ice skating", "surfing", "taking a penalty", "bowling",
    "flossing", "cracking an egg", "putting a duvet in a cover", "unfolding a map",
    "trying on shoes", "queuing impatiently", "hiding from someone",
    "eating something far too hot", "climbing through a window",
    "carrying an armful of shopping", "listening at a door", "checking a watch repeatedly",
    "chasing a hat down the street", "being tickled", "losing a contact lens"
  ],
  hard: [
    "an astronaut in low gravity", "a mime trapped in a box", "a statue coming to life",
    "someone who has just won and cannot say so", "a tightrope walker losing balance",
    "a puppet with a broken string", "someone reversing a lorry", "a bad magician",
    "a sunburnt person putting on a jumper", "someone whose foot has gone to sleep",
    "a person being blown along by wind", "an orchestra tuning up",
    "realising you left the oven on", "a slow-motion race",
    "a person trying not to laugh at a funeral", "waking up in the wrong house",
    "a scarecrow in a gale", "somebody carrying a ladder round a corner",
    "photographing a wriggling child", "a person who cannot find their keys",
    "walking against a moving walkway", "a bird trapped indoors",
    "being handed a baby you did not expect", "a small person opening a huge door",
    "eating something you said you liked", "trying to fold a fitted sheet",
    "a fly you cannot swat", "somebody who has forgotten your name",
    "waiting for a lift that never comes", "sitting on something wet"
  ]
};

/* The value of an acted card. Guesstures pays more for the harder ones,
   which is what stops a team hoarding the easy pile. */
Words.WORTH = { easy: 1, medium: 2, hard: 3 };

Words.LEVELS = ["easy", "medium", "hard"];
Words.count = function (which, level) {
  var list = which === "act" ? Words.ACT : Words.SAY;
  return level ? list[level].length : list.easy.length + list.medium.length + list.hard.length;
};

/* One shuffled run of the whole deck, at the levels asked for, and then it
   is dealt from the front. A party game that draws at random will show you
   "umbrella" twice in five minutes and everybody notices; dealing from a
   shuffled deck cannot. */
Words.deck = function (which, levels, rnd) {
  var list = which === "act" ? Words.ACT : Words.SAY;
  var out = [], i, j, k;
  for (i = 0; i < levels.length; i++) {
    var lv = levels[i], src = list[lv] || [];
    for (j = 0; j < src.length; j++) out.push({ word: src[j], level: lv, worth: Words.WORTH[lv] });
  }
  for (k = out.length - 1; k > 0; k--) {
    j = (rnd() * (k + 1)) | 0;
    var t = out[k]; out[k] = out[j]; out[j] = t;
  }
  return out;
};

if (typeof module !== "undefined" && module.exports) module.exports = Words;
else root.Words = Words;
})(typeof self !== "undefined" ? self : this);
