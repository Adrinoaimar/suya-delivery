package com.suya.app;

import com.getcapacitor.BridgeActivity;

import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SuyaWalletObserverPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
