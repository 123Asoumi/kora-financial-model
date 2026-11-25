package bj.kora.lite;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // le plugin maison doit être déclaré avant le démarrage du pont Capacitor
        registerPlugin(BulleKoraPlugin.class);
        registerPlugin(VoixKoraPlugin.class);
        registerPlugin(MiseAJourPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
