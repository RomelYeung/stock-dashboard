# Deep Research Chat Integration Design

## Overview
Add a minimalistic tools menu to the AI Financial Adviser chat input, allowing users to trigger a "Deep Research" process. The UI will provide feedback during the long-running process and inject the final report into the chat.

## UI Additions
*   **Tools Menu Button:** A subtle `+` button inside the left side of the chat input field.
*   **Popover Menu:** A glassmorphism-styled popover menu appearing above the input field when the `+` button is clicked. Contains a "Deep Research" option.
*   **Progress Indicator:** A subtle pulsating banner or inline indicator above the chat input showing "Deep Research in progress...".

## State Management
*   `showToolsMenu` (boolean): Controls visibility of the popover.
*   `isDeepResearching` (boolean): Tracks if a research task is currently active.
*   `deepResearchInteractionId` (string): Stores the ID of the active research task for polling.

## Data Flow
1.  **Start:** Clicking "Deep Research" sends a `POST` to `/api/ai/deep-research/start` with `{ ticker, prompt: "Generate a deep research report on [ticker]" }`.
2.  **Response:** The API returns an `interactionId`. The UI sets `isDeepResearching = true` and stores the ID.
3.  **Polling:** A `useEffect` hook polls `GET /api/ai/deep-research/status/:interactionId` every 10 seconds while `isDeepResearching` is true.
4.  **Completion:** When the API returns `status: 'completed'` and `result`:
    *   Stop polling.
    *   Set `isDeepResearching = false`.
    *   Append the result to the chat messages as a new message from the "Deep Research" agent.
    *   Play a subtle notification sound (browser default or visual only).

## Error Handling
*   If the start request fails, show an error message in the chat.
*   If polling fails repeatedly, abort the process and show an error message.
*   If the status returns `failed`, abort and show an error message.