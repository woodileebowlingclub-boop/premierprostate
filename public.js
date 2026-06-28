const PUBLIC_STORAGE_KEY = "pl-charity-challenge-state-v1";
const PUBLIC_TICKET_PRICE = 10;

const publicDefaultPots = [
  ["Liverpool", "Arsenal", "Manchester City", "Chelsea", "Manchester United", "Celtic", "Rangers"],
  ["Newcastle United", "Aston Villa", "Tottenham Hotspur", "Brighton & Hove Albion", "Nottingham Forest", "Heart of Midlothian", "Hibernian"],
  ["Crystal Palace", "Brentford", "Fulham", "Everton", "Bournemouth", "Dundee", "Dundee United", "Aberdeen"],
  ["Leeds United", "Sunderland", "Coventry City", "Ipswich Town", "Hull City", "St Johnstone", "Falkirk", "Motherwell"]
];

let publicState = null;

document.addEventListener("DOMContentLoaded", async () => {
  publicState = await loadPublicState();
  recalculatePublicTickets();
  renderPublicPage();
  document.getElementById("publicSearch").addEventListener("input", renderPublicTickets);
});

async function loadPublicState() {
  try {
    const response = await fetch("public-data.json", { cache: "no-store" });
    if (response.ok) return normalizePublicState(await response.json());
  } catch {
    // Hosted pages can still work from local browser data when opened by the organiser.
  }

  try {
    const saved = JSON.parse(localStorage.getItem(PUBLIC_STORAGE_KEY));
    if (saved) return normalizePublicState(saved);
  } catch {
    // Fall through to empty state.
  }

  return normalizePublicState({});
}

function normalizePublicState(saved) {
  const settings = saved.settings || {};
  return {
    settings: {
      seasonName: settings.seasonName || "Football Charity Challenge",
      justGivingUrl: settings.justGivingUrl || "",
      scoring: { win: 3, draw: 2, goal: 1, ...(settings.scoring || {}) },
      pots: settings.pots || publicDefaultPots
    },
    tickets: saved.tickets || [],
    matches: saved.matches || []
  };
}

function allPublicTeams() {
  return publicState.settings.pots.flat().map((team) => team.trim()).filter(Boolean);
}

