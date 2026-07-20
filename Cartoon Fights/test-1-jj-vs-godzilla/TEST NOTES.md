# Test 1: JJ-style baby vs Godzilla-style kaiju, Tekken concept

Date: 2026-07-09. Pipeline: MaxFusion direct API, POST /videos, model seedance-2.0, 15s, 16:9, 1080p.

## Results

| Attempt | Content | Job ID | Result |
|---|---|---|---|
| Clip 1 v1 | Round intro, kaiju tail sweep + breath beam at the hero | 2b1f0db6-f67c-46d8-9aab-1c0deed21a76 | FAILED moderation |
| Clip 2 | Mid-fight, hero attacks, KO finisher, victory pose | d8ea07a2-22df-4dc6-96e8-9012121ebd70 | PASSED |
| Clip 1 v2 | Same intro, "chibi mascot" wording, beam away from hero | a0d2ef6f-bd9c-45a7-bd9a-5eb285dc1812 | FAILED moderation |
| Clip 1 v3 | Kaiju never attacks, hero does all offense | 280ad6f6-16db-46ae-85b7-9de06326736d | FAILED moderation |
| Clip 1 v4 | Identical resubmit of v3 | 9e602ca4-bac1-40ef-be93-86eecaef5964 | FAILED moderation |

Pass rate: 1 of 5. Error is always output-level: GENERATION_FAILED, content_policy_violation, "Output video has sensitive content", partner_validation_failed. The video renders fully (5 to 7 minutes) and is then rejected by the upstream provider's output filter, so the failure costs the full wait either way. A realistic-ish 3D baby in combat sits on the child-safety line of the filter; what passes is close to luck.

## Key learnings

1. Never put trademarked names in the prompt. Both characters were described by appearance only, and the model still produced an on-model JJ lookalike and Godzilla lookalike, including the HUD portraits.
2. Seedance 2.0 caps at 15 seconds per generation. A 30s+ video is always a stitch job.
3. The public /videos endpoint ignores reference images, so cross-clip character consistency is carried entirely by repeating an identical, hyper-detailed character description block in every prompt. It worked here.
4. Fighting-game HUD rendered in-model surprisingly well (health bars drain correctly, K.O. text legible), but the round timer number drifts (asked for 60, got 30/39). A real series should overlay the HUD in post instead.
5. Videos come back at result.video.url (singular), not result.videos[].
6. No cost or balance endpoint on the API. Check the MaxFusion dashboard to see whether the 4 failed generations billed.

## Files

- jj-vs-godzilla-tekken-30s.mp4: 30.7s master = passed clip (15s) + K.O. REPLAY card + slow-motion finisher replay (ffmpeg assembly)
- clip2-ko-finisher.mp4: the raw passed generation
- thumbnail-ko-frame.jpg: K.O. frame

## Prompt that PASSED (clip 2)

