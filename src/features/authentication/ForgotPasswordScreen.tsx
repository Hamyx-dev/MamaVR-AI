import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { Alert, Text } from 'react-native';

import { Button, Card, Field, Screen, ScreenTitle } from '@/components/ui';
import { resetPassword } from '@/services/auth';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, typography } from '@/theme/theme';

export function ForgotPasswordScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleReset = async () => {
    setError(null);
    setBusy(true);
    const result = await resetPassword(email);
    setBusy(false);
    if (result) {
      setError(result);
      return;
    }
    Alert.alert('Check Your Email', 'If the account exists, Supabase will email a password reset link.');
  };

  return (
    <Screen>
      <ScreenTitle subtitle="Enter your account email and Supabase will send you a password reset link.">
        Forgot Password
      </ScreenTitle>
      <Card>
        <Field
          label="Registered Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@facility.org"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        {error ? (
          <Text style={{ color: theme.colors.danger, marginBottom: spacing.sm, fontSize: typography.caption }}>
            {error}
          </Text>
        ) : null}
        <Button title="Send Reset Email" onPress={handleReset} loading={busy} icon="mail-outline" />
        <Button title="Back to Login" variant="secondary" onPress={() => navigation.goBack()} />
      </Card>
    </Screen>
  );
}
