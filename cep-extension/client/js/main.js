(function () {
    var csInterface = new CSInterface();
    var API_BASE = 'http://localhost:8971';
    // ExtendScript's $.fileName doesn't reliably resolve to the host .jsx's own location once
    // loaded as a CEP host script, so the mogrt assets folder is resolved here instead (the
    // officially documented way to find the extension's own install folder) and passed into
    // every kinetic-typography evalScript call.
    var MOGRT_FOLDER = csInterface.getSystemPath(SystemPath.EXTENSION) + '/host/assets/mogrt';
    var EXPORT_PRESET_PATH = csInterface.getSystemPath(SystemPath.EXTENSION) + '/host/assets/export-presets/audio_wav_mono_16k.epr';

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
        kineticBtn: document.getElementById('kinetic-btn'),
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

    els.kineticMinDurationSlider.addEventListener('input', function () {
        els.kineticMinDurationBadge.textContent = parseFloat(els.kineticMinDurationSlider.value).toFixed(1) + 's';
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
    }

    function detectActiveMedia(callback) {
        var csi = new CSInterface();
        csi.evalScript('getActiveMediaPath()', function (result) {
            if (result && result.indexOf('ERROR:') === 0) {
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

            exportSequenceAudioForTranscribe()
            .then(function (wavPath) {
                exportedWavPath = wavPath;
                return startTranscribeJob({
                    filePath: wavPath,
                    maxLines: maxLines,
                    wordsPerLine: wordsPerLine,
                    translateTo: translateTo,
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

        exportSequenceAudioForTranscribe()
        .then(function (wavPath) {
            exportedWavPath = wavPath;
            return startTranscribeJob({
                filePath: wavPath,
                maxLines: maxLines,
                wordsPerLine: wordsPerLine,
                translateTo: translateTo,
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
            var script = 'insertKineticText("' + style + '", "' + escapedWords + '", "' + escapedMedia + '", "' +
                escapedFolder + '", ' + minDurationSeconds + ')';
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

    els.copyCodeBtn.addEventListener('click', function () {
        var code = els.deviceCodeText.textContent;
        if (!code || code === '...') {
            return;
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(code);
        }
    });

    // Opens the bot with the device code as a "?start=" deep-link payload (bot.py reads
    // it via CommandObject and feeds it straight into the same device-code handling
    // on_device_code uses for a pasted code) so the user doesn't have to copy/paste the
    // code by hand into the chat.
    els.openBotBtn.addEventListener('click', function () {
        var code = els.deviceCodeText.textContent;
        if (!code || code === '...') {
            return;
        }
        csInterface.openURLInDefaultBrowser('https://t.me/ravoncaptions_bot?start=' + encodeURIComponent(code));
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
    var PLUGIN_VERSION = '1.4.2';
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

    var pendingUpdateVersion = '';

    function showUpdateBanner(version) {
        els.updateBannerText.textContent = "Yangi versiya (" + version + ") mavjud";
        els.updateBanner.hidden = false;
        pendingUpdateVersion = version;
    }

    els.updateBannerDismiss.addEventListener('click', function () {
        els.updateBanner.hidden = true;
    });

    els.updateBannerBtn.addEventListener('click', function () {
        // Panel ochilgandan beri boshqa yo'l bilan (masalan install.bat) allaqachon shu
        // versiyaga yangilangan bo'lishi mumkin — bunday holda foydalanuvchiga "xato"
        // ko'rsatish o'rniga bannerni jimgina yashiramiz.
        if (!isNewerVersion(pendingUpdateVersion, PLUGIN_VERSION)) {
            els.updateBanner.hidden = true;
            return;
        }
        els.updateBannerBtn.disabled = true;
        els.updateBannerBtn.textContent = 'Yuklanmoqda...';
        stageUpdate(pendingUpdateVersion).then(function (version) {
            els.updateBannerText.textContent = "Yuklandi (" + version + ") — Premiere'ni yopib qayta oching.";
            els.updateBannerBtn.hidden = true;
        }).catch(function (e) {
            els.updateBannerBtn.disabled = false;
            els.updateBannerBtn.textContent = 'Yangilash';
            var msg = e.message || String(e);
            if (msg.indexOf('yangi emas') !== -1) {
                els.updateBannerText.textContent = 'Allaqachon eng oxirgi versiyadasiz.';
                els.updateBannerBtn.hidden = true;
            } else {
                els.updateBannerText.textContent = 'Yangilab bo\'lmadi: ' + msg;
            }
        });
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
                            showUpdateBanner(data.latestVersion);
                        }
                    } catch (e) { /* malformed response — skip silently, not critical */ }
                });
            }).on('error', function () { /* offline or server down — skip silently */ });
        } catch (e) { /* not critical to panel function */ }
    }

    (function bootUpdate() {
        var applied = applyPendingUpdate();
        if (applied && applied.version) {
            setStatus("Yangilandi — " + applied.version + ". Yangi imkoniyatlar Premiere qayta ochilganda faol bo'ladi.", 'ok');
        }
        checkForUpdate();
    })();

    refreshLicenseStatus();
    detectActiveMedia();
    loadKineticStyles();
})();
