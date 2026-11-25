"""
Une seule version pour tout KORA-lite : celle de package.json.
Ce test échoue si un fichier a été oublié lors d'un changement de version.
(L'appli Android lit directement package.json : voir android/app/build.gradle.)
"""
import json
import os
import re

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def lire(*chemin):
    with open(os.path.join(RACINE, *chemin), encoding="utf-8") as f:
        return f.read()


VERSION = json.loads(lire("package.json"))["version"]


def test_format_de_version():
    assert re.fullmatch(r"\d+\.\d+\.\d+", VERSION), VERSION


def test_modele_de_l_appli():
    m = json.loads(lire("web", "kora_lite.json"))
    assert (m["nom"], m["version"]) == ("KORA-lite", VERSION)


def test_cache_hors_ligne():
    assert f'const CACHE = "kora-{VERSION}"' in lire("web", "sw.js")


def test_page_a_propos():
    assert f"KORA-lite version {VERSION}" in lire("web", "index.html")


def test_journal_des_versions():
    assert f"## [{VERSION}]" in lire("CHANGELOG.md")
