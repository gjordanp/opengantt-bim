# Opengantt BIM

Open-source desktop app (Electron) for construction scheduling: a Gantt chart, line of balance (LOB) and 4D BIM driven by IFC models. MIT licensed.

## Features

- **Gantt** with its own scheduling engine: dependencies (FS/SS/FF/SF + lag), project calendar, auto-schedule, float and critical path, undo/redo, today line.
- **Line of balance (LOB)** view, with rows scaled by surface.
- **BIM / IFC**: import an IFC file, 3D viewer, element search by class, storey or name, saved groups, assign groups or single elements to tasks, and a **4D construction simulation** that plays the schedule on the model.
- **Projects** stored locally and saved automatically. Converted IFC models are kept with their project.
- **MS Project**: import `.mpp` or MS Project XML as a new project, and export XML that MS Project opens. Not carried over: constraints, resources and costs.
- **Workspace** with dockable panels, a command palette (`Ctrl+K`) and floating BIM tools over the 3D view.
- **Automatic updates** from the GitHub releases of this repository.

The Community edition of the gantt library ([`dhtmlx-gantt`](https://www.npmjs.com/package/dhtmlx-gantt), MIT) has no auto-scheduling, critical path, undo/redo, markers or task layers. Those are implemented here instead.

## Install

Download the latest installer (`Opengantt-BIM-Setup-x.y.z.exe`) from the [Releases](https://github.com/gjordanp/opengantt-bim/releases) page and run it. Windows is the supported platform for now.

The app updates itself: it looks for a new release on start and every few hours, downloads it in the background, and offers to restart to install it.

## Develop

```bash
npm install
npm run dev          # Electron window with hot reload
npm run dev:web      # renderer only, in a regular browser (http://localhost:5173)
npm run typecheck
npm test
npm run build
npm run dist         # installer (downloads the bundled mongod the first time)
```

Publishing a version is described in [docs/RELEASING.md](docs/RELEASING.md).

## Stack

- Electron + Vite (`electron-vite`) + React + TypeScript
- [`dockview`](https://dockview.dev/) for the dockable workspace
- Data: MongoDB-style documents behind a `ProjectRepository` interface, using a private `mongod` that ships with the app
- BIM: `web-ifc` and the That Open components/fragments

## Privacy

Opengantt BIM does not collect or transmit information about you or your projects. Your projects and IFC models stay on your computer. The only network access is the update check, which asks GitHub whether a newer release of this repository exists and downloads it; no personal data is sent besides what any HTTPS request carries (such as your IP address).

## Code signing policy

Free code signing provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

*Signing has not started yet; releases are unsigned until the project is accepted into the SignPath Foundation program.*

Team roles:

- **Author, reviewer and approver:** [Gabriel Jordan](https://github.com/gjordanp)

Releases are built from this repository by the [release workflow](.github/workflows/release.yml) on GitHub-hosted runners, and every signing request is approved manually.

## Licenses of dependencies

`dhtmlx-gantt` Community: MIT. `web-ifc`: MPL-2.0. That Open components/fragments: MIT. `dockview`: MIT. The installer ships an unmodified MongoDB Community Server (SSPL) binary that runs as a separate local process; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
