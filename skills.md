
if you need to confirm anything during the resaerch phsae just ask me

## Progressive disclosure

Gemini said
Here are the latest sources from late 2025 and early 2026 that verify exactly how this architecture works, confirming the progressive disclosure, context bloat management, and explicit invocation mechanics of GitHub Copilot Agent Skills.

1. Verification of "Progressive Disclosure" and Lazy Loading
The concept of the agent only reading the "metadata" first and loading the heavy instructions later is formally known as Progressive Disclosure. This was heavily documented during the January 2026 VS Code v1.109 release cycle.

DEV Community (February 24, 2026) - "GitHub Copilot Skills: Reusable AI Workflows for DevOps and SREs":

"The key idea is progressive loading: Copilot first uses the Skill name and description for discovery. If the request matches, it loads the Skill instructions. It only loads extra resources when the Skill references them."

WeAreCommunity Pro .NET (February 21, 2026) - "It doesn't teach you in school: GitHub Copilot Agent Skills":

"They are only invited into the conversation when they are relevant to the task at hand. Discovery: Copilot reads only the name and description of your skills at startup. Activation: The full, 'heavy' instructions are only loaded if your prompt matches the skill's description."

2. Verification of Explicit Routing (Bypassing Discovery)
You were exactly right about being able to explicitly call a skill to save time and bypass the agent's semantic guessing game.

Visual Studio Magazine (January 11, 2026) - "Hands On with New Experimental GitHub Copilot 'Agent Skills' in VS Code":

"In the chat input, type a command that matches your skill's description. I typed: clean this article [to invoke the specific skill]..."

DEV Community (February 24, 2026):

"There are two ways Skills help you day-to-day: Manual invocation... and Automatic discovery. To invoke a Skill manually, type / in the chat input, pick the Skill, and then add any extra context." (Note: You can configure the SKILL.md frontmatter with disable-model-invocation: true to force it to only be used as a manual slash command).

3. Verification of "Context Bloat" and the Need for Modularity
My warning about the 1,000-line skill staying in the context window and dragging down performance (Context Rot) is a highly documented architectural constraint of current LLMs, specifically addressed by Microsoft engineers this year.

Microsoft DevBlogs (January 21, 2026) - "Context-Driven Development: Agent Skills for Microsoft Foundry and Azure":

"Avoiding Context Rot: Do not load all skills at once. Context rot occurs when your agent's context window gets cluttered with irrelevant information, degrading output quality. Loading everything will dilute the agent's attention across unrelated domains and waste precious context window tokens."

Smithery.ai / Claude Skills Architecture (February 2026) - "Progressive Disclosure Architecture for Skills":

"Progressive disclosure is an architectural pattern that optimizes context window usage by loading information incrementally... Symptoms that indicate you need this: Skills over 500 lines... Context window filling up quickly. Core principle: SKILL.md is a table of contents, not an encyclopedia."
+1

By breaking your workflows into smaller .github/skills/ folders, using concise YAML descriptions, and keeping your SKILL.md files under 500 lines by delegating to /assets/ and /references/, you are building the exact "Pyramid of Context" that Microsoft and GitHub currently recommend.