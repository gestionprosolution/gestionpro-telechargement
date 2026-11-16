// Ordinateur qui affiche la page : Mac ou Windows (textes d'aide)
const SUR_MAC = /Mac/i.test(navigator.platform || navigator.userAgent);
const QUITTER_PRINCIPAL = SUR_MAC
  ? "quittez GestionPro, puis rouvrez-le en maintenant la touche Option (⌥) enfoncée"
  : "menu Démarrer de Windows > « GestionPro – réglages réseau »";

// Fonctions partagées par toutes les pages.

// --- Taille de l'interface adaptée à l'écran ---------------------------------------
// L'interface est conçue pour une fenêtre d'environ 1920 px de large (écran 1080p).
// Au-delà (écrans 2K, 4K), tout est agrandi proportionnellement : textes, boutons,
// calendrier… jusqu'à ×2,25. En dessous, rien n'est réduit (la mise en page s'adapte).
const LARGEUR_DE_REFERENCE = 1920;

function ajusterEchelle() {
  const echelle = Math.min(2.25, Math.max(1, window.innerWidth / LARGEUR_DE_REFERENCE));
  const zoom = echelle > 1.01 ? echelle.toFixed(3) : "";
  document.documentElement.style.zoom = zoom;
  // Les hauteurs « plein écran » (100vh) ne tiennent pas compte du zoom : la feuille de
  // style les divise par --echelle pour qu'elles restent exactement à la taille de l'écran
  document.documentElement.style.setProperty("--echelle", zoom || "1");
}
ajusterEchelle();
window.addEventListener("resize", ajusterEchelle);

const $ = (sel, racine = document) => racine.querySelector(sel);
const $$ = (sel, racine = document) => [...racine.querySelectorAll(sel)];

