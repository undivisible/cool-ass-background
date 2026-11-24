import fragment from './field.frag' with { type: 'text' };
import { DEFAULT_PALETTE, PaletteTransition, paletteFromPixels } from './palette.js';
export { DEFAULT_PALETTE, PaletteTransition, paletteFromPixels } from './palette.js';

const vertex = 'attribute vec2 a_position; varying vec2 v_uv; void main(){v_uv=a_position*0.5+0.5;gl_Position=vec4(a_position,0.,1.);}';

/** Decorative WebGL1 field. No globals, framework, network requests or telemetry. */
export function createBackground(canvas, { colors = DEFAULT_PALETTE, fadeMs = 1800, ascii = true, fps = 30, reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches } = {}) {
  if (!(canvas instanceof HTMLCanvasElement)) throw new TypeError('Expected a canvas');
  if (!Number.isFinite(fps) || fps < 1 || fps > 60) throw new TypeError('fps must be between 1 and 60');
  const palette = new PaletteTransition(colors, reducedMotion ? 0 : fadeMs);
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false });
  if (!gl) throw new Error('WebGL is unavailable; use a CSS background fallback');
  let program, buffer, texture;
  let raf = 0, last = -Infinity, disposed = false, lost = false;
  let mode = ascii, paused = false;
  let uniforms;
  function initialize() {
    const shaders = [];
    try {
      for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        shaders.push(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      }
      program = gl.createProgram();
      shaders.forEach(s => gl.attachShader(program, s));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    } finally { shaders.forEach(s => gl.deleteShader(s)); }
    gl.useProgram(program);
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    uniforms = Object.fromEntries(['resolution','time','ascii','glyphs','colorA','colorB','colorC','colorD','colorE'].map(n => [n, gl.getUniformLocation(program, `u_${n}`)]));
    const atlas = document.createElement('canvas');
    atlas.width = 240; atlas.height = 32;
    const ctx = atlas.getContext('2d');
    ctx.font = '24px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'white';
    [...'.,:;-=+*#%'].forEach((c, i) => ctx.fillText(c, i * 24 + 12, 16));
    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  initialize();
  function draw(now) {
    raf = 0;
    if (disposed || lost || document.hidden || paused) return;
    if (now - last >= 1000 / fps) {
      last = now;
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      gl.viewport(0, 0, width, height);
      gl.useProgram(program);
      gl.uniform2f(uniforms.resolution, width / dpr, height / dpr);
      gl.uniform1f(uniforms.time, reducedMotion ? 0 : now / 1000);
      gl.uniform1f(uniforms.ascii, mode ? 1 : 0);
      gl.uniform1i(uniforms.glyphs, 0);
      const current = palette.at(now);
      ['A','B','C','D','E'].forEach((c, i) => gl.uniform3fv(uniforms[`color${c}`], current.slice(i * 3, i * 3 + 3)));
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    if (!reducedMotion) raf = requestAnimationFrame(draw);
  }
  function wake() {
    if (!disposed && !raf) { last = -Infinity; raf = requestAnimationFrame(draw); }
  }
  function visibility() { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else wake(); }
  function contextLost(event) { event.preventDefault(); lost = true; cancelAnimationFrame(raf); raf = 0; }
  function contextRestored() { lost = false; initialize(); wake(); }
  const observer = new ResizeObserver(wake);
  observer.observe(canvas);
  document.addEventListener('visibilitychange', visibility);
  canvas.addEventListener('webglcontextlost', contextLost);
  canvas.addEventListener('webglcontextrestored', contextRestored);
  wake();
  return {
    setPalette(colors) { palette.set(colors, performance.now()); wake(); },
    setAscii(value) { mode = Boolean(value); wake(); },
    pause() { paused = true; cancelAnimationFrame(raf); raf = 0; },
    resume() { paused = false; wake(); },
    getPalette() { return palette.at(performance.now()); },
    dispose() {
      disposed = true; cancelAnimationFrame(raf); observer.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      canvas.removeEventListener('webglcontextlost', contextLost);
      canvas.removeEventListener('webglcontextrestored', contextRestored);
      gl.deleteTexture(texture); gl.deleteBuffer(buffer); gl.deleteProgram(program);
    },
  };
}

export async function paletteFromArtwork(url, { signal } = {}) {
  // fetch+blob also supports native hosts passing data URLs; cross-origin servers must allow CORS.
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Artwork HTTP ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, 64, 64);
    return paletteFromPixels(ctx.getImageData(0, 0, 64, 64).data);
  } finally { bitmap.close(); }
}

/** Track identity, not poll frequency, starts a fade; latest asynchronous artwork wins. */
export function createTrackSync(background, onStatus = () => {}) {
  let generation = 0, key = null, controller;
  return {
    async update(track) {
      if (!track) return;
      const ticket = ++generation;
      controller?.abort(); controller = new AbortController();
      if (track.id === key) return;
      try {
        const colors = track.colors || await paletteFromArtwork(track.artwork, { signal: controller.signal });
        if (ticket !== generation) return;
        background.setPalette(colors); key = track.id;
        onStatus(`Synced: ${track.title || track.id}`);
      } catch (error) {
        if (ticket === generation) onStatus(`Keeping palette: ${error.message}`);
      }
    },
    dispose() { ++generation; controller?.abort(); key = null; },
  };
}

/** Public Last.fm API key, never a shared secret. No polling until explicitly configured. */
export function syncLastFm(sync, { user, apiKey, intervalMs = 30000, onStatus = () => {} }) {
  if (!user || !apiKey || intervalMs < 15000) throw new TypeError('Last.fm user/key required; interval must be ≥15s');
  let stopped = false, timer, controller;
  async function poll() {
    if (stopped) return;
    controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const url = new URL('https://ws.audioscrobbler.com/2.0/');
      url.search = new URLSearchParams({ method: 'user.getrecenttracks', user, api_key: apiKey, format: 'json', limit: '1' });
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`Last.fm HTTP ${response.status}`);
      const data = await response.json();
      if (data.error) throw new Error(data.message || 'Last.fm API error');
      const tracks = data.recenttracks?.track;
      const track = Array.isArray(tracks) ? tracks[0] : tracks;
      if (track?.['@attr']?.nowplaying !== 'true') { onStatus('No track playing; keeping palette'); return; }
      const artwork = track.image?.findLast(i => i['#text'])?.['#text'];
      if (!artwork) { onStatus('No artwork; keeping palette'); return; }
      await sync.update({ id: `${track.artist?.['#text']}\0${track.album?.['#text']}\0${track.name}`, title: track.name, artwork });
    } catch (error) { if (!stopped) onStatus(error.message); }
    finally { clearTimeout(timeout); if (!stopped) timer = setTimeout(poll, intervalMs); }
  }
  void poll();
  return () => { stopped = true; clearTimeout(timer); controller?.abort(); };
}

/** Use an app's own player; websites cannot inspect other tabs or OS media sessions. */
export function syncMediaElement(sync, media, getTrack) {
  const update = () => { if (!media.paused) void sync.update(getTrack()); };
  media.addEventListener('playing', update); media.addEventListener('loadedmetadata', update); update();
  return () => { media.removeEventListener('playing', update); media.removeEventListener('loadedmetadata', update); };
}
