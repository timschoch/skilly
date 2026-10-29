# Changelog

## [0.5.0](https://github.com/timschoch/skilly/compare/v0.4.0...v0.5.0) (2026-10-29)


### Features

* **engine:** setup applies .skilly/config.json, asks nothing, opens the setup PR ([#243](https://github.com/timschoch/skilly/issues/243)) ([8f63925](https://github.com/timschoch/skilly/commit/8f63925e932edccbbadb13eea68a2f273fe9da4e)), closes [#218](https://github.com/timschoch/skilly/issues/218)
* **engine:** setup decide phase with detect, config and preflight scripts ([#248](https://github.com/timschoch/skilly/issues/248)) ([a798217](https://github.com/timschoch/skilly/commit/a7982175a4541687964eebe47a99b6723a7fa8ff))


### Bug Fixes

* **bundles:** install the cursor-team-kit skills of the workflow Bundle ([#247](https://github.com/timschoch/skilly/issues/247)) ([28455cb](https://github.com/timschoch/skilly/commit/28455cb10465d69243f85447b213e37d9271a2a8))
* **engine:** verify steps run the Engine scripts, not the workflow Bundle's ([#245](https://github.com/timschoch/skilly/issues/245)) ([269e438](https://github.com/timschoch/skilly/commit/269e4380c805b89ddef3afa7a24f8d0976d4ccb3))

## [0.4.0](https://github.com/timschoch/skilly/compare/v0.3.0...v0.4.0) (2026-10-29)


### Features

* **engine:** repo settings module, check then set ([#232](https://github.com/timschoch/skilly/issues/232)) ([d51d738](https://github.com/timschoch/skilly/commit/d51d7383a49690438b3c1409b0e8b3d88d579ba3))
* **engine:** Sync writes the Managed workflows ([#235](https://github.com/timschoch/skilly/issues/235)) ([9479271](https://github.com/timschoch/skilly/commit/94792718813fd8f267b2fe1a74f6a7c8196886a4))
* **engine:** Sync writes the skilly hook entries, lefthook in every Consumer ([#236](https://github.com/timschoch/skilly/issues/236)) ([533c22f](https://github.com/timschoch/skilly/commit/533c22f5f84e550b66e8914ada0ccf262a158971))
* **engine:** the Sync writes release.yml, release PRs get verify without a person ([#240](https://github.com/timschoch/skilly/issues/240)) ([c2ca3d2](https://github.com/timschoch/skilly/commit/c2ca3d2b762d304f3c59e7bda3a2d3caf6997df7))
* **sync:** Hub nightly syncs every Consumer with the skilly App ([#237](https://github.com/timschoch/skilly/issues/237)) ([acfbf16](https://github.com/timschoch/skilly/commit/acfbf16d04b1e24314d8018de8330798f4d38100))

## [0.3.0](https://github.com/timschoch/skilly/compare/v0.2.0...v0.3.0) (2026-10-29)


### Features

* **engine:** skilly sync delivers the Sync PR for one Consumer ([#234](https://github.com/timschoch/skilly/issues/234)) ([cce80e8](https://github.com/timschoch/skilly/commit/cce80e8a3656f6b5b65e911db90464af762c071e))
* **verify:** run Bundle steps from config.json next to the gate ([#230](https://github.com/timschoch/skilly/issues/230)) ([256bb33](https://github.com/timschoch/skilly/commit/256bb33154de69d4a49858b5ceae3ebd9e9bb877))

## [0.2.0](https://github.com/timschoch/skilly/compare/v0.1.0...v0.2.0) (2026-10-29)


### Features

* **engine:** Engine folder and Sync module ([#231](https://github.com/timschoch/skilly/issues/231)) ([770aafb](https://github.com/timschoch/skilly/commit/770aafb12bded07b266e319de34afd454827798c))
* **release:** tag Hub Releases with release-please, record them as hub ([#224](https://github.com/timschoch/skilly/issues/224)) ([de8bbb8](https://github.com/timschoch/skilly/commit/de8bbb87ee3d3453c189ffb00fc2696a6c149c20)), closes [#208](https://github.com/timschoch/skilly/issues/208)


### Bug Fixes

* **format:** keep release-please's CHANGELOG.md out of the Prettier check ([#229](https://github.com/timschoch/skilly/issues/229)) ([9dd9c09](https://github.com/timschoch/skilly/commit/9dd9c0920f866e71f3b1e09cf0130c8518a8c431))
