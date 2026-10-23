import { VrLanguage } from '@/types';

export type AuthStackParamList = {
  Login: undefined;
  ForgotPassword: undefined;
  PasswordRecovery: undefined;
};

export type MainStackParamList = {
  Tabs: undefined;
  PatientRegistration: undefined;
  PatientDetail: { patientId: string };
  Consultation: { patientId: string; visitId?: string };
  Assessment: { assessmentId: string };
  VrPlayer: { moduleId: string; language: VrLanguage; patientId?: string; visitId?: string };
  EducationHome: undefined;
  EducationLibrary: undefined;
  EducationCreate: {
    followUpToId?: string;
    patientIds?: string[];
    moduleId?: string;
    language?: VrLanguage;
    title?: string;
  };
  EducationSessionDetail: { sessionId: string };
  Referral: { patientId: string; visitId?: string; assessmentId?: string; suggestedReason?: string };
  ConsultationSummary: { visitId: string; assessmentId?: string };
  HighRiskList: undefined;
  FollowUpList: undefined;
  UserForm: undefined;
  FacilityForm: undefined;
  VrModuleForm: { moduleId?: string };
  AuditLogs: undefined;
  Branding: undefined;
  Team: undefined;
  TeamMemberForm: undefined;
};

export type HealthcareTabParamList = {
  Home: undefined;
  Patients: undefined;
  VRLibrary: undefined;
  Notifications: undefined;
  Profile: undefined;
};

export type AdminTabParamList = {
  Dashboard: undefined;
  Users: undefined;
  Facilities: undefined;
  Content: undefined;
  Profile: undefined;
};
