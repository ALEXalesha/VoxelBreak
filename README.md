# VoxelBreak

**Planned.** A destruction sandbox in the browser: a world made of small voxels where everything really breaks, piece by
piece, and the debris falls by physics. In the spirit of the game Teardown, but its own and for the web.

[Русская версия](README.ru.md)

[![Status](https://img.shields.io/badge/status-planned-lightgrey)](#) [![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE) [![Built with Claude Code](https://img.shields.io/badge/Built_with-Claude_Code-D97757?logo=claude&logoColor=white)](https://claude.com/claude-code)

Code, tests and docs are written by Claude (Anthropic) in Claude Code. Ideas, testing and decisions - Alexey.

## Status

There is no code yet. The repository holds the design note
([docs/superpowers/specs/2026-10-17-voxelbreak-design.md](docs/superpowers/specs/2026-10-17-voxelbreak-design.md), in Russian),
which waits for Alexey's go-ahead. VoxelBreak is the working name; the repository is still called TearDown and will be
renamed together with the start of the work. This is a different project from
[TeardownMods](https://github.com/ALEXalesha/TeardownMods), the mods for the real game.

## What it will do

- **Tools:** a sledgehammer and bare hands (knock off piece by piece, push debris), explosions (dynamite, barrels, chain
  reactions), weapons (shotgun, rocket launcher, laser), vehicles (ram with a car, a bulldozer, a crane with a wrecking ball).
- **Worlds:** a town (houses, fences, cars, poles), nature (trees, rocks, bridges) and a **random world** generated in code
  every time.
- **Honest destruction:** a piece that comes off becomes its own body and falls; a structure that loses its support
  collapses. No swapping a model for a pre-broken one.
- **A frame budget:** a big explosion must not drop the game to an unplayable frame rate - small debris is merged, still
  pieces go to sleep.

Not planned for now: story, missions, enemies, multiplayer.

## How it will be built

- The browser and the Hub, three.js with voxel chunks and greedy meshing, own debris physics (or Rapier in WASM), its own
  Electron app; GitHub Pages.
- Ideas, not code, come from earlier work: the Teardown mods (catapult, tsunami, black hole) and the Cube World game.
- Russian and English, tests without visible windows.
- Laws (automatic checks): a piece without support falls, an explosion of radius R removes what it should, 60 fps on the
  reference scene.

## License

MIT
