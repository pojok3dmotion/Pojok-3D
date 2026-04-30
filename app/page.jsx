"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const BACKEND_GENERATE_URL = "https://pojok-3d-backend.vercel.app/api/generate";
const BACKEND_STATUS_URL = "https://pojok-3d-backend.vercel.app/api/status";

const SUPABASE_URL = "https://hxjdkhmyrozpwiisbzta.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4amRraG15cm96cHdpaXNienRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NTA2MTMsImV4cCI6MjA5MzEyNjYxM30.RhyzDgT9g1k4FV-ZqVGZQ2GF6pyfBIYMj23ea_FCLok";
const BUCKET_NAME = "pojok-3d-uploads";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const MODEL_OPTIONS = [
  ["Kling 3.1 Motion Control", "kling-3-1-motion-control"],
  ["Kling 3.0 Motion Control", "kling-3-0-motion-control"],
  ["Kling 2.6 Motion Control", "kling-2-6-motion-control"]
];

const DURATION_OPTIONS = [5, 10, 15, 20, 25, 30];

const DEFAULT_PROMPT = `Transfer the dance motion from the reference video to the person in the image. Keep the face, identity, body shape, posture, body proportions, hairstyle, skin tone, and outfit exactly the same. Do not change the face or body at all.

Make the dance motion realistic, natural, smooth, and stable, following the timing of the reference video. The result must look like a real camera video, not AI-generated.

Negative prompt: changed face, changed identity, changed body shape, slimmer body, bigger body, face morphing, distorted hands, weird legs, stiff motion, flicker, blur, warping, AI look.`;

function readSaved(key, fallback) {
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem(key) || fallback;
}

function getTaskId(data) {
  return (
    data?.taskId ||
    data?.task_id ||
    data?.data?.task_id ||
    data?.result?.task_id ||
    data?.result?.data?.task_id ||
    data?.id ||
    data?.data?.id ||
    data?.raw?.data?.task_id ||
    null
  );
}

function getVideoUrl(data) {
  return (
    data?.videoUrl ||
    data?.video_url ||
    data?.url ||
    data?.data?.video_url ||
    data?.data?.url ||
    data?.data?.generated?.[0]?.url ||
    data?.data?.generated?.[0] ||
    data?.generated?.[0]?.url ||
    data?.generated?.[0] ||
    data?.raw?.data?.video_url ||
    data?.raw?.data?.url ||
    data?.raw?.data?.generated?.[0]?.url ||
    data?.raw?.data?.generated?.[0] ||
    null
  );
}

function isFailed(status) {
  return ["FAILED", "ERROR", "CANCELED", "CANCELLED"].includes(
    String(status || "").toUpperCase()
  );
}

