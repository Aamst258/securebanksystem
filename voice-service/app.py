from flask import Flask, request, jsonify
from resemblyzer import VoiceEncoder, preprocess_wav
import numpy as np
import os
from tempfile import NamedTemporaryFile
from flask_cors import CORS
import subprocess  

app = Flask(__name__)
CORS(app)
encoder = VoiceEncoder()

@app.route('/embed', methods=['POST'])
def embed():
    try:
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
        print("Voice embedding error:", e)
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/verify', methods=['POST'])
def verify():
    try:
        audio = request.files['audio']
        stored_embedding = request.form.get('stored_embedding')
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
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)
