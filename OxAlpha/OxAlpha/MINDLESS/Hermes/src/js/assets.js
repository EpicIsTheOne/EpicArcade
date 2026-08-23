// MINDLESS-Hermes :: assets.js — image/audio manifest + loader
"use strict";

const Assets = {
  images: {}, audio: {}, // AudioBuffers
  toLoad: 0, loaded: 0, done: false, failed: [],

  IMAGE_MANIFEST: {
    // twins (64x64 cells, 2x2)
    ecliptio: "assets/art/sprites/EcliptioSprites.png",
    nova: "assets/art/sprites/NovaGreenSprites.png",
    // MIND units (32x32 cells, 4x4)
    enemy_basic: "assets/art/sprites/EnemySprite.png",
    enemy_dasher: "assets/art/sprites/DasherEnemySprite.png",
    enemy_elite: "assets/art/sprites/EliteDasherEnemySprite.png",
    // bosses
    angelica: "assets/art/sprites/AngelicaV2.png",        // 32x32
    evangeline: "assets/art/sprites/evangeline.png",      // 58x32
    eden_face: "assets/art/sprites/eden_face.png",        // 64x64
    // props / env
    street_bg: "assets/art/env/street-background.png",    // 400x64
    bar_bg: "assets/art/env/bar-background.png",          // 608x64
    rails: "assets/art/env/rails.png",
    garage_closed: "assets/art/env/garage-door-closed.png",
    garage_open: "assets/art/env/garage-door-opened.png",
    sewer_hole: "assets/art/env/sewer_hole.png",
    window_prop: "assets/art/env/window.png",
    barrel: "assets/art/env/barrel.png",
    chicken: "assets/art/env/chicken.png",
    gun: "assets/art/env/gun.png",
    knife: "assets/art/env/knife.png",
    prop_shadow: "assets/art/env/prop-shadow.png",
    shockwave: "assets/art/env/shockwave.png",            // 32x32 red arc
    note_orange: "assets/art/env/MusicNote.png",          // 16x16
    note_green: "assets/art/env/GreenMusicNote.png",      // 16x16
    spark: "assets/art/env/spark.png",
    city_back: "assets/art/city/back.png",                // parallax 112x272
    city_middle: "assets/art/city/middle.png",            // 256x272
    city_fore: "assets/art/city/foreground.png",          // 688x272
    // intro slides (240x135)
    intro1: "assets/art/intro/Scene1.png",
    intro2: "assets/art/intro/Scene2.png",
    intro3: "assets/art/intro/Scene3.png",
    intro4: "assets/art/intro/Scene4.png",
    intro5: "assets/art/intro/Scene5.png",
    intro6: "assets/art/intro/Scene6.png",
    logo: "assets/art/ui/MINDLESSLogo1.png",
    // HUD avatars (11x11)
    av_ecliptio: "assets/art/ui/avatar_ecliptio_red.png",
    av_nova: "assets/art/ui/avatar_nova_green.png",
    av_basic: "assets/art/ui/Avatar_Basic_Enemy.png",
    av_dasher: "assets/art/ui/Avatar_Dasher_Enemy.png",
    av_elite: "assets/art/ui/Avatar_Elite_Dasher_Enemy.png",
    av_evangeline: "assets/art/ui/avatar_evangeline.png",
    av_eden: "assets/art/ui/avatar_eden.png",
    av_angelica: "assets/art/ui/avatar_angelica.png",
    onward_arrow: "assets/art/ui/OnwardArrow.png",
    sigil: "assets/art/ui/eden_protocol_sigil.png",
  },

  AUDIO_MANIFEST: {
    // music (authentic originals)
    mus_menu: "assets/music/menu.mp3",
    mus_intro: "assets/music/intro_130.mp3",
    mus_training: "assets/music/boss_test_gameplay.mp3",
    mus_resistance: "assets/music/lobby.mp3",
    mus_slums: "assets/music/stage1.mp3",
    mus_paradise: "assets/music/stage2.mp3",
    mus_facility: "assets/music/mind_facility_140.wav",
    mus_evangeline: "assets/music/evangeline_104.mp3",
    mus_eden: "assets/music/eden_144.mp3",
    mus_angelica: "assets/music/angelica_140_134.mp3",
    mus_pause: "assets/music/pausemenu.mp3",
    met_140: "assets/music/metronome_140.mp3",
    met_130: "assets/music/metronome_130.mp3",
    met_118: "assets/music/metronome_118.mp3",
    // sfx (original recordings)
    atk1: "assets/sfx/Attack1.mp3", atk2: "assets/sfx/Attack2.mp3", atk3: "assets/sfx/Attack3.mp3",
    powermove: "assets/sfx/PowerMove.mp3", fwehh: "assets/sfx/Fwehh.mp3",
    hurt: "assets/sfx/Hurt.mp3", zoom: "assets/sfx/Zoom.mp3",
    hit1: "assets/sfx/hit-1.wav", hit2: "assets/sfx/hit-2.wav",
    click: "assets/sfx/click.wav", gogogo: "assets/sfx/gogogo.wav",
    grunt: "assets/sfx/grunt.wav", gunshot: "assets/sfx/gunshot.wav",
    knifehit: "assets/sfx/knife-hit.wav", miss: "assets/sfx/miss.wav",
    eatfood: "assets/sfx/eat-food.wav",
  },

  loadAll(onProgress, onDone) {
    const keys = Object.keys(this.IMAGE_MANIFEST);
    const akeys = Object.keys(this.AUDIO_MANIFEST);
    this.toLoad = keys.length + akeys.length;
    const finishOne = () => {
      this.loaded++;
      if (onProgress) onProgress(this.loaded, this.toLoad);
      // audio loading is kicked by the caller once half-way; guard double-call
      if (this.loaded >= keys.length && !this._audioKicked) this._audioKicked = true;
      if (onProgress && this.loaded >= this.toLoad) { /* images done */ }
    };
    for (const k of keys) {
      const img = new Image();
      img.onload = () => { this.images[k] = img; finishOne(); };
      img.onerror = () => { this.failed.push(k); finishOne(); };
      img.src = this.IMAGE_MANIFEST[k];
    }
    return akeys; // audio decoded by AudioEngine after AudioContext exists
  },

  loadAudio(audioEngine, akeys, onProgress, onDone) {
    let done = 0;
    const total = akeys.length;
    if (total === 0 && onDone) onDone();
    for (const k of akeys) {
      fetch(this.AUDIO_MANIFEST[k])
        .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(buf => audioEngine.ctx.decodeAudioData(buf))
        .then(decoded => { this.audio[k] = decoded; })
        .catch(() => { this.failed.push(k); })
        .finally(() => {
          done++; if (onProgress) onProgress(done, total);
          if (done >= total && onDone) onDone();
        });
    }
  },
};
