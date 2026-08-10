/**
 * Explicit type guard for consuming a Generator's IteratorResult. This repo's root tsconfig
 * sets strictNullChecks: false, which stops TypeScript from reliably auto-narrowing the
 * `done?: false | done: true` discriminant on a plain `if (step.done)` check — so callers
 * draining a search generator should use this instead of relying on that narrowing.
 */
export function isGeneratorDone<T, R>(step: IteratorResult<T, R>): step is { done: true; value: R } {
  return step.done === true;
}
