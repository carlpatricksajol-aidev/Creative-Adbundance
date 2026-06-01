# UI/UX Pro Max - Design Intelligence Skill

Source: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill (MIT License)

## Core Purpose

This comprehensive design skill provides guidance across 50+ styles, 161 color palettes, 57 font pairings, and 99 UX guidelines for web and mobile applications. Use it for UI structure, visual design decisions, interaction patterns, and user experience quality control.

---

## When to Apply

### Must Use

- Designing a new page (Landing Page, Dashboard, Admin, SaaS, Mobile App)
- Creating or refactoring UI components (buttons, modals, forms, tables, charts)
- Selecting color schemes, font systems, spacing, or layout systems
- Reviewing UI code for UX, accessibility, or visual consistency
- Implementing navigation structure, animations, or responsive behavior
- Making product-level design decisions (style, information hierarchy, brand expression)
- Improving perceived quality, clarity, or usability of an interface

### Recommended

- UI looks "unprofessional" but the reason isn't clear
- Received usability or experience feedback
- Pre-launch UI quality optimization
- Aligning cross-platform design (Web / iOS / Android)
- Building a design system or reusable component library

### Skip

- Pure backend logic development
- API or database design only
- Performance optimization unrelated to UI
- Infrastructure or DevOps work
- Non-visual scripts or automation tasks

**Rule of thumb:** If the task changes how something *looks, feels, moves, or is interacted with* — use this skill.

---

## Priority Framework

| Priority | Category | Impact | Key Checks | Anti-Patterns |
|----------|----------|--------|------------|---------------|
| 1 | Accessibility | CRITICAL | Contrast 4.5:1, Alt text, Keyboard nav, Aria-labels | Removing focus rings, Icon-only buttons without labels |
| 2 | Touch & Interaction | CRITICAL | Min size 44×44px, 8px+ spacing, Loading feedback | Hover-only interactions, Instant state changes (0ms) |
| 3 | Performance | HIGH | WebP/AVIF, Lazy loading, Reserve space (CLS < 0.1) | Layout thrashing, Cumulative Layout Shift |
| 4 | Style Selection | HIGH | Match product type, Consistency, SVG icons (no emoji) | Mixing flat & skeuomorphic randomly, Emoji as icons |
| 5 | Layout & Responsive | HIGH | Mobile-first breakpoints, Viewport meta, No horizontal scroll | Horizontal scroll, Fixed px container widths, Disable zoom |
| 6 | Typography & Color | MEDIUM | Base 16px, Line-height 1.5, Semantic color tokens | Text < 12px body, Gray-on-gray, Raw hex in components |
| 7 | Animation | MEDIUM | Duration 150–300ms, Motion conveys meaning, Spatial continuity | Decorative-only animation, Animating width/height, No reduced-motion |
| 8 | Forms & Feedback | MEDIUM | Visible labels, Error near field, Helper text, Progressive disclosure | Placeholder-only label, Errors only at top, Overwhelm upfront |
| 9 | Navigation Patterns | HIGH | Predictable back, Bottom nav ≤5, Deep linking | Overloaded nav, Broken back behavior, No deep links |
| 10 | Charts & Data | LOW | Legends, Tooltips, Accessible colors | Relying on color alone to convey meaning |

---

## Quick Reference Rules

### 1. Accessibility (CRITICAL)

- `color-contrast` — Minimum 4.5:1 ratio for normal text (large text 3:1)
- `focus-states` — Visible focus rings on interactive elements (2–4px)
- `alt-text` — Descriptive alt text for meaningful images
- `aria-labels` — aria-label for icon-only buttons; accessibilityLabel in native
- `keyboard-nav` — Tab order matches visual order; full keyboard support
- `form-labels` — Use label with for attribute
- `skip-links` — Skip to main content for keyboard users
- `heading-hierarchy` — Sequential h1→h6, no level skip
- `color-not-only` — Don't convey info by color alone (add icon/text)
- `dynamic-type` — Support system text scaling; avoid truncation as text grows
- `reduced-motion` — Respect prefers-reduced-motion; reduce/disable animations when requested
- `voiceover-sr` — Meaningful accessibilityLabel/accessibilityHint; logical reading order
- `escape-routes` — Provide cancel/back in modals and multi-step flows
- `keyboard-shortcuts` — Preserve system and a11y shortcuts; offer keyboard alternatives for drag-and-drop

### 2. Touch & Interaction (CRITICAL)

