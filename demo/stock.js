// Stock : articles, entrées et sorties manuelles, historique des mouvements.

const UNITES_STOCK = [["u", "unité"], ["ex.", "exemplaire"], ["m²", "m²"], ["ml", "ml"], ["m³", "m³"], ["kg", "kg"],
                      ["l", "litre"], ["lot", "lot"], ["boîte", "boîte"], ["rouleau", "rouleau"], ["sac", "sac"]];

let articles = [];
const filtre = { alerte: false, q: "" };
let articleEdite = null;      // article ouvert dans la fiche
let mouvement = null;         // { article, sens }

const aRecommander = (a) => a.alerte || a.manque > 0;

// Code affiché sous le nom : ISBN, sinon EAN, sinon l'ancienne référence
const codeArticle = (a) => a.isbn ? `ISBN ${a.isbn}` : a.ean ? `EAN ${a.ean}` : a.reference ? `Réf. ${a.reference}` : "";
const quantite = (n, unite) => `${Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 3 })} ${unite}`;

// --- Liste ---------------------------------------------------------------------------

async function charger() {
  articles = await apiJson("/api/stock");
  const alertes = articles.filter(aRecommander);
  $("#r-articles").textContent = articles.length;
  const reserves = articles.filter((a) => a.reserve > 0).length;
  $("#r-unites").textContent = reserves ? `dont ${reserves} réservé${reserves > 1 ? "s" : ""} dans des devis en attente` : "Aucune réservation en cours";
  $("#r-valeur").textContent = euros(articles.reduce((s, a) => s + Math.max(a.quantite, 0) * a.prix_achat_ht, 0));
  $("#r-alertes").textContent = alertes.length;
  $("#r-alertes-detail").textContent = alertes.length ? alertes.slice(0, 3).map((a) => a.nom).join(", ") + (alertes.length > 3 ? "…" : "") : "Aucun article sous son seuil";
  $("#r-alertes-detail").classList.toggle("rouge", alertes.length > 0);
  afficherListe();
}

function afficherListe() {
  const q = filtre.q.toLowerCase();
  const visibles = articles.filter((a) => (!filtre.alerte || aRecommander(a))
    && (!q || `${a.nom} ${a.reference} ${a.isbn} ${a.ean} ${a.isbn.replace(/-/g, "")}`.toLowerCase().includes(q)));

  $("#table-stock tbody").innerHTML = visibles.map((a) => `
    <tr class="cliquable" data-id="${a.id}">
      <td><strong>${echapper(a.nom)}</strong>${codeArticle(a) ? `<div class="secondaire">${echapper(codeArticle(a))}</div>` : ""}</td>
      <td class="droite nombre">${a.alerte ? `<span class="statut retard">${quantite(a.quantite, a.unite)}</span>` : quantite(a.quantite, a.unite)}
        ${a.en_depot ? `<div class="secondaire" style="font-size: 12px">dont ${quantite(a.en_depot, a.unite)} en dépôt</div>` : ""}</td>
      <td class="droite nombre secondaire">${a.reserve ? quantite(a.reserve, a.unite) : "—"}
        ${a.manque > 0 ? `<div class="rouge" style="font-size: 12px">il en manque ${quantite(a.manque, a.unite)}</div>` : ""}</td>
      <td class="droite nombre">${a.prix_vente_ht ? euros(a.prix_vente_ht) : "—"}</td>
      <td class="droite"><span class="actions fin">
        ${aRecommander(a) ? `<button type="button" class="bouton petit" data-demande>Contacter le fournisseur</button>` : ""}
        <button type="button" class="bouton secondaire petit" data-sens="entree">Entrée</button>
        <button type="button" class="bouton secondaire petit" data-sens="sortie">Sortie</button>
      </span></td>
    </tr>`).join("");

  $("#table-stock").hidden = !visibles.length;
  $("#vide").hidden = !!visibles.length;
  $("#vide").textContent = !articles.length
    ? "Aucun article pour l'instant. Cliquez sur « Nouvel article » pour commencer."
    : "Aucun article ne correspond.";
}

