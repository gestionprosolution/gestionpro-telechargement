// Page d'abonnement : état de l'essai / de l'abonnement, paiement via Stripe.

function afficherErreur(message) {
  $("#erreur").textContent = message || "";
  $("#erreur").hidden = !message;
}

async function versStripe(url) {
  afficherErreur("");
  try {
    location.href = (await envoyerJson(url, "POST", {})).url;
  } catch (err) {
    afficherErreur(err.message);
  }
}

$("#abonner").onclick = () => versStripe("/api/abonnement/checkout");
$("#gerer").onclick = () => versStripe("/api/abonnement/portail");
$("#deconnexion-bas").onclick = async () => {
  await api("/api/auth/deconnexion", { method: "POST" });
  location.href = "connexion.html";
};

function afficher(moi) {
  const a = moi.abonnement, offre = moi.offre;
  $("#prix").textContent = offre.prix;

  let etat, classe = "";
  if (!offre.paiement_actif) {
    etat = "Accès gratuit (paiement en ligne non activé)";
  } else if (a.abonne) {
    etat = a.statut === "past_due"
      ? "⚠ Dernier paiement refusé : mettez à jour votre carte"
      : "✓ Vous êtes abonné, merci !";
    classe = a.statut === "past_due" ? "alerte" : "ok";
  } else if (a.en_essai) {
    etat = `Essai gratuit : ${a.jours_restants} jour${a.jours_restants > 1 ? "s" : ""} restant${a.jours_restants > 1 ? "s" : ""} (jusqu'au ${dateFr(a.essai_fin)})`;
  } else {
    etat = offre.essai_jours > 0 && a.essai_fin
      ? "Votre essai gratuit est terminé. Abonnez-vous pour retrouver vos devis et factures."
      : "Abonnez-vous pour accéder à vos outils.";
    classe = "alerte";
  }
  $("#etat").textContent = etat;
  $("#etat").className = `etat ${classe}`;

  $("#abonner").hidden = !offre.paiement_actif || a.abonne;
  $("#gerer").hidden = !offre.paiement_actif || !a.gerable;
  $("#continuer").hidden = !a.acces;
}

(async () => {
  let moi = await apiJson("/api/auth/moi");
  if (moi.mode !== "web") return (location.href = "index.html");
  if (!moi.connecte) return (location.href = "connexion.html");
  afficher(moi);

  // Retour de Stripe après paiement : la confirmation arrive par webhook, on patiente un peu
  if (new URLSearchParams(location.search).has("succes") && !moi.abonnement.abonne) {
    $("#etat").textContent = "Paiement reçu, activation de votre abonnement…";
    for (let i = 0; i < 10 && !moi.abonnement.abonne; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      moi = await apiJson("/api/auth/moi");
    }
    afficher(moi);
  }
})();
