// Accueil : les outils et leurs chiffres clés, et les prochaines échéances de factures.

function indicateur(valeur, libelle, classe = "") {
  return `<div class="${classe}"><strong class="nombre">${valeur}</strong><span>${libelle}</span></div>`;
}

function libelleEcheance(f) {
  if (f.jours_restants === null) return `<span class="statut">Sans échéance</span>`;
  if (f.jours_restants < 0) return `<span class="statut retard">En retard de ${pluriel(-f.jours_restants, "jour")}</span>`;
  if (f.jours_restants === 0) return `<span class="statut proche">Aujourd'hui</span>`;
  return `<span class="statut ${f.jours_restants <= 7 ? "proche" : ""}">Dans ${pluriel(f.jours_restants, "jour")}</span>`;
}

// --- À faire : sauvegarde, factures à relancer, devis sans réponse ----------------------------

const NIVEAUX_RELANCE = { 1: "rappel", 2: "deuxième relance", 3: "mise en demeure" };

async function afficherAFaire() {
  const [suivi, sauvegarde] = await Promise.all([
    apiJson("/api/suivi"),
    session.mode === "local" && estAdmin() ? apiJson("/api/sauvegardes/externe").catch(() => null) : null,
  ]);
  const elements = [];

  if (sauvegarde?.proposer) {
    elements.push(`<div class="element">
      <div><strong>Sauvegarde hors de l'ordinateur</strong><div class="secondaire">${echapper(sauvegarde.alerte)}</div></div>
      <div class="actions">
        ${sauvegarde.dossier ? "" : `<button type="button" class="lien discret" data-refuser-sauvegarde>Non merci</button>`}
        <button type="button" class="lien discret" data-reporter-sauvegarde>Plus tard</button>
        ${sauvegarde.dossier ? `<button type="button" class="bouton secondaire petit" data-copier>Copier maintenant</button>` : ""}
        <a class="bouton petit" href="parametres.html#sauvegardes">${sauvegarde.dossier ? "Paramètres" : "Choisir l'emplacement"}</a>
      </div></div>`);
  }
  for (const r of suivi.relances) {
    elements.push(`<div class="element" data-facture="${r.id}">
      <div><strong>Relancer ${echapper(r.tiers)}</strong>
        <div class="secondaire">Facture ${echapper(r.numero || "sans numéro")} · ${euros(r.montant)} · en retard de ${pluriel(r.retard, "jour")}
          ${r.derniere_relance ? ` · dernière relance le ${dateFr(r.derniere_relance)}` : ""} · à envoyer : ${NIVEAUX_RELANCE[r.niveau]}</div></div>
      <div class="actions">
        <button type="button" class="lien discret" data-reporter="facture">Plus tard</button>
        <a class="bouton petit" href="factures.html?relancer=${r.id}">Relancer</a>
      </div></div>`);
  }
  for (const d of suivi.devis) {
    elements.push(`<div class="element" data-devis="${echapper(d.numero)}">
      <div><strong>Devis sans réponse : ${echapper(d.client || d.numero)}</strong>
        <div class="secondaire">${echapper(d.numero)}${d.objet ? " · " + echapper(d.objet) : ""} · ${euros(d.montant)}
          · dernier contact il y a ${pluriel(d.jours, "jour")}${d.expire ? ` · <span class="rouge">validité dépassée</span>` : ""}</div></div>
      <div class="actions">
        <button type="button" class="lien discret" data-reporter="devis">Plus tard</button>
        <button type="button" class="lien" data-statut="refuse">Refusé</button>
        <button type="button" class="lien" data-statut="accepte">Accepté</button>
        <button type="button" class="bouton petit" data-relancer-devis>Relancer par e-mail</button>
      </div></div>`);
  }

  if (suivi.stock.length) {
    const qte = (n, u) => `${Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 3 })} ${u}`;
    const detail = suivi.stock.slice(0, 4).map((a) => `<li><strong>${echapper(a.nom)}</strong> : ${qte(a.quantite, a.unite)} en stock`
      + (a.manque > 0 ? ` · <span class="rouge">il en manque ${qte(a.manque, a.unite)} pour des devis en attente</span>`
                      : ` (seuil ${qte(a.seuil, a.unite)})`)
      + (a.fournisseur ? ` · ${echapper(a.fournisseur)}` : "") + "</li>").join("");
    const autres = suivi.stock.length > 4 ? `<li>… et ${pluriel(suivi.stock.length - 4, "autre article")}</li>` : "";
    elements.push(`<div class="element" data-stock="${suivi.stock.map((a) => a.id).join(",")}">
      <div><strong>Stock à réapprovisionner : ${pluriel(suivi.stock.length, "article")}</strong>
        <ul class="liste-stock secondaire">${detail}${autres}</ul></div>
      <div class="actions">
        <button type="button" class="lien discret" data-reporter="stock">Plus tard</button>
        <a class="lien" href="stock.html?filtre=alerte">Voir le stock</a>
        <a class="bouton petit" href="stock.html?demande=1">Contacter le fournisseur</a>
      </div></div>`);
  }

  for (const d of suivi.depots || []) {
    elements.push(`<div class="element" data-depot="${echapper(d.lieu)}">
      <div><strong>Relevé de ventes à demander : ${echapper(d.lieu)}</strong>
        <div class="secondaire">${Number(d.exemplaires).toLocaleString("fr-FR")} ex. en dépôt ·
          ${d.dernier_releve ? `dernier relevé il y a ${pluriel(d.jours, "jour")}` : `aucun relevé depuis ${pluriel(d.jours, "jour")}`}</div></div>
      <div class="actions">
        <button type="button" class="lien discret" data-reporter="depot">Plus tard</button>
        <a class="bouton petit" href="stock.html?releve=${encodeURIComponent(d.lieu)}">Saisir le relevé</a>
      </div></div>`);
  }

  $("#a-faire").hidden = !elements.length;
  $("#liste-a-faire").innerHTML = elements.join("");
  const n = suivi.relances.length + suivi.devis.length + (suivi.stock.length ? 1 : 0) + (suivi.depots || []).length;
  $("#resume-a-faire").textContent = n ? pluriel(n, "suggestion") : "";
}

