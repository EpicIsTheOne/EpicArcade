// Procedural canvas textures - all art generated in code, zero external assets.
(function (root) {
  function cv(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function tex(canvas, repX, repY) {
    var t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repX || 1, repY || 1);
    t.anisotropy = 4;
    return t;
  }
  function noise(ctx, w, h, alpha, dark) {
    for (var i = 0; i < w * h * 0.08; i++) {
      var x = Math.random() * w | 0, y = Math.random() * h | 0;
      ctx.fillStyle = 'rgba(' + (dark ? '0,0,0' : '255,255,255') + ',' + (Math.random() * alpha).toFixed(3) + ')';
      ctx.fillRect(x, y, 1 + (Math.random() * 2 | 0), 1 + (Math.random() * 2 | 0));
    }
  }
  var T = {};
  T.build = function () {
    var c;
    // ballast gravel under tracks
    c = cv(128, 128); var g = c.getContext('2d');
    g.fillStyle = '#4a4a52'; g.fillRect(0, 0, 128, 128);
    noise(g, 128, 128, 0.25, true); noise(g, 128, 128, 0.12, false);
    this.ballast = tex(c, 1, 8);
    // wooden sleeper
    c = cv(64, 32); g = c.getContext('2d');
    g.fillStyle = '#5b4632'; g.fillRect(0, 0, 64, 32);
    g.fillStyle = 'rgba(0,0,0,.28)';
    for (var i = 0; i < 5; i++) g.fillRect(0, i * 7 + 2, 64, 2);
    noise(g, 64, 32, 0.15, true);
    this.sleeper = tex(c, 1, 1);
    // concrete platform
    c = cv(128, 128); g = c.getContext('2d');
    g.fillStyle = '#9aa3ad'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(60,66,76,.5)'; g.lineWidth = 2;
    g.strokeRect(2, 2, 124, 124);
    noise(g, 128, 128, 0.14, true);
    this.concrete = tex(c, 2, 6);
    // platform warning strip (yellow tactile)
    c = cv(64, 64); g = c.getContext('2d');
    g.fillStyle = '#e8c832'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(0,0,0,.35)';
    for (i = 0; i < 8; i++) g.fillRect(i * 8 + 3, 4, 3, 56);
    this.tactile = tex(c, 6, 1);
    // asphalt road
    c = cv(128, 256); g = c.getContext('2d');
    g.fillStyle = '#33363f'; g.fillRect(0, 0, 128, 256);
    g.fillStyle = 'rgba(240,230,140,.75)';
    g.fillRect(61, 20, 6, 90); g.fillRect(61, 150, 6, 90); // dashed centerline
    noise(g, 128, 256, 0.16, true);
    this.asphalt = tex(c, 1, 4);
    // building facade: window grid (emissive-capable)
    c = cv(128, 256); g = c.getContext('2d');
    g.fillStyle = '#2c3444'; g.fillRect(0, 0, 128, 256);
    for (var y = 0; y < 10; y++) for (var x = 0; x < 5; x++) {
      var lit = Math.random();
      g.fillStyle = lit > 0.72 ? '#ffe9b0' : (lit > 0.4 ? '#3d4c66' : '#232b3b');
      g.fillRect(8 + x * 24, 10 + y * 24, 15, 14);
    }
    noise(g, 128, 256, 0.06, true);
    this.facade = tex(c, 1, 1);
    // facade variant 2 (warmer tower)
    c = cv(128, 256); g = c.getContext('2d');
    g.fillStyle = '#3a3346'; g.fillRect(0, 0, 128, 256);
    for (y = 0; y < 10; y++) for (x = 0; x < 5; x++) {
      lit = Math.random();
      g.fillStyle = lit > 0.65 ? '#ffd98a' : (lit > 0.35 ? '#46405e' : '#2b2740');
      g.fillRect(9 + x * 23, 12 + y * 24, 13, 13);
    }
    this.facade2 = tex(c, 1, 1);
    // grass
    c = cv(128, 128); g = c.getContext('2d');
    g.fillStyle = '#4d9950'; g.fillRect(0, 0, 128, 128);
    noise(g, 128, 128, 0.22, true); noise(g, 128, 128, 0.1, false);
    this.grass = tex(c, 2, 2);
    // corrugated maintenance metal
    c = cv(128, 128); g = c.getContext('2d');
    g.fillStyle = '#7c8794'; g.fillRect(0, 0, 128, 128);
    for (x = 0; x < 128; x += 8) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x, 0, 3, 128); }
    g.fillStyle = 'rgba(200,80,60,.85)'; g.fillRect(10, 84, 44, 10); // rust streaks
    g.fillStyle = 'rgba(160,140,60,.7)'; g.fillRect(70, 30, 30, 8);
    this.metal = tex(c, 2, 1);
    // hazard stripes (construction barriers)
    c = cv(128, 32); g = c.getContext('2d');
    g.fillStyle = '#f2c230'; g.fillRect(0, 0, 128, 32);
    g.fillStyle = '#22242a';
    for (i = -32; i < 128; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i + 32, 32); g.lineTo(i + 16, 32); g.fill(); }
    this.hazard = tex(c, 1, 1);
    // chainlink fence (transparent)
    c = cv(128, 128); g = c.getContext('2d');
    g.clearRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(190,200,215,.9)'; g.lineWidth = 2;
    for (i = -128; i < 256; i += 16) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke();
      g.beginPath(); g.moveTo(i + 128, 0); g.lineTo(i, 128); g.stroke();
    }
    this.fence = tex(c, 3, 1);
    // tunnel wall
    c = cv(256, 128); g = c.getContext('2d');
    g.fillStyle = '#262a36'; g.fillRect(0, 0, 256, 128);
    g.strokeStyle = 'rgba(120,130,150,.25)'; g.lineWidth = 4;
    for (x = 0; x < 256; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke(); }
    g.fillStyle = 'rgba(255,210,120,.9)';
    for (i = 0; i < 4; i++) { g.beginPath(); g.arc(40 + i * 60, 26, 7, 0, 7); g.fill(); } // ceiling lamps
    noise(g, 256, 128, 0.12, true);
    this.tunnel = tex(c, 1, 1);
    // billboard ad panels
    c = cv(256, 128); g = c.getContext('2d');
    var grd = g.createLinearGradient(0, 0, 256, 128);
    grd.addColorStop(0, '#19c6ff'); grd.addColorStop(1, '#0a4dd6');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 128);
    g.fillStyle = 'rgba(255,255,255,.95)'; g.font = '900 44px Segoe UI';
    g.fillText('NOVA', 62, 62); g.font = '700 20px Segoe UI'; g.fillText('COLA', 92, 92);
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 5; g.strokeRect(6, 6, 244, 116);
    this.billboardA = tex(c, 1, 1);
    c = cv(256, 128); g = c.getContext('2d');
    grd = g.createLinearGradient(0, 0, 256, 0);
    grd.addColorStop(0, '#ff5470'); grd.addColorStop(1, '#ffb547');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#fff'; g.font = '900 40px Segoe UI'; g.fillText('RUSH!!', 68, 74);
    this.billboardB = tex(c, 1, 1);
    // coin face
    c = cv(64, 64); g = c.getContext('2d');
    g.fillStyle = '#ffc94d'; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill();
    g.strokeStyle = '#b57914'; g.lineWidth = 5; g.beginPath(); g.arc(32, 32, 27, 0, 7); g.stroke();
    g.fillStyle = '#fff3cf'; g.font = '900 34px Georgia'; g.textAlign = 'center'; g.fillText('S', 32, 45);
    this.coin = tex(c, 1, 1);
    // sky gradient (used on dome)
    c = cv(16, 512); g = c.getContext('2d');
    var sg = g.createLinearGradient(0, 0, 0, 512);
    sg.addColorStop(0.0, '#0b1030'); sg.addColorStop(0.38, '#20386e');
    sg.addColorStop(0.62, '#4a6fb5'); sg.addColorStop(0.82, '#8fa8d8'); sg.addColorStop(1.0, '#e8b47c');
    g.fillStyle = sg; g.fillRect(0, 0, 16, 512);
    this.sky = tex(c, 1, 1); this.sky.wrapS = this.sky.wrapT = THREE.ClampToEdgeWrapping;
    return this;
  };
  root.Tex = T;
})(typeof window !== 'undefined' ? window : globalThis);
