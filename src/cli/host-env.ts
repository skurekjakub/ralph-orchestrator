/** Variables a host CLI process takes from the orchestrator's environment besides its credential. */
const INHERITED_VARS = ["PATH", "HOME", "LANG"] as const;

/**
 * The whole environment of a CLI process the orchestrator runs on the host: `PATH`, `HOME` and `LANG` from
 * `source`, the values of `credentialVars`, then `extra`. Spawn the process with execa's `extendEnv: false`, so
 * no other orchestrator variable, such as `ADO_PAT`, a `JIRA_*` credential or another CLI's token, reaches it.
 *
 * @param source The orchestrator's environment; unset and empty variables are left out.
 * @param credentialVars Names of the variables the CLI authenticates with.
 * @param extra CLI-specific variables, which win over the inherited ones.
 */
export function hostCliEnv(
  source: Readonly<Record<string, string | undefined>>,
  credentialVars: readonly string[],
  extra: Readonly<Record<string, string>> = {},
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of [...INHERITED_VARS, ...credentialVars]) {
    const value = source[name];
    if (value) env[name] = value;
  }
  return { ...env, ...extra };
}
