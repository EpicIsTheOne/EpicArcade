// LIMINAL DYNAMICS — portal rendering engine
// Screen-space portal views with oblique near-plane clipping + bounded recursion.
import * as THREE from 'three';
import { portalXform } from './physics.js';

export class Portal {
  constructor(id, colorHex, renderer, sharedRT) {
    this.id = id;
    this.color = new THREE.Color(colorHex);
    this.active = false;
    this.pos = new THREE.Vector3();
    this.n = new THREE.Vector3();      // outward normal
    this.right = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.rx = 0.62; this.ry = 1.05;    // half extents (oval)
    this.host = null;                  // solid record it sits on
    this.openT = 0;                    // open animation 0..1
    this.mesh = null;
    this.rt = null;
    this.ownedRT = null;
    this.sharedRT = sharedRT;
    this.cam = new THREE.PerspectiveCamera();
    this.recursionDepth = 0;
    this.viewMatrix = new THREE.Matrix4();
    this.group = new THREE.Group();    // holds rim + inner
    this.rimMat = null;
    this.innerMat = null;
  }

  place(point, normal, solid, upHint) {
    this.pos.copy(point).addScaledVector(normal, 0.045);
    this.n.copy(normal);
    this.host = solid;
    // build tangent frame
    this.right.crossVectors(this.up.lengthSq() > 0.5 ? upHint || new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0), this.n);
    if (this.right.lengthSq() < 1e-4) this.right.set(0, 0, 1);
    this.right.normalize();
    this.up.crossVectors(this.n, this.right).normalize();
    this.active = true;
    this.openT = 0;
  }

  deactivate() {
    this.active = false;
    this.host = null;
    if (this.mesh) this.mesh.visible = false;
  }

  ensureMesh(scene, innerTexture, makeInner) {
    if (!this.mesh) {
      const shape = new THREE.Shape();
      const RX = 0.62, RY = 1.05;
      shape.absellipse(0, 0, RX, RY, 0, Math.PI * 2);
      const geo = new THREE.ShapeGeometry(shape, 48);
      this.rimMat = new THREE.MeshBasicMaterial({
        color: this.color.clone().multiplyScalar(1.25),
        transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false,
      });
      const rim = new THREE.Mesh(geo, this.rimMat);
      rim.scale.set(1.09, 1.075, 1);
      rim.renderOrder = 8;
      this.innerMat = makeInner(this);
      this.inner = new THREE.Mesh(geo, this.innerMat);
      this.inner.renderOrder = 9;
      this.mesh = new THREE.Group();
      this.mesh.add(rim, this.inner);
      this.mesh.visible = false;
      scene.add(this.mesh);
      // soft glow sprite
      const glowCanvas = document.createElement('canvas');
      glowCanvas.width = glowCanvas.height = 128;
      const g = glowCanvas.getContext('2d');
      const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
      grad.addColorStop(0, 'rgba(255,255,255,0.55)');
      grad.addColorStop(0.4, 'rgba(255,255,255,0.12)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
      const glowTex = new THREE.CanvasTexture(glowCanvas);
      this.glowMat = new THREE.SpriteMaterial({
        map: glowTex, color: this.color, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      this.glow = new THREE.Sprite(this.glowMat);
      this.glow.scale.set(2.6, 3.6, 1);
      this.mesh.add(this.glow);
    }
  }

  updateMesh(dt) {
    if (!this.mesh) return;
    this.mesh.visible = this.active;
    if (!this.active) return;
    this.openT = Math.min(1, this.openT + dt * 3.2);
    const e = 1 - Math.pow(1 - this.openT, 3);
    this.mesh.position.copy(this.pos);
    this.mesh.lookAt(this.pos.clone().add(this.n));
    // align roll: make mesh up == this.up
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.up);
    // mesh.lookAt gives +Z out; we need up alignment: apply roll correction
    const m = new THREE.Matrix4().makeBasis(this.right, this.up, this.n);
    this.mesh.quaternion.setFromRotationMatrix(m);
    this.mesh.scale.set(0.25 + 0.75 * e, 0.2 + 0.8 * e, 1);
    this.rimMat.opacity = 0.55 + 0.45 * e;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.004 + (this.id === 'blue' ? 0 : 1.7));
    this.glowMat.opacity = 0.28 + 0.3 * pulse * e;
    // drive the open amount into the inner shader (0 = fully closed/black)
    if (this.innerMat) {
      this.innerMat.uniforms.uOpen.value = e;
      this.innerMat.uniforms.uTime.value = performance.now() * 0.001;
    }
  }

  dispose() {
    if (this.ownedRT) this.ownedRT.dispose();
  }
}

