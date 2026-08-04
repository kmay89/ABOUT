// The room mailbox — one way into every game on this site.
//
// This is the only server-side code here, and it is deliberately tiny: an
// ephemeral pigeonhole where a host leaves a WebRTC offer under a four-letter
// code and a joiner picks it up and leaves an answer back. Nothing about any
// game passes through it — no board, no bones, no scores, no accounts. Once
// two devices have shaken hands they talk peer-to-peer and this forgets them.
//
// Why it exists: a WebRTC handshake is ~600 characters (DTLS fingerprint + ICE
// credentials) and cannot be shortened into something a person types, and a
// browser has no way to discover games on the local network. A rendezvous
// point is the only way to get "type BUZZ and you're in". It is lifted almost
// unchanged from HIVEMIND's hive mailbox, generalised in three ways:
//
//   · **games are namespaced** (`g=chess`, `g=domino`) — each game gets its own
//     store, so codes never collide and a listing only shows boards you can
//     actually sit down at;
//   · **a host holds a key** — a room minted with `a=host` hands back a secret,
//     and a host that presents it can reclaim the *same* four letters after a
//     dropped link, a locked phone or a reload. That is what makes healing
//     invisible: nobody re-reads a new code aloud;
//   · **CORS is open** — the games are mirrored onto GitHub Pages, which has no
//     serverless anything, and a static mirror should still be able to knock.
//
// Every game must keep working with this unreachable. The client latches the
// mailbox off on anything that isn't a JSON reply and falls back to the
// paste/QR handshake, which is what happens on file:// and offline.
//
// Nothing is ever written that a player did not put on their own screen (a
// display name and a table name), and everything expires after ROOM_TTL.
import { getStore } from '@netlify/blobs';

