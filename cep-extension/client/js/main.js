(function () {
    var csInterface = new CSInterface();
    var API_BASE = 'http://localhost:8971';
    // ExtendScript's $.fileName doesn't reliably resolve to the host .jsx's own location once
    // loaded as a CEP host script, so the mogrt assets folder is resolved here instead (the
    // officially documented way to find the extension's own install folder) and passed into
    // every kinetic-typography evalScript call.
    var MOGRT_FOLDER = csInterface.getSystemPath(SystemPath.EXTENSION) + '/host/assets/mogrt';
    var EXPORT_PRESET_PATH = csInterface.getSystemPath(SystemPath.EXTENSION) + '/host/assets/export-presets/audio_wav_mono_16k.epr';
    var VIDEO_EXPORT_PRESET_PATH = csInterface.getSystemPath(SystemPath.EXTENSION) + '/host/assets/export-presets/video_h264_match_source.epr';

    // Node integration (manifest.xml has --enable-nodejs) — used for sequence-audio export
    // (temp file paths) and the auto-update mechanism further down.
    var nodeFs, nodePath, nodeOs, nodeHttps;
    try {
        nodeFs = require('fs');
        nodePath = require('path');
        nodeOs = require('os');
        nodeHttps = require('https');
    } catch (e) {
        // Unexpected (manifest declares --enable-nodejs), but fail soft: sequence-audio export
        // and auto-update both degrade gracefully without Node rather than breaking the panel.
    }

    /**
     * Exports the active sequence's audio via Premiere's own render pipeline
     * (exportActiveSequenceAudio() in host/index.jsx) instead of transcribing the raw source
     * file — the resulting WAV already starts at the sequence's own time zero, so callers no
     * longer need to compute where a source clip sits on the timeline (see
     * findSourceTimeZeroOffset() in host/index.jsx, the repeated source of offset bugs across
     * several past sessions). Returns a Promise resolving to the exported WAV's path.
     */
    function exportSequenceAudioForTranscribe() {
        return new Promise(function (resolve, reject) {
            if (!nodeFs || !nodePath || !nodeOs) {
                reject(new Error("Node integratsiyasi mavjud emas."));
                return;
            }
            var outputPath = nodePath.join(nodeOs.tmpdir(), 'uzbek-ai-captions-seqaudio-' + Date.now() + '.wav');
            var escapedOut = escapeForEval(outputPath);
            var escapedPreset = escapeForEval(EXPORT_PRESET_PATH);
            csInterface.evalScript(
                'exportActiveSequenceAudio("' + escapedOut + '", "' + escapedPreset + '")',
                function (result) {
                    if (!result || result.indexOf('ERROR:') === 0) {
                        reject(new Error((result || '').replace(/^ERROR:\s*/, '') || "Audio eksport qilib bo'lmadi."));
                        return;
                    }
                    resolve(result);
                }
            );
        });
    }

    /**
     * Renders the active sequence to a video file (exportActiveSequenceVideo() in
     * host/index.jsx) for the karaoke-caption feature — the burned-in captions need an actual
     * video, not just the audio exportSequenceAudioForTranscribe() produces. Premiere only for
     * v1 (see host/index.jsx's comment on why). Returns a Promise resolving to the exported
     * video's path.
     */
    function exportSequenceVideoForKaraoke() {
        return new Promise(function (resolve, reject) {
            if (!nodeFs || !nodePath || !nodeOs) {
                reject(new Error("Node integratsiyasi mavjud emas."));
                return;
            }
            var outputPath = nodePath.join(nodeOs.tmpdir(), 'ravon-captions-seqvideo-' + Date.now() + '.mp4');
            var escapedOut = escapeForEval(outputPath);
            var escapedPreset = escapeForEval(VIDEO_EXPORT_PRESET_PATH);
            csInterface.evalScript(
                'exportActiveSequenceVideo("' + escapedOut + '", "' + escapedPreset + '")',
                function (result) {
                    if (!result || result.indexOf('ERROR:') === 0) {
                        reject(new Error((result || '').replace(/^ERROR:\s*/, '') || "Video eksport qilib bo'lmadi."));
                        return;
                    }
                    resolve(result);
                }
            );
        });
    }

    /**
     * The main video track's actual content duration (host/index.jsx's
     * getMainVideoDurationSeconds()), sent along with the transcribe request so the backend can
     * drop any words/cues transcribed past it — exportSequenceAudioForTranscribe() exports the
     * whole sequence, whose duration is driven by the latest clip on ANY track, so leftover
     * clips elsewhere can make the audio (and therefore generated subtitles) longer than the
     * actual video. Resolves to null (meaning "don't trim") on AE or any failure.
     */
    function getMainVideoDurationSeconds() {
        return new Promise(function (resolve) {
            csInterface.evalScript('getMainVideoDurationSeconds()', function (result) {
                var seconds = parseFloat(result);
                resolve(!isNaN(seconds) && seconds > 0 ? seconds : null);
            });
        });
    }

    // Placing MOGRT clips into the Premiere project (insertKineticText/insertCaptionMogrt) has
    // real per-word/per-cue cost with no way to make it instant — this at least turns a long
    // silent wait into visible progress, dispatched from the host script via CSXSEvent.
    var MOGRT_PROGRESS_LABEL = { kinetic: "Animatsiya", caption: "Subtitr" };
    csInterface.addEventListener('com.uzbekaicaptions.mogrtProgress', function (event) {
        try {
            var data = JSON.parse(event.data);
            var label = MOGRT_PROGRESS_LABEL[data.kind] || "Amal";
            setStatus(label + " qo'shilmoqda... " + data.done + "/" + data.total, 'busy');
        } catch (e) {
            // malformed/unexpected progress event — not worth surfacing to the user
        }
    });
    var PREVIEW_SAMPLE_WORDS = "Bu ajoyib video uchun subtitr namunasi shu tarzda ko'rinadi".split(' ');

    var els = {
        filePath: document.getElementById('file-path'),
        filePathText: document.getElementById('file-path-text'),
        refreshBtn: document.getElementById('refresh-btn'),
        styleSegmented: document.getElementById('style-segmented'),
        translateToggle: document.getElementById('translate-toggle'),
        translatePanel: document.getElementById('translate-panel'),
        translateLang: document.getElementById('translate-lang'),
        advancedToggle: document.getElementById('advanced-toggle'),
        advancedPanel: document.getElementById('advanced-panel'),
        maxLinesSlider: document.getElementById('max-lines-slider'),
        maxLinesBadge: document.getElementById('max-lines-badge'),
        wordsPerLineSlider: document.getElementById('words-per-line-slider'),
        wordsPerLineBadge: document.getElementById('words-per-line-badge'),
        previewBox: document.getElementById('preview-box'),
        generateBtn: document.getElementById('generate-btn'),
        status: document.getElementById('status'),
        statusText: document.getElementById('status-text'),
        connDot: document.getElementById('conn-dot'),
        brollBtn: document.getElementById('broll-btn'),
        brollFilterBar: document.getElementById('broll-filter-bar'),
        brollTypeTabs: document.getElementById('broll-type-tabs'),
        brollSearch: document.getElementById('broll-search'),
        brollList: document.getElementById('broll-list'),
        kineticToggle: document.getElementById('kinetic-toggle'),
        kineticPanel: document.getElementById('kinetic-panel'),
        kineticGrid: document.getElementById('kinetic-grid'),
        kineticCountBadge: document.getElementById('kinetic-count-badge'),
        kineticSearch: document.getElementById('kinetic-search'),
        kineticPagination: document.getElementById('kinetic-pagination'),
        kineticPrev: document.getElementById('kinetic-prev'),
        kineticNext: document.getElementById('kinetic-next'),
        kineticPageLabel: document.getElementById('kinetic-page-label'),
        kineticPageDots: document.getElementById('kinetic-page-dots'),
        kineticShowAll: document.getElementById('kinetic-show-all'),
        kineticMinDurationSlider: document.getElementById('kinetic-min-duration-slider'),
        kineticMinDurationBadge: document.getElementById('kinetic-min-duration-badge'),
        kineticFontSelect: document.getElementById('kinetic-font-select'),
        kineticColorInput: document.getElementById('kinetic-color-input'),
        kineticStrokeColorInput: document.getElementById('kinetic-stroke-color-input'),
        kineticPositionSelect: document.getElementById('kinetic-position-select'),
        kineticSizeSlider: document.getElementById('kinetic-size-slider'),
        kineticSizeBadge: document.getElementById('kinetic-size-badge'),
        kineticSplitWordsBtn: document.getElementById('kinetic-split-words-btn'),
        kineticTypingDurationInput: document.getElementById('kinetic-typing-duration-input'),
        kineticTypingCursorBtn: document.getElementById('kinetic-typing-cursor-btn'),
        kineticBtn: document.getElementById('kinetic-btn'),
        karaokeToggle: document.getElementById('karaoke-toggle'),
        karaokePanel: document.getElementById('karaoke-panel'),
        karaokeStyleGrid: document.getElementById('karaoke-style-grid'),
        karaokeGenerateBtn: document.getElementById('karaoke-generate-btn'),
        resultsPanel: document.getElementById('results-panel'),
        progressRingLabel: document.getElementById('progress-ring-label'),
        licenseBadge: document.getElementById('license-badge'),
        activationScreen: document.getElementById('activation-screen'),
        mainContent: document.getElementById('main-content'),
        deviceCodeText: document.getElementById('device-code-text'),
        copyCodeBtn: document.getElementById('copy-code-btn'),
        openBotBtn: document.getElementById('open-bot-btn'),
        tokenInput: document.getElementById('token-input'),
        activateBtn: document.getElementById('activate-btn'),
        activationStatus: document.getElementById('activation-status'),
        activationStatusText: document.getElementById('activation-status-text'),
        updateBanner: document.getElementById('update-banner'),
        updateBannerText: document.getElementById('update-banner-text'),
        updateBannerBtn: document.getElementById('update-banner-btn'),
        updateBannerDismiss: document.getElementById('update-banner-dismiss'),
    };

    var segmentButtons = Array.prototype.slice.call(els.styleSegmented.querySelectorAll('.segment-btn'));
    var selectedSegment = els.styleSegmented.querySelector('.segment-btn.selected');
    var selectedFile = null;
    var lastSegments = null;
    var lastWords = null;
    var lastBrollSuggestions = [];
    var brollActiveType = 'all';
    var selectedKineticStyle = null;
    var allKineticStyles = [];
    var kineticFiltered = [];
    var kineticPage = 0;
    var kineticShowAllFlag = false;
    var KINETIC_PAGE_SIZE = 6;
    var selectedKaraokeStyle = null;

    segmentButtons.forEach(function (btn) {
        btn.addEventListener('click', function () {
            segmentButtons.forEach(function (b) {
                b.classList.remove('selected');
            });
            btn.classList.add('selected');
            selectedSegment = btn;
        });
    });

    function setSegmentButtonsDisabled(disabled) {
        segmentButtons.forEach(function (b) {
            b.disabled = disabled;
        });
    }

    function setupToggle(toggleEl, panelEl, onChange) {
        toggleEl.addEventListener('click', function () {
            var isOn = toggleEl.getAttribute('aria-checked') === 'true';
            var next = !isOn;
            toggleEl.setAttribute('aria-checked', String(next));
            if (panelEl) {
                panelEl.hidden = !next;
            }
            if (onChange) {
                onChange(next);
            }
        });
    }

    setupToggle(els.translateToggle, els.translatePanel);
    setupToggle(els.advancedToggle, els.advancedPanel);
    setupToggle(els.kineticToggle, els.kineticPanel);
    setupToggle(els.karaokeToggle, els.karaokePanel);

    els.kineticMinDurationSlider.addEventListener('input', function () {
        els.kineticMinDurationBadge.textContent = parseFloat(els.kineticMinDurationSlider.value).toFixed(1) + 's';
    });

    els.kineticSizeSlider.addEventListener('input', function () {
        els.kineticSizeBadge.textContent = els.kineticSizeSlider.value + '%';
    });

    function updatePreview() {
        var maxLines = parseInt(els.maxLinesSlider.value, 10);
        var wordsPerLine = parseInt(els.wordsPerLineSlider.value, 10);
        els.maxLinesBadge.textContent = String(maxLines);
        els.wordsPerLineBadge.textContent = String(wordsPerLine);

        var lines = [];
        var cursor = 0;
        for (var i = 0; i < maxLines && cursor < PREVIEW_SAMPLE_WORDS.length; i++) {
            lines.push(PREVIEW_SAMPLE_WORDS.slice(cursor, cursor + wordsPerLine).join(' '));
            cursor += wordsPerLine;
        }
        els.previewBox.innerHTML = lines.map(escapeHtml).join('<br>');
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    els.maxLinesSlider.addEventListener('input', updatePreview);
    els.wordsPerLineSlider.addEventListener('input', updatePreview);
    updatePreview();

    els.refreshBtn.addEventListener('click', function () {
        els.refreshBtn.classList.add('spinning');
        detectActiveMedia(function () {
            els.refreshBtn.classList.remove('spinning');
        });
    });

    function setStatus(text, kind) {
        els.statusText.textContent = text;
        els.status.className = 'status ' + (kind || '');
        updateProgressRing(kind);
    }

    // The progress ring has no real intermediate percentage to show (the backend only reports
    // done/not-done, not incremental progress), so it's simplified to three visual states: an
    // indeterminate spin while busy, a full ring + checkmark + "100%" once something succeeds,
    // and a dim idle ring otherwise — never a fabricated in-between number.
    function updateProgressRing(kind) {
        els.resultsPanel.classList.remove('idle', 'busy', 'done');
        if (kind === 'busy') {
            els.resultsPanel.classList.add('busy');
            els.progressRingLabel.textContent = '';
        } else if (kind === 'ok') {
            els.resultsPanel.classList.add('done');
            els.progressRingLabel.textContent = '100%';
        } else {
            els.resultsPanel.classList.add('idle');
            els.progressRingLabel.textContent = '';
        }
    }

    function setBusy(isBusy) {
        els.generateBtn.disabled = isBusy;
        els.generateBtn.classList.toggle('busy', isBusy);
        setSegmentButtonsDisabled(isBusy);
        els.translateToggle.disabled = isBusy;
        els.advancedToggle.disabled = isBusy;
        els.kineticToggle.disabled = isBusy;
        els.kineticSplitWordsBtn.disabled = isBusy;
        els.kineticTypingCursorBtn.disabled = isBusy;
        els.karaokeToggle.disabled = isBusy;
        els.karaokeGenerateBtn.disabled = isBusy;
    }

    // csi.evalScript()'s callback is the ONLY thing that ever updates #file-path-text away from
    // its static "Video aniqlanmoqda..." placeholder — if that callback never fires the panel is
    // stuck on that placeholder forever with zero feedback, indistinguishable from "still
    // working". A customer hit exactly this with a video they'd just dropped into the project.
    // Premiere's ExtendScript engine is single-threaded and runs synchronously with the rest of
    // the app — a large/just-added clip can still be importing/indexing for a while, and every
    // evalScript call queues up silently behind that until it finishes; an 18s budget (3x6s)
    // wasn't enough to rule that out, so this now backs off across a much longer window (5s, 10s,
    // 20s, 35s — 70s total) before giving up, and the final message names that as the likely
    // cause instead of implying the plugin itself is broken.
    function detectActiveMedia(callback) {
        var csi = new CSInterface();
        var attempt = 0;
        var timeoutsMs = [5000, 10000, 20000, 35000];

        function fail(text) {
            selectedFile = null;
            els.filePathText.textContent = text;
            els.filePath.className = 'file-card error';
            els.brollBtn.hidden = true;
            els.kineticBtn.hidden = true;
            if (callback) {
                callback();
            }
        }

        function attemptDetect() {
            var thisTimeout = timeoutsMs[attempt];
            attempt++;
            var isLastAttempt = attempt >= timeoutsMs.length;
            var settled = false;
            var timeoutId = setTimeout(function () {
                if (settled) {
                    return;
                }
                settled = true;
                if (!isLastAttempt) {
                    attemptDetect();
                } else {
                    fail("Video aniqlab bo'lmadi (javob kelmadi). Premiere hali band bo'lishi mumkin " +
                        "(masalan katta video import qilinayotgan bo'lsa) — biroz kutib, Qayta urinish (⟳) tugmasini bosing.");
                }
            }, thisTimeout);

            csi.evalScript('getActiveMediaPath()', function (result) {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timeoutId);

                if (!result) {
                    if (!isLastAttempt) {
                        attemptDetect();
                        return;
                    }
                    fail("Video aniqlab bo'lmadi (bo'sh javob). Qayta urinish (⟳) tugmasini bosing.");
                    return;
                }

                if (result.indexOf('ERROR:') === 0) {
                    selectedFile = null;
                    els.filePathText.textContent = result.replace(/^ERROR:\s*/, '');
                    els.filePath.className = 'file-card error';
                    els.brollBtn.hidden = true;
                    els.kineticBtn.hidden = true;
                } else {
                    selectedFile = result;
                    els.filePathText.textContent = result;
                    els.filePath.className = 'file-card';
                    els.brollBtn.hidden = false;
                    els.kineticBtn.hidden = false;
                }
                if (callback) {
                    callback();
                }
            });
        }

        attemptDetect();
    }

    var TRANSCRIBE_STAGE_LABELS = {
        audio: 'Audio tayyorlanmoqda',
        transcribing: 'Matnga aylantirilmoqda',
        building: 'Subtitr tuzilmoqda',
    };

    // Backend now runs "Subtitr yaratish" as a background job (POST returns a jobId
    // immediately) instead of one long blocking request — this polls its status every 800ms
    // and reports a live stage + percentage instead of one static "busy" spinner for however
    // long Whisper/Gemini take. Returns a Promise resolving to the final TranscribeResponse.
    function startTranscribeJob(requestBody) {
        return fetch(API_BASE + '/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        })
        .then(function (res) {
            return res.json().then(function (body) {
                if (!res.ok) {
                    throw new Error(body.error || ('Server xatoligi: ' + res.status));
                }
                return body;
            });
        })
        .then(function (body) {
            return new Promise(function (resolve, reject) {
                function poll() {
                    fetch(API_BASE + '/api/transcribe/status/' + body.jobId)
                        .then(function (res) { return res.json(); })
                        .then(function (job) {
                            if (job.status === 'error') {
                                reject(new Error(job.error || 'Xatolik yuz berdi.'));
                                return;
                            }
                            if (job.status === 'done') {
                                resolve(job.result);
                                return;
                            }
                            var label = TRANSCRIBE_STAGE_LABELS[job.stage] || 'Ishlanmoqda';
                            setStatus(label + '... ' + (job.progressPercent || 0) + '%', 'busy');
                            setTimeout(poll, 800);
                        })
                        .catch(reject);
                }
                poll();
            });
        });
    }

    els.generateBtn.addEventListener('click', function () {
        setStatus('Timeline video tekshirilmoqda...', 'busy');
        setBusy(true);
        lastSegments = null;
        lastWords = null;
        lastBrollSuggestions = [];
        els.brollFilterBar.hidden = true;
        els.brollSearch.value = '';
        els.brollList.innerHTML = '';

        detectActiveMedia(function () {
            if (!selectedFile) {
                setStatus("Timeline'da video topilmadi. Avval sequence'ga video qo'shing.", 'error');
                setBusy(false);
                return;
            }

            setStatus('Sequence audiosi eksport qilinmoqda...', 'busy');

            var advancedOn = els.advancedToggle.getAttribute('aria-checked') === 'true';
            var maxLines = advancedOn
                ? parseInt(els.maxLinesSlider.value, 10)
                : parseInt(selectedSegment.dataset.maxLines, 10);
            var wordsPerLine = advancedOn
                ? parseInt(els.wordsPerLineSlider.value, 10)
                : parseInt(selectedSegment.dataset.wordsPerLine, 10);
            var translateOn = els.translateToggle.getAttribute('aria-checked') === 'true';
            var translateTo = translateOn ? els.translateLang.value : null;
            var exportedWavPath = null;

            Promise.all([exportSequenceAudioForTranscribe(), getMainVideoDurationSeconds()])
            .then(function (results) {
                var wavPath = results[0];
                exportedWavPath = wavPath;
                return startTranscribeJob({
                    filePath: wavPath,
                    maxLines: maxLines,
                    wordsPerLine: wordsPerLine,
                    translateTo: translateTo,
                    expectedDurationSeconds: results[1],
                });
            })
            .then(function (body) {
                setStatus("Subtitr tayyor, loyihaga qo'shilmoqda...", 'busy');
                lastSegments = body.segments || null;
                lastWords = body.words || null;
                // Empty sourceMediaPath: the audio came from exportSequenceAudioForTranscribe(),
                // which already starts at the sequence's own time zero, so no offset lookup is
                // needed (see exportActiveSequenceAudio() in host/index.jsx).
                importSrt(body.srtPath, '');
            })
            .catch(function (err) {
                setStatus(err.message || String(err), 'error');
            })
            .finally(function () {
                setBusy(false);
                if (exportedWavPath && nodeFs) {
                    try { nodeFs.unlinkSync(exportedWavPath); } catch (e) { /* best-effort cleanup */ }
                }
            });
        });
    });

    function importSrt(srtPath, sourceMediaPath) {
        var escapedSrt = escapeForEval(srtPath);
        var escapedMedia = escapeForEval(sourceMediaPath || '');
        var escapedFolder = escapeForEval(MOGRT_FOLDER);
        csInterface.evalScript('importSrt("' + escapedSrt + '", "' + escapedMedia + '", "' + escapedFolder + '")', function (result) {
            if (result && result.indexOf('ERROR:') === 0) {
                setStatus(result, 'error');
            } else {
                setStatus(result || 'Bajarildi.', 'ok');
            }
        });
    }

    function escapeForEval(str) {
        return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    function formatTime(seconds) {
        var total = Math.max(0, Math.round(seconds));
        var m = Math.floor(total / 60);
        var s = total % 60;
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    // B-roll only needs transcript text+timing (lastSegments), not an already-placed subtitle
    // track — so it can run on its own even if "Subtitr yaratish" was never pressed this
    // session (e.g. right after reopening the panel). If lastSegments is already there
    // (fresh from a generate-subtitle run) it's reused as-is to skip a redundant transcribe.
    function transcribeForSegments(callback) {
        if (lastSegments && lastSegments.length) {
            callback(null);
            return;
        }
        if (!selectedFile) {
            callback(new Error("Timeline'da video topilmadi. Avval sequence'ga video qo'shing."));
            return;
        }

        setStatus('Sequence audiosi eksport qilinmoqda...', 'busy');

        var advancedOn = els.advancedToggle.getAttribute('aria-checked') === 'true';
        var maxLines = advancedOn
            ? parseInt(els.maxLinesSlider.value, 10)
            : parseInt(selectedSegment.dataset.maxLines, 10);
        var wordsPerLine = advancedOn
            ? parseInt(els.wordsPerLineSlider.value, 10)
            : parseInt(selectedSegment.dataset.wordsPerLine, 10);
        var translateOn = els.translateToggle.getAttribute('aria-checked') === 'true';
        var translateTo = translateOn ? els.translateLang.value : null;
        var exportedWavPath = null;

        Promise.all([exportSequenceAudioForTranscribe(), getMainVideoDurationSeconds()])
        .then(function (results) {
            var wavPath = results[0];
            exportedWavPath = wavPath;
            return startTranscribeJob({
                filePath: wavPath,
                maxLines: maxLines,
                wordsPerLine: wordsPerLine,
                translateTo: translateTo,
                expectedDurationSeconds: results[1],
            });
        })
        .then(function (body) {
            lastSegments = body.segments || null;
            lastWords = body.words || null;
            if (!lastSegments || !lastSegments.length) {
                throw new Error('Videoda nutq topilmadi.');
            }
            callback(null);
        })
        .catch(function (err) {
            callback(err);
        })
        .finally(function () {
            if (exportedWavPath && nodeFs) {
                try { nodeFs.unlinkSync(exportedWavPath); } catch (e) { /* best-effort cleanup */ }
            }
        });
    }

    els.brollBtn.addEventListener('click', function () {
        els.brollBtn.disabled = true;
        els.brollList.innerHTML = '';

        transcribeForSegments(function (err) {
            if (err) {
                setStatus(err.message || String(err), 'error');
                els.brollBtn.disabled = false;
                return;
            }

            els.brollBtn.textContent = 'Takliflar qidirilmoqda...';
            setStatus('B-roll takliflari qidirilmoqda...', 'busy');

            fetch(API_BASE + '/api/broll-suggestions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ segments: lastSegments }),
            })
            .then(function (res) {
                return res.json().then(function (body) {
                    if (!res.ok) {
                        throw new Error(body.error || ('Server xatoligi: ' + res.status));
                    }
                    return body;
                });
            })
            .then(function (body) {
                lastBrollSuggestions = body.suggestions || [];
                brollActiveType = 'all';
                els.brollSearch.value = '';
                setBrollTab('all');
                els.brollFilterBar.hidden = lastBrollSuggestions.length === 0;
                renderBrollSuggestions();
                setStatus('B-roll takliflari tayyor.', 'ok');
            })
            .catch(function (err2) {
                setStatus(err2.message || String(err2), 'error');
            })
            .finally(function () {
                els.brollBtn.disabled = false;
                els.brollBtn.textContent = 'B-roll takliflarini qidirish';
            });
        });
    });

    els.kineticBtn.addEventListener('click', function () {
        els.kineticBtn.disabled = true;

        transcribeForSegments(function (err) {
            if (err) {
                setStatus(err.message || String(err), 'error');
                els.kineticBtn.disabled = false;
                return;
            }
            if (!lastWords || !lastWords.length) {
                setStatus("So'z darajasidagi vaqt ma'lumoti topilmadi.", 'error');
                els.kineticBtn.disabled = false;
                return;
            }
            if (!selectedKineticStyle) {
                setStatus("Animatsiya shabloni topilmadi (host/assets/mogrt bo'sh).", 'error');
                els.kineticBtn.disabled = false;
                return;
            }

            els.kineticBtn.textContent = "Animatsiya qo'shilmoqda...";
            setStatus("Animatsion matn qo'shilmoqda...", 'busy');

            var style = selectedKineticStyle;
            var minDurationSeconds = parseFloat(els.kineticMinDurationSlider.value);
            var escapedWords = escapeForEval(JSON.stringify(lastWords));
            // Empty sourceMediaPath: lastWords came from exportSequenceAudioForTranscribe()'s
            // sequence-exported audio, which already starts at the sequence's own time zero —
            // no offset lookup needed (see exportActiveSequenceAudio() in host/index.jsx).
            var escapedMedia = escapeForEval('');
            var escapedFolder = escapeForEval(MOGRT_FOLDER);
            // AE-only appearance controls (see index.html's kinetic-style-note) — insertKineticText()
            // simply ignores this on the Premiere/MOGRT path.
            var styleOptions = {
                font: els.kineticFontSelect.value,
                color: els.kineticColorInput.value,
                strokeColor: els.kineticStrokeColorInput.value,
                position: els.kineticPositionSelect.value,
                sizeRatio: parseInt(els.kineticSizeSlider.value, 10) / 100
            };
            var escapedOptions = escapeForEval(JSON.stringify(styleOptions));
            var script = 'insertKineticText("' + style + '", "' + escapedWords + '", "' + escapedMedia + '", "' +
                escapedFolder + '", ' + minDurationSeconds + ', "' + escapedOptions + '")';
            csInterface.evalScript(script, function (result) {
                els.kineticBtn.disabled = false;
                els.kineticBtn.textContent = "Animatsion matn qo'shish";
                if (result && result.indexOf('ERROR:') === 0) {
                    setStatus(result, 'error');
                } else {
                    setStatus(result || 'Bajarildi.', 'ok');
                }
            });
        });
    });

    // Both of these are standalone AE utilities — unlike kinetic-btn above, they act on
    // whatever text layer the user has selected in the Timeline right now, not on
    // transcription output, so there's no transcribeForSegments() step first.
    els.kineticSplitWordsBtn.addEventListener('click', function () {
        els.kineticSplitWordsBtn.disabled = true;
        csInterface.evalScript('splitSelectedTextToWords()', function (result) {
            els.kineticSplitWordsBtn.disabled = false;
            setStatus(result || 'Bajarildi.', (result && result.indexOf('ERROR:') === 0) ? 'error' : 'ok');
        });
    });

    els.kineticTypingCursorBtn.addEventListener('click', function () {
        els.kineticTypingCursorBtn.disabled = true;
        var durationSeconds = parseFloat(els.kineticTypingDurationInput.value) || 1.5;
        csInterface.evalScript('addTypingCursorEffect(' + durationSeconds + ')', function (result) {
            els.kineticTypingCursorBtn.disabled = false;
            setStatus(result || 'Bajarildi.', (result && result.indexOf('ERROR:') === 0) ? 'error' : 'ok');
        });
    });

    var BROLL_TYPE_ORDER = ['video', 'photo', 'gif'];
    var BROLL_TYPE_LABELS = { video: 'Video', photo: 'Rasm', gif: 'GIF' };

    function setBrollTab(type) {
        brollActiveType = type;
        var tabs = Array.prototype.slice.call(els.brollTypeTabs.querySelectorAll('.broll-tab'));
        tabs.forEach(function (tab) {
            tab.classList.toggle('active', tab.dataset.type === type);
        });
    }

    els.brollTypeTabs.addEventListener('click', function (e) {
        var tab = e.target.closest('.broll-tab');
        if (!tab) {
            return;
        }
        setBrollTab(tab.dataset.type);
        renderBrollSuggestions();
    });

    els.brollSearch.addEventListener('input', function () {
        renderBrollSuggestions();
    });

    function renderBrollSuggestions() {
        els.brollList.innerHTML = '';
        if (!lastBrollSuggestions.length) {
            setStatus("Hech qanday mos b-roll topilmadi.", 'error');
            return;
        }

        var query = els.brollSearch.value.trim().toLowerCase();
        var typesToShow = brollActiveType === 'all' ? BROLL_TYPE_ORDER : [brollActiveType];
        var visibleCount = 0;

        lastBrollSuggestions.forEach(function (scene) {
            if (query && scene.keyword.toLowerCase().indexOf(query) === -1) {
                return;
            }

            var byType = {};
            (scene.candidates || []).forEach(function (candidate) {
                (byType[candidate.type] || (byType[candidate.type] = [])).push(candidate);
            });

            var hasAny = typesToShow.some(function (type) {
                return byType[type] && byType[type].length;
            });
            if (!hasAny) {
                return;
            }

            var sceneEl = document.createElement('div');
            sceneEl.className = 'broll-scene';

            var head = document.createElement('div');
            head.className = 'broll-scene-head';
            var keyword = document.createElement('span');
            keyword.className = 'broll-keyword';
            keyword.textContent = scene.keyword;
            var time = document.createElement('span');
            time.className = 'broll-time';
            time.textContent = formatTime(scene.start) + ' – ' + formatTime(scene.end);
            head.appendChild(keyword);
            head.appendChild(time);
            sceneEl.appendChild(head);

            typesToShow.forEach(function (type) {
                var candidates = byType[type];
                if (!candidates || !candidates.length) {
                    return;
                }
                var group = document.createElement('div');
                group.className = 'broll-type-group';

                var label = document.createElement('div');
                label.className = 'broll-type-label';
                label.textContent = BROLL_TYPE_LABELS[type] || type;
                group.appendChild(label);

                var grid = document.createElement('div');
                grid.className = 'broll-grid';
                candidates.forEach(function (candidate) {
                    grid.appendChild(buildBrollCard(candidate, scene));
                });
                group.appendChild(grid);

                sceneEl.appendChild(group);
            });

            els.brollList.appendChild(sceneEl);
            visibleCount++;
        });

        if (visibleCount === 0) {
            setStatus("Filtrga mos b-roll natijasi topilmadi.", 'error');
        }
    }

    function buildBrollCard(candidate, scene) {
        var card = document.createElement('button');
        card.type = 'button';
        card.className = 'broll-card';

        var thumb = document.createElement('img');
        thumb.className = 'broll-thumb';
        thumb.loading = 'lazy';
        thumb.src = candidate.thumbnailUrl;
        card.appendChild(thumb);

        var overlay = document.createElement('span');
        overlay.className = 'broll-card-overlay';
        card.appendChild(overlay);

        card.addEventListener('click', function () {
            addBroll(candidate, scene, card, overlay);
        });

        return card;
    }

    function addBroll(candidate, scene, cardEl, overlayEl) {
        cardEl.disabled = true;
        cardEl.classList.add('busy');
        overlayEl.textContent = 'Yuklanmoqda...';

        fetch(API_BASE + '/api/broll-download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mediaUrl: candidate.mediaUrl, type: candidate.type }),
        })
        .then(function (res) {
            return res.json().then(function (body) {
                if (!res.ok) {
                    throw new Error(body.error || ('Server xatoligi: ' + res.status));
                }
                return body;
            });
        })
        .then(function (body) {
            overlayEl.textContent = "Qo'shilmoqda...";
            var escaped = escapeForEval(body.localPath);
            var script = 'insertBroll("' + escaped + '", ' + scene.start + ', ' + scene.end + ')';
            csInterface.evalScript(script, function (result) {
                cardEl.classList.remove('busy');
                if (result && result.indexOf('ERROR:') === 0) {
                    cardEl.disabled = false;
                    cardEl.classList.add('failed');
                    overlayEl.textContent = 'Xato';
                    cardEl.title = result;
                } else {
                    cardEl.classList.add('added');
                    overlayEl.textContent = "Qo'shildi";
                }
            });
        })
        .catch(function (err) {
            cardEl.disabled = false;
            cardEl.classList.remove('busy');
            setStatus(err.message || String(err), 'error');
        });
    }

    function checkBackendConnection() {
        fetch(API_BASE + '/api/health')
            .then(function (res) {
                if (!res.ok) {
                    throw new Error();
                }
                els.connDot.className = 'conn-dot ok';
                els.connDot.title = 'Backend ishlayapti.';
            })
            .catch(function () {
                els.connDot.className = 'conn-dot error';
                els.connDot.title = "Backend serverga ulanib bo'lmadi. run-server.bat ishga tushirilganini tekshiring.";
            });
    }
    checkBackendConnection();

    var REASON_TEXT = {
        not_activated: "Hali faollashtirilmagan. Quyidagi kodni botga yuboring.",
        expired: "Obuna muddati tugagan. Botdan yangi token oling.",
        revoked: 'Litsenziya bekor qilingan. Admin bilan bog\'laning.',
        network_error: "Litsenziya serveriga ulanib bo'lmadi. Internetni tekshiring.",
        backend_unreachable: "Backend serverga ulanib bo'lmadi. run-server.bat ishga tushirilganini tekshiring.",
        device_mismatch: "Token noto'g'ri yoki boshqa qurilmaga tegishli.",
        not_found: "Token topilmadi. Qaytadan tekshiring.",
        missing_token: 'Tokenni kiriting.',
    };

    function setActivationStatus(text, kind) {
        els.activationStatusText.textContent = text;
        els.activationStatus.className = 'status ' + (kind || '');
    }

    function showActivationScreen(deviceCode, reason) {
        els.activationScreen.hidden = false;
        els.mainContent.hidden = true;
        els.licenseBadge.hidden = true;
        els.deviceCodeText.textContent = deviceCode || '...';
        var isErrorReason = reason === 'network_error' || reason === 'backend_unreachable';
        setActivationStatus(REASON_TEXT[reason] || 'Faollashtirish kerak.', isErrorReason ? 'error' : '');
    }

    function showMainContent(daysLeft) {
        els.activationScreen.hidden = true;
        els.mainContent.hidden = false;
        els.licenseBadge.hidden = false;
        var days = Math.max(0, Math.ceil(daysLeft));
        els.licenseBadge.textContent = days + ' kun qoldi';
        els.licenseBadge.className = 'license-badge' + (days <= 3 ? ' warn' : '');
    }

    function refreshLicenseStatus() {
        return fetch(API_BASE + '/api/license/status')
            .then(function (res) {
                return res.json();
            })
            .then(function (body) {
                if (body.valid) {
                    showMainContent(body.daysLeft);
                } else {
                    showActivationScreen(body.deviceCode, body.reason);
                }
            })
            .catch(function () {
                // Bu yerdagi fetch lokal backend'ga (API_BASE) boradi, AWS litsenziya
                // serveriga emas — shuning uchun bu yerdagi muvaffaqiyatsizlik odatda
                // "run-server.bat ishga tushmagan" degani, "internet yo'q" emas.
                // Java backend'ning o'zi AWS'ga ulana olmasa, body.reason='network_error'
                // .then() shoxobchasida keladi (bu yerga tushmaydi) — shu reason bilan
                // yuqoridagi xabar to'g'ri qoladi.
                showActivationScreen(null, 'backend_unreachable');
            });
    }

    // navigator.clipboard silently no-ops in CEP's embedded Chromium (file:// isn't treated
    // as a secure context, so the Promise it returns just rejects with nothing shown to the
    // user) -- shelling out to the OS clipboard tool is what actually works here, same as the
    // "Botga o'tish" button below now does for the same reason.
    function copyToClipboard(text) {
        try {
            var cp = require('child_process');
            var platform = nodeOs.platform();
            if (platform === 'win32') {
                var winProc = cp.spawn('clip');
                winProc.stdin.end(text);
            } else if (platform === 'darwin') {
                var macProc = cp.spawn('pbcopy');
                macProc.stdin.end(text);
            } else if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text);
            }
        } catch (e) {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text);
            }
        }
    }

    els.copyCodeBtn.addEventListener('click', function () {
        var code = els.deviceCodeText.textContent;
        if (!code || code === '...') {
            return;
        }
        copyToClipboard(code);
    });

    // Used to open the bot with the device code as a "?start=" deep-link payload, but
    // Telegram only auto-fires that payload for a brand-new chat -- a user (e.g. the admin
    // testing a second device) who already has history with the bot just gets the chat
    // opened with the code silently dropped, no error, nothing to explain why activation
    // never happened. Copying the code to the clipboard and opening a plain chat instead
    // is slower by one paste but never silently fails: bot.py's START_TEXT tells the user
    // to paste it, and on_device_code (the same regex handler a manually-typed code hits)
    // picks it up from there.
    els.openBotBtn.addEventListener('click', function () {
        var code = els.deviceCodeText.textContent;
        if (!code || code === '...') {
            return;
        }
        copyToClipboard(code);
        csInterface.openURLInDefaultBrowser('https://t.me/ravoncaptions_bot');
    });

    els.activateBtn.addEventListener('click', function () {
        var token = els.tokenInput.value.trim();
        if (!token) {
            setActivationStatus('Tokenni kiriting.', 'error');
            return;
        }
        els.activateBtn.disabled = true;
        els.activateBtn.classList.add('busy');
        setActivationStatus('Tekshirilmoqda...', 'busy');

        fetch(API_BASE + '/api/license/activate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: token }),
        })
        .then(function (res) {
            return res.json();
        })
        .then(function (body) {
            if (body.valid) {
                showMainContent(body.daysLeft);
            } else {
                setActivationStatus(REASON_TEXT[body.reason] || "Token noto'g'ri.", 'error');
            }
        })
        .catch(function () {
            setActivationStatus("Serverga ulanib bo'lmadi.", 'error');
        })
        .finally(function () {
            els.activateBtn.disabled = false;
            els.activateBtn.classList.remove('busy');
        });
    });

    function selectKineticCard(card, name) {
        selectedKineticStyle = name;
        Array.prototype.slice.call(els.kineticGrid.querySelectorAll('.kinetic-card')).forEach(function (c) {
            c.classList.remove('selected');
        });
        card.classList.add('selected');
    }

    function buildKineticCard(name) {
        var card = document.createElement('button');
        card.type = 'button';
        card.className = 'kinetic-card' + (name === selectedKineticStyle ? ' selected' : '');

        var media = document.createElement('div');
        media.className = 'kinetic-card-media';

        // Each .mogrt already ships its own rendered preview (thumb.mp4, extracted once at
        // build time into assets/kinetic-previews/<name>.mp4) — showing it lets users see how
        // the animation actually moves before adding it, instead of guessing from a filename.
        var video = document.createElement('video');
        video.src = 'assets/kinetic-previews/' + name + '.mp4';
        video.muted = true;
        video.loop = true;
        video.autoplay = true;
        video.playsInline = true;
        video.addEventListener('error', function () {
            video.style.display = 'none';
        });
        media.appendChild(video);

        var play = document.createElement('span');
        play.className = 'kinetic-card-play';
        play.innerHTML = '<svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8V4z"/></svg>';
        media.appendChild(play);

        var check = document.createElement('span');
        check.className = 'kinetic-card-check';
        check.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l5 5L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        media.appendChild(check);

        card.appendChild(media);

        var label = document.createElement('span');
        label.className = 'kinetic-card-label';
        label.textContent = name.replace(/_/g, ' ');
        card.appendChild(label);

        card.addEventListener('click', function () {
            selectKineticCard(card, name);
        });

        return card;
    }

    function renderKineticGrid() {
        els.kineticGrid.innerHTML = '';

        if (!kineticFiltered.length) {
            var empty = document.createElement('div');
            empty.className = 'kinetic-empty';
            empty.textContent = allKineticStyles.length ? 'Mos animatsiya topilmadi.' : 'Shablon topilmadi.';
            els.kineticGrid.appendChild(empty);
            els.kineticPagination.hidden = true;
            return;
        }

        var needsPaging = kineticFiltered.length > KINETIC_PAGE_SIZE;
        var totalPages = needsPaging ? Math.ceil(kineticFiltered.length / KINETIC_PAGE_SIZE) : 1;
        if (kineticPage >= totalPages) {
            kineticPage = totalPages - 1;
        }

        var visible = (!needsPaging || kineticShowAllFlag)
            ? kineticFiltered
            : kineticFiltered.slice(kineticPage * KINETIC_PAGE_SIZE, kineticPage * KINETIC_PAGE_SIZE + KINETIC_PAGE_SIZE);

        visible.forEach(function (name) {
            els.kineticGrid.appendChild(buildKineticCard(name));
        });
        els.kineticGrid.classList.toggle('kinetic-grid-scroll', needsPaging && kineticShowAllFlag);

        if (!needsPaging) {
            els.kineticPagination.hidden = true;
            return;
        }

        els.kineticPagination.hidden = false;
        els.kineticPrev.hidden = kineticShowAllFlag;
        els.kineticNext.hidden = kineticShowAllFlag;
        els.kineticPageLabel.hidden = kineticShowAllFlag;
        els.kineticPageDots.style.display = kineticShowAllFlag ? 'none' : 'flex';
        els.kineticPageLabel.textContent = (kineticPage + 1) + '/' + totalPages;
        els.kineticPrev.disabled = kineticPage <= 0;
        els.kineticNext.disabled = kineticPage >= totalPages - 1;

        els.kineticPageDots.innerHTML = '';
        for (var p = 0; p < totalPages; p++) {
            var dot = document.createElement('span');
            dot.className = 'kinetic-page-dot' + (p === kineticPage ? ' active' : '');
            els.kineticPageDots.appendChild(dot);
        }
        els.kineticShowAll.textContent = kineticShowAllFlag ? "Sahifalab ko'rish" : "Barchasini ko'rish";
    }

    function applyKineticFilter() {
        var query = els.kineticSearch.value.trim().toLowerCase();
        kineticFiltered = !query
            ? allKineticStyles.slice()
            : allKineticStyles.filter(function (name) {
                return name.toLowerCase().replace(/_/g, ' ').indexOf(query) !== -1;
            });
        kineticPage = 0;
        renderKineticGrid();
    }

    els.kineticSearch.addEventListener('input', applyKineticFilter);

    els.kineticPrev.addEventListener('click', function () {
        kineticPage = Math.max(0, kineticPage - 1);
        renderKineticGrid();
    });

    els.kineticNext.addEventListener('click', function () {
        kineticPage = kineticPage + 1;
        renderKineticGrid();
    });

    els.kineticShowAll.addEventListener('click', function () {
        kineticShowAllFlag = !kineticShowAllFlag;
        renderKineticGrid();
    });

    function loadKineticStyles() {
        var escapedFolder = escapeForEval(MOGRT_FOLDER);
        csInterface.evalScript('listKineticStyles("' + escapedFolder + '")', function (result) {
            var names = [];
            try {
                names = JSON.parse(result) || [];
            } catch (e) {
                names = [];
            }
            allKineticStyles = names;
            els.kineticCountBadge.textContent = names.length + ' ta animatsiya';
            if (names.length && !selectedKineticStyle) {
                selectedKineticStyle = names[0];
            }
            applyKineticFilter();
        });
    }

    // ════════════════ Avtomatik yangilanish ════════════════
    // Ikki bosqichli: hozir yuklanadi va tekshiriladi, o'rnatish esa keyingi Premiere
    // ochilishida bo'ladi (Premiere ishlab turganda plugin o'z fayllarini almashtira olmasligi
    // mumkin, ayniqsa Windows'da fayl band bo'ladi) — xuddi shu yondashuv boshqa CEP
    // pluginlarida (masalan raqobatchi caption.uz'da) ham tasdiqlangan, ishonchli naqsh.
    var PLUGIN_VERSION = '1.4.14';
    var UPDATE_HOST = 'aitilmoch.duckdns.org';
    var EXT_DIR = csInterface.getSystemPath(SystemPath.EXTENSION);
    // nodeFs/nodePath/nodeHttps are already required near the top of the file (shared with
    // exportSequenceAudioForTranscribe()).

    function isNewerVersion(latest, current) {
        if (!latest || !current) return false;
        var a = String(latest).split('.').map(function (x) { return parseInt(x, 10) || 0; });
        var b = String(current).split('.').map(function (x) { return parseInt(x, 10) || 0; });
        for (var i = 0; i < Math.max(a.length, b.length); i++) {
            var av = a[i] || 0, bv = b[i] || 0;
            if (av > bv) return true;
            if (av < bv) return false;
        }
        return false;
    }

    // Staged outside %APPDATA%\Adobe\CEP\extensions\ (via os.tmpdir(), not a sibling of
    // EXT_DIR) deliberately: CEP scans every subfolder of extensions\ for a CSXS/manifest.xml
    // and lists each as its own panel entry. A staged copy (a full package copy, complete
    // manifest included) sitting inside extensions\ got discovered as a second, ghost
    // "Ravon Captions" panel — Premiere's workspace remembered it as an open panel, then
    // failed with ERR_FILE_NOT_FOUND once the staging dir was cleaned up. Living in the temp
    // dir instead means CEP never sees it as an extension at all.
    var UPD = {
        stageDir: function () { return nodePath.join(nodeOs.tmpdir(), '.uzbek-ai-captions-pending'); },
        backupDir: function () { return nodePath.join(nodeOs.tmpdir(), '.uzbek-ai-captions-backup'); },
        markerFile: function () { return nodePath.join(UPD.stageDir(), 'READY'); },
    };

    function rmrf(p) {
        try {
            if (nodeFs.existsSync(p)) nodeFs.rmSync(p, { recursive: true, force: true });
        } catch (e) {
            try {
                require('child_process').execSync(
                    process.platform.indexOf('win') === 0 ? 'rmdir /s /q "' + p + '"' : 'rm -rf "' + p + '"');
            } catch (e2) { /* best-effort cleanup */ }
        }
    }

    function copyDir(src, dst) {
        if (nodeFs.cpSync) { nodeFs.cpSync(src, dst, { recursive: true }); return; }
        nodeFs.mkdirSync(dst, { recursive: true });
        nodeFs.readdirSync(src).forEach(function (name) {
            var s = nodePath.join(src, name), d = nodePath.join(dst, name);
            if (nodeFs.statSync(s).isDirectory()) copyDir(s, d); else nodeFs.copyFileSync(s, d);
        });
    }

    function downloadFile(url, dest) {
        return new Promise(function (resolve, reject) {
            var file = nodeFs.createWriteStream(dest);
            nodeHttps.get(url, { headers: { 'User-Agent': 'UzbekAiCaptions/' + PLUGIN_VERSION } }, function (res) {
                if (res.statusCode === 301 || res.statusCode === 302) {
                    file.close();
                    downloadFile(res.headers.location, dest).then(resolve, reject);
                    return;
                }
                if (res.statusCode !== 200) {
                    file.close();
                    reject(new Error('Yuklab bo\'lmadi (' + res.statusCode + ')'));
                    return;
                }
                res.pipe(file);
                file.on('finish', function () { file.close(function () { resolve(dest); }); });
            }).on('error', function () { file.close(); reject(new Error('Internetni tekshiring.')); });
        });
    }

    function unzipTo(zipPath, destDir) {
        var cp = require('child_process');
        nodeFs.mkdirSync(destDir, { recursive: true });
        if (process.platform.indexOf('win') === 0) {
            cp.execSync('powershell -NoProfile -Command "Expand-Archive -LiteralPath \'' +
                zipPath + '\' -DestinationPath \'' + destDir + '\' -Force"', { windowsHide: true });
        } else {
            cp.execSync('unzip -q -o "' + zipPath + '" -d "' + destDir + '"');
        }
    }

    // Yuklangan paket haqiqatan to'liq va yangimi — o'rnatishdan OLDIN tekshiramiz, yarim
    // yuklangan paketni qo'yish plaginni butunlay ishdan chiqarishi mumkin.
    function verifyPackage(dir, expectedVersion) {
        var required = ['client/index.html', 'CSXS/manifest.xml', 'client/js/main.js',
            'client/js/CSInterface.js', 'host/index.jsx', 'client/css/style.css'];
        for (var i = 0; i < required.length; i++) {
            var p = nodePath.join(dir, required[i]);
            if (!nodeFs.existsSync(p) || nodeFs.statSync(p).size < 10) {
                return { ok: false, reason: 'fayl yetishmayapti: ' + required[i] };
            }
        }
        var manifest = nodeFs.readFileSync(nodePath.join(dir, 'CSXS/manifest.xml'), 'utf8');
        var m = manifest.match(/ExtensionBundleVersion="([^"]+)"/);
        if (!m) return { ok: false, reason: 'manifestda versiya yo\'q' };
        if (expectedVersion && m[1] !== expectedVersion) {
            return { ok: false, reason: 'versiya mos emas: ' + m[1] + ' != ' + expectedVersion };
        }
        if (!isNewerVersion(m[1], PLUGIN_VERSION)) {
            return { ok: false, reason: 'yangi emas: ' + m[1] };
        }
        return { ok: true, version: m[1] };
    }

    function stageUpdate(expectedVersion) {
        var os = require('os');
        var tmpDir = os.tmpdir();
        var zipPath = nodePath.join(tmpDir, 'uzbek-ai-captions-update-' + Date.now() + '.zip');
        var unzipped = nodePath.join(tmpDir, 'uzbek-ai-captions-unzip-' + Date.now());
        var stage = UPD.stageDir();

        return downloadFile('https://' + UPDATE_HOST + '/plugin/download', zipPath).then(function () {
            unzipTo(zipPath, unzipped);

            var src = nodePath.join(unzipped, 'uzbek-ai-captions');
            if (!nodeFs.existsSync(src)) {
                var inside = nodeFs.readdirSync(unzipped)
                    .map(function (n) { return nodePath.join(unzipped, n); })
                    .filter(function (p) { try { return nodeFs.statSync(p).isDirectory(); } catch (e) { return false; } });
                src = inside.find(function (p) { return nodeFs.existsSync(nodePath.join(p, 'CSXS', 'manifest.xml')); }) || '';
                if (!src) throw new Error('Paket ichida plugin topilmadi.');
            }

            var check = verifyPackage(src, expectedVersion);
            if (!check.ok) throw new Error('Paket yaroqsiz — ' + check.reason);

            rmrf(stage);
            copyDir(src, stage);
            nodeFs.writeFileSync(UPD.markerFile(), check.version, 'utf8');
            return check.version;
        }).finally(function () {
            try { nodeFs.unlinkSync(zipPath); } catch (e) {}
            rmrf(unzipped);
        });
    }

    // Ishga tushganda: oldingi seansda tayyorlab qo'yilgan yangilanish bo'lsa — shu yerda
    // o'rnatiladi. Fayllar Premiere ochilishida bir marta o'qiladi, shuning uchun o'rnatilgan
    // versiya keyingi ochilishda kuchga kiradi.
    function applyPendingUpdate() {
        if (!nodeFs) return null;
        var stage = UPD.stageDir();
        var backup = UPD.backupDir();
        try {
            if (!nodeFs.existsSync(UPD.markerFile())) return null;
            var staged = verifyPackage(stage, '');
            if (!staged.ok) { rmrf(stage); return null; }

            rmrf(backup);
            copyDir(EXT_DIR, backup);
            try {
                copyDir(stage, EXT_DIR);
                var check = verifyPackage(EXT_DIR, staged.version);
                if (!check.ok) throw new Error(check.reason);
            } catch (e) {
                copyDir(backup, EXT_DIR);
                rmrf(stage);
                return { error: String((e && e.message) || e) };
            }
            rmrf(stage);
            rmrf(backup);
            return { version: staged.version };
        } catch (e) {
            return { error: String((e && e.message) || e) };
        }
    }

    // No user action required anymore: checkForUpdate() stages a newer version by itself as
    // soon as it finds one, and this banner is purely informational (dismiss-only) — it used to
    // have a "Yangilash" button the user had to click to kick off stageUpdate(), but that meant
    // a customer who never noticed/clicked it just stayed on a broken/outdated build. The button
    // markup stays in index.html (removing it risks the exact kind of JS/HTML mismatch that
    // broke 1.4.2 — see the 1.4.3 fix above) but is hidden at boot since nothing wires it up now.
    els.updateBannerBtn.hidden = true;

    function showUpdateNotice(text) {
        els.updateBannerText.textContent = text;
        els.updateBanner.hidden = false;
    }

    els.updateBannerDismiss.addEventListener('click', function () {
        els.updateBanner.hidden = true;
    });

    function checkForUpdate() {
        if (!nodeHttps) return;
        try {
            nodeHttps.get({
                hostname: UPDATE_HOST, path: '/plugin/version',
                headers: { 'User-Agent': 'UzbekAiCaptions/' + PLUGIN_VERSION },
                timeout: 8000,
            }, function (res) {
                var chunks = [];
                res.on('data', function (c) { chunks.push(c); });
                res.on('end', function () {
                    try {
                        var data = JSON.parse(Buffer.concat(chunks).toString());
                        if (data.latestVersion && isNewerVersion(data.latestVersion, PLUGIN_VERSION)) {
                            // Stage it immediately, no click required. Failures (offline mid-download,
                            // server hiccup) are silent here — next boot's checkForUpdate() retries on
                            // its own, and there's nothing the user could actionably do about it anyway.
                            stageUpdate(data.latestVersion).then(function (version) {
                                showUpdateNotice("Yangi versiya (" + version + ") o'rnatildi — Premiere'ni yopib qayta ochsangiz faollashadi.");
                            }).catch(function () { /* will retry on next boot */ });
                        }
                    } catch (e) { /* malformed response — skip silently, not critical */ }
                });
            }).on('error', function () { /* offline or server down — skip silently */ });
        } catch (e) { /* not critical to panel function */ }
    }

    // ════════════════ Backend (Java) avtomatik yangilanishi ════════════════
    // The backend can't safely replace its own running .exe/.app while executing (Windows
    // locks the file; swapping a macOS bundle's binary out from under a running process is
    // just as fragile), so this panel -- a separate process that only talks to it over HTTP,
    // never loads its files directly -- does the kill/replace/relaunch instead. Unlike the
    // plugin's own update (staged and applied on next Premiere launch, since Premiere has the
    // panel's files open right now), this can happen immediately.
    var BACKEND_INSTALL_DIR = process.platform === 'win32'
        ? nodePath.join(process.env.LOCALAPPDATA || '', 'RavonCaptions', 'Backend')
        : nodePath.join(process.env.HOME || '', 'Applications', 'RavonCaptionsBackend.app');
    var BACKEND_EXE_NAME = process.platform === 'win32' ? 'UzbekAiCaptionsBackend.exe' : 'RavonCaptionsBackend';

    function getInstalledBackendVersion() {
        return fetch(API_BASE + '/api/version', { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : { version: null }; })
            .then(function (body) { return body.version || null; })
            .catch(function () { return null; });
    }

    function getLatestBackendInfo() {
        return new Promise(function (resolve) {
            try {
                nodeHttps.get({
                    hostname: UPDATE_HOST, path: '/backend/version',
                    headers: { 'User-Agent': 'UzbekAiCaptions/' + PLUGIN_VERSION },
                    timeout: 8000,
                }, function (res) {
                    var chunks = [];
                    res.on('data', function (c) { chunks.push(c); });
                    res.on('end', function () {
                        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
                        catch (e) { resolve(null); }
                    });
                }).on('error', function () { resolve(null); });
            } catch (e) { resolve(null); }
        });
    }

    function killBackendProcess() {
        var cp = require('child_process');
        try {
            if (process.platform === 'win32') {
                cp.execSync('taskkill /IM ' + BACKEND_EXE_NAME + ' /F', { windowsHide: true });
            } else {
                cp.execSync('pkill -f "' + BACKEND_EXE_NAME + '"');
            }
        } catch (e) { /* already not running -- fine */ }
    }

    function relaunchBackend() {
        var cp = require('child_process');
        if (process.platform === 'win32') {
            cp.spawn(nodePath.join(BACKEND_INSTALL_DIR, BACKEND_EXE_NAME), [], { detached: true, stdio: 'ignore', cwd: BACKEND_INSTALL_DIR }).unref();
        } else {
            cp.spawn('open', [BACKEND_INSTALL_DIR], { detached: true, stdio: 'ignore' }).unref();
        }
    }

    // Windows' Compress-Archive and macOS' ditto both zip the app folder/bundle itself as a
    // top-level entry (not just its contents) -- same "one level deeper than expected" shape
    // the plugin update's own unzip already accounts for above.
    function findBackendRoot(unzipped, markerName) {
        if (nodeFs.existsSync(nodePath.join(unzipped, markerName))) {
            return unzipped;
        }
        var entries = nodeFs.readdirSync(unzipped)
            .map(function (n) { return nodePath.join(unzipped, n); })
            .filter(function (p) { try { return nodeFs.statSync(p).isDirectory(); } catch (e) { return false; } });
        for (var i = 0; i < entries.length; i++) {
            if (nodeFs.existsSync(nodePath.join(entries[i], markerName))) {
                return entries[i];
            }
        }
        return null;
    }

    function updateBackend(downloadUrl, version) {
        var tmpDir = nodeOs.tmpdir();
        var zipPath = nodePath.join(tmpDir, 'ravon-backend-update-' + Date.now() + '.zip');
        var unzipped = nodePath.join(tmpDir, 'ravon-backend-unzip-' + Date.now());

        return downloadFile('https://' + UPDATE_HOST + downloadUrl, zipPath).then(function () {
            unzipTo(zipPath, unzipped);
            var marker = process.platform === 'win32' ? BACKEND_EXE_NAME : 'RavonCaptionsBackend.app';
            var root = findBackendRoot(unzipped, marker);
            if (!root) throw new Error('Backend paketi ichida dastur topilmadi.');

            killBackendProcess();

            // taskkill/pkill return as soon as the signal is sent, not once the process has
            // actually released its file handles -- copying over it a beat too early is how
            // you get an intermittent EBUSY/EPERM on Windows. install.bat waits the same way.
            return new Promise(function (resolve) { setTimeout(resolve, 2000); }).then(function () {
                if (process.platform === 'win32') {
                    nodeFs.mkdirSync(BACKEND_INSTALL_DIR, { recursive: true });
                    copyDir(root, BACKEND_INSTALL_DIR);
                } else {
                    rmrf(BACKEND_INSTALL_DIR);
                    copyDir(nodePath.join(root, 'RavonCaptionsBackend.app'), BACKEND_INSTALL_DIR);
                    try { require('child_process').execSync('xattr -cr "' + BACKEND_INSTALL_DIR + '"'); } catch (e) {}
                }
                relaunchBackend();
                return version;
            });
        }).finally(function () {
            try { nodeFs.unlinkSync(zipPath); } catch (e) {}
            rmrf(unzipped);
        });
    }

    function checkBackendUpdate() {
        if (!nodeHttps || !nodeFs) return;
        getLatestBackendInfo().then(function (latest) {
            if (!latest || !latest.latestVersion) return;
            getInstalledBackendVersion().then(function (installed) {
                if (installed && !isNewerVersion(latest.latestVersion, installed)) {
                    return;
                }
                var url = latest.downloadUrl && (process.platform === 'win32' ? latest.downloadUrl.windows : latest.downloadUrl.mac);
                if (!url) return;
                updateBackend(url, latest.latestVersion).then(function (version) {
                    showUpdateNotice("Backend yangilandi (" + version + ") — bir necha soniyada qayta ulanadi.");
                    setTimeout(checkBackendConnection, 4000);
                }).catch(function () { /* will retry next boot */ });
            });
        });
    }

    // ════════════════ Karaoke caption (rangli, so'z-baso'z animatsiyali) ════════════════
    function selectKaraokeCard(card, key) {
        selectedKaraokeStyle = key;
        Array.prototype.slice.call(els.karaokeStyleGrid.querySelectorAll('.kinetic-card')).forEach(function (c) {
            c.classList.remove('selected');
        });
        card.classList.add('selected');
    }

    function buildKaraokeCard(style) {
        var card = document.createElement('button');
        card.type = 'button';
        card.className = 'kinetic-card' + (style.key === selectedKaraokeStyle ? ' selected' : '');

        var media = document.createElement('div');
        media.className = 'kinetic-card-media';

        // Same idea as the kinetic MOGRT previews: a short looping clip of the actual style
        // (same ffmpeg/ASS pipeline the real export uses, rendered once at build time against a
        // fixed sample phrase) beats guessing what "TikTok Bold" looks like from its name alone.
        var video = document.createElement('video');
        video.src = 'assets/karaoke-previews/' + style.key + '.mp4';
        video.muted = true;
        video.loop = true;
        video.autoplay = true;
        video.playsInline = true;
        video.addEventListener('error', function () {
            video.style.display = 'none';
        });
        media.appendChild(video);

        var check = document.createElement('span');
        check.className = 'kinetic-card-check';
        check.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l5 5L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        media.appendChild(check);

        card.appendChild(media);

        var label = document.createElement('span');
        label.className = 'kinetic-card-label';
        label.textContent = style.displayName;
        card.appendChild(label);

        card.addEventListener('click', function () {
            selectKaraokeCard(card, style.key);
        });
        return card;
    }

    function loadKaraokeStyles() {
        fetch(API_BASE + '/api/karaoke-styles')
            .then(function (res) { return res.ok ? res.json() : []; })
            .then(function (styles) {
                els.karaokeStyleGrid.innerHTML = '';
                if (!styles.length) {
                    return;
                }
                if (!selectedKaraokeStyle) {
                    selectedKaraokeStyle = styles[0].key;
                }
                styles.forEach(function (style) {
                    els.karaokeStyleGrid.appendChild(buildKaraokeCard(style));
                });
            })
            .catch(function () { /* karaoke panel just stays empty — not critical to boot */ });
    }

    function pollKaraokeJob(jobId) {
        return new Promise(function (resolve, reject) {
            function tick() {
                fetch(API_BASE + '/api/karaoke-caption/status/' + jobId)
                    .then(function (res) { return res.json(); })
                    .then(function (body) {
                        if (body.status === 'error') {
                            reject(new Error(body.error || 'Karaoke video yaratilmadi.'));
                        } else if (body.status === 'done') {
                            resolve(body.outputPath);
                        } else {
                            setTimeout(tick, 1500);
                        }
                    })
                    .catch(reject);
            }
            tick();
        });
    }

    els.karaokeGenerateBtn.addEventListener('click', function () {
        if (!lastWords || !lastWords.length) {
            setStatus("Avval \"Subtitr yaratish\"ni bosing.", 'error');
            return;
        }
        if (!selectedKaraokeStyle) {
            setStatus('Karaoke stilini tanlang.', 'error');
            return;
        }
        setBusy(true);
        els.karaokeGenerateBtn.classList.add('busy');
        setStatus('Sequence video eksport qilinmoqda...', 'busy');

        exportSequenceVideoForKaraoke()
            .then(function (videoPath) {
                setStatus('Karaoke caption kuydirilmoqda (bir necha daqiqa davom etishi mumkin)...', 'busy');
                return fetch(API_BASE + '/api/karaoke-caption', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ videoPath: videoPath, words: lastWords, styleKey: selectedKaraokeStyle }),
                });
            })
            .then(function (res) { return res.json().then(function (body) { return { res: res, body: body }; }); })
            .then(function (r) {
                if (!r.res.ok) {
                    throw new Error(r.body.error || 'Karaoke so\'rovi rad etildi.');
                }
                return pollKaraokeJob(r.body.jobId);
            })
            .then(function (outputPath) {
                setStatus('Karaoke video loyihaga qo\'shilmoqda...', 'busy');
                return new Promise(function (resolve, reject) {
                    csInterface.evalScript('importKaraokeVideo("' + escapeForEval(outputPath) + '")', function (result) {
                        if (!result || result.indexOf('ERROR:') === 0) {
                            reject(new Error((result || '').replace(/^ERROR:\s*/, '') || "Video import qilinmadi."));
                            return;
                        }
                        resolve();
                    });
                });
            })
            .then(function () {
                setStatus('Karaoke video tayyor — loyiha bin\'iga qo\'shildi.', 'ok');
            })
            .catch(function (err) {
                setStatus(err.message || String(err), 'error');
            })
            .finally(function () {
                setBusy(false);
                els.karaokeGenerateBtn.classList.remove('busy');
            });
    });

    (function bootUpdate() {
        var applied = applyPendingUpdate();
        if (applied && applied.version) {
            setStatus("Yangilandi — " + applied.version + ". Yangi imkoniyatlar Premiere qayta ochilganda faol bo'ladi.", 'ok');
        }
        checkForUpdate();
        checkBackendUpdate();
    })();

    refreshLicenseStatus();
    detectActiveMedia();
    loadKineticStyles();
    loadKaraokeStyles();
})();
