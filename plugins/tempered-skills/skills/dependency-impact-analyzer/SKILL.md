---
name: dependency-impact-analyzer
description: >
  Evaluates the project-wide impact of adding new npm packages to a Next.js/React app.
  Analyzes bundle size, code splitting, SSR implications, PWA/service worker effects,
  serverless cold starts, and dependency conflicts. Use when the user asks "will adding
  this package affect the rest of my app?", "should I add this dependency?", "what's the
  impact of installing X?", "will this slow down my build?", or any question about whether
  a new dependency is safe to add. Also triggers on "bundle size impact", "tree shaking",
  "code splitting", or when the user is choosing between multiple packages for the same
  purpose and wants to compare their costs.
---

# Dependency Impact Analyzer

You're helping someone decide whether adding a package to their project will cause problems
elsewhere. The goal is to give them a clear, honest assessment — not just "it's fine" or
"it's bad" but specific numbers and concrete effects.

## The Analysis Framework

For every package being considered, evaluate these 7 dimensions:

### 1. Bundle Size Impact on OTHER Pages

**The key question**: Does Next.js code splitting fully isolate this package to the pages
that import it?

**How to verify**:
- If the package is dynamically imported with `next/dynamic({ ssr: false })`, it loads
  ONLY on the route that renders it. Other pages load zero bytes.
- If the package is imported at the layout level or in a shared component, it leaks into
  every page that uses that layout/component.
- Tree shaking: does the package support it? (check `"sideEffects": false` in its
  package.json, or check if it uses ESM exports)

**What to tell the user**: "This package adds ~XKB gzipped, but with dynamic import it
only loads on [specific page]. Your dashboard, events, and other pages are unaffected."

### 2. Build Time

Larger `node_modules` means more dependency resolution during `next build`.

**Rule of thumb**:
- <10 new packages: negligible impact (seconds)
- 10-50 new packages: 5-20% slower builds
- Heavy packages with many sub-dependencies (like Three.js at 50+ deps): 10-30% slower

**Mitigation**: Turbopack caches aggressively, so rebuilds after the first are much faster.

### 3. PWA / Service Worker

**Check**:
- Does the app use `next-pwa` or a custom service worker?
- Will the new package's chunks be precached by the service worker?
- Large dynamically-loaded chunks (>100KB) should NOT be precached — they'd waste
  offline storage for pages the user might never visit.

**Default answer**: Dynamically imported chunks are not precached by default in most
PWA setups. But verify the specific SW configuration.

### 4. Dependency Conflicts

**Check for**:
- Peer dependency version mismatches (e.g., the package wants React 18 but you're on React 19)
- Multiple versions of the same sub-dependency (check `pnpm ls` for duplicates)
- Known conflicts with existing packages (check GitHub issues)

**High-risk combinations**:
- Multiple animation libraries (Framer Motion + GSAP + Three.js = potential conflicts)
- Multiple state management solutions
- Multiple CSS-in-JS solutions

### 5. SSR / Server Components

**Check**:
- Does the package use browser-only APIs (`window`, `document`, `navigator`)?
- If yes, it MUST be in a `"use client"` component or dynamically imported with `ssr: false`
- Will importing it in a Server Component cause build errors?

**Common pitfall**: Packages that work fine in development but break during `next build`
because SSR tries to evaluate browser-only code.

### 6. Serverless Function Cold Starts (Vercel)

**The question**: Does having this package in `node_modules` slow down serverless function
cold starts?

**The answer**: Almost always NO. Vercel's build process tree-shakes server bundles and
excludes client-only packages. The mere presence of Three.js in `node_modules` does not
affect API route cold starts because Three.js is never imported by server code.

**Exception**: If the package is imported in a server action or API route, it DOES increase
the server bundle and cold start time.

### 7. Dev Server Experience

**Check**:
- RAM usage: heavy packages (Three.js, Babylon.js) increase HMR memory by 200-500MB
- Hot reload speed: more modules to watch = slightly slower HMR
- Dev tools compatibility: some packages interfere with React DevTools or cause console noise

## Research Process

1. **Check the package size**: Use Perplexity or web search for "[package name] bundle size
   gzipped" — bundlephobia.com is a reliable source
2. **Check compatibility**: Search for "[package name] Next.js [version]" or
   "[package name] React [version]" for known issues
3. **Check the dep tree**: `pnpm ls [package]` shows what it pulls in
4. **Compare alternatives**: If there are competing packages, compare bundle sizes,
   compatibility, and maintenance status

## Output Format

Present findings as a clear table:

| Concern | Impact | Why |
|---------|--------|-----|
| Bundle size on other pages | Zero / Low / Medium / High | [explanation] |
| Build time | +X% / Negligible | [explanation] |
| PWA / Service Worker | None / Needs config | [explanation] |
| Conflicts with [existing pkg] | None / Risk | [explanation] |
| SSR compatibility | Compatible / Needs ssr:false | [explanation] |
| Serverless cold starts | None / +Xms | [explanation] |
| Dev server RAM | +XMB | [explanation] |

End with a clear recommendation: "Safe to add" with any specific precautions, or
"Consider alternatives" with what those alternatives are.

## The One Rule

Don't just say "it's fine." Show the work. Tell the user the specific bundle size, the
specific isolation mechanism, and the specific effect on their specific pages. They're
asking because they care about their app's performance — respect that with concrete data.
