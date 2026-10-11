import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateProof, proofLimits } from './proof.js';

test('URLs must be HTTPS and free of embedded credentials', async () => {
  const valid = await evaluateProof({ evidence: 'url' }, 'https://example.com/proof');
  const insecure = await evaluateProof({ evidence: 'url' }, 'http://example.com/proof');
  const credentials = await evaluateProof({ evidence: 'url' }, 'https://user:password@example.com/proof');

  assert.equal(valid.accepted, true);
  assert.equal(valid.status, 'needs-review');
  assert.equal(insecure.accepted, false);
  assert.equal(credentials.accepted, false);
  assert.match(valid.limitation, /not been independently verified/);
});

test('commit proofs require a hash or direct supported commit URL', async () => {
  const hash = await evaluateProof({ evidence: 'commit' }, 'a1b2c3d');
  const commitUrl = await evaluateProof({ evidence: 'commit' }, 'https://github.com/acme/app/commit/a1b2c3d');
  const repoUrl = await evaluateProof({ evidence: 'commit' }, 'https://github.com/acme/app');

  assert.equal(hash.status, 'needs-review');
  assert.equal(commitUrl.status, 'needs-review');
  assert.equal(repoUrl.accepted, false);
});

test('text proof must meet detail and success-criteria checks', async () => {
  const task = {
    evidence: 'text',
    successCriteria: 'Read 20 pages and summarize an insight from the book',
  };
  const brief = await evaluateProof(task, 'I did it.');
  const unrelated = await evaluateProof(
    task,
    'I went outside and cooked dinner with friends before cleaning the kitchen and calling my family afterward.',
  );
  const relevant = await evaluateProof(
    task,
    'I read 20 pages after breakfast and wrote a short summary of the chapter, including one insight from the book.',
  );

  assert.equal(brief.accepted, false);
  assert.equal(unrelated.accepted, false);
  assert.equal(relevant.accepted, true);
  assert.equal(relevant.status, 'needs-review');
});

test('screenshot proof rejects wrong types and oversized uploads', async () => {
  const noImage = await evaluateProof({ evidence: 'screenshot' }, '', { type: 'text/plain', size: 20 });
  const unsupportedImage = await evaluateProof({ evidence: 'screenshot' }, '', { type: 'image/svg+xml', size: 20 });
  const tooLarge = await evaluateProof(
    { evidence: 'screenshot' },
    '',
    { type: 'image/png', size: proofLimits.maxImageBytes + 1 },
  );

  assert.equal(noImage.accepted, false);
  assert.equal(unsupportedImage.accepted, false);
  assert.equal(tooLarge.accepted, false);
});

test('screenshot proof requires a browser-decodable image and never claims vision review', async () => {
  const original = globalThis.createImageBitmap;
  globalThis.createImageBitmap = async () => ({ width: 640, height: 480, close() {} });
  try {
    const result = await evaluateProof(
      { evidence: 'screenshot' },
      '',
      { type: 'image/png', size: 1000 },
    );
    assert.equal(result.accepted, true);
    assert.equal(result.status, 'needs-review');
    assert.match(result.summary, /contents have not been inspected/);
  } finally {
    if (original) globalThis.createImageBitmap = original;
    else delete globalThis.createImageBitmap;
  }
});
