export type MediaType = 'video' | 'audio';

export interface MediaFile {
  id: string;
  name: string;
  type: MediaType;
  url: string;
  size: number;
  duration?: number;
  originalFileName: string;
  fileKey?: string;
}

export interface TimelineSegment {
  id: string;
  fileId: string;
  fileKey?: string;
  type: MediaType;
  start: number;
  end: number;
}
