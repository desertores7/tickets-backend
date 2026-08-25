import { SupportContactType } from '../../controllers/requests/support-contact.request';

export interface ISupportContactData {
  type: SupportContactType;
  message: string;
  email: string;
  userUuid?: string;
}

export interface ISupportService {
  contact(data: ISupportContactData): Promise<{ message: string }>;
}
