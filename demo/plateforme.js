// Facture électronique : factures aux professionnels envoyées par Qonto (à envoyer, à régler, envoyées et
// leur statut), et totaux des ventes aux particuliers à déclarer (calculés par le serveur).

const NATURES_DOC = { facture: "Facture", acompte: "Acompte", solde: "Solde", avoir: "Avoir" };
const ATTENTE = "En attente de confirmation de Qonto";
const PAR_EMAIL = "Envoyée par e-mail par Qonto";
let etat = { a_envoyer: [], a_regler: [], envoyees: [] };
let qontoRelie = false;

// Couleur du statut : vert dès que la facture est arrivée chez le client, rouge si refusée ou bloquée
function classeStatut(f) {
  const c = f.plateforme_code;
  if ([207, 208, 210, 213].includes(c) || (f.plateforme_statut || "").startsWith("Non confirmée")) return "retard";
  if (c >= 202 || f.plateforme_statut === PAR_EMAIL) return "ok";
  if (!c && f.plateforme_statut) return "proche";   // envoi demandé, Qonto n'a pas encore confirmé
  return "";
}

const numeroFacture = (f) => `<strong>${echapper(f.numero || "Sans numéro")}</strong>${f.nature && f.nature !== "facture"
  ? ` <span class="secondaire">${NATURES_DOC[f.nature] || ""}</span>` : ""}`;
const nomClient = (f) => `${echapper(f.tiers)}${f.client_pro ? "" : ` <span class="secondaire">· particulier</span>`}`;

function afficherResume() {
  const somme = (l) => euros(l.reduce((s, f) => s + f.montant_ttc, 0));
  const enCours = etat.envoyees.filter((f) => classeStatut(f) === "proche" || [200, 201].includes(f.plateforme_code));
  const recues = etat.envoyees.filter((f) => classeStatut(f) === "ok");
  const n = etat.a_regler.length;
  $("#resume-envoi").innerHTML = `
    <div class="kpi"><span>À envoyer</span><strong>${etat.a_envoyer.length}</strong><small>${somme(etat.a_envoyer)}</small></div>
    <div class="kpi"><span>En cours d'envoi</span><strong>${enCours.length}</strong><small>${somme(enCours)}</small></div>
    <div class="kpi ${n ? "rouge" : ""}"><span>À régler</span><strong>${n}</strong>
      <small class="${n ? "rouge" : ""}">${n ? "voir ci-dessous" : "rien à régler"}</small></div>
    <div class="kpi vert"><span>Reçues par vos clients</span><strong>${recues.length}</strong><small>${somme(recues)}</small></div>`;
}

// Chaque blocage se règle sur sa ligne
function actionsARegler(f) {
  const pdf = `<a class="lien" href="/api/factures/${f.id}/fichier" download="${echapper(f.numero)}.pdf">PDF</a>`;
  if (f.action === "reessayer") return `<button type="button" class="bouton petit" data-reessayer>Réessayer</button>`;
  if (f.action === "autrement") return `${pdf} <button type="button" class="bouton secondaire petit" data-autrement
    title="Envoyée au client par e-mail ou autrement : elle sort de cette liste">Marquer comme envoyée</button>`;
  if (f.action === "voir" && f.plateforme_url) {
    return `<a class="lien" target="_blank" href="${echapper(f.plateforme_url)}">Voir sur Qonto</a>`;
  }
  return `<a class="lien" href="factures.html?espace=clients&onglet=factures">Ouvrir les factures clients</a>`;
}

