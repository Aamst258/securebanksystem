from flask import Flask, request, jsonify
from resemblyzer import VoiceEncoder, preprocess_wav
from moviepy.editor import AudioFileClip
import numpy as np
import os
from tempfile import NamedTemporaryFile
from flask_cors import CORS

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
            wav_path = temp_webm.name.replace(".webm", ".wav")
            # Convert webm to wav
            clip = AudioFileClip(temp_webm.name)
            clip.write_audiofile(wav_path, codec='pcm_s16le')
            clip.close()
            wav = preprocess_wav(wav_path)
            embedding = encoder.embed_utterance(wav)
            os.remove(temp_webm.name)
            os.remove(wav_path)
            return jsonify({"success": True, "embedding": embedding.tolist()})
    except Exception as e:
        print("Voice embedding error:", e)  # <--- Add this line
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
