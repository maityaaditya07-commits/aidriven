# Proofly

Proofly is a local-first React task manager built around explicit task criteria and evidence review. Create a task, submit a screenshot, URL, written response, or code commit reference, and review the submission before marking the task complete.

> **Prototype limitation:** Proofly currently runs entirely in the browser. Its transparent rules check submission format and completeness; they do not prove that work is genuine. There is no AI model, server, account system, cloud sync, or tamper-proof audit trail.

## Requirements

- Node.js 20 or newer
- npm
- A modern browser

## Get started

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. For a production build and local preview:

```sh
npm run build
npm run preview
```

Run the proof-rule tests with:

```sh
npm test
```

## Use the app

1. Select **New task** and enter a title, a specific success criterion, category, due date, and required evidence type.
2. From **My tasks**, select **Submit proof** and attach the required evidence.
3. If the local format checks pass, the task moves to **Review queue**. Passing a check does not mark the task complete.
4. Review the evidence against the success criterion. Approve it to complete the task, or request changes and provide a note.

The primary sections—**Overview**, **My tasks**, and **Review queue**—are available in the navigation. A task can also be created with **⌘K** on macOS or **Ctrl+K** elsewhere.

## Evidence checks

| Evidence | Browser-side check | Not checked |
| --- | --- | --- |
| Written response | Minimum length, distinct meaningful words, and overlap with the task criterion | Whether the described work actually happened |
| Screenshot | PNG, JPEG, GIF, or WebP type, file size, and browser image decoding | Image meaning, authenticity, or relevance |
| URL | HTTPS URL syntax and absence of embedded credentials | Destination availability, ownership, and page contents |
| Code commit | Commit hash or supported GitHub, GitLab, or Bitbucket commit-link format | Repository access, commit existence, and ownership |

## Data and privacy

Tasks and text submissions are stored in this browser's `localStorage`. Image evidence is stored in IndexedDB. Data is local to the browser profile and is not synchronized or backed up. Clearing browser storage removes it. Anyone with access to the profile can change local data, so this prototype is not a security, compliance, or independent verification control.

For the architecture, persistence keys, proof rules, and production considerations, see [documentation.md](./documentation.md).
