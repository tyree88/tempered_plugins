---
name: platform-agent-patterns
description: Use when extracting reusable agents, skills, templates, or workflow patterns from a completed project run, especially after multi-agent implementation, tracker sync, QA gates, or PR closeout.
---

# Platform Agent Patterns

Convert a successful run into reusable agent definitions and skills.

## Workflow

1. **Collect the run**
   - What triggered the work?
   - What steps repeated?
   - Which steps were fragile enough to deserve scripts/templates?
   - Which rules were project-specific versus generic?

2. **Rank candidates**
   - New plugin: multiple skills/tools/templates belong together.
   - New skill: one repeated workflow with clear trigger and procedure.
   - Skill extension: existing skill is close and only needs a new branch of guidance.
   - Template only: output shape repeats but judgment remains context-specific.

3. **Define agents**
   - Agent name, trigger, inputs, outputs, allowed scope, forbidden scope, verification, handoff.
   - Keep agents domain-focused and independently reviewable.

4. **Package patterns**
   - Put stable workflow in `SKILL.md`.
   - Put detailed schemas/examples in `references/`.
   - Put reusable output shapes in `assets/templates/`.
   - Put fragile repeated operations in `scripts/`.

5. **Validate**
   - Check frontmatter.
   - Run plugin/skill validators when available.
   - Test the pattern against a recent real request without leaking the intended answer.

## Output Shape

- Best plugin/skill candidate.
- Why it belongs at that level.
- Included skills/templates/scripts.
- Trigger examples.
- First version scope.
- Deferred automation.

