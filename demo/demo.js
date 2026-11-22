// GestionPro : démonstration en ligne, en lecture seule (site/demo).
// Chargé en premier par chaque page : remplace le serveur par des réponses enregistrées à l'avance
// (outils_vendeur/demo_web.py), bloque toute modification et fige la date de la démonstration.
"use strict";
(() => {
  const MAINTENANT = 1795374752983;                       // date des données enregistrées (ms)
  const TELECHARGER = "../index.html#telecharger";

  // --- Date figée : l'agenda, les retards et les échéances restent cohérents avec les données ------------
  const VraieDate = Date;
  const decalage = MAINTENANT - VraieDate.now();
  class DateDemo extends VraieDate {
    constructor(...args) {
      if (args.length === 0) super(VraieDate.now() + decalage);
      else super(...args);
    }
    static now() { return VraieDate.now() + decalage; }
  }
  window.Date = DateDemo;

  // --- Réponses enregistrées ------------------------------------------------------------------------------
  const cle = (url) => { const u = new URL(url, location.href); const i = u.pathname.indexOf('/api/'); const p = [...new URLSearchParams(u.search)].filter(([k]) => k !== 't').sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)); return u.pathname.slice(i) + (p.length ? '?' + new URLSearchParams(p).toString() : ''); };
  let donnees = null;
  const chargement = (async () => {
    donnees = await (await window.fetch.call(window, "donnees-demo.json")).json();
  })();
  const vraiFetch = window.fetch.bind(window);

  const json = (corps, statut = 200) => new Response(JSON.stringify(corps), {
    status: statut, headers: { "Content-Type": "application/json" } });

  // Écritures déclenchées sans action de l'utilisateur (vérifications en arrière-plan) : refusées sans message
  const SILENCIEUX = ["/api/support/erreur", "/api/licence/recuperer", "/api/plateforme/qonto/suivre",
                      "/api/plateforme/reglages", "/api/reception/synchroniser"];

  function trouver(url) {
    const k = cle(url);
    if (donnees[k]) return donnees[k];
    const chemin = k.split("?")[0];
    const voisin = Object.keys(donnees).find((x) => x.split("?")[0] === chemin);
    (window.__demoManques ||= []).push(k);   // contrôle de la démonstration (outils_vendeur/demo_web.py)
    return voisin ? donnees[voisin] : null;
  }

  window.fetch = async (entree, options = {}) => {
    const url = typeof entree === "string" ? entree : entree.url;
    const u = new URL(url, location.href);
    if (!u.pathname.includes("/api/")) return vraiFetch(entree, options);
    await chargement;
    const methode = (options.method || (typeof entree === "string" ? "GET" : entree.method) || "GET").toUpperCase();
    const chemin = cle(url).split("?")[0];
    if (methode !== "GET") {
      if (chemin === "/api/devis/calculer") return json(calculer(JSON.parse(options.body)));
      if (!SILENCIEUX.includes(chemin)) prevenir();
      return json({ detail: "Démonstration : les modifications sont désactivées." }, 403);
    }
    if (chemin === "/api/recherche") return json(rechercher(u.searchParams.get("q") || ""));
    const r = trouver(url);
    if (!r) return json({ detail: "Démonstration : ce contenu n'est pas disponible." }, 404);
    if (r.f) return vraiFetch(r.f);
    return new Response(r.j, { status: r.s, headers: { "Content-Type": "application/json" } });
  };

  // --- Liens et images vers le serveur (/api/…) ----------------------------------------------------------
  function fichier(url) {
    if (!donnees) return null;
    const r = trouver(url);
    return r && r.f ? r.f : null;
  }
  const versApi = (adresse) => {
    try { return new URL(adresse, location.href).pathname.includes("/api/"); } catch { return false; }
  };

  document.addEventListener("click", async (e) => {
    const lien = e.target.closest && e.target.closest("a[href]");
    if (!lien || !versApi(lien.getAttribute("href"))) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    await chargement;
    const f = fichier(lien.getAttribute("href"));
    if (f) window.open(f, "_blank");
    else prevenir("Ce document n'est pas disponible dans la démonstration.");
  }, true);

  const ouvrir = window.open.bind(window);
  window.open = function (adresse = "", ...autres) {
    if (adresse && versApi(String(adresse))) {
      const f = fichier(String(adresse));
      if (f) return ouvrir(f, ...autres);
      prevenir("Ce document n'est pas disponible dans la démonstration.");
      return null;
    }
    if (!adresse) {   // fenêtre ouverte avant d'attendre le serveur : ouverte seulement si une adresse arrive
      return { set location(a) { window.open(String(a)); }, close() {}, document: document.implementation.createHTMLDocument("") };
    }
    return ouvrir(adresse, ...autres);
  };

  const proprieteSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
  const remplacerImage = (img, adresse) => {
    chargement.then(() => {
      const f = fichier(adresse);
      if (f) proprieteSrc.set.call(img, f);
    });
  };
  Object.defineProperty(HTMLImageElement.prototype, "src", {
    get() { return proprieteSrc.get.call(this); },
    set(v) {
      if (versApi(String(v))) remplacerImage(this, String(v));
      else proprieteSrc.set.call(this, v);
    },
  });
  new MutationObserver((changements) => {
    for (const c of changements) for (const n of c.addedNodes) {
      if (n.nodeType !== 1) continue;
      for (const img of [n, ...n.querySelectorAll("img")]) {
        const a = img.tagName === "IMG" && img.getAttribute("src");
        if (a && versApi(a)) { img.removeAttribute("src"); remplacerImage(img, a); }
      }
      for (const cadre of [n, ...n.querySelectorAll("iframe")]) {   // aperçu d'un PDF (facture saisie, reçue)
        const a = cadre.tagName === "IFRAME" && cadre.getAttribute("src");
        if (!a || !versApi(a)) continue;
        cadre.removeAttribute("src");
        chargement.then(() => {
          const f = fichier(a);
          if (f) cadre.src = f + (a.includes("#") ? a.slice(a.indexOf("#")) : "");
          else cadre.srcdoc = `<p style="font: 15px system-ui, sans-serif; color: #555; padding: 24px">
            Aperçu non disponible dans la démonstration.</p>`;
        });
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  // Pas de service worker : la démonstration est un site statique
  if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve();

  // --- Calcul des totaux du devis (même règle que backend/calcul/totaux.py, en centimes) ------------------
  function calculer(devis) {
    const c = (x) => Math.round(Number(x || 0) * 100);       // centimes
    const arrondi = (x) => Math.round(x + 1e-9);
    const lignes = devis.lignes || [];
    const lignesHt = lignes.map((l) => arrondi(Number(l.quantite || 0) * c(l.prix_unitaire_ht)));
    const brut = lignesHt.reduce((a, b) => a + b, 0);
    const tauxRemise = Number(devis.remise_pourcent || 0) / 100;
    const remise = arrondi(brut * tauxRemise);
    const totalHt = brut - remise;
    const bases = {};
    const ent = donnees["/api/entreprise"] ? JSON.parse(donnees["/api/entreprise"].j) : {};
    if (!ent.franchise_tva) {
      lignes.forEach((l, i) => {
        const t = Number(l.taux_tva || 0);
        bases[t] = (bases[t] || 0) + lignesHt[i] * (1 - tauxRemise);
      });
    }
    const tva = Object.keys(bases).map(Number).sort((a, b) => a - b).filter((t) => t > 0)
      .map((t) => ({ taux: t, base_ht: arrondi(bases[t]) / 100, montant: arrondi(bases[t] * t / 100) / 100 }));
    const totalTva = tva.reduce((a, l) => a + c(l.montant), 0);
    const ttc = totalHt + totalTva;
    const acompte = arrondi(ttc * Number(devis.acompte_pourcent || 0) / 100);
    return { lignes_ht: lignesHt.map((x) => x / 100), total_brut_ht: brut / 100, remise: remise / 100,
             total_ht: totalHt / 100, tva, total_tva: totalTva / 100, total_ttc: ttc / 100,
             acompte: acompte / 100, reste_a_payer: (ttc - acompte) / 100 };
  }

  // --- Recherche (barre du menu) : dans l'index enregistré ------------------------------------------------
  function rechercher(q) {
    const normaliser = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
    const mots = normaliser(q).split(/\s+/).filter(Boolean);
    if (!mots.length || mots.join("").length < 2) return { groupes: [] };
    const index = donnees["#recherche"] || [];
    const groupes = [];
    for (const r of index) {
      if (!mots.every((m) => r.cherche.includes(m))) continue;
      let g = groupes.find((x) => x.titre === r.groupe);
      if (!g) groupes.push(g = { titre: r.groupe, resultats: [], total: 0 });
      g.total += 1;
      if (g.resultats.length < 6) g.resultats.push({ titre: r.titre, detail: r.detail, lien: r.lien });
    }
    return { groupes };
  }

  // --- Message « démonstration » et bandeau ---------------------------------------------------------------
  function prevenir(texte) {
    let f = document.getElementById("demo-fenetre");
    if (!f) {
      f = document.createElement("dialog");
      f.id = "demo-fenetre";
      f.innerHTML = `<div class="demo-boite">
        <h2>Version de démonstration</h2>
        <p data-texte></p>
        <p>Vous pouvez parcourir tous les écrans. Pour créer vos devis et vos factures avec vos propres données,
          installez GestionPro sur votre ordinateur.</p>
        <div class="demo-boutons">
          <button type="button" class="demo-secondaire" data-fermer>Continuer la visite</button>
          <a class="demo-principal" href="${TELECHARGER}" target="_top">Télécharger GestionPro</a>
        </div></div>`;
      f.querySelector("[data-fermer]").onclick = () => f.close();
      f.addEventListener("click", (e) => { if (e.target === f) f.close(); });
      document.body.appendChild(f);
    }
    f.querySelector("[data-texte]").textContent = texte
      || "Dans la démonstration, rien n'est enregistré ni envoyé : les modifications sont désactivées.";
    if (!f.open) f.showModal();
  }
  window.prevenirDemo = prevenir;

  const style = document.createElement("style");
  style.textContent = `
    #demo-bandeau { position: fixed; z-index: 2147483000; left: 50%; bottom: 14px; transform: translateX(-50%);
      display: flex; align-items: center; gap: 14px; padding: 9px 10px 9px 18px; border-radius: 999px;
      background: #14324f; color: #fff; font: 500 14px/1.3 system-ui, "Segoe UI", sans-serif;
      box-shadow: 0 6px 24px rgba(0,0,0,.25); max-width: calc(100vw - 32px); }
    #demo-bandeau a { color: #14324f; background: #fff; border-radius: 999px; padding: 7px 14px; font-weight: 600;
      text-decoration: none; white-space: nowrap; }
    #demo-bandeau a:hover { background: #e8f0f8; }
    #demo-bandeau .demo-pastille { background: #f2b33d; color: #14324f; border-radius: 999px; padding: 2px 9px;
      font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
    body.app .contenu { padding-bottom: 90px; }   /* le bas des pages reste visible au-dessus du bandeau */
    @media (max-width: 640px) { #demo-bandeau .demo-texte { display: none; }
      #demo-bandeau { left: auto; right: 10px; bottom: 10px; transform: none; gap: 8px; padding: 5px 5px 5px 10px; font-size: 13px; }
      #demo-bandeau a { padding: 6px 11px; } }
    #demo-fenetre { border: 0; border-radius: 14px; padding: 0; max-width: min(480px, calc(100vw - 32px));
      box-shadow: 0 20px 60px rgba(0,0,0,.3); }
    #demo-fenetre::backdrop { background: rgba(10, 25, 40, .45); }
    .demo-boite { padding: 24px 26px 22px; font: 15px/1.5 system-ui, "Segoe UI", sans-serif; color: #1d2733; }
    .demo-boite h2 { margin: 0 0 10px; font-size: 19px; color: #14324f; }
    .demo-boite p { margin: 0 0 10px; }
    .demo-boutons { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; margin-top: 16px; }
    .demo-boutons a, .demo-boutons button { border-radius: 8px; padding: 9px 16px; font: 600 14px system-ui, sans-serif;
      cursor: pointer; text-decoration: none; }
    .demo-principal { background: #1f4e79; color: #fff; border: 0; }
    .demo-secondaire { background: #fff; color: #1f4e79; border: 1px solid #b9c7d6; }`;
  document.documentElement.appendChild(style);

  document.addEventListener("DOMContentLoaded", () => {
    const b = document.createElement("div");
    b.id = "demo-bandeau";
    b.innerHTML = `<span class="demo-pastille">Démo</span>
      <span class="demo-texte">Démonstration en lecture seule : naviguez librement, rien n'est enregistré.</span>
      <a href="${TELECHARGER}" target="_top">Télécharger GestionPro</a>`;
    document.body.appendChild(b);
  });
})();
