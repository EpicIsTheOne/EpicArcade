/* ============================================================
   Character Customizer — parametric layered-2D SVG renderer
   Pure functions: state -> svg string. No dependencies.
   ============================================================ */
'use strict';

/* ---------- color utils ---------- */
function hx(c){ const h=c.replace('#',''); return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; }
function toHex(r,g,b){ return '#'+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join(''); }
function mix(a,b,t){ const A=hx(a),B=hx(b); return toHex(A[0]+(B[0]-A[0])*t, A[1]+(B[1]-A[1])*t, A[2]+(B[2]-A[2])*t); }
function shade(c,t){ return t>=0 ? mix(c,'#ffffff',t) : mix(c,'#000000',-t); }
function f(n){ return Math.round(n*100)/100; }

/* quadratic bezier helpers */
function qPoint(p0,p1,p2,t){ const u=1-t; return [u*u*p0[0]+2*u*t*p1[0]+t*t*p2[0], u*u*p0[1]+2*u*t*p1[1]+t*t*p2[1]]; }
function qSlice(p0,p1,p2,t0,t1){
  const A=qPoint(p0,p1,p2,t0), C=qPoint(p0,p1,p2,t1), M=qPoint(p0,p1,p2,(t0+t1)/2);
  return [A,[2*M[0]-(A[0]+C[0])/2, 2*M[1]-(A[1]+C[1])/2], C];
}
function qPath(pts){ return 'M '+f(pts[0][0])+' '+f(pts[0][1])+' Q '+f(pts[1][0])+' '+f(pts[1][1])+' '+f(pts[2][0])+' '+f(pts[2][1]); }
function scaleX(x,b){ return 180+(x-180)*b; }
function scalePts(pts,b){ return pts.map(p=>[scaleX(p[0],b),p[1]]); }

/* ---------- palettes ---------- */
const SKINS = ['#ffe3cf','#fcd6b4','#f4bd90','#e09f74','#c98455','#a96a44','#875233','#5e3a24'];
const HAIR_COLORS = ['#332b38','#4a3226','#6f4a2f','#96683a','#b55a38','#dd7e40','#ecc76a','#f2e3c2','#b9c0cc','#9aa4e8','#e58fb1','#4f8fd9'];
const OUTFIT_COLORS = ['#e05c5c','#e8823c','#eec83c','#7fc74f','#3fbf9f','#4f9de0','#5c6fe0','#8a5ce0','#e05ca8','#f0f1f5','#3a3f4c','#7a4b2c'];
const EYE_COLORS = ['#5b3a24','#8a6430','#3f7d4c','#3f6fb5','#69758a','#8a5cd9'];

/* ---------- option tables ---------- */
const BUILDS = [
  {id:'slim',    name:'Slim',    w:0.90},
  {id:'regular', name:'Regular', w:1.00},
  {id:'sturdy',  name:'Sturdy',  w:1.12},
];

/* arm poses: shoulder ctrl(hand-side) hand — mirrored by sign */
const POSES = [
  {id:'relaxed', name:'Relaxed',      L:[[134,250],[122,298],[117,332]], R:[[226,250],[238,298],[243,332]]},
  {id:'wave',    name:'Waving hello', L:[[134,250],[122,298],[117,332]], R:[[226,250],[262,256],[272,192]]},
  {id:'hips',    name:'Hands on hips',L:[[134,250],[102,290],[140,310]], R:[[226,250],[258,290],[220,310]]},
];
function mirrorPose(p){ // build R from L for safety of symmetry
  p.R = p.L.map(pt=>[360-pt[0], pt[1]]);
}
POSES.forEach(mirrorPose);
// wave keeps an asymmetric raised right arm:
POSES[1].R = [[226,250],[262,256],[272,192]];

/* ---------- expressions ---------- */
function eyeOpen(x,y,s,eyeC,lid){
  let lidSvg='';
  if(lid==='half'){
    lidSvg = '<path d="M -13 -11 h26 v7 q-13 5 -26 0 z" fill="__SKIN__"/>'+
             '<path d="M -12 -5 q12 -5 24 0" fill="none" stroke="#2b2430" stroke-width="3" stroke-linecap="round"/>';
  }else if(lid==='low'){
    lidSvg = '<path d="M -13 -11 h26 v10 q-13 5 -26 0 z" fill="__SKIN__"/>'+
             '<path d="M -12 -2 q12 -5 24 0" fill="none" stroke="#2b2430" stroke-width="3" stroke-linecap="round"/>';
  }
  return '<g transform="translate('+f(x)+' '+f(y)+')">'+
    '<ellipse rx="'+f(11*s)+'" ry="'+f(13*s)+'" fill="#fdfdfd"/>'+
    '<circle r="'+f(6*s)+'" fill="'+eyeC+'"/>'+
    '<circle r="'+f(2.7*s)+'" cy="'+f(-0.5*s)+'" fill="#201c26"/>'+
    '<circle cx="'+f(-2.2*s)+'" cy="'+f(-3.6*s)+'" r="'+f(2*s)+'" fill="#ffffff" opacity=".95"/>'+
    (lid? '' : '<path d="M '+f(-11*s)+' '+f(-4*s)+' Q 0 '+f(-15*s)+' '+f(11*s)+' '+f(-4*s)+'" fill="none" stroke="#2b2430" stroke-width="3" stroke-linecap="round"/>')+
    lidSvg+'</g>';
}
function eyeClosedHappy(x,y){
  return '<g transform="translate('+f(x)+' '+f(y)+')"><path d="M -11 3 Q 0 -9 11 3" fill="none" stroke="#2b2430" stroke-width="3.5" stroke-linecap="round"/></g>';
}
function eyeClosedSleepy(x,y){
  return '<g transform="translate('+f(x)+' '+f(y)+')"><path d="M -11 -2 Q 0 7 11 -2" fill="none" stroke="#2b2430" stroke-width="3.5" stroke-linecap="round"/>'+
    '<path d="M 8 3 l 4 3 M 1 5 l 2 4" stroke="#2b2430" stroke-width="2" stroke-linecap="round"/></g>';
}

