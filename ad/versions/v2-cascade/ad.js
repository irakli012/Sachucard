import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { sleeveTexture } from './textures.js';

/*
  Sachukardi — 20 s hero film, 16:9 (v2: text and card each get their own moment).

  Everything on screen is a pure function of the time `t` (seconds): the 3D
  scene, the camera and every word of the typography. That makes the film
  scrubbable in the preview and frame-exact when render.mjs captures it.

     0.0 –  2.5  „მზად ხარ ცვლილებისთვის?“ (text only)
     2.5 –  4.7  „ერთი სასაჩუქრე ბარათი“ (text only)
     4.7 – 11.4  the card: macro showoff → colour cascade → back to one card
    11.4 – 13.6  „რომლითაც ყველგან გადაიხდი“ (text only)
    13.6 – 17.3  envelope: card into the tray, tray into the sleeve and out;
                 then the whole scene fades away
    17.3 – 20.0  packshot: საჩუქარდი / ყველაფრისთვის, რისი ყიდვაც გინდა
                 + www.payunicard.ge / 0322 555 222

  The card and envelope choreography below is written on the original 10 s
  clock ("scene time"); setWorld() maps film time onto it, slowed down.
*/

const DURATION = 20;
const TL = {
  card0: 4.7, cardRate: 1.2,    // scene 0.5 … 5.75 →  film 4.7 … 11.0
  cardFrom: 0.5,                // skip the first half-second of the macro (edge-on)
  cardExit: [11.0, 11.45],      // the card leaves before the third message
  env0: 13.6, envRate: 1.2,     // scene 6.9 … 9.3 →  film 13.6 … 16.48
  envFade: [16.85, 17.3],       // envelope scene fades to navy
  pack: 17.3,
};
const FPS = 30;
const W = 1920, H = 1080;

const params = new URLSearchParams(location.search);
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

/* colour cards: solid, glossy cards with a gradient face. The hue walks
   along the deck (lime → teal → blue → violet → pink → orange) so the
   cascade reads as one prismatic sweep. */
function gradientTexture(h1, h2) {
  const w = 800, h = Math.round(800 / CW);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  const lin = g.createLinearGradient(0, 0, w, h);
  lin.addColorStop(0, `hsl(${h1}, 48%, 55%)`);
  lin.addColorStop(1, `hsl(${h2}, 44%, 40%)`);
  g.fillStyle = lin;
  g.fillRect(0, 0, w, h);
  const glow = g.createRadialGradient(w * 0.22, h * 0.18, 0, w * 0.22, h * 0.18, w * 0.75);
  glow.addColorStop(0, 'rgba(255,255,255,0.22)');
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
  const edge = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(`hsl(${hue + 38}, 40%, 36%)`), roughness: 0.4, metalness: 0.2 });
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

// 1 — the real card on its own, turning slowly under a light sweep
function showPose(t) {
  const p = E.inOut(seg(t, 0, 2.0));
  return { x: 0, y: 1.6, z: 0, rx: lerp(0.38, 0.06, p), ry: lerp(-0.9, 0.3, p), rz: lerp(-0.14, 0.02, p) };
}

