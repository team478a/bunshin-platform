import {
  browserFormFixtureVersion,
  browserFormStepLimit,
  browserObservedFixtureVersion,
  browserObservedStepLimit,
} from '@bunshin/capability-browser';
import {
  observedCatalogue,
  observedCatalogueGoal,
  observedCatalogueMaterial,
} from './observed-catalogue';
import { observedForm, observedFormGoal, observedFormMaterial } from './observed-form';

const observedScenarios = {
  [browserObservedFixtureVersion]: {
    fixture: observedCatalogue,
    goal: observedCatalogueGoal,
    material: observedCatalogueMaterial,
    maxSteps: browserObservedStepLimit,
    form: false,
  },
  [browserFormFixtureVersion]: {
    fixture: observedForm,
    goal: observedFormGoal,
    material: observedFormMaterial,
    maxSteps: browserFormStepLimit,
    form: true,
  },
} as const;

export type ObservedVersion = keyof typeof observedScenarios;

export const isObservedVersion = (version: unknown): version is ObservedVersion =>
  version === browserObservedFixtureVersion || version === browserFormFixtureVersion;

export const observedScenario = (version: ObservedVersion) => observedScenarios[version];
