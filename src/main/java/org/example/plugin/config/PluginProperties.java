package org.example.plugin.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "plugin")
public class PluginProperties {

    private License license = new License();
    private Whisper whisper = new Whisper();
    private Translate translate = new Translate();
    private Broll broll = new Broll();
    private Web web = new Web();
    private String ffmpegPath = "ffmpeg";

    public Translate getTranslate() {
        return translate;
    }

    public void setTranslate(Translate translate) {
        this.translate = translate;
    }

    public Broll getBroll() {
        return broll;
    }

    public void setBroll(Broll broll) {
        this.broll = broll;
    }

    public String getFfmpegPath() {
        return BundledFfmpegResolver.resolve(ffmpegPath);
    }

    public void setFfmpegPath(String ffmpegPath) {
        this.ffmpegPath = ffmpegPath;
    }

    public License getLicense() {
        return license;
    }

    public void setLicense(License license) {
        this.license = license;
    }

    public Whisper getWhisper() {
        return whisper;
    }

    public void setWhisper(Whisper whisper) {
        this.whisper = whisper;
    }

    public Web getWeb() {
        return web;
    }

    public void setWeb(Web web) {
        this.web = web;
    }

    /** Central license-verify server (srt_bot's licensing_server.py). */
    public static class License {
        private String serverUrl = "http://localhost:8899/license/verify";

        public String getServerUrl() {
            return serverUrl;
        }

        public void setServerUrl(String serverUrl) {
            this.serverUrl = serverUrl;
        }
    }

    /** Word-precise (faster-whisper) transcription server (srt_bot's transcribe_server.py). */
    public static class Whisper {
        private String serverUrl = "http://localhost:8899/transcribe";

        public String getServerUrl() {
            return serverUrl;
        }

        public void setServerUrl(String serverUrl) {
            this.serverUrl = serverUrl;
        }
    }

    /**
     * Gemini-based translation transcription (srt_bot's proxy_server.py). Used instead of
     * calling Gemini directly from this machine, so the API key never has to ship inside a
     * distributed plugin install.
     */
    public static class Translate {
        private String serverUrl = "http://localhost:8899/transcribe-translate";

        public String getServerUrl() {
            return serverUrl;
        }

        public void setServerUrl(String serverUrl) {
            this.serverUrl = serverUrl;
        }
    }

    /**
     * B-roll suggestions — Gemini scene grouping + Pexels/Giphy search (srt_bot's
     * proxy_server.py). Same reasoning as Translate: keeps those API keys server-side only.
     */
    public static class Broll {
        private String serverUrl = "http://localhost:8899/broll-suggestions";

        public String getServerUrl() {
            return serverUrl;
        }

        public void setServerUrl(String serverUrl) {
            this.serverUrl = serverUrl;
        }
    }

    /** Only meaningful under the "webserver" profile — see application-webserver.properties. */
    public static class Web {
        private int maxConcurrentJobs = 2;
        private int queueCapacity = 6;
        private int freeUploadsPerIpPerDay = 3;
        private int jobRetentionHours = 2;

        public int getMaxConcurrentJobs() {
            return maxConcurrentJobs;
        }

        public void setMaxConcurrentJobs(int maxConcurrentJobs) {
            this.maxConcurrentJobs = maxConcurrentJobs;
        }

        public int getQueueCapacity() {
            return queueCapacity;
        }

        public void setQueueCapacity(int queueCapacity) {
            this.queueCapacity = queueCapacity;
        }

        public int getFreeUploadsPerIpPerDay() {
            return freeUploadsPerIpPerDay;
        }

        public void setFreeUploadsPerIpPerDay(int freeUploadsPerIpPerDay) {
            this.freeUploadsPerIpPerDay = freeUploadsPerIpPerDay;
        }

        public int getJobRetentionHours() {
            return jobRetentionHours;
        }

        public void setJobRetentionHours(int jobRetentionHours) {
            this.jobRetentionHours = jobRetentionHours;
        }
    }
}
