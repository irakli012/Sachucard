import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { sleeveTexture } from './textures.js';

/*
  Sachukardi — 10 s hero film, 16:9.

  Everything on screen is a pure function of the time `t` (seconds): the 3D
  scene, the camera and every glyph of the typography. That makes the film
  scrubbable in the preview and frame-exact when render.mjs captures it.

    0.0 – 2.0  the real card alone: macro, light sweep, pull-back
               "მზად ხარ ცვლილებისთვის?"
    2.0 – 3.8  colour cards shuffle out behind it into a prismatic cascade
               "ერთი სასაჩუქრე ბარათი, რომლითაც ყველგან გადაიხდი."
    3.8 – 5.0  the cascade closes back into the one real card, which spins
    5.2 – 6.9  hero card, "საჩუქარდი — ყველაფრისთვის, რისი ყიდვაც გინდა."
    6.9 – 8.4  the card flies down into the envelope's tray; the tray slides
               into the sleeve
    8.4 – 10   the tray slides back out: packshot + www.payunicard.ge / phone
*/

const DURATION = 10;
const FPS = 30;
const W = 1920, H = 1080;

const params = new URLSearchParams(location.search);
const RENDER = params.has('render');
const SAMPLES = Math.max(1, Number(params.get('samples') || (RENDER ? 8 : 1)));
const SHUTTER = 0.55; // fraction of a frame the virtual shutter stays open
if (RENDER) document.documentElement.classList.add('render');

/* ---------- small math kit ---------- */
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, p) => a + (b - a) * p;
const E = {
  inOut: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  out: (p) => 1 - Math.pow(1 - p, 3),
  in: (p) => p * p * p,
  expoOut: (p) => (p === 1 ? 1 : 1 - Math.pow(2, -10 * p)),
  expoInOut: (p) => (p === 0 ? 0 : p === 1 ? 1 : p < 0.5 ? Math.pow(2, 20 * p - 10) / 2 : (2 - Math.pow(2, -20 * p + 10)) / 2),
  backOut: (p) => 1 + 2.2 * Math.pow(p - 1, 3) + 1.2 * Math.pow(p - 1, 2),
};
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/* ---------- palette (linear, via THREE.Color) ---------- */
const C = {
  navy: new THREE.Color('#10131F'),
  deep: new THREE.Color('#080A11'),
  green: new THREE.Color('#90C850'),
  lime: new THREE.Color('#B6D639'),
  mint: new THREE.Color('#D6F5A8'),
  forest: new THREE.Color('#2F6B45'),
  slate: new THREE.Color('#1B1F2D'),
  tray: new THREE.Color('#A8CC2E'),
};

/* ---------- renderer & passes ---------- */
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// the scene renders linear HDR into rtScene; SAMPLES sub-frames are averaged
// into rtAccum (real motion blur); a final pass tone-maps it to the screen
const rtScene = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const rtAccum = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType });
const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quadGeo = new THREE.PlaneGeometry(2, 2);
const accumMat = new THREE.MeshBasicMaterial({
  map: rtScene.texture, transparent: true, blending: THREE.AdditiveBlending,
  depthTest: false, depthWrite: false, toneMapped: false,
});
const accumScene = new THREE.Scene();
accumScene.add(new THREE.Mesh(quadGeo, accumMat));
const outScene = new THREE.Scene();
outScene.add(new THREE.Mesh(quadGeo, new THREE.MeshBasicMaterial({ map: rtAccum.texture, depthTest: false, depthWrite: false })));

/* ---------- scene ---------- */
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;

const camera = new THREE.PerspectiveCamera(35, W / H, 0.05, 60);

const key = new THREE.DirectionalLight(0xffffff, 2.4);
key.position.set(-2.6, 6, 3.2);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -3; key.shadow.camera.right = 3;
key.shadow.camera.top = 3; key.shadow.camera.bottom = -3;
key.shadow.camera.near = 1; key.shadow.camera.far = 14;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.01;
scene.add(key);
const rimGreen = new THREE.PointLight(C.lime, 18, 9);
rimGreen.position.set(2.4, 2.6, -1.4);
scene.add(rimGreen);
const rimMint = new THREE.PointLight(C.mint, 10, 8);
rimMint.position.set(-2.8, 1.0, 1.6);
scene.add(rimMint);

