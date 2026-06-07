---
description: Search docs/memory/ for relevant facts and inline the matches.
---
Recall facts about: **$ARGUMENTS**

Search results:
!`grep -rin -- "$ARGUMENTS" docs/memory/ 2>/dev/null | head -40 || echo "(no matches)"`

Summarize the relevant facts above (if any) and how they apply to the current task. If nothing
matches, say so — don't invent. Cite the file for each fact you use.
