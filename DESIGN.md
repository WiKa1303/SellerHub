---
name: SellerHub
description: A warm, precise cockpit for German Amazon FBA sellers — amber instrument glow on a dark navy rail, over a bright, legible workspace.
colors:
  accent: "#d97706"
  accent-deep: "#b45309"
  accent-bright: "#f59e0b"
  accent-darkest: "#92400e"
  ink: "#0e1526"
  ink-soft: "#4a556b"
  ink-muted: "#7e879b"
  bg: "#eef0f5"
  surface: "#ffffff"
  surface-2: "#f6f8fb"
  surface-3: "#eaeef4"
  surface-4: "#d8dee8"
  border: "#e6eaf1"
  border-strong: "#b6c0cf"
  rail: "#0c1322"
  rail-2: "#152138"
  green: "#059669"
  red: "#dc2626"
  blue: "#1d4ed8"
  purple: "#6d28d9"
  cyan: "#0e7490"
  pink: "#be185d"
typography:
  display:
    fontFamily: "Bricolage Grotesque, DM Sans, sans-serif"
    fontSize: "24px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.5px"
  headline:
    fontFamily: "Bricolage Grotesque, DM Sans, sans-serif"
    fontSize: "21px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.3px"
  title:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "normal"
  body:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.8px"
rounded:
  sm: "10px"
  md: "12px"
  lg: "14px"
  xl: "18px"
  pill: "16px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "22px"
components:
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "11px 20px"
  button-secondary-hover:
    backgroundColor: "#fffaf2"
    textColor: "{colors.accent}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "11px 20px"
  button-primary-hover:
    backgroundColor: "{colors.accent-deep}"
    textColor: "{colors.surface}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "22px"
  input:
    backgroundColor: "#fbfcfe"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "11px 14px"
  badge:
    textColor: "{colors.blue}"
    rounded: "{rounded.pill}"
    padding: "4px 11px"
---

# Design System: SellerHub

## 1. Overview

**Creative North Star: "The Warm Cockpit"**

SellerHub is a calm, warm-lit control room for German Amazon sellers. A dark navy navigation rail runs down the left like an instrument housing, lit from within by a single amber glow; to its right sits a bright, airy workspace where every readout, table, and form earns its place. The system's job is to turn a wall of marketplace data into a confident decision, so the interface stays legible and unhurried: generous rounding, soft layered shadows that lift on interaction, and one warm accent that appears exactly where attention should go.

The palette is deliberately restrained on the surface — near-white workspaces over a faint radial wash of amber and blue — so that numbers, not chrome, carry the screen. Typography pairs a confident display grotesque (Bricolage) for headlines and figures against a clean humanist sans (DM Sans) for everything else. Depth is real but quiet: cards float on diffuse shadows, hover states lift by a pixel or two, and focus is signalled by a soft amber ring rather than a hard outline.

This system explicitly rejects the interchangeable **generic SaaS dashboard** (blue-gradient admin templates with no point of view), the **cluttered enterprise tool** (Seller-Central density, cryptic tables, no hierarchy), the **playful consumer app** (cartoonish, emoji-first, gamified), and the **cheap hustle/dropship tool** (loud neon, hype, get-rich-quick energy). Money and legal obligations are on the line here; the surface is sober, warm, and exact.

**Key Characteristics:**
- Dark navy rail + bright workspace; amber is the only voice of emphasis
- Soft, layered shadows that lift on hover — depth as a response to state, never decoration
- Bricolage Grotesque for display/figures, DM Sans for body; tabular numerals for money
- Warm amber focus glow (`0 0 0 4px rgba(217,119,6,.12)`), never a hard black outline
- Generous rounding (10–18px) and calm, legible density

## 2. Colors

A warm, near-neutral workspace lit by a single amber accent, with a dark navy rail and a disciplined set of status hues for data.

### Primary
- **Instrument Amber** (`#d97706`, hover `#b45309`, bright `#f59e0b`, deepest `#92400e`): The one voice of emphasis. Primary buttons, active navigation, focus rings, links, selected tabs, the logo mark. It carries a bright-to-deep gradient (`#f59e0b → #d97706 → #b45309`) on primary actions and glows softly behind focused inputs.

