(function () {
    var csInterface = new CSInterface();
    var API_BASE = 'http://localhost:8971';
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
        licenseBadge: document.getElementById('license-badge'),
        activationScreen: document.getElementById('activation-screen'),
        mainContent: document.getElementById('main-content'),
        deviceCodeText: document.getElementById('device-code-text'),
        copyCodeBtn: document.getElementById('copy-code-btn'),
        tokenInput: document.getElementById('token-input'),
        activateBtn: document.getElementById('activate-btn'),
        activationStatus: document.getElementById('activation-status'),
        activationStatusText: document.getElementById('activation-status-text'),
    };

    var segmentButtons = Array.prototype.slice.call(els.styleSegmented.querySelectorAll('.segment-btn'));
    var selectedSegment = els.styleSegmented.querySelector('.segment-btn.selected');
    var selectedFile = null;
    var lastSegments = null;
    var lastBrollSuggestions = [];
    var brollActiveType = 'all';

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
    }

    function setBusy(isBusy) {
        els.generateBtn.disabled = isBusy;
        els.generateBtn.classList.toggle('busy', isBusy);
        setSegmentButtonsDisabled(isBusy);
        els.translateToggle.disabled = isBusy;
        els.advancedToggle.disabled = isBusy;
    }

    function detectActiveMedia(callback) {
        var csi = new CSInterface();
        csi.evalScript('getActiveMediaPath()', function (result) {
            if (result && result.indexOf('ERROR:') === 0) {
                selectedFile = null;
                els.filePathText.textContent = result.replace(/^ERROR:\s*/, '');
                els.filePath.className = 'file-card error';
                els.brollBtn.hidden = true;
            } else {
                selectedFile = result;
                els.filePathText.textContent = result;
                els.filePath.className = 'file-card';
                els.brollBtn.hidden = false;
            }
            if (callback) {
                callback();
            }
        });
    }

    els.generateBtn.addEventListener('click', function () {
        setStatus('Timeline video tekshirilmoqda...', 'busy');
        setBusy(true);
        lastSegments = null;
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

            setStatus("Subtitr yaratilmoqda... (bir necha o'n soniya)", 'busy');

            var advancedOn = els.advancedToggle.getAttribute('aria-checked') === 'true';
            var maxLines = advancedOn
                ? parseInt(els.maxLinesSlider.value, 10)
                : parseInt(selectedSegment.dataset.maxLines, 10);
            var wordsPerLine = advancedOn
                ? parseInt(els.wordsPerLineSlider.value, 10)
                : parseInt(selectedSegment.dataset.wordsPerLine, 10);
            var translateOn = els.translateToggle.getAttribute('aria-checked') === 'true';
            var translateTo = translateOn ? els.translateLang.value : null;

            fetch(API_BASE + '/api/transcribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filePath: selectedFile,
                    maxLines: maxLines,
                    wordsPerLine: wordsPerLine,
                    translateTo: translateTo,
                }),
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
                setStatus("Subtitr tayyor, loyihaga qo'shilmoqda...", 'busy');
                lastSegments = body.segments || null;
                importSrt(body.srtPath, selectedFile);
            })
            .catch(function (err) {
                setStatus(err.message || String(err), 'error');
            })
            .finally(function () {
                setBusy(false);
            });
        });
    });

    function importSrt(srtPath, sourceMediaPath) {
        var escapedSrt = escapeForEval(srtPath);
        var escapedMedia = escapeForEval(sourceMediaPath || '');
        csInterface.evalScript('importSrt("' + escapedSrt + '", "' + escapedMedia + '")', function (result) {
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

        setStatus('Video tahlil qilinmoqda...', 'busy');

        var advancedOn = els.advancedToggle.getAttribute('aria-checked') === 'true';
        var maxLines = advancedOn
            ? parseInt(els.maxLinesSlider.value, 10)
            : parseInt(selectedSegment.dataset.maxLines, 10);
        var wordsPerLine = advancedOn
            ? parseInt(els.wordsPerLineSlider.value, 10)
            : parseInt(selectedSegment.dataset.wordsPerLine, 10);
        var translateOn = els.translateToggle.getAttribute('aria-checked') === 'true';
        var translateTo = translateOn ? els.translateLang.value : null;

        fetch(API_BASE + '/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filePath: selectedFile,
                maxLines: maxLines,
                wordsPerLine: wordsPerLine,
                translateTo: translateTo,
            }),
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
            lastSegments = body.segments || null;
            if (!lastSegments || !lastSegments.length) {
                throw new Error('Videoda nutq topilmadi.');
            }
            callback(null);
        })
        .catch(function (err) {
            callback(err);
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
        setActivationStatus(REASON_TEXT[reason] || 'Faollashtirish kerak.', reason === 'network_error' ? 'error' : '');
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
                showActivationScreen(null, 'network_error');
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

    refreshLicenseStatus();
    detectActiveMedia();
})();
