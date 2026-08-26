window.App = (function () {
  const engine = new AudioEngine();
  const STORE_KEY = 'spectra.settings.v1';
  let R = null, UI = null;

  function defaultSettings() {
    return {
      mode: 0,
      theme: 0,
      intensity: 1,
      smoothing: 0.82,
      sensitivity: 1,
      trails: true,
      glow: true,
      flashOn: true,
      autoCycle: false,
      cycleSecs: 20,
      volume: 0.9,
      muted: false
    };
  }
  function loadStored() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaultSettings();
      return Object.assign(defaultSettings(), JSON.parse(raw));
    } catch (e) { return defaultSettings(); }
  }
  function persist() {
    if (!R) return;
    const s = R.settings;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        mode: R.modeIndex,
        theme: window.Themes.indexOf(R.theme),
        intensity: s.intensity,
        smoothing: s.smoothing,
        sensitivity: s.sensitivity,
        trails: s.trails,
        glow: s.glow,
        flashOn: s.flashOn,
        autoCycle: s.autoCycle,
        cycleSecs: s.cycleSecs,
        volume: engine.volume,
        muted: engine.muted
      }));
    } catch (e) {}
  }

  function applyStored(st) {
    R.settings.intensity = st.intensity;
    R.settings.smoothing = st.smoothing;
    R.settings.sensitivity = st.sensitivity;
    R.settings.trails = st.trails;
    R.settings.glow = st.glow;
    R.settings.flashOn = st.flashOn;
    R.settings.autoCycle = st.autoCycle;
    R.settings.cycleSecs = st.cycleSecs;
    engine.setVolume(st.volume);
    engine.setMuted(st.muted);
    engine.setSmoothing(st.smoothing);
    setTheme(st.theme || 0, true);
    R.setMode(st.mode || 0, true);
    UI.applySettingsToControls(
      { intensity: st.intensity, smoothing: st.smoothing, sensitivity: st.sensitivity, glow: st.glow, trails: st.trails, flashOn: st.flashOn, autoCycle: st.autoCycle, cycleSecs: st.cycleSecs },
      st.volume
    );
  }

  function setTheme(idx, silent) {
    idx = ((idx % window.Themes.length) + window.Themes.length) % window.Themes.length;
    R.setTheme(window.Themes[idx]);
    UI.syncTheme(idx);
    if (!silent) persist();
  }

  async function loadFile(file) {
    const okType = /^audio\//.test(file.type) ||
      /\.(mp3|wav|ogg|oga|flac|m4a|aac|opus|webm)$/i.test(file.name);
    if (!okType) {
      UI.showToast('Unsupported file type', 'error');
      return;
    }
    UI.showLoading('Decoding \u201c' + file.name + '\u201d\u2026');
    try {
      const ab = await file.arrayBuffer();
      const buf = await engine.decode(ab);
      engine.loadBuffer(buf, file.name.replace(/\.[^.]+$/, ''));
      UI.onTrackLoaded();
      persist();
      engine.play();
      UI.showToast('\u25b6 Now playing \u2014 ' + engine.trackName);
    } catch (err) {
      console.error(err);
      UI.showToast('Could not decode this audio file', 'error');
    } finally {
      UI.showLoading(null);
    }
  }

  async function loadDemo() {
    if (engine.isDemo && engine.buffer) { engine.seek(0); engine.play(); return; }
    UI.showLoading('Synthesizing demo track\u2026');
    try {
      const buf = await buildDemoTrack(engine);
      engine.loadBuffer(buf, 'Neon Circuit');
      engine.isDemo = true;
      UI.onTrackLoaded();
      persist();
      engine.play();
      UI.showToast('\u25b6 Demo track ready \u2014 enjoy the ride');
    } catch (err) {
      console.error(err);
      UI.showToast('Demo synthesis failed', 'error');
    } finally {
      UI.showLoading(null);
    }
  }

  function boot() {
    R = window.Renderer;
    UI = window.UI;
    R.init(document.getElementById('stage'), engine);
    UI.init(engine, R, Public);
    const stored = loadStored();
    applyStored(stored);
    R.onModeChange = idx => UI.syncMode(idx);
    UI.syncMode(R.modeIndex);
    engine.onStateChange = () => UI.syncTransport();
    engine.onTrackEnd = () => {};
  }

  const Public = {
    loadFile, loadDemo,
    setTheme,
    cycleTheme() { setTheme(window.Themes.indexOf(R.theme) + 1); },
    persistSettings: persist,
    setVolume(v) {
      engine.setVolume(v);
      if (v > 0) engine.setMuted(false);
      UI.syncMute(engine.muted, engine.volume);
      persist();
    },
    toggleMute() {
      engine.setMuted(!engine.muted);
      UI.syncMute(engine.muted, engine.volume);
      persist();
    }
  };

  document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0));
  return Public;
})();
