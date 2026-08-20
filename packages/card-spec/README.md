# `@mlt-org/octo-card-spec`

Pure contracts and decoders for Octo Cards. The package does not read files,
resolve Git references, call HTTP services, or compile Adaptive Cards.

The current checked-in Card Source format is `CardSourceManifestV2`. Render
Profile files are accepted in compatibility mode while the repository migrates
them to the canonical `schemaVersion: 1` form.
