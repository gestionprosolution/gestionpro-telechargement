// Devis : fiche client + tableau des prestations + conditions -> PDF.

const UNITES = [["u", "unité"], ["h", "heure"], ["j", "jour"], ["m²", "m²"], ["ml", "ml"],
                ["m³", "m³"], ["kg", "kg"], ["forfait", "forfait"], ["lot", "lot"]];

let devis = null;        // devis en cours de saisie
let modeEdition = null;  // numéro du devis enregistré en cours de modification
let catalogue = [];      // prestations du catalogue
let clientsConnus = [];
let articlesStock = [];
let infosStock = [];     // élément « Article du stock » sous chaque ligne

const STATUTS = [["en_attente", "En attente"], ["accepte", "Accepté"], ["refuse", "Refusé"]];

// --- Onglets ------------------------------------------------------------------------

function afficherVue(vue) {
  $$(".onglets button").forEach((b) => b.classList.toggle("actif", b.dataset.vue === vue));
  $("#vue-nouveau").hidden = vue !== "nouveau";
  $("#vue-historique").hidden = vue !== "historique";
  $("#vue-catalogue").hidden = vue !== "catalogue";
}
$$(".onglets button").forEach((b) => b.addEventListener("click", () => afficherVue(b.dataset.vue)));

// --- Client --------------------------------------------------------------------------

const champsClient = () => $$("[data-client]");
const lireClient = () => Object.fromEntries(champsClient().map((c) => [c.dataset.client, c.value.trim()]));
function remplirClient(client) {
  champsClient().forEach((c) => (c.value = client[c.dataset.client] || (c.dataset.client === "type" ? "particulier" : "")));
  $("#bloc-livraison").open = !!(client.livraison_adresse || client.livraison_ville);
  majTypeClient();
}

// SIREN et n° de TVA : seulement pour un client professionnel
function majTypeClient() {
  const pro = $("[data-client=type]").value === "professionnel";
  $$(".si-pro").forEach((el) => (el.hidden = !pro));
}
$("[data-client=type]").addEventListener("change", majTypeClient);

$("#clients-connus").addEventListener("change", (e) => {
  const client = clientsConnus[Number(e.target.value)];
  if (client) remplirClient(client);
  e.target.value = "";
});

async function chargerClients() {
  clientsConnus = await apiJson("/api/devis/clients");
  $("#clients-connus").hidden = !clientsConnus.length;
  $("#clients-connus").innerHTML = `<option value="">Reprendre un client existant…</option>` +
    clientsConnus.map((c, i) => `<option value="${i}">${echapper(c.nom)}${c.ville ? " · " + echapper(c.ville) : ""}</option>`).join("");
}

// --- Prestations ---------------------------------------------------------------------

const tauxTva = () => (entreprise.franchise_tva ? 0 : Number($("#d-tva").value || 0));

function nouvelleLigne() {
  return { designation: "", description: "", quantite: 1, unite: "u", prix_unitaire_ht: 0, taux_tva: tauxTva(), article_id: "" };
}

function champ(ligne, cle, type, attributs = {}) {
  const input = document.createElement("input");
  input.type = type;
  input.value = type === "number" && !ligne[cle] && cle === "prix_unitaire_ht" ? "" : ligne[cle];
  Object.assign(input, attributs);
  input.oninput = () => {
    ligne[cle] = type === "number" ? Number(input.value || 0) : input.value;
    recalculer();
  };
  // Entrée sur la dernière ligne : on en ajoute une nouvelle
  input.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (ligne === devis.lignes.at(-1)) ajouterLigne();
    }
  };
  return input;
}

// --- Lien avec le stock : choisir un article dans la liste le relie à la ligne -------

async function chargerArticles() {
  articlesStock = await apiJson("/api/stock");
  afficherSuggestions();
}

// Propositions sous le champ « Produit ou service » : prestations du catalogue et articles du stock
function afficherSuggestions() {
  $("#suggestions-lignes").innerHTML = [
    ...catalogue.map((p) => `<option value="${echapper(p.designation)}">Catalogue · ${euros(p.prix_unitaire_ht)} HT / ${echapper(p.unite)}</option>`),
    ...articlesStock.map((a) => { const code = a.isbn || a.ean || a.reference;
      return `<option value="${echapper(a.nom)}">Stock · ${code ? echapper(code) + " · " : ""}${a.disponible ?? a.quantite} ${echapper(a.unite)} disponible(s)</option>`; }),
  ].join("");
}

const prestationDe = (ligne) => {
  const nom = ligne.designation.trim().toLowerCase();
  return nom ? catalogue.find((p) => p.designation.trim().toLowerCase() === nom) : null;
};

// Choisir une prestation du catalogue remplit le prix et l'unité de la ligne
function appliquerPrestation(ligne, tr) {
  const prestation = prestationDe(ligne);
  if (!prestation || ligne.article_id) return;
  const [, , prix] = tr.querySelectorAll("input");
  if (!ligne.prix_unitaire_ht) {
    ligne.prix_unitaire_ht = prestation.prix_unitaire_ht;
    prix.value = prestation.prix_unitaire_ht || "";
  }
  const unite = tr.querySelector("select");
  if (![...unite.options].some((o) => o.value === prestation.unite)) unite.add(new Option(prestation.unite, prestation.unite));
  unite.value = ligne.unite = prestation.unite;
}

function lierArticle(ligne, tr) {
  const nom = ligne.designation.trim().toLowerCase();
  const article = articlesStock.find((a) => a.nom.toLowerCase() === nom);
  if (!article) {
    ligne.article_id = "";
    return;
  }
  if (ligne.article_id === article.id) return;
  ligne.article_id = article.id;
  // Pré-remplissage avec la fiche de l'article
  const [, , prix] = tr.querySelectorAll("input");
  if (!ligne.prix_unitaire_ht && article.prix_vente_ht) {
    ligne.prix_unitaire_ht = article.prix_vente_ht;
    prix.value = article.prix_vente_ht;
  }
  const unite = tr.querySelector("select");
  if (![...unite.options].some((o) => o.value === article.unite)) unite.add(new Option(article.unite, article.unite));
  unite.value = ligne.unite = article.unite;
}

function afficherInfosStock() {
  devis.lignes.forEach((ligne, i) => {
    const info = infosStock[i];
    const article = articlesStock.find((a) => a.id === ligne.article_id);
    if (!info) return;
    info.classList.toggle("rouge", !!article && article.quantite < ligne.quantite);
    if (article) {
      info.textContent = `Article du stock · ${article.quantite} ${article.unite} disponible${article.quantite > 1 ? "s" : ""}`;
    } else if (prestationDe(ligne)) {
      info.textContent = "Prestation du catalogue";
    } else if (ligne.designation.trim() && ligne.prix_unitaire_ht) {
      info.innerHTML = `<button type="button" class="lien discret" data-vers-catalogue="${i}">Enregistrer dans le catalogue</button>`;
    } else {
      info.textContent = "";
    }
  });
}

