import { asValue, type AwilixContainer } from "awilix";
import type { OrchestratorCradle, TaskCradle, TaskValues } from "../awilix-cradle-types";
import type { Registrations } from "../di/registration";
import { repoCachePaths } from "../services/task-workspace-manager";
import { deriveStageProfile, type ContainerManagerFactory } from "./types";

/**
 * Open a task's scope of the root container. The scoped task registrations, registered at the root, resolve in it.
 *
 * @param values The task's variant and its workspace on the host.
 */
export function openTaskScope(
  container: AwilixContainer<OrchestratorCradle>,
  { profile, workspacePath }: TaskValues,
): AwilixContainer<TaskCradle> {
  const values: Registrations<TaskValues> = { profile: asValue(profile), workspacePath: asValue(workspacePath) };
  return container.createScope<TaskCradle>().register(values);
}

/**
 * The container manager factory over `container`: each task's stack resolves in a task scope of its own, and a
 * host stage's session from the root. `create` throws, and `forceDown` rejects, with `Profile squid.conf not found`
 * when profile setup has not written the profile's `squid.conf`.
 *
 * @param container The root container, holding the scoped task registrations.
 */
export function createContainerManagerFactory(container: AwilixContainer<OrchestratorCradle>): ContainerManagerFactory {
  return {
    create: (profile, workspacePath) => {
      const scope = openTaskScope(container, { profile, workspacePath });
      // A scoped registration caches in the scope that resolves it; as a value, child scopes inherit this client.
      scope.register({ compose: asValue(scope.resolve("compose")) });
      return scope.resolve("containerManager");
    },
    forceDown: async (profile) => {
      // `down` never reads the workspace mount's source, but compose refuses to load a mount with an empty one.
      const workspacePath = repoCachePaths(container.cradle.rootDir).workspacesDir;
      const compose = openTaskScope(container, { profile, workspacePath }).resolve("compose");
      await compose.compose(["down", "--volumes", "--remove-orphans"]);
    },
    createLocalSession: async (profile, stage, workspace) => {
      const { executorFactory, containerLogger, sessionRunner } = container.cradle;
      const stageProfile = deriveStageProfile(profile, stage);
      const executor = await executorFactory.createLocal(stageProfile, stage, workspace, containerLogger);
      return { executor, sessionRunner };
    },
  };
}
