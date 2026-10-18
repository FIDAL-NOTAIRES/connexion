/* FIDAL — BANDEAU D'INCIDENTS COMMUN (18/10/2026) — décidé le 16/09/2026
   Un seul script pour toute la suite : chaque outil le charge d'une ligne,
     <script src="https://connexion-omega.vercel.app/bandeau.js" defer></script>
   Il lit la liste des incidents EN COURS (https://connexion-omega.vercel.app/api/incidents) et, s'il y en a, pose en haut de la page UN SEUL bandeau déroulable
   qui annonce leur nombre ; on le déplie pour voir le détail. On peut le FERMER pour la session en cours ; il REVIENT à chaque nouvelle session (nouvel onglet
   ou navigateur rouvert) tant que l'incident n'est pas clos. Un incident résolu disparaît tout seul (clôture automatique côté serveur). Si la liste est
   illisible, le script se tait : un bandeau ne doit jamais gêner un outil. Aucune donnée personnelle ; rien n'est écrit depuis le navigateur.
   Mise en page : par défaut le bandeau est le PREMIER élément du <body>. Une page dont la mise en page ne le permet pas (le lanceur, coque de téléphone aux écrans
   superposés) déclare un emplacement <div id="fidal-bandeau-zone"> et le bandeau s'y place. Sous l'encoche d'un téléphone, il respecte la zone sûre du haut. */
(function () {
  if (window.__fidalBandeau) return; window.__fidalBandeau = true;
  var API = "https://connexion-omega.vercel.app/api/incidents", CLE = "fidal.bandeau.ferme", REGARD = 300000, barre = null;
  var esc = function (t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var fermee = function () { try { return sessionStorage.getItem(CLE) === "1"; } catch (e) { return false; } };
  var LIB = { service: "outil", source: "source de données", base: "base de données", drive: "Drive" };
  var depuis = function (iso) { var d = new Date(iso); if (isNaN(d)) return ""; return d.toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); };
  function style() {
    if (document.getElementById("fidal-bandeau-style")) return;
    var s = document.createElement("style"); s.id = "fidal-bandeau-style";
    s.textContent = "#fidal-bandeau{font:13px/1.4 'Segoe UI',system-ui,sans-serif;background:#A01040;color:#fff;position:relative;z-index:99999}" +
      "#fidal-bandeau .fb-haut{display:flex;align-items:center;gap:10px;padding:7px 14px}" +
      "#fidal-bandeau:not(.fb-zone) .fb-haut{padding-top:calc(7px + env(safe-area-inset-top,0px))}" +
      "#fidal-bandeau summary{cursor:pointer;font-weight:600;list-style:none;flex:1}#fidal-bandeau summary::-webkit-details-marker{display:none}" +
      "#fidal-bandeau summary::before{content:'';display:inline-block;border-left:8px solid #fff;border-top:5px solid transparent;border-bottom:5px solid transparent;margin-right:8px;transition:transform .15s}" +
      "#fidal-bandeau details[open] summary::before{transform:rotate(90deg)}" +
      "#fidal-bandeau button{background:rgba(255,255,255,.18);color:#fff;border:1px solid rgba(255,255,255,.5);border-radius:4px;padding:3px 9px;font:12px 'Segoe UI',system-ui,sans-serif;cursor:pointer}" +
      "#fidal-bandeau ul{margin:0;padding:6px 14px 10px 36px;background:rgba(0,0,0,.18)}#fidal-bandeau li{padding:2px 0}#fidal-bandeau .fb-d{opacity:.85}";
    (document.head || document.documentElement).appendChild(s);
  }
  function dessiner(actifs) {
    if (!actifs || !actifs.length || fermee()) { if (barre) { barre.remove(); barre = null; } return; }
    var ouvert = barre && barre.querySelector("details") && barre.querySelector("details").open;
    style();
    if (!barre) {
      var zone = document.getElementById("fidal-bandeau-zone"), hote = zone || document.body || document.documentElement;
      barre = document.createElement("div"); barre.id = "fidal-bandeau"; barre.setAttribute("role", "status"); if (zone) barre.className = "fb-zone";
      if (zone) zone.appendChild(barre); else hote.insertBefore(barre, hote.firstChild);
    }
    var n = actifs.length;
    barre.innerHTML = '<div class="fb-haut"><details' + (ouvert ? " open" : "") + '><summary>⚠ ' + n + (n > 1 ? " incidents en cours" : " incident en cours") + ' — ' + (ouvert ? "masquer" : "voir") + ' le détail</summary><ul>' +
      actifs.map(function (a) { return "<li><b>" + esc(a.outil) + "</b> — " + esc(LIB[a.nature] || a.nature) + ", depuis le " + esc(depuis(a.ouvert_le)) + (a.occurrences > 1 ? " (" + a.occurrences + " coupures dans la journée)" : "") + (a.detail ? '<span class="fb-d"> : ' + esc(a.detail) + "</span>" : "") + "</li>"; }).join("") +
      '</ul></details><button type="button" id="fidal-bandeau-fermer" title="Le bandeau reviendra à la prochaine session tant que l\'incident dure">Fermer pour cette session</button></div>';
    barre.querySelector("#fidal-bandeau-fermer").addEventListener("click", function () { try { sessionStorage.setItem(CLE, "1"); } catch (e) { } if (barre) { barre.remove(); barre = null; } });
  }
  function lire() {
    if (fermee()) return;
    var ctl = typeof AbortController === "function" ? new AbortController() : null, t = ctl ? setTimeout(function () { ctl.abort(); }, 10000) : null;
    fetch(API, { cache: "no-store", signal: ctl ? ctl.signal : undefined }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { dessiner(j && Array.isArray(j.actifs) ? j.actifs : null); }).catch(function () { }).then(function () { if (t) clearTimeout(t); });
  }
  lire(); setInterval(lire, REGARD);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) lire(); });
})();
