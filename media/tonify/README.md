# Tonify V6

The listening room is served at `/tonify` from `static/tonify/index.html`. It uses ordinary HTML audio players and has no external JavaScript or stylesheet dependencies.

All 25 linked audio files are versioned as assets of the `tonify-v6` GitHub release and are not stored in Git:

- three full MP3 songs and nineteen comparison/showcase MP3 clips;
- lossless WAV downloads for the three full songs;
- `manifest.json`: public URLs, sizes, durations, and SHA-256 hashes.

Publish audio assets before deploying page links. Existing asset names are immutable; future revisions use a new release tag:

```powershell
gh release upload tonify-v6 <verified-audio-files> --repo legauntt/gatsby-opus
```

Keep the release asset filenames stable: the HTML links directly to them. Never use `--clobber`; future audio revisions should use a new release tag and updated paths rather than replace published assets silently.

The three songs and nineteen clips are AI music experiments. A/B comparisons share the same source performance and are matched for loudness. Votes are stored only in the listener's browser.
