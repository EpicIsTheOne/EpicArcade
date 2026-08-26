/* HOLLOW SIGNAL — narrative content */
(function(){
"use strict";
const HG = window.HG;

HG.Story = {
  title:'HOLLOW SIGNAL',

  intro:
`MAINTENANCE CONTRACT · TICKET 4471
KESTREL DEEP FIELD STATION — SEISMIC LISTENING POST

Eleven days ago the station stopped answering.

You are the contractor they sent to bring the power back.
The surface gate code didn't work. The service door did.

Site protocol says restore systems in order:
auxiliary, generator, freight lift.

The last crew left you a note:

    "Don't stay past dawn."`,

  /* ---------------- documents ---------------- */
  notes:{
    workOrder:{
      title:'WORK ORDER № 4471 — CLIPPED TO DESK',
      body:
`FULL SYSTEMS RESTORATION — CONTRACTOR ON SITE

from site manager Voss:

  Contractor — aux panel is in the ATRIUM.
  Spares fuses are where they always are
  (break room locker). Two needed.

  DO NOT touch mains before reading
  Dr. Marsh's addendum in security.

      — V.`,
    },
    lockerNote:{
      title:'TAPED INSIDE LOCKER 3',
      body:
`It hums along the pipes at night.
Not the generators. Not the pumps.

Tomas says if you hear singing,
put your headphones ON, not off.
Says it gets louder when it knows
you're listening.

I say stop writing creepy things
on shared property.

      — R.`,
    },
    marshAddendum:{
      title:'ADDENDUM — DR. E. MARSH, CHIEF RESEARCHER',
      body:
`To whoever restores power after us:

We pulled every fuse ourselves.
While it sleeps below, this place stays dead.
That was our mistake to make. It doesn't have to be yours.

The freight lift keypad is locked with
the day we first heard it.

After tonight you'll find that date everywhere.

Turn back. Let the dark keep its promise.

      — E.M.`,
    },
    labLog:{
      title:'ARRAY LOG — FINAL PAGES',
      body:
`DAY 12: Signal geometry is wrong. It isn't coming FROM the deep strata. It is coming THROUGH the array.

DAY 13: Playback of "the choir" in Lab C. Three researchers report hearing their own names inside it. Marsh orders all speakers destroyed.

DAY 14: Marsh seals containment wing with QS-1 inside. Won't say what QS-1 is. Won't say where it came from.

DAY 15: Tomas stopped sleeping. He stands at the blast door and taps rhythms on the glass. He says the hum knows his name now.

DAY 16: We cut the power. If it needs us quiet and blind down here, then quiet and blind we stay.

      [the log ends here]`,
    },
    storageNote:{
      title:'GREASE-STAINED PAGE',
      body:
`Borrowed the valve handle from the
generator fuel manifold to fix the
rec room sink. Worked great.

Put it back. SERIOUSLY. Voss checks.

It's on the workbench here in deep
storage until I do.

      — R.

p.s. something keeps rearranging
the boxes in aisle two. not funny.`,
    },
    recNote:{
      title:'HALF-FINISHED CROSSWORD',
      body:
`17 ACROSS (4 letters): "what the drill
found under the basalt" — starts with V.

Someone wrote "VOID" in pen, crossed it
out, wrote "VOICE", crossed that out too.

Underneath, in different handwriting:

    APRIL 17. IT ANSWERED.`,
    },
    vossFinal:{
      title:'CRUMPLED BY THE KEYPAD',
      body:
`code is APRIL 17 — the day it began.
month and day. four digits. that's all
it wants you to remember.

if the lift is coming and you hear it
coming too: QUIET. it hunts with its
ears, not its eyes. walk. don't run
unless you must.

and whatever happens, get in the cage.

      — V.`,
    },
  },

  /* keypad solution: April 17 → 0417 */
  code:'0417',

  /* ---------------- ending radio ---------------- */
  ending:
`[static clears]

— copy contractor, say again?

"Station's restored. Aux, generator, lift.
Freight car two is coming up now."

— roger that. hold for surface team.
  ...hold on. who pulled the fuses?

"Previous crew. Chief researcher Marsh."

— there's no Marsh on this manifest.
  Kestrel Deep closed in NINETEEN eighty-
  three. there's been no one down there
  since.

"...the station was warm."

— say again?

"I said the station was WARM—"

[the radio finds only a slow, patient hum]

        HOLLOW SIGNAL`,

  tips:[
    'crouch [C] moves quietly — sprinting can be heard through walls',
    'the generator room noise covers your footsteps',
    'read everything. the station leaves instructions for the living',
  ],
};

})();
