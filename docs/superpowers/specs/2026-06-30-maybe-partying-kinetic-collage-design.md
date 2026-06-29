# MAYBE PARTYING — HyperFrames kinetic collage design

## Goal

Create a silent vertical social-video composition that reproduces the reference GIF's fast spatial typography while keeping every English phrase immediately readable.

## Output

- HyperFrames HTML composition.
- 1080×1920 portrait canvas.
- 30 fps target.
- 4.6-second duration.
- No audio or external media dependencies.

## Visual identity

The composition uses a nearly black, violet-tinted club background with localized magenta and cyan light blooms, subtle deterministic grain, and sparse geometric light traces. Typography is bold uppercase condensed sans serif with warm-white primary text. `PARTYING` uses electric magenta as the single dominant accent; cyan is limited to ambient background light.

Palette:

- Background: `#09070D`.
- Primary text: `#F7F2FA`.
- Secondary text: `#D8CFDE`.
- Main accent: `#FF2EC4`.
- Ambient cyan: `#22D3EE`.

Avoid full-screen linear gradients, rainbow coloring, excessive glow, long motion blur, and low-contrast gray captions.

## Composition and timing

The video is one continuous composition rather than separate scenes. This preserves the reference's rapid collage motion without introducing scene cuts.

- 0.00–0.18: dark club background establishes with faint light movement.
- 0.18–0.72: `MAYBE` enters from the upper-left with scale overshoot and a slight counter-clockwise angle, then settles near center.
- 0.62–1.62: `PARTYING` hits as the hero word. It grows past final size, snaps back, flashes its magenta glow, and performs a short deterministic shake.
- 1.48–2.28: `WILL` and `HELP` arrive from opposing directions with quick positional changes. The full phrase locks into a clean centered stack.
- 2.28–2.92: full phrase holds long enough to read while background decoratives continue subtle motion.
- 2.92–3.34: main phrase scales down and shifts upward to make room for the quote.
- 3.22–4.06: `“We need to get into` and `a little mischief.”` pop in as two smaller playful groups with restrained bounce.
- 4.06–4.38: complete composition holds.
- 4.38–4.60: final fade to the background.

## Motion rules

- Entrances use varied `back.out`, `expo.out`, and `power3.out` eases.
- Word animation durations remain between 0.16 and 0.34 seconds.
- `PARTYING` is the only element with shake and the strongest glow.
- All shake positions are explicitly authored; no randomness or time-based logic is allowed.
- Position changes remain within portrait safe margins and preserve reading order.
- The quote is calmer than the headline so the hierarchy remains clear.

## Structure

Create an isolated HyperFrames project directory under `hyperframes/maybe-partying/` containing:

- `index.html` — the standalone composition and GSAP timeline.
- `DESIGN.md` — palette, typography, and anti-patterns required by the visual identity gate.
- Project metadata produced by the HyperFrames scaffold only when required by the CLI.

The CRM application code, backend, database, contracts, PDF generation, and existing Vite entry point remain untouched.

## Verification

Run the checks from the composition directory:

- `npx hyperframes lint`.
- `npx hyperframes validate`.
- `npx hyperframes inspect --samples 15`.
- HyperFrames animation-map script and review all timing/layout flags.

Because this task adds only an isolated video composition and documentation, the CRM `npm run lint` and `npm run build` are not required.

## Acceptance criteria

- All supplied text is present with exact wording and punctuation.
- `PARTYING` is visually dominant without obscuring other words.
- The final headline and quote are readable at normal playback speed.
- No text clips or leaves the 1080×1920 safe area at its settled state.
- Motion is deterministic and the composition passes HyperFrames validation checks.
