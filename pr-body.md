## Summary

- **14 bug fixes**: hardcoded pink borders, AsanaReportButton silent disable, adverse-media double render, case-store data-loss race condition, super-brain whitespace validation, workbench memory leak (missing AbortController), news-search type suppressor removed, jsPDF private API replaced
- **Auth cleanup**: removed all 14 dead NEXT_PUBLIC_ADMIN_TOKEN references across 9 files — middleware handles token injection server-side, client-side refs were no-ops
- **Module hero enhancements**: computed KPI bars added to enforcement, training, playbook, policies, regulatory, investigation, SAR QA, and batch modules; batch inline hero converted to ModuleHero for consistency

## Test plan

- [ ] TypeScript compiles with zero errors (npx tsc --noEmit)
- [ ] /screening loads, quick-screen fires, adverse-media verdict renders once
- [ ] Asana report button shows retry state on network failure (not permanently hidden)
- [ ] Batch page shows ModuleHero with KPIs after a run
- [ ] All module heroes show KPI bars with correct live counts
- [ ] No NEXT_PUBLIC_ADMIN_TOKEN in client bundle

Generated with Claude Code
