// Builds the neofetch-style profile card (dist/card-dark.svg, dist/card-light.svg)
// from live GitHub data. Runs in GitHub Actions; no dependencies.
//
//   GITHUB_TOKEN=... GITHUB_USER=abdallahelabd node scripts/build-card.mjs
//   MOCK=1 node scripts/build-card.mjs        # sample data, for local previews

import { mkdirSync, writeFileSync } from "node:fs";

const USER = process.env.GITHUB_USER || "abdallahelabd";
const TOKEN = process.env.GITHUB_TOKEN;
const CODING_SINCE = 2020;
// Below this many contributions in the last year, the stats section is left out.
// Private work only counts once "Include private contributions on my profile" is on.
const MIN_CONTRIBUTIONS_TO_SHOW = 50;

const ART = String.raw`
 .--------------------------------.
 | .----------------------------. |
 | |                            | |
 | |  $ whoami                  | |
 | |  abdallah elabd            | |
 | |                            | |
 | |  $ cat skills.txt          | |
 | |  python  c++  js  solidity | |
 | |  react  firebase  figma    | |
 | |                            | |
 | |  $ ./launch --startup      | |
 | |  [##################] 100% | |
 | |  shipped 5+ startups       | |
 | |                            | |
 | |  $ open abdallah.cv        | |
 | |  $ _                       | |
 | '----------------------------' |
 |                                |
 '--------------------------------'
        \__________________/
    _____\________________/_____
   /____________________________\
`.split("\n").slice(1, -1);

async function graphql(query, variables) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await response.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

async function fetchStats() {
  const { user } = await graphql(
    `query($login: String!) {
      user(login: $login) {
        createdAt
        followers { totalCount }
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks { contributionDays { date contributionCount } }
          }
        }
      }
    }`,
    { login: USER },
  );

  const days = user.contributionsCollection.contributionCalendar.weeks
    .flatMap((week) => week.contributionDays)
    .sort((a, b) => a.date.localeCompare(b.date));

  // All-time total: one query per year since the account was created.
  const firstYear = new Date(user.createdAt).getUTCFullYear();
  const thisYear = new Date().getUTCFullYear();
  let allTime = 0;
  for (let year = firstYear; year <= thisYear; year += 1) {
    const { user: y } = await graphql(
      `query($login: String!, $from: DateTime!, $to: DateTime!) {
        user(login: $login) {
          contributionsCollection(from: $from, to: $to) {
            contributionCalendar { totalContributions }
          }
        }
      }`,
      { login: USER, from: `${year}-01-01T00:00:00Z`, to: `${year}-12-31T23:59:59Z` },
    );
    allTime += y.contributionsCollection.contributionCalendar.totalContributions;
  }

  return summarize(days, {
    yearTotal: user.contributionsCollection.contributionCalendar.totalContributions,
    allTime,
    followers: user.followers.totalCount,
    memberSince: firstYear,
  });
}

function summarize(days, extra) {
  let longest = 0;
  let run = 0;
  for (const day of days) {
    run = day.contributionCount > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  // The current streak survives a quiet "today" (the day is not over yet).
  let current = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    if (days[i].contributionCount > 0) current += 1;
    else if (i === days.length - 1) continue;
    else break;
  }
  const best = days.reduce((top, day) => (day.contributionCount > top.contributionCount ? day : top), days[0]);
  const activeDays = days.filter((day) => day.contributionCount > 0).length;
  return { ...extra, current, longest, bestDay: best?.contributionCount || 0, activeDays };
}

function mockStats() {
  const days = [];
  const start = Date.UTC(2025, 10, 3);
  for (let i = 0; i < 365; i += 1) {
    const date = new Date(start + i * 86400000).toISOString().slice(0, 10);
    days.push({ date, contributionCount: (i * 7) % 5 === 0 ? 0 : (i * 13) % 11 });
  }
  return summarize(days, { yearTotal: Number(process.env.MOCK_TOTAL || 1384), allTime: 4120, followers: 12, memberSince: 2020 });
}

const fmt = (n) => Number(n).toLocaleString("en-US");
const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function rows(stats) {
  const years = new Date().getUTCFullYear() - CODING_SINCE;
  return [
    { kind: "title", text: `${USER}@github` },
    { kind: "rule" },
    { key: "OS", value: "Freelancer, Startup Founder" },
    { key: "Uptime", value: `${years} years (coding since ${CODING_SINCE})` },
    { key: "Host", value: "abdallah.cv" },
    { key: "Kernel", value: "Python, C++, JavaScript" },
    { key: "Shell", value: "React, Firebase, Tailwind CSS" },
    { key: "Contracts", value: "Solidity, Blockchain" },
    { key: "Design", value: "Figma, Photoshop, Illustrator" },
    { key: "Video", value: "Premiere Pro" },
    { key: "Marketing", value: "Facebook Ads, X, Google Ads" },
    { key: "Startups", value: "5+ launched in 3 fields" },
    { key: "Languages.Real", value: "Arabic, English" },
    { kind: "gap" },
    { kind: "section", text: "Contact" },
    { key: "Web", value: "abdallah.cv" },
    { key: "X", value: "@abdallahelabd05" },
    { key: "Chat", value: 'abdallah.cv, then type "chat"' },
    ...(stats.yearTotal >= MIN_CONTRIBUTIONS_TO_SHOW
      ? [
          { kind: "gap" },
          { kind: "section", text: "GitHub Stats" },
          { pair: [["Contributions (1y)", fmt(stats.yearTotal)], ["Active days", fmt(stats.activeDays)]] },
          { pair: [["Current streak", `${stats.current}d`], ["Longest", `${stats.longest}d`]] },
          { pair: [["All-time", fmt(stats.allTime)], ["Best day", fmt(stats.bestDay)]] },
        ]
      : []),
    { kind: "gap" },
    { kind: "palette" },
  ];
}

