package bj.kora.lite;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.Locale;

/**
 * La voix de KORA dans l'appli Android (le moteur web d'Android n'a ni speechSynthesis
 * ni reconnaissance vocale) :
 * - parler(texte) : la voix française du téléphone ; évènements « parole » (debut / fin)
 *   pour que Korachoupi bouge la bouche ;
 * - ecouter() : la dictée en français du téléphone ; évènement « ecoute » (texte partiel).
 * Le fon passe par le service en ligne (voix et oreille fon), pas par ce plugin.
 */
@CapacitorPlugin(
        name = "VoixKora",
        permissions = @Permission(alias = "micro", strings = {Manifest.permission.RECORD_AUDIO})
)
public class VoixKoraPlugin extends Plugin {

    private final Handler principal = new Handler(Looper.getMainLooper());
    private TextToSpeech voix;
    private boolean voixPrete;
    private SpeechRecognizer oreille;
    private PluginCall appelEcoute;

    @Override
    public void load() {
        voix = new TextToSpeech(getContext(), statut -> {
            if (statut != TextToSpeech.SUCCESS) return;
            int r = voix.setLanguage(Locale.FRANCE);
            voixPrete = r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED;
            voix.setSpeechRate(0.95f);
            voix.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) { evenement("debut", id); }
                @Override public void onDone(String id) { evenement("fin", id); }
                @Override public void onError(String id) { evenement("fin", id); }
                @Override public void onStop(String id, boolean interrompu) { evenement("fin", id); }
            });
        });
    }

    private void evenement(String etat, String id) {
        JSObject d = new JSObject();
        d.put("etat", etat);
        d.put("id", id);
        notifyListeners("parole", d);
    }

    @Override
    protected void handleOnDestroy() {
        if (voix != null) voix.shutdown();
        principal.post(() -> { if (oreille != null) oreille.destroy(); });
        super.handleOnDestroy();
    }

    // ------------------------------------------------------------------ disponibilité
    @PluginMethod
    public void disponible(PluginCall call) {
        JSObject r = new JSObject();
        r.put("parole", voixPrete);
        r.put("ecoute", SpeechRecognizer.isRecognitionAvailable(getContext()));
        call.resolve(r);
    }

    // ------------------------------------------------------------------ appel en cours ?
    /** { enCours, haut } : un appel (téléphone ou WhatsApp) est-il en cours, et le haut-parleur est-il mis ?
     *  Sert à KORA pour savoir quand l'appel qu'il suit est fini. Aucune autorisation nécessaire. */
    @PluginMethod
    public void etatAppel(PluginCall call) {
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        int mode = am.getMode();
        JSObject r = new JSObject();
        r.put("enCours", mode == AudioManager.MODE_IN_CALL || mode == AudioManager.MODE_IN_COMMUNICATION
                || mode == AudioManager.MODE_RINGTONE || mode == AudioManager.MODE_CALL_SCREENING);
        r.put("haut", am.isSpeakerphoneOn());
        call.resolve(r);
    }

    // ------------------------------------------------------------------ parler (français)
    @PluginMethod
    public void parler(PluginCall call) {
        String texte = call.getString("texte", "");
        if (!voixPrete || voix == null) {
            call.reject("La voix française du téléphone n'est pas disponible.", "VOIX");
            return;
        }
        String id = "kora-" + System.currentTimeMillis();
        voix.speak(texte, TextToSpeech.QUEUE_FLUSH, null, id);
        JSObject r = new JSObject();
        r.put("id", id);
        call.resolve(r);
    }

    @PluginMethod
    public void arreter(PluginCall call) {
        if (voix != null) voix.stop();
        call.resolve();
    }

    // ------------------------------------------------------------------ écouter (dictée française)
    @PluginMethod
    public void ecouter(PluginCall call) {
        if (getPermissionState("micro") != PermissionState.GRANTED) {
            requestPermissionForAlias("micro", call, "apresMicro");
            return;
        }
        demarrerEcoute(call);
    }

    @PermissionCallback
    private void apresMicro(PluginCall call) {
        if (getPermissionState("micro") != PermissionState.GRANTED) {
            call.reject("Autorisation du micro refusée.", "MICRO");
            return;
        }
        demarrerEcoute(call);
    }

    /** Demande seulement l'autorisation du micro (pour l'enregistrement fon dans la page). */
    @PluginMethod
    public void autoriserMicro(PluginCall call) {
        if (getPermissionState("micro") == PermissionState.GRANTED) {
            call.resolve();
            return;
        }
        requestPermissionForAlias("micro", call, "apresAutorisation");
    }

    @PermissionCallback
    private void apresAutorisation(PluginCall call) {
        if (getPermissionState("micro") == PermissionState.GRANTED) call.resolve();
        else call.reject("Autorisation du micro refusée.", "MICRO");
    }

    private void demarrerEcoute(PluginCall call) {
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            call.reject("La reconnaissance vocale du téléphone n'est pas disponible.", "ECOUTE");
            return;
        }
        if (appelEcoute != null) appelEcoute.reject("Écoute remplacée.", "ANNULE");
        appelEcoute = call;
        principal.post(() -> {
            if (oreille != null) oreille.destroy();
            oreille = SpeechRecognizer.createSpeechRecognizer(getContext());
            oreille.setRecognitionListener(new Ecoute());
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                    .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "fr-FR")
                    .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                    .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            oreille.startListening(intent);
        });
    }

    @PluginMethod
    public void arreterEcoute(PluginCall call) {
        principal.post(() -> { if (oreille != null) oreille.stopListening(); });
        call.resolve();
    }

    private class Ecoute implements RecognitionListener {
        private String premier(Bundle b) {
            ArrayList<String> l = b == null ? null : b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            return l == null || l.isEmpty() ? "" : l.get(0);
        }
        @Override public void onReadyForSpeech(Bundle p) { JSObject d = new JSObject(); d.put("etat", "pret"); notifyListeners("ecoute", d); }
        @Override public void onBeginningOfSpeech() { }
        @Override public void onRmsChanged(float v) { }
        @Override public void onBufferReceived(byte[] b) { }
        @Override public void onEndOfSpeech() { }
        @Override public void onEvent(int t, Bundle p) { }
        @Override public void onPartialResults(Bundle b) {
            JSObject d = new JSObject();
            d.put("etat", "partiel");
            d.put("texte", premier(b));
            notifyListeners("ecoute", d);
        }
        @Override public void onResults(Bundle b) {
            if (appelEcoute == null) return;
            JSObject r = new JSObject();
            r.put("texte", premier(b));
            appelEcoute.resolve(r);
            appelEcoute = null;
        }
        @Override public void onError(int code) {
            if (appelEcoute == null) return;
            String raison = code == SpeechRecognizer.ERROR_NO_MATCH || code == SpeechRecognizer.ERROR_SPEECH_TIMEOUT
                    ? "Je n'ai rien entendu." : "La dictée a échoué (code " + code + ").";
            appelEcoute.reject(raison, code == SpeechRecognizer.ERROR_NO_MATCH || code == SpeechRecognizer.ERROR_SPEECH_TIMEOUT ? "SILENCE" : "ECOUTE");
            appelEcoute = null;
        }
    }
}
