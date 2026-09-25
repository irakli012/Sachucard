# Sachucard — landing page

Static landing page for საჩუქარდი (Sachukardi), the PayUnicard universal gift card.
Every "შეუკვეთე" button links to the order page:
`https://svc-vs-98tp.payunicard.ge/?tenant=sachukardi` (`ORDER_URL` in `src/main.js`).

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static output in dist/
```

## Stack

- **Three.js** (`src/scene.js`): the 3D card on one fixed canvas. The front uses the real card artwork, the back is drawn at runtime, and the scene adds green edges, a clearcoat sheen, a light sweep, orbit rings and particles.
- **GSAP ScrollTrigger + Lenis** (`src/main.js`): smooth scrolling, pinned sections, the scrubbed slogan, the 3-step flip, the horizontal "how it works" track and the velocity-reactive marquee.
- **Native CSS scroll-driven animations**: the top progress bar (`animation-timeline: scroll()`) and `.reveal` elements (`view()`), with a GSAP fallback in browsers that lack them.

## Languages

Georgian is written in `index.html`, and English lives in `src/i18n.js`. An element marked
`data-i18n="key"` (text), `data-i18n-html="key"` (markup) or `data-i18n-attr="attr:key"` is
translated before any animation is set up. The language comes from `?lang=en|ka`, then from the
last choice saved on the device, and defaults to Georgian. The ქარ/ENG switch reloads the page in
the chosen language behind the loading screen.

## Loading screen

The loading screen (`#loader`) is inlined in `index.html` with its own `<style>`, so it appears on
the first frame. `main.js` lifts it once the fonts and both card faces are ready (at least 0.7 s,
at most 5 s), and a CSS failsafe hides it after 8 s if the script never runs. The fonts are WOFF2
files, about 34 KB each.

## Where the card goes

`buildFrames()` in `src/main.js` lists the card's pose keyframes. Each keyframe is anchored to a
section's ScrollTrigger, and the list is rebuilt on every refresh (resize, font load). A pose is
`{ x, y, rx, ry, rz, s, ring }`: x and y are fractions of the half viewport, and s is relative to the base card size.

## Brand

Colours and the HMpangram font come from the order page's theme
(`VouchersWhiteLabel/Voucher.Topup/wwwroot/themes/sachukardi.css`). The card face and the logo SVGs
come from the same repo.
