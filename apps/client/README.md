# Omoikane Angular Client

> TODO: This readme contains different concerns and has to be split in multiple documents.

The client is Omoikane's browser delivery mechanism. It renders application
state, translates user interaction into application use-case calls, and
composes the Effect/Supabase runtime through Angular dependency injection.

## Presentation direction

The approved presentation redesign is defined by
[OMO-UX-001](../../../docs/product/ui-ux-redesign-plan.md) and
[ADR-0003](../../../docs/architecture/adr/0003-angular-material-and-lucide-presentation-foundation.md).
UI-1 installed Angular Material and the Angular CDK at the Angular 22 runtime
version and pinned `@lucide/angular` under the workspace's dependency-age
policy. The global SCSS entry owns Material system theming, Omoikane tokens, the
document reset, focus visibility, and reduced-motion behavior. The anonymous
authentication feature is the first concrete consumer; its three existing
forms share one local stylesheet rather than a speculative component library.
Presentation work must preserve this README's feature-state ownership and
Angular execution boundaries.

## Layer responsibilities

- `core/`: application-wide runtime composition and thin Angular boundary
  services
- `features/`: vertical presentation slices with components and feature-local
  Signal Stores
- `app.config.ts`: Angular provider composition
- `app.routes.ts`: route-level feature composition
- `environments/`: build-time environment configuration

Cross-boundary client imports use `@client/*` and
`@client-environments/*`. Closely related modules within one feature or core
folder continue to use relative imports so locality remains visible.

The root route lazy-loads the authentication shell. This is the natural feature
boundary for keeping Effect, Supabase, and authenticated feature code out of
the small browser bootstrap bundle; query-parameter navigation does not destroy
that shell after it has loaded.

Anonymous users can choose sign-in or self-service email/password registration
inside that shell. The root authentication store serializes those commands
with sign-out and reconciles them against authoritative Supabase session
events. Registration either enters the authenticated application immediately
or renders an explicit email-confirmation completion. The existing Auth-user
database trigger owns initial profile creation; the client adds no parallel
profile-provisioning workflow.

Confirmation-required registration retains only its normalized email address,
never the password. The same completion screen can resend confirmation through
an independently tracked command state. Its success text remains conditional
and non-enumerating, and a newer authenticated session invalidates a pending
resend result.

Anonymous users can also request a password-reset email. The completion text is
deliberately identical whether or not the address belongs to an account. The
Angular execution boundary supplies the current browser origin as the callback;
application and infrastructure contracts do not import DOM APIs. When Supabase
opens a valid recovery session, that observed event takes precedence over the
authenticated application shell until the user replaces the password and
explicitly continues. Store revisions prevent an older restoration or command
result from replacing a newer provider session.

## Angular boundary

Effect use cases remain framework-independent. Services under `core` run
configured Effects and return Promises to Angular callers. They should not
reproduce business rules or database mapping.

```text
Component event
    ↓
Feature Signal Store
    ↓
Angular application service
    ↓
Effect use case + configured Layer
```

## Signal Store guideline

A feature store owns presentation state and coordination for one user-facing
capability. It may track loading status, stale-request protection, and local
collection updates. Business validation belongs in the domain or application
layer.

Do not create a global store merely because data may later be shared. Promote
state only after two implemented features require coordinated ownership.

Analysis Runs are owned by the selected-channel presentation subtree. Their
feature store receives explicit workspace and channel identities, clears its
current run when either identity changes, and sends the selected channel plus a
validated UTC time range to the trusted server. A fresh store defaults to the
previous seven days; the user may choose a positive interval of at most 31
days, with an inclusive start and exclusive end. The accepted immutable range
is rendered with the run. Channel authorization and authoritative source
filtering remain server and database responsibilities.

Succeeded Decision Forensics runs render their AI-generated output explicitly
as proposed, including candidates, claims, assumptions, participant roles,
model-assessed confidence, and provider usage. A shared evidence renderer keeps
source order and deep-links each message through the existing selected-channel
route. It displays the exact immutable revision identity without broadening the
separate message-revision authorization policy.

Proposed candidates expose confirm and reject actions with an optional bounded
reason. The store serializes review submission per feature instance and patches
only the matching candidate after success. When another reviewer wins first,
it reloads the authoritative run before showing the conflict. Reviewed status
is a projection of an immutable review fact; the client never mutates model
output locally as a source of truth.

## Feature structure

The initial `channel-messages` slice keeps closely related files together:

