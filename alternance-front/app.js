"use strict";

/* Alternance Finder – frontend.
   Toutes les données venant de l'API sont affichées avec textContent
   (jamais innerHTML) : pas d'injection HTML possible. */

// En local : backend Spring Boot. En ligne : fichier offres.json statique.
const EN_LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
const API_URL = EN_LOCAL ? "http://localhost:8080/api/offres" : "offres.json";
const DELAI_MS = 15000;
const TAILLE_PAGE = 12;

const DEPARTEMENTS = {
  "75": "Paris", "77": "Seine-et-Marne", "78": "Yvelines", "91": "Essonne",
  "92": "Hauts-de-Seine", "93": "Seine-Saint-Denis", "94": "Val-de-Marne", "95": "Val-d'Oise",
};

// Icônes statiques (aucune donnée utilisateur dans ces chaînes).
const ICONES = {
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  immeuble: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M2 21h20M8 7h4M8 11h4M8 15h4"/></svg>',
  calendrier: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  horloge: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
  externe: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14L21 3"/></svg>',
  ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>',
  alerte: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
};

const etat = {
  offres: [],
  recherche: "",
  domaines: new Set(),
  departement: "",
  contrat: "",
  lienSeul: false,
  tri: "recent",
  visibles: TAILLE_PAGE,
};

const $ = (selecteur) => document.querySelector(selecteur);

/* ---------- Utilitaires ---------- */

function normaliser(texte) {
  return String(texte ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function nettoyer(valeur) {
  return typeof valeur === "string" ? valeur.trim() : "";
}

function el(balise, options = {}, ...enfants) {
  const noeud = document.createElement(balise);
  if (options.classe) noeud.className = options.classe;
  if (options.texte != null) noeud.textContent = options.texte;
  for (const [cle, valeur] of Object.entries(options.attrs || {})) noeud.setAttribute(cle, valeur);
  for (const enfant of enfants) if (enfant) noeud.append(enfant);
  return noeud;
}

function icone(nom) {
  const span = el("span", { classe: "ico", attrs: { "aria-hidden": "true" } });
  span.innerHTML = ICONES[nom];
  return span;
}

function avecIcone(nom, texte, balise = "span") {
  return el(balise, {}, icone(nom), el("span", { texte }));
}

function urlSure(valeur) {
  const texte = nettoyer(valeur);
  if (!texte) return null;
  try {
    const url = new URL(texte);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function lireDate(valeur) {
  const texte = nettoyer(valeur);
  if (!texte) return null;
  const date = new Date(texte);
  return Number.isNaN(date.getTime()) ? null : date;
}

const formatDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });

function titreCase(texte) {
  return texte.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, avant, lettre) => avant + lettre.toUpperCase());
}

function analyserLieu(lieu) {
  const correspondance = /(\d{5})\s+([^\d,][^,]*)$/.exec(lieu);
  if (!correspondance) return { ville: null, departement: null };
  const code = correspondance[1];
  const departement = /^9[78]/.test(code) ? code.slice(0, 3) : code.slice(0, 2);
  return { ville: titreCase(correspondance[2].trim()), departement };
}

function libelleDepartement(code) {
  return DEPARTEMENTS[code] ? `${code} – ${DEPARTEMENTS[code]}` : `Département ${code}`;
}

function normaliserOffre(brute) {
  const lieu = nettoyer(brute.lieu);
  const duree = Number(brute.duree);
  return {
    id: String(brute.id ?? ""),
    poste: nettoyer(brute.poste),
    entreprise: nettoyer(brute.entreprise),
    lieu,
    contrats: nettoyer(brute.contrat).split(",").map((c) => c.trim()).filter(Boolean),
    duree: Number.isFinite(duree) && duree > 0 ? duree : null,
    publie: lireDate(brute.publie),
    expiration: lireDate(brute.expiration),
    domaine: nettoyer(brute.domaine),
    url: urlSure(brute.url),
    ...analyserLieu(lieu),
  };
}

function informationsManquantes(offre) {
  const manques = [];
  if (!offre.entreprise) manques.push("entreprise");
  if (!offre.lieu) manques.push("lieu");
  if (!offre.url) manques.push("lien");
  return manques;
}

function compter(valeurs) {
  const compteur = new Map();
  for (const valeur of valeurs) compteur.set(valeur, (compteur.get(valeur) || 0) + 1);
  return compteur;
}

/* ---------- Chargement ---------- */

