const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("bulle", {
    debut: () => ipcRenderer.send("bulle:debut"),
    deplacer: (dx, dy) => ipcRenderer.send("bulle:deplacer", dx, dy),
    lacher: () => ipcRenderer.send("bulle:lacher"),
    toucher: () => ipcRenderer.send("bulle:toucher"),
    menu: () => ipcRenderer.send("bulle:menu"),
})
