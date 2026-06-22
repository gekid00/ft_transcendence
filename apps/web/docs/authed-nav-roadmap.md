# TopNav — authenticated state roadmap

Living document. Captures the planned evolution of `TopNav.astro` for signed-in
users. The current implementation (Phase 1) ships the minimum viable change to
not feel broken; later phases unlock the standard "user identity + menu"
pattern as the supporting infrastructure lands.

## Current state (Phase 1 — shipped)

```
[ 4 ][ ☰ ] · · · · · · · · · [ 🌙 ][ Play → ]
```

`RootLayout.astro` calls `isAuthenticated(Astro)` once per request and passes
the result as `<TopNav authed={authed} />`. The right group renders one of two
variants:

| State | Buttons |
|---|---|
| Anonymous | theme toggle · Login · Sign up |
| Authenticated | theme toggle · Play → |

Cost: one extra backend call per page load (~5 ms compose-internal). Acceptable
for now. If TTFB ever matters more than it does today, two ways to remove it:

- Verify the JWT signature locally on the web side (requires sharing
  `JWT_SECRET` from Vault — adds operational coupling).
- Cache the `/me` result in a per-request memo if multiple call sites end up
  needing it.

The hamburger remains inert, with a TODO comment marking it for future use.

---

## Phase 2 — User identity + dropdown menu

```
[ 4 ][ ☰ ] · · · · [ 🌙 ][ Play → ][ kershuenlee ▾ ]
```

Replace the Login/Signup absence with a positive identity affordance. The
hamburger collapses out (or stays for purely-informational menus) and a new
control on the right shows the user's name (or avatar) + caret. Click opens a
dropdown.

**Dropdown contents** (in order):

1. Profile — link to `/u/<username>` (own profile page)
2. Settings — link to `/settings`
3. Theme: Light / Dark / System — replaces the inline theme toggle button
4. ----
5. Logout — POST `/api/auth/logout` then `window.location.href = "/"`

**Prerequisites** (must land before this phase):

- shadcn `DropdownMenu` primitive added to `components/ui/dropdown-menu.tsx`.
- `/u/<username>` profile page exists (currently a 404).
- `/settings` page exists (currently a 404). Could be deferred — settings can
  link out as "coming soon" for an interim.
- `RootLayout.astro` needs to fetch the actual user object (not just a
  boolean) so it can render the username/avatar. Two options:
  - Extend `isAuthenticated()` to optionally return the user — call once,
    cache for the request.
  - New `getCurrentUser()` helper that hits `/api/auth/me` and returns
    `{ id, username, avatarUrl } | null`.

**Open design questions:**

- Avatar vs username text? If we have an avatar, show that; fall back to
  username initial. Defer the decision to when avatar uploads are reliable
  (post-Step 3 backend wiring).
- Mobile behavior: dropdown is a Drawer (full-height sheet from the side)
  rather than a Popover, per shadcn convention.

---

## Phase 3 — Activity / status indicators

```
[ 4 ][ ☰ ] · · [ 🌙 ][ 2 invites ][ Play → ][ ●kershuenlee ▾ ]
```

Once friends + lobbies + chat ship, the nav can surface ambient state:

- Pending friend requests / lobby invites — pill with count, links to the
  relevant page.
- Online status indicator next to the avatar (`●` colored by status).
- Active game pill — if the user has a game in progress, replace "Play →"
  with "Resume game →".

These are nice-to-haves and depend on real-time event delivery (Socket.io
already exists in the backend; connecting the frontend to it is the work).

---

## What never goes in the pill

Constraints, so we don't bloat the bar:

- **Logout button at the top level.** Logout is destructive-ish; it lives
  inside the user menu, not as a peer to Play.
- **Notifications drawer.** If we want notifications, that's a separate
  pattern (bell icon → side sheet or popover), and it's overkill until we
  have notifications worth showing.
- **Search.** Not a feature we need — discovery happens through friends and
  lobbies, not a global search.

---

## Migration tasks (when Phase 2 starts)

1. Add `apps/web/src/components/ui/dropdown-menu.tsx` from shadcn.
2. Extend `apps/web/src/lib/auth.ts` with a `getCurrentUser()` that returns
   the user object on success.
3. Update `RootLayout.astro` to call `getCurrentUser()` instead of
   `isAuthenticated()` (or both — `isAuthenticated()` becomes a thin wrapper).
4. Update `TopNav.astro` to accept `user: { id, username, avatarUrl } | null`
   instead of just `authed: boolean`.
5. Replace the "Play →" button with the Play CTA + identity dropdown.
6. Move the theme toggle into the dropdown (frees up nav width on mobile).
7. Update `apps/web/DESIGN.md` to reflect the new component composition.

Each step is independently shippable; the dropdown can land first with just
Logout, with Profile / Settings stubs added as those pages come online.
