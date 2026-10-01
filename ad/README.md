# Sachukardi ad (23.5 s, 16:9)

A code-built commercial. It uses the real card PNG as its texture (with the "....1234" placeholder removed) and models the envelope on the supplied mockup. All text in the film (messages, packshot, contacts and category-card labels) is set in Dachi The Lynx. This folder is separate from the website and isn't deployed.

## Sequence (23.5 s, typography modelled on the approved reference 1000081404.mp4)

| Time | Moment |
|---|---|
| 0–3.2 s | „მზად ხარ“ / „ცვლილებისთვის?“ (green), word by word |
| 3.4–6.3 s | „ერთი სასაჩუქრე“ / „ბარათი“ (green) |
| 6.35–13.1 s | category cards dealt onto a pile, then the Sachukardi card lands on top and the pile slides in beneath it |
| 13.0–15.9 s | „რომლითაც ყველგან“ / „გადაიხდი“ (green) |
| 15.75–19.2 s | envelope: card into the tray, tray into the sleeve and out, fade |
| 19.25–23.5 s | packshot: საჩუქარდი / ყველაფრისთვის, რისი ყიდვაც გინდა + www.payunicard.ge • 0322 555 222, fade to black |

Each word enters on its own beat: rising from below, dropping from above, or travelling in sideways while being uncovered. The line re-centres as words join it. After a hold, the lines split apart (top line up, green line down). Beats and directions live in `MESSAGES` in `ad.js`.

Earlier versions are kept in `versions/`: `v1-10s/` (the first 10-second cut) and `v2-cascade/` (20 s with the colour cascade). Preview them at `/ad/versions/v1-10s/` and `/ad/versions/v2-cascade/`.

## Preview

With the site's dev server running (`npm run dev` in the repo root), open `/ad/`. The bar at the bottom plays the film and scrubs through it, and `/ad/?t=6.2` opens paused at 6.2 s.

## Render

```bash
cd ad
npm install
npm run render
```

The render writes `out/sachukardi-ad-16x9.mp4` (1920×1080, 30 fps, H.264). It encodes to a temporary file and only moves it into place once it's complete.

Options:
- `--samples 8`: motion-blur sub-frames per frame. 2 is enough for quick tests.
- `--from 3.5 --to 4.5`: render only part of the film.
- `--out out/name.mp4`: output path.

In PowerShell, `npm run render -- --out …` drops the options, so call the script directly when passing any:

```bash
node render.mjs --out out/sachukardi-ad-16x9-v5.mp4
```

### Vertical (Instagram Reels, 9:16)

The same film, with only the spatial layout adapted to 1080 × 1920:
- the camera keeps its path, with a wider lens pulled back so the card or envelope fits the narrow frame
- longer messages break one word per line, and the green key word stays on its own last line
- the packshot slogan is on two lines
- everything stays clear of the Reels interface at the top and bottom

```bash
node render.mjs --format 9x16
```

This writes `out/sachukardi-ad-9x16.mp4`. Preview it at `/ad/?format=9x16`.

To capture single frames for review:

```bash
node stills.mjs 1.3 7.5 19.5
node stills.mjs --format 9x16 1.3 7.5 19.5
```

The frames go to `out/stills/`.

## Where things are

- `ad.js`
  - `TL`: when each moment starts, and how much the card and envelope scenes are slowed.
  - `setWorld`: maps film time onto the scene choreography, which is written on the original 10 s clock.
  - `MESSAGES` / `setMessage` / `setText`: the kinetic typography.
  - `DECK` / `DEAL` / `dealWorld`: the category cards and the card moment.
  - `heroSoloPose` / `heroPose`: the card in the envelope scene.
  - `CAM`: the camera keyframes.
- `ad.css`: text sizes and positions (messages auto-shrink to fit 1560 px).
- `textures.js`: the envelope sleeve's printed face.
- `index.html`: the copy, one `data-words` per line.
- `fonts/`: Dachi The Lynx.
