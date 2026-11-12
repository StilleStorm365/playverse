// Keyboard (arrows/WASD) and touch/mouse drag joystick. Returns a live {dx, dy}.
export function createInput(target) {
  const keys = new Set();
  const drag = { active: false, ox: 0, oy: 0, dx: 0, dy: 0, id: null };
  const map = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd' };

  addEventListener('keydown', (e) => { if (map[e.code]) { keys.add(map[e.code]); e.preventDefault(); } });
  addEventListener('keyup', (e) => { if (map[e.code]) keys.delete(map[e.code]); });
  addEventListener('blur', () => keys.clear());

  target.addEventListener('pointerdown', (e) => {
    if (drag.active) return;
    Object.assign(drag, { active: true, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0, id: e.pointerId });
    target.setPointerCapture?.(e.pointerId);
  });
  target.addEventListener('pointermove', (e) => {
    if (!drag.active || e.pointerId !== drag.id) return;
    const vx = e.clientX - drag.ox, vy = e.clientY - drag.oy, len = Math.hypot(vx, vy), dead = 8, full = 48;
    if (len < dead) { drag.dx = drag.dy = 0; return; }
    const k = Math.min(1, len / full) / len;
    drag.dx = vx * k; drag.dy = vy * k;
  });
  const end = (e) => { if (e.pointerId === drag.id) Object.assign(drag, { active: false, dx: 0, dy: 0, id: null }); };
  target.addEventListener('pointerup', end);
  target.addEventListener('pointercancel', end);

  return {
    read() {
      let dx = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0);
      let dy = (keys.has('d') ? 1 : 0) - (keys.has('u') ? 1 : 0);
      if (!dx && !dy && drag.active) { dx = drag.dx; dy = drag.dy; }
      return { dx, dy };
    },
    reset() { keys.clear(); Object.assign(drag, { active: false, dx: 0, dy: 0, id: null }); },
  };
}