$$("#filtre button").forEach((b) => b.addEventListener("click", () => {
  filtre.alerte = b.dataset.filtre === "alerte";
  $$("#filtre button").forEach((x) => x.classList.toggle("actif", x === b));
  afficherListe();
}));
$("#recherche").addEventListener("input", (e) => { filtre.q = e.target.value.trim(); afficherListe(); });

$("#table-stock tbody").addEventListener("click", (e) => {
  const ligne = e.target.closest("tr");
  if (!ligne) return;
  const article = articles.find((a) => a.id === ligne.dataset.id);
  const bouton = e.target.closest("[data-sens]");
  if (e.target.closest("[data-demande]")) ouvrirDemande([article.id]);
  else if (bouton) ouvrirMouvement(article, bouton.dataset.sens);
  else ouvrirArticle(article);
});

// --- Fiche article -------------------------------------------------------------------

const formArticle = $("#form-article");
formArticle.elements.unite.innerHTML = UNITES_STOCK.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");

// Catégorie : un livre a un ISBN, un autre produit une référence libre
function montrerCategorie() {
  const categorie = formArticle.elements.categorie.value;
  for (const champ of formArticle.querySelectorAll("[data-categorie]")) champ.hidden = champ.dataset.categorie !== categorie;
}
formArticle.elements.categorie.addEventListener("change", () => {
  montrerCategorie();
  // Nouveau livre : compté en exemplaires
  if (!articleEdite && formArticle.elements.categorie.value === "livre" && formArticle.elements.unite.value === "u") {
    formArticle.elements.unite.value = "ex.";
  }
  try { localStorage.setItem("categorie-article", formArticle.elements.categorie.value); } catch {}
});

async function ouvrirArticle(article = null) {
  articleEdite = article;
  formArticle.reset();
  let derniere = "autre";   // nouvel article : la dernière catégorie choisie
  try { derniere = localStorage.getItem("categorie-article") || "autre"; } catch {}
  formArticle.elements.categorie.value = article?.categorie || derniere;
  if (article) {
    for (const champ of formArticle.elements) {
      if (champ.name && champ.name in article) champ.value = article[champ.name] || "";
    }
    if (![...formArticle.elements.unite.options].some((o) => o.value === article.unite)) {
      formArticle.elements.unite.add(new Option(article.unite, article.unite));
    }
    formArticle.elements.unite.value = article.unite;
  } else if (derniere === "livre") {
    formArticle.elements.unite.value = "ex.";
  }
  montrerCategorie();
  $("#titre-article").textContent = article ? article.nom : "Nouvel article";
  // Où se trouve le stock : chez vous et en dépôt chez des clients
  $("#repartition-article").hidden = !article?.en_depot;
  if (article?.en_depot) {
    $("#repartition-article").innerHTML = `Chez vous : <b>${quantite(article.disponible, article.unite)}</b> · `
      + Object.entries(article.depots).map(([lieu, q]) => `chez ${echapper(lieu)} : <b>${quantite(q, article.unite)}</b>`).join(" · ");
  }
  $("#champ-initial").hidden = !!article;
  $("#supprimer-article").hidden = !article;
  $("#bloc-historique").hidden = !article;
  $("#corps-article").style.gridTemplateColumns = article ? "" : "1fr";
  $("#erreur-article").textContent = "";

  if (article) {
    const historique = await apiJson(`/api/stock/${article.id}/mouvements`);
    $("#historique").innerHTML = historique.length ? historique.map((m) => `
      <tr>
        <td class="nombre secondaire">${dateFr(m.date)}</td>
        <td>${echapper(m.motif)}</td>
        <td class="droite nombre"><strong style="color: ${m.quantite > 0 ? "var(--ok)" : "var(--erreur)"}">
          ${m.quantite > 0 ? "+" : "−"}${quantite(Math.abs(m.quantite), article.unite)}</strong></td>
      </tr>`).join("") : `<tr><td class="secondaire">Aucun mouvement.</td></tr>`;
  }
  $("#fenetre-article").showModal();
  formArticle.elements.nom.focus();
}

