"""
Fabrique les images de l'appli Android à partir de l'icône de KORA (web/icone-512.png) :
icônes du lanceur, image de la bulle flottante et écrans de démarrage.

    pip install pillow
    python outils/ressources_android.py
"""
import os

from PIL import Image, ImageDraw

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(RACINE, "android", "app", "src", "main", "res")
ICONE = Image.open(os.path.join(RACINE, "web", "icone-512.png")).convert("RGBA")
FOND = ICONE.getpixel((4, 4))[:3]  # le fond sombre de l'icône

DENSITES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def rond(image, taille):
    """Découpe l'image en disque."""
    image = image.resize((taille, taille), Image.LANCZOS)
    masque = Image.new("L", (taille * 4, taille * 4), 0)
    ImageDraw.Draw(masque).ellipse((0, 0, taille * 4 - 1, taille * 4 - 1), fill=255)
    sortie = Image.new("RGBA", (taille, taille), (0, 0, 0, 0))
    sortie.paste(image, (0, 0), masque.resize((taille, taille), Image.LANCZOS))
    return sortie


def sauver(image, *chemin):
    fichier = os.path.join(RES, *chemin)
    os.makedirs(os.path.dirname(fichier), exist_ok=True)
    image.save(fichier, optimize=True)


# 1. Icônes du lanceur (classique, ronde et premier plan de l'icône adaptative)
for nom, k in DENSITES.items():
    cote = round(48 * k)
    sauver(ICONE.resize((cote, cote), Image.LANCZOS), f"mipmap-{nom}", "ic_launcher.png")
    sauver(rond(ICONE, cote), f"mipmap-{nom}", "ic_launcher_round.png")
    plan = round(108 * k)  # l'icône adaptative fait 108 dp, dont 72 dp toujours visibles
    premier = Image.new("RGBA", (plan, plan), (0, 0, 0, 0))
    centre = ICONE.resize((round(72 * k), round(72 * k)), Image.LANCZOS)
    premier.paste(centre, ((plan - centre.width) // 2, (plan - centre.height) // 2), centre)
    sauver(premier, f"mipmap-{nom}", "ic_launcher_foreground.png")

# 2. La bulle flottante : la mascotte elle-même, détourée (sans cercle autour).
#    outils/mascotte_detouree.png vient de outils/rendu_mascotte.mjs (rendu 3D sur fond transparent).
rendu = Image.open(os.path.join(RACINE, "outils", "mascotte_detouree.png")).convert("RGBA")
alpha = rendu.split()[-1]
largeur_r, hauteur_r = rendu.size
pixels = alpha.load()
lignes_pleines = [y for y in range(hauteur_r) if any(pixels[x, y] == 255 for x in range(0, largeur_r, 2))]
# l'ombre au sol est séparée de la mascotte par des lignes vides : on efface tout ce qui suit
y = lignes_pleines[-1]
while y < hauteur_r and any(pixels[x, y] for x in range(largeur_r)):
    y += 1
rendu.paste((0, 0, 0, 0), (0, y, largeur_r, hauteur_r))
mascotte = rendu.crop(rendu.split()[-1].getbbox())
hauteur_bulle = 360  # l'appli l'affiche à 96 dp de haut
mascotte = mascotte.resize((round(mascotte.width * hauteur_bulle / mascotte.height), hauteur_bulle), Image.LANCZOS)
sauver(mascotte, "drawable-nodpi", "bulle_kora.png")

# 3. Écrans de démarrage : la mascotte au centre, sur le fond de l'icône
for dossier in sorted(os.listdir(RES)):
    fichier = os.path.join(RES, dossier, "splash.png")
    if not os.path.exists(fichier):
        continue
    largeur, hauteur = Image.open(fichier).size
    ecran = Image.new("RGB", (largeur, hauteur), FOND)
    cote = int(min(largeur, hauteur) * 0.5)
    mascotte = ICONE.resize((cote, cote), Image.LANCZOS)
    ecran.paste(mascotte, ((largeur - cote) // 2, (hauteur - cote) // 2), mascotte)
    ecran.save(fichier, optimize=True)

print("Ressources Android générées dans", RES)