const THEMES = {
  dark: {
    bg: "#0b1410", border: "#1f3d2c", art: "#22c55e", title: "#bbf7d0", key: "#4ade80",
    value: "#e6edf3", dots: "#2d4a3a", section: "#86efac", muted: "#5b7b69",
  },
  light: {
    bg: "#f6f8fa", border: "#d0d7de", art: "#1a7f37", title: "#0f5323", key: "#116329",
    value: "#1f2328", dots: "#c9d1d9", section: "#1a7f37", muted: "#6e7781",
  },
};

const WIDTH = 60; // characters in the right column
const FONT = 16;
const LINE = 21;
const CHAR = FONT * 0.6;
const LEFT_X = 28;
const RIGHT_X = 420;
const TOP = 46;

function dotted(key, value, width) {
  const dots = Math.max(2, width - key.length - String(value).length - 4);
  return { key: `${key}:`, dots: ` ${".".repeat(dots)} `, value: String(value) };
}

function renderLine(row, t, y) {
  const x = RIGHT_X;
  if (row.kind === "title") {
    return `<text x="${x}" y="${y}" fill="${t.title}" font-weight="700">${xml(row.text)}</text>`;
  }
  if (row.kind === "rule") {
    return `<text x="${x}" y="${y}" fill="${t.dots}">${"—".repeat(WIDTH)}</text>`;
  }
  if (row.kind === "section") {
    const label = `- ${row.text} `;
    return `<text x="${x}" y="${y}"><tspan fill="${t.section}" font-weight="700">${xml(label)}</tspan><tspan fill="${t.dots}">${"—".repeat(WIDTH - label.length)}</tspan></text>`;
  }
  if (row.kind === "palette") {
    const colors = ["#0e4429", "#006d32", "#26a641", "#39d353", "#4ade80", "#86efac", "#bbf7d0", t.value];
    return colors
      .map((c, i) => `<rect x="${x + i * CHAR * 3}" y="${y - FONT + 3}" width="${CHAR * 3}" height="${FONT}" fill="${c}"/>`)
      .join("");
  }
  if (row.kind === "gap") return "";
  const parts = row.pair
    ? row.pair.map(([k, v]) => dotted(k, v, Math.floor((WIDTH - 3) / 2)))
    : [dotted(row.key, row.value, WIDTH)];
  const spans = parts
    .map(
      (p, i) =>
        `${i ? `<tspan fill="${t.dots}"> | </tspan>` : ""}<tspan fill="${t.key}">${xml(p.key)}</tspan><tspan fill="${t.dots}">${xml(p.dots)}</tspan><tspan fill="${t.value}">${xml(p.value)}</tspan>`,
    )
    .join("");
  return `<text x="${x}" y="${y}">${spans}</text>`;
}

function render(stats, theme) {
  const t = THEMES[theme];
  const list = rows(stats);
  const lines = Math.max(list.length, ART.length);
  const height = TOP + lines * LINE + 24;
  const width = RIGHT_X + WIDTH * CHAR + 30;
  const updated = new Date().toISOString().slice(0, 10);

  const art = ART.map(
    (line, i) => `<text x="${LEFT_X}" y="${TOP + 22 + i * LINE}" fill="${t.art}">${xml(line)}</text>`,
  ).join("\n    ");
  const info = list.map((row, i) => renderLine(row, t, TOP + i * LINE)).join("\n    ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width)}" height="${height}" viewBox="0 0 ${Math.round(width)} ${height}" role="img" aria-label="${USER}: freelance programmer and startup founder. ${fmt(stats.yearTotal)} contributions in the last year.">
  <style>
    text { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace; font-size: ${FONT}px; white-space: pre; }
  </style>
  <rect x="0.5" y="0.5" width="${Math.round(width) - 1}" height="${height - 1}" rx="12" fill="${t.bg}" stroke="${t.border}"/>
  <g xml:space="preserve">
    ${art}
    ${info}
  </g>
  <text x="${Math.round(width) - 20}" y="${height - 14}" fill="${t.muted}" font-size="12" text-anchor="end" style="font-size:12px">updated ${updated}</text>
</svg>
`;
}

const stats = process.env.MOCK ? mockStats() : await fetchStats();
mkdirSync("dist", { recursive: true });
writeFileSync("dist/card-dark.svg", render(stats, "dark"));
writeFileSync("dist/card-light.svg", render(stats, "light"));
console.log("Card built:", stats);