async function chargerDepot() {
  etat = await apiJson("/api/plateforme");
  afficherResume();

  $("#carte-a-regler").hidden = !etat.a_regler.length;
  $("#nb-a-regler").textContent = etat.a_regler.length;
  $("#table-a-regler").innerHTML = etat.a_regler.map((f) => `
    <tr data-id="${f.id}">
      <td>${numeroFacture(f)}<div class="secondaire">${echapper(f.tiers)} · ${euros(f.montant_ttc)}</div></td>
      <td class="raison">${echapper(f.probleme)}</td>
      <td class="droite actions-ligne">${actionsARegler(f)}</td>
    </tr>`).join("");

  $("#table-depot tbody").innerHTML = etat.a_envoyer.map((f) => `
    <tr data-id="${f.id}">
      <td><input type="checkbox" data-coche checked></td>
      <td>${dateFr(f.date_facture)}</td>
      <td>${numeroFacture(f)}</td>
      <td>${nomClient(f)}</td>
      <td class="droite nombre">${euros(f.montant_ttc)}</td>
    </tr>`).join("");
  $("#table-depot").hidden = !etat.a_envoyer.length;
  $("#depot-vide").hidden = !!etat.a_envoyer.length;
  $("#tout-cocher").checked = true;
  majBoutonsEnvoi();

  $("#table-envoyees tbody").innerHTML = etat.envoyees.map((f) => `
    <tr data-id="${f.id}">
      <td>${numeroFacture(f)}</td>
      <td>${nomClient(f)}</td>
      <td class="droite nombre">${euros(f.montant_ttc)}</td>
      <td>${f.plateforme_statut
        ? `<span class="statut ${classeStatut(f)}">${echapper(f.plateforme_statut === ATTENTE ? "En attente de confirmation" : f.plateforme_statut)}</span>
           <span class="secondaire">${f.plateforme_maj ? dateFr(f.plateforme_maj) : ""}</span>`
        : `<span class="statut">Envoyée hors plateforme</span> <span class="secondaire">${dateFr(f.deposee_le)}</span>`}</td>
      <td class="droite">${f.plateforme_url
        ? `<a class="lien" target="_blank" href="${echapper(f.plateforme_url)}">Facture Qonto</a>`
        : !f.plateforme_statut
          ? `<button type="button" class="lien discret" data-annuler-depot title="Elle revient dans « À régler »">Annuler</button>` : ""}</td>
    </tr>`).join("");
  $("#table-envoyees").hidden = !etat.envoyees.length;
  $("#envoyees-vide").hidden = !!etat.envoyees.length;
  majPastille();
}

// Pastille rouge du menu « Facture électronique »
function majPastille() {
  const p = $('[data-pastille="/api/plateforme/a-traiter"]');
  const n = etat.a_envoyer.length + etat.a_regler.length;
  if (p) Object.assign(p, { hidden: !n, textContent: n || "" });
  if (typeof majPastillesSections === "function") majPastillesSections();
}

const selection = () => $$("#table-depot tbody tr").filter((tr) => tr.querySelector("[data-coche]").checked).map((tr) => tr.dataset.id);

// Qonto relié : « Envoyer par Qonto » ; sinon, envoi par une autre plateforme (ou autrement) puis confirmation
function majBoutonsEnvoi() {
  const rien = !selection().length;
  $("#envoyer-qonto").hidden = !qontoRelie;
  $("#depot-manuel").hidden = qontoRelie;
  $("#envoyer-qonto").disabled = !qontoRelie || rien;
  $("#telecharger-depot").disabled = $("#confirmer-envoi").disabled = qontoRelie || rien;
}

$("#tout-cocher").addEventListener("change", (e) => {
  $$("#table-depot [data-coche]").forEach((c) => (c.checked = e.target.checked));
  majBoutonsEnvoi();
});
$("#table-depot").addEventListener("change", majBoutonsEnvoi);

$("#telecharger-depot").addEventListener("click", async () => {
  const message = $("#message-envoi");
  try {
    const blob = await (await api(`/api/plateforme/export.zip?ids=${selection().join(",")}`)).blob();
    const lien = document.createElement("a");
    lien.href = URL.createObjectURL(blob);
    lien.download = `factures-a-envoyer-${aujourdhui()}.zip`;
    lien.click();
    message.className = "message ok";
    message.textContent = "Factures téléchargées (PDF au format Factur-X) : déposez-les sur votre plateforme, "
      + "puis confirmez l'envoi.";
  } catch (err) {
    message.className = "message erreur";
    message.textContent = err.message;
  }
});

