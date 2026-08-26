export const clamp=(x,a,b)=>x<a?a:x>b?b:x;
export const lerp=(a,b,t)=>a+(b-a)*t;
export const smoothstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
export const TAU=Math.PI*2;
export const DEG=Math.PI/180;

export function xmur3(str){
  let h=1779033703^str.length;
  for(let i=0;i<str.length;i++){
    h=Math.imul(h^str.charCodeAt(i),3432918353);
    h=h<<13|h>>>19;
  }
  return function(){
    h=Math.imul(h^(h>>>16),2246822507);
    h=Math.imul(h^(h>>>13),3266489909);
    return (h^=h>>>16)>>>0;
  };
}

export function mulberry32(a){
  return function(){
    a|=0;a=a+0x6D2B79F5|0;
    let t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return ((t^t>>>14)>>>0)/4294967296;
  };
}

export function hashStrToSeed(s){
  return xmur3(String(s))();
}

export function hash2(seed,x,z){
  let h=seed^Math.imul(x|0,374761393)^Math.imul(z|0,668265263);
  h=Math.imul(h^(h>>>13),1274126177);
  return ((h^(h>>>16))>>>0)/4294967296;
}

export function m4ident(){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);}

export function m4mul(a,b){
  const o=new Float32Array(16);
  for(let c=0;c<4;c++)for(let r=0;r<4;r++){
    o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
  }
  return o;
}

export function m4perspective(fovY,aspect,near,far){
  const f=1/Math.tan(fovY/2),nf=1/(near-far);
  const o=new Float32Array(16);
  o[0]=f/aspect;o[5]=f;o[10]=(far+near)*nf;o[11]=-1;o[14]=2*far*near*nf;
  return o;
}

export function m4ortho(l,r,b,t,n,f){
  const o=new Float32Array(16);
  o[0]=2/(r-l);o[5]=2/(t-b);o[10]=-2/(f-n);
  o[12]=-(r+l)/(r-l);o[13]=-(t+b)/(t-b);o[14]=-(f+n)/(f-n);o[15]=1;
  return o;
}

export function m4lookDir(eye,fx,fy,fz){
  let fl=Math.hypot(fx,fy,fz)||1;fx/=fl;fy/=fl;fz/=fl;
  let rx=-fz,ry=0,rz=fx;
  let rl=Math.hypot(rx,ry,rz)||1;rx/=rl;ry/=rl;rz/=rl;
  const ux=ry*fz-rz*fy,uy=rz*fx-rx*fz,uz=rx*fy-ry*fx;
  const o=new Float32Array(16);
  o[0]=rx;o[4]=ry;o[8]=rz;
  o[1]=ux;o[5]=uy;o[9]=uz;
  o[2]=-fx;o[6]=-fy;o[10]=-fz;
  o[12]=-(rx*eye[0]+ry*eye[1]+rz*eye[2]);
  o[13]=-(ux*eye[0]+uy*eye[1]+uz*eye[2]);
  o[14]=(fx*eye[0]+fy*eye[1]+fz*eye[2]);
  o[15]=1;
  return o;
}

export function m4compose(tx,ty,tz,rx,ry,rz,sx,sy,sz){
  const cx=Math.cos(rx),sx_=Math.sin(rx),cy=Math.cos(ry),sy_=Math.sin(ry),cz=Math.cos(rz),sz_=Math.sin(rz);
  const m00=cy*cz,m01=-cy*sz_,m02=sy_;
  const m10=cx*sz_+sx_*sy_*cz,m11=cx*cz-sx_*sy_*sz_,m12=-sx_*cy;
  const m20=sx_*sz_-cx*sy_*cz,m21=sx_*cz+cx*sy_*sz_,m22=cx*cy;
  return new Float32Array([
    m00*sx,m10*sx,m20*sx,0,
    m01*sy,m11*sy,m21*sy,0,
    m02*sz,m12*sz,m22*sz,0,
    tx,ty,tz,1
  ]);
}

export function m4invert(m){
  const o=new Float32Array(16);
  const a00=m[0],a01=m[1],a02=m[2],a03=m[3];
  const a10=m[4],a11=m[5],a12=m[6],a13=m[7];
  const a20=m[8],a21=m[9],a22=m[10],a23=m[11];
  const a30=m[12],a31=m[13],a32=m[14],a33=m[15];
  const b00=a00*a11-a01*a10,b01=a00*a12-a02*a10,b02=a00*a13-a03*a10;
  const b03=a01*a12-a02*a11,b04=a01*a13-a03*a11,b05=a02*a13-a03*a12;
  const b06=a20*a31-a21*a30,b07=a20*a32-a22*a30,b08=a20*a33-a23*a30;
  const b09=a21*a32-a22*a31,b10=a21*a33-a23*a31,b11=a22*a33-a23*a32;
  let det=b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;
  if(!det)return o;
  det=1/det;
  o[0]=(a11*b11-a12*b10+a13*b09)*det;
  o[1]=(a02*b10-a01*b11-a03*b09)*det;
  o[2]=(a31*b05-a32*b04+a33*b03)*det;
  o[3]=(a22*b04-a21*b05-a23*b03)*det;
  o[4]=(a12*b08-a10*b11-a13*b07)*det;
  o[5]=(a00*b11-a02*b08+a03*b07)*det;
  o[6]=(a32*b02-a30*b05-a33*b01)*det;
  o[7]=(a20*b05-a22*b02+a23*b01)*det;
  o[8]=(a10*b10-a11*b08+a13*b06)*det;
  o[9]=(a01*b08-a00*b10-a03*b06)*det;
  o[10]=(a30*b04-a31*b02+a33*b00)*det;
  o[11]=(a21*b02-a20*b04-a23*b00)*det;
  o[12]=(a11*b07-a10*b09-a12*b06)*det;
  o[13]=(a00*b09-a01*b07+a02*b06)*det;
  o[14]=(a31*b01-a30*b03-a32*b00)*det;
  o[15]=(a20*b03-a21*b01+a22*b00)*det;
  return o;
}

export function frustumPlanes(m){
  const p=[];
  const row=(r)=>[m[r],m[4+r],m[8+r],m[12+r]];
  const r0=row(0),r1=row(1),r2=row(2),r3=row(3);
  const add=(a,b,sign)=>{
    const pl=[a[0]+sign*b[0],a[1]+sign*b[1],a[2]+sign*b[2],a[3]+sign*b[3]];
    const l=Math.hypot(pl[0],pl[1],pl[2])||1;
    p.push([pl[0]/l,pl[1]/l,pl[2]/l,pl[3]/l]);
  };
  add(r3,r0,1);add(r3,r0,-1);
  add(r3,r1,1);add(r3,r1,-1);
  add(r3,r2,1);add(r3,r2,-1);
  return p;
}

export function aabbInFrustum(planes,x0,y0,z0,x1,y1,z1){
  for(const p of planes){
    const px=p[0]>0?x1:x0,py=p[1]>0?y1:y0,pz=p[2]>0?z1:z0;
    if(p[0]*px+p[1]*py+p[2]*pz+p[3]<0)return false;
  }
  return true;
}
