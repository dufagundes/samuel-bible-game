/* Boss Chase — a blocky 3D endless runner (voxel world + LEGO bricks).
 * The player runs in 3 lanes after the boss, who throws LEGO bricks onto the road.
 * This module only draws and moves things; the quiz logic lives in engine.js.
 *
 * createRunner(container, opts) → { start, pause, resume, destroy, left, right, jump, bossHit, bossDefeated, playerHurt }
 * opts: { boss: { name, emoji }, bossIndex, onDodge(), onHit(kind), onCoin() }
 */
import * as THREE from "three";

const LANES = [-2, 0, 2];
const SEG = 10;            // length of one road segment
const SEGS = 9;            // segments kept alive
const BOSS_Z = -15;        // boss runs this far ahead of the player
const GRAV = -34, JUMP_V = 12.5;

// ---------- pixel textures (Minecraft-like, drawn in code) ----------
function pixelTex(draw, size = 16) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function noise(g, s, base, vars, seed) {
  let r = seed || 7;
  const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    g.fillStyle = rnd() < 0.5 ? base : vars[Math.floor(rnd() * vars.length)];
    g.fillRect(x, y, 1, 1);
  }
}
function makeTextures() {
  return {
    grassTop: pixelTex((g, s) => noise(g, s, "#5fb83f", ["#4fa232", "#6cc94a", "#57ad39"], 3)),
    grassSide: pixelTex((g, s) => { noise(g, s, "#8a5a32", ["#7a4e2a", "#9a6a3e", "#6f4626"], 5); g.fillStyle = "#5fb83f"; g.fillRect(0, 0, s, 4); for (let x = 0; x < s; x += 2) g.fillRect(x, 4, 1, 1 + (x % 3)); }),
    dirt: pixelTex((g, s) => noise(g, s, "#8a5a32", ["#7a4e2a", "#9a6a3e", "#6f4626"], 9)),
    road: pixelTex((g, s) => { noise(g, s, "#8e9196", ["#7d8085", "#a0a3a8", "#74777c"], 11); g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(0, s - 1, s, 1); g.fillRect(s - 1, 0, 1, s); }),
    stone: pixelTex((g, s) => { noise(g, s, "#6f7277", ["#5f6267", "#7f8287"], 13); }),
    log: pixelTex((g, s) => { noise(g, s, "#6b4423", ["#5a3a1e", "#7a4f2a"], 17); g.fillStyle = "rgba(0,0,0,.25)"; for (let x = 2; x < s; x += 4) g.fillRect(x, 0, 1, s); }),
    leaves: pixelTex((g, s) => noise(g, s, "#2f8f2f", ["#257a25", "#3aa53a", "#1f6b1f"], 19)),
    sand: pixelTex((g, s) => noise(g, s, "#e6d29a", ["#d9c487", "#efdfae"], 23))
  };
}

// ---------- shared geometry / materials ----------
function lambert(color, map) { return new THREE.MeshLambertMaterial({ color, map: map || null }); }
function box(w, h, d, mat) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); }

// A LEGO brick: box + cylinder studs on top
const STUD_GEO = new THREE.CylinderGeometry(0.17, 0.17, 0.14, 12);
function legoBrick(color, sx, sz, h) {
  const g = new THREE.Group();
  const m = new THREE.MeshPhongMaterial({ color, shininess: 70, specular: 0x444444 });
  const b = box(sx * 0.6, h, sz * 0.6, m); b.position.y = h / 2; g.add(b);
  for (let i = 0; i < sx; i++) for (let j = 0; j < sz; j++) {
    const st = new THREE.Mesh(STUD_GEO, m);
    st.position.set((i - (sx - 1) / 2) * 0.6, h + 0.07, (j - (sz - 1) / 2) * 0.6);
    g.add(st);
  }
  return g;
}
const BRICK_COLORS = [0xd01012, 0x0055bf, 0xffcd03, 0x00852b, 0xfe8a18, 0xffffff];