export default function Page() {
  const [showSettings, setShowSettings] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const [apiKey, setApiKey] = useState("");
  const [videoFile, setVideoFile] = useState(null);
  const [imageFile, setImageFile] = useState(null);

  const [videoPreview, setVideoPreview] = useState("");
  const [imagePreview, setImagePreview] = useState("");

  const [modelId, setModelId] = useState("kling-3-1-motion-control");
  const [duration, setDuration] = useState(5);
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processText, setProcessText] = useState("");
  const [error, setError] = useState("");
  const [finalVideoUrl, setFinalVideoUrl] = useState("");

  useEffect(() => {
    setApiKey(readSaved("pojok_3d_api_key", ""));
  }, []);

  function saveSettings() {
    localStorage.setItem("pojok_3d_api_key", apiKey);
    setShowSettings(false);
  }

  async function uploadToStorage(file) {
    if (!file) return null;

    const ext = file.name.split(".").pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const filePath = `uploads/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false
      });

    if (uploadError) {
      throw new Error("Upload gagal: " + uploadError.message);
    }

    const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);
    return data.publicUrl;
  }

  async function pollStatus(taskId) {
    for (let i = 0; i < 180; i++) {
      await new Promise((resolve) => setTimeout(resolve, 8000));

      setProgress((old) => Math.min(old + 3, 95));
      setProcessText("AI sedang memproses cloning joget...");

      const response = await fetch(BACKEND_STATUS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          apiKey,
          taskId,
          modelId
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Gagal mengecek status video.");
      }

      const foundVideoUrl = getVideoUrl(data);
      const status =
        data?.status ||
        data?.data?.status ||
        data?.raw?.data?.status ||
        data?.raw?.status;

      if (foundVideoUrl) {
        setProgress(100);
        setProcessText("Video cloning selesai.");
        setFinalVideoUrl(foundVideoUrl);
        return;
      }

      if (isFailed(status) || data?.failed) {
        throw new Error("Video gagal diproses. Coba video lebih pendek.");
      }
    }

    throw new Error("Proses terlalu lama. Coba video referensi lebih pendek.");
  }

  async function handleGenerate() {
    setError("");
    setFinalVideoUrl("");
    setLoading(true);
    setProgress(5);

    try {
      if (!apiKey.trim()) {
        throw new Error("Masukkan API Key dulu di Setting.");
      }

      if (!videoFile) {
        throw new Error("Upload video referensi joget dulu.");
      }

      if (!imageFile) {
        throw new Error("Upload foto model dulu.");
      }

      setProcessText("Mengupload video referensi joget...");
      setProgress(15);
      const uploadedVideoUrl = await uploadToStorage(videoFile);

      setProcessText("Mengupload foto model...");
      setProgress(35);
      const uploadedImageUrl = await uploadToStorage(imageFile);

      setProcessText("Mengirim request cloning ke AI...");
      setProgress(55);

      const response = await fetch(BACKEND_GENERATE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          apiKey,
          modelId,
          duration,
          aspectRatio,
          videoUrl: uploadedVideoUrl,
          imageUrl: uploadedImageUrl,
          prompt
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Request cloning gagal.");
      }

      const directVideoUrl = getVideoUrl(data);

      if (directVideoUrl) {
        setProgress(100);
        setProcessText("Video cloning selesai.");
        setFinalVideoUrl(directVideoUrl);
        return;
      }

      const taskId = getTaskId(data);

      if (!taskId) {
        throw new Error("Task ID tidak ditemukan dari backend.");
      }

      setProgress(70);
      setProcessText("AI sedang memproses cloning joget...");

      await pollStatus(taskId);
    } catch (err) {
      setError(err.message || "Terjadi error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <header className="header">
        <div className="logoBox">
          <img
            className="logo"
            src="https://i.ibb.co.com/FkhrbdCG/affe7a4e-5af8-4d98-ae78-d94fe3281511.jpg"
            alt="POJOK 3D"
          />

          <div>
            <div className="title">POJOK 3D</div>
            <div className="subtitle">Video Cloning Joget</div>
          </div>
        </div>

        <button className="btn btnDark" onClick={() => setShowSettings(true)}>
          Setting
        </button>
      </header>

      <main className="main">
        <div className="card">
          <h2>Cloning Video Joget</h2>
          <p className="help">
            Upload video referensi joget dan foto model. AI akan meniru gerakan
            joget dari video referensi ke foto model kamu.
          </p>
        </div>

        <div className="card">
          <label className="label">Upload Video Referensi Joget</label>
          <input
            className="input"
            type="file"
            accept="video/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              setVideoFile(file || null);
              setVideoPreview(file ? URL.createObjectURL(file) : "");
            }}
          />

          {videoPreview && (
            <video className="preview" src={videoPreview} controls />
          )}

          <p className="help">
            Saran: video 3–5 detik, 720p, ukuran kecil agar cepat diproses.
          </p>

          <label className="label">Upload Foto Model</label>
          <input
            className="input"
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              setImageFile(file || null);
              setImagePreview(file ? URL.createObjectURL(file) : "");
            }}
          />

          {imagePreview && (
            <img className="preview" src={imagePreview} alt="Preview model" />
          )}
        </div>

        <div className="card">
          <label className="label">Model AI</label>
          <select
            className="select"
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
          >
            {MODEL_OPTIONS.map(([label, id]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>

          <label className="label">Durasi</label>
          <select
            className="select"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          >
            {DURATION_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d} detik
              </option>
            ))}
          </select>

          <label className="label">Aspect Ratio</label>
          <select
            className="select"
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value)}
          >
            <option value="9:16">9:16 Reels/TikTok</option>
            <option value="16:9">16:9 YouTube</option>
            <option value="1:1">1:1 Square</option>
          </select>

          <label className="label">Prompt Optional</label>
          <textarea
            className="textarea"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>

        {loading && (
          <div className="card">
            <h2>Memproses Video</h2>
            <p className="help">
              {processText || "Mohon tunggu, AI sedang memproses video."}
            </p>

            <div className="progressWrap">
              <div className="progressBar" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {error && <div className="error">{error}</div>}

        {finalVideoUrl && (
          <div className="card">
            <h2>Video Selesai</h2>
            <p className="success">Video cloning joget siap diunduh.</p>

            <video className="preview" src={finalVideoUrl} controls />

            <div className="row" style={{ marginTop: 14 }}>
              <a
                className="btn"
                href={finalVideoUrl}
                download
                target="_blank"
                rel="noreferrer"
              >
                Download Video
              </a>

              <a
                className="btn btnDark"
                href={finalVideoUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open Video
              </a>
            </div>
          </div>
        )}

        <button
          className="btn btnFull"
          disabled={loading}
          onClick={handleGenerate}
        >
          {loading ? "Sedang Memproses..." : "Generate Video"}
        </button>

        <p className="footer">Powered by POJOK 3D</p>
      </main>

      {showSettings && (
        <div className="modalBackdrop">
          <div className="modal">
            <h2>API Settings</h2>
            <p className="help">Masukkan API Key provider video AI kamu.</p>

            <label className="label">API Key</label>

            <div className="row">
              <input
                className="input"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Masukkan API Key"
              />

              <button
                className="btn btnDark"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? "Hide" : "Show"}
              </button>
            </div>

            <div className="row" style={{ marginTop: 16 }}>
              <button className="btn" onClick={saveSettings}>
                Simpan
              </button>

              <button
                className="btn btnDark"
                onClick={() => setShowSettings(false)}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