formArticle.addEventListener("submit", async (e) => {
  e.preventDefault();
  const v = formArticle.elements;
  if (!v.nom.value.trim()) return v.nom.reportValidity();
  const donnees = {
    nom: v.nom.value.trim(), categorie: v.categorie.value, unite: v.unite.value,
    prix_achat_ht: Number(v.prix_achat_ht.value || 0), prix_vente_ht: Number(v.prix_vente_ht.value || 0),
    seuil_alerte: Number(v.seuil_alerte.value || 0), fournisseur: v.fournisseur.value.trim(), notes: v.notes.value,
    // Champ caché par la catégorie : vidé
    isbn: v.categorie.value === "livre" ? v.isbn.value.trim() : "",
    reference: v.categorie.value === "autre" ? v.reference.value.trim() : "",
    ean: v.ean.value.replace(/\s/g, ""),
  };
  try {
    if (articleEdite) await envoyerJson(`/api/stock/${articleEdite.id}`, "PUT", donnees);
    else await envoyerJson("/api/stock", "POST", { ...donnees, stock_initial: Number(v.stock_initial.value || 0) });
  } catch (err) {
    $("#erreur-article").textContent = err.message;
    return;
  }
  $("#fenetre-article").close();
  await charger();
});

$("#supprimer-article").addEventListener("click", async () => {
  if (!confirm(`Supprimer l'article « ${articleEdite.nom} » et tout son historique ?`)) return;
  await api(`/api/stock/${articleEdite.id}`, { method: "DELETE" });
  $("#fenetre-article").close();
  await charger();
});

$("#nouvel-article").addEventListener("click", () => ouvrirArticle());

// --- Entrée / sortie manuelle -------------------------------------------------------------

const formMouvement = $("#form-mouvement");

function ouvrirMouvement(article, sens) {
  mouvement = { article, sens };
  formMouvement.reset();
  formMouvement.elements.date.value = aujourdhui();
  $("#titre-mouvement").textContent = `${sens === "entree" ? "Entrée en stock" : "Sortie de stock"} · ${article.nom}`;
  $("#stock-actuel").textContent = `En stock actuellement : ${quantite(article.quantite, article.unite)}`;
  $("#erreur-mouvement").textContent = "";
  $("#fenetre-mouvement").showModal();
  formMouvement.elements.quantite.focus();
}

formMouvement.addEventListener("submit", async (e) => {
  e.preventDefault();
  const v = formMouvement.elements;
  if (!(Number(v.quantite.value) > 0)) return v.quantite.reportValidity();
  try {
    await envoyerJson(`/api/stock/${mouvement.article.id}/mouvements`, "POST", {
      sens: mouvement.sens, quantite: Number(v.quantite.value), motif: v.motif.value, date: v.date.value,
    });
  } catch (err) {
    $("#erreur-mouvement").textContent = err.message;
    return;
  }
  $("#fenetre-mouvement").close();
  await charger();
});

// --- Contacter un fournisseur : une demande de prix par fournisseur ---------------------------------

const formDemande = $("#form-demande");
let reappro = { articles: [], fournisseurs: [], demandes: {} };
let selectionDemande = new Set();   // articles cochés à l'ouverture (vide : ceux du fournisseur choisi)
let contactesCetteFois = new Set(); // fournisseurs déjà contactés depuis l'ouverture de la page

const memeNom = (x, y) => (x || "").trim().toLowerCase() === (y || "").trim().toLowerCase();
const emailFournisseur = (nom) => reappro.fournisseurs.find((f) => memeNom(f.nom, nom))?.email || "";

// Fournisseurs qui ont des articles à réapprovisionner, du plus concerné au moins concerné
function fournisseursAContacter() {
  const compte = {};
  reappro.articles.forEach((a) => { if (a.fournisseur_habituel) compte[a.fournisseur_habituel] = (compte[a.fournisseur_habituel] || 0) + 1; });
  return Object.entries(compte).sort((x, y) => y[1] - x[1]);
}

