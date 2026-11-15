// Bons de commande aux fournisseurs (onglet de la page Factures) : saisie, PDF, envoi, réception, facture.

const STATUTS_COMMANDE = { brouillon: "Brouillon", envoyee: "Envoyée", recue: "Reçue", annulee: "Annulée" };

let bonsCommande = [];
const filtreCommandes = { statut: "en_cours", q: "" };
let commandeEditee = null;   // { numero|null, lignes: [...] }

async function chargerCommandes() {
  bonsCommande = await apiJson("/api/commandes");
  const enCours = bonsCommande.filter((b) => b.statut === "brouillon" || b.statut === "envoyee").length;
  $("#nb-commandes").textContent = enCours || "";
  if (!$("#vue-commandes").hidden) afficherCommandes();
  if (typeof afficherResume === "function") afficherResume();   // chiffres de l'onglet Bons de commande
  if (typeof afficherListe === "function" && factures.length) afficherListe();   // liens vers nos bons de commande
}

function statutCommande(b) {
  const classe = { recue: "ok", annulee: "", envoyee: "proche", brouillon: "" }[b.statut];
  const date = b.statut === "recue" ? b.recue_le : b.statut === "envoyee" ? b.envoyee_le : "";
  return `<span class="statut ${classe}">${STATUTS_COMMANDE[b.statut]}</span>`
    + (date ? `<div class="secondaire" style="font-size: 12px">le ${dateFr(date)}</div>` : "");
}

function actionsCommande(b) {
  const ouvrir = `<a class="lien" target="_blank" href="/api/commandes/${encodeURIComponent(b.numero)}/pdf">PDF</a>`;
  if (b.statut === "annulee") return `${ouvrir} <button type="button" class="lien discret" data-supprimer-commande>Supprimer</button>`;
  const envoyer = b.statut !== "recue" ? `<button type="button" class="lien" data-envoyer-commande>Envoyer</button>` : "";
  const recevoir = b.statut !== "recue" ? `<button type="button" class="bouton secondaire petit" data-recevoir>Réceptionner…</button>` : "";
  const facture = b.facture ? `<span class="secondaire">Facture ${echapper(b.facture)}</span>`
    : b.statut !== "brouillon" ? `<button type="button" class="lien" data-facture-commande>Saisir la facture</button>` : "";
  return `<div class="actions fin">${facture} ${recevoir} ${ouvrir} ${envoyer}</div>`;
}

function afficherCommandes() {
  const q = filtreCommandes.q.toLowerCase();
  const visibles = bonsCommande.filter((b) => {
    if (filtreCommandes.statut === "en_cours" && !["brouillon", "envoyee"].includes(b.statut)) return false;
    if (filtreCommandes.statut === "recue" && b.statut !== "recue") return false;
    const texte = `${b.numero} ${b.fournisseur} ${b.objet} ${b.facture} ${b.lignes.map((l) => l.designation + " " + l.description).join(" ")}`;
    return !q || texte.toLowerCase().includes(q);
  });
  $("#table-commandes tbody").innerHTML = visibles.map((b) => `
    <tr class="cliquable" data-numero="${echapper(b.numero)}">
      <td><strong>${echapper(b.numero)}</strong></td>
      <td class="nombre">${dateFr(b.date)}</td>
      <td><strong>${echapper(b.fournisseur)}</strong>
        <div class="secondaire">${echapper(b.objet || b.lignes.map((l) => l.designation).slice(0, 2).join(", ")
          + (b.lignes.length > 2 ? "…" : ""))}</div></td>
      <td class="droite nombre"><strong>${euros(b.total_ttc)}</strong></td>
      <td>${statutCommande(b)}</td>
      <td class="droite">${actionsCommande(b)}</td>
    </tr>`).join("");
  $("#table-commandes").hidden = !visibles.length;
  $("#vide-commandes").hidden = !!visibles.length;
  $("#vide-commandes").textContent = bonsCommande.length
    ? "Aucun bon de commande dans cette catégorie."
    : "Aucun bon de commande pour l'instant. Cliquez sur « Nouveau bon de commande », ou créez-en un depuis "
      + "Stock > Contacter le fournisseur.";
}

