# PresentFlow — AI Presentation Cognitive Assistant

## 1. Product Vision

Build a native desktop application designed to reduce cognitive load during presentation rehearsals.

**The application should act as an external working memory for the presenter.**

The target user is someone who has carefully prepared a presentation script but may forget sentences, lose their train of thought, or struggle to retrieve information while speaking, especially under pressure or when presenting in a non-native language.

Unlike a traditional teleprompter, the application must not simply scroll through a script at a fixed speed.

Instead, it must listen to the presenter's speech, continuously determine their position within the prepared material, display what they should say next, and remember which parts have not yet been covered.

**The most important product principle:**

The presenter controls the flow. The application follows, remembers, and assists.

The application must never force the presenter to follow a fixed sequence or interrupt their natural speaking process.

---

## 2. Primary Goals

The application must help the presenter answer three questions immediately:

1. **What should I say right now?**
2. **What should I say next within the current section?**
3. **Which prepared points have I not yet covered?**

The answers must be visually accessible with minimal reading and mental effort.

Success means the presenter can glance at the application for approximately one or two seconds and recover their train of thought.

The application is primarily a rehearsal and memory-support tool, not a presentation-scoring system.

---

# 3. Core System Requirements

## SYS-01: Native Desktop Application

Build a real desktop application for Windows, initially targeting computers equipped with NVIDIA GPUs.

Requirements:

- Runs as a standalone desktop application.
- Does not require a browser window.
- Resizable and movable.
- Supports Always on Top.
- Can be positioned beside PowerPoint, PDF viewers, or other presentation software.
- Remembers window size, position, and user preferences.
- Supports minimizing and restoring without losing the current rehearsal state.
- Works with both a single-monitor and dual-monitor setup.

The application should feel like a lightweight desktop companion, not a large productivity dashboard.

## SYS-02: Script Preparation

Users must be able to:

- Paste their prepared presentation script.
- Import text or Markdown files.
- Organize the script into slides, sections, and sentences.
- Edit the script before starting.
- Save presentations locally.
- Reopen previously saved presentations.

The prepared script is the authoritative source of what the presenter intends to say.

The system may extract section headings, keywords, and presentation cues from the script, but must not introduce new content requirements without the user's approval.

## SYS-03: Real-Time Speech Understanding

The application must continuously listen to the user's speech and track the prepared script.

It must support:

- German as the primary language.
- English as an additional language.
- Natural speech with pauses and hesitations.
- Self-corrections and repeated sentences.
- Partial sentences.
- Paraphrasing.
- Forward and backward jumps between sections.

The system should provide responsive updates with minimal latency.

Speech recognition and script tracking must run without blocking the UI.

## SYS-04: Multiple AI Providers

Support interchangeable audio-processing options:

**Local AI**
- Runs on the user's computer.
- Uses available NVIDIA GPU acceleration where appropriate.
- Can function without an internet connection after setup.

**OpenAI**
- Supports an appropriate OpenAI real-time/live audio or streaming transcription API.
- The implementation should use developer APIs rather than depend on the consumer ChatGPT Voice interface.

**Google Gemini**
- Supports an appropriate Gemini Live API or live transcription model.

The user must be able to choose the provider in Settings.

Important requirements:

- All providers must feed the same script-tracking system and user interface.
- Switching providers must not change how the application behaves from the presenter's perspective.
- Cloud services are optional.
- Cloud connection failures must be handled gracefully.
- API credentials must be stored securely.
- Sending microphone audio to a cloud provider must require an explicit user choice.
- No benchmark framework or provider-comparison dashboard is needed.

The developer should choose the most suitable implementation approach for each provider.

## SYS-05: Intelligent Script Alignment

The system must determine which prepared sentence or phrase corresponds to the user's current speech.

Matching must not depend solely on exact words.

Example:

Prepared script:

"Wir untersuchen, ob sich KI-Agenten gegen das Abschalten absichern."

User says:

"Wir schauen, ob Agenten versuchen, einen Shutdown zu verhindern."

The application should recognize that the user has covered the prepared statement.

It must also detect partial coverage when a sentence contains several meaningful components.

Requirements:

- Exact and approximate speech matching.
- Paraphrase recognition when sufficiently reliable.
- Detection of partially covered sentences.
- Recognition of repeated content.
- Conservative matching when wording is ambiguous.
- Resistance to jumping between unrelated sections.
- Context-aware handling of similar sentences in different sections.

Uncertain recognition must not cause aggressive navigation or falsely mark content as completed.

