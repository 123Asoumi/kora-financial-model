package bj.kora.lite;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;

/**
 * Mise à jour de l'appli sans Play Store :
 * - version() : la version installée ;
 * - installer({ url, sha256 }) : télécharge l'APK de la nouvelle version (évènement « progres »),
 *   vérifie son empreinte SHA-256, puis ouvre l'installateur d'Android. Android n'accepte la mise à
 *   jour que si l'APK est signée avec la même clé : celle de KORA-lite (android/empreinte-cle.txt).
 * Android demande toujours à l'utilisateur de confirmer « Mettre à jour » : une appli installée hors
 * Play Store ne peut pas se mettre à jour en silence.
 */
@CapacitorPlugin(name = "MiseAJour")
public class MiseAJourPlugin extends Plugin {

    @PluginMethod
    public void version(PluginCall call) {
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            JSObject r = new JSObject();
            r.put("version", info.versionName);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Version inconnue", "VERSION");
        }
    }

    @PluginMethod
    public void installer(PluginCall call) {
        String adresse = call.getString("url");
        String attendue = call.getString("sha256", "");
        if (adresse == null || !adresse.startsWith("https://")) {
            call.reject("Adresse de téléchargement invalide.", "ADRESSE");
            return;
        }
        // Android 8+ : l'utilisateur doit autoriser KORA-lite à installer des applis (une seule fois)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent reglage = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName()));
            reglage.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(reglage);
            call.reject("Autorise KORA-lite à installer des applis, puis touche encore « Mettre à jour ».", "AUTORISATION");
            return;
        }
        new Thread(() -> {
            try {
                File dossier = new File(getContext().getCacheDir(), "mises-a-jour");
                dossier.mkdirs();
                for (File vieux : dossier.listFiles()) vieux.delete();
                File apk = new File(dossier, "KORA-lite.apk");

                HttpURLConnection c = (HttpURLConnection) new URL(adresse).openConnection();
                c.setInstanceFollowRedirects(true);
                c.setConnectTimeout(20000);
                c.setReadTimeout(30000);
                long total = c.getContentLengthLong();
                MessageDigest empreinte = MessageDigest.getInstance("SHA-256");
                long recu = 0;
                int dernier = -1;
                try (InputStream entree = c.getInputStream(); FileOutputStream sortie = new FileOutputStream(apk)) {
                    byte[] tampon = new byte[64 * 1024];
                    int n;
                    while ((n = entree.read(tampon)) > 0) {
                        sortie.write(tampon, 0, n);
                        empreinte.update(tampon, 0, n);
                        recu += n;
                        int pct = total > 0 ? (int) (recu * 100 / total) : -1;
                        if (pct != dernier) {
                            dernier = pct;
                            JSObject p = new JSObject();
                            p.put("pourcent", pct);
                            notifyListeners("progres", p);
                        }
                    }
                } finally {
                    c.disconnect();
                }
                if (!attendue.isEmpty()) {
                    StringBuilder hex = new StringBuilder();
                    for (byte b : empreinte.digest()) hex.append(String.format(Locale.ROOT, "%02x", b));
                    if (!hex.toString().equalsIgnoreCase(attendue.trim())) {
                        apk.delete();
                        call.reject("Le fichier téléchargé est abîmé (empreinte différente). Réessaie.", "EMPREINTE");
                        return;
                    }
                }
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent installer = new Intent(Intent.ACTION_VIEW)
                        .setDataAndType(uri, "application/vnd.android.package-archive")
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(installer);
                call.resolve();
            } catch (Exception e) {
                call.reject("Téléchargement impossible : " + e.getMessage(), "RESEAU");
            }
        }).start();
    }
}
