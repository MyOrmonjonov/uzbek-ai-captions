package org.example.plugin.service;

import java.nio.file.Path;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Service;

/**
 * Tracks uploaded video files between POST /api/web/upload and the two later calls that need
 * the file: POST /api/web/transcribe (peeks — the video is still needed afterwards for the
 * actual caption burn) and POST /api/web/caption (takes — the last consumer, after which the
 * upload record itself is no longer useful). A visitor picks a style only after reviewing/
 * editing the transcript, so all three are separate HTTP requests. An upload a visitor never
 * turns into a caption job is still cleaned up eventually by WebCaptionCleanupService's
 * disk-age sweep.
 */
@Service
public class WebUploadStore {

    private final ConcurrentHashMap<String, Path> uploads = new ConcurrentHashMap<>();

    public void put(String uploadId, Path videoPath) {
        uploads.put(uploadId, videoPath);
    }

    /** Reads without removing — the video is still needed by a later call. */
    public Path peek(String uploadId) {
        return uploads.get(uploadId);
    }

    public Path take(String uploadId) {
        return uploads.remove(uploadId);
    }
}
