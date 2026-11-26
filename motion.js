// Small motions shared by the pages: buttons that lean toward the pointer, cards that
// tilt and catch a soft light. Mouse and trackpad only; off when the visitor asks for
// reduced motion. Nothing here changes what a page says.
(function () {
  "use strict";
  if (!window.matchMedia) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  var each = function (sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); };

  // buttons lean a few pixels toward the pointer
  each(".btn-primary, .nav-cta, .fake-btn", function (b) {
    b.addEventListener("pointermove", function (e) {
      var r = b.getBoundingClientRect();
      var x = (e.clientX - r.left - r.width / 2) / r.width, y = (e.clientY - r.top - r.height / 2) / r.height;
      b.style.translate = (x * 10).toFixed(1) + "px " + (y * 8).toFixed(1) + "px";
    });
    b.addEventListener("pointerleave", function () { b.style.translate = ""; });
  });

  // cards tilt a little and a light follows the pointer
  each("[data-tilt], .limit-card, .tile, .pv", function (c) {
    c.addEventListener("pointermove", function (e) {
      var r = c.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      c.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
      c.style.setProperty("--my", (py * 100).toFixed(1) + "%");
      c.classList.add("tilting");
      c.style.transform = "perspective(900px) rotateX(" + ((0.5 - py) * 7).toFixed(2) + "deg) rotateY(" +
        ((px - 0.5) * 8).toFixed(2) + "deg) translateY(-5px)";
    });
    c.addEventListener("pointerleave", function () { c.classList.remove("tilting"); c.style.transform = ""; });
  });
})();
