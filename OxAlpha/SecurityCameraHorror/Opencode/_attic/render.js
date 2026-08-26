'use strict';
/* GRAYLINE — Night Shift :: frame renderer */
window.G = window.G || {};

(() => {
  const A = () => G.Art;
  let tGlobal = 0;

  /* ---------------- office ---------------- */

  function drawOffice(ctx, W, H, S) {
    const t = tGlobal / 1000;
    // back wall
    ctx.fillStyle = '#10141b';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = A().grad(ctx, 0, 0, 0, H,
      [[0, '#161c26'], [0.55, '#121722'], [1, '#0a0d14']]);
    ctx.fillRect(0, 0, W, H);

    const flick = S.flicker > 0 ? (Math.sin(t * 60) > 0 ? 0.35 : 1) : 1;

    // ceiling
    ctx.fillStyle = '#070a0f';
    ctx.fillRect(0, 0, W, H * 0.14);
    // ceiling lamp
    const lampOn = S.power > 0;
    ctx.save();
    if (lampOn) {
      ctx.fillStyle = `rgba(210,225,245,${0.85 * flick})`;
      ctx.fillRect(W / 2 - 90, H * 0.045, 180, 8);
      ctx.fillStyle = A().rgrad(ctx, W / 2, H * 0.05, 10, W * 0.45,
        [[0, `rgba(190,205,230,${0.10 * flick})`], [1, 'rgba(0,0,0,0)']]);
      ctx.beginPath(); ctx.arc(W / 2, H * 0.05, W * 0.45, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(120,30,30,0.55)';
      ctx.fillRect(W / 2 - 90, H * 0.045, 180, 8);
    }
    ctx.restore();

    // back wall props
    drawBackWallProps(ctx, W, H);

    // doorways
    drawDoorway(ctx, W, H, S, 'L');
    drawDoorway(ctx, W, H, S, 'R');

    // floor
    ctx.fillStyle = '#0b0e13';
    ctx.fillRect(0, H * 0.80, W, H * 0.20);
    ctx.fillStyle = 'rgba(160,180,210,0.04)';
    ctx.fillRect(0, H * 0.80, W, 3);

    // desk
    drawDesk(ctx, W, H, S);
  }

  function drawBackWallProps(ctx, W, H) {
    // poster
    ctx.save();
    ctx.translate(W * 0.44, H * 0.24);
    ctx.rotate(-0.02);
    ctx.fillStyle = '#1c2330';
    ctx.fillRect(-70, -50, 140, 190);
    ctx.strokeStyle = 'rgba(200,215,235,0.15)';
    ctx.strokeRect(-64, -44, 128, 178);
    ctx.fillStyle = 'rgba(220,170,90,0.5)';
    ctx.font = 'bold 26px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('GRAYLINE', 0, -8);
    ctx.fillStyle = 'rgba(200,210,225,0.35)';
    ctx.font = '13px "Courier New", monospace';
    ctx.fillText('MIND THE GAP', 0, 22);
    ctx.fillStyle = 'rgba(200,210,225,0.22)';
    ctx.font = '11px "Courier New", monospace';
    ctx.fillText('night shift rules apply', 0, 48);
    ctx.fillText('report anomalies', 0, 68);
    ctx.restore();
    // torn corner
    ctx.fillStyle = '#10141b';
    ctx.beginPath();
    ctx.moveTo(W * 0.44 + 70, H * 0.24 - 50);
    ctx.lineTo(W * 0.44 + 40, H * 0.24 - 34);
    ctx.lineTo(W * 0.44 + 70, H * 0.24 - 18);
    ctx.closePath(); ctx.fill();
    // vent grille
    ctx.fillStyle = '#0a0d13';
    ctx.fillRect(W * 0.62, H * 0.20, 110, 74);
    ctx.strokeStyle = 'rgba(150,165,185,0.18)';
    ctx.lineWidth = 2;
    for (let i = 1; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(W * 0.62 + 6, H * 0.20 + i * 11);
      ctx.lineTo(W * 0.62 + 104, H * 0.20 + i * 11);
      ctx.stroke();
    }
  }

  function drawDoorway(ctx, W, H, S, side) {
    const x0 = side === 'L' ? W * 0.036 : W * 0.800;
    const ww = W * 0.164, y0 = H * 0.17, hh = H * 0.63;
    const lit = S.lights[side] && S.power > 0;
    const anim = S.doorAnim[side];

    // hallway beyond
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, ww, hh); ctx.clip();
    if (lit) {
      const g = A().grad(ctx, x0, y0, x0 + ww, y0 + hh,
        [[0, '#3d3629'], [0.5, '#574a33'], [1, '#241f16']]);
      ctx.fillStyle = g;
      ctx.fillRect(x0, y0, ww, hh);
      // hall perspective lines
      ctx.strokeStyle = 'rgba(0,0,0,0.30)';
      ctx.lineWidth = 2;
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(x0, y0 + hh * i / 4);
        ctx.lineTo(x0 + ww, y0 + hh * i / 4 - hh * 0.06);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#04060a';
      ctx.fillRect(x0, y0, ww, hh);
    }

    // threat at this door?
    const th = side === 'L' ? S.conductor : S.wick;
    if (th && th.atDoor === side && S.phase === 'playing') {
      const cx = x0 + ww * 0.5;
      if (lit) {
        if (th.kind === 'conductor') {
          A().drawConductor(ctx, cx, y0 + hh * 0.99, hh * 0.92, { lantern: false });
        } else {
          A().drawWick(ctx, cx, y0 + hh * 0.97, hh * 0.66, {});
        }
      } else {
        // just eye glints in the dark
        const gh = G.hash(Math.floor(tGlobal / 400));
        if (gh > 0.35) {
          const ey = y0 + hh * (th.kind === 'conductor' ? 0.30 : 0.52);
          ctx.fillStyle = `rgba(220,228,245,${0.25 + gh * 0.4})`;
          ctx.shadowColor = 'rgba(210,220,255,0.8)';
          ctx.shadowBlur = 6;
          ctx.beginPath(); ctx.arc(cx - 9, ey, 2.2, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(cx + 9, ey, 2.2, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
    }
    ctx.restore();

    // frame
    ctx.strokeStyle = '#232b37'; ctx.lineWidth = 10;
    ctx.strokeRect(x0 - 5, y0 - 5, ww + 10, hh + 10);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2;
    ctx.strokeRect(x0 - 10, y0 - 10, ww + 20, hh + 20);
    // warning stripe above
    ctx.save();
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#151a22' : '#8a7634';
      ctx.beginPath();
      ctx.moveTo(x0 + i * ww / 8, y0 - 14);
      ctx.lineTo(x0 + (i + 1) * ww / 8, y0 - 14);
      ctx.lineTo(x0 + (i + 1) * ww / 8 - 6, y0 - 4);
      ctx.lineTo(x0 + i * ww / 8 - 6, y0 - 4);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    // steel door sliding down
    if (anim > 0.01) {
      const dh = hh * anim;
      ctx.save();
      ctx.beginPath(); ctx.rect(x0 - 2, y0 - 2, ww + 4, hh + 4); ctx.clip();
      const g = A().grad(ctx, x0, 0, x0 + ww, 0,
        [[0, '#2e3742'], [0.5, '#46525f'], [1, '#28303a']]);
      ctx.fillStyle = g;
      ctx.fillRect(x0, y0, ww, dh);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 3;
      for (let ry = y0 + 26; ry < y0 + dh - 8; ry += 34) {
        ctx.beginPath(); ctx.moveTo(x0 + 6, ry); ctx.lineTo(x0 + ww - 6, ry); ctx.stroke();
      }
      // hazard stripe bottom edge
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = i % 2 ? '#0c0e12' : '#b3922e';
        ctx.fillRect(x0 + i * (ww / 10), y0 + dh - 8, ww / 10, 8);
      }
      ctx.restore();
    }
  }

  function drawDesk(ctx, W, H, S) {
    const dy = H * 0.78;
    // desk slab
    ctx.fillStyle = A().grad(ctx, 0, dy, 0, H, [[0, '#1d242e'], [1, '#0d1118']]);
    ctx.beginPath();
    ctx.moveTo(-20, H); ctx.lineTo(0, dy + 14); ctx.lineTo(W, dy + 14); ctx.lineTo(W + 20, H);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(190,205,225,0.06)';
    ctx.fillRect(0, dy + 12, W, 3);

    // papers
    ctx.save();
    ctx.translate(W * 0.60, dy + 40);
    ctx.rotate(0.08);
    ctx.fillStyle = 'rgba(205,212,222,0.75)';
    ctx.fillRect(0, 0, 120, 84);
    ctx.fillStyle = 'rgba(60,70,85,0.8)';
    for (let i = 0; i < 7; i++) ctx.fillRect(8, 10 + i * 10, 104 - (i % 3) * 22, 3);
    ctx.restore();
    ctx.save();
    ctx.translate(W * 0.685, dy + 58);
    ctx.rotate(-0.12);
    ctx.fillStyle = 'rgba(195,202,214,0.6)';
    ctx.fillRect(0, 0, 110, 76);
    ctx.restore();

    // coffee cup
    ctx.fillStyle = '#3a3f49';
    ctx.fillRect(W * 0.315, dy - 4, 34, 44);
    ctx.fillStyle = '#14161c';
    ctx.beginPath(); ctx.ellipse(W * 0.315 + 17, dy - 4, 17, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(120,90,60,0.7)';
    ctx.beginPath(); ctx.ellipse(W * 0.315 + 17, dy - 4, 12, 3.4, 0, 0, Math.PI * 2); ctx.fill();

    // fan (left)
    const fx = W * 0.115, fy = dy + 6;
    ctx.strokeStyle = '#39424e'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy + 52); ctx.stroke();
    ctx.fillStyle = '#2a323c';
    ctx.beginPath(); ctx.arc(fx, fy - 34, 40, 0, Math.PI * 2); ctx.fill();
    // blades
    const ba = tGlobal / 90;
    ctx.save();
    ctx.translate(fx, fy - 34);
    ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = 'rgba(150,165,185,0.16)';
    for (let i = 0; i < 3; i++) {
      ctx.save(); ctx.rotate(ba + i * Math.PI * 2 / 3);
      ctx.beginPath(); ctx.ellipse(0, -17, 10, 17, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(160,175,195,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(fx, fy - 34, 40, 0, Math.PI * 2); ctx.stroke();

    // desk CRT with static
    const cx0 = W * 0.79, cy0 = dy - 66, cw = 168, chh = 108;
    ctx.fillStyle = '#181d26';
    ctx.fillRect(cx0 - 8, cy0 - 8, cw + 16, chh + 16);
    ctx.fillStyle = '#05070a';
    ctx.fillRect(cx0, cy0, cw, chh);
    A().drawNoise(ctx, cw, chh, tGlobal / 1000, 0.16);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = 'rgba(120,220,170,0.10)';
    ctx.fillRect(cx0, cy0, cw, chh);
    ctx.restore();
    ctx.strokeStyle = '#2c3540'; ctx.lineWidth = 3;
    ctx.strokeRect(cx0, cy0, cw, chh);
    // little stand
    ctx.fillStyle = '#181d26';
    ctx.fillRect(cx0 + cw / 2 - 16, cy0 + chh + 8, 32, 12);

    // keyboard hint strip
    ctx.fillStyle = 'rgba(140,155,175,0.10)';
    ctx.fillRect(W * 0.38, dy + 66, 240, 14);
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = 'rgba(140,155,175,0.14)';
      ctx.fillRect(W * 0.385 + i * 23, dy + 68, 19, 10);
    }
  }

  /* ---------------- camera feed ---------------- */

  function drawFeed(ctx, W, H, S, camOverride) {
    const cam = camOverride || S.monitor.cam;
    const t = tGlobal / 1000;
    const bd = A().backdrop(cam);
    const k = 1.14;
    const phase = G.hash(cam.length * 7.3) * 6;
    const panX = Math.sin(t * 0.22 + phase) * W * 0.045;
    const panY = Math.cos(t * 0.13 + phase) * H * 0.02;
    const dw = W * k, dh = H * k;
    const bx = -(dw - W) / 2 + panX, by = -(dh - H) / 2 + panY;

    ctx.fillStyle = '#010203';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(bd, bx, by, dw, dh);

    // dynamic layer in backdrop space
    ctx.save();
    ctx.translate(bx, by);
    const sc = dw / A().BW;
    ctx.scale(sc, sc);
    roomDynamic(cam, ctx, t, S);
    drawRoomThreat(ctx, cam, S);
    maybeGirlTease(ctx, cam, S, t);
    ctx.restore();

    // corruption
    const corrupt = S.cams[cam] && S.cams[cam].corrupt;
    if (corrupt) {
      ctx.fillStyle = 'rgba(2,3,6,0.45)';
      ctx.fillRect(0, 0, W, H);
      A().tearBands(ctx, W, H, tGlobal / 1000, 1.0);
      // her silhouette
      const pulse = 0.8 + G.hash(Math.floor(t * 7)) * 0.5;
      A().drawGirl(ctx, W / 2, H * 0.46, 1.5 * pulse, Math.floor(t * 3));
      A().drawNoise(ctx, W, H, tGlobal / 1000, 0.42);
      // stamp
      ctx.save();
      ctx.globalAlpha = G.hash(Math.floor(t * 11)) > 0.2 ? 0.85 : 0.3;
      ctx.fillStyle = '#ff5a5a';
      ctx.font = 'bold 54px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.translate(W / 2, H * 0.72);
      ctx.rotate(-0.03);
      ctx.fillText('SIGNAL LOST', 0, 0);
      ctx.font = '20px "Courier New", monospace';
      ctx.fillText(CAM_LABEL_SHORT[cam] || '', 0, 34);
      ctx.restore();
    }

    A().drawNoise(ctx, W, H, t, 0.05 + S.interference * 0.30 + (corrupt ? 0 : 0));
    A().rollingBand(ctx, W, H, tGlobal / 1000);
    A().vignette(ctx, W, H, 0.9);
    A().drawScanlines(ctx, W, H);

    // feed HUD
    drawFeedHUD(ctx, W, H, S, cam, corrupt);
  }

  const CAM_LABEL_SHORT = {
    platA: 'CAM 1', concourse: 'CAM 2', platB: 'CAM 3',
    tunnelN: 'CAM 4', corridor: 'CAM 5', storage: 'CAM 6', tunnelS: 'CAM 7'
  };

  function drawFeedHUD(ctx, W, H, S, cam, corrupt) {
    const t = tGlobal / 1000;
    ctx.save();
    ctx.font = 'bold 22px "Courier New", monospace';
    ctx.textAlign = 'left';
    // label plate
    ctx.fillStyle = 'rgba(3,6,8,0.72)';
    ctx.fillRect(18, 16, 330, 34);
    ctx.strokeStyle = 'rgba(140,255,180,0.25)'; ctx.lineWidth = 1;
    ctx.strokeRect(18, 16, 330, 34);
    ctx.fillStyle = corrupt ? '#ff7a7a' : '#9fe8b4';
    ctx.fillText(G.Game.CAM_LABEL[cam], 30, 40);
    // REC
    if (!corrupt && Math.floor(t * 1.4) % 2 === 0) {
      ctx.fillStyle = '#ff4d4d';
      ctx.beginPath(); ctx.arc(W - 118, 32, 8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(220,235,225,0.8)';
    ctx.font = 'bold 20px "Courier New", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(corrupt ? '--:--:--' : G.fmtTime(S.hourF), W - 24, 40);
    ctx.fillText('OCT 26', W - 24, 66);
    ctx.font = '15px "Courier New", monospace';
    ctx.fillStyle = 'rgba(160,220,180,0.5)';
    ctx.textAlign = 'left';
    ctx.fillText('NIGHT SHIFT · GRAYLINE DEPOT SIGNAL BOX', 20, H - 18);
    ctx.textAlign = 'right';
    ctx.fillText('[1-7] cams  [R] reboot  [SPACE] close', W - 20, H - 18);

    // system failure banner
    if (S.sysFail >= 0) {
      const blink = Math.floor(t * 4) % 2 === 0;
      ctx.fillStyle = blink ? 'rgba(120,10,10,0.85)' : 'rgba(60,6,6,0.85)';
      ctx.fillRect(W / 2 - 330, 74, 660, 46);
      ctx.fillStyle = blink ? '#ffdcdc' : '#ff9c9c';
      ctx.font = 'bold 26px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`SYSTEM FAILURE IN ${Math.ceil(S.sysFail)}s — REBOOT NOW`, W / 2, 105);
    }

    // reboot overlay
    if (S.rebootT > 0) {
      ctx.fillStyle = 'rgba(1,3,4,0.88)';
      ctx.fillRect(0, 0, W, H);
      const p = 1 - S.rebootT / 1400;
      ctx.fillStyle = '#9fe8b4';
      ctx.font = 'bold 30px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('REBOOTING SYSTEM', W / 2, H / 2 - 20);
      ctx.strokeStyle = 'rgba(159,232,180,0.6)';
      ctx.strokeRect(W / 2 - 180, H / 2 + 10, 360, 22);
      ctx.fillRect(W / 2 - 176, H / 2 + 14, 352 * p, 14);
      A().drawNoise(ctx, W, H, tGlobal / 1000, 0.2);
    }
    ctx.restore();
  }

  function roomDynamic(cam, ctx, t, S) {
    const BW = A().BW, BH = A().BH;
    if (cam === 'platA') {
      // stuttering tube
      const st = G.hash(Math.floor(t * 9));
      if (st > 0.82) {
        ctx.fillStyle = 'rgba(2,4,6,0.55)';
        ctx.fillRect(BW * 0.44, 0, BW * 0.13, BH * 0.30);
      }
      const blink = Math.floor(t * 0.5) % 4 === 0 && G.hash(Math.floor(t * 4)) > 0.4;
      if (blink) {
        ctx.fillStyle = 'rgba(255,70,70,0.5)';
        ctx.beginPath(); ctx.arc(BW * 0.87, BH * 0.365, 10, 0, Math.PI * 2); ctx.fill();
      }
    } else if (cam === 'platB') {
      const st = G.hash(Math.floor(t * 7) + 3);
      if (st > 0.9) {
        ctx.fillStyle = 'rgba(2,3,5,0.5)';
        ctx.fillRect(BW * 0.18, 0, BW * 0.12, BH * 0.28);
      }
      ctx.fillStyle = `rgba(140,230,190,${0.14 + G.hash(Math.floor(t * 3)) * 0.08})`;
      ctx.fillRect(BW * 0.065, BH * 0.365, BW * 0.05, BH * 0.10);
    } else if (cam === 'concourse') {
      // board shimmer
      ctx.fillStyle = `rgba(255,176,64,${0.10 + G.hash(Math.floor(t * 6)) * 0.25})`;
      ctx.fillRect(BW * 0.635, BH * 0.075, BW * 0.28, 3);
      if (G.hash(Math.floor(t * 1.3)) > 0.86) {
        ctx.fillStyle = 'rgba(2,3,5,0.6)';
        ctx.fillRect(BW * 0.25, 0, BW * 0.1, BH * 0.12);
      }
    } else if (cam === 'tunnelN' || cam === 'tunnelS') {
      // receding marquee pulse
      const idx = Math.floor(t * 2.2) % 6;
      const tt = idx / 6;
      const vx = BW * (cam === 'tunnelN' ? 0.42 : 0.60);
      const lx = G.lerp(BW * (cam === 'tunnelN' ? 0.16 : 0.84), vx, Math.pow(tt, 0.8));
      const ly = G.lerp(BH * 0.30, BH * 0.45, Math.pow(tt, 0.8));
      ctx.fillStyle = 'rgba(255,235,190,0.35)';
      ctx.beginPath(); ctx.arc(lx, ly, 9, 0, Math.PI * 2); ctx.fill();
    } else if (cam === 'corridor') {
      // swinging bulb cone
      const ang = Math.sin(t * 0.9) * 0.12;
      ctx.save();
      ctx.translate(BW * 0.5, BH * 0.125);
      ctx.rotate(ang);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,208,140,0.05)';
      ctx.beginPath();
      ctx.moveTo(-10, 0); ctx.lineTo(10, 0);
      ctx.lineTo(150, 420); ctx.lineTo(-150, 420);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      // drip sparkle
      if (G.hash(Math.floor(t * 2.7)) > 0.7) {
        ctx.fillStyle = 'rgba(190,215,240,0.35)';
        ctx.beginPath(); ctx.arc(BW * (0.2 + G.hash(Math.floor(t)) * 0.6), BH * 0.83, 2, 0, Math.PI * 2); ctx.fill();
      }
    } else if (cam === 'storage') {
      const ang = Math.sin(t * 0.7) * 0.05;
      ctx.save();
      ctx.translate(BW * 0.36, BH * 0.152);
      ctx.rotate(ang);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,216,156,0.045)';
      ctx.beginPath();
      ctx.moveTo(-12, 0); ctx.lineTo(12, 0);
      ctx.lineTo(190, 500); ctx.lineTo(-190, 500);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  function drawRoomThreat(ctx, cam, S) {
    const BW = A().BW, BH = A().BH;
    const spots = { platA: [[0.30, 0.605, 150], [0.62, 0.585, 128], [0.84, 0.63, 168]],
      platB: [[0.28, 0.615, 160], [0.55, 0.59, 130], [0.80, 0.62, 155]],
      concourse: [[0.24, 0.66, 170], [0.50, 0.615, 138], [0.76, 0.685, 182]],
      tunnelN: [[0.40, 0.52, 96], [0.46, 0.60, 150]],
      tunnelS: [[0.58, 0.53, 98], [0.52, 0.61, 154]],
      corridor: [[0.47, 0.60, 134], [0.54, 0.64, 160]],
      storage: [[0.40, 0.70, 174], [0.56, 0.665, 152], [0.34, 0.735, 198]] };
    for (const th of [S.conductor, S.wick]) {
      if (!th || th.atDoor || th.loc !== cam || S.cams[cam].corrupt) continue;
      const sp = spots[cam][th.spot % spots[cam].length];
      const x = sp[0] * BW, fy = sp[1] * BH, hg = sp[2];
      const flip = th.kind === 'wick' ? false : x > BW / 2;
      if (th.kind === 'conductor') A().drawConductor(ctx, x, fy, hg, { flip });
      else A().drawWick(ctx, x, fy, hg * 0.9, { flip });
    }
  }

  function maybeGirlTease(ctx, cam, S, t) {
    if (S.sysFail >= 0 || corruptedN(S) < 3) return;
    const seed = Math.floor(t * 0.5) * 3.1 + cam.length;
    if (G.hash(seed) > 0.14) return;
    const BW = A().BW, BH = A().BH;
    ctx.save();
    ctx.globalAlpha = 0.30;
    A().drawGirl(ctx, BW * 0.5, BH * 0.47, 0.8, Math.floor(t * 2));
    ctx.restore();
  }

  function corruptedN(S) {
    return Object.values(S.cams).filter(c => c.corrupt).length;
  }

  /* ---------------- jumpscare ---------------- */

  function drawJumpscare(ctx, W, H, S) {
    const j = S.jumpscare;
    const t = j.t;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    if (t < 130) {
      ctx.fillStyle = 'rgba(235,240,255,0.92)';
      ctx.fillRect(0, 0, W, H);
      A().drawNoise(ctx, W, H, tGlobal / 1000, 0.8);
      return;
    }
    const p = G.clamp((t - 130) / 1150, 0, 1);
    const amp = G.lerp(26, 6, p);
    ctx.save();
    ctx.translate((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp);
    if (j.who === 'conductor') A().faceConductor(ctx, W, H, p, j.side);
    else if (j.who === 'wick') A().faceWick(ctx, W, H, p, j.side);
    else {
      // girl: static storm then face
      A().drawNoise(ctx, W, H, tGlobal / 1000, 0.55 + p * 0.3);
      A().faceGirl(ctx, W, H, p, j.side);
    }
    ctx.restore();
    A().tearBands(ctx, W, H, tGlobal / 1000, 1);
    if (j.who !== 'girl') A().drawNoise(ctx, W, H, tGlobal / 1000, 0.22);
    if (t > 1450) {
      ctx.fillStyle = `rgba(0,0,0,${G.clamp((t - 1450) / 350, 0, 1)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  /* ---------------- powerless office ---------------- */

  function drawPowerless(ctx, W, H, S) {
    ctx.fillStyle = '#020305';
    ctx.fillRect(0, 0, W, H);
    // barely-visible room
    ctx.save();
    ctx.globalAlpha = 0.35;
    drawOfficeDim(ctx, W, H);
    ctx.restore();
    // emergency strips
    const pulse = 0.5 + Math.sin(tGlobal / 700) * 0.2;
    for (const x0 of [W * 0.036, W * 0.800]) {
      ctx.fillStyle = `rgba(255,60,50,${0.20 * pulse})`;
      ctx.fillRect(x0, H * 0.148, W * 0.164, 5);
    }
    // doom timer tension: eyes approach west doorway as time runs out
    const prog = 1 - S.powerlessDoom / 23000;
    const gh = G.hash(Math.floor(tGlobal / 260));
    if (gh > 0.3 - prog * 0.25) {
      const cx = W * 0.036 + W * 0.164 * 0.5;
      const ey = H * 0.17 + H * 0.63 * (0.34 - prog * 0.10);
      ctx.fillStyle = `rgba(225,232,250,${0.35 + gh * 0.45})`;
      ctx.shadowColor = 'rgba(210,220,255,0.9)';
      ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(cx - 10, ey, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 10, ey, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
    // heartbeat vignette
    const hb = Math.max(0, Math.sin(tGlobal / 480));
    A().vignette(ctx, W, H, 0.95 + hb * 0.05);
    A().drawNoise(ctx, W, H, tGlobal / 1000, 0.05);
  }

  function drawOfficeDim(ctx, W, H) {
    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#03040a';
    ctx.fillRect(W * 0.036, H * 0.17, W * 0.164, H * 0.63);
    ctx.fillRect(W * 0.800, H * 0.17, W * 0.164, H * 0.63);
    ctx.strokeStyle = '#0e131c';
    ctx.lineWidth = 10;
    ctx.strokeRect(W * 0.036 - 5, H * 0.17 - 5, W * 0.164 + 10, H * 0.63 + 10);
    ctx.strokeRect(W * 0.800 - 5, H * 0.17 - 5, W * 0.164 + 10, H * 0.63 + 10);
    ctx.fillStyle = '#070a10';
    ctx.fillRect(0, H * 0.78, W, H * 0.22);
  }

  /* ---------------- win scene ---------------- */

  function drawWinScene(ctx, W, H, S) {
    const t = tGlobal / 1000;
    // dawn sky through shutter
    const sky = A().grad(ctx, 0, 0, 0, H,
      [[0, '#1a1440'], [0.35, '#5a2a55'], [0.6, '#c96a3a'], [0.78, '#f2b25c'], [1, '#f7d9a0']]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    // sun
    ctx.fillStyle = 'rgba(255,236,190,0.95)';
    ctx.beginPath(); ctx.arc(W * 0.5, H * 0.66, H * 0.13 + Math.sin(t) * 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = A().rgrad(ctx, W * 0.5, H * 0.66, H * 0.1, H * 0.5,
      [[0, 'rgba(255,220,150,0.5)'], [1, 'rgba(0,0,0,0)']]);
    ctx.beginPath(); ctx.arc(W * 0.5, H * 0.66, H * 0.5, 0, Math.PI * 2); ctx.fill();
    // shutter slats silhouettes
    ctx.fillStyle = '#0a0c12';
    for (let i = 0; i < 9; i++) {
      ctx.fillRect(0, i * H * 0.075, W, H * 0.032);
    }
    // depot interior silhouette sides
    ctx.fillStyle = '#05060a';
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(W * 0.16, 0); ctx.lineTo(W * 0.10, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(W, 0); ctx.lineTo(W * 0.84, 0); ctx.lineTo(W * 0.90, H); ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    // floor
    ctx.fillStyle = '#08090e';
    ctx.fillRect(0, H * 0.86, W, H * 0.14);
    ctx.fillStyle = 'rgba(255,210,140,0.10)';
    ctx.beginPath(); ctx.ellipse(W / 2, H * 0.87, W * 0.3, H * 0.03, 0, 0, Math.PI * 2); ctx.fill();
    // dust motes
    for (let i = 0; i < 26; i++) {
      const mx = (G.hash(i * 3.7) * W + t * (8 + G.hash(i) * 14)) % W;
      const my = (G.hash(i * 9.1) * H + t * 5 * (0.4 + G.hash(i * 2))) % H;
      ctx.fillStyle = `rgba(255,230,180,${0.10 + G.hash(i * 5) * 0.15})`;
      ctx.beginPath(); ctx.arc(mx, my, 1.2 + G.hash(i * 7) * 1.8, 0, Math.PI * 2); ctx.fill();
    }
    // rails catching light
    ctx.strokeStyle = 'rgba(255,220,160,0.35)';
    ctx.lineWidth = 3;
    for (const off of [-60, 60]) {
      ctx.beginPath();
      ctx.moveTo(W / 2 + off * 0.3, H * 0.87);
      ctx.lineTo(W / 2 + off * 2.2, H);
      ctx.stroke();
    }
    A().vignette(ctx, W, H, 0.5);
  }

  /* ---------------- title attract ---------------- */

  function drawTitleAttract(ctx, W, H, S) {
    const cycle = ['corridor', 'tunnelS', 'storage', 'concourse'];
    const idx = Math.floor(tGlobal / 3600) % cycle.length;
    drawFeed(ctx, W, H, S, cycle[idx]);
    ctx.fillStyle = 'rgba(2,4,6,0.55)';
    ctx.fillRect(0, 0, W, H);
  }

  /* ---------------- master draw ---------------- */

  function draw(ctx, W, H) {
    const S = G.Game.state;
    if (S.phase === 'title') {
      drawTitleAttract(ctx, W, H, S);
      return;
    }
    if (S.phase === 'jumpscare') {
      drawJumpscare(ctx, W, H, S);
      return;
    }
    if (S.phase === 'win') {
      drawWinScene(ctx, W, H, S);
      return;
    }
    if (S.phase === 'powerless') {
      drawPowerless(ctx, W, H, S);
      return;
    }
    // playing / gameover backdrop
    if (S.phase === 'gameover') {
      ctx.fillStyle = '#020306';
      ctx.fillRect(0, 0, W, H);
      A().drawNoise(ctx, W, H, tGlobal / 1000, 0.05);
      return;
    }
    drawOffice(ctx, W, H, S);
    // monitor rising over office
    if (S.monitor.anim > 0.01) {
      ctx.save();
      const rise = (1 - S.monitor.anim) * H;
      ctx.translate(0, rise);
      drawFeed(ctx, W, H, S);
      ctx.restore();
      // bezel edge
      ctx.fillStyle = 'rgba(140,160,190,0.25)';
      ctx.fillRect(0, rise, W, 3);
    }
    // office-level FX
    A().drawNoise(ctx, W, H, tGlobal / 1000, 0.035 + S.interference * 0.12);
    A().vignette(ctx, W, H, 0.75);
  }

  function tick(dtMs) { tGlobal += dtMs; }

  G.Render = { draw, tick };
})();
