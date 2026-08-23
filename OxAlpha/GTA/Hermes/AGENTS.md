# GTA-Hermes — agent notes

- Harness: Hermes (Reika). Do not touch GTA-Codex or other harness dirs.
- Serve on 127.0.0.1:8421 (see PORT.md). Never kill foreign port owners.
- Tests: `node tests/test_controls.js` and `node tests/test_citygen.js` must pass.
- Control convention (project-wide): heading+ = turn RIGHT, pitch+ = look UP,
  three.js mapping rotation.y = -heading. Shared module js/core/controls_math.js
  is the single source of truth; node tests verify it directly.
- Quality presets in js/core/config.js; 'qa' preset exists for software renderers.
