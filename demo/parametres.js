// Paramètres : fiche entreprise, licence, sauvegardes (logiciel installé), compte (version en ligne).

function message(id, texte, type = "ok") {
  const el = $(id);
  el.textContent = texte;
  el.className = `message ${type}`;
}

// --- Entreprise -----------------------------------------------------------------------

let fiche;

$("#enregistrer").addEventListener("click", async () => {
  try {
    const enregistree = await fiche.enregistrer();
    if (!enregistree) return;
    entreprise = enregistree;
    appliquerCouleur();
    $(".menu-entreprise span").textContent = entreprise.nom;
    message("#message-entreprise", "Modifications enregistrées");
    setTimeout(() => message("#message-entreprise", ""), 3000);
  } catch (err) {
    message("#message-entreprise", err.message, "erreur");
  }
});
$("#form-entreprise").addEventListener("submit", (e) => { e.preventDefault(); $("#enregistrer").click(); });

// --- Sauvegardes (logiciel installé) ----------------------------------------------------

async function chargerSauvegardes() {
  const s = await apiJson("/api/sauvegardes");
  const derniere = s.sauvegardes[0];
  $("#etat-sauvegarde").textContent = derniere
    ? `Une par jour au démarrage. Dernière : ${dateFr(derniere.date.slice(0, 10))} à ${derniere.date.slice(11)}.`
    : "Une sauvegarde est faite chaque jour au démarrage du logiciel.";
  $("#ouvrir-sauvegardes").title = s.dossier;
}

$("#ouvrir-sauvegardes").addEventListener("click", () => api("/api/sauvegardes/ouvrir-dossier", { method: "POST" }));

$("#fichier-restauration").addEventListener("change", async (e) => {
  const fichier = e.target.files[0];
  e.target.value = "";
  if (!fichier || !confirm(`Remplacer toutes les données actuelles par la sauvegarde « ${fichier.name} » ?`)) return;
  const donnees = new FormData();
  donnees.append("fichier", fichier);
  try {
    await api("/api/sauvegardes/restaurer", { method: "POST", body: donnees });
    message("#message-restauration", "Sauvegarde restaurée. Rechargement…");
    setTimeout(() => location.reload(), 1200);
  } catch (err) {
    message("#message-restauration", err.message, "erreur");
  }
});

$("#effacer-donnees").addEventListener("click", async () => {
  const saisie = prompt("Tous les devis, factures et articles du stock vont être supprimés.\n"
                        + "Une sauvegarde sera faite juste avant.\n\nPour confirmer, tapez EFFACER :");
  if (saisie === null) return;
  try {
    await envoyerJson("/api/sauvegardes/effacer", "POST", { confirmation: saisie });
    message("#message-effacement", "Données effacées. Une sauvegarde a été faite juste avant.");
    chargerSauvegardes();
  } catch (err) {
    message("#message-effacement", err.message, "erreur");
  }
});

// --- Compte (version en ligne) -------------------------------------------------------

$("#form-mdp").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  try {
    await envoyerJson("/api/auth/mot-de-passe", "POST", { actuel: f.actuel.value, nouveau: f.nouveau.value });
    e.target.reset();
    message("#message-mdp", "Mot de passe modifié");
  } catch (err) {
    message("#message-mdp", err.message, "erreur");
  }
});

$("#supprimer-compte").addEventListener("click", async () => {
  const mdp = prompt("Cette action efface définitivement votre compte, vos devis et vos factures.\n\n"
                     + "Pour confirmer, saisissez votre mot de passe :");
  if (!mdp) return;
  try {
    await envoyerJson("/api/auth/supprimer", "POST", { mot_de_passe: mdp });
    location.href = "connexion.html";
  } catch (err) {
    alert(err.message);
  }
});

// --- Copie de sauvegarde hors de l'ordinateur -------------------------------------------------