const EXPRESSIONS = [
  { id:'cheer', name:'Cheerful', blush:.45,
    brows:(c)=>'<path d="M 149 128 Q 157 121 168 125" />'+
               '<path d="M 211 128 Q 203 121 192 125" />',
    eyes:(c)=>eyeOpen(161,150,1,c.eyeC)+eyeOpen(199,150,1,c.eyeC),
    mouth:()=>'<path d="M 165 172 Q 180 186 195 172" fill="none" stroke="#8a3d46" stroke-width="3.6" stroke-linecap="round"/>' },
  { id:'neutral', name:'Neutral', blush:0,
    brows:(c)=>'<path d="M 150 126 Q 159 123 168 124" /><path d="M 210 126 Q 201 123 192 124" />',
    eyes:(c)=>eyeOpen(161,151,0.94,c.eyeC)+eyeOpen(199,151,0.94,c.eyeC),
    mouth:()=>'<path d="M 171 178 L 189 178" fill="none" stroke="#8a3d46" stroke-width="3.4" stroke-linecap="round"/>' },
  { id:'smirk', name:'Smirk', blush:.25,
    brows:(c)=>'<path d="M 149 124 Q 158 118 168 123" /><path d="M 192 129 Q 201 127 210 130" />',
    eyes:(c)=>eyeOpen(161,151,0.92,c.eyeC,'half')+eyeOpen(199,151,1,c.eyeC),
    mouth:()=>'<path d="M 167 177 Q 181 184 194 173" fill="none" stroke="#8a3d46" stroke-width="3.6" stroke-linecap="round"/>' },
  { id:'surprised', name:'Surprised', blush:0,
    brows:(c)=>'<path d="M 149 120 Q 158 114 168 119" /><path d="M 211 120 Q 202 114 192 119" />',
    eyes:(c)=>eyeOpen(161,151,1.16,c.eyeC)+eyeOpen(199,151,1.16,c.eyeC),
    mouth:()=>'<ellipse cx="180" cy="179" rx="6.5" ry="8.5" fill="#7a3640"/><ellipse cx="180" cy="182" rx="3.4" ry="4" fill="#c96a72"/>' },
  { id:'fierce', name:'Determined', blush:0,
    brows:(c)=>'<path d="M 148 121 L 167 129" /><path d="M 212 121 L 193 129" />',
    eyes:(c)=>eyeOpen(161,153,1,c.eyeC,'low')+eyeOpen(199,153,1,c.eyeC,'low'),
    mouth:()=>'<rect x="166" y="172" width="28" height="11" rx="4" fill="#7a3640"/>'+
              '<rect x="168" y="173.5" width="24" height="3.4" rx="1.6" fill="#fff"/>'+
              '<path d="M 175 174 v9 M 180 174 v9 M 185 174 v9" stroke="#5d272f" stroke-width="1.4"/>' },
  { id:'sleepy', name:'Sleepy', blush:.18,
    brows:(c)=>'<path d="M 150 132 Q 159 129 168 131" /><path d="M 210 132 Q 201 129 192 131" />',
    eyes:(c)=>eyeClosedSleepy(161,152)+eyeClosedSleepy(199,152),
    mouth:()=>'<ellipse cx="182" cy="180" rx="5" ry="6" fill="#7a3640"/><ellipse cx="182" cy="182.5" rx="2.6" ry="3" fill="#c96a72"/>' },
  { id:'wink', name:'Wink', blush:.4,
    brows:(c)=>'<path d="M 149 127 Q 158 122 168 125" /><path d="M 191 121 Q 200 116 211 120" />',
    eyes:(c)=>eyeOpen(161,151,1,c.eyeC)+eyeClosedHappy(199,151),
    mouth:()=>'<path d="M 164 172 Q 180 187 196 170 Q 181 179 164 172 Z" fill="#7a3640"/><path d="M 172 176.5 Q 180 183 188 175" fill="none" stroke="#fff" stroke-width="2.4"/>' },
  { id:'blissful', name:'Blissful', blush:.5,
    brows:(c)=>'<path d="M 149 126 Q 158 118 168 124" /><path d="M 211 126 Q 202 118 192 124" />',
    eyes:(c)=>eyeClosedHappy(161,151)+eyeClosedHappy(199,151),
    mouth:()=>'<path d="M 162 171 Q 180 190 198 171 Q 181 180 162 171 Z" fill="#7a3640"/><ellipse cx="180" cy="183" rx="5" ry="3.4" fill="#e2707f"/>' },
];