/* background: drifting brand-colour light fields → dark studio */
const bgMat = new THREE.ShaderMaterial({
  depthTest: false, depthWrite: false,
  uniforms: {
    uT: { value: 0 }, uGlow: { value: 1 }, uStudio: { value: 0 },
    uBase: { value: C.navy }, uDeep: { value: C.deep },
    uC1: { value: C.green }, uC2: { value: C.lime }, uC3: { value: C.mint }, uC4: { value: C.forest },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.999, 1.0); }`,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform float uT, uGlow, uStudio;
    uniform vec3 uBase, uDeep, uC1, uC2, uC3, uC4;
    float blob(vec2 p, vec2 c, float r) { vec2 d = p - c; return exp(-dot(d, d) / (r * r)); }
    void main() {
      vec2 p = vUv; p.x *= 1.7778;
      vec3 col = mix(uDeep, uBase, smoothstep(-0.2, 1.1, vUv.y));
      vec3 glow = vec3(0.0);
      glow += uC4 * blob(p, vec2(0.35 + 0.30 * sin(uT * 0.55), 0.30 + 0.18 * cos(uT * 0.40)), 0.65) * 0.9;
      glow += uC1 * blob(p, vec2(1.35 + 0.35 * cos(uT * 0.47), 0.62 + 0.20 * sin(uT * 0.63)), 0.5) * 0.25;
      glow += uC2 * blob(p, vec2(0.95 + 0.50 * sin(uT * 0.36 + 1.3), 0.95 + 0.10 * sin(uT * 0.8)), 0.35) * 0.10;
      glow += uC3 * blob(p, vec2(0.20 + 0.25 * cos(uT * 0.5 + 2.0), 0.85), 0.30) * 0.08;
      col += glow * uGlow * 0.28;
      vec3 studio = mix(vec3(0.0025, 0.003, 0.005), vec3(0.020, 0.024, 0.032), blob(p, vec2(0.89, 0.65), 0.95));
      col = mix(col, studio, uStudio);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
const bg = new THREE.Mesh(quadGeo, bgMat);
bg.frustumCulled = false;
bg.renderOrder = -1000;
scene.add(bg);

const floorMat = new THREE.MeshStandardMaterial({ color: '#171b24', roughness: 0.92, metalness: 0, transparent: true, opacity: 0 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.001;
floor.receiveShadow = true;
scene.add(floor);

/* ---------- card geometry ---------- */
const CW = 1.586, CH = 1, CR = 0.075, CD = 0.012;

function roundedRect(w, h, r, cx = 0, cy = 0) {
  const s = new THREE.Shape();
  const x = cx - w / 2, y = cy - h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function faceGeometry(shape, w, h) {
  const g = new THREE.ShapeGeometry(shape, 16);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  return g;
}
const cardShape = roundedRect(CW, CH, CR);

/* the real card — its artwork is the supplied PNG, untouched */
const texLoader = new THREE.TextureLoader();
const cardReady = new Promise((resolve) => {
  texLoader.load('/images/card-face.png', (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    frontMat.map = tex;
    frontMat.needsUpdate = true;
    resolve();
  });
});
// kept low-gloss: a strong specular lobe washes the navy face out to grey
const frontMat = new THREE.MeshPhysicalMaterial({ roughness: 0.5, metalness: 0, specularIntensity: 0.3, clearcoat: 0.18, clearcoatRoughness: 0.3, envMapIntensity: 0.22 });
const backMat = new THREE.MeshPhysicalMaterial({ color: C.navy, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.35, envMapIntensity: 0.35 });
const edgeMat = new THREE.MeshPhysicalMaterial({ color: '#1d2233', roughness: 0.35, metalness: 0.3, envMapIntensity: 0.8 });

const hero = new THREE.Group();
{
  const edgeGeo = new THREE.ExtrudeGeometry(cardShape, { depth: CD, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2, curveSegments: 16 });
  edgeGeo.translate(0, 0, -CD / 2);
  const edge = new THREE.Mesh(edgeGeo, edgeMat);
  const front = new THREE.Mesh(faceGeometry(cardShape, CW, CH), frontMat);
  front.position.z = CD / 2 + 0.0025;
  const backGeo = faceGeometry(cardShape, CW, CH);
  backGeo.rotateY(Math.PI);
  const back = new THREE.Mesh(backGeo, backMat);
  back.position.z = -CD / 2 - 0.0025;
  for (const m of [edge, front, back]) { m.castShadow = true; m.receiveShadow = true; }
  hero.add(edge, front, back);
}
// a light sweep across the face: additive light only, the artwork underneath
// is never altered
const shineMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uPos: { value: -1 }, uStr: { value: 0 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    varying vec2 vUv; uniform float uPos, uStr;
    void main() {
      float d = (vUv.x * 0.8 + vUv.y * 0.45) - uPos;
      float band = exp(-d * d * 55.0) + 0.4 * exp(-(d - 0.14) * (d - 0.14) * 500.0);
      gl_FragColor = vec4(vec3(1.0, 1.0, 0.94) * band * uStr, 1.0);
    }`,
});
{
  const shine = new THREE.Mesh(faceGeometry(cardShape, CW, CH), shineMat);
  shine.position.z = CD / 2 + 0.0032;
  hero.add(shine);
}
scene.add(hero);

