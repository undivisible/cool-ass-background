import { createBackground, createTrackSync, syncLastFm, DEFAULT_PALETTE } from '../src/index.js';
import presets from '../src/presets.json';

const status = document.querySelector('#status');
const report = text => { status.textContent = text; };
const params = new URLSearchParams(location.search);
if (params.has('wallpaper')) document.body.classList.add('wallpaper');
try {
  const bg = createBackground(document.querySelector('#field'));
  const sync = createTrackSync(bg, report);
  const select = document.querySelector('#preset');
  for (const name of Object.keys(presets)) select.add(new Option(name, name));
  let stopLastFm = () => {};
  function disconnect() { stopLastFm(); stopLastFm = () => {}; sync.dispose(); }
  select.onchange = () => { disconnect(); bg.setPalette(presets[select.value]); report(`Palette: ${select.value} · crossfading`); };
  let sequence = 0;
  document.querySelector('#next-track').onclick = () => {
    disconnect();
    const name = ['Acid blue', 'Cyan pink', 'Electric reference', 'Dracula'][sequence++ % 4];
    void sync.update({ id: `demo-${sequence}`, title: `Demo track ${sequence} / ${name}`, colors: presets[name] });
    select.value = name;
  };
  let ascii = true, paused = false;
  document.querySelector('#mode').onclick = event => { ascii = !ascii; bg.setAscii(ascii); event.target.textContent = `ASCII ${ascii ? 'on' : 'off'}`; event.target.setAttribute('aria-pressed', String(ascii)); };
  document.querySelector('#pause').onclick = event => { paused = !paused; paused ? bg.pause() : bg.resume(); event.target.textContent = paused ? 'Resume' : 'Pause'; event.target.setAttribute('aria-pressed', String(paused)); };
  document.querySelector('#lastfm').onsubmit = event => {
    event.preventDefault(); disconnect();
    stopLastFm = syncLastFm(sync, { user: document.querySelector('#user').value.trim(), apiKey: document.querySelector('#key').value.trim(), onStatus: report });
    report('Connecting to Last.fm…');
  };
  document.querySelector('#disconnect').onclick = () => { disconnect(); report('Disconnected; keeping palette'); };
  // Native hosts call this with JSON-serialized data, never arbitrary player strings as source.
  window.wallpaper = {
    track: track => sync.update(track),
    preset: name => { disconnect(); bg.setPalette(presets[name] || DEFAULT_PALETTE); select.value = name; },
    lastfm: (user, apiKey) => { disconnect(); stopLastFm = syncLastFm(sync, { user, apiKey, onStatus: report }); },
    pause: () => bg.pause(), resume: () => bg.resume(),
  };
  window.shaderDemo = { background: bg, sync, presets };
  document.documentElement.dataset.ready = 'true';
  window.addEventListener('pagehide', () => { disconnect(); bg.dispose(); }, { once: true });
} catch (error) { report(error.message); document.documentElement.dataset.ready = 'error'; }