/* ---------- hairstyles: draw(C,G) -> {back,front} ---------- */
function domeHair(){ // top-of-skull dome path (thin)
  return 'M 129 152 A 51 61 0 1 1 231 152 Q 180 128 129 152 Z';
}
const HAIRSTYLES = [
  { id:'buzz', name:'Buzz cut',
    draw:(C)=>({ front:
      '<path d="'+domeHair()+'" fill="'+C.c+'" opacity=".92"/>'+
      '<path d="M 156 112 Q 180 104 204 112" fill="none" stroke="'+C.d+'" stroke-width="2" opacity=".35"/>'
    })},
  { id:'crop', name:'Short crop',
    draw:(C)=>({ front:
      '<path d="M 129 154 A 51 63 0 1 1 231 154 '+
      'Q 224 136 216 148 Q 209 134 199 146 Q 190 132 180 144 Q 170 132 161 146 Q 151 134 144 148 Q 136 136 129 154 Z" fill="'+C.c+'"/>'+
      '<path d="M 128 152 q -2 8 1 14 q 5 -2 6 -8 z M 232 152 q 2 8 -1 14 q -5 -2 -6 -8 z" fill="'+C.d+'"/>'+
      '<path d="M 152 108 Q 180 98 208 108" fill="none" stroke="'+C.l+'" stroke-width="3" opacity=".55" stroke-linecap="round"/>'
    })},
  { id:'bob', name:'Bob',
    draw:(C)=>({ back:
      '<path d="M 121 120 Q 121 89 180 89 Q 239 89 239 120 L 241 214 Q 241 240 216 240 L 144 240 Q 119 240 119 214 Z" fill="'+C.c+'"/>'+
      '<path d="M 126 208 Q 128 228 148 230 L 212 230 Q 232 228 234 208 L 234 222 Q 232 236 214 236 L 146 236 Q 128 236 126 222 Z" fill="'+C.d+'" opacity=".5"/>',
      front:
      '<path d="M 128 152 A 52 61 0 0 1 232 152 L 232 145 Q 215 132 206 146 Q 196 130 184 144 Q 172 130 162 145 Q 150 131 142 145 Q 134 134 128 145 Z" fill="'+C.c+'"/>'+
      '<path d="M 124 148 Q 116 192 125 226 Q 135 230 141 223 Q 131 190 137 156 Z" fill="'+C.c+'"/>'+
      '<path d="M 236 148 Q 244 192 235 226 Q 225 230 219 223 Q 229 190 223 156 Z" fill="'+C.c+'"/>'+
      '<path d="M 150 106 Q 180 96 210 106" fill="none" stroke="'+C.l+'" stroke-width="3" opacity=".5" stroke-linecap="round"/>'
    })},
  { id:'long', name:'Long & wavy',
    draw:(C)=>({ back:
      '<path d="M 118 118 Q 118 90 180 90 Q 242 90 242 118 C 253 190 255 292 245 354 '+
      'Q 218 366 198 354 Q 208 302 203 252 Q 180 262 157 252 Q 152 302 162 354 Q 142 366 115 354 C 105 292 107 190 118 118 Z" fill="'+C.c+'"/>'+
      '<path d="M 126 300 Q 124 330 130 350 Q 138 356 146 352 Q 138 328 138 300 Z" fill="'+C.d+'" opacity=".45"/>'+
      '<path d="M 234 300 Q 236 330 230 350 Q 222 356 214 352 Q 222 328 222 300 Z" fill="'+C.d+'" opacity=".45"/>',
      front:
      '<path d="M 180 110 Q 152 110 135 136 Q 128 148 129 163 Q 146 137 167 130 Q 176 126 180 124 Z" fill="'+C.c+'"/>'+
      '<path d="M 180 110 Q 208 110 225 136 Q 232 148 231 163 Q 214 137 193 130 Q 184 126 180 124 Z" fill="'+C.c+'"/>'+
      '<path d="M 180 112 Q 172 118 170 130" fill="none" stroke="'+C.l+'" stroke-width="2.5" opacity=".5" stroke-linecap="round"/>'
    })},
  { id:'ponytail', name:'Ponytail',
    draw:(C)=>({ back:
      '<g class="sway-tail" style="transform-origin:216px 108px; transform-box:view-box;">'+
      '<path d="M 212 104 C 250 116 262 162 255 214 C 251 250 240 274 226 290 C 238 248 240 202 227 168 C 219 146 205 126 194 118 Z" fill="'+C.c+'"/>'+
      '<path d="M 224 140 C 236 168 238 208 232 244" fill="none" stroke="'+C.d+'" stroke-width="3" opacity=".5" stroke-linecap="round"/></g>',
      front:
      '<path d="M 129 152 A 51 55 0 1 1 231 152 Q 212 130 197 139 Q 178 120 152 133 Q 138 139 129 152 Z" fill="'+C.c+'"/>'+
      '<circle cx="217" cy="109" r="9.5" fill="'+C.d+'"/>'+
      '<path d="M 150 112 Q 172 102 196 110" fill="none" stroke="'+C.l+'" stroke-width="3" opacity=".5" stroke-linecap="round"/>'
    })},
  { id:'twintails', name:'Twin tails',
    draw:(C)=>({ back:
      '<path d="M 128 122 C 98 132 86 170 91 216 C 94 246 103 264 114 276 C 105 238 108 198 118 170 C 124 150 132 136 142 128 Z" fill="'+C.c+'"/>'+
      '<path d="M 232 122 C 262 132 274 170 269 216 C 266 246 257 264 246 276 C 255 238 252 198 242 170 C 236 150 228 136 218 128 Z" fill="'+C.c+'"/>'+
      '<circle cx="126" cy="126" r="8.5" fill="'+C.d+'"/><circle cx="234" cy="126" r="8.5" fill="'+C.d+'"/>',
      front:
      '<path d="M 128 152 A 52 61 0 0 1 232 152 L 232 144 Q 216 132 207 145 Q 196 130 184 143 Q 172 130 162 144 Q 151 132 143 145 Q 134 134 128 144 Z" fill="'+C.c+'"/>'+
      '<path d="M 152 108 Q 180 98 208 108" fill="none" stroke="'+C.l+'" stroke-width="3" opacity=".5" stroke-linecap="round"/>'
    })},
  { id:'spiky', name:'Spiky',
    draw:(C)=>({ front:
      '<path d="M 128 154 L 116 106 L 140 120 L 131 82 L 158 102 L 160 62 L 186 94 L 199 58 L 213 96 L 233 78 L 227 118 L 246 108 L 232 154 '+
      'Q 180 126 128 154 Z" fill="'+C.c+'"/>'+
      '<path d="M 160 70 L 172 96 L 158 104 Z M 199 64 L 206 96 L 192 100 Z" fill="'+C.d+'" opacity=".6"/>'+
      '<path d="M 146 108 L 158 122" stroke="'+C.l+'" stroke-width="2.5" opacity=".5" stroke-linecap="round"/>'
    })},
  { id:'curly', name:'Curly puff',
    draw:(C)=>{
      const puffs=[[180,84,26],[146,95,24],[214,95,24],[124,120,22],[236,120,22],[113,149,20],[247,149,20],[180,106,29],[153,119,24],[207,119,24],[121,178,15],[239,178,15]];
      let s=puffs.map(p=>'<circle cx="'+p[0]+'" cy="'+p[1]+'" r="'+p[2]+'" fill="'+C.c+'"/>').join('');
      s+='<circle cx="160" cy="92" r="8" fill="'+C.l+'" opacity=".5"/><circle cx="204" cy="88" r="6" fill="'+C.l+'" opacity=".45"/>';
      return { back:'', front:s };
    }},
];