async function ouvrirDemande(articleIds = []) {
  reappro = await apiJson("/api/stock/reapprovisionnement");
  $("#liste-fournisseurs").innerHTML = reappro.fournisseurs.map((f) => `<option value="${echapper(f.nom)}">`).join("");
  selectionDemande = new Set(articleIds);
  formDemande.reset();
  $("#erreur-demande").textContent = "";
  // Fournisseur proposé : celui de l'article choisi, sinon celui qui a le plus d'articles à réapprovisionner
  const article = reappro.articles.find((a) => articleIds.includes(a.id));
  formDemande.elements.fournisseur.value = article?.fournisseur_habituel
    || fournisseursAContacter().find(([f]) => !contactesCetteFois.has(f.toLowerCase()))?.[0] || "";
  afficherDemande();
  $("#fenetre-demande").showModal();
}

function choisirFournisseur(nom) {
  formDemande.elements.fournisseur.value = nom;
  selectionDemande.clear();
  $("#erreur-demande").textContent = "";
  afficherDemande();
}

function afficherDemande() {
  const fournisseur = formDemande.elements.fournisseur.value.trim();
  const email = emailFournisseur(fournisseur);
  $("#email-fournisseur").textContent = !fournisseur ? "" : email ? `E-mail : ${email}`
    : "Pas d'e-mail connu : vous pourrez le saisir à l'étape suivante.";

  // Raccourcis : un bouton par fournisseur à contacter
  const liste = fournisseursAContacter();
  $("#choix-fournisseurs").innerHTML = liste.length > 1 || (liste.length && !memeNom(liste[0][0], fournisseur))
    ? `<span class="aide">Fournisseurs à contacter :</span>` + liste.map(([nom, n]) =>
        `<button type="button" class="bouton petit ${memeNom(nom, fournisseur) ? "" : "secondaire"}" data-fournisseur="${echapper(nom)}">
          ${contactesCetteFois.has(nom.toLowerCase()) ? "✓ " : ""}${echapper(nom)} (${n})</button>`).join("")
    : "";

  const lignes = $("#tous-articles").checked
    ? [...reappro.articles, ...articles.filter((a) => !reappro.articles.some((r) => r.id === a.id))
        .map((a) => ({ ...a, proposee: 1, fournisseur_habituel: a.fournisseur }))]
    : reappro.articles;
  // Les articles d'un autre fournisseur ne vont pas dans ce message : ils seront demandés séparément
  const autre = (a) => a.fournisseur_habituel && !memeNom(a.fournisseur_habituel, fournisseur);
  const coche = (a) => !autre(a) && (selectionDemande.size ? selectionDemande.has(a.id)
    : aRecommander(a) && !!fournisseur && memeNom(a.fournisseur_habituel, fournisseur));
  // Ceux du fournisseur choisi d'abord, puis sans fournisseur, puis les autres
  const rang = (a) => (autre(a) ? 2 : a.fournisseur_habituel ? 0 : 1);
  $("#table-demande tbody").innerHTML = [...lignes].sort((x, y) => rang(x) - rang(y)).map((a) => {
    const raison = a.manque > 0 ? `<span class="rouge">il en manque ${quantite(a.manque, a.unite)} pour des devis</span>`
      : aRecommander(a) ? `sous le seuil (${quantite(a.seuil_alerte, a.unite)})` : "";
    const deja = reappro.demandes[a.id] ? `<div class="secondaire">demande envoyée le ${dateFr(reappro.demandes[a.id])}</div>` : "";
    const origine = autre(a)
      ? `<div class="secondaire">chez ${echapper(a.fournisseur_habituel)} ·
          <button type="button" class="lien" data-fournisseur="${echapper(a.fournisseur_habituel)}">le contacter</button></div>`
      : a.fournisseur_habituel ? `<div class="secondaire">${echapper(a.fournisseur_habituel)}</div>`
      : `<div class="secondaire">sans fournisseur habituel${fournisseur ? ` : sera associé à ${echapper(fournisseur)}` : ""}</div>`;
    return `<tr data-id="${a.id}" class="${autre(a) ? "autre-fournisseur" : ""}">
      <td><input type="checkbox" data-coche ${coche(a) ? "checked" : ""} ${autre(a) ? "disabled" : ""}></td>
      <td><strong>${echapper(a.nom)}</strong>${a.reference ? ` <span class="secondaire">${echapper(a.reference)}</span>` : ""}${origine}</td>
      <td class="droite nombre">${quantite(a.quantite, a.unite)}</td>
      <td>${raison}${deja}</td>
      <td><span class="actions"><input type="number" data-quantite min="0" step="any" value="${a.proposee}" style="width: 90px"
        ${autre(a) ? "disabled" : ""}> <span class="secondaire">${echapper(a.unite)}</span></span></td>
    </tr>`;
  }).join("");
  $("#table-demande").hidden = !lignes.length;
  $("#demande-vide").hidden = !!lignes.length;
}