async function chargerExterne() {
  const e = await apiJson("/api/sauvegardes/externe");
  let texte = e.dossier ? `Dans ${e.dossier}` : "Aucune : si l'ordinateur tombe en panne ou est volé, tout est perdu.";
  if (e.derniere_reussite) texte += ` · dernière copie le ${dateFr(e.derniere_reussite.slice(0, 10))} à ${e.derniere_reussite.slice(11, 16)}`;
  $("#etat-externe").textContent = texte;
  message("#message-externe", e.dossier && e.alerte ? e.alerte : "", "erreur");
  $("#copier-externe").hidden = !e.dossier;
  $("#choisir-externe").textContent = e.dossier ? "Changer" : "Choisir l'emplacement";
  $("#retirer-externe").hidden = !e.dossier;
  $("#dossier-externe").value = e.dossier || "";
  $("#emplacements-proposes").innerHTML = e.proposes.length
    ? `<span class="aide">Détectés :</span> ` + e.proposes.map((p) =>
        `<button type="button" class="bouton secondaire petit" data-dossier="${echapper(p.dossier)}">${echapper(p.nom)}</button>`).join("")
    : `<span class="aide">Aucune clé USB ni dossier synchronisé détecté : branchez une clé, ou indiquez un dossier.</span>`;
}

async function utiliserDossier(dossier) {
  message("#message-externe", "Copie en cours…", "");
  try {
    await envoyerJson("/api/sauvegardes/externe", "PUT", { dossier });
    $("#choix-externe").hidden = true;
    await chargerExterne();
    message("#message-externe", "Emplacement enregistré et première copie faite.");
  } catch (err) {
    message("#message-externe", err.message, "erreur");
  }
}

$("#choisir-externe").addEventListener("click", () => { $("#choix-externe").hidden = !$("#choix-externe").hidden; });
$("#emplacements-proposes").addEventListener("click", (e) => {
  const b = e.target.closest("[data-dossier]");
  if (b) utiliserDossier(b.dataset.dossier);
});
$("#valider-externe").addEventListener("click", () => {
  const dossier = $("#dossier-externe").value.trim();
  if (dossier) utiliserDossier(dossier);
});
$("#parcourir-externe").addEventListener("click", async () => {
  // Fenêtre GestionPro : choix de dossier de Windows (ou du Mac), au premier plan ; sinon, par le serveur
  const dossier = window.pywebview?.api?.choisir_dossier
    ? await window.pywebview.api.choisir_dossier()
    : (await envoyerJson("/api/sauvegardes/externe/parcourir", "POST", {})).dossier;
  if (dossier) $("#dossier-externe").value = dossier;
});
$("#copier-externe").addEventListener("click", async () => {
  message("#message-externe", "Copie en cours…", "");
  try {
    await api("/api/sauvegardes/externe/copier", { method: "POST" });
    await chargerExterne();
    message("#message-externe", "Copie faite.");
  } catch (err) {
    message("#message-externe", err.message, "erreur");
  }
});
$("#retirer-externe").addEventListener("click", async () => {
  if (!confirm("Ne plus copier les sauvegardes hors de l'ordinateur ? Les copies déjà faites ne sont pas supprimées.")) return;
  await api("/api/sauvegardes/externe", { method: "DELETE" });
  $("#choix-externe").hidden = true;
  chargerExterne();
});

// --- Mon profil : changer son mot de passe ------------------------------------------------------

$("#form-mon-mdp").addEventListener("submit", async (e) => {
  e.preventDefault();
  const v = e.target.elements;
  if (v.nouveau.value !== v.confirmation.value) return message("#message-mon-mdp", "Les deux saisies sont différentes.", "erreur");
  try {
    await envoyerJson("/api/acces/mot-de-passe", "POST", { actuel: v.actuel.value, nouveau: v.nouveau.value });
    e.target.reset();
    message("#message-mon-mdp", "Mot de passe changé.");
  } catch (err) {
    message("#message-mon-mdp", err.message, "erreur");
  }
});

// --- Signature des e-mails : éléments choisis (même ordre que backend/envoi/modeles.py) ----------

const ORDRE_SIGNATURE = ["signataire", "entreprise", "telephone", "email", "adresse"];

function valeurSignature(cle) {
  const adresse = [(entreprise.adresse || "").replace(/\n/g, ", ").trim(),
                   `${entreprise.code_postal || ""} ${entreprise.ville || ""}`.trim()].filter(Boolean).join(", ");
  return { signataire: $("#signataire").value.trim(), entreprise: entreprise.nom, telephone: entreprise.telephone,
           email: entreprise.email, adresse }[cle] || "";
}

function elementsSignature() {
  return $$("#cases-signature input").filter((c) => c.checked).map((c) => c.value);
}

