// Shared materials library - MeshStandardMaterial with env reflections, pooled.
(function (root) {
  var M = {};
  M.build = function (envMap) {
    var std = function (o) { return new THREE.MeshStandardMaterial(o); };
    M.env = envMap || null;
    var base = { roughness: 0.85, metalness: 0.02, envMap: envMap };
    // ground / rail bed
    M.ballast = std({ color: 0x8d8d96, map: root.Tex.ballast, roughness: 1 });
    M.sleeper = std({ color: 0x9a7a55, map: root.Tex.sleeper, roughness: 0.95 });
    M.rail = std({ color: 0xd8dde4, metalness: 0.95, roughness: 0.28, envMap: envMap });
    M.concrete = std({ color: 0xb8bec6, map: root.Tex.concrete, roughness: 0.92 });
    M.tactile = std({ color: 0xffe066, map: root.Tex.tactile, roughness: 0.8 });
    M.asphalt = std({ color: 0x777a83, map: root.Tex.asphalt, roughness: 0.94 });
    M.grass = std({ color: 0x86c47c, map: root.Tex.grass, roughness: 1 });
    // structures
    M.steelDark = std({ color: 0x3c4452, metalness: 0.75, roughness: 0.42, envMap: envMap });
    M.steelLight = std({ color: 0x9aa5b1, metalness: 0.65, roughness: 0.5, envMap: envMap });
    M.metalWall = std({ color: 0xaeb6bd, map: root.Tex.metal, roughness: 0.7, metalness: 0.35 });
    M.hazard = std({ color: 0xffffff, map: root.Tex.hazard, roughness: 0.75 });
    M.crate = std({ color: 0xc98f4e, roughness: 0.85 });
    M.fenceMat = std({ color: 0xcfd8e2, alphaMap: root.Tex.fence, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, metalness: 0.4, roughness: 0.6 });
    M.glass = std({ color: 0x9fdcff, metalness: 0.9, roughness: 0.12, transparent: true, opacity: 0.55, envMap: envMap });
    M.tunnel = std({ color: 0x8b93a4, map: root.Tex.tunnel, side: THREE.BackSide, roughness: 0.9 });
    M.bridgeSteel = std({ color: 0xc2483f, metalness: 0.5, roughness: 0.55 });
    // emissive signs
    var em = function (map) { return new THREE.MeshStandardMaterial({ color: 0xffffff, map: map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.85, roughness: 0.6 }); };
    M.billboardA = em(root.Tex.billboardA);
    M.billboardB = em(root.Tex.billboardB);
    // train liveries
    M.trainBodyA = std({ color: 0xe8ecf2, metalness: 0.4, roughness: 0.32, envMap: envMap });
    M.trainBodyB = std({ color: 0x2fb3d6, metalness: 0.45, roughness: 0.3, envMap: envMap });
    M.trainBodyC = std({ color: 0xe05a68, metalness: 0.45, roughness: 0.3, envMap: envMap });
    M.trainRoof = std({ color: 0x565e6a, metalness: 0.6, roughness: 0.45 });
    M.trainUnder = std({ color: 0x23272e, metalness: 0.3, roughness: 0.8 });
    M.trainGlass = new THREE.MeshStandardMaterial({ color: 0x18344a, metalness: 0.9, roughness: 0.08, envMap: envMap });
    M.headlight = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff2c0, emissiveIntensity: 2.4 });
    M.taillight = new THREE.MeshStandardMaterial({ color: 0xff3040, emissive: 0xff2030, emissiveIntensity: 2.2 });
    M.grille = std({ color: 0x1c2027, metalness: 0.6, roughness: 0.6 });
    // city buildings: facade textures + emissive windows
    var em = function (map) {
      return new THREE.MeshStandardMaterial({
        color: 0xaab6c6, map: map, emissive: 0xffffff, emissiveMap: map,
        emissiveIntensity: 0.55, roughness: 0.85
      });
    };
    M.facadeA = em(root.Tex.facade);
    M.facadeB = em(root.Tex.facade2);
    // player
    M.skin = std({ color: 0xf2c9a8, roughness: 0.7 });
    M.hair = std({ color: 0x17141f, roughness: 0.55 });
    M.jacket = std({ color: 0x27d5ff, metalness: 0.25, roughness: 0.5, envMap: envMap });
    M.pants = std({ color: 0x2b3140, roughness: 0.8 });
    M.shoe = std({ color: 0xf5f7fa, roughness: 0.6 });
    M.chaserBody = std({ color: 0x37415c, metalness: 0.3, roughness: 0.6 });
    M.chaserAccent = new THREE.MeshStandardMaterial({ color: 0xffb02e, emissive: 0x804d00, emissiveIntensity: 0.7, roughness: 0.5 });
    // collectibles & powerups
    M.coinMat = new THREE.MeshStandardMaterial({ color: 0xffc94d, metalness: 1, roughness: 0.18, envMap: envMap, emissive: 0x664400, emissiveIntensity: 0.55 });
    M.gemMat = new THREE.MeshStandardMaterial({ color: 0x38f8c8, metalness: 0.4, roughness: 0.05, emissive: 0x0e6b52, emissiveIntensity: 1.4, envMap: envMap });
    M.starMat = new THREE.MeshStandardMaterial({ color: 0x63b8ff, metalness: 0.5, roughness: 0.1, emissive: 0x1c4d8a, emissiveIntensity: 1.2 });
    return M;
  };
  root.Mats = M;
})(typeof window !== 'undefined' ? window : globalThis);
