package com.suya.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.regex.Pattern;

@CapacitorPlugin(
    name = "SuyaOrderNotifications",
    permissions = @Permission(alias = "notifications", strings = Manifest.permission.POST_NOTIFICATIONS)
)
public final class SuyaOrderNotificationsPlugin extends Plugin {
    private static final String CHANNEL_ID = "suya-order-updates";
    private static final Pattern ORDER_ID = Pattern.compile(
        "[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}"
    );

    private boolean enabled() {
        NotificationManagerCompat manager = NotificationManagerCompat.from(getContext());
        if (!manager.areNotificationsEnabled()) return false;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
        NotificationChannel channel = manager.getNotificationChannel(CHANNEL_ID);
        return channel == null || channel.getImportance() != NotificationManager.IMPORTANCE_NONE;
    }

    @PluginMethod
    public void check(PluginCall call) {
        call.resolve(new JSObject().put("enabled", enabled()));
    }

    @PluginMethod
    public void enable(PluginCall call) {
        if (enabled()) {
            check(call);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "onPermission");
        } else {
            openSettings(call);
        }
    }

    @PermissionCallback
    private void onPermission(PluginCall call) {
        check(call);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.fromParts("package", getContext().getPackageName(), null));
        }
        getActivity().startActivity(intent);
        check(call);
    }

    @PluginMethod
    public void show(PluginCall call) {
        String orderId = call.getString("orderId", "");
        String title = call.getString("title", "").trim();
        String message = call.getString("message", "").trim();
        if (!ORDER_ID.matcher(orderId).matches() || title.isEmpty() || title.length() > 90
            || message.isEmpty() || message.length() > 120) {
            call.reject("El aviso de pedido no es válido.");
            return;
        }
        if (!enabled()) {
            call.resolve();
            return;
        }

        NotificationManagerCompat manager = NotificationManagerCompat.from(getContext());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Estado de pedidos", NotificationManager.IMPORTANCE_DEFAULT
            );
            manager.createNotificationChannel(channel);
        }

        Uri destination = Uri.parse("com.suya.app://orders/" + orderId);
        Intent viewOrder = new Intent(Intent.ACTION_VIEW, destination, getContext(), MainActivity.class);
        PendingIntent openOrder = PendingIntent.getActivity(
            getContext(), 0, viewOrder, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );
        NotificationCompat.Builder notification = new NotificationCompat.Builder(getContext(), CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_suya_order_notification)
            .setContentTitle(title)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(message))
            .setContentText(message)
            .setContentIntent(openOrder)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true);
        try {
            manager.notify(orderId, 1, notification.build());
            call.resolve();
        } catch (SecurityException denied) {
            // Android puede revocar el permiso durante esta llamada.
            call.resolve();
        }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        NotificationManagerCompat.from(getContext()).cancelAll();
        call.resolve();
    }
}
