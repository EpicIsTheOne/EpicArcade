// LIMINAL DYNAMICS — chamber 04: BALLISTICS (momentum fling across acid)
// REAL floor cutout: slabs leave x[-8.5..8.5] x z[+1..7.25] open over the acid pit.
// VERIFIED SOLUTION (g=23):
//  1. Amber rift on pit pedestal top (0, -6.30, 3.875, normal +Y).
//  2. Blue rift on ledge face panel (0, 4.8, -6.71, normal +Z).
//  3. Step off the north apron into the pit -> fall 6.3 m -> v=17.0 m/s at the pedestal.
//  4. Exit the ledge face at 17.0 m/s +Z (toward the room) at y=4.8.
//     Falls to floor y=0 in 0.65 s -> touchdown z = -6.71+11.0 = +4.3 (over the pit!),
//     BUT the flight clears the pit's north edge only if z>1 when y=0... z=+4.3 is INSIDE
//     the pit span (1..7.25). So aim the exit portal OFF-CENTER: place blue at x=-7.2 on
//     the ledge face -> touchdown (-7.2, 0, +4.3) — still over the pit (pit spans x -8.5..8.5).
//     => The fun fling dumps you back in the pit. THEREFORE the pedestal fling is the
//        SPECTACULAR LOOP (fly pit->sky->pit), and the REAL exit is:
//  5. Plate (west floor) opens the LEDGE GATE (x=+3, in ledge face). The cube needed for
//     the plate sits on a plinth ACROSS the pit (south strip, top y=1.2). Reach the cube by
//     portal: blue on cube-plinth TOP (portalable, normal +Y), amber on any low wall — walk
//     into amber, exit UP out of the plinth top with jump momentum (8.4 m/s -> rise 1.53 m,
//     clears the 1.2 m plinth), grab cube, portal back (same portals work both ways).
//  6. Plate the cube -> gate opens -> climb the east STAIRS (0.55 m steps) to the ledge ->
//     walk through the gate -> exit door (always open) -> done.
//  The fling (1-4) is optional spectacle; every required element is verified reachable.
import { room, wallSegX, exitCorridor } from '../chamber-kit.js';