// (espace fine insécable remplacée : mal rendue en grands caractères par certaines polices)
const euros = (x) => (x || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" }).replace(/\u202f/g, "\u00a0");

function dateFr(iso) {
  if (!iso) return "";
  const [a, m, j] = iso.split("-");
  return `${j}/${m}/${a}`;
}

// Date locale au format AAAA-MM-JJ (toISOString donnerait la date UTC)
function dateIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const aujourdhui = () => dateIso(new Date());

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;

function echapper(texte) {
  const div = document.createElement("div");
  div.textContent = texte ?? "";
  return div.innerHTML;
}

let session = { mode: "local" };
let entreprise = {};

async function api(url, options = {}) {
  let reponse;
  try {
    reponse = await fetch(url, options);
  } catch (err) {
    if (location.protocol === "http:" && !(await serveurRepond())) afficherServeurArrete();
    throw err;
  }
  if (reponse.status === 401 && !url.startsWith("/api/auth/") && !url.startsWith("/api/acces/")) {
    // Logiciel installé verrouillé par mot de passe, ou session expirée (version en ligne)
    location.href = session.mode === "local" ? pageDeverrouillage() : "connexion.html";
    throw new Error("Session expirée");
  }
  if (reponse.status === 402) {
    // essai terminé : licence (logiciel installé) ou abonnement (version en ligne)
    location.href = session.mode === "web" ? "abonnement.html" : "licence.html";
    throw new Error("Licence requise");
  }
  if (!reponse.ok) {
    let message = `Erreur ${reponse.status}`;
    try { message = (await reponse.json()).detail || message; } catch {}
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }
  return reponse;
}

const apiJson = async (url, options) => (await api(url, options)).json();

const envoyerJson = (url, methode, donnees) => apiJson(url, {
  method: methode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(donnees),
});

function appliquerCouleur() {
  document.documentElement.style.setProperty("--couleur", entreprise.couleur || "#1f4e79");
}

const arreter = () => new Promise(() => {});  // la page s'arrête là (redirection en cours)

// À appeler au chargement de chaque page de l'application :
// vérifie la session / la licence, charge l'entreprise et construit le menu.
const pageDeverrouillage = () =>
  `deverrouiller.html?retour=${encodeURIComponent(location.pathname.split("/").pop() + location.search)}`;

// Profils (logiciel installé) : espaces ouverts au profil connecté. Sans profil, tout est ouvert.
const peut = (espace) => !session?.utilisateur || session.utilisateur.admin || session.utilisateur.droits.includes(espace);
const estAdmin = () => !session?.utilisateur || session.utilisateur.admin;
// Espace demandé par chaque page (factures.html : Clients ou Fournisseurs, vérifié par la page)
const ESPACE_PAGE = { "devis.html": "devis", "plateforme.html": "factures_clients", "reception.html": "reception", "stock.html": "stock",
                      "agenda.html": "agenda", "contacts.html": "contacts", "tableau.html": "tableau",
                      "banque.html": "banque" };

// Résolue quand la page a vérifié la session (pour les scripts qui démarrent en parallèle)
let sessionChargee;
const sessionPrete = new Promise((ok) => (sessionChargee = ok));

async function initialiserPage() {
  session = await apiJson("/api/auth/moi");
  if (session.mode === "local" && session.verrouille) { location.href = pageDeverrouillage(); return arreter(); }
  if (session.mode === "web" && !session.connecte) { location.href = "connexion.html"; return arreter(); }
  if (session.mode === "local" && !session.licence.acces) { location.href = "licence.html"; return arreter(); }
  if (session.mode === "web" && !session.abonnement.acces) { location.href = "abonnement.html"; return arreter(); }

  entreprise = await apiJson("/api/entreprise");
  if (session.mode === "local" && !entreprise.nom) { location.href = "bienvenue.html"; return arreter(); }

  // Page d'un espace fermé à ce profil : retour à l'accueil
  const page = location.pathname.split("/").pop() || "index.html";
  const espace = ESPACE_PAGE[page];
  if ((espace && !peut(espace)) || (page === "factures.html" && !peut("clients") && !peut("fournisseurs"))) {
    location.href = "index.html";
    return arreter();
  }

  appliquerCouleur();
  construireMenu();
  sessionChargee();
  // Mises à jour : proposées à l'administrateur, sur le poste qui fait tourner GestionPro
  if (session.mode === "local" && estAdmin() && !session.distant) {
    verifierMiseAJour();   // sans attendre
    setInterval(verifierMiseAJour, 30 * 60 * 1000);   // fenêtre restée ouverte : une nouvelle version est proposée aussi
    if (session.qonto_reconnecter) proposerReconnexionQonto();
    signalerAttestation();   // sans attendre
    const jours = session.licence?.jours_restants;
    if (jours !== null && jours !== undefined && jours <= 10) {   // abonnement : licence suivante déjà payée ?
      envoyerJson("/api/licence/recuperer", "POST", {}).then((r) => r.activee && location.reload()).catch(() => {});
    }
  }
  // Qonto en panne (ou fonction pas encore autorisée) : prévenir, avec quoi faire à la main ; puis « rétabli »
  if (session.mode === "local" && session.qonto_alertes && !$("#fenetre-reconnexion-qonto")?.open
      && (estAdmin() || peut("clients") || peut("fournisseurs"))) {
    afficherAlertesQonto(session.qonto_alertes);
  }
  return entreprise;
}

// --- Attestation de conformité de l'éditeur (encaissements) : arrivée, à consulter --------------------
async function signalerAttestation() {
  const a = await apiJson("/api/encaissements/attestation").catch(() => null);
  if (!a?.a_consulter || $("dialog[open]")) return;
  const f = document.createElement("dialog");
  f.style.width = "min(560px, 95vw)";
  f.innerHTML = `<form class="fenetre" method="dialog">
    <div class="fenetre-entete"><h2>Votre attestation de conformité est disponible</h2></div>
    <div class="fenetre-corps" style="grid-template-columns: 1fr"><div>
      <p>GestionPro vous fournit l'<strong>attestation de l'éditeur</strong>, à votre nom, qui montre que le logiciel
        respecte les règles sur les encaissements (article 286 du Code général des impôts).</p>
      <p style="margin-top: 10px">Consultez-la, <strong>complétez et signez le volet 2</strong>, puis gardez-la : elle est
        à présenter en cas de contrôle. Elle reste disponible dans Données et sécurité &gt; Encaissements.</p>
    </div></div>
    <div class="fenetre-pied"><button type="button" class="lien discret" data-plus-tard>Plus tard</button>
      <span class="espace"></span>
      <a class="bouton" href="/api/encaissements/attestation.pdf" target="_blank" data-ouvrir>Consulter l'attestation</a></div>
  </form>`;
  document.body.append(f);
  $("[data-plus-tard]", f).onclick = () => f.close();
  $("[data-ouvrir]", f).addEventListener("click", () => setTimeout(() => f.close(), 300));
  f.showModal();
}

// --- Qonto : fonctions momentanément indisponibles, puis rétablies (backend/plateforme/qonto.py, alertes) ---
function dateHeureQonto(secondes) {
  const d = new Date(secondes * 1000);
  return `${d.toLocaleDateString("fr-FR")} à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

function fenetreAlerteQonto(id, contenu) {
  let f = $(`#${id}`);
  if (!f) {
    f = document.createElement("dialog");
    f.id = id;
    f.style.width = "min(600px, 95vw)";
    document.body.append(f);
  }
  f.innerHTML = `<form class="fenetre" method="dialog" novalidate>${contenu}</form>`;
  return f;
}

function afficherAlertesQonto(a) {
  const lire = (cle) => { try { return localStorage.getItem(cle) || sessionStorage.getItem(cle); } catch { return null; } };
  const noter = (stockage, cle, valeur) => { try { stockage.setItem(cle, valeur); } catch {} };
  if (a.indisponibles?.length) {
    // Une fois par ouverture de GestionPro, et de nouveau si une autre panne apparaît
    const signature = a.indisponibles.map((i) => `${i.cle}:${Math.round(i.depuis)}`).join("|");
    if (lire("qonto-alertes-vues") === signature) return;
    const reconnecter = a.indisponibles.some((i) => i.reconnecter) && estAdmin() && !session.distant;
    const generale = a.indisponibles.some((i) => !i.scope);   // Qonto injoignable ou connexion perdue
    const f = fenetreAlerteQonto("fenetre-alertes-qonto", `
      <div class="fenetre-entete"><h2>Qonto : une partie des échanges est interrompue</h2></div>
      <div class="fenetre-corps" style="grid-template-columns: 1fr">
        <div>
          <p class="encart alerte">Le problème ne vient pas de GestionPro. GestionPro réessaie tout seul et vous
            préviendra quand ce sera rétabli.</p>
          <div style="margin-top: 12px; display: grid; gap: 6px">
            <p><strong>Vos données sont bien enregistrées :</strong> vous pouvez continuer à travailler dans GestionPro
              normalement, rien n'est perdu.</p>
            <p><strong>Au retour, GestionPro envoie tout seul à Qonto</strong> ce que vous avez fait entre-temps :
              les paiements indiqués et les refus de factures reçues. Vous n'avez rien à refaire.</p>
            ${generale ? `<p><strong>Seule exception :</strong> les factures clients et les avoirs ne partent pas tout
              seuls. Une fois rétabli, envoyez ceux qui attendent depuis Ventes &gt; Facture électronique, rubrique
              « À envoyer » (sauf ceux que vous auriez déjà envoyés depuis Qonto).</p>` : ""}
          </div>
          ${a.indisponibles.map((i) => `
            <h3 style="margin-top: 16px; text-transform: none; letter-spacing: 0; font-size: 14px; color: var(--texte)">
              Pour l'instant, GestionPro ne peut pas ${echapper(i.fonction)}${i.cause ? ` : ${echapper(i.cause)}` : ""}</h3>
            ${i.depuis ? `<p class="aide">Depuis le ${dateHeureQonto(i.depuis)}</p>` : ""}
            <ul style="margin: 6px 0 0; padding-left: 20px; display: grid; gap: 6px">
              ${i.consignes.map((c) => `<li>${echapper(c)}</li>`).join("")}</ul>`).join("")}
          <p class="message" data-ref="message" style="margin-top: 12px"></p>
        </div>
      </div>
      <div class="fenetre-pied"><span class="espace"></span>
        ${reconnecter ? `<button type="button" class="bouton secondaire" data-reconnecter>Reconnecter Qonto</button>` : ""}
        <button type="button" class="bouton" data-compris>J'ai compris</button></div>`);
    $("[data-compris]", f).onclick = () => { noter(sessionStorage, "qonto-alertes-vues", signature); f.close(); };
    const bouton = $("[data-reconnecter]", f);
    if (bouton) {
      bouton.onclick = async () => {
        const m = $("[data-ref=message]", f);
        bouton.disabled = true;
        try {
          await relierQonto((t) => { m.textContent = t; m.className = "message"; });
          m.textContent = "Qonto est reconnecté.";
          m.className = "message ok";
          setTimeout(() => location.reload(), 1200);
        } catch (err) {
          m.textContent = err.message;
          m.className = "message erreur";
          bouton.disabled = false;
        }
      };
    }
    f.showModal();
    return;
  }
  if (a.retabli && lire("qonto-retabli-vu") !== String(Math.round(a.retabli.le))) {
    const f = fenetreAlerteQonto("fenetre-retabli-qonto", `
      <div class="fenetre-entete"><h2>Qonto : c'est rétabli</h2></div>
      <div class="fenetre-corps" style="grid-template-columns: 1fr">
        <div>
          <p class="encart ok">Depuis le ${dateHeureQonto(a.retabli.le)}, GestionPro peut de nouveau
            ${a.retabli.fonctions.map(echapper).join(", et ")}.</p>
          <p style="margin-top: 12px">Ce que vous avez fait en attendant dans GestionPro (paiements, refus de
            factures reçues) est envoyé à Qonto tout seul : vous n'avez rien à refaire.</p>
          ${a.retabli.factures_a_envoyer ? `<p class="encart alerte" style="margin-top: 12px">À faire maintenant :
            envoyez les factures clients et les avoirs restés en attente, depuis Ventes &gt; Facture électronique,
            rubrique « À envoyer » (sauf ceux déjà envoyés depuis Qonto entre-temps).</p>` : ""}
          <p class="aide" style="margin-top: 8px">Si vous avez fait certaines opérations directement dans Qonto
            pendant ce temps, elles se retrouvent aussi dans GestionPro.</p>
        </div>
      </div>
      <div class="fenetre-pied"><span class="espace"></span>
        <button type="button" class="bouton" data-compris>Parfait</button></div>`);
    $("[data-compris]", f).onclick = () => { noter(localStorage, "qonto-retabli-vu", String(Math.round(a.retabli.le))); f.close(); };
    f.showModal();
  }
}

// --- Qonto : connexion (page « Autoriser » de Qonto dans le navigateur, puis retour automatique) ---------
async function relierQonto(surMessage = () => {}) {
  const avant = (await apiJson("/api/plateforme/qonto")).relie_a;
  const { url } = await envoyerJson("/api/plateforme/qonto/connexion", "POST", {});
  window.open(url, "_blank");   // page Qonto dans le navigateur habituel
  surMessage("Connectez-vous dans la page Qonto qui vient de s'ouvrir, puis cliquez sur « Autoriser ». "
    + "GestionPro se met à jour tout seul.");
  for (let i = 0; i < 120; i++) {   // jusqu'à 10 minutes (durée de validité du code Qonto)
    await new Promise((r) => setTimeout(r, 5000));
    const q = await apiJson("/api/plateforme/qonto").catch(() => null);
    if (q?.relie && q.relie_a !== avant) return q;
  }
  throw new Error("Connexion non terminée : recommencez quand vous voulez.");
}

// Après une mise à jour qui demande de nouvelles autorisations à Qonto (backend/plateforme/qonto.py, SCOPES)
function proposerReconnexionQonto() {
  try { if (sessionStorage.getItem("qonto-reconnexion-plus-tard")) return; } catch {}
  let f = $("#fenetre-reconnexion-qonto");
  if (!f) {
    f = document.createElement("dialog");
    f.id = "fenetre-reconnexion-qonto";
    f.style.width = "min(520px, 95vw)";
    document.body.append(f);
  }
  f.innerHTML = `
    <form class="fenetre" method="dialog" novalidate>
      <div class="fenetre-entete"><h2>Reconnectez votre compte Qonto</h2></div>
      <div class="fenetre-corps" style="grid-template-columns: 1fr">
        <div>
          <p>La mise à jour de GestionPro ajoute de nouvelles fonctions avec Qonto. Pour les activer, Qonto doit
            vous redemander votre accord : un clic ici, puis <strong>« Autoriser »</strong> dans la page Qonto.</p>
          <p class="aide" style="margin-top: 8px">Vos factures et vos réglages ne changent pas. Tant que ce n'est pas
            fait, certaines actions avec Qonto ne fonctionnent pas.</p>
          <p class="message" data-ref="message" style="margin-top: 10px"></p>
        </div>
      </div>
      <div class="fenetre-pied">
        <button type="button" class="lien discret" data-plus-tard>Plus tard</button>
        <span class="espace"></span>
        <button type="button" class="bouton" data-reconnecter>Reconnecter Qonto</button>
      </div>
    </form>`;
  const message = (texte, type = "") => {
    const m = $("[data-ref=message]", f);
    m.textContent = texte;
    m.className = `message ${type}`;
  };
  $("[data-plus-tard]", f).onclick = () => {
    try { sessionStorage.setItem("qonto-reconnexion-plus-tard", "1"); } catch {}
    f.close();
  };
  $("[data-reconnecter]", f).onclick = async (e) => {
    e.target.disabled = true;
    try {
      const q = await relierQonto(message);
      if (q.a_reconnecter) throw new Error("Qonto n'a pas accordé toutes les autorisations : réessayez.");
      message("Compte Qonto reconnecté.", "ok");
      $("[data-plus-tard]", f).textContent = "Fermer";
      e.target.hidden = true;
    } catch (err) {
      message(err.message, "erreur");
      e.target.disabled = false;
    }
  };
  f.showModal();
}

// --- Menu latéral ------------------------------------------------------------------

// « Clients » et « Fournisseurs » sont des espaces : plusieurs pages, avec des sous-onglets (Clients :
// devis, factures, avoirs, relances ; Fournisseurs : factures, notes de frais, frais, bons de commande)
// Menu rangé par sections, une icône par entrée (traits SVG, couleur du texte)
const ICONES = {
  accueil: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  pilotage: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  clients: '<path d="M7 17L17 7M8 7h9v9"/>',
  fournisseurs: '<path d="M17 7L7 17M16 17H7V8"/>',
  devis: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  relances: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  notes: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>',
  avoirs: '<path d="M9 14l-5-5 5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  plateforme: '<path d="M4 4h16v12H4z"/><path d="M8 20h8M12 16v4M8 9l3 3 5-5"/>',
  banque: '<rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M2.5 10h19M6.5 14.5h4"/>',
  frais: '<path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
  commandes: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>',
  reception: '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 2h6l1-2h5"/>',
  stock: '<path d="M12 3l9 5v8l-9 5-9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  agenda: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  contacts: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.6.9 2.6 2.6 3 5.2"/>',
  parametres: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M2.5 12h3M18.5 12h3M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1"/>',
};
const icone = (nom) => `<svg class="icone-menu" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nom] || ""}</svg>`;

// « vue » : sous-onglet de la page Factures (sens-sous) que l'entrée ouvre, pour la marquer active
const OUTILS = [
  { page: "index.html", nom: "Accueil", icone: "accueil" },
  { page: "tableau.html", nom: "Pilotage", droit: "tableau", icone: "pilotage" },
  { section: "Ventes" },
  { page: "devis.html", nom: "Devis", droit: "devis", icone: "devis", vue: "devis" },
  { page: "factures.html?espace=clients&onglet=factures", nom: "Factures clients", droit: "factures_clients", icone: "clients",
    vue: "client-factures" },
  { page: "factures.html?espace=clients&onglet=avoirs", nom: "Avoirs", droit: "factures_clients", icone: "avoirs",
    vue: "client-avoirs" },
  { page: "factures.html?espace=clients&onglet=relances", nom: "Relances", droit: "relances", icone: "relances",
    vue: "client-relances" },
  { page: "plateforme.html", nom: "Facture électronique", droit: "factures_clients", icone: "plateforme", vue: "plateforme",
    pastille: "/api/plateforme/a-traiter", rouge: true },
  { section: "Achats" },
  { page: "reception.html", nom: "Boîte de réception", droit: "reception", pastille: "/api/reception/nouveaux", icone: "reception" },
  { page: "factures.html?espace=fournisseurs&onglet=factures", nom: "Factures fournisseurs", droit: "factures_fournisseurs",
    icone: "fournisseurs", vue: "fournisseur-factures" },
  { page: "factures.html?espace=fournisseurs&onglet=notes", nom: "Notes de frais", droit: "notes_frais", icone: "notes",
    vue: "fournisseur-notes" },
  { page: "factures.html?espace=fournisseurs&onglet=frais", nom: "Assurances et frais bancaires", droit: "frais", icone: "frais",
    vue: "fournisseur-frais" },
  { page: "factures.html?espace=fournisseurs&onglet=commandes", nom: "Bons de commande", droit: "commandes", icone: "commandes",
    vue: "fournisseur-commandes" },
  { section: "Gestion" },
  { page: "stock.html", nom: "Stock", droit: "stock", icone: "stock" },
  { page: "agenda.html", nom: "Agenda", droit: "agenda", icone: "agenda" },
  { page: "contacts.html", nom: "Contacts", droit: "contacts", icone: "contacts" },
  // Banque (lettrage) : prête mais masquée, à réactiver plus tard
];

// Entrées visibles pour ce profil ; une section sans entrée n'est pas affichée
function entreesMenu() {
  const visibles = OUTILS.filter((o) => o.section || !o.droit || peut(o.droit));
  return visibles.filter((o, i) => !o.section || (visibles[i + 1] && !visibles[i + 1].section));
}

// Entrée du menu à marquer pour la page affichée (chaque sous-onglet de la page Factures a la sienne)
function vueMenu(sens, sous) {
  return `${sens}-${sous}`;
}

function vueCourante() {
  const page = location.pathname.split("/").pop() || "index.html";
  if (page === "devis.html") return "devis";
  if (page === "plateforme.html") return "plateforme";
  if (page === "factures.html") {
    return vueMenu(parametre("espace") === "fournisseurs" ? "fournisseur" : "client", parametre("onglet") || "factures");
  }
  return "";
}

// La page Factures change de sous-onglet sans se recharger : elle met le menu à jour
function marquerVue(sens, sous) {
  const vue = vueMenu(sens, sous);
  $$(".menu a.lien-menu[data-vue]").forEach((a) => a.classList.toggle("actif", a.dataset.vue === vue));
}

// Sections du menu. Sur un écran peu haut, Ventes et Achats se replient en une ligne chacune : leurs entrées
// s'affichent au survol (ou au clic), à côté du menu. Gestion reste dépliée.
const SECTIONS_REPLIABLES = { Ventes: "clients", Achats: "fournisseurs" };

function groupesMenu(entrees, lien) {
  let html = "";
  let ouvert = false;
  for (const o of entrees) {
    if (o.section) {
      if (ouvert) html += "</div></div>";
      const icon = SECTIONS_REPLIABLES[o.section];
      html += `<div class="menu-groupe" ${icon ? "data-repliable" : ""}>${lien(o)}`
        + (icon ? `<button type="button" class="menu-section">${icone(icon)}<span>${o.section}</span>
            <span class="pastille-menu rouge pastille-section" hidden></span><span class="chevron">›</span></button>` : "")
        + `<div class="menu-sous">`;
      ouvert = true;
    } else {
      html += lien(o);
    }
  }
  return html + (ouvert ? "</div></div>" : "");
}

function brancherGroupesMenu(menu) {
  for (const groupe of $$(".menu-groupe[data-repliable]", menu)) {
    const sous = $(".menu-sous", groupe);
    groupe.classList.toggle("actif", !!$(".lien-menu.actif", groupe));
    const placer = () => { sous.style.top = `${Math.max(8, groupe.getBoundingClientRect().top - 6)}px`; };
    groupe.addEventListener("mouseenter", placer);
    $(".menu-section", groupe).addEventListener("click", () => {
      placer();
      const deja = groupe.classList.contains("ouvert");
      $$(".menu-groupe.ouvert", menu).forEach((g) => g.classList.remove("ouvert"));
      groupe.classList.toggle("ouvert", !deja);
    });
  }
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".menu-groupe")) $$(".menu-groupe.ouvert", menu).forEach((g) => g.classList.remove("ouvert"));
  });
}

