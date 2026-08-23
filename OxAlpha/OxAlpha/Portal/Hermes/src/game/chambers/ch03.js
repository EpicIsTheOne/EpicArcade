// LIMINAL DYNAMICS — chamber 03: VERTICAL THINKING (high shelf, portal up)
// Verified: ceilpad (portalable) sits directly above the shelf; low amber rift on the
// west wall drops you from the ceiling patch onto the shelf (fall 4.0 m, no damage system).
import { room, wallSegX, exitCorridor } from '../chamber-kit.js';

export const CH03 = {
  id: 'ch03', name: 'VERTICAL THINKING', sub: 'ELEVATION VIA RIFT',
  glyphs: ['portal', 'drop'],
  spawn: [2, 1.2, 5.4], yaw: 0.35,
  hint: 'One rift on the ceiling patch above the shelf, one low — fall out of the sky',
  boundsW: 16, boundsD: 14, boundsH: 9,
  build(ch) {
    room(ch, 0, 0, 16, 14, 9, { n: null });
    // tall north wall with door hole
    wallSegX(ch, -7, -8.2, -1.3, 0, 9);
    wallSegX(ch, -7, 1.3, 8.2, 0, 9);
    wallSegX(ch, -7, -1.3, 1.3, 3, 9);
    ch.exitDoor(0, 1.5, -7, 0, {});
    exitCorridor(ch, 0, -7.2, 0, 0);

    // high shelf across the west side (top y=4.5), button wired to exit
    ch.box(-4.5, 4.25, -2.5, 7, 0.5, 5, { kind: 'floor', portalable: false, tag: 'shelf', mapRepeat: [1.6, 1.2] });
    ch.box(-7.85, 2.0, -2.5, 0.5, 4, 5, { kind: 'metal', tag: 'strut' });
    ch.button(-4.5, 4.5, -2.5, { latch: true });
    ch.doors[0].autoOpenWhen = (c) => c.buttons[0].state;

    // PORTALABLE CEILING PATCH directly above the shelf
    ch.box(-4.5, 8.75, -2.5, 6, 0.5, 5, { kind: 'metal', portalable: true, tag: 'ceilpad' });

    // glass observation strip (east, high)
    ch.box(8.05, 6.0, 1, 0.3, 1.6, 5, { kind: 'glass', shadow: false });
    ch.barrier(8.05, 6.0, 1, 0.4, 1.8, 5.2, 'obs-glass');
    ch.sign(-7.9, 3.4, 2.5, Math.PI / 2, 3, 'VERTICAL THINKING', ['portal', 'drop']);
    ch.terminal(-7.6, 1.1, 4.0, Math.PI / 2, [
      'ELEVATION MEMO 003',
      'The floor is a suggestion.',
      'A rift on the ceiling patch',
      'above the shelf turns',
      'altitude into arrival.',
      '',
      'Standard descent profile:',
      'rift below, rift above,',
      'commit, scream internally,',
      'land on the shelf.',
      '',
      'Altitude is temporary.',
      'Regret is permanent.',
    ]);
    ch.lightPanel(-4.5, 6.6, -2.5, 5, 3.4, 0xbfe3ff, 1.2);
  },
  checkWin(ch) {
    const p = ch.game.player;
    return p.pos.z < -7.4 && Math.abs(p.pos.x) < 1.2 && p.pos.y > 0.2 && p.pos.y < 3.4;
  },
};