/* colour cards: solid, glossy cards with a gradient face. The hue walks
   along the deck (lime → teal → blue → violet → pink → orange) so the
   cascade reads as one prismatic sweep. */
function gradientTexture(h1, h2) {
  const w = 800, h = Math.round(800 / CW);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  const lin = g.createLinearGradient(0, 0, w, h);
  lin.addColorStop(0, `hsl(${h1}, 88%, 62%)`);
  lin.addColorStop(1, `hsl(${h2}, 82%, 48%)`);
  g.fillStyle = lin;
  g.fillRect(0, 0, w, h);
  const glow = g.createRadialGradient(w * 0.22, h * 0.18, 0, w * 0.22, h * 0.18, w * 0.75);
  glow.addColorStop(0, 'rgba(255,255,255,0.35)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, w, h);
  const shade = g.createRadialGradient(w, h, 0, w, h, w * 0.8);
  shade.addColorStop(0, 'rgba(10,12,30,0.35)');
  shade.addColorStop(1, 'rgba(10,12,30,0)');
  g.fillStyle = shade;
  g.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const SLOTS = 15, HERO_SLOT = 0; // the real card is the top of the deck
const colorEdgeGeo = new THREE.ExtrudeGeometry(cardShape, { depth: CD, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2, curveSegments: 16 });
colorEdgeGeo.translate(0, 0, -CD / 2);
const colorFaceGeo = faceGeometry(cardShape, CW, CH);
const colorBackGeo = faceGeometry(cardShape, CW, CH);
colorBackGeo.rotateY(Math.PI);
const ghosts = [];
for (let i = 0; i < SLOTS; i++) {
  if (i === HERO_SLOT) { ghosts.push(null); continue; }
  const hue = 78 + (i - 1) * 23;
  const face = new THREE.MeshPhysicalMaterial({
    map: gradientTexture(hue, hue + 38),
    roughness: 0.32, metalness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.15, envMapIntensity: 0.55,
  });
  const edge = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(`hsl(${hue + 38}, 70%, 42%)`), roughness: 0.35, metalness: 0.2 });
  const card = new THREE.Group();
  const f = new THREE.Mesh(colorFaceGeo, face);
  f.position.z = CD / 2 + 0.0025;
  const b = new THREE.Mesh(colorBackGeo, face);
  b.position.z = -CD / 2 - 0.0025;
  const ed = new THREE.Mesh(colorEdgeGeo, edge);
  for (const m of [f, b, ed]) m.castShadow = true;
  card.add(ed, f, b);
  scene.add(card);
  ghosts.push(card);
}

/* ---------- envelope: sleeve + lime tray (from the supplied mockup) ---------- */
const SW = 1.9, SH = 1.24, ST = 0.04;          // sleeve
const TW = 1.84, TH = 1.16, TT = 0.035, TB = 0.008; // tray, base plate
const POCKET_X = -0.07;                         // pocket centre within the tray
const SLEEVE_X = -0.62;

