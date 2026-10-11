import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Code2,
  FileImage,
  FileText,
  Globe2,
  LayoutDashboard,
  Link2,
  ListTodo,
  LockKeyhole,
  MessageSquareText,
  Plus,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import { evaluateProof } from './proof.js';
import { loadEvidenceBlob, saveEvidenceBlob } from './storage.js';

const TASKS_KEY = 'proofly:v2:tasks';
const PROOFS_KEY = 'proofly:v2:proofs';
const LEGACY_TASKS_KEY = 'proofly-tasks';

const evidenceTypes = {
  screenshot: { label: 'Screenshot', icon: FileImage },
  url: { label: 'URL', icon: Link2 },
  text: { label: 'Written response', icon: FileText },
  commit: { label: 'Code commit', icon: Code2 },
};

function currentDateInput() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

function createId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readJson(key) {
  const raw = localStorage.getItem(key);
  return raw === null ? null : JSON.parse(raw);
}

function loadInitialState() {
  try {
    const currentTasks = readJson(TASKS_KEY);
    const currentProofs = readJson(PROOFS_KEY);
    if (currentTasks !== null || currentProofs !== null) {
      if ((currentTasks !== null && !Array.isArray(currentTasks)) || (currentProofs !== null && !Array.isArray(currentProofs))) {
        throw new Error('Saved task data is not in the expected format.');
      }
      return {
        tasks: currentTasks || [],
        proofs: currentProofs || [],
        message: '',
      };
    }

    const legacyTasks = readJson(LEGACY_TASKS_KEY);
    if (Array.isArray(legacyTasks) && legacyTasks.length) {
      const hadUnverifiedCompletions = legacyTasks.some((task) => task.status === 'done');
      return {
        tasks: legacyTasks.map((task) => {
          const savedTask = { ...task };
          delete savedTask.lastProofId;
          delete savedTask.completedAt;
          return {
            ...savedTask,
            status: task.status === 'done' ? 'in-progress' : task.status,
            successCriteria: task.successCriteria || task.detail || '',
          };
        }),
        proofs: [],
        message: hadUnverifiedCompletions
          ? 'Older tasks were kept, but previous “verified” marks were reopened: those checks only validated formats and did not inspect proof.'
          : 'Your saved tasks were moved to the current local format.',
      };
    }

    return { tasks: [], proofs: [], message: '' };
  } catch (error) {
    return {
      tasks: [],
      proofs: [],
      message: `Saved data could not be read: ${error.message} You can keep working, but do not clear browser storage until you have recovered it.`,
    };
  }
}

