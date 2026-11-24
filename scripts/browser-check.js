(async () => {
  const { createBackground, createTrackSync, paletteFromArtwork } = await import('/background.js');
  const presets = await (await fetch('/presets.json')).json();
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
  const check = (condition, name) => { if (!condition) throw new Error(name); };
  check(document.documentElement.dataset.ready === 'true', 'demo initialized');
  check(document.documentElement.scrollWidth <= innerWidth, 'no horizontal overflow');
  const canvas = document.createElement('canvas'); canvas.style.cssText = 'width:320px;height:240px;position:fixed;right:0;bottom:0'; document.body.append(canvas);
  const bg = createBackground(canvas, { reducedMotion: true, ascii: false });
  const gl = canvas.getContext('webgl');
  const hashes = [];
  for (const [name, colors] of Object.entries(presets)) {
    bg.setPalette(colors); await frame();
    const pixels = new Uint8Array(canvas.width * canvas.height * 4); gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    let hash = 2166136261, saturated = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      hash = Math.imul(hash ^ pixels[i], 16777619); hash = Math.imul(hash ^ pixels[i+1], 16777619); hash = Math.imul(hash ^ pixels[i+2],16777619);
      if (Math.max(...pixels.slice(i,i+3)) - Math.min(...pixels.slice(i,i+3)) > 40) saturated++;
    }
    check(saturated > 100, `colored pixels: ${name}`); hashes.push([name, hash >>> 0, saturated]);
  }
  check(new Set(hashes.map(h => h[1])).size === 8, 'all presets produce distinct GPU frames');
  const sync = createTrackSync(bg);
  await sync.update({ id: 'a', colors: presets.Nord });
  sync.dispose(); bg.setPalette(presets.Dracula);
  await sync.update({ id: 'a', colors: presets.Nord });
  check(Math.abs(bg.getPalette()[0] - 46/255) < 1e-6, 'reconnecting same track works');
  const art = document.createElement('canvas'); art.width=art.height=8; const ctx=art.getContext('2d'); ctx.fillStyle='#ff0000';ctx.fillRect(0,0,8,8);
  const extracted=await paletteFromArtwork(art.toDataURL());
  check(extracted.every(c=>c==='#ff0000'), 'actual artwork decoding and extraction');
  sync.dispose(); bg.dispose(); canvas.remove();
  const live=window.shaderDemo.background;
  live.setPalette(presets.Nord);
  await new Promise(r=>setTimeout(r,1900));
  const before=live.getPalette(); live.setPalette(presets['Cyan pink']);
  const samples=[]; const begin=performance.now();
  while(performance.now()-begin<1950) { await frame(); samples.push(live.getPalette()); }
  const last=samples.at(-1);
  check(samples.some(s=>s[0]>9/255 && s[0]<46/255), 'intermediate track colors');
  check(Math.abs(last[0]-9/255)<1e-6, 'track palette settled');
  check(new Set(samples.map(s=>s[0].toFixed(5))).size>10, 'continuous crossfade');
  return { ready:true, presets:hashes, artworkDecode:true, reconnect:true, fadeSamples:samples.length, distinctFadeLevels:new Set(samples.map(s=>s[0].toFixed(5))).size, overflow:false, start:before[0],end:last[0] };
})()
