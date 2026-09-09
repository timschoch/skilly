# tech-tanstack

Official `TanStack/router` skills. They live in `packages/<pkg>/skills/`, not at the repo root, so every source is a tree URL. The skills CLI discovers one level below the URL, so each skill needs its own.

| Skill | Source package | Covers |
| --- | --- | --- |
| `router-core` | `router-core` | Route trees, `createRouter`. Deep reference: data-loading, search-params, path-params, navigation, SSR, auth-and-guards, type-safety, code-splitting, not-found-and-errors |
| `react-router` | `react-router` | React bindings: `RouterProvider`, the hooks, `Link`, `Outlet` |
| `router-query` | `react-router/skills/compositions` | TanStack Router with TanStack Query |
| `react-start` | `react-start` | React bindings for Start: `createStart`, `StartClient`, `StartServer`. Deep reference: server-components |
| `start-core` | `start-client-core` | Entry point for all Start skills: `tanstackStart()` Vite plugin, `getRouter()`, document shell, `routeTree.gen.ts`. Deep reference: server-functions, middleware, server-routes, execution-model, deployment, auth-server-primitives |
| `start-server-core` | `start-server-core` | Server runtime: `createStartHandler`, `getRequest`, `getCookie`, `setCookie`, `useSession`, AsyncLocalStorage |

Six skills, above the 3-4 cap. Only `project-habits` includes this bundle, and TanStack Start is that stack's main dependency, so the client half alone left every server question uncovered. A nested skill folder installs with its parent and is read on demand, so the six cost six description lines.

Left out (2026-09-09):

- `router-plugin` — `tanstackStart()` configures it. Add it for a plain Router app without Start.
- `virtual-file-routes` — routes built in code. Add it only when file-based routes go.
- `migrate-from-nextjs`, `migrate-from-react-router` — one-off migration helpers, add only for an actual migration.
- `bundle-size-optimization` — the only skill at the repo root. It is for work inside the TanStack repo, not for app code.
- `solid-router`, `solid-start`, `vue-router`, `vue-start` — not our stack.
