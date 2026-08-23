// LIMINAL DYNAMICS — chamber 05: THE GAUNTLET (final multi-step assessment)
// REAL floor cutout: slabs leave x[-8..2] x z[-1..7] open over the acid pit.
// VERIFIED SOLUTION:
//  1. Cube on the shelf (top 4.5). Shelfwall above the shelf is portalable:
//     blue on shelfwall, amber low on any wall -> walk in, exit onto the shelf. Grab cube.
//  2. Jump down to floor with the cube (no fall damage), or portal back.
//  3. Plate at (5.5, 0, 1.0) opens the GATE in the ledge face (x=+3).
//  4. East stairs (0.55 m steps + landing top 4.5) -> through the gate along the ledge
//     -> exit door -> WIN. Fling (pedestal -6.30 + ledgeface panel) = optional spectacle.
import { room, wallSegX, exitCorridor } from '../chamber-kit.js';

export const CH05 = {
  id: 'ch05', name: 'THE GAUNTLET', sub: 'FINAL ASSESSMENT',
  glyphs: ['portal', 'cube', 'button', 'fling', 'clock'],
  spawn: [6, 1.2, 5.0], yaw: -2.4,
  hint: 'Rift up to the shelf, plate the cell, open the gate — the ledge is the way out',
  boundsW: 20, boundsD: 20, boundsH: 9,
  build(ch) {
    // room shell 20 x 20 centered z=0, height 9
    room(ch, 0, 0, 20, 20, 9, { n: null });
    // ---- REAL FLOOR CUTOUT over the pit: x[-8..2], z[-1..7] ----
    ch.box(0, -0.25, -5.5, 20, 0.5, 9, { kind: 'floor', tag: 'floor', mapRepeat: [5, 2.25] }); // north slab z -10..-1
    ch.box(0, -0.25, 8.5, 20, 0.5, 3, { kind: 'floor', tag: 'floor', mapRepeat: [5, 0.75] });  // south strip z 7..10
    ch.box(-9, -0.25, 3, 2, 0.5, 8, { kind: 'floor', tag: 'floor', mapRepeat: [0.5, 2] });     // west strip x -10..-8
    ch.box(6, -0.25, 3, 8, 0.5, 8, { kind: 'floor', tag: 'floor', mapRepeat: [2, 2] });        // east strip x 2..10

    // north wall with door hole at z=-10 (door on exit ledge, floor y=4.5)
    wallSegX(ch, -10, -10.2, -1.3, 4.5, 9);
    wallSegX(ch, -10, 1.3, 10.2, 4.5, 9);
    wallSegX(ch, -10, -1.3, 1.3, 7.5, 9);

    // exit ledge along north: top y=4.5, spans z -10.9..-9.9 (door sill at z=-10,
    // ledge stays SOUTH of the wall so the corridor beyond stays clear)
    ch.box(0, 2.25, -10.4, 16, 4.5, 1.0, { kind: 'panel', tag: 'ledge', mapRepeat: [4, 0.3] });
    // gate in the ledge face at x=+3 (opens via plate)
    ch.door(3, 4.5, -9.95, 'z', { w: 2.6, h: 3.0, autoOpenWhen: (c) => c.buttons[0].state });
    // portalable panel on the ledge face west of the gate (fling target)
    ch.box(-4.25, 5.6, -9.97, 3.5, 2.2, 0.08, { kind: 'panel', portalable: true, tag: 'ledgeface' });
    // hazard stripes under the gate
    ch.box(3, 0.03, -9.6, 3.0, 0.02, 0.8, { kind: 'hazard', shadow: false, tag: 'deco' });

    ch.exitDoor(0, 6.0, -10, 0, { autoOpenWhen: () => true });
    exitCorridor(ch, 0, -10.2, 0, 4.5);

    // acid pit in the cutout (surface y=0)
    ch.gooPit(-3, 0.0, 3, 10, 8, { kind: 'acid' });

    // launch pedestal in the pit: TOP surface y=-6.30 (portalable)
    ch.box(-3, -6.55, 2.0, 2.6, 0.5, 2.6, { kind: 'panel', portalable: true, tag: 'pedestal' });
    ch.box(-3, -6.95, 2.0, 1.2, 0.35, 1.2, { kind: 'metal', tag: 'pedestal-foot' });

    // cube shelf (west, over solid floor): top y=4.5, TOP accepts portals (pop-up route)
    ch.box(-7.5, 4.25, 4.5, 5, 0.5, 5, { kind: 'floor', portalable: true, tag: 'shelf', mapRepeat: [1.2, 1.2] });
    ch.box(-7.5, 6.75, 4.5, 5, 4.5, 0.5, { kind: 'panel', portalable: true, tag: 'shelfwall' });
    ch.box(-7.5, 4.85, 6.95, 5, 0.7, 0.35, { kind: 'metal', tag: 'lip' });
    ch.cube(-7.5, 5.05, 4.5);

    // STAIRS to the ledge (east): every rise exactly 0.55 (step-up limit), landing 4.4
    ch.box(8.6, 0.275, -4.8, 2.4, 0.55, 0.8, { kind: 'metal', tag: 'gstep1' });
    ch.box(8.6, 0.55, -5.6, 2.4, 1.10, 0.8, { kind: 'metal', tag: 'gstep2' });
    ch.box(8.6, 0.825, -6.4, 2.4, 1.65, 0.8, { kind: 'metal', tag: 'gstep3' });
    ch.box(8.6, 1.10, -7.2, 2.4, 2.20, 0.8, { kind: 'metal', tag: 'gstep4' });
    ch.box(8.6, 1.375, -8.0, 2.4, 2.75, 0.8, { kind: 'metal', tag: 'gstep5' });
    ch.box(8.6, 1.65, -8.8, 2.4, 3.30, 0.8, { kind: 'metal', tag: 'gstep6' });
    ch.box(8.6, 1.925, -9.6, 2.4, 3.85, 0.8, { kind: 'metal', tag: 'gstep7' });
    ch.box(8.6, 2.20, -10.4, 2.4, 4.40, 0.8, { kind: 'metal', tag: 'glandng' }); // top 4.4 -> ledge 4.5

    // load plate on main floor east; opens the gate
    ch.button(5.5, 0, 1.0, {});

    // signage + terminal
    ch.sign(-9.9, 5.2, -3, Math.PI / 2, 5, 'THE GAUNTLET', ['portal', 'cube', 'button', 'fling']);
    ch.sign(9.9, 6.4, -5, -Math.PI / 2, 0, 'EXIT ABOVE', ['fling']);
    ch.terminal(9.6, 1.1, 2.0, -Math.PI / 2, [
      'ASSESSMENT PROTOCOL 005',
      'Sequence: rift up to the shelf,',
      'retrieve the cell, plate it.',
      'The gate opens. The ledge waits.',
      '',
      'The pit pedestal accepts rifts.',
      'So does the ledge face.',
      'Combine them at your own risk.',
      '',
      'Candidates reaching the exit',
      'are released. Probably.',
    ]);
    ch.lightPanel(0, 8.92, -4, 16, 0.6, 0xbfe3ff, 1.6);
    ch.lightPanel(-7.5, 6.55, 4.5, 3.4, 3.4, 0xbfe3ff, 1.0);
  },
  checkWin(ch) {
    const p = ch.game.player;
    return p.pos.z < -10.15 && Math.abs(p.pos.x) < 1.2 && p.pos.y > 4.8 && p.pos.y < 10;
  },
};
