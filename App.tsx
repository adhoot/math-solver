import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { CLASS_LEVELS, type ClassLevel } from "./src/class-level";
import { preparePhoto, type PreparedPhoto } from "./src/prepare-photo";
import { loadSettings, saveKey, saveProvider } from "./src/storage";
import {
  emptyKeys,
  getProvider,
  PROVIDERS,
  solveFromImage,
  SolveError,
  type ProviderId,
  type SolveSuccess,
} from "./src/vision";

type FailureCode =
  | "missing_key"
  | "rejected_key"
  | "bad_request"
  | "model_error"
  | "camera"
  | "library";

type Failure = {
  code: FailureCode;
  error: string;
};

type Phase = "idle" | "loading" | "result" | "error";

const FAILURE_TITLES: Record<FailureCode, string> = {
  missing_key: "No vision model key",
  rejected_key: "That key was rejected",
  bad_request: "That photo didn't go through",
  model_error: "The model couldn't finish",
  camera: "The camera didn't open",
  library: "The photo library didn't open",
};

const colors = {
  background: "#F4F0E6",
  ink: "#243044",
  muted: "#5C6570",
  card: "#FFFCF8",
  border: "#E4D6C4",
  primary: "#9C4528",
  primaryText: "#FFF8F1",
  accent: "#F3E4C4",
  danger: "#8C3428",
  dangerBg: "#F8EBE6",
  dangerBorder: "#E4C4BC",
  notice: "#F7EBD2",
  noticeBorder: "#E4D0A4",
};

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <MathBuddy />
    </SafeAreaProvider>
  );
}