## SYS-06: Independent Section Memory

**This is a critical requirement.**

Every section must maintain its own progress and coverage state.

The presenter may move freely between sections.

Example:

Section A: Additional Resources

- Sentence A1: Covered
- Sentence A2: Not yet covered
- Sentence A3: Not yet covered

The presenter jumps to Section B: Why Is This Important?

The application must immediately display the appropriate content from Section B.

Later, the presenter returns to Section A.

The application must recognize this return and display the remaining content in Section A, starting from the relevant unfinished sentence.

The "Next" sentence must always belong to the currently active section unless that section has been completed.

Switching sections must not reset progress or automatically mark previous sections as completed.

The application must preserve independent coverage states for all sections throughout the rehearsal.

## SYS-07: Dynamic Navigation

The system must follow the presenter's actual spoken content, not the predefined order of the presentation.

Required behavior:

- If the speaker jumps forward, follow the new section.
- If the speaker returns backward, restore that section's remaining content.
- If the speaker repeats completed material, recognize it without duplicating progress.
- If the speaker skips a sentence, retain it as uncovered.
- If the speaker later mentions that sentence, automatically update its coverage status.

The system must use confidence-aware navigation to avoid sudden, incorrect jumps.

**The speaker should never need to manually tell the application that they have changed sections during normal use.**

However, manual navigation must remain available as a fallback.

## SYS-08: Coverage and Content Disappearance

Once a prepared sentence has been sufficiently covered:

- Remove it from the main speaking area.
- Promote the next uncovered sentence into the highlighted position.
- Update the corresponding section's coverage state.
- Keep completed content out of the presenter's primary visual field.

Completed text should remain recoverable through an optional history or editing view, but must not clutter the active speaking interface.

Skipped or uncovered text must not disappear permanently.

It should remain associated with its original section and be available as a reminder.

The system must distinguish between:

- Completed
- Currently active
- Upcoming
- Skipped / still uncovered
- Uncertain

## SYS-09: Contextual Next-Sentence Prediction

The application must always show the next relevant prepared sentence in the active section.

It must not blindly display the next sentence in the overall document.

When the user moves to another section, the application must update both the current highlighted sentence and its subsequent sentences.

If a section has no remaining uncovered content, the application should indicate that the section is complete, while allowing the presenter to return to other sections freely.

## SYS-10: Memory Rescue

Provide an optional Rescue Mode for moments when the presenter forgets what to say.

Requirements:

- Activated through a single button or keyboard shortcut.
- Displays a short memory cue associated with the current sentence.
- Can show 3–5 keywords or a short topic reminder.
- Can display the complete prepared sentence when needed.
- Must not generate unrelated suggestions or new factual content.
- Must not interrupt the microphone or reset the current section.

The user must always be able to return to the normal presentation view instantly.

Rescue Mode should not activate automatically simply because the presenter pauses.

## SYS-11: Rehearsal State and Recovery

The application must maintain session state reliably.

Requirements:

- Pause and resume without losing coverage information.
- Preserve section progress during AI provider reconnection.
- Recover gracefully after temporary microphone or network failures.
- Allow manual correction if the system follows the wrong section.
- Keep local presentation scripts available between sessions.
- Allow restarting the rehearsal from the beginning.

The system must never silently erase uncovered content.

---

# 4. Core UI/UX Requirements

## UI-01: Cognitive Load First

Design the interface for a person who may be experiencing working-memory overload, anxiety, or difficulty retrieving prepared information while speaking.

The interface must prioritize:

- Immediate visual understanding.
- Minimal reading.
- Low visual noise.
- Strong information hierarchy.
- Predictable behavior.
- Large, readable text.
- Minimal decisions during speaking.

Avoid dashboards, unnecessary metrics, graphs, or excessive controls in the active rehearsal view.

## UI-02: Primary Screen Layout

The main interface should contain two primary regions.

**Main speaking area — approximately 70% of the content width**

Displays, like song lyrics:
- The sentences just passed, above the current one (fading out towards the top).
- Current section title.
- Current highlighted sentence.
- Next sentence within that section.
- Optional additional upcoming sentence.
- Rescue Mode when activated.

**Right-side section navigator — approximately 30% of the content width**

Displays, from top to bottom:
- All talking points of the active section in large type, readable from about one metre (own text-size
  setting). Said points are ticked and stay in place; the current one is highlighted, skipped ones are marked.
- The list of slides with their status; the current slide shows its sections underneath. Scripts without
  slides list their sections instead.

