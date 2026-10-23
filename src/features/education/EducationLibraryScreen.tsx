import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { Image, Text, View } from 'react-native';

import { Button, Card, EmptyState, Screen, ScreenTitle } from '@/components/ui';
import { MainStackParamList } from '@/navigation/types';
import { getLessonVideoUri, listAvailableLessonLanguages, listVrModules } from '@/services/vr';
import { useTheme } from '@/theme/ThemeContext';
import { radius, spacing, typography } from '@/theme/theme';
import { VR_LANGUAGES, VR_LANGUAGE_LABELS, VrModule } from '@/types';

type Nav = NativeStackNavigationProp<MainStackParamList>;
export function EducationLibraryScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const [modules, setModules] = useState<VrModule[]>([]);

  const refresh = useCallback(() => setModules(listVrModules()), []);
  useFocusEffect(refresh);

  return (
    <Screen>
      <ScreenTitle subtitle="Choose a reviewed lesson and play only a video uploaded for the selected language.">
        Maternal Education Video Library
      </ScreenTitle>
      {modules.length === 0 ? (
        <EmptyState icon="videocam-outline" title="No Lessons Available" message="An administrator must add lesson content before a video can be played." />
      ) : (
        modules.map((module) => {
          const available = listAvailableLessonLanguages(module.id);
          return (
            <Card key={module.id}>
              <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
                {module.thumbnailUri ? (
                  <Image source={{ uri: module.thumbnailUri }} style={{ width: 76, height: 76, borderRadius: radius.sm }} />
                ) : (
                  <View style={{ width: 76, height: 76, borderRadius: radius.sm, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '700' }}>LESSON</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontSize: typography.cardTitle, fontWeight: '700' }}>{module.title}</Text>
                  <Text style={{ color: theme.colors.textSecondary, fontSize: typography.caption, marginTop: 4 }}>{module.purpose}</Text>
                </View>
              </View>
              <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginTop: spacing.sm }}>
                Available languages: {available.length ? available.map((language) => VR_LANGUAGE_LABELS[language]).join(', ') : 'None'}
              </Text>
              {VR_LANGUAGES.map((language) => {
                const videoUri = getLessonVideoUri(module.id, language);
                return videoUri ? (
                  <Button
                    key={language}
                    title={`Play ${VR_LANGUAGE_LABELS[language]}`}
                    icon="play-outline"
                    onPress={() => navigation.navigate('VrPlayer', { moduleId: module.id, language })}
                  />
                ) : (
                  <Text key={language} style={{ color: theme.colors.textSecondary, fontSize: 12, marginTop: spacing.sm }}>
                    {VR_LANGUAGE_LABELS[language]} version unavailable. Select another available language.
                  </Text>
                );
              })}
            </Card>
          );
        })
      )}
    </Screen>
  );
}