async function chargerOffres() {
  afficherChargement();
  const controleur = new AbortController();
  const minuterie = setTimeout(() => controleur.abort(), DELAI_MS);
  try {
    const reponse = await fetch(API_URL, { signal: controleur.signal, headers: { Accept: "application/json" } });
    if (!reponse.ok) throw new ErreurHttp(reponse.status);
    const donnees = await reponse.json();
    if (!Array.isArray(donnees)) throw new Error("Format de réponse inattendu");
    etat.offres = donnees.map(normaliserOffre).filter((o) => o.id && o.poste);
    construireFiltres();
    appliquer();
  } catch (erreur) {
    afficherErreur(erreur);
  } finally {
    clearTimeout(minuterie);
  }
}

class ErreurHttp extends Error {
  constructor(statut) {
    super(`HTTP ${statut}`);
    this.statut = statut;
  }
}

function afficherChargement() {
  $("#compteur").textContent = "";
  $("#resume").textContent = "Chargement des offres…";
  $("#etat").hidden = true;
  $("#plus").hidden = true;
  const liste = $("#liste");
  liste.replaceChildren(...Array.from({ length: 4 }, () => el("div", { classe: "squelette" })));
  liste.setAttribute("aria-busy", "true");
}

function afficherErreur(erreur) {
  $("#liste").replaceChildren();
  $("#liste").removeAttribute("aria-busy");
  $("#compteur").textContent = "";
  $("#resume").textContent = "Les offres n'ont pas pu être chargées.";
  $("#plus").hidden = true;

  let titre = "Le serveur ne répond pas";
  let message = EN_LOCAL
    ? el("p", {}, "Vérifie que le backend tourne sur ", el("code", { texte: "http://localhost:8080" }), ", puis réessaie.")
    : el("p", { texte: "Les offres sont momentanément indisponibles. Réessaie dans quelques minutes." });
  if (erreur instanceof ErreurHttp) {
    titre = `Le serveur a renvoyé une erreur (${erreur.statut})`;
    if (EN_LOCAL) message = el("p", {}, "Lance ", el("code", { texte: "python main.py" }), " pour mettre la base à jour, puis redémarre le backend.");
  } else if (erreur && erreur.name === "AbortError") {
    titre = "Le serveur met trop de temps à répondre";
    message = el("p", { texte: "La requête a dépassé 15 secondes. Réessaie dans un instant." });
  }

  const bouton = el("button", { classe: "btn btn--primaire", texte: "Réessayer", attrs: { type: "button" } });
  bouton.addEventListener("click", chargerOffres);
  const zone = $("#etat");
  zone.className = "etat etat--erreur";
  zone.replaceChildren(el("h3", { texte: titre }), message, bouton);
  zone.hidden = false;
}

function afficherVide() {
  const bouton = el("button", { classe: "btn btn--primaire", texte: "Réinitialiser les filtres", attrs: { type: "button" } });
  bouton.addEventListener("click", reinitialiser);
  const zone = $("#etat");
  zone.className = "etat";
  if (etat.offres.length === 0) {
    zone.replaceChildren(
      el("h3", { texte: "Aucune offre en base pour le moment" }),
      EN_LOCAL
        ? el("p", {}, "Lance ", el("code", { texte: "python main.py" }), " dans le dossier alternance-web pour récupérer les offres.")
        : el("p", { texte: "Les offres arrivent bientôt. Reviens dans quelques instants." }),
    );
  } else {
    zone.replaceChildren(
      el("h3", { texte: "Aucune offre ne correspond" }),
      el("p", { texte: "Essaie avec moins de mots, ou retire un filtre pour élargir la recherche." }),
      bouton,
    );
  }
  zone.hidden = false;
}

/* ---------- Filtres ---------- */

