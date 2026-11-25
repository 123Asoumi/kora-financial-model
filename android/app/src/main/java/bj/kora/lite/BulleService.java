package bj.kora.lite;

import android.animation.ValueAnimator;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.drawable.GradientDrawable;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowManager;
import android.view.animation.DecelerateInterpolator;
import android.widget.ImageView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.IntentCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;
import java.util.Arrays;

/**
 * La bulle KORA : la mascotte elle-même (détourée, sans cercle autour) flotte par-dessus les autres
 * applis, comme une bulle de Messenger.
 *
 * - on la déplace du doigt, elle se colle au bord le plus proche ;
 * - on la glisse sur la croix en bas de l'écran pour la fermer ;
 * - on la touche : elle se cache, prend une capture de l'écran, puis ouvre KORA qui lit
 *   le message sur la capture et dit si c'est une arnaque. L'analyse reste dans le téléphone.
 */
public class BulleService extends Service {

    static final String EXTRA_CODE = "code";
    static final String EXTRA_DONNEES = "donnees";
    static final String ACTION_ARRETER = "bj.kora.lite.ARRETER_BULLE";
    private static final String CANAL = "bulle";
    private static final int NOTIFICATION = 7;
    // la mascotte détourée (res/drawable-nodpi/bulle_kora.png, 174 × 360 px) : haute et fine
    private static final int LARGEUR_DP = 46;
    private static final int HAUTEUR_DP = 96;

    private static volatile BulleService instance;

    private final Handler principal = new Handler(Looper.getMainLooper());
    private final Object verrou = new Object();

    private WindowManager fenetres;
    private ImageView bulle;
    private TextView croix;
    private WindowManager.LayoutParams posBulle;
    private WindowManager.LayoutParams posCroix;
    private boolean masqueeParKora;

    private MediaProjection projection;
    private VirtualDisplay ecran;
    private ImageReader lecteur;
    private HandlerThread filFond;
    private Handler fond;
    private Image derniere; // la dernière image de l'écran reçue
    private boolean captureEnCours;
    private int largeur;
    private int hauteur;

    // ------------------------------------------------------------------ accès depuis le plugin
    static boolean estActive() {
        return instance != null;
    }

    static void masquer(boolean oui) {
        BulleService s = instance;
        if (s != null) s.principal.post(() -> {
            s.masqueeParKora = oui;
            s.majVisibilite();
        });
    }

    static File dossierCaptures(Context ctx) {
        File dossier = new File(ctx.getCacheDir(), "captures");
        if (!dossier.exists()) dossier.mkdirs();
        // on ne garde que les dernières captures
        File[] fichiers = dossier.listFiles();
        if (fichiers != null && fichiers.length > 6) {
            Arrays.sort(fichiers, (a, b) -> Long.compare(a.lastModified(), b.lastModified()));
            for (int i = 0; i < fichiers.length - 6; i++) fichiers[i].delete();
        }
        return dossier;
    }

    // ------------------------------------------------------------------ cycle de vie
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_ARRETER.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        // Android exige que le service soit au premier plan AVANT d'ouvrir la capture d'écran
        demarrerPremierPlan();
        if (projection != null) return START_NOT_STICKY; // déjà lancée
        Intent donnees = intent == null ? null : IntentCompat.getParcelableExtra(intent, EXTRA_DONNEES, Intent.class);
        int code = intent == null ? 0 : intent.getIntExtra(EXTRA_CODE, 0);
        MediaProjectionManager mpm = (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        try {
            projection = donnees == null ? null : mpm.getMediaProjection(code, donnees);
        } catch (Exception e) {
            projection = null;
        }
        if (projection == null) {
            stopSelf();
            return START_NOT_STICKY;
        }
        projection.registerCallback(new MediaProjection.Callback() {
            @Override
            public void onStop() {
                principal.post(BulleService.this::stopSelf);
            }
        }, principal);
        fenetres = (WindowManager) getSystemService(WINDOW_SERVICE);
        filFond = new HandlerThread("kora-capture");
        filFond.start();
        fond = new Handler(filFond.getLooper());
        preparerEcran();
        afficherBulle();
        instance = this;
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        instance = null;
        try { if (bulle != null) fenetres.removeView(bulle); } catch (Exception ignore) { }
        try { if (croix != null) fenetres.removeView(croix); } catch (Exception ignore) { }
        if (ecran != null) ecran.release();
        synchronized (verrou) {
            if (derniere != null) derniere.close();
            derniere = null;
        }
        if (lecteur != null) lecteur.close();
        if (projection != null) projection.stop();
        if (filFond != null) filFond.quitSafely();
        super.onDestroy();
    }

    @Override
    public void onConfigurationChanged(Configuration config) {
        super.onConfigurationChanged(config);
        if (ecran == null) return;
        // l'écran a tourné : on suit sa nouvelle taille
        Rect taille = tailleEcran();
        if (taille.width() == largeur && taille.height() == hauteur) return;
        ImageReader ancien = lecteur;
        lecteur = nouveauLecteur(taille.width(), taille.height());
        ecran.resize(largeur, hauteur, getResources().getDisplayMetrics().densityDpi);
        ecran.setSurface(lecteur.getSurface());
        synchronized (verrou) {
            if (derniere != null) derniere.close();
            derniere = null;
        }
        ancien.close();
        if (bulle != null) aimanter(false);
    }

