/**
 * Загрузка API карт и script.js. Если api-maps «висит» без onload/onerror (часто на мобильном LTE),
 * по таймауту всё равно подключаем script.js — там запасной сценарий без карты.
 */
(function () {
    var mapsStarted = false;
    var YMAPS_WAIT_MS = 20000;

    function resolveUrl(rel) {
        try {
            return new URL(rel, document.baseURI).href;
        } catch (e) {
            return rel;
        }
    }

    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            var url = /^https?:\/\//i.test(src) ? src : resolveUrl(src);
            var s = document.createElement("script");
            s.src = url;
            s.async = false;
            s.onload = function () {
                resolve();
            };
            s.onerror = function () {
                reject(new Error("Failed to load: " + url));
            };
            document.head.appendChild(s);
        });
    }

    function loadScriptWithTimeout(src, ms) {
        return Promise.race([
            loadScript(src),
            new Promise(function (_, reject) {
                setTimeout(function () {
                    reject(new Error("timeout: " + src));
                }, ms);
            })
        ]);
    }

    function showMapBootstrapError() {
        var mapEl = document.getElementById("map");
        if (!mapEl) {
            return;
        }
        mapEl.classList.remove("map--pending");
        mapEl.removeAttribute("aria-busy");
        if (!mapEl.querySelector(".map-boot-error")) {
            mapEl.innerHTML =
                '<p class="map-boot-error" style="padding:16px;margin:0;text-align:center;color:#444;font-size:15px;">Не удалось загрузить страницу карты. Проверьте сеть или обновите страницу.</p>';
        }
    }

    var open = document.getElementById("openBuildingsPage");
    if (open) {
        open.addEventListener("click", function (e) {
            e.preventDefault();
            window.location.assign("buildings.html");
        });
    }

    function beginMapsAndApp() {
        if (mapsStarted) {
            return;
        }
        mapsStarted = true;
        var ymapsUrl = document.documentElement.getAttribute("data-ymaps");
        if (!ymapsUrl) {
            loadScript(resolveUrl("script.js")).catch(showMapBootstrapError);
            return;
        }
        loadScriptWithTimeout(ymapsUrl, YMAPS_WAIT_MS)
            .then(function () {
                return loadScript(resolveUrl("script.js"));
            })
            .catch(function () {
                return loadScript(resolveUrl("script.js"));
            })
            .catch(showMapBootstrapError);
    }

    setTimeout(beginMapsAndApp, 0);

    function onEarlyIntent(e) {
        var t = e.target;
        if (!t || typeof t.closest !== "function") {
            return;
        }
        if (
            t.closest("#startPoint") ||
            t.closest("#map") ||
            t.closest("#buildRoute") ||
            t.closest("#useGeolocation") ||
            t.closest("#endPoint")
        ) {
            document.removeEventListener("touchstart", onEarlyIntent, true);
            document.removeEventListener("click", onEarlyIntent, true);
            document.removeEventListener("focusin", onEarlyIntent, true);
            beginMapsAndApp();
        }
    }

    document.addEventListener("touchstart", onEarlyIntent, true);
    document.addEventListener("click", onEarlyIntent, true);
    document.addEventListener("focusin", onEarlyIntent, true);
})();
