// sky.js — gradient sky dome with sun disc + procedural cloud billboards.
import * as THREE from 'three';

export function makeSky(theme) {
  const geo = new THREE.SphereGeometry(4000, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(theme.skyTop) },
      uHorizon: { value: new THREE.Color(theme.skyHorizon) },
      uBottom: { value: new THREE.Color(theme.skyBottom || theme.skyHorizon) },
      uSunDir: { value: theme.sunDir.clone().normalize() },
      uSunColor: { value: new THREE.Color(theme.sunColor || '#fff2cc') },
      uNight: { value: theme.night ? 1 : 0 }
    },
    vertexShader: `
      varying vec3 vDir;
      void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 uTop,uHorizon,uBottom,uSunDir,uSunColor; uniform float uNight;
      varying vec3 vDir;
      float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      void main(){
        float h = vDir.y;
        vec3 col = h>0.0 ? mix(uHorizon,uTop,pow(clamp(h,0.,1.),0.62))
                         : mix(uHorizon,uBottom,pow(clamp(-h,0.,1.),0.5));
        // sun glow
        float sd = max(dot(vDir, normalize(uSunDir)),0.0);
        col += uSunColor * pow(sd, 600.0) * 3.2;          // disc
        col += uSunColor * pow(sd, 8.0) * 0.28;           // halo
        if(uNight>0.5){
          vec2 sp = vDir.xz/(vDir.y+0.28);
          vec2 cell = floor(sp*38.0);
          float st = hash(cell);
          if(st>0.992 && vDir.y>0.05){ col += vec3(0.9,0.95,1.0)*(hash(cell+7.0)); }
        }
        gl_FragColor = vec4(col,1.0);
      }`
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

function cloudTexture(tint) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const grd = x.createRadialGradient(64, 64, 8, 64, 64, 62);
  grd.addColorStop(0, tint + 'ff'); grd.addColorStop(0.55, tint + '88'); grd.addColorStop(1, tint + '00');
  x.fillStyle = grd; x.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeClouds(theme, count = 26, radius = 1500, height = [180, 520]) {
  const group = new THREE.Group();
  const texDay = cloudTexture(theme.night ? '#3a466e' : '#ffffff');
  const mat = new THREE.SpriteMaterial({ map: texDay, transparent: true, opacity: theme.night ? 0.34 : 0.82, depthWrite: false, fog: false });
  for (let i = 0; i < count; i++) {
    const s = new THREE.Sprite(mat);
    const ang = Math.random() * Math.PI * 2;
    const rad = radius * (0.35 + Math.random() * 0.65);
    s.position.set(Math.cos(ang) * rad, height[0] + Math.random() * (height[1] - height[0]), Math.sin(ang) * rad);
    const sc = 140 + Math.random() * 320;
    s.scale.set(sc, sc * (0.42 + Math.random() * 0.25), 1);
    group.add(s);
  }
  return group;
}

export function applyThemeLights(scene, theme) {
  const hemi = new THREE.HemisphereLight(new THREE.Color(theme.hemiSky), new THREE.Color(theme.hemiGround), theme.hemiInt ?? 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(new THREE.Color(theme.sunLight || '#ffffff'), theme.sunInt ?? 2.4);
  sun.position.copy(theme.sunDir).multiplyScalar(300);
  scene.add(sun); scene.add(sun.target);
  sun.shadow.mapSize.set(theme.night ? 1024 : 2048, theme.night ? 1024 : 2048);
  const cam = sun.shadow.camera;
  cam.left = cam.bottom = -90; cam.right = cam.top = 90; cam.near = 20; cam.far = 700;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6;
  if (theme.night) sun.intensity = theme.sunInt ?? 1.1;
  return { hemi, sun };
}

export const THEMES = {
  coast: {
    name: 'SUNSPIRE COAST',
    skyTop: '#2f8fd6', skyHorizon: '#bfe6f7', skyBottom: '#8fc8e8',
    sunDir: new THREE.Vector3(0.45, 0.72, 0.32), sunColor: '#fff3c8', sunLight: '#fff4dc', sunInt: 2.6,
    hemiSky: '#9ed4f5', hemiGround: '#caa06a', hemiInt: 0.95,
    fog: { color: '#bfe6f7', near: 260, far: 1900 },
    night: false
  },
  foundry: {
    name: 'NEON FOUNDRY',
    skyTop: '#070a18', skyHorizon: '#1a2342', skyBottom: '#0a0f24',
    sunDir: new THREE.Vector3(-0.4, 0.65, -0.35), sunColor: '#8fb0ff', sunLight: '#7f96d8', sunInt: 1.15,
    hemiSky: '#2a3358', hemiGround: '#0a0c18', hemiInt: 0.75,
    fog: { color: '#101631', near: 120, far: 1300 },
    night: true
  },
  skyforge: {
    name: 'SKYFORGE ISLES',
    skyTop: '#3d2f78', skyHorizon: '#f09ac2', skyBottom: '#5a4a9c',
    sunDir: new THREE.Vector3(0.3, 0.5, 0.55), sunColor: '#ffd9ec', sunLight: '#ffe4f1', sunInt: 2.2,
    hemiSky: '#c79ad6', hemiGround: '#4a3f77', hemiInt: 0.9,
    fog: { color: '#c98bc4', near: 200, far: 1700 },
    night: false
  }
};