// A blocky person (player / boss)
function blockPerson(p) {
  const g = new THREE.Group();
  const skin = lambert(p.skin), shirt = lambert(p.shirt), pants = lambert(p.pants);
  const legL = box(0.28, 0.75, 0.28, pants), legR = legL.clone();
  legL.geometry.translate(0, -0.375, 0); // pivot at the hip
  legL.position.set(-0.16, 0.75, 0); legR.position.set(0.16, 0.75, 0);
  const body = box(0.62, 0.75, 0.34, shirt); body.position.y = 1.125;
  const armL = box(0.22, 0.72, 0.22, p.armSkin ? skin : shirt); armL.geometry.translate(0, -0.33, 0);
  const armR = armL.clone();
  armL.position.set(-0.43, 1.45, 0); armR.position.set(0.43, 1.45, 0);
  // head with a simple pixel face
  const faceTex = pixelTex((c, s) => {
    c.fillStyle = p.skinCss; c.fillRect(0, 0, s, s);
    c.fillStyle = p.hairCss; c.fillRect(0, 0, s, 4);
    c.fillStyle = "#ffffff"; c.fillRect(3, 7, 3, 2); c.fillRect(10, 7, 3, 2);
    c.fillStyle = p.eyeCss || "#2a4d9b"; c.fillRect(4, 7, 2, 2); c.fillRect(11, 7, 2, 2);
    c.fillStyle = "#8a4b3a"; c.fillRect(6, 11, 4, 1);
  }, 16);
  const hair = lambert(p.hair);
  const headMats = [skin, skin, hair, skin, lambert(0xffffff, faceTex), skin]; // +x,-x,+y,-y,+z(face),-z
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.56, 0.56), headMats);
  head.position.y = 1.8;
  g.add(legL, legR, body, armL, armR, head);
  if (p.hat) { const hat = box(0.66, p.hatH || 0.18, 0.66, lambert(p.hat)); hat.position.y = 2.12 + (p.hatH || 0.18) / 2 - 0.05; g.add(hat);
    if (p.crown) for (let i = -1; i <= 1; i++) { const sp = box(0.12, 0.2, 0.12, lambert(p.hat)); sp.position.set(i * 0.24, 2.36, 0.28); g.add(sp); } }
  g.userData = { legL, legR, armL, armR, head };
  return g;
}
const BOSS_LOOKS = [
  { shirt: 0x8d8d8d, pants: 0x5a4632, skin: 0xd9a066, skinCss: "#d9a066", hair: 0x3b2a1a, hairCss: "#3b2a1a", hat: 0x9aa0a6, hatH: 0.3, eyeCss: "#3a2a1a" },          // Goliath (armour)
  { shirt: 0xf2f2f2, pants: 0x1f4fbf, skin: 0xb8814f, skinCss: "#b8814f", hair: 0x1a1a1a, hairCss: "#1a1a1a", hat: 0xffcd03, hatH: 0.34, crown: true },              // Pharaoh
  { shirt: 0xb3171b, pants: 0x6d6d6d, skin: 0xe0b58c, skinCss: "#e0b58c", hair: 0x4a3020, hairCss: "#4a3020", hat: 0xb0b4b8, hatH: 0.24 },                           // Roman soldier
  { shirt: 0x6a2c91, pants: 0x3d1a55, skin: 0xe0b58c, skinCss: "#e0b58c", hair: 0x2b1b10, hairCss: "#2b1b10", hat: 0xffcd03, hatH: 0.2, crown: true },              // Herod
  { shirt: 0x1f5f3a, pants: 0x222222, skin: 0xd9a066, skinCss: "#d9a066", hair: 0x111111, hairCss: "#111111", hat: 0x111111, hatH: 0.34 },                           // Haman
  { shirt: 0xc0392b, pants: 0xffcd03, skin: 0xc68a55, skinCss: "#c68a55", hair: 0x1a1a1a, hairCss: "#1a1a1a", hat: 0xffcd03, hatH: 0.24, crown: true },              // Nebuchadnezzar
  { shirt: 0x7a4a24, pants: 0x4a2c14, skin: 0xc68a55, skinCss: "#c68a55", hair: 0x222222, hairCss: "#222222" }                                                        // prophets of Baal
];
const DRAGON_LOOK = { shirt: 0xb3171b, pants: 0x7a0d0f, skin: 0xd01012, skinCss: "#d01012", hair: 0xffcd03, hairCss: "#ffcd03", hat: 0x7a0d0f, hatH: 0.2, crown: true, eyeCss: "#ffcd03", armSkin: true };

