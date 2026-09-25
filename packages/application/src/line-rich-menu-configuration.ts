import { ApplicationError } from '@bunshin/shared';

import { validateAdminReason } from './admin-configuration-validation';
import {
  LINE_CONFIGURATION_ENVIRONMENTS,
  type LineConfigurationEnvironment,
} from './configuration-environment';
export const LINE_RICH_MENU_ACTIONS = [
  'OPEN_TODAY',
  'OPEN_BUNSHINS',
  'OPEN_NOTIFICATION_SETTINGS',
  'OPEN_ACCOUNT',
] as const;
export type LineRichMenuAction = (typeof LINE_RICH_MENU_ACTIONS)[number];
export type LineRichMenuStatus = 'DRAFT' | 'VERIFIED' | 'ACTIVE' | 'DISABLED' | 'ERROR';
export interface LineRichMenuArea {
  action: LineRichMenuAction;
  x: number;
  y: number;
  width: number;
  height: number;
  sortOrder: number;
}
export interface LineRichMenu {
  id: string;
  environment: LineConfigurationEnvironment;
  version: number;
  name: string;
  description: string | null;
  status: LineRichMenuStatus;
  imageObjectKey: string;
  imageSha256: string;
  imageContentType: string;
  imageWidth: number;
  imageHeight: number;
  lineRichMenuId: string | null;
  lastSyncedAt: Date | null;
  lastErrorCategory: string | null;
  areas: LineRichMenuArea[];
  createdAt: Date;
  updatedAt: Date;
}
export interface LineRichMenuRepository {
  listForAdmin(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
  }): Promise<LineRichMenu[] | null>;
  getForPublish(input: {
    actorUserId: string;
    richMenuId: string;
    environment: LineConfigurationEnvironment;
    operation: 'PUBLISH' | 'DISABLE';
  }): Promise<LineRichMenu | null>;
  createDraft(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
    name: string;
    description: string | null;
    imageObjectKey: string;
    imageSha256: string;
    imageContentType: string;
    imageWidth: number;
    imageHeight: number;
    areas: LineRichMenuArea[];
  }): Promise<LineRichMenu | null>;
  markVerified(input: {
    actorUserId: string;
    richMenuId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
  }): Promise<LineRichMenu | null>;
  activate(input: {
    actorUserId: string;
    richMenuId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
    lineRichMenuId: string;
    syncedAt: Date;
  }): Promise<LineRichMenu | null>;
  disable(input: {
    actorUserId: string;
    richMenuId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
    syncedAt: Date;
  }): Promise<LineRichMenu | null>;
}
export interface LineRichMenuProviderPort {
  publish(input: {
    menu: LineRichMenu;
    idempotencyKey: string;
  }): Promise<{ lineRichMenuId: string }>;
  disable(input: { lineRichMenuId: string; idempotencyKey: string }): Promise<void>;
}

