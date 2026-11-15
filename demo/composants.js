// Composants réutilisés : fiche entreprise et bloc licence
// (page de premier lancement, Paramètres, page de licence).

// --- Fiche entreprise ----------------------------------------------------------------

const GABARIT_ENTREPRISE = `
  <div class="champs">
    <div class="champ c6">
      <span>Logo <em>(apparaît sur vos devis)</em></span>
      <div class="logo-choix">
        <div class="logo-apercu" data-ref="apercu">Aucun logo</div>
        <div class="actions">
          <label class="bouton secondaire petit">Choisir une image
            <input type="file" data-ref="fichier-logo" accept="image/png,image/jpeg,image/webp" hidden></label>
          <button type="button" class="lien discret" data-ref="retirer-logo" hidden>Retirer</button>
        </div>
      </div>
    </div>
    <label class="champ c4"><span>Nom de l'entreprise</span><input name="nom" required></label>
    <label class="champ c2"><span>Forme juridique <em>(SARL, EI…)</em></span><input name="forme_juridique"></label>
    <label class="champ c6"><span>Adresse</span><input name="adresse" autocomplete="street-address"></label>
    <label class="champ c2"><span>Code postal</span><input name="code_postal" autocomplete="postal-code"></label>
    <label class="champ c4"><span>Ville</span><input name="ville"></label>
    <label class="champ"><span>Téléphone</span><input name="telephone" type="tel"></label>
    <label class="champ"><span>E-mail</span><input name="email" type="email"></label>
    <label class="champ"><span>SIRET</span><input name="siret"></label>
    <label class="champ"><span>N° de TVA intracommunautaire</span><input name="tva_intracom"></label>
    <label class="champ"><span>Immatriculation <em>(ex : RCS Lyon 123 456 789, RM 69)</em></span><input name="rcs_rm"></label>
    <label class="champ"><span>Capital social <em>(sociétés)</em></span><input name="capital" placeholder="5 000 €"></label>
    <label class="champ c6"><span>IBAN <em>(imprimé sur les devis, les factures et les relances)</em></span><input name="iban" placeholder="FR76 …"></label>
  </div>
  <hr class="separateur">
  <h3>Vos devis</h3>
  <div class="champs">
    <label class="champ c2"><span>TVA par défaut (%)</span><input name="taux_tva_defaut" type="number" step="0.1" min="0"></label>
    <label class="champ c2"><span>Validité des devis (jours)</span><input name="validite_jours" type="number" min="1"></label>
    <label class="champ c2"><span>Délai de paiement des factures (jours)</span><input name="delai_paiement_jours" type="number" min="0"></label>
    <label class="champ c6"><span>Couleur des documents</span><input name="couleur" type="color" style="max-width: 120px"></label>
    <label class="champ c6 case"><input name="franchise_tva" type="checkbox">
      Franchise de TVA (micro-entreprise : « TVA non applicable, art. 293 B du CGI »)</label>
    <label class="champ c3"><span>Vos opérations <em>(mention des factures)</em></span><select name="categorie_operation">
      <option value="mixte">Fournitures et main-d'œuvre (biens et services)</option>
      <option value="services">Prestations de services uniquement</option>
      <option value="biens">Vente de biens uniquement</option></select></label>
    <label class="champ c3 case"><input name="tva_debits" type="checkbox">
      Option pour le paiement de la TVA d'après les débits</label>
    <label class="champ c6"><span>Conditions de paiement</span><textarea name="conditions_paiement" rows="2"></textarea></label>
    <label class="champ c6"><span>Mentions complémentaires</span><textarea name="mentions" rows="2"></textarea></label>
  </div>
  <hr class="separateur">
  <h3>Mentions sur vos devis et factures</h3>
  <p class="aide" style="margin-bottom: 10px">Imprimées seulement si elles sont remplies. L'assurance est obligatoire pour
    les métiers du bâtiment, le médiateur dès que vous travaillez pour des particuliers.</p>
  <div class="champs">
    <label class="champ c4"><span>Assurance professionnelle <em>(assureur, type et n° de contrat)</em></span>
      <input name="assurance" placeholder="RC professionnelle, Assureur X, contrat n° 123456"></label>
    <label class="champ c2"><span>Couverture géographique</span><input name="assurance_couverture" placeholder="France métropolitaine"></label>
    <label class="champ c4"><span>Médiateur de la consommation <em>(nom et site)</em></span><input name="mediateur"></label>
    <label class="champ c2"><span>Prix du devis <em>(vide : « Devis gratuit »)</em></span><input name="devis_payant"></label>
  </div>
  <hr class="separateur">
  <h3>Suivi proposé à l'accueil</h3>
  <div class="champs">
    <label class="champ c2"><span>Relancer une facture après <em>(jours de retard)</em></span><input name="relance_apres_jours" type="number" min="0"></label>
    <label class="champ c2"><span>Puis relancer tous les <em>(jours)</em></span><input name="relance_intervalle_jours" type="number" min="1"></label>
    <label class="champ c2"><span>Rappel d'un devis sans réponse après <em>(jours)</em></span><input name="devis_relance_jours" type="number" min="1"></label>
  </div>
  <hr class="separateur">
  <h3>Envoi des e-mails</h3>
  <div class="champs">
    <label class="champ c4"><span>Votre messagerie <em>(ouverte par les boutons « Envoyer »)</em></span>
      <select name="messagerie">
        <option value="">Me demander au premier envoi</option>
        <option value="gmail">Gmail</option>
        <option value="outlook">Outlook.com / Hotmail / Live</option>
        <option value="office365">Outlook professionnel (Microsoft 365)</option>
        <option value="app">Logiciel de messagerie installé (Outlook, Thunderbird, Courrier…)</option>
      </select></label>
  </div>`;

