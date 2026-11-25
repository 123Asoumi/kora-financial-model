#!/usr/bin/env python3
"""Fabrique la bande-son de la vidéo de démo : une kora synthétisée (cordes pincées), calée sur marques.json.

La kora est une harpe-luth d'Afrique de l'Ouest à 21 cordes, accordée ici en fa majeur (pentatonique).
  - calme : un ostinato en fa majeur (le « kumbengo » du joueur de kora)
  - tension : à l'arrivée du SMS piège, le motif passe en mineur, plus rapide, avec une seconde dissonante
  - verdict : un coup grave quand le tampon « 99 % » tombe
  - soulagement : arpège ascendant quand le vrai SMS passe au vert
  - fin : arpège et accord final

Usage : python3 sonore.py <marques.json> <sortie.wav>
"""
import json, sys
import numpy as np
from scipy.signal import fftconvolve

SR = 44100
rng = np.random.default_rng(7)
NOTE = {"F2": 87.31, "G2": 98.0, "C3": 130.81, "D3": 146.83, "E3": 164.81, "F3": 174.61, "Gb3": 185.0, "G3": 196.0, "A3": 220.0,
        "Bb3": 233.08, "C4": 261.63, "D4": 293.66, "E4": 329.63, "F4": 349.23, "G4": 392.0, "A4": 440.0, "Bb4": 466.16,
        "C5": 523.25, "D5": 587.33, "E5": 659.25, "F5": 698.46, "G5": 783.99, "A5": 880.0, "C6": 1046.5, "E6": 1318.5}


def pluck(buf, t, f, vel=0.5, long=1.0, pan=0.0):
    """Une corde pincée : harmoniques qui s'éteignent à des vitesses différentes + petit claquement de chevalet."""
    if isinstance(f, str):
        f = NOTE[f]
    n = int(SR * (0.35 + 2.2 * long))
    tt = np.arange(n) / SR
    s = np.zeros(n)
    for k in range(1, 9):
        a = 1.0 / (k ** 1.25)
        tau = (0.9 * long + 0.15) / (1 + 0.55 * (k - 1))
        inh = 1 + 0.0004 * k * k  # très légère inharmonicité, comme une vraie corde
        s += a * np.exp(-tt / tau) * np.sin(2 * np.pi * f * k * inh * tt + rng.uniform(0, 0.4))
    clic = rng.standard_normal(int(SR * 0.012)) * np.exp(-np.arange(int(SR * 0.012)) / (SR * 0.0025))
    s[: len(clic)] += 0.5 * clic
    s *= np.minimum(1, tt / 0.002)  # attaque
    s *= vel / max(1e-9, np.abs(s).max())
    i = int(t * SR)
    if i < 0 or i >= len(buf[0]):
        return
    fin = min(len(buf[0]), i + n)
    g, d = np.sqrt((1 - pan) / 2), np.sqrt((1 + pan) / 2)
    buf[0][i:fin] += s[: fin - i] * g
    buf[1][i:fin] += s[: fin - i] * d


def souffle(buf, t, duree=0.5, vol=0.12):
    """Un petit froissement qui monte puis retombe, pour accompagner un changement de plan."""
    n = int(SR * duree)
    b = rng.standard_normal(n)
    b = np.convolve(b, np.ones(40) / 40, mode="same")
    env = np.sin(np.linspace(0, np.pi, n)) ** 2
    s = b * env * vol
    i = int(t * SR)
    fin = min(len(buf[0]), i + n)
    if 0 <= i < len(buf[0]):
        buf[0][i:fin] += s[: fin - i]
        buf[1][i:fin] += s[: fin - i]


