import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Button, Card, EmptyState, Screen, ScreenTitle } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { MainStackParamList } from '@/navigation/types';
import { listEducationSessions } from '@/services/education';
import { EducationSession, VR_LANGUAGE_LABELS } from '@/types';
import { spacing, typography } from '@/theme/theme';
import { useTheme } from '@/theme/ThemeContext';

type Nav = NativeStackNavigationProp<MainStackParamList>;

function SessionRow({ session, onPress }: { session: EducationSession; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Card onPress={onPress}>
      <Text style={{ color: theme.colors.text, fontSize: typography.body, fontWeight: '600' }}>
        {session.title}
      </Text>
      <Text style={{ color: theme.colors.textSecondary, fontSize: typography.caption, marginTop: spacing.xs }}>
        {new Date(session.scheduledAt).toLocaleString()} · {VR_LANGUAGE_LABELS[session.language]} · {session.status}
      </Text>
      {session.location ? (
        <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginTop: 2 }}>{session.location}</Text>
      ) : null}
    </Card>
  );
}

export function EducationHomeScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();
  const [sessions, setSessions] = useState<EducationSession[]>([]);

  const refresh = useCallback(() => {
    if (user) setSessions(listEducationSessions(user));
  }, [user]);
  useFocusEffect(refresh);

  if (!user) return null;
  const now = Date.now();
  const upcoming = sessions.filter((session) => session.status === 'scheduled' && new Date(session.scheduledAt).getTime() >= now);
  const history = sessions.filter((session) => !upcoming.includes(session));

  return (
    <Screen>
      <ScreenTitle subtitle="Plan group education around a reviewed lesson and its available language version.">
        Maternal Education
      </ScreenTitle>
      <Button
        title="Create Education Session"
        icon="add-circle-outline"
        onPress={() => navigation.navigate('EducationCreate', {})}
      />
      <Button
        title="Open Video Library"
        icon="play-circle-outline"
        variant="secondary"
        onPress={() => navigation.navigate('EducationLibrary')}
      />

      <ScreenTitle subtitle="Sessions at your facility">Upcoming Sessions</ScreenTitle>
      {upcoming.length === 0 ? (
        <EmptyState icon="calendar-outline" title="No Upcoming Sessions" message="Create a session after confirming the lesson and language video are available." />
      ) : (
        upcoming.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            onPress={() => navigation.navigate('EducationSessionDetail', { sessionId: session.id })}
          />
        ))
      )}

      <Text style={{ color: theme.colors.text, fontSize: typography.sectionHeading, fontWeight: '600', marginTop: spacing.md }}>
        Session History
      </Text>
      {history.length === 0 ? (
        <Text style={{ color: theme.colors.textSecondary, fontSize: typography.caption, marginTop: spacing.sm }}>
          Completed, cancelled, and past sessions will appear here.
        </Text>
      ) : (
        history.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            onPress={() => navigation.navigate('EducationSessionDetail', { sessionId: session.id })}
          />
        ))
      )}
    </Screen>
  );
}