$$("#filtre-commandes button").forEach((b) => b.addEventListener("click", () => {
  filtreCommandes.statut = b.dataset.statut;
  $$("#filtre-commandes button").forEach((x) => x.classList.toggle("actif", x === b));
  afficherCommandes();
}));
$("#recherche-commandes").addEventListener("input", (e) => { filtreCommandes.q = e.target.value.trim(); afficherCommandes(); });

$("#table-commandes tbody").addEventListener("click", async (e) => {
  const ligne = e.target.closest("tr");
  if (!ligne || e.target.closest("a")) return;
  const b = bonsCommande.find((x) => x.numero === ligne.dataset.numero);
  try {
    if (e.target.closest("[data-envoyer-commande]")) return envoyerCommande(b);
    if (e.target.closest("[data-recevoir]")) return await recevoirCommande(b);
    if (e.target.closest("[data-facture-commande]")) return await saisirFactureCommande(b);
    if (e.target.closest("[data-supprimer-commande]")) return await supprimerCommande(b);
    ouvrirCommande(b);
  } catch (err) {
    alert(err.message);
  }
});

// --- Actions ----------------------------------------------------------------------------

function envoyerCommande(b) {
  ouvrirEnvoi({ titre: `Envoyer le bon de commande ${b.numero}`,
                modele: `/api/commandes/${encodeURIComponent(b.numero)}/envoi`,
                marquer: `/api/commandes/${encodeURIComponent(b.numero)}/envoyee`, apresEnvoi: chargerCommandes });
}

async function recevoirCommande(b) {
  const lies = b.lignes.filter((l) => l.article_id);
  let entree = false;
  if (lies.length) {
    entree = confirm(`Commande ${b.numero} reçue.\n\nFaire entrer en stock les articles commandés ?\n`
      + lies.map((l) => `• ${l.designation} : ${String(l.quantite).replace(".", ",")} ${l.unite}`).join("\n")
      + "\n\nOK : entrée en stock · Annuler : marquer reçue sans toucher au stock");
  } else if (!confirm(`Marquer la commande ${b.numero} comme reçue ?`)) return;
  await envoyerJson(`/api/commandes/${encodeURIComponent(b.numero)}/reception`, "POST",
                    { date: aujourdhui(), entree_stock: entree });
  await chargerCommandes();
  if (entree) articlesStock = await apiJson("/api/stock");
}

async function saisirFactureCommande(b) {
  // Fenêtre de saisie des factures, préremplie : il reste à reporter le n° et les montants de la facture reçue
  const pre = await apiJson(`/api/commandes/${encodeURIComponent(b.numero)}/facture`);
  ouvrir(pre);
}

async function supprimerCommande(b) {
  if (!confirm(`Supprimer définitivement le bon de commande ${b.numero} ?`)) return;
  await api(`/api/commandes/${encodeURIComponent(b.numero)}`, { method: "DELETE" });
  await chargerCommandes();
}

// --- Saisie d'un bon de commande ---------------------------------------------------------

const formCommandeF = $("#form-commande");
let tvaParDefaut = 20;

function nouvelleLigneCommande() {
  return { designation: "", description: "", quantite: 1, unite: "u", prix_unitaire_ht: 0, taux_tva: tvaParDefaut, article_id: "" };
}

function ouvrirCommande(b = null) {
  formCommandeF.reset();
  commandeEditee = { numero: b?.numero || null,
                     lignes: (b?.lignes || [nouvelleLigneCommande()]).map((l) => ({ ...l })) };
  const v = formCommandeF.elements;
  v.fournisseur.value = b?.fournisseur || "";
  v.date.value = b?.date || aujourdhui();
  v.livraison_souhaitee.value = b?.livraison_souhaitee || "";
  v.objet.value = b?.objet || "";
  v.adresse_livraison.value = b?.adresse_livraison || "";
  v.notes.value = b?.notes || "";
  formCommandeF.querySelector("details.plus").open = !!(b?.adresse_livraison || b?.notes);
  const fige = b && (b.statut === "recue" || b.statut === "annulee");
  formCommandeF.querySelectorAll("input, textarea, #ajouter-ligne-commande").forEach((el) => (el.disabled = fige));
  $("#titre-commande").textContent = b ? `Bon de commande ${b.numero}` + (fige ? ` · ${STATUTS_COMMANDE[b.statut].toLowerCase()}` : "")
    : "Nouveau bon de commande";
  $("#supprimer-commande").hidden = !b || (b.statut === "recue" && b.entree_stock);
  $("#supprimer-commande").textContent = b && b.statut !== "annulee" && b.statut !== "brouillon" ? "Annuler la commande" : "Supprimer";
  formCommandeF.querySelector(".fenetre-pied .bouton:not(.secondaire):not(.danger)").hidden = fige;
  $("#erreur-commande").textContent = "";
  afficherLignesCommande();
  $("#fenetre-commande").showModal();
  if (!b) v.fournisseur.focus();
}