// Pastille d'une section repliée : total de ses entrées
function majPastillesSections() {
  for (const groupe of $$(".menu-groupe[data-repliable]")) {
    const total = $$(".menu-sous .pastille-menu:not([hidden])", groupe).reduce((s, p) => s + (Number(p.textContent) || 0), 0);
    Object.assign($(".pastille-section", groupe), { hidden: !total, textContent: total || "" });
  }
}

function construireMenu() {
  const page = location.pathname.split("/").pop() || "index.html";
  const actif = (o) => (o.vue ? o.vue === vueCourante() : o.page === page);
  const lien = (o) => o.section ? `<div class="menu-titre">${o.section}</div>`
    : `<a class="lien-menu ${actif(o) ? "actif" : ""}" href="${o.page}"
    ${o.vue ? `data-vue="${o.vue}"` : ""}>${icone(o.icone)}<span>${o.nom}</span>${o.pastille ? `<span class="pastille-menu${o.rouge ? " rouge" : ""}" data-pastille="${o.pastille}" hidden></span>` : ""}</a>`;

  const menu = document.createElement("nav");
  menu.className = "menu";
  menu.innerHTML = `
    <div class="menu-entreprise">
      <img alt="" hidden>
      <div class="initiale">${echapper((entreprise.nom || "?").trim().charAt(0).toUpperCase())}</div>
      <span>${echapper(entreprise.nom || "Mon entreprise")}</span>
    </div>
    <button type="button" class="menu-bouton" aria-expanded="false" title="Afficher le menu">
      <span class="menu-bouton-icone" aria-hidden="true"></span><span>Menu</span></button>
    <div class="menu-recherche">
      <input type="search" id="recherche-globale" placeholder="Rechercher…" autocomplete="off"
        title="Rechercher partout (Ctrl+K)">
    </div>
    <div class="menu-liens">${groupesMenu(entreesMenu(), lien)}</div>
    <div class="menu-bas">
      ${encartLicence()}
      ${lien({ page: "parametres.html", nom: "Paramètres", icone: "parametres" })}
      <button type="button" class="lien discret menu-verrou" id="signaler-probleme">Signaler un problème</button>
      <a class="lien discret menu-verrou ${page === "securite.html" ? "actif" : ""}" href="securite.html">Données et sécurité</a>
      ${session.utilisateur ? `<div class="menu-profil" title="Profil connecté">${echapper(session.utilisateur.nom)}
          ${session.utilisateur.admin ? `<span class="secondaire">administrateur</span>` : ""}</div>
        <button type="button" class="lien discret menu-verrou" id="verrouiller">Se déconnecter</button>` : ""}
      ${session.mode === "web" ? `<div class="menu-compte">${echapper(session.email)}<br>
        <button type="button" class="lien discret" id="deconnexion">Se déconnecter</button></div>` : ""}
    </div>`;
  document.body.prepend(menu);
  brancherGroupesMenu(menu);
  // Petit écran (téléphone) : menu replié derrière le bouton « Menu »
  const bouton = $(".menu-bouton", menu);
  bouton.addEventListener("click", () => {
    const deplie = menu.classList.toggle("deplie");
    bouton.setAttribute("aria-expanded", String(deplie));
    bouton.lastElementChild.textContent = deplie ? "Fermer" : "Menu";
  });

  // Logo de l'entreprise s'il existe, sinon son initiale
  const logo = $(".menu-entreprise img");
  logo.onload = () => { logo.hidden = false; $(".menu-entreprise .initiale").remove(); };
  logo.src = `/api/entreprise/logo?t=${Date.now()}`;

  brancherRecherche();

  // Pastilles du menu (factures reçues à traiter…)
  for (const p of $$("[data-pastille]", menu)) {
    fetch(p.dataset.pastille).then((r) => (r.ok ? r.json() : null)).then((r) => {
      if (r?.nouveaux) Object.assign(p, { hidden: false, textContent: r.nouveaux });
      majPastillesSections();
    }).catch(() => {});
  }

  $("#signaler-probleme").addEventListener("click", ouvrirSignalement);

  $("#verrouiller")?.addEventListener("click", async () => {
    await api("/api/acces/deconnexion", { method: "POST" });
    location.href = "deverrouiller.html";
  });

  $("#deconnexion")?.addEventListener("click", async () => {
    await api("/api/auth/deconnexion", { method: "POST" });
    location.href = "connexion.html";
  });
}