function formatDate(date) {
  if (!date) return 'No due date';
  const today = currentDateInput();
  const tomorrow = new Date(`${today}T12:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(`${today}T12:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  const dateValue = new Date(`${date}T12:00:00`);
  if (Number.isNaN(dateValue.getTime())) return 'Invalid date';
  if (date === today) return 'Today';
  if (dateValue.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  if (dateValue.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(dateValue);
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? 'Unknown time'
    : new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function Sidebar({ page, setPage, openNewTask, activeCount, reviewCount }) {
  return (
    <aside className="sidebar">
      <a className="brand" href="#" onClick={(event) => event.preventDefault()} aria-label="Proofly home">
        <span className="brand-icon"><Check size={19} strokeWidth={3} /></span>
        <span>proofly<span className="brand-period">.</span></span>
      </a>
      <div className="workspace-switch">
        <span className="workspace-avatar">L</span>
        <span className="workspace-name">This device<small>Local workspace</small></span>
        <ChevronDown size={15} />
      </div>
      <div className="side-label">WORKSPACE</div>
      <nav className="side-nav" aria-label="Main navigation">
        <button className={`side-link ${page === 'overview' ? 'selected' : ''}`} aria-current={page === 'overview' ? 'page' : undefined} onClick={() => setPage('overview')}>
          <LayoutDashboard size={18} /> Overview
        </button>
        <button className={`side-link ${page === 'tasks' ? 'selected' : ''}`} aria-current={page === 'tasks' ? 'page' : undefined} onClick={() => setPage('tasks')}>
          <ListTodo size={18} /> My tasks <span className="nav-count">{activeCount}</span>
        </button>
        <button className={`side-link ${page === 'review' ? 'selected' : ''}`} aria-current={page === 'review' ? 'page' : undefined} onClick={() => setPage('review')}>
          <ShieldCheck size={18} /> Review queue <span className="nav-count">{reviewCount}</span>
        </button>
      </nav>
      <button className="new-task-side" onClick={openNewTask}><Plus size={16} /> New task <span>⌘ K</span></button>
      <div className="sidebar-bottom">
        <div className="accountability-card">
          <span className="tiny-sparkle"><Sparkles size={14} /></span>
          <p>A friendly nudge, not a verdict.</p>
          <span>Rules check the submission. You review whether the work is real.</span>
          <button onClick={() => setPage('review')}>Open review queue <ArrowRight size={13} /></button>
        </div>
        <div className="local-profile"><LockKeyhole size={15} /><span>Saved in this browser<small>No account or cloud sync</small></span></div>
      </div>
    </aside>
  );
}

function Topbar({ page, onAdd }) {
  const date = new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date());
  const pageNames = { overview: 'Overview', tasks: 'My tasks', review: 'Review queue' };
  return (
    <header className="topbar">
      <div className="breadcrumb">Workspace <ChevronRight size={14} /> <span>{pageNames[page]}</span></div>
      <div className="topbar-actions">
        <span className="today-chip"><CalendarDays size={15} /> {date}</span>
        <button className="button button-primary top-add" onClick={onAdd}><Plus size={17} /> New task</button>
      </div>
    </header>
  );
}

function StatCard({ label, value, sub, icon: Icon, iconClass }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${iconClass}`}><Icon size={19} /></div>
      <div className="stat-heading">{label}</div>
      <div className="stat-value">{value.toString().padStart(2, '0')}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  );
}

function TaskRow({ task, proof, onSubmit, onReview }) {
  const meta = evidenceTypes[task.evidence] || evidenceTypes.text;
  const EvidenceIcon = meta.icon;
  const statusLabel = {
    'in-progress': 'In progress',
    'needs-review': 'Needs your review',
    done: 'Completed · self-reviewed',
  }[task.status] || 'In progress';

  return (
    <article className={`task-row task-${task.status}`}>
      <div className={`task-check ${task.status === 'done' ? 'checked' : task.status === 'needs-review' ? 'review-check' : ''}`} aria-hidden="true">
        {task.status === 'done' ? <Check size={13} strokeWidth={3} /> : task.status === 'needs-review' ? <Clock3 size={12} /> : null}
      </div>
      <div className={`task-emoji ${task.tint || 'lilac'}`}>{task.category === 'Work' ? '⌘' : task.category === 'Health' ? '♡' : task.category === 'Learning' ? '✳' : '☼'}</div>
      <div className="task-copy">
        <h3>{task.title}</h3>
        <p>{task.detail}</p>
        <div className="task-meta">
          <span className={`category-pill ${(task.category || 'Personal').toLowerCase()}`}>{task.category || 'Personal'}</span>
          <span className="task-proof"><EvidenceIcon size={13} /> {meta.label}</span>
          <span className={`status-label status-${task.status}`}>{statusLabel}</span>
        </div>
        <p className="criteria-line"><strong>Done means:</strong> {task.successCriteria || 'Review the submitted evidence against your task.'}</p>
      </div>
      <div className="task-due"><span>{formatDate(task.dueDate)}</span><small>{task.status === 'done' ? 'Reviewed' : 'Due date'}</small></div>
      {task.status === 'in-progress' && <button className="prove-button" onClick={() => onSubmit(task)}>Submit proof <ArrowRight size={14} /></button>}
      {task.status === 'needs-review' && proof && <button className="review-button" onClick={() => onReview(proof)}>Review proof <ArrowRight size={14} /></button>}
      {task.status === 'done' && proof && <button className="done-button" onClick={() => onReview(proof)}><BadgeCheck size={14} /> View decision</button>}
    </article>
  );
}

function PolicyCard() {
  return (
    <section className="policy-card">
      <div className="policy-heading"><div className="policy-icon"><ShieldCheck size={17} /></div><div><span className="eyebrow">HOW REVIEW WORKS</span><h2>No pretend AI.</h2></div></div>
      <p>This prototype checks whether a submission is present and well-formed. It cannot know whether you actually did the work.</p>
      <ul>
        <li><CheckCircle2 size={14} /> <span>Text: detail and criteria-keyword checks</span></li>
        <li><CheckCircle2 size={14} /> <span>Images: file type, size, and decode check</span></li>
        <li><CheckCircle2 size={14} /> <span>Links / commits: format checks only</span></li>
      </ul>
      <div className="policy-foot"><LockKeyhole size={13} /> Final decision stays with you. Local-only storage is not tamper-proof.</div>
    </section>
  );
}

function ActivityPanel({ proofs, onReview }) {
  return (
    <section className="activity-card">
      <div className="section-title"><h2>Recent submissions</h2></div>
      {proofs.length === 0
        ? <p className="empty-activity">Submissions will appear here after you attach proof to a task.</p>
        : proofs.slice(0, 5).map((proof) => (
          <button className="activity-item" key={proof.id} onClick={() => onReview(proof)}>
            <div className={`activity-icon activity-${proof.status}`}>
              {proof.status === 'approved' ? <CheckCircle2 size={17} /> : proof.status === 'rejected' ? <MessageSquareText size={17} /> : <Clock3 size={17} />}
            </div>
            <span className="activity-copy"><strong>{proof.title}</strong><span>{proof.type} · {formatTimestamp(proof.submittedAt)}</span></span>
            <span className={`activity-status ${proof.status}`}>{proof.status === 'approved' ? 'Self-reviewed' : proof.status === 'rejected' ? 'Changes requested' : 'Review'}</span>
          </button>
        ))}
    </section>
  );
}

function TaskForm({ onClose, onCreate }) {
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [successCriteria, setSuccessCriteria] = useState('');
  const [category, setCategory] = useState('Personal');
  const [dueDate, setDueDate] = useState(currentDateInput);
  const [evidence, setEvidence] = useState('text');

  function submit(event) {
    event.preventDefault();
    if (!title.trim() || !successCriteria.trim()) return;
    onCreate({
      id: createId(),
      title: title.trim(),
      detail: detail.trim(),
      successCriteria: successCriteria.trim(),
      category,
      dueDate,
      evidence,
      status: 'in-progress',
      createdAt: new Date().toISOString(),
    });
    onClose();
  }

  return (
    <ModalShell title="Create a task" onClose={onClose} className="new-task-modal">
      <div className="modal-eyebrow"><span className="review-spark"><Target size={14} /></span> MAKE A CLEAR PLAN</div>
      <h2 id="modal-title">One thing at a time.</h2>
      <p className="modal-intro">Set a clear finish line first. Better criteria make evidence easier to review.</p>
      <form onSubmit={submit}>
        <label className="field-label">Task title
          <input className="plain-input" required autoFocus maxLength={100} placeholder="e.g. Read 20 pages of my book" value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="field-label">Description <span className="optional-label">OPTIONAL</span>
          <textarea rows="2" maxLength="300" placeholder="Add context or a small reminder" value={detail} onChange={(event) => setDetail(event.target.value)} />
        </label>
        <label className="field-label">What specifically counts as done?
          <textarea rows="2" required minLength="8" maxLength="300" placeholder="e.g. Read at least 20 pages and note one useful idea" value={successCriteria} onChange={(event) => setSuccessCriteria(event.target.value)} />
          <span className="field-help">Describe an observable result in at least 8 characters. {successCriteria.trim().length}/8</span>
        </label>
        <div className="form-two-column">
          <label className="field-label">Category
            <span className="select-wrap"><select value={category} onChange={(event) => setCategory(event.target.value)}><option>Personal</option><option>Work</option><option>Learning</option><option>Health</option></select><ChevronDown size={14} /></span>
          </label>
          <label className="field-label">Due date
            <input className="plain-input" type="date" min={currentDateInput()} required value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </label>
        </div>
        <fieldset className="evidence-fieldset">
          <legend>Required evidence type</legend>
          <div className="evidence-options">
            {Object.entries(evidenceTypes).map(([key, item]) => {
              const Icon = item.icon;
              return (
                <button type="button" key={key} aria-pressed={evidence === key} className={`evidence-option ${evidence === key ? 'evidence-option-selected' : ''}`} onClick={() => setEvidence(key)}>
                  <Icon size={17} /><span>{item.label}</span>{evidence === key && <Check size={14} />}
                </button>
              );
            })}
          </div>
        </fieldset>
        <p className="form-required-note">Title, success criteria, and due date are required. A short criterion will show a helpful browser message.</p>
        <div className="modal-footer"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary"><Plus size={16} /> Create task</button></div>
      </form>
    </ModalShell>
  );
}

function ModalShell({ title, onClose, className = '', children }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`modal ${className}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <button className="modal-close" onClick={onClose} aria-label={`Close ${title}`}><X size={19} /></button>
        {children}
      </section>
    </div>
  );
}

function ProofModal({ task, onClose, onSubmit }) {
  const [value, setValue] = useState('');
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef(null);
  const meta = evidenceTypes[task.evidence];
  const EvidenceIcon = meta.icon;
  const previewUrl = useMemo(() => file ? URL.createObjectURL(file) : '', [file]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const assessment = await evaluateProof(task, value, file);
      setResult(assessment);
      if (assessment.accepted) await onSubmit({
        id: createId(),
        taskId: task.id,
        title: task.title,
        type: meta.label,
        evidence: task.evidence,
        content: task.evidence === 'screenshot' ? '' : value.trim(),
        fileName: file?.name || '',
        submittedAt: new Date().toISOString(),
        status: 'needs-review',
        assessment,
      }, file);
    } catch (submitError) {
      setError(`Could not save this submission: ${submitError.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Submit proof" onClose={onClose} className="proof-modal">
      <div className="modal-eyebrow"><span className="review-spark"><Sparkles size={14} /></span> SUBMIT EVIDENCE <span className="demo-badge">RULES ONLY</span></div>
      <h2 id="modal-title">Show what you worked on.</h2>
      <p className="modal-intro">A format check can catch missing pieces. It cannot verify the work. You will review the evidence before completion.</p>
      <div className="proof-task-card">
        <div className={`task-emoji ${task.tint || 'lilac'}`}>{task.category === 'Work' ? '⌘' : task.category === 'Health' ? '♡' : task.category === 'Learning' ? '✳' : '☼'}</div>
        <div><span>SUCCESS CRITERIA</span><strong>{task.successCriteria}</strong></div>
      </div>
      <div className="proof-type-heading"><span>YOUR REQUIRED PROOF</span><span className="proof-type-chip"><EvidenceIcon size={13} /> {meta.label}</span></div>
      <form onSubmit={submit}>
        {task.evidence === 'screenshot' && (
          <div className={`upload-area ${file ? 'has-file' : ''}`} onClick={() => fileInput.current?.click()}>
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(event) => { setFile(event.target.files?.[0] || null); setResult(null); }} />
            {file
              ? <><img className="image-preview" src={previewUrl} alt="Selected evidence preview" /><div className="upload-filename">{file.name}<small>{(file.size / 1024).toFixed(0)} KB · Click to change</small></div></>
              : <><div className="upload-icon"><FileImage size={21} /></div><strong>Choose a screenshot or photo</strong><span>PNG, JPEG, GIF, or WebP · up to 10 MB</span></>}
          </div>
        )}
        {task.evidence === 'url' && <label className="field-label">HTTPS link<div className="input-with-icon"><Globe2 size={17} /><input type="text" inputMode="url" placeholder="https://example.com/your-work" value={value} onChange={(event) => { setValue(event.target.value); setResult(null); }} /></div></label>}
        {task.evidence === 'commit' && <label className="field-label">Commit hash or direct commit URL<div className="input-with-icon"><Code2 size={17} /><input type="text" placeholder="7–40 character hash or commit page URL" value={value} onChange={(event) => { setValue(event.target.value); setResult(null); }} /></div></label>}
        {task.evidence === 'text' && <label className="field-label">Describe what you completed<textarea rows="4" maxLength="1500" placeholder="What did you do? What result can be checked against the success criteria?" value={value} onChange={(event) => { setValue(event.target.value); setResult(null); }} /><span className="character-count">{value.length} / 1,500 characters · minimum 80</span></label>}
        {result && <Assessment result={result} />}
        {error && <div className="inline-error" role="alert">{error}</div>}
        <div className="verification-disclaimer"><ShieldCheck size={15} /><span>All passing submissions go to your review queue. No AI, network checks, or automatic approvals run here.</span></div>
        <div className="modal-footer"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary" disabled={busy}><Sparkles size={15} /> {busy ? 'Checking…' : result?.accepted ? 'Submit for my review' : 'Check submission'} <ArrowRight size={15} /></button></div>
      </form>
    </ModalShell>
  );
}

function Assessment({ result }) {
  return (
    <div className={`assessment ${result.accepted ? 'assessment-good' : 'assessment-bad'}`} role="status">
      <div className="assessment-title">
        {result.accepted ? <><Clock3 size={17} /> Format checks passed · review still required</> : <><MessageSquareText size={17} /> A friendly little reality check</>}
      </div>
      <p>{result.summary}</p>
      <ul>{result.checks.map((check) => <li key={check}>{check}</li>)}</ul>
      {result.accepted
        ? <p className="assessment-limitation">{result.limitation}</p>
        : <div className="challenge-card"><span>YOUR TINY ACCOUNTABILITY CHALLENGE</span><p>{result.challenge}</p></div>}
    </div>
  );
}

function ReviewModal({ proof, onClose, onApprove, onReject }) {
  const [imageUrl, setImageUrl] = useState('');
  const [approvalConfirmed, setApprovalConfirmed] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [imageError, setImageError] = useState('');
  const approved = proof.status === 'approved';
  const rejected = proof.status === 'rejected';

  useEffect(() => {
    let objectUrl = '';
    let cancelled = false;
    if (proof.evidence === 'screenshot') {
      loadEvidenceBlob(proof.id).then((blob) => {
        if (!blob) throw new Error('The image is no longer available in local browser storage.');
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setImageUrl(objectUrl);
      }).catch((error) => {
        if (!cancelled) setImageError(error.message);
      });
    }
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [proof]);

  function reject(event) {
    event.preventDefault();
    onReject(proof, rejectionReason.trim());
  }

  const safeLink = (proof.evidence === 'url' || proof.evidence === 'commit')
    && proof.content
    && (() => { try { return new URL(proof.content).protocol === 'https:'; } catch { return false; } })();

  return (
    <ModalShell title="Review submitted proof" onClose={onClose} className="review-modal">
      <div className="modal-eyebrow"><span className="review-spark"><ShieldCheck size={14} /></span> HUMAN REVIEW</div>
      <h2 id="modal-title">{approved ? 'Your review decision' : rejected ? 'Requested changes' : 'Does this meet the finish line?'}</h2>
      <p className="modal-intro">{proof.title} · Submitted {formatTimestamp(proof.submittedAt)}</p>
      <div className="review-criteria"><span>SUCCESS CRITERIA</span><p>{proof.successCriteria || 'Review the task criteria before deciding.'}</p></div>
      <div className="submitted-proof">
        <div className="proof-content-heading"><span>SUBMITTED {proof.type.toUpperCase()}</span><span className={`activity-status ${proof.status}`}>{approved ? 'Approved by you' : rejected ? 'Changes requested' : 'Awaiting your review'}</span></div>
        {proof.evidence === 'screenshot' && (imageUrl
          ? <img className="review-image" src={imageUrl} alt={`Proof submitted for ${proof.title}`} />
          : <p className={imageError ? 'inline-error' : 'loading-note'}>{imageError || 'Loading saved image…'}</p>)}
        {proof.content && safeLink && <a className="submitted-link" href={proof.content} target="_blank" rel="noopener noreferrer">{proof.content}<ArrowRight size={14} /></a>}
        {proof.content && !safeLink && <pre className="submitted-text">{proof.content}</pre>}
        {proof.assessment?.checks?.length > 0 && <ul className="review-checks">{proof.assessment.checks.map((check) => <li key={check}>{check}</li>)}</ul>}
        {proof.assessment?.limitation && <p className="assessment-limitation">{proof.assessment.limitation}</p>}
        {rejected && <div className="challenge-card"><span>THE FRIENDLY NUDGE</span><p>{proof.reviewNote || 'A few changes were requested. The task is back in progress.'}</p></div>}
      </div>
      {!approved && !rejected && (
        <>
          <label className="review-confirm"><input type="checkbox" checked={approvalConfirmed} onChange={(event) => setApprovalConfirmed(event.target.checked)} /><span>I checked the submitted evidence against the success criteria. This is my own review, not an AI verification.</span></label>
          {showReject && <form className="reject-form" onSubmit={reject}>
            <label className="field-label">What should change before you resubmit?
              <textarea required minLength="8" maxLength="300" rows="2" placeholder="Be specific — future you deserves useful feedback." value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} />
            </label>
            <button className="button button-warn" type="submit" disabled={rejectionReason.trim().length < 8}>Request changes</button>
          </form>}
          <div className="modal-footer review-actions">
            {!showReject && <button className="button button-warn" onClick={() => setShowReject(true)}>Request changes</button>}
            <button className="button button-quiet" onClick={onClose}>Decide later</button>
            <button className="button button-primary" disabled={!approvalConfirmed} onClick={() => onApprove(proof)}>Approve &amp; complete</button>
          </div>
        </>
      )}
      {(approved || rejected) && <div className="modal-footer"><button className="button button-quiet" onClick={onClose}>Close</button></div>}
    </ModalShell>
  );
}

function EmptyState({ page, onAdd }) {
  const isReview = page === 'review';
  return (
    <div className="empty-tasks">
      <span>{isReview ? '✓' : '✳'}</span>
      <strong>{isReview ? 'Nothing waiting for review.' : 'A clean slate. A suspiciously good opportunity.'}</strong>
      <p>{isReview ? 'Proof submissions that pass basic format checks will show up here.' : 'Create a task with a clear success criterion and a proof type. You can decide what counts as done.'}</p>
      {!isReview && <button className="button button-primary" onClick={onAdd}><Plus size={16} /> Create your first task</button>}
    </div>
  );
}

export default function App() {
  const [initialState] = useState(loadInitialState);
  const [tasks, setTasks] = useState(initialState.tasks);
  const [proofs, setProofs] = useState(initialState.proofs);
  const [page, setPage] = useState('overview');
  const [filter, setFilter] = useState('all');
  const [activeTask, setActiveTask] = useState(null);
  const [activeProof, setActiveProof] = useState(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [toast, setToast] = useState('');
  const [storageWarning, setStorageWarning] = useState(initialState.message);
  const canPersist = !initialState.message.startsWith('Saved data could not be read:');

  useEffect(() => {
    if (!canPersist) return;
    try {
      localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
      localStorage.setItem(PROOFS_KEY, JSON.stringify(proofs));
    } catch (error) {
      setStorageWarning(`Changes could not be saved in this browser: ${error.message}`);
    }
  }, [canPersist, tasks, proofs]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setShowNewTask(true);
      }
      if (event.key === 'Escape') {
        setActiveTask(null);
        setActiveProof(null);
        setShowNewTask(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const activeCount = tasks.filter((task) => task.status === 'in-progress').length;
  const reviewCount = proofs.filter((proof) => proof.status === 'needs-review').length;
  const completedCount = tasks.filter((task) => task.status === 'done').length;
  const filteredTasks = useMemo(() => {
    let list = tasks;
    if (page === 'review') list = list.filter((task) => task.status === 'needs-review');
    else if (page === 'overview') list = list.filter((task) => task.status !== 'done');
    if (filter === 'active') list = list.filter((task) => task.status === 'in-progress');
    if (filter === 'review') list = list.filter((task) => task.status === 'needs-review');
    if (filter === 'completed') list = list.filter((task) => task.status === 'done');
    return list;
  }, [filter, page, tasks]);

  async function submitProof(proof, file) {
    if (file) await saveEvidenceBlob(proof.id, file);
    const task = tasks.find((item) => item.id === proof.taskId);
    if (!task) throw new Error('This task no longer exists. Refresh and try again.');
    proof.successCriteria = task.successCriteria;
    setTasks((current) => current.map((item) => item.id === proof.taskId
      ? { ...item, status: 'needs-review', lastProofId: proof.id }
      : item));
    setProofs((current) => [proof, ...current.filter((item) => item.taskId !== proof.taskId || item.status !== 'needs-review')]);
    setActiveTask(null);
    setPage('review');
    setFilter('all');
    setToast('Proof submitted. It has not been verified; review it against your success criteria before completing the task.');
  }

  function approveProof(proof) {
    setTasks((current) => current.map((task) => task.id === proof.taskId
      ? { ...task, status: 'done', completedAt: new Date().toISOString(), lastProofId: proof.id }
      : task));
    setProofs((current) => current.map((item) => item.id === proof.id
      ? { ...item, status: 'approved', reviewedAt: new Date().toISOString(), reviewNote: '' }
      : item));
    setActiveProof(null);
    setToast('You reviewed the evidence and completed the task. This was a personal decision, not an independent verification.');
  }

  function rejectProof(proof, reason) {
    setTasks((current) => current.map((task) => task.id === proof.taskId
      ? { ...task, status: 'in-progress', lastProofId: null }
      : task));
    setProofs((current) => current.map((item) => item.id === proof.id
      ? { ...item, status: 'rejected', reviewedAt: new Date().toISOString(), reviewNote: reason }
      : item));
    setActiveProof(null);
    setToast('Changes requested. The evidence and your very specific challenge are waiting in recent submissions.');
  }

  function createTask(task) {
    setTasks((current) => [task, ...current]);
    setPage('tasks');
    setFilter('all');
    setToast('Task created. Clear criteria, specific evidence, zero pretend AI. Excellent start.');
  }

  const firstTask = filteredTasks[0];
  const title = page === 'overview' ? 'Your plan, without the guesswork.' : page === 'review' ? 'Check the evidence.' : 'Your tasks, clearly defined.';
  const intro = page === 'overview'
    ? 'Set the finish line. Submit evidence. Review it yourself before you call it done.'
    : page === 'review'
      ? 'Passing a format check is not proof of truth. Check each submission against the task criteria.'
      : 'Each task has a due date, a clear success criterion, and a required evidence type.';

  return (
    <div className="app-shell">
      <Sidebar page={page} setPage={(nextPage) => { setPage(nextPage); setFilter('all'); }} openNewTask={() => setShowNewTask(true)} activeCount={activeCount} reviewCount={reviewCount} />
      <main className="main-area">
        <Topbar page={page} onAdd={() => setShowNewTask(true)} />
        <div className="local-banner"><LockKeyhole size={14} /><span><strong>LOCAL PROTOTYPE</strong> · Stored in this browser only · No authentication, cloud backup, AI, or tamper-proof review</span><button type="button" title="This prototype only performs transparent local checks." aria-label="About local verification"><CircleHelp size={15} /></button></div>
        <div className="page-content">
          {storageWarning && <div className="storage-warning" role="alert"><span>{storageWarning}</span><button onClick={() => setStorageWarning('')} aria-label="Dismiss storage warning"><X size={15} /></button></div>}
          <div className="welcome-row"><div><div className="greeting-eyebrow">PROOF-BASED TASKS <span>·</span> RULES, NOT AI</div><h1>{title}</h1><p>{intro}</p></div><button className="button button-primary page-add" onClick={() => setShowNewTask(true)}><Plus size={17} /> New task</button></div>

          <div className="stats-grid">
            <StatCard label="IN PROGRESS" value={activeCount} sub="tasks still to do" icon={Target} iconClass="stat-lilac" />
            <StatCard label="WAITING FOR REVIEW" value={reviewCount} sub="submitted, not verified" icon={Clock3} iconClass="stat-peach" />
            <StatCard label="COMPLETED BY YOU" value={completedCount} sub="manually reviewed" icon={BadgeCheck} iconClass="stat-mint" />
          </div>

          <div className="dashboard-grid">
            <section className="tasks-panel">
              <div className="section-title tasks-title">
                <div><h2>{page === 'overview' ? 'Your open work' : page === 'review' ? 'Needs your review' : 'All tasks'} <span>{filteredTasks.length}</span></h2><p>Completion requires a saved submission and your explicit review.</p></div>
                <div className="filter-menu"><select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter tasks"><option value="all">Everything</option><option value="active">In progress</option><option value="review">Needs review</option><option value="completed">Completed</option></select><ChevronDown size={14} /></div>
              </div>
              {filteredTasks.length
                ? <div className="task-list">{filteredTasks.map((task) => <TaskRow key={task.id} task={task} proof={proofs.find((item) => item.id === task.lastProofId)} onSubmit={setActiveTask} onReview={setActiveProof} />)}</div>
                : <EmptyState page={page} onAdd={() => setShowNewTask(true)} />}
              {firstTask && page === 'overview' && <button className="view-all-link" onClick={() => { setPage('tasks'); setFilter('all'); }}>View all tasks <ArrowRight size={14} /></button>}
            </section>
            <aside className="right-column">
              <PolicyCard />
              <ActivityPanel proofs={proofs} onReview={setActiveProof} />
              <div className="footer-note"><span>Proofly</span> · rules-based prototype · evidence stays on this device</div>
            </aside>
          </div>
          <div className="bottom-caption"><span>✳</span> EVIDENCE FIRST · HONEST REVIEW <span>✳</span></div>
        </div>
      </main>

      {activeTask && <ProofModal task={activeTask} onClose={() => setActiveTask(null)} onSubmit={submitProof} />}
      {activeProof && <ReviewModal proof={activeProof} onClose={() => setActiveProof(null)} onApprove={approveProof} onReject={rejectProof} />}
      {showNewTask && <TaskForm onClose={() => setShowNewTask(false)} onCreate={createTask} />}
      {toast && <div className="toast" role="status"><span className="toast-icon"><CheckCircle2 size={17} /></span><span>{toast}</span><button onClick={() => setToast('')} aria-label="Dismiss notification"><X size={15} /></button></div>}
    </div>
  );
}
