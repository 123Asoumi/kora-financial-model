// Le pont entre la page KORA et l'appli de bureau : seulement ces quatre gestes, rien d'autre.
const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("koraBureau", {
    etatBulle: () => ipcRenderer.invoke("bulle:etat"),
    demarrerBulle: () => ipcRenderer.invoke("bulle:demarrer"),
    arreterBulle: () => ipcRenderer.invoke("bulle:arreter"),
    /** rappel({ png: Uint8Array, etiquette }) à chaque capture faite avec la bulle */
    surCapture: (rappel) => {
        const ecoute = (_e, donnees) => rappel(donnees)
        ipcRenderer.on("capture", ecoute)
        ipcRenderer.send("page:prete") // les captures en attente sont livrées maintenant
        return () => ipcRenderer.removeListener("capture", ecoute)
    },
})
