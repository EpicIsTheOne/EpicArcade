// Post-processing: bloom + color grade, quality-scaled. Falls back to direct render.
(function (root) {
  function PostFX(renderer, scene, camera) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.enabled = false;
    var THREE_ = root.THREE;
    if (!THREE_.EffectComposer) return;
    try {
      var size = renderer.getSize(new THREE_.Vector2());
      var rt = new THREE_.WebGLRenderTarget(size.x, size.y, { type: THREE_.HalfFloatType });
      this.composer = new THREE_.EffectComposer(renderer, rt);
      this.composer.addPass(new THREE_.RenderPass(scene, camera));
      this.bloom = new THREE_.UnrealBloomPass(new THREE_.Vector2(size.x, size.y), 0.38, 0.6, 0.86);
      this.composer.addPass(this.bloom);
      // final pass: plain copy to screen (grading handled via canvas CSS filter)
      var copy = new THREE_.ShaderPass(THREE_.CopyShader);
      copy.renderToScreen = true;
      this.composer.addPass(copy);
      this.enabled = true;
    } catch (e) {
      root.SRLog('PostFX unavailable: ' + e.message);
      this.enabled = false;
    }
  }
  PostFX.prototype.setQuality = function (q) {
    if (!this.enabled) return;
    var bloomOn = q === 'ultra' || q === 'high';
    this.bloom.enabled = bloomOn;
    this.bloom.strength = q === 'ultra' ? 0.55 : 0.38;
    // color grade via CSS filter on the canvas (GPU-composited, cheap)
    if (root.__SR_CANVAS) {
      root.__SR_CANVAS.style.filter = q === 'ultra' ? 'saturate(1.14) contrast(1.05)' : (q === 'high' ? 'saturate(1.08)' : 'none');
    }
  };
  PostFX.prototype.resize = function (w, h) {
    if (!this.enabled) return;
    this.composer.setSize(w, h);
    if (this.bloom && this.bloom.setSize) this.bloom.setSize(w, h);
  };
  PostFX.prototype.render = function () {
    if (this.enabled && this.renderer.capabilities.maxTextureSize > 0 &&
        !(root.CFG && root.CFG.QA_FORCE_DIRECT)) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  };
  root.PostFX = PostFX;
})(typeof window !== 'undefined' ? window : globalThis);