$("#liste-a-faire").addEventListener("click", async (e) => {
  const element = e.target.closest(".element");
  if (!element) return;
  try {
    if (e.target.closest("[data-copier]")) {
      e.target.disabled = true;
      await api("/api/sauvegardes/externe/copier", { method: "POST" });
    } else if (e.target.closest("[data-reporter-sauvegarde]")) {
      await envoyerJson("/api/sauvegardes/externe/reporter", "POST", { jours: 30 });
    } else if (e.target.closest("[data-refuser-sauvegarde]")) {
      if (!confirm("Ne plus proposer de copie hors de l'ordinateur ?\n\nVos sauvegardes resteront seulement sur cet "
        + "ordinateur : une panne, un vol ou un virus pourrait tout faire perdre. Vous pourrez l'activer à tout moment "
        + "dans Paramètres > Sauvegardes.")) return;
      await envoyerJson("/api/sauvegardes/externe/refuser", "POST", {});
    } else if (e.target.closest("[data-reporter]")) {
      const type = e.target.dataset.reporter;
      if (type === "stock") {
        await Promise.all(element.dataset.stock.split(",").map((id) =>
          envoyerJson("/api/suivi/reporter", "POST", { type, id, jours: 7 })));
      } else {
        await envoyerJson("/api/suivi/reporter", "POST", { type, jours: 7,
          id: type === "facture" ? element.dataset.facture : type === "depot" ? element.dataset.depot : element.dataset.devis });
      }
    } else if (e.target.closest("[data-statut]")) {
      await envoyerJson(`/api/devis/${encodeURIComponent(element.dataset.devis)}/statut`, "POST",
                        { statut: e.target.dataset.statut });
    } else if (e.target.closest("[data-relancer-devis]")) {
      const numero = element.dataset.devis;
      return ouvrirEnvoi({ titre: `Relancer le client (devis ${numero})`,
                           modele: `/api/devis/${encodeURIComponent(numero)}/envoi?relance=true`,
                           marquer: `/api/devis/${encodeURIComponent(numero)}/envoye?relance=true`,
                           apresEnvoi: afficherAFaire });
    } else {
      return;
    }
  } catch (err) {
    alert(err.message);
  }
  afficherAFaire();
});

