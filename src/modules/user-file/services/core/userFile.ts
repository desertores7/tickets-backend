export class UserFile implements IUserFile {
  uuid: string;
  userUuid: string;
  path: string;
  isDeleted: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface IUserFile {
  uuid: string;
  userUuid: string;
  path: string;
  isDeleted: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface IUserFileCreate {
  userUuid: string;
  path: string;
}

export interface IUserFileUpdate {
  path: string;
}