function notchedRect(w, h, r, notchR) {
  const s = new THREE.Shape();
  const x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2;
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, -notchR);
  s.absarc(x1, 0, notchR, -Math.PI / 2, Math.PI / 2, true); // thumb notch
  s.lineTo(x1, y1 - r); s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1); s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}
function flatExtrude(shape, depth, bevel = 0.003) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 24 });
  g.rotateX(-Math.PI / 2); // lie flat: extrusion points up (+y), shape +y → world −z
  return g;
}

const envelope = new THREE.Group();
const envMats = [];
const sleeveTop = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.86, metalness: 0, transparent: true });
const sleeveSide = new THREE.MeshStandardMaterial({ color: '#121314', roughness: 0.8, transparent: true });
const trayMat = new THREE.MeshStandardMaterial({ color: C.tray, roughness: 0.72, metalness: 0, transparent: true });
envMats.push(sleeveTop, sleeveSide, trayMat);

const sleeve = new THREE.Mesh(flatExtrude(notchedRect(SW, SH, 0.02, 0.16), ST - 0.006), [sleeveTop, sleeveSide]);
sleeve.position.set(SLEEVE_X, 0.003, 0);
sleeve.castShadow = true; sleeve.receiveShadow = true;

const tray = new THREE.Group();
{
  const outer = notchedRect(TW, TH, 0.03, 0.12);
  const frameShape = notchedRect(TW, TH, 0.03, 0.12);
  frameShape.holes.push(roundedRect(CW + 0.02, CH + 0.02, CR + 0.008, POCKET_X, 0));
  const base = new THREE.Mesh(flatExtrude(outer, TB, 0), trayMat);
  const frame = new THREE.Mesh(flatExtrude(frameShape, TT - TB - 0.004, 0.002), trayMat);
  frame.position.y = TB;
  for (const m of [base, frame]) { m.castShadow = true; m.receiveShadow = true; }
  tray.add(base, frame);
}
envelope.add(tray, sleeve);
scene.add(envelope);

const envReady = sleeveTexture({ width: SW, height: SH, slogan: 'ყველაფრისთვის, რისი ყიდვაც გინდა.' }).then((tex) => {
  tex.repeat.set(1 / SW, 1 / SH);
  tex.offset.set(0.5, 0.5);
  sleeveTop.map = tex;
  sleeveTop.needsUpdate = true;
});

/* ---------- choreography ---------- */

// 1 — the real card on its own, turning slowly under a light sweep
function showPose(t) {
  const p = E.inOut(seg(t, 0, 2.0));
  return { x: 0, y: 1.6, z: 0, rx: lerp(0.3, 0.05, p), ry: lerp(-0.7, 0.22, p), rz: lerp(-0.12, 0.02, p) };
}

// 2 — the cascade: the real card at the front-left, every glass card a step
// further right and deeper along a diagonal, all angled the same way, with a
// wave rippling down the row (the "many possibilities" shot)
function fanPose(k, t) {
  const wave = Math.sin(t * 3.4 - k * 0.55);
  return {
    x: -1.05 + k * 0.29,
    y: 1.6 + k * 0.032 + 0.045 * wave,
    z: -k * 0.21,
    rx: 0.06 * wave,
    ry: -0.32 + k * 0.022 + 0.11 * wave,
    rz: -0.03 + k * 0.004,
  };
}
// the straightened stack, facing camera: the real card in front, every glass
// card behind it with its edge peeking out, so the artwork is never tinted
function stackPose(k) {
  const d = Math.abs(k);
  return { x: k * 0.014, y: 1.6 + k * 0.01, z: -d * 0.12, rx: 0, ry: 0, rz: k * 0.008 };
}
// the hero after the collapse
function heroSoloPose(t) {
  const spin = E.expoInOut(seg(t, 4.75, 5.7)) * Math.PI * 2;
  const sway = seg(t, 5.55, 6.0);
  return {
    x: 0, y: 1.6, z: 0,
    rx: 0.1 * Math.sin(t * 0.9) * sway - 0.04,
    ry: spin + 0.28 * Math.sin((t - 5.7) * 1.1) * sway,
    rz: -0.05 * sway,
  };
}
const mixPose = (a, b, p) => ({
  x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), z: lerp(a.z, b.z, p),
  rx: lerp(a.rx, b.rx, p), ry: lerp(a.ry, b.ry, p), rz: lerp(a.rz, b.rz, p),
});

