"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const BACKEND_GENERATE_URL = "https://pojok-3d-backend.vercel.app/api/generate";
const BACKEND_STATUS_URL = "https://pojok-3d-backend.vercel.app/api/status";

const SUPABASE_URL = "https://hxjdkhmyrozpwiisbzta.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4amRraG15cm96cHdpaXNienRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NTA2MTMsImV4cCI6MjA5MzEyNjYxM30.RhyzDgT9g1k4FV-ZqVGZQ2GF6pyfBIYMj23ea_FCLok";

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
    const fileName = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${ext}`;
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
          duration