- `touch-target-size` — Min 44×44pt (Apple) / 48×48dp (Material); extend hit area beyond visual bounds if needed
- `touch-spacing` — Minimum 8px/8dp gap between touch targets
- `hover-vs-tap` — Use click/tap for primary interactions; don't rely on hover alone
- `loading-buttons` — Disable button during async operations; show spinner or progress
- `error-feedback` — Clear error messages near problem
- `cursor-pointer` — Add cursor-pointer to clickable elements (Web)
- `gesture-conflicts` — Avoid horizontal swipe on main content; prefer vertical scroll
- `tap-delay` — Use touch-action: manipulation to reduce 300ms delay (Web)
- `standard-gestures` — Use platform standard gestures consistently; don't redefine
- `system-gestures` — Don't block system gestures (Control Center, back swipe, etc.)
- `press-feedback` — Visual feedback on press (ripple/highlight; MD state layers)
- `haptic-feedback` — Use haptic for confirmations and important actions; avoid overuse
- `gesture-alternative` — Don't rely on gesture-only interactions; always provide visible controls for critical actions
- `safe-area-awareness` — Keep primary touch targets away from notch, Dynamic Island, gesture bar and screen edges
- `no-precision-required` — Avoid requiring pixel-perfect taps on small icons or thin edges
- `swipe-clarity` — Swipe actions must show clear affordance or hint
- `drag-threshold` — Use a movement threshold before starting drag to avoid accidental drags

### 3. Performance (HIGH)

- `image-optimization` — Use WebP/AVIF, responsive images (srcset/sizes), lazy load non-critical assets
- `image-dimension` — Declare width/height or use aspect-ratio to prevent layout shift (CLS)
- `font-loading` — Use font-display: swap/optional to avoid invisible text (FOIT)
- `font-preload` — Preload only critical fonts; avoid overusing preload on every variant
- `critical-css` — Prioritize above-the-fold CSS
- `lazy-loading` — Lazy load non-hero components via dynamic import / route-level splitting
- `bundle-splitting` — Split code by route/feature to reduce initial load and TTI
- `third-party-scripts` — Load third-party scripts async/defer; audit and remove unnecessary ones
- `reduce-reflows` — Avoid frequent layout reads/writes; batch DOM reads then writes
- `content-jumping` — Reserve space for async content to avoid layout jumps
- `lazy-load-below-fold` — Use loading="lazy" for below-the-fold images and heavy media
- `virtualize-lists` — Virtualize lists with 50+ items
- `main-thread-budget` — Keep per-frame work under ~16ms for 60fps
- `progressive-loading` — Use skeleton or progress indicator when loading exceeds 300ms
- `input-latency` — Keep input latency under ~100ms for taps/scrolls
- `tap-feedback-speed` — Provide visual feedback within 100ms of tap
- `debounce-throttle` — Use debounce/throttle for high-frequency events (scroll, resize, input)
- `offline-support` — Provide offline state messaging and basic fallback
- `network-fallback` — Offer degraded modes for slow networks

### 4. Style Selection (HIGH)

- `style-match` — Match style to product type
- `consistency` — Use same style across all pages
- `no-emoji-icons` — Use SVG icons (Heroicons, Lucide), not emojis
- `color-palette-from-product` — Choose palette from product/industry
- `effects-match-style` — Shadows, blur, radius aligned with chosen style
- `platform-adaptive` — Respect platform idioms (iOS HIG vs Material)
- `state-clarity` — Make hover/pressed/disabled states visually distinct
- `elevation-consistent` — Use consistent elevation/shadow scale for cards, sheets, modals
- `dark-mode-pairing` — Design light/dark variants together
- `icon-style-consistent` — Use one icon set/visual language across the product
- `system-controls` — Prefer native/system controls over fully custom ones
- `blur-purpose` — Use blur to indicate background dismissal, not as decoration
- `primary-action` — Each screen should have only one primary CTA

### 5. Layout & Responsive (HIGH)

- `viewport-meta` — width=device-width initial-scale=1 (never disable zoom)
- `mobile-first` — Design mobile-first, then scale up to tablet and desktop
- `breakpoint-consistency` — Use systematic breakpoints (375 / 768 / 1024 / 1440)
- `readable-font-size` — Minimum 16px body text on mobile
- `line-length-control` — Mobile 35–60 chars per line; desktop 60–75 chars
- `horizontal-scroll` — No horizontal scroll on mobile
- `spacing-scale` — Use 4pt/8dp incremental spacing system
- `touch-density` — Keep component spacing comfortable for touch
- `container-width` — Consistent max-width on desktop (max-w-6xl / 7xl)
- `z-index-management` — Define layered z-index scale (0 / 10 / 20 / 40 / 100 / 1000)
- `fixed-element-offset` — Fixed navbar/bottom bar must reserve safe padding
- `scroll-behavior` — Avoid nested scroll regions interfering with main scroll
- `viewport-units` — Prefer min-h-dvh over 100vh on mobile
- `orientation-support` — Keep layout readable and operable in landscape mode
- `content-priority` — Show core content first on mobile
- `visual-hierarchy` — Establish hierarchy via size, spacing, contrast — not color alone

