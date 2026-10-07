import {
  asClass,
  asFunction,
  asValue,
  type BuildResolver,
  type Constructor,
  type FunctionReturning,
  type Resolver,
} from "awilix";

type Expand<T> = T extends infer U ? { [K in keyof U]: U[K] } : never;

/** Keys of deps object `D` that cradle `C` lacks (optional keys included) or provides with an incompatible type. */
type Unsatisfied<C, D> = Expand<{
  [K in keyof D as K extends keyof C ? (C[K] extends D[K] ? never : K) : K]-?: D[K];
}>;

type DepsOf<F> = F extends new (deps: infer D) => unknown ? D : never;

/** `unknown` when cradle `C` provides every dep `F`'s constructor takes, else a type naming the unprovided deps. */
type CradleProvides<C, F> = [keyof Unsatisfied<C, DepsOf<F>>] extends [never]
  ? unknown
  : { "deps the cradle does not provide": Unsatisfied<C, DepsOf<F>> };

/** Every token of cradle `C` mapped to a resolver of its type: a missing or extra token fails tsc. */
export type Registrations<C> = { [K in keyof C]: Resolver<C[K]> };

/**
 * Registration helpers checked against cradle `C` (awilix `InjectionMode.PROXY`).
 *
 * `service` takes a class whose first constructor parameter is a deps object every key of which `C` provides
 * with a compatible type; further constructor parameters must be optional, since PROXY passes only the cradle.
 * `factory` takes a function whose parameter is `C` itself. Neither sets a lifetime.
 */
export function wiring<C extends object>(): {
  service<F extends new (deps: never) => unknown>(ctor: F & CradleProvides<C, F>): BuildResolver<InstanceType<F>>;
  factory<R>(fn: (deps: C) => R): BuildResolver<R>;
} {
  return {
    service: <F extends new (deps: never) => unknown>(ctor: F & CradleProvides<C, F>) =>
      asClass(ctor as unknown as Constructor<InstanceType<F>>),
    factory: <R>(fn: (deps: C) => R) => asFunction(fn as FunctionReturning<R>),
  };
}

/**
 * A value registration of each property of `values`, under the property's name.
 *
 * @param values A plain object whose every key is an own enumerable string property: `Object.entries` reads no other,
 *   so a class instance would lose its prototype members. The `Record` bound rejects class and interface types.
 */
export function asValues<V extends Record<string, unknown>>(values: V): Registrations<V> {
  return Object.fromEntries(Object.entries(values).map(([name, value]) => [name, asValue(value)])) as Registrations<V>;
}
