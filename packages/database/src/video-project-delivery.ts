import type { VideoProjectRepository, VideoProjectReviewRepository } from '@bunshin/application';
import { type PrismaClient, prisma } from './client';
import { PrismaVideoProjectCreationRepository } from './video-project-creation-repository';
import { PrismaVideoProjectPlanningRepository } from './video-project-planning-repository';
import { PrismaVideoProjectReviewRepository } from './video-project-review-repository';

export class PrismaVideoProjectRepository
  implements VideoProjectRepository, VideoProjectReviewRepository
{
  private readonly creation: PrismaVideoProjectCreationRepository;
  private readonly planning: PrismaVideoProjectPlanningRepository;
  private readonly reviews: PrismaVideoProjectReviewRepository;

  constructor(client: PrismaClient = prisma) {
    this.creation = new PrismaVideoProjectCreationRepository(client);
    this.planning = new PrismaVideoProjectPlanningRepository(client);
    this.reviews = new PrismaVideoProjectReviewRepository(client);
  }

  create(input: Parameters<VideoProjectRepository['create']>[0]) {
    return this.creation.create(input);
  }

  findOwned(input: Parameters<VideoProjectRepository['findOwned']>[0]) {
    return this.planning.findOwned(input);
  }

  replacePlan(input: Parameters<VideoProjectRepository['replacePlan']>[0]) {
    return this.planning.replacePlan(input);
  }

  updateNarrationSettings(input: Parameters<VideoProjectRepository['updateNarrationSettings']>[0]) {
    return this.planning.updateNarrationSettings(input);
  }

  approvePlan(input: Parameters<VideoProjectRepository['approvePlan']>[0]) {
    return this.planning.approvePlan(input);
  }

  review(input: Parameters<VideoProjectReviewRepository['review']>[0]) {
    return this.reviews.review(input);
  }
}

export { PrismaVideoDeliveryRepository } from './video-deliveries';