// « Enregistrer dans le catalogue » sous une ligne saisie à la main
$("#lignes").addEventListener("click", async (e) => {
  const bouton = e.target.closest("[data-vers-catalogue]");
  if (!bouton) return;
  const ligne = devis.lignes[Number(bouton.dataset.versCatalogue)];
  try {
    await envoyerJson("/api/catalogue", "POST", { designation: ligne.designation, unite: ligne.unite,
                                                  prix_unitaire_ht: ligne.prix_unitaire_ht });
    await chargerCatalogue();
    afficherInfosStock();
  } catch (err) {
    alert(err.message);
  }
});

function afficherLignes() {
  const corps = $("#lignes tbody");
  corps.innerHTML = "";
  infosStock = [];
  devis.lignes.forEach((ligne, i) => {
    const tr = document.createElement("tr");
    const cellule = (contenu, classe = "") => {
      const td = document.createElement("td");
      td.className = classe;
      td.append(contenu);
      tr.append(td);
    };

    const designation = champ(ligne, "designation", "text", { placeholder: "Saisissez, ou choisissez dans le catalogue ou le stock" });
    designation.setAttribute("list", "suggestions-lignes");
    const saisie = designation.oninput;
    designation.oninput = () => { saisie(); lierArticle(ligne, tr); appliquerPrestation(ligne, tr); };
    const info = document.createElement("div");
    info.className = "lien-stock";
    infosStock[i] = info;
    // Remarque imprimée sous la ligne (« fourniture comprise », « deux couches »…)
    const remarque = document.createElement("textarea");
    remarque.className = "remarque-ligne";
    remarque.rows = 1;
    remarque.placeholder = "Remarque imprimée sous la ligne (facultatif)";
    remarque.value = ligne.description || "";
    remarque.hidden = !ligne.description;
    remarque.oninput = () => { ligne.description = remarque.value; };
    const ajoutRemarque = document.createElement("button");
    ajoutRemarque.type = "button";
    ajoutRemarque.className = "lien discret ajout-remarque";
    ajoutRemarque.textContent = "+ remarque";
    ajoutRemarque.hidden = !!ligne.description;
    ajoutRemarque.onclick = () => { remarque.hidden = false; ajoutRemarque.hidden = true; remarque.focus(); };
    const blocDesignation = document.createElement("div");
    blocDesignation.append(designation, remarque, info, ajoutRemarque);
    cellule(blocDesignation, "designation");
    cellule(champ(ligne, "quantite", "number", { step: "any", min: 0 }), "num");

    const unite = document.createElement("select");
    unite.innerHTML = UNITES.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
    if (!UNITES.some(([v]) => v === ligne.unite)) unite.add(new Option(ligne.unite, ligne.unite));
    unite.value = ligne.unite;
    unite.onchange = () => (ligne.unite = unite.value);
    cellule(unite, "unite");

    cellule(champ(ligne, "prix_unitaire_ht", "number", { step: "0.01", min: 0, placeholder: "0,00" }), "num");

    const total = document.createElement("span");
    cellule(total, "total nombre");

    const suppr = document.createElement("button");
    suppr.type = "button";
    suppr.className = "suppr";
    suppr.textContent = "×";
    suppr.title = "Supprimer la ligne";
    suppr.onclick = () => {
      devis.lignes.splice(i, 1);
      if (!devis.lignes.length) devis.lignes.push(nouvelleLigne());
      afficherLignes();
    };
    cellule(suppr);

    corps.append(tr);
  });
  recalculer();
}

function ajouterLigne() {
  devis.lignes.push(nouvelleLigne());
  afficherLignes();
  $("#lignes tbody tr:last-child .designation input").focus();
}
$("#ajouter-ligne").addEventListener("click", ajouterLigne);

$("#d-tva").addEventListener("input", () => {
  devis.lignes.forEach((l) => (l.taux_tva = tauxTva()));
  recalculer();
});
for (const id of ["#d-remise", "#d-acompte"]) $(id).addEventListener("input", () => recalculer());

// --- Totaux (toujours calculés par le serveur) ----------------------------------------

function lireFormulaire() {
  devis.client = lireClient();
  devis.objet = $("#objet").value.trim();
  devis.numero = $("#d-numero").value.trim();
  devis.date = $("#d-date").value;
  devis.date_validite = $("#d-validite").value;
  devis.remise_pourcent = Number($("#d-remise").value || 0);
  devis.acompte_pourcent = Number($("#d-acompte").value || 0);
  devis.notes = $("#d-notes").value;
  devis.categorie_operation = $("#d-categorie").value;
  devis.depot_vente = $("#d-depot").checked;
}

let minuterie;
function recalculer() {
  clearTimeout(minuterie);
  minuterie = setTimeout(async () => {
    lireFormulaire();
    const t = await envoyerJson("/api/devis/calculer", "POST", devis);
    $$("#lignes tbody .total span").forEach((el, i) => (el.textContent = euros(t.lignes_ht[i] ?? 0)));
    afficherInfosStock();

    const lignes = [];
    if (t.remise) {
      lignes.push(["Total brut HT", euros(t.total_brut_ht)]);
      lignes.push([`Remise ${devis.remise_pourcent} %`, "− " + euros(t.remise)]);
    }
    lignes.push(["Total HT", euros(t.total_ht)]);
    t.tva.forEach((l) => lignes.push([`TVA ${l.taux} %`, euros(l.montant)]));
    lignes.push([entreprise.franchise_tva ? "Total à payer" : "Total TTC", euros(t.total_ttc), "fort"]);
    if (t.acompte) {
      lignes.push([`Acompte ${devis.acompte_pourcent} %`, euros(t.acompte)]);
      lignes.push(["Reste à payer", euros(t.reste_a_payer)]);
    }
    $("#totaux").innerHTML = lignes
      .map(([a, b, c]) => `<tr class="${c || ""}"><td>${a}</td><td>${b}</td></tr>`).join("");
  }, 150);
}

// --- Nouveau devis / PDF -------------------------------------------------------------

async function commencerDevis() {
  const nouveau = await apiJson("/api/devis/nouveau");
  remplirFormulaire({ ...nouveau, lignes: [] }, null);
}

