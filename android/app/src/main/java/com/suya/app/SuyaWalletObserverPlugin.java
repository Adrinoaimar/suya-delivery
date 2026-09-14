package com.suya.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.provider.Settings;

import androidx.annotation.Nullable;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

/** Explicit bridge for configuring the opt-in caja notification observer. */
@CapacitorPlugin(name = "SuyaWalletObserver")
public final class SuyaWalletObserverPlugin extends Plugin {
    @PluginMethod
    public void configure(PluginCall call) {
        String token = call.getString("deviceToken", "").trim();
        if (!YapeNotificationListenerService.configureDeviceToken(getContext(), token)) {
            call.reject("El token del dispositivo no es válido.");
            return;
        }
        call.resolve(status());
    }

    @PluginMethod
    public void sync(PluginCall call) {
        YapeNotificationListenerService.syncPendingEvents(getContext());
        call.resolve(status());
    }

    @PluginMethod
    public void clear(PluginCall call) {
        YapeNotificationListenerService.clearDeviceToken(getContext());
        call.resolve(status());
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(status());
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Intent intent = new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS");
        getActivity().startActivity(intent);
        call.resolve();
    }

    private JSObject status() {
        JSObject result = new JSObject();
        result.put("configured", YapeNotificationListenerService.isDeviceConfigured(getContext()));
        result.put("notificationAccess", hasNotificationAccess(getContext()));
        result.put("role", BuildConfig.SUYA_SUPABASE_URL.isEmpty() ? "unconfigured" : "ready");
        return result;
    }

    private static boolean hasNotificationAccess(@Nullable Context context) {
        if (context == null) return false;
        String enabled = Settings.Secure.getString(
                context.getContentResolver(),
                "enabled_notification_listeners"
        );
        if (enabled == null) return false;
        ComponentName expected = new ComponentName(context, YapeNotificationListenerService.class);
        for (String value : enabled.split(":")) {
            if (expected.flattenToString().equals(value)) return true;
        }
        return false;
    }
}
