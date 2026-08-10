# Repository Instructions

## Phoneage Development Rules

- Fix bugs with the smallest possible change.
- The actual game behavior is the source of truth.
- Before changing solver logic, trace the game implementation.
- Do not run multiple agents on the same bug.
- Do not change solver algorithms until movement rules and state transitions are confirmed correct.
- Always test against known solved levels after changes.

## Working Method

* Inspect the relevant implementation, configuration, types, and tests before proposing a diagnosis or changing code.
* Treat reported causes as hypotheses until confirmed from the actual code path.
* Identify the root cause before editing.
* Make the smallest complete change that resolves the problem.
* Do not refactor unrelated code as part of a feature or bug fix.
* Preserve existing behavior outside the requested scope.
* State assumptions when repository evidence is incomplete.
* Never claim that a command, test, build, or check passed unless it was actually run successfully.



## Agent Execution Rules

### Scope Control
* Do not expand the task beyond the reported issue.
* Do not redesign systems while debugging a specific bug.
* Do not improve architecture unless the current issue cannot be solved without it.
* If a local fix exists, prefer it over a structural change.
* Do not start implementation until diagnosis is complete.
* Do not let agents modify the same files simultaneously.
* Prefer one strong reasoning chain over multiple conflicting approaches.

### Debugging Workflow
For bugs:
1. Locate the runtime path involved.
2. Confirm the suspected cause with code evidence.
3. Make the smallest fix.
4. Run the relevant verification.
5. Do not modify code if the diagnosis is not confirmed.

Do not spend time proposing alternative architectures before proving the current implementation is wrong.

### Multi-Agent Behavior
* Do not assign multiple agents to independently solve the same bug.
* Parallel agents should only handle independent tasks.
* One agent should own diagnosis.
* One agent should own implementation.
* One agent should validate.
* Agents must pass findings, assumptions, and affected files to the next agent before implementation begins.
* Implementation agents should use existing investigation results instead of restarting analysis.

### Shared Workspace Rules

* Never allow multiple agents to modify the same files simultaneously.
* Before editing, check whether another agent has active changes in the same area.
* One agent owns implementation for a task.
* Other agents may review, test, or investigate but must not modify the same code path.
* Do not merge competing implementations automatically.
* Resolve conflicts by comparing against the original task requirements and repository behavior.
* Do not push changes until the implementation has been validated.
* Prefer sequential agent workflow:
  1. Investigator finds the cause.
  2. Implementer makes the change.
  3. Validator tests the result.
* Only one agent may modify solver logic at a time.
* Solver behavior changes require validation against known solved levels.
* Never force-push or overwrite another agent's changes without explicit confirmation.


### Solver/Game Logic
For puzzle/game code:
* The actual game behavior is the specification.
* Never infer rules from variable names or comments alone.
* Verify movement/state transition rules before changing search algorithms.
* A failed solver result does not prove the puzzle is unsolvable.
* Prefer trace instrumentation and reproduction over speculation.
* Do not optimize BFS/search performance until correctness of state transitions and move generation is verified.



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
* Run the smallest relevant verification first.
* Run broader checks only when the change affects wider parts of the system.
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
