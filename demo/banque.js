// Banque : relevés importés (CSV, OFX, CAMT), opérations et rapprochement avec les factures (lettrage).

let operations = [];
let filtre = "a_rapprocher";

const signe = (m) => `<span class="nombre ${m < 0 ? "depense" : "recette"}">${m > 0 ? "+" : ""}${euros(m)}</span>`;
const libelleType = (t) => (t === "client" ? "client" : "fournisseur");

function afficherResume() {
  const mois = aujourdhui().slice(0, 7);
  const duMois = operations.filter((o) => o.date.startsWith(mois));
  const somme = (l) => l.reduce((s, o) => s + o.montant, 0);
  const recettes = somme(duMois.filter((o) => o.montant > 0));
  const depenses = somme(duMois.filter((o) => o.montant < 0));
  const aRapprocher = operations.filter((o) => o.etat === "a_rapprocher");
  const derniere = operations[0]?.date;
  $("#resume-banque").innerHTML = `
    <div class="kpi"><span>Recettes du mois</span><strong>${euros(recettes)}</strong><small>${pluriel(duMois.filter((o) => o.montant > 0).length, "opération")}</small></div>
    <div class="kpi"><span>Dépenses du mois</span><strong>${euros(-depenses)}</strong><small>${pluriel(duMois.filter((o) => o.montant < 0).length, "opération")}</small></div>
    <div class="kpi ${aRapprocher.length ? "rouge" : "vert"}"><span>À rapprocher</span><strong>${aRapprocher.length}</strong>
      <small class="${aRapprocher.length ? "rouge" : ""}">${aRapprocher.filter((o) => o.propositions?.length).length} avec une facture proposée</small></div>
    <div class="kpi"><span>Dernière opération importée</span><strong>${derniere ? dateFr(derniere) : "—"}</strong>
      <small>importez régulièrement vos relevés</small></div>`;
}

function cellRapprochement(o) {
  if (o.etat === "rapprochee") {
    return `<span class="statut ok">Rapprochée</span> ${o.factures_detail.map((f) => `<span class="secondaire">${echapper(f.numero || "")}
      ${echapper(f.tiers)}</span>`).join(", ")}`;
  }
  if (o.etat === "ignoree") return `<span class="statut">Ignorée</span>`;
  const p = o.propositions?.[0];
  if (!p) return `<span class="secondaire">Aucune facture de ce montant</span>`;
  return `<span class="proposition">${echapper(p.numero || "Sans numéro")} · ${echapper(p.tiers)}
    <span class="secondaire">(${libelleType(p.type)}, ${dateFr(p.date_facture)})</span></span>`;
}

function actions(o) {
  if (o.etat === "rapprochee") return `<button type="button" class="lien discret" data-delettrer>Défaire</button>`;
  if (o.etat === "ignoree") return `<button type="button" class="lien discret" data-remettre>Remettre à rapprocher</button>`;
  const p = o.propositions?.[0];
  return `${p ? `<button type="button" class="bouton petit" data-valider="${p.id}">Valider</button>` : ""}
    <button type="button" class="bouton secondaire petit" data-associer>${p ? "Autre…" : "Associer…"}</button>
    <button type="button" class="lien discret" data-ignorer title="Opération sans facture : frais bancaires, virement entre comptes…">Ignorer</button>`;
}

function afficherListe() {
  const q = $("#recherche-banque").value.trim().toLowerCase();
  const liste = operations.filter((o) => (!filtre || o.etat === filtre)
    && (!q || `${o.libelle} ${o.reference} ${o.montant.toFixed(2)} ${euros(o.montant)}`.toLowerCase().includes(q)));
  $("#table-banque tbody").innerHTML = liste.map((o) => `
    <tr data-id="${o.id}">
      <td class="nowrap">${dateFr(o.date)}</td>
      <td class="libelle-banque">${echapper(o.libelle)}${o.reference ? ` <span class="secondaire">${echapper(o.reference)}</span>` : ""}</td>
      <td class="droite">${signe(o.montant)}</td>
      <td>${cellRapprochement(o)}</td>
      <td class="droite actions-ligne">${actions(o)}</td>
    </tr>`).join("");
  $("#table-banque").hidden = !liste.length;
  $("#banque-vide").hidden = !!liste.length;
  $("#banque-vide").textContent = filtre === "a_rapprocher" ? "Tout est rapproché." : "Aucune opération.";
  $("#nb-a-rapprocher").textContent = operations.filter((o) => o.etat === "a_rapprocher").length || "";
}