function construireFiltres() {
  const domaines = compter(etat.offres.map((o) => o.domaine).filter(Boolean));
  const triees = [...domaines].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"));

  const liste = $("#filtre-domaines");
  liste.replaceChildren();
  triees.forEach(([nom, nombre], index) => {
    const id = `domaine-${index}`;
    const entree = el("input", { attrs: { type: "checkbox", id, value: nom } });
    entree.addEventListener("change", () => {
      entree.checked ? etat.domaines.add(nom) : etat.domaines.delete(nom);
      appliquer();
    });
    liste.append(el("label", { classe: "case", attrs: { for: id } }, entree, el("span", { texte: nom }), el("span", { classe: "case__nombre", texte: String(nombre) })));
  });

  remplirSelect($("#filtre-departement"), "Tous les départements",
    [...compter(etat.offres.map((o) => o.departement).filter(Boolean))]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([code, nombre]) => [code, `${libelleDepartement(code)} (${nombre})`]));

  remplirSelect($("#filtre-contrat"), "Tous les contrats",
    [...compter(etat.offres.flatMap((o) => o.contrats))]
      .sort((a, b) => a[0].localeCompare(b[0], "fr"))
      .map(([nom, nombre]) => [nom, `${nom} (${nombre})`]));

  const puces = $("#puces");
  puces.replaceChildren();
  triees.slice(0, 5).forEach(([nom]) => {
    const puce = el("button", { classe: "puce", texte: nom, attrs: { type: "button", "aria-pressed": "false", "data-domaine": nom } });
    puce.addEventListener("click", () => {
      etat.domaines.has(nom) ? etat.domaines.delete(nom) : etat.domaines.add(nom);
      synchroniserControles();
      appliquer();
    });
    puces.append(puce);
  });

  if (etat.offres.some((o) => o.departement === "75")) {
    const paris = el("button", { classe: "puce", texte: "Paris", attrs: { type: "button", "aria-pressed": "false", "data-departement": "75" } });
    paris.addEventListener("click", () => {
      etat.departement = etat.departement === "75" ? "" : "75";
      synchroniserControles();
      appliquer();
    });
    puces.prepend(paris);
  }
}

function remplirSelect(select, libelleTous, options) {
  select.replaceChildren(el("option", { texte: libelleTous, attrs: { value: "" } }));
  for (const [valeur, libelle] of options) select.append(el("option", { texte: libelle, attrs: { value: valeur } }));
}

function synchroniserControles() {
  document.querySelectorAll("#filtre-domaines input").forEach((c) => { c.checked = etat.domaines.has(c.value); });
  document.querySelectorAll(".puce").forEach((p) => p.setAttribute("aria-pressed", String(puceActive(p))));
  $("#filtre-departement").value = etat.departement;
  $("#filtre-contrat").value = etat.contrat;
  $("#filtre-lien").checked = etat.lienSeul;
  $("#q").value = etat.recherche;
  $("#tri").value = etat.tri;
}

function puceActive(puce) {
  return puce.dataset.departement
    ? etat.departement === puce.dataset.departement
    : etat.domaines.has(puce.dataset.domaine);
}

function reinitialiser() {
  etat.recherche = "";
  etat.domaines.clear();
  etat.departement = "";
  etat.contrat = "";
  etat.lienSeul = false;
  etat.tri = "recent";
  synchroniserControles();
  appliquer();
}

function offresFiltrees() {
  const mots = normaliser(etat.recherche).split(/\s+/).filter(Boolean);
  const resultat = etat.offres.filter((o) => {
    if (mots.length) {
      const texte = normaliser(`${o.poste} ${o.entreprise} ${o.lieu}`);
      if (!mots.every((m) => texte.includes(m))) return false;
    }
    if (etat.domaines.size && !etat.domaines.has(o.domaine)) return false;
    if (etat.departement && o.departement !== etat.departement) return false;
    if (etat.contrat && !o.contrats.includes(etat.contrat)) return false;
    if (etat.lienSeul && !o.url) return false;
    return true;
  });

  const vide = (d) => (d ? d.getTime() : null);
  const comparateurs = {
    recent: (a, b) => (vide(b.publie) ?? -Infinity) - (vide(a.publie) ?? -Infinity),
    expiration: (a, b) => (vide(a.expiration) ?? Infinity) - (vide(b.expiration) ?? Infinity),
    entreprise: (a, b) => a.entreprise.localeCompare(b.entreprise, "fr"),
  };
  return resultat.sort(comparateurs[etat.tri]);
}

/* ---------- Affichage ---------- */

let signatureFiltres = "";

function appliquer() {
  const signature = JSON.stringify([etat.recherche, [...etat.domaines], etat.departement, etat.contrat, etat.lienSeul, etat.tri]);
  if (signature !== signatureFiltres) {
    signatureFiltres = signature;
    etat.visibles = TAILLE_PAGE;
  }
  const resultat = offresFiltrees();
  const liste = $("#liste");
  liste.removeAttribute("aria-busy");
  liste.replaceChildren(...resultat.slice(0, etat.visibles).map(creerCarte));

  const nombre = resultat.length;
  $("#compteur").textContent = nombre === 0 ? "Aucune offre trouvée" : `${nombre} offre${nombre > 1 ? "s" : ""} trouvée${nombre > 1 ? "s" : ""}`;
  $("#plus").hidden = resultat.length <= etat.visibles;
  $("#etat").hidden = nombre !== 0;
  if (nombre === 0) afficherVide();

  document.querySelectorAll(".puce").forEach((p) => p.setAttribute("aria-pressed", String(puceActive(p))));

  const entreprises = new Set(etat.offres.map((o) => o.entreprise).filter(Boolean)).size;
  $("#resume").textContent = etat.offres.length
    ? `${etat.offres.length} offres d'alternance en informatique, chez ${entreprises} entreprises.`
    : "Aucune offre en base pour le moment.";
}

