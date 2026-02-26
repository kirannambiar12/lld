const {
    ParticipantRole,
    RecordingStatus,
    Participant,
    Call,
    Recording,
    TranscriptionService,
    AnalysisService,
    CRMIntegrationService,
    InMemoryJobQueue,
    CallRepository,
    RecordingRepository,
    TranscriptRepository,
    InsightRepository,
} = require("./classes");

// ── Application Service (Use-Case Layer) ────────────────

class CallIntelligenceSystem {
    constructor() {
        this.callRepo = new CallRepository();
        this.recordingRepo = new RecordingRepository();
        this.transcriptRepo = new TranscriptRepository();
        this.insightRepo = new InsightRepository();

        this.transcriptionService = new TranscriptionService();
        this.analysisService = new AnalysisService();
        this.crmIntegrationService = new CRMIntegrationService();

        this.queue = new InMemoryJobQueue();

        this.recordingCounter = 0;
        this.registerWorkers();
    }

    registerWorkers() {
        this.queue.registerWorker(
            "RecordingUploaded",
            async ({ recordingId }) => {
                const recording = this.recordingRepo.findById(recordingId);
                if (!recording) {
                    return;
                }

                recording.status = RecordingStatus.PROCESSING;
                this.recordingRepo.save(recording);

                const transcript = await this.transcriptionService.transcribe(
                    recording
                );
                this.transcriptRepo.save(transcript);

                recording.status = RecordingStatus.READY;
                this.recordingRepo.save(recording);

                this.queue.enqueue("TranscriptReady", {
                    callId: recording.callId,
                    recordingId: recording.id,
                });
            }
        );

        this.queue.registerWorker(
            "TranscriptReady",
            async ({ callId, recordingId }) => {
                const transcript =
                    this.transcriptRepo.findByRecordingId(recordingId);
                if (!transcript) {
                    return;
                }

                const insights = this.analysisService.extractInsights(
                    transcript
                );
                this.insightRepo.saveForCall(callId, insights);

                this.queue.enqueue("InsightsGenerated", { callId });
            }
        );

        this.queue.registerWorker("InsightsGenerated", async ({ callId }) => {
            const insights = this.insightRepo.findByCallId(callId);
            const summary = this.buildSummary(callId, insights);
            await this.crmIntegrationService.pushSummary(callId, summary);
        });
    }

    createCall(callId, participants = []) {
        const call = new Call(callId, participants);
        this.callRepo.save(call);
        return call;
    }

    // API: POST /calls/{id}/recordings
    uploadRecording(callId, fileUrl, duration) {
        const call = this.callRepo.findById(callId);
        if (!call) {
            throw new Error(`Call not found: ${callId}`);
        }

        const recording = new Recording(
            `rec-${++this.recordingCounter}`,
            callId,
            fileUrl,
            duration
        );

        this.recordingRepo.save(recording);
        call.addRecording(recording);
        this.callRepo.save(call);

        this.queue.enqueue("RecordingUploaded", { recordingId: recording.id });
        return recording;
    }

    // API: GET /recordings/{id}/transcript
    getTranscript(recordingId) {
        return this.transcriptRepo.findByRecordingId(recordingId);
    }

    // API: GET /calls/{id}/insights
    getInsights(callId) {
        return this.insightRepo.findByCallId(callId);
    }

    getRecording(recordingId) {
        return this.recordingRepo.findById(recordingId);
    }

    buildSummary(callId, insights) {
        const questions = insights.filter((i) => i.type === "question").length;
        const objections = insights.filter(
            (i) => i.type === "objection"
        ).length;
        const actionItems = insights.filter(
            (i) => i.type === "action_item"
        ).length;

        return `Call ${callId}: ${questions} questions, ${objections} objections, ${actionItems} action items.`;
    }
}

// ── Example Usage ────────────────────────────────────────

async function demo() {
    const system = new CallIntelligenceSystem();

    const participants = [
        new Participant("p1", "Kiran", ParticipantRole.SALES),
        new Participant("p2", "Acme Buyer", ParticipantRole.CUSTOMER),
    ];

    system.createCall("call-101", participants);

    const recording = system.uploadRecording(
        "call-101",
        "https://storage.example.com/recordings/call-101.mp3",
        132
    );

    // Poll until the full pipeline finishes (transcript + analysis + CRM sync).
    while (
        system.getRecording(recording.id).status !== RecordingStatus.READY ||
        system.getInsights("call-101").length === 0 ||
        system.crmIntegrationService.syncedSummaries.length === 0
    ) {
        await new Promise((resolve) => setTimeout(resolve, 30));
    }

    const transcript = system.getTranscript(recording.id);
    const insights = system.getInsights("call-101");

    console.log("Transcript Segments:", transcript.segments.length);
    console.log("Insights:", insights);
    console.log("CRM Sync Payload:", system.crmIntegrationService.syncedSummaries);
}

demo();

module.exports = { CallIntelligenceSystem };
