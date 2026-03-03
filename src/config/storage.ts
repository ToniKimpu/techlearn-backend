export const BUCKET = "media";

export const UPLOAD_FOLDERS = {
  curriculums: "curriculums",
  grades: "grades",
  subjects: "subjects",
  chapters: "chapters",
  avatars: "avatars",
} as const;

export type UploadFolder = keyof typeof UPLOAD_FOLDERS;