function apercuSignature() {
  const choisis = elementsSignature();
  const lignes = ORDRE_SIGNATURE.filter((c) => choisis.includes(c)).map(valeurSignature).filter(Boolean);
  $("#apercu-signature").textContent = lignes.length ? lignes.join("\n") : "(aucune signature)";
}

function chargerSignature() {
  $("#signataire").value = entreprise.signataire || "";
  const choisis = entreprise.signature_elements || ["entreprise", "telephone", "email"];
  $$("#cases-signature input").forEach((c) => (c.checked = choisis.includes(c.value)));
  apercuSignature();
}

$("#cases-signature").addEventListener("change", apercuSignature);
$("#signataire").addEventListener("input", () => {
  const caseNom = $("#cases-signature input[value=signataire]");
  if ($("#signataire").value.trim() && !caseNom.dataset.touche) caseNom.checked = true;   // nom saisi : affiché
  apercuSignature();
});
$("#cases-signature input[value=signataire]").addEventListener("change", (e) => (e.target.dataset.touche = "1"));
$("#enregistrer-signature").addEventListener("click", async () => {
  const message = $("#message-signature");
  try {
    entreprise = await envoyerJson("/api/entreprise", "PUT", { ...(await apiJson("/api/entreprise")),
      signataire: $("#signataire").value.trim(), signature_elements: elementsSignature() });
    message.className = "message ok";
    message.textContent = "Signature enregistrée.";
  } catch (err) {
    message.className = "message erreur";
    message.textContent = err.message;
  }
});

// --- Messages envoyés (e-mails proposés) ----------------------------------------------------------

let messages = [], messageEdite = null, champMessage = null;

async function chargerMessages() {
  messages = await apiJson("/api/messages");
  $("#liste-messages").innerHTML = messages.map((m) => `
    <div class="ligne-reglage">
      <div><strong>${echapper(m.titre)}</strong>
        <span class="aide">${m.personnalise ? `Votre texte · objet : « ${echapper(m.objet)} »` : "Texte automatique de GestionPro"}</span></div>
      <button type="button" class="bouton secondaire petit" data-message="${m.cle}">Modifier</button>
    </div>`).join("");
}

function ouvrirMessage(m) {
  messageEdite = m;
  const f = $("#form-message").elements;
  $("#titre-message").textContent = m.titre;
  f.objet.value = m.objet;
  f.texte.value = m.texte;
  champMessage = f.texte;
  $("#variables-message").innerHTML = m.variables.map((v) => `
    <button type="button" class="pastille" data-variable="${v.nom}" title="{${v.nom}}">${echapper(v.description)}</button>`).join("");
  $("#erreur-message").textContent = "";
  $("#retablir-message").hidden = !m.personnalise;
  $("#fenetre-message").showModal();
}

$("#liste-messages").addEventListener("click", (e) => {
  const b = e.target.closest("[data-message]");
  if (b) ouvrirMessage(messages.find((m) => m.cle === b.dataset.message));
});
for (const nom of ["objet", "texte"]) {
  $("#form-message").elements[nom].addEventListener("focus", (e) => (champMessage = e.target));
}
$("#variables-message").addEventListener("click", (e) => {
  const b = e.target.closest("[data-variable]");
  if (!b || !champMessage) return;
  const insertion = `{${b.dataset.variable}}`;
  const { selectionStart: debut, selectionEnd: fin, value } = champMessage;
  champMessage.value = value.slice(0, debut) + insertion + value.slice(fin);
  champMessage.focus();
  champMessage.setSelectionRange(debut + insertion.length, debut + insertion.length);
});
$("#form-message").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  try {
    await envoyerJson(`/api/messages/${messageEdite.cle}`, "PUT", { objet: f.objet.value, texte: f.texte.value });
    $("#fenetre-message").close();
    chargerMessages();
  } catch (err) {
    $("#erreur-message").textContent = err.message;
  }
});
$("#retablir-message").addEventListener("click", async () => {
  if (!confirm("Revenir au texte rédigé automatiquement par GestionPro ? Votre texte sera effacé.")) return;
  await api(`/api/messages/${messageEdite.cle}`, { method: "DELETE" });
  $("#fenetre-message").close();
  chargerMessages();
});
$$("[data-fermer-message]").forEach((b) => b.addEventListener("click", () => $("#fenetre-message").close()));

// --- Utilisateurs et accès (administrateur) -------------------------------------------------------

let profils = [], espacesDroits = [], profilEdite = null;

