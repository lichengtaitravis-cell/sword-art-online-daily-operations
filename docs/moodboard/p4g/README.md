# P4G Visual Evidence Moodboard

These eight user-provided images are stored locally as internal design evidence for this workspace. They are ignored by Git and must not be published in a public repository. `manifest.json` preserves filenames and checksums so the design harness remains reproducible without redistributing copyrighted artwork. The images are reference material only: do not import them into application code, move them into `public/`, publish them as product content, trace their artwork, or treat them as reusable licensed assets. Persona, its logos, characters, and artwork belong to their respective rights holders.

## Evidence map

| File | What it proves for this project |
| --- | --- |
| `01-revival-key-art.png` | The title mark is a single black/white typographic mass. Color bars are a small in-letter signal detail, not a different color for every word. |
| `02-golden-logo-lockup.png` | P4G uses one consistent serif system, overlapping hierarchy, a shared directional slant, deep outline stacking, and a unified silhouette. |
| `03-revival-logo-perspective.png` | The complete wordmark follows one rising axis and one visual center. Smaller copy inherits the same spatial direction. |
| `04-golden-animation-poster.png` | Yellow and black can invert, but the letter family, perspective, stroke treatment, and integrated silhouette remain consistent. |
| `05-golden-rainbow-composition.png` | Rainbow rings and stars live behind the logo. The logo face itself stays black/white with a yellow keyline. |
| `06-tv-frame-logo.png` | The television motif is a containing scene or framing device; it does not require chopping the wordmark into unrelated TV badges. |
| `07-golden-ensemble.png` | High color density belongs to supporting illustration and motion bands. The logo remains a compact, limited-palette anchor. |
| `08-revival-digital-premium.png` | Even beside oversized display typography, the mark keeps one perspective plane, coherent black/white depth, and a restrained signal-color detail. |

## Required interpretation

For the Sword Art Online wordmark:

1. `SWORD ART` and `ONLINE` must share one font family.
2. All word layers must sit inside one `.brand-plane` and inherit one perspective transform.
3. Every face must use the same extrusion vector and depth construction.
4. Letter faces are paper/white, with ink outlines and a yellow rear keyline. No orange, green, blue, red, or violet letter faces.
5. Supporting color may appear elsewhere in the application, but not as independent word tiles inside the logo.
6. The silhouette must read as one mark when viewed small or in grayscale.

These rules are enforced by `npm run design:check` and elaborated in `docs/STYLE_GUIDE.md`.
