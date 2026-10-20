---
name: console-warning-triage
description: Use when browser smoke passes but console errors, warnings, failed requests, hydration messages, network aborts, or noisy logs remain.
---

# Console Warning Triage

## Overview

A passing UI flow can still hide a real defect. Classify console noise with request-level evidence before downgrading it or fixing it.

## Evidence First

Capture these before proposing fixes:

- Console message text, type, and stack if present.
- `pageerror` entries.
- `requestfailed` URL, method, resource type, and failure text.
- Nearby navigation or account-switch timing.
- Whether the warning is reproducible on refresh.
- Whether the backend state is correct despite the warning.

## Classification

| Class | Meaning | Action |
|---|---|---|
| Blocker | Data failed, user action failed, auth broke, persistence missing | Root-cause and fix |
| Release risk | Flow completed but critical request failed or retries mask it | Add focused test and fix |
| Teardown noise | Navigation/abort after state is already correct | Suppress or downgrade only after proof |
| Existing baseline | Unrelated warning already present before the change | Report separately |

## Root-Cause Questions

- Which exact request failed?
- Was the request still valid for the current user/session?
- Did an effect run twice, race, or survive unmount?
- Did persisted state reference an old user or old environment?
- Did a retry/polling path call the same endpoint as the primary path?

## Common Mistakes

- Hiding all console errors to make smoke green.
- Downgrading `TypeError: Failed to fetch` without the failed URL.
- Fixing the visible component when the error comes from auth, polling, or shared state.
- Ignoring warnings that only appear in the second browser context or after account switching.
