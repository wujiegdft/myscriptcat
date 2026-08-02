// ==UserScript==
// @name YouTube 快捷播放速度控制器
// @namespace https://scriptcat.org/
// @version 1.0.4
// @description 为 YouTube 播放器添加极速切换倍速按钮控制面板，支持自定义 0.1x-16.0x 倍速调节及倍速记忆功能。
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

    LOG('脚本开始执行', {
        href: location.href,
        readyState: document.readyState,
        GM_getValue: typeof GM_getValue,
        GM_setValue: typeof GM_setValue,
        GM_registerMenuCommand: typeof GM_registerMenuCommand,
    });

    // 默认可选配置
    const PRESETS = [0.5, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];
    const STORAGE_KEY_SPEED = 'yt_custom_speed';
    const STORAGE_KEY_REMEMBER = 'yt_remember_speed';

    let rememberSpeed = true;
    let currentSpeed = 1.0;
    let toastTimeout = null;
    let mountAttempt = 0;
    let lastMountFailReason = '';

    try {
        rememberSpeed = GM_getValue(STORAGE_KEY_REMEMBER, true);
        currentSpeed = GM_getValue(STORAGE_KEY_SPEED, 1.0);
        LOG('读取存储成功', { rememberSpeed, currentSpeed });
    } catch (e) {
        ERR('读取 GM 存储失败，使用默认值', e);
    }

    // 注入自定义 CSS
    const injectStyles = () => {
        if (document.getElementById('yt-speed-controller-styles')) {
            LOG('CSS 已存在，跳过注入');
            return;
        }
        const style = document.createElement('style');
        style.id = 'yt-speed-controller-styles';
        style.textContent = `
            /* 播放器控制栏按钮组 */
            .yt-speed-control-wrapper {
                display: inline-flex;
                align-items: center;
                position: relative;
                height: 100%;
                margin-right: 8px;
                vertical-align: top;
                font-family: "YouTube Noto", Roboto, Arial, sans-serif;
                user-select: none;
            }

            .yt-speed-btn-current {
                background: rgba(255, 255, 255, 0.12);
                color: #fff;
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 14px;
                padding: 2px 10px;
                font-size: 12.5px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                gap: 4px;
                outline: none;
                height: 28px;
                line-height: 24px;
            }

            .yt-speed-btn-current:hover {
                background: rgba(255, 255, 255, 0.25);
                border-color: rgba(255, 255, 255, 0.4);
                transform: scale(1.03);
            }

            .yt-speed-btn-current:active {
                transform: scale(0.97);
            }

            /* 快速倍速弹出面板 */
            .yt-speed-panel {
                position: absolute;
                bottom: 48px;
                left: 50%;
                transform: translateX(-50%) translateY(10px);
                background: rgba(15, 15, 15, 0.92);
                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-radius: 12px;
                padding: 10px 12px;
                display: flex;
                flex-direction: column;
                gap: 8px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
                opacity: 0;
                visibility: hidden;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                z-index: 9999;
                min-width: 170px;
            }

            .yt-speed-control-wrapper:hover .yt-speed-panel,
            .yt-speed-panel.show {
                opacity: 1;
                visibility: visible;
                transform: translateX(-50%) translateY(0);
            }

            .yt-speed-presets-grid {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 6px;
            }

            .yt-speed-preset-chip {
                background: rgba(255, 255, 255, 0.08);
                color: #e0e0e0;
                border: 1px solid transparent;
                border-radius: 6px;
                padding: 4px 0;
                font-size: 11.5px;
                font-weight: 500;
                text-align: center;
                cursor: pointer;
                transition: all 0.15s ease;
            }

            .yt-speed-preset-chip:hover {
                background: #ff0000;
                color: #fff;
                font-weight: 600;
            }

            .yt-speed-preset-chip.active {
                background: #ff0000;
                color: #fff;
                font-weight: bold;
                box-shadow: 0 0 8px rgba(255, 0, 0, 0.5);
            }

            /* 自定义输入框与步进微调器 */
            .yt-speed-custom-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                background: rgba(255, 255, 255, 0.05);
                padding: 4px 8px;
                border-radius: 6px;
                margin-top: 2px;
            }

            .yt-speed-custom-label {
                font-size: 11px;
                color: #aaa;
            }

            .yt-speed-custom-input-wrap {
                display: flex;
                align-items: center;
                gap: 4px;
            }

            .yt-speed-custom-input {
                width: 45px;
                background: rgba(0, 0, 0, 0.4);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 4px;
                color: #fff;
                font-size: 11.5px;
                text-align: center;
                padding: 2px 0;
                outline: none;
            }

            .yt-speed-custom-input:focus {
                border-color: #ff0000;
            }

            /* Toast 浮动提示 */
            .yt-speed-toast {
                position: absolute;
                top: 20px;
                right: 20px;
                background: rgba(0, 0, 0, 0.8);
                backdrop-filter: blur(8px);
                border: 1px solid rgba(255, 255, 255, 0.2);
                color: #fff;
                padding: 8px 16px;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 600;
                pointer-events: none;
                opacity: 0;
                transform: translateY(-10px);
                transition: all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                z-index: 9999;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .yt-speed-toast.show {
                opacity: 1;
                transform: translateY(0);
            }

            .yt-speed-toast-icon {
                color: #ff0000;
                font-size: 16px;
            }
        `;
        document.head.appendChild(style);
        LOG('CSS 已注入', { head: !!document.head, styleConnected: style.isConnected });
    };

    // 获取当前播放器中的 video 元素
    const getVideo = () => document.querySelector('video.html5-main-video') || document.querySelector('video');

    // 显示 Toast 视觉提示
    const showToast = (speed) => {
        const player = document.querySelector('.html5-video-player');
        if (!player) return;

        let toast = player.querySelector('.yt-speed-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'yt-speed-toast';

            const icon = document.createElement('span');
            icon.className = 'yt-speed-toast-icon';
            icon.textContent = '⚡';

            const text = document.createElement('span');
            text.className = 'yt-speed-toast-text';

            toast.appendChild(icon);
            toast.appendChild(text);
            player.appendChild(toast);
        }

        const textEl = toast.querySelector('.yt-speed-toast-text');
        textEl.textContent = `播放速度: ${speed.toFixed(2).replace(/\.00$/, '')}x`;

        toast.classList.add('show');
        if (toastTimeout) clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 1200);
    };

    // 设置播放速度主函数
    const setSpeed = (newSpeed, notify = true) => {
        const speed = Math.max(0.1, Math.min(16.0, parseFloat(newSpeed.toFixed(2))));
        currentSpeed = speed;

        const video = getVideo();
        if (video) {
            video.playbackRate = speed;
        }

        if (rememberSpeed) {
            GM_setValue(STORAGE_KEY_SPEED, speed);
        }

        updateUI(speed);
        if (notify) showToast(speed);
    };

    // 更新界面按钮状态
    const updateUI = (speed) => {
        const btnText = document.querySelector('.yt-speed-btn-text');
        if (btnText) {
            btnText.textContent = `${speed.toFixed(2).replace(/\.00$/, '')}x`;
        }

        const chips = document.querySelectorAll('.yt-speed-preset-chip');
        chips.forEach(chip => {
            const val = parseFloat(chip.dataset.speed);
            chip.classList.toggle('active', Math.abs(val - speed) < 0.01);
        });

        const input = document.querySelector('.yt-speed-custom-input');
        if (input && document.activeElement !== input) {
            input.value = speed;
        }
    };

    // 探测页面上可能的控件相关节点
    const probePlayerDom = () => {
        const selectors = [
            '#movie_player',
            '.html5-video-player',
            '.ytp-chrome-bottom',
            '.ytp-chrome-controls',
            '.ytp-right-controls',
            '.ytp-right-controls-left',
            '.ytp-right-controls-right',
            '.ytp-left-controls',
            '.ytp-settings-button',
            'video.html5-main-video',
            'video',
            '#yt-speed-control-wrapper',
        ];
        const result = {};
        selectors.forEach((sel) => {
            const els = document.querySelectorAll(sel);
            result[sel] = els.length;
        });
        return result;
    };

    // 获取右侧控件容器（兼容新旧 YouTube UI）
    const getRightControls = () => {
        const player = document.querySelector('#movie_player') || document.querySelector('.html5-video-player');
        const root = player || document;
        const candidates = [
            ['.ytp-right-controls-right', root.querySelector('.ytp-right-controls-right')],
            ['.ytp-right-controls', root.querySelector('.ytp-right-controls')],
            ['doc .ytp-right-controls-right', document.querySelector('.ytp-right-controls-right')],
            ['doc .ytp-right-controls', document.querySelector('.ytp-right-controls')],
        ];

        for (const [name, el] of candidates) {
            if (el) {
                LOG('找到右侧控件容器', {
                    via: name,
                    hasPlayer: !!player,
                    className: el.className,
                    childCount: el.children.length,
                });
                return el;
            }
        }
        return null;
    };

    // 构建并注入控制面板 DOM
    const mountControlPanel = () => {
        mountAttempt += 1;
        const attempt = mountAttempt;

        try {
            const existing = document.getElementById('yt-speed-control-wrapper');
            if (existing) {
                if (existing.isConnected) {
                    if (attempt <= 3 || attempt % 10 === 0) {
                        LOG('控件已存在且仍在 DOM，跳过挂载', {
                            attempt,
                            parentClass: existing.parentElement && existing.parentElement.className,
                        });
                    }
                    return;
                }
                WARN('控件存在但已脱离 DOM，移除后重建', { attempt });
                existing.remove();
            }

            const rightControls = getRightControls();
            if (!rightControls) {
                const reason = 'no-right-controls';
                if (reason !== lastMountFailReason || attempt <= 5 || attempt % 10 === 0) {
                    lastMountFailReason = reason;
                    WARN('未找到右侧控件容器，挂载失败', {
                        attempt,
                        href: location.href,
                        pathname: location.pathname,
                        probe: probePlayerDom(),
                    });
                }
                return;
            }

            const wrapper = document.createElement('div');
            wrapper.id = 'yt-speed-control-wrapper';
            wrapper.className = 'yt-speed-control-wrapper';

            const btn = document.createElement('button');
            btn.className = 'yt-speed-btn-current';
            btn.title = '快捷切换播放速度';
            btn.appendChild(document.createTextNode('⚡ '));

            const btnText = document.createElement('span');
            btnText.className = 'yt-speed-btn-text';
            btnText.textContent = `${currentSpeed.toFixed(2).replace(/\.00$/, '')}x`;
            btn.appendChild(btnText);

            const panel = document.createElement('div');
            panel.className = 'yt-speed-panel';

            const grid = document.createElement('div');
            grid.className = 'yt-speed-presets-grid';
            PRESETS.forEach((s) => {
                const chip = document.createElement('div');
                chip.className = 'yt-speed-preset-chip';
                if (Math.abs(s - currentSpeed) < 0.01) chip.classList.add('active');
                chip.dataset.speed = String(s);
                chip.textContent = `${s}x`;
                grid.appendChild(chip);
            });

            const customRow = document.createElement('div');
            customRow.className = 'yt-speed-custom-row';

            const customLabel = document.createElement('span');
            customLabel.className = 'yt-speed-custom-label';
            customLabel.textContent = '自定义倍速';

            const inputWrap = document.createElement('div');
            inputWrap.className = 'yt-speed-custom-input-wrap';

            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'yt-speed-custom-input';
            input.step = '0.05';
            input.min = '0.1';
            input.max = '16';
            input.value = String(currentSpeed);

            const unit = document.createElement('span');
            unit.style.fontSize = '11px';
            unit.style.color = '#aaa';
            unit.textContent = 'x';

            inputWrap.appendChild(input);
            inputWrap.appendChild(unit);
            customRow.appendChild(customLabel);
            customRow.appendChild(inputWrap);
            panel.appendChild(grid);
            panel.appendChild(customRow);
            wrapper.appendChild(btn);
            wrapper.appendChild(panel);

            const settingsBtn = rightControls.querySelector('.ytp-settings-button');
            if (settingsBtn) {
                rightControls.insertBefore(wrapper, settingsBtn);
                LOG('已插入到 settings 按钮前', { attempt });
            } else {
                rightControls.insertBefore(wrapper, rightControls.firstChild);
                WARN('未找到 settings 按钮，插入到容器开头', {
                    attempt,
                    childCount: rightControls.children.length,
                    className: rightControls.className,
                });
            }

            const rect = wrapper.getBoundingClientRect();
            const style = getComputedStyle(wrapper);
            LOG('挂载完成，检查可见性', {
                attempt,
                isConnected: wrapper.isConnected,
                parentClass: wrapper.parentElement && wrapper.parentElement.className,
                rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
                display: style.display,
                visibility: style.visibility,
                opacity: style.opacity,
                zIndex: style.zIndex,
                offsetParent: !!wrapper.offsetParent,
            });

            wrapper.querySelectorAll('.yt-speed-preset-chip').forEach(chip => {
                chip.addEventListener('click', (e) => {
                    e.stopPropagation();
                    LOG('点击预设', chip.dataset.speed);
                    setSpeed(parseFloat(chip.dataset.speed));
                });
            });

            input.addEventListener('change', (e) => {
                const val = parseFloat(e.target.value);
                LOG('自定义输入 change', val);
                if (!isNaN(val)) setSpeed(val);
            });
            input.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                    const val = parseFloat(e.target.value);
                    LOG('自定义输入 Enter', val);
                    if (!isNaN(val)) setSpeed(val);
                    input.blur();
                }
            });

            wrapper.addEventListener('wheel', (e) => {
                e.preventDefault();
                const delta = e.deltaY < 0 ? 0.1 : -0.1;
                setSpeed(currentSpeed + delta);
            }, { passive: false });

            lastMountFailReason = '';
        } catch (e) {
            ERR('mountControlPanel 异常', e);
        }
    };

    // 监听视频变动与页面导航 (YouTube SPA 支持)
    const observeVideo = () => {
        LOG('开始 observeVideo');

        const applySpeedToVideo = () => {
            const video = getVideo();
            if (!video) {
                if (mountAttempt <= 5 || mountAttempt % 10 === 0) {
                    WARN('未找到 video 元素', { attempt: mountAttempt, probe: probePlayerDom() });
                }
                return;
            }
            if (rememberSpeed && Math.abs(video.playbackRate - currentSpeed) > 0.01) {
                LOG('同步 playbackRate', { from: video.playbackRate, to: currentSpeed });
                video.playbackRate = currentSpeed;
            }

            if (!video.dataset.speedBound) {
                video.dataset.speedBound = 'true';
                LOG('绑定 ratechange 监听');
                video.addEventListener('ratechange', () => {
                    if (Math.abs(video.playbackRate - currentSpeed) > 0.01) {
                        currentSpeed = video.playbackRate;
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
        LOG('已启动 1s 轮询');

        const observer = new MutationObserver(scheduleTick);
        observer.observe(document.documentElement, { childList: true, subtree: true });
        LOG('已启动 MutationObserver');

        document.addEventListener('yt-navigate-finish', () => {
            LOG('收到 yt-navigate-finish', location.href);
            setTimeout(tick, 300);
        });
    };

    // 注册 ScriptCat GM 菜单
    const registerMenu = () => {
        if (typeof GM_registerMenuCommand === 'function') {
            GM_registerMenuCommand(
                `${rememberSpeed ? '✅' : '❌'} 记忆播放速度开关`,
                () => {
                    rememberSpeed = !rememberSpeed;
                    GM_setValue(STORAGE_KEY_REMEMBER, rememberSpeed);
                    alert(`倍速记忆功能已${rememberSpeed ? '开启' : '关闭'}`);
                }
            );
            LOG('菜单已注册');
        } else {
            WARN('GM_registerMenuCommand 不可用');
        }
    };

    // 初始化脚本
    const init = () => {
        LOG('init 开始', { readyState: document.readyState, href: location.href });
        try {
            injectStyles();
            observeVideo();
            registerMenu();
            LOG('init 完成');
        } catch (e) {
            ERR('init 异常', e);
        }
    };

    try {
        if (document.readyState === 'loading') {
            LOG('等待 DOMContentLoaded');
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    } catch (e) {
        ERR('脚本顶层异常', e);
    }

})();