async function chargerUtilisateurs() {
  const actifs = session.profils;
  $("#profils-inactifs").hidden = actifs;
  $("#profils-actifs").hidden = $("#ajouter-utilisateur").hidden = !actifs;
  if (!actifs) return;
  const r = await apiJson("/api/utilisateurs");
  profils = r.utilisateurs;
  espacesDroits = r.droits;
  const actifsLicence = profils.filter((u) => u.actif).length;
  $("#limite-utilisateurs").hidden = !r.limite;
  $("#limite-utilisateurs").textContent = r.limite
    ? `${actifsLicence} profil${actifsLicence > 1 ? "s" : ""} actif${actifsLicence > 1 ? "s" : ""} sur ${r.limite} permis par votre licence.`
      + (actifsLicence >= r.limite ? " Pour en ajouter, bloquez un profil ou demandez une licence pour plus d'utilisateurs." : "")
    : "";
  const libelle = (cle) => espacesDroits.find((d) => d.cle === cle)?.nom || cle;
  const onglets = (u) => u.droits.filter((d) => espacesDroits.some((x) => x.cle === d));   // sans les espaces déduits
  $("#table-utilisateurs tbody").innerHTML = profils.map((u) => `
    <tr class="cliquable ${u.actif ? "" : "secondaire"}" data-id="${u.id}">
      <td><strong>${echapper(u.nom)}</strong>${u.id === session.utilisateur?.id ? ` <span class="secondaire">(vous)</span>` : ""}
        ${u.actif ? "" : `<div class="secondaire">profil bloqué</div>`}
        ${u.valide_factures ? `<div class="secondaire">valide les factures reçues</div>` : ""}</td>
      <td>${u.admin ? `<span class="statut ok">Administrateur</span>`
        : onglets(u).length ? onglets(u).map((d) => `<span class="statut">${libelle(d)}</span>`).join(" ") : `<span class="secondaire">aucun onglet</span>`}</td>
      <td class="droite"><button type="button" class="lien">Modifier</button></td>
    </tr>`).join("");
}

$("#form-activer").addEventListener("submit", async (e) => {
  e.preventDefault();
  const v = e.target.elements;
  if (v.mot_de_passe.value !== v.confirmation.value) return message("#message-activer", "Les deux saisies sont différentes.", "erreur");
  try {
    const r = await envoyerJson("/api/utilisateurs/activer", "POST", { nom: v.nom.value, mot_de_passe: v.mot_de_passe.value });
    session = await apiJson("/api/auth/moi");
    $("#bloc-code").hidden = false;
    $("#code-secours").textContent = r.code_secours;
    await Promise.all([chargerUtilisateurs(), chargerReseau()]);
    $("#bloc-code").scrollIntoView({ block: "center" });
  } catch (err) {
    message("#message-activer", err.message, "erreur");
  }
});

function ouvrirUtilisateur(u = null) {
  profilEdite = u;
  const f = $("#form-utilisateur");
  f.reset();
  f.elements.nom.value = u?.nom || "";
  f.elements.admin.checked = !!u?.admin;
  f.elements.actif.checked = u ? u.actif : true;
  f.elements.valide_factures.checked = !!u?.valide_factures;
  $("#libelle-mdp-utilisateur").textContent = u ? "Nouveau mot de passe (laisser vide pour ne pas le changer)" : "Mot de passe";
  // Onglets du menu, rangés comme le menu (Ventes, Achats, Gestion)
  const groupes = [...new Set(espacesDroits.map((d) => d.groupe))];
  $("#cases-droits").innerHTML = groupes.map((g) => `<div class="groupe-droits"><strong>${g}</strong>
    ${espacesDroits.filter((d) => d.groupe === g).map((d) => `<label class="case"><input type="checkbox" value="${d.cle}"
      ${!u || u.droits.includes(d.cle) ? "checked" : ""}> <span>${d.nom}</span></label>`).join("")}</div>`).join("");
  $("#titre-utilisateur").textContent = u ? u.nom : "Nouvel utilisateur";
  $("#supprimer-utilisateur").hidden = !u || u.id === session.utilisateur?.id;
  $("#erreur-utilisateur").textContent = "";
  majCasesDroits();
  $("#fenetre-utilisateur").showModal();
}

