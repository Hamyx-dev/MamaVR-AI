import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Button, Card, EmptyState, Screen, ScreenTitle, SegmentedControl } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { MainStackParamList } from '@/navigation/types';
import {
  EducationAttendee,
  getEducationSession,
  getFollowUpPatientIds,
  listEducationAttendees,
  updateEducationAttendance,
  updateEducationSessionStatus,
} from '@/services/education';
import { getLessonVideoUri, getVrModule } from '@/services/vr';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, typography } from '@/theme/theme';
import { AttendanceStatus, EducationSession, VR_LANGUAGE_LABELS } from '@/types';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Route = RouteProp<MainStackParamList, 'EducationSessionDetail'>;

export function EducationSessionDetailScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const [session, setSession] = useState<EducationSession | null>(null);
  const [attendees, setAttendees] = useState<EducationAttendee[]>([]);

  const refresh = useCallback(() => {
    if (!user) return;
    setSession(getEducationSession(user, route.params.sessionId));
    setAttendees(listEducationAttendees(user, route.params.sessionId));
  }, [user, route.params.sessionId]);
  useFocusEffect(refresh);

  if (!user) return null;
  if (!session) {
    return <Screen><EmptyState icon="alert-circle-outline" title="Session Unavailable" message="The session may be outside your facility or no longer available." /></Screen>;
  }

  const module = getVrModule(session.moduleId);
  const videoUri = getLessonVideoUri(session.moduleId, session.language);
  const canManageStatus = user.role === 'admin' || session.createdBy === user.id;
  const followUpPatientIds = getFollowUpPatientIds(user, session.id);
  const markAttendance = (patientId: string, status: AttendanceStatus) => {
    try {
      updateEducationAttendance(user, session.id, patientId, status);
      refresh();
    } catch (error) {
      Alert.alert('Attendance Not Saved', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const changeStatus = (status: 'completed' | 'cancelled') => {
    Alert.alert(
      status === 'completed' ? 'Complete Session?' : 'Cancel Session?',
      status === 'completed' ? 'This will move the session into history.' : 'This session will no longer be scheduled.',
      [
        { text: 'Keep Session', style: 'cancel' },
        {
          text: status === 'completed' ? 'Complete' : 'Cancel Session',
          style: status === 'cancelled' ? 'destructive' : 'default',
          onPress: () => {
            try {
              if (!user) return;
              updateEducationSessionStatus(user, session.id, status);
              refresh();
            } catch (error) {
              Alert.alert('Session Not Updated', error instanceof Error ? error.message : 'Please try again.');
            }
          },
        },
      ]
    );
  };

  return (
    <Screen>
      <ScreenTitle subtitle={`${new Date(session.scheduledAt).toLocaleString()} · ${VR_LANGUAGE_LABELS[session.language]} · ${session.status} · ${session.syncStatus === 'pending' ? 'Saved on device, awaiting sync' : 'Synced'}`}>
        {session.title}
      </ScreenTitle>
      <Card>
        <Text style={{ color: theme.colors.text, fontSize: typography.body, fontWeight: '600' }}>
          {module?.title ?? 'Education lesson'}
        </Text>
        <Text style={{ color: theme.colors.textSecondary, fontSize: typography.caption, marginTop: 4 }}>
          {module?.purpose ?? 'Lesson details unavailable.'}
        </Text>
        <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginTop: spacing.sm }}>
          {session.location || 'Location not specified'} · {attendees.length}/{session.maxCapacity} participants
        </Text>
        {videoUri ? (
          <Button
            title={`Play ${VR_LANGUAGE_LABELS[session.language]} lesson`}
            icon="play-outline"
            onPress={() => navigation.navigate('VrPlayer', { moduleId: session.moduleId, language: session.language })}
          />
        ) : (
          <Text style={{ color: theme.colors.danger, fontSize: typography.caption, marginTop: spacing.sm }}>
            The matching {VR_LANGUAGE_LABELS[session.language]} video is not available on this device. Do not play another language version.
          </Text>
        )}
      </Card>

      <Text style={{ color: theme.colors.text, fontSize: typography.sectionHeading, fontWeight: '600', marginVertical: spacing.sm }}>
        Attendance
      </Text>
      {attendees.map((attendee) => (
        <Card key={attendee.id}>
          <Text style={{ color: theme.colors.text, fontSize: typography.body, fontWeight: '600', marginBottom: spacing.sm }}>
            {attendee.patientName}
          </Text>
          {session.status === 'cancelled' ? (
            <Text style={{ color: theme.colors.textSecondary, fontSize: typography.caption }}>
              Attendance is read-only for cancelled sessions: {attendee.status}.
            </Text>
          ) : (
            <>
              <SegmentedControl
                label="Attendance"
                value={attendee.status === 'unmarked' ? undefined : attendee.status}
                onChange={(status) => markAttendance(attendee.patientId, status)}
                options={[
                  { value: 'present', label: 'Present' },
                  { value: 'absent', label: 'Absent' },
                ]}
              />
              <Text style={{ color: theme.colors.textSecondary, fontSize: 11 }}>
                {attendee.syncStatus === 'pending' ? 'Saved on device, awaiting sync' : 'Synced'}
              </Text>
            </>
          )}
        </Card>
      ))}
      {attendees.length === 0 ? <EmptyState icon="people-outline" title="No Roster" message="This session has no participant list." /> : null}

      {session.status === 'completed' && followUpPatientIds.length > 0 ? (
        <Button
          title={`Schedule Follow-up for ${followUpPatientIds.length}`}
          icon="repeat-outline"
          variant="secondary"
          onPress={() => navigation.navigate('EducationCreate', {
            followUpToId: session.id,
            patientIds: followUpPatientIds,
            moduleId: session.moduleId,
            language: session.language,
            title: `Follow-up: ${session.title}`,
          })}
        />
      ) : null}
      {canManageStatus && session.status === 'scheduled' ? (
        <View>
          <Button title="Mark Session Completed" icon="checkmark-done-outline" variant="success" onPress={() => changeStatus('completed')} />
          <Button title="Cancel Session" icon="close-circle-outline" variant="danger" onPress={() => changeStatus('cancelled')} />
        </View>
      ) : null}
    </Screen>
  );
}