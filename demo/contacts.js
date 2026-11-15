// Contacts : annuaire des clients et fournisseurs, avec leur activité.

let contacts = [];
const filtre = { type: "client", q: "" };
let contactEdite = null;

const STATUTS_DEVIS = { en_attente: "En attente", accepte: "Accepté", refuse: "Refusé" };

// --- Annuaire --------------------------------------------------------------------

async function charger() {
  contacts = await apiJson("/api/contacts");
  for (const type of ["client", "fournisseur"]) {
    $(`#nb-${type}`).textContent = contacts.filter((c) => c.type === type).length || "";
  }
  afficher();
}

// Clé de classement : nom de famille pour une personne (« Mme Claire Martin » -> Martin),
// sinon le nom tel quel (« SCI Les Tilleuls », « Boulangerie Petit »)
const RE_CIVILITE = /^(m\.?|mr|mme|mlle|madame|monsieur)(\s+et\s+(m\.?|mme))?\s+/i;
const cleTri = (nom) => {
  const sansAccent = nom.trim().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return (RE_CIVILITE.test(sansAccent) ? sansAccent.split(/\s+/).at(-1) : sansAccent).toUpperCase();
};
const initiale = (nom) => {
  const lettre = cleTri(nom).charAt(0);
  return /[A-Z]/.test(lettre) ? lettre : "#";
};

function afficher() {
  const q = filtre.q.toLowerCase();
  const visibles = contacts.filter((c) => c.type === filtre.type && (!q ||
    `${c.nom} ${c.personne} ${c.ville} ${c.telephone} ${c.email}`.toLowerCase().includes(q)));

  // Regroupement alphabétique (sans tenir compte de « M. », « SARL »…)
  const groupes = {};
  for (const c of visibles) (groupes[initiale(c.nom)] ||= []).push(c);
  const lettres = Object.keys(groupes).sort((a, b) => (a === "#") - (b === "#") || a.localeCompare(b));

  $("#annuaire").innerHTML = lettres.map((lettre) => `
    <div class="groupe-lettre">
      <div class="lettre">${lettre}</div>
      <div class="fiches">
        ${groupes[lettre].sort((a, b) => cleTri(a.nom).localeCompare(cleTri(b.nom))).map((c) => `
          <button type="button" class="fiche-contact" data-id="${c.id}">
            <strong>${echapper(c.nom)}</strong>
            ${c.personne ? `<span>${echapper(c.personne)}</span>` : ""}
            ${c.ville ? `<span>${echapper([c.code_postal, c.ville].filter(Boolean).join(" "))}</span>` : ""}
            ${c.telephone ? `<span>${echapper(c.telephone)}</span>` : ""}
            ${c.email ? `<span>${echapper(c.email)}</span>` : ""}
          </button>`).join("")}
      </div>
    </div>`).join("");

  $("#resume-liste").textContent = visibles.length ? pluriel(visibles.length, filtre.type === "client" ? "client" : "fournisseur") : "";
  $("#vide").hidden = !!visibles.length;
  $("#vide").textContent = filtre.q ? "Aucun contact ne correspond à la recherche."
    : `Aucun ${filtre.type} pour l'instant. Ils s'ajoutent automatiquement avec vos devis et factures, ou via « Nouveau contact ».`;
}

$$(".onglets button").forEach((b) => b.addEventListener("click", () => {
  filtre.type = b.dataset.type;
  $$(".onglets button").forEach((x) => x.classList.toggle("actif", x === b));
  afficher();
}));
$("#recherche").addEventListener("input", (e) => { filtre.q = e.target.value.trim(); afficher(); });
$("#annuaire").addEventListener("click", (e) => {
  const fiche = e.target.closest("[data-id]");
  if (fiche) ouvrir(contacts.find((c) => c.id === fiche.dataset.id));
});

// --- Fiche ------------------------------------------------------------------------

const form = $("#form-contact");

function ligneActivite(gauche, droite, detail = "") {
  return `<tr><td>${gauche}${detail ? `<div class="secondaire">${detail}</div>` : ""}</td><td class="droite nombre">${droite}</td></tr>`;
}

