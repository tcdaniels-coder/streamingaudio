# Stream Audio Control

A local operator console for reading and adjusting a selected Behringer X32 stream bus, with ATEM Television Studio connection status.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/stream-audio-control run dev` — run the Replit preview (demo mode; it cannot reach local show hardware)
- `pnpm --filter @workspace/stream-audio-control run build` — build the browser console
- `pnpm --filter @workspace/stream-audio-control run local` — serve the built console and local hardware bridge at `http://127.0.0.1:4179`
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/stream-audio-control/src/` — live console, setup, and X32 processing screens
- `artifacts/stream-audio-control/bridge/` — loopback-only local bridge, X32 OSC adapter, and ATEM connection adapter
- `artifacts/stream-audio-control/bridge/README.md` — local installation and connection steps

## Architecture decisions

- Real device communication runs on the operator computer on the same LAN; the Replit-hosted preview cannot access show hardware.
- Use X32 onboard DSP for EQ and compression; the app is a control/monitoring surface, not an audio processor.
- The local bridge binds to loopback and accepts private IPv4 device addresses only; it does not expose control endpoints to the LAN or hosted site.
- ATEM is connection/status only; no switcher settings are changed.

## Product

The console shows X32 and ATEM connection state, stream-bus level/mute, and current X32 bus EQ/compressor settings. The operator can make confirmed changes to the selected bus. Demo mode is clearly marked and never presents simulated values as real device readings.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