// Remplit le formulaire avec un devis ; `numeroEdite` : devis enregistré que l'on modifie
function remplirFormulaire(d, numeroEdite) {
  devis = structuredClone(d);
  if (!devis.lignes.length) devis.lignes = [nouvelleLigne()];
  modeEdition = numeroEdite;
  remplirClient(devis.client || {});
  $("#objet").value = devis.objet || "";
  $("#d-remise").value = devis.remise_pourcent || "";
  $("#d-acompte").value = devis.acompte_pourcent || "";
  $("#d-notes").value = devis.notes || "";
  $("#d-categorie").value = devis.categorie_operation || "";
  $("#d-depot").checked = !!devis.depot_vente;
  $("#d-numero").value = devis.numero;
  $("#d-date").value = devis.date;
  $("#d-validite").value = devis.date_validite;
  if (d.lignes.length && !entreprise.franchise_tva) $("#d-tva").value = d.lignes[0].taux_tva;
  $("#message").textContent = "";
  afficherModeEdition();
  afficherLignes();
}

function afficherModeEdition() {
  $("#d-numero").disabled = !!modeEdition;
  $('.onglets [data-vue="nouveau"]').textContent = modeEdition ? `Modifier ${modeEdition}` : "Nouveau devis";
  $("#bandeau-edition").hidden = !modeEdition;
  $("#bandeau-edition").innerHTML = modeEdition
    ? `Modification du devis <strong>${echapper(modeEdition)}</strong> : « Télécharger le PDF » enregistre les changements
       et remplace l'ancienne version. <button type="button" class="lien" id="quitter-edition">Commencer un nouveau devis</button>`
    : "";
  $("#quitter-edition")?.addEventListener("click", commencerDevis);
}