function MathBuddy() {
  const insets = useSafeAreaInsets();
  const classScrollRef = useRef<ScrollView>(null);
  const revealedClass = useRef(false);
  const mounted = useRef(true);

  const [classLevel, setClassLevel] = useState<ClassLevel>(6);
  const [providerId, setProviderId] = useState<ProviderId>("openai");
  const [keys, setKeys] = useState(emptyKeys);
  const [draftKey, setDraftKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [keySaved, setKeySaved] = useState(false);
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [preparing, setPreparing] = useState(false);
  const [result, setResult] = useState<SolveSuccess | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);

  const provider = getProvider(providerId);
  const busy = phase === "loading" || preparing;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await loadSettings();
        if (cancelled) return;
        setProviderId(loaded.providerId);
        setKeys(loaded.keys);
        setDraftKey(loaded.keys[loaded.providerId]);
        setKeySaved(Boolean(loaded.keys[loaded.providerId]));
      } catch {
        if (!cancelled) {
          setSettingsError(
            "The saved key could not be read. Paste it again. It stays on this iPhone.",
          );
        }
      } finally {
        if (!cancelled) setSettingsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function revealStartingClass() {
    if (revealedClass.current) return;
    revealedClass.current = true;
    const index = CLASS_LEVELS.indexOf(6);
    classScrollRef.current?.scrollTo({
      x: Math.max(0, index * 52 - 96),
      animated: false,
    });
  }

  function onClassChange(level: ClassLevel) {
    if (busy || level === classLevel) return;
    setClassLevel(level);
    setResult(null);
    setFailure(null);
    setPhase("idle");
  }

  async function persistKey(id: ProviderId, value: string): Promise<string> {
    const trimmed = value.replace(/\s+/g, "");
    setDraftKey(trimmed);
    setKeys((current) => ({ ...current, [id]: trimmed }));
    try {
      await saveKey(id, trimmed);
      if (mounted.current) {
        setKeySaved(Boolean(trimmed));
        setSettingsError(null);
      }
    } catch {
      if (mounted.current) {
        setKeySaved(false);
        setSettingsError(
          "The key could not be saved on this iPhone. Check that the device is unlocked, then try again.",
        );
      }
    }
    return trimmed;
  }

  async function onProviderChange(next: ProviderId) {
    if (busy || next === providerId) return;
    const trimmed = draftKey.replace(/\s+/g, "");
    const nextKeys = { ...keys, [providerId]: trimmed };
    setKeys(nextKeys);
    setProviderId(next);
    setDraftKey(nextKeys[next]);
    setShowKey(false);
    setKeySaved(Boolean(nextKeys[next]));
    try {
      await saveKey(providerId, trimmed);
      await saveProvider(next);
      if (mounted.current) setSettingsError(null);
    } catch {
      if (mounted.current) {
        setSettingsError("That change could not be saved on this iPhone.");
      }
    }
  }

  async function acceptAsset(asset: ImagePicker.ImagePickerAsset) {
    setPreparing(true);
    setFailure(null);
    try {
      const prepared = await preparePhoto(asset);
      if (!mounted.current) return;
      setPhoto(prepared);
      setResult(null);
      setPhase("idle");
    } catch (error) {
      if (!mounted.current) return;
      setFailure({
        code: "bad_request",
        error:
          error instanceof Error
            ? error.message
            : "This photo format didn't open. Try a JPEG or PNG.",
      });
      setPhase("error");
    } finally {
      if (mounted.current) setPreparing(false);
    }
  }

  async function takePhoto() {
    if (busy) return;
    setFailure(null);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setFailure({
          code: "camera",
          error: permission.canAskAgain
            ? "Allow the camera so Math Buddy can photograph the question."
            : "Camera access is off. Open Settings, tap Expo Go, turn Camera on, then try again.",
        });
        setPhase("error");
        return;
      }
      const picked = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        cameraType: ImagePicker.CameraType.back,
        quality: 1,
        exif: false,
      });
      if (picked.canceled || !picked.assets?.[0]) return;
      await acceptAsset(picked.assets[0]);
    } catch {
      if (!mounted.current) return;
      setFailure({
        code: "camera",
        error: "The camera didn't open. Try again, or choose a photo you already have.",
      });
      setPhase("error");
    }
  }

  async function choosePhoto() {
    if (busy) return;
    setFailure(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setFailure({
          code: "library",
          error: permission.canAskAgain
            ? "Allow photo access so you can choose a picture of the question."
            : "Photo access is off. Open Settings, tap Expo Go, allow Photos, then choose the question again.",
        });
        setPhase("error");
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 1,
        exif: false,
      });
      if (picked.canceled || !picked.assets?.[0]) return;
      await acceptAsset(picked.assets[0]);
    } catch {
      if (!mounted.current) return;
      setFailure({
        code: "library",
        error: "The photo library didn't open. Try again.",
      });
      setPhase("error");
    }
  }

  async function solve() {
    if (!photo || busy || !settingsReady) return;
    const submittedClass = classLevel;
    const submittedProvider = providerId;
    const submittedPhoto = photo;
    setPhase("loading");
    setFailure(null);
    setResult(null);
    const submittedKey = await persistKey(submittedProvider, draftKey);
    try {
      const solved = await solveFromImage({
        classLevel: submittedClass,
        providerId: submittedProvider,
        apiKey: submittedKey,
        mimeType: "image/jpeg",
        base64: submittedPhoto.base64,
      });
      if (!mounted.current) return;
      setResult(solved);
      setPhase("result");
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof SolveError) {
        setFailure({ code: error.code, error: error.message });
      } else {
        setFailure({
          code: "model_error",
          error: "The request stopped before an answer came back. Try again.",
        });
      }
      setPhase("error");
    }
  }

  const aspectRatio =
    photo && photo.width > 0 && photo.height > 0 ? photo.width / photo.height : 4 / 3;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.mark} accessibilityElementsHidden>
            <Text style={styles.markText}>π</Text>
          </View>
          <View style={styles.brandCopy}>
            <Text style={styles.wordmark}>Math Buddy</Text>
            <Text style={styles.tagline}>A photo of the question is enough.</Text>
          </View>
        </View>
        <View style={styles.classRow}>
          <Text style={styles.classLabel}>Class</Text>
          <ScrollView
            ref={classScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.classScroller}
            contentContainerStyle={styles.classChips}
            accessibilityLabel="Class level"
            onLayout={revealStartingClass}
          >
            {CLASS_LEVELS.map((level) => {
              const selected = level === classLevel;
              return (
                <Pressable
                  key={level}
                  accessibilityRole="button"
                  accessibilityLabel={`Class ${level}`}
                  accessibilityState={{ selected, disabled: busy }}
                  disabled={busy}
                  onPress={() => onClassChange(level)}
                  style={({ pressed }) => [
                    styles.classChip,
                    selected && styles.classChipSelected,
                    pressed && !selected && styles.pressed,
                  ]}
                >
                  <Text style={[styles.classChipText, selected && styles.classChipTextSelected]}>
                    {level}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        >
          <Text style={styles.intro}>
            Snap a question from a book, a worksheet, or a screen. Class {classLevel} sets the
            voice: shorter steps and simpler words for younger classes, fuller reasoning from Class
            9 up.
          </Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Vision model</Text>
            <Text style={styles.cardBody}>
              Pick who solves the photo. The key is saved on this iPhone and sent only with the
              request to that provider.
            </Text>

            {!settingsReady ? (
              <View style={styles.inlineStatus} accessibilityRole="progressbar">
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.cardBody}>Reading the key saved on this iPhone.</Text>
              </View>
            ) : null}

            {settingsReady && !draftKey.trim() ? (
              <View style={styles.notice}>
                <Text style={styles.noticeTitle}>The solver is waiting for a key</Text>
                <Text style={styles.noticeBody}>
                  Choose a provider and paste its API key. You can still take a photo. Solving
                  will ask for the key again if it is still missing.
                </Text>
              </View>
            ) : null}

            {settingsError ? (
              <View style={styles.errorBox} accessibilityRole="alert">
                <Text style={styles.errorTitle}>The key didn't save</Text>
                <Text style={styles.errorBody}>{settingsError}</Text>
              </View>
            ) : null}

            <View style={styles.providerRow}>
              {PROVIDERS.map((item) => {
                const selected = item.id === providerId;
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                    accessibilityState={{ selected, disabled: busy || !settingsReady }}
                    disabled={busy || !settingsReady}
                    onPress={() => void onProviderChange(item.id)}
                    style={({ pressed }) => [
                      styles.providerChip,
                      selected && styles.providerChipSelected,
                      pressed && !selected && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.providerChipText,
                        selected && styles.providerChipTextSelected,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.modelLine}>Uses {provider.model}</Text>

            <Text style={styles.fieldLabel}>{provider.label} API key</Text>
            <View style={styles.keyRow}>
              <TextInput
                value={draftKey}
                onChangeText={(value) => {
                  setDraftKey(value);
                  setKeySaved(false);
                }}
                onEndEditing={() => {
                  if (settingsReady) void persistKey(providerId, draftKey);
                }}
                editable={settingsReady && !busy}
                secureTextEntry={!showKey}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                textContentType="none"
                placeholder="Paste your API key"
                placeholderTextColor={colors.muted}
                accessibilityLabel={`${provider.label} API key`}
                style={styles.keyInput}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showKey ? "Hide API key" : "Show API key"}
                onPress={() => setShowKey((current) => !current)}
                style={styles.textButton}
              >
                <Text style={styles.textButtonLabel}>{showKey ? "Hide" : "Show"}</Text>
              </Pressable>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save API key on this iPhone"
              disabled={!settingsReady || busy}
              onPress={() => void persistKey(providerId, draftKey)}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.pressed,
                (!settingsReady || busy) && styles.disabled,
              ]}
            >
              <Text style={styles.secondaryButtonLabel}>Save key on this iPhone</Text>
            </Pressable>
            {keySaved ? (
              <Text style={styles.savedLine}>Saved on this iPhone.</Text>
            ) : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>The question</Text>
            <Text style={styles.cardBody}>
              Use the iPhone camera, or a photo you already have.
            </Text>
            <View style={styles.photoFrame}>
              {photo ? (
                <Image
                  source={{ uri: photo.uri }}
                  accessibilityLabel="The question you are about to solve"
                  resizeMode="contain"
                  style={[styles.photo, { aspectRatio }]}
                />
              ) : (
                <View style={styles.photoEmpty}>
                  <Text style={styles.photoMark}>+</Text>
                  <Text style={styles.photoEmptyText}>
                    No question yet. Take a photo of a textbook, a worksheet, or a screen, or
                    choose one you already have.
                  </Text>
                </View>
              )}
            </View>
            {preparing ? (
              <View style={styles.inlineStatus} accessibilityRole="progressbar">
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.cardBody}>Preparing the photo…</Text>
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Take a photo"
              disabled={busy}
              onPress={() => void takePhoto()}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.pressed,
                busy && styles.disabled,
              ]}
            >
              <Text style={styles.secondaryButtonLabel}>Take a photo</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose a photo"
              disabled={busy}
              onPress={() => void choosePhoto()}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.pressed,
                busy && styles.disabled,
              ]}
            >
              <Text style={styles.secondaryButtonLabel}>Choose a photo</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Solve for Class ${classLevel}`}
              disabled={!photo || busy || !settingsReady}
              onPress={() => void solve()}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
                (!photo || busy || !settingsReady) && styles.disabled,
              ]}
            >
              {phase === "loading" ? (
                <View style={styles.buttonRow}>
                  <ActivityIndicator color={colors.primaryText} />
                  <Text style={styles.primaryButtonLabel}>Solving for Class {classLevel}</Text>
                </View>
              ) : (
                <Text style={styles.primaryButtonLabel}>Solve for Class {classLevel}</Text>
              )}
            </Pressable>
          </View>

          <View style={styles.card} accessibilityState={{ busy: phase === "loading" }}>
            <Text style={styles.cardTitle}>The working</Text>
            <Text style={styles.cardBody}>Written for the class selected at the top.</Text>

            {phase === "loading" ? (
              <View
                style={styles.workingEmpty}
                accessibilityRole="progressbar"
                accessibilityLiveRegion="polite"
              >
                <ActivityIndicator color={colors.primary} size="large" />
                <Text style={styles.workingTitle}>
                  Reading the question and writing the steps for Class {classLevel}.
                </Text>
              </View>
            ) : null}

            {phase === "error" && failure ? (
              <View style={styles.errorBox} accessibilityRole="alert">
                <Text style={styles.errorTitle}>{FAILURE_TITLES[failure.code]}</Text>
                <Text style={styles.errorBody}>{failure.error}</Text>
              </View>
            ) : null}

            {phase === "error" &&
            failure &&
            photo &&
            failure.code !== "camera" &&
            failure.code !== "library" ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Try again"
                onPress={() => void solve()}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
              >
                <Text style={styles.secondaryButtonLabel}>Try again</Text>
              </Pressable>
            ) : null}

            {phase === "result" && result ? (
              <View style={styles.resultBlock}>
                <Text style={styles.classStamp}>Class {result.classLevel}</Text>
                {result.question ? (
                  <View style={styles.resultSection}>
                    <Text style={styles.sectionLabel}>From the photo</Text>
                    <Text selectable style={styles.bodyText}>
                      {result.question}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.answerBox}>
                  <Text style={styles.sectionLabel}>Answer</Text>
                  <Text selectable style={styles.answerText}>
                    {result.answer}
                  </Text>
                </View>
                <View style={styles.resultSection}>
                  <Text style={styles.sectionLabel}>How to get there</Text>
                  {result.steps.length > 0 ? (
                    result.steps.map((step, index) => (
                      <View key={`${index}-${step.slice(0, 24)}`} style={styles.stepRow}>
                        <View style={styles.stepBadge}>
                          <Text style={styles.stepBadgeText}>{index + 1}</Text>
                        </View>
                        <Text selectable style={styles.stepText}>
                          {step}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.cardBody}>
                      The model gave an answer without listing steps. Try the photo again if you
                      want the working.
                    </Text>
                  )}
                </View>
                <Text style={styles.modelLine}>
                  {result.provider} · {result.model}
                </Text>
              </View>
            ) : null}

            {phase === "idle" ? (
              <View style={styles.workingEmpty}>
                <Text style={styles.workingTitle}>Nothing solved yet.</Text>
                <Text style={styles.cardBody}>
                  When you send a photo, the answer and the working land here, written the way
                  Class {classLevel} would read it.
                </Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  mark: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  markText: {
    color: colors.primaryText,
    fontFamily: "Georgia",
    fontSize: 22,
    lineHeight: 26,
  },
  brandCopy: {
    flex: 1,
    gap: 2,
  },
  wordmark: {
    fontFamily: "Georgia",
    fontSize: 22,
    lineHeight: 26,
    color: colors.ink,
  },
  tagline: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  classRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  classLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.ink,
  },
  classScroller: {
    flexGrow: 1,
    flexShrink: 1,
    height: 44,
  },
  classChips: {
    gap: 8,
    paddingRight: 4,
  },
  classChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  classChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  classChipText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.ink,
  },
  classChipTextSelected: {
    color: colors.primaryText,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 14,
  },
  intro: {
    fontSize: 16,
    lineHeight: 23,
    color: colors.muted,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
  },
  cardTitle: {
    fontFamily: "Georgia",
    fontSize: 22,
    lineHeight: 28,
    color: colors.ink,
  },
  cardBody: {
    fontSize: 16,
    lineHeight: 23,
    color: colors.muted,
  },
  notice: {
    backgroundColor: colors.notice,
    borderColor: colors.noticeBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  noticeTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.ink,
  },
  noticeBody: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.ink,
  },
  errorBox: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.danger,
  },
  errorBody: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.ink,
  },
  providerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  providerChip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  providerChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  providerChipText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.ink,
  },
  providerChipTextSelected: {
    color: colors.primaryText,
  },
  modelLine: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.ink,
  },
  keyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  keyInput: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.background,
  },
  textButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  textButtonLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.primary,
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    paddingHorizontal: 14,
  },
  secondaryButtonLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.ink,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
  },
  primaryButtonLabel: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.primaryText,
  },
  buttonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  savedLine: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.primary,
    fontWeight: "600",
  },
  photoFrame: {
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    backgroundColor: colors.background,
    overflow: "hidden",
  },
  photo: {
    width: "100%",
    maxHeight: 360,
    backgroundColor: colors.background,
  },
  photoEmpty: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    gap: 8,
  },
  photoMark: {
    fontFamily: "Georgia",
    fontSize: 32,
    lineHeight: 36,
    color: colors.primary,
  },
  photoEmptyText: {
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center",
    color: colors.ink,
  },
  inlineStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  workingEmpty: {
    minHeight: 140,
    justifyContent: "center",
    gap: 8,
  },
  workingTitle: {
    fontFamily: "Georgia",
    fontSize: 22,
    lineHeight: 28,
    color: colors.ink,
  },
  resultBlock: {
    gap: 16,
  },
  resultSection: {
    gap: 8,
  },
  classStamp: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.primary,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.muted,
  },
  bodyText: {
    fontSize: 16,
    lineHeight: 23,
    color: colors.ink,
  },
  answerBox: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  answerText: {
    fontFamily: "Georgia",
    fontSize: 28,
    lineHeight: 34,
    color: colors.ink,
  },
  stepRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  stepBadgeText: {
    color: colors.primaryText,
    fontSize: 14,
    fontWeight: "700",
  },
  stepText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 23,
    color: colors.ink,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.45,
  },
});
