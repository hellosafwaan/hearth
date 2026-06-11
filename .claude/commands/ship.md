---
description: Prepare the current work for the owner to stage and commit
---

Prepare the current working-tree changes for hand-off. Never run `git add` or `git commit`.

1. Run the full gate (`pnpm compile && pnpm test && pnpm lint && pnpm build`). If anything
   fails, fix it first — do not hand off red work.
2. Run `git status --short` and `git diff --stat` to enumerate what changed.
3. If ROADMAP.md is affected by this work (item finished, new item discovered), update it and
   include it in the file list.
4. Output, in this exact structure:
   - A one-paragraph summary of what changed and why.
   - A copy-pasteable `git add <files>` command listing exactly the files belonging to this
     unit of work (exclude unrelated modified/untracked files; call them out separately if any
     exist).
   - A suggested one-line commit message following the repo style
     (`v<N>: <summary>` for feature versions, `fix:`/`test:`/`docs:`/`refactor:` prefixes
     otherwise — see `git log --oneline` for precedent).