async function modifierDevis(numero) {
  try {
    remplirFormulaire(await apiJson(`/api/devis/${encodeURIComponent(numero)}`), numero);
  } catch (err) {
    return alert(err.message);
  }
  afficherVue("nouveau");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function dupliquerDevis(numero) {
  try {
    const [source, nouveau] = await Promise.all([apiJson(`/api/devis/${encodeURIComponent(numero)}`),
                                                 apiJson("/api/devis/nouveau")]);
    remplirFormulaire({ ...source, numero: nouveau.numero, date: nouveau.date, date_validite: nouveau.date_validite,
                        statut: "en_attente", factures_liees: [], envoye_le: "" }, null);
  } catch (err) {
    return alert(err.message);
  }
  $("#message").textContent = `Copie du devis ${numero} : modifiez le client ou les prestations, puis téléchargez le PDF.`;
  $("#message").className = "message ok";
  afficherVue("nouveau");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

$("#nouveau").addEventListener("click", async () => {
  if (!confirm(modeEdition ? "Abandonner les modifications non enregistrées et commencer un nouveau devis ?"
                            : "Effacer ce devis et en commencer un nouveau ?")) return;
  await commencerDevis();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

$("#telecharger").addEventListener("click", async () => {
  lireFormulaire();
  // Les lignes laissées vides ne figurent pas sur le devis
  const lignes = devis.lignes.filter((l) => l.designation.trim() || l.prix_unitaire_ht);
  if (!lignes.length) {
    $("#lignes tbody .designation input").focus();
    return alert("Ajoutez au moins une prestation.");
  }
  if (!devis.client.nom && !confirm("Aucun nom de client n'est renseigné. Télécharger quand même ?")) return;

  const bouton = $("#telecharger");
  bouton.disabled = true;
  try {
    const blob = await (await api(`/api/devis/pdf${modeEdition ? "?modification=true" : ""}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...devis, lignes }),
    })).blob();
    const lien = document.createElement("a");
    lien.href = URL.createObjectURL(blob);
    lien.download = `${devis.numero || "devis"}.pdf`;
    lien.click();
    const numero = devis.numero;
    $("#message").innerHTML = `Devis ${echapper(numero)} ${modeEdition ? "mis à jour" : "enregistré"}.
      <button type="button" class="lien" id="envoyer-ce-devis">Envoyer par e-mail</button>`;
    $("#message").className = "message ok";
    $("#envoyer-ce-devis").onclick = () => envoyerDevis(numero);
    // Les clics suivants mettent à jour ce même devis
    modeEdition = numero;
    afficherModeEdition();
    chargerHistorique();
    chargerClients();
    chargerArticles();
  } catch (err) {
    alert(err.message);
  } finally {
    bouton.disabled = false;
  }
});

// --- Historique ----------------------------------------------------------------------

let historiqueDevis = [];
const filtreDevis = { statut: "", q: "" };

// Texte dans lequel la recherche cherche : n°, client, objet, date, montant (« 1 250 » comme « 1250 »)
const sansAccents = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const texteRecherche = (d) => sansAccents([d.numero, d.client, d.objet, dateFr(d.date), euros(d.total_ttc),
  String(d.total_ttc), d.commande_client, STATUTS.find(([v]) => v === d.statut)?.[1] || "", ...d.factures.map((f) => f.numero)].join(" "))
  .replace(/[\s ]/g, "");

async function chargerHistorique() {
  historiqueDevis = await apiJson("/api/devis");
  $("#nb-devis").textContent = historiqueDevis.length || "";
  afficherHistorique();
}

function afficherHistorique() {
  const mots = sansAccents(filtreDevis.q).split(/\s+/).filter(Boolean);
  const liste = historiqueDevis.filter((d) => (!filtreDevis.statut || d.statut === filtreDevis.statut)
    && mots.every((m) => texteRecherche(d).includes(m)));
  $("#historique tbody").innerHTML = liste.map((d, i) => {
    const pdf = `/api/devis/${encodeURIComponent(d.numero)}/pdf`;
    // Une action principale selon l'état du devis ; les autres dans le menu « ⋯ »
    const principale = d.statut === "accepte" && d.depot_vente ? "releve"
      : d.statut === "accepte" && !d.facture_finale ? "facturer"
      : d.statut === "en_attente" && !d.envoye_le ? "envoyer" : "ouvrir";
    const bouton = { facturer: `<button type="button" class="bouton petit" data-facturer>Facturer</button>`,
                     releve: `<a class="bouton petit" href="stock.html?releve=${encodeURIComponent(d.client)}"
                       title="Dépôt-vente : on facture les exemplaires vendus, après le relevé de ventes">Relevé de ventes</a>`,
                     envoyer: `<button type="button" class="bouton petit" data-envoyer>Envoyer</button>`,
                     ouvrir: `<a class="bouton secondaire petit" target="_blank" href="${pdf}">Ouvrir</a>` }[principale];
    const menu = [
      principale !== "ouvrir" && `<a target="_blank" href="${pdf}">Ouvrir le PDF</a>`,
      principale !== "envoyer" && `<button type="button" data-envoyer>${d.envoye_le ? "Envoyer à nouveau" : "Envoyer par e-mail"}</button>`,
      d.modifiable && `<button type="button" data-modifier>Modifier</button>`,
      `<button type="button" data-dupliquer>Dupliquer</button>`,
      d.statut === "accepte" && `<button type="button" data-devis-signe>${d.signe ? "Devis signé…" : "Joindre le devis signé"}</button>`,
      d.statut === "accepte" && `<button type="button" data-commande-client>Bon de commande du client</button>`,
      `<button type="button" data-photos>Photos${d.photos ? ` (${d.photos})` : ""}</button>`,
      `<hr><button type="button" class="danger" data-supprimer>Supprimer</button>`,
    ].filter(Boolean).join("");
    // Documents liés, sous le client (comme la page Factures)
    const documents = [
      d.envoye_le ? `envoyé le ${dateFr(d.envoye_le)}` : "",
      ...d.factures.map((f) => `<a class="lien" target="_blank" href="/api/factures/${f.id}/fichier"
          title="${NATURES[f.nature]} · ${euros(f.montant_ttc)}">${echapper(f.numero)}</a>`),
      d.commande_client || d.commande_fichier ? lienCommandeClient(d) : "",
      d.signe ? `<a class="lien" target="_blank" href="${urlDevisSigne(d.numero)}/fichier"
          title="Signé${d.signe_le ? " le " + dateFr(d.signe_le) : ""}">devis signé</a>` : "",
    ].filter(Boolean);
    return `
    <tr data-numero="${echapper(d.numero)}">
      <td><strong>${echapper(d.numero)}</strong><div class="secondaire">${dateFr(d.date)}</div></td>
      <td><strong>${echapper(d.client)}</strong>
        ${d.objet || d.depot_vente ? `<div class="secondaire">${d.depot_vente ? "<strong>Dépôt-vente</strong>" : ""}${d.objet && d.depot_vente ? " · " : ""}${echapper(d.objet)}</div>` : ""}
        ${documents.length ? `<div class="secondaire documents-devis">${documents.join(" · ")}</div>` : ""}</td>
      <td class="droite nombre"><strong>${euros(d.total_ttc)}</strong></td>
      <td><select data-statut class="choix-statut">
        ${STATUTS.map(([v, l]) => `<option value="${v}" ${v === d.statut ? "selected" : ""}>${l}</option>`).join("")}
      </select></td>
      <td class="actions-devis"><span class="actions fin">${bouton}
        <button type="button" class="bouton secondaire petit plus-actions" popovertarget="menu-devis-${i}"
          style="anchor-name: --menu-devis-${i}" title="Autres actions" aria-label="Autres actions">⋯</button>
        <div popover id="menu-devis-${i}" class="menu-actions" style="position-anchor: --menu-devis-${i}">${menu}</div></span></td>
    </tr>`;
  }).join("");
  $("#historique").hidden = !liste.length;
  $("#historique-vide").hidden = !!liste.length;
  $("#historique-vide").textContent = historiqueDevis.length
    ? "Aucun devis ne correspond à la recherche." : "Aucun devis enregistré pour le moment.";
}

$("#recherche-devis").addEventListener("input", (e) => { filtreDevis.q = e.target.value.trim(); afficherHistorique(); });
$$("#filtre-statut-devis button").forEach((b) => b.addEventListener("click", () => {
  filtreDevis.statut = b.dataset.statut;
  $$("#filtre-statut-devis button").forEach((x) => x.classList.toggle("actif", x === b));
  afficherHistorique();
}));

// --- Bon de commande du client : n° (repris sur les factures) et document joint -------------------

const urlCommandeClient = (numero) => `/api/devis/${encodeURIComponent(numero)}/commande-client`;

function lienCommandeClient(d) {
  const libelle = `Cde ${echapper(d.commande_client || "client")}`;
  return d.commande_fichier
    ? `<a class="lien" target="_blank" href="${urlCommandeClient(d.numero)}/fichier" title="Bon de commande du client">${libelle}</a>`
    : `<span class="secondaire" title="N° de commande du client">${libelle}</span>`;
}

// Champs « n° + document » communs à la fenêtre Facturer et à la fenêtre Bon de commande
function remplirCommandeClient(form, d) {
  form.elements.commande_client.value = d.commande_client || "";
  form.elements.commande_fichier.value = "";
  const jointe = form.querySelector("[data-commande-jointe]");
  jointe.hidden = !d.commande_fichier;
  jointe.innerHTML = d.commande_fichier ? `Document joint : <a class="lien" target="_blank"
    href="${urlCommandeClient(d.numero)}/fichier">ouvrir</a> · <button type="button" class="lien discret"
    data-retirer-commande>retirer</button> <span class="secondaire">(un nouveau document le remplace)</span>` : "";
}

async function enregistrerCommandeClient(form, d) {
  const fichier = form.elements.commande_fichier.files[0];
  const numeroCommande = form.elements.commande_client.value.trim();
  if (!fichier && numeroCommande === (d.commande_client || "")) return;
  const donnees = new FormData();
  donnees.append("numero_commande", numeroCommande);
  if (fichier) donnees.append("fichier", fichier);
  await apiJson(urlCommandeClient(d.numero), { method: "POST", body: donnees });
}

async function retirerCommandeClient(e, form) {
  if (!e.target.closest("[data-retirer-commande]")) return;
  const d = form === formFacturer ? devisAFacturer : devisCommande;
  if (!confirm("Retirer le document du bon de commande ? (le n° de commande est conservé)")) return;
  await apiJson(`${urlCommandeClient(d.numero)}/fichier`, { method: "DELETE" });
  await chargerHistorique();
  const maj = historiqueDevis.find((x) => x.numero === d.numero);
  if (form === formFacturer) devisAFacturer = maj; else devisCommande = maj;
  remplirCommandeClient(form, maj);
}

const formCommande = $("#form-commande-client");
let devisCommande = null;

function saisirCommandeClient(numero) {
  devisCommande = historiqueDevis.find((x) => x.numero === numero);
  $("#titre-commande-client").textContent = `Bon de commande du client · devis ${numero}`;
  $("#erreur-commande-client").textContent = "";
  remplirCommandeClient(formCommande, devisCommande);
  $("#fenetre-commande-client").showModal();
}

formCommande.addEventListener("click", (e) => retirerCommandeClient(e, formCommande));
formCommande.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await enregistrerCommandeClient(formCommande, devisCommande);
    $("#fenetre-commande-client").close();
    await chargerHistorique();
  } catch (err) {
    $("#erreur-commande-client").textContent = err.message;
  }
});
$$("#fenetre-commande-client [data-fermer]").forEach((b) => b.addEventListener("click", () => $("#fenetre-commande-client").close()));

// Facture client établie à partir d'un devis accepté : PDF + enregistrement dans les factures
const NATURES = { facture: "Facture", acompte: "Facture d'acompte", solde: "Facture de solde" };
const formFacturer = $("#form-facturer");
let devisAFacturer = null;

function facturer(numero) {
  const d = historiqueDevis.find((x) => x.numero === numero);
  devisAFacturer = d;
  const acomptes = d.factures.filter((f) => f.nature === "acompte");
  formFacturer.reset();
  formFacturer.elements.pourcent.value = d.acompte_pourcent || 30;
  formFacturer.elements.date_execution.value = aujourdhui();
  const echeance = new Date();
  echeance.setDate(echeance.getDate() + Number(entrepriseFacturation?.delai_paiement_jours || 0));
  formFacturer.elements.date_echeance.value = dateIso(echeance);
  formFacturer.elements.date_echeance.min = aujourdhui();
  $("#titre-facturer").textContent = `Facturer le devis ${d.numero}`;
  $("#facturer-resume").innerHTML = [
    ["Montant du devis", euros(d.total_ttc)],
    ...acomptes.map((f) => [`Acompte ${echapper(f.numero)}`, "− " + euros(f.montant_ttc)]),
    ["Reste à facturer", euros(d.reste_a_facturer), "fort"],
  ].map(([a, b, c]) => `<tr class="${c || ""}"><td>${a}</td><td>${b}</td></tr>`).join("");
  $("#libelle-finale").textContent = acomptes.length
    ? `Facture de solde (${euros(d.reste_a_facturer)}, acomptes déduits)` : `Facture totale (${euros(d.total_ttc)})`;
  $("#erreur-facturer").textContent = "";
  remplirCommandeClient(formFacturer, d);
  majMontantAcompte();
  $("#fenetre-facturer").showModal();
}

function majMontantAcompte() {
  const pct = Number(formFacturer.elements.pourcent.value || 0);
  $("#montant-acompte").textContent = pct ? `soit ${euros(devisAFacturer.total_ttc * pct / 100)}` : "";
}
formFacturer.elements.pourcent.addEventListener("input", () => {
  formFacturer.elements.type.value = "acompte";
  majMontantAcompte();
});

formFacturer.addEventListener("submit", async (e) => {
  e.preventDefault();
  const demande = { type: formFacturer.elements.type.value, pourcent: Number(formFacturer.elements.pourcent.value || 0),
                    date_execution: formFacturer.elements.date_execution.value,
                    date_echeance: formFacturer.elements.date_echeance.value,
                    commande_client: formFacturer.elements.commande_client.value.trim() };
  // Qonto relié : la facture part par Qonto (proposé juste après) ; sinon on ouvre son PDF.
  // Fenêtre du PDF ouverte tout de suite (sinon bloquée comme fenêtre surgissante), remplie ensuite
  const qonto = await apiJson("/api/plateforme/qonto").catch(() => null);
  const fenetre = qonto?.relie ? null : window.open("", "_blank");
  try {
    await enregistrerCommandeClient(formFacturer, devisAFacturer);
    const facture = await envoyerJson(`/api/devis/${encodeURIComponent(devisAFacturer.numero)}/facture`, "POST", demande);
    if (fenetre) fenetre.location = `/api/factures/${facture.id}/fichier`;
    $("#fenetre-facturer").close();
    if (qonto?.relie) proposerEnvoiQonto(facture);
    await chargerHistorique();
    $("#message-historique").innerHTML = `${NATURES[facture.nature]} <strong>${echapper(facture.numero)}</strong> créée
      (${euros(facture.montant_ttc)}, échéance le ${dateFr(facture.date_echeance)}). Elle figure dans
      <a href="factures.html?espace=clients">Clients &gt; Factures</a>.`;
    $("#message-historique").hidden = false;
  } catch (err) {
    fenetre?.close();
    $("#erreur-facturer").textContent = err.message;
  }
});
formFacturer.addEventListener("click", (e) => retirerCommandeClient(e, formFacturer));

// Délai de paiement par défaut (Paramètres > Entreprise)
let entrepriseFacturation = null;
apiJson("/api/entreprise").then((e) => (entrepriseFacturation = e)).catch(() => {});

// Facture créée : on propose de l'envoyer tout de suite par Qonto (même facture, émise par Qonto)
let factureAEnvoyer = null;
function proposerEnvoiQonto(facture) {
  factureAEnvoyer = facture;
  $("#titre-envoi-qonto").textContent = `${NATURES[facture.nature]} ${facture.numero} créée`;
  $("#liste-envoi-qonto").innerHTML = `<li><strong>${echapper(facture.numero)}</strong><span>${echapper(facture.tiers)}</span>
    <span class="nombre">${euros(facture.montant_ttc)}</span></li>`;
  $("#aide-envoi-qonto").textContent = `Qonto émet la même facture (échéance le ${dateFr(facture.date_echeance)}) et l'envoie `
    + (facture.client_pro ? "à la plateforme de votre client (facture électronique)." : "à votre client par e-mail (copie pour vous).")
    + " Une fois émise, elle ne peut plus être modifiée, seulement annulée par un avoir.";
  const message = $("#message-envoi-qonto");
  message.textContent = "";
  message.className = "message";
  Object.assign($("#envoyer-qonto-devis"), { hidden: false, disabled: false });
  $("#plus-tard-qonto").textContent = "Plus tard";
  $("#fenetre-envoi-qonto").showModal();
}
$("#envoyer-qonto-devis").addEventListener("click", async () => {
  const bouton = $("#envoyer-qonto-devis");
  const message = $("#message-envoi-qonto");
  bouton.disabled = true;
  message.className = "message";
  message.textContent = "Envoi en cours…";
  try {
    const [r] = (await envoyerJson("/api/plateforme/qonto/envoyer", "POST", { ids: [factureAEnvoyer.id] })).resultats;
    message.className = `message ${r.ok ? "ok" : "erreur"}`;
    message.textContent = r.ok ? "Envoyée à Qonto. Suivez sa réception dans Ventes > Facture électronique."
      : `${r.message} Elle reste dans Facture électronique > À régler.`;
    bouton.hidden = r.ok;
    $("#plus-tard-qonto").textContent = "Fermer";
  } catch (err) {
    message.className = "message erreur";
    message.textContent = err.message;
  } finally {
    bouton.disabled = false;
  }
});
$$("#fenetre-envoi-qonto [data-fermer]").forEach((b) => b.addEventListener("click", () => $("#fenetre-envoi-qonto").close()));
$$("#fenetre-facturer [data-fermer]").forEach((b) => b.addEventListener("click", () => $("#fenetre-facturer").close()));

$("#historique tbody").addEventListener("change", async (e) => {
  if (!e.target.matches("[data-statut]")) return;
  const numero = e.target.closest("tr").dataset.numero;
  try {
    const r = await envoyerJson(`/api/devis/${encodeURIComponent(numero)}/statut`, "POST", { statut: e.target.value });
    if (r.avertissements.length) alert(r.avertissements.join("\n"));
  } catch (err) {
    alert(err.message);
  }
  await Promise.all([chargerHistorique(), chargerArticles()]);
  // Devis accepté : on propose aussitôt de joindre le devis signé par le client
  const d = historiqueDevis.find((x) => x.numero === numero);
  if (d?.statut === "accepte" && !d.signe) ouvrirDevisSigne(numero);
});

// --- Devis signé par le client ------------------------------------------------------------------

const urlDevisSigne = (numero) => `/api/devis/${encodeURIComponent(numero)}/signe`;
const formSigne = $("#form-devis-signe");
let devisSigne = null;

function ouvrirDevisSigne(numero) {
  const d = historiqueDevis.find((x) => x.numero === numero);
  devisSigne = numero;
  formSigne.reset();
  formSigne.elements.signe_le.value = aujourdhui();
  $("#titre-devis-signe").textContent = `Devis ${numero} accepté : devis signé`;
  $("#erreur-devis-signe").textContent = "";
  const joint = $("#devis-signe-joint");
  joint.hidden = !d?.signe;
  joint.innerHTML = d?.signe ? `Déjà joint${d.signe_le ? `, signé le ${dateFr(d.signe_le)}` : ""} :
    <a class="lien" target="_blank" href="${urlDevisSigne(numero)}/fichier">ouvrir</a> ·
    <button type="button" class="lien discret" data-retirer-signe>retirer</button>. Un nouveau fichier le remplace.` : "";
  $("#fenetre-devis-signe").showModal();
}

formSigne.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fichier = formSigne.elements.fichier.files[0];
  if (!fichier) return ($("#erreur-devis-signe").textContent = "Choisissez le fichier du devis signé.");
  const donnees = new FormData();
  donnees.append("fichier", fichier);
  donnees.append("signe_le", formSigne.elements.signe_le.value);
  try {
    await api(urlDevisSigne(devisSigne), { method: "POST", body: donnees });
  } catch (err) {
    return ($("#erreur-devis-signe").textContent = err.message);
  }
  $("#fenetre-devis-signe").close();
  chargerHistorique();
});
formSigne.addEventListener("click", async (e) => {
  if (!e.target.closest("[data-retirer-signe]")) return;
  if (!confirm("Retirer le devis signé joint ?")) return;
  await api(urlDevisSigne(devisSigne), { method: "DELETE" });
  $("#fenetre-devis-signe").close();
  chargerHistorique();
});
$$("#fenetre-devis-signe [data-fermer]").forEach((b) => b.addEventListener("click", () => $("#fenetre-devis-signe").close()));

$("#historique tbody").addEventListener("click", async (e) => {
  // Une action choisie dans le menu « ⋯ » referme le menu
  const menu = e.target.closest(".menu-actions");
  if (menu && e.target.closest("a, button")) menu.hidePopover();
  if (e.target.closest("[data-facturer]")) return facturer(e.target.closest("tr").dataset.numero);
  if (e.target.closest("[data-commande-client]")) return saisirCommandeClient(e.target.closest("tr").dataset.numero);
  if (e.target.closest("[data-devis-signe]")) return ouvrirDevisSigne(e.target.closest("tr").dataset.numero);
  if (e.target.closest("[data-envoyer]")) return envoyerDevis(e.target.closest("tr").dataset.numero);
  if (e.target.closest("[data-modifier]")) return modifierDevis(e.target.closest("tr").dataset.numero);
  if (e.target.closest("[data-dupliquer]")) return dupliquerDevis(e.target.closest("tr").dataset.numero);
  if (e.target.closest("[data-photos]")) {
    const numero = e.target.closest("tr").dataset.numero;
    return ouvrirPhotos({ type: "devis", cible: numero, titre: `Photos du devis ${numero}`, apresChangement: chargerHistorique });
  }
  if (!e.target.closest("[data-supprimer]")) return;
  const numero = e.target.closest("tr").dataset.numero;
  const accepte = e.target.closest("tr").querySelector("[data-statut]").value === "accepte";
  if (!confirm(`Supprimer définitivement le devis ${numero} et son PDF ?`
               + (accepte ? "\n\nLes articles du stock qu'il contient y seront remis." : ""))) return;
  try {
    await api(`/api/devis/${encodeURIComponent(numero)}`, { method: "DELETE" });
    if (modeEdition === numero) await commencerDevis();
    await Promise.all([chargerHistorique(), chargerClients(), chargerArticles()]);
  } catch (err) {
    alert(err.message);
  }
});

// --- Envoi par e-mail ------------------------------------------------------------------

function envoyerDevis(numero) {
  ouvrirEnvoi({ titre: `Envoyer le devis ${numero}`, modele: `/api/devis/${encodeURIComponent(numero)}/envoi`,
                marquer: `/api/devis/${encodeURIComponent(numero)}/envoye`, apresEnvoi: chargerHistorique });
}

// --- Catalogue de prestations --------------------------------------------------------------

const formPrestation = $("#form-prestation");
let prestationEditee = null;

async function chargerCatalogue() {
  [catalogue, ouvrages] = await Promise.all([apiJson("/api/catalogue"), apiJson("/api/catalogue/ouvrages")]);
  $("#nb-catalogue").textContent = (catalogue.length + ouvrages.length) || "";
  afficherCatalogue();
  afficherOuvrages();
  afficherSuggestions();
}

// --- Groupes de lignes (« ouvrages types ») ---------------------------------------------------------------------------

let ouvrages = [];
let ouvrageEdite = null;
let lignesOuvrage = [];
const formOuvrage = $("#form-ouvrage");
const totalOuvrage = (o) => o.lignes.reduce((s, l) => s + l.quantite * l.prix_unitaire_ht, 0);

function afficherOuvrages() {
  $("#table-ouvrages tbody").innerHTML = ouvrages.map((o) => `
    <tr class="cliquable" data-id="${o.id}">
      <td><strong>${echapper(o.nom)}</strong></td>
      <td class="secondaire">${o.lignes.map((l) => echapper(l.designation)).join(" · ")}</td>
      <td class="droite nombre">${euros(totalOuvrage(o))}</td>
    </tr>`).join("");
  $("#table-ouvrages").hidden = !ouvrages.length;
  $("#ouvrages-vide").hidden = !!ouvrages.length;
}

function ouvrirOuvrage(ouvrage = null, lignes = null) {
  ouvrageEdite = ouvrage;
  formOuvrage.reset();
  formOuvrage.elements.nom.value = ouvrage?.nom || "";
  formOuvrage.elements.notes.value = ouvrage?.notes || "";
  lignesOuvrage = structuredClone(lignes || ouvrage?.lignes || [{ designation: "", quantite: 1, unite: "u", prix_unitaire_ht: 0 }]);
  $("#titre-ouvrage").textContent = ouvrage ? "Modifier le groupe de lignes" : "Nouveau groupe de lignes";
  $("#supprimer-ouvrage").hidden = !ouvrage;
  $("#erreur-ouvrage").textContent = "";
  afficherLignesOuvrage();
  $("#fenetre-ouvrage").showModal();
  formOuvrage.elements.nom.focus();
}

function afficherLignesOuvrage() {
  const options = (u) => {
    const liste = UNITES.some(([v]) => v === u) ? UNITES : [...UNITES, [u, u]];
    return liste.map(([v, l]) => `<option value="${echapper(v)}" ${v === u ? "selected" : ""}>${echapper(l)}</option>`).join("");
  };
  $("#lignes-ouvrage tbody").innerHTML = lignesOuvrage.map((l, i) => `<tr data-i="${i}">
    <td><input data-champ="designation" list="suggestions-lignes" value="${echapper(l.designation)}" placeholder="Prestation ou article"></td>
    <td><input data-champ="quantite" type="number" step="any" min="0" value="${l.quantite}"></td>
    <td><select data-champ="unite">${options(l.unite)}</select></td>
    <td><input data-champ="prix_unitaire_ht" type="number" step="0.01" value="${l.prix_unitaire_ht || ""}" placeholder="0,00"></td>
    <td><button type="button" class="lien discret" data-retirer title="Retirer">×</button></td>
  </tr>`).join("");
  $("#total-ouvrage").textContent = `Total : ${euros(totalOuvrage({ lignes: lignesOuvrage }))} HT`;
}

$("#lignes-ouvrage").addEventListener("input", (e) => {
  const tr = e.target.closest("tr[data-i]");
  if (!tr) return;
  const ligne = lignesOuvrage[tr.dataset.i];
  const champ = e.target.dataset.champ;
  ligne[champ] = ["quantite", "prix_unitaire_ht"].includes(champ) ? Number(e.target.value || 0) : e.target.value;
  if (champ === "designation") {  // prestation du catalogue ou article du stock : prix et unité repris
    const nom = e.target.value.trim().toLowerCase();
    const p = catalogue.find((x) => x.designation.toLowerCase() === nom);
    const a = articlesStock.find((x) => x.nom.toLowerCase() === nom);
    if (p || a) {
      ligne.unite = p ? p.unite : a.unite;
      if (!ligne.prix_unitaire_ht) ligne.prix_unitaire_ht = p ? p.prix_unitaire_ht : a.prix_vente_ht;
      afficherLignesOuvrage();
      $(`#lignes-ouvrage tr[data-i="${tr.dataset.i}"] [data-champ="quantite"]`).focus();
      return;
    }
  }
  $("#total-ouvrage").textContent = `Total : ${euros(totalOuvrage({ lignes: lignesOuvrage }))} HT`;
});
$("#lignes-ouvrage").addEventListener("change", (e) => {
  if (e.target.dataset.champ === "unite") lignesOuvrage[e.target.closest("tr").dataset.i].unite = e.target.value;
});
$("#lignes-ouvrage").addEventListener("click", (e) => {
  if (!e.target.closest("[data-retirer]")) return;
  lignesOuvrage.splice(Number(e.target.closest("tr").dataset.i), 1);
  if (!lignesOuvrage.length) lignesOuvrage.push({ designation: "", quantite: 1, unite: "u", prix_unitaire_ht: 0 });
  afficherLignesOuvrage();
});
$("#ajouter-ligne-ouvrage").addEventListener("click", () => {
  lignesOuvrage.push({ designation: "", quantite: 1, unite: "u", prix_unitaire_ht: 0 });
  afficherLignesOuvrage();
  $("#lignes-ouvrage tbody tr:last-child input").focus();
});

formOuvrage.addEventListener("submit", async (e) => {
  e.preventDefault();
  const donnees = { nom: formOuvrage.elements.nom.value.trim(), notes: formOuvrage.elements.notes.value,
                    lignes: lignesOuvrage.filter((l) => l.designation.trim()) };
  try {
    await envoyerJson(ouvrageEdite ? `/api/catalogue/ouvrages/${ouvrageEdite.id}` : "/api/catalogue/ouvrages",
                      ouvrageEdite ? "PUT" : "POST", donnees);
  } catch (err) {
    $("#erreur-ouvrage").textContent = err.message;
    return;
  }
  $("#fenetre-ouvrage").close();
  await chargerCatalogue();
});

$("#supprimer-ouvrage").addEventListener("click", async () => {
  if (!confirm(`Supprimer le groupe de lignes « ${ouvrageEdite.nom} » ? Les devis existants ne changent pas.`)) return;
  await api(`/api/catalogue/ouvrages/${ouvrageEdite.id}`, { method: "DELETE" });
  $("#fenetre-ouvrage").close();
  await chargerCatalogue();
});

$("#ajouter-ouvrage").addEventListener("click", () => ouvrirOuvrage());
$("#table-ouvrages tbody").addEventListener("click", (e) => {
  const tr = e.target.closest("tr");
  if (tr) ouvrirOuvrage(ouvrages.find((o) => o.id === tr.dataset.id));
});
$$("[data-fermer-ouvrage]").forEach((b) => b.addEventListener("click", () => $("#fenetre-ouvrage").close()));

// Lignes du devis en cours -> nouveau groupe de lignes (« ouvrage type »)
$("#lignes-vers-ouvrage").addEventListener("click", () => {
  const lignes = devis.lignes.filter((l) => l.designation.trim())
    .map((l) => ({ designation: l.designation, quantite: l.quantite, unite: l.unite, prix_unitaire_ht: l.prix_unitaire_ht }));
  if (!lignes.length) return alert("Saisissez d'abord des lignes dans le devis.");
  ouvrirOuvrage(null, lignes);
  formOuvrage.elements.nom.value = $("#objet").value.trim();
});

// Insertion d'un groupe de lignes dans le devis
function afficherChoixOuvrages() {
  const q = $("#recherche-ouvrage").value.trim().toLowerCase();
  const visibles = ouvrages.filter((o) => !q || o.nom.toLowerCase().includes(q));
  $("#liste-choix-ouvrages").innerHTML = visibles.length ? visibles.map((o) => `
    <button type="button" class="choix" data-id="${o.id}"><strong>${echapper(o.nom)}</strong>
      <span>${pluriel(o.lignes.length, "ligne")} · ${euros(totalOuvrage(o))} HT</span></button>`).join("")
    : `<p class="aide">${ouvrages.length ? "Aucun groupe ne correspond." : "Aucun groupe de lignes : créez-en dans l'onglet Catalogue."}</p>`;
}
$("#inserer-ouvrage").addEventListener("click", () => {
  $("#recherche-ouvrage").value = "";
  afficherChoixOuvrages();
  $("#fenetre-choix-ouvrage").showModal();
  $("#recherche-ouvrage").focus();
});
$("#recherche-ouvrage").addEventListener("input", afficherChoixOuvrages);
$("#liste-choix-ouvrages").addEventListener("click", (e) => {
  const bouton = e.target.closest("[data-id]");
  if (!bouton) return;
  const ouvrage = ouvrages.find((o) => o.id === bouton.dataset.id);
  // Les lignes vides en fin de devis sont remplacées
  while (devis.lignes.length && !devis.lignes.at(-1).designation.trim() && !devis.lignes.at(-1).prix_unitaire_ht) devis.lignes.pop();
  for (const l of ouvrage.lignes) {
    const article = articlesStock.find((a) => a.nom.toLowerCase() === l.designation.toLowerCase());
    devis.lignes.push({ ...nouvelleLigne(), designation: l.designation, quantite: l.quantite, unite: l.unite,
                        prix_unitaire_ht: l.prix_unitaire_ht, article_id: article ? article.id : "" });
  }
  $("#fenetre-choix-ouvrage").close();
  afficherLignes();
});
$$("[data-fermer-choix]").forEach((b) => b.addEventListener("click", () => $("#fenetre-choix-ouvrage").close()));

function afficherCatalogue() {
  const q = $("#recherche-catalogue").value.trim().toLowerCase();
  const visibles = catalogue.filter((p) => !q || `${p.designation} ${p.notes}`.toLowerCase().includes(q));
  $("#table-catalogue tbody").innerHTML = visibles.map((p) => `
    <tr class="cliquable" data-id="${p.id}">
      <td><strong>${echapper(p.designation)}</strong></td>
      <td>${echapper(p.unite)}</td>
      <td class="droite nombre">${euros(p.prix_unitaire_ht)}</td>
      <td class="secondaire">${echapper(p.notes)}</td>
    </tr>`).join("");
  $("#table-catalogue").hidden = !visibles.length;
  $("#catalogue-vide").hidden = !!visibles.length;
  $("#catalogue-vide").textContent = q ? "Aucune prestation ne correspond à la recherche."
    : "Catalogue vide. Ajoutez vos prestations habituelles (main-d'œuvre, forfaits, déplacement…), "
      + "ou cliquez sur « Enregistrer dans le catalogue » sous une ligne de devis.";
}

function ouvrirPrestation(prestation = null) {
  prestationEditee = prestation;
  formPrestation.reset();
  formPrestation.elements.unite.innerHTML = UNITES.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
  const unite = prestation?.unite || "u";
  if (!UNITES.some(([v]) => v === unite)) formPrestation.elements.unite.add(new Option(unite, unite));
  formPrestation.elements.designation.value = prestation?.designation || "";
  formPrestation.elements.unite.value = unite;
  formPrestation.elements.prix_unitaire_ht.value = prestation ? prestation.prix_unitaire_ht : "";
  formPrestation.elements.notes.value = prestation?.notes || "";
  $("#titre-prestation").textContent = prestation ? "Modifier la prestation" : "Nouvelle prestation";
  $("#supprimer-prestation").hidden = !prestation;
  $("#erreur-prestation").textContent = "";
  $("#fenetre-prestation").showModal();
  formPrestation.elements.designation.focus();
}

formPrestation.addEventListener("submit", async (e) => {
  e.preventDefault();
  const v = formPrestation.elements;
  if (!v.designation.value.trim()) return v.designation.reportValidity();
  const donnees = { designation: v.designation.value.trim(), unite: v.unite.value,
                    prix_unitaire_ht: Number(v.prix_unitaire_ht.value || 0), notes: v.notes.value };
  try {
    await envoyerJson(prestationEditee ? `/api/catalogue/${prestationEditee.id}` : "/api/catalogue",
                      prestationEditee ? "PUT" : "POST", donnees);
  } catch (err) {
    $("#erreur-prestation").textContent = err.message;
    return;
  }
  $("#fenetre-prestation").close();
  await chargerCatalogue();
  afficherInfosStock();
});

$("#supprimer-prestation").addEventListener("click", async () => {
  if (!confirm(`Retirer « ${prestationEditee.designation} » du catalogue ? Les devis existants ne changent pas.`)) return;
  await api(`/api/catalogue/${prestationEditee.id}`, { method: "DELETE" });
  $("#fenetre-prestation").close();
  await chargerCatalogue();
  afficherInfosStock();
});

$("#ajouter-prestation").addEventListener("click", () => ouvrirPrestation());
$("#recherche-catalogue").addEventListener("input", afficherCatalogue);
$("#table-catalogue tbody").addEventListener("click", (e) => {
  const tr = e.target.closest("tr");
  if (tr) ouvrirPrestation(catalogue.find((p) => p.id === tr.dataset.id));
});
$$("[data-fermer-prestation]").forEach((b) => b.addEventListener("click", () => $("#fenetre-prestation").close()));

(async () => {
  await initialiserPage();
  $("#carte-total").classList.toggle("sans-tva", !!entreprise.franchise_tva);
  $("#d-tva").value = entreprise.taux_tva_defaut;
  await Promise.all([chargerArticles(), chargerCatalogue()]);
  await Promise.all([commencerDevis(), chargerHistorique(), chargerClients()]);
  // Facture des ventes d'un dépôt, préparée depuis le relevé (Stock) : le stock est déjà à jour,
  // les lignes ne sont donc pas reliées aux articles
  let prerempli = null;
  try { prerempli = parametre("prerempli") && JSON.parse(sessionStorage.getItem("devisPrerempli") || "null"); } catch {}
  if (prerempli) {
    sessionStorage.removeItem("devisPrerempli");
    const nouveau = await apiJson("/api/devis/nouveau");
    remplirFormulaire({ ...nouveau, client: prerempli.client, objet: prerempli.objet,
      lignes: prerempli.lignes.map((l) => ({ ...nouvelleLigne(), ...l, article_id: "" })) }, null);
    $("#message").textContent = "Lignes reprises du relevé de ventes : ajoutez la remise du client, "
      + "téléchargez le PDF, puis passez-le à « Accepté » pour le facturer.";
  }
  // Liens de la recherche globale
  if (parametre("devis")) {
    afficherVue("historique");
    surlignerLigne($$("#historique tbody tr").find((tr) => tr.dataset.numero === parametre("devis")));
  } else if (parametre("vue") === "catalogue") {
    afficherVue("catalogue");
    const prestation = catalogue.find((p) => p.id === parametre("prestation"));
    if (prestation) ouvrirPrestation(prestation);
  }
})();
