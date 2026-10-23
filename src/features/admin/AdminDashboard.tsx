import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Button, Card, Screen, ScreenTitle, StatCard } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { countHighRiskPatients } from '@/services/assessments';
import { db } from '@/services/database';
import { countPatients } from '@/services/patients';
import { getSyncStatus, syncNow } from '@/services/sync';
import { countVisitsToday } from '@/services/visits';
import { countVrSessions } from '@/services/vr';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, typography } from '@/theme/theme';
import { MainStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export function AdminDashboard() {
  const { theme } = useTheme();
  const { user, refreshUser } = useAuth();
  const navigation = useNavigation<Nav>();
  const [stats, setStats] = useState({
    facilities: 0,
    personnel: 0,
    patients: 0,
    highRisk: 0,
    visitsToday: 0,
    vrSessions: 0,
    pendingSync: 0,
    cloudConfigured: false,
  });
  const [syncing, setSyncing] = useState(false);
  const { width } = useWindowDimensions();
  const singleColumn = width < 360;

  useFocusEffect(
    useCallback(() => {
      const facilityCount = db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM facilities')?.n ?? 0;
      const personnelCount =
        db.getFirstSync<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE role = 'healthcare_worker'")?.n ?? 0;
      const sync = getSyncStatus(user?.id);
      setStats({
        facilities: facilityCount,
        personnel: personnelCount,
        patients: countPatients(),
        highRisk: countHighRiskPatients(),
        visitsToday: countVisitsToday(),
        vrSessions: countVrSessions(),
        pendingSync: sync.pendingRecords + sync.pendingMedia,
        cloudConfigured: sync.cloudConfigured,
      });
    }, [user?.id])
  );

  const handleSync = async () => {
    if (!user) return;
    setSyncing(true);
    const result = await syncNow(user);
    setSyncing(false);
    if (result.ok) refreshUser();
    if (result.ok) {
      Alert.alert(
        'Synchronization Complete',
        `${result.recordsSynced} records and ${result.mediaSynced} media files synchronized.`
      );
    } else {
      Alert.alert('Synchronization Failed', result.error);
    }
  };

  return (
    <Screen safeAreaEdges={['top']}>
      <ScreenTitle subtitle={user?.email ?? ''}>Administrator Dashboard</ScreenTitle>

      <View style={styles.statsGrid}>
        {[
          { label: 'Facilities', value: stats.facilities, icon: 'business', tone: 'primary' },
          { label: 'Healthcare Personnel', value: stats.personnel, icon: 'people', tone: 'primary' },
          { label: 'Registered Patients', value: stats.patients, icon: 'woman', tone: 'success' },
          { label: 'High-Risk Pregnancies', value: stats.highRisk, icon: 'warning', tone: 'danger' },
          { label: 'ANC Visits Today', value: stats.visitsToday, icon: 'calendar', tone: 'primary' },
          { label: 'Video Lessons Played', value: stats.vrSessions, icon: 'videocam', tone: 'success' },
        ].map((stat) => (
          <View key={stat.label} style={[styles.statSlot, singleColumn && styles.statSlotFull]}>
            <StatCard
              label={stat.label}
              value={stat.value}
              icon={stat.icon as 'business'}
              tone={stat.tone as 'primary' | 'success' | 'danger'}
            />
          </View>
        ))}
      </View>

      <Card>
        <Text style={{ fontSize: typography.body, fontWeight: '600', color: theme.colors.text }}>
          System Health
        </Text>
        <View style={styles.healthRows}>
          <HealthStatusRow icon="phone-portrait-outline" label="Local database" value="SQLite · available offline" />
          <HealthStatusRow
            icon="sync-outline"
            label="Pending synchronization"
            value={`${stats.pendingSync} item${stats.pendingSync === 1 ? '' : 's'}`}
          />
          <HealthStatusRow
            icon="cloud-outline"
            label="Cloud service"
            value={stats.cloudConfigured ? 'Supabase configured' : 'Supabase not configured'}
          />
        </View>
        <Button
          title={stats.pendingSync > 0 ? 'Sync Now' : 'Check for Cloud Updates'}
          icon="cloud-upload-outline"
          onPress={handleSync}
          loading={syncing}
          style={{ marginTop: spacing.sm }}
        />
      </Card>

      <Text style={[styles.sectionLabel, { color: theme.colors.text }]}>Administration</Text>
      <Button title="Audit Logs" icon="document-text-outline" variant="secondary" onPress={() => navigation.navigate('AuditLogs')} />
      <Button title="Branding & App Logo" icon="color-palette-outline" variant="secondary" onPress={() => navigation.navigate('Branding')} />
      <Button title="Project Team" icon="people-circle-outline" variant="secondary" onPress={() => navigation.navigate('Team')} />
    </Screen>
  );
}

function HealthStatusRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.healthRow}>
      <Ionicons name={icon} size={20} color={theme.colors.primary} />
      <View style={styles.healthCopy}>
        <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>{label}</Text>
        <Text style={{ color: theme.colors.text, fontSize: typography.caption, fontWeight: '600' }}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 820,
  },
  statSlot: {
    width: '48%',
    minWidth: 0,
  },
  statSlotFull: {
    width: '100%',
  },
  healthRows: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  healthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  healthCopy: {
    flex: 1,
    minWidth: 0,
  },
  sectionLabel: {
    fontSize: typography.sectionHeading,
    fontWeight: '600',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
});