formDemande.elements.fournisseur.addEventListener("input", () => { selectionDemande.clear(); afficherDemande(); });
$("#fenetre-demande").addEventListener("click", (e) => {
  const bouton = e.target.closest("[data-fournisseur]");
  if (bouton) choisirFournisseur(bouton.dataset.fournisseur);
});
$("#tous-articles").addEventListener("change", () => {
  // garde les cases déjà cochées
  selectionDemande = new Set($$("#table-demande [data-coche]:checked").map((c) => c.closest("tr").dataset.id));
  afficherDemande();
});

// Fournisseur et articles cochés (avec leur quantité), ou null après avoir signalé ce qui manque
function lireDemande() {
  const fournisseur = formDemande.elements.fournisseur.value.trim();
  if (!fournisseur) {
    $("#erreur-demande").textContent = "Choisissez le fournisseur à contacter.";
    formDemande.elements.fournisseur.focus();
    return null;
  }
  const lignes = $$("#table-demande tbody tr").filter((tr) => tr.querySelector("[data-coche]").checked)
    .map((tr) => ({ article_id: tr.dataset.id, quantite: Number(tr.querySelector("[data-quantite]").value || 0) }))
    .filter((l) => l.quantite > 0);
  if (!lignes.length) {
    $("#erreur-demande").textContent = "Cochez au moins un article avec une quantité.";
    return null;
  }
  return { fournisseur, lignes };
}

// Bon de commande prérempli (prix d'achat connus), à vérifier dans Factures > Bons de commande
$("#creer-commande").addEventListener("click", async () => {
  const demande = lireDemande();
  if (!demande) return;
  try {
    await envoyerJson("/api/stock/demande-prix", "POST", demande);   // même contrôle : un seul fournisseur
    const bon = await envoyerJson("/api/commandes/depuis-stock", "POST", demande);
    location.href = `factures.html?commande=${encodeURIComponent(bon.numero)}`;
  } catch (err) {
    $("#erreur-demande").textContent = err.message;
  }
});

formDemande.addEventListener("submit", async (e) => {
  e.preventDefault();
  const demande = lireDemande();
  if (!demande) return;
  const { fournisseur, lignes } = demande;
  let modele;
  try {
    modele = await envoyerJson("/api/stock/demande-prix", "POST", { fournisseur, lignes });
  } catch (err) {
    $("#erreur-demande").textContent = err.message;
    return;
  }
  $("#fenetre-demande").close();
  const ids = lignes.map((l) => l.article_id);
  ouvrirEnvoi({
    titre: `Contacter ${fournisseur}`,
    modele,
    marquer: () => envoyerJson("/api/stock/demande-prix/envoyee", "POST", { fournisseur, article_ids: ids }),
    apresEnvoi: async () => {
      contactesCetteFois.add(fournisseur.toLowerCase());
      await charger();
      // D'autres fournisseurs restent à contacter : on enchaîne
      const restants = (await apiJson("/api/stock/reapprovisionnement")).articles
        .filter((a) => a.fournisseur_habituel && !contactesCetteFois.has(a.fournisseur_habituel.toLowerCase())
                       && !ids.includes(a.id));
      if (restants.length && confirm(`Contacter aussi ${restants[0].fournisseur_habituel} pour ses articles ?`)) ouvrirDemande();
    },
  });
});