- component: template interaction and rendering
- store: asynchronous presentation workflow
- state: explicit state contract and status types
- collection helpers: pure deduplication operations
- error adapter: stable presentation-safe error shape

Message history retains the stable profile identity of each author. It uses
the root authentication store only to label the current user's messages and
show Edit/Delete controls for those messages. This is presentation behavior,
not authorization: Supabase command policies remain the security boundary.
An edit that normalizes to the current database value is reported as an
actionable unchanged-content failure. The existing projection and edit form
remain visible so the author can change or cancel the edit. The client does not
duplicate the comparison rule because only the database can evaluate it safely
against the authoritative value.
When an edit or deletion loses a race with archival or prior deletion, the
store retains the current history projection and exposes action-specific safe
feedback. The active edit form or deletion confirmation remains open so the
user can acknowledge or cancel it; raw database lifecycle details are not
rendered.
The workspace-owner capability already derived by the member directory is
forwarded through explicit navigation and message-component inputs. It lets an
owner request deletion of another author's active message but never exposes
editing for that message. This is a presentation affordance only: no membership
query or workspace state is added to the message store, and the existing
Supabase delete command remains the authorization boundary.
Message history also renders the existing lifecycle timestamps without adding
store state: every projection shows its creation time, edited projections show
their latest edit time, and deleted projections show their deletion time.
Angular formats visible values at the presentation boundary while semantic
`time` elements retain machine-readable ISO values and contextual labels.
Edited messages expose their immutable revision history on demand to the author
or through the existing workspace-owner presentation capability. Revision
pages live in the channel-message store because they share its selection and
stale-request boundary, but they keep independent loading, pagination, and
error state. Switching channels, opening another message, editing the target,
or receiving an authoritative update invalidates an outstanding revision
request. The UI capability is only an affordance: the `message_versions` RLS
policy remains the authorization boundary.
If message creation loses a race with workspace or channel archival, the store
retains the existing history and reports that the channel no longer accepts
messages. The composer clears its draft only after successful creation, so the
rejected text remains available without another client-side lifecycle rule.
For other authors, the channel-message store batch-loads RLS-visible current
profiles for each new page and renders their display names. The enrichment is
feature-local and best-effort: hidden or unavailable profiles retain the stable
“Another user” fallback, while stale profile responses cannot enrich a newly
selected channel.

After the initial page loads, the store starts one channel-scoped realtime
subscription. Created messages are prepended, loaded edited/deleted projections
are replaced in place, and changes for unloaded older messages are ignored.
Switching channels or destroying the feature interrupts the Effect Fiber and
removes the Supabase listener. Stream failures leave history readable and
expose an explicit retry action.

Author enrichment is a local store feature because both page loading and
realtime-created messages now require the same coordination. Selection,
pagination, realtime reconciliation, and mutations remain within one
feature-scoped consistency boundary.

The `workspace-navigation` slice owns a feature-scoped store. It loads active
workspaces visible through database RLS, creates workspaces through the
authenticated application command, and retains one explicit selection.
Creation has independent pending/error state and inserts only the canonical RPC
result into navigation. The component then writes the returned slug to the URL,
leaving the existing route effect as the selection authority.

After initial discovery succeeds, workspace navigation starts one private
per-user access observation. Every invalidation reloads the authoritative
RLS-visible collection and preserves the existing selection-generation guards.
If membership suspension, removal, or departure makes the selected workspace
inaccessible, the store clears that selection; Angular then removes the nested
channel and message features and replaces both workspace and channel URL
parameters. Destroying the feature interrupts the Effect Fiber and releases
the Supabase channel. A stream failure keeps the last readable snapshot and
offers an explicit retry.

The same navigation slice lets an owner replace the selected workspace's name,
slug, and description. It receives the owner affordance derived by the existing
member-directory feature rather than issuing a duplicate membership query;
Supabase remains the authorization boundary. Update state is independent from
creation, the canonical RPC result replaces the navigation projection, and a
selection generation rejects responses that complete after navigating away and
back. When the slug changes, the component replaces only the workspace query
parameter, preserving the selected channel while avoiding an invalid historical
URL.

Owners can archive the selected workspace after an explicit inline
confirmation. Archive command state is independent from creation and editing,
and only one workspace command can mutate navigation at a time. A successful
command removes its stable identity from the active collection even if the user
navigated elsewhere while it ran. Selection and the workspace/channel URL are
cleared only when they still refer to that archived target; obsolete failures
are not shown against a newer selection. The database remains responsible for
owner authorization and the immutable archived version. Hard deletion is not
offered.

