# openganttbim

Installs [Opengantt BIM](https://github.com/gjordanp/opengantt-bim) on Windows with one command:

```bash
npx openganttbim
```

It looks up the latest release on GitHub, downloads the installer, checks its **size and SHA-512** against the
values published in the release (`latest.yml`), and runs it. A corrupt or truncated download is deleted and never run.

Options:

| Option | What it does |
|---|---|
| `--version 0.3.0` | Installs that version instead of the latest |
| `--silent` | Runs the installer without its window (`/S`) |
| `--check` | Only shows which version would be installed |

## What this does not do

- The Opengantt BIM installer is **not code-signed yet**, so Windows may still show its own warning
  ("Windows protected your PC"). This tool does not hide, unblock or work around that warning.
- The hash check detects damaged downloads. It does not protect against a compromised GitHub account,
  since the hash comes from the same release.
- Windows only. Node 18 or newer. No dependencies.

## Develop

```bash
npm test
```

MIT license.
