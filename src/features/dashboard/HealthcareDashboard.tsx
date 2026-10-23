import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Screen, StatCard } from '@/components/ui';
import { IllustrationScene } from '@/components/IllustrationScene';
import { useAuth } from '@/hooks/useAuth';
import { countHighRiskPatients } from '@/services/assessments';
import { getBrandLogoUri } from '@/services/branding';
import { getFacility } from '@/services/facilities';
import { countPendingReferrals } from '@/services/referrals';
import { getSyncStatus, syncNow } from '@/services/sync';
import { countVisitsToday } from '@/services/visits';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, typography } from '@/theme/theme';
import { MainStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export function HealthcareDashboard() {
  const { theme } = useTheme();
  const { user, refreshUser } = useAuth();
  const navigation = useNavigation<Nav>();
  const [stats, setStats] = useState({ visits: 0, highRisk: 0, referrals: 0, pendingSync: 0 });
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(() => {
    const sync = getSyncStatus(user?.id);
    setStats({
      visits: countVisitsToday(),
      highRisk: countHighRiskPatients(),
      referrals: countPendingReferrals(),
      pendingSync: sync.pendingRecords + sync.pendingMedia,
    });
  }, [user?.id]);

  useFocusEffect(refresh);

  const handleSync = async () => {
    if (!user) return;
    setSyncing(true);
    const result = await syncNow(user);
    setSyncing(false);
    refresh();
    if (result.ok) refreshUser();
    if (result.ok) {
      Alert.alert(
        'Synchronization Successful',
        result.recordsSynced + result.mediaSynced === 0
          ? 'All records are already up to date.'
          : `${result.recordsSynced} records and ${result.mediaSynced} media files synchronized.`
      );
    } else {
      Alert.alert('Synchronization', result.error);
    }
  };

  const facility = getFacility(user?.facilityId ?? null);
  const logoUri = facility?.logoUri ?? getBrandLogoUri();

  return (
    <Screen>
      <Card style={styles.careBanner}>
        <View style={styles.careBannerCopy}>
          <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '700', letterSpacing: 0.6 }}>
            MATERNAL CARE, CONNECTED
          </Text>
          <Text style={[styles.careBannerTitle, { color: theme.colors.text }]}>
            Every visit builds on the last.
          </Text>
          <Text style={{ color: theme.colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
            Keep patient records and follow-up care together, even offline.
          </Text>
        </View>
        <IllustrationScene kind="care" compact />
      </Card>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: typography.caption, color: theme.colors.textSecondary }}>
            Welcome back
          </Text>
          <Text style={{ fontSize: typography.screenTitle, fontWeight: '700', color: theme.colors.text }}>
            {user?.fullName ?? ''}
          </Text>
          {facility ? (
            <Text style={{ fontSize: typography.caption, color: theme.colors.textSecondary }}>
              {facility.name}
            </Text>
          ) : null}
        </View>
        {logoUri ? (
          <Image source={{ uri: logoUri }} style={styles.facilityLogo} resizeMode="contain" />
        ) : user?.avatarUri ? (
          <Image source={{ uri: user.avatarUri }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="person" size={24} color={theme.colors.onPrimary} />
          </View>
        )}
      </View>

      <View style={styles.statsRow}>
        <StatCard label="ANC Visits Today" value={stats.visits} icon="calendar" tone="primary" />
        <StatCard label="High-Risk Cases" value={stats.highRisk} icon="warning" tone="danger" />
      </View>
      <View style={styles.statsRow}>
        <StatCard label="Pending Referrals" value={stats.referrals} icon="git-branch" tone="warning" />
        <StatCard label="Pending Sync" value={stats.pendingSync} icon="cloud-upload" tone="success" />
      </View>

      <Text style={[styles.sectionLabel, { color: theme.colors.text }]}>Quick Actions</Text>
      <Button
        title="Register New Patient"
        icon="person-add-outline"
        onPress={() => navigation.navigate('PatientRegistration')}
      />
      <Button
        title="Search Patient / New Visit"
        icon="search-outline"
        variant="secondary"
        onPress={() => navigation.navigate('Tabs')}
      />
      <Button
        title="Maternal Education & Sessions"
        icon="videocam-outline"
        variant="secondary"
        onPress={() => navigation.navigate('EducationHome')}
      />
      <View style={styles.rowButtons}>
        <Button
          title="High-Risk Patients"
          icon="alert-circle-outline"
          variant="secondary"
          style={{ flex: 1 }}
          onPress={() => navigation.navigate('HighRiskList')}
        />
        <Button
          title="Follow-ups"
          icon="time-outline"
          variant="secondary"
          style={{ flex: 1 }}
          onPress={() => navigation.navigate('FollowUpList')}
        />
      </View>

      <Card style={{ marginTop: spacing.md }}>
        <Text style={{ color: theme.colors.text, fontSize: typography.body, fontWeight: '600' }}>
          {stats.pendingSync > 0
            ? `${stats.pendingSync} record${stats.pendingSync === 1 ? '' : 's'} ready to sync`
            : 'Check for cloud updates'}
        </Text>
        <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginBottom: spacing.sm }}>
          Records are saved on this device first. Supabase access is protected by your account and database policies.
        </Text>
        <Button
          title={stats.pendingSync > 0 ? 'Sync Now' : 'Check for Updates'}
          icon="cloud-upload-outline"
          onPress={handleSync}
          loading={syncing}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  careBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  careBannerCopy: {
    flex: 1,
    paddingVertical: spacing.xs,
  },
  careBannerTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  facilityLogo: {
    width: 56,
    height: 56,
    borderRadius: 8,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  sectionLabel: {
    fontSize: typography.sectionHeading,
    fontWeight: '600',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  rowButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