Archived-workspace discovery is a separate feature with its own read and
restoration lifecycles. It lists the archived projections that existing membership
RLS still makes visible, orders them by archive time, and renders accessible
timestamps. Archived values use a distinct domain type and never participate
in active selection, channel loading, or URL state. Restoration requires
explicit confirmation and is authorized independently by the database using
the authenticated user's active owner membership. Success removes the archived
projection, reconciles the returned active workspace through the existing
navigation method, and selects its canonical slug. Changes to the authoritative
active-workspace identity set reload the independent history, reconciling both
local and remote archive or restoration without a second realtime listener.
Hard deletion remains outside this slice.

Workspace lifecycle transitions broadcast the same private access invalidation
used by membership reconciliation. Remote members therefore remove an archived
workspace or regain a restored workspace through the authoritative active-list
query rather than trusting an event payload.

Every active member can leave the selected workspace after an explicit inline
confirmation. Departure has independent state but shares the navigation
store's serialized workspace-command boundary. Success removes the workspace
from the accessible collection even after newer navigation; selection and URL
parameters are cleared only while they still name that target. A final owner
receives actionable guidance to assign another active owner first. The client
does not accept or derive a departure target identity: the database command
uses the authenticated Supabase session and protects the last-owner invariant.
The immutable history records voluntary departure as `left`, distinct from an
owner-driven `removed` event. An owner can invite that former member again by
exact username; acceptance preserves the stable membership identity and its
history.

The nested `workspace-member-directory` slice loads active RLS-visible
memberships for the selected workspace in stable 25-row keyset pages and
batch-enriches each page's profile identities. Owners are displayed before
members and the authenticated user is
labelled locally. Profile enrichment is best-effort: valid roles remain visible
with a neutral fallback name if profiles are unavailable. Displayed roles are
not an authorization decision; database policies and commands remain the
security boundary. An authenticated owner can request promotion, demotion,
suspension, or another member's removal from the same directory. Suspension and
removal require explicit inline confirmation and are not offered for the
current owner. Role changes, suspension, and removal share one serialized
member-mutation state independent from directory loading. Successful commands
reconcile only their validated canonical outcomes, and late results after
workspace navigation are ignored. The database independently authorizes the
actor and protects last-owner invariants.

The store appends pages by stable profile identity, prevents duplicates, and
keeps page failures separate from the readable directory. Because owner
capability is derived here and reused by workspace and channel controls, the
initial request automatically advances through owner-only pages until the
authenticated user's role is known. An explicit refresh replaces all loaded
pages, reconciling additions, role changes, removals, and suspensions against
the current authoritative projection without introducing a generic pagination
framework.

The nested `workspace-invitations` slice lets an owner invite an existing
active profile by exact username without granting immediate access. Invitation
creation has independent state and the database remains responsible for owner
authorization, duplicate prevention, and active-member rejection. Broad user
search, external email delivery, and expiration remain outside this slice.

For the selected workspace, active owners also receive a current-username list
of pending invitations. The list is keyed by workspace identity so late results
cannot cross navigation. Cancellation requires explicit inline confirmation,
appends an immutable terminal event, and removes only the pending projection;
it never deletes invitation history. Creation and cancellation share one
serialized owner-mutation boundary, while database commands independently
authorize the current session and workspace lifecycle.

The same feature-scoped store loads invitations addressed to the authenticated
user and serializes accept or decline responses. Acceptance creates or
reinstates the default membership transactionally, removes the pending
invitation, and reconciles the returned workspace into navigation without a
second workspace query. Decline grants no access. Stale terminal invitations
are removed when another response has already resolved them, while other typed
failures remain actionable and retryable.

The nested `channel-navigation` slice reacts to that selected workspace, loads
only its active RLS-visible channels, and owns a separate feature-scoped
selection store. Its request generation prevents a late response for a
previous workspace from replacing the current collection. Selecting a channel
composes the existing `channel-messages` component through its typed input;
the two stores do not depend on each other. Active members can also create a
channel through the authenticated database command. Creation has independent
pending/error state, inserts the validated result in stable navigation order,
and then writes its normalized slug to the URL so the existing route effect
remains the selection authority.

After loading, that store owns one workspace-scoped channel observation. Each
private Broadcast invalidation is resolved into an authoritative active-channel
snapshot, so remote creation, detail updates, and archival reconcile without
reloading unrelated workspace or message state. Switching workspaces or
destroying the feature interrupts the old Effect Fiber. A failed listener keeps
the readable collection and exposes an explicit retry. If realtime archival
removes the selected channel, selection and its URL parameter are cleared;
destroying the nested message component releases its independently owned
message listener.

