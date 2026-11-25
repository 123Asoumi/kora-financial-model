// La voix de KORA.
//
// - Parler français : la voix du téléphone (plugin VoixKora dans l'appli Android), sinon celle du
//   navigateur (speechSynthesis).
// - Parler fon : la voix fon du service en ligne (route /parler du Space, modèle MMS de Meta).
// - Écouter en français : la dictée du téléphone, sinon celle du navigateur (Chrome, Edge, Safari).
// - Écouter en fon : on enregistre (MediaRecorder), on convertit en WAV 16 kHz, et l'oreille fon du
//   Space (route /ecouter) renvoie le texte en fon et sa traduction en français.
//
// Pendant que KORA parle, Korachoupi bouge la bouche : { parle: true|false } et { niveau: 0..1 }
// (le volume réel de la voix fon ; pour la voix française, la bouche bouge toute seule).
import { VoixNative, estAppli } from "./natif.js"

const DELAI_VOIX_FON = 30000
const DELAI_OREILLE_FON = 45000
const DUREE_MAX = 20000 // un enregistrement fon s'arrête tout seul après 20 s

export function creerVoix({ mascotte, service }) {
    let jeton = 0 // chaque nouvelle parole annule la précédente
    let audio = null
    let contexte = null
    const Reco = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition
    const synthese = globalThis.speechSynthesis
    let ecouteNavigateur = null

    const capacites = (async () => {
        if (VoixNative) {
            try { const d = await VoixNative.disponible(); return { parole: !!d.parole, dictee: !!d.ecoute } } catch (_) {}
        }
        return { parole: !!synthese, dictee: !!Reco }
    })()
    const peutEnregistrer = () => !!(navigator.mediaDevices?.getUserMedia && globalThis.MediaRecorder)

    if (VoixNative) {
        VoixNative.addListener("parole", ({ etat }) => { if (etat === "fin") finParole() })
    }

    let surFin = null
    function finParole() {
        mascotte({ parle: false })
        const f = surFin
        surFin = null
        f?.()
    }

    function arreter() {
        jeton++
        if (audio) { audio.pause(); audio = null }
        if (synthese) synthese.cancel()
        if (VoixNative) VoixNative.arreter().catch(() => {})
        finParole()
    }

    /** Coupe un texte en morceaux de phrases (les voix des navigateurs s'arrêtent sur les textes longs). */
    function morceaux(texte, max = 220) {
        const phrases = texte.replace(/\s+/g, " ").match(/[^.!?…]+[.!?…]*\s*/g) || [texte]
        const r = []
        for (const p of phrases) {
            if (r.length && (r[r.length - 1] + p).length <= max) r[r.length - 1] += p
            else r.push(p)
        }
        return r.map((x) => x.trim()).filter(Boolean)
    }

    function voixFrancaise() {
        const voix = synthese?.getVoices() || []
        return voix.find((v) => /^fr[-_]FR/i.test(v.lang) && v.localService) || voix.find((v) => /^fr/i.test(v.lang)) || null
    }

    /** Dit un texte en français. Se résout quand KORA a fini (ou a été interrompu). */
    async function parlerFr(texte) {
        arreter()
        const moi = ++jeton
        texte = texte.trim()
        if (!texte) return
        if (VoixNative) {
            await new Promise((fini, echec) => {
                surFin = fini
                mascotte({ parle: true })
                VoixNative.parler({ texte }).catch((e) => { surFin = null; mascotte({ parle: false }); echec(e) })
            })
            return
        }
        if (!synthese) throw new Error("pas de voix dans ce navigateur")
        const v = voixFrancaise()
        mascotte({ parle: true })
        for (const m of morceaux(texte)) {
            if (moi !== jeton) return
            await new Promise((fini) => {
                const u = new SpeechSynthesisUtterance(m)
                u.lang = "fr-FR"
                if (v) u.voice = v
                u.rate = 0.98
                u.onend = u.onerror = fini
                synthese.speak(u)
            })
        }
        if (moi === jeton) finParole()
    }

    /** Dit un texte en fon avec la voix du service en ligne ; la bouche suit le volume réel. */
    async function parlerFon(texte) {
        arreter()
        const moi = ++jeton
        const r = await service("/parler", { texte_fon: texte.slice(0, 600) }, DELAI_VOIX_FON)
        if (moi !== jeton) return
        const fichier = r.data[0]
        const lien = fichier?.url || fichier
        if (!lien) throw new Error("pas de son")
        let source = lien
        try { source = URL.createObjectURL(await (await fetch(lien)).blob()) } catch (_) {}
        if (moi !== jeton) return
        audio = new Audio(source)
        const a = audio
        let analyse = null
        try {
            contexte ||= new (globalThis.AudioContext || globalThis.webkitAudioContext)()
            await contexte.resume()
            const noeud = contexte.createMediaElementSource(a)
            analyse = contexte.createAnalyser()
            analyse.fftSize = 512
            noeud.connect(analyse)
            analyse.connect(contexte.destination)
        } catch (_) { analyse = null }
        mascotte({ parle: true })
        await new Promise((fini) => {
            surFin = fini
            const tampon = analyse ? new Float32Array(analyse.fftSize) : null
            const suivre = () => {
                if (a !== audio || a.paused || a.ended) return
                analyse.getFloatTimeDomainData(tampon)
                let s = 0
                for (const x of tampon) s += x * x
                mascotte({ niveau: Math.min(1, Math.sqrt(s / tampon.length) * 6) })
                requestAnimationFrame(suivre)
            }
            a.onplay = () => { if (analyse) requestAnimationFrame(suivre) }
            a.onended = a.onerror = () => { if (a === audio) { audio = null; finParole() } else fini() }
            a.play().catch(() => { if (a === audio) { audio = null; finParole() } })
        })
    }

    /** Dictée en français. surPartiel(texte) reçoit le texte au fil de la parole. */
    async function ecouterFr(surPartiel) {
        arreter()
        if (VoixNative) {
            const ecoute = await VoixNative.addListener("ecoute", ({ etat, texte }) => { if (etat === "partiel" && texte) surPartiel?.(texte) })
            try { return (await VoixNative.ecouter()).texte || "" } finally { ecoute.remove() }
        }
        if (!Reco) throw Object.assign(new Error("pas de dictée dans ce navigateur"), { code: "ECOUTE" })
        return new Promise((fini, echec) => {
            const r = new Reco()
            ecouteNavigateur = r
            r.lang = "fr-FR"
            r.interimResults = true
            r.maxAlternatives = 1
            let final = ""
            r.onresult = (e) => {
                let tout = ""
                for (const res of e.results) tout += res[0].transcript
                final = tout
                surPartiel?.(tout)
            }
            r.onerror = (e) => {
                const code = e.error === "no-speech" ? "SILENCE" : e.error === "not-allowed" ? "MICRO" : "ECOUTE"
                echec(Object.assign(new Error(e.error), { code }))
            }
            r.onend = () => { ecouteNavigateur = null; fini(final.trim()) }
            r.start()
        })
    }

    // ---------------------------------------------------------------- enregistrement fon
    let enregistreur = null
    async function commencerEnregistrement() {
        arreter()
        if (VoixNative) await VoixNative.autoriserMicro() // la permission Android d'abord, sinon getUserMedia échoue
        const flux = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
        const morceauxSon = []
        const rec = new MediaRecorder(flux)
        rec.ondataavailable = (e) => { if (e.data.size) morceauxSon.push(e.data) }
        const fin = new Promise((ok) => { rec.onstop = () => { flux.getTracks().forEach((t) => t.stop()); ok(new Blob(morceauxSon, { type: rec.mimeType })) } })
        rec.start()
        const minuterie = setTimeout(() => { if (rec.state === "recording") rec.stop() }, DUREE_MAX)
        enregistreur = { rec, fin: fin.finally(() => clearTimeout(minuterie)) }
        return enregistreur.fin
    }
    function finirEnregistrement() {
        if (enregistreur?.rec.state === "recording") enregistreur.rec.stop()
        enregistreur = null
    }
    function arreterEcoute() {
        finirEnregistrement()
        if (ecouteNavigateur) ecouteNavigateur.stop()
        if (VoixNative) VoixNative.arreterEcoute().catch(() => {})
    }

    /** Envoie un enregistrement à l'oreille fon : renvoie { fon, fr }. */
    async function comprendreFon(son) {
        const wav = await enWav16k(son)
        const r = await service("/ecouter", { audio: wav }, DELAI_OREILLE_FON)
        return { fon: String(r.data[0] || "").trim(), fr: String(r.data[1] || "").trim() }
    }

    return { capacites, peutEnregistrer, parlerFr, parlerFon, arreter, ecouterFr, commencerEnregistrement, finirEnregistrement, arreterEcoute, comprendreFon, estAppli }
}

