const STORAGE_KEY = "pl-charity-challenge-state-v1";
const TICKET_PRICE = 5;

const defaultPots = [
  ["Liverpool", "Arsenal", "Manchester City", "Chelsea", "Manchester United"],
  ["Newcastle United", "Aston Villa", "Tottenham Hotspur", "Brighton", "Nottingham Forest"],
  ["Crystal Palace", "Brentford", "Fulham", "Everton", "Bournemouth"],
  ["Leeds United", "Sunderland", "Coventry City", "Ipswich Town", "Hull City"]
];

const defaultState = {
  settings: {
    seasonName: "2026/27 Premier League Charity Challenge",
    justGivingUrl: "",
    auth: {
      adminName: "",
      passwordHash: ""
    },
    scoring: { win: 3, draw: 2, goal: 1 },
    api: {
      endpoint: "https://v3.football.api-sports.io/fixtures",
      apiKey: "",
      apiKeyHeader: "x-apisports-key",
      leagueId: "39",
      season: "2026",
      extraHeaders: ""
    },
    pots: defaultPots
  },
  tickets: [],
  matches: [],
  archives: [],
  nextTicketNumber: 1
};

let state = loadState();

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindEvents();
  populateSettings();
  populateTeamSelects();
  render();
});

function cacheElements() {
  [
    "metricGrid", "leaderboardBody", "leaderboardCount", "prizeList", "latestResults",
    "topTeams", "purchaseForm", "purchaseMessage", "ticketSearch",
    "clearSearch", "ticketBody", "ticketCount", "matchHistory", "matchCount", "statsGrid", "settingsForm",
    "settingsMessage", "seasonInput", "justGivingInput", "winPoints", "drawPoints",
    "goalPoints", "pot1", "pot2", "pot3", "pot4", "exportBtn", "exportPublicBtn", "importInput",
    "backupBtn", "archiveBtn", "resetScoresBtn", "newSeasonBtn", "archiveList",
    "donateBtn", "seasonName", "syncApiBtn", "apiStatus", "apiEndpoint", "apiKey",
    "apiKeyHeader", "apiLeagueId", "apiSeason", "apiExtraHeaders", "authOverlay",
    "authForm", "authTitle", "authHelp", "authName", "authPassword", "authSubmit",
    "authMessage", "adminUser", "logoutBtn", "adminNameInput", "adminPasswordInput"
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function bindEvents() {
  els.purchaseForm.addEventListener("submit", handlePurchase);
  if (els.matchForm) els.matchForm.addEventListener("submit", handleMatch);
  els.settingsForm.addEventListener("submit", handleSettings);
  els.ticketSearch.addEventListener("input", renderTickets);
  els.clearSearch.addEventListener("click", () => {
    els.ticketSearch.value = "";
    renderTickets();
  });
  els.exportBtn.addEventListener("click", () => downloadJson(state, "pl-charity-challenge-export.json"));
  els.exportPublicBtn.addEventListener("click", exportPublicData);
  els.backupBtn.addEventListener("click", () => downloadJson(state, `pl-charity-backup-${todayStamp()}.json`));
  els.importInput.addEventListener("change", handleImport);
  els.archiveBtn.addEventListener("click", archiveSeason);
  els.resetScoresBtn.addEventListener("click", resetScores);
  els.newSeasonBtn.addEventListener("click", startNewSeason);
  els.donateBtn.addEventListener("click", openJustGiving);
  els.syncApiBtn.addEventListener("click", syncApiResults);
  els.authForm.addEventListener("submit", handleAuth);
  els.logoutBtn.addEventListener("click", logoutAdmin);

  document.querySelectorAll(".nav-list a").forEach((link) => {
    link.addEventListener("click", () => {
      document.querySelectorAll(".nav-list a").forEach((item) => item.classList.remove("active"));
      link.classList.add("active");
    });
  });
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return structuredClone(defaultState);
    return normalizeState(saved);
  } catch {
    return structuredClone(defaultState);
  }
}

function normalizeState(saved) {
  return {
    ...structuredClone(defaultState),
    ...saved,
    settings: {
      ...structuredClone(defaultState.settings),
      ...(saved.settings || {}),
      scoring: {
        ...defaultState.settings.scoring,
        ...((saved.settings && saved.settings.scoring) || {})
      },
      api: {
        ...defaultState.settings.api,
        ...((saved.settings && saved.settings.api) || {})
      },
      auth: {
        ...defaultState.settings.auth,
        ...((saved.settings && saved.settings.auth) || {})
      },
      pots: saved.settings?.pots || defaultPots
    },
    tickets: (saved.tickets || []).map((ticket) => ({ ...ticket, paid: true })),
    matches: saved.matches || [],
    archives: saved.archives || [],
    nextTicketNumber: saved.nextTicketNumber || 1
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function render() {
  recalculateTickets();
  saveState();
  renderAuthState();
  renderDashboard();
  renderTickets();
  renderResults();
  renderStats();
  renderArchives();
  els.seasonName.textContent = state.settings.seasonName;
}

function hasAdminPassword() {
  return Boolean(state.settings.auth?.passwordHash);
}

function renderAuthState() {
  const isAuthenticated = sessionStorage.getItem("plcc-admin-authenticated") === "true";
  document.body.classList.toggle("auth-locked", !isAuthenticated);
  els.adminUser.textContent = isAuthenticated
    ? `Admin: ${state.settings.auth.adminName || "Organiser"}`
    : "";

  if (!isAuthenticated) {
    const isSetup = !hasAdminPassword();
    els.authTitle.textContent = isSetup ? "Create Admin Access" : "Admin Login";
    els.authHelp.textContent = isSetup
      ? "Set the organiser name and password for this browser."
      : "Enter the organiser details to manage tickets and scores.";
    els.authSubmit.textContent = isSetup ? "Create Admin" : "Unlock App";
    els.authName.value = state.settings.auth.adminName || "";
    els.authPassword.value = "";
  }
}

async function handleAuth(event) {
  event.preventDefault();
  const adminName = els.authName.value.trim();
  const password = els.authPassword.value;
  if (!adminName || !password) return;

  if (!hasAdminPassword()) {
    state.settings.auth.adminName = adminName;
    state.settings.auth.passwordHash = await hashPassword(password);
    sessionStorage.setItem("plcc-admin-authenticated", "true");
    els.authMessage.textContent = "";
    populateSettings();
    render();
    return;
  }

  const expectedName = state.settings.auth.adminName || "";
  const matchesName = adminName.toLowerCase() === expectedName.toLowerCase();
  const matchesPassword = await hashPassword(password) === state.settings.auth.passwordHash;
  if (!matchesName || !matchesPassword) {
    els.authMessage.textContent = "Admin name or password is incorrect.";
    return;
  }

  sessionStorage.setItem("plcc-admin-authenticated", "true");
  els.authMessage.textContent = "";
  render();
}

function logoutAdmin() {
  sessionStorage.removeItem("plcc-admin-authenticated");
  renderAuthState();
}

async function hashPassword(password) {
  const value = `plcc:${password}`;
  if (window.crypto?.subtle) {
    const bytes = new TextEncoder().encode(value);
    const digest = await window.crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return `fallback:${hash}`;
}

function allTeams() {
  return state.settings.pots.flat().map((team) => team.trim()).filter(Boolean);
}

function getPotIndex(team) {
  return state.settings.pots.findIndex((pot) => pot.includes(team));
}

function teamNameKey(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normaliseTeamName(name) {
  const byKey = Object.fromEntries(allTeams().map((team) => [teamNameKey(team), team]));
  const aliases = {
    "man city": "Manchester City",
    "manchester city fc": "Manchester City",
    "man utd": "Manchester United",
    "man united": "Manchester United",
    "manchester united fc": "Manchester United",
    "spurs": "Tottenham Hotspur",
    "tottenham": "Tottenham Hotspur",
    "tottenham hotspur fc": "Tottenham Hotspur",
    "brighton and hove albion": "Brighton",
    "brighton hove albion": "Brighton",
    "brighton and hove albion fc": "Brighton",
    "nottingham forest fc": "Nottingham Forest",
    "newcastle": "Newcastle United",
    "newcastle united fc": "Newcastle United",
    "aston villa fc": "Aston Villa",
    "wolves": "Wolverhampton Wanderers",
    "west ham": "West Ham United",
    "west ham united fc": "West Ham United",
    "leeds": "Leeds United",
    "leeds united fc": "Leeds United",
    "sunderland afc": "Sunderland",
    "coventry": "Coventry City",
    "coventry city fc": "Coventry City",
    "ipswich": "Ipswich Town",
    "ipswich town fc": "Ipswich Town",
    "hull": "Hull City",
    "hull city afc": "Hull City",
    "bournemouth": "Bournemouth",
    "afc bournemouth": "Bournemouth"
  };
  const key = teamNameKey(name);
  return aliases[key] || byKey[key] || String(name || "").trim();
}

function isValidCombo(teams) {
  const unique = new Set(teams);
  if (unique.size !== 4) return false;
  const potIndexes = teams.map(getPotIndex);
  return [0, 1, 2, 3].every((potIndex) => potIndexes.filter((index) => index === potIndex).length === 1);
}

function comboKey(teams) {
  return [...teams].sort().join(" | ");
}

function generateTicketTeams() {
  const used = new Set(state.tickets.map((ticket) => comboKey(ticket.teams)));
  const maxTries = 20000;
  for (let i = 0; i < maxTries; i += 1) {
    const draw = state.settings.pots.map((pot) => shuffle(pot).find(Boolean));
    const key = comboKey(draw);
    if (isValidCombo(draw) && !used.has(key)) return draw;
  }
  throw new Error("No valid unique combinations remain.");
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function handlePurchase(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const player = form.get("player").trim();
  const quantity = Math.max(1, Number(form.get("quantity")));
  if (!player) return;

  try {
    const issued = [];
    for (let i = 0; i < quantity; i += 1) {
      issued.push({
        id: crypto.randomUUID(),
        ticketNumber: formatTicketNumber(state.nextTicketNumber),
        player,
        teams: generateTicketTeams(),
        purchasedAt: new Date().toISOString(),
        paid: true,
        score: 0,
        gamesPlayed: 0,
        pointsThisWeek: 0,
        previousRank: null
      });
      state.nextTicketNumber += 1;
    }
    state.tickets.push(...issued);
    event.currentTarget.reset();
    els.purchaseMessage.textContent = `${issued.length} paid ticket${issued.length === 1 ? "" : "s"} generated.`;
    render();
  } catch (error) {
    els.purchaseMessage.textContent = error.message;
  }
}

function formatTicketNumber(number) {
  return `PLCC-${String(number).padStart(4, "0")}`;
}

function handleMatch(event) {
  event.preventDefault();
  const oldRanks = rankMap();
  const form = new FormData(event.currentTarget);
  const homeTeam = form.get("homeTeam");
  const awayTeam = form.get("awayTeam");
  if (homeTeam === awayTeam) {
    alert("Choose two different teams.");
    return;
  }
  state.matches.push({
    id: crypto.randomUUID(),
    date: new Date(form.get("date")).toISOString(),
    homeTeam,
    awayTeam,
    homeGoals: Number(form.get("homeGoals")),
    awayGoals: Number(form.get("awayGoals")),
    source: "manual"
  });
  state.tickets.forEach((ticket) => {
    ticket.previousRank = oldRanks.get(ticket.id) || null;
  });
  event.currentTarget.reset();
  setDefaultMatchDate();
  render();
}

async function handleSettings(event) {
  event.preventDefault();
  const pots = [els.pot1, els.pot2, els.pot3, els.pot4].map((field) =>
    field.value.split(/\n+/).map((team) => team.trim()).filter(Boolean)
  );
  const teams = pots.flat();
  if (teams.length !== 20 || new Set(teams).size !== 20) {
    els.settingsMessage.textContent = "Please enter 20 unique clubs across the four pots.";
    return;
  }
  const currentAuth = state.settings.auth || {};
  const newPassword = els.adminPasswordInput.value;
  const adminName = els.adminNameInput.value.trim() || currentAuth.adminName || "Organiser";
  state.settings = {
    seasonName: els.seasonInput.value.trim() || defaultState.settings.seasonName,
    justGivingUrl: els.justGivingInput.value.trim(),
    auth: {
      adminName,
      passwordHash: newPassword ? await hashPassword(newPassword) : currentAuth.passwordHash
    },
    scoring: {
      win: Number(els.winPoints.value),
      draw: Number(els.drawPoints.value),
      goal: Number(els.goalPoints.value)
    },
    api: {
      endpoint: els.apiEndpoint.value.trim(),
      apiKey: els.apiKey.value.trim(),
      apiKeyHeader: els.apiKeyHeader.value.trim() || "x-apisports-key",
      leagueId: els.apiLeagueId.value.trim(),
      season: els.apiSeason.value.trim(),
      extraHeaders: els.apiExtraHeaders.value.trim()
    },
    pots
  };
  els.adminPasswordInput.value = "";
  els.settingsMessage.textContent = "Settings saved.";
  populateTeamSelects();
  render();
}

function populateSettings() {
  els.seasonInput.value = state.settings.seasonName;
  els.justGivingInput.value = state.settings.justGivingUrl;
  els.adminNameInput.value = state.settings.auth.adminName || "";
  els.adminPasswordInput.value = "";
  els.winPoints.value = state.settings.scoring.win;
  els.drawPoints.value = state.settings.scoring.draw;
  els.goalPoints.value = state.settings.scoring.goal;
  els.apiEndpoint.value = state.settings.api.endpoint || "";
  els.apiKey.value = state.settings.api.apiKey || "";
  els.apiKeyHeader.value = state.settings.api.apiKeyHeader || "x-apisports-key";
  els.apiLeagueId.value = state.settings.api.leagueId || "";
  els.apiSeason.value = state.settings.api.season || "";
  els.apiExtraHeaders.value = state.settings.api.extraHeaders || "";
  [els.pot1, els.pot2, els.pot3, els.pot4].forEach((field, index) => {
    field.value = state.settings.pots[index].join("\n");
  });
}

function populateTeamSelects() {
  if (!els.homeTeamSelect || !els.awayTeamSelect) return;
  const options = allTeams().map((team) => `<option value="${escapeHtml(team)}">${escapeHtml(team)}</option>`).join("");
  els.homeTeamSelect.innerHTML = options;
  els.awayTeamSelect.innerHTML = options;
  if (els.awayTeamSelect.options.length > 1) els.awayTeamSelect.selectedIndex = 1;
  setDefaultMatchDate();
}

function setDefaultMatchDate() {
  if (!els.matchForm) return;
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  els.matchForm.elements.date.value = now.toISOString().slice(0, 16);
}

function recalculateTickets() {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  state.tickets.forEach((ticket) => {
    ticket.score = 0;
    ticket.gamesPlayed = 0;
    ticket.pointsThisWeek = 0;
    state.matches.forEach((match) => {
      if (new Date(match.date) <= new Date(ticket.purchasedAt)) return;
      const points = pointsForTicket(ticket, match);
      if (points > 0 || ticketTeamsInMatch(ticket, match).length) {
        ticket.score += points;
        ticket.gamesPlayed += ticketTeamsInMatch(ticket, match).length;
        if (new Date(match.date).getTime() >= weekAgo) ticket.pointsThisWeek += points;
      }
    });
  });
}

function ticketTeamsInMatch(ticket, match) {
  const homeTeam = normaliseTeamName(match.homeTeam);
  const awayTeam = normaliseTeamName(match.awayTeam);
  return ticket.teams.filter((team) => {
    const normalisedTeam = normaliseTeamName(team);
    return normalisedTeam === homeTeam || normalisedTeam === awayTeam;
  });
}

function pointsForTicket(ticket, match) {
  return ticket.teams.reduce((total, team) => total + pointsForTeam(team, match), 0);
}

function pointsForTeam(team, match) {
  const scoring = state.settings.scoring;
  const normalisedTeam = normaliseTeamName(team);
  const homeTeam = normaliseTeamName(match.homeTeam);
  const awayTeam = normaliseTeamName(match.awayTeam);
  if (normalisedTeam !== homeTeam && normalisedTeam !== awayTeam) return 0;
  const goals = normalisedTeam === homeTeam ? match.homeGoals : match.awayGoals;
  const against = normalisedTeam === homeTeam ? match.awayGoals : match.homeGoals;
  if (goals > against) return scoring.win + goals * scoring.goal;
  if (goals === against) return scoring.draw + goals * scoring.goal;
  return goals * scoring.goal;
}

function sortedTickets() {
  return [...state.tickets].sort((a, b) => b.score - a.score || b.pointsThisWeek - a.pointsThisWeek || a.ticketNumber.localeCompare(b.ticketNumber));
}

function rankMap() {
  const map = new Map();
  sortedTickets().forEach((ticket, index) => map.set(ticket.id, index + 1));
  return map;
}

function renderDashboard() {
  const ticketsSold = state.tickets.length;
  const raised = ticketsSold * TICKET_PRICE;
  const charity = raised * (2 / 3);
  const prize = raised / 3;
  const metrics = [
    ["Tickets sold", ticketsSold],
    ["Total money raised", money(raised)],
    ["Charity donation", money(charity)],
    ["Prize fund", money(prize)],
    ["Remaining combinations", remainingCombinations()]
  ];
  els.metricGrid.innerHTML = metrics.map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join("");
  els.prizeList.innerHTML = [
    ["1st Prize", prize * 0.6, "60% of prize fund"],
    ["2nd Prize", prize * 0.25, "25% of prize fund"],
    ["3rd Prize", prize * 0.15, "15% of prize fund"]
  ].map(([label, value, note]) => `<div class="prize-item"><span>${label}<small>${note}</small></span><strong>${money(value)}</strong></div>`).join("");
  renderLeaderboard();
  renderLatestResults();
  renderTopTeams();
}

function renderLeaderboard() {
  const tickets = sortedTickets();
  els.leaderboardCount.textContent = `${tickets.length} tickets`;
  els.leaderboardBody.innerHTML = tickets.slice(0, 25).map((ticket, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(ticket.player)}</td>
      <td>${ticket.ticketNumber}</td>
      <td class="teams-cell">${ticket.teams.map(escapeHtml).join(", ")}</td>
      <td><strong>${ticket.score}</strong></td>
      <td>${ticket.gamesPlayed}</td>
      <td>${ticket.pointsThisWeek}</td>
      <td>${movement(ticket, index + 1)}</td>
    </tr>
  `).join("") || emptyRow("No tickets issued yet.", 8);
}

function movement(ticket, rank) {
  if (!ticket.previousRank) return "—";
  if (ticket.previousRank > rank) return `▲ ${ticket.previousRank - rank}`;
  if (ticket.previousRank < rank) return `▼ ${rank - ticket.previousRank}`;
  return "—";
}

function renderLatestResults() {
  els.latestResults.innerHTML = [...state.matches]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 6)
    .map(matchResultItem)
    .join("") || `<p class="muted">No results entered yet.</p>`;
}

function renderTopTeams() {
  const rows = teamStats().sort((a, b) => b.points - a.points || b.goals - a.goals).slice(0, 6);
  els.topTeams.innerHTML = rows.map((row) => `
    <div class="result-item">
      <span>${escapeHtml(row.team)}<small>${row.goals} goals, ${row.wins} wins</small></span>
      <strong>${row.points} pts</strong>
    </div>
  `).join("") || `<p class="muted">No team points yet.</p>`;
}

function renderTickets() {
  const query = els.ticketSearch.value.trim().toLowerCase();
  const rows = sortedTickets().filter((ticket) => {
    const haystack = `${ticket.player} ${ticket.ticketNumber} ${ticket.teams.join(" ")}`.toLowerCase();
    return haystack.includes(query);
  });
  els.ticketCount.textContent = `${rows.length} shown`;
  els.ticketBody.innerHTML = rows.map((ticket) => `
    <tr>
      <td>${ticket.ticketNumber}</td>
      <td>${escapeHtml(ticket.player)}</td>
      <td class="teams-cell">${ticket.teams.map(escapeHtml).join(", ")}</td>
      <td>${formatDate(ticket.purchasedAt)}</td>
      <td><strong>${ticket.score}</strong></td>
      <td>${ticket.gamesPlayed}</td>
      <td><span class="status-pill paid">Paid</span></td>
      <td>
        <div class="inline-actions">
          <button class="secondary-action" type="button" onclick="editTicket('${ticket.id}')">Edit</button>
          <button class="secondary-action" type="button" onclick="printTicket('${ticket.id}')">Print</button>
          <button class="danger-action" type="button" onclick="deleteTicket('${ticket.id}')">Delete</button>
        </div>
      </td>
    </tr>
  `).join("") || emptyRow("No tickets match your search.", 8);
}

function renderResults() {
  els.matchCount.textContent = `${state.matches.length} processed`;
  els.matchHistory.innerHTML = [...state.matches]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map((match) => `${matchResultItem(match)}<button class="danger-action compact" type="button" onclick="deleteMatch('${match.id}')">Delete result</button>`)
    .join("") || `<p class="muted">No results entered yet.</p>`;
}

async function syncApiResults() {
  const api = state.settings.api || {};
  if (!api.endpoint || !api.apiKey) {
    els.apiStatus.textContent = "Add your API endpoint and API key in Settings first.";
    location.hash = "#settings";
    return;
  }

  els.syncApiBtn.disabled = true;
  els.apiStatus.textContent = "Checking the football API for completed results...";

  try {
    const feed = await fetchFootballFeed(api);
    const imported = importApiMatches(feed);
    render();
    els.apiStatus.textContent = imported
      ? `${imported} completed result${imported === 1 ? "" : "s"} imported and scores updated.`
      : "No new completed results found.";
  } catch (error) {
    els.apiStatus.textContent = `API update failed: ${error.message}`;
  } finally {
    els.syncApiBtn.disabled = false;
  }
}

async function fetchFootballFeed(api) {
  const url = buildApiUrl(api);
  const headers = {};
  if (api.apiKeyHeader) headers[api.apiKeyHeader] = api.apiKey;
  if (api.extraHeaders) {
    try {
      Object.assign(headers, JSON.parse(api.extraHeaders));
    } catch {
      throw new Error("Extra headers must be valid JSON.");
    }
  }
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`API returned ${response.status}`);
  return response.json();
}

function buildApiUrl(api) {
  const url = new URL(api.endpoint);
  if (!url.searchParams.has("league") && api.leagueId) url.searchParams.set("league", api.leagueId);
  if (!url.searchParams.has("season") && api.season) url.searchParams.set("season", api.season);
  return url.toString();
}

function importApiMatches(feed) {
  const parsed = parseApiMatches(feed);
  const oldRanks = rankMap();
  const existingKeys = new Set(state.matches.map(matchIdentity));
  let imported = 0;

  parsed.forEach((match) => {
    if (!match.homeTeam || !match.awayTeam) return;
    if (!allTeams().includes(normaliseTeamName(match.homeTeam)) || !allTeams().includes(normaliseTeamName(match.awayTeam))) return;
    const key = matchIdentity(match);
    if (existingKeys.has(key)) return;
    state.matches.push({
      id: crypto.randomUUID(),
      ...match,
      source: "api"
    });
    existingKeys.add(key);
    imported += 1;
  });

  if (imported) {
    state.tickets.forEach((ticket) => {
      ticket.previousRank = oldRanks.get(ticket.id) || null;
    });
    state.settings.api.lastSync = new Date().toISOString();
  }

  return imported;
}

function parseApiMatches(feed) {
  const records = Array.isArray(feed) ? feed : feed.response || feed.matches || feed.fixtures || [];
  return records.map(parseApiMatch).filter(Boolean);
}

function parseApiMatch(record) {
  if (record.fixture && record.teams && record.goals) {
    const status = record.fixture.status?.short || record.fixture.status?.long || "";
    if (!["FT", "AET", "PEN", "Match Finished", "Finished"].includes(status)) return null;
    if (record.goals.home === null || record.goals.away === null) return null;
    return {
      externalId: String(record.fixture.id || ""),
      date: new Date(record.fixture.date).toISOString(),
      homeTeam: normaliseTeamName(record.teams.home?.name),
      awayTeam: normaliseTeamName(record.teams.away?.name),
      homeGoals: Number(record.goals.home),
      awayGoals: Number(record.goals.away)
    };
  }

  if (record.homeTeam && record.awayTeam && record.score) {
    if (record.status && !["FINISHED", "FT", "AET", "PEN"].includes(record.status)) return null;
    const fullTime = record.score.fullTime || record.score;
    const homeGoals = fullTime.home ?? fullTime.homeTeam;
    const awayGoals = fullTime.away ?? fullTime.awayTeam;
    if (homeGoals === null || awayGoals === null || homeGoals === undefined || awayGoals === undefined) return null;
    return {
      externalId: String(record.id || record.utcDate || ""),
      date: new Date(record.utcDate || record.date).toISOString(),
      homeTeam: normaliseTeamName(record.homeTeam.name || record.homeTeam),
      awayTeam: normaliseTeamName(record.awayTeam.name || record.awayTeam),
      homeGoals: Number(homeGoals),
      awayGoals: Number(awayGoals)
    };
  }

  const home = record.home || record.home_name || record.homeTeamName;
  const away = record.away || record.away_name || record.awayTeamName;
  const homeGoals = record.homeGoals ?? record.home_score ?? record.homeScore;
  const awayGoals = record.awayGoals ?? record.away_score ?? record.awayScore;
  if (!home || !away || homeGoals === undefined || awayGoals === undefined) return null;
  return {
    externalId: String(record.id || record.fixtureId || record.date || ""),
    date: new Date(record.date || record.utcDate || record.kickoff || Date.now()).toISOString(),
    homeTeam: normaliseTeamName(home),
    awayTeam: normaliseTeamName(away),
    homeGoals: Number(homeGoals),
    awayGoals: Number(awayGoals)
  };
}

function matchIdentity(match) {
  if (match.externalId) return `id:${match.externalId}`;
  return [
    teamNameKey(match.homeTeam),
    teamNameKey(match.awayTeam),
    new Date(match.date).toISOString().slice(0, 10),
    match.homeGoals,
    match.awayGoals
  ].join("|");
}

function matchResultItem(match) {
  return `
    <div class="result-item">
      <span>${escapeHtml(match.homeTeam)} ${match.homeGoals} - ${match.awayGoals} ${escapeHtml(match.awayTeam)}
        <small>${formatDate(match.date)}</small>
      </span>
      <strong>${match.homeGoals + match.awayGoals} goals</strong>
    </div>
  `;
}

function renderStats() {
  const tickets = sortedTickets();
  const teams = teamStats();
  const selected = mostSelectedTeam();
  const totalGoals = state.matches.reduce((total, match) => total + match.homeGoals + match.awayGoals, 0);
  const average = state.tickets.length ? (state.tickets.reduce((sum, ticket) => sum + ticket.score, 0) / state.tickets.length).toFixed(1) : "0.0";
  const raised = state.tickets.length * TICKET_PRICE;
  const cards = [
    ["Highest scoring ticket", tickets[0] ? `${tickets[0].ticketNumber} · ${tickets[0].score}` : "None"],
    ["Highest scoring team", topTeamBy("points", teams)],
    ["Most goals", topTeamBy("goals", teams)],
    ["Most wins", topTeamBy("wins", teams)],
    ["Most draws", topTeamBy("draws", teams)],
    ["Most selected team", selected],
    ["Money raised", money(raised)],
    ["Donation total", money(raised * (2 / 3))],
    ["Prize fund", money(raised / 3)],
    ["Tickets sold", state.tickets.length],
    ["Average ticket score", average],
    ["Total matches processed", state.matches.length],
    ["Total goals", totalGoals]
  ];
  els.statsGrid.innerHTML = cards.map(([label, value]) => `<div class="stat-card"><span>${label}</span><strong>${escapeHtml(String(value))}</strong></div>`).join("");
}

function teamStats() {
  const stats = new Map(allTeams().map((team) => [team, { team, points: 0, goals: 0, wins: 0, draws: 0 }]));
  state.matches.forEach((match) => {
    [[match.homeTeam, match.homeGoals, match.awayGoals], [match.awayTeam, match.awayGoals, match.homeGoals]].forEach(([team, goals, against]) => {
      const normalisedTeam = normaliseTeamName(team);
      const row = stats.get(normalisedTeam) || { team: normalisedTeam, points: 0, goals: 0, wins: 0, draws: 0 };
      row.goals += goals;
      row.points += pointsForTeam(normalisedTeam, match);
      if (goals > against) row.wins += 1;
      if (goals === against) row.draws += 1;
      stats.set(normalisedTeam, row);
    });
  });
  return [...stats.values()];
}

function topTeamBy(key, teams) {
  const row = [...teams].sort((a, b) => b[key] - a[key])[0];
  return row && row[key] ? `${row.team} · ${row[key]}` : "None";
}

function mostSelectedTeam() {
  const counts = new Map();
  state.tickets.forEach((ticket) => ticket.teams.forEach((team) => counts.set(team, (counts.get(team) || 0) + 1)));
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return top ? `${top[0]} · ${top[1]}` : "None";
}

function remainingCombinations() {
  const teams = allTeams();
  let total = 0;
  for (let a = 0; a < teams.length - 3; a += 1) {
    for (let b = a + 1; b < teams.length - 2; b += 1) {
      for (let c = b + 1; c < teams.length - 1; c += 1) {
        for (let d = c + 1; d < teams.length; d += 1) {
          if (isValidCombo([teams[a], teams[b], teams[c], teams[d]])) total += 1;
        }
      }
    }
  }
  const used = new Set(state.tickets.map((ticket) => comboKey(ticket.teams)));
  return Math.max(0, total - used.size);
}

function editTicket(id) {
  const ticket = state.tickets.find((item) => item.id === id);
  if (!ticket) return;
  const player = prompt("Player name", ticket.player);
  if (!player || !player.trim()) return;
  ticket.player = player.trim();
  render();
}

function deleteTicket(id) {
  if (!confirm("Delete this ticket?")) return;
  state.tickets = state.tickets.filter((ticket) => ticket.id !== id);
  render();
}

function deleteMatch(id) {
  if (!confirm("Delete this result and recalculate scores?")) return;
  state.matches = state.matches.filter((match) => match.id !== id);
  render();
}

function printTicket(id) {
  const ticket = state.tickets.find((item) => item.id === id);
  if (!ticket) return;
  const popup = window.open("", "_blank", "width=720,height=640");
  popup.document.write(`
    <html>
      <head>
        <title>${ticket.ticketNumber}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 32px; color: #13251a; }
          .ticket { border: 2px solid #137a3d; border-radius: 8px; padding: 24px; }
          h1 { margin: 0 0 8px; }
          .number { color: #137a3d; font-size: 28px; font-weight: 800; }
          li { margin: 8px 0; }
        </style>
      </head>
      <body>
        <div class="ticket">
          <h1>Premier League Charity Challenge</h1>
          <p class="number">${ticket.ticketNumber}</p>
          <p><strong>Player:</strong> ${escapeHtml(ticket.player)}</p>
          <p><strong>Purchased:</strong> ${formatDate(ticket.purchasedAt)}</p>
          <p><strong>Status:</strong> Paid</p>
          <h2>Teams</h2>
          <ul>${ticket.teams.map((team) => `<li>${escapeHtml(team)}</li>`).join("")}</ul>
          <p><strong>Current score:</strong> ${ticket.score}</p>
          <p>Thank you for supporting Prostate Cancer fundraising.</p>
        </div>
        <script>window.print();<\/script>
      </body>
    </html>
  `);
  popup.document.close();
}

function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state = normalizeState(JSON.parse(reader.result));
      populateSettings();
      populateTeamSelects();
      render();
      alert("Import complete.");
    } catch {
      alert("That JSON file could not be imported.");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

function archiveSeason() {
  state.archives.unshift({
    id: crypto.randomUUID(),
    archivedAt: new Date().toISOString(),
    seasonName: state.settings.seasonName,
    tickets: state.tickets,
    matches: state.matches
  });
  state.tickets = [];
  state.matches = [];
  state.nextTicketNumber = 1;
  render();
}

function resetScores() {
  if (!confirm("Reset scores by deleting all match results?")) return;
  state.matches = [];
  state.tickets.forEach((ticket) => {
    ticket.score = 0;
    ticket.gamesPlayed = 0;
    ticket.pointsThisWeek = 0;
    ticket.previousRank = null;
  });
  render();
}

function startNewSeason() {
  if (!confirm("Start a new season? Current tickets and results will be archived first.")) return;
  archiveSeason();
}

function renderArchives() {
  els.archiveList.innerHTML = state.archives.map((archive) => `
    <div class="result-item">
      <span>${escapeHtml(archive.seasonName)}<small>${archive.tickets.length} tickets, ${archive.matches.length} matches · ${formatDate(archive.archivedAt)}</small></span>
      <button class="secondary-action compact" type="button" onclick="downloadArchive('${archive.id}')">Download</button>
    </div>
  `).join("") || `<p class="muted">No archived seasons yet.</p>`;
}

function downloadArchive(id) {
  const archive = state.archives.find((item) => item.id === id);
  if (archive) downloadJson(archive, `${archive.seasonName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-archive.json`);
}

function exportPublicData() {
  const publicData = {
    settings: {
      seasonName: state.settings.seasonName,
      justGivingUrl: state.settings.justGivingUrl,
      scoring: state.settings.scoring,
      pots: state.settings.pots
    },
    tickets: state.tickets.map(({ id, ticketNumber, player, teams, purchasedAt, score, gamesPlayed, pointsThisWeek }) => ({
      id,
      ticketNumber,
      player,
      teams,
      purchasedAt,
      score,
      gamesPlayed,
      pointsThisWeek
    })),
    matches: state.matches
  };
  downloadJson(publicData, "public-data.json");
}

function openJustGiving() {
  if (!state.settings.justGivingUrl) {
    alert("Add your JustGiving URL in Settings first.");
    return;
  }
  window.open(state.settings.justGivingUrl, "_blank", "noopener");
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function emptyRow(message, cols) {
  return `<tr><td colspan="${cols}">${message}</td></tr>`;
}

function money(value) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

window.editTicket = editTicket;
window.deleteTicket = deleteTicket;
window.deleteMatch = deleteMatch;
window.printTicket = printTicket;
window.downloadArchive = downloadArchive;
