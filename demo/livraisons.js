// Bons de livraison (Ventes) : création depuis un devis accepté ou vierge, PDF sans prix, envoi par e-mail.

let bons = [];
let clients = [];
let bonEdite = null;   // { numero|null, lignes: [...] }

const urlBl = (numero) => `/api/livraisons/${encodeURIComponent(numero)}`;

async function charger() {
  bons = await apiJson("/api/livraisons");
  afficher();
}

function afficher() {
  const q = sansAccentsBl($("#recherche-bl").value);
  const visibles = bons.filter((b) => !q || sansAccentsBl(`${b.numero} ${b.client.nom} ${b.devis} ${b.objet} `
    + b.lignes.map((l) => l.designation).join(" ")).includes(q));
  $("#table-bl tbody").innerHTML = visibles.map((b) => `
    <tr class="cliquable" data-numero="${echapper(b.numero)}">
      <td><strong>${echapper(b.numero)}</strong></td>
      <td class="nombre">${dateFr(b.date)}</td>
      <td><strong>${echapper(b.client.nom)}</strong>
        <div class="secondaire">${echapper(b.objet || b.lignes.map((l) => l.designation).slice(0, 2).join(", ")
          + (b.lignes.length > 2 ? "…" : ""))}</div></td>
      <td>${echapper(b.devis || "")}</td>
      <td class="droite"><div class="actions fin">
        <a class="lien" href="${urlBl(b.numero)}/pdf" download="Bon de livraison ${echapper(b.numero)}.pdf">Télécharger</a>
        <a class="lien" target="_blank" href="${urlBl(b.numero)}/pdf">PDF</a>
        <button type="button" class="lien" data-envoyer>${b.envoye_le ? "Envoyer à nouveau" : "Envoyer"}</button>
      </div></td>
    </tr>`).join("");
  $("#table-bl").hidden = !visibles.length;
  $("#vide-bl").hidden = !!visibles.length;
  $("#vide-bl").textContent = bons.length ? "Aucun bon de livraison ne correspond à la recherche."
    : "Aucun bon de livraison pour l'instant. Cliquez sur « Nouveau bon de livraison », ou créez-en un depuis un "
      + "devis accepté (menu « ⋯ » de la liste des devis).";
}