// --- Recherche globale (menu latéral, Ctrl+K) ---------------------------------------------

function brancherRecherche() {
  const champ = $("#recherche-globale");
  const panneau = document.createElement("div");
  panneau.className = "recherche-resultats";
  panneau.hidden = true;
  document.body.append(panneau);
  let minuterie, liens = [], actif = -1;

  const fermer = () => { panneau.hidden = true; actif = -1; };
  const surligner = (i) => {
    actif = i;
    liens.forEach((l, j) => l.classList.toggle("actif", j === i));
    liens[i]?.scrollIntoView({ block: "nearest" });
  };

  async function chercher() {
    const q = champ.value.trim();
    if (q.length < 2) return fermer();
    const { groupes } = await apiJson(`/api/recherche?q=${encodeURIComponent(q)}`);
    if (champ.value.trim() !== q) return;  // une autre saisie est déjà partie
    panneau.innerHTML = groupes.length ? groupes.map((g) => `
      <div class="recherche-groupe">${echapper(g.titre)}${g.total > g.resultats.length ? ` <span>(${g.resultats.length} sur ${g.total})</span>` : ""}</div>
      ${g.resultats.map((r) => `<a href="${r.lien}"><strong>${echapper(r.titre)}</strong>
        <span>${echapper(r.detail)}</span></a>`).join("")}`).join("")
      : `<p class="aide">Aucun résultat pour « ${echapper(q)} ».</p>`;
    liens = $$("a", panneau);
    panneau.hidden = false;
    surligner(liens.length ? 0 : -1);
  }

  champ.addEventListener("input", () => { clearTimeout(minuterie); minuterie = setTimeout(chercher, 180); });
  champ.addEventListener("focus", () => { if (champ.value.trim().length >= 2) chercher(); });
  champ.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && liens.length) { e.preventDefault(); surligner((actif + 1) % liens.length); }
    else if (e.key === "ArrowUp" && liens.length) { e.preventDefault(); surligner((actif - 1 + liens.length) % liens.length); }
    else if (e.key === "Enter" && liens[actif]) { e.preventDefault(); location.href = liens[actif].href; }
    else if (e.key === "Escape") { fermer(); champ.blur(); }
  });
  document.addEventListener("mousedown", (e) => {
    if (!panneau.contains(e.target) && e.target !== champ) fermer();
  });
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); champ.focus(); champ.select(); }
  });
}

