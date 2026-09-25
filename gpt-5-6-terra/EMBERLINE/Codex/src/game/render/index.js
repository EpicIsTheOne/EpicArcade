import { GAME } from "../level.js";
import { drawDamageNumbers, drawEnemy, drawParticles, drawPlayer, drawProjectile } from "./entity-art.js";
import { drawHud } from "./hud.js";
import { drawFarParallax, drawForeground, drawSky, drawWorldGeometry, drawZoneTitle } from "./world-art.js";

export function createRenderer(canvas) {
  const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
  if (!context) throw new Error("Canvas 2D is unavailable");
  context.imageSmoothingEnabled = true;
  return {
    canvas,
    context,
    render(world) {
      const offset = world.camera.offset();
      const zoom = world.camera.zoomValue();
      const originX = GAME.width / 2 - (world.camera.x + offset.x) * zoom;
      const originY = GAME.height * 0.5 - (world.camera.y + offset.y) * zoom;
      context.save();
      context.fillStyle = "#080a20";
      context.fillRect(0, 0, GAME.width, GAME.height);
      context.translate(originX, originY);
      context.scale(zoom, zoom);
      drawSky(context, world, world.camera);
      drawFarParallax(context, world, world.camera);
      drawWorldGeometry(context, world);
      for (const projectile of world.projectiles) drawProjectile(context, projectile, world.time);
      for (const enemy of world.enemies) {
        if (enemy.centerX > world.camera.x - 140 && enemy.centerX < world.camera.x + GAME.width + 140) drawEnemy(context, enemy, world.time);
      }
      drawPlayer(context, world.player, world.time);
      drawParticles(context, world.particles);
      drawDamageNumbers(context, world.particles);
      drawForeground(context, world);
      context.restore();
      drawZoneTitle(context, world);
      drawHud(context, world);
      if (world.player.hurtFlash > 0.08) {
        context.fillStyle = `rgba(255,60,90,${Math.min(0.2, world.player.hurtFlash)})`;
        context.fillRect(0, 0, GAME.width, GAME.height);
      }
      if (world.player.spawnFlash > 0.35) {
        context.fillStyle = `rgba(255,231,163,${(world.player.spawnFlash - 0.35) * 0.15})`;
        context.fillRect(0, 0, GAME.width, GAME.height);
      }
    }
  };
}
