import React, { useState } from 'react';
import { Alert, Text } from 'react-native';

import { Button, Card, Field, Screen, ScreenTitle } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, typography } from '@/theme/theme';

export function PasswordRecoveryScreen() {
  const { theme } = useTheme();
  const { completePasswordRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    setError(null);
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    const result = await completePasswordRecovery(password);
    setBusy(false);
    if (result) {
      setError(result);
      return;
    }
    Alert.alert('Password Updated', 'Sign in with your new password.');
  };

  return (
    <Screen>
      <ScreenTitle subtitle="Choose a new password for your account.">Reset Password</ScreenTitle>
      <Card>
        <Field
          label="New Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          helper="At least 8 characters with uppercase, lowercase, a number and a special character."
        />
        <Field
          label="Confirm New Password"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          autoCapitalize="none"
        />
        {error ? (
          <Text style={{ color: theme.colors.danger, marginBottom: spacing.sm, fontSize: typography.caption }}>
            {error}
          </Text>
        ) : null}
        <Button title="Save New Password" onPress={handleSave} loading={busy} icon="key-outline" />
      </Card>
    </Screen>
  );
}
