# Math Buddy

Photograph a maths question from a textbook, worksheet, or screen. Math Buddy sends the picture and a math course to a vision model, then shows a final answer and a step-by-step explanation that uses only ideas taught up through that course. The courses, in order, are Algebra 1, Algebra 2, Geometry, PreCalc, Calculus AB, Calculus BC, and Multivariable Calculus. Earlier courses get shorter steps and simpler words. If a problem needs a later course, the explanation says so and stops at the selected course.

## Run locally

```bash
npm install
npm run dev
```

The dev server listens on [http://127.0.0.1:43123](http://127.0.0.1:43123) (`0.0.0.0:43123`).

Use the camera in the page, the phone camera via **Take a photo**, or **Upload a photo** on a computer without a camera. Pick the course in the bar at the top. That course is sent with every solve.

## Vision model

The route `POST /api/solve` reads the first key it finds:

| Order | Environment variable | Model |
| --- | --- | --- |
| 1 | `OPENAI_API_KEY` | `gpt-4.1-mini` |
| 2 | `XAI_API_KEY` | `grok-4.6` |
| 3 | `GROQ_API_KEY` | `qwen/qwen3.8-27b` |
| 4 | `ANTHROPIC_API_KEY` | `claude-sonnet-5` |

Copy `.env.example` to `.env.local` and set one key. Restart the dev server after you add it. If none of these variables is set, the page still loads and the solve button returns a clear message that a key is missing. Do not invent a key.
