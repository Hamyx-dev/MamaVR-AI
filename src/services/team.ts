/**
 * Project Team (§11.16): the multidisciplinary team behind MamaVR AI.
 * Profiles are seeded from the design book; administrators upload each
 * member's professional passport photograph through the Media Manager,
 * replacing the "[Insert Photo Here]" placeholders from the document.
 */
import * as Crypto from 'expo-crypto';

import { TeamMember, User } from '@/types';
import { logAudit } from './audit';
import { db } from './database';

const TEAM: TeamMember[] = [
  {
    id: 'team-abdul-wahab-ibrahim',
    name: 'Abdul Wahab Ibrahim',
    role: 'Team Lead',
    qualification: 'BSc Nursing',
    responsibilities: [
      'Overall project leadership and coordination.',
      'Clinical oversight of maternal health workflows.',
      'Product vision and strategy.',
      'Stakeholder engagement and partnerships.',
      'AI clinical rule validation.',
      'Monitoring project implementation and quality assurance.',
    ],
    photoUri: null,
    isLead: true,
    displayOrder: 1,
    isActive: true,
  },
  {
    id: 'team-osman-abdul-wahab',
    name: 'Osman Abdul-Wahab',
    role: 'Technical Lead',
    qualification: 'AWS Cloud Architect / Software Engineer',
    responsibilities: [
      'Software architecture design.',
      'Mobile application development.',
      'Backend API development.',
      'Cloud infrastructure and deployment.',
      'Database architecture.',
      'Security implementation.',
      'System integration and maintenance.',
    ],
    photoUri: null,
    isLead: false,
    displayOrder: 2,
    isActive: true,
  },
  {
    id: 'team-adams-rashida',
    name: 'Adams Rashida',
    role: 'Communications & Outreach Officer',
    qualification: 'BSc Public Health Nursing',
    responsibilities: [
      'Community engagement.',
      'User education and awareness.',
      'Stakeholder communication.',
      'Health promotion content development.',
      'Feedback collection during pilot implementation.',
      'Coordination of outreach and dissemination activities.',
    ],
    photoUri: null,
    isLead: false,
    displayOrder: 3,
    isActive: true,
  },
];

/** Idempotent: inserts profiles once, never overwrites uploaded photos. */
export function seedTeamMembers(): void {
  for (const member of TEAM) {
    db.runSync(
      `INSERT OR IGNORE INTO team_members (id, name, role, qualification, responsibilities, photo_uri, is_lead, display_order)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
      [
        member.id,
        member.name,
        member.role,
        member.qualification,
        JSON.stringify(member.responsibilities),
        member.isLead ? 1 : 0,
        member.displayOrder,
      ]
    );
  }
}

interface TeamRow {
  id: string;
  name: string;
  role: string;
  qualification: string;
  responsibilities: string;
  photo_uri: string | null;
  is_lead: number;
  display_order: number;
  is_active: number;
}

function mapMember(row: TeamRow): TeamMember {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    qualification: row.qualification,
    responsibilities: JSON.parse(row.responsibilities) as string[],
    photoUri: row.photo_uri,
    isLead: row.is_lead === 1,
    displayOrder: row.display_order,
    isActive: row.is_active !== 0,
  };
}

export function listTeamMembers(): TeamMember[] {
  return db
    .getAllSync<TeamRow>('SELECT * FROM team_members WHERE is_active = 1 ORDER BY display_order')
    .map(mapMember);
}

export interface NewTeamMemberInput {
  name: string;
  role: string;
  qualification: string;
  responsibilities: string[];
}

export function createTeamMember(admin: User, input: NewTeamMemberInput): TeamMember {
  if (admin.role !== 'admin') throw new Error('Only administrators can add team members.');
  const name = input.name.trim();
  const role = input.role.trim();
  if (!name) throw new Error('Enter the team member name.');
  if (!role) throw new Error('Enter the team member role.');
  const responsibilities = input.responsibilities
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const highest = db.getFirstSync<{ value: number | null }>(
    'SELECT MAX(display_order) AS value FROM team_members'
  );
  const member: TeamMember = {
    id: Crypto.randomUUID(),
    name,
    role,
    qualification: input.qualification.trim(),
    responsibilities,
    photoUri: null,
    isLead: false,
    displayOrder: (highest?.value ?? 0) + 1,
    isActive: true,
  };
  db.runSync(
    `INSERT INTO team_members (
       id, name, role, qualification, responsibilities, photo_uri,
       is_lead, display_order, is_active, sync_status
     ) VALUES (?, ?, ?, ?, ?, NULL, 0, ?, 1, 'pending')`,
    [
      member.id,
      member.name,
      member.role,
      member.qualification,
      JSON.stringify(member.responsibilities),
      member.displayOrder,
    ]
  );
  logAudit(admin, 'TEAM_MEMBER_ADDED', `Added team member: ${member.name} (${member.role})`);
  return member;
}

export function removeTeamMember(admin: User, memberId: string): void {
  if (admin.role !== 'admin') throw new Error('Only administrators can remove team members.');
  const member = db.getFirstSync<{ name: string }>(
    'SELECT name FROM team_members WHERE id = ? AND is_active = 1',
    [memberId]
  );
  if (!member) throw new Error('This team member is no longer available.');
  db.runSync(
    "UPDATE team_members SET is_active = 0, sync_status = 'pending' WHERE id = ?",
    [memberId]
  );
  logAudit(admin, 'TEAM_MEMBER_REMOVED', `Removed team member: ${member.name}`);
}

/** Admin: attach or replace a member's professional passport photograph. */
export function updateTeamMemberPhoto(admin: User, memberId: string, photoUri: string | null): void {
  db.runSync(
    "UPDATE team_members SET photo_uri = ?, sync_status = 'pending' WHERE id = ?",
    [photoUri, memberId]
  );
  logAudit(admin, 'TEAM_UPDATED', `Photo ${photoUri ? 'uploaded' : 'removed'} for team member ${memberId}`);
}
