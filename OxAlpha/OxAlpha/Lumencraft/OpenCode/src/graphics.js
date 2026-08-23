// Renderer orchestration: WebGL2 context, HDR scene target, sun shadow map,
// post chain, quality application.
import * as THREE from 'three';
import { PostFX } from './postfx.js';
import { globalUniforms } from './materials.js';

export class Graphics {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    const gl2 = this.renderer.capabilities.isWebGL2;
    if (!gl2) console.warn('[graphics] WebGL2 unavailable — falling back');
    this.isWebGL2 = !!gl2;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // grading pass encodes sRGB
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.autoClear = true;
    this.renderer.info.autoReset = false;
    this.mainPassStats = { calls: 0, triangles: 0 };

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.08, 1400);

    // shadow resources
    this.shadowSize = 2048;
    const depthTex = new THREE.DepthTexture(this.shadowSize, this.shadowSize);
    depthTex.type = THREE.UnsignedIntType;
    this.shadowRT = new THREE.WebGLRenderTarget(this.shadowSize, this.shadowSize, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthTexture: depthTex,
      depthBuffer: true,
      stencilBuffer: false,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    globalUniforms.uShadowMap.value = depthTex;
    this.sunCam = new THREE.OrthographicCamera(-46, 46, 46, -46, 8, 300);
    this._shadowOverride = new THREE.MeshBasicMaterial({ colorWrite: false });

    // scene target
    this.sceneRT = null;
    this.postfx = new PostFX(this.renderer);

    this.settings = { shadows: true, bloom: true, resScale: 100, fov: 75 };
    this._sizeW = 1; this._sizeH = 1;
  }

  applySettings(s) {
    this.settings = { ...this.settings, ...s };
    this.camera.fov = this.settings.fov;
    this.camera.updateProjectionMatrix();
    const shadowOn = !!this.settings.shadows && this.isWebGL2;
    this._shadowWanted = shadowOn;
    this.shadowRT.setSize(shadowOn ? (this.settings.quality === 'ultra' ? 4096 : this.settings.quality === 'low' ? 1024 : 2048) : 8,
      shadowOn ? (this.settings.quality === 'ultra' ? 4096 : this.settings.quality === 'low' ? 1024 : 2048) : 8);
    globalUniforms.uShadowStrength.value = shadowOn ? 1 : 0;
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.setSize(w, h, false);
    const rs = (this.settings.resScale || 100) / 100;
    this._sizeW = Math.max(64, Math.floor(w * (window.devicePixelRatio || 1) * rs));
    this._sizeH = Math.max(64, Math.floor(h * (window.devicePixelRatio || 1) * rs));
    if (!this.sceneRT) {
      this.sceneRT = new THREE.WebGLRenderTarget(2, 2, {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        samples: this.settings.quality === 'low' ? 0 : 4,
        depthBuffer: true,
      });
    } else {
      const wantSamples = this.settings.quality === 'low' ? 0 : 4;
      if (this.sceneRT.samples !== wantSamples) {
        this.sceneRT.dispose();
        this.sceneRT = new THREE.WebGLRenderTarget(2, 2, {
          type: THREE.HalfFloatType, format: THREE.RGBAFormat,
          minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
          samples: wantSamples, depthBuffer: true,
        });
      }
    }
    this.sceneRT.setSize(this._sizeW, this._sizeH);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.postfx.setSize(this._sizeW >> (this.settings.quality === 'low' ? 1 : 0), this._sizeH >> (this.settings.quality === 'low' ? 1 : 0));
  }

  _updateShadowCam(target, sunDir) {
    if (sunDir.y < 0.02) return false; // no useful shadows at night
    const texel = (46 * 2) / this.shadowRT.width;
    // snap target in light space to reduce shimmer
    const t = target.clone();
    this.sunCam.position.copy(t).sub(sunDir.clone().multiplyScalar(120));
    this.sunCam.up.set(0, 1, 0);
    this.sunCam.lookAt(t);
    this.sunCam.updateMatrixWorld();
    this.sunCam.updateProjectionMatrix();

    // snap translation in light space
    const m = this.sunCam.matrixWorldInverse;
    const lp = t.applyMatrix4(m);
    lp.x = Math.round(lp.x / texel) * texel;
    lp.y = Math.round(lp.y / texel) * texel;
    const inv = m.clone().invert();
    const snapped = lp.applyMatrix4(inv);
    this.sunCam.position.copy(snapped).sub(sunDir.clone().multiplyScalar(120));
    this.sunCam.lookAt(snapped);
    this.sunCam.updateMatrixWorld(true);
    this.sunCam.updateProjectionMatrix();

    const mat = new THREE.Matrix4()
      .multiplyMatrices(this.sunCam.projectionMatrix, this.sunCam.matrixWorldInverse);
    globalUniforms.uShadowMatrix.value.copy(mat);
    globalUniforms.uShadowTexel.value = 1 / this.shadowRT.width;
    return true;
  }

  renderFrame(opts) {
    const { playerPos, sunDir, underwater } = opts;
    this.renderer.info.reset();

    // ---- shadow pass ----
    let shadowsDrawn = false;
    if (this._shadowWanted) {
      shadowsDrawn = this._updateShadowCam(playerPos, sunDir);
    }
    globalUniforms.uShadowStrength.value = (this._shadowWanted && shadowsDrawn) ? 1 : 0;
    if (shadowsDrawn) {
      const hidden = [];
      for (const obj of this.scene.children) {
        if (!obj.visible) continue;
        if (obj.userData.noShadow || obj.material?.transparent) {
          obj.visible = false; hidden.push(obj);
          for (const c of obj.children ?? []) { if (c.visible) { c.visible = false; hidden.push(c); } }
        }
      }
      const prevOverride = this.scene.overrideMaterial;
      this.scene.overrideMaterial = this._shadowOverride;
      const prevTarget = this.renderer.getRenderTarget();
      this.renderer.setRenderTarget(this.shadowRT);
      this.renderer.clear(true, true, false);
      this.renderer.render(this.scene, this.sunCam);
      this.renderer.setRenderTarget(prevTarget);
      this.scene.overrideMaterial = prevOverride;
      for (const o of hidden) o.visible = true;
    }

    // ---- main pass ----
    this.renderer.setRenderTarget(this.sceneRT);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.mainPassStats = {
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
    };

    // ---- post ----
    this.postfx.compositeMat.uniforms.tScene.value = this.sceneRT.texture;
    this.postfx.compositeMat.uniforms.uUnderwater.value = underwater ? 1 : 0;
    this.postfx.render(this.sceneRT, this.settings.bloom);
  }
}
