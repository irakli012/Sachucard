import * as THREE from 'three';

/*
  The envelope sleeve's printed face, painted from the real brand files
  (PayUnicard mark, საჩუქარდი wordmark) following the layout of the
  supplied mockup: lime mark top-left, large white wordmark, lime slogan,
  thin glowing lime curves across the lower half.
*/

async function loadImage(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

// draw a white SVG mark tinted to `color`
function tinted(img, w, color) {
  const h = (w * img.naturalHeight) / img.naturalWidth;
  const c = document.createElement('canvas');
  c.width = Math.ceil(w); c.height = Math.ceil(h);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, w, h);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

// deterministic pseudo-random so every render is identical
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

export async function sleeveTexture({ width, height, slogan }) {
  const W = 2048;
  const H = Math.round((W * height) / width);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  // matte black board with a faint paper grain
  g.fillStyle = '#141617';
  g.fillRect(0, 0, W, H);
  const r = rng(7);
  const img = g.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 10;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);

  // glowing lime curves
  const curves = [
    [[-40, H * 0.80], [W * 0.35, H * 1.05], [W * 0.75, H * 0.62], [W + 40, H * 0.30]],
    [[-40, H * 0.74], [W * 0.40, H * 1.00], [W * 0.70, H * 0.70], [W + 40, H * 0.46]],
    [[W * 0.50, -40], [W * 0.75, H * 0.10], [W * 0.92, H * 0.28], [W + 40, H * 0.44]],
    [[W * 0.58, -40], [W * 0.80, H * 0.08], [W * 0.95, H * 0.20], [W + 40, H * 0.30]],
  ];
  g.lineCap = 'round';
  for (const [a, b, c2, d] of curves) {
    for (const [lw, alpha, blur] of [[10, 0.08, 30], [3.5, 0.35, 10], [1.6, 0.95, 0]]) {
      g.save();
      g.strokeStyle = `rgba(182, 214, 57, ${alpha})`;
      g.lineWidth = lw;
      g.shadowColor = 'rgba(182, 214, 57, 0.9)';
      g.shadowBlur = blur;
      g.beginPath();
      g.moveTo(...a);
      g.bezierCurveTo(...b, ...c2, ...d);
      g.stroke();
      g.restore();
    }
  }
  // sparkles along the lower curves
  for (let i = 0; i < 14; i++) {
    const x = W * (0.05 + r() * 0.9);
    const y = H * (0.72 + r() * 0.22);
    const s = 0.8 + r() * 1.6;
    const grad = g.createRadialGradient(x, y, 0, x, y, s * 5);
    grad.addColorStop(0, 'rgba(240, 255, 200, 0.95)');
    grad.addColorStop(1, 'rgba(182, 214, 57, 0)');
    g.fillStyle = grad;
    g.fillRect(x - s * 5, y - s * 5, s * 10, s * 10);
  }

  const [mark, wordmark] = await Promise.all([
    loadImage('/images/payunicard.svg'),
    loadImage('/images/sachukardi-wordmark.svg'),
  ]);
  g.drawImage(tinted(mark, W * 0.13, '#9EC73E'), W * 0.095, H * 0.105);

  const wm = tinted(wordmark, W * 0.44, '#F4F4F2');
  g.drawImage(wm, W * 0.155, H * 0.47 - wm.height / 2);

  await document.fonts.load('500 60px HMPangram');
  g.fillStyle = '#A9D03A';
  g.font = `500 ${Math.round(W * 0.026)}px HMPangram, sans-serif`;
  g.textBaseline = 'middle';
  g.fillText(slogan, W * 0.157, H * 0.60);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
