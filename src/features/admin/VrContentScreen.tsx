/**
 * Education Video Manager: administrators upload and maintain the video and
 * thumbnail media for every VR education module (§7 / §9.9). Uploaded files
 * are stored in private app storage and queued for cloud replication by the
 * Sync Manager, so modules keep working fully offline (§7.10).
 */
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { MediaPicker } from '@/components/MediaPicker';
import { Button, Card, Screen, ScreenTitle, SegmentedControl } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { getLessonVideoUri, listAvailableLessonLanguages, listVrModules, setLessonVideo, setModuleThumbnail } from '@/services/vr';
import { useTheme } from '@/theme/ThemeContext';
import { radius, spacing, typography } from '@/theme/theme';
import { VR_LANGUAGES, VR_LANGUAGE_LABELS, VrLanguage, VrModule } from '@/types';
import { MainStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export function VrContentScreen() {
  const { theme } = useTheme();
  const { user: admin } = useAuth();
  const navigation = useNavigation<Nav>();
  const [modules, setModules] = useState<VrModule[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingLanguage, setEditingLanguage] = useState<VrLanguage>('en');

  const refresh = useCallback(() => setModules(listVrModules()), []);
  useFocusEffect(refresh);

  return (
    <Screen>
      <ScreenTitle subtitle="Upload lesson videos and thumbnails for each education module. Content plays fully offline once uploaded.">
        Maternal Education Videos
      </ScreenTitle>
      <Button title="Publish New Module" icon="add-circle-outline" onPress={() => navigation.navigate('VrModuleForm', {})} />

      {modules.map((module) => {
        const expanded = expandedId === module.id;
        const availableLanguages = listAvailableLessonLanguages(module.id);
        return (
          <Card key={module.id}>
            <View style={styles.row}>
              {module.thumbnailUri ? (
                <Image source={{ uri: module.thumbnailUri }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbFallback, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
                  <Ionicons name="videocam-outline" size={22} color={theme.colors.primary} />
                </View>
              )}
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={{ fontSize: typography.body, fontWeight: '600', color: theme.colors.text }}>
                  {module.title}
                </Text>
                <View style={styles.statusRow}>
                  <Ionicons
                    name={availableLanguages.length ? 'checkmark-circle' : 'alert-circle-outline'}
                    size={14}
                    color={availableLanguages.length ? theme.colors.success : theme.colors.warning}
                  />
                  <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginLeft: 4 }}>
                    {availableLanguages.length
                      ? `Video available: ${availableLanguages.map((language) => VR_LANGUAGE_LABELS[language]).join(', ')}`
                      : 'No language versions uploaded'}
                    {module.isBuiltin ? ' · Built-in module' : ''}
                  </Text>
                </View>
              </View>
            </View>

            {expanded ? (
              <View style={{ marginTop: spacing.md }}>
                <SegmentedControl
                  label="Lesson language version"
                  value={editingLanguage}
                  onChange={setEditingLanguage}
                  options={VR_LANGUAGES.map((language) => ({
                    value: language,
                    label: VR_LANGUAGE_LABELS[language],
                  }))}
                />
                <MediaPicker
                  label={`${VR_LANGUAGE_LABELS[editingLanguage]} Video`}
                  kind="video"
                  ownerType="vr_video"
                  ownerId={module.id}
                  value={getLessonVideoUri(module.id, editingLanguage)}
                  onChange={(uri) => {
                    if (admin) setLessonVideo(admin, module.id, editingLanguage, uri);
                    refresh();
                  }}
                  helper={`Only this ${VR_LANGUAGE_LABELS[editingLanguage]} version will play when that language is selected. MP4 recommended.`}
                />
                <MediaPicker
                  label="Thumbnail Image"
                  kind="image"
                  ownerType="vr_thumbnail"
                  ownerId={module.id}
                  value={module.thumbnailUri}
                  onChange={(uri) => {
                    if (admin) setModuleThumbnail(admin, module.id, uri);
                    refresh();
                  }}
                  helper="Shown in the maternal education video library."
                />
                <Button title="Done" variant="secondary" onPress={() => setExpandedId(null)} />
              </View>
            ) : (
              <Button
                title="Manage Media"
                variant="secondary"
                icon="cloud-upload-outline"
                onPress={() => setExpandedId(module.id)}
              />
            )}
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
  },
  thumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
});
