Agent skills are basically tools, but instead of managing external data, they manage agent context. Agents see skills the same way as MCP tools and can call them on demand as necessary. We can use that to leverage when and how much information the agent learns about a particular topic.

Why is this important?

If you feed the agent all the info in detail at the beginning of a longer workflow (by using agent files, long prompts, etc.), by the time it gets to the later parts of the task, it's less and less efficient at recalling and connecting information from way earlier in the conversation.

That’s because between then and now it read a bunch of files, made edits, used tools, generated responses, and in general stuffed its context window full of information thats now evaluated as “more important“ due to how its architecture works.

It’s about what goes in when:

A simple, intuitive way to think about it is that the further (lower/older) something is in the context window, the less likely the LLM is going to process it correctly, especially when it concerns complex tasks.

This is where skills come in: they enable the agent itself to choose when to load specific information into its context (identical to a tool call). And we can use them to curate what the llm knows about best and when.

Example

creating a new documentation page

style guide info when doing a final analysis, self-correction after generating a bunch of content

working with our documentation syntax

creating code examples

taking screenshots

creating guides/modules

and pretty much everything else that’s on demand and doesn’t need to be stuffed inside the prompt itself.

Writing skills

identical to prompts, agent files, and instruction files, skills have a frontmatter block with name and description metadata:

---
name:
description:
---

This is the most important part of the entire skill! 

This is what the agent sees as being in its toolbox. The description needs to cover in detail what the skill enables. Otherwise, the AI may choose to skip it. 

The rest is just regular prompt instructions. See the .github/skills/ folder for details.

Some good practices about authoring skills are covered here: https://dev.to/pwd9000/github-copilot-skills-reusable-ai-workflows-for-devops-and-sres-caf  

TLDR:

1) Bundle references and templates

Keep SKILL.md short and link out to extra files in the same folder:

references/ for short docs you want to load on demand

assets/ for templates (issue templates, runbook templates)

scripts/ for small utilities

2) Keep descriptions keyword-rich

The description is the discovery surface. If you want the Skill to load for DevOps/SRE workflows, include words like:

incident, outage, on-call, pipeline, deployment, rollback

terraform, kubernetes, azure, aws, gcp

security review, compliance, audit

References

https://agentskills.io/home  

https://nayakpplaban.medium.com/agent-skills-standard-for-smarter-ai-bde76ea61c13  

Agent skills in VsCode

https://code.visualstudio.com/docs/copilot/customization/agent-skills 

References:

https://github.com/github/awesome-copilot 

sample skills for inspiration

Remarks - progressive context injection

Is the core design principle that makes the system efficient. Rather than dumping all skill content into the context window upfront, skills use a three-level system that ensures the agent only loads the information it needs, exactly when it needs it.

The three levels are:

Level 1 — Discovery: The agent scans available skills and loads only the metadata (name and description), which typically uses ~50 tokens. This lightweight pass is always-on — Claude knows what skills exist and when to invoke them without any context cost.

Level 2 — Activation: When a user's request matches a skill's description, the agent reads the full SKILL.md file (typically 2,000–5,000 tokens) into its context. This only happens when the skill is relevant.

Level 3 — Execution: Claude reads only the files needed for each specific task. A skill can include dozens of reference files, but if your task only needs the sales schema, Claude loads just that one file. The rest remain on the filesystem consuming zero tokens. When scripts are invoked, only the output enters context — the script code itself never does.