---
name: Sidekick
colors:
  surface: '#18181b'
  surface-dim: '#131315'
  surface-bright: '#39393b'
  surface-container-lowest: '#0e0e10'
  surface-container-low: '#1c1b1d'
  surface-container: '#201f22'
  surface-container-high: '#2a2a2c'
  surface-container-highest: '#353437'
  on-surface: '#e5e1e4'
  on-surface-variant: '#bbcabf'
  inverse-surface: '#e5e1e4'
  inverse-on-surface: '#313032'
  outline: '#86948a'
  outline-variant: '#3c4a42'
  surface-tint: '#4edea3'
  primary: '#4edea3'
  on-primary: '#003824'
  primary-container: '#10b981'
  on-primary-container: '#00422b'
  inverse-primary: '#006c49'
  secondary: '#ffb95f'
  on-secondary: '#472a00'
  secondary-container: '#ee9800'
  on-secondary-container: '#5b3800'
  tertiary: '#ffb3af'
  on-tertiary: '#650911'
  tertiary-container: '#fc7c78'
  on-tertiary-container: '#711419'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#6ffbbe'
  primary-fixed-dim: '#4edea3'
  on-primary-fixed: '#002113'
  on-primary-fixed-variant: '#005236'
  secondary-fixed: '#ffddb8'
  secondary-fixed-dim: '#ffb95f'
  on-secondary-fixed: '#2a1700'
  on-secondary-fixed-variant: '#653e00'
  tertiary-fixed: '#ffdad7'
  tertiary-fixed-dim: '#ffb3af'
  on-tertiary-fixed: '#410005'
  on-tertiary-fixed-variant: '#842225'
  background: '#09090b'
  on-background: '#e5e1e4'
  surface-variant: '#353437'
  zinc-50: '#fafafa'
  zinc-100: '#f4f4f5'
  zinc-200: '#e4e4e7'
  zinc-300: '#d4d4d8'
  zinc-400: '#a1a1aa'
  zinc-500: '#71717a'
  zinc-600: '#52525b'
  zinc-700: '#3f3f46'
  zinc-800: '#27272a'
  zinc-900: '#18181b'
  zinc-950: '#09090b'
  emerald-500: '#10b981'
  amber-500: '#f59e0b'
  red-500: '#ef4444'
  border: '#27272a'
  text-primary: '#f4f4f5'
  text-secondary: '#a1a1aa'
typography:
  headline-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 14px
  code-block:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  '0.5': 2px
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '6': 24px
  '8': 32px
  '12': 48px
  gutter: 12px
  margin: 16px
---

## Brand & Style

This design system is built for a professional, technical, and high-utility AI assistant. It draws inspiration from modern developer tools, prioritizing density, precision, and a "no-fluff" aesthetic. The personality is calm and competent, acting as a quiet companion to the user's workflow rather than a distraction.

The style is **Minimalist / Developer Tooling**. It utilizes a dark-centric interface with a strict adherence to a systematic grid. Visual hierarchy is established through subtle border variations and tonal shifts rather than heavy shadows or vibrant gradients. The interface should feel like an extension of the browser's native inspector or a high-end code editor—efficient, fast, and reliable.

## Colors

The palette is rooted in a deep, neutralized Zinc scale to minimize eye strain during long sessions. 

- **Primary (Emerald):** Used exclusively for successful states, primary action buttons, and active AI "thinking" indicators.
- **Secondary (Amber):** Reserved for parameters, syntax highlighting, and cautionary warnings.
- **Danger (Red):** Used for error states, destructive actions, and terminal-style alerts.
- **Surface Strategy:** The system uses `zinc-950` for the main background and `zinc-900` for elevated surfaces like input fields or card-style "turns" in the conversation. Borders use `zinc-800` to provide enough contrast for definition without breaking the minimal aesthetic.

## Typography

The typography is optimized for high information density. We use **Inter** for all UI elements and conversational text to ensure maximum legibility at small sizes. **JetBrains Mono** is employed for technical metadata, parameters, and code snippets to reinforce the developer-tool aesthetic.

The maximum body size is capped at 14px-15px to allow more content to fit within the narrow 320px sidebar. Line heights are kept tight but functional to maintain a professional "instrument panel" feel.

## Layout & Spacing

This design system is optimized for a narrow, vertical viewport (320px to 460px). It uses a **No Grid** philosophy, relying instead on a strict 4px spacing scale and consistent horizontal margins to align content.

- **Vertical Stack:** Elements should stack vertically with minimal horizontal nesting to avoid cramped text.
- **Density:** Spacing between related items (like a label and an input) should use the `1` (4px) or `2` (8px) tokens. 
- **Reflow:** On the minimum 320px width, all containers should use 100% width. Horizontal scrolling is strictly prohibited; code blocks must use internal scrolling or soft wrapping.

## Elevation & Depth

In line with the developer-tool aesthetic, depth is conveyed through **Low-contrast outlines** and **Tonal layers** rather than shadows.

- **Level 0 (Base):** `zinc-950` background.
- **Level 1 (Surfaces):** `zinc-900` with a 1px `zinc-800` border. Used for chat bubbles, code containers, and sidebar panels.
- **Level 2 (Interactive):** `zinc-800` for hover states on buttons or clickable list items.

Shadows are used only for floating menus or dropdowns, using a subtle, non-tinted `0 10px 15px -3px rgba(0, 0, 0, 0.5)`.

## Shapes

The shape language is "Soft" yet precise. Small radii reflect the professional nature of the tool, appearing more modern than sharp corners but more serious than highly rounded "consumer" apps.

- **Standard (md):** 6px for buttons, inputs, and cards.
- **Small (sm):** 4px for inner elements like chips or nested tags.
- **Large (lg):** 8px for the main outer container of the extension panel.

## Components

- **Buttons:** Primary buttons use `emerald-500` with black text. Secondary buttons use `zinc-800` with `zinc-100` text. Ghost buttons have no background until hover.
- **Input Fields:** `zinc-900` background, `zinc-800` border. On focus, the border shifts to `zinc-600` or `emerald-500` depending on the context.
- **Chips / Tags:** Small, mono-spaced text inside a `zinc-800` background. Used for displaying parameters like "model: gpt-4" or "temp: 0.7".
- **Chat Turns:** Distinct sections separated by a top border of `zinc-800`. The user turn is visually lighter (`zinc-100` text) while the AI response may use a slightly different background tone to differentiate the flow.
- **Code Blocks:** `zinc-950` background with a `zinc-800` border. Includes a header with the language name in `label-sm` and a "Copy" button that appears on hover.
- **Progress Indicators:** Thin 2px bars using `emerald-500` for positive progress or a pulsing `emerald-500/20` for indeterminate loading.