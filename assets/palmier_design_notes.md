# Palmier.io Design System Analysis

## Color Palette
- Background: near-black (~#0a0a0a / rgb(10,10,10))
- Text primary: white (#ffffff)
- Text secondary: medium grey (~#888 / rgba(255,255,255,0.55))
- Accent/CTA: white filled button with black text (primary), ghost/outline secondary
- Nav background: transparent / very dark with blur
- Section dividers: very subtle 1px lines, barely visible

## Typography
- Font: System sans-serif stack — appears to be "Inter" or similar geometric sans
- H1: ~72-80px, weight 500-600 (NOT ultra-bold 900), tight letter-spacing (-0.02em), line-height ~1.1
- H2: ~40-48px, weight 500, same tight tracking
- Body: ~16-17px, weight 400, line-height ~1.6, color rgba(255,255,255,0.7)
- Labels/overlines: none — Palmier does NOT use uppercase overline labels
- No display/decorative fonts — purely geometric sans

## Layout
- Max-width: ~860px content column (narrow, centered)
- Hero: left-aligned text (NOT centered), starts at top-left of viewport
- Padding: very generous — ~120px top/bottom sections, ~48px horizontal
- Grid: mostly single-column stacked sections, some 2-col for feature+screenshot
- NO cards with backgrounds — sections are just text on dark background
- Feature sections: large h2 left, screenshot/demo right (or full-width below)

## Buttons
- Primary: white background, black text, border-radius ~9999px (fully rounded pill)
- Primary padding: ~12px 24px
- Primary font: ~14-15px, weight 500-600
- Secondary: ghost/outline — transparent bg, white border, white text, same pill radius
- NO box shadows on buttons
- Hover: slight opacity change (0.85)
- Button group: primary + secondary side by side with ~12px gap

## Nav
- Sticky, transparent with backdrop blur
- Logo left, nav links center, CTAs right
- Nav links: ~14px, weight 400, white, no underline
- CTA buttons in nav: same pill style, smaller padding

## Cards / Sections
- NO card backgrounds — features are just text blocks on the dark bg
- Feature sections separated by generous whitespace (120px+)
- Screenshots/demos shown in large rounded containers (~16px radius) with subtle border
- Screenshot containers: dark bg slightly lighter than page, 1px border rgba(255,255,255,0.1)

## Specific Palmier patterns to replicate for Tukang:
1. Top announcement bar (thin, full-width, slightly lighter bg)
2. Transparent sticky nav with pill CTAs
3. Left-aligned hero: large h1, short subtext, 2 pill buttons (primary white + ghost)
4. Full-width video/demo below hero in rounded container
5. Feature sections: h2 + body + "Learn more →" link, screenshot right
6. Integrations: horizontal scrolling logos row, centered, "Integrated with leading models" label
7. FAQ: accordion, minimal styling
8. Final CTA section: centered h2 + 2 buttons
9. Footer: 4-column links + social icons

## Key differences from current Tukang:
- Remove video background sections entirely → replace with static dark bg + screenshots/demos
- Remove amber accent → use white as primary accent, keep amber ONLY for brand identity badge
- Remove Clash Display font → use Inter (system) 
- Remove grain texture overlay
- Remove ken-burns animations on sections
- Increase section padding dramatically
- Make hero left-aligned, not centered
- Remove section overline labels (the amber uppercase "CONNECT TUKANG" etc.)
- Simplify tool grid → plain text list or minimal grid, no colored category badges