/** Convertit un enregistrement (webm, ogg, mp4…) en WAV mono 16 kHz, lisible par le service sans ffmpeg. */
export async function enWav16k(son) {
    const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext
    const ctx = new Ctx()
    let brut
    try { brut = await ctx.decodeAudioData(await son.arrayBuffer()) } finally { ctx.close?.() }
    const n = Math.max(1, Math.ceil(brut.duration * 16000))
    const hors = new OfflineAudioContext(1, n, 16000)
    const src = hors.createBufferSource()
    src.buffer = brut
    src.connect(hors.destination)
    src.start()
    const pcm = (await hors.startRendering()).getChannelData(0)
    const vue = new DataView(new ArrayBuffer(44 + pcm.length * 2))
    const ecrire = (o, s) => { for (let i = 0; i < s.length; i++) vue.setUint8(o + i, s.charCodeAt(i)) }
    ecrire(0, "RIFF"); vue.setUint32(4, 36 + pcm.length * 2, true); ecrire(8, "WAVE"); ecrire(12, "fmt ")
    vue.setUint32(16, 16, true); vue.setUint16(20, 1, true); vue.setUint16(22, 1, true)
    vue.setUint32(24, 16000, true); vue.setUint32(28, 32000, true); vue.setUint16(32, 2, true); vue.setUint16(34, 16, true)
    ecrire(36, "data"); vue.setUint32(40, pcm.length * 2, true)
    for (let i = 0; i < pcm.length; i++) vue.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true)
    return new Blob([vue], { type: "audio/wav" })
}
