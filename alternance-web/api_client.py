import os
import time

import requests

URL = "https://api.apprentissage.beta.gouv.fr/api/job/v1/search"

DEPARTEMENTS = ["75", "77", "78", "91", "92", "93", "94", "95"]

# Codes ROME des métiers informatiques (M1805 = études et développement
# informatique, donc le développement web).
ROMES_INFORMATIQUE = ["M1805", "M1802", "M1810", "M1801", "M1806"]

# L'API plafonne à 150 résultats par source et par requête : pour avoir
# plus d'offres, on multiplie des requêtes ciblées au lieu d'une requête large.
PARIS = {"latitude": 48.8566, "longitude": 2.3522, "radius": 30}
PLAFOND = 150


def construire_requetes():
    # 1. Large : tous les métiers, par département
    for dep in DEPARTEMENTS:
        yield f"département {dep}", {"departements": [dep]}
    # 2. Ciblé : un code ROME informatique à la fois, par département
    for dep in DEPARTEMENTS:
        for rome in ROMES_INFORMATIQUE:
            yield f"département {dep} / {rome}", {"departements": [dep], "romes": rome}
    # 3. Paris et alentours par géolocalisation, un code ROME à la fois
    for rome in ROMES_INFORMATIQUE:
        yield f"autour de Paris / {rome}", {**PARIS, "romes": rome}


def _appeler(nom, params, headers):
    for tentative in range(1, 4):
        debut = time.time()
        try:
            reponse = requests.get(URL, headers=headers, params=params, timeout=(10, 120))
            if 400 <= reponse.status_code < 500 and reponse.status_code != 429:
                # Paramètre refusé : inutile de réessayer, on affiche la raison.
                print(f"  {nom} : refusé ({reponse.status_code}) {reponse.text[:300]}")
                return None
            reponse.raise_for_status()
            donnees = reponse.json()
            offres = donnees if isinstance(donnees, list) else donnees.get("jobs", [])
            alerte = "  (plafond atteint, résultats probablement tronqués)" if len(offres) >= PLAFOND else ""
            print(f"  {nom} : {len(offres)} offres en {time.time() - debut:.1f}s{alerte}")
            return offres
        except requests.exceptions.RequestException as erreur:
            print(f"  {nom}, tentative {tentative}/3 : {erreur}")
            if tentative < 3:
                time.sleep(5 * tentative)
    return None


def recuperer_offres():
    cle_api = os.getenv("LBA_API_KEY")
    if not cle_api:
        raise RuntimeError("La variable LBA_API_KEY est absente.")

    headers = {"Authorization": f"Bearer {cle_api}"}
    offres = {}
    echecs = 0

    for nom, params in construire_requetes():
        resultat = _appeler(nom, params, headers)
        if resultat is None:
            echecs += 1
        else:
            for offre in resultat:
                identifiant = (offre.get("identifier") or {}).get("id")
                if identifiant:
                    offres[identifiant] = offre  # dédoublonnage par id
        time.sleep(0.3)

    if echecs:
        print(f"Attention : {echecs} requête(s) en échec (voir ci-dessus).")
    if not offres:
        raise RuntimeError("Aucune offre récupérée (voir les erreurs ci-dessus).")

    return list(offres.values())


if __name__ == "__main__":
    toutes = recuperer_offres()
    print(f"{len(toutes)} offres uniques récupérées.")