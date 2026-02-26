Design a call transcription and intelligence system (Amptalk-style) that:

- Models core entities: Call, Participant, Recording, Transcript, Insight

- Supports an asynchronous processing pipeline:
  Upload -> Transcription -> Analysis -> CRM Sync

- Exposes API-style use cases:
  POST /calls/{id}/recordings
  GET /recordings/{id}/transcript
  GET /calls/{id}/insights

- Uses event-driven jobs:
  RecordingUploaded, TranscriptReady, InsightsGenerated

- Keeps business logic in domain services:
  TranscriptionService, AnalysisService, CRMIntegrationService

- Demonstrates clean layering:
  Domain (entities/services), Application (orchestrator), Infrastructure (queue/repositories)