The selected workspace also owns an independent `workspace-presence` feature.
Its feature-scoped Signal Store starts one private Presence subscription,
renders a deduplicated online-member count, exposes reconnect state, and
interrupts the old subscription when workspace selection changes or the
component is destroyed. Presence is intentionally advisory and never changes
the workspace capabilities passed to child features.

The selected channel owns an independent `channel-typing` Signal Store. The
message composer reports input activity without publishing every keystroke:
one start event is sent per burst and a stop event follows inactivity, blur, or
submission. Remote typists expire locally when a stop event is lost. The UI
renders only a deduplicated count, and switching channels or destroying the
message feature releases the scoped Broadcast connection and its timers.

The workspace owner capability already derived by the parent member directory
is passed into channel navigation as a presentation affordance; this avoids a
duplicate membership query while Supabase remains the authorization boundary.
Owners can edit a selected channel's name and description, while its workspace
and slug remain immutable. Update state is independent from loading and
creation, the normalized result replaces only mutable fields, and a selection
generation rejects late responses after navigating away and back. Because the
slug cannot change, a successful edit does not rewrite browser history.

Owners can also archive a selected channel after explicit inline confirmation.
The successful stable identity is removed from active navigation even if the
user moved elsewhere while the command ran; failures from obsolete selections
are hidden. A store-local tombstone prevents an older workspace reload from
reintroducing the archived channel. Selection, message rendering, and the
channel query parameter are cleared only when they still refer to the archived
target, including a workspace-identity check for same-slug channels. Restoration
is handled by the adjacent archive-history feature; hard deletion remains
outside this lifecycle.

Owners also see archived-channel history beneath active navigation.
It has independent feature-scoped loading and retry state, so an archive-history
failure cannot erase or block active navigation. The list is newest first and
uses the database-updated archive timestamp. It is instantiated only when the
existing member-directory capability says the user can manage channels, while
row-level security remains the actual authorization boundary.

The history reuses the active channel collection as an invalidation signal:
when the set of active channel identities changes, it reloads its authoritative
archived snapshot. This lets the existing channel realtime owner reconcile
local and remote archival without opening a second listener. Archived channels
never enter active selection, message rendering, or URL state while archived.

Restoration requires explicit inline confirmation and runs through an
independent serialized command state. The database rechecks active workspace
ownership and lifecycle atomically. Success removes the archived projection,
reconciles the returned validated `Channel` into active navigation, and writes
its immutable slug to the URL so the existing route effect remains selection
authority. A local inclusion guard preserves the restored channel across one
older realtime snapshot, while stale completions after a workspace switch are
discarded. Hard deletion remains outside this slice.

The `current-profile` slice enriches the authenticated header with the
RLS-visible profile belonging to the session identity. It keeps the
authentication session email as a reliable fallback while profile data loads
or fails. Its feature-scoped store does not duplicate session ownership, and a
late response for a previous session identity cannot replace the current
profile. The same feature supports self-service editing and replaces its state
only with the canonical profile returned by the application workflow.

Validated HTTPS avatars are rendered beside visible profile names in the
current-profile header, workspace-member directory, and message history. Those
three concrete consumers share one small presentation component. External
images are decorative, omit referrer information, and fall back to deterministic
initials when absent or unavailable. Uploads and Supabase Storage remain outside
this URL-based slice.

Workspace and channel selections are reflected in the root route as validated
slugs:

```text
/?workspace=omoikane-development&channel=general
```

The URL is the browser-history and deep-link source of selection, while the
stores retain canonical branded identifiers after matching a slug against the
RLS-visible collection. Changing workspaces removes the channel parameter.
Unknown slugs are removed with history replacement only after their owning
collection loaded successfully; repository failures therefore remain retryable
and are not misclassified as invalid navigation.

## Testing

Component tests verify rendering and interaction. Store tests verify state
transitions and stale-result behavior. Application and infrastructure behavior
is tested in their owning libraries.

Angular application services are the Effect execution boundary. They run lazy
application Effects through the shared managed runtime and expose expected
failures as typed `Either` values. Signal Stores match those values into
presentation state; they do not compose Layers, run Effects, or catch expected
application failures as `unknown`.

```bash
pnpm nx lint client
pnpm nx run client:typecheck
pnpm nx run client:typecheck:test
pnpm nx test client
```
