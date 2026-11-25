// A "finding" is anything a human should look at later: a resource that already existed,
// a manual follow-up step, or a failure. Findings become GitHub issues (see github-issues.js).

export const KINDS = {
  exists: { label: 'seo:already-exists', emoji: '♻️', heading: 'Already exists' },
  manual: { label: 'seo:manual-step', emoji: '✋', heading: 'Manual step needed' },
  failed: { label: 'seo:failed', emoji: '❌', heading: 'Step failed' },
};

export function finding({ key, kind, service, title, body }) {
  if (!KINDS[kind]) throw new Error(`Unknown finding kind ${kind}`);
  return { key, kind, service, title, body: body.trim() };
}
