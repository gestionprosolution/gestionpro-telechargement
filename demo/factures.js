// Factures : clients (factures, avoirs, relances) et fournisseurs (factures, notes de frais,
// assurances et frais bancaires, bons de commande), avec leurs pièces jointes.

const CATEGORIES = {
  fournisseur: ["Matériaux", "Fournitures", "Sous-traitance", "Outillage / équipement",
    "Carburant / déplacements", "Loyer", "Énergie", "Téléphone / internet", "Assurance",
    "Banque", "Comptable / juridique", "Logiciels / abonnements", "Autre"],
  client: ["Prestation", "Vente", "Acompte", "Autre"],
  note_frais: ["Repas", "Train / avion", "Taxi / VTC", "Carburant", "Péage / parking", "Hébergement",
    "Fournitures", "Affranchissement", "Autre"],
  frais: ["Assurance", "Frais bancaires", "Abonnement", "Autre"],
};

// Onglets : Clients et Fournisseurs, chacun avec ses sous-onglets. Une dépense appartient à une
// « famille » : "" facture, "note_frais", "frais" (assurances, banque). Les bons de commande : commandes.js
const FAMILLES = { factures: "", notes: "note_frais", frais: "frais" };
const VUES = {
  "client-factures": { tiers: "Client", date: "Échéance", numero: "N° de facture", mot: "facture",
    segments: ["À encaisser", "Encaissées", "Toutes"], ajouter: "Ajouter une facture",
    vide: "Aucune facture client pour l'instant. Elles se créent depuis un devis accepté (Devis > Facturer), "
      + "ou avec « Ajouter une facture »." },
  "client-avoirs": { tiers: "Client", date: "Date", numero: "N° d'avoir", mot: "avoir",
    segments: ["À rembourser", "Soldés", "Tous"], ajouter: "",
    vide: "Aucun avoir. Un avoir annule une facture émise : ouvrez la facture, puis « Annuler par un avoir »." },
  "client-relances": { tiers: "Client", date: "Échéance", numero: "N° de facture", mot: "facture",
    segments: null, ajouter: "", vide: "Aucune facture en retard : personne à relancer." },
  "fournisseur-factures": { tiers: "Fournisseur", date: "Échéance", numero: "N° de facture", mot: "facture",
    segments: ["À payer", "Payées", "Toutes"], ajouter: "Ajouter une facture",
    vide: "Aucune facture fournisseur pour l'instant. Cliquez sur « Ajouter une facture », ou glissez ici "
      + "un PDF ou une photo de facture." },
  "fournisseur-notes": { tiers: "Personne", date: "Date", numero: "Nature", mot: "dépense",
    segments: ["À rembourser", "Remboursées", "Toutes"], ajouter: "Nouvelle note de frais",
    vide: "Aucune note de frais. Une dépense pour l'entreprise payée de sa poche (repas, train, péage…) ? "
      + "Cliquez sur « Nouvelle note de frais », ou glissez ici la photo du ticket." },
  "fournisseur-frais": { tiers: "Organisme", date: "Date", numero: "Libellé", mot: "échéance",
    segments: ["À payer", "Payées", "Toutes"], ajouter: "Ajouter une dépense",
    vide: "Aucune échéance enregistrée : ajoutez vos prélèvements et contrats ci-dessus." },
};

const NATURES = { facture: "Facture", acompte: "Facture d'acompte", solde: "Facture de solde", avoir: "Avoir" };
const NIVEAUX = { 1: "Rappel", 2: "Deuxième relance", 3: "Mise en demeure" };

let factures = [];
const vue = { sens: "client", sous: "factures" };
const dernierSous = { client: "factures", fournisseur: "factures" };   // sous-onglet retrouvé en changeant de sens
const filtre = { statut: "a_regler", q: "" };
const cleVue = () => `${vue.sens}-${vue.sous}`;
let edition = null;          // { id, fichier: File|null, retirer: bool, articles: [{article_id, quantite}] }
let articlesStock = [];
let fileAttente = [];        // fichiers déposés en attente de saisie

// --- Chargement et résumé ----------------------------------------------------------

async function chargerPlateforme() {
  try {
    const n = (await apiJson("/api/plateforme/a-traiter")).nouveaux;
    $("#nb-plateforme").textContent = n || "";
  } catch {}
}

let suiviPlateformeFait = false;

async function charger() {
  chargerPlateforme();
  factures = await apiJson("/api/factures");
  afficherListe();
  // Factures envoyées par Qonto dont le parcours n'est pas fini : statut relevé une fois par ouverture de page
  if (!suiviPlateformeFait && factures.some((f) => f.plateforme_statut && ![210, 212, 213].includes(f.plateforme_code))) {
    suiviPlateformeFait = true;
    envoyerJson("/api/plateforme/qonto/suivre", "POST", {})
      .then((r) => r.mises_a_jour && charger()).catch(() => {});
  }
  if (vue.sous === "frais") afficherRecurrents();
  const annuaire = (await apiJson("/api/contacts")).map((c) => c.nom);
  $("#liste-tiers").innerHTML = [...new Set([...annuaire, ...factures.map((f) => f.tiers)].filter(Boolean))]
    .sort((a, b) => a.localeCompare(b)).map((t) => `<option value="${echapper(t)}">`).join("");
}

// --- Les deux chiffres en tête de page : propres à l'onglet affiché --------------------------------

const somme = (liste, champ = "montant_ttc") => liste.reduce((s, x) => s + Math.abs(x[champ] || 0), 0);
const ceMois = (iso) => (iso || "").startsWith(aujourdhui().slice(0, 7));

function tuileResume(n, titre, valeur, detail, rouge = false) {
  $(`#r${n}-titre`).textContent = titre;
  $(`#r${n}`).textContent = valeur;
  $(`#r${n}-detail`).textContent = detail;
  $(`#r${n}-detail`).classList.toggle("rouge", rouge);
}

// Ce qui reste à régler : nombre, et la part en retard (ou à 7 jours)
function tuileRestant(n, titre, restant, mot = "facture") {
  const retard = restant.filter((f) => f.statut === "en_retard");
  const proches = restant.filter((f) => f.statut !== "en_retard" && f.jours_restants !== null && f.jours_restants <= 7);
  const detail = !restant.length ? "Rien en attente"
    : retard.length ? `${pluriel(restant.length, mot)} · dont ${euros(somme(retard))} en retard`
    : `${pluriel(restant.length, mot)}${proches.length ? ` · ${euros(somme(proches))} dans les 7 jours` : ""}`;
  tuileResume(n, titre, euros(somme(restant)), detail, retard.length > 0);
}

function tuileRegle(n, titre, liste, mot = "règlement") {
  const regles = liste.filter((f) => f.payee && ceMois(f.date_paiement));
  tuileResume(n, titre, euros(somme(regles)), regles.length ? pluriel(regles.length, mot) : "Rien pour l'instant");
}

