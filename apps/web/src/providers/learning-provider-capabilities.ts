import type { LearningAiRequest } from '@bunshin/application';

/** Inputs above this bound require an explicitly configured long-context capability. */
export const LEARNING_LONG_CONTEXT_THRESHOLD_BYTES = 32_768;

export function assertLearningProviderCapabilities(request: LearningAiRequest) {
  const capabilities = new Set(request.modelCapabilities);
  if (!capabilities.has('STRUCTURED_OUTPUT'))
    throw new Error('learning model capability unavailable: STRUCTURED_OUTPUT');
  if (request.serializedPrompt.includes('"type":"input_image"') && !capabilities.has('IMAGE_INPUT'))
    throw new Error('learning model capability unavailable: IMAGE_INPUT');
  if (
    Buffer.byteLength(request.serializedPrompt, 'utf8') > LEARNING_LONG_CONTEXT_THRESHOLD_BYTES &&
    !capabilities.has('LONG_CONTEXT')
  )
    throw new Error('learning model capability unavailable: LONG_CONTEXT');
}
