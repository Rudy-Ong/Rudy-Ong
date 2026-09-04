/**
 * GitHub GraphQL access.
 *
 * Token resolution order: PROFILE_TOKEN, then GITHUB_TOKEN.
 * The Actions-issued GITHUB_TOKEN often cannot read another account's
 * contributionsCollection; a user PAT with read:user always can. We prefer the
 * PAT when present and fall back rather than hard-failing.
 *
 * With no token at all we serve deterministic fixture data so the rendering
 * pipeline stays runnable offline. Fixture output is watermarked by the caller
 * so a sample card can never be mistaken for real stats.
 */

const API = 'https://api.github.com/graphql';

export function resolveToken() {
  return process.env.PROFILE_TOKEN || process.env.GITHUB_TOKEN || null;
}

export function hasToken() {
  return Boolean(resolveToken());
}

async function graphql(query, variables) {
  const token = resolveToken();
  if (!token) throw new Error('No GitHub token available');

  const res = await fetch(API, {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'rudy-ong-profile-generator',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} ${res.statusText}: ${await res.text()}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`GraphQL errors: ${json.errors.map((e) => e.message).join('; ')}`);
  }
  return json.data;
}

const PROFILE_QUERY = `
query Profile($login: String!) {
  user(login: $login) {
    name
    login
    followers { totalCount }
    contributionsCollection {
      totalCommitContributions
      restrictedContributionsCount
      totalPullRequestContributions
      totalIssueContributions
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
            weekday
          }
        }
      }
    }
    repositories(first: 100, ownerAffiliations: OWNER, orderBy: {field: UPDATED_AT, direction: DESC}) {
      totalCount
      nodes {
        name
        isFork
        stargazerCount
        primaryLanguage { name }
        languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
          edges { size node { name } }
        }
      }
    }
  }
}`;

/** Fetch everything both generators need in a single round trip. */
export async function fetchProfile(login) {
  const data = await graphql(PROFILE_QUERY, { login });
  if (!data.user) throw new Error(`No such GitHub user: ${login}`);
  return data.user;
}

/**
 * Deterministic stand-in used when no token is present.
 *
 * The calendar is generated from a seeded PRNG rather than random values so
 * repeated local runs produce byte-identical SVGs — otherwise every dev run
 * would show up as a spurious diff.
 */
export function fixtureProfile(login) {
  let seed = 1337;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const weeks = [];
  const start = new Date(Date.UTC(2025, 8, 7));
  for (let w = 0; w < 53; w++) {
    const contributionDays = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + w * 7 + d);
      const weekend = d === 0 || d === 6;
      const roll = rand();
      let count = 0;
      if (roll > (weekend ? 0.75 : 0.42)) count = Math.floor(rand() * 9) + 1;
      contributionDays.push({
        date: date.toISOString().slice(0, 10),
        contributionCount: count,
        weekday: d,
      });
    }
    weeks.push({ contributionDays });
  }

  const total = weeks.flatMap((w) => w.contributionDays).reduce((a, b) => a + b.contributionCount, 0);

  return {
    name: 'RudyO',
    login,
    followers: { totalCount: 2 },
    contributionsCollection: {
      totalCommitContributions: 214,
      restrictedContributionsCount: 96,
      totalPullRequestContributions: 18,
      totalIssueContributions: 7,
      contributionCalendar: { totalContributions: total, weeks },
    },
    repositories: {
      totalCount: 2,
      nodes: [
        {
          name: 'Flash_Card_App',
          isFork: false,
          stargazerCount: 0,
          primaryLanguage: { name: 'JavaScript' },
          languages: {
            edges: [
              { size: 48210, node: { name: 'JavaScript' } },
              { size: 12880, node: { name: 'CSS' } },
              { size: 6120, node: { name: 'HTML' } },
            ],
          },
        },
        {
          name: 'usr2_avsr_lip_reading',
          isFork: true,
          stargazerCount: 0,
          primaryLanguage: { name: 'Python' },
          languages: {
            edges: [
              { size: 191400, node: { name: 'Python' } },
              { size: 8300, node: { name: 'Shell' } },
            ],
          },
        },
      ],
    },
  };
}

/**
 * Get profile data, falling back to fixtures offline.
 * Returns { user, isFixture } so callers can watermark sample output.
 */
export async function loadProfile(login) {
  if (!hasToken()) {
    console.warn('[github] No PROFILE_TOKEN/GITHUB_TOKEN set — using fixture data.');
    return { user: fixtureProfile(login), isFixture: true };
  }
  try {
    return { user: await fetchProfile(login), isFixture: false };
  } catch (err) {
    // In CI a failure must be loud: silently shipping fixture data to a live
    // profile would be worse than a red build.
    if (process.env.CI) throw err;
    console.warn(`[github] Fetch failed (${err.message}) — falling back to fixture data.`);
    return { user: fixtureProfile(login), isFixture: true };
  }
}

/** Flatten the calendar into a 53x7 grid of contribution levels (0-4). */
export function toLevelGrid(calendar) {
  const weeks = calendar.weeks.map((week) => {
    const column = new Array(7).fill(null);
    for (const day of week.contributionDays) column[day.weekday] = day;
    return column;
  });

  const counts = weeks.flat().filter(Boolean).map((d) => d.contributionCount).filter((c) => c > 0);
  const max = counts.length ? Math.max(...counts) : 0;

  // Quartile thresholds over non-zero days, matching how GitHub buckets its own
  // graph. A flat threshold (1/3/6/9) makes a quiet year look entirely empty.
  const level = (count) => {
    if (count <= 0) return 0;
    if (max <= 1) return 1;
    const ratio = count / max;
    if (ratio <= 0.25) return 1;
    if (ratio <= 0.5) return 2;
    if (ratio <= 0.75) return 3;
    return 4;
  };

  return weeks.map((week) =>
    week.map((day) =>
      day ? { date: day.date, count: day.contributionCount, level: level(day.contributionCount) } : null,
    ),
  );
}