### 6. Typography & Color (MEDIUM)

- `line-height` — Use 1.5–1.75 for body text
- `line-length` — Limit to 65–75 characters per line
- `font-pairing` — Match heading/body font personalities
- `font-scale` — Consistent type scale (e.g. 12 14 16 18 24 32)
- `contrast-readability` — Darker text on light backgrounds (e.g. slate-900 on white)
- `text-styles-system` — Use platform type system: iOS Dynamic Type / Material 5 type roles
- `weight-hierarchy` — Bold headings (600–700), Regular body (400), Medium labels (500)
- `color-semantic` — Define semantic color tokens (primary, secondary, error, surface) not raw hex
- `color-dark-mode` — Dark mode uses desaturated/lighter tonal variants, not inverted colors
- `color-accessible-pairs` — Foreground/background pairs must meet 4.5:1 (AA) or 7:1 (AAA)
- `color-not-decorative-only` — Functional color (error red, success green) must include icon/text
- `truncation-strategy` — Prefer wrapping over truncation; use ellipsis + tooltip when truncating
- `letter-spacing` — Respect default letter-spacing per platform; avoid tight tracking on body
- `number-tabular` — Use tabular figures for data columns, prices, and timers
- `whitespace-balance` — Use whitespace intentionally to group related items

### 7. Animation (MEDIUM)

- `duration-timing` — 150–300ms for micro-interactions; complex transitions ≤400ms
- `transform-performance` — Use transform/opacity only; avoid animating width/height/top/left
- `loading-states` — Show skeleton or progress when loading exceeds 300ms
- `excessive-motion` — Animate 1–2 key elements per view max
- `easing` — Use ease-out for entering, ease-in for exiting; avoid linear for UI transitions
- `motion-meaning` — Every animation must express cause-effect, not just be decorative
- `state-transition` — State changes should animate smoothly, not snap
- `continuity` — Page/screen transitions should maintain spatial continuity
- `parallax-subtle` — Use parallax sparingly; must respect reduced-motion
- `spring-physics` — Prefer spring/physics-based curves over linear for natural feel
- `exit-faster-than-enter` — Exit animations ~60–70% of enter duration
- `stagger-sequence` — Stagger list/grid item entrance by 30–50ms per item
- `shared-element-transition` — Use shared element/hero transitions for continuity between screens
- `interruptible` — Animations must be interruptible; user tap/gesture cancels in-progress animation
- `no-blocking-animation` — Never block user input during an animation
- `fade-crossfade` — Use crossfade for content replacement within the same container
- `scale-feedback` — Subtle scale (0.95–1.05) on press for tappable cards/buttons
- `gesture-feedback` — Drag, swipe, and pinch must provide real-time visual response
- `hierarchy-motion` — Use translate/scale direction to express hierarchy
- `motion-consistency` — Unify duration/easing tokens globally
- `modal-motion` — Modals/sheets should animate from their trigger source

### 8. Forms & Feedback (MEDIUM)

- `input-labels` — Visible label per input (not placeholder-only)
- `error-placement` — Show error below the related field
- `submit-feedback` — Loading then success/error state on submit
- `required-indicators` — Mark required fields (e.g. asterisk)
- `empty-states` — Helpful message and action when no content
- `toast-dismiss` — Auto-dismiss toasts in 3–5s
- `confirmation-dialogs` — Confirm before destructive actions
- `input-helper-text` — Provide persistent helper text below complex inputs
- `disabled-states` — Disabled elements use reduced opacity (0.38–0.5) + cursor change
- `progressive-disclosure` — Reveal complex options progressively; don't overwhelm upfront
- `inline-validation` — Validate on blur (not keystroke); show error after user finishes input
- `input-type-keyboard` — Use semantic input types (email, tel, number) for correct mobile keyboard
- `password-toggle` — Provide show/hide toggle for password fields
- `autofill-support` — Use autocomplete/textContentType attributes for system autofill
- `undo-support` — Allow undo for destructive or bulk actions
- `success-feedback` — Confirm completed actions with brief visual feedback
- `error-recovery` — Error messages must include a clear recovery path
- `multi-step-progress` — Multi-step flows show step indicator or progress bar
- `form-autosave` — Long forms should auto-save drafts to prevent data loss
- `sheet-dismiss-confirm` — Confirm before dismissing a sheet/modal with unsaved changes
- `error-clarity` — Error messages must state cause + how to fix
- `field-grouping` — Group related fields logically
- `focus-management` — After submit error, auto-focus the first invalid field
- `destructive-emphasis` — Destructive actions use red color and are visually separated
- `toast-accessibility` — Toasts must not steal focus; use aria-live="polite"

