# Math Buddy

Photograph a maths question from a textbook, worksheet, or screen. Math Buddy is an iPhone app. It sends the picture and a class level (Class 1 through Class 12) from the phone to a vision model, then shows a final answer and a step-by-step explanation written for that class. Younger classes get shorter steps in simpler words. Older classes get fuller reasoning.

There is no website and no server in this project. The phone calls the vision API itself.

## Open it on an iPhone with Expo Go

1. Install **Expo Go** from the App Store. The current App Store version opens this Expo SDK 57 project.
2. Create a free account at [expo.dev](https://expo.dev) if you do not have one. On a physical iPhone, Expo Go only opens a project when the phone and the computer are signed in to the **same** Expo account.
3. On the computer, in this folder:

```bash
npm install
npx expo login
npx expo start --tunnel
```

4. On the iPhone, open Expo Go, tap the account icon, and sign in with that same account.
5. Wait until the terminal shows a QR code. Open the iPhone Camera app and scan it, then tap the banner to open the project in Expo Go. If the Camera app does not offer Expo Go, open Expo Go and use **Scan QR code** there.

`--tunnel` lets the phone reach the bundler when it is not on the same Wi-Fi as the computer. `@expo/ngrok` is installed with `npm install`, so the tunnel command does not need a separate global install. Leave that terminal running while you use the app.

If Expo Go says you are signed in on only one side, sign in on the other and tap **Try again**. Signing in while the server is already running is enough. Restart `npx expo start --tunnel` if you switch Expo accounts.

The class bar stays at the top. The selected class is sent with every solve.

The first time you tap **Take a photo**, iOS asks to allow the camera. **Choose a photo** asks for the photo library. In Expo Go, that prompt is for Expo Go, because Expo Go is the app on the phone. The camera and photo strings in `app.json` are what iOS shows after a later standalone build.

## The key

In the app, pick one provider and paste that provider's API key:

| Provider | Model |
| --- | --- |
| OpenAI | `gpt-4.1-mini` |
| xAI | `grok-4.6` |
| Groq | `qwen/qwen3.8-27b` |
| Anthropic | `claude-sonnet-5` |

The key is saved with Expo SecureStore on the iPhone only. Each provider keeps its own key, and the field shows the key for the provider you picked. Nothing in this repo holds a key. Do not paste a key into source files, `app.json`, or a `.env` file.

## A home-screen app later

Expo Go is how you run this on a phone from this project. An install with its own icon on the home screen needs **EAS Build** and an Apple developer account. Those credentials are not in this project, and no EAS build was started.

## Check the project on a computer

```bash
npm run typecheck
npx expo start
```

`npx expo start` without `--tunnel` only proves the bundler boots. Opening the app on an iPhone uses the tunnel steps above. This project was not run on an iPhone or in an iOS simulator.
