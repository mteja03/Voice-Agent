# Voice Agent Architecture

## Overview

Voice Agent is a browser-based, real-time AI calling assistant for real-estate lead qualification.

Primary flow:

`Mic/VAD -> Sarvam STT -> GPT-4o -> Sarvam TTS (stream) -> Browser playback`

The system is designed for low-latency, interruption-safe conversations with configurable templates and knowledge-driven responses.

## Tech Stack

### Frontend
- React 18 + Vite
- Socket.IO client
- `@ricky0123/vad-react` / `@ricky0123/vad-web`
- Tailwind CSS
- Web Audio API

### Backend
- Node.js + Express
- Socket.IO server
- OpenAI SDK (`gpt-4o`)
- Sarvam AI (STT + streaming TTS)
- SQLite (`messages`, call logs)
- JSON KB store (`companyInfo.json`, `projects.json`)

## System Diagram

```text
┌─────────────────────┐
│   Browser (React)   │
│  - VAD capture      │
│  - Audio playback   │
│  - Socket client    │
└─────────┬───────────┘
          │ Socket.IO
┌─────────▼───────────┐
│ Backend (Express)   │
│  - Turn orchestration
│  - Chunked TTS flow │
│  - Session controls │
└───┬─────────┬───────┘
    │         │
    │         ├──────────────────────► SQLite (session memory/logs)
    │
    ├───────────────────────────────► Sarvam STT (`saaras:v3`)
    │
    ├───────────────────────────────► OpenAI LLM (`gpt-4o`)
    │
    └───────────────────────────────► Sarvam TTS stream (`bulbul:v3`)
```

## Runtime Flow (Per Turn)

1. User starts assistant in UI.
2. Frontend emits `start_assistant` with lead + settings + intro template.
3. Backend renders intro (template placeholders), synthesizes TTS, emits audio chunk.
4. Frontend plays intro and starts/continues VAD listening.
5. On speech end, frontend emits `process_audio` with WAV blob.
6. Backend transcribes speech (STT), filters low-signal input.
7. Backend streams LLM response.
8. Backend splits generated text into TTS-safe chunks and emits `tts_audio_chunk` events.
9. Frontend queues and plays chunks gaplessly.
10. Backend emits `response_complete` (`shouldEndCall` flag).
11. If closing is detected and auto-end is enabled, frontend emits `end_call` after playback.
12. Backend returns `call_summary`.

## Frontend Architecture

### Key modules
- `frontend/src/App.jsx`
  - App shell, tab routing, settings and lead persistence
- `frontend/src/hooks/useVoiceAgent.js`
  - Real-time orchestration, VAD, playback queue, socket event handlers
- `frontend/src/components/AgentConfig.jsx`
  - Agent settings, templates, KB UI
- `frontend/src/components/Dialer.jsx`
  - Call interaction surface
- `frontend/src/components/ConversationFeed.jsx`
  - Transcript and assistant turn feed

### Frontend behaviors
- Local persistence: settings and leads in `localStorage`
- Barge-in: user interruptions can cancel active assistant streams
- Closing protection: temporary barge-in suppression during final message playback
- Intro pending fallback: avoids "stuck processing" perception on first start

## Backend Architecture

### Key modules
- `backend/server.js`
  - Socket event orchestration, chunking, latency logging, call lifecycle
- `backend/services/sttService.js`
  - Sarvam STT API integration
- `backend/services/ttsService.js`
  - Sarvam streaming TTS integration
- `backend/services/chatService.js`
  - GPT prompt assembly, response streaming, summary generation
- `backend/services/knowledgeBase.js`
  - Company/project retrieval + KB relevance injection
- `backend/routes/knowledgeBase.js`
  - CRUD endpoints for company and projects

### Backend behaviors
- STT fallback: retries with `unknown` language only when primary transcript is empty
- Transcript filtering: drops low-signal/noise turns
- TTS chunking:
  - fast first chunk for quicker start
  - larger follow-up chunks to reduce total TTS calls
- Safe cleanup on `barge_in` / disconnect via per-socket abort controllers

## AI and Model Configuration

### Models
- STT: `saaras:v3`
- TTS: `bulbul:v3`
- LLM: `gpt-4o`

### LLM response shaping (current intent)
- short responses (1-2 concise sentences)
- exactly one follow-up question
- anti-repetition via recent message context
- punctuation-complete replies (avoid clipped tails)
- optional end marker: `[END_CALL]`

## Template Placeholders

Supported placeholders in conversation templates:
- `{leadName}`
- `{agentName}`
- `{companyName}` (from Company Profile `name`)

Current intro rendering path resolves all three placeholders.

## Socket Event Contract

### Client -> Server
- `start_assistant`
  - `{ sessionId, ttsModel, ttsVoice, languageMode, introTemplate, agentName, lead }`
- `process_audio`
  - `{ audioBuffer, sessionId, sttModel, ttsModel, ttsVoice, languageMode, agentName, lead }`
- `barge_in`
  - cancels in-flight assistant generation
- `end_call`
  - `{ sessionId, lead }`
- `clear_session`
  - `{ sessionId }`

### Server -> Client
- `transcript`
  - `{ transcript }`
- `tts_audio_chunk`
  - `{ audioBuffer, text }`
- `response_complete`
  - `{ aiText, shouldEndCall }`
- `no_speech`
- `call_summary`
  - `{ summary }`
- `session_cleared`
- `error`
  - `{ message }`

## REST API Contract (KB)

- `GET /api/kb/projects`
- `GET /api/kb/projects/:id`
- `POST /api/kb/projects`
- `PUT /api/kb/projects/:id`
- `DELETE /api/kb/projects/:id`
- `GET /api/kb/company-info`
- `PUT /api/kb/company-info`

## Configuration

Environment variables (backend):

- `SARVAM_API_KEY`
- `OPENAI_API_KEY`
- `PORT` (default: `3001`)
- `TTS_FIRST_CHUNK_MIN_CHARS`
- `TTS_NEXT_CHUNK_MIN_CHARS`
- `TTS_CHUNK_MAX_CHARS`

## Data Storage

- Browser local storage:
  - `sb-voice-settings`
  - `sb-leads`
  - `sb-active-lead-id`
- Backend:
  - SQLite for turn history and call records
  - JSON files for project and company profile data

## Local Development

- Frontend: `npm run dev` in `frontend` -> `http://localhost:5173`
- Backend: `npm run dev` in `backend` -> `http://localhost:3001`

## Known Constraints

- No auth and rate limiting in current local MVP
- Settings persist per browser profile, not globally synced
- Voice latency depends on STT + LLM + TTS network round-trips

## Suggested Next Enhancements

- Add auth and per-user settings profiles
- Add observability dashboards for turn-level latency percentiles
- Move from JSON KB to managed DB
- Add call scheduling + CRM sync integrations
- Add multilingual voice persona packs and A/B prompt versions
