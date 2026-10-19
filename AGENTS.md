# Math Buddy

This is an Expo SDK 57 iPhone app. The screen lives in `App.tsx`. Class guidance, the vision request, and on-device key storage live in `src/`.

There is no Next.js server and no Expo Router. The phone calls OpenAI, xAI, Groq, or Anthropic directly. API keys belong in Expo SecureStore, never in source, `app.json`, or env files.

Before changing an Expo API, read the matching docs at `https://docs.expo.dev/versions/v57.0.0/`.

```bash
npx expo install <package>
npm run typecheck
npx expo start --tunnel
```

Do not create `ios/` or `android/` by hand. Camera and photo permission strings belong in `app.json`. Do not start an EAS build unless Apple developer credentials are already present.