const TITRES_RESUME = {
  "client-factures": ["Reste à encaisser", "Encaissé ce mois-ci"],
  "client-avoirs": ["À rembourser aux clients", "Remboursé ce mois-ci"],
  "fournisseur-factures": ["Reste à payer", "Payé ce mois-ci"],
  "fournisseur-notes": ["À rembourser à l'équipe", "Remboursé ce mois-ci"],
  "fournisseur-frais": ["Reste à payer", "Prélevé ou payé ce mois-ci"],
};

function afficherResume() {
  const cle = cleVue();
  if (cle === "fournisseur-commandes") {
    const bons = typeof bonsCommande === "undefined" ? [] : bonsCommande;
    const enCours = bons.filter((b) => ["brouillon", "envoyee"].includes(b.statut));
    const aEnvoyer = enCours.filter((b) => b.statut === "brouillon").length;
    tuileResume(1, "Commandes en cours", euros(somme(enCours, "total_ttc")),
      enCours.length ? `${pluriel(enCours.length, "bon")}${aEnvoyer ? ` · dont ${aEnvoyer} à envoyer` : ""}` : "Aucune commande en cours");
    const recues = bons.filter((b) => b.statut === "recue" && ceMois(b.recue_le));
    tuileResume(2, "Reçues ce mois-ci", euros(somme(recues, "total_ttc")),
      recues.length ? pluriel(recues.length, "commande") : "Rien pour l'instant");
    return;
  }
  if (cle === "client-relances") {
    const enRetard = factures.filter((f) => relancable(f) && f.statut === "en_retard");
    tuileResume(1, "En retard", euros(somme(enRetard)),
      enRetard.length ? `${pluriel(enRetard.length, "facture")} à relancer` : "Personne à relancer", enRetard.length > 0);
    const envoyees = factures.flatMap((f) => (f.type === "client" ? f.relances : [])).filter((r) => ceMois(r.date));
    tuileResume(2, "Relances envoyées ce mois-ci", String(envoyees.length),
      envoyees.length ? "rappels, relances et mises en demeure" : "Aucune pour l'instant");
    return;
  }
  // Factures, avoirs, notes de frais, frais : celles de l'onglet (les refusées ne sont plus à régler)
  const liste = factures.filter((f) => dansVue(f) && f.statut !== "annulee");
  const restant = liste.filter((f) => !f.payee && f.approbation !== "refusee");
  const [titre1, titre2] = TITRES_RESUME[cle];
  const mot = vue.sous === "avoirs" ? "avoir" : vue.sous === "notes" ? "note" : vue.sous === "frais" ? "échéance" : "facture";
  tuileRestant(1, titre1, restant, mot);
  tuileRegle(2, titre2, liste, vue.sous === "notes" || vue.sous === "avoirs" ? "remboursement" : "règlement");
}

// Compteur de chaque sous-onglet : ce qui reste à régler (à relancer : toutes)
function afficherCompteurs() {
  for (const el of $$("[data-nb]")) {
    const [sens, sous] = el.dataset.nb.split("-");
    const n = factures.filter((f) => dansVue(f, sens, sous) && (sous === "relances" || !(f.payee || f.statut === "annulee"))).length;
    el.textContent = n || "";
  }
}

// --- Liste ---------------------------------------------------------------------------

function dansVue(f, sens = vue.sens, sous = vue.sous) {
  if (f.type !== sens) return false;
  if (sens === "client") {
    if (sous === "avoirs") return f.nature === "avoir";
    if (sous === "relances") return relancable(f) && f.statut === "en_retard";
    return f.nature !== "avoir";
  }
  return (f.famille || "") === FAMILLES[sous];
}

function sousOngletDe(f) {
  if (f.type === "client") return f.nature === "avoir" ? "avoirs" : "factures";
  return { note_frais: "notes", frais: "frais" }[f.famille] || "factures";
}

function correspond(f) {
  if (!dansVue(f)) return false;
  const reglee = f.payee || f.statut === "annulee";
  if (VUES[cleVue()].segments && filtre.statut === "a_regler" && reglee) return false;
  if (VUES[cleVue()].segments && filtre.statut === "payee" && !reglee) return false;
  if (filtre.statut === "a_valider" && !["a_valider", "en_attente"].includes(f.approbation)) return false;
  if (filtre.q) {
    const texte = `${f.tiers} ${f.numero} ${f.categorie} ${f.notes} ${f.commande}`.toLowerCase();
    if (!texte.includes(filtre.q.toLowerCase())) return false;
  }
  return true;
}

// Facture client impayée qu'on peut relancer (ni avoir, ni annulée)
function relancable(f) {
  return f.type === "client" && !f.payee && f.statut !== "annulee" && f.nature !== "avoir";
}

function statut(f) {
  const client = f.type === "client";
  if (f.statut === "annulee") return `<span class="statut">Annulée (${echapper(f.annulee_par)})</span>`;
  if (f.nature === "avoir") return f.payee ? `<span class="statut ok">Avoir soldé</span>` : `<span class="statut proche">À rembourser</span>`;
  const regle = client ? "Encaissée" : f.famille === "note_frais" ? "Remboursée"
    : f.mode_paiement === "Prélèvement" ? "Prélevée" : "Payée";
  if (f.payee) return `<span class="statut ok">${regle}${f.date_paiement ? " le " + dateFr(f.date_paiement) : ""}</span>`;
  // Facture reçue : validation avant paiement
  if (f.approbation === "refusee") return `<span class="statut retard">Refusée</span>`;
  if (f.approbation === "en_attente") return `<span class="statut proche">En attente</span>`;
  if (f.approbation === "a_valider") {
    const faits = f.validateurs.filter((v) => v.decision === "valide").length;
    return `<span class="statut proche">À valider (${faits}/${f.validateurs.length})</span>`;
  }
  if (f.statut === "en_retard") return `<span class="statut retard">En retard de ${pluriel(-f.jours_restants, "jour")}</span>`;
  if (f.jours_restants === null) return `<span class="statut">${f.famille === "note_frais" ? "À rembourser" : "À régler"}</span>`;
  if (f.jours_restants === 0) return `<span class="statut proche">Aujourd'hui</span>`;
  return `<span class="statut ${f.jours_restants <= 7 ? "proche" : ""}">Dans ${pluriel(f.jours_restants, "jour")}</span>`;
}