// Paramètre de l'adresse de la page (liens de la recherche : ?devis=…, ?facture=…)
const parametre = (nom) => new URLSearchParams(location.search).get(nom);

// Met en évidence une ligne de tableau ouverte depuis la recherche
function surlignerLigne(tr) {
  if (!tr) return;
  tr.classList.add("ligne-surlignee");
  tr.scrollIntoView({ block: "center" });
  setTimeout(() => tr.classList.remove("ligne-surlignee"), 4000);
}

// --- Envoi d'un devis ou d'une facture par e-mail --------------------------------------
// Le message s'ouvre prêt dans la messagerie choisie ; le PDF se télécharge à côté pour être
// joint à la main (ni mailto ni Gmail ne permettent d'ajouter une pièce jointe depuis un lien).

// Messageries proposées : un lien mailto: seul n'ouvre souvent rien (ou le navigateur sans Gmail),
// on ouvre donc directement la page « Nouveau message » du service choisi (Paramètres > Envoi des e-mails).
const MESSAGERIES = {
  gmail: { nom: "Gmail", bouton: "Ouvrir dans Gmail" },
  outlook: { nom: "Outlook.com / Hotmail", bouton: "Ouvrir dans Outlook" },
  office365: { nom: "Outlook pro (Microsoft 365)", bouton: "Ouvrir dans Outlook" },
  app: { nom: "Logiciel installé", bouton: "Ouvrir la messagerie" },
};

