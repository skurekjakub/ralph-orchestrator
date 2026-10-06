import { CliType } from "../../config/types.js";
import type { ICliRuntime } from "../cli-runtime.js";
import { COPILOT_CREDENTIALS } from "../credential-catalog.js";
import { COPILOT_MODEL_POLICY } from "../model-catalog.js";
import { COPILOT_CONTAINER_LAYOUT } from "./copilot-layout.js";

/** GitHub Copilot CLI: dotted model ids, `GH_TOKEN` auth, home and logs under `/workspace/.ralph`. */
export class CopilotRuntime implements ICliRuntime {
  readonly cli = CliType.Copilot;
  readonly layout = COPILOT_CONTAINER_LAYOUT;
  readonly models = COPILOT_MODEL_POLICY;
  readonly credentials = COPILOT_CREDENTIALS;
}