function details(f) {
  const infos = [
    f.nature && f.nature !== "facture" ? NATURES[f.nature] + (f.avoir_de ? ` de ${echapper(f.avoir_de)}` : "") : "",
    f.nature && f.nature !== "facture" || f.famille === "note_frais" ? "" : echapper(f.categorie),  // déjà affichée
    f.fichier_nom && !f.nature ? "pièce jointe" : "",
    lienCommande(f, "cde "),
    f.devis_signe ? `<a class="lien" target="_blank" href="/api/factures/${f.id}/devis-signe" title="Devis signé par le client">devis signé</a>` : "",
    f.relances.length ? `${NIVEAUX[f.relances.at(-1).niveau].toLowerCase()} le ${dateFr(f.relances.at(-1).date)}`
      : f.envoyee_le ? `envoyée le ${dateFr(f.envoyee_le)}` : "",
    f.client_pro && f.facturx ? (f.plateforme_statut ? `${echapper(f.plateforme_statut.toLowerCase())} (Qonto${f.plateforme_maj ? ", " + dateFr(f.plateforme_maj) : ""})`
      + (f.plateforme_url ? ` · <a class="lien" target="_blank" href="${echapper(f.plateforme_url)}">facture Qonto</a>` : "")
      : f.deposee_le ? `déposée sur la plateforme le ${dateFr(f.deposee_le)}`
      : `<span class="rouge">à envoyer à la plateforme</span>`) : "",
  ].filter(Boolean);
  return infos.length ? `<div class="secondaire">${infos.join(" · ")}</div>` : "";
}

// Bon de commande rappelé par la facture : celui du client (joint au devis) ou le nôtre (fournisseur)
function urlCommande(f) {
  if (f.type === "client") return f.bon_de_commande ? `/api/factures/${f.id}/bon-de-commande` : "";
  return f.commande && typeof bonsCommande !== "undefined" && bonsCommande.some((b) => b.numero === f.commande)
    ? `/api/commandes/${encodeURIComponent(f.commande)}/pdf` : "";
}

function lienCommande(f, prefixe = "") {
  if (!f.commande && !f.bon_de_commande) return "";
  const libelle = `${prefixe}${echapper(f.commande || "client")}`;
  const url = urlCommande(f);
  return url ? `<a class="lien" target="_blank" href="${url}" title="Voir le bon de commande">${libelle}</a>` : libelle;
}

function actions(f) {
  if (f.payee || f.statut === "annulee") return "";
  const relancer = relancable(f) && f.statut === "en_retard"
    ? `<button type="button" class="bouton petit" data-relancer>Relancer</button> ` : "";
  const libelle = f.nature === "avoir" ? "Marquer remboursé" : f.type === "client" ? "Marquer encaissée"
    : f.famille === "note_frais" ? "Marquer remboursée" : "Marquer payée";
  return `${relancer}<button type="button" class="bouton secondaire petit" data-payer>${libelle}</button>`;
}

function afficherListe() {
  afficherCompteurs();
  afficherResume();
  if (vue.sous === "commandes") return;
  const v = VUES[cleVue()];
  // Filtre « À valider » : factures reçues, dès qu'une validation est en cours dans cette vue
  $("#filtre-a-valider").hidden = !(vue.sens === "fournisseur" && factures.some((f) => dansVue(f) && f.approbation));
  if ($("#filtre-a-valider").hidden && filtre.statut === "a_valider") $('#filtre-statut [data-statut="a_regler"]').click();
  const visibles = factures.filter(correspond);
  $("#col-tiers").textContent = v.tiers;
  $("#col-date").textContent = v.date;
  $("#col-numero").textContent = v.numero;
  const parDate = v.date === "Date";   // notes de frais, frais, avoirs : date du document
  const numero = (f) => vue.sous === "notes" ? f.categorie : vue.sous === "frais" ? (f.numero || f.notes.split(" – ")[0]) : f.numero;

  $("#table-factures tbody").innerHTML = visibles.map((f) => `
    <tr class="cliquable" data-id="${f.id}">
      <td class="nombre">${dateFr(parDate ? f.date_facture : f.date_echeance) || "—"}</td>
      <td><strong>${echapper(f.tiers)}</strong>${details(f)}</td>
      <td class="secondaire">${echapper(numero(f))}</td>
      <td class="droite nombre"><strong>${euros(f.montant_ttc)}</strong></td>
      <td>${statut(f)}</td>
      <td class="droite">${actions(f)}</td>
    </tr>`).join("");

  const total = visibles.filter((f) => f.statut !== "annulee").reduce((s, f) => s + f.montant_ttc, 0);
  $("#total-filtre").textContent = visibles.length ? `${pluriel(visibles.length, v.mot)} · ${euros(total)}` : "";
  $("#table-factures").hidden = !visibles.length;
  $("#vide").hidden = !!visibles.length;
  $("#vide").textContent = filtre.q ? "Rien ne correspond à la recherche."
    : factures.some((f) => dansVue(f)) ? "Rien dans cette catégorie." : v.vide;
}

const ESPACES = {
  client: { titre: "Clients", sous: ["factures", "avoirs", "relances"] },
  fournisseur: { titre: "Fournisseurs", sous: ["factures", "notes", "frais", "commandes"] },
};
// Chaque sous-onglet est une entrée du menu (titre de la page) et un droit des profils
const ONGLETS = {
  "client-factures": { titre: "Factures clients", texte: "Ce que vos clients vous doivent.", droit: "factures_clients" },
  "client-avoirs": { titre: "Avoirs", texte: "Les factures annulées et ce qu'il reste à rembourser.", droit: "factures_clients" },
  "client-relances": { titre: "Relances", texte: "Les factures en retard, à relancer.", droit: "relances" },
  "fournisseur-factures": { titre: "Factures fournisseurs", texte: "Ce que vous devez à vos fournisseurs.",
                            droit: "factures_fournisseurs" },
  "fournisseur-notes": { titre: "Notes de frais", texte: "Les dépenses avancées par l'équipe, à rembourser.",
                         droit: "notes_frais" },
  "fournisseur-frais": { titre: "Assurances et frais bancaires",
                         texte: "Prélèvements et contrats réguliers, enregistrés à chaque échéance.", droit: "frais" },
  "fournisseur-commandes": { titre: "Bons de commande", texte: "Vos commandes aux fournisseurs.", droit: "commandes" },
};
const ouvert = (sens, sous) => peut(ONGLETS[`${sens}-${sous}`].droit);

