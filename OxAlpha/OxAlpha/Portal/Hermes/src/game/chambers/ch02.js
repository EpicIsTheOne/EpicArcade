// LIMINAL DYNAMICS — chamber 02: CARRY (mass cell + load plate tutorial)
import { room, wallSegX, exitCorridor } from '../chamber-kit.js';

export const CH02 = {
  id: 'ch02', name: 'CARRY', sub: 'MASS CELL HANDLING',
  glyphs: ['cube', 'button', 'portal'],
  spawn: [0, 1.2, 4.6], yaw: 0,
  hint: 'E picks up a MASS CELL · carry it to the load plate · plates open doors',
  build(ch) {
    room(ch, 0, 0, 16, 14, 5, { n: null });
    // north wall with door hole
    wallSegX(ch, -7, -8.2, -1.3, 0, 5);
    wallSegX(ch, -7, 1.3, 8.2, 0, 5);
    wallSegX(ch, -7, -1.3, 1.3, 3, 5);
    ch.exitDoor(0, 1.5, -7, 0, { autoOpenWhen: (c) => c.buttons[0].state });
    exitCorridor(ch, 0, -7.2, 0, 0);

    // mass cell out in the open (grabbing is the lesson)
    ch.cube(4.0, 0.5, 2.5);
    // low display plinth under it
    ch.box(4.0, 0.125, 2.5, 1.2, 0.25, 1.2, { kind: 'metal', tag: 'plinth' });

    // load plate near the door
    ch.button(-3.0, 0, -4.6, {});

    ch.sign(7.9, 3.2, 2, -Math.PI / 2, 2, 'CARRY', ['cube', 'button', 'portal']);
    ch.terminal(-7.6, 1.1, 3.0, Math.PI / 2, [
      'MASS CELL BULLETIN 002',
      'Cells are heavier than your',
      'ambition and lighter than the',
      'exit criteria. Pick one up.',
      'Carry it to the load plate.',
      '',
      'Reminder: cells dropped into',
      'the Resonance Sieve are not',
      'lost. They are relocated to',
      'their first position, mildly',
      'inconvenienced.',
    ]);
    ch.lightPanel(0, 4.92, -2, 10, 0.6, 0xbfe3ff, 1.5);
  },
  checkWin(ch) {
    const p = ch.game.player;
    return p.pos.z < -7.4 && Math.abs(p.pos.x) < 1.2 && p.pos.y > 0.2 && p.pos.y < 3.4;
  },
};
