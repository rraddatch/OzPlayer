# OzPlayer 4.2 Changelog

Contributed by Radoslav Ďurač ([@rraddatch](https://github.com/rraddatch)).

## New Features

* Added a Slovak (`sk`) UI translation, `ozplayer-lang/sk.js`, covering all button labels, tooltips, fallback text, menu labels, slider tooltips, skip links, loading/error messages, and transcript strings (same key set as `ozplayer-lang/en.js`).
* Added Slovak captions and a Slovak transcript for the "About OzPlayer" demo video:
  * `media/captions/sk/ozplayer.vtt`
  * `media/transcripts/sk/ozplayer-transcript.vtt`
* Added `demo-sk.html`, a standalone (PHP-free) Slovak-language demo page. It loads the player with `html lang="sk"`, `ozplayer-lang/sk.js`, and both Slovak (default) and English caption/transcript tracks selectable from the CC menu.

## Bug Fixes

* Fixed a click-handler failure (`player.controlform[key].command is not a function`) that breaks **every** control button (play/pause, mute, CC, AD, fullscreen, pin, rewind/forward, CC menu items) in current Chromium-based browsers (Chrome, Edge).

  **Root cause:** OzPlayer stores each button's click handler as a JS property named `command` (assigned via the internal `.command` render key in `ozplayer-core/ozplayer.js`). Recent Chromium versions ship the [Invoker Commands API](https://developer.mozilla.org/en-US/docs/Web/API/HTMLButtonElement/command), which defines a *native* `command` accessor on `HTMLButtonElement`. Assigning a function to `button.command` now gets coerced through that native accessor and reflected back as a string HTML attribute instead of staying a callable JS property, so every `....command()` call throws and no button responds to clicks — including play.

  **Fix:** renamed the internal handler property from `.command` to `.ozcommand` everywhere in `ozplayer-core/ozplayer.js` (22 occurrences: 9 handler definitions + 13 call sites), avoiding the name collision. Verified with an automated headless-Chromium run (Playwright): play/pause, mute, CC menu (language switching), audio description, pin, and fullscreen controls all work again, with the Slovak UI strings rendering correctly throughout.

## Updated files

* `ozplayer-core/ozplayer.js` (bugfix: `.command` → `.ozcommand`)

## New files

* `ozplayer-lang/sk.js`
* `media/captions/sk/ozplayer.vtt`
* `media/transcripts/sk/ozplayer-transcript.vtt`
* `demo-sk.html`