### Neutral
- **Cockpit Ink** (`#0e1526`): Primary text and figures on light surfaces.
- **Soft Ink** (`#4a556b`): Secondary text, labels, meta.
- **Muted Ink** (`#7e879b`): Tertiary text, placeholders, disabled — used sparingly; never for body copy that must be read.
- **Workspace** (`#eef0f5` base, `#ffffff` surface, `#f6f8fb` / `#eaeef4` / `#d8dee8` recessed steps): The bright layered background stack.
- **Borders** (`#e6eaf1` hairline, `#b6c0cf` strong): Dividers and field strokes.
- **Navy Rail** (`#0c1322 → #152138`): The fixed sidebar housing. Dark, so the amber glow reads as light inside it.

### Tertiary — Status hues (data only)
- **Green** (`#059669`), **Red** (`#dc2626`), **Blue** (`#1d4ed8`), **Purple** (`#6d28d9`), **Cyan** (`#0e7490`), **Pink** (`#be185d`): Reserved for badges, categories, and status meaning (e.g. idea/research/analysis/ordered/rejected). Each pairs with an ~9–11% tint background of its own hue for filled chips. These encode meaning; they are never decorative.

### Named Rules
**The One Voice Rule.** Amber is the only accent used for emphasis and action. If two things on a screen are both amber, one of them is wrong. Status hues carry *data* meaning, never UI emphasis — don't reach for blue or green to make a button "pop."

**The Tinted Neutral Rule.** Colored text sits on a tint of its own hue (e.g. blue text on `rgba(29,78,216,.09)`), never gray text on a saturated background. Washed-out gray-on-color is forbidden.

## 3. Typography

**Display Font:** Bricolage Grotesque (with DM Sans, sans-serif fallback)
**Body Font:** DM Sans (with sans-serif fallback)

**Character:** A confident, slightly editorial grotesque for headlines and numbers, set against a clean, friendly humanist sans for reading. The pairing is a true contrast axis (expressive display vs. neutral body), not two lookalike sans fighting each other. Figures lean on Bricolage's weight and `tabular-nums` so money and metrics align in columns.

### Hierarchy
- **Display** (800, 24px, tabular-nums, -0.5px): Big stat values, key figures on cards.
- **Headline** (800, 21px, -0.3px): Page titles in the sticky header.
- **Title** (700, 15px): Card titles, section headers.
- **Body** (400, 14px, line-height 1.6): Default reading text. Keep measure at 65–75ch.
- **Label** (600, 11px, uppercase, 0.8px tracking): Field labels, stat captions, table headers. Always uppercase with tracking.

### Named Rules
**The Tabular Money Rule.** Any number a seller compares — price, margin, ACoS, cashflow — uses `font-variant-numeric: tabular-nums` so digits align vertically. Never let money jitter between rows.

**The Two-Family Rule.** Bricolage for display and figures, DM Sans for everything else. No third font. Never pair a second grotesque against Bricolage.

## 4. Elevation

The system uses real but quiet shadows — a two-part vocabulary of a tight contact shadow plus a wide, soft ambient shadow — to float surfaces above the workspace. Depth is tonal *and* shadowed: recessed surfaces step down through the `#f6f8fb → #d8dee8` neutral ramp, while cards and stats lift off it on diffuse shadows. Elevation is a response to state: cards and stat tiles translate up 1–2px on hover and deepen their shadow; nothing is dramatically lifted at rest.

### Shadow Vocabulary
- **Card rest** (`box-shadow: 0 1px 2px rgba(15,23,42,.04), 0 14px 36px -12px rgba(15,23,42,.09)`): Default float for cards.
- **Stat tile rest** (`0 1px 2px rgba(15,23,42,.04), 0 8px 22px -8px rgba(15,23,42,.08)`): Lighter float for compact stat cards.
- **Stat tile hover** (`0 12px 28px -8px rgba(15,23,42,.12)`) with `translateY(-2px)`: Interactive lift.
- **Primary button** (`0 6px 18px rgba(217,119,6,.38), inset 0 1px 0 rgba(255,255,255,.32)`): Warm amber cast + inner top highlight — the only colored shadow in the system.

### Named Rules
**The Quiet Lift Rule.** Shadows are soft and wide, never hard and dark. If a shadow looks like a 2014 drop-shadow (tight, gray, high-opacity), it's wrong: widen the blur, drop the opacity, push it down. Lift on hover by 1–2px, no more.

## 5. Components

