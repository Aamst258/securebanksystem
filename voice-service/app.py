from flask import Flask, request, jsonify, send_file
from resemblyzer import VoiceEncoder, preprocess_wav
import numpy as np
import os
from tempfile import NamedTemporaryFile
from flask_cors import CORS
import subprocess
from TTS.api import TTS as CoquiTTS
from vosk import Model, KaldiRecognizer
import wave
import json
import logging
import traceback

app = Flask(__name__)
CORS(app)
encoder = VoiceEncoder()

# --- Model Initialization ---
try:
    tts_model = CoquiTTS(model_name="tts_models/en/ljspeech/tacotron2-DDC")
except Exception as e:
    logging.error(f"Failed to load CoquiTTS model: {e}")
    tts_model = None

try:
    vosk_model = Model(model_name="vosk-model-small-en-us-0.15")
except Exception as e:
    logging.error(f"Failed to load Vosk model: {e}")
    vosk_model = None

# Ensure audio directory exists for TTS output
if not os.path.exists('audio'):
    os.makedirs('audio')

# Configure logging at startup
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def convert_audio_to_wav(input_file_path):
    """Converts an audio file to a 16kHz mono WAV file using ffmpeg."""
    # Create a new path for the WAV file based on the input path
    temp_wav_path = os.path.splitext(input_file_path)[0] + ".wav"

    ffmpeg_cmd = [
        "ffmpeg",
        "-y",               # Overwrite output file if it exists
        "-i", input_file_path, # Input file path
        "-ar", "16000",     # Set audio sampling rate to 16kHz
        "-ac", "1",         # Set audio channels to 1 (mono)
        "-acodec", "pcm_s16le", # Set audio codec to 16-bit PCM
        temp_wav_path
    ]

    try:
        # Using capture_output=True to get stderr for better debugging
        subprocess.run(ffmpeg_cmd, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as e:
        app.logger.error(f"FFmpeg conversion failed. Return code: {e.returncode}")
        app.logger.error(f"FFmpeg stderr: {e.stderr}")
        raise  # Re-raise the exception

    return temp_wav_path


@app.route('/embed', methods=['POST'])
def embed():
    if 'audio' not in request.files:
        return jsonify({'success': False, 'error': 'No audio file part in the request.'}), 400

    audio_file = request.files['audio']
    temp_input_path = None
    wav_path = None

    try:
        # Save the uploaded file to a temporary location
        with NamedTemporaryFile(delete=False, suffix=os.path.splitext(audio_file.filename)[1] or ".webm") as temp_input_file:
            audio_file.save(temp_input_file.name)
            temp_input_path = temp_input_file.name

        # Pass the path to the conversion function
        wav_path = convert_audio_to_wav(temp_input_path)

        wav = preprocess_wav(wav_path)
        embedding = encoder.embed_utterance(wav)

        return jsonify({"success": True, "embedding": embedding.tolist()})

    except Exception as e:
        app.logger.error(f"Error in /embed: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({'success': False, 'error': 'Failed to generate embedding.', 'details': str(e)}), 500
    finally:
        # Cleanup temporary files
        if temp_input_path and os.path.exists(temp_input_path):
            os.remove(temp_input_path)
        if wav_path and os.path.exists(wav_path):
            os.remove(wav_path)


@app.route('/verify', methods=['POST'])
def verify():
    if 'audio' not in request.files:
        return jsonify({'success': False, 'error': 'No audio file part in the request.'}), 400
    if not request.form.get('stored_embedding'):
        return jsonify({'success': False, 'error': 'No stored_embedding provided.'}), 400

    audio_file = request.files['audio']
    stored_embedding = np.array(eval(request.form.get('stored_embedding')))
    temp_input_path = None
    wav_path = None

    try:
        with NamedTemporaryFile(delete=False, suffix=os.path.splitext(audio_file.filename)[1] or ".webm") as temp_input_file:
            audio_file.save(temp_input_file.name)
            temp_input_path = temp_input_file.name

        wav_path = convert_audio_to_wav(temp_input_path)

        wav = preprocess_wav(wav_path)
        new_embedding = encoder.embed_utterance(wav)

        similarity = np.dot(stored_embedding, new_embedding) / (np.linalg.norm(stored_embedding) * np.linalg.norm(new_embedding))
        is_match = bool(similarity > 0.50)

        # Log success message
        if is_match:
            app.logger.info("Voice verification successful")

        return jsonify({
            "success": True,
            "similarity": float(similarity),
            "isMatch": is_match,
            "message": "Voice verification successful" if is_match else "Voice verification failed"
        })

    except Exception as e:
        app.logger.error(f"Error in /verify: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({'success': False, 'error': 'Failed to verify voice.', 'details': str(e)}), 500
    finally:
        if temp_input_path and os.path.exists(temp_input_path):
            os.remove(temp_input_path)
        if wav_path and os.path.exists(wav_path):
            os.remove(wav_path)


@app.route('/stt', methods=['POST'])
def stt():
    if not vosk_model:
        return jsonify({'success': False, 'error': 'STT service is not available.'}), 503
    if 'audio' not in request.files:
        return jsonify({'success': False, 'error': 'No audio file part in the request.'}), 400

    audio_file = request.files['audio']
    temp_input_path = None
    wav_path = None

    try:
        with NamedTemporaryFile(delete=False, suffix=os.path.splitext(audio_file.filename)[1] or ".webm") as temp_input_file:
            audio_file.save(temp_input_file.name)
            temp_input_path = temp_input_file.name

        wav_path = convert_audio_to_wav(temp_input_path)

        text = ''
        with wave.open(wav_path, "rb") as wf:
            rec = KaldiRecognizer(vosk_model, wf.getframerate())
            rec.SetWords(True)

            while True:
                data = wf.readframes(4000)
                if len(data) == 0:
                    break
                rec.AcceptWaveform(data)

            final_result = json.loads(rec.FinalResult())
            text = final_result.get('text', '')

        return jsonify({'success': True, 'text': text})

    except Exception as e:
        app.logger.error(f"STT error: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({'success': False, 'error': 'Failed to perform speech-to-text.', 'details': str(e)}), 500
    finally:
        if temp_input_path and os.path.exists(temp_input_path):
            os.remove(temp_input_path)
        if wav_path and os.path.exists(wav_path):
            os.remove(wav_path)


@app.route('/tts', methods=['POST'])
def tts():
    if not tts_model:
        return jsonify({'success': False, 'error': 'TTS service is not available.'}), 503
    try:
        data = request.get_json()
        text = data.get('text', '')
        if not text:
            return jsonify({'success': False, 'error': 'No text provided'}), 400

        output_path = os.path.join('audio', 'tts_output.wav')
        tts_model.tts_to_file(text=text, file_path=output_path)

        if not os.path.exists(output_path):
            return jsonify({'success': False, 'error': 'TTS output file was not created.'}), 500

        return send_file(output_path, mimetype='audio/wav')

    except Exception as e:
        app.logger.error('TTS endpoint error: ' + str(e))
        app.logger.error(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=False)