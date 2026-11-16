/* version.js — which release this is, written in one place.

   The page loads this, so the game can say what it is (on the title, the
   pause card and the loading screen). The worker loads it too (sw.js), so
   the copy kept for playing offline is named for the release, and a page
   that is already open hears when a newer one is out.

   For every release, change this one string and nothing else:
     the last number    for a fix nobody would notice in play;
     the middle one     for anything a player would;
     the first          only if a save could not be carried forward. That
                        has never happened, and engine.js is built so that
                        it need not: see "saves" there.

   A save is never tied to a release. Every later release reads it. */
(function (g) { g.SUNLIGHT_VERSION = "1.35.0"; })(typeof self !== "undefined" ? self : window);
