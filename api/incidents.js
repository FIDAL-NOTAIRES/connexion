/* INCIDENTS COMMUNS DE LA SUITE (18/10/2026) — décidés le 16/09/2026
   Ce fichier fait DEUX choses :
   1) la fonction GET /api/incidents rend la liste des incidents EN COURS, lue par le script commun bandeau.js (chargé par chaque outil) ;
   2) il exporte les gestes d'écriture (ouvrir, clore) que les fonctions SERVEUR de la suite appellent directement — il n'existe VOLONTAIREMENT aucune
      écriture par HTTP : une adresse publique d'écriture permettrait à n'importe qui de fabriquer de fausses alertes.
   Règles : une panne franche seulement (deux essais ratés, décidé par l'appelant) ; un incident déjà ouvert est maintenu ; une base qui tombe et revient
   plusieurs fois dans les 24 h qui suivent la première ouverture ne fait qu'UN incident (rouvert, compteur d'occurrences) ; la clôture est automatique,
   posée par l'appelant au retour à la normale ; rien n'est jamais supprimé.
   La liste est lisible depuis les seuls outils de la suite (CORS à liste fixe, complétable par la variable INCIDENTS_ORIGINES). */
const { neon } = require("@neondatabase/serverless");
let _sql = null;
const base = () => { if (!process.env.DATABASE_URL) return null; return (_sql ||= neon(process.env.DATABASE_URL)); };

const HOTES = ["connexion-omega", "fidal-apps", "carto-six", "marteau-rho", "fusion-three-kappa", "countdown-kappa-azure", "redpar-frontend", "urba-lemon", "xylo-phi",
  "trente", "matrice-black", "certif-bay", "risques", "paint-blue", "plume-mocha", "pret-particulier", "pret-pro", "prix-mu", "attente", "partage-amiable",
  "consult-sand", "histo-sand", "moneta-navy", "copro-sigma"].map(h => `https://${h}.vercel.app`);
const origineAutorisee = o => !!o && (HOTES.includes(o) || String(process.env.INCIDENTS_ORIGINES || "").split(",").map(x => x.trim()).filter(Boolean).includes(o));
const net = (t, max) => String(t == null ? "" : t).replace(/\s+/g, " ").trim().slice(0, max);

async function ouvrir(outil, nature, detail, sql = base()) {
  if (!sql) return null;
  const o = net(outil, 120), n = net(nature, 30), d = net(detail, 300);
  if (!o || !n) return null;
  const ouvert = await sql`SELECT id FROM incident WHERE outil = ${o} AND nature = ${n} AND clos_le IS NULL ORDER BY ouvert_le DESC LIMIT 1`;
  if (ouvert.length) { await sql`UPDATE incident SET dernier_vu_le = now(), detail = ${d} WHERE id = ${ouvert[0].id}`; return { id: ouvert[0].id, action: "maintenu" }; }
  const recent = await sql`SELECT id FROM incident WHERE outil = ${o} AND nature = ${n} AND ouvert_le > now() - interval '24 hours' ORDER BY ouvert_le DESC LIMIT 1`;
  if (recent.length) { await sql`UPDATE incident SET clos_le = NULL, dernier_vu_le = now(), occurrences = occurrences + 1, detail = ${d} WHERE id = ${recent[0].id}`; return { id: recent[0].id, action: "rouvert" }; }
  const cree = await sql`INSERT INTO incident (outil, nature, detail) VALUES (${o}, ${n}, ${d}) RETURNING id`;
  return { id: cree[0].id, action: "ouvert" };
}
async function clore(noms, nature, sql = base()) {
  if (!sql || !noms?.length) return 0;
  const r = await sql`UPDATE incident SET clos_le = now() WHERE clos_le IS NULL AND nature = ${net(nature, 30)} AND outil = ANY(${noms.map(x => net(x, 120))}) RETURNING id`;
  return r.length;
}
async function actifs(sql = base()) {
  if (!sql) return null;
  return sql`SELECT id, outil, nature, detail, ouvert_le, occurrences FROM incident WHERE clos_le IS NULL ORDER BY ouvert_le ASC`;
}

async function handler(req, res) {
  const origine = req.headers?.origin;
  res.setHeader("Vary", "Origin"); res.setHeader("Cache-Control", "no-store");
  if (origineAutorisee(origine)) { res.setHeader("Access-Control-Allow-Origin", origine); res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS"); }
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ erreur: "lecture seule" });
  try {
    const l = await actifs();
    if (l === null) return res.status(200).json({ actifs: [], base: "non configurée" });
    return res.status(200).json({ actifs: l, verifie_le: new Date().toISOString() });
  } catch (e) { return res.status(200).json({ actifs: [], base: "indisponible" }); }   // le bandeau ne doit jamais casser une page
}
module.exports = handler;
module.exports.ouvrir = ouvrir; module.exports.clore = clore; module.exports.actifs = actifs; module.exports.origineAutorisee = origineAutorisee; module.exports.HOTES = HOTES;