$("#confirmer-envoi").addEventListener("click", async () => {
  const ids = selection();
  if (!ids.length) return;
  const n = ids.length;
  if (!confirm(`Confirmer que ${n > 1 ? `ces ${n} factures ont été envoyées` : "cette facture a été envoyée"} à vos `
    + "clients (par votre plateforme ou autrement) ?\n\nElles passeront dans « Envoyées » ; vous pourrez annuler.")) return;
  const message = $("#message-envoi");
  try {
    await envoyerJson("/api/plateforme/deposees", "POST", { ids });
    message.className = "message ok";
    message.textContent = `${pluriel(n, "facture")} marquée${n > 1 ? "s" : ""} comme envoyée${n > 1 ? "s" : ""}.`;
  } catch (err) {
    message.className = "message erreur";
    message.textContent = err.message;
  }
  chargerDepot();
});

// Confirmation avant l'envoi (sauf « ne plus me le rappeler »)
let sansConfirmation = false;
function confirmerEnvoi(liste) {
  if (sansConfirmation) return Promise.resolve(true);
  const f = $("#fenetre-envoi");
  $("#titre-envoi").textContent = liste.length > 1 ? `Envoyer ${liste.length} factures par Qonto` : "Envoyer par Qonto";
  $("#liste-envoi").innerHTML = liste.map((x) => `<li><strong>${echapper(x.numero)}</strong>
    <span>${echapper(x.tiers)}</span><span class="nombre">${euros(x.montant_ttc)}</span></li>`).join("");
  $("#ne-plus-rappeler").checked = false;
  f.returnValue = "";
  f.showModal();
  return new Promise((resoudre) => f.addEventListener("close", () => {
    const ok = f.returnValue === "envoyer";
    if (ok && $("#ne-plus-rappeler").checked) {
      sansConfirmation = true;
      envoyerJson("/api/plateforme/reglages", "POST", { sans_confirmation: true }).catch(() => {});
    }
    resoudre(ok);
  }, { once: true }));
}
$$("#fenetre-envoi [data-fermer]").forEach((b) => b.addEventListener("click", () => $("#fenetre-envoi").close()));

async function envoyerParQonto(ids, bouton) {
  const toutes = [...etat.a_envoyer, ...etat.a_regler];
  if (!(await confirmerEnvoi(toutes.filter((f) => ids.includes(f.id))))) return;
  const message = $("#message-envoi");
  if (bouton) bouton.disabled = true;
  message.className = "message";
  message.textContent = "Envoi en cours…";
  try {
    const { resultats } = await envoyerJson("/api/plateforme/qonto/envoyer", "POST", { ids });
    const partis = resultats.filter((r) => r.ok).length;
    const echecs = resultats.length - partis;
    message.className = `message ${echecs ? "erreur" : "ok"}`;
    message.textContent = [
      partis ? `${pluriel(partis, "facture")} envoyée${partis > 1 ? "s" : ""} à Qonto : le statut s'affichera dès sa confirmation.` : "",
      echecs ? `${pluriel(echecs, "facture")} n'${echecs > 1 ? "ont" : "a"} pas pu partir : voir « À régler » en haut de la page.` : "",
    ].filter(Boolean).join(" ");
  } catch (err) {
    message.className = "message erreur";
    message.textContent = err.message;
  } finally {
    if (bouton) bouton.disabled = false;
  }
  chargerDepot();
}

$("#envoyer-qonto").addEventListener("click", (e) => {
  const ids = selection();
  if (ids.length) envoyerParQonto(ids, e.currentTarget);
});

