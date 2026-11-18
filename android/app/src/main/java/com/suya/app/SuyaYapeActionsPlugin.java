package com.suya.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.io.OutputStream;

@CapacitorPlugin(name = "SuyaYapeActions")
public final class SuyaYapeActionsPlugin extends Plugin {
    private static final String OFFICIAL_YAPE = "com.bcp.innovacxion.yapeapp";
    private static final String FILENAME = "suya-yape-qr.png";
    private static final String MIME = "image/png";
    private static final int MAX_ENCODED_LENGTH = 1_400_000;

    @PluginMethod
    public void openYape(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            Intent launch = getContext().getPackageManager().getLaunchIntentForPackage(OFFICIAL_YAPE);
            if (launch == null) {
                call.resolve(new JSObject().put("opened", false));
                return;
            }
            try {
                getActivity().startActivity(launch);
                call.resolve(new JSObject().put("opened", true));
            } catch (android.content.ActivityNotFoundException | SecurityException unavailable) {
                call.resolve(new JSObject().put("opened", false));
            }
        });
    }

    @PluginMethod
    public void saveQr(PluginCall call) {
        byte[] qr = readPng(call);
        if (qr == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            saveToGallery(call, qr);
        } else {
            Intent target = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType(MIME)
                .putExtra(Intent.EXTRA_TITLE, FILENAME);
            getActivity().runOnUiThread(() -> {
                try {
                    startActivityForResult(call, target, "documentSelected");
                } catch (android.content.ActivityNotFoundException unavailable) {
                    call.reject("No se pudo abrir el selector de archivos de Android.");
                }
            });
        }
    }

    private void saveToGallery(PluginCall call, byte[] qr) {
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues details = new ContentValues();
        details.put(MediaStore.Images.Media.DISPLAY_NAME, FILENAME);
        details.put(MediaStore.Images.Media.MIME_TYPE, MIME);
        details.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Suya");
        details.put(MediaStore.Images.Media.IS_PENDING, 1);
        Uri uri = null;
        try {
            uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, details);
            if (uri == null) throw new IOException("MediaStore did not create the image");
            writePng(resolver, uri, qr);
            details.clear();
            details.put(MediaStore.Images.Media.IS_PENDING, 0);
            if (resolver.update(uri, details, null, null) != 1) throw new IOException("Image not published");
        } catch (IOException | RuntimeException failure) {
            if (uri != null) {
                try {
                    resolver.delete(uri, null, null);
                } catch (RuntimeException ignored) { }
            }
            call.reject("No pudimos guardar el QR en tu galería.");
            return;
        }
        call.resolve(new JSObject().put("destination", "gallery"));
    }

    @ActivityCallback
    private void documentSelected(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            call.resolve(new JSObject().put("destination", "cancelled"));
            return;
        }
        byte[] qr = readPng(call);
        if (qr == null) return;
        try {
            writePng(getContext().getContentResolver(), uri, qr);
            call.resolve(new JSObject().put("destination", "files"));
        } catch (IOException | RuntimeException failure) {
            call.reject("No pudimos guardar el QR en esa carpeta.");
        }
    }

    private static void writePng(ContentResolver resolver, Uri uri, byte[] data) throws IOException {
        try (OutputStream file = resolver.openOutputStream(uri, "w")) {
            if (file == null) throw new IOException("No output stream");
            file.write(data);
        }
    }

    private static byte[] readPng(PluginCall call) {
        String encoded = call.getString("base64", "");
        if (!encoded.isEmpty() && encoded.length() <= MAX_ENCODED_LENGTH) {
            try {
                byte[] bytes = Base64.decode(encoded, Base64.NO_WRAP);
                BitmapFactory.Options options = new BitmapFactory.Options();
                options.inJustDecodeBounds = true;
                BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
                if (MIME.equals(options.outMimeType) && options.outWidth > 0 && options.outHeight > 0
                    && options.outWidth <= 1200 && options.outHeight <= 1200) return bytes;
            } catch (IllegalArgumentException invalid) { }
        }
        call.reject("No pudimos preparar la imagen del QR.");
        return null;
    }
}