// tray travel along its slide (0 = inside the sleeve)
function trayOut(t) {
  const outFull = 1.72, rest = 1.12;
  if (t < 7.95) return outFull;
  if (t < 8.45) return lerp(outFull, 0, E.inOut(seg(t, 7.95, 8.42)));
  return lerp(0, rest, E.expoOut(seg(t, 8.5, 9.3)));
}
const pocketX = (t) => SLEEVE_X + trayOut(t) + POCKET_X;
const SEAT_Y = TB + CD / 2 + 0.0035;

function slotPose(k, t) {
  const d = Math.abs(k);
  // the real card: showoff, then it takes its place in the fan
  const heroP = mixPose(showPose(t), fanPose(0, t), E.inOut(seg(t, 1.85, 2.75)));
  let p = heroP;
  let entry = 1;
  if (k !== 0) {
    // shuffle: each glass card slides out from behind the real one, nearest first
    const start = 1.95 + d * 0.045;
    const behind = { ...heroP, z: heroP.z - 0.03 - d * 0.004 };
    p = mixPose(behind, fanPose(k, t), E.expoOut(seg(t, start, start + 0.8)));
    entry = seg(t, start, start + 0.18);
  }
  // fan → stack (real card in front)
  p = mixPose(p, stackPose(k), E.inOut(seg(t, 3.75 + d * 0.02, 4.45 + d * 0.01)));
  // stack → one card
  const one = k === 0 ? heroSoloPose(t) : { ...heroSoloPose(t), z: -0.03 - d * 0.003 };
  p = mixPose(p, one, E.inOut(seg(t, 4.45 + d * 0.012, 4.95)));
  return { pose: p, entry };
}

function heroPose(t) {
  if (t < 6.9) return slotPose(0, t).pose;
  const from = heroSoloPose(6.9);
  const fly = seg(t, 6.9, 7.55);
  const f = E.inOut(fly);
  const seat = seg(t, 7.55, 7.92);
  const px = pocketX(t);
  // a gentle arc down to just above the pocket, then slide in and settle
  const above = { x: px + 0.34, y: 0.34, z: 0.0 };
  let x = lerp(from.x, above.x, f);
  let y = lerp(from.y, above.y, f) + Math.sin(f * Math.PI) * 0.25;
  let z = lerp(from.z, above.z, f) + Math.sin(f * Math.PI) * 0.35;
  if (t >= 7.55) {
    const s = E.out(seat);
    x = lerp(above.x, px, s);
    y = lerp(above.y, SEAT_Y, E.inOut(seat));
    z = 0;
  }
  const turn = E.inOut(seg(t, 6.95, 7.6));
  return {
    x, y, z,
    rx: lerp(from.rx, -Math.PI / 2, turn),
    ry: lerp(from.ry, Math.PI * 2, turn),
    rz: lerp(from.rz, 0, turn) + Math.sin(turn * Math.PI) * 0.25,
  };
}

