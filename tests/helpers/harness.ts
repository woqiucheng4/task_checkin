import type { ApplicationDependencies } from "../../src/application/ports.js";
import {
  InMemoryRepository,
  type SeedState,
} from "../../src/infrastructure/in-memory-repository.js";
import { SequenceIdGenerator } from "../../src/shared/ids.js";
import { FixedClock } from "../../src/shared/time.js";

export interface TestHarness extends ApplicationDependencies {
  readonly repository: InMemoryRepository;
  readonly clock: FixedClock;
  readonly ids: SequenceIdGenerator;
}

export function createHarness(seed: SeedState = {}, now = "2026-09-05T10:00:00.000Z"): TestHarness {
  return {
    repository: new InMemoryRepository(seed),
    clock: new FixedClock(now),
    ids: new SequenceIdGenerator(),
  };
}
