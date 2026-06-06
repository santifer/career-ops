export type CommentStatus = 'pending' | 'sent' | 'resolved';

export interface Comment {
  id: string;
  sectionId: string;
  selectedText: string;
  startOffset: number;
  endOffset: number;
  commentText: string;
  status: CommentStatus;
  batchId?: string;
}