function validateRichMenuAreas(areas: LineRichMenuArea[], width: number, height: number) {
  if (areas.length !== 4 || new Set(areas.map((item) => item.action)).size !== 4)
    throw new ApplicationError('VALIDATION_ERROR', 'all rich menu actions are required');
  if (areas.some((item) => !LINE_RICH_MENU_ACTIONS.includes(item.action)))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid rich menu action');
  for (const area of areas) {
    if (![area.x, area.y, area.width, area.height, area.sortOrder].every(Number.isSafeInteger))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid rich menu area');
    if (
      area.x < 0 ||
      area.y < 0 ||
      area.width < 1 ||
      area.height < 1 ||
      area.x + area.width > width ||
      area.y + area.height > height
    )
      throw new ApplicationError('VALIDATION_ERROR', 'rich menu area is outside image');
  }
  for (let left = 0; left < areas.length; left += 1) {
    for (let right = left + 1; right < areas.length; right += 1) {
      const a = areas[left]!;
      const b = areas[right]!;
      if (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
      )
        throw new ApplicationError('VALIDATION_ERROR', 'rich menu areas overlap');
    }
  }
}
export class CreateLineRichMenuDraft {
  constructor(private readonly repository: LineRichMenuRepository) {}
  async execute(input: Parameters<LineRichMenuRepository['createDraft']>[0]) {
    if (!LINE_CONFIGURATION_ENVIRONMENTS.includes(input.environment))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid environment');
    const name = input.name.trim();
    if (name.length < 1 || name.length > 120 || !/^[a-f0-9]{64}$/.test(input.imageSha256))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid rich menu');
    if (
      !['image/png', 'image/jpeg'].includes(input.imageContentType) ||
      input.imageWidth !== 2500 ||
      ![843, 1686].includes(input.imageHeight)
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid rich menu image');
    if (
      !input.imageObjectKey.startsWith(`${input.environment.toLowerCase()}/line-rich-menus/`) ||
      input.imageObjectKey.includes('..')
    )
      throw new ApplicationError('VALIDATION_ERROR', 'unsafe image object key');
    validateRichMenuAreas(input.areas, input.imageWidth, input.imageHeight);
    const value = await this.repository.createDraft({
      ...input,
      name,
      description: input.description?.trim() || null,
      reason: validateAdminReason(input.reason),
    });
    if (value === null) throw new ApplicationError('FORBIDDEN', 'super admin required');
    return value;
  }
}
export class VerifyLineRichMenu {
  constructor(private readonly repository: LineRichMenuRepository) {}
  async execute(input: Parameters<LineRichMenuRepository['markVerified']>[0]) {
    const value = await this.repository.markVerified({
      ...input,
      reason: validateAdminReason(input.reason),
    });
    if (!value) throw new ApplicationError('NOT_FOUND', 'rich menu not found');
    return value;
  }
}
export class ListLineRichMenus {
  constructor(private readonly repository: LineRichMenuRepository) {}
  async execute(input: Parameters<LineRichMenuRepository['listForAdmin']>[0]) {
    const value = await this.repository.listForAdmin(input);
    if (value === null) throw new ApplicationError('FORBIDDEN', 'admin required');
    return value;
  }
}
export class PublishLineRichMenu {
  constructor(
    private readonly repository: LineRichMenuRepository,
    private readonly provider: LineRichMenuProviderPort,
  ) {}
  async execute(input: {
    actorUserId: string;
    richMenuId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
  }) {
    const reason = validateAdminReason(input.reason);
    const menu = await this.repository.getForPublish({ ...input, operation: 'PUBLISH' });
    if (menu === null) throw new ApplicationError('NOT_FOUND', 'verified rich menu not found');
    if (menu.status !== 'VERIFIED' && menu.status !== 'ACTIVE')
      throw new ApplicationError('CONFLICT', 'rich menu must be verified');
    const idempotencyKey = `LINE_RICH_MENU_PUBLISH:${menu.environment}:${menu.id}:${menu.version}`;
    const published = await this.provider.publish({ menu, idempotencyKey });
    const value = await this.repository.activate({
      ...input,
      reason,
      lineRichMenuId: published.lineRichMenuId,
      syncedAt: new Date(),
    });
    if (value === null) throw new ApplicationError('NOT_FOUND', 'rich menu not found');
    return value;
  }
}
export class DisableLineRichMenu {
  constructor(
    private readonly repository: LineRichMenuRepository,
    private readonly provider: LineRichMenuProviderPort,
  ) {}
  async execute(input: {
    actorUserId: string;
    richMenuId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
  }) {
    const reason = validateAdminReason(input.reason);
    const menu = await this.repository.getForPublish({ ...input, operation: 'DISABLE' });
    if (menu === null || menu.status !== 'ACTIVE' || menu.lineRichMenuId === null)
      throw new ApplicationError('NOT_FOUND', 'published rich menu not found');
    await this.provider.disable({
      lineRichMenuId: menu.lineRichMenuId,
      idempotencyKey: `LINE_RICH_MENU_DISABLE:${menu.environment}:${menu.id}:${menu.version}`,
    });
    const value = await this.repository.disable({
      ...input,
      reason,
      syncedAt: new Date(),
    });
    if (value === null) throw new ApplicationError('NOT_FOUND', 'rich menu not found');
    return value;
  }
}
