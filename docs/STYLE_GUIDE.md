# Sword Art Online — P4G-Inspired Design System

Status: active design contract  
Applies to: all product UI, motion, and brand extensions in this workspace  
Implementation sources: `app/design-tokens.css`, `app/brand.css`, and `app/globals.css`

## 1. Design position

This product borrows the *design logic* of Persona 4 Golden without copying its logo, characters, illustrations, or proprietary interface assets. The target is an original “daily operations broadcast” identity: a bright local-TV signal, a teenage magazine collage, and a tactical task HUD sharing one screen.

The hierarchy is:

1. Usable task planner.
2. High-energy broadcast personality.
3. Decorative texture and spectacle.

If a decorative choice slows scanning, hides state, reduces contrast, or makes a control feel unreliable, usability wins.

## 2. Research synthesis

The following are design observations inferred from official Atlus and Sega promotional pages, logos, key art, and gameplay screenshots—not claims of an official Atlus style specification.

- **Yellow is the world, not merely an accent.** It creates immediate franchise-level recognition and lets black/white UI blocks read like cut paper or broadcast captions.
- **Black and white establish structure.** Thick outlines, hard shadows, and solid black rails make the bright palette controllable instead of childish.
- **Secondary colors behave like TV color bars.** Orange, green, red, blue, and violet appear in short, decisive runs rather than as competing page backgrounds.
- **The composition feels assembled live.** Rotations, offsets, irregular crops, sticker-like badges, silhouettes, circles, dots, and diagonal bands create momentum.
- **Television is both story motif and UI metaphor.** Screens, scanlines, signal noise, frames, channel labels, and sudden transitions support the Midnight Channel premise described by Sega.
- **Everyday life and supernatural investigation coexist.** Calendars, school-life choices, character relationships, and combat share equal importance in the official product presentation. For this planner, that maps naturally to friendly daily scheduling wrapped in a mission-oriented HUD.

Primary visual references:

