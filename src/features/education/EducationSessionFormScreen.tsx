import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Button, Card, CheckboxRow, EmptyState, Field, Screen, ScreenTitle, SegmentedControl } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { MainStackParamList } from '@/navigation/types';
import { EducationPatientOption, createEducationSession, listEducationPatients } from '@/services/education';
import { listFacilities } from '@/services/facilities';
import { getLessonVideoUri, listAvailableLessonLanguages, listVrModules } from '@/services/vr';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, typography } from '@/theme/theme';
import { VR_LANGUAGE_LABELS, VrLanguage, VrModule } from '@/types';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Route = RouteProp<MainStackParamList, 'EducationCreate'>;

function localDateAfter(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLocalDateTime(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const parsed = new Date(year, month - 1, day, hour, minute);
  if (
    parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day ||
    parsed.getHours() !== hour || parsed.getMinutes() !== minute
  ) return null;
  return parsed.toISOString();
}

export function EducationSessionFormScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const modules = useMemo(() => listVrModules(), []);
  const facilities = useMemo(() => listFacilities(), []);
  const [moduleId, setModuleId] = useState(route.params.moduleId ?? '');
  const [language, setLanguage] = useState<VrLanguage>(route.params.language ?? 'en');
  const [title, setTitle] = useState(route.params.title ?? '');
  const [facilityId, setFacilityId] = useState(user?.facilityId ?? facilities[0]?.id ?? '');
  const [patientIds, setPatientIds] = useState<string[]>(route.params.patientIds ?? []);
  const [needsConfirmed, setNeedsConfirmed] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [date, setDate] = useState(localDateAfter(1));
  const [time, setTime] = useState('09:00');
  const [duration, setDuration] = useState('60');
  const [capacity, setCapacity] = useState('20');
  const [location, setLocation] = useState('');
  const [error, setError] = useState<string | null>(null);

  const selectedModule = modules.find((module) => module.id === moduleId) ?? null;
  const availableLanguages = moduleId ? listAvailableLessonLanguages(moduleId) : [];
  const patients = user && facilityId ? listEducationPatients(user, facilityId) : [];
  const visiblePatients = patients.filter((patient) =>
    patient.fullName.toLocaleLowerCase().includes(patientSearch.trim().toLocaleLowerCase())
  );

  useEffect(() => {
    if (!availableLanguages.includes(language) && availableLanguages.length > 0) {
      setLanguage(availableLanguages[0]);
    }
  }, [moduleId, language, availableLanguages.join(',')]);

  useEffect(() => {
    setPatientIds((current) => current.filter((id) => patients.some((patient) => patient.id === id)));
  }, [facilityId]);

  if (!user) return null;

  const togglePatient = (patient: EducationPatientOption) => {
    setError(null);
    setPatientIds((current) => {
      if (current.includes(patient.id)) return current.filter((id) => id !== patient.id);
      if (current.length >= Math.min(20, Number(capacity) || 20)) {
        setError(`This group can include at most ${Math.min(20, Number(capacity) || 20)} women.`);
        return current;
      }
      return [...current, patient.id];
    });
  };

  const selectModule = (module: VrModule) => {
    setModuleId(module.id);
    setNeedsConfirmed(false);
    if (!title || modules.some((item) => item.title === title)) setTitle(module.title);
    const languages = listAvailableLessonLanguages(module.id);
    if (languages.length) setLanguage(languages[0]);
  };

  const handleCreate = () => {
    setError(null);
    if (!needsConfirmed) {
      setError('Confirm that each selected woman has an educational interest or need for this topic.');
      return;
    }
    const scheduledAt = parseLocalDateTime(date.trim(), time.trim());
    if (!scheduledAt) {
      setError('Enter a valid date (YYYY-MM-DD) and 24-hour time (HH:MM).');
      return;
    }
    const numericDuration = Number(duration);
    const numericCapacity = Number(capacity);
    try {
      const session = createEducationSession(user, {
        title,
        moduleId,
        language,
        scheduledAt,
        durationMinutes: numericDuration,
        location,
        maxCapacity: numericCapacity,
        facilityId,
        patientIds,
        followUpToId: route.params.followUpToId,
      });
      Alert.alert('Session Scheduled', 'The session and group roster were saved on this device.', [
        {
          text: 'View Session',
          onPress: () => navigation.replace('EducationSessionDetail', { sessionId: session.id }),
        },
      ]);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'The session could not be saved.');
    }
  };

  return (
    <Screen>
      <ScreenTitle subtitle="Select an education topic and a language version with an uploaded video.">
        Create Education Session
      </ScreenTitle>

      <Text style={{ color: theme.colors.text, fontSize: typography.sectionHeading, fontWeight: '600', marginBottom: spacing.sm }}>
        Lesson Topic
      </Text>
      {modules.map((module) => {
        const languages = listAvailableLessonLanguages(module.id);
        const selected = module.id === moduleId;
        return (
          <Card key={module.id} onPress={() => selectModule(module)} style={{ borderColor: selected ? theme.colors.primary : theme.colors.border }}>
            <Text style={{ color: theme.colors.text, fontSize: typography.body, fontWeight: '600' }}>{module.title}</Text>
            <Text style={{ color: theme.colors.textSecondary, fontSize: typography.caption, marginTop: 3 }}>{module.purpose}</Text>
            <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginTop: 4 }}>
              Video versions: {languages.length ? languages.map((item) => VR_LANGUAGE_LABELS[item]).join(', ') : 'None uploaded'}
            </Text>
          </Card>
        );
      })}

      {selectedModule ? (
        <Card>
          <Field label="Session Title" value={title} onChangeText={setTitle} />
          {availableLanguages.length > 0 ? (
            <SegmentedControl
              label="Video Language"
              value={language}
              onChange={setLanguage}
              options={availableLanguages.map((item) => ({ value: item, label: VR_LANGUAGE_LABELS[item] }))}
            />
          ) : (
            <Text style={{ color: theme.colors.warning, fontSize: typography.caption }}>
              No video is available for this lesson yet. Choose a lesson with an uploaded version.
            </Text>
          )}
          {getLessonVideoUri(moduleId, language) ? (
            <Text style={{ color: theme.colors.success, fontSize: 12 }}>
              Matching {VR_LANGUAGE_LABELS[language]} video ready.
            </Text>
          ) : null}
        </Card>
      ) : null}

      {user.role === 'admin' ? (
        facilities.length ? (
          <Card>
            <SegmentedControl
              label="Facility"
              value={facilityId}
              onChange={setFacilityId}
              options={facilities.map((facility) => ({ value: facility.id, label: facility.name }))}
            />
          </Card>
        ) : <EmptyState icon="business-outline" title="No Facilities" message="Add a facility before scheduling a group session." />
      ) : null}

      <Card>
        <CheckboxRow
          label="I confirmed each selected woman has an educational interest or need for this topic. This grouping does not indicate a shared medical condition."
          checked={needsConfirmed}
          onToggle={() => setNeedsConfirmed((current) => !current)}
        />
      </Card>

      <Text style={{ color: theme.colors.text, fontSize: typography.sectionHeading, fontWeight: '600', marginTop: spacing.md, marginBottom: spacing.xs }}>
        Participants ({patientIds.length}/20)
      </Text>
      <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginBottom: spacing.sm }}>
        Select women for shared education needs. This does not imply they share a medical condition.
      </Text>
      <Card>
        <Field label="Search patients at this facility" value={patientSearch} onChangeText={setPatientSearch} placeholder="Patient name" />
        {visiblePatients.length === 0 ? (
          <Text style={{ color: theme.colors.textSecondary, fontSize: typography.caption }}>
            No patients are available at this facility on this device.
          </Text>
        ) : visiblePatients.map((patient) => (
          <CheckboxRow
            key={patient.id}
            label={patient.fullName}
            checked={patientIds.includes(patient.id)}
            onToggle={() => togglePatient(patient)}
          />
        ))}
      </Card>

      <Card>
        <Field label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" />
        <Field label="Time (24-hour HH:MM)" value={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" />
        <Field label="Duration (minutes)" value={duration} onChangeText={setDuration} keyboardType="number-pad" />
        <Field label="Maximum Group Capacity (1-20)" value={capacity} onChangeText={setCapacity} keyboardType="number-pad" />
        <Field label="Clinic / Location" value={location} onChangeText={setLocation} placeholder="Optional" />
      </Card>

      {error ? <Text style={{ color: theme.colors.danger, fontSize: typography.caption, marginBottom: spacing.sm }}>{error}</Text> : null}
      <Button title="Save Session" icon="calendar-outline" onPress={handleCreate} />
      <Button title="Cancel" variant="secondary" onPress={() => navigation.goBack()} />
    </Screen>
  );
}