package dev.undivisible.background;

import android.service.wallpaper.WallpaperService;
import android.view.SurfaceHolder;
import android.os.*;
import android.content.*;
import android.graphics.*;
import android.media.MediaMetadata;
import android.media.session.*;
import android.opengl.*;
import org.json.*;
import java.net.*;
import java.nio.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import javax.net.ssl.HttpsURLConnection;

public final class FieldWallpaper extends WallpaperService {
    @Override public Engine onCreateEngine() { return new FieldEngine(); }
    final class FieldEngine extends Engine {
        final HandlerThread thread = new HandlerThread("shader");
        final Handler gl;
        final ExecutorService music = Executors.newSingleThreadExecutor();
        final android.content.SharedPreferences prefs = getSharedPreferences("settings", MODE_PRIVATE);
        EGLDisplay display = EGL14.EGL_NO_DISPLAY;
        EGLContext context;
        EGLSurface surface;
        int program, texture, width = 1, height = 1;
        boolean visible, initialized, fetching;
        long start, lastPoll, fadeStart;
        volatile int revision;
        String key = "", preset = "";
        float[] from = {0.09f,0.2f,0.26f, 0.29f,0.47f,0.54f, 0.7f,0.74f,0.63f, 0.86f,0.65f,0.42f, 0.38f,0.18f,0.25f};
        float[] to = from.clone();
        final android.content.SharedPreferences.OnSharedPreferenceChangeListener settings;
        FieldEngine() {
            thread.start(); gl = new Handler(thread.getLooper());
            settings = (p, name) -> { revision++; gl.post(() -> { key = ""; preset = ""; lastPoll = 0; }); };
            prefs.registerOnSharedPreferenceChangeListener(settings);
        }
        @Override public void onSurfaceCreated(SurfaceHolder holder) { gl.post(() -> initialize(holder)); }
        @Override public void onSurfaceChanged(SurfaceHolder h, int f, int w, int ht) { gl.post(() -> { width = w; height = ht; }); }
        @Override public void onVisibilityChanged(boolean value) { gl.post(() -> { visible = value; gl.removeCallbacks(frame); if (value && initialized) gl.post(frame); }); }
        @Override public void onSurfaceDestroyed(SurfaceHolder holder) { gl.post(this::release); }
        @Override public void onDestroy() {
            prefs.unregisterOnSharedPreferenceChangeListener(settings); revision++; music.shutdownNow();
            gl.post(() -> { release(); thread.quitSafely(); }); super.onDestroy();
        }
        void initialize(SurfaceHolder holder) {
            try {
                display = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY);
                int[] versions = new int[2]; EGL14.eglInitialize(display, versions, 0, versions, 1);
                EGLConfig[] configs = new EGLConfig[1]; int[] count = new int[1];
                EGL14.eglChooseConfig(display, new int[]{EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT, EGL14.EGL_SURFACE_TYPE, EGL14.EGL_WINDOW_BIT, EGL14.EGL_RED_SIZE,8,EGL14.EGL_GREEN_SIZE,8,EGL14.EGL_BLUE_SIZE,8,EGL14.EGL_NONE}, 0, configs, 0, 1, count, 0);
                context = EGL14.eglCreateContext(display, configs[0], EGL14.EGL_NO_CONTEXT, new int[]{EGL14.EGL_CONTEXT_CLIENT_VERSION,2,EGL14.EGL_NONE}, 0);
                surface = EGL14.eglCreateWindowSurface(display, configs[0], holder, new int[]{EGL14.EGL_NONE}, 0);
                if (!EGL14.eglMakeCurrent(display, surface, surface, context)) throw new IllegalStateException("Cannot create wallpaper EGL surface");
                String frag; try (var in = getAssets().open("field.frag")) { frag = new String(in.readAllBytes(), StandardCharsets.UTF_8); }
                int v = shader(GLES20.GL_VERTEX_SHADER, "attribute vec2 a_position; varying vec2 v_uv; void main(){v_uv=a_position*0.5+0.5;gl_Position=vec4(a_position,0.,1.);}");
                int f = shader(GLES20.GL_FRAGMENT_SHADER, frag);
                program = GLES20.glCreateProgram(); GLES20.glAttachShader(program,v); GLES20.glAttachShader(program,f); GLES20.glLinkProgram(program);
                int[] ok = new int[1]; GLES20.glGetProgramiv(program,GLES20.GL_LINK_STATUS,ok,0);
                GLES20.glDeleteShader(v); GLES20.glDeleteShader(f);
                if (ok[0] == 0) throw new IllegalStateException(GLES20.glGetProgramInfoLog(program));
                GLES20.glUseProgram(program);
                var vertices = ByteBuffer.allocateDirect(48).order(ByteOrder.nativeOrder()).asFloatBuffer(); vertices.put(new float[]{-1,-1,1,-1,-1,1,-1,1,1,-1,1,1}).position(0);
                int position = GLES20.glGetAttribLocation(program,"a_position"); GLES20.glEnableVertexAttribArray(position); GLES20.glVertexAttribPointer(position,2,GLES20.GL_FLOAT,false,0,vertices);
                var atlas = Bitmap.createBitmap(240,32,Bitmap.Config.ARGB_8888); var canvas = new Canvas(atlas); var paint = new Paint(Paint.ANTI_ALIAS_FLAG); paint.setColor(Color.WHITE); paint.setTypeface(Typeface.MONOSPACE); paint.setTextSize(24); paint.setTextAlign(Paint.Align.CENTER);
                String chars = ".,:;-=+*#%"; for (int i=0;i<10;i++) canvas.drawText(chars.substring(i,i+1),i*24+12,24,paint);
                int[] textures = new int[1]; GLES20.glGenTextures(1,textures,0); texture=textures[0]; GLES20.glBindTexture(GLES20.GL_TEXTURE_2D,texture);
                GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D,GLES20.GL_TEXTURE_MIN_FILTER,GLES20.GL_LINEAR); GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D,GLES20.GL_TEXTURE_MAG_FILTER,GLES20.GL_LINEAR); GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D,GLES20.GL_TEXTURE_WRAP_S,GLES20.GL_CLAMP_TO_EDGE); GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D,GLES20.GL_TEXTURE_WRAP_T,GLES20.GL_CLAMP_TO_EDGE);
                GLUtils.texImage2D(GLES20.GL_TEXTURE_2D,0,atlas,0); atlas.recycle();
                initialized = true; start = SystemClock.uptimeMillis(); preset = ""; gl.removeCallbacks(frame); if (visible) gl.post(frame);
            } catch (Exception error) { android.util.Log.e("Background", "Shader initialization failed", error); release(); }
        }
        int shader(int type, String code) {
            int shader=GLES20.glCreateShader(type); GLES20.glShaderSource(shader,code); GLES20.glCompileShader(shader);
            int[] ok=new int[1]; GLES20.glGetShaderiv(shader,GLES20.GL_COMPILE_STATUS,ok,0);
            if(ok[0]==0) throw new IllegalStateException(GLES20.glGetShaderInfoLog(shader)); return shader;
        }
        float[] current(long now) { float t=Math.max(0,Math.min(1,(now-fadeStart)/1800f)); t=t*t*(3-2*t); var c=new float[15]; for(int i=0;i<15;i++) c[i]=from[i]+(to[i]-from[i])*t; return c; }
        void palette(float[] colors) { long now=SystemClock.uptimeMillis(); from=current(now); to=colors; fadeStart=now; }
        final Runnable frame = new Runnable() { public void run() {
            if(!visible || !initialized) return;
            long now=SystemClock.uptimeMillis();
            String selected=prefs.getString("preset","Drift");
            if(!selected.equals(preset)) { preset=selected; try(var in=getAssets().open("presets.json")) { var array=new JSONObject(new String(in.readAllBytes(),StandardCharsets.UTF_8)).getJSONArray(selected); var colors=new float[15]; for(int i=0;i<5;i++) { int color=Color.parseColor(array.getString(i)); colors[i*3]=Color.red(color)/255f; colors[i*3+1]=Color.green(color)/255f; colors[i*3+2]=Color.blue(color)/255f; } palette(colors); } catch(Exception ignored) {} }
            GLES20.glViewport(0,0,width,height); GLES20.glUseProgram(program);
            GLES20.glUniform2f(GLES20.glGetUniformLocation(program,"u_resolution"),width/getResources().getDisplayMetrics().density,height/getResources().getDisplayMetrics().density);
            GLES20.glUniform1f(GLES20.glGetUniformLocation(program,"u_time"),(now-start)/1000f);
            GLES20.glUniform1f(GLES20.glGetUniformLocation(program,"u_ascii"),1); GLES20.glUniform1i(GLES20.glGetUniformLocation(program,"u_glyphs"),0);
            float[] colors=current(now); for(int i=0;i<5;i++) GLES20.glUniform3fv(GLES20.glGetUniformLocation(program,"u_color"+(char)('A'+i)),1,colors,i*3);
            GLES20.glDrawArrays(GLES20.GL_TRIANGLES,0,6); EGL14.eglSwapBuffers(display,surface);
            int source=prefs.getInt("source",0); if(source!=0 && !fetching && now-lastPoll>(source==1?30000:4000)) { lastPoll=now; fetching=true; int ticket=revision; music.execute(() -> { try { pollMusic(source,ticket); } catch(Exception error) { android.util.Log.w("Background","Playback unavailable; keeping palette"); } finally { gl.post(() -> fetching=false); } }); }
            gl.postDelayed(this,33);
        }};
        void pollMusic(int source,int ticket) throws Exception {
            Bitmap art=null; String id="";
            if(source==2) {
                var manager=(MediaSessionManager)getSystemService(MEDIA_SESSION_SERVICE);
                for(var session:manager.getActiveSessions(new ComponentName(FieldWallpaper.this,PlaybackAccess.class))) {
                    var state=session.getPlaybackState(); var meta=session.getMetadata();
                    if(state==null || state.getState()!=PlaybackState.STATE_PLAYING || meta==null) continue;
                    art=meta.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART); if(art==null) art=meta.getBitmap(MediaMetadata.METADATA_KEY_ART);
                    id=meta.getString(MediaMetadata.METADATA_KEY_ARTIST)+"\0"+meta.getString(MediaMetadata.METADATA_KEY_ALBUM)+"\0"+meta.getString(MediaMetadata.METADATA_KEY_TITLE); break;
                }
            } else {
                String endpoint="https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&format=json&limit=1&user="+URLEncoder.encode(prefs.getString("user",""),"UTF-8")+"&api_key="+URLEncoder.encode(prefs.getString("key",""),"UTF-8");
                var json=new JSONObject(new String(download(endpoint),StandardCharsets.UTF_8));
                var tracks=json.getJSONObject("recenttracks").getJSONArray("track"); if(tracks.length()==0) return; var track=tracks.getJSONObject(0);
                if(!track.has("@attr") || !track.getJSONObject("@attr").optBoolean("nowplaying")) return;
                id=track.getJSONObject("artist").optString("#text")+"\0"+track.getJSONObject("album").optString("#text")+"\0"+track.optString("name");
                if(id.equals(key)) return; var images=track.getJSONArray("image"); String url=""; for(int i=0;i<images.length();i++) if(!images.getJSONObject(i).optString("#text").isEmpty()) url=images.getJSONObject(i).getString("#text");
                if(url.isEmpty()) return; byte[] bytes=download(url); art=BitmapFactory.decodeByteArray(bytes,0,bytes.length);
            }
            if(art==null || id.equals(key)) return;
            var small=Bitmap.createScaledBitmap(art,64,64,true); var counts=new HashMap<Integer,Integer>();
            for(int y=0;y<64;y++) for(int x=0;x<64;x++) { int c=small.getPixel(x,y); if(Color.alpha(c)<128) continue; int q=Color.rgb(Color.red(c)/32*32,Color.green(c)/32*32,Color.blue(c)/32*32); counts.put(q,counts.getOrDefault(q,0)+1); }
            if(small!=art) small.recycle(); if(counts.isEmpty()) return;
            var ranked=new ArrayList<>(counts.keySet()); ranked.sort((a,b)->Integer.compare(counts.get(b),counts.get(a))); var chosen=new ArrayList<>(ranked.subList(0,Math.min(5,ranked.size()))); while(chosen.size()<5) chosen.add(chosen.get(chosen.size()-1)); chosen.sort(Comparator.comparingDouble(c->Color.red(c)*.299+Color.green(c)*.587+Color.blue(c)*.114));
            float[] colors=new float[15]; for(int i=0;i<5;i++) { int c=chosen.get(i); colors[i*3]=Color.red(c)/255f; colors[i*3+1]=Color.green(c)/255f; colors[i*3+2]=Color.blue(c)/255f; }
            String identity=id; gl.post(() -> { if(ticket==revision) { key=identity; palette(colors); } });
        }
        byte[] download(String url) throws Exception {
            if(!url.startsWith("https://")) throw new IllegalArgumentException("HTTPS required");
            var connection=(HttpsURLConnection)new URL(url).openConnection(); connection.setConnectTimeout(8000); connection.setReadTimeout(8000);
            try(var in=connection.getInputStream(); var out=new java.io.ByteArrayOutputStream()) { byte[] buffer=new byte[8192]; int n; while((n=in.read(buffer))!=-1) { if(out.size()+n>8000000) throw new java.io.IOException("Response too large"); out.write(buffer,0,n); } return out.toByteArray(); } finally { connection.disconnect(); }
        }
        void release() {
            initialized=false; gl.removeCallbacks(frame);
            if(display!=EGL14.EGL_NO_DISPLAY) {
                if(program!=0) GLES20.glDeleteProgram(program); if(texture!=0) GLES20.glDeleteTextures(1,new int[]{texture},0);
                EGL14.eglMakeCurrent(display,EGL14.EGL_NO_SURFACE,EGL14.EGL_NO_SURFACE,EGL14.EGL_NO_CONTEXT);
                if(surface!=null) EGL14.eglDestroySurface(display,surface); if(context!=null) EGL14.eglDestroyContext(display,context); EGL14.eglTerminate(display); display=EGL14.EGL_NO_DISPLAY;
            }
        }
    }
}
