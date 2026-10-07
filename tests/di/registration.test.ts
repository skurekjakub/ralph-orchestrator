import { asClass, asValue, AwilixResolutionError, createContainer, InjectionMode } from "awilix";
import { describe, expect, it } from "vitest";
import { wiring, type Registrations } from "../../src/di/registration";

interface Greeter {
  greet(): string;
}
interface TestCradle {
  name: string;
  greeter: Greeter;
  shout: string;
}

class NamedGreeter implements Greeter {
  constructor(
    private readonly deps: { name: string },
    private readonly suffix = "!",
  ) {}
  greet(): string {
    return `hi ${this.deps.name}${this.suffix}`;
  }
}
class NeedsMissing implements Greeter {
  constructor(private readonly deps: { name: string; missing: number }) {}
  greet(): string {
    return String(this.deps.missing);
  }
}
class NeedsOptional implements Greeter {
  constructor(private readonly deps: { name: string; optional?: number }) {}
  greet(): string {
    return String(this.deps.optional);
  }
}
class NeedsWrongType implements Greeter {
  constructor(private readonly deps: { name: number }) {}
  greet(): string {
    return String(this.deps.name);
  }
}

function newContainer() {
  return createContainer<TestCradle>({ injectionMode: InjectionMode.PROXY, strict: true });
}

describe("wiring", () => {
  const w = wiring<TestCradle>();

  it("builds a container whose services get their deps from the cradle and keep positional defaults", () => {
    // Arrange
    const registrations: Registrations<TestCradle> = {
      name: asValue("ralph"),
      greeter: w.service(NamedGreeter).singleton(),
      shout: w.factory(({ greeter }) => greeter.greet().toUpperCase()).singleton(),
    };
    const container = newContainer();

    // Act
    container.register(registrations);

    // Assert
    expect(container.cradle.shout).toBe("HI RALPH!");
  });

  it("rejects at compile time a constructor whose deps the cradle does not provide", () => {
    // Arrange
    const container = newContainer();
    container.register({ name: asValue("ralph"), shout: asValue("") });

    // Act
    // @ts-expect-error `missing` is not a cradle token
    w.service(NeedsMissing);
    container.register({ greeter: asClass(NeedsMissing) as never });

    // Assert
    expect(() => container.cradle.greeter.greet()).toThrow(AwilixResolutionError);
    expect(() => container.cradle.greeter.greet()).toThrow(/missing/);
  });

  it("rejects at compile time an optional deps key that is not a cradle token", () => {
    // Arrange
    const container = newContainer();
    container.register({ name: asValue("ralph"), shout: asValue("") });

    // Act
    // @ts-expect-error an optional deps key that is not a cradle token throws under PROXY
    w.service(NeedsOptional);
    container.register({ greeter: asClass(NeedsOptional) as never });

    // Assert
    expect(() => container.cradle.greeter.greet()).toThrow(AwilixResolutionError);
    expect(() => container.cradle.greeter.greet()).toThrow(/optional/);
  });

  it("rejects at compile time a deps key whose type the cradle does not match", () => {
    // Arrange
    const container = newContainer();
    container.register({ name: asValue("ralph"), shout: asValue("") });

    // Act
    // @ts-expect-error `name` has the wrong type
    w.service(NeedsWrongType);
    container.register({ greeter: w.service(NamedGreeter).singleton() });

    // Assert
    expect(container.cradle.greeter.greet()).toBe("hi ralph!");
  });

  it("rejects at compile time a factory reading a key the cradle lacks", () => {
    // Arrange
    const container = newContainer();

    // Act
    // @ts-expect-error a factory reading a key the cradle lacks
    const nope = w.factory(({ nope }) => nope);
    container.register({ name: asValue("ralph"), greeter: asValue({ greet: () => "" }), shout: nope });

    // Assert
    expect(() => container.cradle.shout).toThrow(AwilixResolutionError);
    expect(() => container.cradle.shout).toThrow(/nope/);
  });

  it("rejects at compile time a registration object missing a token", () => {
    // Arrange
    const container = newContainer();

    // Act
    // @ts-expect-error `shout` is not registered
    const incomplete: Registrations<TestCradle> = { name: asValue("x"), greeter: w.service(NamedGreeter).singleton() };
    container.register(incomplete);

    // Assert
    expect(() => container.resolve("shout")).toThrow(AwilixResolutionError);
  });
});