def ostinato(buf, t0, t1, motif, pas=0.30, vol=0.35, basse=None, long=0.9):
    t, k = t0, 0
    while t < t1:
        f = motif[k % len(motif)]
        if f:
            pluck(buf, t, f, vol * (1.0 if k % 4 == 0 else 0.7), long, pan=((k % 3) - 1) * 0.3)
        if basse and k % 4 == 0:
            pluck(buf, t, basse[(k // 4) % len(basse)], vol * 0.9, 1.4, pan=0)
        t += pas
        k += 1


def main(marques, sortie):
    m = json.load(open(marques))
    M = {}
    for nom, v in m["marques"]:
        M.setdefault(nom, v)
    duree = m["duree"] + 1.5
    buf = np.zeros((2, int(SR * duree)))
    g = lambda nom, defaut=None: M.get(nom, defaut)

    debut, sms, tampon, c4, vert, fin = g("debut", 0), g("sms", 7), g("tampon", 30), g("c4", 45), g("vert", 55), g("fin", duree - 8)
    c5, fon = g("c5", vert + 5), g("fon", vert + 6)

    # ouverture : arpège de fa majeur sur l'écran de titre
    for k, f in enumerate(["F3", "A3", "C4", "F4", "A4", "C5"]):
        pluck(buf, debut + 0.25 + 0.17 * k, f, 0.5, 1.4, pan=-0.4 + 0.16 * k)
    souffle(buf, debut + 0.1, 0.9, 0.10)

    # calme : kumbengo en fa majeur, jusqu'au SMS
    motif_calme = ["F4", "A4", "C5", "A4", "G4", "C5", "A4", "F4", "G4", "C5", "D5", "C5", "A4", "G4", "F4", None]
    ostinato(buf, debut + 2.2, sms, motif_calme, 0.30, 0.30, basse=["F3", "C3", "G3", "F3"])

    # le SMS arrive : deux notes aiguës, façon notification
    pluck(buf, sms, "C6", 0.55, 0.6, pan=0.2)
    pluck(buf, sms + 0.16, "E6", 0.55, 0.7, pan=0.3)
    souffle(buf, g("c1", sms - 1.5), 0.6, 0.08)

    # tension : mineur, plus rapide, avec une seconde dissonante (mi + fa) tenue en basse
    motif_tension = ["D4", "A3", "Bb3", "A3", "D4", "Bb3", "A3", "Gb3", "D4", "A3", "Bb3", "A3", "E4", "Bb3", "A3", "Gb3"]
    ostinato(buf, sms + 1.2, tampon - 0.1, motif_tension, 0.22, 0.30, basse=["D3", "D3", "E3", "D3"], long=0.7)
    pluck(buf, sms + 1.2, "E3", 0.3, 2.0)
    pluck(buf, sms + 1.2, "F3", 0.3, 2.0)
    # frappes du clavier : petites notes aiguës pendant la saisie
    for a, b in ((g("copie"), g("envoi")), (g("nouveau"), g("envoi2"))):
        if a and b:
            t = a + 0.8
            while t < b:
                pluck(buf, t, rng.choice(["C5", "D5", "E5", "G5", "A5"]), 0.10, 0.25, pan=rng.uniform(-0.6, 0.6))
                t += 0.16
    if g("envoi"):
        souffle(buf, g("envoi"), 0.5, 0.10)

    # verdict : coup grave + grappe dissonante, puis bourdon sombre
    pluck(buf, tampon, "F2", 0.95, 2.2)
    pluck(buf, tampon, "Gb3", 0.55, 1.6)
    pluck(buf, tampon + 0.04, "C3", 0.55, 1.6)
    pluck(buf, tampon + 0.30, "F2", 0.5, 1.6)
    souffle(buf, tampon - 0.15, 0.4, 0.14)
    motif_sombre = ["D3", None, "A3", None, "Bb3", None, "A3", None]
    ostinato(buf, tampon + 1.0, c4 - 0.3, motif_sombre, 0.45, 0.28, long=1.1)

    # retour au calme : le vrai SMS
    souffle(buf, c4 - 0.1, 0.6, 0.09)
    motif_leger = ["C5", "A4", "F4", "A4", "C5", "D5", "C5", "A4"]
    ostinato(buf, c4 + 0.2, vert, motif_leger, 0.30, 0.26, basse=["F3", "C3"])

    # soulagement : arpège ascendant quand c'est vert
    for k, f in enumerate(["F4", "A4", "C5", "D5", "F5", "A5", "C6"]):
        pluck(buf, vert + 0.12 * k, f, 0.55, 1.5, pan=-0.5 + 0.17 * k)
    pluck(buf, vert, "F3", 0.7, 2.0)
    ostinato(buf, vert + 1.2, fin, motif_calme, 0.30, 0.28, basse=["F3", "C3", "G3", "F3"])

    # en fon : mélodie douce, plus lente
    souffle(buf, c5 - 0.1, 0.5, 0.08)
    for k, f in enumerate(["A4", "C5", "D5", "C5", "A4", "G4", "F4"]):
        pluck(buf, c5 + 0.4 + 0.35 * k, f, 0.35, 1.2, pan=0.2 * (k % 3 - 1))

    # fin : grand arpège, accord final qui résonne
    souffle(buf, fin - 0.2, 0.7, 0.12)
    for k, f in enumerate(["F3", "A3", "C4", "F4", "A4", "C5", "F5", "A5"]):
        pluck(buf, fin + 0.1 * k, f, 0.55, 1.8, pan=-0.6 + 0.17 * k)
    for f in ("F3", "C4", "F4", "A4", "C5"):
        pluck(buf, fin + 1.1, f, 0.45, 2.8)

    # réverbération courte (la calebasse et la pièce) : bruit à décroissance exponentielle
    n = int(SR * 1.4)
    ir = rng.standard_normal((2, n)) * np.exp(-np.arange(n) / (SR * 0.35))
    ir[:, 0] = 0
    mouille = np.stack([fftconvolve(buf[c], ir[c])[: buf.shape[1]] for c in (0, 1)])
    mix = buf + 0.045 * mouille
    mix *= np.minimum(1, np.arange(mix.shape[1]) / (SR * 0.5)) * np.minimum(1, (mix.shape[1] - np.arange(mix.shape[1])) / (SR * 1.2))
    mix *= 0.89 / np.abs(mix).max()
    import wave
    pcm = (mix.T * 32767).astype(np.int16)
    with wave.open(sortie, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    print("son écrit :", sortie, round(mix.shape[1] / SR, 1), "s")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