$("#table-a-regler").addEventListener("click", async (e) => {
  const id = e.target.closest("tr")?.dataset.id;
  if (e.target.closest("[data-reessayer]")) {
    if (!qontoRelie) return messageQonto("Reliez d'abord votre compte Qonto.", "erreur");
    return envoyerParQonto([id], e.target.closest("button"));
  }
  if (e.target.closest("[data-autrement]")) {
    await envoyerJson("/api/plateforme/deposees", "POST", { ids: [id] });
    chargerDepot();
  }
});
$("#table-envoyees").addEventListener("click", async (e) => {
  if (!e.target.closest("[data-annuler-depot]")) return;
  await envoyerJson("/api/plateforme/deposees", "POST", { ids: [e.target.closest("tr").dataset.id], deposee: false });
  chargerDepot();
});

// --- Ventes aux particuliers ---------------------------------------------------------------------

function periode() {
  const choix = $("#periode-rapide").value;
  const auj = new Date();
  const debutMois = (decalage) => new Date(auj.getFullYear(), auj.getMonth() + decalage, 1);
  if (choix === "mois") return [dateIso(debutMois(0)), aujourdhui()];
  if (choix === "mois-precedent") return [dateIso(debutMois(-1)), dateIso(new Date(auj.getFullYear(), auj.getMonth(), 0))];
  if (choix === "bimestre-precedent") return [dateIso(debutMois(-2)), dateIso(new Date(auj.getFullYear(), auj.getMonth(), 0))];
  return [$("#debut").value || dateIso(debutMois(0)), $("#fin").value || aujourdhui()];
}

const libelleTaux = (t) => (t === null ? "Taux non détaillé" : t === 0 ? "Sans TVA" : `TVA ${String(t).replace(".", ",")} %`);

function tableTotaux(bloc) {
  if (!bloc.totaux.length) return `<tbody><tr><td class="secondaire">Rien sur cette période.</td></tr></tbody>`;
  const somme = (cle) => bloc.totaux.reduce((s, t) => s + t[cle], 0);
  return `<thead><tr><th></th><th class="droite">HT</th><th class="droite">TVA</th><th class="droite">TTC</th></tr></thead><tbody>
    ${bloc.totaux.map((t) => `<tr><td>${libelleTaux(t.taux)}</td><td class="droite nombre">${euros(t.ht)}</td>
      <td class="droite nombre">${euros(t.tva)}</td><td class="droite nombre">${euros(t.ttc)}</td></tr>`).join("")}
    <tr class="fort"><td><strong>Total</strong> <span class="secondaire">(${pluriel(bloc.nombre, "facture")})</span></td>
      <td class="droite nombre"><strong>${euros(somme("ht"))}</strong></td><td class="droite nombre"><strong>${euros(somme("tva"))}</strong></td>
      <td class="droite nombre"><strong>${euros(somme("ttc"))}</strong></td></tr></tbody>`;
}

async function chargerVentes() {
  const libre = $("#periode-rapide").value === "libre";
  $("#debut").hidden = $("#fin").hidden = !libre;
  const [debut, fin] = periode();
  if (libre) { $("#debut").value = debut; $("#fin").value = fin; }
  const v = await apiJson(`/api/plateforme/ventes?debut=${debut}&fin=${fin}`);
  $("#resume-periode").textContent = `Du ${dateFr(debut)} au ${dateFr(fin)}.`
    + (v.ventes.totaux.some((t) => t.taux === null) ? " « Taux non détaillé » : factures saisies à la main, dont seule la TVA totale est connue." : "");
  $("#totaux-ventes").innerHTML = tableTotaux(v.ventes);
  $("#totaux-encaissements").innerHTML = tableTotaux(v.encaissements);
  $("#export-csv").href = `/api/plateforme/ventes.csv?debut=${debut}&fin=${fin}`;
  $("#detail-jours").innerHTML = v.ventes.jours.length
    ? `<thead><tr><th>Jour</th><th>Taux</th><th class="droite">HT</th><th class="droite">TVA</th><th class="droite">TTC</th></tr></thead><tbody>`
      + v.ventes.jours.map((j) => j.lignes.map((l, i) => `<tr><td>${i ? "" : dateFr(j.date)}</td><td>${libelleTaux(l.taux)}</td>
        <td class="droite nombre">${euros(l.ht)}</td><td class="droite nombre">${euros(l.tva)}</td><td class="droite nombre">${euros(l.ttc)}</td></tr>`).join("")).join("")
      + "</tbody>"
    : `<tbody><tr><td class="secondaire">Aucune vente sur cette période.</td></tr></tbody>`;
}