function monterFormulaireEntreprise(conteneur) {
  conteneur.innerHTML = GABARIT_ENTREPRISE;
  const ref = (nom) => conteneur.querySelector(`[data-ref="${nom}"]`);
  const champs = () => conteneur.querySelectorAll("[name]");

  async function afficherLogo() {
    const url = `/api/entreprise/logo?t=${Date.now()}`;
    const existe = (await fetch(url)).ok;
    ref("apercu").innerHTML = existe ? `<img src="${url}" alt="Logo">` : "Aucun logo";
    ref("retirer-logo").hidden = !existe;
  }

  ref("fichier-logo").addEventListener("change", async (e) => {
    const fichier = e.target.files[0];
    e.target.value = "";
    if (!fichier) return;
    const donnees = new FormData();
    donnees.append("fichier", fichier);
    try {
      await api("/api/entreprise/logo", { method: "POST", body: donnees });
      await afficherLogo();
    } catch (err) { alert(err.message); }
  });
  ref("retirer-logo").addEventListener("click", async () => {
    await api("/api/entreprise/logo", { method: "DELETE" });
    await afficherLogo();
  });

  return {
    async charger() {
      const valeurs = await apiJson("/api/entreprise");
      champs().forEach((c) => {
        if (c.type === "checkbox") c.checked = valeurs[c.name];
        else c.value = valeurs[c.name] ?? "";
      });
      await afficherLogo();
      return valeurs;
    },
    // Enregistre et renvoie l'entreprise, ou null si le formulaire est incomplet
    async enregistrer() {
      const nom = conteneur.querySelector("[name=nom]");
      if (!nom.value.trim()) {
        nom.focus();
        nom.reportValidity();
        return null;
      }
      const donnees = {};
      champs().forEach((c) => {
        donnees[c.name] = c.type === "checkbox" ? c.checked
          : c.type === "number" ? Number(c.value || 0) : c.value.trim();
      });
      return envoyerJson("/api/entreprise", "PUT", donnees);
    },
  };
}

// --- Licence (logiciel installé) ----------------------------------------------------
// Le client demande sa licence depuis cet écran : la demande part avec le code de l'ordinateur, sans
// e-mail à écrire. Dès que le vendeur a créé la clé, GestionPro la récupère et l'active tout seul.
// (Une clé reçue autrement peut toujours être collée à la main.)

