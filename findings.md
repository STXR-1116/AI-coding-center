# Findings

## Product Scope
- CodingCenter orchestrates requirements, tasks, agents, squads, repositories, knowledge bases, skills, configuration, token budgets, and audit/metrics.
- The ordinary employee's primary surface is a project development workspace: explorer, AI conversation, output panel, and change-review drawer.
- Management users also need a task command center, requirement triage, agent health, and platform configuration.
- The frontend must expose role-aware navigation and state, but can use mock data until the documented APIs exist.

## Reference Image Analysis
- Canvas: 1280 x 720, desktop-first enterprise dashboard.
- Structure: 190px left rail, fluid center, 240px details inspector; top utility row and a dense lower timeline.
- Palette: icy blue-white base, white translucent surfaces, charcoal text, emerald primary accent, blue secondary accent, red only for risk.
- Surfaces: subtle 1px white borders, low-opacity tinted shadows, approximately 16px main radius, nested cards avoided except semantic panels.
- Typography: compact Chinese sans, 14-16px body, 20-24px page title, tabular numerals for metrics.
- Interaction: icon-led tools, segmented views, filters, task groups, right-side inspector, clear semantic state dots.
- Signature visual: translucent green project-folder/document cascade in the center provides depth without making the workspace decorative.
- Responsive interpretation: at tablet/mobile, sidebars collapse into drawers and the primary content remains the task/workspace flow.

## Task-board Folder Detail Analysis - 2026-08-06
- The upper-left glass block is not an independent metric card. It is the detail view for the currently selected folder and therefore must update its name, cycle, completion value, and caption from the same selected data object.
- In the supplied reference, the selected fourth folder is intended to be `项目文档` even though the folder itself was mislabeled `项目归档`; its detail state is `项目文档 / 2025 · Q2 / 87% / 完成度`. The current product timeline uses 2026 data, but fidelity for this visual requires the displayed folder detail to stay internally consistent rather than mixing labels.
- The queue sits behind and to the right of the detail block. Folders share one lower-right-facing perspective and overlap enough to read as a physical cascade, with the selected folder lifted approximately 14-20px and brought forward through a stronger shadow and higher stacking level.
- Unselected folders are cool white frosted glass: high white edge light, low-opacity blue-gray fill, blurred background, and restrained dark-teal text. The active folder is translucent emerald rather than opaque green, so silhouettes and nearby surfaces remain faintly visible through it.
- Hover is a preview state: the hovered folder temporarily receives the emerald glass material, increases its diagonal tilt, lifts slightly, and moves above adjacent folders. Hover must not change the selected detail until the user clicks.
- Sparse queues should expand their track spacing across the usable width; dense or mobile queues may scroll horizontally. Individual folder width and perspective must remain stable so responsive layout changes do not flatten or stretch the objects.

## Task-board Folder Verification - 2026-08-06
- At 1280 x 720, the folder stage is 529 x 292px and the project timeline begins immediately below it in the first viewport; the right inspector no longer stretches the center board row.
- At 1440 x 900, the stage expands to 634 x 292px, all nine folders remain proportionally distributed, the selected `项目文档` folder and `87%` detail agree, and the timeline remains visible.
- Hovering a non-selected folder turns only that folder into raised emerald glass while the detail block continues to show the persistent selected folder until click.
- Clicking another folder updates the selected glass, summary name, completion percentage, related task inspector, and selected ground reflection together.
- At 390 x 844, the project queue uses a 222px horizontal viewport inside the stage, automatically centers the selected fourth folder, and retains a 280px stage height without document-level horizontal overflow.
- Browser console inspection returned no warnings or errors after desktop and mobile interaction checks.

## Design System
- Theme: pristine light, cool-neutral background, emerald accent.
- Radius rule: cards/panels 12-16px, controls 8-10px, circular icon buttons only when icon-only.
- Motion: short state transitions and drawer/modal movement only; reduced-motion disables transforms.
- Accessibility: visible focus rings, labelled controls, keyboard dialogs, color never carries status alone.

