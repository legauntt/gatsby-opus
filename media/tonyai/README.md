# Tony / AI listening archive

All 38 full MP3s from the approved `Music/troofs/mp3s` library are available at `/tonyai`, including the three Got It Made versions. The page is unlisted, has no navigation link, and sends `noindex, nofollow, noarchive` in both its HTML and response headers. It is public to anyone with the URL; there is no access control.

The exact original MP3 files are tracked in `mp3s/` under URL-safe filenames and published as assets of the `tonyai-v1` GitHub release. They live outside `static/` to keep the Azure deployment within its size limit. `manifest.json` records original filenames, sizes, durations, and SHA-256 hashes. Audio is copied without re-encoding.

`prepare.py` reads the local source library, verifies copies, measures durations, and generates compact waveform data and the public catalog. It renders the static download list from `index.template.html`. Run it with Python 3.11 and the configured local FFmpeg tools, then format the generated HTML and JSON with the repository's Prettier configuration. No music generation models or stems are needed by the deployed page.

The standalone page in `static/tonyai/` uses one HTML audio element. It loads audio only after a listener presses play, supports search and sorting, seeking, previous/next, automatic advancement, and MP3 downloads. The playback queue follows the visible list when a track is selected. Downloads remain available if JavaScript or the catalog fails.
