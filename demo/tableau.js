// Pilotage : chiffres de l'activité et trésorerie prévisionnelle (calculés par le serveur).

const signe = (x) => (x > 0 ? "+" : x < 0 ? "−" : "") + euros(Math.abs(x)).replace("-", "");

function evolution(pourcent, libelle) {
  if (pourcent === null || pourcent === undefined) return `<small>${libelle} : pas de comparaison</small>`;
  const classe = pourcent > 0 ? "hausse" : pourcent < 0 ? "baisse" : "";
  return `<small><span class="evolution ${classe}">${pourcent > 0 ? "+" : ""}${pourcent.toLocaleString("fr-FR")} %</span> ${libelle}</small>`;
}

const kpi = (titre, valeur, detail = "") =>
  `<div class="kpi"><span>${titre}</span><strong>${valeur}</strong>${detail}</div>`;

function afficherActivite(t) {
  const m = t.mois_en_cours, a = t.annee_en_cours;
  const nomMois = new Date().toLocaleDateString("fr-FR", { month: "long" });
  $("#kpis-activite").innerHTML =
    kpi(`Facturé en ${nomMois}`, euros(m.facture), evolution(m.evolution_facture, `vs ${nomMois} ${new Date().getFullYear() - 1}`)) +
    kpi(`Encaissé en ${nomMois}`, euros(m.encaisse), evolution(m.evolution_encaisse, "sur un an")) +
    kpi(`Facturé depuis le 1er janvier`, euros(a.facture), evolution(a.evolution_facture, "vs même période N-1")) +
    kpi(`Encaissé − dépenses depuis janvier`, signe(a.encaisse - a.depenses),
        `<small>${euros(a.encaisse)} encaissés · ${euros(a.depenses)} payés</small>`);

  const d = t.devis, p = t.paiements;
  $("#kpis-suivi").innerHTML =
    kpi("Devis acceptés (12 mois)", d.taux_acceptation === null ? "—" : `${d.taux_acceptation} %`,
        `<small>${d.acceptes} accepté${d.acceptes > 1 ? "s" : ""} · ${d.refuses} refusé${d.refuses > 1 ? "s" : ""} · ${euros(d.montant_accepte)}</small>`) +
    kpi("Devis en attente", `${d.en_attente}`, `<small>${euros(d.montant_en_attente)} à signer · <a href="devis.html">voir</a></small>`) +
    kpi("Délai moyen de paiement", p.delai_moyen_jours === null ? "—" : pluriel(p.delai_moyen_jours, "jour"),
        `<small>sur ${pluriel(p.nombre, "facture")} réglée${p.nombre > 1 ? "s" : ""} en 12 mois</small>`) +
    kpi("Factures clients en retard", euros(p.montant_en_retard),
        p.en_retard ? `<small class="rouge">${pluriel(p.en_retard, "facture")} · <a href="index.html">relancer</a></small>`
                    : `<small>aucune</small>`);

  const max = Math.max(1, ...t.douze_mois.flatMap((x) => [x.facture, x.encaisse]));
  $("#histogramme").innerHTML = t.douze_mois.map((x) => `
    <div class="mois" title="${x.libelle} : facturé ${euros(x.facture)}, encaissé ${euros(x.encaisse)}">
      <div class="colonnes">
        <div class="colonne" style="height: ${Math.max(0, x.facture) / max * 100}%"></div>
        <div class="colonne encaisse" style="height: ${Math.max(0, x.encaisse) / max * 100}%"></div>
      </div>
      <span class="libelle">${x.libelle}</span>
    </div>`).join("");

  $("#meilleurs-clients").innerHTML = t.meilleurs_clients.length ? t.meilleurs_clients.map((c) => `
    <div style="margin-bottom: 12px">
      <div class="actions" style="justify-content: space-between">
        <strong>${echapper(c.nom)}</strong><span class="nombre">${euros(c.montant)} <span class="secondaire">· ${c.part} %</span></span>
      </div>
      <div class="jauge"><div style="width: ${c.part}%"></div></div>
    </div>`).join("")
    : `<p class="aide">Aucune facture client sur les 12 derniers mois.</p>`;
}

// --- Trésorerie --------------------------------------------------------------------------------