async function afficherActivite(contact) {
  const a = await apiJson(`/api/contacts/${contact.id}/activite`);
  const blocs = [];
  if (a.rendez_vous.length) {
    blocs.push(`<h3>Rendez-vous</h3><table class="tableau compact"><tbody>${a.rendez_vous.map((r) =>
      ligneActivite(`<a href="agenda.html?date=${r.date}">${echapper(r.titre)}</a>`, `${dateFr(r.date)} · ${r.debut}`, echapper(r.lieu))).join("")}</tbody></table>`);
  }
  if (a.devis.length) {
    blocs.push(`<h3>Devis</h3><table class="tableau compact"><tbody>${a.devis.map((d) =>
      ligneActivite(`<a href="/api/devis/${encodeURIComponent(d.numero)}/pdf" target="_blank">${echapper(d.numero)}</a>`,
                    euros(d.total_ttc), `${dateFr(d.date)} · ${STATUTS_DEVIS[d.statut]}${d.objet ? " · " + echapper(d.objet) : ""}`)).join("")}</tbody></table>`);
  }
  if (a.factures.length) {
    const reste = a.factures.filter((f) => !f.payee && f.statut !== "annulee").reduce((s, f) => s + f.montant_ttc, 0);
    blocs.push(`<h3>Factures${reste ? ` · ${euros(reste)} ${contact.type === "client" ? "à encaisser" : "à payer"}` : ""}</h3>
      <table class="tableau compact"><tbody>${a.factures.map((f) =>
        ligneActivite(echapper(f.numero || "Sans numéro"), euros(f.montant_ttc),
                      f.statut === "annulee" ? `Annulée par ${echapper(f.annulee_par)}`
                        : f.payee ? `Réglée le ${dateFr(f.date_paiement)}` : `Échéance ${dateFr(f.date_echeance) || "non précisée"}`)).join("")}</tbody></table>`);
  }
  $("#activite").innerHTML = blocs.length ? blocs.join("")
    : `<h3>Activité</h3><p class="aide">Aucun devis, facture ni rendez-vous pour ce contact.</p>`;
}

function ouvrir(contact = null) {
  contactEdite = contact;
  form.reset();
  const valeurs = contact || { type: filtre.type };
  for (const champ of form.elements) {
    if (!champ.name || !(champ.name in valeurs)) continue;
    if (champ.type === "radio") champ.checked = champ.value === valeurs.type;
    else if (champ.type === "checkbox") champ.checked = !!valeurs[champ.name];
    else champ.value = valeurs[champ.name] ?? "";
  }
  $("#titre-fiche").textContent = contact ? contact.nom : "Nouveau contact";
  $("#supprimer").hidden = !contact;
  $("#photos-contact").hidden = !contact;
  $("#activite").hidden = !contact;
  $("#corps-fiche").style.gridTemplateColumns = contact ? "" : "1fr";
  $("#erreur").textContent = "";
  $("#activite").innerHTML = "";
  if (contact) afficherActivite(contact);
  $("#fenetre").showModal();
  form.elements.nom.focus();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!form.elements.nom.value.trim()) return form.elements.nom.reportValidity();
  const donnees = {};
  for (const champ of form.elements) {
    if (champ.type === "checkbox") donnees[champ.name] = champ.checked;
    else if (champ.name && (champ.type !== "radio" || champ.checked)) donnees[champ.name] = champ.value.trim();
  }
  try {
    if (contactEdite) await envoyerJson(`/api/contacts/${contactEdite.id}`, "PUT", donnees);
    else await envoyerJson("/api/contacts", "POST", donnees);
  } catch (err) {
    $("#erreur").textContent = err.message;
    return;
  }
  $("#fenetre").close();
  await charger();
});

$("#supprimer").addEventListener("click", async () => {
  if (!confirm(`Retirer « ${contactEdite.nom} » de l'annuaire ?\nSes devis et factures ne sont pas supprimés.`)) return;
  await api(`/api/contacts/${contactEdite.id}`, { method: "DELETE" });
  $("#fenetre").close();
  await charger();
});

$$("[data-fermer]").forEach((b) => b.addEventListener("click", () => $("#fenetre").close()));
$("#nouveau-contact").addEventListener("click", () => ouvrir());
$("#photos-contact").addEventListener("click", () => {
  const contact = contactEdite;
  $("#fenetre").close();
  ouvrirPhotos({ type: "contact", cible: contact.id, titre: `Photos : ${contact.nom}` });
});

(async () => {
  await initialiserPage();
  await charger();
  // Lien de la recherche globale : ouvre la fiche du contact
  const cible = contacts.find((c) => c.id === parametre("contact"));
  if (cible) {
    $(`.onglets [data-type="${cible.type}"]`).click();
    ouvrir(cible);
  }
})();
