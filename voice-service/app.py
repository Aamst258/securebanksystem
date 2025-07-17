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

app = Flask(__name__)
CORS(app)
encoder = VoiceEncoder()

# Initialize Coqui TTS (use default English model)
tts_model = CoquiTTS(model_name="tts_models/en/ljspeech/tacotron2-DDC")

# Initialize Vosk (use default English model)
vosk_model = Model(model_name="vosk-model-small-en-us-0.15")

# Ensure audio directory exists for TTS output
if not os.path.exists('audio'):
    os.makedirs('audio')

@app.route('/embed', methods=['POST'])
def embed():
    try:
        if 'audio' not in request.files:
            logging.error('No audio file part in the request.')
            return jsonify({'success': False, 'error': 'No audio file part in the request.'}), 400
        audio = request.files['audio']
        # Save as webm first
        with NamedTemporaryFile(delete=False, suffix=".webm") as temp_webm:
            audio.save(temp_webm.name)
            temp_webm_path = temp_webm.name  # Save the path

        # Now the file is closed, safe to use with ffmpeg
        wav_path = temp_webm_path.replace(".webm", ".wav")
        ffmpeg_cmd = [
            "ffmpeg", "-y", "-i", temp_webm_path, "-ar", "16000", "-ac", "1", wav_path
        ]
        subprocess.run(ffmpeg_cmd, check=True)
        wav = preprocess_wav(wav_path)
        embedding = encoder.embed_utterance(wav)
        os.remove(temp_webm_path)
        os.remove(wav_path)
        return jsonify({"success": True, "embedding": embedding.tolist()})
    except Exception as e:
        logging.exception('Voice embedding error:')
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/verify', methods=['POST'])
def verify():
    try:
        if 'audio' not in request.files:
            logging.error('No audio file part in the request.')
            return jsonify({'success': False, 'error': 'No audio file part in the request.'}), 400
        audio = request.files['audio']
        stored_embedding = request.form.get('stored_embedding')
        if not stored_embedding:
            logging.error('No stored_embedding provided in the request.')
            return jsonify({'success': False, 'error': 'No stored_embedding provided.'}), 400
        stored = np.array(eval(stored_embedding))

        with NamedTemporaryFile(delete=False, suffix=".wav") as temp:
            audio.save(temp.name)
            wav = preprocess_wav(temp.name)
            new_embedding = encoder.embed_utterance(wav)
            os.remove(temp.name)

        similarity = np.dot(stored, new_embedding) / (np.linalg.norm(stored) * np.linalg.norm(new_embedding))
        is_match = similarity > 0.75
        return jsonify({
            "success": True,
            "similarity": float(similarity),
            "isMatch": is_match,
            "message": "Voice verification successful" if is_match else "Voice verification failed"
        })
    except Exception as e:
        logging.exception('Voice verification error:')
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/tts', methods=['POST'])
def tts():
    try:
        data = request.get_json()
        text = data.get('text', '')
        if not text:
            logging.error('No text provided to TTS endpoint.')
            return jsonify({'success': False, 'error': 'No text provided'}), 400
        output_path = os.path.join('audio', 'tts_output.wav')
        try:
            tts_model.tts_to_file(text=text, file_path=output_path)
        except Exception as tts_err:
            logging.exception('TTS model failed to synthesize speech:')
            return jsonify({'success': False, 'error': f'TTS model error: {tts_err}'}), 500
        if not os.path.exists(output_path):
            logging.error('TTS output file was not created.')
            return jsonify({'success': False, 'error': 'TTS output file was not created.'}), 500
        return send_file(output_path, mimetype='audio/wav')
    except Exception as e:
        logging.exception('TTS endpoint error:')
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/stt', methods=['POST'])
def stt():
    try:
        if 'audio' not in request.files:
            logging.error("No audio file part in the request.")
            return jsonify({'success': False, 'error': 'No audio file part in the request.'}), 400
        audio = request.files['audio']
        if audio.filename == '':
            logging.error("No selected file.")
            return jsonify({'success': False, 'error': 'No selected file.'}), 400
        with NamedTemporaryFile(delete=False, suffix=".wav") as temp:
            audio.save(temp.name)
            wf = wave.open(temp.name, "rb")
            if wf.getnchannels() != 1 or wf.getsampwidth() != 2 or wf.getframerate() not in [8000, 16000, 44100]:
                logging.warning(f"Audio file format may not be supported: channels={wf.getnchannels()}, sampwidth={wf.getsampwidth()}, framerate={wf.getframerate()}")
            rec = KaldiRecognizer(vosk_model, wf.getframerate())
            results = []
            while True:
                data = wf.readframes(4000)
                if len(data) == 0:
                    break
                if rec.AcceptWaveform(data):
                    results.append(json.loads(rec.Result()))
            results.append(json.loads(rec.FinalResult()))
            text = ' '.join([r.get('text', '') for r in results])
            wf.close()
            os.remove(temp.name)
        return jsonify({'success': True, 'text': text})
    except Exception as e:
        logging.exception("STT error:")
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)