## Implementation Expectations
- Every visible primary navigation item must lead to a substantive screen, not a placeholder.
- Core prototype actions must work locally: filtering, creating a task, opening details, changing execution mode, approving/rejecting changes, switching projects, and toggling module settings.
- README must be the backend contract source for auth, CRUD, streaming chat/events, repositories/files/diffs, token metrics, and configuration.

## Reference Project Audit - Initial Inventory
- `C:\Users\13588\Desktop\Coding Center` is a substantially larger full-stack Next.js 14 application, not a directly swappable frontend. It includes NextAuth, Prisma, bcrypt, Zod, React Hook Form, React Markdown, a local connector, database schema/seed data, docs, and tests.
- The reference stack uses React 18 + Next.js App Router + Tailwind 3.4; the current project uses React 19 + Vite + vanilla CSS with a documented backend boundary. Optimizations should therefore borrow product/component patterns, validation, state semantics, and UX behavior rather than migrate frameworks.
- The reference repository contains `src`, `connector`, `prisma`, `docs`, and `tests`, indicating stronger end-to-end contracts and operational tooling than the current frontend-only prototype.
- Neither project exposed an `AGENTS.md` instruction file in the initial root scan.
- The reference README is still the default Next.js scaffold text and is not itself a useful documentation pattern; the current project's backend-contract README is materially stronger.
- The current project remains intentionally compact: 9 route pages, shared app context, mock data, one global stylesheet, and 3 integration-style smoke tests.

## Reference Project Architecture Signals
- The reference project separates `contracts`, server `actions`, domain `services`, auth/permission guards, scheduler modules, and route UI. That boundary discipline is reusable even though the current project must remain frontend-only.
- The reference exposes explicit loading and error routes at both root and main-layout scope, while the current project has no route-level fallback or branded 404/error surface.
- Its component set includes reusable toast infrastructure, collapsible cards, count-up metrics, status badges, structured forms, task approval, task event timeline, file tree, Git log, and token budget editing. These are stronger product primitives than one-off controls.
- The reference has dedicated requirement templates and scheduled requirements, connector management, artifacts, audit, backups, token budgets, and user administration. Only some belong in the current frontend scope; requirement templates/scheduling, connector health, and audit drill-down align directly with `平台说明.md`.
- The reference test suite is contract-heavy: task state machine, execution modes, token budgets, idempotency, pull flows, conversations, repository exploration, templates, scheduling, and API smoke tests. The current project's three UI smoke tests leave state transitions and important dialogs under-tested.
- The presence of detailed design documents for chat, repository preview, and workspace suggests the reference project formalized complex interaction contracts before coding. Those documents should be mined for behavior and edge states, not copied wholesale.

## Reference Workspace and Interaction Patterns
- The strongest reusable idea is URL-addressable project context: the reference workspace synchronizes the selected repository with `?repo=...`, so refresh/share/back navigation preserves context. The current workspace keeps project selection only in Context state.
- The reference explicitly models three output states (`no conversation`, `loading`, `empty`) and cancels stale async work in effects. The current mock UI has rich populated states but weaker loading/error/fallback coverage.
- Reference design documents define the complete employee loop as `conversation -> requirement -> task -> artifact -> git diff`, with all stages visible in one workspace. The current workspace already approximates this, so optimization should strengthen continuity and state feedback rather than add another page.
- The reference treats the diff review as a task-triggered drawer and the output panel as a persistent current-conversation view. This validates the current project's information architecture.
- Reusable improvements from the reference design: status-grouped task outputs, task event timelines, URL-bound project selection, live output refresh after chat completion, explicit empty/loading/error states, permission/capability-aware controls, and keyboard-friendly diff review actions.
- Reference navigation hides disabled modules and role-restricted connectors from the same module/permission source used by server enforcement. The current README defines capabilities but the mock frontend does not yet consume a single navigation capability model.
- The reference dashboard uses count-up animation and compact status distribution bars, but its generic shortcut-card grid and horizontal navigation are not better fits for this dense operational product and should not replace the current shell.
- Some reference UI choices should not be copied: inline emoji as semantic icons, many inline styles, Tailwind-specific one-off classes, and a top navigation that risks crowding as modules grow.

