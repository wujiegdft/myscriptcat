// ==UserScript==
// @name         Reddit to DeepSeek Post Summarizer & Auto-Filler
// @namespace    https://scriptcat.org/
// @version      1.5.0
// @description  提取 Reddit 帖子 Prompt 并自动同步/一键发送至 DeepSeek Chat
// @author       Antigravity
// @match        https://www.reddit.com/*
// @match        https://chat.deepseek.com/*
// @grant        GM_setClipboard
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_openInTab
// ==/UserScript==

(function () {
    'use strict';

    /**
     * AI Agent / 开发者维护指南:
     * 1. DeepSeek 使用混淆 Class（如 `_27c9245`, `_52c986b`），版本更新后混淆类名极易失效。
     * 2. 定位输入框与发送按钮时，请优先依靠语义化属性（如 role, placeholder, type, tag）进行 fallback。
     * 3. DeepSeek 基于 React 开发，直接修改 textarea.value 无法触发 React 状态更新，必须调用原生 Setter 并派发 input/change 事件。
     */

    // 优化后的提示词：去除 Reddit 提及，明确要求禁止联网搜索
    const PROMPT_PREFIX = "请帮我总结以下文章的核心内容与主要观点。注意：无需进行联网搜索，请直接根据以下提供的完整上下文内容进行总结：\n\n";

    // 清理文本格式（去除连续空白行）
    function cleanText(text) {
        if (!text) return '';
        return text
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .join('\n\n');
    }

    /**
     * Agent 提示: 针对 React 受控组件（Controlled Component）的输入框赋值处理
     * 直接 assignment 无法触发内部 state，需绕过 React 重写的 setter。
     */
    function fillDeepSeekTextarea(text) {
        // Fallback 策略: 混淆类名 -> placeholder 特征 -> name 属性 -> 通用 textarea
        const textarea = document.querySelector(
            'textarea._27c9245, textarea[placeholder*="DeepSeek"], textarea[name="search"], textarea'
        );
        if (!textarea) return false;

        textarea.focus();
        // 原生 Setter 调用，强制更新 DOM 底层 value
        const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
        valueSetter.call(textarea, text);

        // 派发事件触发 React 的 onChange / onInput 监听
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }

    // ==================== DeepSeek 页面逻辑 ====================
    if (location.host === 'chat.deepseek.com') {
        function checkAndFill() {
            const pendingPrompt = GM_getValue('pending_deepseek_prompt', '');
            if (pendingPrompt) {
                const success = fillDeepSeekTextarea(pendingPrompt);
                if (success) {
                    // 填入成功后即刻清除全局暂存，防止刷新重复触发
                    GM_setValue('pending_deepseek_prompt', '');

                    /**
                     * Agent 提示: 发送按钮定位 Fallback 策略
                     * 1. 语义化定位: role="button" 且带有 ds-button--primary 且未处于 disabled 状态
                     * 2. Class fallback: div[role="button"]._52c986b
                     */
                    setTimeout(() => {
                        const sendBtn = document.querySelector('div[role="button"].ds-button--primary:not(.ds-button--disabled)')
                            || document.querySelector('div[role="button"]._52c986b');

                        if (sendBtn) {
                            sendBtn.click();
                        }
                    }, 300);
                }
            }
        }

        const observer = new MutationObserver(() => checkAndFill());
        observer.observe(document.body, { childList: true, subtree: true });
        checkAndFill();
        return;
    }

    // ==================== Reddit 页面逻辑 ====================
    /**
     * Agent 提示: Reddit 使用 Web Components (shreddit-post / shreddit-post-text-body)。
     * innerText 可直接穿透 Light DOM 提取文本。
     */
    function getPostContent(textBodyEl) {
        const postEl = textBodyEl.closest('shreddit-post') || document;

        const titleEl = postEl.querySelector('h1[slot="title"]')
            || postEl.querySelector('h1')
            || postEl.querySelector('[data-post-click-location="title"]');

        const titleText = cleanText(titleEl ? titleEl.innerText : '');
        const bodyText = cleanText(textBodyEl ? textBodyEl.innerText : '');

        if (!titleText && !bodyText) return null;

        let content = PROMPT_PREFIX;
        if (titleText) content += `【标题】\n${titleText}\n\n`;
        if (bodyText) content += `【正文】\n${bodyText}`;

        return content;
    }

    function injectButtons() {
        const textBodyElements = document.querySelectorAll('shreddit-post-text-body, [slot="text-body"]');

        textBodyElements.forEach(textBodyEl => {
            if (textBodyEl.dataset.hasPromptBtn) return;
            textBodyEl.dataset.hasPromptBtn = 'true';

            const btnContainer = document.createElement('div');
            btnContainer.style.cssText = `
                margin: 8px 0;
                display: flex;
                align-items: center;
                gap: 8px;
            `;

            // 1. 复制按钮
            const copyBtn = document.createElement('button');
            copyBtn.innerText = '🤖 复制 Prompt';
            copyBtn.style.cssText = `
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 6px 14px;
                height: 28px;
                line-height: 1;
                box-sizing: border-box;
                background-color: #ff4500;
                color: #ffffff;
                border: none;
                border-radius: 14px;
                font-weight: 600;
                font-size: 12px;
                font-family: system-ui, -apple-system, sans-serif;
                cursor: pointer;
                box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
                transition: transform 0.15s, background-color 0.15s;
            `;

            copyBtn.onclick = (e) => {
                e.stopPropagation();
                const promptText = getPostContent(textBodyEl);
                if (!promptText) return alert('未找到帖子内容');

                if (typeof GM_setClipboard !== 'undefined') {
                    GM_setClipboard(promptText, 'text');
                } else {
                    navigator.clipboard.writeText(promptText);
                }

                copyBtn.innerText = '✅ 已复制';
                copyBtn.style.backgroundColor = '#28a745';
                setTimeout(() => {
                    copyBtn.innerText = '🤖 复制 Prompt';
                    copyBtn.style.backgroundColor = '#ff4500';
                }, 2000);
            };

            // 2. 发送到 DeepSeek 按钮
            const dsBtn = document.createElement('button');
            dsBtn.innerText = '🚀 发送到 DeepSeek';
            dsBtn.style.cssText = `
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 6px 14px;
                height: 28px;
                line-height: 1;
                box-sizing: border-box;
                background-color: #4d6bfe;
                color: #ffffff;
                border: none;
                border-radius: 14px;
                font-weight: 600;
                font-size: 12px;
                font-family: system-ui, -apple-system, sans-serif;
                cursor: pointer;
                box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
                transition: transform 0.15s, background-color 0.15s;
            `;

            dsBtn.onclick = (e) => {
                e.stopPropagation();
                const promptText = getPostContent(textBodyEl);
                if (!promptText) return alert('未找到帖子内容');

                GM_setValue('pending_deepseek_prompt', promptText);
                if (typeof GM_openInTab !== 'undefined') {
                    GM_openInTab('https://chat.deepseek.com/', { active: true });
                } else {
                    window.open('https://chat.deepseek.com/', '_blank');
                }
            };

            btnContainer.appendChild(copyBtn);
            btnContainer.appendChild(dsBtn);
            textBodyEl.parentNode.insertBefore(btnContainer, textBodyEl);
        });
    }

    const observer = new MutationObserver(() => injectButtons());
    observer.observe(document.body, { childList: true, subtree: true });
    injectButtons();
})();