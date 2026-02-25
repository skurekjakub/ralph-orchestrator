## LLM Rewriting Strategies

Rewriting with LLMs can mean several things — here's a breakdown of the main approaches:

---

### **Prompt-Level Strategies**

**Iterative refinement** — Pass the output back to the model with critique instructions: *"Here is your previous response. Improve it by [criterion]."* Works well for tone, clarity, and structure.

**Self-critique + rewrite** — Ask the model to first critique its own output, then rewrite based on that critique. Separating the two steps reduces sycophancy.

**Persona anchoring** — Specify a style target: *"Rewrite this as a senior technical writer would."* Anchoring to a persona constrains the output more reliably than abstract style descriptors.

**Contrastive examples** — Provide a "before" (bad) and "after" (good) example pair before asking for the rewrite. Few-shot framing is one of the most reliable ways to transfer style.

---

### **Architectural / Pipeline Strategies**

**Multi-agent rewriting** — One model drafts, a second model rewrites or edits. Specialization reduces the need for a single model to do conflicting things simultaneously.

**Reward-guided rewriting** — Use a scorer (another LLM or a classifier) to evaluate rewrites and select the best candidate among N samples. Simple but effective.

**Chain-of-thought editing** — Ask the model to reason about *what* needs to change before making changes. This improves targeted edits vs. wholesale rewriting.

**Constrained decoding** — At inference time, enforce lexical or structural constraints (e.g., keyword must appear, max length) using techniques like FUDGE or grammar-constrained generation.

---

### **Task-Specific Approaches**

| Goal | Strategy |
|---|---|
| Simplification | Specify reading level; use Flesch–Kincaid targets in prompt |
| Style transfer | Contrastive few-shot + persona |
| Paraphrase (preserve meaning) | Explicitly instruct to keep all facts; verify with entailment check |
| SEO / keyword insertion | Provide keyword list + ask model to integrate naturally |
| Formality adjustment | Instruction + example of target register |
| Detoxification | Classifier-in-the-loop to flag and rewrite flagged spans |

---

### **Common Pitfalls to Avoid**

- **Meaning drift** — Aggressive rewriting causes the model to hallucinate or drop facts. A post-hoc consistency check (LLM-as-judge) helps catch this.
- **Style collapse** — Asking for too many simultaneous changes causes the model to revert to a generic voice. Change one dimension at a time.
- **Over-editing** — Models often rewrite things that didn't need changing. Instruction like *"only change what is necessary"* or diff-style prompting helps.
- **Prompt sensitivity** — Small wording changes in rewrite instructions cause large output variance. Lock down prompts with evals before productionizing.

---

### **Evaluation**

Good rewriting pipelines pair automated metrics (BERTScore, BLEU for controlled tasks, LLM-as-judge) with human preference ratings. Without evals, it's hard to tell if a rewrite strategy is actually improving anything.

Want me to go deeper on any particular area — like pipeline architecture, specific use cases, or evaluation methods?


## LLM Rewriting in RAG Pipelines

There are a few distinct places rewriting shows up in RAG — they solve very different problems.

---

### **1. Query Rewriting (Pre-Retrieval)**

The most common use. The user's raw query is often a poor retrieval signal, so you rewrite it before hitting the vector store or search index.

**HyDE (Hypothetical Document Embeddings)** — Generate a hypothetical answer to the query, then embed *that* for retrieval. The intuition is that a generated answer lives closer in embedding space to real documents than the question does.

**Step-back prompting** — Rewrite the specific query into a more general/abstract form. *"What medications interact with ibuprofen?"* → *"NSAID drug interactions."* Retrieves broader, more foundational context.

**Multi-query expansion** — Generate N paraphrases of the query, retrieve for each, then union or rank-fuse the results. Increases recall at the cost of retrieval latency.

**Query decomposition** — Break a complex question into sub-queries, retrieve for each independently, then synthesize. Useful for multi-hop questions.

---

### **2. Document / Chunk Rewriting (Pre-Index or Pre-Prompt)**

Rewriting happens at index time or just before the chunk is stuffed into context.

**Chunk summarization** — Summarize long chunks before indexing. Reduces noise and token cost, but risks losing detail. Works well when documents are verbose.

**Proposition indexing** — Decompose documents into atomic factual statements ("propositions"), index those instead of raw chunks. Retrieval becomes much more precise. Introduced in the Dense X Retrieval paper.

**Contextual chunk enrichment** — Before indexing, rewrite each chunk to include surrounding context it implicitly relies on (*"In this document about X, the following section discusses..."*). Anthropic's contextual retrieval does this.

**Metadata extraction** — Use an LLM to extract structured metadata from chunks at index time, then use that to filter or re-rank at retrieval time.

---

### **3. Retrieved Context Rewriting (Post-Retrieval, Pre-Generation)**

The retrieved chunks are messy, redundant, or off-topic — rewrite before feeding to the generator.

**Reranker + summarize** — After reranking, compress the top-k chunks into a shorter synthesis. Reduces context window pressure and removes irrelevant sentences.

**Selective extraction** — Instead of passing whole chunks, extract only the sentences relevant to the query. LLM or cross-encoder does the extraction.

**FLARE (Forward-Looking Active Retrieval)** — The generator produces output incrementally; when confidence is low, it pauses, rewrites a retrieval query based on what it *needs* next, fetches, and continues. Dynamic rather than one-shot retrieval.

---

### **4. Answer Rewriting (Post-Generation)**

The generated answer exists but needs to be grounded, corrected, or reformatted against the retrieved sources.

**Citation grounding** — After generation, rewrite to attach inline citations to specific retrieved chunks. Usually a second LLM pass.

**Faithfulness correction** — Use an LLM-as-judge to detect hallucinated claims, then rewrite only those spans using retrieved evidence. Cheaper than regenerating the whole answer.

**Abstractiveness control** — If the answer is too extractive (just copying chunks), rewrite for fluency; if too abstractive (drifting from sources), rewrite to tighten grounding.

---

### **Where Rewriting Has the Most Leverage**

```
Raw Query → [REWRITE] → Retrieval → Chunks → [REWRITE] → Generator → Answer → [REWRITE]
               ↑                                  ↑                               ↑
          Biggest ROI                      High value for               Useful for citations
          (query quality                   noisy corpora                & faithfulness
          drives everything)
```

Query rewriting generally has the highest ROI because bad retrieval can't be recovered downstream. Post-generation rewriting is the most expensive but can catch faithfulness failures.

---

### **Key Tradeoffs**

| Strategy | Latency cost | Complexity | Best for |
|---|---|---|---|
| Query expansion | Low–medium | Low | Sparse/ambiguous queries |
| HyDE | Low | Low | Semantic search, dense retrieval |
| Proposition indexing | High (index time) | Medium | Precision-critical use cases |
| FLARE | High | High | Long-form, multi-hop generation |
| Post-gen faithfulness rewrite | Medium | Medium | High-stakes outputs |

Want to go deeper on any specific stage — like implementing query decomposition, or faithfulness correction pipelines?