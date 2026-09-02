// ==UserScript==
// @name         闲鱼搜索按想要人数排序
// @namespace    https://github.com/wujiegdft/myscriptcat
// @version      1.2.0
// @description  在闲鱼(Goofish)搜索页添加"按想要人数排序"按钮，支持防抖自动重排、翻页后自动重排序
// @author       CyberOctopus88
// @match        https://www.goofish.com/search*
// @match        https://h5.m.goofish.com/search*
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  const SORT_LABEL = '🔥 按想要排序';
  const RESTORE_LABEL = '↩ 恢复默认';
  const DEBOUNCE_MS = 800;
  const POLL_INTERVAL_MS = 2000;

  let sorted = false;
  let originalOrder = [];
  let debounceTimer = null;
  let currentListEl = null;
  let pollTimer = null;

  function getWantCount(card) {
    const descEl = card.querySelector('[class*="price-desc"]');
    if (!descEl) return 0;
    const text = descEl.innerText || '';
    const match = text.match(/(\d+)\s*人\s*想要/);
    return match ? parseInt(match[1], 10) : 0;
  }

  function getCardList() {
    const list = document.querySelector('[class*="feeds-list-container"]');
    if (!list) return null;
    return { list, cards: Array.from(list.children) };
  }

  function isSorted() {
    const data = getCardList();
    if (!data || data.cards.length < 2) return false;
    for (let i = 1; i < data.cards.length; i++) {
      if (getWantCount(data.cards[i - 1]) < getWantCount(data.cards[i])) return false;
    }
    return true;
  }

  function sortCards() {
    const data = getCardList();
    if (!data) return;
    const { list, cards } = data;

    if (!sorted) return;

    if (currentListEl !== list) {
      currentListEl = list;
      originalOrder = cards.slice();
    }

    cards.sort((a, b) => getWantCount(b) - getWantCount(a));

    list.style.display = 'none';
    for (const card of cards) {
      list.appendChild(card);
    }
    list.style.display = '';
  }

  function restoreDefault() {
    const data = getCardList();
    if (!data) return;
    const { list } = data;

    if (currentListEl !== list) {
      currentListEl = list;
      return;
    }

    list.style.display = 'none';
    for (const card of originalOrder) {
      if (card.parentElement === list) list.appendChild(card);
    }
    list.style.display = '';
  }

  function toggleSort(btn) {
    if (!sorted) {
      const data = getCardList();
      if (!data) return;
      originalOrder = data.cards.slice();
      currentListEl = data.list;
      sorted = true;
      sortCards();
      btn.textContent = RESTORE_LABEL;
      btn.style.background = '#ff5000';
      btn.style.color = '#fff';
    } else {
      if (isSorted()) {
        sorted = false;
        restoreDefault();
        btn.textContent = SORT_LABEL;
        btn.style.background = '#f0f0f0';
        btn.style.color = '#333';
      } else {
        sortCards();
      }
    }
  }

  function createButton() {
    const filterBar = document.querySelector('[class*="search-filter-up-container"]');
    if (!filterBar) return null;
    if (document.getElementById('xianyu-sort-btn')) return null;

    const btn = document.createElement('button');
    btn.id = 'xianyu-sort-btn';
    btn.textContent = SORT_LABEL;
    btn.style.cssText = [
      'display: inline-flex',
      'align-items: center',
      'padding: 4px 12px',
      'margin-left: 8px',
      'border: 1px solid #ddd',
      'border-radius: 16px',
      'background: #f0f0f0',
      'color: #333',
      'font-size: 14px',
      'cursor: pointer',
      'white-space: nowrap',
      'height: 28px',
      'vertical-align: middle'
    ].join(';');

    btn.addEventListener('click', () => toggleSort(btn));
    filterBar.appendChild(btn);
    return btn;
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (!sorted) return;
      const data = getCardList();
      if (!data) return;
      if (currentListEl !== data.list) {
        sortCards();
        return;
      }
      if (!isSorted()) {
        sortCards();
      }
    }, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function init() {
    const btn = createButton();
    if (!btn) return;
    startPolling();
  }

  function waitForPage() {
    const list = document.querySelector('[class*="feeds-list-container"]');
    if (list && list.children.length > 0) {
      init();
    } else {
      setTimeout(waitForPage, 500);
    }
  }

  let lastUrl = location.href;
  const checkUrlChange = () => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      sorted = false;
      originalOrder = [];
      currentListEl = null;
      stopPolling();
      const btn = document.getElementById('xianyu-sort-btn');
      if (btn) btn.remove();
      setTimeout(waitForPage, 500);
    }
    requestAnimationFrame(checkUrlChange);
  };

  waitForPage();
  checkUrlChange();
})();
