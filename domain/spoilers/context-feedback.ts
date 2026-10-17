// Fixed, content-free explanations; never pass provider error text to the UI.
export const CONTEXT_FEEDBACK = {
  background_name_required:
    'For outside background, ask “Who is [full name]?” about a person named in the available captions.',
  background_name_not_observed:
    'That name is not in the captions available for this question. Enable captions and let the introduction play; a video title alone does not establish who is shown.',
  background_no_match:
    'The background lookup found no unambiguous person with supported occupation information for that name.',
  background_lookup_unavailable:
    'The outside background service is unavailable right now. Try again shortly.',
  earlier_catalog_unavailable:
    'Earlier-work context is enabled, but no reviewed earlier-work sources are configured in this local session.',
  earlier_no_match:
    'No reviewed earlier-work source matches this video and a topic mentioned in its available captions.',
} as const;
export type ContextIssue = keyof typeof CONTEXT_FEEDBACK;

export function parseContextIssues(value: unknown): readonly ContextIssue[] {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 2 ||
    new Set(value).size !== value.length ||
    value.some(
      (item: unknown) =>
        typeof item !== 'string' || !Object.hasOwn(CONTEXT_FEEDBACK, item),
    )
  )
    throw new Error('Invalid context feedback.');
  return Object.freeze(value as ContextIssue[]);
}
