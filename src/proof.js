const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const MIN_TEXT_LENGTH = 80;
const MIN_UNIQUE_WORDS = 8;
const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'and', 'are', 'because', 'before', 'been',
  'but', 'did', 'for', 'from', 'have', 'into', 'just', 'that', 'the', 'their',
  'then', 'there', 'they', 'this', 'was', 'were', 'what', 'when', 'with', 'your',
]);

function meaningfulWords(value) {
  return new Set(
    value.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)?.filter((word) => !STOP_WORDS.has(word)) || [],
  );
}

function failed(summary, challenge, checks) {
  return { accepted: false, summary, challenge, checks };
}

function needsReview(summary, checks) {
  return {
    accepted: true,
    status: 'needs-review',
    summary,
    checks,
    limitation: 'Format and completeness checks only. The evidence has not been independently verified.',
  };
}

function evaluateUrl(value) {
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return failed(
      'That is not a valid web address yet.',
      'Paste the complete URL, including https://. A link-shaped sentence is not quite the same thing.',
      ['A parseable URL is required'],
    );
  }

  if (
    url.protocol !== 'https:'
    || !url.hostname.includes('.')
    || url.username
    || url.password
    || !url.hostname
  ) {
    return failed(
      'This link does not meet the safe-link format checks.',
      'Use a complete HTTPS link without embedded credentials. We do not open links from this browser-only demo.',
      ['A public-looking HTTPS URL without embedded credentials is required'],
    );
  }

  return needsReview(
    'The link format checks passed. Its destination and contents have not been checked.',
    ['HTTPS URL format passed', 'No network request was made', 'Page ownership and task relevance still need review'],
  );
}

function evaluateCommit(value) {
  const text = value.trim();
  if (/^[a-f0-9]{7,40}$/i.test(text)) {
    return needsReview(
      'This looks like a commit hash, but a hash by itself does not identify a repository.',
      ['Commit-hash format passed', 'Repository and commit existence were not checked'],
    );
  }

  let url;
  try {
    url = new URL(text);
  } catch {
    return failed(
      'We could not find a commit hash or supported commit link.',
      'Paste a 7–40 character commit hash or a direct HTTPS link to a GitHub, GitLab, or Bitbucket commit.',
      ['A commit hash or direct commit URL is required'],
    );
  }

  const isCommitUrl = url.protocol === 'https:'
    && !url.username
    && !url.password
    && (
      (url.hostname === 'github.com' && /^\/[^/]+\/[^/]+\/commit\/[a-f0-9]{7,40}\/?$/i.test(url.pathname))
      || (url.hostname === 'gitlab.com' && /^\/[^/]+\/[^/]+\/(?:-\/)?commit\/[a-f0-9]{7,40}\/?$/i.test(url.pathname))
      || (url.hostname === 'bitbucket.org' && /^\/[^/]+\/[^/]+\/commits\/[a-f0-9]{7,40}\/?$/i.test(url.pathname))
    );

  if (!isCommitUrl) {
    return failed(
      'That repository link does not point directly to a supported commit.',
      'Paste the commit page itself, not just the repository home page. The commit still needs a live repository check.',
      ['A direct HTTPS commit URL is required'],
    );
  }

  return needsReview(
    'The commit link format checks passed. The repository and commit have not been checked.',
    ['Supported commit URL format passed', 'Repository, commit existence, and ownership were not checked'],
  );
}

async function evaluateImage(file) {
  if (!file || !ALLOWED_IMAGE_TYPES.has(file.type?.toLowerCase())) {
    return failed(
      'This file does not identify itself as an image.',
      'Choose a PNG, JPEG, GIF, or WebP image. The file contents will also need to decode as an image.',
      ['An image file is required'],
    );
  }

  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    return failed(
      'This image is empty or larger than the 10 MB upload limit.',
      'Choose a non-empty image under 10 MB. A full-resolution poster is probably overachieving.',
      ['Image must be between 1 byte and 10 MB'],
    );
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return failed(
      'The browser could not decode this image file.',
      'Try opening the image and exporting it as PNG, JPEG, GIF, or WebP before uploading.',
      ['Browser image decoding failed'],
    );
  }

  const { width, height } = bitmap;
  bitmap.close();
  if (!width || !height || width * height > 40_000_000) {
    return failed(
      'The image dimensions are empty or exceed the 40 megapixel limit.',
      'Upload a regular-sized image. Evidence does not need to double as a satellite photograph.',
      ['Image dimensions must be between 1 and 40 megapixels'],
    );
  }

  return needsReview(
    `The image decodes (${width} × ${height} px). Its contents have not been inspected.`,
    ['Image decoded in the browser', 'No visual-AI analysis was performed', 'Relevance still needs review'],
  );
}

function evaluateText(task, value) {
  const text = value.trim();
  if (text.length < MIN_TEXT_LENGTH) {
    return failed(
      'This response is too short to give a reviewer useful context.',
      `Add at least ${MIN_TEXT_LENGTH} characters describing what you did. You have ${text.length}; the details are hiding.`,
      [`${text.length}/${MIN_TEXT_LENGTH} characters submitted`],
    );
  }

  const words = meaningfulWords(text);
  if (words.size < MIN_UNIQUE_WORDS) {
    return failed(
      'There are not enough distinct details in this response yet.',
      `Add a few specifics; this response needs at least ${MIN_UNIQUE_WORDS} distinct meaningful words.`,
      [`${words.size}/${MIN_UNIQUE_WORDS} distinct meaningful words found`],
    );
  }

  const criteriaWords = meaningfulWords(task.successCriteria || '');
  const matchingTerms = [...criteriaWords].filter((word) => words.has(word));
  if (criteriaWords.size > 0 && matchingTerms.length === 0) {
    return failed(
      "This response does not mention any of the task's stated success criteria.",
      'Connect your write-up to at least one concrete criterion. The reviewer needs a breadcrumb, not interpretive dance.',
      ['No meaningful overlap with the task success criteria'],
    );
  }

  const checks = [
    `${text.length} characters submitted`,
    `${words.size} distinct meaningful words found`,
  ];
  if (criteriaWords.size > 0) checks.push(`${matchingTerms.length} success-criteria term(s) referenced`);

  return needsReview(
    'The response meets the local detail checks. A human still needs to confirm the work was completed.',
    checks,
  );
}

export async function evaluateProof(task, value, file) {
  switch (task.evidence) {
    case 'url':
      return evaluateUrl(value);
    case 'commit':
      return evaluateCommit(value);
    case 'screenshot':
      return evaluateImage(file);
    case 'text':
      return evaluateText(task, value);
    default:
      return failed(
        'This task uses an unsupported proof type.',
        'Edit the task to choose one of the supported proof types.',
        ['Unsupported evidence type'],
      );
  }
}

export const proofLimits = {
  maxImageBytes: MAX_IMAGE_BYTES,
  minTextLength: MIN_TEXT_LENGTH,
  minUniqueWords: MIN_UNIQUE_WORDS,
};