- [Persona 4 Golden — official Atlus site](https://persona.atlus.com/p4g/sp/index.html?lang=en)
- [Persona 4 Golden — official Japanese P4G site](https://p-atlus.jp/p4g/v/)
- [Persona 4 Golden — Sega product page and gameplay screenshots](https://www.sega.jp/game/detail/remaster-p4g/)
- [Persona 4 Golden Remaster — official Japanese site](https://p-ch.jp/remaster/p4g/)

## 3. Core principles

### Signal first

One primary message must dominate each viewport: the current page, the current mission state, or the requested action. Use the yellow/black contrast for that message; keep secondary information quieter.

### Controlled collision

Overlap and angular offsets are welcome in brand marks, banners, navigation, and feedback. Form controls, paragraphs, tables, and dense task content must remain aligned to predictable grids.

### Bold, then precise

Large labels may be loud and compressed. Supporting copy, dates, and Chinese text must be calm and highly legible. Express personality in the container before distorting the content.

### Broadcast, not broken

TV noise and glitch effects should imply a signal transition. They must never make the product appear frozen, corrupt, or unsafe.

## 4. Visual tokens

The source of truth is `app/design-tokens.css`. Components should consume semantic variables rather than repeat hex values.

### Color roles

| Token | Value | Role |
| --- | --- | --- |
| `--color-signal` | `#f7e21b` | Primary world color, active state, focus and celebratory signal |
| `--color-signal-hot` | `#ffef54` | Hover and bright highlight |
| `--color-signal-deep` | `#d9bd00` | Yellow shadow or subdued yellow edge |
| `--color-ink` | `#11120f` | Text, structural blocks, outlines, hard shadows |
| `--color-paper` | `#fffdf2` | Warm reading surface; preferred over cold white |
| `--color-orange` | `#ef8c22` | Urgency, broadcast stripe, energetic secondary accent |
| `--color-green` | `#58a849` | Success, life/schedule cues, balancing accent |
| `--color-red` | `#ec4337` | Destructive or critical state only |
| `--color-blue` | `#2f7ce0` | Informational category or cool contrast |
| `--color-violet` | `#7d4bd6` | Personal/reflective category |

Rules:

- Let yellow occupy 45–70% of the broad background field in day mode.
- Let ink and paper carry most component surfaces and text.
- Limit a component to one supporting accent unless it is explicitly a broadcast/color-bar motif.
- Never use red as generic decoration near destructive controls.
- Maintain WCAG AA contrast for normal text. Yellow text should normally sit on ink; ink text may sit on yellow.

### Typography

- **Display:** `--font-display`; very heavy, slightly condensed, italic or skewed by the container. Use for brand words, page banners, results, and large counts.
- **Interface:** `--font-ui`; condensed, high-weight, tabular where useful. Use for buttons, status, chips, dates, and metadata.
- **Body:** `--font-body`; normal proportions. Use for task descriptions, instructions, and longer Chinese copy.
- Uppercase English labels may use `.08em–.16em` tracking. Do not apply wide tracking to Chinese body text.
- Do not use serif display faces for the core product identity; they read as fantasy/editorial instead of retro broadcast pop.

### Line, cut, and shadow

- Standard control border: `--line-medium`.
- Hero/badge border: `--line-heavy`.
- Standard hard shadow: `--shadow-pop`; prominent feedback: `--shadow-loud`.
- Prefer polygon cut tokens (`--cut-soft`, `--cut-loud`) and small rotations over rounded “SaaS card” corners.
- Apply rotation to an outer wrapper. Counter-rotate long text when necessary so reading remains level.

### Texture recipes

Use texture on large empty surfaces or decorative pseudo-elements—not behind dense body copy.

**Houndstooth/check signal:** two offset 45-degree gradients at a 12–18px tile size, usually at 8–18% opacity.

**Halftone:** `radial-gradient(circle, currentColor 0 2px, transparent 2.5px)` at 10–18px spacing.

**CRT scanline:** a repeating horizontal gradient with one translucent line every 4–6px. Maximum opacity is 10% on light surfaces and 14% on dark surfaces.

**Signal noise:** fine, non-animated noise at low opacity. Avoid rapid random movement; it harms readability and may trigger vestibular discomfort.

## 5. Layout and composition

### Page frame

- Keep the task surface above decorative effects with a clear z-index layer.
- Use a stable grid for board columns, table data, forms, and calendars.
- Reserve the highest visual energy for the top identity area, active navigation, and momentary feedback.
- A diagonal edge may break the grid visually, but the underlying hit area must remain rectangular and at least 44×44px on touch layouts.

### Angular cutouts

- Soft cut: 2–4% corner displacement for cards and filters.
- Loud cut: 6–10% displacement for banners, brand blocks, results, and major navigation.
- Do not stack clip paths on interactive children; clip the wrapper so focus rings and hit targets remain reliable.

### Responsive behavior

- Desktop may use overlap, side-by-side badges, and 1–3° rotation.
- Narrow screens should preserve the identity by scaling a single lockup unit, not reflowing each decorative piece independently.
- Dense horizontal content such as archive tables may scroll; primary actions and dialogs must not require horizontal scrolling.
- Decorative patterns should simplify or reduce opacity below 760px.

## 6. Component language

### Brand lockup

The current lockup is defined in `app/brand.css`.

- `SAO / 04` is the channel identifier and CRT-shaped anchor.
- `SWORD`, `ART`, and `ONLINE` are separate cut-paper broadcast captions.
- `DAILY OPS / FACE THE DAY` makes the planner purpose explicit.
- Orange and green are short signal accents; yellow and ink remain dominant.
- Keep the accessible name on the `h1`; decorative fragments remain hidden from assistive technology.

Do not place the lockup on a busy photograph, recolor individual letters arbitrarily, remove its hard outlines, or reproduce the official P4G logo geometry.

### Page banner

- One oversized index badge, one English title, one short Chinese subtitle.
- Black structure with a yellow active edge.
- Titles may be skewed; subtitles stay level.

### Mission card

- White/paper reading surface with an ink border.
- One category stripe and a compact priority badge.
- High priority may increase border/shadow energy; it must not rely on color alone.
- Keep title and status scan order consistent across board and archive views.

### Badge and chip

- Use solid blocks, hard borders, and short copy.
- Recommended order: icon/mark → label → value.
- Status, priority, and type need distinct shapes or labels in addition to color.

### Menu and selection window

- Active choices may translate 6–12px and gain a yellow slab or ink shadow.
- Menu rows should feel like broadcast lower-thirds: wide, flat, angled, and quickly readable.
- Selection dialogs may be theatrical at entry, but option grids remain regular and keyboard navigable.

### Form controls

- Inputs stay level, rectangular, and high contrast.
- Use yellow focus shadows plus a visible outline; never remove focus indication.
- Avoid decorative CRT distortion, scanlines, or clipped text inside editable fields.

### Feedback and HUD moments

- “Mission Start/Clear” feedback may temporarily take over the viewport.
- Keep takeover feedback under one second for routine actions.
- Toasts must use `role="status"` and should not block the next action.

## 7. Motion and micro-interactions

Use the durations and easing variables from `app/design-tokens.css`.

- Hover/press: 120–180ms, 2–4px translation, hard-shadow compression.
- Standard entry: 240–360ms, one overshoot at most.
- Page transition: 360–520ms, directional and consistent with navigation order.
- Glitch: one or two displaced frames, 80–160ms total. Reserve for route changes, errors, or major result feedback.
- Pop-in: scale from 0.85–0.95 with a small rotation; do not spring repeatedly.
- CRT flash: a single luminance sweep under 200ms. Never flicker continuously.

Every animation must have a meaningful static end state. Respect `prefers-reduced-motion`; remove transforms and flashes rather than merely slowing them down.

## 8. Implementation architecture

### Current structure

- `app/design-tokens.css`: semantic visual primitives; edit here when changing the system.
- `app/brand.css`: brand lockup only; it intentionally loads after the large legacy stylesheet.
- `app/globals.css`: application shell, layouts, existing components, theme, and motion.
- `app/page.tsx`: current UI and state. New repeated visual patterns should become components rather than additional inline markup.

### Scaling path

When the next two or three shared components are added, introduce:

```text
app/
  components/
    BrandLockup.tsx
    SignalBadge.tsx
    AngularPanel.tsx
    MissionCard.tsx
  styles/
    components.css
```

Component APIs should expose meaning, not raw decoration. Prefer `tone="warning"`, `energy="loud"`, and `cut="soft"` over `yellow`, `rotate={-3}`, or arbitrary class strings.

Tailwind may continue to provide utility parsing, but the design contract remains CSS-variable-first. Do not duplicate the palette in a JavaScript config unless a library requires literal values; if it does, document how the values stay synchronized.

## 9. Accessibility and usability guardrails

- Minimum touch target: 44×44px.
- Maintain visible focus for every interactive element.
- Never communicate state by color alone.
- Keep CRT/noise layers `pointer-events:none` and `aria-hidden`.
- Do not animate large background fields indefinitely at high contrast.
- Test day and night themes independently; a token that works on yellow may fail on charcoal.
- Keep Chinese task text at a comfortable body size even when English labels are condensed.

## 10. Review checklist

Before merging a visual change, confirm:

- Is the main action or state identifiable in two seconds?
- Does yellow have a clear purpose rather than appearing everywhere equally?
- Are supporting accents limited and semantically stable?
- Are text and hit areas level even when their containers are angled?
- Does the component still work without texture and motion?
- Is focus visible, contrast sufficient, and state non-color-dependent?
- Does it work in both themes and at narrow/mobile width?
- Does the result feel like an original broadcast-planner identity rather than a copied Persona asset?

Then run `npm run lint`, `npm run build`, and browser-check the affected desktop and mobile layouts.
