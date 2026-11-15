// Page de connexion / inscription (mode web).

// Adresse de contact affichée pour les mots de passe oubliés (à personnaliser)
const EMAIL_SUPPORT = "support@votre-domaine.fr";

function afficherErreur(message) {
  $("#erreur").textContent = message || "";
  $("#erreur").hidden = !message;
}

function changerVue(vue) {
  $$("#onglets-connexion button").forEach((b) => b.classList.toggle("actif", b.dataset.vue === vue));
  $("#form-connexion").hidden = vue !== "connexion";
  $("#form-inscription").hidden = vue !== "inscription";
  afficherErreur("");
  $(`#form-${vue} input`).focus();
}

$("#onglets-connexion").addEventListener("click", (e) => {
  const bouton = e.target.closest("button");
  if (bouton) changerVue(bouton.dataset.vue);
});

async function soumettre(e, url, champs) {
  e.preventDefault();
  afficherErreur("");
  const bouton = e.target.querySelector(".principal");
  bouton.disabled = true;
  const donnees = Object.fromEntries(champs.map((c) => [c, e.target.elements[c].value]));
  try {
    await envoyerJson(url, "POST", donnees);
    location.href = "index.html";
  } catch (err) {
    afficherErreur(err.message);
    bouton.disabled = false;
  }
}

$("#form-connexion").addEventListener("submit", (e) =>
  soumettre(e, "/api/auth/connexion", ["email", "mot_de_passe"]));
$("#form-inscription").addEventListener("submit", (e) =>
  soumettre(e, "/api/auth/inscription", ["nom_entreprise", "email", "mot_de_passe"]));

$("#oubli").addEventListener("click", () => {
  $("#aide-oubli").innerHTML = `Écrivez-nous à <a href="mailto:${EMAIL_SUPPORT}">${EMAIL_SUPPORT}</a>
    depuis l'adresse de votre compte : nous vous enverrons un mot de passe provisoire.`;
  $("#aide-oubli").hidden = false;
});

(async () => {
  const moi = await apiJson("/api/auth/moi");
  // Déjà connecté, ou logiciel installé (pas de comptes) : direction l'accueil
  if (moi.mode === "local" || moi.connecte) location.href = "index.html";
  const offre = moi.offre;
  if (offre.paiement_actif) {
    $("#offre").textContent = offre.essai_jours > 0
      ? `${offre.essai_jours} jours d'essai gratuit, sans carte bancaire. Ensuite ${offre.prix}, sans engagement.`
      : `${offre.prix}, sans engagement.`;
    $("#offre").hidden = false;
    $("#form-inscription .principal").textContent = offre.essai_jours > 0
      ? `Commencer l'essai gratuit de ${offre.essai_jours} jours` : "Créer mon compte et m'abonner";
  }
  if (location.hash === "#inscription") changerVue("inscription");
})();
