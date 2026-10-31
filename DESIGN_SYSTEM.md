# AI Interview Coach design system

This is the current UI baseline, not an accessibility certification.

## Foundations

- Primary action: deep stone / teal; avoid purple-blue gradients.
- Light canvas: `#f6f3ee`; panel: `#ffffff`; muted panel: `#f5f5f4`.
- Dark canvas: `#171b20`; panel: `#20262d`; muted panel: `#29313a`.
- Dark text: `#f1f5f9`, secondary `#c2cbd4`, muted `#aab4bf`, border `#46515d`.
- Semantic colors: teal for primary/success, amber for caution, rose for destructive/error, indigo for secondary analytics. Always include text labels with color indicators.
- Font stack: system UI first; Inter is an optional fallback already bundled by system availability, no external font download is required.
- Spacing follows Tailwind's 4px base scale; common page gaps 16/24/32px.
- Surfaces use 8–16px radius, subtle neutral borders, and restrained shadows.
- Focus uses a visible 3px outline; controls use explicit labels and keyboard-operable buttons.

## Components and behavior

- Buttons: text labels for primary actions, visible focus, disabled state, and loading text for async work.
- Forms: visible labels, explanatory text near sensitive processing, and no preselected optional marketing consent.
- Reports: separate performance, completion and readiness; label approximate webcam metrics as estimates.
- Responsive layout uses Tailwind breakpoints, with mobile-first stacked content and scrollable horizontal navigation.
- Reduced-motion behavior is defined in `frontend/src/index.css` for existing avatar and entrance animation classes.

## Known gaps

Color contrast has not been measured across every Tailwind combination. Dialog focus trapping, high-contrast mode, and a full keyboard-only workflow audit remain. Existing components still contain hard-coded surfaces and need an incremental token migration.
