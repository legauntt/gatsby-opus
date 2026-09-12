# Tony / AI listening archive

The 50 full MP3s assigned to this archive are available at `/tonyai`, including three barbershop quartets with Tony on lead, tenor, baritone, and bass. The three Fear and Hunger tracks are published separately in `legauntt/yehry3` at `/fearhunger`; `excluded-sources.json` keeps them out of this catalog. The page is unlisted, has no navigation link, and sends `noindex, nofollow, noarchive` in both its HTML and response headers. It is public to anyone with the URL; there is no access control.

The exact original MP3 files are tracked in `mp3s/` under URL-safe filenames and published as assets of the `tonyai-v1` GitHub release. They live outside `static/` to keep the Azure deployment within its size limit. `manifest.json` records original filenames, sizes, durations, and SHA-256 hashes. Audio is copied without re-encoding.

`prepare.py` reads the local source library, applies `excluded-sources.json`, verifies copies, measures durations, and generates compact waveform data and the public catalog. It renders the static download list from `index.template.html`. Run it with Python 3.11 and the configured local FFmpeg tools, then format the generated HTML and JSON with the repository's Prettier configuration. No music generation models or stems are needed by the deployed page.

The standalone page in `static/tonyai/` uses one HTML audio element. It loads audio only after a listener presses play, supports search and sorting, seeking, previous/next, shuffle, automatic advancement, and MP3 downloads. The playback queue follows the visible list when a track is selected. Downloads remain available if JavaScript or the catalog fails.

Shuffle can be enabled beside Play the collection or in the player. A new shuffled queue includes each visible track once, with a random first track for Play the collection. Selecting a specific track keeps it first. Toggling shuffle during playback changes only upcoming tracks, preserving the current song and Previous history; turning it off restores collection order for the remaining tracks. The queue stops after its final track.

The user-supplied men-shaped shoes cover is stored as a pixel-exact lossless WebP in `static/tonyai/men-shaped-shoes.webp`. It is shown prominently and uncropped on desktop and mobile, with a link to the full-size file. Keep cover markup and player controls in `index.template.html` as well as the generated page so future MP3 uploads preserve them.
