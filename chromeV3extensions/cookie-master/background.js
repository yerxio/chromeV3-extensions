/**
 * 根据 cookie 对象构建 URL，这是调用 chrome.cookies.remove/set 所必需的。
 * @param {chrome.cookies.Cookie} cookie
 * @returns {string}
 */
function getUrlFromCookie(cookie) {
  const protocol = cookie.secure ? 'https' : 'http';
  let domain = cookie.domain;
  // 移除开头的 "." (例如 .google.com -> google.com)
  if (domain.startsWith('.')) {
    domain = domain.substring(1);
  }
  return `${protocol}://${domain}${cookie.path}`;
}

/**
 * 处理 Cookie 变化的监听器
 * @param {chrome.cookies.CookieChangeInfo} changeInfo
 */
async function handleCookieChange(changeInfo) {
  // 从存储中获取我们的规则
  const { lockedCookies = {}, blacklistedCookies = [] } = await chrome.storage.local.get([
    'lockedCookies',
    'blacklistedCookies',
  ]);

  const cookie = changeInfo.cookie;
  const cookieName = cookie.name;

  // 1. 检查黑名单 (Blacklist) - 优先级最高
  if (blacklistedCookies.includes(cookieName)) {
    // 如果 Cookie 不是被删除的 (即它是被添加或修改的)，
    // 我们就立即将其删除。
    if (!changeInfo.removed) {
      chrome.cookies.remove({
        url: getUrlFromCookie(cookie),
        name: cookieName,
        storeId: cookie.storeId,
      });
      console.log(`[Cookie Master] 已拉黑并删除: ${cookieName}`);
    }
    return; // 已经被拉黑，无需执行锁定逻辑
  }

  // 2. 检查锁死 (Locking)
  if (lockedCookies.hasOwnProperty(cookieName)) {
    const lockedValue = lockedCookies[cookieName];

    // 如果 Cookie 值与锁定的值不同，或者它被删除了
    // 我们就立即将其设置回锁定的值
    if (cookie.value !== lockedValue || changeInfo.removed) {
      // 构造一个新的 cookie 对象来设置
      const newCookie = {
        url: getUrlFromCookie(cookie),
        name: cookieName,
        value: lockedValue,
        domain: cookie.domain,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        storeId: cookie.storeId,
        // expirationDate: (new Date().getTime() / 1000) + 365 * 24 * 60 * 60 // 可选：设置一个很长的过期时间
      };
      
      // 如果原始 cookie 有过期时间，我们也保留
      if (cookie.expirationDate) {
           newCookie.expirationDate = cookie.expirationDate;
      }

      chrome.cookies.set(newCookie, (setCookie) => {
        if (!setCookie) {
          console.error(`[Cookie Master] 锁定失败: ${cookieName}`, chrome.runtime.lastError);
        } else {
          console.log(`[Cookie Master] 已锁定并恢复: ${cookieName} -> ${lockedValue}`);
        }
      });
    }
  }
}

// 注册监听器
chrome.cookies.onChanged.addListener(handleCookieChange);