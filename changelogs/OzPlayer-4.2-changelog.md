# OzPlayer 4.2 Changelog

Contributed by Radoslav Ďurač ([@rraddatch](https://github.com/rraddatch)).

## New Features

* Added a Slovak (`sk`) UI translation, `ozplayer-lang/sk.js`, covering all button labels, tooltips, fallback text, menu labels, slider tooltips, skip links, loading/error messages, and transcript strings (same key set as `ozplayer-lang/en.js`).
* Added Slovak captions and a Slovak transcript for the "About OzPlayer" demo video:
  * `media/captions/sk/ozplayer.vtt`
  * `media/transcripts/sk/ozplayer-transcript.vtt`
* Added `demo-sk.html`, a standalone (PHP-free) Slovak-language demo page. It loads the player with `html lang="sk"`, `ozplayer-lang/sk.js`, and both Slovak (default) and English caption/transcript tracks selectable from the CC menu. It uses the `highlights-red.css` skin instead of the default `highlights-pink.css` — see Bug Fixes below.

## Bug Fixes

* Fixed a click-handler failure (`player.controlform[key].command is not a function`) that breaks **every** control button (play/pause, mute, CC, AD, fullscreen, pin, rewind/forward, CC menu items) in current Chromium-based browsers (Chrome, Edge).

  **Root cause:** OzPlayer stores each button's click handler as a JS property named `command` (assigned via the internal `.command` render key in `ozplayer-core/ozplayer.js`). Recent Chromium versions ship the [Invoker Commands API](https://developer.mozilla.org/en-US/docs/Web/API/HTMLButtonElement/command), which defines a *native* `command` accessor on `HTMLButtonElement`. Assigning a function to `button.command` now gets coerced through that native accessor and reflected back as a string HTML attribute instead of staying a callable JS property, so every `....command()` call throws and no button responds to clicks — including play.

  **Fix:** renamed the internal handler property from `.command` to `.ozcommand` everywhere in `ozplayer-core/ozplayer.js` (22 occurrences: 9 handler definitions + 13 call sites), avoiding the name collision. Verified with an automated headless-Chromium run (Playwright): play/pause, mute, CC menu (language switching), audio description, pin, and fullscreen controls all work again, with the Slovak UI strings rendering correctly throughout.

* Fixed insufficient color contrast in the default `highlights-pink.css` skin. Its hover/focus/active highlight rule sets white text (`color:#fff`) on `#FF3399`, which measures **3.4:1** — failing WCAG 2.1 SC 1.4.3 (AA, requires ≥ 4.5:1) — for real text elements it applies to (the transcript expander trigger, skip links, and captions/audio-description menu items). This is on `:focus` as well as `:hover`/`:active`, so it affects keyboard focus visibility specifically.

  `demo-sk.html` avoids this by loading the existing `highlights-red.css` skin (`#CC0000`) instead, which measures **5.89:1** and passes. `ozplayer-skin/highlights-pink.css` itself is unchanged by this PR; the color choice for the pink skin should be addressed separately.

* Fixed a Slovak transcript wording error: "Obraz na obrazovke" ("obraz" = painting/artwork) corrected to "Obrázok na obrazovke" ("obrázok" = image), the correct term for an on-screen graphic, in `media/transcripts/sk/ozplayer-transcript.vtt`.

## Updated files

* `ozplayer-core/ozplayer.js` (bugfix: `.command` → `.ozcommand`)
* `media/transcripts/sk/ozplayer-transcript.vtt` (wording fix)
* `demo-sk.html` (uses `highlights-red.css` instead of `highlights-pink.css`)

## New files

* `ozplayer-lang/sk.js`
* `media/captions/sk/ozplayer.vtt`
* `media/transcripts/sk/ozplayer-transcript.vtt`
* `demo-sk.html`
