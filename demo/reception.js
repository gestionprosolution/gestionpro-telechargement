// Boîte de réception : factures fournisseurs reçues sur la plateforme agréée (relevées par le serveur),
// validées ici (accepter, mettre en attente, refuser) avant d'entrer dans les factures fournisseurs.

let documents = [], articles = [], motifsRefus = {}, filtre = "en_cours", courant = null, decisionMotif = "";
const EN_COURS = ["a_valider", "en_attente"];
const VIDES = {
  en_cours: "Rien à valider : toutes les factures reçues ont été acceptées ou refusées.",
  acceptee: "Aucune facture acceptée pour l'instant.",
  refusee: "Aucune facture refusée.",
  "": "Aucune facture reçue pour l'instant.",
};
const ETATS = { a_valider: ["À valider", ""], en_attente: ["En attente", "proche"], refusee: ["Refusée", "retard"],
  acceptee: ["Acceptée", "ok"], ignore: ["Mise de côté", ""] };
const DECISIONS = { valide: "Accepté", attente: "En attente", refuse: "Refusé" };

function messageReception(texte, type = "ok") {
  $("#message-reception").textContent = texte;
  $("#message-reception").className = `message ${type}`;
}

const enCours = (d) => EN_COURS.includes(d.etat);

function colonneValidation(d) {
  const [libelle, classe] = ETATS[d.etat] || [d.etat, ""];
  const compte = enCours(d) ? `<strong class="nombre">${d.acceptees}/${d.attendues}</strong> ` : "";
  return `<span class="circuit">${compte}<span class="statut ${classe}">${libelle}</span>
    <button type="button" class="info-circuit" data-info title="Détail des validations" aria-label="Détail des validations">i</button></span>`;
}

function actions(d) {
  if (d.etat === "acceptee") {
    return d.facture_id ? `<a class="lien" href="factures.html?espace=fournisseurs&facture=${encodeURIComponent(d.facture_id)}">Voir la facture</a>` : "";
  }
  if (d.etat === "ignore") return `<button type="button" class="lien" data-action="a-valider">Remettre à valider</button>`;
  if (!enCours(d)) return "";
  if (!d.peut_decider) return `<span class="aide">En attente des validations</span>`;
  if (d.ma_decision === "valide") {
    return `<span class="aide">Vous l'avez acceptée</span> <button type="button" class="lien" data-action="annuler">Annuler</button>`;
  }
  return `<button type="button" class="bouton petit" data-action="accepter">Accepter</button>
    ${d.ma_decision === "attente" ? "" : `<button type="button" class="lien" data-action="attente">Mettre en attente</button>`}
    <button type="button" class="lien rouge" data-action="refuser">Refuser</button>`;
}

function afficher() {
  const liste = documents.filter((d) => (filtre === "en_cours" ? enCours(d) : !filtre || d.etat === filtre));
  $("#nb-en-cours").textContent = documents.filter(enCours).length || "";
  $("#table-reception tbody").innerHTML = liste.map((d) => `
    <tr data-id="${echapper(d.id)}" class="${enCours(d) && d.peut_decider && d.ma_decision !== "valide" ? "non-lu" : ""}">
      <td><strong>${echapper(d.fournisseur || "Fournisseur inconnu")}</strong>
        <div class="secondaire">reçue${d.recu_le ? ` le ${dateFr(d.recu_le.slice(0, 10))}` : ""} via ${echapper(d.plateforme)}</div></td>
      <td>${d.montant_ttc < 0 ? "Avoir " : ""}${echapper(d.numero || "sans numéro")}${d.date ? ` <span class="secondaire">du ${dateFr(d.date)}</span>` : ""}
        ${d.electronique ? ` <span class="statut ok">Facture électronique</span>` : ""}
        <div class="secondaire">${d.statut_plateforme === "paid" ? "déjà payée · " : ""}
          ${d.piece_id ? `<a class="lien" target="_blank" href="/api/reception/${encodeURIComponent(d.id)}/fichier">voir la facture</a>` : "pas de fichier"}</div></td>
      <td class="droite nombre">${d.echeance ? dateFr(d.echeance) : ""}</td>
      <td class="droite nombre"><strong>${euros(d.montant_ttc)}</strong>
        ${d.montant_tva ? `<div class="secondaire">dont TVA ${euros(d.montant_tva)}</div>` : ""}</td>
      <td>${colonneValidation(d)}</td>
      <td class="droite"><span class="actions" style="justify-content: flex-end">${actions(d)}</span></td>
    </tr>`).join("");
  $("#table-reception").hidden = !liste.length;
  $("#reception-vide").hidden = !!liste.length;
  $("#reception-vide").textContent = VIDES[filtre];
}