/* camera path: Hermite spline through keyed positions/targets */
const CAM = [
  [0.0, [0.78, 1.8, 1.05], [0.3, 1.63, 0]],     // macro on the card
  [1.0, [0.38, 1.72, 1.85], [0.08, 1.65, 0]],
  [1.9, [0.05, 1.66, 3.0], [0, 1.8, 0]],         // whole card, room for text above
  [2.8, [0.85, 1.9, 3.05], [-0.15, 1.84, -0.45]], // arc round as the deck fans out
  [3.7, [0.3, 1.8, 3.35], [-0.2, 1.82, -0.35]],
  [4.45, [0.0, 1.64, 3.55], [0, 1.62, 0]],
  [5.2, [0.55, 1.72, 3.35], [0, 1.44, 0]],
  [6.1, [-0.45, 1.78, 3.3], [0, 1.42, 0]],
  [6.9, [0.05, 2.3, 3.35], [0.05, 1.3, 0]],
  [7.7, [0.4, 3.9, 2.45], [0.45, 0.05, 0.14]],
  [8.4, [0.35, 3.75, 2.25], [0.32, 0, 0.2]],
  [10.0, [0.3, 3.45, 2.0], [0.3, 0, 0.26]],
];
function hermite(keys, t, idx) {
  const n = keys.length;
  let i = 0;
  while (i < n - 2 && t > keys[i + 1][0]) i++;
  const [t0, ...a0] = [keys[i][0], ...keys[i][idx]];
  const [t1, ...a1] = [keys[i + 1][0], ...keys[i + 1][idx]];
  const h = t1 - t0, s = clamp((t - t0) / h);
  const tan = (j) => {
    const prev = keys[Math.max(0, j - 1)], next = keys[Math.min(n - 1, j + 1)];
    const dt = next[0] - prev[0] || 1;
    return next[idx].map((v, c) => (v - prev[idx][c]) / dt);
  };
  const m0 = tan(i), m1 = tan(i + 1);
  const s2 = s * s, s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
  return a0.map((v, c) => h00 * v + h10 * h * m0[c] + h01 * a1[c] + h11 * h * m1[c]);
}
const lookV = new THREE.Vector3();

/* ---------- the world at time t ---------- */
function setWorld(t) {
  bgMat.uniforms.uT.value = t;
  const studio = E.inOut(seg(t, 6.95, 7.7));
  bgMat.uniforms.uGlow.value = 1 - studio;
  bgMat.uniforms.uStudio.value = studio;
  floorMat.opacity = studio;
  floor.visible = studio > 0.001;

  const envIn = E.out(seg(t, 7.0, 7.55));
  envelope.visible = envIn > 0.001;
  for (const m of envMats) {
    m.opacity = envIn;
    const opaque = envIn >= 1;
    if (m.transparent === opaque) { m.transparent = !opaque; m.needsUpdate = true; }
  }
  envelope.position.y = (1 - envIn) * -0.08;
  tray.position.x = SLEEVE_X + trayOut(t);

  // colour cards (they start and end hidden behind the real card)
  const merge = E.inOut(seg(t, 4.45, 4.95));
  for (let i = 0; i < SLOTS; i++) {
    const g = ghosts[i];
    if (!g) continue;
    const k = i - HERO_SLOT;
    const { pose, entry } = slotPose(k, t);
    g.position.set(pose.x, pose.y, pose.z);
    g.rotation.set(pose.rx, pose.ry, pose.rz);
    g.scale.setScalar(1 - 0.04 * merge);
    g.visible = entry > 0 && t < 4.96;
  }

  const hp = heroPose(t);
  hero.position.set(hp.x, hp.y, hp.z);
  hero.rotation.set(hp.rx, hp.ry, hp.rz);
  // two light sweeps: during the opening showoff and as the spin settles
  const s1 = seg(t, 0.1, 1.6), s2 = seg(t, 5.35, 6.2);
  if (t < 3) {
    shineMat.uniforms.uPos.value = lerp(-0.45, 1.55, E.inOut(s1));
    shineMat.uniforms.uStr.value = 0.32 * Math.sin(Math.PI * s1);
  } else {
    shineMat.uniforms.uPos.value = lerp(-0.45, 1.55, E.inOut(s2));
    shineMat.uniforms.uStr.value = 0.22 * Math.sin(Math.PI * s2);
  }
  // the card rides along with the tray once seated
  if (t >= 7.92) hero.position.x = pocketX(t);

  // lights follow the mood
  rimGreen.intensity = 18 * (1 - studio) + 4;
  rimMint.intensity = 10 * (1 - studio);
  key.intensity = 1.6 + 1.2 * studio;

  const p = hermite(CAM, t, 1), l = hermite(CAM, t, 2);
  camera.position.set(p[0], p[1], p[2]);
  lookV.set(l[0], l[1], l[2]);
  camera.up.set(Math.sin(t * 0.9) * 0.05 * (1 - studio), 1, 0).normalize();
  camera.lookAt(lookV);
}

