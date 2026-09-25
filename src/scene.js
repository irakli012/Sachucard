import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/*
  The 3D card lives on one fixed, full-screen canvas behind the page.
  Scroll position picks a pose from a list of keyframes (see setKeyframes);
  the render loop eases the card toward that pose and adds idle float and
  pointer tilt on top.

  Pose units are viewport-relative so one set of keyframes works at any size:
    x, y  — fraction of the half viewport (1 = right/top edge, 0 = centre)
    s     — card width as a multiple of the "base" width for this layout
    rx, ry, rz — radians
    ring  — 0..1 opacity of the orbit rings and glow
*/

const CARD_W = 1.586; // ID-1 card aspect, same as the artwork (1536 × 969)
const CARD_H = 1;
const CARD_R = 0.075;
const CARD_D = 0.018;

const GREEN = new THREE.Color('#90C850');

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/* ShapeGeometry's UVs are raw shape coordinates; map them to 0..1. */
function faceGeometry(shape) {
  const g = new THREE.ShapeGeometry(shape, 16);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) + CARD_W / 2) / CARD_W, (pos.getY(i) + CARD_H / 2) / CARD_H);
  }
  return g;
}

/* Back of the card, painted at runtime so it can use the site font. */
async function backTexture(wordmarkUrl, [line1, line2]) {
  const W = 1536, H = 969;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#151a29');
  bg.addColorStop(1, '#0c0f19');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  // faint pattern of the category icons
  const icons = [
    'M9 15 H39 L41.5 43 A3 3 0 0 1 38.5 46 H9.5 A3 3 0 0 1 6.5 43 Z M17 15 V11 A7 7 0 0 1 31 11 V15',
    'M24 26 V21 A5 5 0 1 1 29 16 M24 26 L7 38 A2.5 2.5 0 0 0 8.5 42.5 H39.5 A2.5 2.5 0 0 0 41 38 Z',
    'M5 9 H11 L16.5 33 H38 L43 17 H13.5',
    'M7 17 H43 V24 A4 4 0 0 0 43 32 V39 H7 V32 A4 4 0 0 0 7 24 Z',
    'M6 20 H44 V42 A2 2 0 0 1 42 44 H8 A2 2 0 0 1 6 42 Z M6 20 L10 11 H42 L44 20 Z',
  ].map((d) => new Path2D(d));
  g.save();
  g.strokeStyle = 'rgba(144, 200, 80, 0.10)';
  g.lineWidth = 2.2;
  g.lineCap = g.lineJoin = 'round';
  let k = 0;
  for (let y = 150; y < H; y += 150) {
    for (let x = (y / 150) % 2 ? 40 : 115; x < W; x += 150) {
      g.save();
      g.translate(x, y);
      g.scale(1.3, 1.3);
      g.stroke(icons[k++ % icons.length]);
      g.restore();
    }
  }
  g.restore();

  // magnetic-stripe style green band
  g.fillStyle = '#90C850';
  g.fillRect(0, 110, W, 120);

  // centre vignette so the text reads over the pattern
  const v = g.createRadialGradient(W / 2, H * 0.62, 50, W / 2, H * 0.62, 700);
  v.addColorStop(0, 'rgba(16,19,31,0.95)');
  v.addColorStop(1, 'rgba(16,19,31,0)');
  g.fillStyle = v;
  g.fillRect(0, 230, W, H - 230);

  try {
    const img = new Image();
    img.src = wordmarkUrl;
    await img.decode();
    const w = 620, h = (w * img.naturalHeight) / img.naturalWidth;
    g.drawImage(img, (W - w) / 2, 470 - h / 2, w, h);
  } catch { /* wordmark is decoration; the card still works without it */ }

  try { await document.fonts.load('500 44px HMPangram'); } catch { /* fall back to system font */ }
  g.textAlign = 'center';
  g.fillStyle = '#D9D9D9';
  g.font = '500 46px HMPangram, "Noto Sans Georgian", sans-serif';
  g.fillText(line1, W / 2, 640);
  g.fillStyle = '#9EA3AF';
  g.font = '500 30px HMPangram, "Noto Sans Georgian", sans-serif';
  g.fillText(line2, W / 2, 700);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  r.addColorStop(0, 'rgba(144,200,80,0.55)');
  r.addColorStop(0.35, 'rgba(144,200,80,0.18)');
  r.addColorStop(1, 'rgba(144,200,80,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/* A soft specular band that sweeps across the face as the card turns. */
function shineMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uPos: { value: -1 }, uStrength: { value: 0.35 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform float uPos;
      uniform float uStrength;
      void main() {
        float d = (vUv.x * 0.8 + vUv.y * 0.5) - uPos;
        float band = exp(-d * d * 60.0) + 0.35 * exp(-(d - 0.12) * (d - 0.12) * 400.0);
        gl_FragColor = vec4(vec3(1.0, 1.0, 0.95) * band * uStrength, 1.0);
      }`,
  });
}

export function createScene(canvas, { cardUrl, wordmarkUrl, backLines, reducedMotion }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 6);

  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(-3, 4, 5);
  scene.add(key);
  const rim = new THREE.PointLight(GREEN, 12, 8);
  rim.position.set(2.5, -1.5, 1.5);
  scene.add(rim);

  /* ---------- card ---------- */
  const shape = roundedRect(CARD_W, CARD_H, CARD_R);
  const bevel = 0.006;
  const faceZ = CARD_D / 2 + bevel + 0.0006;

  const loader = new THREE.TextureLoader();
  let frontLoaded;
  const frontReady = new Promise((resolve) => { frontLoaded = resolve; });
  const frontMap = loader.load(cardUrl, () => frontLoaded(), undefined, () => frontLoaded());
  frontMap.colorSpace = THREE.SRGBColorSpace;
  frontMap.anisotropy = renderer.capabilities.getMaxAnisotropy();

  // Reflections kept low: with a strong clearcoat, tilting the card toward the
  // room's ceiling light (e.g. pointer near the bottom of the screen) washed
  // the whole face out to grey.
  const faceMat = (map) => new THREE.MeshPhysicalMaterial({
    map, roughness: 0.5, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.3, envMapIntensity: 0.35,
  });

  const edgeGeo = new THREE.ExtrudeGeometry(shape, {
    depth: CARD_D, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 16,
  });
  edgeGeo.translate(0, 0, -CARD_D / 2);
  const edge = new THREE.Mesh(edgeGeo, new THREE.MeshPhysicalMaterial({
    color: GREEN, roughness: 0.3, metalness: 0.6, clearcoat: 1, emissive: GREEN, emissiveIntensity: 0.15,
  }));

  const front = new THREE.Mesh(faceGeometry(shape), faceMat(frontMap));
  front.position.z = faceZ;

  const backMat = faceMat(null);
  backMat.color.set('#10131F');
  const backGeo = faceGeometry(shape);
  backGeo.rotateY(Math.PI);
  const back = new THREE.Mesh(backGeo, backMat);
  back.position.z = -faceZ;
  const backReady = backTexture(wordmarkUrl, backLines).then((t) => {
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    backMat.map = t;
    backMat.color.set('#ffffff');
    backMat.needsUpdate = true;
  });

  const shineMat = shineMaterial();
  const shine = new THREE.Mesh(faceGeometry(shape), shineMat);
  shine.position.z = faceZ + 0.0008;
  const shineBackMat = shineMaterial();
  const shineBack = new THREE.Mesh(backGeo, shineBackMat);
  shineBack.position.z = -faceZ - 0.0008;

  const card = new THREE.Group();
  card.add(edge, front, back, shine, shineBack);

  /* ---------- glow + orbit rings (follow the card, don't spin with it) ---------- */
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(4.2, 4.2),
    new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  halo.position.z = -0.6;

  const ringMat = new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, opacity: 0.35, depthWrite: false });
  const ringA = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.004, 6, 240), ringMat);
  ringA.rotation.set(1.25, 0.2, -0.25);
  const ringB = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.003, 6, 240), ringMat);
  ringB.rotation.set(1.1, -0.45, 0.3);

  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xd6f5a8, transparent: true, depthWrite: false });
  const sparks = [ringA, ringA, ringB, ringB].map((ring, i) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 12), sparkMat);
    m.userData = { ring, r: ring.geometry.parameters.radius, speed: 0.25 + i * 0.07, phase: i * 1.7 };
    ring.add(m);
    return m;
  });

  const orbit = new THREE.Group();
  orbit.add(halo, ringA, ringB);

  const rig = new THREE.Group();
  rig.add(orbit, card);
  scene.add(rig);

  /* ---------- ambient particles ---------- */
  const COUNT = window.innerWidth < 900 ? 220 : 420;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(COUNT * 3);
  const pCol = new Float32Array(COUNT * 3);
  const white = new THREE.Color('#ffffff');
  for (let i = 0; i < COUNT; i++) {
    pPos[i * 3] = (Math.random() - 0.5) * 14;
    pPos[i * 3 + 1] = (Math.random() - 0.5) * 20;
    pPos[i * 3 + 2] = -Math.random() * 6 + 1;
    const c = Math.random() < 0.55 ? GREEN : white;
    pCol[i * 3] = c.r; pCol[i * 3 + 1] = c.g; pCol[i * 3 + 2] = c.b;
  }
  const pBaseY = new Float32Array(COUNT);
  const pBaseZ = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) { pBaseY[i] = pPos[i * 3 + 1]; pBaseZ[i] = pPos[i * 3 + 2]; }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
    size: 0.045, map: dotTexture(), vertexColors: true, transparent: true, opacity: 0.55,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  }));
  scene.add(particles);

  /* ---------- layout ---------- */
  let halfW = 1, halfH = 1, baseScale = 1;
  const view = { fitW: 0.36, fitH: 0.5 };

  function resize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    halfW = halfH * camera.aspect;
    baseScale = Math.min((view.fitW * 2 * halfW) / CARD_W, view.fitH * 2 * halfH);
  }

  /* ---------- pose from scroll ---------- */
  const KEYS = ['x', 'y', 'rx', 'ry', 'rz', 's', 'ring'];
  let frames = [];
  const target = { x: 0, y: 0, rx: 0, ry: 0, rz: 0, s: 1, ring: 1 };
  const cur = { ...target };
  const intro = { y: -1.4, ry: -Math.PI * 1.5, s: 0.4, ring: 0 };
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function poseAt(scroll) {
    if (!frames.length) return;
    if (scroll <= frames[0].at) return Object.assign(target, frames[0].pose);
    for (let i = 0; i < frames.length - 1; i++) {
      const a = frames[i], b = frames[i + 1];
      if (scroll <= b.at) {
        const p = b.at === a.at ? 1 : (scroll - a.at) / (b.at - a.at);
        const t = easeInOut(p);
        for (const k of KEYS) target[k] = a.pose[k] + (b.pose[k] - a.pose[k]) * t;
        return;
      }
    }
    Object.assign(target, frames[frames.length - 1].pose);
  }

  function setKeyframes(list, fit) {
    frames = list
      .map((f) => ({ at: f.at, pose: { ...f.pose } }))
      .sort((a, b) => a.at - b.at);
    // fill in any keys a frame omitted from the previous frame
    for (let i = 0; i < frames.length; i++) {
      for (const k of KEYS) {
        if (frames[i].pose[k] === undefined) frames[i].pose[k] = i ? frames[i - 1].pose[k] : (k === 's' || k === 'ring' ? 1 : 0);
      }
    }
    if (fit) Object.assign(view, fit);
    resize();
    poseAt(window.scrollY);
  }

  /* ---------- loop ---------- */
  const clock = new THREE.Clock();
  let running = true;

  function render() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    poseAt(window.scrollY);
    const k = 1 - Math.exp(-dt * (reducedMotion ? 30 : 7));
    for (const key of KEYS) cur[key] += (target[key] - cur[key]) * k;

    pointer.x += (pointer.tx - pointer.x) * (1 - Math.exp(-dt * 4));
    pointer.y += (pointer.ty - pointer.y) * (1 - Math.exp(-dt * 4));

    const idle = reducedMotion ? 0 : 1;
    rig.position.set(
      cur.x * halfW,
      (cur.y + intro.y) * halfH + Math.sin(t * 1.1) * 0.05 * idle,
      0,
    );
    rig.scale.setScalar(baseScale * cur.s * intro.s);
    card.rotation.set(
      cur.rx + Math.cos(t * 0.9) * 0.04 * idle - pointer.y * 0.25,
      cur.ry + intro.ry + Math.sin(t * 0.7) * 0.06 * idle + pointer.x * 0.35,
      cur.rz + Math.sin(t * 0.8) * 0.02 * idle,
    );

    // shine sweeps as the card turns, plus a slow drift
    const facing = Math.cos(card.rotation.y);
    shineMat.uniforms.uPos.value = ((card.rotation.y * 0.35 + card.rotation.x * 0.4 + t * 0.08) % 2.6 + 2.6) % 2.6 - 0.6;
    shineBackMat.uniforms.uPos.value = 1.3 - shineMat.uniforms.uPos.value;
    shineMat.uniforms.uStrength.value = 0.14 * Math.max(0, facing);
    shineBackMat.uniforms.uStrength.value = 0.1 * Math.max(0, -facing);

    const ringOpacity = Math.max(0, cur.ring * intro.ring);
    ringMat.opacity = 0.35 * ringOpacity;
    sparkMat.opacity = ringOpacity;
    halo.material.opacity = 0.35 + 0.65 * ringOpacity;
    orbit.rotation.z = t * 0.05 * idle;
    orbit.rotation.y = pointer.x * 0.2;
    for (const m of sparks) {
      const a = m.userData.phase + t * m.userData.speed * (idle || 0.2);
      m.position.set(Math.cos(a) * m.userData.r, Math.sin(a) * m.userData.r, 0);
    }

    // particles parallax against scroll; deeper ones move slower, and each wraps
    // top-to-bottom so the field never runs out on a long page
    const scrollOffset = (window.scrollY / Math.max(1, window.innerHeight)) * 1.1 + t * 0.03 * idle;
    const pos = pGeo.attributes.position;
    for (let i = 0; i < COUNT; i++) {
      const depth = 1 - (1 - pBaseZ[i]) / 7; // 1 near, ~0.15 far
      const y = pBaseY[i] + scrollOffset * depth;
      pos.array[i * 3 + 1] = ((y + 10) % 20 + 20) % 20 - 10;
    }
    pos.needsUpdate = true;
    particles.rotation.y = t * 0.01 * idle + pointer.x * 0.05;
    particles.rotation.x = pointer.y * 0.05;

    renderer.render(scene, camera);
  }

  function loop() {
    if (!running) return;
    render();
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resize);
  if (window.matchMedia('(pointer: fine)').matches) {
    window.addEventListener('pointermove', (e) => {
      pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
    });
  }
  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) { clock.getDelta(); loop(); }
  });

  resize();
  loop();

  // Resolves once both card faces have their artwork and the shaders are
  // compiled, so revealing the page never shows a blank or stuttering card.
  const ready = Promise.all([frontReady, backReady])
    .then(() => renderer.compileAsync?.(scene, camera))
    .catch(() => {});

  // Jump straight to the pose for the current scroll position (after an
  // instant scroll), skipping the usual easing.
  function snap() {
    poseAt(window.scrollY);
    Object.assign(cur, target);
  }

  return { setKeyframes, intro, ready, snap };
}
