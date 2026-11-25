package bj.kora.lite;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;
import androidx.core.content.IntentCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Pont entre l'appli web de KORA et Android.
 *
 * - demarrer() : demande les autorisations (afficher par-dessus les autres applis, capture d'écran)
 *   puis lance la bulle flottante (BulleService) ;
 * - arreter(), etat() ;
 * - évènements envoyés à la page : « capture » (image prise par la bulle ou partagée depuis une
 *   autre appli) et « texte » (texte partagé depuis une autre appli).
 */
@CapacitorPlugin(
        name = "BulleKora",
        permissions = @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS})
)
public class BulleKoraPlugin extends Plugin {

    static final String EXTRA_CAPTURE = "bj.kora.lite.CAPTURE";

    @Override
    public void load() {
        traiterIntent(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        traiterIntent(intent);
    }

    // Quand KORA est à l'écran, la bulle se cache (comme Messenger dans sa propre appli)
    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        BulleService.masquer(true);
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        BulleService.masquer(false);
    }

    // ------------------------------------------------------------------ ce qui arrive dans l'appli
    private void traiterIntent(Intent intent) {
        if (intent == null) return;
        String chemin = intent.getStringExtra(EXTRA_CAPTURE);
        if (chemin != null) {
            intent.removeExtra(EXTRA_CAPTURE);
            envoyerCapture(chemin, "Capture faite avec la bulle");
            return;
        }
        if (!Intent.ACTION_SEND.equals(intent.getAction())) return;
        intent.setAction(Intent.ACTION_MAIN); // pour ne pas le traiter deux fois
        String type = intent.getType() == null ? "" : intent.getType();
        if (type.startsWith("image/")) {
            Uri uri = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri.class);
            File copie = uri == null ? null : copierImage(uri);
            if (copie != null) envoyerCapture(copie.getAbsolutePath(), "Partagé depuis une autre appli");
        } else {
            CharSequence texte = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
            if (texte != null && texte.toString().trim().length() > 0) {
                JSObject data = new JSObject();
                data.put("texte", texte.toString());
                notifyListeners("texte", data, true);
            }
        }
    }

    private void envoyerCapture(String chemin, String etiquette) {
        JSObject data = new JSObject();
        data.put("chemin", chemin);
        data.put("etiquette", etiquette);
        // true : gardé en attente si la page n'écoute pas encore (démarrage de l'appli)
        notifyListeners("capture", data, true);
    }

    private File copierImage(Uri uri) {
        File dossier = BulleService.dossierCaptures(getContext());
        File sortie = new File(dossier, "partage-" + System.currentTimeMillis() + ".img");
        try (InputStream in = getContext().getContentResolver().openInputStream(uri);
             OutputStream out = new FileOutputStream(sortie)) {
            if (in == null) return null;
            byte[] tampon = new byte[64 * 1024];
            int n;
            while ((n = in.read(tampon)) > 0) out.write(tampon, 0, n);
            return sortie;
        } catch (Exception e) {
            return null;
        }
    }

    // ------------------------------------------------------------------ méthodes appelées par la page
    @PluginMethod
    public void etat(PluginCall call) {
        JSObject r = new JSObject();
        r.put("superposition", Settings.canDrawOverlays(getContext()));
        r.put("active", BulleService.estActive());
        call.resolve(r);
    }

    @PluginMethod
    public void demarrer(PluginCall call) {
        if (BulleService.estActive()) {
            call.resolve();
            return;
        }
        // Android 13+ : la notification « KORA veille » (avec le bouton Arrêter) demande une autorisation
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "apresNotifications");
            return;
        }
        etapeSuperposition(call);
    }

    @PermissionCallback
    private void apresNotifications(PluginCall call) {
        etapeSuperposition(call); // la bulle marche aussi sans notification visible
    }

    private void etapeSuperposition(PluginCall call) {
        if (Settings.canDrawOverlays(getContext())) {
            etapeCapture(call);
            return;
        }
        Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + getContext().getPackageName()));
        startActivityForResult(call, i, "apresSuperposition");
    }

    @ActivityCallback
    private void apresSuperposition(PluginCall call, ActivityResult resultat) {
        if (call == null) return;
        if (!Settings.canDrawOverlays(getContext())) {
            call.reject("Autorisation « Afficher par-dessus les autres applis » refusée.", "SUPERPOSITION");
            return;
        }
        etapeCapture(call);
    }

    private void etapeCapture(PluginCall call) {
        MediaProjectionManager mpm = (MediaProjectionManager) getContext().getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        startActivityForResult(call, mpm.createScreenCaptureIntent(), "apresCapture");
    }

    @ActivityCallback
    private void apresCapture(PluginCall call, ActivityResult resultat) {
        if (call == null) return;
        if (resultat.getResultCode() != Activity.RESULT_OK || resultat.getData() == null) {
            call.reject("Capture d'écran refusée.", "CAPTURE");
            return;
        }
        Intent service = new Intent(getContext(), BulleService.class)
                .putExtra(BulleService.EXTRA_CODE, resultat.getResultCode())
                .putExtra(BulleService.EXTRA_DONNEES, resultat.getData());
        ContextCompat.startForegroundService(getContext(), service);
        call.resolve();
    }

    @PluginMethod
    public void arreter(PluginCall call) {
        getContext().stopService(new Intent(getContext(), BulleService.class));
        call.resolve();
    }
}
