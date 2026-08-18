# Editor onboarding message

Paste-ready copy for the motion designers. Plain text on purpose so it drops into Slack, email or
Notion without markdown artifacts. The team password is deliberately NOT in the body so the message
is safe to forward; keep it in a pinned message instead.

---

Hey team,

We built an internal tool that takes a creator's raw footage plus the storyboard and hands you back
an editable Premiere timeline, already cut in storyboard order. It is not a finished video and it is
not trying to be. The goal is to take the mechanical hours off your plate so you open a project that
is already assembled and spend your time on the part that actually needs you.

WHAT IT DOES FOR YOU

- Watches every take and picks the one that matches each line of the script
- Trims the heads and tails so each scene starts on the spoken word, no dead air or half breaths
- Lays the b-roll over the right lines, and starts each b-roll clip where the action actually happens
  rather than while the creator is still walking back from the camera
- Transcribes and times the captions, delivered as an SRT you can import and restyle
- Normalizes every clip to 1080x1920 / 30fps so nothing conforms weirdly on import
- Sets the voiceover to a sane level so the preview does not play quiet

WHAT IT DELIBERATELY DOES NOT DO, BECAUSE IT IS YOURS

- Colour grade
- Final caption styling
- Pacing nudges
- Graphics and end cards
- Any taste or client call

THREE THINGS WORTH KNOWING

1. The bin is already organized. Every clip is named by what it actually shows, not IMG_4021.MOV.
   The footage gets renamed upstream to match the storyboard, so you see things like
   "3rdPOV_talking to clinician" and "1stPOV_bills spread out" in the project. Each source appears
   in the bin exactly once as a full length master clip, even when it is used in five places on the
   timeline, so there is no pile of duplicate subclips to wade through. And the whole labelled
   folder is still in Dropbox, including the shots that did not make this cut, so if you want a
   different angle you can find it by name instead of scrubbing camera filenames.

2. Every source clip is linked FULL LENGTH, not pre-sliced. If a cut is a beat too early, just drag
   it. You are never stuck with the machine's decision.

3. If the storyboard asked for a shot nobody filmed, the tool tells you in a HANDOFF-NOTES file
   rather than quietly slipping the talking head in and hoping you do not notice. It does not
   generate footage to cover holes.

HOW TO USE IT

1. Go to https://videoeditor.srv1486031.hstgr.cloud and use the team password (see the pinned message).
2. Fill in the brand, the concept name, and your name.
3. Paste the Dropbox link to the footage folder (the renamed one, with aroll and broll inside).
4. Paste the storyboard table straight out of Notion. No reformatting, just copy the table and paste.
5. Hit Assemble. About 5 minutes per ad. You can close the tab, the job keeps running and shows up
   under Jobs.
6. Click Preview to watch it in place, then download the full handoff zip.
7. Unzip it, open the XML in Premiere, relink once, and read HANDOFF-NOTES.md before you start.

If the storyboard has more than one hook, you get one complete ad per hook, each with its own
timeline. Same body cut from the same takes, only the opener changes, so whichever wins on hook rate
is a clean result.

WHAT WE WOULD REALLY LIKE FROM YOU

This has been tested on a handful of ads, not a hundred, so your eye is the thing that tells us where
it is still wrong. When you finish one, could you tell us:

1. How long did the finish take you, compared to building it from scratch? This is the number we
   care about most.
2. Which cuts did you change, and why? Wrong take, wrong moment, cut too early or late. Timestamps
   help a lot.
3. Was anything wrong in a way you had to hunt for? A caption that did not match what was said,
   audio out of sync, a b-roll clip showing the wrong beat. These are the ones we most want to catch
   before they reach a client.
4. What did you have to do by hand that you think the tool should have done?
5. Anything that made you not trust the output. That matters more than a small imperfection, because
   if you have to check everything then it has not saved you anything.

Blunt feedback is the useful kind. If a cut is bad, say it is bad. Nothing here is precious, and
every problem reported so far has been fixed at the source so it does not come back.

Thanks,
Carl
