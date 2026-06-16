export class Role implements IRole {
  uuid: string;
  name: string;
  isDeleted: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface IRole {
  uuid: string;
  name: string;
  isDeleted: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface IRoleCreate {
  name: string;
}

export interface IRoleUpdate {
  name: string;
}