function afficherLignesCommande() {
  const fige = formCommandeF.elements.fournisseur.disabled;
  $("#lignes-commande tbody").innerHTML = commandeEditee.lignes.map((l, i) => `
    <tr data-i="${i}">
      <td class="designation"><input data-champ="designation" list="liste-articles-commande" value="${echapper(l.designation)}"
            placeholder="Saisissez, ou choisissez un article du stock" ${fige ? "disabled" : ""}>
        <input data-champ="description" class="remarque-ligne" value="${echapper(l.description)}"
            placeholder="Réf., ISBN, précision (facultatif)" ${fige ? "disabled" : ""}>
        ${l.article_id ? `<div class="lien-stock">Article du stock</div>` : ""}</td>
      <td><input data-champ="quantite" type="number" step="any" min="0" class="num" value="${l.quantite}" ${fige ? "disabled" : ""}></td>
      <td><input data-champ="unite" class="unite" value="${echapper(l.unite)}" ${fige ? "disabled" : ""}></td>
      <td><input data-champ="prix_unitaire_ht" type="number" step="0.01" class="num" value="${l.prix_unitaire_ht}" ${fige ? "disabled" : ""}></td>
      <td><input data-champ="taux_tva" type="number" step="0.1" min="0" class="tva" value="${l.taux_tva}" ${fige ? "disabled" : ""}></td>
      <td class="total" data-total></td>
      <td>${fige ? "" : `<button type="button" class="suppr" data-suppr-ligne title="Retirer la ligne">×</button>`}</td>
    </tr>`).join("");
  majTotauxCommande();
}

function majTotauxCommande() {
  let ht = 0, tva = 0;
  $$("#lignes-commande tbody tr").forEach((tr) => {
    const l = commandeEditee.lignes[tr.dataset.i];
    const total = Math.round(l.quantite * l.prix_unitaire_ht * 100) / 100;
    ht += total;
    tva += total * l.taux_tva / 100;
    $("[data-total]", tr).textContent = euros(total);
  });
  $("#totaux-commande").innerHTML = `Total HT <strong>${euros(ht)}</strong> · TTC <strong>${euros(ht + tva)}</strong>`;
}

$("#lignes-commande tbody").addEventListener("input", (e) => {
  const champ = e.target.dataset.champ;
  if (!champ) return;
  const tr = e.target.closest("tr");
  const l = commandeEditee.lignes[tr.dataset.i];
  l[champ] = ["quantite", "prix_unitaire_ht", "taux_tva"].includes(champ) ? Number(e.target.value || 0) : e.target.value;
  if (champ === "designation") {
    // Article du stock choisi dans la liste : on reprend son code, son unité et son prix d'achat
    const a = articlesStock.find((x) => x.nom === e.target.value);
    const avant = l.article_id;
    l.article_id = a ? a.id : "";
    if (a && a.id !== avant) {
      l.description = a.isbn ? `ISBN ${a.isbn}` : a.ean ? `EAN ${a.ean}` : a.reference ? `Réf. ${a.reference}` : "";
      l.unite = a.unite;
      l.prix_unitaire_ht = a.prix_achat_ht;
      if (!formCommandeF.elements.fournisseur.value && a.fournisseur) formCommandeF.elements.fournisseur.value = a.fournisseur;
    }
    if (a?.id !== avant) {
      afficherLignesCommande();
      const champ = $(`#lignes-commande tr[data-i="${tr.dataset.i}"] [data-champ=designation]`);
      champ.focus();
      champ.setSelectionRange(champ.value.length, champ.value.length);
      return;
    }
  }
  majTotauxCommande();
});

