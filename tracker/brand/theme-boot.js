(function(){try{var t=null;try{t=localStorage.getItem("oxAlphaTheme")}catch(e){}
if(t==="paper"||t==="steel")document.documentElement.dataset.theme=t;else document.documentElement.removeAttribute("data-theme");
window.addEventListener("storage",function(e){if(e.key==="oxAlphaTheme"){var v=e.newValue;document.documentElement.dataset.theme=(v==="paper"||v==="steel")?v:"";}});
window.__ephixTheme={set:function(t){if(t!=="paper"&&t!=="steel")t="";document.documentElement.dataset.theme=t;try{localStorage.setItem("oxAlphaTheme",t||"electric")}catch(e){}
try{window.dispatchEvent(new StorageEvent("storage",{key:"oxAlphaTheme",newValue:t||null}))}catch(e){}
document.querySelectorAll("[data-logo-auto]").forEach(function(img){var s=t==="paper"?img.dataset.logoLight:(t==="steel"&&img.dataset.logoSteel)?img.dataset.logoSteel:img.dataset.logoDark;if(s)img.setAttribute("src",s)});
document.querySelectorAll("[data-theme-flash]").forEach(function(el){el.classList.remove("go");void el.offsetWidth;el.classList.add("go")});}};
function buildDots(){document.querySelectorAll("[data-theme-dots]").forEach(function(host){["electric","paper","steel"].forEach(function(name){var b=document.createElement("button");b.type="button";b.className="theme-dot";b.dataset.t=name;b.title=name.toUpperCase()+" theme";b.addEventListener("click",function(){document.querySelectorAll(".theme-dot").forEach(function(d){d.classList.toggle("active",d.dataset.t===name)});window.__ephixTheme.set(name)});host.appendChild(b)});
var cur=t==="paper"||t==="steel"?t:"electric";host.querySelectorAll(".theme-dot").forEach(function(d){d.classList.toggle("active",d.dataset.t===cur)})});}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",buildDots);else buildDots();}catch(e){}})();
/* click bursts — blue/white print confetti on every page */
try {
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.addEventListener("click", function (e) {
      for (var i = 0; i < 12; i++) {
        let s = document.createElement("span");
        s.className = "fx-particle";
        s.style.left = e.clientX + "px";
        s.style.top = e.clientY + "px";
        s.style.background = i % 3 === 0 ? "#f4f6f8" : i % 3 === 1 ? "#3c86ff" : "#1769ff";
        document.body.appendChild(s);
        var ang = Math.random() * Math.PI * 2;
        var dist = 26 + Math.random() * 34;
        var rot = (Math.random() * 220 - 110).toFixed(0);
        s.animate(
          [
            { transform: "translate(-50%,-50%) rotate(0deg) scale(1)", opacity: 1 },
            { transform: "translate(calc(-50% + " + (Math.cos(ang) * dist).toFixed(1) + "px), calc(-50% + " + (Math.sin(ang) * dist - 8).toFixed(1) + "px)) rotate(" + rot + "deg) scale(.15)", opacity: 0 }
          ],
          { duration: 460 + Math.random() * 220, easing: "cubic-bezier(.1,.7,.3,1)" }
        ).onfinish = function () { s.remove(); };
      }
    });
  }
} catch (e) {}

/* no-VT fallback: ink wipe covers plain navigations (Firefox etc.).
   Skipped when the browser supports the native channel switch. */
try {
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches &&
        !(("VIEW_TRANSITION_RULE" in CSSRule) && typeof document.startViewTransition === "function" && !window.__ephixNoCrossDocVT)) {
    var wipeTo = function (href) {
      var w = document.createElement("div");
      w.className = "eb-nav-wipe";
      document.body.appendChild(w);
      try { sessionStorage.setItem("eb-wipe-arrive", "1"); } catch (e) {}
      setTimeout(function () { location.href = href; }, 180);
    };
    var armFallback = function () {
      document.addEventListener("click", function (e) {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        var a = e.target.closest && e.target.closest("a[href]");
        if (!a || a.hasAttribute("download") || a.target || a.origin !== location.origin) return;
        var dest = new URL(a.href);
        if (dest.pathname === location.pathname && dest.search === location.search) return;
        if (typeof document.startViewTransition === "function") return;
        e.preventDefault();
        wipeTo(a.href);
      });
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", armFallback);
    else armFallback();
  }
} catch (e) {}

/* arrival wipe-out on the destination page */
try {
  var arrive = null; try { arrive = sessionStorage.getItem("eb-wipe-arrive"); } catch (e) {}
  if (arrive && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    try { sessionStorage.removeItem("eb-wipe-arrive"); } catch (e) {}
    var runArrive = function () {
      var w = document.createElement("div");
      w.className = "eb-nav-wipe";
      document.body.appendChild(w);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { w.classList.add("out"); });
      });
      setTimeout(function () { w.remove(); }, 320);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", runArrive);
    else runArrive();
  }
} catch (e) {}
