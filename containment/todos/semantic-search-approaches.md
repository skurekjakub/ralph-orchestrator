Yeah, exactly. It's query rewriting with an extra step — instead of rewriting the query into better keywords, you rewrite it into a fake answer and embed that instead. Same fundamental idea, just exploiting the embedding space geometry.

The genuinely more interesting retrieval techniques that Discourse isn't doing yet are:

**ColBERT / late interaction** — instead of collapsing a whole document into one vector, you keep per-token vectors and do a MaxSim operation at query time. Much better recall on long posts, but storage is expensive (~100x more vectors).

**SPLADE** — learned sparse representation that gives you BM25-like exact-match behavior but with neural term weighting. Best of both worlds without needing two separate indices and a fusion step.

**Hypothetical Document *Embeddings* (the real HyDE insight)** — the interesting part isn't the rewriting, it's that answer-space embeddings are geometrically tighter than question-space embeddings. A question and its answer can be far apart in embedding space even with a good model. HyDE sidesteps that by staying in answer-space throughout. That's the actual contribution, not just "rewrite the query."

**Two-stage reranking** — retrieve 100 candidates cheap, then run a cross-encoder (which reads query + document together, not independently) to reorder the top 10. Cross-encoders are significantly more accurate than bi-encoders for relevance but too slow to run against the whole corpus. This is probably the highest ROI thing Discourse isn't doing.

For a forum specifically, honest assessment: HyDE + pgvector is probably good enough for 90% of use cases. The diminishing returns on adding reranking or SPLADE are real, and the engineering complexity jumps significantly. Where it breaks down is exact-match queries — version numbers, error codes, function names — and that's where the lack of hybrid BM25 fusion actually hurts more than any of the fancy stuff.