// Ouvre le message prêt dans la messagerie `service`.
async function ouvrirMessagerie(service, email, objet, texte) {
  if (service === "app") {
    const encoder = (s) => encodeURIComponent(s.replace(/\r?\n/g, "\r\n"));
    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encoder(objet)}&body=${encoder(texte)}`;
    return;
  }
  // Logiciel installé : le serveur ouvre la page dans le navigateur habituel, où l'on est connecté
  // à sa messagerie (la fenêtre de GestionPro a son propre profil). En ligne : nouvel onglet.
  const r = await envoyerJson("/api/envoi/ouvrir", "POST", { service, email, objet, texte });
  if (!r.ouvert) window.open(r.url, "_blank", "noopener");
}

// Mémorise la messagerie choisie pour les prochains envois.
async function retenirMessagerie(service) {
  if (service !== entreprise?.messagerie) {
    entreprise = await envoyerJson("/api/entreprise", "PUT", { ...entreprise, messagerie: service });
  }
}

// Messagerie réglée, ou demandée une fois à l'utilisateur (petite fenêtre). Renvoie "" si annulé.
function choisirMessagerie() {
  if (MESSAGERIES[entreprise?.messagerie]) return Promise.resolve(entreprise.messagerie);
  return new Promise((resoudre) => {
    let f = $("#fenetre-choix-messagerie");
    if (!f) {
      f = document.createElement("dialog");
      f.id = "fenetre-choix-messagerie";
      f.className = "petite";
      f.innerHTML = `<div class="fenetre">
        <div class="fenetre-entete"><h2>Quelle messagerie utilisez-vous ?</h2>
          <button type="button" class="fermer" data-annuler title="Fermer">×</button></div>
        <div class="fenetre-corps" style="grid-template-columns: 1fr"><div>
          <p class="aide">Le message s'y ouvrira, prêt à envoyer. Votre choix est retenu pour la suite
            (modifiable dans Paramètres).</p>
          <div class="actions" style="margin-top: 12px">${Object.entries(MESSAGERIES).map(([cle, s]) =>
            `<button type="button" class="bouton secondaire petit" data-service="${cle}">${s.nom}</button>`).join("")}</div>
        </div></div></div>`;
      document.body.append(f);
    }
    const fin = (valeur) => { f.close(); resoudre(valeur); };
    $("[data-annuler]", f).onclick = () => fin("");
    f.oncancel = () => resoudre("");
    $$("[data-service]", f).forEach((b) => (b.onclick = async () => {
      try { await retenirMessagerie(b.dataset.service); } catch {}
      fin(b.dataset.service);
    }));
    f.showModal();
  });
}

// `modele` : adresse de l'API qui propose le message, ou le message lui-même ({ objet, texte, email, pdf? }).
// `marquer` : adresse à appeler (POST) une fois la messagerie ouverte, ou fonction.
async function ouvrirEnvoi({ titre, modele, marquer, apresEnvoi = () => {} }) {
  let fenetre = $("#fenetre-envoi");
  if (!fenetre) {
    fenetre = document.createElement("dialog");
    fenetre.id = "fenetre-envoi";
    fenetre.style.width = "min(640px, 95vw)";
    fenetre.innerHTML = `
      <form class="fenetre" novalidate>
        <div class="fenetre-entete"><h2 data-ref="titre"></h2>
          <button type="button" class="fermer" data-ref="fermer" title="Fermer">×</button></div>
        <div class="fenetre-corps" style="grid-template-columns: 1fr">
          <div>
            <ol class="etapes" data-ref="etapes">
              <li><strong>Téléchargez le PDF</strong> (bouton en bas).</li>
              <li><strong>Ouvrez votre messagerie</strong> : le message est prêt, il reste à y joindre le PDF
                téléchargé (dossier Téléchargements) puis à l'envoyer.</li>
            </ol>
            <p class="aide" data-ref="deja" style="margin: 8px 0 0"></p>
            <div class="champs" style="margin-top: 14px">
              <label class="champ c6"><span>Destinataire</span><input name="email" type="email" placeholder="adresse@exemple.fr"></label>
              <label class="champ c6"><span>Objet</span><input name="objet"></label>
              <label class="champ c6"><span>Message</span><textarea name="texte" rows="12"></textarea></label>
            </div>
            <div class="choix-messagerie" data-ref="choix" hidden>
              <p><strong>Quelle messagerie utilisez-vous ?</strong><br>
                <span class="aide">Le message s'y ouvrira, prêt à envoyer. Votre choix est retenu pour la suite
                  (modifiable dans Paramètres).</span></p>
              <div class="actions">
                ${Object.entries(MESSAGERIES).map(([cle, s]) =>
                  `<button type="button" class="bouton secondaire petit" data-service="${cle}">${s.nom}</button>`).join("")}
              </div>
            </div>
          </div>
        </div>
        <div class="fenetre-pied">
          <button type="button" class="lien discret" data-ref="changer">Changer de messagerie</button>
          <span class="espace"></span>
          <span class="message erreur" data-ref="erreur"></span>
          <a class="bouton secondaire" data-ref="pdf">Télécharger le PDF</a>
          <button type="button" class="bouton" data-ref="envoyer">Ouvrir la messagerie</button>
        </div>
      </form>`;
    document.body.append(fenetre);
    $("[data-ref=fermer]", fenetre).onclick = () => fenetre.close();
  }
  const ref = (nom) => $(`[data-ref=${nom}]`, fenetre);
  const form = $("form", fenetre);
  let m;
  try {
    m = typeof modele === "string" ? await apiJson(modele) : modele;
  } catch (err) {
    return alert(err.message);
  }
  ref("titre").textContent = titre;
  ref("deja").textContent = m.envoye_le ? `Déjà envoyé le ${dateFr(m.envoye_le)}.` : "";
  ref("erreur").textContent = "";
  // Sans pièce jointe (ex. demande de prix) : pas d'étape « Téléchargez le PDF »
  ref("etapes").hidden = ref("pdf").hidden = !m.pdf;
  if (m.pdf) {
    ref("pdf").href = m.pdf;
    ref("pdf").download = m.nom_pdf;
  }
  form.elements.email.value = m.email;
  form.elements.objet.value = m.objet;
  form.elements.texte.value = m.texte;

  // Messagerie choisie : un bouton direct. Pas encore choisie : on la demande (ces boutons envoient aussitôt).
  const service = MESSAGERIES[entreprise?.messagerie] ? entreprise.messagerie : "";
  ref("choix").hidden = !!service;
  ref("envoyer").hidden = ref("changer").hidden = !service;
  if (service) ref("envoyer").textContent = MESSAGERIES[service].bouton;
  ref("changer").onclick = () => { ref("choix").hidden = false; ref("choix").scrollIntoView({ block: "nearest" }); };

  async function envoyer(choisi) {
    const email = form.elements.email.value.trim();
    if (!email) {
      ref("erreur").textContent = "Indiquez l'adresse e-mail du destinataire.";
      return form.elements.email.focus();
    }
    ref("erreur").textContent = "";
    try {
      await retenirMessagerie(choisi);
      if (typeof marquer === "function") await marquer();
      else if (marquer) await api(marquer, { method: "POST" });
      await ouvrirMessagerie(choisi, email, form.elements.objet.value, form.elements.texte.value);
    } catch (err) {
      ref("erreur").textContent = err.message;
      return;
    }
    fenetre.close();
    apresEnvoi();
  }
  ref("envoyer").onclick = () => envoyer(service);
  $$("[data-service]", fenetre).forEach((b) => (b.onclick = () => envoyer(b.dataset.service)));
  fenetre.showModal();
}

// --- Signaler un problème au vendeur ------------------------------------------------------------

// Les erreurs de l'interface sont notées (sans données) pour le rapport technique
let erreursSignalees = 0;
function noterErreur(message, pile = "") {
  if (erreursSignalees++ > 20) return;  // pas d'avalanche si une erreur se répète
  fetch("/api/support/erreur", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: String(message).slice(0, 1900), page: location.pathname.split("/").pop(),
                           pile: String(pile || "").slice(0, 3900) }) }).catch(() => {});
}
window.addEventListener("error", (e) => noterErreur(e.message, e.error?.stack));
window.addEventListener("unhandledrejection", (e) => {
  const raison = e.reason;
  // Les refus du serveur (message déjà montré à l'utilisateur) ne sont pas des pannes
  if (raison instanceof Error && /^(Erreur 5|Failed to fetch|NetworkError)/.test(raison.message)) noterErreur(raison.message, raison.stack);
  else if (!(raison instanceof Error)) noterErreur(String(raison));
});

async function ouvrirSignalement() {
  let fenetre = $("#fenetre-signalement");
  if (!fenetre) {
    fenetre = document.createElement("dialog");
    fenetre.id = "fenetre-signalement";
    fenetre.className = "petite";
    fenetre.style.width = "min(560px, 95vw)";
    fenetre.innerHTML = `
      <div class="fenetre">
        <div class="fenetre-entete"><h2>Signaler un problème</h2>
          <button type="button" class="fermer" data-ref="fermer" title="Fermer">×</button></div>
        <div class="fenetre-corps"><div>
          <label class="champ"><span>Que s'est-il passé ? <em>(ce que vous faisiez, ce qui était attendu)</em></span>
            <textarea data-ref="description" rows="6"></textarea></label>
          <p class="aide" style="margin-top: 10px">Un rapport technique est joint à votre message : version du logiciel,
            système, nombre de devis et de factures, journal des erreurs. Il ne contient <strong>aucun nom ni montant</strong>
            de vos clients.</p>
          <p class="aide" data-ref="sans-email" hidden style="margin-top: 10px">Téléchargez le rapport et envoyez-le à la
            personne qui vous a fourni le logiciel, avec votre description.</p>
          <p class="aide" style="margin-top: 10px"><strong>Réponse sous 1 jour ouvré</strong> si vous ne pouvez plus
            facturer ou travailler, sous 2 jours ouvrés sinon (du lundi au vendredi, de 9 h à 18 h).</p>
        </div></div>
        <div class="fenetre-pied">
          <span class="espace"></span>
          <a class="bouton secondaire" href="/api/support/rapport.zip" data-ref="telecharger">Télécharger le rapport</a>
          <button type="button" class="bouton" data-ref="envoyer">Envoyer par e-mail</button>
        </div>
      </div>`;
    document.body.append(fenetre);
    $("[data-ref=fermer]", fenetre).onclick = () => fenetre.close();
  }
  const ref = (nom) => $(`[data-ref=${nom}]`, fenetre);
  let rapport = { email: "", resume: "" };
  try { rapport = await apiJson("/api/support/rapport"); } catch {}
  ref("envoyer").hidden = !rapport.email;
  ref("sans-email").hidden = !!rapport.email;
  ref("envoyer").onclick = () => {
    const corps = `${ref("description").value.trim() || "(décrivez le problème ici)"}\r\n\r\n--- Rapport technique ---\r\n`
      + rapport.resume.replace(/\r?\n/g, "\r\n")
      + "\r\n\r\n(Joignez si possible le rapport téléchargé avec le bouton « Télécharger le rapport ».)";
    location.href = `mailto:${encodeURIComponent(rapport.email)}?subject=${encodeURIComponent(`GestionPro ${rapport.version} : problème signalé`)}`
      + `&body=${encodeURIComponent(corps)}`;
    fenetre.close();
  };
  fenetre.showModal();
  ref("description").focus();
}

// --- Photos (devis, fiches contact) ------------------------------------------------

async function ouvrirPhotos({ type, cible, titre, apresChangement = () => {} }) {
  let fenetre = $("#fenetre-photos");
  if (!fenetre) {
    fenetre = document.createElement("dialog");
    fenetre.id = "fenetre-photos";
    fenetre.style.width = "min(980px, 95vw)";
    fenetre.innerHTML = `
      <div class="fenetre">
        <div class="fenetre-entete"><h2 data-ref="titre"></h2>
          <button type="button" class="fermer" data-ref="fermer" title="Fermer">×</button></div>
        <div class="fenetre-corps zone-depot" data-ref="zone" style="grid-template-columns: 1fr">
          <div>
            <div class="actions" style="justify-content: space-between">
              <span class="aide">Glissez des photos ici, ou</span>
              <label class="bouton petit">Ajouter des photos
                <input type="file" data-ref="fichiers" accept="image/*" multiple hidden></label>
            </div>
            <p class="message" data-ref="message" style="margin-top: 8px"></p>
            <div class="galerie" data-ref="galerie"></div>
          </div>
        </div>
      </div>
      <div class="visionneuse" data-ref="visionneuse" hidden><img alt=""><span>Cliquez pour fermer</span></div>`;
    document.body.append(fenetre);
    $("[data-ref=fermer]", fenetre).onclick = () => fenetre.close();
  }
  const ref = (nom) => $(`[data-ref=${nom}]`, fenetre);
  const base = `/api/photos/${type}/${encodeURIComponent(cible)}`;
  ref("titre").textContent = titre;
  ref("message").textContent = "";

  async function afficher() {
    const liste = await apiJson(base);
    ref("galerie").innerHTML = liste.length ? liste.map((p) => `
      <figure data-id="${p.id}">
        <img src="${base}/${p.id}?mini=true" alt="" loading="lazy">
        <figcaption>${dateFr(p.date.slice(0, 10))}
          <button type="button" class="lien discret" data-supprimer title="Supprimer">Supprimer</button></figcaption>
      </figure>`).join("")
      : `<p class="vide">Aucune photo pour l'instant.</p>`;
  }

  async function envoyer(fichiers) {
    const images = [...fichiers].filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    const donnees = new FormData();
    images.forEach((f) => donnees.append("fichiers", f));
    ref("message").className = "message";
    ref("message").textContent = `Envoi de ${pluriel(images.length, "photo")}…`;
    try {
      const r = await apiJson(base, { method: "POST", body: donnees });
      ref("message").className = r.erreurs.length ? "message erreur" : "message ok";
      ref("message").textContent = r.erreurs.length ? r.erreurs.join(" ; ") : `${pluriel(r.ajoutees.length, "photo")} ajoutée${r.ajoutees.length > 1 ? "s" : ""}.`;
    } catch (err) {
      ref("message").className = "message erreur";
      ref("message").textContent = err.message;
    }
    await afficher();
    apresChangement();
  }

  ref("fichiers").onchange = (e) => { envoyer(e.target.files); e.target.value = ""; };
  ref("zone").ondragover = (e) => { e.preventDefault(); ref("zone").classList.add("survol"); };
  ref("zone").ondragleave = () => ref("zone").classList.remove("survol");
  ref("zone").ondrop = (e) => { e.preventDefault(); ref("zone").classList.remove("survol"); envoyer(e.dataTransfer.files); };
  ref("galerie").onclick = async (e) => {
    const figure = e.target.closest("figure");
    if (!figure) return;
    if (e.target.closest("[data-supprimer]")) {
      if (!confirm("Supprimer cette photo ?")) return;
      await api(`${base}/${figure.dataset.id}`, { method: "DELETE" });
      await afficher();
      return apresChangement();
    }
    $("img", ref("visionneuse")).src = `${base}/${figure.dataset.id}`;
    ref("visionneuse").hidden = false;
  };
  ref("visionneuse").onclick = () => (ref("visionneuse").hidden = true);
  await afficher();
  fenetre.showModal();
}

