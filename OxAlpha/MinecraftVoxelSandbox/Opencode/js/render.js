// Rendering pipeline: chunk shaders, sun shadows, sky dome, water, HDR post.
import * as THREE from '../vendor/three.module.js';
import { CHUNK, HEIGHT } from './config.js';
import { B, BLOCKS, isSolid } from './blocks.js';
import { buildAtlasData, TILE_INDEX } from './atlas.js';
import { buildChunkMesh } from './mesher.js';

const CHUNK_VS = `
precision highp float;
in vec3 position;
in vec3 aUVL;
in vec3 aCol;
in vec2 aLit;
in float aFlag;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform float uTime;
uniform float uWaveAmp;
out vec3 vUVL;
out vec3 vCol;
out vec2 vLit;
flat out float vFlag;
out vec3 vWorld;
void main(){
  vec3 p = position;
  vec4 wp = modelMatrix * vec4(p,1.0);
  int fl = int(aFlag + 0.5);
  if((fl & 4) != 0){
    wp.y += sin(uTime*1.7 + wp.x*0.9 + wp.z*1.1)*0.05*uWaveAmp;
  }
  if((fl & 2) != 0){
    wp.x += sin(uTime*1.8 + wp.x*1.3 + wp.z*1.7)*0.045;
    wp.z += cos(uTime*1.5 + wp.z*1.1 + wp.x*0.7)*0.045;
  }
  vWorld = wp.xyz;
  vUVL = aUVL;
  vCol = aCol;
  vLit = aLit;
  vFlag = aFlag;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const CHUNK_FS = `
