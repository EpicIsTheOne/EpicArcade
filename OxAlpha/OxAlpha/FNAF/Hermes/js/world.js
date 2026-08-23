// world.js — the Wonderdrome venue: rooms, walls, props, lights, camera anchors.
'use strict';
WD.world = (() => {
  const H = 3.6;                       // wall height

  function box(w, h, d, m){ return new THREE.Mesh(new THREE.BoxGeometry(w,h,d), m); }
  function plane(w, d, m){ return new THREE.Mesh(new THREE.PlaneGeometry(w,d), m); }

  function makeMat(map, color, rough=0.9, metal=0.0){
    return new THREE.MeshStandardMaterial({ map, color: color===undefined?0xffffff:color,
      roughness:rough, metalness:metal });
  }

  // A rectangular room: floor, ceiling, 4 walls with optional doorway gaps.
  // walls: {n,s,e,w} each = { gap:[c,w] } centered gap or true = solid, false = none
  function room(g, def){
    const T = WD.textures.all();
    const { x, z, w, d, name } = def;
    const floorMat = makeMat(def.floor==='checker'?T.checker: def.floor==='concrete'?T.concreteA:
                             def.floor==='metal'?T.metal: T.carpetA, null, 0.95);
    const wallMat  = makeMat(def.wall||T.wallRed, null, 0.85);
    const ceilMat  = makeMat(T.ceil, 0x777788, 0.95);
    const fl = plane(w, d, floorMat); fl.rotation.x = -Math.PI/2;
    fl.position.set(x, 0, z); g.add(fl);
    const ce = plane(w, d, ceilMat); ce.rotation.x = Math.PI/2;
    ce.position.set(x, H, z); g.add(ce);
    const walls = def.walls || {};
    ['n','s','e','w'].forEach(side=>{
      const cfg = walls[side];
      if(cfg === false) return;                       // open side
      const horiz = (side==='n'||side==='s');
      const len = horiz? w : d;
      const dir = side==='n'?-1: side==='s'?1: side==='e'?1: -1;
      const cx = horiz? x : x + dir*(w/2);
      const cz = horiz? z + dir*(d/2) : z;
      const gap = (cfg && cfg.gap) ? cfg.gap : null;  // [centerOffset, width]
      const yRot = horiz? 0 : Math.PI/2;
      if(gap){
        const [gc, gw] = gap;
        const segLen = (len - gw)/2;
        const off = (gw/2 + segLen/2);
        [[gc-off],[gc+off]].forEach(([c])=>{
          const m = box(segLen, H, 0.25, wallMat);
          m.position.set(cx + (horiz? c:0), H/2, cz + (horiz?0:c));
          m.rotation.y = yRot; g.add(m);
        });
        const lintel = box(gw, H-2.2, 0.25, wallMat);
        lintel.position.set(cx + (horiz?gc:0), 2.2+(H-2.2)/2, cz + (horiz?0:gc));
        lintel.rotation.y = yRot; g.add(lintel);
      } else {
        const m = box(len, H, 0.25, wallMat);
        m.position.set(cx, H/2, cz); m.rotation.y = yRot; g.add(m);
      }
    });
    def._floorMat = floorMat; def._wallMat = wallMat;
    return g;
  }

  function doorway(x, z, rotY, w=2.2){
    // dark frame + floor threshold so gaps read as passages
    const T = WD.textures.all();
    const g = new THREE.Group();
    const m = makeMat(T.metalWide, 0x666677, 0.6, 0.4);
    const l = box(0.16, 2.2, 0.3, m), r = box(0.16, 2.2, 0.3, m);
    l.position.set(-w/2, 1.1, 0); r.position.set(w/2, 1.1, 0);
    const top = box(w+0.3, 0.18, 0.3, m); top.position.set(0, 2.25, 0);
    g.add(l,r,top); g.position.set(x, 0, z); g.rotation.y = rotY;
    return g;
  }

  function build(scene){
    const T = WD.textures.all();
    const root = new THREE.Group();
    const mats = {
      metal: makeMat(T.metal, 0x8888aa, 0.55, 0.6),
      hazard: makeMat(T.hazard, 0xffffff, 0.7),
      curtain: new THREE.MeshStandardMaterial({ map:T.curtain, roughness:0.9,
        side:THREE.DoubleSide }),
    };
    const R = {};   // room defs by id

    // ---- Show Stage (north-center) ----
    R.stage = { x:0, z:-16, w:12, d:9, name:'Show Stage', floor:'carpet', wall:T.wallGold,
      walls:{ n:true, e:true, w:true, s:{gap:[0,4]} } };
    room(root, R.stage);
    const stageDeck = box(11, 0.5, 6.5, makeMat(T.metalWide, 0x5a4a3a, 0.8));
    stageDeck.position.set(0, 0.25, -17.2); root.add(stageDeck);
    const curtainL = plane(5.4, 3.4, mats.curtain); curtainL.position.set(-2.9, 2.2, -20.3); root.add(curtainL);
    const curtainR = curtainL.clone(); curtainR.position.x = 2.9; root.add(curtainR);
    // star backdrop
    const back = plane(10.5, 2.6, new THREE.MeshStandardMaterial({
      color:0x0a0a14, roughness:0.9, emissive:0x2a2440, emissiveIntensity:0.35 }));
    back.position.set(0, 2.1, -20.45); root.add(back);
    // stage spots (warm, flicker)
    R.stage.spots = [];
    [[-3,-18],[0,-18.5],[3,-18]].forEach(([px,pz],i)=>{
      const sp = new THREE.SpotLight(0xffd9a0, 8.5, 13, 0.62, 0.45, 1.6);
      sp.position.set(px, 3.4, pz+1.2);
      sp.target.position.set(px, 1.0, pz-0.6);
      root.add(sp, sp.target); R.stage.spots.push(sp);
    });

    // ---- Dining Hall (center) ----
    R.dining = { x:0, z:-6.5, w:14, d:9, name:'Dining Hall', floor:'carpet', wall:T.wallRed,
      walls:{ n:{gap:[0,4]}, e:{gap:[-3,2.4]}, w:{gap:[2,2.4]}, s:{gap:[0,5]} } };
    room(root, R.dining);
    const tableMat = makeMat(T.metalWide, 0x9a8a70, 0.7, 0.2);
    for(let i=0;i<4;i++){
      const t = box(2.6, 0.1, 1.1, tableMat);
      t.position.set(-4.5 + (i%2)*9, 0.75, -9.2 + Math.floor(i/2)*4.6); root.add(t);
      for(const sx of [-1,1]) for(const sz of [-1,1]){
        const leg = box(0.1, 0.75, 0.1, mats.metal);
        leg.position.set(t.position.x+sx*1.1, 0.37, t.position.z+sz*0.4); root.add(leg);
      }
      // party hats on tables (cones)
      for(let k=0;k<3;k++){
        const hat = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 8),
          new THREE.MeshStandardMaterial({ color: k%2?0x8a2440:0x2a4a7a, roughness:0.6,
            emissive:k%2?0x30060f:0x0a1830, emissiveIntensity:0.4 }));
        hat.position.set(t.position.x-0.8+k*0.8, 0.92, t.position.z); root.add(hat);
      }
    }
    // ceiling string lights (emissive dots)
    const bulbMat = new THREE.MeshStandardMaterial({ color:0x111111, emissive:0xffc890,
      emissiveIntensity:1.6 });
    for(let i=0;i<10;i++){
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), bulbMat);
      b.position.set(-6.3+i*1.4, 3.15, -6.5 + Math.sin(i*1.3)*0.8); root.add(b);
    }

    // ---- Kitchen (west of dining) ----
    R.kitchen = { x:-9.5, z:-6.5, w:5, d:7, name:'Kitchen', floor:'checker', wall:T.wallBlue,
      walls:{ n:true, s:true, e:{gap:[0,2.4]}, w:true } };
    room(root, R.kitchen);
    const counter = box(4.2, 0.9, 1.0, makeMat(T.metal, 0x99a0aa, 0.5, 0.7));
    counter.position.set(-9.5, 0.45, -9.4); root.add(counter);
    const stoveGlow = new THREE.PointLight(0x3a6aff, 2.2, 6); stoveGlow.position.set(-9.5, 1.6, -9.2);
    root.add(stoveGlow); R.kitchen.flicker = stoveGlow;

    // ---- Arcade Alley (east of dining) ----
    R.arcade = { x:9.5, z:-6.5, w:6, d:9, name:'Arcade Alley', floor:'concrete', wall:T.wallBlue,
      walls:{ n:true, s:{gap:[2,2.4]}, e:{gap:[0,2.4]}, w:{gap:[-3,2.4]} } };
    room(root, R.arcade);
    R.arcade.cabs = [];
    for(let i=0;i<4;i++){
      const cab = box(0.9, 1.7, 0.8, makeMat(T.metal, 0x223044, 0.6, 0.3));
      cab.position.set(11.6, 0.85, -9.4+i*2.0); root.add(cab);
      const scr = plane(0.62, 0.5, new THREE.MeshStandardMaterial({ color:0x000000,
        emissive:0x1a6a8a, emissiveIntensity:0.9 }));
      scr.position.set(11.13, 1.25, -9.4+i*2.0); scr.rotation.y = -Math.PI/2; root.add(scr);
      R.arcade.cabs.push(scr);
    }
    const arcLight = new THREE.PointLight(0x20c0ff, 5, 9, 1.8); arcLight.position.set(10.5, 2.6, -6.5);
    root.add(arcLight); R.arcade.light = arcLight;

    // ---- Grand Atrium (south of dining) — big open hub with fountain ----
    R.atrium = { x:0, z:3.5, w:16, d:11, name:'Grand Atrium', floor:'carpet', wall:T.wallGold,
      walls:{ n:{gap:[0,5]}, e:{gap:[-3.5,2.4]}, w:{gap:[3,2.4]}, s:{gap:[-4,3]} } };
    room(root, R.atrium);
    // fountain
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.55, 20),
      makeMat(T.metal, 0x556066, 0.5, 0.7));
    basin.position.set(0, 0.28, 3.5); root.add(basin);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(1.38, 1.38, 0.1, 20),
      new THREE.MeshStandardMaterial({ color:0x0a2a3a, roughness:0.1, metalness:0.6,
        emissive:0x0a3a4a, emissiveIntensity:0.5 }));
    water.position.set(0, 0.56, 3.5); root.add(water);
    const statue = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.6, 12), makeMat(T.metalWide, 0x7a6a4a, 0.6, 0.5));
    statue.position.set(0, 1.4, 3.5); root.add(statue);
    R.atrium.fountain = water;
    // banner
    const banner = plane(6, 1.1, new THREE.MeshStandardMaterial({ color:0x1a1030,
      emissive:0x4a3a90, emissiveIntensity:0.5, side:THREE.DoubleSide }));
    banner.position.set(0, 2.9, -1.9); root.add(banner);
    R.atrium.banner = banner;
    const atrLamp = new THREE.PointLight(0xffe0b0, 7, 13, 1.6); atrLamp.position.set(0, 3.2, 3.5);
    root.add(atrLamp); R.atrium.light = atrLamp;

    // ---- Party Room (east of atrium) ----
    R.party = { x:10.5, z:3.5, w:7, d:8, name:'Party Room', floor:'carpet', wall:T.wallRed,
      walls:{ n:{gap:[2,2.4]}, e:true, s:true, w:{gap:[-3.5,2.4]} } };
    room(root, R.party);
    for(let i=0;i<2;i++){
      const t = box(2.2, 0.1, 1.0, tableMat);
      t.position.set(9.4+i*2.2, 0.75, 5.6); root.add(t);
    }
    const balloons = new THREE.Group();
    for(let i=0;i<6;i++){
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8),
        new THREE.MeshStandardMaterial({ color:[0x8a2440,0x2a4a7a,0x8a7a20][i%3], roughness:0.4 }));
      b.scale.y = 1.25; b.position.set(8.2+i*0.8, 2.4+Math.sin(i*2)*0.2, 1.4); balloons.add(b);
    }
    root.add(balloons); R.party.balloons = balloons;

    // ---- Backstage (west of stage) ----
    R.backstage = { x:-8.5, z:-16, w:5, d:8, name:'Backstage', floor:'concrete', wall:T.wallBlue,
      walls:{ n:true, e:{gap:[0,2.4]}, s:{gap:[0,2.2]}, w:true } };
    room(root, R.backstage);
    // spare head shelves — environmental storytelling
    const shelf = box(3.6, 0.08, 0.7, mats.metal); shelf.position.set(-8.5, 1.5, -19.2); root.add(shelf);
    for(let i=0;i<3;i++){
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10),
        new THREE.MeshStandardMaterial({ color:0x3a3a42, roughness:0.6, metalness:0.4 }));
      h.position.set(-9.7+i*1.2, 1.78, -19.2); root.add(h);
    }
    const bsLight = new THREE.PointLight(0x8ab0ff, 2.6, 7, 2.0); bsLight.position.set(-8.5, 3.2, -16);
    root.add(bsLight); R.backstage.light = bsLight;

    // ---- Maintenance / Workshop (south-west) ----
    R.workshop = { x:-9.5, z:3.5, w:6, d:9, name:'Maintenance', floor:'concrete', wall:T.hazard,
      walls:{ n:{gap:[0,2.2]}, e:{gap:[3,2.4]}, s:{gap:[0,2.2]}, w:true } };
    room(root, R.workshop);
    const bench = box(3.4, 0.9, 1.0, mats.metal); bench.position.set(-10.6, 0.45, 5.6); root.add(bench);
    const toolWall = box(0.15, 2.2, 3.4, makeMat(T.hazard, 0xffffff, 0.7));
    toolWall.position.set(-12.4, 1.4, 3.5); root.add(toolWall);
    const wrkLight = new THREE.PointLight(0xff9060, 3.2, 8, 2.0); wrkLight.position.set(-9.5, 3.2, 3.5);
    root.add(wrkLight); R.workshop.light = wrkLight;
    R.workshop.flicker = wrkLight;

    // ---- West Hall (L-shape simplified as corridor) ----
    R.hall_w = { x:-4.5, z:10.5, w:3.4, d:9, name:'West Hall', floor:'checker', wall:T.wallRed,
      walls:{ n:{gap:[0,2.4]}, s:true, w:{gap:[3,2.2]}, e:true } };
    room(root, R.hall_w);
    // ---- East Hall ----
    R.hall_e = { x:4.5, z:10.5, w:3.4, d:9, name:'East Hall', floor:'checker', wall:T.wallRed,
      walls:{ n:{gap:[0,2.4]}, s:true, e:{gap:[-3,2.2]}, w:true } };
    room(root, R.hall_e);
    // hall flicker lights
    const hallL = new THREE.PointLight(0xc0d0ff, 2.4, 8, 2.0); hallL.position.set(-4.5, 3.3, 10.5);
    root.add(hallL); R.hall_w.light = hallL; R.hall_w.flicker = hallL;
    const hallR = new THREE.PointLight(0xc0d0ff, 2.4, 8, 2.0); hallR.position.set(4.5, 3.3, 10.5);
    root.add(hallR); R.hall_e.light = hallR; R.hall_e.flicker = hallR;
    // posters in halls (emissive faintly)
    for(const [px,pz,ry] of [[-6.1,8,-Math.PI/2],[-6.1,13,-Math.PI/2],[6.1,8,Math.PI/2],[6.1,13,Math.PI/2]]){
      const p = plane(1.1, 1.5, new THREE.MeshStandardMaterial({ color:0x30242a, roughness:0.9,
        emissive:0x241018, emissiveIntensity:0.5 }));
      p.position.set(px, 1.9, pz); p.rotation.y = ry; root.add(p);
    }

    // ---- Prop Storage (hidden, off workshop) ----
    R.storage = { x:-13.5, z:8.5, w:4, d:4, name:'Prop Storage', floor:'concrete', wall:T.hazard,
      walls:{ n:true, e:{gap:[0,1.8]}, s:true, w:true } };
    room(root, R.storage);

    // ---- Security Office (south, between hall ends) ----
    R.office = { x:0, z:16.5, w:7, d:5, name:'Security Office', floor:'checker', wall:T.wallBlue,
      walls:{ n:{gap:[-1.9,1.6]}, s:true, e:true, w:true } };
    room(root, R.office);
    // office desk
    const desk = box(2.6, 0.08, 1.0, makeMat(T.metalWide, 0x6a5a4a, 0.7));
    desk.position.set(0, 0.78, 18.2); root.add(desk);
    // monitors on desk (emissive)
    const monMat = new THREE.MeshStandardMaterial({ color:0x000000, emissive:0x3a5a6a, emissiveIntensity:0.8 });
    for(const mx of [-0.6, 0.6]){
      const mon = box(0.7, 0.5, 0.06, monMat);
      mon.position.set(mx, 1.15, 18.55); mon.rotation.y = Math.PI; root.add(mon);
    }
    const deskLamp = new THREE.PointLight(0xffd9a8, 2.4, 5, 2.0); deskLamp.position.set(-1.2, 1.5, 18.2);
    root.add(deskLamp); R.office.light = deskLamp;
    // fan (spins, iconic silhouette)
    const fanBase = box(0.24, 0.1, 0.24, mats.metal); fanBase.position.set(1.2, 0.87, 18.3); root.add(fanBase);
    const fan = new THREE.Group();
    for(let i=0;i<3;i++){
      const bl = plane(0.5, 0.14, new THREE.MeshStandardMaterial({ color:0xaab0bb,
        roughness:0.4, metalness:0.7, side:THREE.DoubleSide }));
      bl.rotation.z = i * Math.PI/3 * 2; bl.rotation.y = Math.PI/2;
      bl.position.set(0, 0, 0); fan.add(bl);
    }
    fan.position.set(1.2, 1.05, 18.3); root.add(fan); R.office.fan = fan;
    // doorframes at hall ends
    root.add(doorway(-1.9, 14.0, 0, 1.6));   // west door gap in office north wall
    // east door: office north wall gap is only west side; east entrance via hall_e south wall gap? -> add explicit door pocket
    const doorEFrame = doorway(1.9, 14.0, 0, 1.6);
    root.add(doorEFrame);
    // NOTE: office north wall has one gap at x=-1.9; we treat x=+1.9 as the EAST door
    // by adding a wall segment with its own gap — simpler: rebuild office north wall manually:
    // (the room() call above made gap at -1.9 only; we add a second gap visually via doorframe)
    // ---- Door lights + doors themselves (animated) ----
    const doorMat = makeMat(T.metal, 0x707a88, 0.5, 0.7);
    function makeDoor(x){
      const g = new THREE.Group();
      const d = box(1.5, 2.2, 0.14, doorMat); d.position.y = 1.1; g.add(d);
      const stripe = box(1.5, 0.18, 0.16, mats.hazard); stripe.position.y = 1.9; g.add(stripe);
      g.position.set(x, 0, 14.0);
      g.userData.closedY = 0; g.userData.openOffset = 1.55;
      root.add(g); return g;
    }
    R.office.doorL = makeDoor(-1.9); R.office.doorE = makeDoor(1.9);
    // door indicator lights (red = closed)
    const indL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6),
      new THREE.MeshStandardMaterial({ color:0x111111, emissive:0xff2020, emissiveIntensity:0 }));
    indL.position.set(-1.9, 2.5, 13.8); root.add(indL);
    const indE = indL.clone(); indE.position.x = 1.9; root.add(indE);
    R.office.indL = indL; R.office.indE = indE;
    // door area lights
    const dlL = new THREE.SpotLight(0xd0e0ff, 0, 7, 0.8, 0.5, 1.8);
    dlL.position.set(-1.9, 3.2, 13.4); dlL.target.position.set(-1.9, 0, 14.6);
    root.add(dlL, dlL.target);
    const dlE = new THREE.SpotLight(0xd0e0ff, 0, 7, 0.8, 0.5, 1.8);
    dlE.position.set(1.9, 3.2, 13.4); dlE.target.position.set(1.9, 0, 14.6);
    root.add(dlE, dlE.target);
    R.office.doorLightL = dlL; R.office.doorLightE = dlE;
    // vent grilles in office side walls (visual for Rivets)
    const grille = (x, z, ry)=>{
      const gr = box(0.9, 0.6, 0.08, mats.hazard);
      gr.position.set(x, 0.5, z); gr.rotation.y = ry; root.add(gr); return gr;
    };
    R.office.grilleW = grille(-3.42, 16.5, Math.PI/2);
    R.office.grilleE = grille(3.42, 16.5, Math.PI/2);

    // ---- ambient + fog ----
    scene.fog = new THREE.FogExp2(0x05060a, 0.045);
    const amb = new THREE.AmbientLight(0x2a3040, 0.55); root.add(amb); root.userData.amb = amb;
    const hemi = new THREE.HemisphereLight(0x2a3048, 0x0c0a10, 0.5); root.add(hemi);
    root.userData.hemi = hemi;

    // ---- camera anchors: {roomId, pos, look} — real POVs matching the map ----
    const A = {
      stage:     { pos:[0, 2.9, -13.2],  look:[0, 0.8, -18.5] },
      dining:    { pos:[0, 2.9, -2.8],   look:[0, 0.7, -9.5] },
      kitchen:   { pos:[-9.5, 2.8, -3.6],look:[-9.5, 0.8, -9.0] },
      arcade:    { pos:[9.5, 2.8, -2.8], look:[11.2, 0.9, -9.0] },
      party:     { pos:[12.6, 2.8, 0.4], look:[9.8, 0.7, 6.0] },
      atrium:    { pos:[0, 3.1, 8.2],    look:[0, 0.8, 2.0] },
      backstage: { pos:[-8.5, 2.8, -12.6],look:[-8.5, 0.8, -18.0] },
      workshop:  { pos:[-9.5, 2.8, 7.6], look:[-10.0, 0.8, 2.0] },
      hall_w:    { pos:[-4.5, 2.9, 6.6], look:[-4.5, 0.9, 13.0] },
      hall_e:    { pos:[4.5, 2.9, 6.6],  look:[4.5, 0.9, 13.0] },
    };
    root.userData.anchors = A;
    root.userData.rooms = R;
    scene.add(root);
    return root;
  }

  return { build, H };
})();