/* ---------- outfits ---------- */
/* legs: 'pants'|'shorts'|'bare'  sleeves:'none'|'short'|'long'  shoes:'flats'|'sneakers'|'boots' */
const OUTFITS = [
  { id:'tee', name:'Tee & jeans', legs:'pants', shoes:'flats', sleeves:'short',
    torso:(G,F)=>'<path d="'+G.torso(46,39,240,338)+'" fill="'+F.p+'"/>'+
      '<path d="M 166 240 Q 180 252 194 240" fill="none" stroke="'+F.pD+'" stroke-width="4" stroke-linecap="round"/>'+
      '<path d="M 180 268 m -5 0 a 5 5 0 1 0 10 0 a 5 5 0 1 0 -10 0" fill="'+F.pL+'" opacity=".8"/>'+
      '<path d="M 180 292 m -5 0 a 5 5 0 1 0 10 0 a 5 5 0 1 0 -10 0" fill="'+F.pL+'" opacity=".8"/>' },
  { id:'hoodie', name:'Hoodie & shorts', legs:'shorts', shoes:'sneakers', sleeves:'long',
    back:(G,F)=>'<path d="M 146 246 Q 180 224 214 246 Q 214 262 180 264 Q 146 262 146 246 Z" fill="'+F.pD+'"/>',
    torso:(G,F)=>'<path d="'+G.torso(50,44,238,344)+'" fill="'+F.p+'"/>'+
      '<path d="M 156 306 L 204 306 L 198 336 Q 180 342 162 336 Z" fill="none" stroke="'+F.pD+'" stroke-width="3.5" stroke-linejoin="round"/>'+
      '<path d="M 172 244 l -3 22 M 188 244 l 3 22" stroke="'+F.pL+'" stroke-width="3" stroke-linecap="round"/>'+
      '<circle cx="169" cy="268" r="2.6" fill="'+F.pL+'"/><circle cx="191" cy="268" r="2.6" fill="'+F.pL+'"/>' },
  { id:'dress', name:'Summer dress', legs:'bare', shoes:'flats', sleeves:'none',
    torso:(G,F)=>
      '<path d="'+G.torso(44,40,240,292)+'" fill="'+F.p+'"/>'+
      '<path d="M 140 290 C 130 330 122 356 116 372 Q 180 392 244 372 C 238 356 230 330 220 290 Q 180 304 140 290 Z" fill="'+F.a+'"/>'+
      '<path d="M 116 372 Q 180 392 244 372 L 241 380 Q 180 400 119 380 Z" fill="'+F.aD+'"/>'+
      '<path d="M 146 292 L 214 292 L 211 300 L 149 300 Z" fill="'+F.aD+'" opacity=".85"/>'+
      '<circle cx="180" cy="296" r="4" fill="'+F.aL+'"/>' },
  { id:'armor', name:'Hero armor', legs:'pants', shoes:'boots', sleeves:'long',
    torso:(G,F)=>
      '<path d="'+G.torso(48,41,238,341)+'" fill="'+F.p+'"/>'+
      '<path d="M 180 240 L 180 340" stroke="'+F.pL+'" stroke-width="4" opacity=".8"/>'+
      '<path d="M 152 250 Q 180 262 208 250" fill="none" stroke="'+F.a+'" stroke-width="5" stroke-linecap="round"/>'+
      '<path d="'+G.torso(48,41,314,341).replace('Z','')+' L '+f(180+G.hw(42))+' 318 L '+f(180-G.hw(42))+' 318 Z" fill="'+F.aD+'"/>'+
      '<rect x="166" y="330" width="28" height="12" rx="3" fill="'+F.a+'"/>'+
      '<circle cx="152" cy="248" r="17" fill="'+F.pL+'" stroke="'+F.aD+'" stroke-width="3"/>'+
      '<circle cx="208" cy="248" r="17" fill="'+F.pL+'" stroke="'+F.aD+'" stroke-width="3"/>'+
      '<path d="M 158 282 h -12 M 202 282 h 12" stroke="'+F.a+'" stroke-width="3.5" stroke-linecap="round"/>' },
  { id:'suit', name:'Suit & tie', legs:'pants', shoes:'flats', sleeves:'long',
    torso:(G,F)=>
      '<path d="'+G.torso(47,40,238,339)+'" fill="'+F.p+'"/>'+
      '<path d="M 166 240 L 180 292 L 194 240 Z" fill="#f5f6fa"/>'+
      '<path d="M 166 240 L 180 292 L 158 268 L 152 246 Z" fill="'+F.pD+'"/>'+
      '<path d="M 194 240 L 180 292 L 202 268 L 208 246 Z" fill="'+F.pD+'"/>'+
      '<path d="M 180 244 l 6 8 l -6 26 l -6 -26 z" fill="'+F.a+'"/>'+
      '<path d="M 180 278 l 4 8 l -4 6 l -4 -6 z" fill="'+F.aD+'"/>'+
      '<circle cx="163" cy="300" r="2.4" fill="'+F.pL+'"/><circle cx="163" cy="316" r="2.4" fill="'+F.pL+'"/>' },
  { id:'overalls', name:'Overalls', legs:'shorts', shoes:'sneakers', sleeves:'short',
    torso:(G,F)=>
      '<path d="'+G.torso(46,40,240,337)+'" fill="'+F.p+'"/>'+
      '<path d="M 162 254 L 198 254 L 200 320 L 160 320 Z" fill="'+F.a+'"/>'+
      '<path d="M 164 254 L 156 236 L 166 234 L 170 254 Z" fill="'+F.a+'"/>'+
      '<path d="M 196 254 L 204 236 L 194 234 L 190 254 Z" fill="'+F.a+'"/>'+
      '<circle cx="165" cy="260" r="3" fill="'+F.aL+'"/><circle cx="195" cy="260" r="3" fill="'+F.aL+'"/>'+
      '<path d="M 166 270 h 28" stroke="'+F.aD+'" stroke-width="2.4" stroke-dasharray="4 4" opacity=".8"/>' },
  { id:'tank', name:'Sport tank', legs:'pants', shoes:'sneakers', sleeves:'none',
    torso:(G,F)=>
      '<path d="M 148 244 Q 152 262 160 268 L 156 340 L 204 340 L 200 268 Q 208 262 212 244 L 200 240 Q 180 254 160 240 Z" fill="'+F.p+'"/>'+
      '<path d="M 154 254 Q 150 300 154 336 L 162 336 Q 158 298 162 260 Z" fill="'+F.a+'"/>'+
      '<path d="M 206 254 Q 210 300 206 336 L 198 336 Q 202 298 198 260 Z" fill="'+F.a+'"/>'+
      '<path d="M 168 246 Q 180 258 192 246" fill="none" stroke="'+F.pD+'" stroke-width="3.4" stroke-linecap="round"/>' },
  { id:'coat', name:'Winter coat', legs:'pants', shoes:'boots', sleeves:'long',
    torso:(G,F)=>
      '<path d="'+G.torso(52,45,236,346)+'" fill="'+F.p+'"/>'+
      '<path d="M 140 268 h 80 M 138 292 h 84 M 138 316 h 84 M 140 340 h 80" stroke="'+F.pD+'" stroke-width="3" opacity=".7"/>'+
      '<path d="M 180 238 L 180 350" stroke="'+F.pD+'" stroke-width="4"/>'+
      '<circle cx="172" cy="252" r="2.8" fill="'+F.pL+'"/><circle cx="188" cy="252" r="2.8" fill="'+F.pL+'"/>'+
      '<path d="M 164 240 Q 180 254 196 240" fill="none" stroke="'+F.pL+'" stroke-width="4" stroke-linecap="round"/>' },
];