function courbe(points, pointBas) {
  const L = 900, H = 180, marge = 34;
  const valeurs = points.map((p) => p.solde);
  const min = Math.min(0, ...valeurs), max = Math.max(0, ...valeurs);
  const etendue = max - min || 1;
  const x = (i) => marge + i / (points.length - 1) * (L - marge - 6);
  const y = (v) => 8 + (max - v) / etendue * (H - 30);
  const trace = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.solde).toFixed(1)}`).join(" ");
  const iBas = points.findIndex((p) => p.date === pointBas.date);
  const reperes = [0, 30, 60, 90].map((j) => `
    <line x1="${x(j)}" x2="${x(j)}" y1="8" y2="${H - 22}" stroke="var(--bord)"/>
    <text x="${x(j)}" y="${H - 6}" text-anchor="middle" font-size="11" fill="var(--gris)">${j ? `J+${j}` : "Auj."}</text>`).join("");
  return `<svg viewBox="0 0 ${L} ${H}" preserveAspectRatio="none" role="img" aria-label="Solde prévu sur 90 jours">
    ${reperes}
    <line x1="${marge}" x2="${L - 6}" y1="${y(0)}" y2="${y(0)}" stroke="var(--erreur)" stroke-dasharray="4 4" opacity=".5"/>
    <path d="${trace}" fill="none" stroke="var(--couleur)" stroke-width="2.2" vector-effect="non-scaling-stroke"/>
    <circle cx="${x(iBas)}" cy="${y(pointBas.solde)}" r="4" fill="${pointBas.solde < 0 ? "var(--erreur)" : "var(--couleur)"}"/>
  </svg>`;
}

function afficherTresorerie(t) {
  const avecSolde = !!t.solde;
  $("#solde").value = avecSolde ? t.solde.montant : "";
  $("#col-solde").hidden = !avecSolde;
  $("#courbe").hidden = !avecSolde;
  if (avecSolde) {
    const bas = t.point_bas;
    $("#info-solde").innerHTML = `Solde indiqué le ${dateFr(t.solde.date)}. Point le plus bas prévu :
      <strong class="${bas.solde < 0 ? "rouge" : ""}">${euros(bas.solde)}</strong> le ${dateFr(bas.date)}
      ${bas.solde < 0 ? " — anticipez : relancez les retards ou décalez des achats." : "."}`;
    $("#courbe").innerHTML = courbe(t.courbe, bas);
  } else {
    $("#info-solde").textContent = "Indiquez votre solde bancaire actuel pour voir le solde prévu jour par jour sur 90 jours.";
  }

  $("#table-tresorerie tbody").innerHTML = t.tranches.map((tr) => {
    const ecart = tr.entrees - tr.sorties;
    const vide = !tr.factures.length;
    return `<tr class="${vide ? "secondaire" : "cliquable"}" data-cle="${tr.cle}">
      <td>${tr.libelle}${vide ? "" : ` <span class="secondaire">(${tr.factures.length})</span>`}</td>
      <td class="droite nombre">${tr.entrees ? euros(tr.entrees) : "—"}</td>
      <td class="droite nombre">${tr.sorties ? euros(tr.sorties) : "—"}</td>
      <td class="droite nombre ${ecart < 0 ? "rouge" : ""}">${vide ? "—" : signe(ecart)}</td>
      ${avecSolde ? `<td class="droite nombre ${tr.solde_prevu < 0 ? "rouge" : ""}"><strong>${tr.solde_prevu === undefined ? "" : euros(tr.solde_prevu)}</strong></td>` : ""}
    </tr>
    <tr class="detail-tranche" data-detail="${tr.cle}" hidden><td colspan="5">
      ${tr.factures.map((f) => (f.prevu   // échéance à venir d'un prélèvement ou contrat récurrent
        ? `<a class="lien" href="factures.html?onglet=frais">Prélèvement prévu ${echapper(f.tiers)} · ${echapper(f.numero)}</a>`
        : `<a class="lien" href="factures.html?facture=${f.id}">${f.type === "client" ? "Encaisser" : "Payer"}
        ${echapper(f.tiers)}${f.numero ? " · " + echapper(f.numero) : ""}</a>`)
        + ` <span class="secondaire">${f.echeance ? dateFr(f.echeance) : "sans échéance"} · ${euros(f.montant)}</span>`).join("<br>")}
    </td></tr>`;
  }).join("");
}

$("#table-tresorerie tbody").addEventListener("click", (e) => {
  const tr = e.target.closest("tr[data-cle]");
  if (!tr || e.target.closest("a")) return;
  const detail = $(`[data-detail="${tr.dataset.cle}"]`);
  if (detail && tr.classList.contains("cliquable")) detail.hidden = !detail.hidden;
});

$("#form-solde").addEventListener("submit", async (e) => {
  e.preventDefault();
  const valeur = $("#solde").value.trim();
  afficherTresorerie(await envoyerJson("/api/tresorerie/solde", "PUT", { montant: valeur === "" ? null : Number(valeur) }));
});

// Hors taxes (chiffre d'affaires, comme pour l'URSSAF et les impôts) ou TTC ; choix mémorisé
let enHT = true;
try { enHT = localStorage.getItem("tableau-ht") !== "false"; } catch {}

async function chargerActivite() {
  $$("#choix-ht button").forEach((b) => b.classList.toggle("actif", (b.dataset.ht === "true") === enHT));
  $("#sous-titre").textContent = `Votre activité au ${new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`
    + ` (montants ${enHT ? "hors taxes" : "TTC"}).`;
  afficherActivite(await apiJson(`/api/tableau-de-bord?ht=${enHT}`));
}

$$("#choix-ht button").forEach((b) => b.addEventListener("click", () => {
  enHT = b.dataset.ht === "true";
  try { localStorage.setItem("tableau-ht", String(enHT)); } catch {}
  chargerActivite();
}));

(async () => {
  await initialiserPage();
  await chargerActivite();
  afficherTresorerie(await apiJson("/api/tresorerie"));
})();
