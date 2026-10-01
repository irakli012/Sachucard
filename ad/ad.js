import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { sleeveTexture } from './textures.js';

/*
  Sachukardi — 23.5 s hero film, 16:9. Text and card each get their own moment;
  all text is set in Dachi The Lynx.

  Everything on screen is a pure function of the time `t` (seconds): the 3D
  scene, the camera and every word of the typography. That makes the film
  scrubbable in the preview and frame-exact when render.mjs captures it.

     0.0 –  3.2  „მზად ხარ ცვლილებისთვის?“ (text only)
     3.4 –  6.3  „ერთი სასაჩუქრე ბარათი“ (text only)
     6.35 – 13.1 category cards (shopping, clothing, travel …) dealt onto a pile,
                 faster and faster; the real card lands on top and the pile
                 slides in beneath it: every gift in one card
    13.0 – 15.9  „რომლითაც ყველგან გადაიხდი“ (text only)
    15.75 – 19.2 envelope: card into the tray, tray into the sleeve and out;
                 then the whole scene fades away
    19.25 – 23.5 packshot: საჩუქარდი / ყველაფრისთვის, რისი ყიდვაც გინდა
                 + www.payunicard.ge / 0322 555 222

  The card and envelope choreography below is written on the original 10 s
  clock ("scene time"); setWorld() maps film time onto it, slowed down.
*/

const DURATION = 23.5;
const TL = {
  // the card moment (see DEAL) is authored from 4.7 s; it now plays DEAL_SHIFT later
  dealShift: 1.65,
  card0: 6.35,                  // = 4.7 + dealShift
  cardExit: [12.65, 13.1],      // the card leaves before the third message
  env0: 15.75, envRate: 1.2,    // scene 6.9 … 9.3 →  film 15.75 … 18.63
  envFade: [18.9, 19.2],      // envelope scene fades to navy
  pack: 19.25,
};
const FPS = 30;
const params = new URLSearchParams(location.search);
// ?format=9x16 renders the vertical (Instagram Reels) adaptation: the same
// film, with only the spatial layout (camera framing, text size / line
// breaks, packshot spacing) adapted to 1080 × 1920
const PORTRAIT = params.get('format') === '9x16';
const W = PORTRAIT ? 1080 : 1920, H = PORTRAIT ? 1920 : 1080;
if (PORTRAIT) document.documentElement.classList.add('portrait');