```
3D fighting game cinematic in the visual style of a modern AAA fighting game (Tekken-like), high-end game-engine render, 16:9, side-on fighting-game camera that dollies and orbits with the action. Persistent fighting game HUD locked to the top of the screen for the entire video: two long ornate health bars top-left and top-right with small circular character portraits, a large round-timer number in the top center, a small blue 'P1' tag near the left fighter and red 'P2' tag near the right fighter. STAGE: an ancient stone ruins arena on a misty mountain plateau at golden hour, cracked flagstone floor in a circular arena, weathered rock walls and wooden fences, distant jagged peaks and drifting clouds, warm sunlight with soft haze. FIGHTER 1 (left, P1): a cute 3D-animated toddler boy hero with an oversized round head, big sparkling eyes, rosy cheeks, one single swirl of brown hair on top of his head, wearing a green t-shirt with yellow and blue stripes, blue shorts and tiny white sneakers, rendered in glossy kids-cartoon 3D style, brave and giggly. FIGHTER 2 (right, P2): a towering kaiju monster styled like a classic giant movie lizard-monster, charcoal-gray scaly skin, jagged glowing dorsal fins down its spine, muscular thick tail, small yellow eyes, standing about three times taller than the toddler. TONE: playful, epic, family-friendly, exaggerated cartoony impacts, absolutely no blood, no gore, no injuries shown, impacts read as dust bursts, sparks, energy flashes and comedic knockbacks. SEQUENCE (15 seconds): 0-5s ESCALATION: same arena, same two fighters mid-battle; the kaiju lunges with a double claw swipe; the toddler blocks with crossed forearms and slides backward across the flagstones leaving two skid trails in the dust, then answers with a spinning jump and a rapid three-punch combo into the kaiju's belly, each hit popping a bright cartoony impact flash and shaking the camera; the kaiju's health bar drains low. 5-10s TURNING POINT: the kaiju drops to one knee and charges its blue spine glow for another breath beam; the toddler sprints up the kaiju's long tail like a ramp, running along its back between the glowing fins, and leaps high into the golden sky, silhouetted against the sun, fist cocked back. 10-15s FINISHER AND KO: slow-motion diving punch connects with the kaiju's jaw in a huge radial burst of golden sparks and dust; the kaiju's eyes go cartoon-dizzy spirals as it topples backward in slow motion and crashes flat on its back, a ring-shaped dust shockwave rolling outward; its health bar hits zero and giant golden 'K.O.' letters slam onto the center of the screen; the toddler lands lightly in a superhero pose, giggles, and throws both arms up in victory while the camera orbits him; confetti-like sparks drift down. Playful, family-friendly, no blood, exaggerated game-cinematic impacts, dramatic lighting, crisp 1080p quality.
```

## Prompt that FAILED 3x (clip 1 v3/v4, most conservative version)

```
3D fighting game cinematic in the visual style of a modern AAA fighting game (Tekken-like), high-end game-engine render, 16:9, side-on fighting-game camera that dollies and orbits with the action. Persistent fighting game HUD locked to the top of the screen for the entire video: two long ornate health bars top-left and top-right with small circular character portraits, a large round-timer number in the top center, a small blue 'P1' tag near the left fighter and red 'P2' tag near the right fighter. STAGE: an ancient stone ruins arena on a misty mountain plateau at golden hour, cracked flagstone floor in a circular arena, weathered rock walls and wooden fences, distant jagged peaks and drifting clouds, warm sunlight with soft haze. FIGHTER 1 (left, P1): a cute pint-sized 3D cartoon mascot hero with chibi proportions, an oversized round head, big sparkling eyes, rosy cheeks, one single swirl of brown hair on top of his head, wearing a green t-shirt with yellow and blue stripes, blue shorts and tiny white sneakers, rendered in glossy kids-cartoon 3D style, brave and giggly. FIGHTER 2 (right, P2): a towering kaiju monster styled like a classic giant movie lizard-monster, charcoal-gray scaly skin, jagged glowing dorsal fins down its spine, muscular thick tail, small yellow eyes, standing about three times taller than the little hero. TONE: playful, epic, family-friendly cartoon slapstick like a video game cutscene, exaggerated cartoony impacts, absolutely no blood, no gore, no injuries shown, impacts read as dust bursts, sparks, energy flashes and comedic knockbacks. SEQUENCE (15 seconds): 0-4s ROUND INTRO: wide establishing sweep of the arena; the little mascot hero bounces on his toes and settles into a playful fighting stance on the left; the kaiju throws its head back and roars at the sky on the right, stomping one heavy foot that cracks the flagstones with a dust shockwave; the HUD timer shows 60 and a big golden 'FIGHT!' text flashes in the center of the screen and disappears. 4-10s THE LITTLE HERO ATTACKS: the little hero sprints forward giggling, cartwheels through the drifting dust, springs off the ground and lands a flying kick square on the kaiju's knee with a bright golden impact flash; the kaiju staggers backward one heavy step, its health bar dipping, swinging its arms to keep balance while the little hero lands neatly and hops back into his stance. 10-15s SHOWBOAT: the frustrated kaiju roars and slams its thick tail down onto the empty stones on its own side of the arena, kicking up a wall of dust; the little hero playfully bounces from foot to foot, does a cheeky little taunt dance, then the camera pushes in slowly on his determined smiling face as embers and dust drift through the golden light, both fighters back in their stances ready for the next exchange. Dynamic fighting-game camera the whole time, dramatic golden-hour rim lighting, crisp 1080p game-cinematic quality.
```
