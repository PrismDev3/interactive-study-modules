# Agent usage rules
- Default to one agent working sequentially. Grep, Glob and Read directly, since a subagent starts cold.
- Spawn a subagent only when all of these hold: the user asked, or the work is truly independent and parallel; its scope is a named set of files; its result fits in about 10 lines.
- Never: two agents on the same files, an agent to review what a check or test can prove, or an agent added "for thoroughness".
- A brief states the goal, the exact files and what to return (concise, no full report).
