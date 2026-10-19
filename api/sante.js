/* MORNING 3.0 — santé de la suite (18/10/2026)
   Décidé le 13/10/2026 : une seule page qui dit qui répond, qui est muet et ce qui manque.
   La page ne peut pas lire les réponses des autres applications (origines croisées) : c'est CETTE fonction, côté serveur, qui les interroge.
   - services : chaque application de la suite est appelée (code, durée). Joignable mais protégée par Vercel (401/403) = « protégé » ;
     page d'accueil introuvable (404) = « à voir » ; réponse en 5 s ou plus = « lent » (un réveil à froid n'est pas une panne) ;
     erreur réseau, délai dépassé ou erreur 5xx = « injoignable ».
   - détail : quand un service publie son état (aujourd'hui MONETA, /api/moteurs), on le lit : version, moteurs, clé de l'API, code d'administrateur.
   - sources : les services publics dont dépend la suite (adresse, cadastre, Géoportail, Géorisques, BRGM, API Claude). « Répond » = toute réponse HTTP
     inférieure à 500 : une erreur de paramètre n'est pas une panne, un délai dépassé ou un 5xx en est une. EXCEPTION : pour les cartes (Géoportail, BRGM),
     la sonde fait la même requête que RISQUES (une carte de 64 px) et exige une vraie image.
   - RISQUES n'a pas de page d'accueil (dépôt api/ seul) : son 404 à la racine est normal et n'est pas signalé.
   Reprise : ?services=A,B ne rappelle que ces services (la page relance ainsi ceux qui n'ont pas répondu du premier coup).
   INCIDENTS (18/10/2026) : quand DATABASE_URL est posée, la fonction tient le journal commun des incidents (api/incidents.js) : un service ou une source muet
   n'ouvre un incident que sur l'appel de REPRISE (?reprise=1, deuxième essai demandé par la page : « deux essais ratés avant de déclarer une panne franche ») ;
   tout élément qui répond clôt son incident en cours, dès le premier appel. Sans base, rien n'est écrit et rien ne casse.
   Aucune donnée personnelle, aucun secret : uniquement des adresses publiques. */
const incidents = require("./incidents.js");

const DELAI_MS = 8000, LENT_MS = 5000;

function lireMoneta(corps) {
  const m = JSON.parse(corps)?.moneta; if (!m) throw new Error("réponse inattendue");
  const detail = [{ niveau: "ok", texte: "version " + m.version }], mo = m.moteurs || {};
  for (const [k, v] of Object.entries(mo)) {
    if (k === "acces") continue;
    if (!/en service|navigateur/.test(v?.etat || "")) detail.push({ niveau: "ko", texte: `moteur « ${k} » : ${v?.etat || "état inconnu"}` });
  }
  if (mo.acces?.etat !== "en service") detail.push({ niveau: "ko", texte: "code d'administrateur absent du serveur (variable MONETA_CODE_ADMIN)" });
  return detail;
}

const SERVICES = [
  ["FIDAL Apps", "https://fidal-apps.vercel.app/"], ["CARTO", "https://carto-six.vercel.app/"], ["MARTEAU", "https://marteau-rho.vercel.app/"],
  ["FUSION", "https://fusion-three-kappa.vercel.app/"], ["COUNTDOWN", "https://countdown-kappa-azure.vercel.app/"], ["REDPAR", "https://redpar-frontend.vercel.app/"],
  ["URBA", "https://urba-lemon.vercel.app/"], ["XYLO", "https://xylo-phi.vercel.app/"], ["TRENTE", "https://trente.vercel.app/"],
  ["MATRICE", "https://matrice-black.vercel.app/"], ["CERTIF", "https://certif-bay.vercel.app/"], ["RISQUES", "https://risques.vercel.app/", { apiSeule: true }],
  ["PAINT", "https://paint-blue.vercel.app/"], ["PLUME", "https://plume-mocha.vercel.app/"], ["PRÊT PART.", "https://pret-particulier.vercel.app/"],
  ["PRÊT PRO", "https://pret-pro.vercel.app/"], ["PRIX", "https://prix-mu.vercel.app/"], ["ATTENTE", "https://attente.vercel.app/"],
  ["PARTAGE", "https://partage-amiable.vercel.app/"], ["CONSULT", "https://consult-sand.vercel.app/"], ["HISTO", "https://histo-sand.vercel.app/"],
  ["MONETA", "https://moneta-navy.vercel.app/", { statut: "https://moneta-navy.vercel.app/api/moteurs", lire: lireMoneta }], ["COPRO", "https://copro-sigma.vercel.app/"],
  ["COFFEE", "https://coffee-taupe-gamma.vercel.app/"], ["PHARE", "https://phare-ashy.vercel.app/"], ["TAXVÉRIF-PARTICULIER", "https://taxverif-particulier.vercel.app/"]
];

const SOURCES = [
  ["Adresse (BAN)", "https://api-adresse.data.gouv.fr/search/?q=3+place+de+la+madeleine+paris&limit=1"],
  ["Cadastre (API Carto IGN)", "https://apicarto.ign.fr/api/cadastre/commune?code_insee=75108"],
  ["Géoportail (WMS)", "https://data.geopf.fr/wms-r?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLES=&CRS=EPSG:4326&BBOX=48.86,2.33,48.87,2.34&WIDTH=64&HEIGHT=64&FORMAT=image/jpeg&TRANSPARENT=FALSE", { image: /jpe?g/i }],
  ["Géorisques (API)", "https://www.georisques.gouv.fr/api/v1/gaspar/risques?code_insee=75108"],
  ["BRGM (WMS Géorisques)", "https://mapsref.brgm.fr/wxs/georisques/risques?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=REMNAPPE&STYLES=&CRS=EPSG:4326&BBOX=50.09,1.82,50.11,1.84&WIDTH=64&HEIGHT=64&FORMAT=image/png&TRANSPARENT=TRUE", { image: /png/i }],
  ["API Claude", "https://api.anthropic.com/"]
];

