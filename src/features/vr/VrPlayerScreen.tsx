/**
 * Education video player: plays the uploaded lesson video full-screen.
 * The selected language is fixed for the player session. Missing translations
 * are shown as unavailable rather than substituting another language.
 */
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/hooks/useAuth';
import { getLessonVideoUri, getVrModule, startVrSession, updateVrSession } from '@/services/vr';
import { spacing, typography } from '@/theme/theme';
import { VR_LANGUAGE_LABELS } from '@/types';
import { MainStackParamList } from '@/navigation/types';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Route = RouteProp<MainStackParamList, 'VrPlayer'>;

export function VrPlayerScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { user } = useAuth();
  const module = getVrModule(route.params.moduleId);
  const language = route.params.language;
  const videoUri = module ? getLessonVideoUri(module.id, language) : null;

  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [playerStatus, setPlayerStatus] = useState<'idle' | 'loading' | 'readyToPlay' | 'error'>('loading');
  const [playerError, setPlayerError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const player = useVideoPlayer(videoUri, (p) => {
    p.timeUpdateEventInterval = 1;
    if (videoUri) p.play();
  });

  useEffect(() => {
    if (user && module && videoUri) {
      const session = startVrSession(
        user,
        module.id,
        route.params.patientId ?? null,
        route.params.visitId ?? null,
        language
      );
      sessionIdRef.current = session.id;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!videoUri) return;
    setPlayerStatus(player.status);
    const statusSub = player.addListener('statusChange', (event) => {
      setPlayerStatus(event.status);
      if (event.status === 'error') {
        setPlayerError(event.error?.message ?? 'The selected lesson video could not be loaded.');
        setPlaying(false);
      } else if (event.status === 'readyToPlay') {
        setPlayerError(null);
      }
    });
    const timeSub = player.addListener('timeUpdate', ({ currentTime }) => {
      const duration = player.duration;
      if (!duration || duration <= 0) return;
      const pct = Math.min(Math.round((currentTime / duration) * 100), 100);
      setProgress(pct);
      if (sessionIdRef.current) updateVrSession(sessionIdRef.current, pct, pct >= 99);
    });
    const endSub = player.addListener('playToEnd', () => {
      setPlaying(false);
      setProgress(100);
      if (sessionIdRef.current) updateVrSession(sessionIdRef.current, 100, true);
    });
    return () => {
      statusSub.remove();
      timeSub.remove();
      endSub.remove();
    };
  }, [player, videoUri]);

  if (!module) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.subtitleText}>Module not found.</Text>
      </SafeAreaView>
    );
  }

  if (!videoUri) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.unavailable}>
          <Text style={styles.title}>{module.title}</Text>
          <Text style={styles.subtitleText}>
            The {VR_LANGUAGE_LABELS[language]} version is not available. Choose another available language from the library.
          </Text>
          <Pressable onPress={() => navigation.goBack()} style={styles.controlButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
            <Text style={styles.controlLabel}>Back to library</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const exit = () => {
    if (sessionIdRef.current) {
      updateVrSession(sessionIdRef.current, progress, progress >= 100);
    }
    navigation.goBack();
  };

  const replay = () => {
    setProgress(0);
    setPlayerError(null);
    setPlaying(true);
    player.currentTime = 0;
    player.play();
  };

  const togglePlay = () => {
    const next = !playing;
    setPlaying(next);
    if (next) player.play();
    else player.pause();
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top bar: title, language, exit */}
      <View style={styles.topBar}>
        <Text style={styles.title} numberOfLines={1}>
          {module.title}
        </Text>
        <View style={styles.topAction}>
          <Ionicons name="language" size={20} color="#fff" />
          <Text style={styles.topActionText}>{VR_LANGUAGE_LABELS[language]}</Text>
        </View>
        <Pressable onPress={exit} style={styles.topAction}>
          <Ionicons name="close" size={24} color="#fff" />
        </Pressable>
      </View>

      {/* Immersive scene */}
      <View style={styles.scene}>
        {playerStatus === 'error' ? (
          <View style={styles.unavailable}>
            <Ionicons name="alert-circle-outline" size={40} color="#EF5350" />
            <Text style={styles.subtitleText}>{playerError ?? 'The lesson video could not be loaded.'}</Text>
          </View>
        ) : playerStatus === 'loading' || playerStatus === 'idle' ? (
          <View style={styles.unavailable}>
            <Text style={styles.subtitleText}>Loading {VR_LANGUAGE_LABELS[language]} lesson…</Text>
          </View>
        ) : (
          <VideoView
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            nativeControls={false}
          />
        )}
      </View>

      {/* Progress indicator */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>
      <Text style={styles.progressLabel}>{progress}% complete</Text>

      {/* Bottom controls: play/pause, replay, subtitles (§8.13) */}
      <View style={styles.controls}>
        <Pressable onPress={togglePlay} disabled={playerStatus !== 'readyToPlay'} style={styles.controlButton}>
          <Ionicons name={playing ? 'pause' : 'play'} size={28} color="#fff" />
          <Text style={styles.controlLabel}>{playing ? 'Pause' : 'Play'}</Text>
        </Pressable>
        <Pressable onPress={replay} style={styles.controlButton}>
          <Ionicons name="refresh" size={28} color="#fff" />
          <Text style={styles.controlLabel}>Replay</Text>
        </Pressable>
        <Pressable onPress={exit} style={styles.controlButton}>
          <Ionicons name="exit-outline" size={28} color="#fff" />
          <Text style={styles.controlLabel}>Exit</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F14',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  title: {
    flex: 1,
    color: '#fff',
    fontSize: typography.cardTitle,
    fontWeight: '700',
  },
  topAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  topActionText: {
    color: '#fff',
    fontSize: 13,
  },
  scene: {
    flex: 1,
    margin: spacing.md,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#111A24',
    justifyContent: 'center',
  },
  unavailable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  subtitleText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#1B2836',
    borderRadius: 3,
    marginHorizontal: spacing.md,
  },
  progressFill: {
    height: 6,
    backgroundColor: '#5B9BE6',
    borderRadius: 3,
  },
  progressLabel: {
    color: '#94A3B1',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.md,
  },
  controlButton: {
    alignItems: 'center',
  },
  controlLabel: {
    color: '#94A3B1',
    fontSize: 12,
    marginTop: 4,
  },
});
