const PROMPT_ONLY_IMAGE_SERVICE_SLUGS = new Set(['sennokuni-media']);

export function isPromptOnlyImageService(serviceSlug: string): boolean {
  return PROMPT_ONLY_IMAGE_SERVICE_SLUGS.has(serviceSlug);
}