## Component-Level Comparison
- The reference toast provider has a clean API, timer cleanup, manual dismissal, `aria-live`, reduced-motion handling, and progress feedback. The current project scatters page-specific notices or gives no feedback for actions such as task creation, diff review, repository sync, and settings save. A smaller shared notification system would materially improve coherence.
- The reference task event timeline is expandable, time-stamped, semantically ordered, and supports detail payloads. The current task inspector shows only the latest aggregate state, losing the execution story that users need when supervising agents.
- The current workspace renders conversation tabs as buttons without selection or deletion handlers and always chooses the last conversation for the active project. This is a concrete broken affordance; the reference implementation maintains `selectedId`, loads per-conversation state, handles create/delete, and informs the output panel of selection.
- The current project selector is duplicated in the shell and workspace but exists only in memory. Borrowing the reference's URL synchronization would make the selection durable and eliminate ambiguity on reload/back navigation.
- Current dialogs and empty states are already more reusable and visually consistent than many reference components, so they should be retained.
- Count-up metrics are polished but lower priority than fixing dead controls, feedback, URL state, and execution trace visibility.

## Comparative Prioritization
- Highest value / low-to-medium risk: URL-addressable project selection, selectable and deletable conversations, conversation-scoped output entities, shared toast feedback, legal task-state transitions, task execution history, module-driven navigation, route loading/error/404 states, and lazy page loading.
- Medium value / contained risk: denser and more consistent secondary-page layouts, mobile selected-folder auto-centering, and stronger backend contracts for the states already visible in the UI.
- Deferred because they expand the product rather than refine it: connector administration, scheduled requirements, user administration, full authentication UI, and live backend integration.
- Explicitly rejected: migrating to Next.js/Tailwind/Prisma, fixed-width non-responsive three-column shells, emoji iconography, native confirmation dialogs, clickable non-semantic divs, and hard-coded white/elevation effects across every panel.

## Adopted Optimizations
- Project selection now synchronizes with `?project=repo-*`, including refresh, deep-link, and browser history behavior.
- Conversations can be created, selected, and deleted; messages and right-side requirements/tasks are tied to the current conversation instead of a project-wide placeholder.
- Chat exposes a clear user-message -> Agent-response lifecycle and can stop a pending response.
- A global queued toast system supplies coherent action feedback with `aria-live`, auto-dismiss progress, reduced-motion support, and mobile bottom-navigation clearance.
- Task lifecycle changes now pass through a tested transition model. Task details include a collapsible, append-only execution event timeline.
- Module settings drive navigation visibility and guarded routes. Direct visits to disabled modules return a useful `423 MODULE LOCKED` state.
- Major pages are route-split with `React.lazy`; branded loading, error boundary, and 404 states cover route failures and invalid addresses.
- The tilted project-folder queue remains intact. Unselected folders use transparent frosted glass, the selected folder uses transparent emerald glass and lifts upward, sparse queues distribute available width, and mobile selection scrolls into view.
- Secondary operational pages are being aligned to their intended workbench CSS contracts so their grids, inspectors, tables, and responsive fallbacks render consistently.

