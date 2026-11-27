const test = require("node:test")
const assert = require("node:assert/strict")
const path = require("path")
const { typeMime, cheminSur, aimanter } = require("../outils")

const RACINE = path.resolve("/tmp/kora/web")

test("la racine sert index.html", () => {
    assert.equal(cheminSur(RACINE, "/"), path.join(RACINE, "index.html"))
})
test("un fichier du dossier", () => {
    assert.equal(cheminSur(RACINE, "/vendor/tesseract/worker.min.js"), path.join(RACINE, "vendor", "tesseract", "worker.min.js"))
})
test("on ne sort pas du dossier", () => {
    for (const p of ["/../secret", "/..%2Fsecret", "/%2e%2e/%2e%2e/etc/passwd", "/a/../../x", "/ok\0.js", "/%E0%A4%A"])
        assert.equal(cheminSur(RACINE, p), null, p)
})
test("un dossier voisin au nom proche est refusé", () => {
    assert.equal(cheminSur(RACINE, "/../web-secret/x"), null)
})
test("types", () => {
    assert.equal(typeMime("a.wasm"), "application/wasm")
    assert.match(typeMime("a.js"), /^text\/javascript/)
    assert.equal(typeMime("a.inconnu"), "application/octet-stream")
})
test("la bulle se colle au bord le plus proche", () => {
    const zone = { x: 0, y: 0, width: 1920, height: 1040 }
    assert.deepEqual(aimanter({ x: 100, y: 200, width: 100, height: 150 }, zone), { x: 0, y: 200 })
    assert.deepEqual(aimanter({ x: 1500, y: 200, width: 100, height: 150 }, zone), { x: 1820, y: 200 })
    assert.deepEqual(aimanter({ x: 1500, y: 2000, width: 100, height: 150 }, zone), { x: 1820, y: 890 })
    assert.deepEqual(aimanter({ x: 10, y: -50, width: 100, height: 150 }, { x: 0, y: 40, width: 1920, height: 1000 }), { x: 0, y: 40 })
})