function choisirVue(sens, sous = dernierSous[sens]) {
  if (!ESPACES[sens].sous.includes(sous) || !ouvert(sens, sous)) {   // onglet fermé à ce profil : le premier ouvert
    sous = ESPACES[sens].sous.find((s) => ouvert(sens, s));
    if (!sous) {
      const autre = sens === "client" ? "fournisseur" : "client";
      sous = ESPACES[autre].sous.find((s) => ouvert(autre, s));
      if (!sous) return;
      sens = autre;
    }
  }
  vue.sens = sens;
  vue.sous = dernierSous[sens] = sous;
  // Onglet (entrée du menu) : titre, résumé, menu, adresse (une page rechargée y revient)
  const onglet = ONGLETS[`${sens}-${sous}`];
  $("#titre-espace").textContent = onglet.titre;
  $("#sous-titre-espace").textContent = onglet.texte;
  document.title = `${onglet.titre} · GestionPro`;
  $$(".resume [data-sens]").forEach((n) => (n.hidden = n.dataset.sens !== sens));
  $("#lien-plateforme").hidden = true;   // dans le menu : Facture électronique
  marquerVue(sens, sous);
  history.replaceState(null, "", `factures.html?espace=${sens === "client" ? "clients" : "fournisseurs"}&onglet=${sous}`);
  $$(`.sous-onglets[data-sens="${sens}"] button`).forEach((b) => b.classList.toggle("actif", b.dataset.sous === sous));
  const commandes = sous === "commandes";
  $("#vue-factures").hidden = commandes;
  $("#vue-commandes").hidden = !commandes;
  $("#vue-recurrents").hidden = sous !== "frais";
  $("#nouvelle-commande").hidden = !commandes;
  const v = VUES[cleVue()];
  $("#ajouter").hidden = commandes || !v.ajouter;
  if (v?.ajouter) $("#ajouter").textContent = v.ajouter;
  if (commandes) {
    afficherResume();
    return afficherCommandes();
  }
  $("#filtre-statut").hidden = !v.segments;
  if (v.segments) $$("#filtre-statut button").forEach((b, i) => (b.textContent = v.segments[i]));
  if (sous === "frais") afficherRecurrents();
  afficherListe();
}

$$(".sous-onglets button").forEach((b) => b.addEventListener("click", () => choisirVue(vue.sens, b.dataset.sous)));
$$("#filtre-statut button").forEach((b) => b.addEventListener("click", () => {
  filtre.statut = b.dataset.statut;
  $$("#filtre-statut button").forEach((x) => x.classList.toggle("actif", x === b));
  afficherListe();
}));
$("#recherche").addEventListener("input", (e) => { filtre.q = e.target.value.trim(); afficherListe(); });

$("#table-factures tbody").addEventListener("click", async (e) => {
  const ligne = e.target.closest("tr");
  if (!ligne || e.target.closest("a")) return;   // lien (bon de commande) : s'ouvre seul
  if (e.target.closest("[data-payer]")) {
    const f = factures.find((x) => x.id === ligne.dataset.id);
    if (["a_valider", "en_attente", "refusee"].includes(f?.approbation)
        && !confirm(`Cette facture est ${ETATS_VALIDATION[f.approbation]}. La marquer payée quand même ?`)) return;
    await envoyerJson(`/api/factures/${ligne.dataset.id}/paiement`, "POST", { payee: true, date_paiement: aujourdhui() });
    await charger();
  } else if (e.target.closest("[data-relancer]")) {
    ouvrirRelance(factures.find((f) => f.id === ligne.dataset.id));
  } else {
    ouvrir(factures.find((f) => f.id === ligne.dataset.id));
  }
});

// --- Fenêtre de saisie ------------------------------------------------------------------

const form = $("#form-facture");

// --- Articles du stock liés à la facture ---------------------------------------------

function afficherArticlesFacture() {
  const type = form.elements.type.value;
  $("#bloc-articles").hidden = !articlesStock.length;
  $("#aide-articles").textContent = type === "client"
    ? "Ils sortiront du stock quand la facture sera encaissée."
    : "Ils entreront en stock quand la facture sera payée.";
  const options = articlesStock.map((a) => `<option value="${a.id}">${echapper(a.nom)}</option>`).join("");
  $("#articles-facture").innerHTML = edition.articles.map((l, i) => {
    const article = articlesStock.find((a) => a.id === l.article_id);
    return `<tr data-i="${i}">
      <td><select data-champ="article_id">${options}</select></td>
      <td style="width: 90px"><input data-champ="quantite" type="number" step="any" min="0" value="${l.quantite}"></td>
      <td class="secondaire" style="width: 60px">${article ? echapper(article.unite) : ""}</td>
      <td style="width: 24px"><button type="button" class="lien discret" data-retirer title="Retirer">×</button></td>
    </tr>`;
  }).join("");
  $$("#articles-facture tr").forEach((tr) => {
    tr.querySelector("select").value = edition.articles[tr.dataset.i].article_id;
  });
}

$("#articles-facture").addEventListener("input", (e) => {
  const tr = e.target.closest("tr");
  const ligne = edition.articles[tr.dataset.i];
  if (e.target.dataset.champ === "quantite") ligne.quantite = Number(e.target.value || 0);
  else {
    ligne.article_id = e.target.value;
    afficherArticlesFacture();  // met à jour l'unité affichée
  }
});
$("#articles-facture").addEventListener("click", (e) => {
  if (!e.target.closest("[data-retirer]")) return;
  edition.articles.splice(Number(e.target.closest("tr").dataset.i), 1);
  afficherArticlesFacture();
});
$("#ajouter-article-facture").addEventListener("click", () => {
  edition.articles.push({ article_id: articlesStock[0].id, quantite: 1 });
  afficherArticlesFacture();
});

function majSelonType() {
  afficherArticlesFacture();
  const type = form.elements.type.value;
  const famille = type === "fournisseur" ? form.elements.famille.value : "";
  form.querySelector(".sens").hidden = !!famille;
  $("#libelle-tiers").textContent = type === "client" ? "Client" : famille === "note_frais"
    ? "Personne qui a avancé les frais" : famille === "frais" ? "Organisme (banque, assureur…)" : "Fournisseur";
  $("#libelle-payee").textContent = type === "client" ? "Déjà encaissée" : famille === "note_frais" ? "Déjà remboursée" : "Déjà payée";
  $("#libelle-categorie").textContent = famille === "note_frais" ? "Nature de la dépense" : "Catégorie";
  $("#champ-numero").hidden = $("#champ-echeance").hidden = famille === "note_frais";
  if (famille) $("#bloc-articles").hidden = true;
  const existantes = factures.filter((f) => f.type === type && (f.famille || "") === famille).map((f) => f.categorie);
  $("#liste-categories").innerHTML = [...new Set([...CATEGORIES[famille || type], ...existantes].filter(Boolean))]
    .map((c) => `<option value="${echapper(c)}">`).join("");
}

function majPaiement() {
  const payee = form.elements.payee.checked;
  $$(".si-payee").forEach((el) => (el.hidden = !payee));
  if (payee && !form.elements.date_paiement.value) form.elements.date_paiement.value = aujourdhui();
}