function majCasesDroits() {   // un administrateur a accès à tout
  const admin = $("#form-utilisateur").elements.admin.checked;
  $$("#cases-droits input").forEach((c) => (c.disabled = admin));
  $("#droits-profil").classList.toggle("secondaire", admin);
}

$("#form-utilisateur").elements.admin.addEventListener("change", majCasesDroits);
$("#ajouter-utilisateur").addEventListener("click", () => ouvrirUtilisateur());
$("#table-utilisateurs tbody").addEventListener("click", (e) => {
  const ligne = e.target.closest("tr");
  if (ligne) ouvrirUtilisateur(profils.find((u) => u.id === ligne.dataset.id));
});
$$("[data-fermer-utilisateur]").forEach((b) => b.addEventListener("click", () => $("#fenetre-utilisateur").close()));

$("#form-utilisateur").addEventListener("submit", async (e) => {
  e.preventDefault();
  const v = e.target.elements;
  const profil = { nom: v.nom.value.trim(), mot_de_passe: v.mot_de_passe.value, admin: v.admin.checked,
                   actif: v.actif.checked, droits: $$("#cases-droits input:checked").map((c) => c.value),
                   valide_factures: v.valide_factures.checked };
  try {
    if (profilEdite) await envoyerJson(`/api/utilisateurs/${profilEdite.id}`, "PUT", profil);
    else await envoyerJson("/api/utilisateurs", "POST", profil);
  } catch (err) {
    $("#erreur-utilisateur").textContent = err.message;
    return;
  }
  $("#fenetre-utilisateur").close();
  if (profilEdite?.id === session.utilisateur?.id) session = await apiJson("/api/auth/moi");
  chargerUtilisateurs();
});

$("#supprimer-utilisateur").addEventListener("click", async () => {
  if (!confirm(`Supprimer le profil de ${profilEdite.nom} ? Ses devis et factures restent, mais il ne pourra plus se connecter.`)) return;
  try {
    await api(`/api/utilisateurs/${profilEdite.id}`, { method: "DELETE" });
  } catch (err) {
    $("#erreur-utilisateur").textContent = err.message;
    return;
  }
  $("#fenetre-utilisateur").close();
  chargerUtilisateurs();
});

$("#desactiver-profils").addEventListener("click", async () => {
  const mdp = prompt("Tous les profils seront supprimés : GestionPro s'ouvrira de nouveau sans connexion, pour "
    + "quiconque utilise cet ordinateur.\n\nPour confirmer, saisissez votre mot de passe :");
  if (!mdp) return;
  try {
    await envoyerJson("/api/utilisateurs/desactiver", "POST", { mot_de_passe: mdp });
    location.reload();
  } catch (err) {
    message("#message-profils", err.message, "erreur");
  }
});

// --- Réseau du bureau ---------------------------------------------------------------------------

