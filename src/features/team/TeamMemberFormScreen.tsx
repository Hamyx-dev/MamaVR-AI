import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { Alert, Text } from 'react-native';

import { Button, Card, Field, Screen, ScreenTitle } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { createTeamMember } from '@/services/team';
import { useTheme } from '@/theme/ThemeContext';
import { typography } from '@/theme/theme';

export function TeamMemberFormScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation();
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [qualification, setQualification] = useState('');
  const [responsibilities, setResponsibilities] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!user || user.role !== 'admin') return null;

  const handleSave = () => {
    setError(null);
    try {
      const member = createTeamMember(user, {
        name,
        role,
        qualification,
        responsibilities: responsibilities.split('\n'),
      });
      Alert.alert('Team Member Added', `${member.name} now appears in the Project Team.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The team member could not be saved.');
    }
  };

  return (
    <Screen>
      <ScreenTitle subtitle="Add a member to the multidisciplinary team shown on the Project Team screen.">
        Add Team Member
      </ScreenTitle>
      <Card>
        <Field label="Full Name *" value={name} onChangeText={setName} autoCapitalize="words" />
        <Field label="Role *" value={role} onChangeText={setRole} placeholder="e.g. Clinical Advisor" autoCapitalize="words" />
        <Field
          label="Qualification"
          value={qualification}
          onChangeText={setQualification}
          placeholder="e.g. BSc Nursing"
          autoCapitalize="words"
        />
        <Field
          label="Responsibilities"
          value={responsibilities}
          onChangeText={setResponsibilities}
          placeholder="One responsibility per line"
          multiline
          helper="Enter one responsibility per line."
        />
        {error ? (
          <Text style={{ color: theme.colors.danger, fontSize: typography.caption, marginBottom: 8 }}>{error}</Text>
        ) : null}
        <Button title="Add Team Member" icon="person-add-outline" onPress={handleSave} />
        <Button title="Cancel" variant="secondary" onPress={() => navigation.goBack()} />
      </Card>
    </Screen>
  );
}