$("#ouvrir-demande").addEventListener("click", () => ouvrirDemande());

// --- Dépôts chez des clients et relevés de ventes ---------------------------------------------------

let depots = { depots: [], clients: [] };

async function chargerDepots() {
  depots = await apiJson("/api/stock/depots");
  $("#liste-clients").innerHTML = depots.clients.map((c) => `<option value="${echapper(c)}">`).join("");
  $("#depots-vide").hidden = !!depots.depots.length;
  $("#liste-depots").innerHTML = depots.depots.map((d) => `
    <div class="depot" data-lieu="${echapper(d.lieu)}">
      <div class="depot-entete">
        <div><strong>${echapper(d.lieu)}</strong>
          <span class="secondaire"> · ${quantite(d.exemplaires, "ex.")} · ${euros(d.valeur_vente_ht)} HT au prix de vente
          · ${d.dernier_releve ? `dernier relevé le ${dateFr(d.dernier_releve)}` : `en dépôt depuis le ${dateFr(d.depuis)}, aucun relevé`}</span></div>
        <span class="actions">
          <button type="button" class="bouton secondaire petit" data-ajouter-depot>Ajouter au dépôt</button>
          <button type="button" class="bouton petit" data-releve>Relevé de ventes</button>
        </span>
      </div>
      <table class="tableau compact"><tbody>${d.articles.map((a) => `<tr><td>${echapper(a.nom)}
        <span class="secondaire">${echapper(codeArticle(a))}</span></td>
        <td class="droite nombre">${quantite(a.quantite, a.unite)}</td></tr>`).join("")}</tbody></table>
    </div>`).join("");
}

const formDepot = $("#form-depot");
function ouvrirDepot(lieu = "") {
  formDepot.reset();
  formDepot.elements.lieu.value = lieu;
  formDepot.elements.date.value = aujourdhui();
  $("#erreur-depot").textContent = "";
  $("#table-depot tbody").innerHTML = articles.map((a) => `<tr data-id="${a.id}">
    <td><strong>${echapper(a.nom)}</strong> <span class="secondaire">${echapper(codeArticle(a))}</span></td>
    <td class="droite nombre">${quantite(a.disponible, a.unite)}</td>
    <td><span class="actions"><input type="number" data-quantite min="0" step="any" style="width: 90px">
      <span class="secondaire">${echapper(a.unite)}</span></span></td></tr>`).join("");
  $("#fenetre-depot").showModal();
  (lieu ? $("#table-depot [data-quantite]") : formDepot.elements.lieu).focus();
}
formDepot.addEventListener("submit", async (e) => {
  e.preventDefault();
  const lignes = $$("#table-depot tbody tr").map((tr) => ({ article_id: tr.dataset.id,
    quantite: Number(tr.querySelector("[data-quantite]").value || 0) })).filter((l) => l.quantite > 0);
  try {
    const r = await envoyerJson("/api/stock/depots", "POST", { lieu: formDepot.elements.lieu.value.trim(),
                                                              date: formDepot.elements.date.value, lignes });
    if (r.avertissements.length) alert("Dépôt enregistré.\n\n" + r.avertissements.join("\n"));
  } catch (err) {
    $("#erreur-depot").textContent = err.message;
    return;
  }
  $("#fenetre-depot").close();
  await Promise.all([charger(), chargerDepots()]);
});

