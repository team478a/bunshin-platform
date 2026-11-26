import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { fixturePlan } from '../src/fixture';
import { composeFixtureMaterial } from '../src/material-content';

describe('verified browser material', () => {
  it('ties each instruction to a real image and makes a cropped detail from visible geometry', async () => {
    const png = await sharp({
      create: { width: 200, height: 120, channels: 3, background: 'white' },
    })
      .composite([
        {
          input: { create: { width: 20, height: 10, channels: 3, background: 'green' } },
          left: 55,
          top: 40,
        },
      ])
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
    const material = await composeFixtureMaterial(
      plan,
      { steps: proof },
      new AbortController().signal,
    );
    expect(material.steps.map((step) => step.stepId)).toEqual(proof.map((step) => step.stepId));
    expect(material.steps[0]?.instruction).toContain('入力画面へ');
    const detail = material.steps[0]?.detailImage;
    expect(detail).toBeTruthy();
    expect(material.steps[1]?.detailImage).toBeNull();
    expect(await sharp(detail!).metadata()).toMatchObject({
      format: 'webp',
      width: 60,
      height: 50,
    });
    const closeUp = await sharp(detail!).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => {
      const offset = (y * closeUp.info.width + x) * closeUp.info.channels;
      return [...closeUp.data.subarray(offset, offset + 3)];
    };
    const frame = pixel(13, 25);
    expect(frame[0]).toBeGreaterThan(180);
    expect(frame[1]).toBeLessThan(110);
    // The crop leaves white space between the target, its outline, and the image edge.
    expect(pixel(17, 25).every((channel) => channel > 220)).toBe(true);
    expect(pixel(43, 25).every((channel) => channel > 220)).toBe(true);
    expect(pixel(3, 25).every((channel) => channel > 220)).toBe(true);
    const marked = await sharp(material.steps[0]!.beforeImage)
      .extract({ left: 37, top: 42, width: 1, height: 1 })
      .raw()
      .toBuffer();
    expect(marked[0]).toBeGreaterThan(180);
    expect(marked[1]).toBeLessThan(100);
    await expect(
      composeFixtureMaterial(plan, { steps: [...proof].reverse() }, new AbortController().signal),
    ).rejects.toMatchObject({ category: 'INVALID_PLAN' });
  });
});
