# Test 3: SpongeBob-style vs Hulk-style, CINEMATIC 3D concept (close-ups, no HUD)

Date: 2026-07-10. Pipeline: MaxFusion direct API, POST /videos, kling-3.0-pro, 15s each, 16:9, returns 1080p + audio. Both clips passed FIRST TRY (Kling now 4/4 on this IP pairing; ByteDance/Seedance remains blocked by its output-side copyright filter).

## What this test proved

1. Cinematic shot-list prompts get much better adherence from Kling than the game-HUD prompts did. Nearly every scripted beat landed: the eye-macro hook (lightning reflected in the iris), serious-face sponge sprinting through puddles, the thunderclap, and the exact money shot (giant mid-leap silhouetted against a lightning bolt while the sponge blows the counter-bubble).
2. "Serious" tone works with these characters. Expression override ("his usual cheerfulness is gone, face set in fierce determined concentration") rendered convincingly.
3. Teal-orange storm grade, volumetric rain, shallow-DOF close-ups all followed from plain-language style directions.
4. "No text, no HUD, no interface graphics anywhere" was respected - zero stray text.
5. Post treatment: 0.4s fade-in, hard cut between clips, 0.9s fade-out, plus 2.39:1 letterbox bars (138px top/bottom drawbox). Letterbox version is the master; full-frame kept alongside.

## Episode arc (30.1s)

Clip 1 "The Standoff": eye macro hook -> sponge guard close-up -> wide storm face-off -> charge + slow-mo slide under haymaker -> spinning kick to the jaw -> furious green-glow glare.
Clip 2 "Thunderclap": thunderclap ripping the rain -> sponge hurled + glove-drag stop -> resolve close-up w/ rack focus -> meteor leap vs giant bubble -> slow-mo bubble detonation -> both rise in the mist, locked eyes (stalemate hook).

## Jobs

| Clip | Job ID |
|---|---|
| clip 1 | 1e811a9a-384e-4f59-ad22-a531b7ce8bcf |
| clip 2 | a70920ce-7995-49ce-a3d6-256c2289c8f9 |

## Files

- spongebob-vs-hulk-cinematic-30s.mp4: letterboxed master (ship this)
- spongebob-vs-hulk-cinematic-30s-fullframe.mp4: same cut without bars
- clip1-standoff.mp4 / clip2-thunderclap-bubble.mp4: raw generations
- thumbnail-lightning-leap.jpg: the money shot

## Prompt - clip 1

```
CHARACTER A: a bright-yellow rectangular kitchen-sponge sea creature character, porous sponge texture with holes along his sides, big round blue eyes, two big front buck teeth, freckled cheeks, skinny noodle arms and legs, brown square shorts, white collared shirt with a small red tie, tall white socks with red and blue stripes, shiny black shoes, white karate sparring gloves on both hands. His usual cheerfulness is gone: his face is set in fierce, determined concentration. CHARACTER B: a colossal green-skinned muscle giant with a heavy scowling brow, shaggy dark hair, gigantic torso and arms with bulging muscles, wearing only ripped purple knee-length shorts, bare feet, three times taller than the sponge, radiating cold fury, faint green energy glow rising around his fists when enraged. SETTING: an ancient stone ruins arena on a mountain plateau at storm dusk. Heavy rain falls. Flagstones are rain-slicked with shallow puddles reflecting lightning. Mist rolls between broken pillars. VISUAL STYLE: photoreal high-end 3D animated feature film, cinematic anamorphic look, teal-and-orange grade: cool blue storm shadows, warm amber rim light from a distant fire glow, volumetric rain and mist, film grain, shallow depth of field on close-ups. Intense but clean PG action: absolutely no blood, no gore, no injuries shown; every impact reads as water spray, mist bursts, shockwaves and sparks. No text, no HUD, no interface graphics anywhere. SEQUENCE (15 seconds), serious cinematic fight, shot list: 0-2s HOOK: extreme close-up of the giant's eye snapping open under his heavy wet brow, a lightning flash reflected in the iris, rainwater streaming down the green skin. 2-4s: extreme close-up of the sponge's face, rain droplets clinging to his porous cheeks, eyes narrowed and hard; he slowly raises his white gloves into a tight guard, close-up of the glove fabric flexing as his fist clenches. 4-7s: cut wide, low angle across the rain-slicked arena: the two fighters face each other in the storm, steam rising off the giant's shoulders, the sponge's little red tie whipping in the wind, puddles trembling with thunder. 7-11s: the giant charges, tracking shot alongside him, each footfall detonating a puddle; the sponge dashes low and slides across the wet stone in extreme slow motion under a massive haymaker punch, the huge fist passing inches over him, a trail of water spray peeling off the knuckles in suspended droplets. 11-15s: the sponge springs off the flooded flagstones into a spinning karate kick that connects with the giant's jaw, extreme slow-motion close-up on the moment of impact, rain droplets bursting radially off the contact point, the giant's head snapping sideways in a sheet of mist; then a slow push-in as the giant turns back with a furious glare, faint green glow igniting in his eyes, rain hammering between them. Dramatic storm lighting, thunder and heavy rain in the audio, deep cinematic impacts, no dialogue.
```