function sansAccentsBl(t) {
  return String(t || "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

// --- Saisie ----------------------------------------------------------------------------------------

const form = $("#form-bl");

function ligneVide() {
  return { designation: "", description: "", quantite: 1, unite: "u", article_id: "" };
}

function afficherLignes() {
  $("#lignes-bl tbody").innerHTML = bonEdite.lignes.map((l, i) => `
    <tr data-i="${i}">
      <td><input data-champ="designation" value="${echapper(l.designation)}" placeholder="Article ou prestation">
        <input data-champ="description" value="${echapper(l.description || "")}" placeholder="Précision (facultatif)"
          class="secondaire" style="margin-top: 4px"></td>
      <td><input data-champ="quantite" type="number" step="any" min="0" value="${l.quantite}" style="width: 100px"></td>
      <td><input data-champ="unite" value="${echapper(l.unite || "")}" style="width: 80px"></td>
      <td><button type="button" class="lien discret" data-retirer title="Retirer la ligne">×</button></td>
    </tr>`).join("");
}

$("#lignes-bl").addEventListener("input", (e) => {
  const tr = e.target.closest("tr[data-i]");
  if (!tr) return;
  const champ = e.target.dataset.champ;
  bonEdite.lignes[tr.dataset.i][champ] = champ === "quantite" ? Number(e.target.value || 0) : e.target.value;
});
$("#lignes-bl").addEventListener("click", (e) => {
  if (!e.target.closest("[data-retirer]")) return;
  bonEdite.lignes.splice(Number(e.target.closest("tr").dataset.i), 1);
  afficherLignes();
});
$("#ajouter-ligne-bl").addEventListener("click", () => { bonEdite.lignes.push(ligneVide()); afficherLignes(); });

// Client de l'annuaire : coordonnées reprises
form.elements.nom.addEventListener("change", () => {
  const c = clients.find((x) => x.nom === form.elements.nom.value);
  if (!c) return;
  for (const champ of ["adresse", "code_postal", "ville", "email"]) {
    if (!form.elements[champ].value) form.elements[champ].value = c[champ] || "";
  }
});

function ouvrirSaisie(bon, numero = null) {
  bonEdite = { numero, lignes: bon.lignes.length ? bon.lignes.map((l) => ({ ...l })) : [ligneVide()], client: bon.client };
  form.reset();
  const c = bon.client || {};
  Object.assign(form.elements.nom, { value: c.nom || "" });
  for (const champ of ["adresse", "code_postal", "ville", "email", "livraison_adresse"]) form.elements[champ].value = c[champ] || "";
  form.elements.date.value = bon.date || aujourdhui();
  form.elements.objet.value = bon.objet || "";
  form.elements.devis.value = bon.devis || "";
  form.elements.commande_client.value = bon.commande_client || "";
  form.elements.notes.value = bon.notes || "";
  $("#titre-bl").textContent = numero ? `Bon de livraison ${numero}` : "Nouveau bon de livraison";
  $("#supprimer-bl").hidden = !numero;
  $("#erreur-bl").textContent = "";
  afficherLignes();
  $("#fenetre-bl").showModal();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const v = form.elements;
  const saisie = {
    client: { ...(bonEdite.client || {}), nom: v.nom.value.trim(), adresse: v.adresse.value.trim(),
              code_postal: v.code_postal.value.trim(), ville: v.ville.value.trim(), email: v.email.value.trim(),
              livraison_adresse: v.livraison_adresse.value.trim() },
    date: v.date.value, objet: v.objet.value.trim(), devis: v.devis.value.trim(),
    commande_client: v.commande_client.value.trim(), notes: v.notes.value, lignes: bonEdite.lignes,
  };
  const fenetre = window.open("", "_blank");   // ouverte tout de suite pour ne pas être bloquée
  try {
    const bon = bonEdite.numero ? await envoyerJson(urlBl(bonEdite.numero), "PUT", saisie)
      : await envoyerJson("/api/livraisons", "POST", saisie);
    $("#fenetre-bl").close();
    if (fenetre) fenetre.location = `${urlBl(bon.numero)}/pdf`;
    await charger();
  } catch (err) {
    fenetre?.close();
    $("#erreur-bl").textContent = err.message;
  }
});

$("#supprimer-bl").addEventListener("click", async () => {
  if (!confirm(`Supprimer le bon de livraison ${bonEdite.numero} ?`)) return;
  await api(urlBl(bonEdite.numero), { method: "DELETE" });
  $("#fenetre-bl").close();
  await charger();
});

// --- Départ : depuis un devis accepté ou vierge -----------------------------------------------------

async function nouveau() {
  const devis = (await apiJson("/api/devis")).filter((d) => d.statut === "accepte");
  $("#choix-devis").innerHTML = `<option value="">Choisir un devis…</option>` + devis.map((d) =>
    `<option value="${echapper(d.numero)}">${echapper(d.numero)} · ${echapper(d.client)}${d.objet ? " · " + echapper(d.objet) : ""}</option>`).join("");
  $("#fenetre-depart").showModal();
}

async function depuisDevis(numero) {
  try {
    ouvrirSaisie(await apiJson(`/api/livraisons/depuis-devis/${encodeURIComponent(numero)}`));
  } catch (err) {
    alert(err.message);
  }
}

$("#nouveau-bl").addEventListener("click", nouveau);
$("#bl-vierge").addEventListener("click", () => { $("#fenetre-depart").close(); ouvrirSaisie({ lignes: [], client: {} }); });
$("#bl-depuis-devis").addEventListener("click", () => {
  const numero = $("#choix-devis").value;
  if (!numero) return $("#choix-devis").focus();
  $("#fenetre-depart").close();
  depuisDevis(numero);
});

// --- Liste : ouvrir, envoyer ------------------------------------------------------------------------

$("#table-bl").addEventListener("click", async (e) => {
  const tr = e.target.closest("tr[data-numero]");
  if (!tr || e.target.closest("a")) return;
  const numero = tr.dataset.numero;
  if (e.target.closest("[data-envoyer]")) {
    return ouvrirEnvoi({ titre: `Envoyer le bon de livraison ${numero}`, modele: `${urlBl(numero)}/envoi`,
                         marquer: `${urlBl(numero)}/envoye`, apresEnvoi: charger });
  }
  const bon = bons.find((b) => b.numero === numero);
  if (bon) ouvrirSaisie(bon, numero);
});

$("#recherche-bl").addEventListener("input", afficher);
$$("[data-fermer]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));

(async () => {
  await initialiserPage();
  clients = await apiJson("/api/devis/clients").catch(() => []);
  $("#liste-clients").innerHTML = clients.map((c) => `<option value="${echapper(c.nom)}">`).join("");
  await charger();
  if (parametre("devis")) depuisDevis(parametre("devis"));   // lien « Bon de livraison » de la liste des devis
})();