$("#periode-rapide").addEventListener("change", chargerVentes);
$("#debut").addEventListener("change", chargerVentes);
$("#fin").addEventListener("change", chargerVentes);

// --- Plateforme agréée reliée (Qonto) -----------------------------------------------------------

async function chargerQonto() {
  const q = await apiJson("/api/plateforme/qonto").catch(() => null);
  qontoRelie = !!q?.relie;
  $("#qonto").hidden = !q?.disponible || qontoRelie;
  $("#qonto-relie").hidden = !qontoRelie;
  let logoFait = "1";   // rappel du logo à mettre aussi dans Qonto, jusqu'à « C'est fait »
  try { logoFait = localStorage.getItem("qonto-logo-fait") || ""; } catch {}
  $("#qonto-logo").hidden = !qontoRelie || !!logoFait;
  $("#qonto-etat").textContent = `Qonto relié${q?.relie_le ? ` le ${dateFr(q.relie_le)}` : ""}`
    + (q?.environnement === "sandbox" ? " (test)" : "");
  majBoutonsEnvoi();
  $("#aide-depot").textContent = qontoRelie
    ? "Qonto émet la même facture (numéro, lignes, montants) : aux professionnels par la facture électronique, aux particuliers par e-mail."
    : "Envoyez-les par votre plateforme (bouton « Télécharger les factures »), puis confirmez l'envoi. "
      + "Avec Qonto, reliez votre compte pour les envoyer directement depuis GestionPro.";
}

function messageQonto(texte, type = "ok") {
  $("#qonto-message").textContent = texte;
  $("#qonto-message").className = `message ${type}`;
}

$("#qonto-connecter").addEventListener("click", async () => {
  try {
    await relierQonto(messageQonto);
    await chargerQonto();
    chargerDepot();
    messageQonto("Compte Qonto relié.");
  } catch (err) {
    messageQonto(err.message, "erreur");
  }
});
$("#qonto-verifier").addEventListener("click", async () => {
  try {
    const r = await envoyerJson("/api/plateforme/qonto/verifier", "POST", {});
    const etats = { enabled: "activée", disabled: "pas encore activée", pending_creation: "en cours d'ouverture par Qonto" };
    const libelle = (s) => etats[s] || s || "inconnue";
    messageQonto(`Connexion active. Réception des factures électroniques : ${libelle(r.reception)} ; `
      + `envoi : ${libelle(r.envoi)}.`);
  } catch (err) {
    messageQonto(err.message, "erreur");
  }
});
$("#qonto-deconnecter").addEventListener("click", async () => {
  if (!confirm("Déconnecter le compte Qonto de GestionPro ?")) return;
  await envoyerJson("/api/plateforme/qonto/deconnexion", "POST", {});
  messageQonto("Compte Qonto déconnecté.");
  await chargerQonto();
  chargerDepot();
});

(async () => {
  await initialiserPage();
  sansConfirmation = !!(await apiJson("/api/plateforme/reglages").catch(() => null))?.sans_confirmation;
  await chargerQonto();
  await Promise.all([chargerDepot(), chargerVentes()]);
  // Factures envoyées par Qonto : leur statut a peut-être changé (reçue, acceptée, encaissée…)
  if (qontoRelie) {
    const r = await envoyerJson("/api/plateforme/qonto/suivre", "POST", {}).catch(() => null);
    if (r?.mises_a_jour) chargerDepot();
  }
})();

$("#qonto-logo-fait").addEventListener("click", () => {
  try { localStorage.setItem("qonto-logo-fait", "1"); } catch {}
  $("#qonto-logo").hidden = true;
});
