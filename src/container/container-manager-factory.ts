import { asValue, type AwilixContainer } from "awilix";
import type { OrchestratorCradle, TaskCradle, TaskValues } from "../awilix-cradle-types";
import { asValues } from "../di/registration";
import { repoCachePaths } from "../services/task-workspace-manager";
import { createHostStageExecutor, createStageExecutorFactory } from "./stage-executor-factory";
import { deriveStageProfile, type ContainerManagerFactory } from "./types";

/**
 * Open a task's scope of the root container, in which the scoped task registrations resolve. It holds the task's
 * values, its compose client, which it resolves at once and every stage scope shares, and its `stageExecutors`, whose
 * stage scopes are children of it.
 *
 * @param container The root container, holding the scoped task and stage registrations.
 * @param values The task's variant and its workspace on the host, registered in the scope as values.
 * @throws Error `Profile squid.conf not found` when profile setup has not written the variant's `squid.conf`.
 */
export function openTaskScope(
  container: AwilixContainer<OrchestratorCradle>,
  values: TaskValues,
): AwilixContainer<TaskCradle> {
  const scope = container.createScope<TaskCradle>().register(asValues(values));
  // A scoped registration caches in the scope that resolves it (node_modules/awilix/lib/container.js:348-351 in
  // awilix 13.0.5); as a value, this compose client is the one every child scope resolves.
  scope.register({ compose: asValue(scope.resolve("compose")) });
  return scope.register({ stageExecutors: asValue(createStageExecutorFactory(scope)) });
}

/**
 * The container manager factory over `container`: each task's stack resolves in a task scope of its own and each of
 * its stages' executors in a stage scope of that, while a post-task hook stage's executor resolves in a host stage
 * scope of the root. `create` throws, and `forceDown` rejects, with `Profile squid.conf not found` when profile setup
 * has not written the profile's `squid.conf`.
 *
 * @param container The root container, holding the scoped task and stage registrations.
 */
export function createContainerManagerFactory(container: AwilixContainer<OrchestratorCradle>): ContainerManagerFactory {
  return {
    create: (profile, workspacePath) =>
      openTaskScope(container, { profile, workspacePath }).resolve("containerManager"),
    forceDown: async (profile) => {
      // `down` never reads the workspace mount's source, but compose refuses to load a mount with an empty one.
      const workspacePath = repoCachePaths(container.cradle.rootDir).workspacesDir;
      const compose = openTaskScope(container, { profile, workspacePath }).resolve("compose");
      await compose.compose(["down", "--volumes", "--remove-orphans"]);
    },
    createLocalSession: async (profile, stage, workspace) => {
      const executor = await createHostStageExecutor(container, deriveStageProfile(profile, stage), stage, workspace);
      return { executor, sessionRunner: container.cradle.sessionRunner };
    },
  };
}
