import sys
import traceback

from api_client import recuperer_offres
from database import enregistrer_offres, initialiser_base
from filters import detecter_domaine, filtrer_offres


def main():
    afficher_rejets = "--rejets" in sys.argv
    initialiser_base()

    try:
        offres = recuperer_offres()
        print(f"\nOffres récupérées : {len(offres)}")

        rapport = {}
        resultats = filtrer_offres(offres, rapport)
        print(f"Offres conservées : {len(resultats)}")

        if rapport.get("raisons"):
            print("\nOffres écartées :")
            for raison, nombre in sorted(rapport["raisons"].items(), key=lambda x: -x[1]):
                print(f"  {nombre:4d}  {raison}")

        if afficher_rejets:
            print("\nTitres écartés (hors informatique) :")
            for titre in sorted(set(rapport.get("titres_rejetes", []))):
                print("  -", titre)

        repartition = {}
        for offre in resultats:
            domaine = detecter_domaine(offre)
            repartition[domaine] = repartition.get(domaine, 0) + 1
        if repartition:
            print("\nPar domaine :")
            for domaine, nombre in sorted(repartition.items(), key=lambda x: -x[1]):
                print(f"  {nombre:4d}  {domaine}")

        if not resultats:
            print("\nAucune offre conservée : la base n'est pas modifiée.")
            return

        total = enregistrer_offres(resultats)
        print(f"\nEnregistrement terminé : {total} offres en base.")

    except Exception:
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()