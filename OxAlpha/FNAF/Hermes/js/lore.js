// lore.js — Wonderdrome story: answering-machine tapes, notes, files, endings.
'use strict';
WD.lore = {
  tapes: [
    { night:1, from:'Mgmt — Vera K.', text:'Welcome to Wonderdrome, night keeper. The building runs itself, mostly. Keep the show tunes wound on the workshop music box, keep the doors clear, and do not... overthink the cameras. The cast wanders at night to keep their joints limber. Company policy. They are not supposed to notice you.' },
    { night:2, from:'Mgmt — Vera K.', text:'If you hear scratching in the vents, that is Rivets. Maintenance never finished decommissioning him after the welding incident. He is harmless if the vent seals hold. Mostly harmless. The seals are on your console now. Sorry about the paperwork.' },
    { night:3, from:'Mgmt — Vera K.', text:'Bolt learned the sound of the door motors. He counts them. If you hear his little tune, he is picking a door — and he times the gap when you check the monitors. Close early, open late. And maybe stop watching him so much, you make him excited.' },
    { night:4, from:'Mgmt — Vera K.', text:'Madame Sera walked off the atrium fountain pedestal again. She only moves when nothing is watching — she was built that way, an honesty feature, they called it. If she is inside with you, do not think. Just hit the lights. All of them. She hates being seen up close.' },
    { night:5, from:'Mgmt — Vera K.', text:'The Wonder-0 marionette is not on the asset ledger. It was here before the renovation. The music box keeps it... parked. If the tune stops, wind it. Wind it FIRST, doors second. I have seen what it does to the door motors. I have seen what it does to doors.' },
    { night:6, from:'V.K. — personal', text:'Last tape. The fire report was a lie and you know it by now. Wonderdrome never burned in 87. It just closed its eyes. If you are hearing this, you took the night job anyway, which means either you are very brave, or the building chose you. Wind the box. Watch the halls. Do not let them start the show.' },
  ],
  notes: [
    { id:'n1', room:'dining', title:'Birthday list', text:'PARTY PACKAGE — 6 kids, cake at 4. Marcus asked if Bolt can do the squeak again. Mom said no clowns. Mom said NO CLOWNS. — desk calendar, Aug 14' },
    { id:'n2', room:'kitchen', title:'Health inspection', text:'CITED: freezer seal, vent grease, "animatronic presence in food prep area (advisory)". Passed with conditions. Inspector note: the bear waved at me. Cute unit. Very cute unit.' },
    { id:'n3', room:'workshop', title:'Work order 117', text:'Rivets saw-arm lockout FAILED again. Do NOT leave the disc energized overnight. If you hear grinding after close, it is not the pipes. It is never the pipes.' },
    { id:'n4', room:'backstage', title:'Spare parts manifest', text:'3x Orv head (retired), 2x Sera arm, 1x Bolt shoe. Heads face the wall per insurance. Do not turn them around. This is not a joke. — R.' },
    { id:'n5', room:'office', title:'Sticky note on monitor', text:'DOOR MOTOR DRAW IS A LIE. Meter says 1 unit, building says 3. Trust the building. — previous night keeper' },
    { id:'n6', room:'atrium', title:'Fountain plaque', text:'MADAME SERA — "She dances only for those who do not watch." Dedicated by Wonderdrome Amusement Co., est. 1981.' },
  ],
  files: [
    { id:'f1', title:'INCIDENT 87-3', unlock:'Reach 3AM on any night',
      text:'Three guests reported "the bear was in two places." CCTV audit: frame 2211 shows Orv on stage; frame 2212 shows Orv in dining. 0.4 seconds apart. Servos of that era could not. Verdict: camera fault. Case closed by V.K.' },
    { id:'f2', title:'WONDER-0', unlock:'Survive a night with Wonder-0 active',
      text:'No purchase record. No schematic. Found bricked into the north wall during the 1987 renovation, strings first. The renovation foreman quit the same week. The marionette control bar is load-bearing, according to no structural drawing that exists.' },
    { id:'f3', title:'THE MUSIC BOX', unlock:'Empty the music box and survive',
      text:'Melody is a 19th-century lullaby, last verse removed. When the verse ends, Wonder-0 continues it. It hums in your register. Employees report the hum continuing after they leave the building. After they leave the county.' },
    { id:'f4', title:'VERA K.', unlock:'Find all five notes',
      text:'Night manager, 1981–1987. Signed the fire report, the decommission orders, and one unsent resignation letter found taped under the office desk: "The building is not haunted. It is patient. There is a difference and it does not matter."' },
    { id:'f5', title:'THE SIXTH NIGHT', unlock:'Beat Night 5',
      text:'Payroll shows a night keeper scheduled every night since 1987. One name, crossed out, replaced by a new name, every few years. The current name is yours. It has been yours since the day you applied. You do not remember applying.' },
  ],
  endings: {
    fired: { title:'TERMINATED', text:'Power integrity failure. The building goes quiet the way a held breath ends. Something polite knocks three times, waits, and does not need a door.' },
    beaten: { title:'6 AM', text:'The bells stagger you. Somewhere far south of the building, the morning finds nothing but empty halls and a music box still turning. Your name is already on next week\'s schedule.' },
    final: { title:'THE SHOW GOES ON', text:'Six nights. The marionette bows to you from the dark like you were the attraction all along. The doors open for you now — from the inside. Wonderdrome thanks you for your service.' },
  }
};
