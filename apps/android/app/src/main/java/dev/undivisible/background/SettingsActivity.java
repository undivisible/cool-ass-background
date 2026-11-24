package dev.undivisible.background;

import android.app.*;
import android.os.Bundle;
import android.content.*;
import android.provider.Settings;
import android.view.View;
import android.widget.*;
import org.json.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

public final class SettingsActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        var prefs = getSharedPreferences("settings", MODE_PRIVATE);
        var root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setPadding(32, 32, 32, 32);
        var scroll = new ScrollView(this); scroll.addView(root); setContentView(scroll);
        text(root, "Background", 26);
        text(root, "Choose a palette or sync source. All palette changes crossfade over 1.8 seconds.", 16);
        var palette = new Spinner(this);
        var names = new ArrayList<String>();
        try (var in = getAssets().open("presets.json")) {
            var json = new JSONObject(new String(in.readAllBytes(), StandardCharsets.UTF_8));
            var keys = json.keys(); while (keys.hasNext()) names.add(keys.next());
        } catch (Exception error) { names.add("Drift"); }
        palette.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, names));
        palette.setSelection(Math.max(0, names.indexOf(prefs.getString("preset", "Drift"))));
        text(root, "Palette", 16); root.addView(palette);
        var source = new Spinner(this); var sources = new String[]{"Preset", "Last.fm", "Local playback"};
        source.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, sources));
        source.setSelection(prefs.getInt("source", 0)); text(root, "Color source", 16); root.addView(source);
        var user = new EditText(this); user.setHint("Last.fm username"); user.setSingleLine(true); user.setText(prefs.getString("user", "")); root.addView(user);
        var key = new EditText(this); key.setHint("Public Last.fm API key (not password)"); key.setSingleLine(true); key.setText(prefs.getString("key", "")); root.addView(key);
        text(root, "Last.fm credentials stay in app-private storage. Local sync needs notification access to read media-session artwork. Notification contents are never read. No microphone or audio capture.", 14);
        button(root, "Allow local playback access", v -> startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)));
        button(root, "Save settings", v -> {
            if (source.getSelectedItemPosition() == 1 && (user.getText().length() == 0 || key.getText().length() == 0)) { Toast.makeText(this, "Enter a Last.fm username and API key", Toast.LENGTH_LONG).show(); return; }
            prefs.edit().putString("preset", names.get(palette.getSelectedItemPosition())).putInt("source", source.getSelectedItemPosition()).putString("user", user.getText().toString().trim()).putString("key", key.getText().toString().trim()).apply();
            Toast.makeText(this, "Saved", Toast.LENGTH_SHORT).show();
        });
        button(root, "Preview & set live wallpaper", v -> startActivity(new Intent(WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER).putExtra(WallpaperManager.EXTRA_LIVE_WALLPAPER_COMPONENT, new ComponentName(this, FieldWallpaper.class))));
    }
    void text(LinearLayout root, String value, int size) { var text = new TextView(this); text.setText(value); text.setTextSize(size); text.setPadding(0, 16, 0, 16); root.addView(text); }
    void button(LinearLayout root, String title, View.OnClickListener click) { var button = new Button(this); button.setText(title); button.setOnClickListener(click); root.addView(button); }
}
