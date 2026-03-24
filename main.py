from fastapi import FastAPI, WebSocket
from faster_whisper import WhisperModel
import numpy as np
import sounddevice as sd

app = FastAPI()

# =========================
# 🔹 MODEL LOAD
# =========================
model = WhisperModel("base", compute_type="int8")


# =========================
# 🔹 FILE TRANSCRIPTION
# =========================
def transcribe_file(file_path):
    segments, _ = model.transcribe(file_path)

    text = ""
    for segment in segments:
        text += segment.text

    return text


# =========================
# 🔹 LIVE MIC TRANSCRIPTION
# =========================
SAMPLE_RATE = 16000
CHUNK_DURATION = 3 # seconds

def record_and_transcribe():
    print("🎤 Speak now... (Ctrl+C to stop)")

    while True:
        print("\nRecording...")

        audio = sd.rec(
            int(CHUNK_DURATION * SAMPLE_RATE),
            samplerate=SAMPLE_RATE,
            channels=1,
            dtype="int16"
        )
        sd.wait()

        # Convert to float32
        audio_np = audio.flatten().astype(np.float32) / 32768.0

        segments, _ = model.transcribe(audio_np)

        text = "".join([seg.text for seg in segments])

        print("You:", text)


# =========================
# 🔹 WEBSOCKET (REAL-TIME)
# =========================
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    audio_buffer = []

    while True:
        data = await websocket.receive_bytes()

        audio_chunk = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0
        audio_buffer.extend(audio_chunk)

        # Process every ~2 sec
        if len(audio_buffer) > 32000:
            audio_np = np.array(audio_buffer)

            segments, _ = model.transcribe(audio_np)

            text = "".join([seg.text for seg in segments])

            await websocket.send_text(text)

            audio_buffer = []

# =========================
# 🔹 RUN MODES
# =========================
if __name__ == "__main__":
    print("Choose mode:")
    print("1. File transcription")
    print("2. Live microphone")

    choice = input("Enter 1 or 2: ")

    if choice == "1":
        result = transcribe_file("test.wav")
        print("Transcription:", result)

    elif choice == "2":
        record_and_transcribe()

    else:
        print("Invalid choice")