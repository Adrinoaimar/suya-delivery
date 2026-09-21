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

/** Explicit bridge for securely pairing the opt-in caja notification observer. */
@CapacitorPlugin(name = "SuyaWalletObserver")
public final class SuyaWalletObserverPlugin extends Plugin {
    private static final java.util.concurrent.ExecutorService PAIRING_EXECUTOR =
            java.util.concurrent.Executors.newSingleThreadExecutor();

    @PluginMethod
    public void pair(PluginCall call) {
        String pairingCode = call.getString("pairingCode", "").trim();
        if (!YapeNotificationListenerService.isPairingCodeValid(pairingCode)) {
            call.reject("El código de emparejamiento debe tener 8 caracteres hexadecimales.");
            return;
        }
        Context context = getContext();
        if (context == null) {
            call.reject("No se pudo acceder al teléfono.");
            return;
        }
        PAIRING_EXECUTOR.execute(() -> {
            boolean paired = YapeNotificationListenerService.pairDevice(context, pairingCode);
            if (!paired) {
                call.reject("El código es inválido, expiró o ya fue utilizado.");
                return;
            }
            call.resolve(status());
        });
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
        result.put("pendingEvents", YapeNotificationListenerService.pendingEventCount(getContext()));
        result.put("queueFull", YapeNotificationListenerService.isQueueFull(getContext()));
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
