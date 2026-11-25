#!/usr/bin/env python3
"""Enregistre tournage.html (la vraie appli KORA pilotée + titres animés) avec Chrome, sans interface.

Sortie dans le dossier donné en argument :
  frames/        les images (jpeg) et frames.txt (liste pour ffmpeg, avec leurs durées)
  marques.json   les instants clés de la démo (secondes depuis le début), pour caler le son

Usage : python3 enregistrer.py <dossier de sortie>
Il faut : google-chrome, python3-websocket. Aucun serveur : la page est ouverte depuis le fichier.
"""
import base64, json, os, subprocess, sys, time, urllib.request
import websocket

sortie = os.path.abspath(sys.argv[1])
os.makedirs(sortie + "/frames", exist_ok=True)
PAGE = "file://" + os.path.abspath(os.path.join(os.path.dirname(__file__), "tournage.html"))
PORT = 9666

chrome = subprocess.Popen([
    "google-chrome", "--headless=new", "--no-sandbox", "--allow-file-access-from-files",
    f"--remote-debugging-port={PORT}", "--remote-allow-origins=*", "--window-size=1920,1080",
    "--user-data-dir=" + sortie + "/profil", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(40):  # attend que Chrome réponde
        try:
            urllib.request.urlopen(f"http://localhost:{PORT}/json"); break
        except Exception:
            time.sleep(0.5)
    time.sleep(1)
    tab = next(t for t in json.load(urllib.request.urlopen(f"http://localhost:{PORT}/json")) if t.get("type") == "page" and not t["url"].startswith("chrome-extension"))
    ws = websocket.create_connection(tab["webSocketDebuggerUrl"], max_size=None)
    n = [0]
    images = []  # (horodatage, nom de fichier)

    def envoyer(methode, **params):
        n[0] += 1
        ws.send(json.dumps({"id": n[0], "method": methode, "params": params}))
        return n[0]

    def lire(attendu=None, delai=None):
        """Lit les messages ; enregistre les images au passage.
        Avec `attendu` : renvoie la réponse de cet appel. Avec `delai` : lit pendant `delai` secondes puis rend la main."""
        fin = time.time() + delai if delai is not None else None
        while True:
            if fin is not None and time.time() >= fin:
                return None
            ws.settimeout(0.5 if fin is not None else 30)
            try:
                m = json.loads(ws.recv())
            except websocket.WebSocketTimeoutException:
                if fin is None:
                    raise
                continue
            if m.get("method") == "Page.screencastFrame":
                p = m["params"]
                ts = p["metadata"]["timestamp"]
                if not images or ts - images[-1][0] >= 1 / 30:  # 30 images par seconde au plus
                    nom = f"{len(images):05d}.jpg"
                    open(f"{sortie}/frames/{nom}", "wb").write(base64.b64decode(p["data"]))
                    images.append((ts, nom))
                envoyer("Page.screencastFrameAck", sessionId=p["sessionId"])
            elif attendu is not None and m.get("id") == attendu:
                return m

    def appeler(methode, **params):
        return lire(envoyer(methode, **params))

    def evaluer(js):
        r = appeler("Runtime.evaluate", expression=js, returnByValue=True)
        if os.environ.get("DEBUG_CDP"): print(json.dumps(r)[:300], flush=True)
        return r["result"].get("result", {}).get("value")

    appeler("Page.enable")
    appeler("Emulation.setDeviceMetricsOverride", width=1920, height=1080, deviceScaleFactor=1, mobile=False)
    for essai in range(5):  # la première navigation est parfois avortée par Chrome au démarrage
        if "errorText" not in appeler("Page.navigate", url=PAGE)["result"]:
            break
        time.sleep(2)
    debut = time.time()
    print("page :", evaluer("location.href"), "|", PAGE, flush=True)
    while not evaluer("window.__pret === true"):
        print("attente", round(time.time() - debut), evaluer("document.getElementById('app').contentDocument.body.className"), flush=True)
        if time.time() - debut > 90:
            raise SystemExit("L'appli n'est pas prête après 90 s")
        time.sleep(1)
    print("appli prête, début de l'enregistrement")
    appeler("Page.startScreencast", format="jpeg", quality=88, maxWidth=1920, maxHeight=1080, everyNthFrame=1)
    envoyer("Runtime.evaluate", expression="window.__run()")
    t = time.time()
    while time.time() - t < 150:
        lire(delai=1.0)
        if evaluer("window.__fini === true"):
            break
    time.sleep(0.5)
    lire(delai=0.5)
    appeler("Page.stopScreencast")
    marques = evaluer("JSON.stringify(window.__marks)")
    t0 = json.loads(marques)[0][1]
    # temps des marques par rapport à la première image enregistrée
    premiere = images[0][0]
    json.dump({"debut_video": t0 - premiere, "marques": [[k, round(v - premiere, 3)] for k, v in json.loads(marques)],
               "images": len(images), "duree": round(images[-1][0] - premiere, 3)},
              open(sortie + "/marques.json", "w"), indent=1)
    with open(sortie + "/frames.txt", "w") as f:
        for i, (ts, nom) in enumerate(images):
            suivant = images[i + 1][0] if i + 1 < len(images) else ts + 0.1
            f.write(f"file 'frames/{nom}'\nduration {max(0.001, suivant - ts):.4f}\n")
        f.write(f"file 'frames/{images[-1][1]}'\n")
    print(len(images), "images,", round(images[-1][0] - premiere, 1), "s")
finally:
    chrome.kill()