function afficherApercu(source, nom) {
  const zone = $("#apercu");
  $("#actions-piece").hidden = !source;
  if (!source) {
    zone.innerHTML = `<span>Aucune pièce jointe</span>
      <label class="bouton secondaire petit">Joindre le PDF ou la photo
        <input type="file" class="choix-piece" accept="application/pdf,image/*" hidden></label>`;
    brancherChoixPiece();
    return;
  }
  zone.innerHTML = nom.toLowerCase().endsWith(".pdf")
    ? `<iframe src="${source}#navpanes=0&view=FitH" title="Aperçu"></iframe>`
    : `<img src="${source}" alt="Aperçu">`;
  $("#nom-piece").textContent = nom;
}

function brancherChoixPiece() {
  $$(".choix-piece").forEach((input) => (input.onchange = (e) => {
    const fichier = e.target.files[0];
    e.target.value = "";
    if (!fichier) return;
    edition.fichier = fichier;
    edition.retirer = false;
    afficherApercu(URL.createObjectURL(fichier), fichier.name);
    if (!edition.id) preRemplir(fichier);
  }));
}
brancherChoixPiece();

$("#retirer-piece").addEventListener("click", () => {
  edition.fichier = null;
  edition.retirer = true;
  afficherApercu(null);
});

// Facture électronique reçue (Factur-X) : le PDF contient les données, on remplit la saisie
async function preRemplir(fichier) {
  if (!fichier.name.toLowerCase().endsWith(".pdf")) return;
  const envoi = new FormData();
  envoi.append("fichier", fichier);
  let donnees = null;
  try {
    donnees = (await apiJson("/api/factures/lire-facture-electronique", { method: "POST", body: envoi })).donnees;
  } catch { return; }
  if (!donnees || edition.id) return;
  const v = form.elements;
  if (v.type.value !== "fournisseur") {
    v.type.value = "fournisseur";
    majSelonType();
  }
  for (const cle of ["tiers", "numero", "date_facture", "date_echeance"]) {
    if (donnees[cle] && !v[cle].value) v[cle].value = donnees[cle];
  }
  const signe = donnees.avoir ? -1 : 1;
  if (!v.montant_ttc.value) v.montant_ttc.value = (signe * donnees.montant_ttc).toFixed(2);
  if (!v.montant_tva.value && donnees.montant_tva) v.montant_tva.value = (signe * donnees.montant_tva).toFixed(2);
  $("#file-attente").textContent = "Facture électronique lue : vérifiez les champs pré-remplis.";
}

function ouvrir(facture = null, fichier = null) {
  form.reset();
  edition = { id: facture?.id || null, fichier, retirer: false,
              articles: (facture?.articles || []).map((a) => ({ ...a })) };
  const valeurs = facture || { type: vue.sens, famille: vue.sens === "fournisseur" ? FAMILLES[vue.sous] ?? "" : "",
                               date_facture: aujourdhui() };
  for (const [cle, valeur] of Object.entries(valeurs)) {
    const champ = form.elements[cle];
    if (!champ) continue;
    if (cle === "type") champ.value = valeur;
    else if (champ.type === "checkbox") champ.checked = valeur;
    else champ.value = valeur ?? "";
  }
  if (facture) {
    form.elements.montant_ttc.value = facture.montant_ttc.toFixed(2);
    form.elements.montant_tva.value = facture.montant_tva ? facture.montant_tva.toFixed(2) : "";
  }

  const emise = !!facture?.nature;
  const famille = valeurs.famille || "";
  const quoi = { note_frais: ["Nouvelle note de frais", "Note de frais"], frais: ["Nouvelle dépense", "Dépense"] }[famille]
    || ["Nouvelle facture", "Modifier la facture"];
  $("#fenetre-titre").textContent = emise ? `${NATURES[facture.nature]} ${facture.numero}` : facture?.id ? quoi[1] : quoi[0];
  $("#supprimer").hidden = !facture?.id || emise;
  $("#libelle-commande").textContent = form.elements.type.value === "client"
    ? "N° de commande du client" : "N° de notre bon de commande";
  const url = facture?.id ? urlCommande(facture) : "";
  $("#lien-commande").innerHTML = url ? `<a class="lien" target="_blank" href="${url}">Voir le bon de commande</a>` : "";
  form.querySelector("details.plus").open = !!facture?.commande;
  $("#erreur-facture").textContent = "";
  $("#file-attente").textContent = fileAttente.length ? `encore ${pluriel(fileAttente.length, "fichier")} à saisir ensuite` : "";

  if (fichier) {
    afficherApercu(URL.createObjectURL(fichier), fichier.name);
    preRemplir(fichier);
  }
  else if (facture?.fichier_nom) afficherApercu(`/api/factures/${facture.id}/fichier`, facture.fichier_nom);
  else afficherApercu(null);

  majSelonType();
  verrouiller(facture);
  majPaiement();
  afficherValidation(facture);
  $("#fenetre").showModal();
  $(".fenetre-corps").scrollTop = 0;
  form.elements.tiers.focus();
}

// --- Validation des factures reçues (voir backend/factures/validation.py) ------------------------

const DECISIONS = { valide: "a validé", refuse: "a refusé", attente: "a mis en attente" };
const ETATS_VALIDATION = { a_valider: "à valider", validee: "validée", refusee: "refusée", en_attente: "en attente" };

