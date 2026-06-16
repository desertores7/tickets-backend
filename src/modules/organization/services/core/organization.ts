export class Organization implements IOrganization {
  uuid: string;
  name: string;
  isDeleted: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface IOrganization {
  uuid: string;
  name: string;
  isDeleted: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface IOrganizationCreate {
  name: string;
}

export interface IOrganizationUpdate {
  name: string;
}

export interface IAssignUserOrganization {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface IUnassignUserOrganization {
  userUuids: string[];
}
