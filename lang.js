// English / Bahasa Indonesia switch for every page. Pages are written in English; the
// Bahasa text comes from window.ML_ID (id.js, built from website_src/i18n/id.json),
// keyed by the English text. tools/i18n_check.py applies the same rule to the source,
// so a test can tell when a text has no translation.
//
// Choice order: the visitor's own pick (remembered) -> a phone/browser set to
// Indonesian -> English. Buttons: any element with data-set-lang="en|id".
(function () {
  var KEY = "ml_lang", ID = window.ML_ID || {};
  var INLINE = { EM: 1, I: 1, B: 1, STRONG: 1, SPAN: 1, BR: 1, SMALL: 1, SUP: 1, SUB: 1, CODE: 1, U: 1 };
  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1 };
  var ATTRS = ["placeholder", "aria-label"];
  var origHTML = new WeakMap(), origText = new WeakMap(), origAttr = new WeakMap();
  var lang = "en", observer = null, title = document.title;

  function norm(s) { return String(s).replace(/\s+/g, " ").trim(); }
  function has(k) { return Object.prototype.hasOwnProperty.call(ID, k) && ID[k] !== k; }

  function inlineOnly(el) {
    var all = el.getElementsByTagName("*");
    for (var i = 0; i < all.length; i++) {
      var d = all[i];
      if (!INLINE[d.tagName.toUpperCase()] || d.id || d.hasAttribute("data-count")) return false;
    }
    return true;
  }

  function translate(el) {
    if (el.nodeType !== 1 || SKIP[el.tagName.toUpperCase()] || el.hasAttribute("data-no-t")) return;
    ATTRS.forEach(function (a) {
      var v = el.getAttribute(a);
      if (v && has(norm(v))) {
        var o = origAttr.get(el) || {};
        o[a] = v; origAttr.set(el, o);
        el.setAttribute(a, ID[norm(v)]);
      }
    });
    if (el.children.length === 0 || inlineOnly(el)) {
      var k = norm(el.textContent);
      if (k && has(k) && el.innerHTML !== ID[k]) {
        origHTML.set(el, el.innerHTML);
        el.innerHTML = ID[k];
      }
      return;
    }
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 1) translate(n);
      else if (n.nodeType === 3) {
        var t = norm(n.nodeValue);
        if (t && has(t)) {
          origText.set(n, n.nodeValue);
          var lead = n.nodeValue.match(/^\s*/)[0], tail = n.nodeValue.match(/\s*$/)[0];
          n.nodeValue = lead + ID[t] + tail;
        }
      }
    }
  }

  function restore(el) {
    var walker = document.createTreeWalker(el, 5 /* elements + text */);
    var nodes = [el];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (n) {
      if (origHTML.has(n)) { n.innerHTML = origHTML.get(n); origHTML.delete(n); }
      else if (origText.has(n)) { n.nodeValue = origText.get(n); origText.delete(n); }
      if (origAttr.has(n)) {
        var o = origAttr.get(n);
        for (var a in o) n.setAttribute(a, o[a]);
        origAttr.delete(n);
      }
    });
  }

  function quietly(fn) {
    if (observer) observer.disconnect();
    fn();
    if (observer && lang === "id") observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function apply(next) {
    lang = next === "id" ? "id" : "en";
    document.documentElement.lang = lang;
    quietly(function () {
      if (lang === "id") {
        translate(document.body);
        document.title = has(norm(title)) ? ID[norm(title)] : title;
      } else {
        restore(document.body);
        document.title = title;
      }
      // links that have a page in each language: data-href-id="/contoh-audit-id"
      Array.prototype.forEach.call(document.querySelectorAll("[data-href-id]"), function (a) {
        if (!a.hasAttribute("data-href-en")) a.setAttribute("data-href-en", a.getAttribute("href"));
        a.setAttribute("href", a.getAttribute(lang === "id" ? "data-href-id" : "data-href-en"));
      });
      Array.prototype.forEach.call(document.querySelectorAll("[data-set-lang]"), function (b) {
        b.setAttribute("aria-pressed", String(b.getAttribute("data-set-lang") === lang));
      });
    });
    document.dispatchEvent(new CustomEvent("ml:lang", { detail: lang }));
  }

  // Text that scripts write later (the optimizer, tooltips, "Copied") gets translated too.
  if (window.MutationObserver) {
    observer = new MutationObserver(function (records) {
      if (lang !== "id") return;
      quietly(function () {
        records.forEach(function (r) {
          var el = r.target.nodeType === 3 ? r.target.parentNode : r.target;
          if (el && el.nodeType === 1) translate(el);
        });
      });
    });
  }

  function initial() {
    try { var s = localStorage.getItem(KEY); if (s === "en" || s === "id") return s; } catch (e) {}
    var langs = navigator.languages || [navigator.language || ""];
    for (var i = 0; i < langs.length; i++) if (/^(id|in)\b/i.test(langs[i])) return "id";
    return "en";
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-set-lang]");
    if (!b) return;
    e.preventDefault();
    var next = b.getAttribute("data-set-lang");
    try { localStorage.setItem(KEY, next); } catch (err) {}
    apply(next);
  });

  window.MLLang = {
    get: function () { return lang; },
    set: apply,
    t: function (en) { return lang === "id" && has(norm(en)) ? ID[norm(en)] : en; }
  };
  apply(initial());
  document.documentElement.classList.remove("ml-pending");
})();
