// LIMINAL DYNAMICS — chamber 01: FIRST LIGHT
// Lesson: place a PAIR, walk in, arrive redirected. Verified:
//  - Panel A: south wall inner face (0, 1.7, +5.94), normal -Z (faces room)
//  - Panel B: north wall segment beside the door, LOW: (-4, 3.35, -5.94), normal +Z
//  Walking into A at ~6 m/s exits B at ~6 m/s +Z, 0.7 m above ledge top (2.6),
//  drifts ~1.4 m south -> lands z ~= -4.5, ON the ledge (spans z -6..-4). Walk to door.
import { room, wallSegX, exitCorridor } from '../chamber-kit.js';

export const CH01 = {
  id: 'ch01', name: 'FIRST LIGHT', sub: 'PAIR PLACEMENT',
  glyphs: ['portal'],
  spawn: [-4, 1.2, 3.6], yaw: 0,
  hint: 'LEFT CLICK / RIGHT CLICK place linked rifts on white panels — walk in, arrive elsewhere',
  boundsW: 16, boundsD: 12, boundsH: 5,
  build(ch) {
    room(ch, 0, 0, 16, 12, 5, { n: null });
    // north wall: door hole (|x|<1.3, y 2.6..5) sits ON the exit ledge (top 2.6)
    wallSegX(ch, -6, -8.2, -1.3, 2.6, 5);
    wallSegX(ch, -6, 1.3, 8.2, 2.6, 5);
    // exit ledge along the north edge: top y = 2.6
    ch.box(0, 1.3, -5.0, 16, 2.6, 2.0, { kind: 'panel', tag: 'ledge', mapRepeat: [4, 0.6] });

    ch.exitDoor(0, 3.8, -6, 0, { h: 2.4, autoOpenWhen: () => true });
    exitCorridor(ch, 0, -6.2, 0, 2.6);

    // tutorial panels (explicitly white + framed by light strips)
    const panelA = ch.box(0, 1.7, 5.94, 2.6, 3.2, 0.08, { kind: 'panel', portalable: true, tag: 'tutA' });
    ch.lightPanel(-1.6, 3.35, 5.86, 0.14, 3.3, 0xbfe3ff, 1.2);
    ch.lightPanel(1.6, 3.35, 5.86, 0.14, 3.3, 0xbfe3ff, 1.2);

    const panelB = ch.box(-4, 3.35, -5.94, 2.6, 2.0, 0.08, { kind: 'panel', portalable: true, tag: 'tutB' });
    ch.box(4, 3.8, -5.94, 2.6, 2.4, 0.08, { kind: 'concrete', tag: 'decoB' }); // non-portalable decoy contrast

    ch.sign(7.9, 3.2, 2.5, -Math.PI / 2, 1, 'FIRST LIGHT', ['portal']);
    ch.terminal(-7.6, 1.1, 2.2, Math.PI / 2, [
      'ANNEX ORIENTATION LOG 001',
      'Rift pairs are not doors. Doors',
      'politely wait. Rifts disagree',
      'with the wall they are on.',
      '',
      'Placement: white panels only.',
      'One rift low, one rift high,',
      'then take a leap of logic.',
      '',
      'The previous candidate left in',
      'a hurry. And at speed. And',
      'partly through a wall panel.',
    ]);
    ch.lightPanel(0, 4.92, 0, 12, 0.6, 0xbfe3ff, 1.5);
  },
  checkWin(ch) {
    const p = ch.game.player;
    return p.pos.z < -6.4 && Math.abs(p.pos.x) < 1.2 && p.pos.y > 2.0 && p.pos.y < 5;
  },
};
