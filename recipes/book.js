/* book.js — the table of contents of the recipe book.

   ADDING A RECIPE TO THE BOOK is one entry in `recipes` below (and the
   recipe's own folder — see recipes/README.md). The book page lists
   everything here, and every recipe page shows the others on its
   "More from the recipe book" shelf, so one line here puts a new recipe
   everywhere at once.

     id       the recipe's folder name; a page's shelf leaves itself out
     href     where it lives
     emoji    one picture for the card
     title    what it's called
     tagline  one line: what it is
     time     roughly how long, start to finish
     feeds    how much one unit of the dial feeds
     tags     a few words to filter by, once the book is big enough
     color    { light, dark } — the card's accent, matching the page's
     added    the date it went in (YYYY-MM-DD); it wears "New" for 45 days

   The list is in the order the book shows it. Newest first reads well. */
(function () {
"use strict";

window.BOOK = {
  recipes: [
    { id: "stroganoff", href: "/stroganoff/", emoji: "🍝",
      title: "Weeknight Beef Stroganoff",
      tagline: "Steak strips and mushrooms in a creamy sauce, over buttered egg noodles.",
      time: "About 40 minutes", feeds: "Feeds 4 per pound of steak",
      tags: ["Beef", "Weeknight", "Vegetarian swap"],
      color: { light: "#9a4a1f", dark: "#e8955a" }, added: "2026-11-16" },

    { id: "chili", href: "/chili/", emoji: "🍲",
      title: "Kitchen Table Chili",
      tagline: "Thick, well spiced and kid-approved, with the heat in parts you can leave out.",
      time: "About an hour", feeds: "About 5 bowls per pound of beef",
      tags: ["Beef", "One pot", "Vegetarian swap", "Freezes well"],
      color: { light: "#b8391f", dark: "#ff7454" }, added: "2026-10-19" }
  ]
};

/* ---- drawing it: the shelf on a recipe page, and the book page ---- */

var NEW_DAYS = 45;
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function isNew(r) {
  var t = Date.parse(r.added || "");
  return t && (Date.now() - t) < NEW_DAYS * 864e5 && Date.now() >= t;
}
function accent(r) {
  return r.color ? ' style="--al:' + esc(r.color.light) + ";--ad:" + esc(r.color.dark || r.color.light) + '"' : "";
}

/* the small card, for the shelf under a recipe */
function shelfCard(r) {
  return '<li><a class="rcard" href="' + esc(r.href) + '"' + accent(r) + ">" +
    '<span class="em" aria-hidden="true">' + esc(r.emoji) + "</span>" +
    "<span><b>" + esc(r.title) + (isNew(r) ? ' <span class="new">New</span>' : "") + "</b>" +
    "<small>" + esc(r.tagline) + "</small></span></a></li>";
}

/* the big card, for the book page */
function bookCard(r) {
  return '<li class="entry" data-tags="' + esc((r.tags || []).join("|")) + '"' + accent(r) + ">" +
    '<a href="' + esc(r.href) + '">' +
      '<span class="em" aria-hidden="true">' + esc(r.emoji) + "</span>" +
      "<h2>" + esc(r.title) + (isNew(r) ? ' <span class="new">New</span>' : "") + "</h2>" +
      '<p class="tl">' + esc(r.tagline) + "</p>" +
      '<p class="meta">' + esc(r.time) + " · " + esc(r.feeds) + "</p>" +
      '<ul class="tags">' + (r.tags || []).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" +
      '<span class="go">Cook it <span aria-hidden="true">→</span></span>' +
    "</a></li>";
}

function draw() {
  var list = window.BOOK.recipes;

  var shelf = document.getElementById("moreRecipes");
  if (shelf) {
    var here = shelf.getAttribute("data-here");
    var others = list.filter(function (r) { return r.id !== here; });
    if (others.length) {
      shelf.querySelector(".shelf").innerHTML = others.map(shelfCard).join("");
      shelf.hidden = false;
    }
  }

  var book = document.getElementById("bookList");
  if (book) {
    book.innerHTML = list.map(bookCard).join("");
    var count = document.getElementById("bookCount");
    if (count) count.textContent = list.length + (list.length === 1 ? " recipe" : " recipes") + " so far";
    filters(list, book);
  }
}

/* Filters only appear once there are enough recipes to need them —
   two cards and four filter buttons would be silly. */
function filters(list, book) {
  var box = document.getElementById("bookFilters");
  if (!box) return;
  if (list.length < 5) { box.hidden = true; return; }
  var tags = [];
  list.forEach(function (r) { (r.tags || []).forEach(function (t) { if (tags.indexOf(t) < 0) tags.push(t); }); });
  box.innerHTML = ["All"].concat(tags).map(function (t, i) {
    return '<button class="chip" data-tag="' + esc(i ? t : "") + '" aria-pressed="' + (i === 0) + '">' + esc(t) + "</button>";
  }).join("");
  box.hidden = false;
  box.addEventListener("click", function (e) {
    var b = e.target.closest("[data-tag]");
    if (!b) return;
    var want = b.getAttribute("data-tag");
    [].forEach.call(box.querySelectorAll("[data-tag]"), function (x) { x.setAttribute("aria-pressed", x === b); });
    [].forEach.call(book.children, function (li) {
      li.hidden = !!want && li.getAttribute("data-tags").split("|").indexOf(want) < 0;
    });
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", draw);
else draw();

})();
