// Leaderboard UI. Talks to /api/scores (Cloudflare Pages Function, see functions/).
// If the API is not available (e.g. plain static server), it says so and the game still works.
import { getNickname, setNickname } from './store.js';

const fmt = (ms) => (ms / 1000).toFixed(2);
import { NICK_RE } from './community.js';
export { NICK_RE };

export async function fetchTop(levelId, version, { ghost = false } = {}) {
  const r = await fetch(`api/scores?levelId=${encodeURIComponent(levelId)}&version=${version}${ghost ? '&ghost=1' : ''}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function submit(body) {
  const r = await fetch('api/scores', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

function render(slot, scores, mine) {
  const ol = document.createElement('ol'); ol.className = 'board';
  if (!scores.length) { const li = document.createElement('li'); li.textContent = 'No times yet – be the first!'; ol.append(li); }
  scores.forEach((s, i) => {
    const li = document.createElement('li');
    if (mine && s.nickname === mine) li.classList.add('me');
    const left = document.createElement('span');
    const rank = document.createElement('span'); rank.className = 'rank'; rank.textContent = `${i + 1}`;
    left.append(rank, ' ', s.nickname);           // textContent only: nicknames are untrusted
    const right = document.createElement('span'); right.textContent = `${fmt(s.timeMs)} s`;
    li.append(left, right); ol.append(li);
  });
  slot.querySelector('.board')?.remove();
  slot.append(ol);
}

export function mountBoard(slot, { levelId, version, timeMs, replay, onSubmitted }) {
  slot.replaceChildren();
  const status = document.createElement('p'); status.textContent = 'Loading leaderboard…';
  slot.append(status);

  fetchTop(levelId, version).then((data) => {
    status.textContent = `Top 10 · v${version}`;
    const form = document.createElement('form'); form.className = 'row';
    const input = document.createElement('input');
    Object.assign(input, { placeholder: 'Nickname', maxLength: 16, required: true, value: getNickname(), autocomplete: 'nickname' });
    input.setAttribute('aria-label', 'Nickname');
    const btn = document.createElement('button'); btn.type = 'submit'; btn.textContent = 'Submit time';
    form.append(input, btn);
    slot.insertBefore(form, status);
    render(slot, data.scores, null);
    form.onsubmit = async (e) => {
      e.preventDefault();
      const nickname = input.value.trim();
      if (!NICK_RE.test(nickname)) { status.textContent = 'Nickname: 2–16 letters, digits, space, _ or -'; return; }
      btn.disabled = true; setNickname(nickname);
      try {
        const res = await submit({ levelId, version, nickname, replay });
        form.remove();
        status.textContent = res.rank ? `Submitted – you are #${res.rank} on v${version}` : 'Submitted.';
        // The server re-plays the run; its time is the official one (should always match).
        if (res.timeMs !== undefined && res.timeMs !== timeMs) status.textContent += ` (server time ${fmt(res.timeMs)} s)`;
        render(slot, res.scores, res.nickname);
        onSubmitted?.(res);
      } catch (err) {
        status.textContent = `Could not submit: ${err.message}`; btn.disabled = false;
      }
    };
  }).catch(() => {
    status.textContent = 'Leaderboard offline (local mode). Your personal best is saved on this device.';
  });
}