async function charger() {
  const r = await apiJson("/api/banque");
  operations = r.operations;
  $("#premier-import").hidden = !!operations.length;
  $("#resume-banque").hidden = $("#carte-operations").hidden = !operations.length;
  afficherResume();
  afficherListe();
  majPastilleBanque();
}

function majPastilleBanque() {
  const p = $('[data-pastille="/api/banque/a-rapprocher"]');
  const n = operations.filter((o) => o.etat === "a_rapprocher").length;
  if (p) Object.assign(p, { hidden: !n, textContent: n || "" });
}

function message(texte, type = "ok") {
  $("#message-banque").className = `message ${type}`;
  $("#message-banque").textContent = texte;
}

const resumeImport = (r) => `${pluriel(r.ajoutees, "opération")} ajoutée${r.ajoutees > 1 ? "s" : ""}`
  + ` (du ${dateFr(r.du)} au ${dateFr(r.au)})` + (r.connues ? `, ${r.connues} déjà connue${r.connues > 1 ? "s" : ""}.` : ".");

// --- Import ------------------------------------------------------------------------------------

$("#fichier-releve").addEventListener("change", async (e) => {
  const fichier = e.target.files[0];
  e.target.value = "";
  if (!fichier) return;
  const donnees = new FormData();
  donnees.append("fichier", fichier);
  message("Import en cours…", "");
  try {
    const r = await fetch("/api/banque/importer", { method: "POST", body: donnees });
    const corps = await r.json();
    if (!r.ok) throw new Error(corps.detail || "Import impossible.");
    message(resumeImport(corps));
    filtre = "a_rapprocher";
    $$("#filtre-banque button").forEach((b) => b.classList.toggle("actif", b.dataset.filtre === filtre));
    await charger();
    chercherTelechargements();
  } catch (err) {
    message(err.message, "erreur");
  }
});

// Relevé téléchargé depuis le site de la banque : repéré dans Téléchargements, importé d'un clic
async function chercherTelechargements() {
  const r = await apiJson("/api/banque/telechargements").catch(() => null);
  const f = r?.fichiers?.[0];
  $("#releve-trouve").hidden = !f;
  if (!f) return;
  $("#releve-trouve").innerHTML = `<span>Relevé trouvé dans vos Téléchargements : <strong>${echapper(f.nom)}</strong></span>
    <span class="espace"></span>
    <button type="button" class="bouton petit" data-importer-telechargement>Importer</button>
    <button type="button" class="lien discret" data-ecarter-telechargement>Ce n'est pas un relevé</button>`;
  $("#releve-trouve").dataset.nom = f.nom;
}
$("#releve-trouve").addEventListener("click", async (e) => {
  const nom = $("#releve-trouve").dataset.nom;
  if (e.target.closest("[data-ecarter-telechargement]")) {
    await envoyerJson("/api/banque/telechargements/ecarter", "POST", { nom });
    return chercherTelechargements();
  }
  if (!e.target.closest("[data-importer-telechargement]")) return;
  try {
    message(resumeImport(await envoyerJson("/api/banque/telechargements/importer", "POST", { nom })));
    await charger();
  } catch (err) {
    message(err.message, "erreur");
  }
  chercherTelechargements();
});

// --- Liste et actions ----------------------------------------------------------------------------

$("#filtre-banque").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-filtre]");
  if (!b) return;
  filtre = b.dataset.filtre;
  $$("#filtre-banque button").forEach((x) => x.classList.toggle("actif", x === b));
  afficherListe();
});
$("#recherche-banque").addEventListener("input", afficherListe);

async function lettrer(id, factures, forcer = false) {
  try {
    await envoyerJson(`/api/banque/${id}/lettrer`, "POST", { factures, forcer });
    return true;
  } catch (err) {
    if (!forcer && err.message.includes("écart") && confirm(err.message)) return lettrer(id, factures, true);
    if (!err.message.includes("écart")) alert(err.message);
    return false;
  }
}

$("#table-banque").addEventListener("click", async (e) => {
  const id = e.target.closest("tr")?.dataset.id;
  if (!id) return;
  const op = operations.find((o) => o.id === id);
  if (e.target.closest("[data-valider]")) {
    if (await lettrer(id, [e.target.closest("[data-valider]").dataset.valider])) {
      message(`Rapprochée : la facture ${op.propositions[0].numero} est maintenant payée (${dateFr(op.date)}).`);
      charger();
    }
  } else if (e.target.closest("[data-associer]")) {
    ouvrirLettrage(op);
  } else if (e.target.closest("[data-ignorer]") || e.target.closest("[data-remettre]")) {
    await envoyerJson(`/api/banque/${id}/etat`, "POST", { etat: e.target.closest("[data-ignorer]") ? "ignoree" : "a_rapprocher" });
    charger();
  } else if (e.target.closest("[data-delettrer]")) {
    if (!confirm("Défaire ce rapprochement ? Les factures associées repassent « à payer ».")) return;
    await envoyerJson(`/api/banque/${id}/delettrer`, "POST", {});
    charger();
  }
});

