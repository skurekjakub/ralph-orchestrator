he conversion from asFunction → asClass in awilix was driven by eliminating manual wiring boilerplate in the factory.

Before (asFunction):

```tsx
container.register({
  jiraClient: asFunction(({ config, logger }) => 
    new JiraClient(config, logger, retryOpts)
  ),
  poller: asFunction(({ jiraClient, config, logger }) =>
    new JiraPoller(jiraClient, config, logger)
  ),
  // ... repeated for every service
});
```

Each registration was a hand-written factory function that received the cradle, destructured what it needed, and called the constructor with positional args. This worked but was pure boilerplate — every new service required a new wiring function.

After (asClass):

```tsx
container.register({
  jiraClient: asClass(JiraClient),
  poller: asClass(JiraPoller),
  // awilix auto-resolves constructor deps from the cradle
});
```

The primary blocker: InjectionMode.PROXY (used in this project with strict: true) passes the cradle proxy as a single object argument to the constructor. The proxy intercepts property access and resolves dependencies on demand. This requires constructors to use destructured options objects where the keys match cradle registration names:

```tsx
// Won't work with PROXY mode — positional args can't be mapped
constructor(config: IAppConfig, logger: Logger)

// Works — proxy property access resolves 'config' and 'logger' from cradle
constructor({ config, logger }: { config: IAppConfig; logger: Logger })
```

So every constructor (14 classes) needed converting from positional params to a destructured options object, plus all test call sites that constructed those classes directly. That was the bulk of the previous session's work. Once the constructors matched cradle keys, the factory could switch from asFunction(() => new X(...)) to asClass(X) and let awilix handle the wiring automatically.

The config decoupling we just finished was the natural follow-up: since constructor param names must now match cradle keys, having a monolithic config: IAppConfig in the cradle meant every service pulled the entire config even if it only needed one slice. Splitting into jiraConfig, outputConfig, secrets, etc. gives each service exactly what it needs — and the cradle type documents which service depends on wh