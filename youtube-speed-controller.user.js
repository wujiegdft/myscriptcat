// ==UserScript==
// @name YouTube 快捷播放速度控制器
// @namespace https://scriptcat.org/
// @version 1.1.0
// @description 为 YouTube 播放器添加简洁倍速面板，支持 0.5x–2x 快捷切换及倍速记忆。
// @author Antigravity
// @match https://www.youtube.com/*
// @match https://www.youtube-nocookie.com/*
// @grant GM_getValue
// @grant GM_setValue
// @grant GM_registerMenuCommand
// @run-at document-idle
// ==/UserScript==

(function () {
    'use strict';

    const LOG = (...args) => console.log('[YT-Speed]', ...args);
    const WARN = (...args) => console.warn('[YT-Speed]', ...args);
    const ERR = (...args) => console.error('[YT-Speed]', ...args);

    const PRESETS = [0.5, 1.0, 1.25, 1.5, 2.0];
    const MIN_SPEED = 0.5;
    const MAX_SPEED = 2.0;
    const SPEED_STEP = 0.25;
    const STORAGE_KEY_SPEED = 'yt_custom_speed';
    const STORAGE_KEY_REMEMBER = 'yt_remember_speed';

    let rememberSpeed = true;
    let currentSpeed = 1.0;
    let toastTimeout = null;
    let mountAttempt = 0;
    let lastMountFailReason = '';

    const clampSpeed = (value) => {
        const n = Number(value);
        if (!Number.isFinite(n)) return 1.0;
        return Math.max(MIN_SPEED, Math.min(MAX_SPEED, Math.round(n * 100) / 100));
    };

    const formatSpeed = (speed) => `${speed.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')}x`;

    try {
        rememberSpeed = GM_getValue(STORAGE_KEY_REMEMBER, true);
        currentSpeed = clampSpeed(GM_getValue(STORAGE_KEY_SPEED, 1.0));
        LOG('读取存储成功', { rememberSpeed, currentSpeed });
    } catch (e) {
        ERR('读取 GM 存储失败，使用默认值', e);
    }

    const injectStyles = () => {
        if (document.getElementById('yt-speed-controller-styles')) return;
        const style = document.createElement('style');
        style.id = 'yt-speed-controller-styles';
        style.textContent = `
            .yt-speed-control-wrapper {
                display: inline-flex;
                align-items: center;
                position: relative;
                height: 100%;
                margin-right: 4px;
                vertical-align: top;
                font-family: "YouTube Noto", Roboto, Arial, sans-serif;
                user-select: none;
            }

            .yt-speed-btn-current {
                background: transparent;
                color: #fff;
                border: none;
                border-radius: 2px;
                min-width: 40px;
                height: 36px;
                padding: 0 8px;
                font-size: 13px;
                font-weight: 500;
                letter-spacing: 0.2px;
                cursor: pointer;
                outline: none;
                display: inline-flex;
                align-items: center;
                justify-content: center;
            }

            .yt-speed-btn-current:hover {
                background: rgba(255, 255, 255, 0.1);
            }

            .yt-speed-btn-current:active {
                background: rgba(255, 255, 255, 0.16);
            }

            .yt-speed-panel {
                position: absolute;
                bottom: 44px;
                left: 50%;
                transform: translateX(-50%) translateY(6px);
                background: #212121;
                border-radius: 12px;
                padding: 6px;
                display: flex;
                gap: 2px;
                box-shadow: 0 4px 24px rgba(0, 0, 0, 0.45);
                opacity: 0;
                visibility: hidden;
                pointer-events: none;
                transition: opacity 0.12s ease, transform 0.12s ease, visibility 0.12s ease;
                z-index: 9999;
                white-space: nowrap;
            }

            .yt-speed-control-wrapper:hover .yt-speed-panel,
            .yt-speed-panel.show {
                opacity: 1;
                visibility: visible;
                pointer-events: auto;
                transform: translateX(-50%) translateY(0);
            }

            .yt-speed-preset-chip {
                background: transparent;
                color: #fff;
                border: none;
                border-radius: 8px;
                min-width: 44px;
                padding: 8px 10px;
                font-size: 13px;
                font-weight: 400;
                line-height: 1;
                text-align: center;
                cursor: pointer;
            }

            .yt-speed-preset-chip:hover {
                background: rgba(255, 255, 255, 0.1);
            }

            .yt-speed-preset-chip.active {
                background: #fff;
                color: #0f0f0f;
                font-weight: 500;
            }

            .yt-speed-toast {
                position: absolute;
                top: 20px;
                right: 20px;
                background: rgba(15, 15, 15, 0.88);
                color: #fff;
                padding: 8px 14px;
                border-radius: 8px;
                font-size: 13px;
                font-weight: 500;
                pointer-events: none;
                opacity: 0;
                transform: translateY(-8px);
                transition: opacity 0.18s ease, transform 0.18s ease;
                z-index: 9999;
            }

            .yt-speed-toast.show {
                opacity: 1;
                transform: translateY(0);
            }
        `;
        document.head.appendChild(style);
        LOG('CSS 已注入');
    };

    const getVideo = () => document.querySelector('video.html5-main-video') || document.querySelector('video');

    const showToast = (speed) => {
        const player = document.querySelector('.html5-video-player');
        if (!player) return;

        let toast = player.querySelector('.yt-speed-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'yt-speed-toast';
            player.appendChild(toast);
        }

        toast.textContent = formatSpeed(speed);
        toast.classList.add('show');
        if (toastTimeout) clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => toast.classList.remove('show'), 1000);
    };

    const setSpeed = (newSpeed, notify = true) => {
        const speed = clampSpeed(newSpeed);
        currentSpeed = speed;

        const video = getVideo();
        if (video) video.playbackRate = speed;

        if (rememberSpeed) {
            try {
                GM_setValue(STORAGE_KEY_SPEED, speed);
            } catch (e) {
                ERR('写入 GM 存储失败', e);
            }
        }

        updateUI(speed);
        if (notify) showToast(speed);
    };

    const updateUI = (speed) => {
        const btnText = document.querySelector('.yt-speed-btn-text');
        if (btnText) btnText.textContent = formatSpeed(speed);

        document.querySelectorAll('.yt-speed-preset-chip').forEach((chip) => {
            const val = parseFloat(chip.dataset.speed);
            chip.classList.toggle('active', Math.abs(val - speed) < 0.01);
        });
    };

    const probePlayerDom = () => {
        const selectors = [
            '#movie_player',
            '.html5-video-player',
            '.ytp-right-controls',
            '.ytp-right-controls-right',
            '.ytp-settings-button',
            'video.html5-main-video',
            '#yt-speed-control-wrapper',
        ];
        const result = {};
        selectors.forEach((sel) => {
            result[sel] = document.querySelectorAll(sel).length;
        });
        return result;
    };

    const getRightControls = () => {
        const player = document.querySelector('#movie_player') || document.querySelector('.html5-video-player');
        const root = player || document;
        const candidates = [
            root.querySelector('.ytp-right-controls-right'),
            root.querySelector('.ytp-right-controls'),
            document.querySelector('.ytp-right-controls-right'),
            document.querySelector('.ytp-right-controls'),
        ];
        return candidates.find(Boolean) || null;
    };

    const mountControlPanel = () => {
        mountAttempt += 1;
        const attempt = mountAttempt;

        try {
            const existing = document.getElementById('yt-speed-control-wrapper');
            if (existing) {
                if (existing.isConnected) return;
                existing.remove();
            }

            const rightControls = getRightControls();
            if (!rightControls) {
                if (lastMountFailReason !== 'no-right-controls' || attempt <= 5 || attempt % 10 === 0) {
                    lastMountFailReason = 'no-right-controls';
                    WARN('未找到右侧控件容器，挂载失败', { attempt, probe: probePlayerDom() });
                }
                return;
            }

            const wrapper = document.createElement('div');
            wrapper.id = 'yt-speed-control-wrapper';
            wrapper.className = 'yt-speed-control-wrapper';

            const btn = document.createElement('button');
            btn.className = 'yt-speed-btn-current';
            btn.type = 'button';
            btn.title = '播放速度';

            const btnText = document.createElement('span');
            btnText.className = 'yt-speed-btn-text';
            btnText.textContent = formatSpeed(currentSpeed);
            btn.appendChild(btnText);

            const panel = document.createElement('div');
            panel.className = 'yt-speed-panel';

            PRESETS.forEach((s) => {
                const chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'yt-speed-preset-chip';
                if (Math.abs(s - currentSpeed) < 0.01) chip.classList.add('active');
                chip.dataset.speed = String(s);
                chip.textContent = formatSpeed(s);
                chip.addEventListener('click', (e) => {
                    e.stopPropagation();
                    setSpeed(s);
                });
                panel.appendChild(chip);
            });

            wrapper.appendChild(btn);
            wrapper.appendChild(panel);

            const settingsBtn = rightControls.querySelector('.ytp-settings-button');
            if (settingsBtn) {
                rightControls.insertBefore(wrapper, settingsBtn);
            } else {
                rightControls.insertBefore(wrapper, rightControls.firstChild);
            }

            wrapper.addEventListener('wheel', (e) => {
                e.preventDefault();
                const delta = e.deltaY < 0 ? SPEED_STEP : -SPEED_STEP;
                setSpeed(currentSpeed + delta);
            }, { passive: false });

            lastMountFailReason = '';
            if (attempt <= 3 || attempt % 10 === 0) {
                LOG('挂载完成', { attempt, isConnected: wrapper.isConnected });
            }
        } catch (e) {
            ERR('mountControlPanel 异常', e);
        }
    };

    const observeVideo = () => {
        const applySpeedToVideo = () => {
            const video = getVideo();
            if (!video) return;
            if (rememberSpeed && Math.abs(video.playbackRate - currentSpeed) > 0.01) {
                video.playbackRate = currentSpeed;
            }
            if (!video.dataset.speedBound) {
                video.dataset.speedBound = 'true';
                video.addEventListener('ratechange', () => {
                    if (Math.abs(video.playbackRate - currentSpeed) > 0.01) {
                        currentSpeed = clampSpeed(video.playbackRate);
                        updateUI(currentSpeed);
                    }
                });
            }
        };

        const tick = () => {
            mountControlPanel();
            applySpeedToVideo();
        };

        let debounceTimer = null;
        const scheduleTick = () => {
            if (debounceTimer) return;
            debounceTimer = setTimeout(() => {
                debounceTimer = null;
                tick();
            }, 200);
        };

        tick();
        setInterval(tick, 1000);

        const observer = new MutationObserver(scheduleTick);
        observer.observe(document.documentElement, { childList: true, subtree: true });

        document.addEventListener('yt-navigate-finish', () => {
            setTimeout(tick, 300);
        });
    };

    const registerMenu = () => {
        if (typeof GM_registerMenuCommand !== 'function') {
            WARN('GM_registerMenuCommand 不可用');
            return;
        }
        GM_registerMenuCommand(
            `${rememberSpeed ? '✅' : '❌'} 记忆播放速度开关`,
            () => {
                rememberSpeed = !rememberSpeed;
                GM_setValue(STORAGE_KEY_REMEMBER, rememberSpeed);
                alert(`倍速记忆功能已${rememberSpeed ? '开启' : '关闭'}`);
            }
        );
    };

    const init = () => {
        injectStyles();
        observeVideo();
        registerMenu();
        LOG('init 完成');
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