// --- Association à la main (une ou plusieurs factures) ------------------------------------------

let ouvertes = [];
let operationEnCours = null;

async function ouvrirLettrage(op) {
  operationEnCours = op;
  ouvertes = await apiJson("/api/banque/factures-ouvertes");
  // Factures dans le sens de l'opération : clients pour une recette, fournisseurs pour une dépense
  ouvertes = ouvertes.filter((f) => (op.montant > 0) === ((f.type === "client") === (f.montant_ttc > 0)));
  // Même montant d'abord, puis tiers cité dans le libellé
  const libelle = op.libelle.toLowerCase();
  const rang = (f) => (Math.abs(Math.abs(f.montant_ttc) - Math.abs(op.montant)) < 0.005 ? 0 : 2)
    + (f.tiers.toLowerCase().split(/\s+/).some((m) => m.length >= 4 && libelle.includes(m)) ? 0 : 1);
  ouvertes.sort((x, y) => rang(x) - rang(y));
  $("#lettrage-operation").innerHTML = `${dateFr(op.date)} · ${echapper(op.libelle)} · <strong>${euros(op.montant)}</strong>`;
  $("#lettrage-recherche").value = "";
  $("#erreur-lettrage").textContent = "";
  afficherOuvertes();
  $("#fenetre-lettrage").showModal();
}

function afficherOuvertes() {
  const q = $("#lettrage-recherche").value.trim().toLowerCase();
  const cochees = new Set($$("#lettrage-factures input:checked").map((c) => c.value));
  const liste = ouvertes.filter((f) => cochees.has(f.id) || !q
    || `${f.numero} ${f.tiers} ${Math.abs(f.montant_ttc).toFixed(2)} ${euros(f.montant_ttc)}`.toLowerCase().includes(q));
  $("#lettrage-factures").innerHTML = liste.map((f) => `
    <label class="case ligne-lettrage"><input type="checkbox" value="${f.id}" ${cochees.has(f.id) ? "checked" : ""}>
      <span><strong>${echapper(f.numero || "Sans numéro")}</strong> ${echapper(f.tiers)}
        <span class="secondaire">${libelleType(f.type)} · ${dateFr(f.date_facture)}</span></span>
      <span class="nombre">${euros(Math.abs(f.montant_ttc))}</span></label>`).join("")
    || `<p class="secondaire">Aucune facture en attente de paiement${q ? " pour cette recherche" : ""}.</p>`;
  majTotal();
}

function majTotal() {
  const ids = $$("#lettrage-factures input:checked").map((c) => c.value);
  const total = ouvertes.filter((f) => ids.includes(f.id)).reduce((s, f) => s + Math.abs(f.montant_ttc), 0);
  const ecart = Math.abs(operationEnCours.montant) - total;
  $("#lettrage-total").textContent = ids.length
    ? `${pluriel(ids.length, "facture")} : ${euros(total)}` + (Math.abs(ecart) > 0.005 ? ` (écart de ${euros(ecart)})` : " : le compte est bon.")
    : "Cochez la ou les factures réglées par cette opération.";
  $("#valider-lettrage").disabled = !ids.length;
}

$("#lettrage-recherche").addEventListener("input", afficherOuvertes);
$("#lettrage-factures").addEventListener("change", majTotal);
$("#form-lettrage").addEventListener("submit", async (e) => {
  e.preventDefault();
  const ids = $$("#lettrage-factures input:checked").map((c) => c.value);
  if (ids.length && await lettrer(operationEnCours.id, ids)) {
    $("#fenetre-lettrage").close();
    message(`Rapprochée : ${pluriel(ids.length, "facture")} passée${ids.length > 1 ? "s" : ""} « payée${ids.length > 1 ? "s" : ""} ».`);
    charger();
  }
});
$$("#fenetre-lettrage [data-fermer]").forEach((b) => b.addEventListener("click", () => $("#fenetre-lettrage").close()));

(async () => {
  await initialiserPage();
  await charger();
  chercherTelechargements();
})();
