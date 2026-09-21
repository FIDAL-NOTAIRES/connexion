/* FIDAL Notaires — acces.js
   Bibliothèque commune d'accès Google pour les outils du cabinet.

   Principe : l'accord est donné UNE FOIS le matin sur la page de connexion.
   Ensuite, chaque outil obtient un jeton sans nouvel écran en appelant
   FidalAcces.jeton(). Le même client OAuth est utilisé partout ; Google
   reconnaît l'accord déjà donné et rend le jeton silencieusement.

   Usage dans un outil :
     <script src="https://accounts.google.com/gsi/client" async defer></script>
     <script src="https://<page-de-connexion>/acces.js"></script>
     ...
     const jeton = await FidalAcces.jeton();          // null si pas connecté
     const r = await fetch(url, {headers:{Authorization:"Bearer "+jeton}});

   FidalAcces.jeton({interactif:true}) ouvre l'écran Google si nécessaire
   (à réserver à un clic de l'utilisateur, sinon le navigateur bloque la fenêtre). */
(function(global){
  "use strict";
  const CLIENT_ID = "82507767087-kr2q7r67r2m4llj6ftldgr4rc2n24gbu.apps.googleusercontent.com";
  const SCOPE = "https://www.googleapis.com/auth/drive.readonly";
  const CLE_ETAT = "fidal.acces.etat";        // trace locale (compte, heure), jamais le jeton
  const PAGE_CONNEXION = (document.currentScript && document.currentScript.src)
      ? new URL(document.currentScript.src).origin + "/"
      : "";

  let jetonCourant = null, expireA = 0, client = null;

  function pret(){
    return new Promise(res => {
      (function attendre(n){
        if(global.google && google.accounts && google.accounts.oauth2) return res(true);
        if(n > 80) return res(false);                 // 20 s : la bibliothèque Google ne vient pas
        setTimeout(() => attendre(n+1), 250);
      })(0);
    });
  }

  function lireEtat(){ try{ return JSON.parse(localStorage.getItem(CLE_ETAT) || "null"); }catch(e){ return null; } }
  function ecrireEtat(e){ try{ localStorage.setItem(CLE_ETAT, JSON.stringify(e)); }catch(_){} }

  /* Demande un jeton. interactif:false → aucun écran ; si Google ne peut pas
     rendre le jeton sans interaction, on renvoie null. */
  function demander(opts){
    opts = opts || {};
    return new Promise(async res => {
      if(!(await pret())) return res(null);
      let rendu = false;
      const fin = v => { if(!rendu){ rendu = true; res(v); } };
      client = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID, scope: SCOPE,
        prompt: opts.interactif ? "" : "none",
        callback: r => {
          if(r && r.access_token){
            jetonCourant = r.access_token;
            expireA = Date.now() + (Number(r.expires_in || 3600) - 60) * 1000;
            const e = lireEtat() || {};
            e.derniereConnexion = Date.now(); e.expireA = expireA;
            ecrireEtat(e);
            fin(jetonCourant);
          } else fin(null);
        },
        error_callback: () => fin(null)
      });
      client.requestAccessToken();
      setTimeout(() => fin(null), opts.interactif ? 180000 : 12000);
    });
  }

  const FidalAcces = {
    CLIENT_ID, SCOPE, PAGE_CONNEXION,
    /* Jeton valide : celui en mémoire s'il n'a pas expiré, sinon demande silencieuse. */
    async jeton(opts){
      opts = opts || {};
      if(jetonCourant && Date.now() < expireA) return jetonCourant;
      const j = await demander({interactif: !!opts.interactif});
      return j;
    },
    /* Oublie le jeton local (ne révoque rien côté Google). */
    oublier(){ jetonCourant = null; expireA = 0; },
    /* Compte et heure de la dernière connexion connue sur ce poste. */
    etat(){ return lireEtat(); },
    noterCompte(compte){ const e = lireEtat() || {}; e.compte = compte; ecrireEtat(e); },
    /* Vrai si un jeton est en mémoire et valide. */
    connecte(){ return !!jetonCourant && Date.now() < expireA; },
    expiration(){ return expireA; }
  };
  global.FidalAcces = FidalAcces;
})(window);