/* ---------- accessories ---------- */
const HEADWEAR = [
  {id:'none',name:'None'},
  {id:'cap',name:'Ball cap',draw:(A)=>(
    '<path d="M 129 128 C 129 92 152 80 180 80 C 208 80 231 92 231 128 Q 180 141 129 128 Z" fill="'+A.acc+'"/>'+
    '<path d="M 127 126 Q 180 144 233 126 Q 241 148 180 155 Q 119 148 127 126 Z" fill="'+A.accD+'"/>'+
    '<circle cx="180" cy="83" r="5" fill="'+A.accD+'"/>'+
    '<path d="M 133 116 Q 180 128 227 116" fill="none" stroke="'+shade(A.acc,-0.35)+'" stroke-width="2.4" opacity=".6"/>')},
  {id:'beanie',name:'Beanie',draw:(A)=>(
    '<path d="M 128 126 C 128 84 152 70 180 70 C 208 70 232 84 232 126 Q 180 139 128 126 Z" fill="'+A.acc+'"/>'+
    '<rect x="124" y="116" width="112" height="20" rx="10" fill="'+shade(A.acc,-0.14)+'"/>'+
    '<path d="M 136 126 q 10 -6 22 0 q 10 -6 22 0 q 10 -6 22 0 q 10 -6 22 0" fill="none" stroke="'+shade(A.acc,0.22)+'" stroke-width="2.4" opacity=".8"/>'+
    '<circle cx="180" cy="66" r="12" fill="#f4f4f8"/>'+ '<circle cx="176" cy="63" r="4" fill="#ffffff" opacity=".8"/>')},
  {id:'band',name:'Headband',draw:(A)=>(
    '<path d="M 130 122 Q 180 104 230 122 L 230 133 Q 180 116 130 133 Z" fill="'+A.acc+'"/>'+
    '<path d="M 222 112 l 16 -8 l -3 12 l 10 6 l -14 3 z" fill="'+A.acc+'"/>'+
    '<circle cx="231" cy="115" r="4" fill="'+shade(A.acc,0.3)+'"/>')},
  {id:'crown',name:'Crown',draw:(A)=>(
    '<path d="M 140 112 L 140 86 L 158 100 L 180 80 L 202 100 L 220 86 L 220 112 Z" fill="#f2c14e"/>'+
    '<rect x="138" y="110" width="84" height="14" rx="4" fill="#e0ac38"/>'+
    '<circle cx="159" cy="117" r="3.4" fill="'+A.acc+'"/><circle cx="180" cy="117" r="3.8" fill="'+A.acc+'"/><circle cx="201" cy="117" r="3.4" fill="'+A.acc+'"/>'+
    '<circle cx="180" cy="82" r="3.4" fill="#ff5c8a"/>')},
  {id:'wizard',name:'Wizard hat',draw:(A)=>(
    '<path d="M 140 108 C 150 68 168 40 204 24 C 214 20 222 28 214 38 C 198 60 208 84 222 106 Q 180 124 140 108 Z" fill="'+A.acc+'"/>'+
    '<ellipse cx="181" cy="110" rx="88" ry="17" fill="'+shade(A.acc,-0.18)+'"/>'+
    '<path d="M 176 66 l 2.6 6 l 6 2.6 l -6 2.6 l -2.6 6 l -2.6 -6 l -6 -2.6 l 6 -2.6 z" fill="#ffd66b"/>'+
    '<path d="M 196 46 l 2 4.6 l 4.6 2 l -4.6 2 l -2 4.6 l -2 -4.6 l -4.6 -2 l 4.6 -2 z" fill="#ffd66b" opacity=".9"/>'+
    '<path d="M 164 92 l 2 4.4 l 4.4 2 l -4.4 2 l -2 4.4 l -2 -4.4 l -4.4 -2 l 4.4 -2 z" fill="#ffd66b" opacity=".8"/>')},
  {id:'flower',name:'Flower clip',draw:(A)=>{
    let s=''; const cx=223,cy=113;
    for(let i=0;i<5;i++){ const a=i/5*Math.PI*2-Math.PI/2;
      s+='<circle cx="'+f(cx+Math.cos(a)*10)+'" cy="'+f(cy+Math.sin(a)*10)+'" r="7.5" fill="'+shade(A.acc,0.32)+'"/>'; }
    return s+'<circle cx="'+cx+'" cy="'+cy+'" r="5.5" fill="#f2c14e"/>';
  }},
];
const EYEWEAR = [
  {id:'none',name:'None'},
  {id:'glasses',name:'Glasses',draw:()=>(
    '<circle cx="161" cy="151" r="14.5" fill="#ffffff" fill-opacity=".16" stroke="#3a332c" stroke-width="3.4"/>'+
    '<circle cx="199" cy="151" r="14.5" fill="#ffffff" fill-opacity=".16" stroke="#3a332c" stroke-width="3.4"/>'+
    '<path d="M 175 149 Q 180 145 185 149" fill="none" stroke="#3a332c" stroke-width="3"/>'+
    '<path d="M 146.5 149 L 132 144 M 213.5 149 L 228 144" stroke="#3a332c" stroke-width="3" stroke-linecap="round"/>'+
    '<path d="M 151 144 L 157 150" stroke="#ffffff" stroke-width="2" opacity=".5" stroke-linecap="round"/>')},
  {id:'shades',name:'Sunglasses',draw:()=>(
    '<rect x="146" y="142" width="29" height="18" rx="8.5" fill="#23262e" opacity=".96"/>'+
    '<rect x="185" y="142" width="29" height="18" rx="8.5" fill="#23262e" opacity=".96"/>'+
    '<path d="M 175 147 Q 180 144 185 147" fill="none" stroke="#23262e" stroke-width="3.4"/>'+
    '<path d="M 146 149 L 132 144 M 214 149 L 228 144" stroke="#23262e" stroke-width="3.4" stroke-linecap="round"/>'+
    '<path d="M 152 146 l 8 9 M 191 146 l 8 9" stroke="#8f97ab" stroke-width="2.6" opacity=".7" stroke-linecap="round"/>')},
  {id:'patch',name:'Eyepatch',draw:()=>(
    '<rect x="146" y="139" width="31" height="23" rx="7" fill="#26222b"/>'+
    '<path d="M 150 142 L 130 121 M 173 145 Q 205 126 230 147" fill="none" stroke="#26222b" stroke-width="4.4" stroke-linecap="round"/>'+
    '<path d="M 152 145 l 8 10" stroke="#4a4352" stroke-width="2.4" opacity=".8" stroke-linecap="round"/>')},
  {id:'visor',name:'Cyber visor',draw:()=>(
    '<rect x="133" y="139" width="94" height="19" rx="9.5" fill="#59e3ff" fill-opacity=".38" stroke="#bdf2ff" stroke-width="2.2"/>'+
    '<path d="M 141 148 h 20 M 199 148 h 20" stroke="#dffaff" stroke-width="2.4" opacity=".85" stroke-linecap="round"/>'+
    '<rect x="126" y="143" width="8" height="11" rx="3" fill="#3a3f4c"/><rect x="226" y="143" width="8" height="11" rx="3" fill="#3a3f4c"/>')},
];
const NECKWEAR = [
  {id:'none',name:'None'},
  {id:'cape',name:'Hero cape',layer:'back',draw:(A)=>(
    '<path d="M 140 244 C 112 292 98 358 94 422 Q 120 438 148 428 Q 180 440 212 428 Q 240 438 266 422 C 262 358 248 292 220 244 Q 180 264 140 244 Z" fill="'+shade(A.acc,-0.15)+'"/>'+
    '<path d="M 94 422 Q 120 438 148 428 Q 180 440 212 428 Q 240 438 266 422" fill="none" stroke="#f2c14e" stroke-width="3.5" opacity=".9"/>'+
    '<path d="M 140 244 C 118 290 106 350 102 414 Q 112 420 122 417 C 118 350 128 292 148 250 Z" fill="'+shade(A.acc,-0.22)+'" opacity=".7"/>'+
    '<circle cx="166" cy="251" r="4.5" fill="#f2c14e"/><circle cx="194" cy="251" r="4.5" fill="#f2c14e"/>')},
  {id:'scarf',name:'Scarf',draw:(A)=>(
    '<rect x="147" y="212" width="66" height="26" rx="13" fill="'+A.acc+'"/>'+
    '<path d="M 187 236 L 207 236 L 203 298 Q 197 308 190 298 Z" fill="'+A.acc+'"/>'+
    '<path d="M 190 298 l 4 10 M 196 298 l 3 10 M 201 296 l 3 10" stroke="'+A.acc+'" stroke-width="3.4" stroke-linecap="round"/>'+
    '<path d="M 152 220 q 28 12 56 0" fill="none" stroke="'+shade(A.acc,-0.2)+'" stroke-width="2.6" opacity=".8"/>'+
    '<circle cx="196" cy="238" r="7.5" fill="'+shade(A.acc,-0.12)+'"/>')},
  {id:'necklace',name:'Necklace',draw:(A)=>(
    '<path d="M 158 224 Q 180 244 202 224" fill="none" stroke="#e8b84b" stroke-width="2.6"/>'+
    '<path d="M 180 240 l 6 7 l -6 7 l -6 -7 z" fill="'+A.acc+'" stroke="#e8b84b" stroke-width="1.6"/>')},
  {id:'bowtie',name:'Bow tie',draw:(A)=>(
    '<path d="M 178 232 L 156 222 L 156 243 Z" fill="'+A.acc+'"/>'+
    '<path d="M 182 232 L 204 222 L 204 243 Z" fill="'+A.acc+'"/>'+
    '<rect x="174" y="226" width="12" height="13" rx="3" fill="'+shade(A.acc,-0.15)+'"/>'+
    '<path d="M 162 228 L 172 234 M 198 228 L 188 234" stroke="'+shade(A.acc,-0.25)+'" stroke-width="2" opacity=".8"/>')},
];
const EXTRAS = [
  {id:'none',name:'None'},
  {id:'earrings',name:'Earrings',draw:(A)=>(
    '<circle cx="130" cy="168" r="4.2" fill="#f0c75e"/><circle cx="230" cy="168" r="4.2" fill="#f0c75e"/>'+
    '<circle cx="129" cy="166.6" r="1.4" fill="#ffe9ad"/><circle cx="229" cy="166.6" r="1.4" fill="#ffe9ad"/>')},
  {id:'freckles',name:'Freckles',draw:(A,C)=>{ 
    const col=shade(C.skin,-0.28); let s='';
    [[150,163],[158,166],[166,163],[194,163],[202,166],[210,163]].forEach(p=>{
      s+='<circle cx="'+p[0]+'" cy="'+p[1]+'" r="1.7" fill="'+col+'" opacity=".8"/>'; });
    return s; }},
  {id:'phones',name:'Headphones',draw:(A)=>(
    '<path d="M 127 142 Q 129 74 180 74 Q 231 74 233 142" fill="none" stroke="#33303a" stroke-width="9"/>'+
    '<rect x="114" y="136" width="32" height="36" rx="12" fill="'+A.acc+'"/>'+
    '<rect x="214" y="136" width="32" height="36" rx="12" fill="'+A.acc+'"/>'+
    '<circle cx="130" cy="154" r="8" fill="'+shade(A.acc,-0.25)+'"/><circle cx="230" cy="154" r="8" fill="'+shade(A.acc,-0.25)+'"/>')},
];

