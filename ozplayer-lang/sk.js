/*!
 * OzPlayer
 * https://github.com/accessibilityoz/OzPlayer
 *
 * Wrapper around MediaElement.js to provide additional accessibility features.
 *
 * Copyright 2013-, AccessibilityOz (https://www.accessibilityoz.com/)
 * License: MIT
 *
 * Slovak (sk) translation
 *
 */
(function(){var lang={
//----------------------------------------------------------------------------//


    //button labels and tooltips
    //n.b. the % tokens represent dynamic text:
    //%1 = the label attribute defined on the captions language's track element
    //%2 = the number of seconds' seeking controlled by rewind/forward buttons
    "button-playpause-off"      : "Prehrať"
    ,"button-playpause-on"      : "Pozastaviť"
    ,"button-mute-off"          : "Stlmiť"
    ,"button-mute-on"           : "Zapnúť zvuk"
    ,"button-cc-off"            : "Titulky sú vypnuté"
    ,"button-cc-on"             : "Titulky sú zapnuté"
    ,"button-cc-lang"           : "Titulky = %1"
    ,"button-cc-loading"        : "Načítavajú sa titulky ..."
    ,"button-cc-nolang"         : "Nepodarilo sa načítať %1"
    ,"button-cc-error"          : "Titulky nie sú k dispozícii"
    ,"button-ad-off"            : "Audiokomentár je vypnutý"
    ,"button-ad-on"             : "Audiokomentár je zapnutý"
    ,'button-ad-loading'        : "Načítava sa audiokomentár ..."
    ,'button-ad-error'          : "Audiokomentár nie je k dispozícii"
    ,"button-fullscreen-off"    : "Celá obrazovka"
    ,"button-fullscreen-on"     : "Ukončiť celú obrazovku"
    ,"button-rewind-off"        : "Späť o %2 sekúnd"
    ,"button-forward-off"       : "Vpred o %2 sekúnd"
    ,"button-pin-off"           : "Pripnúť ovládacie prvky"
    ,"button-pin-on"            : "Odopnúť ovládacie prvky"

    //button fallback text (e.g. when images are disabled)
    //n.b. the % tokens represent dynamic text:
    //%1 = the src attribute defined on the captions language's track element
    //%2 = the number of seconds' seeking controlled by rewind/forward buttons
    ,"text-playpause-off"       : "Prehrať"
    ,"text-playpause-on"        : "Pozastaviť"
    ,"text-mute-off"            : "Stlmiť"
    ,"text-mute-on"             : "Zapnúť zvuk"
    ,"text-cc-off"              : "CC (vyp)"
    ,"text-cc-on"               : "CC (zap)"
    ,"text-cc-lang"             : "CC (%1)"
    ,"text-cc-loading"          : "CC (...)"
    ,"text-tr-off"              : "TR (vyp)"
    ,"text-tr-on"               : "TR (zap)"
    ,"text-tr-lang"             : "TR (%1)"
    ,"text-tr-loading"          : "TR (...)"
    ,"text-ad-off"              : "AD (vyp)"
    ,"text-ad-on"               : "AD (zap)"
    ,"text-fullscreen-off"      : "Celá"
    ,"text-fullscreen-on"       : "Späť"
    ,"text-rewind-off"          : "-%2"
    ,"text-forward-off"         : "+%2"
    ,"text-pin-off"             : "Pripnúť"
    ,"text-pin-on"              : "Odopnúť"

    //menu labels
    ,"menu-cc-off"              : "Vypnuté"

    //slider tooltips
    //n.b. the % tokens represent dynamic values:
    //%1 = the seek slider time, or the volume slider volume
    ,"slider-seek"              : "Čas = %1"
    ,"slider-volume"            : "Hlasitosť = %1"

    //skip and help link text
    ,"skip-link-video"          : "Preskočiť video"
    ,"skip-link-transcript"     : "Preskočiť na prepis"

    //video messages
    ,"indicator-loading"        : "Načítava sa ..."
    ,"indicator-timeout"        : "Médium sa nepodarilo načítať."

    //transcript messages
    //n.b. the % tokens represent dynamic text:
    //%1 = the label attribute defined on the captions language's track element
    ,"transcript-off"           : "Prepis je vypnutý"
    ,"transcript-lang"          : "Prepis = %1"
    ,"transcript-loading"       : "Načítava sa prepis ..."
    ,"transcript-nolang"        : "Nepodarilo sa načítať %1."
    ,"transcript-error"         : "Prepis nie je k dispozícii."
    ,"transcript-end"           : "Koniec prepisu."

    //transcript active-cue label and glyph
    ,"transcript-cue-label"     : "Aktuálny riadok"
    ,"transcript-cue-glyph"     : "\u2192"

    //transcript expander twisty glyphs
    ,"expander-open"            : "\u25bc"
    ,"expander-closed"          : "\u25ba"


//----------------------------------------------------------------------------//
};for(var key in lang){if(lang.hasOwnProperty(key)){OzPlayer.define("lang."+key,lang[key]);}}})();
