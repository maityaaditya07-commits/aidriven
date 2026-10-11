# Proofly documentation

## Overview

Proofly is a single-page React application built with Vite. It helps a user define a task, provide a specific completion criterion, attach the required kind of evidence, and review that evidence before changing the task to completed.

The current application is a client-side prototype. Its rules are intentionally transparent, and passing them means only that an evidence submission passed local format or completeness checks. It is not an AI service and does not independently verify claims.

## Requirements and commands

Use Node.js 20 or newer and npm.

| Command | Purpose |
| --- | --- |
| `npm install` | Install project dependencies |
| `npm run dev` | Start the Vite development server |
| `npm test` | Run the proof-rule unit tests |
| `npm run build` | Generate the production build in `dist/` |
| `npm run preview` | Preview the production build locally |

## User workflow

### Create a task

Choose **New task**. A task includes:

- A required title.
- Optional description.
- Required success criteria describing an observable result.
- Category: Personal, Work, Learning, or Health.
- Due date.
- Required evidence type: Screenshot, URL, Written response, or Code commit.

The form explains the minimum success-criteria length. Browser form validation prevents submission when required fields are missing or invalid.

### Submit evidence

Choose **Submit proof** from an in-progress task. The submission form changes to match the required evidence type. A submission that fails a local rule displays a specific explanation and a small accountability challenge. The user can correct the submission and retry.

A passing format check saves a submission and moves the task to **Needs your review**. A passing check never directly completes a task.

### Review a submission

Open **Review queue**, **Review proof**, or a recent submission. The review view shows:

- The task's success criteria.
- The submitted text, image, or link.
- Checks performed by the local verifier.
- Any explicit limitations of those checks.

To approve, the user checks a confirmation that they personally compared the evidence with the criteria, then chooses **Approve & complete**. To reject, the user supplies a useful change request. The task returns to progress and the submission retains the review note.

### Navigation and filtering

The main sections are **Overview**, **My tasks**, and **Review queue**. At narrower screen widths, those same labeled destinations move into a bottom navigation bar. Tasks can be filtered by all, in-progress, needs-review, or completed status. Use **⌘K** on macOS or **Ctrl+K** to open the task form.

## Evidence rule reference

The rules are implemented in `src/proof.js` and tested in `src/proof.test.js`.

### Written response

- Requires at least 80 characters.
- Requires at least 8 distinct meaningful words after filtering common stop words.
- When the task contains criteria, requires overlap with at least one meaningful criteria term.
- A pass moves the task to review; it does not establish that the written claim is true.

### Screenshot

- Accepts PNG, JPEG, GIF, or WebP.
- Requires a non-empty file no larger than 10 MB.
- Uses the browser's image decoder to check that the file decodes and has valid dimensions no greater than 40 megapixels.
- Does not analyze the image's meaning, authenticity, or relation to the task.

### URL

- Requires an HTTPS URL with a public-looking hostname and no embedded username or password.
- Does not make a network request. Page availability, content, ownership, and relevance are not checked.

### Code commit

- Accepts a 7–40 character hexadecimal commit hash, or a direct commit URL matching a supported GitHub, GitLab, or Bitbucket URL shape.
- Does not query a source-control provider. Repository and commit existence, access, and ownership are not checked.

## Persistence and migration

Task and submission JSON is stored under these `localStorage` keys:

- `proofly:v2:tasks`
- `proofly:v2:proofs`

The legacy task key `proofly-tasks` is read when the current keys are absent. Older tasks are retained. Older "done" statuses are reopened because their previous format-only checks did not establish that evidence had been reviewed. Legacy proof entries are not migrated.

Screenshot blobs are stored in IndexedDB database `proofly-evidence`, object store `uploads`, keyed by the submission ID. If IndexedDB is unavailable or the write fails, the submission reports the save error instead of pretending it succeeded.

Browser storage can be edited, cleared, or lost. Data is not synced, backed up, encrypted by this app, or shared with another device. It is not suitable for high-value evidence or audit requirements.

## Project structure

| Path | Responsibility |
| --- | --- |
| `src/main.jsx` | React application entry point |
| `src/App.jsx` | Navigation, task creation, submission, review, and application state |
| `src/proof.js` | Deterministic local evidence format and completeness rules |
| `src/storage.js` | IndexedDB persistence for screenshot blobs |
| `src/proof.test.js` | Unit tests for proof rules |
| `src/index.css` | Responsive application and component styles |
| `index.html` | Vite document shell and page metadata |

## Tests and quality checks

Run `npm test` and `npm run build` before release. The tests cover HTTPS URL handling, commit URL shapes, text detail and criteria matching, image type/size restrictions, image decode checks, and the explicit non-verification limitation.

The application should also be manually checked at desktop and narrow mobile viewport sizes, including task creation, every evidence input, invalid submissions, review confirmation, change requests, persistence after reload, and storage errors.

## Production readiness

This prototype has no server, accounts, authentication, authorization, multi-user collaboration, cloud backup, provider APIs, or tamper-evident audit trail. Before relying on it to make consequential completion decisions:

1. Add a trusted backend and database. Authenticate users and authorize every task, evidence, and review operation server-side.
2. Store provider credentials only on the backend. Never place AI or source-control API secrets in frontend code.
3. Upload evidence to controlled object storage. Validate actual file contents, impose request and decompressed-image limits, scan uploads as appropriate, and define deletion and retention rules.
4. Record append-only submission and reviewer events if an audit trail is required.
5. Integrate appropriate text, image, web, and source-control providers. Treat timeouts, inaccessible sources, low confidence, and conflicting results as **needs human review**, not as approval.
6. Clearly distinguish a model's assessment from a user's decision. Keep the human review route for uncertain cases and provider failures.
7. Build an appropriately consented, representative, privacy-reviewed labeled dataset before training or evaluating a model. Do not infer accuracy from synthetic labels or a parameter count.
