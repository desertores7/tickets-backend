// This file was generated automatically 2026-06-11T00:00:00.000Z

export const entityRelations = {
  booking: {
    organization: 'organization',

    patient: 'patient',

    user: 'user',

    category: 'booking_category',

    room: 'booking_room',

    status: 'booking_status'
  },

  booking_category: {
    bookings: 'booking'
  },

  booking_room: {
    bookings: 'booking'
  },

  booking_status: {
    bookings: 'booking'
  },

  budget: {
    organization: 'organization',

    patient: 'patient',

    patientBudgets: 'patient_budget',

    budgetItems: 'budget_item',

    payments: 'payment'
  },

  budget_item: {
    budget: 'budget'
  },

  insurance: {
    plans: 'insurance_plan',
    organizationInsurances: 'organization_insurance',
    patients: 'patient'
  },

  insurance_plan: {
    insurance: 'insurance'
  },

  patient: {
    insurance: 'insurance',

    organizationPatients: 'organization_patient',

    patientBudgets: 'patient_budget',

    patientTreatments: 'patient_treatment',

    budgets: 'budget',

    payments: 'payment',

    bookings: 'booking',

    clinicalRecords: 'clinical_record',

    odontograms: 'odontogram',

    documents: 'patient_document',

    odontogramHistory: 'odontogram_history',

    patientNotes: 'patient_notes'
  },

  patient_notes: {
    patient: 'patient',

    patientCategory: 'patient_category'
  },

  patient_category: {
    patientNotes: 'patient_notes'
  },

  patient_budget: {
    patient: 'patient',

    budget: 'budget'
  },

  patient_treatment: {
    patient: 'patient',

    treatment: 'treatment',

    payments: 'payment'
  },

  clinical_record: {
    organization: 'organization',

    patient: 'patient',

    professional: 'user'
  },

  email: {},

  expenses: {
    paymentMethod: 'payment_method',

    organizationExpenses: 'organization_expenses'
  },

  file: {
    user: 'user',

    organization: 'organization',

    fileType: 'file_type'
  },

  file_type: {
    files: 'file'
  },

  message_template: {
    organization: 'organization'
  },

  odontogram: {
    organization: 'organization',

    patient: 'patient',

    history: 'odontogram_history'
  },

  odontogram_history: {
    odontogram: 'odontogram',

    patient: 'patient'
  },

  organization: {
    userOrganizations: 'user_organization',

    organizationStatus: 'organization_status',

    organizationConfigs: 'organization_config',

    organizationHours: 'organization_hour',
    organizationInsurances: 'organization_insurance',
    organizationPatients: 'organization_patient',

    organizationExpenses: 'organization_expenses',

    bookings: 'booking',

    budgets: 'budget',

    payments: 'payment',

    treatments: 'treatment',

    professionalProfiles: 'professional_profile',

    professionalInvitations: 'professional_invitation',

    clinicalRecords: 'clinical_record',

    odontograms: 'odontogram',

    patientDocuments: 'patient_document',

    messageTemplates: 'message_template'
  },

  organization_status: {
    organizations: 'organization'
  },

  organization_patient: {
    organization: 'organization',

    patient: 'patient'
  },

  organization_config: {
    organization: 'organization'
  },

  organization_expenses: {
    organization: 'organization',

    expense: 'expenses'
  },

  organization_hour: {
    organization: 'organization'
  },
  organization_insurance: {
    organization: 'organization',
    insurance: 'insurance'
  },
  patient_document: {
    organization: 'organization',

    patient: 'patient'
  },

  payment: {
    order: 'orders'
  },

  payment_method: {
    payments: 'payment',

    expenses: 'expenses'
  },

  plan: {
    userPlans: 'user_plan'
  },

  professional_invitation: {
    organization: 'organization'
  },

  professional_profile: {
    user: 'user',

    organization: 'organization'
  },

  role: {
    userRoles: 'user_role'
  },

  system_parameter: {},

  treatment: {
    organization: 'organization',

    patientTreatments: 'patient_treatment'
  },

  user: {
    files: 'file',

    userRoles: 'user_role',

    userTokenSessions: 'user_token_session',

    userPasswordReset: 'user_password_reset',

    userOrganizations: 'user_organization',

    userSessions: 'user_session',

    userPlans: 'user_plan',

    bookings: 'booking',

    professionalProfiles: 'professional_profile',

    clinicalRecords: 'clinical_record',

    notifications: 'user_notification'
  },

  user_notification: {
    user: 'user'
  },

  user_organization: {
    user: 'user',

    organization: 'organization'
  },

  user_password_reset: {
    user: 'user'
  },

  user_plan: {
    user: 'user',

    plan: 'plan'
  },

  user_role: {
    user: 'user',

    role: 'role'
  },

  user_session: {
    user: 'user'
  },

  user_token_session: {
    user: 'user'
  },

  event: {
    organization: 'organization',
    ticketTypes: 'ticket_type',
    media: 'event_media'
  },

  event_media: {
    event: 'event'
  },

  event_map: {
    event: 'event',
    sectors: 'event_map_sector'
  },

  event_map_sector: {
    map: 'event_map',
    ticketTypeLinks: 'event_map_sector_ticket_type'
  },

  event_map_sector_ticket_type: {
    sector: 'event_map_sector',
    ticketType: 'ticket_type'
  },

  ticket_type: {
    event: 'event'
  },

  orders: {
    user: 'user',
    event: 'event',
    items: 'order_item',
    payment: 'payment'
  },

  order_item: {
    order: 'orders',
    ticketType: 'ticket_type',
    tickets: 'ticket'
  },

  ticket: {
    orderItem: 'order_item',
    user: 'user',
    event: 'event',
    ticketType: 'ticket_type'
  },

  check_in_log: {
    ticket: 'ticket',
    event: 'event',
    scanner: 'user'
  },

  event_fee_summary: {
    event: 'event'
  },

  event_producer: {
    event: 'event',
    user: 'user'
  },

  event_expense: {
    event: 'event',
    creator: 'user'
  },

  event_mp_account: {
    event: 'event',
    mpAccount: 'org_mp_account'
  },

  event_income: {
    event: 'event',
    creator: 'user'
  },

  event_income_product: {
    income: 'event_income'
  },

  mp_movement: {
    event: 'event',
    mpAccount: 'org_mp_account'
  },

  coupon: {
    event: 'event'
  },

  coupon_ticket_type: {
    coupon: 'coupon',
    ticketType: 'ticket_type'
  },

  coupon_redemption: {
    coupon: 'coupon'
  },

  stock_alert: {
    event: 'event',
    ticketType: 'ticket_type'
  },

  payout: {
    organization: 'organization',
    event: 'event'
  },

  org_manual_item: {
    organization: 'organization'
  },

  mp_catalog_item: {
    organization: 'organization',
    mpAccount: 'org_mp_account'
  },

  org_mp_account: {
    organization: 'organization'
  },

  event_validator: {
    event: 'event',
    user: 'user'
  },

  organization_producer_invite: {
    organization: 'organization',
    invitedBy: 'user'
  },

  organization_request: {
    organization: 'organization'
  },

  user_event_cashier: {
    user: 'user',
    event: 'event',
    organization: 'organization'
  },
} as const;