## Prompt - clip 2

```
CHARACTER A: a bright-yellow rectangular kitchen-sponge sea creature character, porous sponge texture with holes along his sides, big round blue eyes, two big front buck teeth, freckled cheeks, skinny noodle arms and legs, brown square shorts, white collared shirt with a small red tie, tall white socks with red and blue stripes, shiny black shoes, white karate sparring gloves on both hands. His usual cheerfulness is gone: his face is set in fierce, determined concentration. CHARACTER B: a colossal green-skinned muscle giant with a heavy scowling brow, shaggy dark hair, gigantic torso and arms with bulging muscles, wearing only ripped purple knee-length shorts, bare feet, three times taller than the sponge, radiating cold fury, faint green energy glow rising around his fists when enraged. SETTING: an ancient stone ruins arena on a mountain plateau at storm dusk. Heavy rain falls. Flagstones are rain-slicked with shallow puddles reflecting lightning. Mist rolls between broken pillars. VISUAL STYLE: photoreal high-end 3D animated feature film, cinematic anamorphic look, teal-and-orange grade: cool blue storm shadows, warm amber rim light from a distant fire glow, volumetric rain and mist, film grain, shallow depth of field on close-ups. Intense but clean PG action: absolutely no blood, no gore, no injuries shown; every impact reads as water spray, mist bursts, shockwaves and sparks. No text, no HUD, no interface graphics anywhere. SEQUENCE (15 seconds), serious cinematic fight escalation, shot list: 0-2s HOOK: extreme close-up of the giant's massive palms slamming together in a thunderclap, the shockwave ring visibly ripping the falling rain apart in slow motion, a wall of mist racing outward. 2-5s: the pressure wave hits the sponge and hurls him tumbling backward across the flooded flagstones; ground-level tracking shot as he digs his gloves into the stone and grinds to a stop in a spray of water, his reflection shimmering in the puddle beneath him. 5-7s: extreme close-up: the sponge on one knee, breathing hard, rain streaming off his porous body; he wipes his cheek with the back of a glove and his eyes narrow with quiet resolve; rack focus from his sharp eyes to the giant charging as a blur in the background. 7-11s: the giant leaps skyward, silhouetted against a blinding lightning flash, both fists raised overhead, then descends like a meteor; low hero angle on the sponge as he plants his feet, inhales enormously, and releases one gigantic glistening soap bubble upward at the last instant. 11-15s: extreme slow motion: the giant's descending fists meet the bubble, its rainbow surface warping and stretching, suspended raindrops hanging in the frame, then the bubble detonates in a sphere of glowing mist that blasts both fighters apart across the arena; final wide shot through drifting mist: both fighters rise slowly to their feet in the rain, chests heaving, facing each other as lightning silhouettes them, slow push-in as they lock eyes. Dramatic storm lighting, thunder and rain, deep cinematic slow-motion impacts, no dialogue.
```
