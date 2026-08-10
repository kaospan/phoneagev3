# Repository Instructions

## Working Method

* Inspect the relevant implementation, configuration, types, and tests before proposing a diagnosis or changing code.
* Treat reported causes as hypotheses until confirmed from the actual code path.
* Identify the root cause before editing.
* Make the smallest complete change that resolves the problem.
* Do not refactor unrelated code as part of a feature or bug fix.
* Preserve existing behavior outside the requested scope.
* State assumptions when repository evidence is incomplete.
* Never claim that a command, test, build, or check passed unless it was actually run successfully.

## Project Architecture

* Follow the repository's existing architecture and conventions before introducing new patterns.
* Keep UI rendering, game rules, state management, persistence, and reusable utilities separated.
* Keep components and functions focused on one responsibility.
* Prefer explicit, readable code over clever abstractions.
* Extract shared logic when duplication is meaningful and the abstraction has a clear responsibility.
* Do not introduce dependencies, architectural layers, or design patterns without a concrete need.
* Avoid global mutable state and hidden side effects.

## TypeScript and React

* Preserve strict TypeScript type safety.
* Do not use `any` unless an external boundary makes it unavoidable and the reason is documented.
* Fix type errors at their source rather than suppressing them.
* Use descriptive names for components, functions, variables, and types.
* Keep React components focused on presentation and interaction.
* Move substantial game logic and reusable calculations into typed functions, hooks, or modules.
* Avoid unnecessary effects, duplicated derived state, and avoidable re-renders.
* Validate external data and handle missing or invalid values safely.
* Maintain compatibility with both desktop and mobile layouts.

## Changes and Refactoring

* Do not rewrite working modules when a localized fix is sufficient.
* Separate substantial refactoring from behavioral changes when practical.
* Preserve public interfaces unless changing them is required.
* Before changing shared code, identify its callers and possible regressions.
* Remove dead code only after confirming it is unused.
* Do not add speculative abstractions for hypothetical future requirements.

## Verification

* Use the scripts and package manager already defined by the repository.
* Do not invent build or test commands without inspecting `package.json` and repository documentation.
* After changes, run the relevant available checks, including type checking, linting, tests, and production build.
* Add or update tests for changed logic when the repository has an applicable testing setup.
* Test edge cases and failure paths, not only the expected path.
* Report checks that could not be run and explain why.

## Security and Reliability

* Never commit secrets, credentials, access tokens, or private configuration.
* Validate untrusted input at system boundaries.
* Avoid unsafe HTML rendering, command construction, and insecure storage.
* Handle errors explicitly and provide useful diagnostic information without exposing sensitive data.

## Reviews and Technical Decisions

When evaluating a diagnosis, implementation plan, or architectural decision:

1. State whether it is correct, incorrect, partially correct, unknown, or whether a better approach exists.
2. Explain the evidence from the repository.
3. Identify the smallest safe solution.
4. Note likely regressions, tradeoffs, and remaining uncertainty.

Do not agree with a technical claim merely because it was proposed by the user.

## Completion Summary

After modifying code, report:

* Root cause or implementation objective
* Files changed
* Important behavioral or architectural decisions
* Verification commands actually run
* Remaining risks or unresolved issues
