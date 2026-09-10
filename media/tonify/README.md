# Tonify V6

The listening room is served at `/tonify` from `static/tonify/index.html`. It uses ordinary HTML audio players and has no external JavaScript or stylesheet dependencies.

All 25 linked audio files are versioned in this repository:

- `static/tonify/mp3s/`: three full songs and nineteen comparison/showcase clips.
- `media/tonify/wavs/`: lossless WAV downloads for the three full songs.
- `manifest.json`: relative paths, public URLs, sizes, durations, and SHA-256 hashes.

MP3s are included in the Azure Static Web Apps deployment. The WAV files add approximately 188 MiB, so they are served as assets of the `tonify-v6` GitHub release instead of consuming the site's storage allowance. Publish the three WAV assets before deploying the page:

```powershell
$tonifyWavs = Get-ChildItem -LiteralPath media/tonify/wavs -Filter '*.wav' | Select-Object -ExpandProperty FullName
gh release create tonify-v6 @tonifyWavs --target COMMIT_SHA --title "Tonify V6 audio" --notes-file media/tonify/release-notes.md --latest=false
```

Keep the release asset filenames stable: the HTML links directly to them. Future audio revisions should use a new release tag and updated paths rather than replace published assets silently.

The three songs and nineteen clips are AI music experiments. A/B comparisons share the same source performance and are matched for loudness. Votes are stored only in the listener's browser.
