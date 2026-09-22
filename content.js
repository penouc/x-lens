(() => {
  let states = new WeakMap(), generation = 0, running = false, scanTimer = null, configCache = null;
  let activePrompt = null, lastPromptAt = -Infinity;
  const promptedAccounts = new Set();
  let checked = 0, hits = 0, aiHits = 0, slopHits = 0, adHits = 0, marketingHits = 0, softAdHits = 0, normalHits = 0;
  const monitor = document.createElement('div');
  monitor.className = 'slope-monitor'; monitor.setAttribute('role', 'status');
  document.body.append(monitor);
  let lastReport = '';
  function report(text) {
    const next = 'X Lens · ' + text;
    if (next === lastReport) return;
    lastReport = next; monitor.textContent = next;
  }
  report('正在连接插件…');
  function isOwnContent(node, article) {
    if (node.closest('article') !== article) return false;
    // Timestamp anchors themselves have role=link; only inspect their containers.
    for (let parent = node.parentElement; parent && parent !== article; parent = parent.parentElement) {
      if (parent.getAttribute('data-testid') === 'quoteTweet') return false;
      if (parent.getAttribute('role') === 'link' && parent.tagName !== 'A') return false;
    }
    return true;
  }
  function read(article, allowEmpty = false) {
    const links = [...article.querySelectorAll('a[href*="/status/"]')].filter(a =>
      isOwnContent(a, article));
    const link = links.find(a => a.querySelector('time')) || links.find(a => /\/status\/\d+\/?$/.test(new URL(a.href, location.href).pathname));
    const match = link && new URL(link.href, location.href).pathname.match(/^\/([A-Za-z0-9_]+)\/status\/(\d+)/);
    const text = [...article.querySelectorAll('[data-testid="tweetText"]')]
      .find(el => isOwnContent(el, article))?.innerText?.trim() || '';
    if (!match || (!allowEmpty && (!text || text.length > 12000))) return null;
    return {handle: match[1], id: match[2], text, fingerprint: match[2] + ':' + text};
  }
  function visible(el) { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }
  function canPrompt(config, result, alreadyPrompted, busy, now, lastPrompt) {
    return config?.enabled === true && config?.autoBlockPrompt === true && result?.isSlop === true
      && !alreadyPrompted && !busy && now - lastPrompt >= 30000;
  }
  function closePrompt() { activePrompt?.remove(); activePrompt = null; }
  async function openBlockConfirmation(article, tweet, host) {
    if (!host.isConnected || !article.isConnected || read(article)?.fingerprint !== tweet.fingerprint) throw new Error('推文已离开页面，请重新找到该推文后操作。');
    if (document.querySelector('[role="menu"]')) throw new Error('请先关闭其他菜单后重试。');
    const caret = article.querySelector('[data-testid="caret"]');
    if (!caret) throw new Error('找不到推文菜单，请使用 X 菜单手动屏蔽。');
    const waitFor = async get => {
      for (let i=0;i<25;i++) {
        if (!host.isConnected || !article.isConnected || read(article)?.fingerprint !== tweet.fingerprint) throw new Error('操作已取消。');
        const found=get(); if(found) return found;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      throw new Error('找不到屏蔽选项，请使用 X 菜单手动屏蔽。');
    };
    caret.click();
    const item = await waitFor(()=>[...document.querySelectorAll('[role="menuitem"]')].find(el=>{
      const text=el.textContent.trim();
      return /^(Block\s|屏蔽\s*|封鎖\s*|封锁\s*)/i.test(text) && text.toLowerCase().includes('@'+tweet.handle.toLowerCase());
    }));
    item.click();
    await waitFor(()=>document.querySelector('[data-testid="confirmationSheetConfirm"]'));
    closePrompt(); // User alone confirms in X's native dialog.
  }
  function maybePrompt(article, tweet, result, config) {
    const handle=tweet.handle.toLowerCase();
    if (!canPrompt(config,result,promptedAccounts.has(handle),!!activePrompt,Date.now(),lastPromptAt)
      || document.hidden || !article.isConnected || !visible(article) || read(article)?.fingerprint !== tweet.fingerprint) return;
    const host=document.createElement('div');
    const root=host.attachShadow({mode:'closed'});
    root.innerHTML='<style>:host{all:initial;position:fixed;right:18px;bottom:18px;z-index:2147483646;color:#edf2f7;font:14px/1.6 system-ui,sans-serif}.box{box-sizing:border-box;width:min(340px,calc(100vw - 36px));padding:18px;border:1px solid #435149;border-radius:12px;background:#17212b;box-shadow:0 10px 40px #0005}strong{color:#c6f586}p{margin:9px 0}.note{color:#aab4bf;font-size:12px}button{border:0;border-radius:7px;padding:9px 12px;margin-right:6px;background:#c6f586;color:#17212b;cursor:pointer;font-weight:600}.dismiss{background:#303b46;color:white}.status{color:#ffad99}</style><section class="box" role="dialog" aria-label="X Lens 屏蔽提示"><strong>X Lens · slop / 垃圾</strong><p class="message"></p><p class="note">模型可能误判。点击后仍需在 X 的确认窗口完成屏蔽。可在插件设置中关闭自动提示。</p><button class="block">屏蔽账号…</button><button class="dismiss">暂不屏蔽</button><p class="status" role="status"></p></section>';
    root.querySelector('.message').textContent='@'+tweet.handle+' 的当前内容疑似 slop / 垃圾（'+Math.round(result.junk*100)+'%）。是否屏蔽这个账号？';
    root.querySelector('.dismiss').onclick=closePrompt;
    root.querySelector('.block').onclick=async()=>{
      root.querySelector('.block').disabled=true;
      try { await openBlockConfirmation(article,tweet,host); }
      catch(error) { root.querySelector('.status').textContent=error.message; root.querySelector('.block').disabled=false; }
    };
    host.addEventListener('keydown',event=>{if(event.key==='Escape')closePrompt();});
    document.body.append(host);activePrompt=host;promptedAccounts.add(handle);lastPromptAt=Date.now();
  }


  function placeBadge(article, badge) {
    const controls = [...article.querySelectorAll('button, [role="button"]')];
    const grok = controls.find(el =>
      /grok/i.test([el.getAttribute('aria-label'), el.getAttribute('data-testid'), el.getAttribute('title')].join(' '))
      && el.getBoundingClientRect().width > 0);
    const anchor = grok || article.querySelector('[data-testid="caret"]');
    badge.classList.toggle('slope-badge-anchored', !!anchor);
    if (anchor) {
      const rect = anchor.getBoundingClientRect(), outer = article.getBoundingClientRect();
      badge.style.setProperty('left', (rect.left - outer.left - article.clientLeft - 6) + 'px', 'important');
      badge.style.setProperty('top', (rect.top - outer.top - article.clientTop + rect.height / 2) + 'px', 'important');
    } else {
      badge.style.removeProperty('left'); badge.style.removeProperty('top');
    }
  }
  function mark(article, tweet, result) {
    const existing = article.querySelector('.slope-badge');
    if (existing) return;
    const badge = document.createElement('button'); badge.className = 'slope-badge'; badge.type = 'button';
    for (const [show, text, className] of [
      [result.isAI, 'AI', 'slop-ai'],
      [result.isSlop, 'slop / 垃圾', 'slop-junk'],
      [result.isAd, 'Ad / 广告', 'slop-ad'],
      [result.isMarketing, 'Marketing / 营销', 'slop-marketing'],
      [result.isSoftAd, 'Soft Ad / 软广', 'slop-soft-ad'],
      [result.isNormal, 'Normal / 正常', 'slop-normal'],
    ]) {
      if (!show) continue;
      const label = document.createElement('span'); label.className = className; label.textContent = text; badge.append(label);
    }
    badge.title = '疑似 AI ' + Math.round(result.ai*100) + '% · 垃圾 ' + Math.round(result.junk*100) + '% · 广告 ' + Math.round(result.ad*100) + '% · 营销 ' + Math.round(result.marketing*100) + '% · 软广 ' + Math.round(result.softAd*100) + '%；点击查看评分';
    badge.setAttribute('aria-label', badge.textContent + '，' + badge.title);
    badge.onclick = event => { event.preventDefault(); event.stopPropagation(); report(badge.title.replace('；点击查看评分', '')); };
    article.classList.add('slope-marked'); article.append(badge);
    placeBadge(article, badge);
  }
  async function scan() {
    if (running || document.hidden) return;
    running = true;
    const epoch = generation;
    try {
      const config = configCache || await chrome.runtime.sendMessage({type:'config'});
      if (!config?.error) configCache = config;
      if (epoch !== generation) return;
      if (config?.error) throw new Error(config.error);
      if (!config?.enabled || !config?.autoBlockPrompt) closePrompt();
      if (!config?.configured || !config.enabled) {
        report(!config?.configured ? '请填写 API Key 并保存' : '已暂停，请在设置中启用自动检测');
        return;
      }
      const articles = document.querySelectorAll('article[data-testid="tweet"]');
      if (!articles.length) report('已启用，等待推文加载…');
      let readable = 0, visibleCards = 0, visibleTextCards = 0, newClassifications = 0;
      for (const article of articles) {
        if (epoch !== generation) break;
        if (!visible(article)) continue;
        visibleCards++;
        if (article.querySelector('[data-testid="tweetText"]')) visibleTextCards++;
        const tweet = read(article); if (!tweet) continue;
        let state = states.get(article);
        if (state?.fingerprint !== tweet.fingerprint) { article.querySelector('.slope-badge')?.remove(); article.classList.remove('slope-marked'); state = null; }
        readable++;
        if (state?.result && !state.result.error && !state.result.skip) {
          mark(article, tweet, state.result);
          maybePrompt(article, tweet, state.result, config);
          continue;
        }
        if (state && Date.now() < state.retryAt) continue;
        if (newClassifications >= 3) continue;
        newClassifications++;
        report('正在检测… 已检查 ' + checked + ' 条 / 标记 ' + hits + ' 条');
        const result = await chrome.runtime.sendMessage({type:'classify', text:tweet.text});
        if (epoch !== generation || !article.isConnected || read(article)?.fingerprint !== tweet.fingerprint) continue;
        if (!result) throw new Error('后台未返回结果，请重新加载插件并刷新页面');
        states.set(article, {fingerprint:tweet.fingerprint, result, retryAt:result?.error || result?.skip ? Date.now()+60000 : Infinity});
        if (result.error || result.skip) { report(result.error || result.reason); break; }
        checked++; if (result.flagged) hits++; if (result.isAI) aiHits++; if (result.isSlop) slopHits++; if (result.isAd) adHits++; if (result.isMarketing) marketingHits++; if (result.isSoftAd) softAdHits++; if (result.isNormal) normalHits++;
        report('已检查 ' + checked + ' 条 · AI ' + aiHits + ' / 垃圾 ' + slopHits + ' / 广告 ' + adHits + ' / 营销 ' + marketingHits + ' / 软广 ' + softAdHits + ' / 正常 ' + normalHits);
        mark(article, tweet, result); maybePrompt(article, tweet, result, config);
      }
      if (articles.length && !readable) {
        if (visibleTextCards) report('发现文字，但未能识别推文链接；请刷新页面后重试');
        else if (visibleCards) report('当前可见内容没有文字正文；图片或视频暂不检测');
        else report('等待推文进入可见区域…');
      }
    } catch(error) { report(/context invalidated/i.test(error.message) ? '插件已更新，请刷新此页面' : '连接异常：' + error.message); }
    finally { running = false; scheduleScan(); }
  }
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message.type !== 'reset') return;
    checked = 0; hits = 0; aiHits = 0; slopHits = 0; adHits = 0; marketingHits = 0; softAdHits = 0; normalHits = 0; report('设置已更新，准备检测…');
    generation++; states = new WeakMap(); configCache = null; closePrompt();
    document.querySelectorAll('.slope-badge').forEach(el => el.remove());
    document.querySelectorAll('.slope-marked').forEach(el => el.classList.remove('slope-marked'));
    reply({ok:true});
    scan();
  });
  function scheduleScan(delay = 3500) {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, delay);
  }
  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      document.querySelectorAll('article.slope-marked').forEach(article => {
        const badge = article.querySelector('.slope-badge');
        if (badge) placeBadge(article, badge);
      });
    });
  });
  window.addEventListener('scroll', () => scheduleScan(400), {passive:true});
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleScan(100); });
  scheduleScan(0);
})();
