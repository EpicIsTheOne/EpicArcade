const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function mkRoom(code) {
  return {
    code,
    players: [null, null],
    names: ["", ""],
    ready: [false, false],
    summaries: [null, null],
    koWinner: null,
    koLoser: null,
    resultSent: false,
    rematch: [false, false],
    created: Date.now(),
    startedAt: 0,
  };
}

export default {
  maxSockets: 64,
  tickMs: 2000,
  create(opts = {}) {
    const log = opts.log || (() => {});
    const rooms = new Map();
    const quickQueue = [];
    const seatOf = new Map();

    const peer = (room, i) => room.players[1 - i];

    const sendTo = (ws, obj) => {
      try { ws.send(JSON.stringify(obj)); } catch {}
    };

    function leaveQuick(ws) {
      const qi = quickQueue.indexOf(ws);
      if (qi >= 0) quickQueue.splice(qi, 1);
    }

    function findRoomOf(ws) {
      const code = seatOf.get(ws.id);
      if (!code) return null;
      const room = rooms.get(code);
      if (!room) return null;
      const i = room.players.findIndex(p => p && p.id === ws.id);
      if (i < 0) return null;
      return { room, i };
    }

    function destroyRoom(room, notifyIdx = -1, msg = null) {
      for (let i = 0; i < 2; i++) {
        const p = room.players[i];
        if (p) {
          seatOf.delete(p.id);
          if (i !== notifyIdx && msg) sendTo(p, msg);
        }
      }
      rooms.delete(room.code);
    }

    function tryStart(room) {
      if (!(room.ready[0] && room.ready[1])) return;
      log(`[room ${room.code}] START both-ready`);
      room.startedAt = Date.now();
      room.summaries = [null, null];
      room.koWinner = null;
      room.koLoser = null;
      room.resultSent = false;
      room.rematch = [false, false];
      for (let i = 0; i < 2; i++) {
        sendTo(room.players[i], { t: "start" });
      }
    }

    function maybeResult(room) {
      if (room.resultSent) return;
      let winner = null;
      let reason = null;
      if (room.koWinner != null) {
        winner = room.koWinner;
        reason = "ko";
      } else if (room.koLoser != null) {
        winner = 1 - room.koLoser;
        reason = "ko";
      } else if (room.summaries[0] && room.summaries[1]) {
        reason = "finish";
        const a = room.summaries[0], b = room.summaries[1];
        if (Math.abs(a.acc - b.acc) < 0.05 && a.score === b.score) winner = "draw";
        else if (a.acc > b.acc + 0.05) winner = 0;
        else if (b.acc > a.acc + 0.05) winner = 1;
        else winner = a.score >= b.score ? 0 : 1;
      } else return;
      room.resultSent = true;
      log(`[room ${room.code}] RESULT winner=${winner} reason=${reason} s0=${JSON.stringify(room.summaries[0])} s1=${JSON.stringify(room.summaries[1])}`);
      for (let i = 0; i < 2; i++) {
        const p = room.players[i];
        if (!p) continue;
        const w = winner === "draw" ? "draw" : winner === i ? "you" : "opp";
        sendTo(p, {
          t: "result",
          winner: w,
          reason,
          me: room.summaries[i],
          op: room.summaries[1 - i],
        });
      }
    }

    return {
      open(ws) {
        ws._alive = true;
      },
      message(ws, raw) {
        let m;
        try { m = JSON.parse(raw); } catch { return; }
        switch (m.t) {
          case "hello": {
            ws._name = String(m.name || "PLAYER").slice(0, 12).toUpperCase();
            const wantCode = m.room ? String(m.room).toUpperCase().slice(0, 5) : null;
            if (wantCode) {
              let room = rooms.get(wantCode);
              if (!room) {
                room = mkRoom(wantCode);
                rooms.set(wantCode, room);
              }
              const slot = room.players.findIndex(p => !p);
              if (slot < 0) {
                sendTo(ws, { t: "room_full" });
                return;
              }
              room.players[slot] = ws;
              room.names[slot] = ws._name;
              seatOf.set(ws.id, room.code);
              sendTo(ws, { t: "matched", room: room.code, opp: room.names[1 - slot], seat: slot });
              const other = room.players[1 - slot];
              if (other) sendTo(other, { t: "matched", room: room.code, opp: ws._name, seat: 1 - slot });
            } else {
              leaveQuick(ws);
              quickQueue.push(ws);
              sendTo(ws, { t: "queued", pos: quickQueue.length });
              while (quickQueue.length >= 2) {
                const a = quickQueue.shift();
                const b = quickQueue.shift();
                if (!a || !b || a === b) continue;
                let code;
                do { code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(""); } while (rooms.has(code));
                const room = mkRoom(code);
                rooms.set(code, room);
                room.players = [a, b];
                room.names = [a._name || "P1", b._name || "P2"];
                seatOf.set(a.id, code);
                seatOf.set(b.id, code);
                sendTo(a, { t: "matched", room: code, opp: room.names[1], seat: 0 });
                sendTo(b, { t: "matched", room: code, opp: room.names[0], seat: 1 });
                log(`[room ${code}] PAIRED ${room.names[0]}(seat0) vs ${room.names[1]}(seat1)`);
              }
            }
            break;
          }
          case "ready": {
            const f = findRoomOf(ws);
            if (!f) return;
            log(`[room ${f.room.code}] ready seat=${f.i} v=${!!m.v}`);
            f.room.ready[f.i] = !!m.v;
            const other = peer(f.room, f.i);
            if (other) sendTo(other, { t: "opp_ready", v: !!m.v });
            tryStart(f.room);
            break;
          }
          case "state": {
            const f = findRoomOf(ws);
            if (!f || !m.u) return;
            const other = peer(f.room, f.i);
            if (other) sendTo(other, { t: "opp_state", u: m.u });
            break;
          }
          case "finish": {
            const f = findRoomOf(ws);
            if (!f || !m.s) return;
            if (f.room.startedAt && Date.now() - f.room.startedAt < 60000) {
              log(`[room ${f.room.code}] FINISH from seat ${f.i} IGNORED (t=${((Date.now() - f.room.startedAt) / 1000).toFixed(1)}s < 60s guard)`);
              return;
            }
            log(`[room ${f.room.code}] FINISH from seat ${f.i} score=${m.s.score} acc=${m.s.acc}`);
            f.room.summaries[f.i] = m.s;
            maybeResult(f.room);
            break;
          }
          case "ko": {
            const f = findRoomOf(ws);
            if (!f) return;
            if (f.room.startedAt && Date.now() - f.room.startedAt < 8000) {
              log(`[room ${f.room.code}] KO from seat ${f.i} IGNORED (t=${((Date.now() - f.room.startedAt) / 1000).toFixed(1)}s < 8s guard)`);
              return;
            }
            log(`[room ${f.room.code}] KO from seat ${f.i} won=${m.won}`);
            if (m.won) {
              if (f.room.koWinner == null && f.room.koLoser == null) f.room.koWinner = f.i;
            } else {
              if (f.room.koLoser == null && f.room.koWinner == null) f.room.koLoser = f.i;
            }
            maybeResult(f.room);
            break;
          }
          case "rematch": {
            const f = findRoomOf(ws);
            if (!f) return;
            f.room.rematch[f.i] = true;
            const other = peer(f.room, f.i);
            if (other) sendTo(other, { t: "rematch_req" });
            if (f.room.rematch[0] && f.room.rematch[1]) tryStart(f.room);
            break;
          }
          case "ping": {
            sendTo(ws, { t: "pong", ts: m.ts });
            break;
          }
        }
      },
      close(ws) {
        leaveQuick(ws);
        const f = findRoomOf(ws);
        if (!f) return;
        const { room, i } = f;
        const other = room.players[1 - i];
        seatOf.delete(ws.id);
        room.players[i] = null;
        if (other) {
          sendTo(other, { t: "opp_left" });
          seatOf.delete(other.id);
        }
        rooms.delete(room.code);
      },
      tick() {
        const now = Date.now();
        for (const [code, room] of rooms) {
          if (room.players.every(p => !p) && now - room.created > 30000) { rooms.delete(code); continue; }
          if (room.startedAt && !room.resultSent && now - room.startedAt > 240000) {
            log(`[room ${code}] TIMEOUT resolving (t=${((now - room.startedAt) / 1000).toFixed(0)}s)`);
            const forfeit = { score: -1, acc: -1, maxCombo: 0, sicks: 0, goods: 0, bads: 0, misses: 0 };
            if (!room.summaries[0]) room.summaries[0] = forfeit;
            if (!room.summaries[1]) room.summaries[1] = forfeit;
            maybeResult(room);
          }
        }
      },
      stop() {},
    };
  },
};
