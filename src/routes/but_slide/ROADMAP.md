# but_slide roadmap: from garden to walking simulator

The long game: a walking simulator surrounded by butterflies while the
music plays. Each phase is shippable on its own.

## Phase 1 — Da meadow (done)

`meadow.svelte` renders butterflies over the garden while the insanity
plays. The architecture decisions that matter later:

- **World coordinates.** Flutterbys live in a 0..100 world space and never
  know about the screen.
- **Camera transform.** A `camera {x, y}` maps world → screen. It is pinned
  at the origin today; everything already renders through it.
- **Depth.** Each flutterby has `z` (0..1) scaling its size and drift
  speed. This is proto-parallax.
- **Events.** The spawner announces each sound with a `butterfly_fwoosh`
  document event; the meadow bursts and scatters in response. Any future
  scene layer can listen to the same event.

## Phase 2 — The camera breathes

- Slow ambient camera drift (standing in a meadow, looking around).
- Parallax for real: screen offset = `(world - camera) * (0.5 + z)`, so
  near butterflies sweep faster than far ones.
- Layered background: split the garden art into 2–3 planes (sky /
  treeline / grass) that move at different camera rates. Foreground grass
  strip sells it.

## Phase 3 — Walking

- WASD / arrows / drag moves the camera; world grows past 0..100 with a
  tiled or extended background.
- Butterfly density varies by region (quiet corners, busy blooms) so
  walking feels like discovering.
- Sounds get world positions: clices spawn *somewhere*, stereo pan +
  volume by distance from the camera (Web Audio `PannerNode`). Walk
  toward a sound to find it.

## Phase 4 — The music

- Da jukebawx is the garden's soundtrack: garden mode can queue an album
  under the clice spray; Media Session shows the garden.
- Butterfly bursts sync to waveform peaks (we already compute peaks in
  `$lib/peaks.ts` for the scrubber -- reuse them as a cheap beat map).

## Tech notes

- DOM sprites are fine to ~100 flutterbys; past that, swap `meadow.svelte`
  internals to a `<canvas>` without touching the world/camera model.
- Keep the fwoosh event contract stable; it is the seam between the sound
  sim and the scene.
