export const PROFILE_FILE_TYPE_UUID = 'f1e2d3c4-b5a6-4789-0abc-def123456789';
export const PROFILE_FILE_TYPE_NAME = 'profile';

export function isProfileFile(file: { fileTypeUuid: string }): boolean {
  return file.fileTypeUuid === PROFILE_FILE_TYPE_UUID;
}