(async () => {
  await initialiserPage();
  afficherAFaire();
  const date = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (session.utilisateur) {   // profils : « Bonjour Marie », l'entreprise en sous-titre
    $("#titre").textContent = `Bonjour ${session.utilisateur.nom.split(" ")[0]}`;
    $("#date-du-jour").textContent = `${entreprise.nom} · ${date}`;
  } else {
    $("#titre").textContent = entreprise.nom;
    $("#date-du-jour").textContent = date;
  }

  const debutSemaine = new Date();
  debutSemaine.setDate(debutSemaine.getDate() - ((debutSemaine.getDay() + 6) % 7));
  const finSemaine = new Date(debutSemaine);
  finSemaine.setDate(finSemaine.getDate() + 6);
  // Profil : on ne charge (et n'affiche) que les espaces qui lui sont ouverts
  const si = (espace, url, vide) => (peut(espace) ? apiJson(url) : Promise.resolve(vide));
  const ventesOuAchats = peut("clients") || peut("fournisseurs");
  const restantVide = { restant: { montant: 0, nombre: 0 }, en_retard: { montant: 0, nombre: 0 } };
  const [devis, resume, factures, articles, contacts, semaine, prochains] = await Promise.all([
    si("devis", "/api/devis", []),
    ventesOuAchats ? apiJson("/api/factures/resume") : Promise.resolve({ client: restantVide, fournisseur: restantVide }),
    ventesOuAchats ? apiJson("/api/factures") : Promise.resolve([]),
    peut("stock") || peut("clients") || peut("fournisseurs") ? apiJson("/api/stock") : Promise.resolve([]),
    peut("contacts") || ventesOuAchats || peut("agenda") ? apiJson("/api/contacts") : Promise.resolve([]),
    si("agenda", `/api/agenda?debut=${dateIso(debutSemaine)}&fin=${dateIso(finSemaine)}`, { rendez_vous: [], taches: [] }),
    si("agenda", "/api/agenda/prochains", []),
  ]);
  for (const [espace, lien] of [["agenda", "agenda.html"], ["contacts", "contacts.html"], ["devis", "devis.html"],
                                ["fournisseurs", "factures.html?espace=fournisseurs"], ["stock", "stock.html"]]) {
    const carte = document.querySelector(`.service[href="${lien}"]`);
    if (carte && !peut(espace)) carte.hidden = true;
  }

  const tachesSemaine = semaine.taches.filter((t) => !t.fait).length;
  $("#stats-agenda").innerHTML =
    indicateur(semaine.rendez_vous.length, `rendez-vous cette semaine`) +
    indicateur(tachesSemaine, tachesSemaine > 1 ? "échéances à régler" : "échéance à régler");
  const nbClients = contacts.filter((c) => c.type === "client").length;
  $("#stats-contacts").innerHTML =
    indicateur(nbClients, nbClients > 1 ? "clients" : "client") +
    indicateur(contacts.length - nbClients, contacts.length - nbClients > 1 ? "fournisseurs" : "fournisseur");

  if (prochains.length) {
    $("#carte-rdv").hidden = false;
    const jour = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    $("#prochains-rdv").innerHTML = prochains.map((r) => `
      <tr class="cliquable" onclick="location.href='agenda.html?date=${r.date}'">
        <td><strong>${echapper(r.titre)}</strong>
          <div class="secondaire">${[echapper(r.contact_nom), echapper(r.lieu)].filter(Boolean).join(" · ")}</div></td>
        <td class="droite">${jour(r.date)}<div class="secondaire">${r.debut} – ${r.fin}</div></td>
      </tr>`).join("");
  }

  const annee = String(new Date().getFullYear());
  const devisAnnee = devis.filter((d) => d.date.startsWith(annee));
  const f = resume.fournisseur, c = resume.client;

  // Chiffres clés en tête de page (espaces ouverts à ce profil)
  const enAttente = devis.filter((d) => d.statut === "en_attente");
  const tuiles = [
    (peut("factures_clients") || peut("relances")) && ["t-bleu", "À encaisser", euros(c.restant.montant), pluriel(c.restant.nombre, "facture"), "factures.html"],
    (peut("factures_clients") || peut("relances")) && ["t-jaune", "En retard", euros(c.en_retard.montant),
      c.en_retard.nombre ? pluriel(c.en_retard.nombre, "facture") + " à relancer" : "aucune facture", "factures.html?onglet=relances"],
    peut("factures_fournisseurs") && ["t-violet", "À payer", euros(f.restant.montant), pluriel(f.restant.nombre, "facture"),
      "factures.html?espace=fournisseurs"],
    peut("devis") && ["t-vert", "Devis en attente", String(enAttente.length),
      euros(enAttente.reduce((s, d) => s + (d.total_ttc || 0), 0)) + " au total", "devis.html"],
  ].filter(Boolean);
  $("#tuiles").hidden = !tuiles.length;
  $("#tuiles").innerHTML = tuiles.map(([classe, titre, valeur, detail, lien]) => `
    <a class="tuile ${classe}" href="${lien}"><span>${titre}</span><strong>${valeur}</strong><small>${detail}</small></a>`).join("");
  $("#stats-devis").innerHTML =
    indicateur(devisAnnee.length, `devis en ${annee}`) +
    indicateur(euros(c.restant.montant), "à encaisser") +
    (c.en_retard.nombre ? indicateur(c.en_retard.nombre, "en retard", "rouge") : "");

  $("#stats-factures").innerHTML =
    indicateur(euros(f.restant.montant), "à payer") +
    (f.en_retard.nombre ? indicateur(f.en_retard.nombre, "en retard", "rouge") : "");

  const alertes = articles.filter((a) => a.alerte).length;
  $("#stats-stock").innerHTML =
    indicateur(articles.length, articles.length > 1 ? "articles" : "article") +
    indicateur(euros(articles.reduce((s, a) => s + Math.max(a.quantite, 0) * a.prix_achat_ht, 0)), "valeur d'achat") +
    (alertes ? indicateur(alertes, "à réapprovisionner", "rouge") : "");

  // Factures non réglées, déjà triées par échéance (5 au maximum)
  const aSuivre = factures.filter((x) => !x.payee && x.statut !== "annulee").slice(0, 5);
  if (aSuivre.length) {
    $("#carte-echeances").hidden = false;
    $("#echeances").innerHTML = aSuivre.map((x) => `
      <tr class="cliquable" onclick="location.href='factures.html?facture=${x.id}'">
        <td><strong>${echapper(x.tiers)}</strong>
          <div class="secondaire">${x.type === "client" ? "À encaisser" : "À payer"}${x.numero ? " · " + echapper(x.numero) : ""}</div></td>
        <td>${libelleEcheance(x)}</td>
        <td class="droite nombre"><strong>${euros(x.montant_ttc)}</strong></td>
      </tr>`).join("");
  }
})();
