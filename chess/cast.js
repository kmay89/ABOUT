/* The Chess Room — the cast.
   The eight coaches on the ladder are people, or as near as a plant in a
   pot gets: each has a face (avatar.js draws it, from the `look` here),
   a voice (how high, how quick), and a way of talking about the game.
   This file is only the who and the what-they-say; when they say it is
   app.js's business ("the cast" block), and it never lets a coach say
   anything about the position that is not true — the lines here are
   about how it feels to be in the game, not about what is on the board.

   Pure, so chess/tools/cast-check.js can read every line in node.

   A line is chosen by `line(id, kind, n)`: n is any counter the caller
   keeps (how many times this kind has been said this game), so the same
   coach does not say the same thing twice in a row, and the same game
   replayed says the same things. */
(function (root) {
"use strict";

/* look: what avatar.js builds. body is the shape of the plant itself,
   top what grows out of it; colours are hex; pot is the pot it sits in.
   eyes: how far apart, how big. voice: pitch in Hz and syllables a
   second for the babble that plays under a line. */
var CAST = {
  acorn: {
    name: "Acorn", title: "the newest seed on the ladder",
    look: { body: "acorn", top: "cap", col: "#b9773f", col2: "#6e4628", pot: "#c8663d",
            eyes: { gap: 0.20, size: 1.15 }, blush: 0.55 },
    voice: { hz: 520, rate: 13 },
    lines: {
      hello: ["Oh! Hello! I'm Acorn. I only just learned how the horsey one moves.",
              "Hi, I'm Acorn! I'm small, but I'm going to try really hard."],
      greet: ["Oh, you're back! Hello again!", "Hi! Ready? I think I'm ready. Mostly."],
      again: ["Again? Okay! I'll be braver this time.", "One more! I've been practising. A bit."],
      think: ["Hmm, hmm, hmm…", "Which one moves like an L again?", "Don't rush me, don't rush me…"],
      took:  ["I got one! I actually got one!", "Ooh! Is that allowed? It's allowed!"],
      lost:  ["Oh no, not that one!", "Wait, I needed that!", "Eep!"],
      check: ["Check! Did I say it right? Check!", "Your king! Look at your king!"],
      checked: ["Eek! My king!", "Oh no oh no, where does he go?"],
      ahead: ["Ooh, I've got more pieces than you! Is that good? I think that's good."],
      behind: ["This is getting a bit scary.", "I might be in trouble…"],
      win:   ["I won?! I won! Can I tell everyone?", "Wow! That was the best game ever!"],
      lose:  ["Aw. You're really good! Teach me that one day?", "Good game! I'll grow, you'll see."],
      gift:  ["You won! Oh, that means you get my stump now. Look after it, okay?"],
      draw:  ["Nobody won? That's okay! That's nice, actually."]
    }
  },
  sprout: {
    name: "Sprout", title: "learning, same as you",
    look: { body: "seed", top: "sprout", col: "#8bc34a", col2: "#4f8f2c", pot: "#c8663d",
            eyes: { gap: 0.22, size: 1.05 }, blush: 0.5 },
    voice: { hz: 470, rate: 12 },
    lines: {
      hello: ["Hi there! I'm Sprout. We're both still growing, so let's learn something together!",
              "Hello! Sprout here. I take what you leave lying about, so watch your pieces!"],
      greet: ["Hello again! Let's grow a little.", "Back for more sunshine? Let's play!"],
      again: ["A rematch! I love a rematch.", "Same again? I'm in!"],
      think: ["Let me have a little think…", "Photosynthesising…", "Mm. Leaves and pieces, leaves and pieces…"],
      took:  ["Ooh, I'll have that!", "Thank you very much!", "Yum!"],
      lost:  ["Hey, I was using that!", "Oops, I forgot to look after it.", "Aw, my poor piece."],
      check: ["Check! Watch out!", "Your king's in the sun now!"],
      checked: ["Whoa! Check on me?", "Okay, okay, I see it."],
      ahead: ["Things are going rather well, I think!"],
      behind: ["Hmm, I'm wilting a bit here.", "I might need more water."],
      win:   ["I won! We both learned something, though, right?", "Hooray! Good game!"],
      lose:  ["You got me! Nicely played.", "Good game! I'm going to grow back stronger."],
      gift:  ["You beat me! Take my seed tray. Things grow well on it. You did."],
      draw:  ["A draw! We both get a sticker."]
    }
  },
  clover: {
    name: "Clover", title: "a little bit lucky",
    look: { body: "round", top: "clover", col: "#4caf6a", col2: "#2f8a4e", pot: "#e6dccb",
            eyes: { gap: 0.24, size: 1.0 }, blush: 0.45 },
    voice: { hz: 430, rate: 12 },
    lines: {
      hello: ["Hiya! I'm Clover. I know a few tricks, and I've got luck on my side!",
              "Hello, hello! Clover's the name. Four leaves, zero fear."],
      greet: ["Feeling lucky? I am!", "Hiya again! Shall we?"],
      again: ["Luck's a funny thing. Again!", "Let's see whose day it is."],
      think: ["Eeny, meeny… no, wait, let me think properly.", "Lucky move, lucky move…", "Hmm, there's a trick here somewhere."],
      took:  ["Lucky me!", "Ha! Didn't see that coming, did you?", "Mine now!"],
      lost:  ["Well, that wasn't lucky.", "Rats! Fair enough.", "Ouch!"],
      check: ["Check! Bet you didn't see that!", "Knock knock! Check!"],
      checked: ["Yikes! Okay, okay.", "My luck's running a bit thin…"],
      ahead: ["The luck is flowing today!"],
      behind: ["Come on, luck, come on…"],
      win:   ["Lucky clover strikes again!", "Won it! Good game, though!"],
      lose:  ["You made your own luck there. Well played!", "Not my day! Great game."],
      gift:  ["Guess my luck ran out. The meadow's yours now. Maybe it'll bring you some."],
      draw:  ["Half a lucky day each!"]
    }
  },
  club: {
    name: "Fern", title: "quiet, and noticing",
    look: { body: "tall", top: "fronds", col: "#5d9c59", col2: "#3b7039", pot: "#9aa4ad",
            eyes: { gap: 0.20, size: 0.95 }, blush: 0.3 },
    voice: { hz: 360, rate: 10 },
    lines: {
      hello: ["Oh — hello. I'm Fern. I don't give much away, but I do notice things.",
              "Hello. Fern. I'll try to give you a fair game."],
      greet: ["Hello again. Shall we?", "Nice to see you. Your move, or mine?"],
      again: ["Once more, then.", "All right. Let's see what's different this time."],
      think: ["…", "Let me see.", "Quietly, now…"],
      took:  ["I noticed that one.", "I'll take it, thank you.", "Hm. Loose."],
      lost:  ["Ah. Well spotted.", "Fair.", "I should have seen that."],
      check: ["Check.", "Your king, I'm afraid."],
      checked: ["Oh. Yes. I see.", "Hm. Careful, Fern."],
      ahead: ["It's going my way, I think. Quietly."],
      behind: ["You're playing well. I need to be careful."],
      win:   ["Thank you for the game. That was a good one.", "Mine, this time. Well played."],
      lose:  ["Well played. I didn't see it until too late.", "You were better today. Thank you."],
      gift:  ["Well played. Take the shade with you. It's a good place to think."],
      draw:  ["Even. That feels right."]
    }
  },
  bamboo: {
    name: "Bamboo", title: "bends, never breaks",
    look: { body: "segments", top: "leaves", col: "#9ccc65", col2: "#5f8f2f", pot: "#2f3a33",
            eyes: { gap: 0.18, size: 0.9 }, band: "#c0392b", blush: 0.2 },
    voice: { hz: 300, rate: 9 },
    lines: {
      hello: ["Greetings. I am Bamboo. I bend with the wind, and I do not break. Let us train.",
              "I am Bamboo. Strong roots, flexible stem. Show me your form."],
      greet: ["Welcome back, student. Shall we train?", "Breathe. Begin."],
      again: ["Again. Discipline is repetition.", "Good. Practice is the path."],
      think: ["Patience…", "The wind blows. The stem bends.", "Breathe in. Calculate. Breathe out."],
      took:  ["A loose piece is a gift.", "Accepted.", "Hai!"],
      lost:  ["I bend.", "A fair strike.", "Hm. Good form."],
      check: ["Check. Mind your centre.", "Your king is exposed."],
      checked: ["I bend. I do not break.", "A strong blow."],
      ahead: ["Your guard is low."],
      behind: ["Your technique is sharp today."],
      win:   ["A good bout. Train well.", "The stem stands. Bow, and again?"],
      lose:  ["You have trained well. I bow.", "Excellent form. I am honoured."],
      gift:  ["I bent too far that time. The lacquer board is yours. Keep it polished."],
      draw:  ["Balance. As it should be."]
    }
  },
  cactus: {
    name: "Cactus", title: "prickly, and proud of it",
    look: { body: "cactus", top: "flower", col: "#4e9a5c", col2: "#2e6a3a", pot: "#c8663d",
            eyes: { gap: 0.20, size: 0.85 }, brow: true, blush: 0.15 },
    voice: { hz: 250, rate: 9 },
    lines: {
      hello: ["Well, well. Name's Cactus. Folks who get careless round me get pricked. Sit down.",
              "Cactus. I've seen a lot of players come through this desert. Let's see you."],
      greet: ["You again. Good. Sit.", "Back for another scratch, partner?"],
      again: ["Glutton for punishment. I like it.", "Again? Fine by me."],
      think: ["Mm-hm.", "Takin' my time. Desert's patient.", "Hot day for chess."],
      took:  ["Careless.", "That'll sting.", "Pricked you."],
      lost:  ["Hm. You've got spines too.", "Lucky shot.", "Well, I'll be."],
      check: ["Check, partner.", "Watch your king, now."],
      checked: ["Huh. Not bad.", "You'll have to try harder than that."],
      ahead: ["Hot out here for you, isn't it?"],
      behind: ["You're tougher than you look."],
      win:   ["The desert takes another one. Come back when you've grown some thorns.", "Good game. Mostly mine."],
      lose:  ["Well, I'll be. You beat me fair and square.", "Tip of the hat to you, partner."],
      gift:  ["Fine. Take the desert. Mind the sand, it gets everywhere."],
      draw:  ["Standoff. Respect."]
    }
  },
  pine: {
    name: "Pine", title: "cold, clear calculation",
    look: { body: "cone", top: "tip", col: "#2e7d5b", col2: "#1d5a40", pot: "#7a8a96",
            eyes: { gap: 0.19, size: 0.85 }, blush: 0.1 },
    voice: { hz: 280, rate: 10 },
    lines: {
      hello: ["Good evening. I am Pine. I calculate, and I rarely let an advantage go. Bring a plan.",
              "Pine. Precise, patient, evergreen. Shall we begin?"],
      greet: ["Good to see you again. Plan ready?", "Evening. Let us begin."],
      again: ["Again. Adjust your plan.", "Very well. From the top."],
      think: ["Calculating.", "Three lines. Two are bad.", "Counting…"],
      took:  ["Material.", "As calculated.", "Thank you."],
      lost:  ["Noted.", "A precise move.", "Hm. I miscounted."],
      check: ["Check.", "Check. Consider carefully."],
      checked: ["Check. Acknowledged.", "Interesting."],
      ahead: ["The position favours me now."],
      behind: ["Your calculation is better than mine today."],
      win:   ["A clean game. Thank you.", "The plan held. Well fought."],
      lose:  ["Precise. I could not find a defence.", "Very well played. I concede the point."],
      gift:  ["Correct. The frost board goes with you. It suits a clear head."],
      draw:  ["Equal. Correctly so."]
    }
  },
  mentor: {
    name: "Oak", title: "old, and glad you came",
    look: { body: "trunk", top: "crown", col: "#8d6e4f", col2: "#4f8f3a", pot: "#5a3d2b",
            eyes: { gap: 0.22, size: 0.9 }, specs: true, blush: 0.2 },
    voice: { hz: 200, rate: 8 },
    lines: {
      hello: ["Ah, welcome, welcome. I'm Oak. I've stood here a long while. Play your best, and keep the notebook open.",
              "Hello, friend. Oak. I've watched a great many games from this spot. Let's make this a good one."],
      greet: ["Ah, you've come back. Good, good.", "Welcome back. Sit, sit."],
      again: ["Once more. There's always more to learn.", "Ah, a rematch. Splendid."],
      think: ["Hmm. Let me see now…", "Slowly, slowly.", "Old roots, deep thoughts."],
      took:  ["Ah. That one was hanging, I'm afraid.", "I'll take that, thank you.", "Mm. A little loose."],
      lost:  ["Oh, well played!", "Ha! Very good.", "Ah, I didn't see that."],
      check: ["Check, my friend.", "Mind your king."],
      checked: ["Oh ho! Check, is it?", "Very good. Very good."],
      ahead: ["Things are leaning my way, I think."],
      behind: ["You're playing beautifully. I may be in trouble."],
      win:   ["A fine game. You'll beat me soon enough.", "Well fought. Look back over it, there's a lesson in there."],
      lose:  ["Ah, wonderful! You've beaten the old tree. Well done.", "Splendid play. I'm proud of you."],
      gift:  ["There it is. The library table is yours now. I kept it a long time for someone like you."],
      draw:  ["A draw. Honour on both sides."]
    }
  }
};

var KINDS = ["hello", "greet", "again", "think", "took", "lost", "check", "checked", "ahead", "behind", "win", "lose", "draw", "gift"];

function get(id) { return CAST[id] || null; }
function ids() { return Object.keys(CAST); }
/* the n-th line of a kind, going round; null if there is none */
function line(id, kind, n) {
  var c = CAST[id], list = c && c.lines[kind];
  if (!list || !list.length) return null;
  var i = ((n | 0) % list.length + list.length) % list.length;
  return list[i];
}
/* how long a line stays up: long enough to read at a comfortable pace
   (about fifteen characters a second), never under two seconds */
function readMs(text) {
  return Math.max(2000, Math.min(7000, 900 + String(text || "").length * 66));
}
/* the syllables of a babble: roughly one per vowel group, capped */
function syllables(text) {
  var m = String(text || "").toLowerCase().match(/[aeiouy]+/g);
  return Math.max(1, Math.min(14, m ? m.length : 1));
}

var Cast = { CAST: CAST, KINDS: KINDS, get: get, ids: ids, line: line, readMs: readMs, syllables: syllables };
if (typeof module !== "undefined" && module.exports) module.exports = Cast;
else root.Cast = Cast;
})(typeof self !== "undefined" ? self : this);