/* ---------- default + presets ---------- */
const DEFAULT_STATE = {
  skin:1, hairStyle:1, hairColor:3, expression:0, eyeColor:3,
  outfit:0, cPrimary:5, cAccent:6, pose:0, build:1,
  headwear:0, eyewear:0, neckwear:0, extra:0,
};
const PRESETS = [
  { id:'adventurer', name:'Adventurer', emoji:'⚔️', st:{ skin:2, hairStyle:3, hairColor:4, expression:4, eyeColor:0, outfit:3, cPrimary:5, cAccent:2, pose:2, build:1, headwear:0, eyewear:0, neckwear:1, extra:0 } },
  { id:'popstar', name:'Pop Star', emoji:'🎤', st:{ skin:1, hairStyle:5, hairColor:10, expression:6, eyeColor:5, outfit:6, cPrimary:8, cAccent:9, pose:1, build:0, headwear:2, eyewear:0, neckwear:0, extra:1 } },
  { id:'scholar', name:'Scholar', emoji:'📚', st:{ skin:3, hairStyle:2, hairColor:1, expression:1, eyeColor:0, outfit:4, cPrimary:10, cAccent:0, pose:0, build:1, headwear:0, eyewear:1, neckwear:0, extra:0 } },
  { id:'athlete', name:'Athlete', emoji:'🏅', st:{ skin:4, hairStyle:1, hairColor:0, expression:4, eyeColor:3, outfit:6, cPrimary:4, cAccent:9, pose:2, build:2, headwear:2, eyewear:0, neckwear:0, extra:0 } },
  { id:'royal', name:'Royalty', emoji:'👑', st:{ skin:1, hairStyle:7, hairColor:9, expression:7, eyeColor:4, outfit:2, cPrimary:7, cAccent:2, pose:0, build:1, headwear:3, eyewear:0, neckwear:1, extra:1 } },
  { id:'nightowl', name:'Night Owl', emoji:'🌙', st:{ skin:0, hairStyle:6, hairColor:9, expression:5, eyeColor:3, outfit:1, cPrimary:6, cAccent:10, pose:0, build:1, headwear:1, eyewear:0, neckwear:0, extra:0 } },
];

