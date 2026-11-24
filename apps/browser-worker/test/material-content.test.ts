import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { fixturePlan } from '../src/fixture';
import { composeFixtureMaterial } from '../src/material-content';

describe('verified browser material', () => {
  it('ties each instruction to a real image and makes a cropped detail from visible geometry', async () => {
    const png = await sharp({
      create: { width: 200, height: 120, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer();
    const plan = fixturePlan('mobile');
    const target = { x: 35, y: 40, width: 20, height: 10, viewportWidth: 200, viewportHeight: 120 };
    const proof = plan.steps.map(({ id, action }, index) => ({
      stepId: id,
      action,
      beforePng: png,
      afterPng: png,
      ...(index === 0 ? { target } : {}),
    }));
    const material = await composeFixtureMaterial(plan, proof, new AbortController().signal);
    expect(material.steps.map((step) => step.stepId)).toEqual(proof.map((step) => step.stepId));
    expect(material.steps[0]?.instruction).toContain('入力画面へ');
    const detail = material.steps[0]?.detailImage;
    expect(detail).toBeTruthy();
    expect(material.steps[1]?.detailImage).toBeNull();
    expect(await sharp(detail!).metadata()).toMatchObject({
      format: 'webp',
      width: 100,
      height: 90,
    });
    const marked = await sharp(material.steps[0]!.beforeImage)
      .extract({ left: 37, top: 42, width: 1, height: 1 })
      .raw()
      .toBuffer();
    expect(marked[0]).toBeGreaterThan(180);
    expect(marked[1]).toBeLessThan(100);
    await expect(
      composeFixtureMaterial(plan, [...proof].reverse(), new AbortController().signal),
    ).rejects.toMatchObject({ category: 'INVALID_PLAN' });
  });
});