function afficherValidation(facture) {
  const bloc = $("#bloc-validation");
  const concernee = facture?.id && facture.type === "fournisseur" && ["", "note_frais"].includes(facture.famille || "")
    && facture.statut !== "annulee";
  bloc.hidden = !concernee;
  if (!concernee) return;
  $("#etat-validation").textContent = facture.approbation ? `: ${ETATS_VALIDATION[facture.approbation]}` : "";
  const moi = session.utilisateur?.id || "moi";
  $("#liste-validation").innerHTML = facture.validateurs.length ? facture.validateurs.map((v) => `
    <li><strong>${echapper(v.nom || (v.id === "moi" ? "Vous" : ""))}</strong>
      ${v.decision ? `${DECISIONS[v.decision]} le ${dateFr(v.date)}${v.motif ? ` : « ${echapper(v.motif)} »` : ""}`
                   : `<span class="secondaire">n'a pas encore validé</span>`}</li>`).join("")
    : `<li class="secondaire">Aucune personne n'est chargée de valider les factures reçues (Paramètres > Utilisateurs).
         Vous pouvez la refuser ou la mettre en attente.</li>`;
  // Qui décide : les personnes chargées de valider ; sans circuit, toute personne de l'espace Fournisseurs
  const maDecision = facture.validateurs.find((v) => v.id === moi)?.decision;
  $("#actions-validation").hidden = facture.circuit && !facture.validateurs.some((v) => v.id === moi);
  $('#actions-validation [data-decision="valide"]').hidden = !facture.circuit || maDecision === "valide";
  $('#actions-validation [data-decision="attente"]').hidden = maDecision === "attente";
  $('#actions-validation [data-decision="refuse"]').hidden = maDecision === "refuse";
  $('#actions-validation [data-decision="annuler"]').hidden = !maDecision;
  $("#erreur-validation").textContent = "";
}

// Motifs de refus normalisés (facture électronique) : backend/plateforme/qonto.py, MOTIFS_REFUS
const MOTIFS_REFUS = { TX_TVA_ERR: "Taux de TVA erroné", MONTANTTOTAL_ERR: "Montant total erroné",
  CALCUL_ERR: "Erreur de calcul", NON_CONFORME: "Facture non conforme", DOUBLON: "Doublon",
  DEST_ERR: "Mauvais destinataire", TRANSAC_INC: "Transaction inconnue", EMMET_INC: "Émetteur inconnu",
  CONTRAT_TERM: "Contrat terminé", DOUBLE_FACT: "Double facturation", CMD_ERR: "Commande erronée",
  ADR_ERR: "Adresse erronée", REF_CT_ABSENT: "Référence du contrat absente" };
$("#form-refus [name=code]").insertAdjacentHTML("beforeend",
  Object.entries(MOTIFS_REFUS).map(([c, l]) => `<option value="${c}">${l}</option>`).join(""));
$$("[data-fermer-refus]").forEach((b) => (b.onclick = () => $("#fenetre-refus").close()));

async function enregistrerDecision(decision, motif, code_motif = "") {
  const facture = await envoyerJson(`/api/factures/${edition.id}/decision`, "POST", { decision, motif, code_motif });
  const i = factures.findIndex((f) => f.id === facture.id);
  if (i >= 0) factures[i] = { ...factures[i], ...facture };
  afficherValidation(factures[i] || facture);
  afficherListe();
}

$("#form-refus").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  $("#erreur-refus").textContent = "";
  if (!f.code.value) return ($("#erreur-refus").textContent = "Choisissez le motif.");
  if (!f.motif.value.trim()) return ($("#erreur-refus").textContent = "Précisez le motif.");
  try {
    await enregistrerDecision("refuse", f.motif.value, f.code.value);
    $("#fenetre-refus").close();
  } catch (err) {
    $("#erreur-refus").textContent = err.message;
  }
});

$("#actions-validation").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-decision]");
  if (!b || !edition.id) return;
  const courante = factures.find((x) => x.id === edition.id);
  if (b.dataset.decision === "refuse" && courante?.plateforme_id) {   // facture reçue par Qonto : refus transmis
    $("#form-refus").reset();
    $("#erreur-refus").textContent = "";
    $("#fenetre-refus").showModal();
    return;
  }
  let motif = "";
  if (["refuse", "attente"].includes(b.dataset.decision)) {
    motif = prompt(b.dataset.decision === "refuse" ? "Motif du refus :" : "Pourquoi la mettre en attente ?", "");
    if (motif === null) return;
  }
  try {
    await enregistrerDecision(b.dataset.decision, motif);
  } catch (err) {
    $("#erreur-validation").textContent = err.message;
  }
});

// Document émis par le logiciel (facture numérotée, acompte, solde, avoir) : seul le paiement se modifie
const MODIFIABLES_EMISE = ["payee", "date_paiement", "mode_paiement", "notes"];

function verrouiller(facture) {
  const emise = !!facture?.nature;
  const annulee = facture?.statut === "annulee";
  form.querySelectorAll("input, select, textarea, .raccourcis button, #bloc-articles button").forEach((el) => {
    el.disabled = emise && (annulee || !MODIFIABLES_EMISE.includes(el.name));
  });
  form.elements.notes.disabled = false;
  if (emise) {
    $("#bloc-articles").hidden = true;
    $("#actions-piece").hidden = true;
  }
  const avoir = facture?.nature === "avoir";
  if (avoir) $("#libelle-payee").textContent = "Remboursé ou compensé";

  const info = $("#info-emise");
  info.hidden = !emise;
  info.textContent = annulee ? `Cette facture est annulée par l'avoir ${facture.annulee_par}.`
    : avoir ? `Avoir annulant la facture ${facture.avoir_de}. Cochez « Remboursé ou compensé » une fois le client remboursé.`
    : "Document émis : il ne peut plus être modifié ni supprimé. Pour corriger une erreur, annulez-le par un avoir puis refaites la facture.";

  $("#avoir").hidden = !emise || avoir || annulee;
  $("#relancer").hidden = !facture?.id || !relancable(facture);
  $("#envoyer-facture").hidden = !facture?.id || facture.type !== "client" || !facture.fichier_nom;

  const relances = facture?.relances || [];
  $("#bloc-relances").hidden = !relances.length;
  $("#liste-relances").innerHTML = relances.map((r, i) => `<tr>
    <td>${dateFr(r.date)}</td><td>${NIVEAUX[r.niveau]}</td>
    <td class="droite"><a class="lien" target="_blank" href="/api/factures/${facture.id}/relances/${i}/pdf">Lettre PDF</a></td>
  </tr>`).join("");
}

$$("input[name=type]").forEach((r) => r.addEventListener("change", majSelonType));
form.elements.payee.addEventListener("change", majPaiement);

$$(".raccourcis button").forEach((b) => b.addEventListener("click", () => {
  const d = new Date((form.elements.date_facture.value || aujourdhui()) + "T12:00:00");
  d.setDate(d.getDate() + Number(b.dataset.jours));
  form.elements.date_echeance.value = dateIso(d);
}));