## Browser Verification Notes
- At 390 x 844, the workspace has no document-level horizontal overflow. The composer remains above the bottom navigation, the mobile workbench tabs stay reachable, and the current conversation controls retain accessible button names.
- The compact header, project selector, branch context, conversation tabs, empty conversation state, prompt composer, and bottom workbench navigation remain visually coherent after the workspace behavior changes.
- At 1440 x 900, Repositories renders its summary strip, repository table, and right inspector as a stable grid with `scrollWidth === innerWidth`; selected-row and status hierarchy remain clear.
- At 1440 x 900, Knowledge renders four seven-column source rows plus the MCP inspector without horizontal overflow. The activity strip and Agent-binding controls remain inside the available viewport.
- At 1440 x 900, Analytics keeps its metric strip, trend chart, Agent health list, and audit table aligned without horizontal overflow.
- Desktop visual QA found an excessive vertical gap inside the Skill catalog between its header, filters, and rows. The cause must be corrected before handoff even though the page has no horizontal overflow.
- The Skill gap was caused by a two-row grid declaration applied to three children. Defining `auto auto minmax(0, 1fr)` makes the header, toolbar, and list contiguous while preserving list scrolling.
- At 1440 x 900, Settings renders its permission banner, category navigation, seven module rows, and switches without overflow or misalignment.
- At 390 x 844, Repositories keeps document width within the viewport and deliberately uses local horizontal scrolling for dense filters/table content; the stacked repository inspector remains readable.
- Mobile Knowledge initially allowed its main panel to grow beyond the workbench, clipping the registration action and rightmost health toggle. Its compact row and toolbar width constraints require a targeted fix.
- The Knowledge clipping came from an implicit grid column using child min-content width. Explicit `minmax(0, 1fr)` main-panel columns, a three-column mobile tool grid, non-shrinking actions, and nowrap health labels resolved it without introducing page overflow.
- At 390 x 844, Skill's catalog exposed a local horizontal scrollbar because the inline `.skill-list-main` span ignored `min-width: 0` and let descriptions widen the row. The content column needs a block formatting context with overflow clipping.
- Making `.skill-list-main` block-level with overflow clipping reduces the mobile Skill list's scroll width to its client width while retaining desktop density and ellipsis behavior.
- At 390 x 844, Analytics keeps document width inside the viewport. Metric cards use intentional snap scrolling and the 700px audit table remains inside its own scroll container.
- At 390 x 844, Settings keeps all four categories visible, stacks module/config rows cleanly, and renders the runtime configuration plus save bar without document overflow.
- A 1440 x 900 sweep across all nine routes found no document overflow, route error state, or browser console warning/error.
- The sweep found the desktop sidebar close icon was unintentionally re-enabled by the later generic `.icon-button` rule, reducing the brand label from 97px to 52px and forcing `CodingCenter` to ellipsize. Moving the hide rule after the generic icon-button rule restores the intended desktop/mobile behavior.
- Final brand verification reports equal 90px client/scroll widths for `CodingCenter`; desktop close is hidden and the mobile drawer close remains visible.

## Final Verification
- `pnpm build` passes; Vite transforms 1,741 modules. The shared entry remains about 298.01 kB (96.58 kB gzip), with lazy page chunks around 12-19 kB.
- `pnpm lint` passes with no warnings.
- `pnpm test -- --reporter=dot` passes: 2 files and 10 tests.
- All nine routes render at 1440 x 900 without document-level horizontal overflow, route error states, or console warning/error.
- Repositories, Knowledge, Skills, Analytics, Settings, Tasks, and Workspace were visually checked at 390 x 844; responsive stacking, contained local scrolling, composer/navigation clearance, and mobile drawers remain coherent.

## Taste Skill Audit
- Design read: a recurring B2B engineering orchestration workbench for technical teams and managers, using restrained Linear/enterprise hierarchy with the existing cool-light emerald identity.
- Applied dials: `DESIGN_VARIANCE: 5`, `MOTION_INTENSITY: 4`, `VISUAL_DENSITY: 7`.
- The skill explicitly excludes dashboards and data tables, so its marketing-layout directives were not applied. The useful rules here were redesign-first audit, singular identity color, full interaction states, shape discipline, material fallback, reduced motion, and accessibility.
- The visible brand clipping at the 1280px breakpoint was a measured constraint issue: the label had 80px available for roughly 90px of content. Tightening the mark, gap, and padding gives the label an exact 86px fit without widening the product shell.
- The blue primary action and focus ring conflicted with the established emerald identity. They now use emerald; blue, amber, red, and violet remain only where they encode operational status or metric categories.
- Frosted glass remains limited to surfaces where it communicates layer or selection. Unsupported blur and reduced-transparency preferences receive solid light surfaces, while the selected folder receives a solid emerald fallback.
- The folder queue still preserves the supplied reference behavior: perspective tilt, upward selected state, translucent neutral folders, translucent emerald selection, and responsive distribution.