async function sonder(url, delai = DELAI_MS, lireCorps = false) {
  const t0 = Date.now(), ctl = new AbortController(), minuteur = setTimeout(() => ctl.abort(), delai);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: "follow", headers: { "User-Agent": "FIDAL-MORNING-sante/3.0", Accept: "*/*" } });
    const corps = lireCorps ? (await r.text()).slice(0, 20000) : null;
    return { code: r.status, ms: Date.now() - t0, corps, type: r.headers?.get?.("content-type") || "" };
  } catch (e) {
    return { erreur: e?.name === "AbortError" ? `délai dépassé (${Math.round(delai / 1000)} s)` : (e?.cause?.code || e?.message || "erreur réseau"), ms: Date.now() - t0 };
  } finally { clearTimeout(minuteur); }
}

function etatDe(r) {
  if (r.erreur) return "ko";
  if (r.code >= 500) return "ko";
  if (r.code === 401 || r.code === 403) return "protege";
  if (r.code === 404) return "attention";
  return r.ms >= LENT_MS ? "lent" : "ok";
}

async function sonderService([nom, url, extra]) {
  const r = await sonder(url), sortie = { nom, url, etat: etatDe(r), ms: r.ms, ...(r.code ? { code: r.code } : {}), ...(r.erreur ? { erreur: r.erreur } : {}) };
  if (extra?.apiSeule && r.code === 404) { sortie.etat = "ok"; sortie.detail = [{ niveau: "ok", texte: "API seule : pas de page d'accueil, le 404 est normal" }]; }   // RISQUES : api/ seulement
  if (extra?.statut && (sortie.etat === "ok" || sortie.etat === "lent")) {   // le service publie son état : on le lit
    const s = await sonder(extra.statut, DELAI_MS, true);
    try {
      if (s.erreur) throw new Error(s.erreur);
      if (s.code !== 200) throw new Error("HTTP " + s.code);
      sortie.detail = extra.lire(s.corps);
      if (sortie.detail.some(d => d.niveau === "ko")) sortie.etat = "degrade";
    } catch (e) { sortie.detail = [{ niveau: "attention", texte: "état détaillé illisible : " + e.message }]; if (sortie.etat === "ok") sortie.etat = "attention"; }
  }
  return sortie;
}

// Une source dont on attend une IMAGE (cartes) n'« répond » que si elle rend bien une image : le BRGM peut répondre 200 à GetCapabilities
// et refuser les cartes aux serveurs de Vercel (constaté le 13/10/2026 par RISQUES). Les autres : toute réponse inférieure à 500.
async function sonderSource([nom, url, extra]) {
  const r = await sonder(url);
  let repond = !r.erreur && r.code < 500, erreur = r.erreur;
  if (extra?.image && !r.erreur) { repond = r.code === 200 && extra.image.test(r.type || ""); if (!repond) erreur = `pas d'image reçue (HTTP ${r.code}${r.type ? ", " + r.type.split(";")[0] : ""})`; }
  return { nom, url, etat: !repond ? "ko" : r.ms >= LENT_MS ? "lent" : "ok", ms: r.ms, ...(r.code ? { code: r.code } : {}), ...(erreur ? { erreur } : {}) };
}

/* Journal commun : un muet CONFIRMÉ (reprise) ouvre ; tout ce qui répond clôt. Les erreurs de base sont avalées : la santé prime sur la tenue du journal. */
async function rapporter(services, sources, confirme, sql) {
  const bilan = { ouverts: [], clos: 0 };
  const lots = [["service", services], ["source", sources]];
  for (const [nature, liste] of lots) {
    const bons = liste.filter(x => x.etat !== "ko").map(x => x.nom);
    if (bons.length) bilan.clos += await incidents.clore(bons, nature, sql);
    if (confirme) for (const x of liste.filter(y => y.etat === "ko")) {
      const r = await incidents.ouvrir(x.nom, nature, x.erreur || (x.code ? "HTTP " + x.code : "injoignable"), sql);
      if (r) bilan.ouverts.push({ outil: x.nom, nature, action: r.action });
    }
  }
  return bilan;
}

async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const filtre = String(req.query?.services || "").split(",").map(s => s.trim()).filter(Boolean), confirme = String(req.query?.reprise || "") === "1";
  const choisis = SERVICES.filter(s => !filtre.length || filtre.includes(s[0])), sourcesChoisies = SOURCES.filter(s => !filtre.length || filtre.includes(s[0]));
  const [services, sources] = await Promise.all([Promise.all(choisis.map(sonderService)), Promise.all(sourcesChoisies.map(sonderSource))]);
  const sortie = { verifie_le: new Date().toISOString(), services, sources };
  if (process.env.DATABASE_URL) { try { sortie.incidents = await rapporter(services, sources, confirme); } catch (e) { sortie.incidents = { erreur: "journal indisponible" }; } }
  res.status(200).json(sortie);
}
module.exports = handler;
module.exports._interne = { SERVICES, SOURCES, sonder, etatDe, sonderService, sonderSource, lireMoneta, rapporter, LENT_MS, DELAI_MS };