const ROOM_TTL = 15 * 60 * 1000;   // a room nobody touches fades in a quarter hour
const MAX_ROOMS = 60;              // ceiling on a listing sweep, not on the world
const MAX_SLOTS = 12;              // seats + churn
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // no I/O — they read as 1/0 out loud
const SDP_MAX = 8000;
// The namespaces that exist. A game not on this list is answered "unknown
// game" rather than given a pigeonhole, so a typo cannot quietly mint codes
// in a namespace nobody is listening to. tools/room-parity.js checks that
// every game folder in the repo appears here.
const GAMES = [
  'chess', 'domino', 'table', 'test',
  'checkers', 'othello', 'halma', 'hearts', 'euchre', 'stratego',
  'yahtzee', 'viuda',
  // not a game: aethrakairos's stage wire — a music visualizer's booth
  // inviting iPads and laptops to be extra screens. Same door, same four
  // letters, nothing but a handshake through the pigeonhole. Lives at
  // aethrakairos.com (GitHub Pages, no serverless), so it knocks here.
  'stage',
];

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
};
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS },
});
const clean = (s, n) => String(s == null ? '' : s).replace(/[<>&"']/g, '').trim().slice(0, n);
const isCode = c => /^[A-Z]{4}$/.test(c || '');
const isKey = k => /^[a-z0-9]{8,40}$/.test(k || '');
const isSdp = s => typeof s === 'string' && s.length > 40 && s.length < SDP_MAX && s.indexOf('v=0') === 0;
const mintKey = () => Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
// the room as everyone but its host sees it — the key never leaves this file
const publicRoom = (code, r, now) => ({
  code, name: r.name, host: r.host, seats: r.seats,
  players: r.players, started: !!r.started,
  age: Math.round((now - r.born) / 1000),
});

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const url = new URL(req.url);
  const a = url.searchParams.get('a') || '';
  const game = clean(url.searchParams.get('g'), 12).toLowerCase();
  const now = Date.now();

  if (a === 'ping') return json({ ok: true, t: now });
  if (!GAMES.includes(game)) return json({ error: 'unknown game' }, 400);

  let store;
  try { store = getStore({ name: 'room-' + game, consistency: 'strong' }); }
  catch (e) { return json({ error: 'mailbox unavailable' }, 503); }

  const readRoom = async (code) => {
    if (!isCode(code)) return null;
    const r = await store.get(code, { type: 'json' }).catch(() => null);
    if (!r || now - r.t > ROOM_TTL) return null;
    return r;
  };
  const writeRoom = async (code, room) => {
    room.t = now;
    await store.setJSON(code, room);
  };
  const body = async () => {
    try { return await req.json(); } catch (e) { return {}; }
  };

  // ---- list: the rooms waiting for someone, freshest first ----
  if (a === 'list') {
    const { blobs } = await store.list().catch(() => ({ blobs: [] }));
    const out = [];
    for (const b of blobs.slice(0, MAX_ROOMS)) {
      const r = await store.get(b.key, { type: 'json' }).catch(() => null);
      if (!r) continue;
      if (now - r.t > ROOM_TTL) { store.delete(b.key).catch(() => {}); continue; }
      if (r.started && !r.open) continue;          // under way and not taking latecomers
      if (!r.slots.some(s => !s.claimed)) continue; // full — nowhere to put a newcomer
      out.push(publicRoom(b.key, r, now));
    }
    out.sort((x, y) => x.age - y.age);
    return json({ rooms: out.slice(0, 12) });
  }

  // ---- host: claim a code and leave the first offer ----
  // With a matching code+key this *reclaims* the same four letters instead of
  // minting new ones. That is the whole trick behind a link that heals itself:
  // the host's phone comes back from a tunnel, re-hosts under the code that is
  // already written on everyone's screen, and nobody has to be told anything.
  if (a === 'host') {
    const b = await body();
    if (!isSdp(b.offer)) return json({ error: 'bad offer' }, 400);
    const host = clean(b.host, 16) || 'A player';
    const name = clean(b.name, 28) || 'A room';
    const seats = Math.max(2, Math.min(8, parseInt(b.seats, 10) || 2));
    const open = b.open === undefined ? true : !!b.open;

    let code = null, key = null, room = null;
    if (isCode(b.code) && isKey(b.key)) {
      const had = await readRoom(b.code);
      if (had && had.key === b.key) { code = b.code; key = b.key; room = had; }
    }
    if (!code) {
      key = mintKey();
      for (let i = 0; i < 8 && !code; i++) {
        let c = ''; for (let k = 0; k < 4; k++) c += ALPHA[Math.floor(Math.random() * ALPHA.length)];
        const taken = await store.get(c, { type: 'json' }).catch(() => null);
        if (!taken || now - taken.t > ROOM_TTL) code = c;
      }
      if (!code) return json({ error: 'the rooms are crowded — try again' }, 503);
    }
    const born = room ? room.born : now;
    const seq = (room ? room.seq || 0 : 0) + 1;
    // a reclaimed room keeps its name and its history, and throws away the
    // pigeonholes from the life before — those offers point at a dead peer
    await writeRoom(code, {
      born, host, name, seats, open, key, seq,
      players: room ? room.players : 1,
      started: room ? !!room.started : false,
      slots: [{ id: seq, offer: b.offer, claimed: false, answer: null }],
    });
    // the slot id matters to the host: a reclaimed room does not start at 1,
    // and an answer has to be matched back to the pigeonhole that earned it
    return json({ code, key, slot: seq, reclaimed: !!room });
  }

  // ---- offer: the host keeps a free pigeonhole waiting at all times ----
  if (a === 'offer') {
    const b = await body();
    const room = await readRoom(b.code);
    if (!room) return json({ error: 'that room has gone' }, 404);
    if (room.key !== b.key) return json({ error: 'not your room' }, 403);
    if (!isSdp(b.offer)) return json({ error: 'bad offer' }, 400);
    room.slots = room.slots.filter(s => !s.taken).slice(-MAX_SLOTS);
    room.seq = (room.seq || 0) + 1;
    room.slots.push({ id: room.seq, offer: b.offer, claimed: false, answer: null });
    await writeRoom(b.code, room);
    return json({ slot: room.seq });
  }

  // ---- join: take the waiting offer, hold the pigeonhole ----
  if (a === 'join') {
    const b = await body();
    const code = String(b.code || '').toUpperCase();
    const room = await readRoom(code);
    if (!room) return json({ error: 'No room by that name — check the code with your host.' }, 404);
    // a room that has started is hidden from the list but still joinable by
    // code: latecomers are welcome, and so is anyone whose link just healed
    const slot = room.slots.find(s => !s.claimed);
    if (!slot) return json({ error: 'That room is full up.' }, 409);
    slot.claimed = true; slot.who = clean(b.name, 16) || 'A player';
    await writeRoom(code, room);
    return json({ slot: slot.id, offer: slot.offer, name: room.name, host: room.host,
      seats: room.seats, started: !!room.started });
  }

  // ---- answer: the joiner leaves their half of the handshake ----
  if (a === 'answer') {
    const b = await body();
    const code = String(b.code || '').toUpperCase();
    const room = await readRoom(code);
    if (!room) return json({ error: 'that room has gone' }, 404);
    if (!isSdp(b.answer)) return json({ error: 'bad answer' }, 400);
    const slot = room.slots.find(s => s.id === b.slot);
    if (!slot) return json({ error: 'that pigeonhole is gone' }, 404);
    slot.answer = b.answer;
    await writeRoom(code, room);
    return json({ ok: true });
  }

  // ---- poll: the host collects answers left since last time ----
  // Polling also keeps the room alive. A host sitting on an open code is the
  // proof that the room still exists; without this a long, quiet game would
  // let its own code expire out from under a player trying to come back.
  if (a === 'poll') {
    const code = String(url.searchParams.get('code') || '').toUpperCase();
    const key = url.searchParams.get('key') || '';
    const room = await readRoom(code);
    if (!room) return json({ error: 'that room has gone' }, 404);
    if (room.key !== key) return json({ error: 'not your room' }, 403);
    const fresh = room.slots.filter(s => s.answer && !s.taken);
    if (fresh.length) {
      for (const s of fresh) s.taken = true;
      room.players = Math.min(room.seats || 8, (room.players || 1) + fresh.length);
    }
    // touch the room when it is drifting towards the TTL, not on every poll
    if (fresh.length || now - room.t > ROOM_TTL / 3) await writeRoom(code, room);
    return json({
      answers: fresh.map(s => ({ slot: s.id, answer: s.answer, who: s.who || 'A player' })),
      players: room.players, free: room.slots.filter(s => !s.claimed).length,
    });
  }

  // ---- peek: is this code still a live room? (used by "rejoin" on boot) ----
  if (a === 'peek') {
    const room = await readRoom(String(url.searchParams.get('code') || '').toUpperCase());
    if (!room) return json({ live: false });
    return json({ live: true, room: publicRoom(String(url.searchParams.get('code')).toUpperCase(), room, now) });
  }

  // ---- close: the game started, or the host went home ----
  if (a === 'close') {
    const b = await body();
    const code = String(b.code || '').toUpperCase();
    if (!isCode(code)) return json({ error: 'bad code' }, 400);
    const room = await readRoom(code);
    if (!room) return json({ ok: true });
    if (room.key !== b.key) return json({ error: 'not your room' }, 403);
    if (b.started) {
      // a started room is kept, not deleted: it is the address a healing
      // player comes back to. It simply stops advertising itself.
      room.started = true;
      room.open = b.open === undefined ? true : !!b.open;
      await writeRoom(code, room);
    } else {
      await store.delete(code).catch(() => {});
    }
    return json({ ok: true });
  }

  return json({ error: 'unknown request' }, 400);
};

export const config = { path: '/api/room' };