Covering:
- Sections or topics of the presentation.
- Current active section.
- Completed sections.
- Partially completed sections.
- Remaining key points.
- Skipped content associated with each section.

The layout must remain usable when the application is resized.

## UI-03: Current Sentence Highlight

The current sentence is the most important visual element.

Requirements:

- Prominent central placement.
- Large font, initially around 30–36 px.
- Clear highlighting with high contrast.
- Comfortable line spacing.
- Sufficient surrounding whitespace.
- No competing elements of equal visual prominence.

The presenter should be able to read the current sentence immediately without searching for it.

## UI-04: Next Sentence

Display the next sentence directly below the highlighted sentence.

Requirements:

- Slightly smaller font than the current sentence.
- Clear but visually secondary.
- Always derived from the active section.
- Automatically promoted when the current sentence is completed.

Optionally display one additional upcoming sentence if space permits.

Never fill the main area with an unnecessarily long passage.

## UI-04a: Previous Sentences

Keep the sentences just passed visible above the current one, like song lyrics.

Requirements:

- The sentence just left stays fully readable (same size as the next sentence): recognition may advance before the presenter finishes speaking it.
- Older sentences are smaller and fade out towards the top; when space runs out, the oldest text is clipped first.
- Passed sentences that were not said carry a subtle skipped marker.
- Previous sentences never push the current sentence out of its position.

## UI-05: Intelligent Table of Contents

Provide a persistent right-side navigator. The talking points of the active section come first, in
large type; the slides are listed compactly below, with the current slide's sections underneath.
Scripts without slides list every section.

Example:

**Folie 6 — AI Agent Safety**

- ✓ Testumgebung
- ✓ Konkurrenz
- ◉ Shutdown Resistance
- ○ Zusätzliche Ressourcen
- ○ Warum ist das wichtig?
- ○ Überleitung

Statuses:

- Completed
- Active
- Not yet covered
- Partially covered

Each section should expand to reveal its remaining talking points when useful.

The right-side navigator should act as a visual memory map.

It must be possible to click a section and manually navigate to it.

Automatic speech tracking should continue afterward.

## UI-06: Skipped Content

If the presenter skips content:

- Keep following the new spoken position.
- Mark uncovered content in the appropriate section.
- Show remaining content in the right-side navigator.
- Do not force a return.
- Do not display disruptive warnings.
- Automatically update the reminder if the content is covered later.

Skipped content should remain accessible without dominating the main reading area.

## UI-07: Stable Visual Behavior

The interface must avoid unnecessary movement.

Requirements:

- Do not scroll continuously word by word.
- Avoid flickering highlights.
- Avoid rapid switching between candidate sentences.
- Keep the current sentence in a predictable screen position.
- Use subtle transitions between sentences (a short upward move of the sentence just left, without motion when reduced motion is requested).
- Do not reorganize the entire interface whenever a status changes.

The UI should move only when there is sufficient confidence that the speaker has advanced or changed sections.

## UI-08: Adjustable Accessibility Settings

Provide settings for:

- Font size.
- Line spacing.
- High-contrast mode.
- Dark and light themes.
- Window transparency.
- Always on Top.
- Main-panel and sidebar proportions.
- Number of upcoming sentences displayed.

Settings should be configurable before rehearsal and remembered between sessions.

## UI-09: Minimal Controls

The active interface should expose only essential controls:

- Start
- Pause / Resume
- Stop
- Rescue
- Settings

Avoid displaying technical configuration details during rehearsal.

AI provider configuration, API keys, model options, and other technical settings belong in a separate settings panel.

## UI-10: Quiet Operation

The application should be visually supportive and non-intrusive.

Default behavior:

- No spoken AI responses.
- No distracting notification sounds.
- No aggressive alerts.
- No forced corrections during speaking.
- No performance grades during rehearsal.
- No visible speech-recognition debug output.

The presenter should focus on speaking, not on operating the application.

---

# 5. Essential Interaction Scenarios

## Scenario A: Normal Speaking

The presenter speaks a prepared sentence.

Expected behavior:

1. The application recognizes the speech.
2. The sentence is marked as covered.
3. The completed sentence disappears from the main speaking area.
4. The next sentence becomes highlighted.
5. The following sentence appears underneath.

## Scenario B: Partial Sentence Coverage

A prepared sentence contains three meaningful pieces of information.

The presenter covers only two.

Expected behavior:

- The covered parts are recognized.
- The uncovered part remains available.
- The entire sentence is not incorrectly marked as completed.

## Scenario C: Jump Between Sections

