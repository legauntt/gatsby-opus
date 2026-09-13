# Legacy site audio

The original site-player MP3 and M4A files are published as immutable assets of the `site-audio-v1` GitHub release. They are intentionally absent from Git and the Azure Static Web Apps bundle.

`manifest.json` records every former public path, Release URL, byte size, and SHA-256 digest. The application uses Release URLs directly and translates relative paths found in older saved Garden Sim presets. `staticwebapp.config.json` redirects the former public asset URLs for compatibility.

Never overwrite a published asset. Upload revisions under a new release tag and update the manifest and site references together.
