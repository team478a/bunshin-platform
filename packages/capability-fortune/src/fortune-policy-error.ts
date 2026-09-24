export class FortunePolicyError extends Error {
  constructor(
    readonly code:
      | 'INVALID_RANDOM_VALUE'
      | 'INVALID_THEME'
      | 'INVALID_FEEDBACK'
      | 'INVALID_READING_OUTPUT'
      | 'INVALID_KNOWLEDGE_PACK'
      | 'UNSAFE_READING_OUTPUT'
      | 'NOT_AVAILABLE'
      | 'NOT_PARTICIPANT'
      | 'KNOWLEDGE_NOT_READY'
      | 'READING_NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'FortunePolicyError';
  }
}
