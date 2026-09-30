/*
  Website images are served from the PayUnicard media CDN
  (MediaStore repo, wwwroot/sachukardi/website/images). Every one keeps a copy
  in /public/images, used automatically if the CDN can't be reached.
*/
const CDN = 'https://media.payunicard.ge/sachukardi/website/images';

export const MEDIA = {
  card: { cdn: `${CDN}/card.png`, local: '/images/card-face.png' },
  wordmark: { cdn: `${CDN}/wordmark.svg`, local: '/images/sachukardi-wordmark.svg' },
};

function load(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // the CDN sends Access-Control-Allow-Origin: *, so WebGL may use the image
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// the CDN copy, or the local one if the CDN fails
export function loadImage({ cdn, local }) {
  return load(cdn).catch(() => load(local));
}
