# TasteTrack simplification audit

Validated September 9, 2026 against the simplified movie/TV application.

## Implementation

The demo now focuses on movie/TV browsing, nested show/season/episode details, people and
production companies, collection, viewing history, and settings. Music, theatre, generic
groups, standalone tags, and the dashboard are removed. See
[ADR 0010](../../docs/adr/0010-tastetrack-demo.md) for the router capability map.

Dexie initializes and resets `taste-track-screen-v2` from the same deterministic seed.
The legacy `taste-track-demo` database remains untouched. Personal state, credits, seasons,
episodes, and journal data use the simplified models.

## Chrome DevTools MCP

Installed `chrome-devtools-mcp` 1.9.0 globally and registered the enabled `chrome-devtools`
stdio server in the user's global Codex configuration. Personal skills were found in
`~/.agents/skills`; built-in skills in `~/.codex/skills/.system`. Neither location is
repository-local.

This conversation did not expose newly registered MCP tools automatically. The audit used
a direct stdio MCP client connected to the installed Chrome DevTools server, invoking its
navigation, evaluation, snapshot, screenshot, console, and network tools. Chrome ran with a
dedicated temporary profile rather than the user's normal browsing profile.

Setup references: [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp)
and [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

## Results

| Check                        | Result                                                                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 80 seeded detail URLs        | All resolve to the expected title/profile: 30 movies, 4 shows, 8 seasons, 32 episodes, 4 people, 2 companies                                         |
| 18 representative route URLs | Browsing, details, nested indexes, profiles, collection, history, settings, root, and fallback render; no console errors/warnings in the route sweep |
| Catalog controls             | Search, all four genre chips, page size, title/year sorting, direction, and pagination update results and URLs                                       |
| Collection controls          | Search, rating, media combinations, status combinations, exact/countless viewing count, sorting, direction, and page size update results and URLs    |
| History controls             | Debounced search, from/to dates, page size, pagination, and date/rating sorting update results and URLs; changing filters resets page 1              |
| Reload and browser history   | Filters restore from deep links and browser back/forward navigation                                                                                  |
| Browser restart              | Rating changed from 6 to 10, an added viewing (2 → 3 entries), and dark theme survive closing/relaunching Chrome and MCP with the same profile       |
| Demo-server restart          | The same rating, three viewings, and theme survive server restart and page navigation                                                                |
| Reset and legacy isolation   | Browser regression test restores original ratings/history, retains theme, and preserves a sentinel in the old database                               |
| Mobile                       | Inspected at 390 × 844: no horizontal overflow; all six navigation destinations remain available                                                     |
| Assets                       | Inspected title artwork loads; no broken images or failed document/artwork requests in the final inspected view                                      |

The DevTools audit caught and corrected the collection select controls displaying defaults
while URL filters were already active. Browser tests also caught ancestor-first active-route
selection and duplicate section navigation; descendants now take precedence and seasons
have their own small navigation component. Bare `/screen` opens movies while retaining its
query parameters.

## Automated validation

- Production library and demo builds pass.
- 65 library unit tests and 5 demo unit tests pass.
- 8 Playwright browser tests pass.
- Consumer type checks pass.
- Changed-file formatting and `git diff --check` pass.

Coverage includes every seeded detail URL and all exposed filter types, not every possible
combination of query values. Validation used local Chrome/Chromium; other browser engines
were not exercised.