async function chargerReseau() {
  const r = await apiJson("/api/reseau");
  const zone = $("#reseau-contenu");
  if (r.distant) {
    zone.innerHTML = `<p>Vous êtes connecté au <strong>poste principal</strong> du bureau (${echapper(r.poste)}).</p>
      <p class="aide">Pour qu'un ordinateur cesse de s'y connecter : sur cet ordinateur, ${QUITTER_PRINCIPAL}.</p>`;
    return;
  }
  if (r.role === "principal") {
    const adresse = r.adresses[0] || "";
    zone.innerHTML = `
      <p class="encart">Cet ordinateur est le <strong>poste principal</strong> : les autres ordinateurs du bureau
        peuvent s'y connecter, chacun avec son profil.</p>
      <ol class="etapes" style="margin-top: 12px">
        <li>Sur chaque autre ordinateur, installez GestionPro et ouvrez-le.</li>
        <li>Sur l'écran de licence, choisissez <strong>« Rejoindre le poste principal du bureau »</strong> : il est
          trouvé tout seul. Sinon, saisissez son adresse : <strong>${echapper(r.poste)}</strong>${adresse ? ` ou
          <strong>${echapper(adresse)}</strong>` : ""}.</li>
        <li>Chacun se connecte ensuite avec son profil.</li>
      </ol>
      <p class="aide">Laissez cet ordinateur allumé, avec GestionPro ouvert, pendant que les autres travaillent.
        ${SUR_MAC ? "Sur Mac, gardez la fenêtre de GestionPro ouverte (réduite si besoin) : la fermer quitte GestionPro. "
          + "La première fois, le Mac demande d'accepter les connexions entrantes : cliquez sur « Autoriser »."
          : "La première fois, Windows demande d'autoriser GestionPro sur le réseau : acceptez (réseau privé)."}</p>
      ${r.installe ? `<label class="case" style="margin-top: 10px"><input type="checkbox" id="demarrage-auto" ${r.demarrage_auto ? "checked" : ""}>
        <span>Démarrer GestionPro ${SUR_MAC ? "à l'ouverture de session du Mac" : "avec Windows"} (sans ouvrir de fenêtre), pour que les autres puissent travailler
          même si personne ne l'a ouvert ici</span></label>` : ""}
      <div class="actions" style="margin-top: 14px"><button type="button" class="bouton secondaire" id="arreter-partage">Arrêter le partage</button></div>`;
    $("#demarrage-auto")?.addEventListener("change", async (e) => {
      try {
        await envoyerJson("/api/reseau/demarrage", "POST", { actif: e.target.checked });
        message("#message-reseau", e.target.checked ? `GestionPro démarrera ${SUR_MAC ? "à l'ouverture de session" : "avec Windows"}.` : "Démarrage automatique retiré.");
      } catch (err) {
        e.target.checked = !e.target.checked;
        message("#message-reseau", err.message, "erreur");
      }
    });
    $("#arreter-partage").onclick = () => changerPartage(false);
    return;
  }
  zone.innerHTML = `
    <div class="ligne-reglage">
      <div><strong>Faire de cet ordinateur le poste principal</strong>
        <span class="aide">${r.profils ? "Les données de cet ordinateur seront partagées avec les autres postes du bureau."
          : "Créez d'abord les profils (ci-dessus) : sans mot de passe, n'importe quel ordinateur du réseau pourrait ouvrir vos données."}</span></div>
      <button type="button" class="bouton" id="devenir-principal" ${r.profils ? "" : "disabled"}>Partager sur le réseau</button>
    </div>
    <div class="ligne-reglage">
      <div><strong>Rejoindre le poste principal du bureau</strong>
        <span class="aide">Cet ordinateur travaillera sur les données du poste principal (ses données actuelles
          restent de côté).</span></div>
      <a class="bouton secondaire" href="reseau.html">Rejoindre…</a>
    </div>`;
  $("#devenir-principal").onclick = () => changerPartage(true);
}

async function changerPartage(actif) {
  if (!actif && !confirm("Arrêter le partage ? Les autres ordinateurs ne pourront plus se connecter à celui-ci.")) return;
  let r;
  try {
    r = await envoyerJson("/api/reseau/principal", "POST", { actif });
  } catch (err) {
    return message("#message-reseau", err.message, "erreur");
  }
  // GestionPro redémarre son serveur (écoute du réseau ou non) : on attend qu'il réponde, puis on recharge
  $("#reseau-contenu").innerHTML = `<p class="aide">Redémarrage de GestionPro…</p>`;
  const adresses = [location.origin, `http://127.0.0.1:${r.port}`];
  for (let i = 0; i < 40; i++) {
    await new Promise((ok) => setTimeout(ok, 750));
    for (const a of i < 4 ? [] : adresses) {
      try {
        await fetch(`${a}/api/sante`, { mode: "no-cors", cache: "no-store" });
        location.href = `${a}/parametres.html#reseau`;
        return;
      } catch {}
    }
  }
  location.reload();
}

// --- Démarrage --------------------------------------------------------------------------

// --- Version et mises à jour (logiciel installé) ------------------------------------------

async function chargerVersion() {
  $("#version-logiciel").textContent = (await apiJson("/api/sante")).version;
}

$("#chercher-maj").addEventListener("click", async () => {
  $("#etat-maj").textContent = "Recherche…";
  const m = await verifierMiseAJour({ forcer: true });
  $("#etat-maj").textContent = !m ? "" : m.erreur ? "Pas de connexion à Internet : réessayez plus tard."
    : m.disponible ? `Version ${m.version} disponible.` : "Vous avez la dernière version.";
  if (m?.disponible) proposerMiseAJour(m);
});

(async () => {
  await initialiserPage();
  if (session.utilisateur) {
    $("#mon-profil").hidden = false;
    $("#mon-profil-nom").textContent = `${session.utilisateur.nom}${session.utilisateur.admin ? " · administrateur" : ""}`;
  }
  fiche = monterFormulaireEntreprise($("#form-entreprise"));
  await fiche.charger();

  if (session.mode === "local" && !estAdmin()) {
    // Profil sans droits d'administration : seulement son mot de passe
    $("#entreprise").hidden = true;
    $(".entete-page p").textContent = "Votre profil.";
  } else if (session.mode === "local") {
    $("#messages").hidden = false;
    chargerMessages();
    chargerSignature();
    $("#licence").hidden = $("#sauvegardes").hidden = $("#utilisateurs").hidden = $("#reseau").hidden = false;
    chargerExterne();
    chargerUtilisateurs();
    chargerReseau();
    await monterBlocLicence($("#bloc-licence"), () => location.reload());
    chargerVersion();
    chargerSauvegardes();
    if (session.distant) {   // actions sur le poste principal lui-même
      for (const id of ["#ouvrir-sauvegardes", "#parcourir-externe", "#chercher-maj"]) if ($(id)) $(id).hidden = true;
    }
  } else {
    $("#messages").hidden = false;
    chargerMessages();
    chargerSignature();
    $("#compte").hidden = false;
    $("#compte-email").textContent = session.email;
    const a = session.abonnement;
    if (session.offre.paiement_actif) {
      $("#ligne-abonnement").hidden = false;
      $("#etat-abonnement").textContent = a.abonne ? `Abonné · ${session.offre.prix}`
        : a.en_essai ? `Essai gratuit jusqu'au ${dateFr(a.essai_fin)}` : "Aucun abonnement";
    }
  }
  brancherOnglets();
})();

// --- Onglets : une partie des réglages à la fois -----------------------------------------------
// Un onglet n'apparaît que si l'une de ses sections est ouverte à ce profil (sections « hidden » sinon).
const ONGLETS = [
  { cle: "entreprise", titre: "Entreprise", sections: ["entreprise"] },
  { cle: "messages", titre: "Messages", sections: ["messages"] },
  { cle: "licence", titre: "Licence et abonnement", sections: ["licence", "compte"] },
  { cle: "sauvegardes", titre: "Sauvegardes", sections: ["sauvegardes"] },
  { cle: "utilisateurs", titre: "Utilisateurs et réseau", sections: ["mon-profil", "utilisateurs", "reseau"] },
];

function brancherOnglets() {
  const barre = document.createElement("nav");
  barre.className = "onglets";
  barre.id = "onglets-parametres";
  barre.innerHTML = ONGLETS.map((o) => `<button type="button" data-onglet="${o.cle}">${o.titre}</button>`).join("");
  $(".entete-page").after(barre);
  const ouverte = (id) => { const s = document.getElementById(id); return s && !s.hidden; };
  const disponibles = () => ONGLETS.filter((o) => o.sections.some(ouverte));
  let actif = null;

  function afficher(cle, memoriser = true) {
    const liste = disponibles();
    const onglet = liste.find((o) => o.cle === cle) || liste[0];
    if (!onglet) return;
    actif = onglet.cle;
    for (const o of ONGLETS) {
      for (const id of o.sections) document.getElementById(id)?.classList.toggle("hors-onglet", o !== onglet);
    }
    $$("button", barre).forEach((b) => {
      b.hidden = !liste.some((o) => o.cle === b.dataset.onglet);
      b.classList.toggle("actif", b.dataset.onglet === actif);
    });
    barre.hidden = liste.length < 2;
    if (memoriser) history.replaceState(null, "", `#${actif}`);
  }

  barre.addEventListener("click", (e) => {
    const b = e.target.closest("[data-onglet]");
    if (b) afficher(b.dataset.onglet);
  });
  // Adresse « parametres.html#reseau » (ou #licence…) : l'onglet qui contient cette section
  const ancre = location.hash.slice(1);
  const depart = ONGLETS.find((o) => o.cle === ancre || o.sections.includes(ancre));
  afficher(depart?.cle || "entreprise", false);
  if (ancre && depart && depart.cle !== ancre) document.getElementById(ancre)?.scrollIntoView();
  // Sections montrées plus tard (chargements) : la barre suit
  const suivi = new MutationObserver(() => afficher(actif, false));
  for (const o of ONGLETS) for (const id of o.sections) {
    const s = document.getElementById(id);
    if (s) suivi.observe(s, { attributes: true, attributeFilter: ["hidden"] });
  }
}