// --- Détail du circuit, au survol du « i » ------------------------------------------------------

function detailCircuit(d) {
  const lignes = d.validateurs.map((v) => {
    const etat = v.decision ? DECISIONS[v.decision] : "Non traité";
    const classe = { valide: "ok", attente: "proche", refuse: "retard" }[v.decision] || "";
    return `<li><strong>${echapper(v.nom || "Ancien profil")}</strong> <span class="statut ${classe}">${etat}</span>
      ${v.date ? `<span class="secondaire">le ${dateFr(v.date)}</span>` : ""}
      ${v.motif ? `<div class="motif">« ${echapper(v.motif)} »</div>` : ""}</li>`;
  });
  let tete = "";
  if (d.etat === "refusee" && d.refus) {
    const code = d.refus.code && motifsRefus[d.refus.code] ? `${motifsRefus[d.refus.code]} : ` : "";
    tete = `<p class="refus"><strong>Refusée par ${echapper(d.refus.nom || "")}</strong>${d.refus.date ? ` le ${dateFr(d.refus.date)}` : ""}<br>
      ${echapper(code)}« ${echapper(d.refus.motif || "")} »
      ${d.refus.a_transmettre ? "<br><em>Pas encore envoyé à Qonto : il partira tout seul dès que possible.</em>" : ""}</p>`;
  }
  const articlesTexte = (d.articles || []).map((a) => {
    const art = articles.find((x) => x.id === a.article_id);
    return `${nombre(a.quantite)} × ${echapper(art ? art.nom : "article supprimé")}`;
  });
  const pied = d.articles_saisis || d.etat === "acceptee"
    ? `<p class="secondaire">Articles : ${articlesTexte.length ? articlesTexte.join(", ") : "aucun"}</p>` : "";
  return `${tete}<p class="secondaire" style="margin: 0 0 6px">Validation : ${d.acceptees}/${d.attendues} acceptation${d.attendues > 1 ? "s" : ""}</p>
    <ul>${lignes.join("")}</ul>${pied}`;
}

function nombre(n) {
  return Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 3 });
}

