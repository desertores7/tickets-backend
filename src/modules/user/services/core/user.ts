export class User implements IUser {
  uuid: string;
  dni: string | null;
  documentType: 'DNI' | 'Pasaporte' | 'Documento extranjero' | 'Otro' | null;
  firstName: string;
  lastName: string;
  email: string;
  gender: string | null;
  password: string;
  googleId: string | null;
  birthday: Date | null;
  active: number;
  isDeleted: Date | null;
  termsAcceptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface IUser {
  uuid: string;
  dni: string | null;
  documentType: 'DNI' | 'Pasaporte' | 'Documento extranjero' | 'Otro' | null;
  firstName: string;
  lastName: string;
  email: string;
  gender: string | null;
  password: string;
  googleId: string | null;
  birthday: Date | null;
  active: number;
  isDeleted: Date | null;
  termsAcceptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface IUserTokenSession {
  uuid: string;
  userUuid: string;
  access_token: string;
  refresh_token: string;
  isDeleted: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface IUserCreate {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  imgProfile?: Express.Multer.File;
  active?: number;
  roleUuid?: string;
  organizationUuid?: string;
}

export interface IUserAddress {
  uuid: string;
  userUuid: string;
  name: string;
  city: string;
  state: string;
  country: string;
  zipCode: string;
  isDefaultShipping: boolean;
  isDefaultBilling: boolean;
}
export interface IUserUpdate {
  firstName?: string;
  lastName?: string;
  email?: string;
  username?: string;
  password?: string;
  dni?: string;
  gender?: string;
  birthday?: Date;
  roleUuid?: string;
  active?: number;
  imgProfile?: Express.Multer.File;
}

export interface IUserList {
  uuid: string;
  name: string;
  username: string;
  organizationUuids?: string[];
}
