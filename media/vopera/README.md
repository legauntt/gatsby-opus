# Someday — The Magic Vaccine Opera

The complete AI opera reimagining, 4:27. Public listening page: `/vopera`.

The page streams the original 320 kbps MP3 and links to the 24-bit WAV. Both exact delivered mixes are tracked here and published as assets of the `vopera-v1` GitHub release. They live outside `static` to keep the Azure bundle within its size limit. `manifest.json` records their public URLs and SHA-256 hashes.

The page is standalone HTML, CSS, and JavaScript under `static/vopera`; it needs no additional package or external font. The full MP3/WAV remain in separate folders. Training models, intermediate stems, and local production metadata are not published.