let attenteLicence = null;
// E-mail au vendeur à chaque demande (Web3Forms, même service que le formulaire du site : son offre gratuite
// n'accepte que les envois faits depuis une page, d'où l'envoi ici et non par le relais). Sans effet si hors ligne.
const CLE_WEB3FORMS = "0fc3ec8b-8e07-4ad9-80be-9730cf5767da";

function prevenirVendeur(d) {
  fetch("https://api.web3forms.com/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ access_key: CLE_WEB3FORMS, subject: `Demande de licence GestionPro : ${d.entreprise}`,
      from_name: "GestionPro", email: d.email, Entreprise: d.entreprise, Téléphone: d.telephone || "-",
      Utilisateurs: d.utilisateurs, "Code de l'ordinateur": d.poste, Système: `${d.systeme} · GestionPro ${d.version}`,
      "À faire": "Creer une licence > Demandes reçues : la clé s'activera toute seule chez le client." }),
  }).catch(() => {});
}

function monterBlocLicence(conteneur, surChangement = () => {}) {
  async function afficher() {
    const l = await apiJson("/api/licence");
    const active = l.type === "libre" || (l.type === "licence" && l.acces
      && (l.a_vie || l.jours_restants > (l.abonnement ? 3 : 30)));
    const n = l.utilisateurs;
    const portee = l.type === "licence" || l.type === "autre_poste"
      ? ` ${n ? `${n} utilisateur${n > 1 ? "s" : ""}` : "Utilisateurs sans limite"}${l.liee ? ", liée à cet ordinateur" : ""}.` : "";

    let etat, detail;
    if (l.type === "libre") {
      etat = "Accès libre";
      detail = "";
    } else if (l.type === "autre_poste") {
      etat = "Licence d'un autre ordinateur";
      detail = `La licence de ${echapper(l.nom)} a été créée pour un autre ordinateur (données recopiées ou
        ordinateur changé). Demandez ci-dessous une clé pour celui-ci.`;
    } else if (l.type === "licence" && l.a_vie) {
      etat = "Licence à vie activée";
      detail = `Au nom de ${echapper(l.nom)}.${portee}`;
    } else if (l.type === "licence" && l.abonnement && l.acces) {
      // Licence d'un abonnement renouvelé : sa fin compte 7 jours de marge (paiement refusé puis retenté) ;
      // l'échéance payée, celle du prochain prélèvement, est 7 jours plus tôt
      const echeance = new Date(`${l.fin}T12:00:00`);
      echeance.setDate(echeance.getDate() - 7);
      const payeJusqu = echeance.toISOString().slice(0, 10);
      etat = `Abonnement ${l.abonnement === "annuel" ? "annuel" : "mensuel"} actif`;
      detail = `Au nom de ${echapper(l.nom)}.${portee} Payé jusqu'au ${dateFr(payeJusqu)} ; renouvelé tout seul à cette
        date (prochain prélèvement), sans rien à faire.`;
    } else if (l.type === "licence") {
      etat = l.acces ? `Licence valable jusqu'au ${dateFr(l.fin)}` : `Licence expirée le ${dateFr(l.fin)}`;
      detail = `Au nom de ${echapper(l.nom)}.${portee}`;
    } else {
      etat = "Aucune licence activée";
      detail = "Demandez votre licence ci-dessous : elle s'activera toute seule sur cet ordinateur.";
    }

    // Secours : la même demande par e-mail, déjà rédigée (si l'envoi direct échoue)
    const sujet = encodeURIComponent("Demande de licence GestionPro");
    const corps = encodeURIComponent("Bonjour,\n\nJe souhaite recevoir ma licence GestionPro.\n\n"
      + `Code de mon ordinateur principal : ${l.poste || ""}\nEntreprise : \nNombre d'utilisateurs : \n\nMerci.`);
    const lienEmail = l.email_vendeur ? `mailto:${l.email_vendeur}?subject=${sujet}&body=${corps}` : "";
    const d = l.demande;
    const pluriel = (x) => (x > 1 ? "s" : "");

    const demande = d ? `
      <div class="encart ok demande-envoyee">
        <strong>Demande envoyée le ${dateFr(d.envoyee_le.slice(0, 10))}</strong>
        <span>Pour ${echapper(d.entreprise)} (${d.utilisateurs} utilisateur${pluriel(d.utilisateurs)}), réponse à
          ${echapper(d.email)}. Dès que votre licence est prête, elle s'active toute seule ici : laissez cette
          fenêtre ouverte ou revenez plus tard.</span>
        <span class="aide" id="etat-attente">Vérification en cours…</span>
        <button type="button" class="bouton-lien" id="modifier-demande">Modifier ou renvoyer la demande</button>
      </div>` : "";
    const formulaire = `
      <form class="demande-licence" id="form-demande" ${d ? "hidden" : ""}>
        <h3>Demander ma licence</h3>
        <div class="champs-demande">
          <label>Nom de l'entreprise<input name="entreprise" required maxlength="120"
            value="${echapper(d?.entreprise || (l.type === "autre_poste" ? l.nom : "") || "")}"></label>
          <label>E-mail (pour vous répondre)<input name="email" type="email" required maxlength="120"
            value="${echapper(d?.email || l.email || "")}"></label>
          <label>Téléphone (facultatif)<input name="telephone" maxlength="30" value="${echapper(d?.telephone || "")}"></label>
          <label>Nombre d'utilisateurs<input name="utilisateurs" type="number" min="1" max="50"
            value="${d?.utilisateurs || 1}" required></label>
        </div>
        <p class="aide">Le code de cet ordinateur (<strong id="code-poste">${echapper(l.poste || "")}</strong>) est joint
          automatiquement. La licence est liée à l'ordinateur principal du bureau : faites cette demande depuis
          celui-ci ; les autres ordinateurs le rejoignent sans licence.</p>
        <p class="aide">En envoyant cette demande, vous acceptez les
          <a href="https://gestionprosolution.github.io/gestionpro-telechargement/cgv.html" target="_blank">conditions générales de vente</a>. Ce que deviennent ces
          informations : <a href="https://gestionprosolution.github.io/gestionpro-telechargement/confidentialite.html" target="_blank">vos données personnelles</a>.</p>
        <div class="actions"><button class="bouton">Envoyer ma demande</button></div>
        <p class="message erreur" id="erreur-demande" hidden></p>
      </form>`;

    // Abonnement en ligne : le lien de paiement reçoit le code de cet ordinateur ; la licence arrive toute seule
    const abo = l.abonnement || {};
    const enLigne = Object.keys(abo).length && l.poste ? `
      <div class="abonnement-en-ligne">
        <h3>S'abonner en ligne</h3>
        <p class="aide">Paiement sécurisé par carte (Stripe). Votre licence s'active toute seule ici juste après. Au
          paiement, vous choisissez si l'abonnement se renouvelle automatiquement (sans engagement : arrêt possible à tout
          moment). 3 utilisateurs inclus ; vous pouvez en ajouter au paiement.</p>
        <div class="actions">${Object.entries(abo).map(([cle, a]) => `<button type="button" class="bouton
          ${cle === "annuel" ? "" : "secondaire"}" data-abonnement="${cle}">${cle === "annuel" ? "À l'année" : "Au mois"}
          · ${echapper(a.prix)}</button>`).join("")}</div>
        <span class="aide" id="etat-paiement"></span>
        <p class="aide" style="margin-top: 10px">Ou demandez votre licence ci-dessous (paiement par virement ou chèque).</p>
      </div>` : "";

    conteneur.innerHTML = `
      <div class="licence-etat">
        <div><strong>${etat}</strong><span class="aide">${detail}</span></div>
      </div>
      ${active ? "" : `
        ${enLigne}${demande}${formulaire}
        <details class="cle-recue" ${l.type === "licence" ? "open" : ""}>
          <summary>J'ai déjà une clé de licence</summary>
          <form class="saisie-cle">
            <input name="cle" placeholder="Clé de licence (commence par GP1.)" spellcheck="false" autocomplete="off" required>
            <button class="bouton">Activer</button>
          </form>
          <p class="message erreur" id="erreur-cle" hidden></p>
        </details>
        ${l.lien_achat ? `<p class="aide" style="margin-top: 14px"><a href="${echapper(l.lien_achat)}" target="_blank"
          rel="noopener">Acheter la licence${l.prix ? ` (${echapper(l.prix)})` : ""}</a></p>` : ""}`}`;

    conteneur.querySelector(".saisie-cle")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const message = conteneur.querySelector("#erreur-cle");
      try {
        await envoyerJson("/api/licence", "POST", { cle: e.target.elements.cle.value });
        await afficher();
        surChangement();
      } catch (err) {
        message.textContent = err.message;
        message.hidden = false;
      }
    });
    conteneur.querySelector("#form-demande")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target.elements;
      const message = conteneur.querySelector("#erreur-demande");
      const bouton = e.target.querySelector("button");
      bouton.disabled = true;
      try {
        const envoyee = await envoyerJson("/api/licence/demande", "POST", { entreprise: f.entreprise.value,
          email: f.email.value, telephone: f.telephone.value, utilisateurs: Number(f.utilisateurs.value || 1) });
        prevenirVendeur(envoyee);
        await afficher();
      } catch (err) {
        message.innerHTML = echapper(err.message)
          + (lienEmail ? ` <a href="${lienEmail}">Envoyer la demande par e-mail</a>` : "");
        message.hidden = false;
        bouton.disabled = false;
      }
    });
    conteneur.querySelectorAll("[data-abonnement]").forEach((b) => b.addEventListener("click", () => {
      const lien = new URL(abo[b.dataset.abonnement].lien);
      lien.searchParams.set("poste", (l.poste || "").replace(/[^A-Z0-9]/gi, ""));
      if (l.email || d?.email) lien.searchParams.set("email", l.email || d.email);
      window.open(lien.href, "_blank");
      const etatPaiement = conteneur.querySelector("#etat-paiement");
      etatPaiement.textContent = "Terminez le paiement dans la page qui vient de s'ouvrir : la licence s'activera ici "
        + "toute seule (vérifié toutes les 10 secondes).";
      clearInterval(attenteLicence);
      let essais = 0;
      attenteLicence = setInterval(async () => {
        if (++essais > 180) return clearInterval(attenteLicence);   // 30 minutes
        const r = await envoyerJson("/api/licence/recuperer", "POST", {}).catch(() => null);
        if (r?.activee) {
          clearInterval(attenteLicence);
          await afficher();
          surChangement();
        }
      }, 10000);
    }));
    conteneur.querySelector("#modifier-demande")?.addEventListener("click", () => {
      conteneur.querySelector("#form-demande").hidden = false;
      conteneur.querySelector("#form-demande [name=entreprise]").focus();
    });

    // Demande envoyée : GestionPro regarde régulièrement si la clé est prête, et l'active
    clearInterval(attenteLicence);
    if (d && !active) {
      const verifier = async () => {
        const etatAttente = () => conteneur.querySelector("#etat-attente");
        try {
          const r = await envoyerJson("/api/licence/recuperer", "POST", {});
          if (r.activee) {
            clearInterval(attenteLicence);
            await afficher();
            surChangement();
          } else if (etatAttente()) {
            etatAttente().textContent = "Licence pas encore prête (vérifiée toutes les 30 secondes).";
          }
        } catch (err) {
          if (etatAttente()) etatAttente().textContent = err.message;
        }
      };
      verifier();
      attenteLicence = setInterval(verifier, 30000);
    }
    if (!d && !active) conteneur.querySelector("#form-demande [name=entreprise]")?.focus();
    return l;
  }
  return afficher();
}
