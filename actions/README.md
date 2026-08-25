# GitHub Delivery Actions

The reusable composite Actions in this directory are the supported bridge from a
Card Catalog repository to published Forge tooling. They install exact CLI and
Render Profile versions from npm and never import Forge workspace source.

## `card-check`

Use `card-check` on pull requests. It validates a Card Source package,
compiles every sample, builds a canonical Card Artifact and creates a
self-contained Forge Web preview backed by a preview-channel Catalog Snapshot.

```yaml
- uses: LLwill/octo-card-forge/actions/card-check@github-delivery/v0.2.0
  with:
    card-path: cards/docs/access-request
    cli-version: "0.2.4"
    profile-version: "1.2.0-rc.4"
```

The default workflow artifact name is
`card-check-<card-id>-<card-version>-<commit-prefix>`.
After downloading and extracting the workflow artifact, open
`preview/index.html`. The entry embeds the verified Snapshot and Artifact, so
it does not require a Forge server or repository checkout; exact Profile and
Adaptive Cards SDK assets remain pinned by the Artifact.

## `card-release`

Use `card-release` from the Catalog repository's release branch after the
versioned Card directory has been merged. The caller must grant
`contents: write` and pass `github.token` explicitly.

```yaml
permissions:
  contents: write

steps:
  - uses: actions/checkout@v5
  - uses: LLwill/octo-card-forge/actions/card-release@github-delivery/v0.2.0
    with:
      card-path: cards/docs/access-request/versions/0.3.0
      cli-version: "0.2.4"
      profile-version: "1.2.0-rc.4"
      github-token: ${{ github.token }}
```

Release contract:

- tag: `card/<card-id>/v<version>`;
- `<card-id>-<version>.artifact.json`;
- `<card-id>-<version>.artifact.sha256`, containing the canonical Artifact digest;
- `<card-id>-<version>.handoff.zip`;
- `<card-id>-<version>.handoff.sha256`, containing the ZIP byte checksum;
- `verification.json`, containing the release-gate report.

An existing tag or Release is a hard failure. Release preparation can be tested
without publishing by setting `publish: "false"`.