The presenter moves from "Zusätzliche Ressourcen" to "Warum ist das wichtig?"

Expected behavior:

- The application recognizes the new section.
- The highlighted sentence changes to that section.
- The next sentence comes from the same section.
- The earlier section retains its independent unfinished state.

## Scenario D: Return to an Earlier Section

The presenter returns to "Zusätzliche Ressourcen."

Expected behavior:

- The application recognizes the return.
- Previously completed content remains completed.
- The appropriate remaining sentence is highlighted.
- The following sentence is displayed underneath.
- No previously stored progress is lost.

## Scenario E: Forgetting During a Presentation

The presenter stops speaking because they cannot remember the next point.

Expected behavior:

- The application does not interpret silence as completion.
- The current sentence remains visible.
- The right-side navigator remains stable.
- The presenter can activate Rescue Mode.
- A short cue helps them recall the prepared material.

## Scenario F: AI Recognition Error

The system incorrectly detects a different section.

Expected behavior:

- Low-confidence navigation should be delayed or avoided.
- The user can manually select the correct section.
- The application resumes tracking from that location.
- Already covered content is preserved.

---

# 6. Additional Cognitive Support Features

These are useful features but should remain secondary to the core system.

### Optional Memory Cues

Allow a short memory cue for each sentence or section.

Example:

Prepared sentence:

"Das ist wichtig, weil künftig mehrere KI-Agenten über längere Zeit an komplexen Aufgaben arbeiten."

Memory cue:

"Warum wichtig? → Mehrere Agenten → lange Aufgaben"

These cues may be generated from the prepared script, reviewed by the user, and saved.

### Focus Lock

Allow the user to temporarily freeze the currently displayed sentence.

This can be useful when the presenter needs additional time to collect their thoughts.

Speech recognition may continue, but the main visual position should remain fixed until Focus Lock is released.

### Manual Recovery

Provide simple keyboard shortcuts to:

- Show the next sentence.
- Return to the previous sentence.
- Activate Rescue Mode.
- Freeze/unfreeze the current display.

These controls should be optional fallbacks, not necessary for normal operation.

### Simple Rehearsal Summary

At the end of the rehearsal, optionally show:

- Covered content.
- Remaining or skipped content.
- Sections that were only partially covered.

Do not build a benchmarking or detailed performance-evaluation system.

---

# 7. What the Application Must NOT Become

Avoid the following:

- A conventional time-based teleprompter.
- A full-screen transcript viewer.
- A generic AI chatbot.
- A presentation-grading platform.
- A benchmark framework.
- A complex agent system.
- A tool that invents additional presentation content.
- A tool that forces strict sequential navigation.
- A distracting assistant that continuously provides unsolicited feedback.

The application should remain an unobtrusive cognitive support tool.

---

# 8. MVP Requirements

The initial usable release should include:

1. A native, resizable Windows desktop window.
2. Script input and section organization.
3. Real-time microphone listening.
4. At least one working local AI option.
5. Support for an OpenAI real-time/live audio option.
6. Support for a Google Gemini live audio option.
7. Automatic speech-to-script synchronization.
8. Large current-sentence highlighting.
9. The next sentence displayed immediately below.
10. Automatic removal of completed sentences from the main panel.
11. A persistent right-side section navigator.
12. Independent progress memory for each section.
13. Automatic forward and backward section navigation.
14. Tracking of skipped or partially covered content.
15. Rescue Mode.
16. Basic settings, pause/resume, and reliable session recovery.

Do not spend time on unnecessary infrastructure or elaborate features before these workflows are working correctly.

---

# 9. Definition of Done

The application is ready for practical use when the following scenario works reliably:

A user prepares a five-minute German presentation containing several sections.

They open the desktop application beside PowerPoint and begin speaking.

The application listens and highlights the prepared sentence corresponding to what they are saying.

Completed sentences disappear from the main speaking area.

The next sentence is always visible underneath.

The user unexpectedly jumps to a different section. The application recognizes the change, displays that section's current sentence and next sentence, and preserves the unfinished state of the previous section.

The user later returns to the previous section. The application remembers what was already covered and shows the appropriate remaining content.

When the user forgets what to say, they can glance at the screen or activate Rescue Mode and immediately recover the intended talking point.

Throughout the process, the interface stays visually stable, quiet, and easy to understand.

**Final guiding principle:**

Build a presentation assistant that reduces the amount of information the presenter must keep in working memory.

The application should remember the structure, track progress, and provide the next useful cue — allowing the human to focus on communicating.