const formReleve = $("#form-releve");
let depotReleve = null;
function ouvrirReleve(lieu) {
  depotReleve = depots.depots.find((d) => d.lieu === lieu);
  if (!depotReleve) return;
  formReleve.reset();
  formReleve.elements.date.value = aujourdhui();
  $("#titre-releve").textContent = `Relevé de ventes · ${lieu}`;
  $("#erreur-releve").textContent = "";
  $("#table-releve tbody").innerHTML = depotReleve.articles.map((a) => `<tr data-id="${a.id}" data-depot="${a.quantite}" data-unite="${echapper(a.unite)}">
    <td><strong>${echapper(a.nom)}</strong> <span class="secondaire">${echapper(codeArticle(a))}</span></td>
    <td class="droite nombre">${quantite(a.quantite, a.unite)}</td>
    <td><input type="number" data-vendus min="0" step="any" style="width: 90px"></td>
    <td><input type="number" data-retournes min="0" step="any" style="width: 90px"></td>
    <td class="droite nombre" data-restera>${quantite(a.quantite, a.unite)}</td></tr>`).join("");
  $("#fenetre-releve").showModal();
  $("#table-releve [data-vendus]")?.focus();
}
$("#table-releve").addEventListener("input", (e) => {
  const tr = e.target.closest("tr");
  const reste = Number(tr.dataset.depot) - Number(tr.querySelector("[data-vendus]").value || 0)
    - Number(tr.querySelector("[data-retournes]").value || 0);
  tr.querySelector("[data-restera]").textContent = quantite(reste, tr.dataset.unite);
  tr.querySelector("[data-restera]").classList.toggle("rouge", reste < 0);
});
formReleve.addEventListener("submit", async (e) => {
  e.preventDefault();
  const lignes = $$("#table-releve tbody tr").map((tr) => ({ article_id: tr.dataset.id,
    vendus: Number(tr.querySelector("[data-vendus]").value || 0),
    retournes: Number(tr.querySelector("[data-retournes]").value || 0) })).filter((l) => l.vendus || l.retournes);
  if (!lignes.length) return ($("#erreur-releve").textContent = "Indiquez au moins une quantité vendue ou retournée.");
  let r;
  try {
    r = await envoyerJson("/api/stock/depots/releve", "POST", { lieu: depotReleve.lieu,
                                                               date: formReleve.elements.date.value, lignes });
  } catch (err) {
    $("#erreur-releve").textContent = err.message;
    return;
  }
  $("#fenetre-releve").close();
  await Promise.all([charger(), chargerDepots()]);
  const vendus = r.facture.lignes.reduce((s, l) => s + l.quantite, 0);
  if (vendus && confirm(`Relevé enregistré. Préparer la facture des ${vendus} exemplaires vendus pour ${depotReleve.lieu} ?`)) {
    try { sessionStorage.setItem("devisPrerempli", JSON.stringify(r.facture)); } catch {}
    location.href = "devis.html?prerempli=1";
  }
});

$("#ouvrir-depot").addEventListener("click", () => ouvrirDepot());
$("#liste-depots").addEventListener("click", (e) => {
  const lieu = e.target.closest("[data-lieu]")?.dataset.lieu;
  if (e.target.closest("[data-releve]")) ouvrirReleve(lieu);
  else if (e.target.closest("[data-ajouter-depot]")) ouvrirDepot(lieu);
});

$$("[data-fermer]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));

(async () => {
  await initialiserPage();
  await charger();
  // Fournisseurs connus, proposés dans la fiche article
  apiJson("/api/stock/reapprovisionnement").then((r) => {
    if (!$("#liste-fournisseurs").children.length) {
      $("#liste-fournisseurs").innerHTML = r.fournisseurs.map((f) => `<option value="${echapper(f.nom)}">`).join("");
    }
  }).catch(() => {});
  await chargerDepots();
  if (parametre("releve")) {
    ouvrirReleve(parametre("releve"));
    $("#section-depots").scrollIntoView();
  }
  // Liens de l'accueil : « Voir le stock » (filtre) et « Contacter le fournisseur »
  if (parametre("filtre") === "alerte") $("#filtre [data-filtre=alerte]").click();
  if (parametre("demande")) ouvrirDemande();
  // Lien de la recherche globale : ouvre la fiche de l'article
  const cible = articles.find((a) => a.id === parametre("article"));
  if (cible) ouvrirArticle(cible);
})();