const RENDER = params.has('render');
const SAMPLES = Math.max(1, Number(params.get('samples') || (RENDER ? 8 : 1)));
const SHUTTER = 0.42; // fraction of a frame the virtual shutter stays open
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
  tray: new THREE.Color('#8FAE2A'), // matte, a step deeper than the mockup's lime so it doesn't glow
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
    uT: { value: 0 }, uGlow: { value: 1 }, uStudio: { value: 0 }, uAsp: { value: W / H },
    uBase: { value: C.navy }, uDeep: { value: C.deep },
    uC1: { value: C.green }, uC2: { value: C.lime }, uC3: { value: C.mint }, uC4: { value: C.forest },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.999, 1.0); }`,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform float uT, uGlow, uStudio, uAsp;
    vec2 cx(float x, float y) { return vec2(x * uAsp / 1.7778, y); } // landscape layout → any aspect
    uniform vec3 uBase, uDeep, uC1, uC2, uC3, uC4;
    float blob(vec2 p, vec2 c, float r) { vec2 d = p - c; return exp(-dot(d, d) / (r * r)); }
    void main() {
      vec2 p = vUv; p.x *= uAsp;
      vec3 col = mix(uDeep, uBase, smoothstep(-0.2, 1.1, vUv.y));
      vec3 glow = vec3(0.0);
      glow += uC4 * blob(p, cx(0.35 + 0.30 * sin(uT * 0.55), 0.30 + 0.18 * cos(uT * 0.40)), 0.65) * 0.9;
      glow += uC1 * blob(p, cx(1.35 + 0.35 * cos(uT * 0.47), 0.62 + 0.20 * sin(uT * 0.63)), 0.5) * 0.25;
      glow += uC2 * blob(p, cx(0.95 + 0.50 * sin(uT * 0.36 + 1.3), 0.95 + 0.10 * sin(uT * 0.8)), 0.35) * 0.10;
      glow += uC3 * blob(p, cx(0.20 + 0.25 * cos(uT * 0.5 + 2.0), 0.85), 0.30) * 0.08;
      col += glow * uGlow * 0.28;
      vec3 studio = mix(vec3(0.0025, 0.003, 0.005), vec3(0.020, 0.024, 0.032), blob(p, cx(0.89, 0.65), 0.95));
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

/* the real card — the supplied PNG, with only the "....1234" placeholder
   removed (painted over with the card's own flat face colour, sampled from
   the image itself so no seam can show). Nothing else is touched. */
const cardReady = (async () => {
  const img = new Image();
  img.src = '/images/card-face.png';
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const g = cv.getContext('2d');
  g.drawImage(img, 0, 0);
  const [r, gg, b] = g.getImageData(40, 850, 1, 1).data;
  g.fillStyle = `rgb(${r}, ${gg}, ${b})`;
  g.fillRect(66, 808, 300, 96); // digits sit at x 79–352, y 823–889
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  frontMat.map = tex;
  frontMat.needsUpdate = true;
})();
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

/* ---------- the deck: single-purpose category cards ----------
   Dealt onto a pile one after another; then the real card lands on top and
   the pile slides in beneath it: every kind of gift, in one card. */
const ICONS = {
  bag: 'M9 15 H39 L41.5 43 A3 3 0 0 1 38.5 46 H9.5 A3 3 0 0 1 6.5 43 Z M17 15 V11 A7 7 0 0 1 31 11 V15',
  gamepad: 'M14 16 H34 A9 9 0 0 1 43 25 V31 A6 6 0 0 1 32 34 L29 31 H19 L16 34 A6 6 0 0 1 5 31 V25 A9 9 0 0 1 14 16 Z M14 21 V29 M10 25 H18 M31 24 H31.01 M35 28 H35.01',
  plane: 'M24 4 C26 4 27 6 27 9 V19 L43 28 V32 L27 27 V38 L32 42 V45 L24 43 L16 45 V42 L21 38 V27 L5 32 V28 L21 19 V9 C21 6 22 4 24 4 Z',
  food: 'M13 6 V16 A5 5 0 0 0 18 21 V43 M23 6 V16 A5 5 0 0 1 18 21 M18 6 V16 M34 22 C29 22 27 18 27 14 A7 8 0 0 1 41 14 C41 18 39 22 34 22 Z M34 22 V43',
  beauty: 'M14 44 H26 V26 H14 Z M16 26 V16 A2 2 0 0 1 18 14 H22 A2 2 0 0 1 24 16 V26 M32 44 H42 V30 A5 5 0 0 0 39 25 V20 H35 V25 A5 5 0 0 0 32 30 Z',
  phone: 'M15 5 H33 A3 3 0 0 1 36 8 V40 A3 3 0 0 1 33 43 H15 A3 3 0 0 1 12 40 V8 A3 3 0 0 1 15 5 Z M21 37 H27',
  ticket: 'M7 17 H43 V24 A4 4 0 0 0 43 32 V39 H7 V32 A4 4 0 0 0 7 24 Z M25 21 V35',
  cart: 'M5 9 H11 L16.5 33 H38 L43 17 H13.5 M23 41 A3 3 0 1 0 17 41 A3 3 0 1 0 23 41 M39 41 A3 3 0 1 0 33 41 A3 3 0 1 0 39 41',
};
const DECK = [
  { label: 'შოპინგი', icon: 'bag', hue: 82 },
  { label: 'გართობა', icon: 'gamepad', hue: 330 },
  { label: 'მოგზაურობა', icon: 'plane', hue: 200 },
  { label: 'რესტორნები', icon: 'food', hue: 28 },
  { label: 'თავის მოვლა', icon: 'beauty', hue: 295 },
  { label: 'ტექნიკა', icon: 'phone', hue: 225 },
  { label: 'კინო და ღონისძიებები', icon: 'ticket', hue: 355 },
  { label: 'სუპერმარკეტი', icon: 'cart', hue: 150 },
];

function categoryTexture({ label, icon, hue }) {
  const w = 1024, h = Math.round(1024 / CW);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  const lin = g.createLinearGradient(0, 0, w, h);
  lin.addColorStop(0, `hsl(${hue}, 46%, 54%)`);
  lin.addColorStop(1, `hsl(${hue + 30}, 42%, 36%)`);
  g.fillStyle = lin;
  g.fillRect(0, 0, w, h);
  const glow = g.createRadialGradient(w * 0.2, h * 0.15, 0, w * 0.2, h * 0.15, w * 0.8);
  glow.addColorStop(0, 'rgba(255,255,255,0.2)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, w, h);
  g.save();
  g.translate(w * 0.075, h * 0.1);
  g.scale(5.2, 5.2);
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 2.4;
  g.lineCap = g.lineJoin = 'round';
  g.stroke(new Path2D(ICONS[icon]));
  g.restore();
  g.fillStyle = '#ffffff';
  g.font = '400 84px "Dachi The Lynx", sans-serif';
  const maxW = w * 0.85; // long labels ("კინო და ღონისძიებები") shrink to fit
  const size = Math.min(84, (84 * maxW) / g.measureText(label).width);
  g.font = `400 ${size.toFixed(1)}px "Dachi The Lynx", sans-serif`;
  g.fillText(label, w * 0.075, h * 0.87);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const deckEdgeGeo = new THREE.ExtrudeGeometry(cardShape, { depth: CD, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2, curveSegments: 16 });
deckEdgeGeo.translate(0, 0, -CD / 2);
const deckFaceGeo = faceGeometry(cardShape, CW, CH);
const deckBackGeo = faceGeometry(cardShape, CW, CH);
deckBackGeo.rotateY(Math.PI);
const deck = DECK.map((c) => {
  const face = new THREE.MeshPhysicalMaterial({ roughness: 0.42, metalness: 0.02, clearcoat: 0.45, clearcoatRoughness: 0.22, envMapIntensity: 0.4 });
  const tone = new THREE.Color(`hsl(${c.hue + 30}, 36%, 30%)`);
  const card = new THREE.Group();
  const f = new THREE.Mesh(deckFaceGeo, face);
  f.position.z = CD / 2 + 0.0025;
  const b = new THREE.Mesh(deckBackGeo, new THREE.MeshPhysicalMaterial({ color: tone, roughness: 0.5 }));
  b.position.z = -CD / 2 - 0.0025;
  const e = new THREE.Mesh(deckEdgeGeo, new THREE.MeshPhysicalMaterial({ color: tone, roughness: 0.45, metalness: 0.15 }));
  for (const m of [f, b, e]) { m.castShadow = true; m.receiveShadow = true; }
  card.add(e, f, b);
  card.visible = false;
  scene.add(card);
  return { card, face, data: c };
});
// labels need the brand font, so the faces are painted once it has loaded
const deckReady = document.fonts.load('400 84px "Dachi The Lynx"').then(() => {
  for (const d of deck) { d.face.map = categoryTexture(d.data); d.face.needsUpdate = true; }
});

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
const trayMat = new THREE.MeshStandardMaterial({ color: C.tray, roughness: 0.9, metalness: 0, envMapIntensity: 0.3, transparent: true });
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

// the hero after the collapse
function heroSoloPose(t) {
  const spin = E.expoInOut(seg(t, 4.75, 5.7)) * Math.PI * 2;
  const sway = seg(t, 5.55, 6.0);
  return {
    x: 0, y: 1.6, z: 0,
    rx: 0.14 * Math.sin(t * 0.9) * sway - 0.05,
    ry: spin + 0.34 * Math.sin((t - 5.7) * 1.1) * sway,
    rz: -0.05 * sway,
  };
}
const mixPose = (a, b, p) => ({
  x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), z: lerp(a.z, b.z, p),
  rx: lerp(a.rx, b.rx, p), ry: lerp(a.ry, b.ry, p), rz: lerp(a.rz, b.rz, p),
});

// tray travel along its slide (0 = inside the sleeve)
function trayOut(t) {
  // pulled out far enough that the whole pocket clears the sleeve's edge, so
  // the card can settle into it without touching the sleeve
  const outFull = 1.88, rest = 1.12;
  if (t < 7.95) return outFull;
  if (t < 8.45) return lerp(outFull, 0, E.inOut(seg(t, 7.95, 8.42)));
  return lerp(0, rest, E.expoOut(seg(t, 8.5, 9.3)));
}
const pocketX = (t) => SLEEVE_X + trayOut(t) + POCKET_X;
const SEAT_Y = TB + CD / 2 + 0.0035;

function heroPose(t) {
  if (t < 6.9) return heroSoloPose(t);
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
  [7.7, [0.5, 3.9, 2.45], [0.55, 0.05, 0.14]],
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

/* camera: landscape uses the authored framing as is. Vertical keeps the same
   path, but uses a slightly wider lens pulled back, showing `share` of the
   landscape frame's width, so the subject fits the narrow frame. */
function frameCamera(p, l, fov, share, lookX) {
  lookV.set(PORTRAIT && lookX != null ? lookX : l[0], l[1], l[2]);
  if (!PORTRAIT) {
    camera.fov = fov;
    camera.position.set(p[0], p[1], p[2]);
  } else {
    const wide = fov + 12;
    const m = (share * (16 / 9) * Math.tan(THREE.MathUtils.degToRad(fov / 2))) / ((9 / 16) * Math.tan(THREE.MathUtils.degToRad(wide / 2)));
    camera.fov = wide;
    camera.position.set(lookV.x + (p[0] - l[0]) * m, lookV.y + (p[1] - l[1]) * m, lookV.z + (p[2] - l[2]) * m);
  }
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
}

/* ---------- the world at scene time t ---------- */
// mode: 'env' | 'bare' (background only, for the text moments)
function sceneAt(t, real, mode) {
  bgMat.uniforms.uT.value = real;
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
  rimGreen.intensity = 11 * (1 - studio); // off in the envelope scene: it left a green spot on the card
  rimMint.intensity = 10 * (1 - studio);
  key.intensity = 1.6 + 1.2 * studio;

  const p = hermite(CAM, t, 1), l = hermite(CAM, t, 2);
  // vertical: the whole envelope fits the width; the view follows its centre
  // (further right while the tray is fully out, back as it closes)
  frameCamera(p, l, 35, 1.12, lerp(0.28, -0.05, E.inOut(seg(t, 7.95, 9.3))));
  camera.up.set(Math.sin(t * 0.9) * 0.05 * (1 - studio), 1, 0).normalize();
  camera.lookAt(lookV);

  if (mode === 'bare') {
    hero.visible = false;
    envelope.visible = false;
    floor.visible = false;
    for (const d of deck) d.card.visible = false;
    bgMat.uniforms.uGlow.value = 1;
    bgMat.uniforms.uStudio.value = 0;
  } else {
    hero.visible = true;
  }
}

/* ---------- the card moment (film time) ---------- */
const DEAL = {
  start: 4.8,
  gaps: [0.55, 0.5, 0.45, 0.4, 0.34, 0.29, 0.25, 0.22], // speeds up as it goes
  fly: 0.6,
  heroIn: [8.3, 9.1],     // the real card flies in last and lands on top
  collapse: [9.15, 9.65], // the pile squares up and slides in beneath it
  spin: [9.8, 10.75],
};
const dealStart = [];
{ let s = DEAL.start; for (const g of DEAL.gaps) { dealStart.push(s); s += g; } }
const PILE_Y = 1.6, STEP = 0.022;
const HERO_Z = DECK.length * STEP + 0.02;
const deckLand = (() => {
  const r = rng(11);
  return DECK.map((_, i) => ({ x: (r() - 0.5) * 0.28, y: PILE_Y + (r() - 0.5) * 0.18, z: i * STEP, rx: 0, ry: (r() - 0.5) * 0.1, rz: (r() - 0.5) * 0.3 }));
})();
const deckFrom = DECK.map((_, i) => {
  const side = i % 2 ? 1 : -1;
  return { x: side * 3.6, y: PILE_Y + ((i % 3) - 1) * 0.8, z: 1.0, rx: 0.5, ry: side * 1.4, rz: side * 0.9 };
});
const DEAL_CAM = [
  [4.7, [1.4, 2.4, 3.6], [0, 1.55, 0]],
  [6.5, [0.9, 2.2, 3.35], [0, 1.58, 0]],
  [8.2, [0.5, 2.0, 3.15], [0, 1.6, 0]],
  [9.1, [0.15, 1.82, 3.2], [0, 1.62, 0.05]],
  [10.2, [-0.4, 1.76, 3.3], [0, 1.6, 0]],
  [11.45, [0.2, 1.8, 3.4], [0, 1.6, 0]],
];

// A card flying onto the pile: it glides in and finishes turning while still
// hovering a little in front of the pile, and only then settles down onto it,
// so a card that's still turning can never cut through the one below.
function landing(from, to, t, t0, dur) {
  const move = E.expoOut(seg(t, t0, t0 + dur));
  const turn = E.expoOut(seg(t, t0, t0 + dur * 0.7));
  const settle = E.inOut(seg(t, t0 + dur * 0.55, t0 + dur + 0.08));
  return {
    x: lerp(from.x, to.x, move),
    y: lerp(from.y, to.y, move),
    z: lerp(from.z, to.z, move) + (1 - settle) * 0.12,
    rx: lerp(from.rx, to.rx, turn),
    ry: lerp(from.ry, to.ry, turn),
    rz: lerp(from.rz, to.rz, turn),
  };
}

function dealWorld(t) {
  bgMat.uniforms.uT.value = t;
  bgMat.uniforms.uGlow.value = 1;
  bgMat.uniforms.uStudio.value = 0;
  floor.visible = false;
  envelope.visible = false;
  rimGreen.intensity = 11;
  rimMint.intensity = 10;
  key.intensity = 1.6;

  const squared = E.inOut(seg(t, DEAL.collapse[0], DEAL.collapse[1]));
  deck.forEach(({ card }, i) => {
    const t0 = dealStart[i];
    let p = landing(deckFrom[i], deckLand[i], t, t0, DEAL.fly);
    const under = { x: 0, y: PILE_Y, z: HERO_Z - 0.03 - (DECK.length - i) * 0.002, rx: 0, ry: 0, rz: 0 };
    p = mixPose(p, under, E.inOut(seg(t, DEAL.collapse[0] + i * 0.02, DEAL.collapse[1])));
    card.position.set(p.x, p.y, p.z);
    card.rotation.set(p.rx, p.ry, p.rz);
    card.scale.setScalar(1 - 0.03 * squared);
    card.visible = t >= t0 && t < DEAL.collapse[1] + 0.05;
  });

  // the real card: flies in last, flipping, and lands square on top
  const land = { x: 0, y: PILE_Y, z: HERO_Z, rx: 0, ry: 0, rz: 0 };
  const hp = landing({ x: 2.4, y: 3.0, z: 1.4, rx: 0.8, ry: -Math.PI * 2 - 0.6, rz: 0.6 }, land, t, DEAL.heroIn[0], DEAL.heroIn[1] - DEAL.heroIn[0]);
  const sway = seg(t, 10.55, 11.0);
  hp.ry += E.expoInOut(seg(t, DEAL.spin[0], DEAL.spin[1])) * Math.PI * 2 + 0.3 * Math.sin((t - 10.75) * 1.1) * sway;
  hp.rx += 0.12 * Math.sin(t * 0.9) * sway;
  hero.position.set(hp.x, hp.y, hp.z);
  hero.rotation.set(hp.rx, hp.ry, hp.rz);
  hero.visible = t >= DEAL.heroIn[0];

  // a light sweep as it lands
  const s = seg(t, 9.0, 9.9);
  shineMat.uniforms.uPos.value = lerp(-0.45, 1.55, E.inOut(s));
  shineMat.uniforms.uStr.value = 0.3 * Math.sin(Math.PI * s);

  const p = hermite(DEAL_CAM, t, 1), l = hermite(DEAL_CAM, t, 2);
  // vertical: the card stays the hero, with breathing room either side
  frameCamera(p, l, 38, 0.62);
  camera.up.set(Math.sin(t * 0.7) * 0.03, 1, 0).normalize();
  camera.lookAt(lookV);
}

/* ---------- the world at film time t ---------- */
function setWorld(t) {
  const inCard = t >= TL.card0 && t < TL.cardExit[1];
  const inEnv = t >= TL.env0 && t < TL.envFade[1];
  if (inCard) {
    dealWorld(t - TL.dealShift);
    bgMat.uniforms.uT.value = t; // keep the background drifting on film time
    // exit: it lifts away before the third message
    const x = E.in(seg(t, TL.cardExit[0], TL.cardExit[1]));
    hero.position.y += x * 2.4;
    hero.position.z -= x * 1.2;
    hero.rotation.x -= x * 0.7;
  } else if (inEnv) {
    for (const d of deck) d.card.visible = false;
    sceneAt(Math.min(6.9 + (t - TL.env0) / TL.envRate, 9.5), t, 'env');
    // the card drops in from above before heading for the tray
    const e = E.out(seg(t, TL.env0, TL.env0 + 0.55));
    hero.position.y += (1 - e) * 2.0;
  } else {
    sceneAt(0, t, 'bare');
  }
}

/* ---------- typography ----------
   Transferred from the approved reference (1000081404.mp4):
   - two lines: an off-white line, then the key word in green on its own line
   - each word enters on its own beat, from its own direction:
       below / above: rises or drops into its line through a vertical mask
       right / left:  travels in sideways while being uncovered from its
                      leading edge (a moving wipe), no fade
   - as a word joins its line, the words already there glide sideways so the
     line always stays centred
   - after a hold, the two lines split: the top line exits upward, the green
     line downward, each through its own mask
   No blur, no fades, no zoom. */
const texts = {};
if (PORTRAIT) {
  // one word per line where two don't fit side by side; the green key word
  // stays on its own last line, as in the landscape version
  for (const sel of ['.m2', '.m3']) {
    const ln = document.querySelector(`${sel} .ln`);
    ln.replaceWith(...ln.dataset.words.split(' ').map((w) => {
      const d = document.createElement('div');
      d.className = 'ln';
      d.dataset.words = w;
      return d;
    }));
  }
  const pk2 = document.querySelector('.pk2');
  pk2.removeAttribute('data-words');
  pk2.innerHTML = '<div data-words="ყველაფრისთვის,"></div><div data-words="რისი ყიდვაც გინდა"></div>';
}
document.querySelectorAll('[data-words]').forEach((el) => {
  el.innerHTML = el.dataset.words
    .split(' ')
    .map((w) => `<span class="w"><span class="wi">${w}</span></span>`)
    .join('<span class="sp"></span>');
});

const ENTER = 0.7;       // one word's entrance
const TRAVEL = 380;      // sideways travel (px) of a word coming from the left/right
const EXIT = 0.45;       // the lines' split exit
const expo = (p) => 1 - Math.pow(1 - p, 4); // a smooth, gentle ease-out

// the three messages: [entrance time, direction] per word (line 1 then line 2)
const MESSAGES = [
  { sel: '.m1', beats: [[0.35, 'below'], [0.8, 'right'], [1.25, 'left']], out: 2.75 },
  { sel: '.m2', beats: [[3.45, 'left'], [3.9, 'above'], [4.35, 'right']], out: 5.8 },
  { sel: '.m3', beats: [[13.05, 'below'], [13.5, 'left'], [13.95, 'below']], out: 15.4 },
];

function wordAt(wi, dir, e) {
  // e: 0 → 1 entrance progress (eased)
  let x = 0, y = 0, clip = 'inset(-20% 0 -20% 0)';
  const rest = 1 - e;
  if (dir === 'below') y = 150 * rest; // far enough to start fully inside the mask
  if (dir === 'above') y = -150 * rest;
  if (dir === 'right') { x = TRAVEL * rest; clip = `inset(-20% ${(rest * 100).toFixed(2)}% -20% 0)`; }
  if (dir === 'left') { x = -TRAVEL * rest; clip = `inset(-20% 0 -20% ${(rest * 100).toFixed(2)}%)`; }
  return { x, y, clip };
}

const LINE_MAX = PORTRAIT ? 940 : 1680; // widest a line may be
function setupMessage({ sel, beats, out }) {
  const box = document.querySelector(sel);
  // shrink the whole message if its widest line would run past LINE_MAX
  const widest = Math.max(...Array.from(box.querySelectorAll('.ln')).map((ln) => Array.from(ln.children).reduce((s, n) => s + n.getBoundingClientRect().width, 0)));
  if (widest > LINE_MAX) {
    const fs = parseFloat(getComputedStyle(box).fontSize), lh = parseFloat(getComputedStyle(box).lineHeight);
    box.style.fontSize = `${(fs * LINE_MAX) / widest}px`;
    box.style.lineHeight = `${(lh * LINE_MAX) / widest}px`;
  }
  // vertical: centre the block a little above the middle (clear of the Reels UI)
  if (PORTRAIT) box.style.top = `${Math.round(H * 0.46 - box.offsetHeight / 2)}px`;
  const lines = Array.from(box.querySelectorAll('.ln')).map((ln) => {
    const ws = Array.from(ln.querySelectorAll('.w'));
    const left = ws[0].offsetLeft;
    const rights = ws.map((w) => w.offsetLeft + w.offsetWidth - left); // prefix widths
    return { ln, words: ws.map((w) => w.firstElementChild), full: rights[rights.length - 1], rights };
  });
  // assign the beats to the words in reading order
  let k = 0;
  for (const L of lines) L.beats = L.words.map(() => beats[k++]);
  return { box, lines, out, first: beats[0][0] };
}

function setMessage(m, t) {
  const visible = t >= m.first - 0.02 && t <= m.out + EXIT + 0.05;
  m.box.style.display = visible ? '' : 'none'; // (a word's own visibility would override a hidden parent)
  if (!visible) return;
  const ex = E.inOut(seg(t, m.out, m.out + EXIT));
  m.lines.forEach((L, li) => {
    // keep the words that have arrived centred on the line
    let shift = (L.full - L.rights[0]) / 2;
    L.words.forEach((wi, i) => {
      const [t0, dir] = L.beats[i];
      const e = expo(seg(t, t0, t0 + ENTER));
      if (i > 0) shift += ((L.full - L.rights[i]) / 2 - (L.full - L.rights[i - 1]) / 2) * e;
      const p = wordAt(wi, dir, e);
      const exitY = (li < m.lines.length - 1 ? -150 : 150) * ex; // split: white line(s) up, green line down
      wi.style.transform = `translate(${p.x.toFixed(2)}px, ${(p.y + exitY).toFixed(2)}%)`;
      wi.style.clipPath = p.clip;
      wi.style.visibility = t >= t0 ? 'visible' : 'hidden';
    });
    L.ln.style.transform = `translateX(${shift.toFixed(2)}px)`;
  });
}

// packshot: restrained; every word rises into place from below, no exit
function riseWords(list, t, starts, dur = 0.5) {
  list.forEach((wi, i) => {
    const e = expo(seg(t, starts[i], starts[i] + dur));
    wi.style.transform = `translateY(${(150 * (1 - e)).toFixed(2)}%)`;
    wi.style.clipPath = 'none';
    wi.style.visibility = t >= starts[i] ? 'visible' : 'hidden';
  });
}

function setupText() {
  texts.messages = MESSAGES.map(setupMessage);
  texts.pk1 = Array.from(document.querySelectorAll('.pk1 .wi'));
  texts.pk2 = Array.from(document.querySelectorAll('.pk2 .wi'));
  texts.contact = document.querySelector('.contact');
  texts.fade = document.querySelector('.fade');
  texts.black = document.querySelector('.black');
  texts.grain = document.querySelector('.grain');
}

function setText(t) {
  for (const m of texts.messages) setMessage(m, t);

  // envelope scene → navy → packshot
  const fadeIn = E.inOut(seg(t, TL.envFade[0], TL.envFade[1]));
  const fadeOut = E.inOut(seg(t, TL.pack, TL.pack + 0.35));
  texts.fade.style.opacity = Math.min(fadeIn, 1 - fadeOut).toFixed(3);

  // packshot: the brand word first, then the line word by word, then contacts
  riseWords(texts.pk1, t, [19.4], 0.75);
  riseWords(texts.pk2, t, [20.05, 20.18, 20.31, 20.44], 0.65);
  texts.contact.style.opacity = E.inOut(seg(t, 21.1, 21.5)).toFixed(3);

  // up from black at the start, down to black at the end
  const black = Math.max(1 - E.out(seg(t, 0, 0.35)), E.inOut(seg(t, DURATION - 0.65, DURATION - 0.05)));
  texts.black.style.opacity = black.toFixed(3);

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

const ready = Promise.all([document.fonts.ready, cardReady, envReady, deckReady]).then(async () => {
  setupText();
  dealWorld(8.6); // the pile and the real card on screen, so every shader compiles up front
  await renderer.compileAsync?.(scene, camera);
  setWorld(0);
});

window.__ready = ready.then(() => true);
window.__seek = (t) => { renderFrame(t); return true; };
window.__meta = { duration: DURATION, fps: FPS, width: W, height: H };

if (!RENDER) {
  fitStage();
  window.addEventListener('resize', fitStage);
  const scrub = document.getElementById('scrub');
  scrub.max = String(DURATION);
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