function fermer() {
  $("#fenetre").close();
  fileAttente = [];
}
$$("[data-fermer]").forEach((b) => b.addEventListener("click", fermer));
$("#fenetre").addEventListener("cancel", () => (fileAttente = []));  // touche Échap
$("#ajouter").addEventListener("click", () => ouvrir());

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const v = form.elements;
  if (!v.tiers.value.trim()) return v.tiers.reportValidity();
  if (!v.montant_ttc.value) return v.montant_ttc.reportValidity();
  const saisie = {
    type: v.type.value,
    tiers: v.tiers.value.trim(),
    numero: v.numero.value.trim(),
    categorie: v.categorie.value.trim(),
    date_facture: v.date_facture.value,
    date_echeance: v.date_echeance.value,
    montant_ttc: Number(v.montant_ttc.value || 0),
    montant_tva: Number(v.montant_tva.value || 0),
    payee: v.payee.checked,
    date_paiement: v.payee.checked ? v.date_paiement.value : "",
    mode_paiement: v.payee.checked ? v.mode_paiement.value : "",
    notes: v.notes.value,
    commande: v.commande.value.trim(),
    famille: v.type.value === "fournisseur" ? v.famille.value : "",
    articles: edition.articles.filter((a) => a.article_id && a.quantite > 0),
  };
  const donnees = new FormData();
  donnees.append("donnees", JSON.stringify(saisie));
  // Facture client déjà encaissée dont le règlement est retiré ou corrigé : motif gardé au journal des encaissements
  const avant = edition.id && factures.find((f) => f.id === edition.id);
  if (avant && avant.type === "client" && avant.payee && (!saisie.payee || saisie.date_paiement !== avant.date_paiement
      || saisie.mode_paiement !== avant.mode_paiement || saisie.montant_ttc !== avant.montant_ttc)) {
    const motif = prompt("Vous corrigez un règlement déjà enregistré. Il ne sera pas effacé : une écriture "
      + "d'annulation est ajoutée au journal des encaissements.\n\nMotif de la correction :", "");
    if (motif === null) return;
    if (!motif.trim()) return ($("#erreur-facture").textContent = "Indiquez le motif de la correction du règlement.");
    donnees.append("motif_paiement", motif.trim());
  }
  if (edition.fichier) donnees.append("fichier", edition.fichier);
  if (edition.retirer) donnees.append("retirer_fichier", "true");

  try {
    await api(edition.id ? `/api/factures/${edition.id}` : "/api/factures",
              { method: edition.id ? "PUT" : "POST", body: donnees });
  } catch (err) {
    $("#erreur-facture").textContent = err.message;
    return;
  }
  $("#fenetre").close();
  await charger();
  if (fileAttente.length) ouvrir(null, fileAttente.shift());  // fichiers déposés en lot
});

$("#avoir").addEventListener("click", async () => {
  const facture = factures.find((f) => f.id === edition.id);
  const parQonto = !!(facture.plateforme_id && facture.plateforme_statut);   // facture passée par Qonto
  const motif = prompt(`Annuler la facture ${facture.numero} par un avoir de ${euros(-facture.montant_ttc)} ?\n\n`
    + (parQonto ? "La facture étant passée par Qonto, l'avoir sera aussi émis par Qonto et envoyé au client par e-mail.\n\n" : "")
    + "Motif (facultatif, il figurera sur l'avoir) :", "");
  if (motif === null) return;
  if (parQonto) {
    try {
      const avoir = await envoyerJson(`/api/factures/${facture.id}/avoir`, "POST", { motif });
      const [r] = (await envoyerJson("/api/plateforme/qonto/envoyer", "POST", { ids: [avoir.id] })).resultats;
      alert(r.ok ? `Avoir ${avoir.numero} créé, émis par Qonto et envoyé au client.`
        : `Avoir ${avoir.numero} créé, mais pas envoyé par Qonto : ${r.message}\n\nIl reste dans Ventes > Facture électronique > À régler.`);
    } catch (err) {
      $("#erreur-facture").textContent = err.message;
      return;
    }
    fermer();
    await charger();
    return;
  }
  const fenetre = window.open("", "_blank");  // ouverte tout de suite pour ne pas être bloquée
  try {
    const avoir = await envoyerJson(`/api/factures/${facture.id}/avoir`, "POST", { motif });
    if (fenetre) fenetre.location = `/api/factures/${avoir.id}/fichier`;
  } catch (err) {
    fenetre?.close();
    $("#erreur-facture").textContent = err.message;
    return;
  }
  fermer();
  await charger();
});

$("#envoyer-facture").addEventListener("click", () => {
  const facture = factures.find((f) => f.id === edition.id);
  fermer();
  ouvrirEnvoi({ titre: `Envoyer ${facture.numero ? (NATURES[facture.nature] || "la facture") + " " + facture.numero : "la facture"}`,
                modele: `/api/factures/${facture.id}/envoi`, marquer: `/api/factures/${facture.id}/envoyee`,
                apresEnvoi: charger });
});

$("#relancer").addEventListener("click", () => {
  const facture = factures.find((f) => f.id === edition.id);
  fermer();
  ouvrirRelance(facture);
});

$("#supprimer").addEventListener("click", async () => {
  if (!confirm("Supprimer définitivement cette facture et sa pièce jointe ?")) return;
  await api(`/api/factures/${edition.id}`, { method: "DELETE" });
  fermer();
  await charger();
});

// --- Relance d'une facture impayée ----------------------------------------------------

const formRelance = $("#form-relance");
let relance = null;  // { facture, niveau, enregistree: { cle, index } }

async function ouvrirRelance(facture) {
  relance = { facture, niveau: Math.min(facture.relances.length + 1, 3), enregistree: null };
  formRelance.reset();
  $("#titre-relance").textContent = `Relancer ${facture.tiers} · ${facture.numero || "facture"} · ${euros(facture.montant_ttc)}`;
  $("#lien-facture-relance").href = `/api/factures/${facture.id}/fichier`;
  $("#lien-facture-relance").hidden = !facture.fichier_nom;
  const derniere = facture.relances.at(-1);
  $("#historique-relance").textContent = derniere
    ? `Dernière relance : ${NIVEAUX[derniere.niveau].toLowerCase()} le ${dateFr(derniere.date)} (${pluriel(facture.relances.length, "relance")} en tout).`
    : "Aucune relance envoyée pour cette facture.";
  $("#erreur-relance").textContent = "";
  $("#fenetre-relance").showModal();
  await chargerModele(relance.niveau, true);
}

async function chargerModele(niveau, avecEmail = false) {
  relance.niveau = niveau;
  $$("#niveaux-relance button").forEach((b) => b.classList.toggle("actif", Number(b.dataset.niveau) === niveau));
  try {
    const m = await apiJson(`/api/factures/${relance.facture.id}/relance?niveau=${niveau}`);
    formRelance.elements.objet.value = m.objet;
    formRelance.elements.texte.value = m.texte;
    if (avecEmail) formRelance.elements.email.value = m.email;
  } catch (err) {
    $("#erreur-relance").textContent = err.message;
  }
}

$$("#niveaux-relance button").forEach((b) => b.addEventListener("click", () => chargerModele(Number(b.dataset.niveau))));

// Enregistre la relance dans l'historique de la facture (une seule fois si on fait PDF puis e-mail)
async function enregistrerRelance() {
  const demande = { niveau: relance.niveau, objet: formRelance.elements.objet.value.trim(),
                    texte: formRelance.elements.texte.value };
  const cle = JSON.stringify(demande);
  if (relance.enregistree?.cle === cle) return relance.enregistree.index;
  const facture = await envoyerJson(`/api/factures/${relance.facture.id}/relances`, "POST", demande);
  relance.facture = facture;
  relance.enregistree = { cle, index: facture.relances.length - 1 };
  charger();
  return relance.enregistree.index;
}

$("#relance-pdf").addEventListener("click", async () => {
  const fenetre = window.open("", "_blank");
  try {
    const index = await enregistrerRelance();
    if (fenetre) fenetre.location = `/api/factures/${relance.facture.id}/relances/${index}/pdf`;
  } catch (err) {
    fenetre?.close();
    $("#erreur-relance").textContent = err.message;
  }
});

