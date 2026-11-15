// Agenda : vue semaine (lundi → dimanche, 7 h → 21 h), rendez-vous et tâches des factures.

const HEURE_DEBUT = 7;
const HEURE_FIN = 21;
const HAUTEUR_HEURE = 48;                 // px, doit correspondre à --heure dans style.css
const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

let lundi = debutSemaine(new URLSearchParams(location.search).get("date") || aujourdhui());
let semaine = { rendez_vous: [], taches: [], taches_en_retard: 0 };
let contacts = [];
let rdvEdite = null;

function debutSemaine(iso) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
function jourIso(decalage) {
  const d = new Date(lundi);
  d.setDate(d.getDate() + decalage);
  return dateIso(d);
}
const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// --- Chargement --------------------------------------------------------------------

async function charger() {
  semaine = await apiJson(`/api/agenda?debut=${jourIso(0)}&fin=${jourIso(6)}`);
  const fin = new Date(lundi);
  fin.setDate(fin.getDate() + 6);
  const options = { day: "numeric", month: "long" };
  $("#periode").textContent = `Semaine du ${lundi.toLocaleDateString("fr-FR", options)} au ${fin.toLocaleDateString("fr-FR", { ...options, year: "numeric" })}`;
  $("#retards").hidden = !semaine.taches_en_retard;
  const n = semaine.taches_en_retard;
  $("#retards").innerHTML = `${n} facture${n > 1 ? "s" : ""} en retard ${n > 1 ? "ne figurent" : "ne figure"} pas dans cette semaine.
    <a href="factures.html">Voir les factures</a>`;
  dessiner();
}

// --- Calendrier --------------------------------------------------------------------

// Rendez-vous qui se chevauchent : placés côte à côte
function disposer(rdvs) {
  const tries = [...rdvs].sort((a, b) => a.debut.localeCompare(b.debut) || b.fin.localeCompare(a.fin));
  const resultat = [];
  let groupe = [], finGroupe = 0;
  const fermer = () => {
    const nb = Math.max(...groupe.map((x) => x.colonne)) + 1;
    groupe.forEach((x) => resultat.push({ ...x, colonnes: nb }));
    groupe = [];
  };
  for (const r of tries) {
    const debut = minutes(r.debut), fin = minutes(r.fin);
    if (groupe.length && debut >= finGroupe) fermer();
    const occupees = groupe.filter((x) => minutes(x.rdv.fin) > debut).map((x) => x.colonne);
    let colonne = 0;
    while (occupees.includes(colonne)) colonne++;
    groupe.push({ rdv: r, colonne });
    finGroupe = Math.max(finGroupe, fin);
  }
  if (groupe.length) fermer();
  return resultat;
}

