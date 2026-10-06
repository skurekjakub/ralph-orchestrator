import { CliType } from "../../config/types";
import type { ICliRuntime } from "../cli-runtime";
import { COPILOT_CREDENTIALS } from "../credential-catalog";
import { COPILOT_MODEL_POLICY } from "../model-catalog";
import { COPILOT_CONTAINER_LAYOUT } from "./copilot-layout";

/** GitHub Copilot CLI: dotted model ids, `GH_TOKEN` auth, home and logs under `/workspace/.ralph`. */
export class CopilotRuntime implements ICliRuntime {
  readonly cli = CliType.Copilot;
  readonly layout = COPILOT_CONTAINER_LAYOUT;
  readonly models = COPILOT_MODEL_POLICY;
  readonly credentials = COPILOT_CREDENTIALS;
}
