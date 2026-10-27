# Math Buddy

Photograph a maths question from a textbook, worksheet, or screen. Pick a course, then choose **Hint** or **Solve**. Hint follows the tutor prompt for that course: one short hint or guiding question, and not the final answer. Solve gives the answer and the steps, using only ideas taught up through that course. The courses, in order, are Algebra 1, Algebra 2, Geometry, PreCalc, Calculus AB, Calculus BC, and Multivariable Calculus. Earlier courses get shorter steps and simpler words. If a problem needs a later course, the reply says so and stops at the selected course. Answers, steps, hints, and follow-ups render Markdown and LaTeX.

## Run locally

```bash
npm install
npm run dev
```

The dev server listens on [http://127.0.0.1:43123](http://127.0.0.1:43123) (`0.0.0.0:43123`).

**Take a picture** opens this device's camera in the page and captures a frame. **Upload a photo** picks an image you already have. **Hint** and **Solve** are the two run buttons. You can select one before the photo, and you press it again after the questions are listed. Crop the photo before anything else happens. Math Buddy then reads every question in the crop and waits. Choose all of the questions, or pick one from the list, then press **Hint** or **Solve**. The selected course is filled into the tutor prompt for a hint, and it sets the course ceiling for a solution.

Each finished hint or solve is saved in this browser with IndexedDB. The record keeps the course, the mode, the cropped picture, the questions that were found, which of them were used, the hint or the solution, the follow-up thread, and the model calls for that session. A model call is the question read, the hint or solve, or a follow-up: the course, the mode, the start and finish times, the text request, and the raw model reply. Those calls stay on the device. **History** opens a saved session again, including the calls. A follow-up uses the same mode as that session.

## Vision model

The route `POST /api/solve` reads the first key it finds:

| Order | Environment variable | Model |
| --- | --- | --- |
| 1 | `OPENAI_API_KEY` | `gpt-4.1-mini` |
| 2 | `XAI_API_KEY` | `grok-4.6` |
| 3 | `GROQ_API_KEY` | `qwen/qwen3.8-27b` |
| 4 | `ANTHROPIC_API_KEY` | `claude-sonnet-5` |

Copy `.env.example` to `.env.local` and set one key. Restart the dev server after you add it. If none of these variables is set, the page still loads and the solve button returns a clear message that a key is missing. Do not invent a key.
