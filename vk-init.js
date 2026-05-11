/**
 * VK Bridge с вашего домена (Netlify), без unpkg — на части мобильных сетей unpkg недоступен.
 * При ошибке — запасной jsDelivr.
 */
(function (w) {
    function sendInit() {
        if (w.vkBridge && typeof w.vkBridge.send === "function") {
            w.vkBridge.send("VKWebAppInit").catch(function () {});
        }
    }

    function load(src, onError) {
        var s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.onload = sendInit;
        if (onError) {
            s.onerror = onError;
        }
        w.document.head.appendChild(s);
    }

    var localVk;
    try {
        localVk = new URL("vendor/vk-bridge.min.js", document.baseURI).href;
    } catch (e1) {
        localVk = "vendor/vk-bridge.min.js";
    }

    load(localVk, function () {
        load("https://cdn.jsdelivr.net/npm/@vkontakte/vk-bridge@2.14.1/dist/browser.min.js", null);
    });
})(window);
