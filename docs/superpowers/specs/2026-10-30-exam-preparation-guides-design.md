# Exam Preparation Guides Design

## Intent

Render published exam-preparation guides on each level's existing `Unsere Tipps` page and provide a readable guide detail page with view and like interactions.

## Scope

- Use the existing read-only guide API, detail view counter, and per-user like relation.
- List only guides whose TELC level badge matches the active B1, B2, or C1 HS route.
- Render one vertical card per guide: site icon and author, cover, badges, title, summary, views/likes, and publication date.
- Open a dedicated detail route with title, cover, summary, Markdown body, metrics, and a toggleable like button.
- Animate only the transition from unliked to liked; unlike has no celebration animation.
- Keep desktop, tablet, and mobile layouts usable.

## Approach

Use a dedicated guide API module, two focused pages, and `react-markdown` with `remark-gfm` for safe Markdown and table rendering. Keep the existing backend counters and like endpoint as the source of truth. The site icon is `/images/icon.jpeg` and stored media URLs remain nginx-proxied `/resources/...` paths.

## Non-goals

- No server deployment in this task.
- No browser-based visual verification unless explicitly requested.
- No guide editing UI.
