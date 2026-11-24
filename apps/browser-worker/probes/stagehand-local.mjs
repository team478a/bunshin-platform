import assert from 'node:assert/strict';
import { Stagehand } from '@browserbasehq/stagehand';
import { chromium } from 'playwright';

let modelCalls = 0;
const fixtureClient = {
  type: 'synthetic',
  modelName: 'local-fixture',
  hasVision: false,
  clientOptions: {},
  async createChatCompletion({ options }) {
    modelCalls++;
    const pageLine = options.messages
      .flatMap(({ content }) => (typeof content === 'string' ? content.split('\n') : []))
      .find(
        (line) =>
          /button/i.test(line) && line.includes('Fixture Preview') && /\[\d+-\d+\]/.test(line),
      );
    const elementId = pageLine?.match(/\[(\d+-\d+)\]/)?.[1];
    assert.ok(elementId, 'the synthetic client received the button from the real local page');
    const data = {
      elements: [
        {
          elementId,
          description: 'Fixture Preview',
          method: 'click',
          arguments: [],
        },
      ],
    };
    return { data: options.response_model.schema.parse(data) };
  },
};
const stagehand = new Stagehand({
  env: 'LOCAL',
  verbose: 0,
  llmClient: fixtureClient,
  localBrowserLaunchOptions: { headless: true, executablePath: chromium.executablePath() },
});
try {
  await stagehand.init();
  const browser = await chromium.connectOverCDP(stagehand.connectURL());
  const page = browser.contexts()[0].pages()[0];
  await page.goto('data:text/html,<h1>Fixture</h1><button>Fixture Preview</button>');
  const stagehandPage = stagehand.context.pages()[0];
  const observations = await stagehand.observe('Find the Fixture Preview button', {
    page: stagehandPage,
  });
  assert.equal(modelCalls, 1);
  assert.equal(observations.length, 1);
  assert.equal(observations[0].description, 'Fixture Preview');
  console.log(
    JSON.stringify({ mode: 'LOCAL', cdp: true, observed: true, syntheticCalls: modelCalls }),
  );
} finally {
  await stagehand.close();
}
