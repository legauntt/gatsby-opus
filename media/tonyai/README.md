# Tony / AI listening archive

All 41 full MP3s from the approved `Music/troofs/mp3s` library are available at `/tonyai`, including the three Fight for Your Right versions. The page is unlisted, has no navigation link, and sends `noindex, nofollow, noarchive` in both its HTML and response headers. It is public to anyone with the URL; there is no access control.

The exact original MP3 files are tracked in `mp3s/` under URL-safe filenames and published as assets of the `tonyai-v1` GitHub release. They live outside `static/` to keep the Azure deployment within its size limit. `manifest.json` records original filenames, sizes, durations, and SHA-256 hashes. Audio is copied without re-encoding.

`prepare.py` reads the local source library, verifies copies, measures durations, and generates compact waveform data and the public catalog. It renders the static download list from `index.template.html`. Run it with Python 3.11 and the configured local FFmpeg tools, then format the generated HTML and JSON with the repository's Prettier configuration. No music generation models or stems are needed by the deployed page.

The standalone page in `static/tonyai/` uses one HTML audio element. It loads audio only after a listener presses play, supports search and sorting, seeking, previous/next, shuffle, automatic advancement, and MP3 downloads. The playback queue follows the visible list when a track is selected. Downloads remain available if JavaScript or the catalog fails.

Shuffle can be enabled beside Play the collection or in the player. A new shuffled queue includes each visible track once, with a random first track for Play the collection. Selecting a specific track keeps it first. Toggling shuffle during playback changes only upcoming tracks, preserving the current song and Previous history; turning it off restores collection order for the remaining tracks. The queue stops after its final track.

The two user-supplied porch portraits are stored as lossless WebP images in `static/tonyai/shoe-band.webp` and `static/tonyai/shoe-band-faces.webp`. Both are shown uncropped on desktop and mobile and link to their full-size files. Keep cover markup and player controls in `index.template.html` as well as the generated page so future MP3 uploads preserve them.