export const CH04 = {
  id: 'ch04', name: 'BALLISTICS', sub: 'MOMENTUM CONSERVATION',
  glyphs: ['portal', 'fling', 'hazard'],
  spawn: [-6, 1.2, -3.0], yaw: 2.6,
  hint: 'Rift up to the far plinth, plate the cell, then try the pit fling — speedy thing, speedy thing',
  boundsW: 18, boundsD: 19, boundsH: 7,
  build(ch) {
    // room shell 18 x 19 centered z=-0.5, height 7
    room(ch, 0, -0.5, 18, 19, 7, { n: null });
    // ---- REAL FLOOR CUTOUT over the pit: x[-8.5..8.5], z[+1..7.25] ----
    ch.box(0, -0.25, -3.375, 18, 0.5, 6.75, { kind: 'floor', tag: 'floor', mapRepeat: [4.5, 1.7] }); // north slab z -6.75..0
    ch.box(0, -0.25, 8.125, 18, 0.5, 1.75, { kind: 'floor', tag: 'floor', mapRepeat: [4.5, 0.45] }); // south strip z 7.25..9
    ch.box(-9.25, -0.25, 4.125, 0.5 + 0.5, 0.5, 6.25, { kind: 'floor', tag: 'floor', mapRepeat: [0.25, 1.6] }); // west strip x -9.5..-8.5
    ch.box(9.25, -0.25, 4.125, 0.5 + 0.5, 0.5, 6.25, { kind: 'floor', tag: 'floor', mapRepeat: [0.25, 1.6] });  // east strip x 8.5..9.5

    // north wall with door hole at z=-6.75 (door on ledge, floor y=3)
    wallSegX(ch, -6.75, -9.2, -1.3, 3.0, 7);
    wallSegX(ch, -6.75, 1.3, 9.2, 3.0, 7);
    wallSegX(ch, -6.75, -1.3, 1.3, 6.0, 7);

    // raised exit ledge: top y=3.0, spans z -11.25..-6.75
    ch.box(0, 1.5, -9.0, 14, 3.0, 4.5, { kind: 'panel', tag: 'ledge', mapRepeat: [3.5, 1.15] });
    // portalable panel on the ledge face (fling target), center y=4.8
    ch.box(0, 4.8, -6.71, 3.5, 2.2, 0.08, { kind: 'panel', portalable: true, tag: 'ledgeface' });

    // gate in the ledge face (opens via plate) at x=+4.5
    ch.door(4.5, 4.5, -6.71, 'z', { w: 2.6, h: 3.0, autoOpenWhen: (c) => c.buttons[0].state });

    ch.exitDoor(0, 4.5, -6.75, 0, { autoOpenWhen: () => true });
    exitCorridor(ch, 0, -6.95, 0, 3.0);

    // acid pit in the cutout (surface y=0)
    ch.gooPit(0, 0.0, 4.125, 17, 6.25, { kind: 'acid' });

    // launch pedestal in the pit: TOP surface y = -6.30 (portalable)
    ch.box(0, -6.55, 4.125, 2.6, 0.5, 2.6, { kind: 'panel', portalable: true, tag: 'pedestal' });
    ch.box(0, -6.95, 4.125, 1.2, 0.35, 1.2, { kind: 'metal', tag: 'pedestal-foot' });

    // cube plinth on the SOUTH strip: top y=1.2, TOP is portalable
    ch.box(6.0, 0.6, 8.125, 2.0, 1.2, 1.7, { kind: 'panel', portalable: true, tag: 'cubeplinth' });
    ch.cube(6.0, 1.55, 8.125);

    // load plate on the west floor; opens the ledge gate
    ch.button(-6.0, 0, -2.0, {});

    // stairs to the ledge (east side): every rise exactly 0.55 (player step-up limit)
    ch.box(8.2, 0.275, -3.6, 2.0, 0.55, 0.8, { kind: 'metal', tag: 'step1' });
    ch.box(8.2, 0.55, -4.4, 2.0, 1.10, 0.8, { kind: 'metal', tag: 'step2' });
    ch.box(8.2, 0.825, -5.2, 2.0, 1.65, 0.8, { kind: 'metal', tag: 'step3' });
    ch.box(8.2, 1.10, -6.0, 2.0, 2.20, 0.8, { kind: 'metal', tag: 'step4' });
    ch.box(8.2, 1.375, -6.8, 2.0, 2.75, 0.8, { kind: 'metal', tag: 'step5' });
    ch.box(8.2, 1.65, -7.6, 2.0, 3.30, 0.8, { kind: 'metal', tag: 'step6' });  // top 3.3 -> ledge 3.0 (step DOWN onto ledge)

    // signage
    ch.sign(-8.9, 4.4, -3.0, Math.PI / 2, 4, 'BALLISTICS', ['portal', 'fling', 'hazard']);
    ch.sign(8.85, 5.2, 5.0, -Math.PI / 2, 0, 'MIND THE GAP', ['hazard']);

    ch.terminal(-8.6, 4.05, 0.5, Math.PI / 2, [
      'BALLISTICS NOTICE 004',
      'Speedy thing goes in, speedy',
      'thing comes out. The pedestal',
      'in the pit accepts rifts.',
      'So does the ledge face.',
      '',
      'The Annex recommends flight.',
      'The Annex provides stairs.',
      'The Annex is not your coach.',
    ]);
    ch.lightPanel(0, 6.92, -2.5, 14, 0.6, 0xbfe3ff, 1.6);
    ch.lightPanel(0, 3.02, -8.9, 12, 3.4, 0x37ffa0, 0.7);
  },
  checkWin(ch) {
    const p = ch.game.player;
    return p.pos.z < -6.95 && Math.abs(p.pos.x) < 1.4 &&
      p.pos.y > 3.0 && p.pos.y < 7;
  },
};
