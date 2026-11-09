export function personalLearningProfilePreparationEntryEnabled(input: {
  preparationFlag: string | undefined;
  programStatus: string;
}): boolean {
  return input.preparationFlag === 'true' && input.programStatus === 'SUSPENDED';
}
