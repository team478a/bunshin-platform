export interface GroupKnowledgeSourceData {
  id: string;
  type: 'PDF' | 'VIDEO' | 'URL' | 'TEXT';
  title: string;
  sourceUri: string | null;
  originalFileName: string | null;
  productPackVersionId: string | null;
  status: 'DRAFT' | 'PROCESSING' | 'REVIEW_REQUIRED' | 'ACTIVE' | 'FAILED' | 'ARCHIVED';
  version: number;
  failureCode: string | null;
  updatedAt: string;
}

export type GroupKnowledgeSource = GroupKnowledgeSourceData & {
  generationCount: number;
  lastUsedAt: string | null;
};

export interface ProductVersionOption {
  id: string;
  label: string;
}

export interface GroupKnowledgeReview {
  source: GroupKnowledgeSource;
  chunks: Array<{
    id: string;
    type: string;
    content: string;
    sourceLabel: string;
    pageNumber: number | null;
    startSeconds: number | null;
    endSeconds: number | null;
  }>;
  previousVersion: {
    version: number;
    chunks: Array<{ id: string; content: string }>;
  } | null;
}