### Buttons
- **Shape:** Rounded (12px; small variant 10px), min-height 42px (small 34px).
- **Secondary (default `.btn`):** White fill, `#d3dae4` 1.5px border, ink text, soft contact shadow. Hover shifts border and text to amber over a `#fffaf2` warm-white fill and lifts 1px; active presses down with a subtle `scale(.99)`.
- **Primary (`.btn-p`):** Amber gradient (`#f59e0b → #d97706 → #b45309`), white text, inner top highlight, warm amber shadow. Hover deepens the gradient toward `#92400e`.
- **Danger / Success (`.btn-d` / `.btn-g`):** Outlined in red/green, filling solid on hover. Reserved for destructive and confirming actions respectively.

### Chips / Badges
- **Style:** Pill (16px radius), 11px, weight 600, tinted background of the hue's own color at ~9–11% with matching saturated text (e.g. `.b-recherche` = purple text on purple tint).
- **State:** Category/status meaning only (idea, research, analysis, ordered, rejected). Not interactive filters unless explicitly built as such.

### Cards / Containers
- **Corner Style:** 18px (cards), 16px (stat tiles).
- **Background:** White (`#ffffff`) on the workspace wash.
- **Shadow Strategy:** Card-rest / stat-tile-rest from Elevation; stat tiles lift on hover.
- **Border:** 1px hairline (`#e6eaf1`).
- **Internal Padding:** 22px (cards), 14px 20px (stat tiles).

### Inputs / Fields
- **Style:** 1.5px `#d3dae4` stroke on a faintly cool `#fbfcfe` fill, 10–11px radius, min-height 42px. Labels above, uppercase 11px with tracking.
- **Focus:** Border shifts to amber, fill goes pure white, and a soft 4px amber glow appears (`box-shadow: 0 0 0 4px rgba(217,119,6,.12)`). Hover only firms the border to `#b6c0cf`.
- **Search (`.sinput`):** Same treatment with an inset 🔍 glyph and left padding.

### Navigation
- **Style:** Fixed 232px dark navy rail (`#0c1322 → #152138`), accordion groups. Items are 14px, weight 500, muted `#a7b1cd` text with a soft icon tile.
- **States:** Hover lightens text and icon tile; **active** item gets an amber-tinted gradient, amber text (`#fcb64a`), and an inset amber ring. Sub-items use a purple accent for hub/stage context.
- **Mobile:** Rail slides off-canvas (`transform`) below the layout breakpoint; main content reclaims the full width.

### Signature — Help System
SellerHub leans on inline guidance for its mixed-experience audience: circular `?` tooltips (`.wtip` / `.wika-help`) that pop a dark navy card on hover, and larger persistent explainer boxes (`.help-box` in gold/blue/green/purple tints, `.wika-info-card` with an amber left-border). This is a first-class pattern, not an afterthought — guidance is available in place without cluttering the workspace.

## 6. Do's and Don'ts

### Do:
- **Do** keep amber (`#d97706`) as the single voice of emphasis — primary actions, active nav, focus rings, links. Rare by design.
- **Do** use `tabular-nums` for every comparable figure (price, margin, ACoS, cashflow).
- **Do** signal focus with the soft amber glow (`0 0 0 4px rgba(217,119,6,.12)`), and body-text contrast at ≥4.5:1 (ink `#0e1526` / soft ink `#4a556b` on light surfaces).
- **Do** lift cards and tiles 1–2px on hover with a wider, softer shadow — depth as a response to state.
- **Do** put colored text on a tint of its own hue; reserve the status hues for data meaning.
- **Do** offer guidance in place (`.wika-help`, `.help-box`) for newcomers without slowing pros down.

### Don't:
- **Don't** ship a **generic SaaS dashboard** look — no interchangeable blue-gradient admin template, no point-of-view-free chrome.
- **Don't** build a **cluttered enterprise tool** — no Seller-Central walls of cryptic tables without hierarchy, no density for density's sake.
- **Don't** go **playful consumer app** — no cartoonish illustration, emoji-first UI, or gamification around money and compliance.
- **Don't** slide into **cheap hustle/dropship** aesthetics — no loud neon, hype badges, or get-rich-quick urgency.
- **Don't** use a second accent to make something "pop." If two elements are both amber, one is wrong.
- **Don't** use hard black focus outlines or tight, dark 2014-style drop-shadows. Soft and wide, or nothing.
- **Don't** set muted gray (`#7e879b`) as body text on a tinted near-white — bump toward ink; light gray "for elegance" is the fastest way to fail contrast.