/* normalize / validate */
function normalizeState(st){
  const d=DEFAULT_STATE, o={};
  o.skin=clampI(st&&st.skin,d.skin,SKINS.length);
  o.hairStyle=clampI(st&&st.hairStyle,d.hairStyle,HAIRSTYLES.length);
  o.hairColor=clampI(st&&st.hairColor,d.hairColor,HAIR_COLORS.length);
  o.expression=clampI(st&&st.expression,d.expression,EXPRESSIONS.length);
  o.eyeColor=clampI(st&&st.eyeColor,d.eyeColor,EYE_COLORS.length);
  o.outfit=clampI(st&&st.outfit,d.outfit,OUTFITS.length);
  o.cPrimary=clampI(st&&st.cPrimary,d.cPrimary,OUTFIT_COLORS.length);
  o.cAccent=clampI(st&&st.cAccent,d.cAccent,OUTFIT_COLORS.length);
  o.pose=clampI(st&&st.pose,d.pose,POSES.length);
  o.build=clampI(st&&st.build,d.build,BUILDS.length);
  o.headwear=clampI(st&&st.headwear,d.headwear,HEADWEAR.length);
  o.eyewear=clampI(st&&st.eyewear,d.eyewear,EYEWEAR.length);
  o.neckwear=clampI(st&&st.neckwear,d.neckwear,NECKWEAR.length);
  o.extra=clampI(st&&st.extra,d.extra,EXTRAS.length);
  return o;
}
function clampI(v,d,n){ v=parseInt(v,10); if(isNaN(v)) return d; return Math.max(0,Math.min(n-1,v)); }
function isValidState(st){
  if(!st||typeof st!=='object') return false;
  try{ const n=normalizeState(st); return Object.keys(DEFAULT_STATE).every(k=>Number.isInteger(n[k])); }
  catch(e){ return false; }
}

/* ---------- geometry ---------- */
function computeGeo(b){
  const g={ b };
  g.hw=(v)=>v*b;
  const pose=POSES[0]; // replaced per-render
  g.setPose=(pi)=>{
    const p=POSES[pi];
    g.armL=scalePts(p.L,b); g.armR=scalePts(p.R,b);
    g.sleeveShortL=qSlice(...g.armL,0.04,0.5); g.sleeveShortR=qSlice(...g.armR,0.04,0.5);
    g.sleeveLongL=qSlice(...g.armL,0.02,0.82); g.sleeveLongR=qSlice(...g.armR,0.02,0.82);
  };
  g.torso=(hwTop,hwBot,yT,yB)=>{
    const xT=scaleX(180,b)-hwTop*b/1, r=20;
    const xl=scaleX(180-hwTop,b), xr=scaleX(180+hwTop,b);
    const xb_l=scaleX(180-hwBot,b), xb_r=scaleX(180+hwBot,b);
    return 'M '+f(xl+r)+' '+f(yT)+' L '+f(xr-r)+' '+f(yT)+' Q '+f(xr)+' '+f(yT)+' '+f(xr)+' '+f(yT+r)+
           ' L '+f(xb_r)+' '+f(yB)+' L '+f(xb_l)+' '+f(yB)+' Z';
  };
  g.legL=[[163,336],[157,396],[158,446]]; g.legR=[[197,336],[203,396],[202,446]];
  g.legL=scalePts(g.legL,b); g.legR=scalePts(g.legR,b);
  g.pantSliceL=qSlice(...g.legL,0,0.93); g.pantSliceR=qSlice(...g.legR,0,0.93);
  g.shortSliceL=qSlice(...g.legL,0,0.42); g.shortSliceR=qSlice(...g.legR,0,0.42);
  g.shoeL=[g.legL[2][0],452]; g.shoeR=[g.legR[2][0],452];
  return g;
}