function montrerBulle(bouton) {
  const d = documents.find((x) => x.id === bouton.closest("tr").dataset.id);
  if (!d) return;
  const bulle = $("#bulle-circuit");
  bulle.innerHTML = detailCircuit(d);
  bulle.hidden = false;
  const r = bouton.getBoundingClientRect();
  const largeur = bulle.offsetWidth, hauteur = bulle.offsetHeight;
  bulle.style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - largeur / 2, innerWidth - largeur - 8))}px`;
  bulle.style.top = `${r.bottom + 8 + hauteur > innerHeight ? r.top - hauteur - 8 : r.bottom + 8}px`;
}

const cacherBulle = () => ($("#bulle-circuit").hidden = true);
$("#table-reception").addEventListener("mouseover", (e) => { const b = e.target.closest("[data-info]"); if (b) montrerBulle(b); });
$("#table-reception").addEventListener("mouseout", (e) => { if (e.target.closest("[data-info]")) cacherBulle(); });
$("#table-reception").addEventListener("focusin", (e) => { const b = e.target.closest("[data-info]"); if (b) montrerBulle(b); });
$("#table-reception").addEventListener("focusout", cacherBulle);
addEventListener("scroll", cacherBulle, true);

// --- Chargement et relevé ---------------------------------------------------------------------

async function charger() {
  const r = await apiJson("/api/reception");
  documents = r.documents;
  motifsRefus = r.motifs_refus || {};
  const relie = r.plateforme.relie;
  $("#sans-plateforme").hidden = relie;
  $("#lien-relier").hidden = !peut("factures_clients");   // la connexion se règle dans Facture électronique
  $("#relever").hidden = !relie;
  $("#derniere-releve").textContent = r.derniere_synchro
    ? `Relevée le ${dateFr(r.derniere_synchro.slice(0, 10))} à ${r.derniere_synchro.slice(11, 16)}` : "";
  $("#qui-valide").textContent = (r.validateurs || []).length > 1 ? `Acceptées par : ${r.validateurs.join(", ")}` : "";
  afficher();
  const pastille = $('.pastille-menu[data-pastille="/api/reception/nouveaux"]');   // menu : factures qui attendent la décision de la personne connectée
  if (pastille) {
    const n = documents.filter((d) => enCours(d) && d.peut_decider && d.ma_decision !== "valide").length;
    Object.assign(pastille, { hidden: !n, textContent: n || "" });
    majPastillesSections();
  }
  return relie;
}

async function relever() {
  $("#relever").disabled = true;
  try {
    const r = await envoyerJson("/api/reception/synchroniser", "POST", {});
    await charger();
    messageReception(r.nouvelles === 1 ? "1 nouvelle facture reçue."
      : r.nouvelles ? `${r.nouvelles} nouvelles factures reçues.` : "Aucune nouvelle facture.");
  } catch (err) {
    messageReception(err.message, "erreur");
  }
  $("#relever").disabled = false;
}

$("#filtre-reception").addEventListener("click", (e) => {
  const b = e.target.closest("[data-filtre]");
  if (!b) return;
  filtre = b.dataset.filtre;
  $$("#filtre-reception button").forEach((x) => x.classList.toggle("actif", x === b));
  afficher();
});

// --- Décisions ---------------------------------------------------------------------------------

async function decider(id, corps) {
  const r = await envoyerJson(`/api/reception/${encodeURIComponent(id)}/decision`, "POST", corps);
  if (r.etat === "acceptee") messageReception("Facture acceptée par tous : elle est dans vos factures fournisseurs"
    + " et ses articles sont entrés en stock.");
  else if (r.etat === "refusee") messageReception(r.transmis === false
    ? "Facture refusée. Qonto ne peut pas recevoir le refus pour l'instant : il lui sera envoyé tout seul dès que possible."
    : "Facture refusée : le refus a été transmis à Qonto.");
  else if (corps.decision === "valide") messageReception("Acceptation enregistrée : en attente des autres validations.");
  else if (corps.decision === "attente") messageReception("Facture mise en attente.");
  else messageReception("Décision retirée.");
  await charger();
}

$("#table-reception tbody").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-action]");
  if (!b) return;
  const d = documents.find((x) => x.id === b.closest("tr").dataset.id);
  try {
    if (b.dataset.action === "accepter") return ouvrirAccepter(d);
    if (b.dataset.action === "attente" || b.dataset.action === "refuser") return ouvrirMotif(d, b.dataset.action);
    if (b.dataset.action === "annuler") return await decider(d.id, { decision: "annuler" });
    await envoyerJson(`/api/reception/${encodeURIComponent(d.id)}/${b.dataset.action}`, "POST", {});
    await charger();
  } catch (err) {
    messageReception(err.message, "erreur");
  }
});

$$("dialog [data-fermer]").forEach((b) => (b.onclick = () => b.closest("dialog").close()));

// Accepter : la facture et ses articles

function optionsArticles(choisi) {
  return `<option value="">Choisir un article…</option>` + articles.map((a) =>
    `<option value="${echapper(a.id)}" ${a.id === choisi ? "selected" : ""}>${echapper(a.nom)}${a.isbn || a.ean
      ? ` (${echapper(a.isbn || a.ean)})` : a.reference ? ` (${echapper(a.reference)})` : ""}</option>`).join("");
}

function ajouterLigne(article_id = "", quantite = "") {
  $("#lignes-accepter").insertAdjacentHTML("beforeend", `<tr>
    <td style="width: 70%"><select class="article" style="width: 100%">${optionsArticles(article_id)}</select></td>
    <td><input class="quantite" type="number" min="0" step="any" placeholder="Qté" value="${quantite}" style="width: 90px"></td>
    <td><button type="button" class="lien rouge" data-retirer title="Retirer">×</button></td></tr>`);
  $("#sans-articles").checked = false;
}

async function ouvrirAccepter(d) {
  courant = d;
  articles = await apiJson("/api/reception/articles");
  $("#titre-accepter").textContent = `Accepter la facture ${d.numero || ""} de ${d.fournisseur || "ce fournisseur"}`;
  $("#resume-accepter").innerHTML = `<strong>${euros(d.montant_ttc)} TTC</strong>${d.montant_tva
    ? ` <span class="secondaire">dont TVA ${euros(d.montant_tva)}</span>` : ""}${d.date ? ` · du ${dateFr(d.date)}` : ""}
    ${d.echeance ? ` · échéance ${dateFr(d.echeance)}` : ""}`;
  $("#apercu-accepter").innerHTML = d.piece_id
    ? `<iframe src="/api/reception/${encodeURIComponent(d.id)}/fichier" title="Facture reçue"></iframe>`
    : `<p>Pas de fichier pour cette facture.</p>`;
  $("#aide-articles").textContent = d.articles_saisis
    ? "Articles indiqués par la première personne qui l'a acceptée : vérifiez-les. Ils entreront en stock dès que la facture sera acceptée par tous."
    : d.montant_ttc < 0
      ? "Avoir : indiquez les articles retournés au fournisseur. Ils sortiront du stock dès que l'avoir sera accepté par tous."
      : "Indiquez les articles reçus et leurs quantités, tels qu'ils figurent sur la facture. Ils entreront en stock dès que la facture sera acceptée par tous.";
  $("#lignes-accepter").innerHTML = "";
  (d.articles || []).forEach((a) => ajouterLigne(a.article_id, a.quantite));
  if (!(d.articles || []).length) ajouterLigne();
  $("#sans-articles").checked = !!d.articles_saisis && !(d.articles || []).length;
  if ($("#sans-articles").checked) $("#lignes-accepter").innerHTML = "";
  $("#bloc-nouvel-article").hidden = true;
  const restants = d.attendues - d.acceptees - (d.ma_decision === "valide" ? 0 : 1);
  $("#circuit-accepter").textContent = restants > 0
    ? `Encore ${restants} acceptation${restants > 1 ? "s" : ""} après la vôtre.`
    : "Dernière acceptation attendue : la facture passera dans les factures fournisseurs.";
  $("#erreur-accepter").textContent = "";
  $("#fenetre-accepter").showModal();
}

$("#ajouter-ligne").addEventListener("click", () => ajouterLigne());
$("#lignes-accepter").addEventListener("click", (e) => {
  if (e.target.closest("[data-retirer]")) e.target.closest("tr").remove();
});
$("#sans-articles").addEventListener("change", (e) => {
  if (e.target.checked) $("#lignes-accepter").innerHTML = "";
  else if (!$("#lignes-accepter tr")) ajouterLigne();
});
$("#nouvel-article").addEventListener("click", () => {
  $("#bloc-nouvel-article").hidden = false;
  $("#nom-nouvel-article").value = $("#isbn-nouvel-article").value = "";
  $("#nom-nouvel-article").focus();
});
$("#annuler-article").addEventListener("click", () => ($("#bloc-nouvel-article").hidden = true));
$("#creer-article").addEventListener("click", async () => {
  try {
    const a = await envoyerJson("/api/reception/articles", "POST",
      { nom: $("#nom-nouvel-article").value, isbn: $("#isbn-nouvel-article").value });
    articles.push(a);
    articles.sort((x, y) => x.nom.localeCompare(y.nom));
    $$("#lignes-accepter select.article").forEach((s) => (s.innerHTML = optionsArticles(s.value)));
    const vide = [...$$("#lignes-accepter tr")].find((tr) => !tr.querySelector(".article").value);
    if (vide) vide.querySelector(".article").value = a.id;
    else ajouterLigne(a.id);
    $("#bloc-nouvel-article").hidden = true;
  } catch (err) {
    $("#erreur-accepter").textContent = err.message;
  }
});

$("#form-accepter").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#erreur-accepter").textContent = "";
  const lignes = [...$$("#lignes-accepter tr")].map((tr) => ({
    article_id: tr.querySelector(".article").value, quantite: Number(tr.querySelector(".quantite").value) || 0,
  })).filter((l) => l.article_id || l.quantite);
  if (!lignes.length && !$("#sans-articles").checked) {
    return ($("#erreur-accepter").textContent = "Indiquez les articles, ou cochez « aucun article du stock ».");
  }
  if (lignes.some((l) => !l.article_id)) return ($("#erreur-accepter").textContent = "Choisissez l'article de chaque ligne.");
  if (lignes.some((l) => l.quantite <= 0)) return ($("#erreur-accepter").textContent = "Indiquez la quantité de chaque article.");
  try {
    await decider(courant.id, { decision: "valide", articles: lignes });
    $("#fenetre-accepter").close();
  } catch (err) {
    $("#erreur-accepter").textContent = err.message;
  }
});

// Mettre en attente ou refuser : motif

function ouvrirMotif(d, action) {
  courant = d;
  decisionMotif = action === "refuser" ? "refuse" : "attente";
  const refus = decisionMotif === "refuse";
  const f = $("#form-motif").elements;
  f.motif.value = "";
  f.code.value = "";
  $("#titre-motif").textContent = refus ? "Refuser la facture" : "Mettre la facture en attente";
  $("#encart-refus").hidden = !refus;
  $("#champ-code").hidden = !refus;
  $("#libelle-motif").textContent = refus ? "Précisions (envoyées avec le refus)" : "Motif (visible des autres validateurs)";
  $("#valider-motif").textContent = refus ? "Refuser la facture" : "Mettre en attente";
  $("#valider-motif").className = refus ? "bouton danger" : "bouton";
  $("#erreur-motif").textContent = "";
  $("#fenetre-motif").showModal();
}

$("#form-motif").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  $("#erreur-motif").textContent = "";
  if (decisionMotif === "refuse" && courant.electronique && !f.code.value) {
    return ($("#erreur-motif").textContent = "Choisissez le motif : il est exigé pour une facture électronique.");
  }
  if (!f.motif.value.trim()) return ($("#erreur-motif").textContent = "Précisez le motif.");
  try {
    await decider(courant.id, { decision: decisionMotif, motif: f.motif.value, code_motif: f.code.value });
    $("#fenetre-motif").close();
  } catch (err) {
    $("#erreur-motif").textContent = err.message;
  }
});

$("#relever").addEventListener("click", relever);

(async () => {
  await initialiserPage();
  const relie = await charger();
  $("#form-motif [name=code]").insertAdjacentHTML("beforeend",
    Object.entries(motifsRefus).map(([c, l]) => `<option value="${c}">${echapper(l)}</option>`).join(""));
  articles = await apiJson("/api/reception/articles").catch(() => []);
  if (relie) relever();   // relève à l'ouverture de la page
})();