$("#lignes-commande tbody").addEventListener("click", (e) => {
  if (!e.target.closest("[data-suppr-ligne]")) return;
  commandeEditee.lignes.splice(Number(e.target.closest("tr").dataset.i), 1);
  if (!commandeEditee.lignes.length) commandeEditee.lignes.push(nouvelleLigneCommande());
  afficherLignesCommande();
});

$("#ajouter-ligne-commande").addEventListener("click", () => {
  commandeEditee.lignes.push(nouvelleLigneCommande());
  afficherLignesCommande();
  $("#lignes-commande tbody tr:last-child [data-champ=designation]").focus();
});

formCommandeF.addEventListener("submit", async (e) => {
  e.preventDefault();
  const v = formCommandeF.elements;
  if (!v.fournisseur.value.trim()) return v.fournisseur.reportValidity();
  const saisie = { fournisseur: v.fournisseur.value.trim(), date: v.date.value, livraison_souhaitee: v.livraison_souhaitee.value,
                   objet: v.objet.value.trim(), adresse_livraison: v.adresse_livraison.value.trim(), notes: v.notes.value,
                   lignes: commandeEditee.lignes };
  const fenetre = window.open("", "_blank");   // ouverte tout de suite pour ne pas être bloquée
  try {
    const bon = commandeEditee.numero
      ? await envoyerJson(`/api/commandes/${encodeURIComponent(commandeEditee.numero)}`, "PUT", saisie)
      : await envoyerJson("/api/commandes", "POST", saisie);
    if (fenetre) fenetre.location = `/api/commandes/${encodeURIComponent(bon.numero)}/pdf`;
    $("#fenetre-commande").close();
    await chargerCommandes();
  } catch (err) {
    fenetre?.close();
    $("#erreur-commande").textContent = err.message;
  }
});

$("#supprimer-commande").addEventListener("click", async () => {
  const b = bonsCommande.find((x) => x.numero === commandeEditee.numero);
  try {
    if (b.statut === "envoyee") {
      if (!confirm(`Annuler la commande ${b.numero} ? Pensez à prévenir le fournisseur.`)) return;
      await envoyerJson(`/api/commandes/${encodeURIComponent(b.numero)}/statut`, "POST", { statut: "annulee" });
    } else {
      if (!confirm(`Supprimer définitivement le bon de commande ${b.numero} ?`)) return;
      await api(`/api/commandes/${encodeURIComponent(b.numero)}`, { method: "DELETE" });
    }
    $("#fenetre-commande").close();
    await chargerCommandes();
  } catch (err) {
    $("#erreur-commande").textContent = err.message;
  }
});

$$("[data-fermer-commande]").forEach((b) => b.addEventListener("click", () => $("#fenetre-commande").close()));
$("#nouvelle-commande").addEventListener("click", () => ouvrirCommande());

(async () => {
  await sessionPrete;
  if (!peut("commandes")) return;   // onglet Bons de commande
  const [contactsListe, entrepriseInfos, stock] = await Promise.all([
    apiJson("/api/contacts"), apiJson("/api/entreprise"), apiJson("/api/stock")]);
  tvaParDefaut = entrepriseInfos.taux_tva_defaut ?? 20;
  $("#liste-fournisseurs").innerHTML = contactsListe.filter((c) => c.type === "fournisseur")
    .map((c) => `<option value="${echapper(c.nom)}">`).join("");
  $("#liste-articles-commande").innerHTML = stock.map((a) => `<option value="${echapper(a.nom)}">`).join("");
  await chargerCommandes();
  // Lien depuis le stock (« Créer un bon de commande ») : ouvre l'onglet et le bon à vérifier
  const voulu = parametre("commande");
  if (parametre("onglet") === "commandes" || voulu) {
    choisirVue("fournisseur", "commandes");
    const b = bonsCommande.find((x) => x.numero === voulu);
    if (b) ouvrirCommande(b);
  }
})();