function encartLicence() {
  if (session.mode === "local") {
    const l = session.licence;
    // Abonnement en ligne : renouvelé tout seul à chaque paiement ; alerte seulement s'il n'arrive pas
    if (l.type === "licence" && !l.a_vie && l.jours_restants <= (l.abonnement ? 3 : 30)) {
      return `<div class="menu-licence urgent"><strong>Licence bientôt expirée</strong>
        le ${dateFr(l.fin)}<br><a href="parametres.html#licence">Renouveler</a></div>`;
    }
  }
  if (session.mode === "web" && session.offre.paiement_actif && session.abonnement.en_essai && !session.abonnement.abonne) {
    const j = session.abonnement.jours_restants;
    return `<div class="menu-licence"><strong>Essai gratuit</strong>${pluriel(j, "jour")} restant${j > 1 ? "s" : ""}<br>
      <a href="abonnement.html">S'abonner</a></div>`;
  }
  return "";
}

// --- Logiciel installé : signal de présence ------------------------------------------
// La fenêtre signale régulièrement qu'elle est ouverte, sinon le serveur local
// s'arrête quelques minutes après sa fermeture. Si le serveur ne répond plus (ordinateur
// resté longtemps en veille, poste principal éteint…), on le dit au lieu de laisser une page cassée.
if (location.protocol === "http:") {
  setInterval(verifierServeur, 30000);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && verifierServeur());
  window.addEventListener("focus", verifierServeur);
}

// Fenêtre GestionPro (fenetre.py) : pas d'onglets. « Nouvel onglet » = autre fenêtre GestionPro
// (PDF…) ou navigateur habituel (liens extérieurs), via window.pywebview.api.ouvrir.
// window.open("") suivi de fenetre.location = … (fenêtre ouverte avant d'attendre le serveur) est
// simulé : la fenêtre s'ouvre quand on lui donne son adresse.
const ouvrirFenetreNavigateur = window.open.bind(window);
window.open = function (url = "", ...autres) {
  const api = window.pywebview?.api;
  if (!api) return ouvrirFenetreNavigateur(url, ...autres);
  if (url) {
    api.ouvrir(new URL(url, location.href).href);
    return null;
  }
  return { set location(adresse) { api.ouvrir(new URL(String(adresse), location.href).href); }, close() {} };
};

async function serveurRepond() {
  try {
    return (await fetch("/api/sante", { cache: "no-store" })).ok;
  } catch {
    return false;
  }
}

let majEnCours = false;   // mise à jour lancée : le serveur s'arrête exprès, pas de message « arrêté »

async function verifierServeur() {
  if (majEnCours) return;
  if (!$("#serveur-arrete")?.open && !(await serveurRepond())) afficherServeurArrete();
}

function afficherServeurArrete() {
  const ici = ["127.0.0.1", "localhost"].includes(location.hostname);
  let f = $("#serveur-arrete");
  if (!f) {
    f = document.createElement("dialog");
    f.id = "serveur-arrete";
    f.className = "petite";
    f.innerHTML = `<div class="fenetre">
      <div class="fenetre-entete"><h2>${ici ? "GestionPro s'est arrêté" : "Le poste principal ne répond pas"}</h2></div>
      <div class="fenetre-corps" style="grid-template-columns: 1fr">
        <p>${ici ? "L'ordinateur est sans doute resté longtemps en veille. Vos données sont intactes."
                 : "Vérifiez qu'il est allumé, que GestionPro y est ouvert et que cet ordinateur est sur le réseau du bureau."}</p>
        <p class="aide" data-etat></p>
      </div>
      <div class="fenetre-pied"><span class="espace"></span>
        <button type="button" class="bouton" data-relancer>${ici ? "Redémarrer GestionPro" : "Réessayer"}</button></div>
    </div>`;
    f.addEventListener("cancel", (e) => e.preventDefault());   // pas de fermeture par Échap : la page est inutilisable
    document.body.append(f);
    f.querySelector("[data-relancer]").addEventListener("click", async (e) => {
      const etat = f.querySelector("[data-etat]");
      e.target.disabled = true;
      etat.textContent = ici ? "Redémarrage…" : "Nouvel essai…";
      if (ici) location.href = "gestionpro://relancer";   // lien enregistré par l'installation
      for (let i = 0; i < (ici ? 40 : 4); i++) {
        await new Promise((r) => setTimeout(r, 1500));
        if (await serveurRepond()) return location.reload();
      }
      e.target.disabled = false;
      etat.textContent = ici ? "GestionPro n'a pas redémarré : fermez cette fenêtre et rouvrez GestionPro depuis son icône."
                             : "Toujours pas de réponse.";
    });
    // Revenu tout seul (relancé depuis l'icône, poste principal rallumé) : la page se recharge
    const attente = setInterval(async () => {
      if (await serveurRepond()) {
        clearInterval(attente);
        location.reload();
      }
    }, 5000);
  }
  if (!f.open) f.showModal();
}