export function webglAvailable() {
  try { const c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl"))); }
  catch (e) { return false; }
}

export function createRunner(container, opts) {
  const tex = makeTextures();
  const W = () => container.clientWidth || 360, H = () => container.clientHeight || 520;
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(W(), H());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fd3ff);
  scene.fog = new THREE.Fog(0x8fd3ff, 28, 78);
  const camera = new THREE.PerspectiveCamera(62, W() / H(), 0.1, 140);
  camera.position.set(0, 4.3, 6.2);
  camera.lookAt(0, 1.2, -6);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6a8f4a, 1.05));
  const sun = new THREE.DirectionalLight(0xffffff, 0.9); sun.position.set(6, 12, 8); scene.add(sun);

  // ---------- road segments ----------
  const M = {
    road: lambert(0xffffff, tex.road), stone: lambert(0xffffff, tex.stone),
    grassTop: lambert(0xffffff, tex.grassTop), grassSide: lambert(0xffffff, tex.grassSide), dirt: lambert(0xffffff, tex.dirt),
    log: lambert(0xffffff, tex.log), leaves: lambert(0xffffff, tex.leaves)
  };
  function texBox(w, h, d, mats, repeat) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mm = mats.map((m) => { const c = m.clone(); if (c.map) { c.map = c.map.clone(); c.map.needsUpdate = true; c.map.repeat.set(repeat[0], repeat[1]); } return c; });
    return new THREE.Mesh(geo, mm);
  }
  const segments = [];
  function decorate(seg) {
    seg.userData.deco.forEach((d) => seg.remove(d));
    seg.userData.deco = [];
    for (const side of [-1, 1]) {
      const r = Math.random();
      if (r < 0.55) {            // blocky tree
        const t = new THREE.Group();
        const h = 2 + Math.floor(Math.random() * 2);
        const trunk = box(0.9, h, 0.9, M.log); trunk.position.y = h / 2; t.add(trunk);
        const lv = box(2.7, 1.8, 2.7, M.leaves); lv.position.y = h + 0.6; t.add(lv);
        const lv2 = box(1.5, 0.9, 1.5, M.leaves); lv2.position.y = h + 1.9; t.add(lv2);
        t.position.set(side * (6 + Math.random() * 3), 0, -Math.random() * SEG);
        seg.add(t); seg.userData.deco.push(t);
      } else if (r < 0.85) {     // LEGO house
        const hs = new THREE.Group();
        const col = BRICK_COLORS[Math.floor(Math.random() * 5)];
        const base = legoBrick(col, 4, 3, 1.8); hs.add(base);
        const roof = legoBrick(0xd01012 === col ? 0x0055bf : 0xd01012, 4, 3, 0.5); roof.position.y = 1.8; hs.add(roof);
        const door = box(0.6, 1.0, 0.05, lambert(0x6b4423)); door.position.set(0, 0.5, 0.92); hs.add(door);
        hs.position.set(side * (6.4 + Math.random() * 2.5), 0, -Math.random() * SEG);
        hs.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        seg.add(hs); seg.userData.deco.push(hs);
      }
    }
  }
  for (let i = 0; i < SEGS; i++) {
    const seg = new THREE.Group();
    const road = texBox(7, 1, SEG, [M.stone, M.stone, M.road, M.road, M.stone, M.stone], [7, SEG]);
    road.position.set(0, -0.5, -SEG / 2);
    const grassL = texBox(10, 1, SEG, [M.grassSide, M.grassSide, M.grassTop, M.dirt, M.grassSide, M.grassSide], [10, SEG]);
    grassL.position.set(-8.5, -0.45, -SEG / 2);
    const grassR = grassL.clone(); grassR.position.x = 8.5;
    // road edge blocks
    const edgeL = texBox(0.5, 0.35, SEG, [M.stone, M.stone, M.stone, M.stone, M.stone, M.stone], [1, SEG]); edgeL.position.set(-3.5, 0.1, -SEG / 2);
    const edgeR = edgeL.clone(); edgeR.position.x = 3.5;
    seg.add(road, grassL, grassR, edgeL, edgeR);
    seg.userData.deco = [];
    seg.position.z = -i * SEG + SEG;
    decorate(seg);
    scene.add(seg); segments.push(seg);
  }

  // ---------- player ----------
  const player = blockPerson({ shirt: 0x00a650, pants: 0x1d3f8f, skin: 0xf2c28d, skinCss: "#f2c28d", hair: 0xc0612b, hairCss: "#c0612b" });
  player.rotation.y = Math.PI;        // back to the camera
  scene.add(player);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.45, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; scene.add(shadow);

  // ---------- boss ----------
  const look = opts.final ? DRAGON_LOOK : BOSS_LOOKS[(opts.bossIndex || 0) % BOSS_LOOKS.length];
  const boss = blockPerson(look);
  boss.scale.setScalar(1.7);
  boss.rotation.y = Math.PI;
  boss.position.set(0, 0, BOSS_Z);
  scene.add(boss);

  // ---------- state ----------
  const S = { running: false, t: 0, speed: 10, lane: 1, x: 0, y: 0, vy: 0, invuln: 0, bossX: 0, bossTargetLane: 1,
    nextThrow: 2.2, nextWall: 3.5, nextCoins: 1.5, raf: 0, last: 0, hurt: 0, bossHurt: 0, dead: false, defeated: false };
  const obstacles = [];     // { mesh, lane, z, h, kind, flying, t, x0, tx, passed }
  const coins = [];

  function addObstacle(o) { scene.add(o.mesh); obstacles.push(o); }
  function throwBrick() {
    const lane = Math.random() < 0.55 ? S.lane : Math.floor(Math.random() * 3);
    const col = BRICK_COLORS[Math.floor(Math.random() * BRICK_COLORS.length)];
    const mesh = legoBrick(col, 2, 2, 0.85);
    mesh.position.set(boss.position.x, 3.6, BOSS_Z);
    addObstacle({ mesh, lane, z: BOSS_Z, h: 0.85, kind: "brick", flying: true, t: 0, x0: boss.position.x, tx: LANES[lane] });
    boss.userData.throwT = 0.35;
  }
  function spawnWall() {
    // tall wall on one or two lanes (switch lanes) or a low bar on one lane (jump)
    const free = Math.floor(Math.random() * 3);
    const tall = Math.random() < 0.55;
    [0, 1, 2].forEach((l) => {
      if (l === free) return;
      if (!tall && Math.random() < 0.5) return;
      const g = new THREE.Group();
      const col = BRICK_COLORS[Math.floor(Math.random() * 5)];
      if (tall) { for (let k = 0; k < 3; k++) { const b = legoBrick(k % 2 ? col : 0xffffff, 3, 1, 0.8); b.position.y = k * 0.8; g.add(b); } }
      else { const b = legoBrick(col, 3, 1, 0.75); g.add(b); }
      g.position.set(LANES[l], 0, -70);
      addObstacle({ mesh: g, lane: l, z: -70, h: tall ? 2.5 : 0.75, kind: tall ? "wall" : "bar", flying: false });
    });
  }
  const COIN_GEO = new THREE.CylinderGeometry(0.32, 0.32, 0.12, 16);
  const COIN_MAT = new THREE.MeshPhongMaterial({ color: 0xffcd03, shininess: 90, specular: 0xffffff, emissive: 0x4a3a00 });
  function spawnCoins() {
    const lane = Math.floor(Math.random() * 3);
    for (let k = 0; k < 5; k++) {
      const c = new THREE.Mesh(COIN_GEO, COIN_MAT);
      c.rotation.x = Math.PI / 2;
      c.position.set(LANES[lane], 0.8, -60 - k * 1.8);
      scene.add(c); coins.push({ mesh: c, lane, z: -60 - k * 1.8 });
    }
  }

  // ---------- input ----------
  function left() { if (S.running && S.lane > 0) S.lane--; }
  function right() { if (S.running && S.lane < 2) S.lane++; }
  function jump() { if (S.running && S.y <= 0.001) S.vy = JUMP_V; }
  const onKey = (e) => {
    if (!S.running) return;
    if (e.key === "ArrowLeft" || e.key === "a") { left(); e.preventDefault(); }
    else if (e.key === "ArrowRight" || e.key === "d") { right(); e.preventDefault(); }
    else if (e.key === "ArrowUp" || e.key === " " || e.key === "w") { jump(); e.preventDefault(); }
  };
  window.addEventListener("keydown", onKey);
  let tx0 = 0, ty0 = 0;
  const onTouchStart = (e) => { const t = e.touches[0]; tx0 = t.clientX; ty0 = t.clientY; };
  const onTouchEnd = (e) => {
    const t = e.changedTouches[0]; const dx = t.clientX - tx0, dy = t.clientY - ty0;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) { jump(); return; }   // a tap jumps
    if (Math.abs(dx) > Math.abs(dy)) (dx < 0 ? left : right)(); else if (dy < 0) jump();
  };
  renderer.domElement.addEventListener("touchstart", onTouchStart, { passive: true });
  renderer.domElement.addEventListener("touchend", onTouchEnd, { passive: true });
  const onResize = () => { renderer.setSize(W(), H()); camera.aspect = W() / H(); camera.updateProjectionMatrix(); };
  window.addEventListener("resize", onResize);

  // ---------- animation helpers ----------
  function animatePerson(p, t, speed, k) {
    const u = p.userData, sw = Math.sin(t * speed) * k;
    u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
    u.armL.rotation.x = -sw * 0.9; u.armR.rotation.x = sw * 0.9;
  }
  function removeObstacle(i) { scene.remove(obstacles[i].mesh); obstacles.splice(i, 1); }

  function step(dt) {
    S.t += dt;
    S.speed = Math.min(19, S.speed + dt * 0.12);
    const move = S.speed * dt;
    // world moves toward the camera
    for (const seg of segments) {
      seg.position.z += move;
      if (seg.position.z - SEG > 8) { // recycle to the back
        const minZ = Math.min(...segments.map((s) => s.position.z));
        seg.position.z = minZ - SEG;
        decorate(seg);
      }
    }
    // player
    S.x += (LANES[S.lane] - S.x) * Math.min(1, dt * 14);
    S.vy += GRAV * dt; S.y += S.vy * dt;
    if (S.y < 0) { S.y = 0; S.vy = 0; }
    player.position.set(S.x, S.y, 0);
    shadow.position.x = S.x; shadow.scale.setScalar(1 - Math.min(0.6, S.y * 0.2));
    animatePerson(player, S.t, 13, S.y > 0 ? 0.25 : 0.9);
    player.rotation.z = (LANES[S.lane] - S.x) * -0.12;
    if (S.invuln > 0) { S.invuln -= dt; player.visible = Math.floor(S.invuln * 12) % 2 === 0; } else player.visible = true;
    // camera follows a little
    camera.position.x += (S.x * 0.45 - camera.position.x) * Math.min(1, dt * 5);
    camera.lookAt(camera.position.x * 0.6, 1.2, -6);
    // boss weaves between lanes and throws bricks
    if (!S.defeated) {
      if (Math.random() < dt * 0.6) S.bossTargetLane = Math.floor(Math.random() * 3);
      S.bossX += (LANES[S.bossTargetLane] - S.bossX) * Math.min(1, dt * 2.5);
      boss.position.x = S.bossX;
      boss.position.y = Math.abs(Math.sin(S.t * 6)) * 0.25;
      animatePerson(boss, S.t, 9, 0.8);
      if (boss.userData.throwT > 0) { boss.userData.throwT -= dt; boss.userData.armR.rotation.x = -2.6; boss.rotation.y = 0; } else boss.rotation.y = Math.PI;
      if (S.bossHurt > 0) { S.bossHurt -= dt; boss.rotation.z = Math.sin(S.bossHurt * 40) * 0.2; } else boss.rotation.z = 0;
      S.nextThrow -= dt;
      if (S.nextThrow <= 0) { throwBrick(); S.nextThrow = Math.max(1.1, 2.6 - S.speed * 0.07) + Math.random() * 0.8; }
    } else {
      boss.position.y -= dt * 3; boss.rotation.x -= dt * 2.5;
    }
    S.nextWall -= dt; if (S.nextWall <= 0) { spawnWall(); S.nextWall = 2.6 + Math.random() * 1.8; }
    S.nextCoins -= dt; if (S.nextCoins <= 0) { spawnCoins(); S.nextCoins = 3 + Math.random() * 2; }
    // obstacles
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      if (o.flying) {           // brick arcs from the boss to its lane
        o.t += dt / 0.7;
        const k = Math.min(1, o.t);
        o.mesh.position.x = o.x0 + (o.tx - o.x0) * k;
        o.mesh.position.y = 3.6 * (1 - k) + Math.sin(k * Math.PI) * 2.5;
        o.mesh.rotation.x += dt * 8; o.mesh.rotation.z += dt * 5;
        o.z = BOSS_Z + k * 4; o.mesh.position.z = o.z;
        if (k >= 1) { o.flying = false; o.mesh.position.y = 0; o.mesh.rotation.set(0, 0, 0); }
        continue;
      }
      o.z += move; o.mesh.position.z = o.z;
      if (!o.passed && Math.abs(o.z) < 0.75 && o.lane === S.lane && S.invuln <= 0 && S.y < o.h - 0.1) {
        removeObstacle(i);
        S.invuln = 1.6; S.speed = Math.max(10, S.speed - 3);
        if (opts.onHit) opts.onHit(o.kind);
        continue;
      }
      if (!o.passed && o.z > 0.9) { o.passed = true; if (opts.onDodge) opts.onDodge(o.kind); }
      if (o.z > 9) removeObstacle(i);
    }
    // coins
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      c.z += move; c.mesh.position.z = c.z; c.mesh.rotation.z += dt * 4;
      if (Math.abs(c.z) < 0.7 && c.lane === S.lane && S.y < 1.6) { scene.remove(c.mesh); coins.splice(i, 1); if (opts.onCoin) opts.onCoin(); continue; }
      if (c.z > 9) { scene.remove(c.mesh); coins.splice(i, 1); }
    }
  }

  function frame(ts) {
    const dt = S.last ? Math.min(0.05, (ts - S.last) / 1000) : 0;
    S.last = ts;
    if (S.running) step(dt);
    renderer.render(scene, camera);
    S.raf = requestAnimationFrame(frame);
  }
  renderer.render(scene, camera);

  return {
    start() { S.running = true; S.last = 0; if (!S.raf) S.raf = requestAnimationFrame(frame); },
    pause() { S.running = false; },
    resume() { S.running = true; S.last = 0; },
    left, right, jump,
    bossHit() { S.bossHurt = 0.5; },
    bossDefeated() { S.defeated = true; obstacles.slice().forEach((o, i) => scene.remove(o.mesh)); obstacles.length = 0; },
    playerHurt() { S.invuln = Math.max(S.invuln, 1.2); },
    destroy() {
      S.running = false; cancelAnimationFrame(S.raf); S.raf = 0;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
  };
}
