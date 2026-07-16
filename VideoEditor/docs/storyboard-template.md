CONCEPT:  <short title of the ad>
BRAND:    <client>
FORMAT:   <talking-head listicle | interview | podcast | UGC discovery>
DURATION: <e.g. 30-35>
AUDIO:    <creator | generated>          # creator = on-camera voice carries it; generated = we make the VO
END CARD: <closing CTA text + URL>
HOOKS:                                   # talking-head only; one line per variant (delete if none)
  - <hook option 1>
  - <hook option 2>

# ---- one block per scene ----
# TYPE: talkinghead | broll        (an end card is just a broll scene pointing at a provided graphic; nothing is generated)
# FOOTAGE: for broll = exact filename(s) in footage/broll/ (comma-separate two clips); for talkinghead = -
# LINE: the intended spoken line (drives structure + b-roll match; captions come from the real audio)

SCENE: Hook | TYPE: talkinghead | FOOTAGE: -
  LINE: <hook line>

SCENE: 1 | TYPE: broll | FOOTAGE: <filename_without_extension>
  LINE: <line>

SCENE: 2 | TYPE: broll | FOOTAGE: <filename_without_extension>
  LINE: <line>

SCENE: 3 | TYPE: talkinghead | FOOTAGE: -
  LINE: <line>

SCENE: CTA | TYPE: talkinghead | FOOTAGE: -
  LINE: <closing line + CTA URL>
