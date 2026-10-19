/* JOURNAL DES INCIDENTS — consultation réservée à l'administrateur (19/10/2026) — décidé le 16/09/2026
   GET /api/journal?outil=&nature=&etat=&du=&au=&limite=&decalage=
   Réservé à JFD : la requête doit porter l'en-tête x-journal-code égal à la variable JOURNAL_CODE_ADMIN du projet (comparaison à temps constant ; sans la variable,
   la fonction refuse tout). Lecture seule, filtres (outil, type, état, dates) et AUCUN export, comme décidé : consultation à l'écran uniquement, pas de recherche libre.
   Les filtres sont des paramètres de requête, jamais du texte collé dans le SQL. Rien n'est jamais supprimé : le journal garde tout. */
const crypto = require("crypto");
const { neon } = require("@neondatabase/serverless");
let _sql = null;
const base = () => { if (!process.env.DATABASE_URL) return null; return (_sql ||= neon(process.env.DATABASE_URL)); };
const empreinte = t => crypto.createHash("sha256").update(String(t)).digest();
const codeBon = fourni => { const attendu = process.env.JOURNAL_CODE_ADMIN; if (!attendu || !fourni) return false; return crypto.timingSafeEqual(empreinte(fourni), empreinte(attendu)); };
const texte = (v, max = 120) => { const t = String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max); return t || null; };
const date = v => {   // null = pas de filtre ; false = date invalide (refusée avant tout appel à la base)
  const t = String(v == null ? "" : v).trim(); if (!t) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  const d = new Date(t + "T00:00:00Z"); return !isNaN(d) && d.toISOString().slice(0, 10) === t ? t : false;   // 2026-02-30 ou 2026-13-45 : invalides
};
const entier = (v, defaut, min, max) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : defaut; };

async function handler(req, res, sqlInjecte) {
  res.setHeader("Cache-Control", "no-store"); res.setHeader("X-Robots-Tag", "noindex");
  if (req.method !== "GET") return res.status(405).json({ erreur: "lecture seule" });
  if (!process.env.JOURNAL_CODE_ADMIN) return res.status(503).json({ erreur: "le code d'accès au journal n'est pas configuré (variable JOURNAL_CODE_ADMIN)" });
  if (!codeBon(req.headers?.["x-journal-code"])) { await new Promise(r => setTimeout(r, 400)); return res.status(401).json({ erreur: "code incorrect" }); }
  const sql = sqlInjecte || base(); if (!sql) return res.status(503).json({ erreur: "base de données non configurée" });
  const q = req.query || {}, du = date(q.du), au = date(q.au);
  if (du === false || au === false) return res.status(400).json({ erreur: "date invalide (format AAAA-MM-JJ)" });
  const etat = ["en_cours", "clos"].includes(q.etat) ? q.etat : null, outil = texte(q.outil), nature = texte(q.nature, 30);
  const limite = entier(q.limite, 100, 1, 500), decalage = entier(q.decalage, 0, 0, 1000000);
  try {
    const lignes = await sql`SELECT id, outil, nature, detail, ouvert_le, dernier_vu_le, clos_le, occurrences,
        EXTRACT(EPOCH FROM (COALESCE(clos_le, now()) - ouvert_le))::bigint AS duree_s, COUNT(*) OVER() AS total
      FROM incident
      WHERE (${outil}::text IS NULL OR outil = ${outil}::text)
        AND (${nature}::text IS NULL OR nature = ${nature}::text)
        AND (${etat}::text IS NULL OR (${etat}::text = 'en_cours' AND clos_le IS NULL) OR (${etat}::text = 'clos' AND clos_le IS NOT NULL))
        AND (${du}::date IS NULL OR ouvert_le >= ${du}::date)
        AND (${au}::date IS NULL OR ouvert_le < (${au}::date + 1))
      ORDER BY ouvert_le DESC, id DESC LIMIT ${limite} OFFSET ${decalage}`;
    const outils = (await sql`SELECT DISTINCT outil FROM incident ORDER BY outil`).map(r => r.outil), natures = (await sql`SELECT DISTINCT nature FROM incident ORDER BY nature`).map(r => r.nature);
    return res.status(200).json({ incidents: lignes.map(({ total, ...r }) => ({ ...r, id: Number(r.id), duree_s: Number(r.duree_s) })), total: lignes.length ? Number(lignes[0].total) : 0, outils, natures, limite, decalage });
  } catch (e) { return res.status(500).json({ erreur: "lecture du journal impossible" }); }
}
module.exports = (req, res) => handler(req, res);
module.exports._interne = { handler, codeBon, date, entier };