function creerCarte(offre) {
  const teinte = [...offre.entreprise].reduce((somme, c) => (somme * 31 + c.charCodeAt(0)) % 360, 7);
  const avatar = el("div", { classe: "carte__avatar", texte: (offre.entreprise[0] || "?").toUpperCase(), attrs: { "aria-hidden": "true" } });
  avatar.style.setProperty("--h", String(teinte));

  const infos = el("ul", { classe: "carte__infos" });
  infos.append(avecIcone("pin", offre.lieu || "Lieu non renseigné", "li"));
  if (offre.publie) infos.append(avecIcone("calendrier", `Publiée le ${formatDate.format(offre.publie)}`, "li"));
  if (offre.expiration) infos.append(avecIcone("horloge", `Expire le ${formatDate.format(offre.expiration)}`, "li"));

  const tags = el("div", { classe: "tags" });
  if (offre.domaine) tags.append(el("span", { classe: "tag tag--domaine", texte: offre.domaine }));
  offre.contrats.forEach((c) => tags.append(el("span", { classe: "tag", texte: c })));
  if (offre.duree) tags.append(el("span", { classe: "tag", texte: `${offre.duree} mois` }));

  const corps = el("div", {},
    el("h3", { classe: "carte__titre", texte: offre.poste }),
    el("p", { classe: "carte__entreprise" }, icone("immeuble"), el("span", { texte: offre.entreprise || "Entreprise non renseignée" })),
    infos,
    tags,
  );

  const manques = informationsManquantes(offre);
  const statut = manques.length === 0
    ? el("span", { classe: "statut statut--ok", attrs: { title: "Entreprise, lieu et lien fournis par la source. La disponibilité de l'annonce n'est pas vérifiée en direct." } }, icone("ok"), el("span", { texte: "Fiche complète" }))
    : el("span", { classe: "statut statut--manque" }, icone("alerte"), el("span", { texte: `Manque : ${manques.join(", ")}` }));

  const action = el("div", { classe: "carte__action" }, statut);
  if (offre.url) {
    action.append(el("a", { classe: "btn btn--primaire", attrs: { href: offre.url, target: "_blank", rel: "noopener noreferrer" } }, el("span", { texte: "Voir l'offre" }), icone("externe")));
  } else {
    action.append(el("p", { classe: "carte__sans-lien", texte: "Lien de l'annonce à récupérer : la source n'en fournit pas." }));
  }

  return el("article", { classe: "carte" }, avatar, corps, action);
}

/* ---------- Événements ---------- */

function brancherEvenements() {
  let delai;
  $("#q").addEventListener("input", (e) => {
    clearTimeout(delai);
    delai = setTimeout(() => { etat.recherche = e.target.value; etat.visibles = TAILLE_PAGE; appliquer(); }, 150);
  });
  $("#form-recherche").addEventListener("submit", (e) => {
    e.preventDefault();
    etat.recherche = $("#q").value;
    etat.visibles = TAILLE_PAGE;
    appliquer();
    $("#offres").scrollIntoView();
  });
  $("#filtre-departement").addEventListener("change", (e) => { etat.departement = e.target.value; appliquer(); });
  $("#filtre-contrat").addEventListener("change", (e) => { etat.contrat = e.target.value; appliquer(); });
  $("#filtre-lien").addEventListener("change", (e) => { etat.lienSeul = e.target.checked; appliquer(); });
  $("#tri").addEventListener("change", (e) => { etat.tri = e.target.value; appliquer(); });
  $("#reset").addEventListener("click", reinitialiser);
  $("#plus").addEventListener("click", () => { etat.visibles += TAILLE_PAGE; appliquer(); });
  $("#toggle-filtres").addEventListener("click", (e) => {
    const ouvert = $("#panneau-filtres").classList.toggle("ouvert");
    e.currentTarget.setAttribute("aria-expanded", String(ouvert));
  });
}

document.addEventListener("DOMContentLoaded", () => {
  brancherEvenements();
  chargerOffres();
});