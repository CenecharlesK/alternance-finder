"""Filtrage des offres : garde les alternances informatiques actives
et détermine leur domaine (Développement, Data, Cybersécurité, etc.)."""

import html
import re
import unicodedata
from datetime import datetime, timezone


def nettoyer_texte(texte):
    """Décode les entités HTML de la source (R&amp;D -> R&D)."""
    texte = str(texte or "")
    for _ in range(2):
        texte = html.unescape(texte)
    return texte.strip()


def normaliser(texte):
    """Minuscules, sans accents, ponctuation simplifiée."""
    texte = unicodedata.normalize("NFD", str(texte or "").lower())
    texte = "".join(c for c in texte if unicodedata.category(c) != "Mn")
    texte = re.sub(r"[’'`/\\\-–—_()\[\],:;|!?&]", " ", texte)
    texte = re.sub(r"\s+", " ", texte).strip()
    # chef / cheffe / chef(fe) de projet -> chef de projet
    texte = re.sub(r"chef(?:fe)?(?: (?:cheffe|fe|e))? de projet", "chef de projet", texte)
    return texte


def _motif(termes):
    """Un terme finissant par * accepte n'importe quelle fin de mot."""
    morceaux = []
    for terme in termes:
        suffixe = r"[a-z0-9]*" if terme.endswith("*") else ""
        morceaux.append(re.escape(normaliser(terme.rstrip("*"))) + suffixe)
    return re.compile(r"(?<![a-z0-9])(?:" + "|".join(morceaux) + r")(?![a-z0-9])")


# L'ordre compte : le premier domaine qui correspond est retenu.
DOMAINES = {
    "Cybersécurité": _motif([
        "cyber*", "securite informatique", "securite des systemes",
        "securite numerique", "pentest*", "soc", "ssi", "rssi",
    ]),
    "Data & IA": _motif([
        "data*", "donnees", "big data", "business intelligence", "bi",
        "power bi", "sql", "etl", "machine learning", "deep learning",
        "intelligence artificielle", "ia", "ai", "ml", "mlops", "llm",
    ]),
    "Gestion de projet & produit": _motif([
        "chef de projet digital*", "chef de projet web",
        "chef de projet informatique", "chef de projet si",
        "chef de projet it", "chef de projet numerique",
        "chef de projet technique", "chef de projet applicati*",
        "chef de projet crm", "administrateur crm",
        "product owner", "product manager", "scrum master",
        "business analyst", "amoa", "moa", "maitrise d ouvrage",
    ]),
    "Design UX/UI": _motif([
        "ux", "ui", "product designer", "web designer", "webdesigner",
    ]),
    "Développement": _motif([
        "developpeur*", "developpeuse*", "developer*", "developpement web",
        "developpement logiciel", "developpement informatique",
        "developpement applicati*", "developpement mobile", "dev",
        "fullstack", "full stack", "front end", "frontend", "back end",
        "backend", "web", "webmaster", "logiciel*", "software",
        "javascript", "typescript", "node js", "nodejs", "react",
        "react native", "reactjs", "angular", "angularjs", "vue js",
        "vuejs", "php", "laravel", "symfony", "python", "java", "kotlin",
        "swift", "golang", "ruby", "scala", "c#", "c++", ".net", "dotnet",
        "flutter", "programmation", "integrateur web", "testeur logiciel",
        "qa",
    ]),
    "Systèmes, réseaux & support": _motif([
        "informatique*", "it", "reseau informatique", "administrateur systeme*",
        "administrateur reseau*", "systemes et reseaux", "systemes reseaux",
        "systeme d information", "systemes d information",
        "infrastructure it", "infrastructure systemes", "infrastructure cloud",
        "infrastructure reseau*", "devops", "sre", "cloud", "linux",
        "virtualisation", "support technique", "support utilisateur",
        "support informatique", "helpdesk", "help desk", "technicien support",
        "technicien systemes", "technicien reseau*", "ingenieur systemes",
        "ingenieur reseau*",
    ]),
}

