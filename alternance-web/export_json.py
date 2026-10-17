"""Exporte la base SQLite vers alternance-front/offres.json (site public statique)."""

import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

from database import DB

SORTIE = Path(__file__).resolve().parent.parent / "alternance-front" / "offres.json"


def main():
    maintenant = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    cx = sqlite3.connect(DB)
    cx.row_factory = sqlite3.Row
    lignes = cx.execute(
        """
        SELECT id, entreprise, poste, lieu, contrat, duree, publie,
               expiration, domaine, NULLIF(url, '') AS url
        FROM offres
        WHERE expiration IS NULL OR expiration = '' OR expiration > ?
        ORDER BY publie DESC
        """,
        (maintenant,),
    ).fetchall()
    cx.close()

    if not lignes:
        print("Aucune offre en base : offres.json n'est pas modifié.")
        sys.exit(1)

    SORTIE.write_text(json.dumps([dict(l) for l in lignes], ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(lignes)} offres exportées vers {SORTIE}")


if __name__ == "__main__":
    main()