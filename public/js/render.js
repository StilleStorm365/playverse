// Canvas drawing. Everything is procedural; no image assets.
import { HALF, starTaken } from './engine.js';

const C = {
  floor: '#2a3047', floor2: '#2e3550', wall: '#0d0f16', wallEdge: '#454d6e',
  spike: '#ff5a6a', star: '#ffcc4d', goal: '#36d6b4', portal: '#7c5cff', community: '#ffb547', player: '#f4f1ff', eye: '#12141c',
};

export function fit(canvas, level, box) {
  const w = level.tiles[0].length, h = level.tiles.length;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const size = Math.max(8, Math.floor(Math.min(box.width / w, box.height / h)));
  canvas.style.width = `${size * w}px`;
  canvas.style.height = `${size * h}px`;
  canvas.width = Math.round(size * w * dpr);
  canvas.height = Math.round(size * h * dpr);
  return size * dpr;
}

function starPath(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
}

export function draw(ctx, g, s, t, extra = {}) {
  const { tiles } = g.level;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  for (let y = 0; y < tiles.length; y++) {
    for (let x = 0; x < tiles[0].length; x++) {
      const c = tiles[y][x], px = x * s, py = y * s;
      if (c === '#') {
        ctx.fillStyle = C.wall; ctx.fillRect(px, py, s, s);
        ctx.fillStyle = C.wallEdge;
        if (y + 1 < tiles.length && tiles[y + 1][x] !== '#') ctx.fillRect(px, py + s - s * 0.12, s, s * 0.12);
        continue;
      }
      ctx.fillStyle = (x + y) % 2 ? C.floor : C.floor2; ctx.fillRect(px, py, s, s);
      if (c === '^') {
        ctx.fillStyle = C.spike;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(px + (i / 3) * s + s * 0.04, py + s * 0.85);
          ctx.lineTo(px + ((i + 0.5) / 3) * s, py + s * 0.2);
          ctx.lineTo(px + ((i + 1) / 3) * s - s * 0.04, py + s * 0.85);
          ctx.fill();
        }
      } else if (c === '*' && !starTaken(g, x, y)) {
        ctx.fillStyle = C.star;
        starPath(ctx, px + s / 2, py + s / 2 + Math.sin(t * 3 + x) * s * 0.05, s * 0.36); ctx.fill();
      } else if (c === 'G') {
        const q = s / 4;
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
          ctx.fillStyle = (i + j) % 2 ? C.goal : '#e9fffa'; ctx.fillRect(px + i * q, py + j * q, q, q);
        }
      }
    }
  }
  // Empty pads: where players can build a community portal.
  for (const p of extra.pads || []) {
    const cx = (p.x + 0.5) * s, cy = (p.y + 0.5) * s;
    ctx.strokeStyle = 'rgba(255,181,71,.45)'; ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.setLineDash([s * 0.12, s * 0.1]);
    ctx.beginPath(); ctx.ellipse(cx, cy, s * 0.36, s * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,181,71,.55)';
    ctx.fillRect(cx - s * 0.12, cy - s * 0.025, s * 0.24, s * 0.05); ctx.fillRect(cx - s * 0.025, cy - s * 0.12, s * 0.05, s * 0.24);
  }
  for (const p of g.level.portals || []) {
    const cx = (p.x + 0.5) * s, cy = (p.y + 0.5) * s, pulse = 1 + Math.sin(t * 4 + p.x) * 0.06;
    const out = p.webring || p.returnTo;   // leads out of Playverse: teal; community portals: amber
    ctx.strokeStyle = p.community ? C.community : out ? C.goal : C.portal; ctx.lineWidth = s * 0.12;
    ctx.beginPath(); ctx.ellipse(cx, cy, s * 0.42 * pulse, s * 0.46 * pulse, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = p.community ? 'rgba(255,181,71,.3)' : out ? 'rgba(54,214,180,.3)' : 'rgba(124,92,255,.35)'; ctx.fill();
    if (extra.portalDone?.(p)) { ctx.fillStyle = C.star; starPath(ctx, cx, cy, s * 0.18); ctx.fill(); }
    const label = extra.labels?.(p);
    if (label) {
      ctx.font = `600 ${Math.max(10, Math.round(s * 0.34))}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      const w = ctx.measureText(label).width + s * 0.3, ty = cy - s * 0.6;
      ctx.fillStyle = 'rgba(13,15,22,.8)';
      ctx.beginPath(); ctx.roundRect(cx - w / 2, ty - s * 0.45, w, s * 0.5, s * 0.12); ctx.fill();
      ctx.fillStyle = '#eef0f7'; ctx.fillText(label, cx, ty);
    }
  }
  for (const gh of extra.ghosts || []) drawGhost(ctx, gh, s);
  for (const pe of extra.peers || []) drawPeer(ctx, pe, s, t);
  // player
  const px = g.x * s, py = g.y * s, r = HALF * s, bob = g.started && !g.finished ? Math.sin(t * 18) * s * 0.03 : 0;
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath(); ctx.ellipse(px, py + r * 0.95, r * 0.9, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = extra.flash ? C.spike : C.player;
  ctx.beginPath(); ctx.roundRect(px - r, py - r + bob, r * 2, r * 2, r * 0.5); ctx.fill();
  ctx.fillStyle = C.eye;
  const ex = g.facing * r * 0.25;
  ctx.fillRect(px + ex - r * 0.45, py - r * 0.25 + bob, r * 0.22, r * 0.4);
  ctx.fillRect(px + ex + r * 0.23, py - r * 0.25 + bob, r * 0.22, r * 0.4);
}

// A see-through runner from a replay. `gh` = {x, y, color, label, done}.
function drawGhost(ctx, gh, s) {
  const r = HALF * s, px = gh.x * s, py = gh.y * s;
  ctx.save();
  ctx.globalAlpha = gh.done ? 0.25 : 0.45;
  ctx.fillStyle = gh.color;
  ctx.beginPath(); ctx.roundRect(px - r, py - r, r * 2, r * 2, r * 0.5); ctx.fill();
  ctx.globalAlpha = gh.done ? 0.4 : 0.85;
  if (gh.label) {
    ctx.font = `600 ${Math.max(9, Math.round(s * 0.28))}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(gh.label, px, py - r - s * 0.06);
  }
  ctx.restore();
}

// Another player in the hub. `pe` = {x, y, nick, color}.
function drawPeer(ctx, pe, s) {
  const r = HALF * s, px = pe.x * s, py = pe.y * s;
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath(); ctx.ellipse(px, py + r * 0.95, r * 0.9, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = pe.color;
  ctx.beginPath(); ctx.roundRect(px - r, py - r, r * 2, r * 2, r * 0.5); ctx.fill();
  ctx.fillStyle = C.eye;
  ctx.fillRect(px - r * 0.45, py - r * 0.25, r * 0.22, r * 0.4);
  ctx.fillRect(px + r * 0.23, py - r * 0.25, r * 0.22, r * 0.4);
  ctx.font = `600 ${Math.max(9, Math.round(s * 0.3))}px system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(13,15,22,.75)';
  const w = ctx.measureText(pe.nick).width + s * 0.2;
  ctx.fillRect(px - w / 2, py - r - s * 0.42, w, s * 0.38);
  ctx.fillStyle = '#eef0f7'; ctx.fillText(pe.nick, px, py - r - s * 0.08);
}