/* ---------- typography ---------- */
const texts = {};
document.querySelectorAll('[data-text]').forEach((row) => {
  const chars = Array.from(row.dataset.text);
  row.innerHTML = chars.map((c) => (c === ' ' ? '<span class="sp"></span>' : `<span class="ch">${c}</span>`)).join('');
});
function glyphs(sel) { return Array.from(document.querySelectorAll(`${sel} .ch`)); }
function setGlyph(el, { x = 0, y = 0, z = 0, rx = 0, rot = 0, s = 1, blur = 0, o = 1 }) {
  el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${z.toFixed(1)}px) rotateX(${rx.toFixed(1)}deg) rotate(${rot.toFixed(1)}deg) scale(${s.toFixed(3)})`;
  el.style.filter = blur > 0.05 ? `blur(${blur.toFixed(1)}px)` : 'none';
  el.style.opacity = o.toFixed(3);
}

function setupText() {
  const r = rng(42);
  texts.t1 = glyphs('.t1').map((el) => ({ el, dx: (r() - 0.5) * 900, dy: (r() - 0.5) * 520, rot: (r() - 0.5) * 90, z: -300 - r() * 500 }));
  texts.t2a = glyphs('.t2 .row:nth-child(1)');
  texts.t2b = glyphs('.t2 .row:nth-child(2)').map((el) => ({ el, cx: el.offsetLeft + el.offsetWidth / 2 }));
  const row2 = document.querySelector('.t2 .row:nth-child(2)');
  texts.row2 = { left: texts.t2b[0].cx - 40, right: texts.t2b[texts.t2b.length - 1].cx + 40, top: row2.offsetTop + row2.offsetHeight / 2 };
  texts.streak = document.querySelector('.streak');
  texts.t3a = glyphs('.t3 .brand');
  texts.t3b = glyphs('.t3 .row:nth-child(2)');
  texts.t4a = glyphs('.t4 .url');
  texts.t4b = glyphs('.t4 .tel');
  texts.grain = document.querySelector('.grain');
}

function setText(t) {
  // 1 — letters converge out of the cascade, then stream away with it
  texts.t1.forEach(({ el, dx, dy, rot, z }, i) => {
    const pin = E.expoOut(seg(t, 1.1 + i * 0.014, 1.75 + i * 0.014));
    const pout = E.in(seg(t, 2.25 + i * 0.006, 2.5 + i * 0.006));
    const drift = -(t - 1.1) * 18;
    setGlyph(el, {
      x: dx * (1 - pin) + drift - pout * 320, y: dy * (1 - pin), z: z * (1 - pin),
      rot: rot * (1 - pin), blur: (1 - pin) * 16 + pout * 18, o: Math.min(pin * 1.4, 1) * (1 - pout),
    });
  });

  // 2 — line one rises; a light streak writes line two
  texts.t2a.forEach((el, i) => {
    const pin = E.expoOut(seg(t, 2.6 + i * 0.018, 3.2 + i * 0.018));
    const pout = E.in(seg(t, 4.25, 4.5));
    setGlyph(el, { y: (1 - pin) * 70 - pout * 10, rx: (1 - pin) * -85, blur: (1 - pin) * 10 + pout * 14, o: pin * (1 - pout), s: 1 - pout * 0.15 });
  });
  const { left, right, top } = texts.row2;
  const sweep = E.inOut(seg(t, 2.8, 3.45));
  const sx = lerp(left - 300, right + 120, sweep);
  texts.streak.style.transform = `translate(${(sx - 420).toFixed(1)}px, ${(top - texts.streak.parentElement.offsetHeight / 2).toFixed(1)}px)`;
  texts.streak.style.opacity = (Math.sin(Math.PI * sweep) * (t < 3.5 ? 1 : 0)).toFixed(3);
  texts.t2b.forEach(({ el, cx }) => {
    const tPass = lerp(2.8, 3.45, clamp((cx - (left - 300)) / (right + 120 - (left - 300))));
    const pin = E.expoOut(seg(t, tPass - 0.04, tPass + 0.4));
    const pout = E.in(seg(t, 4.25, 4.5));
    setGlyph(el, { x: (1 - pin) * -40 - pout * (cx - 960) * 0.4, blur: (1 - pin) * 12 + pout * 14, o: pin * (1 - pout), s: 1 - pout * 0.2 });
  });

  // 3 — brand drops in, the line settles under it
  texts.t3a.forEach((el, i) => {
    const pin = E.expoOut(seg(t, 5.28 + i * 0.03, 5.95 + i * 0.03));
    const pout = E.in(seg(t, 6.72, 6.95));
    setGlyph(el, { y: (1 - pin) * -60 + pout * 40, rx: (1 - pin) * 90, blur: (1 - pin) * 10 + pout * 12, o: pin * (1 - pout) });
  });
  texts.t3b.forEach((el, i) => {
    const pin = E.expoOut(seg(t, 5.5 + i * 0.012, 6.1 + i * 0.012));
    const pout = E.in(seg(t, 6.72, 6.95));
    setGlyph(el, { y: (1 - pin) * 36 + pout * 40, blur: (1 - pin) * 10 + pout * 12, o: pin * (1 - pout) });
  });

  // 4 — contact, tracks in and holds
  const n4 = texts.t4a.length;
  texts.t4a.forEach((el, i) => {
    const pin = E.expoOut(seg(t, 8.6 + i * 0.012, 9.25 + i * 0.012));
    setGlyph(el, { x: (i - n4 / 2) * 22 * (1 - pin), blur: (1 - pin) * 8, o: pin });
  });
  texts.t4b.forEach((el, i) => {
    const pin = E.expoOut(seg(t, 8.8 + i * 0.015, 9.4 + i * 0.015));
    setGlyph(el, { y: (1 - pin) * 24, blur: (1 - pin) * 6, o: pin });
  });

  const f = Math.floor(t * FPS);
  texts.grain.style.setProperty('--gx', `${(f * 73) % 220}px`);
  texts.grain.style.setProperty('--gy', `${(f * 131) % 220}px`);
}

/* ---------- frame ---------- */
function renderFrame(t) {
  const n = SAMPLES;
  accumMat.opacity = 1 / n;
  renderer.setRenderTarget(rtAccum);
  renderer.setClearColor(0x000000, 1);
  renderer.clear();
  for (let i = 0; i < n; i++) {
    const ts = n === 1 ? t : t + ((i + 0.5) / n - 0.5) * (SHUTTER / FPS);
    setWorld(clamp(ts, 0, DURATION));
    renderer.setRenderTarget(rtScene);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(rtAccum);
    renderer.autoClear = false;
    renderer.render(accumScene, quadCam);
    renderer.autoClear = true;
  }
  renderer.setRenderTarget(null);
  renderer.render(outScene, quadCam);
  setText(t);
}

/* ---------- boot ---------- */
function fitStage() {
  const s = Math.min(window.innerWidth / W, (window.innerHeight - 50) / H);
  const stage = document.getElementById('stage');
  stage.style.top = 'calc(50% - 25px)';
  stage.style.transformOrigin = '50% 50%';
  stage.style.transform = `translate(-50%, -50%) scale(${s})`;
}

const ready = Promise.all([document.fonts.ready, cardReady, envReady]).then(async () => {
  setupText();
  setWorld(0);
  await renderer.compileAsync?.(scene, camera);
});

window.__ready = ready.then(() => true);
window.__seek = (t) => { renderFrame(t); return true; };
window.__meta = { duration: DURATION, fps: FPS, width: W, height: H };

if (!RENDER) {
  fitStage();
  window.addEventListener('resize', fitStage);
  const scrub = document.getElementById('scrub');
  const time = document.getElementById('time');
  const playBtn = document.getElementById('play');
  let playing = true, t = 0, last = performance.now();
  playBtn.addEventListener('click', () => { playing = !playing; playBtn.textContent = playing ? '❚❚' : '▶'; last = performance.now(); });
  scrub.addEventListener('input', () => { t = Number(scrub.value); playing = false; playBtn.textContent = '▶'; });
  const startAt = Number(params.get('t'));
  if (!Number.isNaN(startAt) && params.has('t')) { t = startAt; playing = false; playBtn.textContent = '▶'; }
  ready.then(() => {
    const tick = (now) => {
      if (playing) { t += (now - last) / 1000; if (t > DURATION) t = 0; }
      last = now;
      scrub.value = String(t);
      time.textContent = `${t.toFixed(2)}s`;
      renderFrame(t);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
