// Shared by the contact page, the order page and /terima-kasih. tools/build_site.py fills in WA.
(function () {
  var WA = "";
  var T = function (s) { return window.MLLang ? window.MLLang.t(s) : s; };
  var f = document.querySelector("form[data-lead]");
  if (f) {
    f.elements.t.value = Date.now();
    var q = new URLSearchParams(location.search);
    Array.prototype.forEach.call(f.querySelectorAll("input[type=radio]"), function (r) {
      if (q.get(r.name) === r.value) r.checked = true;
    });
    var b = f.querySelector("button[type=submit]"), label = b.innerHTML;
    f.addEventListener("submit", function () { b.disabled = true; b.textContent = T("Sending…"); });
    window.addEventListener("pageshow", function () { b.disabled = false; b.innerHTML = label; });
  }
  // WhatsApp buttons open a chat with a ready message, in the visitor's language.
  function wa() {
    Array.prototype.forEach.call(document.querySelectorAll("a.wa"), function (a) {
      if (!WA) return;
      a.href = "https://wa.me/" + WA + "?text=" + encodeURIComponent(T(a.getAttribute("data-text") || "Hi Felix"));
      a.hidden = false;
    });
  }
  wa();
  document.addEventListener("ml:lang", wa);
})();