/* ---------- main render ---------- */
function renderCharacterSVG(stateIn, opts){
  opts=opts||{};
  const st=normalizeState(stateIn);
  const b=BUILDS[st.build].w;
  const skin=SKINS[st.skin], skinSh=shade(skin,-0.13);
  const C={ c:HAIR_COLORS[st.hairColor], d:shade(HAIR_COLORS[st.hairColor],-0.3), l:shade(HAIR_COLORS[st.hairColor],0.25) };
  C.brow=shade(C.c,-0.15)>C.d? shade(C.c,-0.15):C.d;
  const F={ p:OUTFIT_COLORS[st.cPrimary], a:OUTFIT_COLORS[st.cAccent] };
  F.pD=shade(F.p,-0.22); F.pL=shade(F.p,0.18); F.aD=shade(F.a,-0.24); F.aL=shade(F.a,0.3);
  F.pF=F.pD; // fabric dark alias
  const eyeC=EYE_COLORS[st.eyeColor];
  const A={ acc:OUTFIT_COLORS[st.cAccent], accD:shade(OUTFIT_COLORS[st.cAccent],-0.24) };

  const G=computeGeo(b);
  G.setPose(st.pose);

  /* --- body pieces --- */
  const outfit=OUTFITS[st.outfit];
  const armW=f(15*b), legW=f(22.5*b);

  function limbStroke(pts,w,col){ return '<path d="'+qPath(pts)+'" fill="none" stroke="'+col+'" stroke-width="'+w+'" stroke-linecap="round"/>'; }

  let legs='', shoes='';
  legs+=limbStroke(G.legL,f(legW),skin)+limbStroke(G.legR,f(legW),skin);
  if(outfit.legs==='pants'){
    legs+=limbStroke(G.pantSliceL,f(24.5*b),F.a)+limbStroke(G.pantSliceR,f(24.5*b),F.a);
  }else if(outfit.legs==='shorts'){
    legs+=limbStroke(G.shortSliceL,f(25.5*b),F.a)+limbStroke(G.shortSliceR,f(25.5*b),F.a);
  }
  const sl=outfit.shoes;
  [G.shoeL,G.shoeR].forEach((s,i)=>{
    const dx=i===0?-3:3, x=s[0]+dx*0.4, y=s[1];
    if(sl==='boots'){
      shoes+='<path d="M '+f(x-11)+' 416 h 22 v 26 q 0 9 -11 9 q -11 0 -11 -9 Z" fill="#4a3629"/>'+
             '<rect x="'+f(x-12)+'" y="412" width="24" height="9" rx="4" fill="#5c4634"/>';
    }else if(sl==='sneakers'){
      shoes+='<ellipse cx="'+f(x)+'" cy="'+f(y)+'" rx="14.5" ry="9" fill="#f2f3f7"/>'+
             '<path d="M '+f(x-14)+' 452 h 28" stroke="#d8dbe4" stroke-width="3.4" stroke-linecap="round"/>'+
             '<path d="M '+f(x-4)+' 447 q 6 -3 10 1" fill="none" stroke="'+F.a+'" stroke-width="2.6" stroke-linecap="round"/>';
    }else{
      shoes+='<ellipse cx="'+f(x)+'" cy="'+f(y)+'" rx="13.5" ry="8.5" fill="#5a4440"/>'+
             '<path d="M '+f(x-6)+' '+f(y-4)+' q 6 -3 11 0" fill="none" stroke="#6e5650" stroke-width="2.4" stroke-linecap="round"/>';
    }
  });

  const arms=
    limbStroke(G.armL,armW,skin)+limbStroke(G.armR,armW,skin)+
    '<circle cx="'+f(G.armL[2][0])+'" cy="'+f(G.armL[2][1])+'" r="'+f(8.5*b)+'" fill="'+skin+'"/>'+
    '<circle cx="'+f(G.armR[2][0])+'" cy="'+f(G.armR[2][1])+'" r="'+f(8.5*b)+'" fill="'+skin+'"/>'+
    (outfit.sleeves==='short'
      ? limbStroke(G.sleeveShortL,f(19*b),F.p)+limbStroke(G.sleeveShortR,f(19*b),F.p)
      : outfit.sleeves==='long'
        ? limbStroke(G.sleeveLongL,f(19*b),F.p)+limbStroke(G.sleeveLongR,f(19*b),F.p)+
          '<circle cx="'+f(G.armL[2][0])+'" cy="'+f(G.armL[2][1]-2)+'" r="'+f(9.5*b)+'" fill="'+(outfit.id==='armor'?F.a:F.pD)+'"/>'+
          '<circle cx="'+f(G.armR[2][0])+'" cy="'+f(G.armR[2][1]-2)+'" r="'+f(9.5*b)+'" fill="'+(outfit.id==='armor'?F.a:F.pD)+'"/>'
        : '');

  /* --- head --- */
  const exp=EXPRESSIONS[st.expression];
  const browCol=C.brow;
  const brows='<g fill="none" stroke="'+browCol+'" stroke-width="4" stroke-linecap="round">'+exp.brows({})+'</g>';
  const eyesWrap='<g class="blink-wrap">'+exp.eyes({eyeC,skin}).replace(/__SKIN__/g,skin)+'</g>';
  const nose='<path d="M 178 163 q 3 3.4 6.4 0.6" fill="none" stroke="'+skinSh+'" stroke-width="2.4" stroke-linecap="round"/>';
  const mouth=exp.mouth({});
  const blush=exp.blush? '<ellipse cx="146" cy="167" rx="10.5" ry="5.4" fill="#ff8fa3" opacity="'+exp.blush+'"/>'+
                          '<ellipse cx="214" cy="167" rx="10.5" ry="5.4" fill="#ff8fa3" opacity="'+exp.blush+'"/>' : '';
  const face='<g>'+brows+eyesWrap+nose+mouth+blush+'</g>';

  const headGroup=
    '<path d="M 166 188 h 28 v 36 q -14 9 -28 0 Z" fill="'+skin+'"/>'+
    '<path d="M 166 196 q 14 10 28 0 v 9 q -14 9 -28 0 Z" fill="'+skinSh+'" opacity=".6"/>'+
    '<circle cx="131" cy="152" r="9" fill="'+skin+'"/><circle cx="229" cy="152" r="9" fill="'+skin+'"/>'+
    '<path d="M 128 149 q 3 4 1 8 M 232 149 q -3 4 -1 8" fill="none" stroke="'+skinSh+'" stroke-width="2"/>'+
    '<ellipse cx="180" cy="146" rx="50" ry="54" fill="'+skin+'"/>'+
    face;

  /* --- hair --- */
  const hairParts=HAIRSTYLES[st.hairStyle].draw(C,{});
  const hairBack=hairParts.back||'' , hairFront=hairParts.front||'';

  /* --- accessories --- */
  let accFront='', accBack='';
  const hw=HEADWEAR[st.headwear]; if(hw.draw) accFront+=hw.draw(A);
  const ew=EYEWEAR[st.eyewear]; if(ew.draw) accFront+=ew.draw(A);
  const nw=NECKWEAR[st.neckwear];
  if(nw.draw){ if(nw.layer==='back') accBack+=nw.draw(A); else accFront+=nw.draw(A); }
  const ex=EXTRAS[st.extra]; if(ex.draw) accFront+=ex.draw(A,{skin});

  /* --- assemble --- */
  const torsoBase='<path d="'+G.torso(45,38,240,337)+'" fill="'+skin+'"/>';
  const outfitBack=outfit.back? outfit.back(G,F):'';
  const outfitTorso=outfit.torso(G,F);

  const inner=
    '<ellipse cx="180" cy="458" rx="92" ry="14" fill="#000000" opacity=".22"/>'+
    '<g class="char-idle">'+
      '<g class="layer-back">'+accBack+outfitBack+hairBack+'</g>'+
      '<g class="layer-body">'+legs+shoes+torsoBase+outfitTorso+arms+'</g>'+
      '<g class="layer-head">'+headGroup+'</g>'+
      '<g class="layer-hair">'+hairFront+'</g>'+
      '<g class="layer-acc">'+accFront+'</g>'+
    '</g>';

  const vb=opts.viewBox||'0 0 360 500';
  let open='<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+vb+'"';
  if(opts.standalone) open+=' width="720" height="1000"';
  else open+=' class="char-svg" aria-label="Character preview"';
  open+=' role="img">';
  return open+'>'+inner+'</svg>';
}

/* ---------- seeded rng + randomizer ---------- */
function mulberry32(seed){
  let a=seed>>>0;
  return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
}
function randomState(rng){
  rng=rng||Math.random;
  const ri=(n)=>Math.floor(rng()*n);
  const maybeNone=()=>rng()<0.55?0:1+ri(HEADWEAR.length-1);
  return {
    skin:ri(SKINS.length),
    hairStyle:ri(HAIRSTYLES.length),
    hairColor:ri(HAIR_COLORS.length),
    expression:ri(EXPRESSIONS.length),
    eyeColor:ri(EYE_COLORS.length),
    outfit:ri(OUTFITS.length),
    cPrimary:ri(OUTFIT_COLORS.length),
    cAccent:ri(OUTFIT_COLORS.length),
    pose:ri(POSES.length),
    build:ri(BUILDS.length),
    headwear:maybeNone(),
    eyewear:rng()<0.6?0:1+ri(EYEWEAR.length-1),
    neckwear:maybeNone(),
    extra:rng()<0.6?0:1+ri(EXTRAS.length-1),
  };
}

/* export for app + previews */
window.CC = {
  SKINS, HAIR_COLORS, OUTFIT_COLORS, EYE_COLORS,
  BUILDS, POSES, EXPRESSIONS, HAIRSTYLES, OUTFITS,
  HEADWEAR, EYEWEAR, NECKWEAR, EXTRAS,
  DEFAULT_STATE, PRESETS,
  normalizeState, isValidState, randomState, mulberry32,
  renderCharacterSVG, shade,
};
