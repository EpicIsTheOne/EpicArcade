// Seeded noise + hashes. Shared by main thread and workers.
export function mulberry32(a){
  return function(){
    a|=0;a=a+0x6D2B79F5|0;
    let t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return ((t^t>>>14)>>>0)/4294967296;
  };
}
export function hashStr(s){
  let h=2166136261;
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
  return h>>>0;
}
export function hash2(seed,x,z){
  let h=seed^Math.imul(x|0,374761393)^Math.imul(z|0,668265263);
  h=Math.imul(h^(h>>>13),1274126177);
  return ((h^(h>>>16))>>>0)/4294967296;
}

const fade=t=>t*t*t*(t*(t*6-15)+10);
const lerp=(a,b,t)=>a+t*(b-a);

export class Perlin{
  constructor(seed){
    const rng=mulberry32((seed|0)>>>0);
    const p=new Uint8Array(256);
    for(let i=0;i<256;i++)p[i]=i;
    for(let i=255;i>0;i--){const j=(rng()*(i+1))|0;const t=p[i];p[i]=p[j];p[j]=t;}
    this.p=new Uint8Array(512);
    for(let i=0;i<512;i++)this.p[i]=p[i&255];
    this.gx=new Float32Array(256);this.gy=new Float32Array(256);this.gz=new Float32Array(256);
    for(let i=0;i<256;i++){
      const th=rng()*Math.PI*2,z=rng()*2-1,s=Math.sqrt(1-z*z);
      this.gx[i]=s*Math.cos(th);this.gy[i]=s*Math.sin(th);this.gz[i]=z;
    }
  }
  grad2(h,x,y){return this.gx[h&255]*x+this.gy[(h+157)&255]*y;}
  grad3(h,x,y,z){const i=h&255;return this.gx[i]*x+this.gy[i]*y+this.gz[i]*z;}
  perlin2(x,y){
    const X=Math.floor(x),Y=Math.floor(y);
    x-=X;y-=Y;
    const xi=X&255,yi=Y&255,p=this.p;
    const aa=p[p[xi]+yi],ab=p[p[xi]+yi+1],ba=p[p[xi+1]+yi],bb=p[p[xi+1]+yi+1];
    const u=fade(x),v=fade(y);
    return lerp(
      lerp(this.grad2(aa,x,y),this.grad2(ba,x-1,y),u),
      lerp(this.grad2(ab,x,y-1),this.grad2(bb,x-1,y-1),u),v)*1.42;
  }
  perlin3(x,y,z){
    const X=Math.floor(x),Y=Math.floor(y),Z=Math.floor(z);
    x-=X;y-=Y;z-=Z;
    const xi=X&255,yi=Y&255,zi=Z&255,p=this.p;
    const A=p[xi]+yi,AA=p[A]+zi,AB=p[A+1]+zi,B=p[xi+1]+yi,BA=p[B]+zi,BB=p[B+1]+zi;
    const u=fade(x),v=fade(y),w=fade(z);
    return lerp(
      lerp(lerp(this.grad3(p[AA],x,y,z),this.grad3(p[BA],x-1,y,z),u),
           lerp(this.grad3(p[AB],x,y-1,z),this.grad3(p[BB],x-1,y-1,z),u),v),
      lerp(lerp(this.grad3(p[AA+1],x,y,z-1),this.grad3(p[BA+1],x-1,y,z-1),u),
           lerp(this.grad3(p[AB+1],x,y-1,z-1),this.grad3(p[BB+1],x-1,y-1,z-1),u),v),w);
  }
  fbm2(x,y,oct=4,lac=2,gain=0.5){
    let a=0.5,f=1,s=0,n=0;
    for(let i=0;i<oct;i++){s+=a*this.perlin2(x*f,y*f);n+=a;a*=gain;f*=lac;}
    return s/n;
  }
  fbm3(x,y,z,oct=3,lac=2,gain=0.5){
    let a=0.5,f=1,s=0,n=0;
    for(let i=0;i<oct;i++){s+=a*this.perlin3(x*f,y*f,z*f);n+=a;a*=gain;f*=lac;}
    return s/n;
  }
  ridge2(x,y,oct=4){
    let a=0.5,f=1,s=0,n=0;
    for(let i=0;i<oct;i++){const v=1-Math.abs(this.perlin2(x*f,y*f));s+=a*v*v;n+=a;a*=0.5;f*=2;}
    return s/n;
  }
}
export const Noise=Perlin;
