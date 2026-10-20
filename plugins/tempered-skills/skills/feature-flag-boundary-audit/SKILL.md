---
name: feature-flag-boundary-audit
description: Use when a product has old and new behavior behind feature flags, rollout flags, kill switches, staged launches, legacy modes, or hidden creation surfaces.
---

# Feature Flag Boundary Audit

## Overview

Feature flags are product boundaries, not just conditionals. Audit what is hidden, what remains viewable, what still mutates data, and what copy implies.

## Boundary Map

For each flag, record:

- Default value in local, test, staging, and production.
- Surfaces hidden when off: nav, buttons, menus, routes, empty states, checkout links.
- Surfaces still allowed: existing detail pages, legacy resolution, read models, admin repair paths.
- Server-side enforcement: routes, actions, RPCs, API handlers, webhooks.
- Data ownership: which existing rows keep their old behavior.

## Audit Checks

- Hidden UI cannot be reached through desktop nav, mobile nav, account menus, empty states, or deep links.
- Server actions reject disabled creation or purchase behavior even if the client is bypassed.
- Legacy rows still render and resolve if the plan promises backward compatibility.
- Copy does not leak the disabled economy, product mode, or launch promise.
- Tests cover both flag values and the default with env unset.

## Verification

Use targeted tests for helpers plus one browser smoke per important surface:

```bash
pnpm exec jest --runInBand --coverage=false path/to/flag.test.ts
```

In browser, check both absence and preservation:

- Disabled creation/purchase affordance is absent.
- Existing legacy detail page is still viewable.
- New enabled path shows the correct labels and copy.

## Common Mistakes

- Hiding the nav link but leaving an empty-state CTA.
- Treating client-only gates as sufficient.
- Breaking legacy viewing because new creation is disabled.
- Testing only `true` and `false`, not the unset default.
