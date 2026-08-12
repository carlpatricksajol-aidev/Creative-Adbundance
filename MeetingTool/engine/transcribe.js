/* Transcription — reuse the video editor's faster-whisper instead of paying per minute.
 *
 * The VPS already runs faster-whisper on CPU for VideoEditor/scripts/transcribe_takes.py, so a
 * one-hour meeting costs nothing to transcribe. `small.en` is the same model the editor uses
 * and is roughly real-time on the box's cores; `medium.en` is noticeably better on accented
 * speech and roughly 3x slower, which is still fine for a job that runs after the call ends.
 *
 * Speakers: whisper does not diarize. Segments come back with speaker null, and roles are
 * resolved from the participant list the extension collected (who was in the room) — good
 * enough to tell client from internal, which is the only distinction the extractor needs. If
 * per-utterance attribution turns out to matter, the honest fix is a recorder that diarizes,
 * not a second model guessing.
 *
 * Env: WHISPER_PYTHON (path to the venv python that has faster-whisper), WHISPER_MODEL
 */

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "transcribe_meeting.py");

/**
 * @param {string} audioPath  local path to the concatenated webm/mp4/wav
 * @returns {Promise<{text: string, segments: Array, language: string, durationSec: number, provider: string}>}
 */
export function transcribeAudio(audioPath, opts = {}) {
  const py = opts.python || process.env.WHISPER_PYTHON || "python3";
  const model = opts.model || process.env.WHISPER_MODEL || "small.en";

  return new Promise((resolve, reject) => {
    const proc = spawn(py, [SCRIPT, "--audio", audioPath, "--model", model], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let out = "", err = "";
    proc.stdout.on("data", (d) => (out += d));
    proc.stderr.on("data", (d) => {
      err += d;
      process.stderr.write(`[whisper] ${d}`); // progress goes to the service log, JSON stays clean on stdout
    });

    proc.on("error", (e) =>
      reject(new Error(`could not start ${py} (set WHISPER_PYTHON to the video editor's venv python): ${e.message}`))
    );
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`transcription exited ${code}: ${err.slice(-500)}`));
      try {
        const parsed = JSON.parse(out);
        resolve({ ...parsed, provider: `faster-whisper:${model}` });
      } catch (e) {
        reject(new Error(`transcription produced no JSON: ${out.slice(0, 300)}`));
      }
    });
  });
}

/** Attach speaker roles from the meeting roster. Whisper gives us none, so every segment gets
 *  the meeting's dominant role context; the extractor uses the roster in its prompt for the
 *  client-outranks-internal rule. */
export function withRoster(transcript, participants = []) {
  const roles = new Map(participants.map((p) => [String(p.name).toLowerCase(), p.role]));
  const roleOf = (name) => (name ? roles.get(String(name).toLowerCase()) || "unknown" : null);
  return {
    ...transcript,
    segments: (transcript.segments || []).map((s) => ({ ...s, role: roleOf(s.speaker) })),
    roleOf,
  };
}
