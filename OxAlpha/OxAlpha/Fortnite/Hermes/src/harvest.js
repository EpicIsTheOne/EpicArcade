// ISLEBREAK harvesting: damage colliders, grant materials, destruction.
// Works on world props (ref.hp), trees/rocks (ref.hp + onDestroyed), builds.
export class HarvestSystem {
  constructor(game) { this.game = game; }

  damageCollider(box, dmg, source, point) {
    const g = this.game;
    const ref = box.ref;
    if (!ref || !ref.hp) return;
    ref.hp -= dmg;
    if (point) g.fx.impact(point, ref.harvest || 'world');
    // grant materials to the harvester
    if (source && ref.harvest && ref.kind !== 'build') {
      const gain = Math.max(2, Math.round(dmg / 5));
      if (source.isPlayer) {
        g.inv.addMat(ref.harvest, gain);
      } else if (source.mats) {
        source.mats[ref.harvest] = Math.min(999, (source.mats[ref.harvest] || 0) + gain);
      }
    }
    if (ref.hp <= 0) this.destroyCollider(box, source);
  }

  destroyCollider(box, source) {
    const g = this.game;
    const ref = box.ref;
    // remove from physics
    const i = g.physics.static.indexOf(box);
    if (i >= 0) g.physics.static.splice(i, 1);
    // visual destruction
    if (ref.onDestroyed) ref.onDestroyed();
    const center = [
      (box.min[0] + box.max[0]) / 2,
      (box.min[1] + box.max[1]) / 2,
      (box.min[2] + box.max[2]) / 2,
    ];
    g.fx.impact({ x: center[0], y: center[1], z: center[2] }, ref.harvest || 'world');
    // final bounty
    if (source && ref.harvest && ref.kind !== 'build') {
      const bonus = ref.kind === 'tree' ? 20 : 12;
      if (source.isPlayer) g.inv.addMat(ref.harvest, bonus);
      else if (source.mats) source.mats[ref.harvest] = Math.min(999, (source.mats[ref.harvest] || 0) + bonus);
    }
  }
}