function dessiner() {
  const jours = [...Array(7).keys()].map(jourIso);
  const auj = aujourdhui();
  const heures = [...Array(HEURE_FIN - HEURE_DEBUT).keys()].map((i) => HEURE_DEBUT + i);

  const entetes = jours.map((j, i) => `
    <div class="cal-jour ${j === auj ? "aujourdhui" : ""}">
      <span>${JOURS[i]}</span><strong>${Number(j.slice(8))}</strong>
    </div>`).join("");

  const taches = jours.map((j) => `<div class="cal-taches-jour">${semaine.taches.filter((t) => t.date === j).map((t) => `
    <label class="tache ${t.fait ? "fait" : ""} ${t.en_retard ? "retard" : ""} ${t.type}" title="${echapper(t.titre)} · ${euros(t.montant)}">
      <input type="checkbox" data-facture="${t.facture_id}" data-type="${t.type}" ${t.fait ? "checked" : ""}>
      <span>${echapper(t.titre)}</span><small>${euros(t.montant)}</small>
    </label>`).join("")}</div>`).join("");

  const colonnes = jours.map((j) => {
    const blocs = disposer(semaine.rendez_vous.filter((r) => r.date === j)).map(({ rdv, colonne, colonnes: nb }) => {
      const debut = Math.max(minutes(rdv.debut), HEURE_DEBUT * 60);
      const fin = Math.min(Math.max(minutes(rdv.fin), debut + 20), HEURE_FIN * 60);
      const haut = (debut - HEURE_DEBUT * 60) / 60 * HAUTEUR_HEURE;
      const hauteur = Math.max((fin - debut) / 60 * HAUTEUR_HEURE - 2, 20);
      const detail = [`${rdv.debut} – ${rdv.fin}`, rdv.contact_nom, rdv.lieu].filter(Boolean).join(" · ");
      // Moins de 45 min : une seule ligne « 10:30 Appel du comptable » (le détail au survol)
      const court = minutes(rdv.fin) - minutes(rdv.debut) < 45;
      return `<button type="button" class="rdv ${court ? "court" : ""}" data-id="${rdv.id}"
        title="${echapper(rdv.titre)}\n${echapper(detail)}"
        style="top:${haut}px;height:${hauteur}px;left:calc(${colonne * 100 / nb}% + 2px);width:calc(${100 / nb}% - 4px)">
        ${court
          ? `<strong><span class="heure">${rdv.debut}</span> ${echapper(rdv.titre)}</strong>`
          : `<strong>${echapper(rdv.titre)}</strong>
             <span>${rdv.debut} – ${rdv.fin}${rdv.contact_nom ? " · " + echapper(rdv.contact_nom) : ""}</span>
             ${rdv.lieu ? `<span>${echapper(rdv.lieu)}</span>` : ""}`}
      </button>`;
    }).join("");
    const maintenant = new Date();
    const ligneMaintenant = j === auj && maintenant.getHours() >= HEURE_DEBUT && maintenant.getHours() < HEURE_FIN
      ? `<div class="maintenant" style="top:${(maintenant.getHours() * 60 + maintenant.getMinutes() - HEURE_DEBUT * 60) / 60 * HAUTEUR_HEURE}px"></div>` : "";
    return `<div class="cal-colonne ${j === auj ? "aujourdhui" : ""}" data-date="${j}">${blocs}${ligneMaintenant}</div>`;
  }).join("");

  $("#calendrier").innerHTML = `
    <div class="cal-coin"></div>${entetes}
    <div class="cal-libelle">Tâches</div>${taches}
    <div class="cal-heures">${heures.map((h) => `<div><span>${h} h</span></div>`).join("")}</div>${colonnes}`;
}

// Cocher une tâche = marquer la facture payée / encaissée (comme sur la page Factures)
$("#calendrier").addEventListener("change", async (e) => {
  const case_ = e.target.closest("[data-facture]");
  if (!case_) return;
  let motif = "";
  if (!case_.checked && case_.dataset.type === "client") {
    motif = prompt("Ce règlement ne sera pas effacé : une écriture d'annulation est ajoutée au journal des "
      + "encaissements.\n\nMotif :", "");
    if (motif === null || !motif.trim()) {
      case_.checked = true;
      return;
    }
  }
  try {
    await envoyerJson(`/api/factures/${case_.dataset.facture}/paiement`, "POST",
                      { payee: case_.checked, date_paiement: aujourdhui(), motif });
  } catch (err) {
    alert(err.message);
  }
  await charger();
});

$("#calendrier").addEventListener("click", (e) => {
  const bloc = e.target.closest(".rdv");
  if (bloc) return ouvrir(semaine.rendez_vous.find((r) => r.id === bloc.dataset.id));
  const colonne = e.target.closest(".cal-colonne");
  if (!colonne || e.target !== colonne) return;
  // Créneau cliqué, arrondi à la demi-heure (proportion de la colonne : juste quelle que
  // soit la taille de l'interface)
  const zone = colonne.getBoundingClientRect();
  const minutesCliquees = (e.clientY - zone.top) / zone.height * (HEURE_FIN - HEURE_DEBUT) * 60;
  const debut = HEURE_DEBUT * 60 + Math.floor(minutesCliquees / 30) * 30;
  ouvrir(null, { date: colonne.dataset.date, debut: hhmm(debut), fin: hhmm(Math.min(debut + 60, 23 * 60 + 30)) });
});

