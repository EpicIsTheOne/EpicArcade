// Lumencraft multiplayer backend for ox-live (see ox-live/README.md).
// Rooms are ephemeral: seed + block-edit log + live peer states, all in memory.
// ESM + stdlib only, per the platform contract.

const MAX_EDITS = 50000;
const NAME_RE = /[^\x20-\x7e]/g;

function cleanName(raw, fallback) {
  const n = String(raw ?? '').replace(NAME_RE, ' ').trim().slice(0, 16);
  return n || fallback;
}

function cleanRoom(raw) {
  let r = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
  if (!r) r = randomCode();
  return r;
}

function cleanSeed(raw) {
  return String(raw ?? '').replace(/[^\x20-\x7e]/g, '').trim().slice(0, 48);
}

function randomCode() {
  const A = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < 5; i++) s += A[(Math.random() * A.length) | 0];
  return s;
}

function validBlockOp(m) {
  return Number.isInteger(m.x) && Number.isInteger(m.y) && Number.isInteger(m.z) &&
    m.y >= 0 && m.y < 128 && Math.abs(m.x) <= 1e6 && Math.abs(m.z) <= 1e6 &&
    Number.isInteger(m.b) && m.b >= 0 && m.b < 256 &&
    Number.isInteger(m.f | 0);
}

export default {
  maxSockets: 64,
  tickMs: 100,
  create(ctx) {
    const rooms = new Map();     // code -> room
    const peerRoom = new Map();  // ws.id -> code

    function getRoom(code, seedReq) {
      let room = rooms.get(code);
      if (!room) {
        room = {
          code,
          seed: seedReq || ('mp-' + code.toLowerCase()),
          t0: Date.now(),
          edits: new Map(),      // "x,y,z" -> [bid, face]
          peers: new Map(),      // ws.id -> {name, s:[x,y,z,yaw,pitch]}
        };
        rooms.set(code, room);
        ctx.log(`room ${code} created (seed "${room.seed}")`);
      }
      return room;
    }

    function broadcast(room, exceptId, obj) {
      for (const [id, p] of room.peers) {
        if (id === exceptId) continue;
        try { p.ws.send(obj); } catch {}
      }
    }

    function playerList(room, exceptId) {
      const out = [];
      for (const [id, p] of room.peers) {
        if (id === exceptId) continue;
        out.push([id, p.name, ...p.s]);
      }
      return out;
    }

    return {
      open(ws) {
        // join is required as the first message; nothing to do yet
      },

      message(ws, msg) {
        if (!msg || typeof msg !== 'object') return;
        const code = peerRoom.get(ws.id);

        if (msg.op === 'join' && !code) {
          const room = getRoom(cleanRoom(msg.room), cleanSeed(msg.seed));
          if (room.peers.size >= 15) {
            ws.send({ op: 'denied', reason: 'room full' });
            return;
          }
          const name = cleanName(msg.name, 'Player' + ws.id);
          const peer = { name, s: [0.5, -100, 0.5, 0, 0], ws, blockT: [], chatT: [] };
          room.peers.set(ws.id, peer);
          peerRoom.set(ws.id, room.code);

          const edits = [];
          for (const [k, v] of room.edits) {
            const [x, y, z] = k.split(',').map(Number);
            edits.push([x, y, z, v[0], v[1]]);
            if (edits.length >= MAX_EDITS) break;
          }
          ws.send({
            op: 'welcome', you: ws.id, room: room.code, seed: room.seed,
            t0: room.t0, now: Date.now(), players: playerList(room, ws.id), edits,
          });
          broadcast(room, ws.id, { op: 'joined', id: ws.id, name, s: peer.s });
          ctx.log(`room ${room.code}: ${name} joined (${room.peers.size} online)`);
          return;
        }

        if (!code) return;
        const room = rooms.get(code);
        const peer = room && room.peers.get(ws.id);
        if (!peer) return;

        if (msg.op === 'state' && Array.isArray(msg.s)) {
          const s = msg.s;
          if (s.length >= 5 &&
              Number.isFinite(s[0]) && Number.isFinite(s[1]) && Number.isFinite(s[2]) &&
              Number.isFinite(s[3]) && Number.isFinite(s[4])) {
            peer.s = [+s[0].toFixed(2), +Math.max(-40, Math.min(300, s[1])).toFixed(2),
                      +s[2].toFixed(2), +s[3].toFixed(3), +s[4].toFixed(3)];
          }
          return;
        }

        if (msg.op === 'block') {
          const now = Date.now();
          peer.blockT = peer.blockT.filter((t) => now - t < 1000);
          peer.blockT.push(now);
          if (peer.blockT.length > 40) return; // rate limit: 40 edits/sec
          if (!validBlockOp(msg)) return;
          room.edits.set(msg.x + ',' + msg.y + ',' + msg.z, [msg.b, msg.f | 0]);
          if (room.edits.size > MAX_EDITS) {
            // drop oldest third (insertion order proxy for oldest)
            let drop = Math.floor(MAX_EDITS / 3);
            for (const k of room.edits.keys()) { room.edits.delete(k); if (--drop <= 0) break; }
          }
          broadcast(room, ws.id, { op: 'block', x: msg.x, y: msg.y, z: msg.z, b: msg.b, f: msg.f | 0 });
          return;
        }

        if (msg.op === 'chat') {
          const now = Date.now();
          peer.chatT = peer.chatT.filter((t) => now - t < 1000);
          peer.chatT.push(now);
          if (peer.chatT.length > 5) return;
          const text = String(msg.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
          if (!text) return;
          broadcast(room, -1, { op: 'chat', id: ws.id, name: peer.name, text });
          return;
        }
      },

      close(ws) {
        const code = peerRoom.get(ws.id);
        if (!code) return;
        peerRoom.delete(ws.id);
        const room = rooms.get(code);
        if (!room) return;
        const peer = room.peers.get(ws.id);
        room.peers.delete(ws.id);
        broadcast(room, ws.id, { op: 'left', id: ws.id });
        if (peer) ctx.log(`room ${code}: ${peer.name} left (${room.peers.size} online)`);
        if (room.peers.size === 0) {
          rooms.delete(code);
          ctx.log(`room ${code} empty — reclaimed`);
        }
      },

      tick() {
        for (const room of rooms.values()) {
          if (room.peers.size < 2) continue;
          const ps = [];
          for (const [id, p] of room.peers) ps.push([id, ...p.s]);
          broadcast(room, -1, { op: 'states', ps });
        }
      },

      stop() {
        rooms.clear();
        peerRoom.clear();
      },
    };
  },
};