# Mots du titre qui indiquent un métier hors informatique.
EXCLUSIONS_TITRE = _motif([
    "commercial*", "business developer", "business development", "vente*",
    "vendeur*", "marketing", "communication", "comptab*", "paie",
    "immobilier", "community manager", "rh", "ressources humaines",
    "juridique",
])

# Codes ROME de la famille « systèmes d'information et télécoms » (M18xx).
# Utilisés seulement si le titre ne dit rien ET que la description cite
# au moins deux technologies précises (évite les offres R&D ou ingénierie).
DOMAINE_PAR_ROME = {
    "M1801": "Systèmes, réseaux & support",
    "M1802": "Systèmes, réseaux & support",
    "M1803": "Gestion de projet & produit",
    "M1805": "Développement",
    "M1806": "Gestion de projet & produit",
    "M1810": "Systèmes, réseaux & support",
}

TECHNOS_DESCRIPTION = _motif([
    "javascript", "typescript", "react", "angular", "vue js", "vuejs",
    "node js", "nodejs", "php", "laravel", "symfony", "python", "java",
    "sql", "html", "css", "docker", "git", "kubernetes", "linux",
    "api rest", "devops", "machine learning",
])

EMPLOYEURS_A_EXCLURE = _motif([
    "business school", "centre de formation", "ecole*", "cfa", "campus",
])


def detecter_domaine(offre):
    """Retourne le domaine informatique de l'offre, ou None."""
    poste = offre.get("offer") or {}
    titre = normaliser(nettoyer_texte(poste.get("title")))

    if EXCLUSIONS_TITRE.search(titre):
        return None

    for domaine, motif in DOMAINES.items():
        if motif.search(titre):
            return domaine

    codes = [c for c in poste.get("rome_codes") or [] if c in DOMAINE_PAR_ROME]
    if codes:
        description = normaliser(nettoyer_texte(poste.get("description")))
        if len(set(TECHNOS_DESCRIPTION.findall(description))) >= 2:
            return DOMAINE_PAR_ROME[codes[0]]

    return None


def _rejeter(rapport, raison, titre=""):
    if rapport is None:
        return
    raisons = rapport.setdefault("raisons", {})
    raisons[raison] = raisons.get(raison, 0) + 1
    if raison == "hors informatique":
        rapport.setdefault("titres_rejetes", []).append(titre)


def filtrer_offres(offres, rapport=None):
    """Garde les alternances informatiques actives et non expirées.
    `rapport` (dict optionnel) reçoit le détail des offres écartées."""
    resultats = []
    maintenant = datetime.now(timezone.utc)

    for offre in offres:
        employeur = offre.get("workplace") or {}
        poste = offre.get("offer") or {}
        contrat = offre.get("contract") or {}
        publication = poste.get("publication") or {}
        titre = nettoyer_texte(poste.get("title"))

        types_contrat = " ".join(str(t).lower() for t in contrat.get("type") or [])
        if not any(t in types_contrat for t in ("apprentissage", "professionnalisation")):
            _rejeter(rapport, "contrat non alternance")
            continue

        nom_entreprise = normaliser(employeur.get("legal_name") or employeur.get("name"))
        if EMPLOYEURS_A_EXCLURE.search(nom_entreprise):
            _rejeter(rapport, "employeur école/CFA")
            continue

        if detecter_domaine(offre) is None:
            _rejeter(rapport, "hors informatique", titre)
            continue

        statut = (poste.get("status") or "active").lower()
        if statut != "active":
            _rejeter(rapport, "offre non active")
            continue

        expiration = publication.get("expiration")
        if expiration:
            try:
                fin = datetime.fromisoformat(expiration.replace("Z", "+00:00"))
                if fin <= maintenant:
                    _rejeter(rapport, "offre expirée")
                    continue
            except ValueError:
                pass

        resultats.append(offre)

    return resultats