precision highp float;
precision highp sampler2DArray;
precision highp sampler2D;
out vec4 fragColor;
in vec3 vUVL;
in vec3 vCol;
in vec2 vLit;
flat in float vFlag;
in vec3 vWorld;
uniform sampler2DArray uAtlas;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uSkyAmb;
uniform vec3 uFogCol;
uniform float uFogDen;
uniform float uAlphaTest;
uniform vec4 uLights[24];
uniform vec3 uLightCols[24];
uniform int uNumLights;
uniform sampler2D uShadowMap;
uniform mat4 uShadowVP;
uniform float uShadowOn;
float shadowSample(vec3 wpos, float ndl){
  if(uShadowOn < 0.5) return 1.0;
  vec4 sc = uShadowVP * vec4(wpos, 1.0);
  sc.xyz /= sc.w;
  if(sc.x<0.0||sc.x>1.0||sc.y<0.0||sc.y>1.0||sc.z>1.0) return 1.0;
  float bias = max(0.0016, 0.004*(1.0-ndl));
  float s = 0.0;
  for(int i=-1;i<=1;i++)for(int j=-1;j<=1;j++){
    float d = texture(uShadowMap, sc.xy + vec2(float(i),float(j))*(1.4/2048.0)).r;
    s += (sc.z - bias > d) ? 0.0 : 1.0;
  }
  return s/9.0;
}
void main(){
  vec4 tex = texture(uAtlas, vUVL);
  if(tex.a < 0.35 && uAlphaTest > 0.25) discard;
  vec3 alb = tex.rgb * vCol;
  int fl = int(vFlag + 0.5);
  float emis = ((fl & 1) != 0 || vLit.y > 1.05) ? 1.0 : 0.0;
  vec3 dx = dFdx(vWorld), dy = dFdy(vWorld);
  vec3 N = normalize(cross(dx, dy));
  bool waterFace = (fl & 4) != 0;
  if(waterFace && N.y < 0.0) N = -N;
  float ndl = max(dot(N, uSunDir), 0.0);
  float sh = shadowSample(vWorld, ndl);
  float sky = clamp(vLit.x, 0.0, 1.0);
  float blk = clamp(vLit.y, 0.0, 1.0);
  vec3 torchDyn = vec3(0.0);
  for(int i=0;i<24;i++){
    if(i >= uNumLights) break;
    vec3 dv = vWorld - uLights[i].xyz;
    float rr = uLights[i].w;
    float att = clamp(1.0 - length(dv)/rr, 0.0, 1.0);
    torchDyn += uLightCols[i] * att*att*1.6;
  }
  float torch = max(blk*blk*1.45, emis*1.15);
  torch = max(torch, min(max(max(torchDyn.r,torchDyn.g),torchDyn.b), 1.3));
  vec3 amb = uSkyAmb * (0.34 + 0.66*sky);
  vec3 sun = uSunCol * ndl * sh * mix(0.55, 1.0, sky) * 1.12;
  vec3 torchL = vec3(1.28, 0.93, 0.55) * torch;
  vec3 col = alb * (amb + sun + torchL);
  if(emis > 0.5){ col += alb*0.65; col += vec3(1.0,0.75,0.42)*0.22; }
  col += torchDyn * alb * 0.6;
  if(waterFace){ col *= vec3(0.80,0.94,1.14); }
  float dist = length(vWorld - uCamPos);
  float fog = 1.0 - exp(-dist*uFogDen*dist*uFogDen);
  col = mix(col, uFogCol, clamp(fog,0.0,1.0));
  fragColor = vec4(col, tex.a);
}`;

const SKY_VS = `
precision highp float;
in vec3 position;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
out vec3 vDir;
void main(){
  vDir = position;
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w * 0.99999;
}`;

const SKY_FS = `
precision highp float;
out vec4 fragColor;
in vec3 vDir;
uniform vec3 uSunDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunTint;
uniform vec3 uGroundCol;
uniform float uNight;
uniform float uTime;
uniform float uWet;
float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float vnoise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  f=f*f*(3.0-2.0*f);
  return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);
}
float fbm(vec2 p){
  float s=0.0,a=0.5;
  for(int i=0;i<5;i++){ s+=a*vnoise(p); p*=2.17; a*=0.5; }
  return s;
}
void main(){
  vec3 d = normalize(vDir);
  float up = clamp(d.y,-1.0,1.0);
  vec3 col = mix(uHorizon, uZenith, pow(clamp(up,0.0,1.0), 0.58));
  if(up < 0.0) col = mix(uHorizon, uGroundCol, clamp(-up*3.5,0.0,1.0));
  float sd = dot(d, uSunDir);
  col += uSunTint * pow(max(sd,0.0), 5.0) * 0.30;
  col += uSunTint * pow(max(sd,0.0), 60.0) * 0.50;
  float sunD = smoothstep(0.99930, 0.99976, sd);
  col = mix(col, vec3(2.8,2.4,1.8), sunD);
  vec3 md = -uSunDir;
  float mdot = dot(d, md);
  float moonD = smoothstep(0.99952, 0.99986, mdot);
  float crater = fbm(d.xy*160.0+7.0);
  col = mix(col, vec3(0.84,0.87,0.95)*(0.72+crater*0.38), moonD*uNight);
  col += vec3(0.40,0.46,0.62)*pow(max(mdot,0.0),90.0)*0.20*uNight;
  if(up > 0.05){
    vec3 dd = d/(d.y+0.35);
    vec2 sp = dd.xz*26.0;
    vec2 cell = floor(sp);
    float star = hash21(cell);
    float tw = 0.55+0.45*sin(uTime*(1.5+star*2.0)+star*61.0);
    float st = step(0.9968, star)*tw*uNight*smoothstep(0.05,0.30,up);
    vec2 f2 = fract(sp)-0.5;
    st *= smoothstep(0.32,0.05,length(f2));
    col += vec3(0.9,0.95,1.1)*st*1.5;
  }
  float clF = smoothstep(0.03,0.16,d.y);
  if(clF>0.001){
    vec2 cp = d.xz/d.y * 36.0 + vec2(uTime*1.5, uTime*0.55);
    float cl = fbm(cp*0.085);
    cl = smoothstep(0.54-uWet*0.16, 0.78-uWet*0.10, cl);
    float silver = clamp(sd*0.5+0.5,0.0,1.0);
    vec3 cloudCol = mix(vec3(0.30,0.33,0.44)*(1.0-uNight*0.70), vec3(1.06,1.0,0.94), 0.35+silver*0.5);
    cloudCol = mix(cloudCol, vec3(0.62,0.64,0.70), uWet*0.7*(1.0-silver));
    cloudCol += uSunTint*pow(max(sd,0.0),10.0)*0.4;
    col = mix(col, cloudCol, cl*clF*(1.0-uNight*0.30));
  }
  fragColor = vec4(col, 1.0);
}`;

const QUAD_VS = `
precision highp float;
in vec3 position;
in vec2 uv;
out vec2 vUV;
void main(){ vUV=uv; gl_Position=vec4(position.xy,0.0,1.0); }`;

const COPY_FS = `
precision highp float;
out vec4 fragColor;
in vec2 vUV;

uniform sampler2D uTex;
void main(){ fragColor = texture(uTex, vUV); }`;

const BRIGHT_FS = `
precision highp float;
out vec4 fragColor;
in vec2 vUV;

