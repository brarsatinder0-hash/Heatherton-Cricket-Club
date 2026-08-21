/**
 * Heatherton CC — PlayHQ live data (frontend)
 * ------------------------------------------------------------------
 * Drop this into index.html's main <script> block once the Worker
 * (playhq-worker.js) is deployed. Replace WORKER_URL below with your
 * real Worker URL from the Cloudflare dashboard.
 *
 * This calls YOUR Worker, never PlayHQ directly — the Worker is what
 * keeps the real credentials safe.
 * ------------------------------------------------------------------
 */

const PLAYHQ_WORKER_URL = 'https://heatherton-playhq.YOUR-SUBDOMAIN.workers.dev';

async function loadPlayHQFixtures() {
  const el = document.getElementById('playhq-fixtures-list'); // add this container to the Fixtures section
  if (!el) return;
  try {
    const res = await fetch(`${PLAYHQ_WORKER_URL}/fixtures`);
    if (!res.ok) throw new Error('fixtures fetch failed');
    const json = await res.json();
    const games = json.data || [];
    if (!games.length) {
      el.innerHTML = '<div class="fixture-item"><div class="fx-teams">No upcoming fixtures found</div></div>';
      return;
    }
    el.innerHTML = games.slice(0, 6).map(game => {
      const home = game.competitors?.find(c => c.isHomeTeam)?.name || 'TBA';
      const away = game.competitors?.find(c => !c.isHomeTeam)?.name || 'TBA';
      const date = game.schedule?.date || '';
      const venue = game.venue?.name || '';
      return `<div class="fixture-item">
        <div class="fx-date"><div class="d">${date.slice(8,10)}</div><div class="m">${date.slice(5,7)}</div></div>
        <div><div class="fx-teams">${home} vs ${away}</div><div class="fx-ground">${venue}</div></div>
      </div>`;
    }).join('');
  } catch (err) {
    el.innerHTML = '<div class="fixture-item"><div class="fx-teams">Live fixtures unavailable right now</div></div>';
  }
}

async function loadPlayHQLadder() {
  const el = document.getElementById('playhq-ladder-list'); // add this container wherever the ladder should show
  if (!el) return;
  try {
    const res = await fetch(`${PLAYHQ_WORKER_URL}/ladder`);
    if (!res.ok) throw new Error('ladder fetch failed');
    const json = await res.json();
    const table = json.ladders?.[0];
    if (!table) { el.textContent = 'Ladder unavailable.'; return; }
    const rows = table.standings.map(s =>
      `<tr><td>${s.team.name}</td>${s.values.map(v => `<td>${v}</td>`).join('')}</tr>`
    ).join('');
    const headerRow = table.headers.map(h => `<th>${h.shortName}</th>`).join('');
    el.innerHTML = `<table class="ladder-table"><thead><tr><th>Team</th>${headerRow}</tr></thead><tbody>${rows}</tbody></table>`;
  } catch (err) {
    el.textContent = 'Live ladder unavailable right now.';
  }
}

loadPlayHQFixtures();
loadPlayHQLadder();
setInterval(loadPlayHQFixtures, 15 * 60 * 1000);
setInterval(loadPlayHQLadder, 15 * 60 * 1000);
