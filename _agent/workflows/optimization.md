# Optimization
In: a perf goal. Out: a measured before/after, or an explicit "unmeasured".
1. Take a baseline first: `window.__loadTiming`, the `[Perf]` console lines, the F3 overlay, performance.memory. Record it in the docs/DEVELOPMENT_STATUS.md table.
2. Make one change at a time, trying renderer switches before removing content (DECISIONS).
3. Re-measure under the same conditions. Claim no speedup without both numbers.
4. For the city payload, use `tools/objstats.mjs` and `tools/slim-city.mjs`.
