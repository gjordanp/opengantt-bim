# Opengantt BIM

Open-source desktop app (Electron) for construction scheduling: a Gantt chart, line of balance (LOB) and, next, 4D BIM driven by IFC models. MIT licensed.

> Status: early. The Gantt and the line-of-balance view work; scheduling, BIM and persistence are being built (see the roadmap).

## Stack

- Electron + Vite (`electron-vite`) + React + TypeScript
- [`dhtmlx-gantt`](https://www.npmjs.com/package/dhtmlx-gantt) **Community edition** (MIT), installed from npm — no vendored library files
- Data: MongoDB-style documents behind a `ProjectRepository` interface (MongoDB first, see below)
- BIM (planned): `web-ifc` and the That Open components/fragments

The Community edition of the gantt library has no auto-scheduling, critical path, undo/redo, markers or `addTaskLayer`. Those are implemented here instead.

## Develop

```bash
npm install
npm run dev        # Electron window with hot reload
npm run dev:web    # renderer only, in a regular browser (http://localhost:5173)
npm run typecheck
npm test
npm run build
```

## Roadmap

1. **Base + Gantt + LOB** — done: Gantt, ctrl+wheel zoom, line-of-balance view (rows scaled by surface, diagonals per activity).
2. **Persistence** — `ProjectRepository` over MongoDB (connection URI, local `mongod` or Atlas), reached from the renderer through IPC. An embedded file-based document store with Mongo-style queries is a later zero-install option.
3. **Scheduling engine** — pure TypeScript package with tests: dependencies (FS/SS/FF/SF + lag), calendars, constraints, auto-scheduling; critical path and float derive from it.
4. **Undo/redo** — own command stack.
5. **BIM** — open an IFC from disk, convert it in the background, viewer, element search, groups built from searches, assigning groups or single elements to tasks.
6. **Later** — 4D time slider, surfaces from IFC quantities, offline MS Project import/export, installer with auto-update.

## Licenses of dependencies

`dhtmlx-gantt` Community: MIT. `web-ifc`: MPL-2.0. That Open components/fragments: MIT. The MongoDB server (SSPL) is **not** bundled: the app connects to a MongoDB the user provides.