// inner material: samples the RT with screen-space UV
export function makePortalInnerMaterial(portal, getSampler) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSampler: { value: null },
      uColor: { value: portal.color.clone() },
      uFallback: { value: new THREE.Color(0x0a0e14) },
      uHasView: { value: 0 },
      uTime: { value: 0 },
      uOpen: { value: 0 },
      uScreen: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uSampler;
      uniform vec3 uColor, uFallback;
      uniform float uHasView, uTime, uOpen;
      uniform vec2 uScreen;
      varying vec2 vUv;
      void main() {
        vec2 suv = gl_FragCoord.xy / uScreen;
        vec3 view = texture2D(uSampler, suv).rgb;
        // swirling energy fallback when no view (unlinked)
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        float ang = atan(p.y, p.x);
        float swirl = sin(ang * 3.0 + uTime * 2.4 - r * 7.0) * 0.5 + 0.5;
        vec3 energy = uColor * (0.16 + 0.22 * swirl) * (1.0 - r * 0.55);
        float edge = smoothstep(1.0, 0.82, r);
        vec3 col = mix(energy, view, uHasView * edge);
        col += uColor * pow(1.0 - r, 2.2) * 0.16;
        col *= uOpen;
        gl_FragColor = vec4(col, 1.0);
      }`,
    depthWrite: true,
  });
}

export class PortalRenderer {
  constructor(renderer, scene, world, maxRecursion = 4) {
    this.renderer = renderer;
    this.scene = scene;
    this.world = world;
    this.maxRecursion = maxRecursion;
    this.portals = {};
    this.dummyScene = new THREE.Scene(); // unused placeholder
    this._rtScale = 1.0;
  }

  init() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    for (const [id, color] of [['blue', 0x3fa9ff], ['amber', 0xff9a3c]]) {
      const p = new Portal(id, color, this.renderer);
      this.portals[id] = p;
      this.world.registerPortal(id, p);
    }
    this.resize(size.x, size.y);
  }

  resize(w, h) {
    for (const id of ['blue', 'amber']) {
      const p = this.portals[id];
      if (p.rt) p.rt.dispose();
      p.rt = new THREE.WebGLRenderTarget(
        Math.max(2, Math.floor(w * this._rtScale)),
        Math.max(2, Math.floor(h * this._rtScale)),
        { depthBuffer: true, samples: 0, type: THREE.HalfFloatType }
      );
      if (p.innerMat) p.innerMat.uniforms.uSampler.value = p.rt.texture;
    }
  }

  setRTScale(s) {
    this._rtScale = s;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.resize(size.x, size.y);
  }

  bothActive() {
    return this.portals.blue.active && this.portals.amber.active;
  }

  // Render portal views into their RTs. playerCam: main camera (already updated).
  renderPortalViews(playerCam, quality) {
    const linked = this.bothActive();
    const renderer = this.renderer;
    const mainTarget = renderer.getRenderTarget();
    const oldClearColor = new THREE.Color();
    renderer.getClearColor(oldClearColor);
    const oldClearAlpha = renderer.getClearAlpha();

    const maxRec = quality.recursion ?? 3;
    for (const id of ['blue', 'amber']) {
      const p = this.portals[id];
      if (!p.active) continue;
      if (!linked) {
        if (p.innerMat) p.innerMat.uniforms.uHasView.value = 0;
        continue;
      }
      const q = this.world.other(id);
      const vis = portalVisible(playerCam, p, q);
      if (!vis && maxRec > 0) {
        if (p.innerMat) p.innerMat.uniforms.uHasView.value = 0;
        continue;
      }
      this.renderRecursive(playerCam, p, q, p.rt, maxRec, 0);
      if (p.innerMat) {
        p.innerMat.uniforms.uHasView.value = 1;
        p.innerMat.uniforms.uSampler.value = p.rt.texture;
      }
    }
    renderer.setRenderTarget(mainTarget);
    renderer.setClearColor(oldClearColor, oldClearAlpha);
  }

  renderRecursive(viewCam, entry, exit, target, maxRec, depth) {
    const renderer = this.renderer;
    // camera transform: virtual = xform * viewCam
    const T = portalXform(entry, exit);
    const virtCam = viewCam.clone();
    virtCam.matrixAutoUpdate = false;
    const m = T.clone().multiply(viewCam.matrixWorld);
    virtCam.matrixWorld.copy(m);
    virtCam.matrixWorldInverse.copy(m).invert();
    virtCam.projectionMatrix.copy(viewCam.projectionMatrix);
    virtCam.projectionMatrixInverse.copy(viewCam.projectionMatrixInverse);
    virtCam.matrixWorld.decompose(virtCam.position, virtCam.quaternion, virtCam.scale);

    // oblique near plane at exit portal
    const clipCam = buildObliqueCamera(virtCam, exit);

    // hide exit portal inner surface in this view (avoid feedback smear);
    // keep rims visible for recursion ring look.
    const exitInner = exit.inner;
    const exitGlow = exit.glow;
    const prevVisibleInner = exitInner.visible;
    exitInner.visible = false;
    if (exitGlow) exitGlow.visible = false;
    const entryMesh = entry.mesh;
    const prevEntryVisible = entryMesh.visible;
    entryMesh.visible = false; // don't render the entry portal itself into its own view

    renderer.setRenderTarget(target);
    renderer.clear(true, true, true);

    // recursion: render deeper views of the OPPOSITE portal first (painter-ish)
    if (depth < maxRec) {
      // inside this view, the exit portal may be visible; recurse for it
      const nextEntry = exit; const nextExit = entry;
      if (nextEntry.active && nextExit.active && portalVisible(clipCam, nextEntry, nextExit)) {
        // render next level into the other portal's RT, then RESTORE our binding:
        // otherwise the render below would paint into the wrong target.
        this.renderRecursive(clipCam, nextEntry, nextExit, nextExit.rt, maxRec, depth + 1);
        renderer.setRenderTarget(target);
        renderer.setViewport(0, 0, target.width, target.height);
        nextExit.innerMat.uniforms.uHasView.value = 1;
        nextExit.innerMat.uniforms.uSampler.value = nextExit.rt.texture;
      } else {
        nextExit.innerMat.uniforms.uHasView.value = 0;
      }
    } else if (exit.innerMat) {
      exit.innerMat.uniforms.uHasView.value = 0; // deepest level: energy fill
    }

    renderer.render(this.scene, clipCam);

    exitInner.visible = prevVisibleInner;
    if (exitGlow) exitGlow.visible = true;
    entryMesh.visible = prevEntryVisible;
  }
}

function portalVisible(cam, entry, exit) {
  // cheap check: is entry portal within cam frustum (expanded) AND exit portal potentially visible
  const frustum = new THREE.Frustum();
  const mat = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  frustum.setFromProjectionMatrix(mat);
  // entry portal bounding sphere
  const c = entry.pos.clone().project(cam);
  if (c.z < -1 || c.z > 1) {
    // behind camera: still may see it if very close? treat as not visible
    if (entry.pos.clone().sub(cam.position ?? new THREE.Vector3()).length() > 2.5) return false;
  }
  const sph = new THREE.Sphere(entry.pos, 1.35);
  if (!frustum.intersectsSphere(sph)) return false;
  return true;
}

// Build a camera whose near plane coincides with the portal plane (oblique clipping, Lengyel method)
function buildObliqueCamera(base, portal) {
  const cam = base;
  const P = cam.projectionMatrix.clone();

  // portal plane in camera (view) space
  const nWorld = portal.n.clone();
  const pWorld = portal.pos.clone().addScaledVector(nWorld, -0.02);
  // transform to camera space; flip so the normal points back toward the camera
  // (Lengyel: clip-plane normal must face the visible half-space / the camera).
  const camInv = cam.matrixWorldInverse;
  const nCam = nWorld.clone().transformDirection(camInv).normalize().negate();
  const pCam = pWorld.clone().applyMatrix4(camInv);
  const plane = new THREE.Plane(nCam.clone(), -nCam.dot(pCam));

  const clip = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
  const projInv = P.clone().invert();
  const q = new THREE.Vector4(
    (Math.sign(clip.x) + projInv.elements[8]) / projInv.elements[0],
    (Math.sign(clip.y) + projInv.elements[9]) / projInv.elements[5],
    -1.0,
    (1.0 + projInv.elements[10]) / projInv.elements[14]
  );
  const c = clip.multiplyScalar(2.0 / clip.dot(q));
  // replace third row
  const m = P.elements;
  m[2] = c.x; m[6] = c.y; m[10] = c.z + 1.0; m[14] = c.w;

  cam.projectionMatrix.copy(P);
  cam.projectionMatrixInverse.copy(P).invert();
  return cam;
}
