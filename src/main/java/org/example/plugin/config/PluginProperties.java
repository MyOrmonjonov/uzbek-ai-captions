package org.example.plugin.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "plugin")
public class PluginProperties {

    private Gemini gemini = new Gemini();
    private Pexels pexels = new Pexels();
    private Giphy giphy = new Giphy();
    private License license = new License();
    private Whisper whisper = new Whisper();
    private String ffmpegPath = "ffmpeg";

    public Gemini getGemini() {
        return gemini;
    }

    public void setGemini(Gemini gemini) {
        this.gemini = gemini;
    }

    public Pexels getPexels() {
        return pexels;
    }

    public void setPexels(Pexels pexels) {
        this.pexels = pexels;
    }

    public Giphy getGiphy() {
        return giphy;
    }

    public void setGiphy(Giphy giphy) {
        this.giphy = giphy;
    }

    public String getFfmpegPath() {
        return ffmpegPath;
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

    public static class Gemini {
        private String apiKey = "";
        private String model = "gemini-flash-latest";

        public String getApiKey() {
            return apiKey;
        }

        public void setApiKey(String apiKey) {
            this.apiKey = apiKey;
        }

        public String getModel() {
            return model;
        }

        public void setModel(String model) {
            this.model = model;
        }
    }

    public static class Pexels {
        private String apiKey = "";

        public String getApiKey() {
            return apiKey;
        }

        public void setApiKey(String apiKey) {
            this.apiKey = apiKey;
        }
    }

    public static class Giphy {
        private String apiKey = "";

        public String getApiKey() {
            return apiKey;
        }

        public void setApiKey(String apiKey) {
            this.apiKey = apiKey;
        }
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
}
