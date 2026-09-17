import { describe, expect, it } from 'vitest';
import { legalLinksForPathname } from '../app/ui/site-footer-links';

describe('site footer legal links', () => {
  it('uses the published service documents throughout a service route', () => {
    expect(legalLinksForPathname('/s/watashi-works-official/manage/line')).toEqual({
      terms: '/s/watashi-works-official/terms',
      privacy: '/s/watashi-works-official/privacy',
    });
  });

  it('keeps platform links outside service routes', () => {
    expect(legalLinksForPathname('/login')).toEqual({
      terms: '/terms',
      privacy: '/privacy',
    });
  });
});