    // ------------------------------------------------------------------ notification « KORA veille »
    private void demarrerPremierPlan() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CANAL) == null) {
            NotificationChannel canal = new NotificationChannel(CANAL, "Bulle KORA", NotificationManager.IMPORTANCE_LOW);
            canal.setDescription("Affichée tant que la bulle KORA est active.");
            nm.createNotificationChannel(canal);
        }
        int immuable = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;
        PendingIntent ouvrir = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), immuable);
        PendingIntent arreter = PendingIntent.getService(this, 1,
                new Intent(this, BulleService.class).setAction(ACTION_ARRETER), immuable);
        Notification n = new NotificationCompat.Builder(this, CANAL)
                .setSmallIcon(R.drawable.ic_stat_kora)
                .setContentTitle("KORA veille sur tes messages")
                .setContentText("Touche la bulle pour vérifier ce qui est à l'écran.")
                .setOngoing(true)
                .setContentIntent(ouvrir)
                .addAction(0, "Arrêter la bulle", arreter)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
        int type = Build.VERSION.SDK_INT >= 29 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION : 0;
        ServiceCompat.startForeground(this, NOTIFICATION, n, type);
    }

    // ------------------------------------------------------------------ capture de l'écran
    private Rect tailleEcran() {
        if (Build.VERSION.SDK_INT >= 30) return fenetres.getMaximumWindowMetrics().getBounds();
        DisplayMetrics dm = new DisplayMetrics();
        fenetres.getDefaultDisplay().getRealMetrics(dm);
        return new Rect(0, 0, dm.widthPixels, dm.heightPixels);
    }

    private ImageReader nouveauLecteur(int l, int h) {
        largeur = l;
        hauteur = h;
        ImageReader r = ImageReader.newInstance(l, h, PixelFormat.RGBA_8888, 3);
        // on garde seulement la dernière image reçue (l'écran n'envoie une image que quand il change)
        r.setOnImageAvailableListener(lu -> {
            Image image;
            try {
                image = lu.acquireLatestImage();
            } catch (IllegalStateException e) {
                return;
            }
            if (image == null) return;
            synchronized (verrou) {
                if (derniere != null) derniere.close();
                derniere = image;
            }
        }, fond);
        return r;
    }

    private void preparerEcran() {
        Rect taille = tailleEcran();
        lecteur = nouveauLecteur(taille.width(), taille.height());
        // Android 14+ : une seule VirtualDisplay par autorisation, gardée pendant toute la vie de la bulle
        ecran = projection.createVirtualDisplay("kora-bulle", largeur, hauteur,
                getResources().getDisplayMetrics().densityDpi, DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                lecteur.getSurface(), null, fond);
    }

    private void capturer() {
        if (captureEnCours) return;
        captureEnCours = true;
        // la bulle se cache : l'écran change, donc une image fraîche (sans la bulle) arrive
        bulle.setVisibility(View.INVISIBLE);
        principal.postDelayed(() -> fond.post(this::enregistrer), 350);
    }

    private void enregistrer() {
        Image image;
        synchronized (verrou) {
            image = derniere;
            derniere = null;
        }
        File fichier = null;
        if (image != null) {
            try {
                Image.Plane plan = image.getPlanes()[0];
                ByteBuffer pixels = plan.getBuffer();
                int pas = plan.getPixelStride();
                int ligne = plan.getRowStride();
                int l = image.getWidth();
                int h = image.getHeight();
                Bitmap large = Bitmap.createBitmap(ligne / pas, h, Bitmap.Config.ARGB_8888);
                large.copyPixelsFromBuffer(pixels);
                Bitmap net = Bitmap.createBitmap(large, 0, 0, l, h);
                fichier = new File(dossierCaptures(this), "capture-" + System.currentTimeMillis() + ".png");
                try (FileOutputStream out = new FileOutputStream(fichier)) {
                    net.compress(Bitmap.CompressFormat.PNG, 100, out);
                }
                large.recycle();
                if (net != large) net.recycle();
            } catch (Exception e) {
                fichier = null;
            } finally {
                image.close();
            }
        }
        File resultat = fichier;
        principal.post(() -> {
            captureEnCours = false;
            majVisibilite();
            if (resultat == null) {
                Toast.makeText(this, "KORA n'a pas pu capturer l'écran. Réessaie dans un instant.", Toast.LENGTH_SHORT).show();
                return;
            }
            Intent ouvrir = new Intent(this, MainActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    .putExtra(BulleKoraPlugin.EXTRA_CAPTURE, resultat.getAbsolutePath());
            startActivity(ouvrir);
        });
    }

    // ------------------------------------------------------------------ la bulle à l'écran
    private int dp(float v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private int typeFenetre() {
        return Build.VERSION.SDK_INT >= 26
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
    }

    private void majVisibilite() {
        if (bulle != null) bulle.setVisibility(masqueeParKora || captureEnCours ? View.INVISIBLE : View.VISIBLE);
    }

    private void afficherBulle() {
        bulle = new ImageView(this);
        bulle.setImageResource(R.drawable.bulle_kora);
        bulle.setScaleType(ImageView.ScaleType.FIT_CENTER);
        bulle.setContentDescription("Korachoupi : vérifier ce qui est à l'écran avec KORA");
        posBulle = new WindowManager.LayoutParams(dp(LARGEUR_DP), dp(HAUTEUR_DP), typeFenetre(),
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE, PixelFormat.TRANSLUCENT);
        posBulle.gravity = Gravity.TOP | Gravity.START;
        posBulle.x = tailleEcran().width() - dp(LARGEUR_DP) - dp(6);
        posBulle.y = tailleEcran().height() / 3;

        croix = new TextView(this);
        croix.setText("✕");
        croix.setTextSize(22);
        croix.setTextColor(Color.WHITE);
        croix.setGravity(Gravity.CENTER);
        GradientDrawable rond = new GradientDrawable();
        rond.setShape(GradientDrawable.OVAL);
        rond.setColor(0xCC1B1B1F);
        rond.setStroke(dp(2), 0x66FFFFFF);
        croix.setBackground(rond);
        croix.setContentDescription("Glisse la bulle ici pour la fermer");
        croix.setVisibility(View.GONE);
        posCroix = new WindowManager.LayoutParams(dp(64), dp(64), typeFenetre(),
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
                PixelFormat.TRANSLUCENT);
        posCroix.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
        posCroix.y = dp(48);

        fenetres.addView(croix, posCroix);
        fenetres.addView(bulle, posBulle);
        bulle.setOnTouchListener(new Deplacement());
        majVisibilite();
    }

    private boolean surLaCroix() {
        int[] c = new int[2];
        croix.getLocationOnScreen(c);
        int[] b = new int[2];
        bulle.getLocationOnScreen(b);
        float cx = c[0] + croix.getWidth() / 2f, cy = c[1] + croix.getHeight() / 2f;
        float bx = b[0] + bulle.getWidth() / 2f, by = b[1] + bulle.getHeight() / 2f;
        return Math.hypot(cx - bx, cy - by) < dp(70);
    }

    /** Colle la bulle au bord gauche ou droit le plus proche. */
    private void aimanter(boolean anime) {
        Rect ecranTaille = tailleEcran();
        int l = dp(LARGEUR_DP), h = dp(HAUTEUR_DP);
        int cible = posBulle.x + l / 2 < ecranTaille.width() / 2 ? dp(6) : ecranTaille.width() - l - dp(6);
        posBulle.y = Math.max(dp(24), Math.min(posBulle.y, ecranTaille.height() - h - dp(48)));
        if (!anime) {
            posBulle.x = cible;
            fenetres.updateViewLayout(bulle, posBulle);
            return;
        }
        ValueAnimator a = ValueAnimator.ofInt(posBulle.x, cible);
        a.setDuration(220);
        a.setInterpolator(new DecelerateInterpolator());
        a.addUpdateListener(v -> {
            if (bulle == null || instance == null) return;
            posBulle.x = (int) v.getAnimatedValue();
            fenetres.updateViewLayout(bulle, posBulle);
        });
        a.start();
    }

    private class Deplacement implements View.OnTouchListener {
        private final int seuil = ViewConfiguration.get(BulleService.this).getScaledTouchSlop();
        private float x0, y0;
        private int px0, py0;
        private boolean bouge;

        @Override
        public boolean onTouch(View v, MotionEvent e) {
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    x0 = e.getRawX();
                    y0 = e.getRawY();
                    px0 = posBulle.x;
                    py0 = posBulle.y;
                    bouge = false;
                    v.animate().scaleX(0.92f).scaleY(0.92f).setDuration(80).start();
                    return true;
                case MotionEvent.ACTION_MOVE:
                    float dx = e.getRawX() - x0, dy = e.getRawY() - y0;
                    if (!bouge && Math.hypot(dx, dy) > seuil) {
                        bouge = true;
                        croix.setVisibility(View.VISIBLE);
                    }
                    if (bouge) {
                        posBulle.x = px0 + Math.round(dx);
                        posBulle.y = py0 + Math.round(dy);
                        fenetres.updateViewLayout(bulle, posBulle);
                        boolean dessus = surLaCroix();
                        croix.setScaleX(dessus ? 1.25f : 1f);
                        croix.setScaleY(dessus ? 1.25f : 1f);
                    }
                    return true;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    v.animate().scaleX(1f).scaleY(1f).setDuration(80).start();
                    boolean fermer = bouge && surLaCroix();
                    croix.setVisibility(View.GONE);
                    if (fermer) {
                        stopSelf();
                    } else if (bouge) {
                        aimanter(true);
                    } else if (e.getActionMasked() == MotionEvent.ACTION_UP) {
                        v.performClick();
                        capturer();
                    }
                    return true;
                default:
                    return false;
            }
        }
    }
}