// --- Version en ligne : application installable (PWA) -------------------------------
if (location.protocol === "https:" && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
let invitationInstallation = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  invitationInstallation = e;
  $$(".installer-app").forEach((b) => (b.hidden = false));
});
async function installerApplication() {
  if (!invitationInstallation) return;
  invitationInstallation.prompt();
  await invitationInstallation.userChoice;
  invitationInstallation = null;
  $$(".installer-app").forEach((b) => (b.hidden = true));
}

// --- Logiciel installé : mise à jour proposée -------------------------------------------
// Une nouvelle version publiée pour cette variante du logiciel est proposée une fois par ouverture
// (« Plus tard » : pas avant le lendemain). Installation automatique, ou à la main depuis le site.

const octets = (n) => `${(n / 1048576).toFixed(0).replace(".", ",")} Mo`;

// Notes de version (texte simple des publications GitHub) : titres, gras et listes
function notesVersion(texte) {
  const gras = (s) => echapper(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  let html = "", liste = false;
  for (const ligne of texte.split(/\r?\n/)) {
    const puce = ligne.match(/^\s*[-*]\s+(.*)/);
    if (puce && !liste) { html += "<ul>"; liste = true; }
    if (!puce && liste) { html += "</ul>"; liste = false; }
    if (puce) html += `<li>${gras(puce[1])}</li>`;
    else if (/^#+\s/.test(ligne)) html += `<p><strong>${echapper(ligne.replace(/^#+\s*/, ""))}</strong></p>`;
    else if (ligne.trim() && !/^Téléchargez/.test(ligne)) html += `<p>${gras(ligne)}</p>`;
  }
  return html + (liste ? "</ul>" : "");
}

async function verifierMiseAJour({ forcer = false } = {}) {
  let m;
  try {
    m = await apiJson(`/api/mise-a-jour${forcer ? "?forcer=true" : ""}`);
  } catch {
    return null;
  }
  if (!m.disponible || forcer) return m;
  let reporte = "";
  try {
    if (sessionStorage.getItem("maj-proposee") === m.version) return m;
    reporte = localStorage.getItem(`maj-plus-tard-${m.version}`) || "";
    sessionStorage.setItem("maj-proposee", m.version);
  } catch {}
  if (reporte !== aujourdhui()) proposerMiseAJour(m);
  return m;
}

function proposerMiseAJour(m) {
  let f = $("#fenetre-maj");
  if (!f) {
    f = document.createElement("dialog");
    f.id = "fenetre-maj";
    f.style.width = "min(600px, 95vw)";
    document.body.append(f);
  }
  f.innerHTML = `
    <form class="fenetre" method="dialog" novalidate>
      <div class="fenetre-entete"><h2>Nouvelle version disponible : ${echapper(m.version)}</h2>
        <button type="button" class="fermer" data-plus-tard title="Fermer">×</button></div>
      <div class="fenetre-corps" style="grid-template-columns: 1fr">
        <div>
          <p>Vous utilisez la version ${echapper(m.actuelle)}. La mise à jour est gratuite pendant votre licence :
            <strong>vos données sont conservées</strong>.</p>
          <div class="notes-maj">${m.notes.map((n) => (m.notes.length > 1 ? `<p class="aide">Version ${echapper(n.version)}</p>` : "")
            + notesVersion(n.notes)).join("")}</div>
          <div data-ref="avancement" hidden>
            <p data-ref="etat"></p>
            <progress data-ref="barre" max="1" value="0" style="width: 100%"></progress>
          </div>
        </div>
      </div>
      <div class="fenetre-pied">
        <button type="button" class="lien discret" data-plus-tard>Plus tard</button>
        <span class="espace"></span>
        <span class="message erreur" data-ref="erreur"></span>
        <button type="button" class="bouton secondaire" data-site>Télécharger depuis le site</button>
        <button type="button" class="bouton" data-installer>Installer maintenant</button>
      </div>
    </form>`;
  const ref = (n) => $(`[data-ref=${n}]`, f);
  $$("[data-plus-tard]", f).forEach((b) => (b.onclick = () => {
    try { localStorage.setItem(`maj-plus-tard-${m.version}`, aujourdhui()); } catch {}
    f.close();
  }));
  $("[data-site]", f).onclick = async () => {
    try {
      await api("/api/mise-a-jour/site", { method: "POST" });
      ref("erreur").textContent = "";
      $("[data-site]", f).textContent = "Page ouverte dans votre navigateur";
    } catch (err) {
      ref("erreur").textContent = err.message;
    }
  };
  $("[data-installer]", f).onclick = async () => {
    ref("erreur").textContent = "";
    try {
      await api("/api/mise-a-jour/installer", { method: "POST" });
    } catch (err) {
      ref("erreur").textContent = err.message;
      return;
    }
    majEnCours = true;
    $$(".fenetre-pied button", f).forEach((b) => (b.disabled = true));
    ref("avancement").hidden = false;
    suivreInstallation(m, ref);
  };
  f.showModal();
}

async function suivreInstallation(m, ref) {
  ref("etat").textContent = `Téléchargement de la version ${m.version} (${octets(m.taille)})…`;
  for (;;) {
    await new Promise((r) => setTimeout(r, 700));
    let p;
    try {
      p = await (await fetch("/api/mise-a-jour/progression")).json();
    } catch {
      break;   // le serveur s'est arrêté : l'installation a commencé
    }
    if (p.etat === "erreur") {
      majEnCours = false;
      ref("erreur").textContent = p.message;
      $$("#fenetre-maj .fenetre-pied button").forEach((b) => (b.disabled = false));
      ref("avancement").hidden = true;
      return;
    }
    if (p.total) ref("barre").value = p.recu / p.total;
    if (p.etat === "lancement") break;
  }
  ref("barre").removeAttribute("value");   // barre animée : durée inconnue
  ref("etat").innerHTML = `<strong>Installation en cours…</strong> GestionPro se ferme puis se rouvre tout seul
    dans une nouvelle fenêtre, d'ici une minute environ. Vous pourrez fermer celle-ci.`;
  // Nouvelle version démarrée : cette fenêtre-ci n'a plus d'utilité
  for (let i = 0; i < 200; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const s = await (await fetch("/api/sante")).json();
      if (s.version === m.version && !s.arret) {
        ref("etat").innerHTML = `<strong>Mise à jour terminée</strong> : la version ${echapper(m.version)} est ouverte dans
          une nouvelle fenêtre. Vous pouvez fermer celle-ci.`;
        ref("barre").hidden = true;
        window.close();
        return;
      }
    } catch {}
  }
}

// --- Navigation fluide ------------------------------------------------------------------
// Survoler une entrée du menu (ou une tuile de l'accueil) prépare la page en arrière-plan, données
// comprises : au clic, elle s'affiche aussitôt, sans écran vide. Passage en fondu d'une page à l'autre.
(() => {
  if (!window.HTMLScriptElement?.supports?.("speculationrules")) return;
  const regles = document.createElement("script");
  regles.type = "speculationrules";
  regles.textContent = JSON.stringify({ prerender: [{
    where: { and: [{ selector_matches: ".menu a.lien-menu, a.tuile" }, { not: { href_matches: "/api/*" } }] },
    eagerness: "moderate",
  }] });
  document.head.append(regles);
})();
