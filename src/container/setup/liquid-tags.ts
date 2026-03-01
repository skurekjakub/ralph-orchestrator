import { Tag, type Liquid, type TagToken, type TopLevelToken, type Template, type Context, type Emitter, type Parser } from "liquidjs";

/**
 * Custom `{% section "name" %}...{% endsection %}` block tag.
 *
 * Wraps content in XML semantic boundary tags:
 * ```
 * <name>
 * ...content...
 * </name>
 * ```
 *
 * This gives LLM agents clear structural delimiters between prompt sections
 * (identity, security, workflow, api-references, etc.), improving recall
 * and reducing prompt injection surface.
 */
export class SectionTag extends Tag {
  private sectionName: string;
  private templates: Template[];

  constructor(tagToken: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(tagToken, remainTokens, liquid);
    this.sectionName = tagToken.args.trim().replace(/^["']|["']$/g, "");
    this.templates = [];

    while (remainTokens.length) {
      const token = remainTokens.shift()!;
      if ((token as TagToken).name === "endsection") return;
      this.templates.push(parser.parseToken(token, remainTokens));
    }
    throw new Error(`{% section "${this.sectionName}" %} not closed`);
  }

  *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    emitter.write(`<${this.sectionName}>\n`);
    yield this.liquid.renderer.renderTemplates(this.templates, ctx, emitter);
    emitter.write(`\n</${this.sectionName}>`);
  }
}

/** Register all custom tags on a Liquid engine instance. */
export function registerCustomTags(engine: Liquid): void {
  engine.registerTag("section", SectionTag);
}