$("#relance-email").addEventListener("click", async () => {
  const email = formRelance.elements.email.value.trim();
  if (!email) {
    $("#erreur-relance").textContent = "Indiquez l'adresse e-mail du client.";
    return formRelance.elements.email.focus();
  }
  const service = await choisirMessagerie();
  if (!service) return;
  try {
    await enregistrerRelance();
    await ouvrirMessagerie(service, email, formRelance.elements.objet.value, formRelance.elements.texte.value);
  } catch (err) {
    $("#erreur-relance").textContent = err.message;
    return;
  }
  $("#fenetre-relance").close();
});

$$("[data-fermer-relance]").forEach((b) => b.addEventListener("click", () => $("#fenetre-relance").close()));

// --- Dépôt de fichiers (glisser sur la liste) ------------------------------------------

const zone = $("#liste");
zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("survol"); });
zone.addEventListener("dragleave", (e) => { if (!zone.contains(e.relatedTarget)) zone.classList.remove("survol"); });
zone.addEventListener("drop", (e) => {
  e.preventDefault();
  zone.classList.remove("survol");
  fileAttente = [...e.dataTransfer.files].filter((f) => f.type === "application/pdf" || f.type.startsWith("image/"));
  if (fileAttente.length) ouvrir(null, fileAttente.shift());
});

(async () => {
  await initialiserPage();
  const fournisseurs = !peut("clients") || (peut("fournisseurs") && (parametre("espace") === "fournisseurs"
    || ["frais", "notes", "commandes"].includes(parametre("onglet")) || !!parametre("commande")));
  choisirVue(fournisseurs ? "fournisseur" : "client", parametre("onglet") || "factures");
  articlesStock = await apiJson("/api/stock");
  await charger();
  // Lien de la recherche globale : ouvre directement la facture
  // « Relancer » depuis l'accueil
  const aRelancer = factures.find((f) => f.id === parametre("relancer"));
  if (aRelancer) {
    choisirVue("client", "relances");
    ouvrirRelance(aRelancer);
  }
  const cible = factures.find((f) => f.id === parametre("facture"));   // liste déjà filtrée selon le profil
  if (cible) {
    choisirVue(cible.type, sousOngletDe(cible));
    $('#filtre-statut [data-statut=""]').click();
    surlignerLigne($(`#table-factures tr[data-id="${cible.id}"]`));
    ouvrir(cible);
  }
})();


// --- Assurances, frais bancaires : prélèvements et contrats récurrents ---------------------------

const FREQUENCES = { mensuelle: "Tous les mois", trimestrielle: "Tous les trimestres",
                     semestrielle: "Tous les six mois", annuelle: "Tous les ans" };
const formRecurrent = $("#form-recurrent");
let contrats = [];
let contratEdite = null;

async function afficherRecurrents() {
  contrats = await apiJson("/api/frais-recurrents");
  $("#table-recurrents tbody").innerHTML = contrats.map((r) => `
    <tr class="cliquable ${r.actif ? "" : "secondaire"}" data-id="${r.id}">
      <td><strong>${echapper(r.tiers)}</strong>${r.libelle ? `<div class="secondaire">${echapper(r.libelle)}</div>` : ""}</td>
      <td>${echapper(r.categorie)}</td>
      <td class="droite nombre">${euros(r.montant_ttc)}</td>
      <td>${FREQUENCES[r.frequence]}</td>
      <td>${r.actif ? `${dateFr(r.prochaine)} <span class="secondaire">${r.prelevement ? "prélevée" : "à payer"}</span>` : "résilié"}</td>
      <td class="droite nombre">${r.actif ? euros(r.cout_annuel) : "—"}</td>
      <td class="droite"><button type="button" class="lien">Modifier</button></td>
    </tr>`).join("");
  $("#table-recurrents").hidden = !contrats.length;
  $("#vide-recurrents").hidden = !!contrats.length;
}

function ouvrirRecurrent(r = null) {
  contratEdite = r;
  formRecurrent.reset();
  const v = formRecurrent.elements;
  const valeurs = r || { categorie: "Assurance", frequence: "mensuelle", prochaine: aujourdhui(), prelevement: true, actif: true };
  for (const [cle, valeur] of Object.entries(valeurs)) {
    if (!v[cle]) continue;
    if (v[cle].type === "checkbox") v[cle].checked = valeur;
    else v[cle].value = valeur ?? "";
  }
  if (r) v.montant_tva.value = r.montant_tva || "";
  $("#titre-recurrent").textContent = r ? `${r.tiers}${r.libelle ? " – " + r.libelle : ""}` : "Nouveau prélèvement ou contrat";
  $("#supprimer-recurrent").hidden = !r;
  $("#erreur-recurrent").textContent = "";
  $("#fenetre-recurrent").showModal();
}

$("#table-recurrents tbody").addEventListener("click", (e) => {
  const ligne = e.target.closest("tr");
  if (ligne) ouvrirRecurrent(contrats.find((r) => r.id === ligne.dataset.id));
});
$("#nouveau-recurrent").addEventListener("click", () => ouvrirRecurrent());
$$("[data-fermer-recurrent]").forEach((b) => b.addEventListener("click", () => $("#fenetre-recurrent").close()));

formRecurrent.addEventListener("submit", async (e) => {
  e.preventDefault();
  const v = formRecurrent.elements;
  if (!v.tiers.value.trim()) return v.tiers.reportValidity();
  if (!v.montant_ttc.value) return v.montant_ttc.reportValidity();
  const saisie = { tiers: v.tiers.value.trim(), categorie: v.categorie.value.trim() || "Autre",
                   libelle: v.libelle.value.trim(), montant_ttc: Number(v.montant_ttc.value || 0),
                   montant_tva: Number(v.montant_tva.value || 0), frequence: v.frequence.value,
                   prochaine: v.prochaine.value, prelevement: v.prelevement.checked, actif: v.actif.checked };
  try {
    if (contratEdite) await envoyerJson(`/api/frais-recurrents/${contratEdite.id}`, "PUT", saisie);
    else await envoyerJson("/api/frais-recurrents", "POST", saisie);
  } catch (err) {
    $("#erreur-recurrent").textContent = err.message;
    return;
  }
  $("#fenetre-recurrent").close();
  await charger();   // échéances déjà arrivées : enregistrées tout de suite
});

$("#supprimer-recurrent").addEventListener("click", async () => {
  if (!confirm("Supprimer ce prélèvement ou contrat ? Les échéances déjà enregistrées restent dans la liste.")) return;
  await api(`/api/frais-recurrents/${contratEdite.id}`, { method: "DELETE" });
  $("#fenetre-recurrent").close();
  await charger();
});