// --- Navigation --------------------------------------------------------------------

function decaler(jours) {
  lundi.setDate(lundi.getDate() + jours);
  history.replaceState(null, "", `?date=${jourIso(0)}`);
  charger();
}
$("#precedente").addEventListener("click", () => decaler(-7));
$("#suivante").addEventListener("click", () => decaler(7));
$("#aujourdhui").addEventListener("click", () => {
  lundi = debutSemaine(aujourdhui());
  history.replaceState(null, "", location.pathname);
  charger();
});

// --- Fenêtre rendez-vous ------------------------------------------------------------

const form = $("#form-rdv");

function remplirContacts() {
  const groupe = (type, libelle) => {
    const liste = contacts.filter((c) => c.type === type);
    return liste.length ? `<optgroup label="${libelle}">${liste.map((c) => `<option value="${c.id}">${echapper(c.nom)}</option>`).join("")}</optgroup>` : "";
  };
  form.elements.contact_id.innerHTML = `<option value="">Aucun</option>${groupe("client", "Clients")}${groupe("fournisseur", "Fournisseurs")}`;
}

function ouvrir(rdv = null, valeursParDefaut = {}) {
  rdvEdite = rdv;
  form.reset();
  const valeurs = rdv || { date: aujourdhui(), debut: "09:00", fin: "10:00", ...valeursParDefaut };
  for (const champ of form.elements) {
    if (champ.name && champ.name in valeurs) champ.value = valeurs[champ.name] ?? "";
  }
  $("#titre-fenetre").textContent = rdv ? "Rendez-vous" : "Nouveau rendez-vous";
  $("#supprimer").hidden = !rdv;
  $("#erreur").textContent = "";
  $("#fenetre").showModal();
  form.elements.titre.focus();
}

// Décaler la fin quand on change le début (même durée)
let dureeAvant = 60;
form.elements.debut.addEventListener("focus", () => {
  dureeAvant = minutes(form.elements.fin.value) - minutes(form.elements.debut.value);
});
form.elements.debut.addEventListener("change", () => {
  if (!form.elements.debut.value || dureeAvant <= 0) return;
  form.elements.fin.value = hhmm(Math.min(minutes(form.elements.debut.value) + dureeAvant, 23 * 60 + 59));
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const v = form.elements;
  if (!v.titre.value.trim()) return v.titre.reportValidity();
  const donnees = { titre: v.titre.value.trim(), date: v.date.value, debut: v.debut.value, fin: v.fin.value,
                    contact_id: v.contact_id.value, lieu: v.lieu.value.trim(), notes: v.notes.value };
  try {
    if (rdvEdite) await envoyerJson(`/api/agenda/${rdvEdite.id}`, "PUT", donnees);
    else await envoyerJson("/api/agenda", "POST", donnees);
  } catch (err) {
    $("#erreur").textContent = err.message;
    return;
  }
  $("#fenetre").close();
  // Affiche la semaine du rendez-vous si elle a changé
  if (donnees.date < jourIso(0) || donnees.date > jourIso(6)) lundi = debutSemaine(donnees.date);
  await charger();
});

$("#supprimer").addEventListener("click", async () => {
  if (!confirm(`Supprimer le rendez-vous « ${rdvEdite.titre} » ?`)) return;
  await api(`/api/agenda/${rdvEdite.id}`, { method: "DELETE" });
  $("#fenetre").close();
  await charger();
});

$$("[data-fermer]").forEach((b) => b.addEventListener("click", () => $("#fenetre").close()));
$("#nouveau-rdv").addEventListener("click", () => ouvrir());

(async () => {
  await initialiserPage();
  contacts = await apiJson("/api/contacts");
  remplirContacts();
  await charger();
  // Lien de la recherche globale : ouvre le rendez-vous
  const cible = semaine.rendez_vous.find((r) => r.id === parametre("rdv"));
  if (cible) ouvrir(cible);
})();
