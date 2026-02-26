// ── Enums ────────────────────────────────────────────────

const ParticipantRole = Object.freeze({
    SALES: "sales",
    CUSTOMER: "customer",
});

const RecordingStatus = Object.freeze({
    UPLOADED: "uploaded",
    PROCESSING: "processing",
    READY: "ready",
});

const InsightType = Object.freeze({
    QUESTION: "question",
    OBJECTION: "objection",
    ACTION_ITEM: "action_item",
});

// ── Core Entities ────────────────────────────────────────

class Participant {
    constructor(id, name, role) {
        this.id = id;
        this.name = name;
        this.role = role;
    }
}

class Call {
    constructor(id, participants = []) {
        this.id = id;
        this.participants = participants;
        this.startTime = new Date();
        this.endTime = null;
        this.recordings = [];
    }

    end() {
        this.endTime = new Date();
    }

    addRecording(recording) {
        this.recordings.push(recording.id);
    }
}

class Recording {
    constructor(id, callId, fileUrl, duration) {
        this.id = id;
        this.callId = callId;
        this.fileUrl = fileUrl;
        this.duration = duration;
        this.status = RecordingStatus.UPLOADED;
    }
}

class TranscriptSegment {
    constructor(speaker, startTime, endTime, text) {
        this.speaker = speaker;
        this.startTime = startTime;
        this.endTime = endTime;
        this.text = text;
    }
}

class Transcript {
    constructor(id, recordingId, segments = []) {
        this.id = id;
        this.recordingId = recordingId;
        this.segments = segments;
    }
}

class Insight {
    constructor(type, speaker, text, timestamp) {
        this.type = type;
        this.speaker = speaker;
        this.text = text;
        this.timestamp = timestamp;
    }
}

// ── Domain Services ──────────────────────────────────────

class TranscriptionService {
    async transcribe(recording) {
        // Simulate external STT call latency.
        await new Promise((resolve) => setTimeout(resolve, 100));

        const segments = [
            new TranscriptSegment(
                "sales",
                0,
                6,
                "Hi, can I walk you through the enterprise plan?"
            ),
            new TranscriptSegment(
                "customer",
                7,
                13,
                "This looks expensive compared to what we use today."
            ),
            new TranscriptSegment(
                "sales",
                14,
                22,
                "Great point. I will share pricing and set up a trial by Friday."
            ),
        ];

        return new Transcript(`tr-${recording.id}`, recording.id, segments);
    }
}

class AnalysisService {
    extractInsights(transcript) {
        const insights = [];

        for (const segment of transcript.segments) {
            const text = segment.text.toLowerCase();

            if (text.includes("?")) {
                insights.push(
                    new Insight(
                        InsightType.QUESTION,
                        segment.speaker,
                        segment.text,
                        segment.startTime
                    )
                );
            }

            if (
                text.includes("expensive") ||
                text.includes("concern") ||
                text.includes("not sure")
            ) {
                insights.push(
                    new Insight(
                        InsightType.OBJECTION,
                        segment.speaker,
                        segment.text,
                        segment.startTime
                    )
                );
            }

            if (text.includes("i will") || text.includes("follow up")) {
                insights.push(
                    new Insight(
                        InsightType.ACTION_ITEM,
                        segment.speaker,
                        segment.text,
                        segment.startTime
                    )
                );
            }
        }

        return insights;
    }
}

class CRMIntegrationService {
    constructor() {
        this.syncedSummaries = [];
    }

    async pushSummary(callId, summary) {
        // Simulate outbound CRM API latency.
        await new Promise((resolve) => setTimeout(resolve, 40));
        this.syncedSummaries.push({ callId, summary, syncedAt: new Date() });
    }
}

// ── Infrastructure: In-Memory Queue ─────────────────────

class InMemoryJobQueue {
    constructor() {
        this.jobs = [];
        this.workers = new Map();
        this.isProcessing = false;
    }

    registerWorker(topic, worker) {
        if (!this.workers.has(topic)) {
            this.workers.set(topic, []);
        }

        this.workers.get(topic).push(worker);
    }

    enqueue(topic, payload) {
        this.jobs.push({ topic, payload });
        this.process();
    }

    async process() {
        if (this.isProcessing) {
            return;
        }

        this.isProcessing = true;

        while (this.jobs.length > 0) {
            const job = this.jobs.shift();
            const handlers = this.workers.get(job.topic) || [];

            for (const handler of handlers) {
                await handler(job.payload);
            }
        }

        this.isProcessing = false;
    }
}

// ── Repositories ─────────────────────────────────────────

class CallRepository {
    constructor() {
        this.calls = new Map();
    }

    save(call) {
        this.calls.set(call.id, call);
    }

    findById(callId) {
        return this.calls.get(callId);
    }
}

class RecordingRepository {
    constructor() {
        this.recordings = new Map();
    }

    save(recording) {
        this.recordings.set(recording.id, recording);
    }

    findById(recordingId) {
        return this.recordings.get(recordingId);
    }
}

class TranscriptRepository {
    constructor() {
        this.transcriptsByRecording = new Map();
    }

    save(transcript) {
        this.transcriptsByRecording.set(transcript.recordingId, transcript);
    }

    findByRecordingId(recordingId) {
        return this.transcriptsByRecording.get(recordingId);
    }
}

class InsightRepository {
    constructor() {
        this.insightsByCall = new Map();
    }

    saveForCall(callId, insights) {
        this.insightsByCall.set(callId, insights);
    }

    findByCallId(callId) {
        return this.insightsByCall.get(callId) || [];
    }
}

module.exports = {
    ParticipantRole,
    RecordingStatus,
    InsightType,
    Participant,
    Call,
    Recording,
    TranscriptSegment,
    Transcript,
    Insight,
    TranscriptionService,
    AnalysisService,
    CRMIntegrationService,
    InMemoryJobQueue,
    CallRepository,
    RecordingRepository,
    TranscriptRepository,
    InsightRepository,
};
