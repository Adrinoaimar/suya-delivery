package com.suya.app;

import com.getcapacitor.BridgeActivity;

import android.graphics.Color;
import android.os.Bundle;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        if (BuildConfig.SUYA_WALLET_OBSERVER_ENABLED) {
            registerPlugin(SuyaWalletObserverPlugin.class);
        }
        registerPlugin(SuyaSecureStoragePlugin.class);
        if ("com.suya.app".equals(getPackageName())) {
            registerPlugin(SuyaOrderNotificationsPlugin.class);
            registerPlugin(SuyaYapeActionsPlugin.class);
        }
        super.onCreate(savedInstanceState);
        configureSystemBars();
    }

    @Override
    public void onResume() {
        super.onResume();
        if (BuildConfig.SUYA_WALLET_OBSERVER_ENABLED) {
            YapeNotificationListenerService.syncPendingEvents(this);
        }
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
