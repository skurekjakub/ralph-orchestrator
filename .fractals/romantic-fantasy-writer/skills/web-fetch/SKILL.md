# Web Fetch — Romantic Fantasy Writer

## Purpose

Documents the (limited) web fetch capability available to agents in the romantic-fantasy-writer system. Web access is **disabled by default** for all agents during creative production. This skill explains when web fetch might be enabled and the constraints around it.

## Default: No Web Access

During normal pipeline operation, all agents work entirely from local filesystem artifacts. This ensures:
- **Reproducibility**: The same inputs produce the same outputs regardless of network state
- **Security**: No external content can be injected into the creative pipeline
- **Performance**: No network latency in the creative process
- **Privacy**: Story ideas and draft content are never transmitted externally

## When Web Fetch May Be Enabled

### Pre-Pipeline: Style Sample Retrieval
If the user provides URLs in `styleSamples` (rather than local file paths), the **guide agent** may use web fetch to download reference texts before the pipeline launches. This happens once, during initial configuration:

1. Guide reads `story-config.json.styleSamples`
2. For entries starting with `http://` or `https://`:
   - Fetch the content
   - Save to `.romantic-fantasy-writer/stories/{story-id}/style-samples/{N}.txt`
   - Replace the URL in story-config with the local path
3. All subsequent agents read only local files

### Constraints on Web Fetch
- **Only the guide agent** may use web fetch, and only during configuration
- Maximum file size: 1MB per style sample
- Allowed content types: text/plain, text/html (stripped to text), application/epub (text extraction)
- HTTPS required — no HTTP
- No authentication headers sent
- Fetched content is stored as plain text only

## Reference Text Usage Policy (INV-023, INV-025, INV-028)

Style samples are used **exclusively** for abstract stylistic analysis:
- Sentence rhythm patterns (long/short variation)
- Vocabulary register (formal/informal/archaic)
- Metaphor density and type preferences
- Dialogue-to-narrative ratio
- Paragraph cadence

Style samples are **never**:
- Quoted in output prose
- Used as templates for plot, character, or worldbuilding
- Copied at the phrase, sentence, or paragraph level
- Referenced by title or author in the output

The style-analyzer extracts quantitative parameters from reference texts. These parameters inform the style-guide.json. No reference text content persists beyond the style analysis phase.

## Offline-Only Alternative

For deployments without any web access:
1. Users provide all style samples as local files before running `bootstrap.sh`
2. Place files in the story directory manually
3. Reference them as relative paths in `story-config.json.styleSamples`

This is the recommended approach for maximum reproducibility and security.
