package com.csboard.app;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;
import com.csboard.nativecore.mobilecore.Mobilecore;
import com.csboard.nativecore.mobilecore.Database;
import com.csboard.nativecore.mobilecore.Parser;
import java.io.File;
import java.io.InputStream;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;

@CapacitorPlugin(name = "CSBoardCore")
public class CSBoardCorePlugin extends Plugin {
    private final ExecutorService databaseQueue = Executors.newSingleThreadExecutor();
    private final ExecutorService parserQueue = Executors.newSingleThreadExecutor();
    private final ExecutorService importQueue = Executors.newSingleThreadExecutor();
    private final Map<String, File> sources = new ConcurrentHashMap<>();
    private final Map<String, Session> sessions = new ConcurrentHashMap<>();
    private Database database;
    private PluginCall pendingPicker;
    private static class Session {
        final Parser parser;
        final List<String> sourceIds;
        Session(Parser parser, List<String> sourceIds) { this.parser = parser; this.sourceIds = sourceIds; }
    }

    @PluginMethod public void storage(PluginCall call) {
        databaseQueue.execute(() -> {
            try {
                if (database == null) database = Mobilecore.openDatabase(new File(getContext().getFilesDir(), "native-data").getPath());
                String result = database.request(call.getString("method", ""), call.getString("arguments", "{}"));
                call.resolve(new JSObject().put("result", result));
            } catch (Exception error) { call.reject(error.getMessage()); }
        });
    }
    @PluginMethod public void chooseDemos(PluginCall call) {
        if (pendingPicker != null) { call.reject("A file picker is already open"); return; }
        pendingPicker = call;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        startActivityForResult(call, intent, "pickedDemos");
    }
    @ActivityCallback private void pickedDemos(PluginCall call, ActivityResult result) {
        pendingPicker = null;
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.resolve(new JSObject().put("files", new JSArray())); return;
        }
        Intent data = result.getData();
        List<Uri> uris = new ArrayList<>();
        if (data.getClipData() != null) {
            for (int i = 0; i < data.getClipData().getItemCount(); i++) uris.add(data.getClipData().getItemAt(i).getUri());
        } else if (data.getData() != null) uris.add(data.getData());
        importQueue.execute(() -> {
            List<String> imported = new ArrayList<>();
            try {
                if (uris.size() > 32) throw new Exception("Select at most 32 Demo files");
                File directory = new File(getContext().getCacheDir(), "demo-imports");
                if (!directory.isDirectory() && !directory.mkdirs()) throw new Exception("Cannot create Demo import directory");
                JSArray files = new JSArray();
                for (Uri uri : uris) {
                    String name = "demo.dem";
                    try (Cursor cursor = getContext().getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
                        if (cursor != null && cursor.moveToFirst()) name = cursor.getString(0);
                    }
                    if (name == null || !name.toLowerCase(Locale.ROOT).endsWith(".dem")) throw new Exception("Only .dem files are supported");
                    String id = UUID.randomUUID().toString();
                    File file = new File(directory, id + ".dem");
                    imported.add(id);
                    sources.put(id, file);
                    try (InputStream input = getContext().getContentResolver().openInputStream(uri); FileOutputStream output = new FileOutputStream(file)) {
                        if (input == null) throw new Exception("Cannot read selected Demo");
                        byte[] buffer = new byte[64 * 1024]; int count;
                        while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                    }
                    files.put(new JSObject().put("nativeId", id).put("name", name).put("size", file.length())
                        .put("lastModified", file.lastModified()).put("contentHash", Mobilecore.fingerprint(file.getPath())));
                }
                call.resolve(new JSObject().put("files", files));
            } catch (Exception error) {
                for (String id : imported) { File file = sources.remove(id); if (file != null) file.delete(); }
                call.reject(error.getMessage());
            }
        });
    }
    @PluginMethod public void openParser(PluginCall call) {
        parserQueue.execute(() -> {
            List<String> ids = new ArrayList<>();
            try {
                JSArray selected = call.getArray("sourceIds", new JSArray());
                JSONArray paths = new JSONArray();
                if (selected.length() == 0 || selected.length() > 32) throw new Exception("Invalid Demo sources");
                for (int i = 0; i < selected.length(); i++) {
                    String id = selected.getString(i); File file = sources.get(id);
                    if (file == null) throw new Exception("Demo source is unavailable");
                    ids.add(id); paths.put(file.getPath());
                }
                Parser parser = Mobilecore.openParser(paths.toString());
                String id = UUID.randomUUID().toString();
                sessions.put(id, new Session(parser, ids));
                call.resolve(new JSObject().put("sessionId", id).put("sources", new JSArray(parser.sources())));
            } catch (Exception error) {
                for (String id : ids) { File file = sources.remove(id); if (file != null) file.delete(); }
                call.reject(error.getMessage());
            }
        });
    }
    @PluginMethod public void requestParser(PluginCall call) {
        Session session = sessions.get(call.getString("sessionId", ""));
        if (session == null) { call.reject("Parser session is closed"); return; }
        parserQueue.execute(() -> {
            try { call.resolve(new JSObject().put("result", session.parser.request(call.getString("method", ""), call.getString("arguments", "{}")))); }
            catch (Exception error) { call.reject(error.getMessage()); }
        });
    }
    @PluginMethod public void closeParser(PluginCall call) {
        Session session = sessions.remove(call.getString("sessionId", ""));
        if (session == null) { call.resolve(); return; }
        session.parser.cancel();
        parserQueue.execute(() -> {
            session.parser.close();
            for (String id : session.sourceIds) { File file = sources.remove(id); if (file != null) file.delete(); }
            call.resolve();
        });
    }
    @PluginMethod public void releaseSources(PluginCall call) {
        parserQueue.execute(() -> {
            try {
                JSArray ids = call.getArray("sourceIds", new JSArray());
                for (int i = 0; i < ids.length(); i++) {
                    String id = ids.getString(i);
                    boolean inUse = sessions.values().stream().anyMatch(session -> session.sourceIds.contains(id));
                    if (!inUse) { File file = sources.remove(id); if (file != null) file.delete(); }
                }
                call.resolve();
            } catch (Exception error) { call.reject(error.getMessage()); }
        });
    }
    @Override protected void handleOnPause() {
        // App backgrounding cancels native work; there is no foreground service.
        for (Session session : sessions.values()) session.parser.cancel();
    }
    @Override protected void handleOnDestroy() {
        for (Session session : sessions.values()) session.parser.cancel();
        parserQueue.execute(() -> { for (Session session : sessions.values()) session.parser.close(); sessions.clear(); });
        databaseQueue.execute(() -> { try { if (database != null) database.close(); } catch (Exception ignored) {} });
        parserQueue.shutdown(); databaseQueue.shutdown(); importQueue.shutdown();
    }
}