// 2 — the cascade: the real card at the front-left, every glass card a step
// further right and deeper along a diagonal, all angled the same way, with a
// wave rippling down the row (the "many possibilities" shot)
function fanPose(k, t) {
  // the ripple runs through the colour cards; the real card only sways gently
  const wave = Math.sin(t * 3.2 - k * 0.55) * (k === 0 ? 0.3 : 1);
  return {
    x: -1.05 + k * 0.3,
    y: 1.6 + k * 0.036 + 0.05 * wave,
    z: -k * 0.32,
    rx: 0.09 * wave,
    ry: -0.42 + k * 0.03 + 0.15 * wave,
    rz: -0.03 + k * 0.004,
  };
}
// the straightened stack, facing camera: the real card in front, every glass
// card behind it with its edge peeking out, so the artwork is never tinted
function stackPose(k) {
  const d = Math.abs(k);
  return { x: k * 0.014, y: 1.6 + k * 0.01, z: -d * 0.17, rx: 0, ry: 0, rz: k * 0.008 };
}
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
// a pose `dist` behind another, along that card's own normal, same rotation:
// parallel to it, so nothing can cut through its face whatever its angle
const _eul = new THREE.Euler();
const _off = new THREE.Vector3();
function behind(p, dist) {
  _off.set(0, 0, -dist).applyEuler(_eul.set(p.rx, p.ry, p.rz));
  return { ...p, x: p.x + _off.x, y: p.y + _off.y, z: p.z + _off.z };
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

// pose ⇄ matrix helpers, for moving a card in another card's frame
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _m3 = new THREE.Matrix4();
const _q0 = new THREE.Quaternion(), _q1 = new THREE.Quaternion(), _qi = new THREE.Quaternion();
const _v0 = new THREE.Vector3(), _v1 = new THREE.Vector3(), _s1 = new THREE.Vector3(1, 1, 1);
const _e = new THREE.Euler();
function poseMatrix(p, out) {
  return out.compose(_v0.set(p.x, p.y, p.z), _q0.setFromEuler(_e.set(p.rx, p.ry, p.rz)), _s1);
}
function matrixPose(m) {
  m.decompose(_v0, _q0, _v1);
  _e.setFromQuaternion(_q0);
  return { x: _v0.x, y: _v0.y, z: _v0.z, rx: _e.x, ry: _e.y, rz: _e.z };
}

function slotPose(k, t) {
  const d = Math.abs(k);
  // the real card: showoff, then (slowly, so its print stays crisp) it takes
  // its place at the head of the cascade
  const heroP = mixPose(showPose(t), fanPose(0, t), E.inOut(seg(t, 1.7, 3.0)));
  let p = heroP;
  let entry = 1;
  if (k !== 0) {
    // shuffle, worked out in the real card's own frame: each colour card
    // starts parallel just behind it and slides out to its cascade slot; its
    // extra turn lags behind its distance, so it can never clip through
    const start = 1.95 + d * 0.045;
    const pe = E.expoOut(seg(t, start, start + 0.8));
    const pr = pe * pe;
    // where the slot sits relative to the head of the cascade
    poseMatrix(fanPose(0, t), _m1).invert();
    poseMatrix(fanPose(k, t), _m2);
    _m3.multiplyMatrices(_m1, _m2).decompose(_v1, _q1, _v0);
    const sep = 0.05 + d * 0.008;
    _v0.set(0, 0, -sep).lerp(_v1, pe);
    _qi.identity().slerp(_q1, pr);
    _m2.compose(_v0, _qi, _s1);
    p = matrixPose(_m3.multiplyMatrices(poseMatrix(heroP, _m1), _m2));
    entry = seg(t, start, start + 0.18);
  }
  // fan → stack (real card in front)
  p = mixPose(p, stackPose(k), E.inOut(seg(t, 3.75 + d * 0.02, 4.45 + d * 0.01)));
  // stack → one card
  const one = k === 0 ? heroSoloPose(t) : behind(heroSoloPose(t), 0.05 + d * 0.005);
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

/* ---------- the world at scene time t ---------- */
// mode: 'card' | 'env' | 'bare' (background only, for the text moments)
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
  rimGreen.intensity = 11 * (1 - studio); // off in the envelope scene: it left a green spot on the card
  rimMint.intensity = 10 * (1 - studio);
  key.intensity = 1.6 + 1.2 * studio;

  const p = hermite(CAM, t, 1), l = hermite(CAM, t, 2);
  lookV.set(l[0], l[1], l[2]);
  if (mode === 'card') {
    // stronger perspective for the card moment: a wider lens pulled in closer
    // frames the card the same size but exaggerates depth and rotation
    camera.fov = 46;
    camera.position.set(l[0] + (p[0] - l[0]) * 0.74, l[1] + (p[1] - l[1]) * 0.74, l[2] + (p[2] - l[2]) * 0.74);
  } else {
    camera.fov = 35;
    camera.position.set(p[0], p[1], p[2]);
  }
  camera.updateProjectionMatrix();
  camera.up.set(Math.sin(t * 0.9) * 0.05 * (1 - studio), 1, 0).normalize();
  camera.lookAt(lookV);

  if (mode === 'bare') {
    hero.visible = false;
    envelope.visible = false;
    floor.visible = false;
    for (const g of ghosts) if (g) g.visible = false;
    bgMat.uniforms.uGlow.value = 1;
    bgMat.uniforms.uStudio.value = 0;
  } else {
    hero.visible = true;
  }
}

/* ---------- the world at film time t ---------- */
function setWorld(t) {
  const inCard = t >= TL.card0 && t < TL.cardExit[1];
  const inEnv = t >= TL.env0 && t < TL.envFade[1];
  if (inCard) {
    sceneAt(clamp(TL.cardFrom + (t - TL.card0) / TL.cardRate, 0, 5.75), t, 'card');
    // entrance: the card swings up into the macro shot
    const e = E.expoOut(seg(t, TL.card0, TL.card0 + 0.9));
    hero.position.y -= (1 - e) * 0.8;
    hero.rotation.x += (1 - e) * 0.35;
    // exit: it lifts away before the third message
    const x = E.in(seg(t, TL.cardExit[0], TL.cardExit[1]));
    hero.position.y += x * 2.4;
    hero.position.z -= x * 1.2;
    hero.rotation.x -= x * 0.7;
  } else if (inEnv) {
    sceneAt(Math.min(6.9 + (t - TL.env0) / TL.envRate, 9.5), t, 'env');
    // the card drops in from above before heading for the tray
    const e = E.out(seg(t, TL.env0, TL.env0 + 0.55));
    hero.position.y += (1 - e) * 2.0;
  } else {
    sceneAt(0, t, 'bare');
  }
}

/* ---------- typography ---------- */
const texts = {};
// every [data-words] line becomes a row of masked words
document.querySelectorAll('[data-words]').forEach((el) => {
  el.innerHTML = el.dataset.words
    .split(' ')
    .map((w) => `<span class="w"><span class="wi">${w}</span></span>`)
    .join('<span class="sp"></span>');
});
const words = (sel) => Array.from(document.querySelectorAll(`${sel} .wi`));
function setWord(el, { y = 0, rx = 0, s = 1, blur = 0, o = 1 }) {
  el.style.transform = `perspective(700px) translate3d(0, ${y.toFixed(2)}%, 0) rotateX(${rx.toFixed(1)}deg) scale(${s.toFixed(3)})`;
  el.style.filter = blur > 0.05 ? `blur(${blur.toFixed(1)}px)` : 'none';
  el.style.opacity = o.toFixed(3);
}

// one text moment: the words rise out of their masks one after another,
// hold (with a slow push-in), then lift away together
function message(box, list, t, tIn, tOut, { stagger = 0.22, dur = 0.9, outDur = 0.45 } = {}) {
  list.forEach((el, i) => {
    const pin = E.expoOut(seg(t, tIn + i * stagger, tIn + i * stagger + dur));
    const pout = E.in(seg(t, tOut + i * 0.05, tOut + i * 0.05 + outDur));
    setWord(el, {
      y: (1 - pin) * 105 - pout * 60,
      rx: (1 - pin) * -50 + pout * 30,
      blur: (1 - pin) * 12 + pout * 16,
      o: Math.min(1, pin * 1.4) * (1 - pout),
      s: 1 + (1 - pin) * 0.06,
    });
  });
  if (box) {
    const push = 1 + 0.035 * E.inOut(seg(t, tIn, tOut + outDur));
    box.style.transform = `translateY(-50%) scale(${push.toFixed(4)})`;
    box.style.visibility = t > tIn - 0.05 && t < tOut + outDur + 0.3 ? 'visible' : 'hidden';
  }
}

const SAFE_W = 1560; // messages never run wider than this (of 1920)
function setupText() {
  // shrink any message that would run past the safe width
  document.querySelectorAll('.msg, .pk2').forEach((el) => {
    const width = Array.from(el.children).reduce((s, n) => s + n.getBoundingClientRect().width, 0);
    if (width > SAFE_W) el.style.fontSize = `${(parseFloat(getComputedStyle(el).fontSize) * SAFE_W) / width}px`;
  });
  texts.m1 = { box: document.querySelector('.m1'), w: words('.m1') };
  texts.m2 = { box: document.querySelector('.m2'), w: words('.m2') };
  texts.m3 = { box: document.querySelector('.m3'), w: words('.m3') };
  texts.pk1 = words('.pk1');
  texts.pk2 = words('.pk2');
  texts.url = words('.contact .url');
  texts.tel = words('.contact .tel');
  texts.fade = document.querySelector('.fade');
  texts.grain = document.querySelector('.grain');
}

function setText(t) {
  message(texts.m1.box, texts.m1.w, t, 0.3, 2.05);
  message(texts.m2.box, texts.m2.w, t, 2.75, 4.15);
  message(texts.m3.box, texts.m3.w, t, 11.55, 13.05);

  // envelope scene → navy → packshot
  const fadeIn = E.inOut(seg(t, TL.envFade[0], TL.envFade[1]));
  const fadeOut = E.inOut(seg(t, TL.pack, TL.pack + 0.45));
  texts.fade.style.opacity = Math.min(fadeIn, 1 - fadeOut).toFixed(3);

  // packshot: brand word rises, the slogan follows word by word, then contact
  message(null, texts.pk1, t, 17.45, 99, { dur: 1.0 });
  message(null, texts.pk2, t, 17.95, 99, { stagger: 0.12, dur: 0.8 });
  message(null, texts.url, t, 18.45, 99, { dur: 0.8 });
  message(null, texts.tel, t, 18.65, 99, { stagger: 0.08, dur: 0.8 });

  const f = Math.floor(t * FPS);
  texts.grain.style.setProperty('--gx', `${(f * 73) % 220}px`);
  texts.grain.style.setProperty('--gy', `${(f * 131) % 220}px`);
}

/* ---------- depth of field ----------
   While the colour cards are on screen, every sub-frame also moves the camera
   across a small virtual lens and shifts the image back so points at the real
   card's depth stay put: the real card stays sharp, the cascade behind it
   goes softer the further back it is. Needs SAMPLES > 1 (i.e. the render). */
const APERTURE = 0.035;
function dofAmount(t) {
  if (t < TL.card0 || t >= TL.cardExit[0]) return 0;
  const s = TL.cardFrom + (t - TL.card0) / TL.cardRate; // scene time
  return E.inOut(seg(s, 1.9, 2.4)) * (1 - E.inOut(seg(s, 4.5, 4.95)));
}
const _right = new THREE.Vector3(), _up = new THREE.Vector3(), _fwd = new THREE.Vector3(), _hp = new THREE.Vector3();
function applyLens(i, n, amount) {
  if (amount <= 0.001) { camera.clearViewOffset(); return; }
  camera.updateMatrixWorld();
  _right.setFromMatrixColumn(camera.matrixWorld, 0);
  _up.setFromMatrixColumn(camera.matrixWorld, 1);
  _fwd.setFromMatrixColumn(camera.matrixWorld, 2).negate();
  const focus = _hp.copy(hero.position).sub(camera.position).dot(_fwd);
  const a = i * 2.39996, r = Math.sqrt((i + 0.5) / n) * APERTURE * amount; // golden-angle disc
  const ox = Math.cos(a) * r, oy = Math.sin(a) * r;
  camera.position.addScaledVector(_right, ox).addScaledVector(_up, oy);
  const ppu = H / (2 * focus * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))); // px per unit at focus
  // camera moved right/up → content slides left/down; shift the view window to cancel it at the focus depth
  camera.setViewOffset(W, H, -ox * ppu, oy * ppu, W, H);
}

/* ---------- frame ---------- */
function renderFrame(t) {
  const dof = SAMPLES > 1 ? dofAmount(t) : 0;
  const n = dof > 0.001 ? SAMPLES * 2 : SAMPLES;
  accumMat.opacity = 1 / n;
  renderer.setRenderTarget(rtAccum);
  renderer.setClearColor(0x000000, 1);
  renderer.clear();
  for (let i = 0; i < n; i++) {
    const ts = n === 1 ? t : t + ((i + 0.5) / n - 0.5) * (SHUTTER / FPS);
    setWorld(clamp(ts, 0, DURATION));
    applyLens(i, n, dof);
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
  sceneAt(3, 0, 'card'); // a frame with every card visible, so all shaders compile up front
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
