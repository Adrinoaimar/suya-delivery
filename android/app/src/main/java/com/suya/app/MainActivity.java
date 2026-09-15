package com.suya.app;

import com.getcapacitor.BridgeActivity;

import android.graphics.Color;
import android.os.Bundle;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SuyaWalletObserverPlugin.class);
        super.onCreate(savedInstanceState);
        configureSystemBars();
    }

    private void configureSystemBars() {
        getWindow().setStatusBarColor(Color.parseColor("#EEF6F1"));
        getWindow().setNavigationBarColor(Color.parseColor("#F0F7F3"));

        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(true);
        controller.setAppearanceLightNavigationBars(true);
    }
}