uniform sampler2D uTex;
void main(){
  vec3 c = texture(uTex, vUV).rgb;
  float l = max(max(c.r,c.g),c.b);
  float k = max(0.0, l - 0.72);
  fragColor = vec4(c * k * 2.6, 1.0);
}`;

const BLUR_FS = `
precision highp float;
out vec4 fragColor;
in vec2 vUV;

uniform sampler2D uTex;
uniform vec2 uDir;
void main(){
  vec3 s = texture(uTex,vUV).rgb * 0.227;
  s += texture(uTex, vUV+uDir*1.384).rgb * 0.316;
  s += texture(uTex, vUV-uDir*1.384).rgb * 0.316;
  s += texture(uTex, vUV+uDir*3.230).rgb * 0.070;
  s += texture(uTex, vUV-uDir*3.230).rgb * 0.070;
  fragColor = vec4(s,1.0);
}`;

const COMPOSITE_FS = `
precision highp float;
out vec4 fragColor;
in vec2 vUV;

uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uExposure;
uniform float uUnderwater;
uniform float uHurtFlash;
uniform float uTime;
vec3 aces(vec3 x){
  return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0);
}
void main(){
  vec2 uv=vUV;
  if(uUnderwater>0.5){
    uv.x += sin(uv.y*24.0+uTime*2.2)*0.0024;
    uv.y += cos(uv.x*19.0+uTime*1.7)*0.0020;
  }
  vec3 c = texture(uScene,uv).rgb;
  c += texture(uBloom,uv).rgb * 0.90;
  c *= uExposure;
  if(uUnderwater>0.5) c = mix(c, c*vec3(0.40,0.70,1.16)+vec3(0.0,0.02,0.07), 0.60);
  c = aces(c);
  float lum=dot(c,vec3(0.299,0.587,0.114));
  c = mix(vec3(lum),c,1.09);
  c = pow(c, vec3(0.94));
  vec2 q=vUV-0.5;
  float vig=1.0-dot(q,q)*0.85;
  c*=clamp(vig,0.0,1.0);
  c=mix(c,vec3(0.68,0.04,0.04),uHurtFlash*clamp(dot(q,q)*3.2-0.4,0.0,0.8));
  fragColor=vec4(c,1.0);
}`;

export class Renderer {
  constructor(canvas, settings){
    this.canvas=canvas;
    this.settings=settings;
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(settings.fov||75,innerWidth/innerHeight,0.08,900);
    this.shadowSize=settings.shadows?2048:1024;
    this.timeS=0;
    this._initAtlas();
    this._initTargets();
    this._initMaterials();
    this._initHelpers();
    this.stats={meshesBuilt:0};
    window.addEventListener('resize',()=>this.resize());
  }

  _initAtlas(){
    const {data,count}=buildAtlasData();
    const tex=new THREE.DataArrayTexture(data,16,16,count);
    tex.format=THREE.RGBAFormat;
    tex.type=THREE.UnsignedByteType;
    tex.magFilter=THREE.NearestFilter;
    tex.minFilter=THREE.NearestMipmapLinearFilter;
    tex.generateMipmaps=true;
    tex.wrapS=tex.wrapT=THREE.ClampToEdgeWrapping;
    tex.colorSpace=THREE.SRGBColorSpace;
    tex.needsUpdate=true;
    this.atlas=tex;
  }

  _size(){
    const pr=Math.min(devicePixelRatio||1,this.settings.resScale||1);
    return {w:Math.max(8,Math.floor(innerWidth*pr)),h:Math.max(8,Math.floor(innerHeight*pr))};
  }

  _initTargets(){
    const sz=this._size();
    const mk=(w,h)=>new THREE.WebGLRenderTarget(w,h,{type:THREE.HalfFloatType});
    this.rtScene=mk(sz.w,sz.h);
    this.rtScene.depthTexture=new THREE.DepthTexture(sz.w,sz.h);
    this.rtScene.depthTexture.type=THREE.UnsignedIntType;
    this.rtCopy=mk(sz.w,sz.h);
    this.shadowRT=new THREE.WebGLRenderTarget(this.shadowSize,this.shadowSize,{});
    this.shadowRT.depthTexture=new THREE.DepthTexture(this.shadowSize,this.shadowSize);
    this.shadowRT.depthTexture.format=THREE.DepthFormat;
    this.shadowRT.depthTexture.type=THREE.UnsignedIntType;
    const bw=Math.max(2,sz.w>>2),bh=Math.max(2,sz.h>>2);
    this.bloomA=mk(bw,bh);
    this.bloomB=mk(bw,bh);
    this.quadGeo=new THREE.PlaneGeometry(2,2);
    this._quadScene=new THREE.Scene();
    this._quad=new THREE.Mesh(this.quadGeo,null);
    this._quad.frustumCulled=false;
    this._quadScene.add(this._quad);
    this._quadCam=new THREE.Camera();
    this.resize();
  }

  resize(){
    const sz=this._size();
    this.renderer.setSize(innerWidth,innerHeight,false);
    this.camera.aspect=innerWidth/innerHeight;
    this.camera.updateProjectionMatrix();
    this.rtScene.setSize(sz.w,sz.h);
    this.rtCopy.setSize(sz.w,sz.h);
    const bw=Math.max(2,sz.w>>2),bh=Math.max(2,sz.h>>2);
    this.bloomA.setSize(bw,bh);
    this.bloomB.setSize(bw,bh);
  }

  U(extra){ return Object.assign({
    uTime:{value:0},
    uWaveAmp:{value:1},
    uAtlas:{value:this.atlas},
    uCamPos:{value:new THREE.Vector3()},
    uSunDir:{value:new THREE.Vector3(0,1,0)},
    uSunCol:{value:new THREE.Color(1,0.98,0.9)},
    uSkyAmb:{value:new THREE.Color(0.45,0.52,0.62)},
    uFogCol:{value:new THREE.Color(0.68,0.78,0.9)},
    uFogDen:{value:0.0006},
    uAlphaTest:{value:0},
    uLights:{value:Array.from({length:24},()=>new THREE.Vector4())},
    uLightCols:{value:Array.from({length:24},()=>new THREE.Vector3())},
    uNumLights:{value:0},
    uShadowMap:{value:null},
    uShadowVP:{value:new THREE.Matrix4()},
    uShadowOn:{value:0}
  },extra); }

  _initMaterials(){
    const base=this.U({});
    this.shared=base;
    const mkChunk=(alphaTest,transparent)=>{
      return new THREE.RawShaderMaterial({
        glslVersion:THREE.GLSL3,
        vertexShader:CHUNK_VS,fragmentShader:CHUNK_FS,
        uniforms:Object.assign({},base,{uAlphaTest:{value:alphaTest}}),
        transparent,
        depthWrite:!transparent,
        lights:false
      });
    };
    this.matSolid=mkChunk(0,false);
    this.matCutout=mkChunk(0.5,false);
    this.matTrans=mkChunk(0,true);
    this.skyMat=new THREE.RawShaderMaterial({
      glslVersion:THREE.GLSL3,
      vertexShader:SKY_VS,fragmentShader:SKY_FS,
      uniforms:{
        uSunDir:{value:new THREE.Vector3(0,1,0)},
        uZenith:{value:new THREE.Color(0.22,0.44,0.86)},
        uHorizon:{value:new THREE.Color(0.72,0.82,0.95)},
        uSunTint:{value:new THREE.Color(1.0,0.62,0.32)},
        uGroundCol:{value:new THREE.Color(0.16,0.17,0.2)},
        uNight:{value:0},
        uTime:{value:0},
        uWet:{value:0}
      },
      side:THREE.BackSide,depthWrite:false,lights:false
    });
    this.sky=new THREE.Mesh(new THREE.SphereGeometry(700,28,18),this.skyMat);
    this.sky.frustumCulled=false;
    this.sky.renderOrder=-1000;
    this.scene.add(this.sky);

    const mkPass=(fs,uni)=>new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:QUAD_VS,fragmentShader:fs,uniforms:uni,depthTest:false,depthWrite:false});
    this.copyMat=mkPass(COPY_FS,{uTex:{value:null}});
    this.brightMat=mkPass(BRIGHT_FS,{uTex:{value:null}});
    this.blurMat=mkPass(BLUR_FS,{uTex:{value:null},uDir:{value:new THREE.Vector2()}});
    this.compositeMat=mkPass(COMPOSITE_FS,{
      uScene:{value:null},uBloom:{value:null},
      uExposure:{value:1.05},uUnderwater:{value:0},uHurtFlash:{value:0},uTime:{value:0}
    });

    this.shadowCam=new THREE.OrthographicCamera(-52,52,52,-52,1,340);

    this.matDepth=new THREE.RawShaderMaterial({
      glslVersion:THREE.GLSL3,
      vertexShader:`
        precision highp float;
        in vec3 position;
        uniform mat4 modelViewMatrix; uniform mat4 projectionMatrix;
        void main(){ gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader:`precision mediump float; out vec4 o; void main(){ o=vec4(1.0); }`,
      lights:false
    });
  }

  entityMaterial(){
    return new THREE.RawShaderMaterial({
      glslVersion:THREE.GLSL3,
      vertexShader:`
        precision highp float;
        in vec3 position; in vec3 aCol;
        uniform mat4 modelMatrix; uniform mat4 viewMatrix; uniform mat4 projectionMatrix;
        out vec3 vCol; out vec3 vWorld;
        void main(){
          vec4 wp=modelMatrix*vec4(position,1.0);
          vWorld=wp.xyz; vCol=aCol;
          gl_Position=projectionMatrix*viewMatrix*wp;
        }`,
      fragmentShader:`
        precision highp float;
        in vec3 vCol; in vec3 vWorld;
        out vec4 fragColor;
        uniform vec3 uCamPos; uniform vec3 uFogCol; uniform float uFogDen;
        uniform vec3 uSunDir; uniform float uLightMul;
                void main(){
          vec3 dx=dFdx(vWorld),dy=dFdy(vWorld);
          vec3 N=normalize(cross(dx,dy));
          float l=(0.52+0.48*max(dot(N,uSunDir),0.0))*uLightMul;
          vec3 c=vCol*l;
          float dist=length(vWorld-uCamPos);
          float fog=1.0-exp(-dist*uFogDen*dist*uFogDen);
          c=mix(c,uFogCol,clamp(fog,0.0,1.0));
          fragColor=vec4(c,1.0);
        }`,
      uniforms:{
        uCamPos:this.shared.uCamPos,
        uFogCol:this.shared.uFogCol,
        uFogDen:this.shared.uFogDen,
        uSunDir:this.shared.uSunDir,
        uLightMul:{value:1}
      },
      lights:false
    });
  }

  _initHelpers(){
    const box=new THREE.BoxGeometry(1.002,1.002,1.002);
    this.outline=new THREE.LineSegments(new THREE.EdgesGeometry(box),
      new THREE.LineBasicMaterial({color:0x000000,transparent:true,opacity:0.6}));
    this.outline.visible=false;
    this.outline.renderOrder=2000;
    this.scene.add(this.outline);

    const cv=document.createElement('canvas');
    cv.width=64;cv.height=16;
    const cx=cv.getContext('2d');
    const rng=(s)=>{let a=s;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};};
    for(let s=0;s<4;s++){
      const r=rng(77+s*13);
      const cracks=2+s*2;
      for(let c=0;c<cracks;c++){
        let x=8+((r()*8-4)|0),y=8+((r()*8-4)|0);
        for(let k=0;k<4+s*3;k++){
          cx.fillStyle=`rgba(15,12,10,${0.5+s*0.11})`;
          cx.fillRect(s*16+(((x%16)+16)%16),(((y%16)+16)%16),1,1);
          x+=r()<0.5?1:-1;y+=r()<0.6?1:-1;
        }
      }
    }
    this.crackTex=new THREE.CanvasTexture(cv);
    this.crackTex.magFilter=THREE.NearestFilter;
    this.crackTex.repeat.set(0.25,1);
    this.crackMesh=new THREE.Mesh(new THREE.BoxGeometry(1.004,1.004,1.004),
      new THREE.MeshBasicMaterial({map:this.crackTex,transparent:true,depthWrite:false}));
    this.crackMesh.visible=false;
    this.crackMesh.renderOrder=1500;
    this.scene.add(this.crackMesh);
  }

  setCrackStage(stage){
    this.crackTex.offset.x=Math.min(3,stage)*0.25;
  }

  blockPreviewGeometry(id){
    const def=BLOCKS[id];
    const g=new THREE.BufferGeometry();
    const tileOf=(fi)=>{
      if(def.tex.all)return TILE_INDEX[def.tex.all];
      if(fi===2)return TILE_INDEX[(def.tex.top||def.tex.all)];
      if(fi===3)return TILE_INDEX[(def.tex.bottom||def.tex.top||def.tex.side||def.tex.all)];
      return TILE_INDEX[(def.tex.side||def.tex.front||def.tex.all)];
    };
    const faces=[
      [[1,0,1],[1,0,0],[1,1,0],[1,1,1]],
      [[0,0,0],[0,0,1],[0,1,1],[0,1,0]],
      [[0,1,1],[1,1,1],[1,1,0],[0,1,0]],
      [[0,0,0],[1,0,0],[1,0,1],[0,0,1]],
      [[0,0,1],[1,0,1],[1,1,1],[0,1,1]],
      [[1,0,0],[0,0,0],[0,1,0],[1,1,0]]
    ];
    const shade=[0.82,0.82,1.0,0.6,0.7,0.7];
    const pos=[],uvl=[],col=[],lit=[],flag=[],idx=[];
    let vi=0;
    for(let fi=0;fi<6;fi++){
      const t=tileOf(fi);
      const s=shade[fi];
      for(let ci=0;ci<4;ci++){
        const p=faces[fi][ci];
        pos.push(p[0]-0.5,p[1]-0.5,p[2]-0.5);
        uvl.push((ci===1||ci===2)?1:0,(ci>=2)?1:0,t);
        col.push(s,s,s);
        lit.push(fi===2?0.92:0.74,0.1);
        flag.push(0);
      }
      idx.push(vi,vi+1,vi+2,vi,vi+2,vi+3);
      vi+=4;
    }
    g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    g.setAttribute('aUVL',new THREE.Float32BufferAttribute(uvl,3));
    g.setAttribute('aCol',new THREE.Float32BufferAttribute(col,3));
    g.setAttribute('aLit',new THREE.Float32BufferAttribute(lit,2));
    g.setAttribute('aFlag',new THREE.Float32BufferAttribute(flag,1));
    g.setIndex(idx);
    return g;
  }

  spriteMaterial(iconCanvas){
    const t=new THREE.CanvasTexture(iconCanvas);
    t.magFilter=THREE.NearestFilter;
    t.colorSpace=THREE.SRGBColorSpace;
    return new THREE.RawShaderMaterial({
      glslVersion:THREE.GLSL3,
      vertexShader:`
        precision highp float;
        in vec3 position; in vec2 uv;
        uniform mat4 modelMatrix; uniform mat4 viewMatrix; uniform mat4 projectionMatrix;
        out vec2 vUV; out vec3 vWorld;
        void main(){ vUV=uv; vec4 wp=modelMatrix*vec4(position,1.0); vWorld=wp.xyz;
          gl_Position=projectionMatrix*viewMatrix*wp; }`,
      fragmentShader:`
        precision highp float;
        in vec2 vUV; in vec3 vWorld;
        out vec4 fragColor;
        uniform sampler2D uTex;
        uniform vec3 uCamPos; uniform vec3 uFogCol; uniform float uFogDen;
                void main(){
          vec4 c=texture(uTex,vUV);
          if(c.a<0.4)discard;
          float dist=length(vWorld-uCamPos);
          float fog=1.0-exp(-dist*uFogDen*dist*uFogDen);
          vec3 col=mix(c.rgb,uFogCol,clamp(fog,0.0,1.0));
          fragColor=vec4(col,c.a);
        }`,
      uniforms:{
        uTex:{value:t},
        uCamPos:this.shared.uCamPos,
        uFogCol:this.shared.uFogCol,
        uFogDen:this.shared.uFogDen
      },
      side:THREE.DoubleSide,
      lights:false
    });
  }

  attachWorld(world){
    this.world=world;
    world.onUnloadMesh=(c)=>this.disposeMesh(c);
  }

  buildChunk(chunk){
    const m=buildChunkMesh(this.world,chunk);
    const bx=chunk.cx<<4,bz=chunk.cz<<4;
    if(!chunk.meshObj)chunk.meshObj={solid:null,trans:null};
    const mk=(arr,idxArr,cutoutHint)=>{
      if(idxArr.length===0)return null;
      const n=arr.length/12;
      const pos=new Float32Array(n*3),uvl=new Float32Array(n*3),col=new Float32Array(n*3),lit=new Float32Array(n*2),fl=new Float32Array(n);
      let cutout=false;
      for(let i=0;i<n;i++){
        pos[i*3]=arr[i*12]+bx;
        pos[i*3+1]=arr[i*12+1];
        pos[i*3+2]=arr[i*12+2]+bz;
        uvl[i*3]=arr[i*12+3];uvl[i*3+1]=arr[i*12+4];uvl[i*3+2]=arr[i*12+5];
        col[i*3]=arr[i*12+6];col[i*3+1]=arr[i*12+7];col[i*3+2]=arr[i*12+8];
        lit[i*2]=arr[i*12+9];lit[i*2+1]=arr[i*12+10];
        fl[i]=arr[i*12+11];
        if(cutoutHint&&!cutout&&fl[i]!==0)cutout=true;
      }
      const g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.BufferAttribute(pos,3));
      g.setAttribute('aUVL',new THREE.BufferAttribute(uvl,3));
      g.setAttribute('aCol',new THREE.BufferAttribute(col,3));
      g.setAttribute('aLit',new THREE.BufferAttribute(lit,2));
      g.setAttribute('aFlag',new THREE.BufferAttribute(fl,1));
      g.setIndex(new THREE.BufferAttribute(idxArr,1));
      g.computeBoundingSphere();
      return new THREE.Mesh(g,this.matSolid);
    };
    if(chunk.meshObj.solid){this.scene.remove(chunk.meshObj.solid);chunk.meshObj.solid.geometry.dispose();}
    if(chunk.meshObj.trans){this.scene.remove(chunk.meshObj.trans);chunk.meshObj.trans.geometry.dispose();}
    chunk.meshObj.solid=null;chunk.meshObj.trans=null;
    chunk.meshObj.solid=mk(m.solid,m.solidIdx,true);
    if(chunk.meshObj.solid)this.scene.add(chunk.meshObj.solid);
    chunk.meshObj.trans=mk(m.trans,m.transIdx,false);
    if(chunk.meshObj.trans){chunk.meshObj.trans.material=this.matTrans;chunk.meshObj.trans.renderOrder=10;this.scene.add(chunk.meshObj.trans);}
    chunk.dirty=false;chunk.dirtyMesh=false;
    chunk.mesh=true;
    this.stats.meshesBuilt++;
  }

  disposeMesh(chunk){
    chunk.dirtyMesh=true;
    if(chunk.meshObj){
      if(chunk.meshObj.solid){this.scene.remove(chunk.meshObj.solid);chunk.meshObj.solid.geometry.dispose();chunk.meshObj.solid=null;}
      if(chunk.meshObj.trans){this.scene.remove(chunk.meshObj.trans);chunk.meshObj.trans.geometry.dispose();chunk.meshObj.trans=null;}
    }
    chunk.mesh=null;
  }

  envUpdate(game){
    const w=game.world;
    const t=w.time;
    const ang=(t-0.25)*Math.PI*2;
    const elev=Math.sin(ang);
    const sun=new THREE.Vector3(Math.cos(ang)*0.62,elev,0.4).normalize();
    this.skyMat.uniforms.uSunDir.value.copy(sun);
    this.shared.uSunDir.value.copy(sun);
    const day=Math.max(0,Math.min(1,(elev+0.08)/0.22));
    const dusk=Math.max(0,1-Math.abs(elev)/0.20);
    const night=1-day;
    const wet=w.weather.rain;
    const zen=new THREE.Color().setRGB(
      Math.min(1,0.028+day*0.19-dusk*0.02-wet*0.02),
      Math.min(1,0.045+day*0.36-dusk*0.05-wet*0.03),
      Math.min(1,0.10+day*0.72-dusk*0.10-wet*0.05));
    const hor=new THREE.Color().setRGB(
      Math.min(1,0.05+day*0.60+dusk*0.28-wet*0.15),
      Math.min(1,0.07+day*0.68+dusk*0.02-wet*0.17),
      Math.min(1,0.14+day*0.78-dusk*0.20-wet*0.16));
    const sunTint=new THREE.Color().setRGB(
      1.0,
      0.50+dusk*0.18+day*0.30,
      0.22+dusk*0.12+day*0.48);
    this.skyMat.uniforms.uZenith.value.copy(zen);
    this.skyMat.uniforms.uHorizon.value.copy(hor);
    this.skyMat.uniforms.uSunTint.value.copy(sunTint);
    this.skyMat.uniforms.uNight.value=night;
    this.skyMat.uniforms.uWet.value=wet;
    this.skyMat.uniforms.uTime.value=this.timeS;
    this.shared.uSunCol.value.setRGB(
      day*(1-wet*0.55)+0.02,
      day*(0.97-dusk*0.1)*(1-wet*0.55)+0.02,
      day*(0.85-dusk*0.25)*(1-wet*0.5)+0.045);
    this.shared.uSkyAmb.value.setRGB(
      0.10+day*0.42*(1-wet*0.3),
      0.115+day*0.47*(1-wet*0.3),
      0.19+day*0.50*(1-wet*0.3));
    const rd=this.settings.renderDist;
    let den=1.35/(rd*CHUNK);
    if(wet>0)den*=1.55;
    this.shared.uFogDen.value=den;
    this.shared.uFogCol.value.copy(hor).lerp(zen,0.22);
    this.compositeMat.uniforms.uExposure.value=1.04+night*0.22+wet*-0.08;
  }

  dynamicUpdate(camPos,underwater,hurtFlash){
    this.shared.uCamPos.value.copy(camPos);
    if(underwater){
      this.shared.uFogCol.value.lerp(new THREE.Color(0.045,0.20,0.34),0.88);
      this.shared.uFogDen.value=Math.max(this.shared.uFogDen.value,0.10);
    }
    this.compositeMat.uniforms.uUnderwater.value=underwater?1:0;
    this.compositeMat.uniforms.uHurtFlash.value=hurtFlash;
    this.compositeMat.uniforms.uTime.value=this.timeS;
    this.shared.uTime.value=this.timeS;
  }

  updateLights(world,camPos){
    const ls=world.collectLights(camPos.x,camPos.y,camPos.z,24);
    const arr=this.shared.uLights.value;
    const cols=this.shared.uLightCols.value;
    for(let i=0;i<24;i++){
      if(i<ls.length){
        arr[i].set(ls[i].x,ls[i].y,ls[i].z,ls[i].em>=14?13:9);
        const e=ls[i].em/15;
        cols[i].set(e,e*0.80,e*0.58);
      } else {
        arr[i].set(0,-999,0,0);
        cols[i].set(0,0,0);
      }
    }
    this.shared.uNumLights.value=ls.length;
  }

  renderShadow(game){
    const elev=game.world.sunElev();
    if(elev<=0.04||!this.settings.shadows){
      this.shared.uShadowOn.value=0;
      return;
    }
    const p=game.camera?game.camera.position:(game.player?game.player.pos:{x:0,y:60,z:0});
    const snap=8;
    const px=Math.round(p.x/snap)*snap,pz=Math.round(p.z/snap)*snap;
    const dir=this.shared.uSunDir.value;
    const cx=px-dir.x*130,cy=p.y+120,cz=pz-dir.z*130;
    this.shadowCam.position.set(cx,cy,cz);
    this.shadowCam.lookAt(px,p.y,pz);
    this.shadowCam.updateProjectionMatrix();
    this.shadowCam.updateMatrixWorld(true);
    const sky=this.sky,crk=this.crackMesh,outl=this.outline;
    sky.visible=false;crk.visible=false;outl.visible=false;
    let hiddenE=[];
    for(const o of this.scene.children){
      if(o!==sky&&o!==crk&&o!==outl&&(o.isPoints||(o.isLineSegments))){
        if(o.visible){o.visible=false;hiddenE.push(o);}
      }
    }
    this.renderer.setRenderTarget(this.shadowRT);
    this.renderer.clear(true,true,false);
    this.scene.overrideMaterial=this.matDepth;
    this.renderer.render(this.scene,this.shadowCam);
    this.scene.overrideMaterial=null;
    sky.visible=true;
    for(const o of hiddenE)o.visible=true;
    this.shared.uShadowOn.value=1;
    this.shared.uShadowVP.value.multiplyMatrices(this.shadowCam.projectionMatrix,this.shadowCam.matrixWorldInverse);
    this.shared.uShadowMap.value=this.shadowRT.depthTexture;
  }

  renderFrame(game){
    this.envUpdate(game);
    const uw=!!game.underwater;
    this.dynamicUpdate(game.camera.position,uw,game.hurtFlash||0);
    this.updateLights(game.world,game.camera.position);
    this.sky.position.copy(game.camera.position);
    this.renderShadow(game);
    const r=this.renderer;
    r.setRenderTarget(this.rtScene);
    r.clear(true,true,false);
    r.render(this.scene,this.camera);
    this.blit(this.rtScene.texture,this.rtCopy,this.copyMat);
    this.blit(this.rtCopy.texture,this.bloomA,this.brightMat);
    const bw=this.bloomA.width,bh=this.bloomA.height;
    this.blurMat.uniforms.uDir.value.set(1.5/bw,0);
    this.blit(this.bloomA.texture,this.bloomB,this.blurMat);
    this.blurMat.uniforms.uDir.value.set(0,1.5/bh);
    this.blit(this.bloomB.texture,this.bloomA,this.blurMat);
    this.compositeMat.uniforms.uScene.value=this.rtScene.texture;
    this.compositeMat.uniforms.uBloom.value=this.bloomA.texture;
    this.blit(null,null,this.compositeMat);
  }

  blit(src,dst,mat){
    const r=this.renderer;
    r.setRenderTarget(dst);
    if(mat.uniforms&&mat.uniforms.uTex&&src)mat.uniforms.uTex.value=src;
    this._quad.material=mat;
    r.render(this._quadScene,this._quadCam);
  }
}

export function isEyeInWater(game){
  const e=game.player.eyePos();
  return game.world.getBlock(Math.floor(e.x),Math.floor(e.y),Math.floor(e.z))===B.WATER;
}
