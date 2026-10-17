"""Stockage SQLite partagé avec le backend Java (alternance-api)."""

import sqlite3
from contextlib import contextmanager
from pathlib import Path

from filters import detecter_domaine, nettoyer_texte

# Chemin absolu : fonctionne quel que soit le dossier d'où on lance le script.
DB = Path(__file__).resolve().with_name("alternance.db")

COLONNES = [
    ("entreprise", "TEXT"),
    ("poste", "TEXT"),
    ("lieu", "TEXT"),
    ("contrat", "TEXT"),
    ("duree", "INTEGER"),
    ("publie", "TEXT"),
    ("expiration", "TEXT"),
    ("domaine", "TEXT"),
    ("url", "TEXT"),
]


@contextmanager
def connexion():
    cx = sqlite3.connect(DB)
    try:
        yield cx
        cx.commit()
    except Exception:
        cx.rollback()
        raise
    finally:
        cx.close()


def initialiser_base():
    """Crée la table si besoin et ajoute les colonnes manquantes
    (migration sans perte pour une base existante)."""
    definition = ", ".join(f"{nom} {type_}" for nom, type_ in COLONNES)
    with connexion() as cx:
        cx.execute(f"CREATE TABLE IF NOT EXISTS offres (id TEXT PRIMARY KEY, {definition})")
        existantes = {ligne[1] for ligne in cx.execute("PRAGMA table_info(offres)")}
        for nom, type_ in COLONNES:
            if nom not in existantes:
                cx.execute(f"ALTER TABLE offres ADD COLUMN {nom} {type_}")


def _url_valide(url):
    url = (url or "").strip()
    return url if url.startswith(("https://", "http://")) else ""


def enregistrer_offres(offres):
    """Insère/met à jour les offres, puis supprime celles qui ne figurent
    plus dans la dernière récupération (la table est un miroir de la source)."""
    if not offres:
        return 0

    identifiants = []

    with connexion() as cx:
        for offre in offres:
            identifiant = (offre.get("identifier") or {}).get("id")
            if not identifiant:
                continue

            employeur = offre.get("workplace") or {}
            lieu = employeur.get("location") or {}
            poste = offre.get("offer") or {}
            contrat = offre.get("contract") or {}
            publication = poste.get("publication") or {}
            candidature = offre.get("apply") or {}

            cx.execute(
                """
                INSERT INTO offres
                    (id, entreprise, poste, lieu, contrat, duree, publie,
                     expiration, domaine, url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    entreprise = excluded.entreprise,
                    poste = excluded.poste,
                    lieu = excluded.lieu,
                    contrat = excluded.contrat,
                    duree = excluded.duree,
                    publie = excluded.publie,
                    expiration = excluded.expiration,
                    domaine = excluded.domaine,
                    url = excluded.url
                """,
                (
                    identifiant,
                    nettoyer_texte(
                        employeur.get("legal_name")
                        or employeur.get("name")
                        or employeur.get("brand")
                    ),
                    nettoyer_texte(poste.get("title")),
                    nettoyer_texte(lieu.get("address")),
                    ", ".join(contrat.get("type") or []),
                    contrat.get("duration"),
                    publication.get("creation") or "",
                    publication.get("expiration") or "",
                    detecter_domaine(offre) or "",
                    _url_valide(candidature.get("url")),
                ),
            )
            identifiants.append(identifiant)

        if identifiants:
            marques = ",".join("?" * len(identifiants))
            cx.execute(f"DELETE FROM offres WHERE id NOT IN ({marques})", identifiants)

    return len(identifiants)