function publicTeamNameKey(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalisePublicTeamName(name) {
  const byKey = Object.fromEntries(allPublicTeams().map((team) => [publicTeamNameKey(team), team]));
  const aliases = {
    "man city": "Manchester City",
    "man utd": "Manchester United",
    "man united": "Manchester United",
    "spurs": "Tottenham Hotspur",
    "tottenham": "Tottenham Hotspur",
    "brighton": "Brighton & Hove Albion",
    "brighton and hove albion": "Brighton & Hove Albion",
    "brighton hove albion": "Brighton & Hove Albion",
    "hearts": "Heart of Midlothian",
    "heart of midlothian": "Heart of Midlothian",
    "heart of midlothian fc": "Heart of Midlothian",
    "hibs": "Hibernian",
    "hibernian fc": "Hibernian",
    "dundee fc": "Dundee",
    "dundee utd": "Dundee United",
    "dundee united fc": "Dundee United",
    "st johnstone fc": "St Johnstone",
    "saint johnstone": "St Johnstone",
    "falkirk fc": "Falkirk",
    "motherwell fc": "Motherwell",
    "aberdeen fc": "Aberdeen",
    "celtic fc": "Celtic",
    "rangers fc": "Rangers",
    "newcastle": "Newcastle United",
    "leeds": "Leeds United",
    "afc bournemouth": "Bournemouth"
  };
  const key = publicTeamNameKey(name);
  return aliases[key] || byKey[key] || String(name || "").trim();
}

function recalculatePublicTickets() {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  publicState.tickets.forEach((ticket) => {
    ticket.score = 0;
    ticket.gamesPlayed = 0;
    ticket.pointsThisWeek = 0;
    publicState.matches.forEach((match) => {
      if (new Date(match.date) <= new Date(ticket.purchasedAt)) return;
      const teamsInMatch = ticketTeamsInPublicMatch(ticket, match);
      const points = ticket.teams.reduce((total, team) => total + pointsForPublicTeam(team, match), 0);
      if (points > 0 || teamsInMatch.length) {
        ticket.score += points;
        ticket.gamesPlayed += teamsInMatch.length;
        if (new Date(match.date).getTime() >= weekAgo) ticket.pointsThisWeek += points;
      }
    });
  });
}

function ticketTeamsInPublicMatch(ticket, match) {
  const homeTeam = normalisePublicTeamName(match.homeTeam);
  const awayTeam = normalisePublicTeamName(match.awayTeam);
  return ticket.teams.filter((team) => {
    const normalisedTeam = normalisePublicTeamName(team);
    return normalisedTeam === homeTeam || normalisedTeam === awayTeam;
  });
}

function pointsForPublicTeam(team, match) {
  const scoring = publicState.settings.scoring;
  const normalisedTeam = normalisePublicTeamName(team);
  const homeTeam = normalisePublicTeamName(match.homeTeam);
  const awayTeam = normalisePublicTeamName(match.awayTeam);
  if (normalisedTeam !== homeTeam && normalisedTeam !== awayTeam) return 0;
  const goals = normalisedTeam === homeTeam ? match.homeGoals : match.awayGoals;
  const against = normalisedTeam === homeTeam ? match.awayGoals : match.homeGoals;
  if (goals > against) return scoring.win + goals * scoring.goal;
  if (goals === against) return scoring.draw + goals * scoring.goal;
  return goals * scoring.goal;
}

function sortedPublicTickets() {
  return [...publicState.tickets].sort((a, b) => b.score - a.score || b.pointsThisWeek - a.pointsThisWeek || a.ticketNumber.localeCompare(b.ticketNumber));
}

function renderPublicPage() {
  document.getElementById("publicSeasonName").textContent = publicState.settings.seasonName;
  const donate = document.getElementById("publicDonateBtn");
  if (publicState.settings.justGivingUrl) {
    donate.href = publicState.settings.justGivingUrl;
  } else {
    donate.style.display = "none";
  }
  renderPublicMetrics();
  renderPublicLeaderboard();
  renderPublicPrizes();
  renderPublicResults();
  renderPublicTickets();
}

function renderPublicMetrics() {
  const ticketsSold = publicState.tickets.length;
  const raised = ticketsSold * PUBLIC_TICKET_PRICE;
  const totalGoals = publicState.matches.reduce((total, match) => total + Number(match.homeGoals || 0) + Number(match.awayGoals || 0), 0);
  const metrics = [
    ["Tickets sold", ticketsSold],
    ["Total raised", money(raised)],
    ["Charity donation", money(raised * (2 / 3))],
    ["Prize fund", money(raised / 3)],
    ["Matches processed", publicState.matches.length],
    ["Total goals", totalGoals]
  ];
  document.getElementById("publicMetricGrid").innerHTML = metrics.map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join("");
}

function renderPublicLeaderboard() {
  const tickets = sortedPublicTickets();
  document.getElementById("publicTicketCount").textContent = `${tickets.length} tickets`;
  document.getElementById("publicLeaderboard").innerHTML = tickets.slice(0, 30).map((ticket, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(ticket.player)}</td>
      <td>${escapeHtml(ticket.ticketNumber)}</td>
      <td class="teams-cell">${ticket.teams.map(escapeHtml).join(", ")}</td>
      <td><strong>${ticket.score}</strong></td>
      <td>${ticket.gamesPlayed}</td>
    </tr>
  `).join("") || `<tr><td colspan="6">No tickets issued yet.</td></tr>`;
}

function renderPublicPrizes() {
  const prize = publicState.tickets.length * PUBLIC_TICKET_PRICE / 3;
  document.getElementById("publicPrizeList").innerHTML = [
    ["1st Prize", prize * 0.6, "60% of prize fund"],
    ["2nd Prize", prize * 0.25, "25% of prize fund"],
    ["3rd Prize", prize * 0.15, "15% of prize fund"]
  ].map(([label, value, note]) => `<div class="prize-item"><span>${label}<small>${note}</small></span><strong>${money(value)}</strong></div>`).join("");
}

function renderPublicResults() {
  document.getElementById("publicResults").innerHTML = [...publicState.matches]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 8)
    .map((match) => `
      <div class="result-item">
        <span>${escapeHtml(match.homeTeam)} ${match.homeGoals} - ${match.awayGoals} ${escapeHtml(match.awayTeam)}
          <small>${formatDate(match.date)}</small>
        </span>
        <strong>${Number(match.homeGoals) + Number(match.awayGoals)} goals</strong>
      </div>
    `).join("") || `<p>No results processed yet.</p>`;
}

function renderPublicTickets() {
  const query = document.getElementById("publicSearch").value.trim().toLowerCase();
  const rows = sortedPublicTickets().filter((ticket) =>
    `${ticket.player} ${ticket.ticketNumber} ${ticket.teams.join(" ")}`.toLowerCase().includes(query)
  );
  document.getElementById("publicTickets").innerHTML = rows.map((ticket) => `
    <tr>
      <td>${escapeHtml(ticket.ticketNumber)}</td>
      <td>${escapeHtml(ticket.player)}</td>
      <td class="teams-cell">${ticket.teams.map(escapeHtml).join(", ")}</td>
      <td><strong>${ticket.score}</strong></td>
      <td>${ticket.gamesPlayed}</td>
    </tr>
  `).join("") || `<tr><td colspan="5">No tickets match that search.</td></tr>`;
}

function money(value) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
