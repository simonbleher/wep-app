package de.wep.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Eigenes Plugin (Token, Warteschlange, Hintergrund-Upload) vor dem Start der Bridge anmelden
        registerPlugin(WepNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