### 9. Navigation Patterns (HIGH)

- `bottom-nav-limit` — Bottom navigation max 5 items; use labels with icons
- `drawer-usage` — Use drawer/sidebar for secondary navigation, not primary actions
- `back-behavior` — Back navigation must be predictable and consistent; preserve scroll/state
- `deep-linking` — All key screens must be reachable via deep link / URL
- `tab-bar-ios` — iOS: use bottom Tab Bar for top-level navigation
- `top-app-bar-android` — Android: use Top App Bar with navigation icon for primary structure
- `nav-label-icon` — Navigation items must have both icon and text label
- `nav-state-active` — Current location must be visually highlighted in navigation
- `nav-hierarchy` — Primary nav (tabs/bottom bar) vs secondary nav (drawer/settings) clearly separated
- `modal-escape` — Modals and sheets must offer a clear close/dismiss affordance
- `search-accessible` — Search must be easily reachable; provide recent/suggested queries
- `breadcrumb-web` — Web: use breadcrumbs for 3+ level deep hierarchies
- `state-preservation` — Navigating back must restore previous scroll position and filter state
- `gesture-nav-support` — Support system gesture navigation without conflict
- `tab-badge` — Use badges on nav items sparingly; clear after user visits
- `overflow-menu` — When actions exceed space, use overflow/more menu
- `bottom-nav-top-level` — Bottom nav is for top-level screens only
- `adaptive-navigation` — Large screens (≥1024px) prefer sidebar; small screens use bottom/top nav
- `back-stack-integrity` — Never silently reset navigation stack
- `navigation-consistency` — Navigation placement must stay the same across all pages
- `avoid-mixed-patterns` — Don't mix Tab + Sidebar + Bottom Nav at the same hierarchy level
- `modal-vs-navigation` — Modals must not be used for primary navigation flows
- `focus-on-route-change` — After page transition, move focus to main content region

### 10. Charts & Data (LOW)

- `chart-type` — Match chart type to data type (trend → line, comparison → bar, proportion → donut)
- `color-guidance` — Use accessible color palettes; avoid red/green only pairs for colorblind users
- `data-table` — Provide table alternative for accessibility
- `pattern-texture` — Supplement color with patterns/shapes so data is distinguishable without color
- `legend-visible` — Always show legend; position near the chart
- `tooltip-on-interact` — Provide tooltips/data labels on hover (Web) or tap (mobile)
- `axis-labels` — Label axes with units and readable scale
- `responsive-chart` — Charts must reflow or simplify on small screens
- `empty-data-state` — Show meaningful empty state when no data exists
- `loading-chart` — Use skeleton or shimmer placeholder while chart data loads
- `animation-optional` — Chart entrance animations must respect prefers-reduced-motion
- `large-dataset` — For 1000+ data points, aggregate or sample; provide drill-down
- `number-formatting` — Use locale-aware formatting for numbers, dates, currencies
- `touch-target-chart` — Interactive chart elements must have ≥44pt tap area
- `no-pie-overuse` — Avoid pie/donut for >5 categories; use bar chart instead
- `contrast-data` — Data lines/bars vs background ≥3:1; data text labels ≥4.5:1
- `legend-interactive` — Legends should be clickable to toggle series visibility
- `direct-labeling` — For small datasets, label values directly on the chart
- `tooltip-keyboard` — Tooltip content must be keyboard-reachable
- `sortable-table` — Data tables must support sorting with aria-sort
- `gridline-subtle` — Grid lines should be low-contrast (e.g. gray-200)
- `screen-reader-summary` — Provide text summary or aria-label describing chart's key insight
- `error-state-chart` — Data load failure must show error message with retry action
- `export-option` — For data-heavy products, offer CSV/image export of chart data

---

## Pre-Delivery Checklist

Before marking any UI task complete, verify:

- [ ] No emoji icons (use SVG icons only)
- [ ] Consistent hover/pressed/disabled states on interactive elements
- [ ] Color contrast meets 4.5:1 in both light and dark themes
- [ ] Safe-area insets handled (notch, Dynamic Island, gesture bar)
- [ ] 8dp spacing rhythm applied throughout
- [ ] No horizontal scroll on mobile viewport
- [ ] Loading and error states implemented for all async operations
- [ ] Focus management correct for keyboard users
- [ ] Animations respect `prefers-reduced-motion`
- [ ] All form fields have visible labels (not placeholder-only)
