// LIMINAL DYNAMICS — chamber registry & progression
import { CH01 } from './chambers/ch01.js';
import { CH02 } from './chambers/ch02.js';
import { CH03 } from './chambers/ch03.js';
import { CH04 } from './chambers/ch04.js';
import { CH05 } from './chambers/ch05.js';

export const CHAMBERS = [CH01, CH02, CH03, CH04, CH05];

export const PROGRESSION = {
  // story beats keyed by chamber id — delivered as facility broadcasts
  ch00: [
    ['V.EGA', 'Oh. You are awake ahead of schedule. The Orientation Atrium was not, but we adapt.'],
    ['V.EGA', 'I am V.E.G.A — Vestibular Environment Governance Array. I keep the Annex honest. Mostly rectangular.'],
  ],
  ch01: [
    ['V.EGA', 'Rift pairs: one blue, one amber. What enters one... arrives at the other. Do wave to yourself.'],
    ['V.EGA', 'You may notice the previous candidate left in a hurry. And at speed. And through a wall panel.'],
  ],
  ch02: [
    ['V.EGA', 'Mass Cells: pick up with E, set down gently or not gently, the Sieve has no preference.'],
    ['V.EGA', 'The load plate only counts things that stay on it. Commitment matters here.'],
  ],
  ch03: [
    ['V.EGA', 'Altitude is just momentum that has not been spent yet. Spend it wisely.'],
    ['V.EGA', 'The ceiling patch accepts rifts. The rest of the ceiling accepts lawsuits. Aim carefully.'],
  ],
  ch04: [
    ['V.EGA', 'Ballistics! My favorite unit. Speedy thing goes in, speedy thing comes out.'],
    ['V.EGA', 'Fall into the pit pedestal, exit the wall panel sideways. Try not to sample the acid. It samples back.'],
  ],
  ch05: [
    ['V.EGA', 'Final assessment. Everything you know, plus everything you were afraid of.'],
    ['V.EGA', 'Complete this and your file closes with the word "released". I lobbied for it personally.'],
  ],
  finale: [
    ['V.EGA', 'Assessment complete. Gate releasing. Statistically speaking, you are our best candidate since the last one.'],
    ['V.EGA', 'Do come again. The Annex grows bored without observers. And slightly hungry. That was a joke. Probably.'],
  ],
};
