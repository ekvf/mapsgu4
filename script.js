var buildings =
    typeof BUILDINGS_CATALOG !== 'undefined'
        ? BUILDINGS_CATALOG.map(function (b) {
              return Object.assign({}, b);
          })
        : [];

let map;
let placemarks = [];
let buildingPlacemarkById = {};
let multiRoute = null;
let currentMarker = null;
let routeStartMarker = null;
let suggestView = null;
/** Последние точки маршрута [старт, финиш] — для оценки расстояния «по прямой», если API не отдал метры. */
let lastRouteReferencePoints = null;

const NEARBY_STRAIGHT_METERS = 200;
const VERY_NEARBY_METERS = 200;

function buildingAddressLine(b) {
    return b.addressDisplay || b.address;
}

// Функция показа ошибки
function showError(message) {
    const errorDiv = document.getElementById('addressError');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    errorDiv.style.opacity = '1';

    setTimeout(function () {
        errorDiv.style.opacity = '0';
        setTimeout(function () {
            errorDiv.style.display = 'none';
        }, 300);
    }, 5000);
}

// Функция скрытия ошибки
function hideError() {
    const errorDiv = document.getElementById('addressError');
    errorDiv.style.opacity = '0';
    setTimeout(function () {
        errorDiv.style.display = 'none';
    }, 300);
}

// Инициализация карты (скрипт API подключается в конце body — страница успевает отрисоваться)
function initYandexMapApp() {
    ymaps.ready(function () {
    var mapHost = document.getElementById('map');
    if (mapHost) {
        mapHost.classList.remove('map--pending');
        mapHost.removeAttribute('aria-busy');
    }

    map = new ymaps.Map('map', {
        center: [61.6688, 50.8354],
        zoom: 13,
        controls: ['zoomControl', 'fullscreenControl', 'routeButtonControl']
    });

    let geocodePromises = buildings.map(building =>
        ymaps.geocode(building.address, { results: 1 }).then(function (res) {
            const firstGeoObject = res.geoObjects.get(0);
            if (firstGeoObject) {
                building.coordinates = firstGeoObject.geometry.getCoordinates();

                const placemark = new ymaps.Placemark(
                    building.coordinates,
                    {
                        balloonContentHeader: building.name,
                        balloonContentBody:
                            '<strong>Адрес:</strong> ' +
                            escapeHtml(buildingAddressLine(building)) +
                            '<br><strong>Краткое описание:</strong> ' +
                            escapeHtml(building.info.description),
                        balloonContentFooter:
                            '<a href="#" class="show-full-info" data-id="' +
                            building.id +
                            '">Открыть краткую справку</a>',
                        hintContent: building.name
                    },
                    {
                        preset: 'islands#redCircleDotIconWithCaption',
                        iconColor: '#ff5050'
                    }
                );

                placemark.events.add('click', function () {
                    showBuildingInfo(building);
                });

                map.geoObjects.add(placemark);
                placemarks.push(placemark);
                buildingPlacemarkById[building.id] = placemark;
                building.placemark = placemark;

                return building;
            }
            console.warn('Не удалось найти адрес:', building.address);
            return null;
        })
    );

    Promise.all(geocodePromises).then(function (results) {
        const validBuildings = results.filter(b => b !== null);

        if (validBuildings.length > 0) {
            const mainBuilding = validBuildings.find(b => b.id === 1) || validBuildings[0];
            if (mainBuilding && mainBuilding.coordinates) {
                map.setCenter(mainBuilding.coordinates, 14);
            }

            if (validBuildings.length > 1) {
                const bounds = validBuildings
                    .filter(b => b.coordinates)
                    .map(b => b.coordinates);

                if (bounds.length > 0) {
                    map.setBounds(ymaps.util.bounds.fromPoints(bounds), {
                        checkZoomRange: true,
                        duration: 300
                    });
                }
            }
        }
    });

    const endPointSelect = document.getElementById('endPoint');
    buildings.forEach(building => {
        const option = document.createElement('option');
        option.value = building.id;
        option.textContent = building.name;
        endPointSelect.appendChild(option);
    });

    document.addEventListener('click', function (e) {
        if (e.target && e.target.classList.contains('show-full-info')) {
            e.preventDefault();
            const buildingId = parseInt(e.target.getAttribute('data-id'), 10);
            const building = buildings.find(b => b.id === buildingId);
            if (building) {
                showBuildingInfo(building);
            }
        }
    });

    const startPointInput = document.getElementById('startPoint');
    suggestView = new ymaps.SuggestView('startPoint', {
        provider: {
            suggest: function (request, options) {
                return ymaps.suggest(request, options).then(function (items) {
                    return items.map(function (item) {
                        return {
                            displayName: item.displayName,
                            value: item.value
                        };
                    });
                });
            }
        }
    });

    suggestView.events.add('select', function (e) {
        const selectedAddress = e.get('item').value;
        startPointInput.value = selectedAddress;
        hideError();
    });

    startPointInput.addEventListener('input', function () {
        hideError();
        if (this.value === '') {
            if (currentMarker) {
                map.geoObjects.remove(currentMarker);
                currentMarker = null;
            }
        }
    });
    });
}

function runMapsMissingFallback() {
    var mapEl = document.getElementById('map');
    if (mapEl) {
        mapEl.classList.remove('map--pending');
        mapEl.removeAttribute('aria-busy');
    }
    if (mapEl && !mapEl.querySelector('.map-load-error')) {
        mapEl.innerHTML =
            '<p class="map-load-error" style="padding:20px;margin:0;text-align:center;color:#444;font-size:15px;">Не удалось загрузить Яндекс.Карты. Проверьте сеть или откройте страницу по Wi‑Fi.</p>';
    }
    showError('Карты не загрузились — маршрут на карте недоступен. Выберите корпус ниже или откройте страницу «Информация по корпусам».');
    var endPointSelect = document.getElementById('endPoint');
    if (endPointSelect && endPointSelect.options.length <= 1) {
        buildings.forEach(function (building) {
            var option = document.createElement('option');
            option.value = building.id;
            option.textContent = building.name;
            endPointSelect.appendChild(option);
        });
    }
}

if (typeof ymaps !== 'undefined' && ymaps && typeof ymaps.ready === 'function') {
    initYandexMapApp();
} else {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runMapsMissingFallback);
    } else {
        runMapsMissingFallback();
    }
}

function escapeHtml(text) {
    if (text === undefined || text === null) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getRoutingMode() {
    return 'masstransit';
}

function routingModeRu(mode) {
    switch (mode) {
        case 'pedestrian':
            return 'Пешком';
        case 'masstransit':
            return 'На общественном транспорте';
        case 'auto':
            return 'На машине';
        default:
            return 'Маршрут';
    }
}

function hideRouteSummary() {
    const el = document.getElementById('routeSummary');
    if (!el) return;
    el.hidden = true;
    el.innerHTML = '';
    el.className = 'route-summary';
}

function showRouteSummaryLoading() {
    const el = document.getElementById('routeSummary');
    if (!el) return;
    el.hidden = false;
    el.className = 'route-summary route-summary--loading';
    el.innerHTML =
        '<h4>' +
        escapeHtml(routingModeRu(getRoutingMode())) +
        '</h4><p>Строим маршрут…</p>';
}

function transportTypeRu(t) {
    if (!t) return '';
    const m = {
        bus: 'автобус',
        trolleybus: 'троллейбус',
        tramway: 'трамвай',
        tram: 'трамвай',
        subway: 'метро',
        minibus: 'маршрутка',
        train: 'поезд',
        suburban: 'электричка',
        cable: 'канатная дорога'
    };
    const k = String(t).toLowerCase();
    return m[k] || String(t);
}

function haversineDistanceMeters(pointA, pointB) {
    if (!pointA || !pointB || pointA.length < 2 || pointB.length < 2) {
        return null;
    }
    const R = 6371000;
    const toRad = function (deg) {
        return (deg * Math.PI) / 400;
    };
    const dLat = toRad(pointB[0] - pointA[0]);
    const dLon = toRad(pointB[1] - pointA[1]);
    const lat1 = toRad(pointA[0]);
    const lat2 = toRad(pointB[0]);
    const h =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Расстояние маршрута в метрах из модели Яндекс.Карт или «по прямой» между точками. */
function resolveRouteDistanceMeters(activeRoute) {
    try {
        const dist = activeRoute.properties.get('distance');
        if (dist && typeof dist.value === 'number' && dist.value >= 0) {
            return dist.value;
        }
    } catch (e) {
        /* ignore */
    }
    if (
        lastRouteReferencePoints &&
        lastRouteReferencePoints.length === 2 &&
        lastRouteReferencePoints[0] &&
        lastRouteReferencePoints[1]
    ) {
        const air = haversineDistanceMeters(lastRouteReferencePoints[0], lastRouteReferencePoints[1]);
        return air != null ? air : null;
    }
    return null;
}

function masstransitRouteUsesPublicTransport(activeRoute) {
    let found = false;
    try {
        activeRoute.getPaths().each(function (path) {
            path.getSegments().each(function (segment) {
                const transports = segment.properties.get('transports');
                if (transports && transports.length > 0) {
                    found = true;
                }
            });
        });
    } catch (e) {
        /* ignore */
    }
    return found;
}

function buildWalkPreferenceTipHtml(activeRoute, routingMode) {
    const m = resolveRouteDistanceMeters(activeRoute); // теперь корректно
    const transitButNoVehicle =
        routingMode === 'masstransit' && !masstransitRouteUsesPublicTransport(activeRoute);
    const isNearby = m !== null && m <= NEARBY_STRAIGHT_METERS; // 200 м

    if (routingMode === 'masstransit') {
        // Случай 1: транспорта нет, и расстояние большое ( >200 м )
        if (transitButNoVehicle && !isNearby) {
            return (
                '<div class="route-summary-tip route-summary-tip--warning">' +
                '<strong>⚠️ Общественный транспорт не найден</strong><br>' +
                'Яндекс.Карты не смогли проложить маршрут с автобусами/троллейбусами между этими точками. ' +
                'Показан пешеходный маршрут (<strong>' + (m ? Math.round(m) + ' м' : 'дальний') + '</strong>). ' +
                'Попробуйте режимы «На машине» или «Пешком».' +
                '</div>'
            );
        }
        // Случай 2: транспорта нет, но расстояние маленькое (≤200 м)
        if (transitButNoVehicle && isNearby) {
            return (
                '<div class="route-summary-tip">' +
                '<strong>🚶 Совет:</strong> до объекта очень близко (' + Math.round(m) + ' м) – ' +
                'удобнее дойти пешком, чем ждать транспорт.' +
                '</div>'
            );
        }
        // Случай 3: транспорт есть, но расстояние маленькое (≤200 м)
        if (!transitButNoVehicle && isNearby) {
            return (
                '<div class="route-summary-tip">' +
                '<strong>🚶 Совет:</strong> до объекта всего ' + Math.round(m) + ' м – ' +
                'возможно, проще пройти пешком, чем пользоваться общественным транспортом.' +
                '</div>'
            );
        }
        // Случай 4: транспорт есть, расстояние большое – совет не показываем
    }

    // Аналогично для auto и pedestrian
    if (routingMode === 'auto' && isNearby) {
        return (
            '<div class="route-summary-tip">' +
            '<strong>🚗 Рядом с целью:</strong> ' + Math.round(m) + ' м – ' +
            'пройти пешком может быть проще, чем искать парковку.' +
            '</div>'
        );
    }

    if (routingMode === 'pedestrian' && isNearby) {
        return (
            '<div class="route-summary-tip">' +
            '<strong>🚶 Совсем близко:</strong> ' + Math.round(m) + ' м – ' +
            'удобно дойти пешком за пару минут.' +
            '</div>'
        );
    }

    return '';
}

function buildMasstransitStepsHtml(activeRoute) {
    const items = [];
    const maxSteps = 16;
    try {
        activeRoute.getPaths().each(function (path) {
            path.getSegments().each(function (segment) {
                if (items.length >= maxSteps) {
                    return;
                }
                const segType = segment.properties.get('type');
                const transports = segment.properties.get('transports');
                if (transports && transports.length) {
                    transports.forEach(function (tr) {
                        if (items.length >= maxSteps) {
                            return;
                        }
                        const nm = tr.name != null ? String(tr.name) : '';
                        const typ = transportTypeRu(tr.type || '');
                        items.push(
                            '<li><strong>' +
                                escapeHtml(nm) +
                                '</strong>' +
                                (typ
                                    ? ' <span class="route-muted">(' + escapeHtml(typ) + ')</span>'
                                    : '') +
                                '</li>'
                        );
                    });
                } else if (segType === 'transfer') {
                    items.push('<li>Пересадка</li>');
                } else if (
                    segType === 'walking' ||
                    segType === 'walk' ||
                    segType === 'pedestrian'
                ) {
                    const d = segment.properties.get('duration');
                    const wt = d && d.text ? ' (~' + escapeHtml(d.text) + ')' : '';
                    items.push('<li>Пешком' + wt + '</li>');
                }
            });
        });
    } catch (e) {
        /* ignore */
    }
    if (items.length === 0) {
        return '';
    }
    return (
        '<p class="route-muted">Основные участки по данным навигатора:</p>' +
        '<ul class="route-steps-list">' +
        items.join('') +
        '</ul>'
    );
}

function updateRouteSummaryPanel(activeRoute, routingMode) {
    const el = document.getElementById('routeSummary');
    if (!el) return;

    try {
        if (!activeRoute) {
            el.hidden = false;
            el.className = 'route-summary route-summary--loading';
            el.innerHTML =
                '<h4>' +
                escapeHtml(routingModeRu(routingMode)) +
                '</h4><p>Ожидаем ответ от карт…</p>';
            return;
        }

        if (activeRoute.properties.get('blocked')) {
            el.hidden = false;
            el.className = 'route-summary';
            el.innerHTML =
                '<h4>Маршрут недоступен</h4>' +
                '<p>Для выбранного способа не удалось построить путь. Попробуйте другой вариант или уточните адрес отправления.</p>';
            return;
        }

        const dist = activeRoute.properties.get('distance');
        const dur = activeRoute.properties.get('duration');
        let meta = '';
        if (dur && dur.text) {
            meta += '<strong>Время в пути:</strong> ' + escapeHtml(dur.text);
        }
        if (dist && dist.text) {
            if (meta) {
                meta += ' · ';
            }
            meta += '<strong>Расстояние:</strong> ' + escapeHtml(dist.text);
        }

        let body =
            '<h4>' + escapeHtml(routingModeRu(routingMode)) + '</h4>' +
            (meta ? '<p class="route-meta">' + meta + '</p>' : '');

        body += buildWalkPreferenceTipHtml(activeRoute, routingMode);

        if (routingMode === 'masstransit') {
            body += buildMasstransitStepsHtml(activeRoute);
        }

        body +=
            '<p class="route-muted">Расчёт Яндекс.Карт; расписание и остановки в реальности могут отличаться.</p>';

        el.hidden = false;
        el.className = 'route-summary';
        el.innerHTML = body;
    } catch (e2) {
        el.hidden = false;
        el.className = 'route-summary';
        el.innerHTML = '<p>Не удалось прочитать данные маршрута.</p>';
    }
}

function showBuildingInfo(building) {
    const modal = document.getElementById('infoModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');

    modalTitle.textContent = building.name;

    let photoBlock = '';
    if (building.photo) {
        photoBlock =
            '<div class="modal-building-hero">' +
            '<img src="' +
            escapeHtml(building.photo) +
            '" alt="' +
            escapeHtml('Вход в «' + building.name + '»') +
            '" loading="eager" decoding="async">' +
            '</div>';
    }

    modalBody.innerHTML =
        photoBlock +
        '<p><strong>Адрес:</strong> ' +
        escapeHtml(buildingAddressLine(building)) +
        '</p>' +
        '<p><strong>Краткое описание:</strong> ' +
        escapeHtml(building.info.description) +
        '</p>' +
        '<p><strong>Структурные подразделения и инфраструктура:</strong></p>' +
        '<p class="preserve-lines">' +
        escapeHtml(building.info.structure).replace(/\n/g, '<br>') +
        '</p>' +
        '<p><strong>Режим работы:</strong> ' +
        escapeHtml(building.info.schedule) +
        '</p>' +
        '<p><strong>Контакты:</strong> ' +
        escapeHtml(building.info.contacts) +
        '</p>';

    modal.style.display = 'block';
}

document.querySelector('.close').addEventListener('click', function () {
    document.getElementById('infoModal').style.display = 'none';
});

window.addEventListener('click', function (event) {
    const modal = document.getElementById('infoModal');
    if (event.target === modal) {
        modal.style.display = 'none';
    }
});

document.getElementById('useGeolocation').addEventListener('click', function () {
    hideError();

    if (!map) {
        showError('Карта ещё не загрузилась. Подождите или проверьте интернет.');
        return;
    }

    if (!navigator.geolocation) {
        showError('Геолокация не поддерживается вашим браузером.');
        return;
    }

    const button = document.getElementById('useGeolocation');
    const originalText = button.innerHTML;
    button.innerHTML = '⏳';
    button.disabled = true;

    const options = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
        function (position) {
            button.innerHTML = originalText;
            button.disabled = false;
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;

            document.getElementById('startPoint').value = `Геолокация (${lat.toFixed(6)}, ${lon.toFixed(6)})`;

            if (currentMarker) {
                map.geoObjects.remove(currentMarker);
            }

            currentMarker = new ymaps.Placemark(
                [lat, lon],
                {
                    balloonContent: 'Ваше текущее местоположение',
                    hintContent: 'Ваше местоположение'
                },
                {
                    preset: 'islands#greenCircleDotIconWithCaption',
                    iconColor: '#00aa00'
                }
            );

            map.geoObjects.add(currentMarker);

            map.setCenter([lat, lon], 15, {
                duration: 300
            });
        },
        function (error) {
            button.innerHTML = originalText;
            button.disabled = false;
            let errorMessage = 'Не удалось получить ваше местоположение. ';
            switch (error.code) {
                case error.PERMISSION_DENIED:
                    errorMessage +=
                        'Вы отказали в доступе к геолокации. Пожалуйста, разрешите доступ к местоположению в настройках браузера и попробуйте снова.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMessage +=
                        'Информация о местоположении недоступна. Убедитесь, что GPS включен или подключение к интернету активно.';
                    break;
                case error.TIMEOUT:
                    errorMessage +=
                        'Превышено время ожидания. Проверьте подключение к интернету и попробуйте снова.';
                    break;
                default:
                    errorMessage += 'Произошла неизвестная ошибка. Попробуйте обновить страницу.';
                    break;
            }
            showError(errorMessage);
            console.error('Geolocation error:', error);
        },
        options
    );
});

document.getElementById('buildRoute').addEventListener('click', function () {
    hideError();

    if (!map || typeof ymaps === 'undefined') {
        showError('Карта не готова. Проверьте загрузку Яндекс.Карт или подключение к интернету.');
        return;
    }

    const startPoint = document.getElementById('startPoint').value.trim();
    const endPointId = document.getElementById('endPoint').value;

    if (!endPointId) {
        showError('Пожалуйста, выберите корпус назначения.');
        return;
    }

    const endBuilding = buildings.find(b => b.id === parseInt(endPointId, 10));
    if (!endBuilding) {
        showError('Корпус не найден.');
        return;
    }

    if (multiRoute) {
        map.geoObjects.remove(multiRoute);
        multiRoute = null;
    }

    const buildButton = document.getElementById('buildRoute');
    const originalText = buildButton.textContent;
    buildButton.textContent = 'Построение...';
    buildButton.disabled = true;

    function getEndCoords(callback, errorCallback) {
        if (endBuilding.coordinates) {
            callback(endBuilding.coordinates);
        } else {
            ymaps
                .geocode(endBuilding.address, { results: 1 })
                .then(function (res) {
                    const firstGeoObject = res.geoObjects.get(0);
                    if (firstGeoObject) {
                        endBuilding.coordinates = firstGeoObject.geometry.getCoordinates();
                        callback(endBuilding.coordinates);
                    } else {
                        buildButton.textContent = originalText;
                        buildButton.disabled = false;
                        if (errorCallback) errorCallback();
                        showError('Не удалось найти адрес корпуса назначения: ' + endBuilding.address);
                    }
                })
                .catch(function (error) {
                    buildButton.textContent = originalText;
                    buildButton.disabled = false;
                    if (errorCallback) errorCallback();
                    showError('Ошибка при поиске адреса корпуса. Попробуйте позже.');
                    console.error('Geocode error:', error);
                });
        }
    }

    function restoreButton() {
        buildButton.textContent = originalText;
        buildButton.disabled = false;
    }

    let startCoords;
    if (startPoint && startPoint.includes('Геолокация')) {
        if (currentMarker) {
            startCoords = currentMarker.geometry.getCoordinates();
            getEndCoords(
                function (endCoords) {
                    buildRoute(startCoords, endCoords, getRoutingMode());
                    restoreButton();
                },
                restoreButton
            );
        } else {
            navigator.geolocation.getCurrentPosition(
                function (position) {
                    startCoords = [position.coords.latitude, position.coords.longitude];
                    getEndCoords(
                        function (endCoords) {
                            buildRoute(startCoords, endCoords, getRoutingMode());
                            restoreButton();
                        },
                        restoreButton
                    );
                },
                function () {
                    restoreButton();
                    showError(
                        'Не удалось получить геолокацию. Введите адрес вручную или используйте кнопку геолокации.'
                    );
                }
            );
        }
    } else if (startPoint) {
        ymaps
            .geocode(startPoint, { results: 1 })
            .then(function (res) {
                const firstGeoObject = res.geoObjects.get(0);
                if (firstGeoObject) {
                    startCoords = firstGeoObject.geometry.getCoordinates();
                    getEndCoords(
                        function (endCoords) {
                            buildRoute(startCoords, endCoords, getRoutingMode());
                            restoreButton();
                        },
                        restoreButton
                    );
                } else {
                    restoreButton();
                    showError(
                        'Адрес "' +
                            startPoint +
                            '" не найден. Проверьте правильность написания или выберите адрес из подсказок.'
                    );
                }
            })
            .catch(function (error) {
                restoreButton();
                showError('Ошибка при поиске адреса. Попробуйте еще раз.');
                console.error('Geocode error:', error);
            });
    } else {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                function (position) {
                    startCoords = [position.coords.latitude, position.coords.longitude];
                    getEndCoords(
                        function (endCoords) {
                            buildRoute(startCoords, endCoords, getRoutingMode());
                            restoreButton();
                        },
                        restoreButton
                    );
                },
                function () {
                    restoreButton();
                    showError(
                        'Не удалось получить ваше местоположение. Введите адрес начальной точки или используйте кнопку геолокации.'
                    );
                }
            );
        } else {
            restoreButton();
            showError('Введите адрес начальной точки или используйте кнопку геолокации.');
        }
    }
});

function buildRoute(startCoords, endCoords, routingMode) {
    if (!routingMode) {
        routingMode = 'masstransit';
    }

    lastRouteReferencePoints = [startCoords, endCoords];

    showRouteSummaryLoading();

    if (routeStartMarker) {
        map.geoObjects.remove(routeStartMarker);
        routeStartMarker = null;
    }

    multiRoute = new ymaps.multiRouter.MultiRoute(
        {
            referencePoints: [startCoords, endCoords],
            params: {
                routingMode: routingMode,
                results: 1
            }
        },
        {
            boundsAutoApply: true,
            routeActiveMarkerVisible: false,
            routeMarkerVisible: false,
            wayPointVisible: false,
            pinVisible: false
        }
    );

    map.geoObjects.add(multiRoute);

    if (
        !currentMarker ||
        Math.abs(currentMarker.geometry.getCoordinates()[0] - startCoords[0]) > 0.0001 ||
        Math.abs(currentMarker.geometry.getCoordinates()[1] - startCoords[1]) > 0.0001
    ) {
        routeStartMarker = new ymaps.Placemark(
            startCoords,
            {
                balloonContent: 'Начальная точка маршрута'
            },
            {
                preset: 'islands#greenCircleDotIconWithCaption',
                iconColor: '#00aa00'
            }
        );
        map.geoObjects.add(routeStartMarker);
    }

    multiRoute.events.add('update', function () {
        const activeRoute = multiRoute.getActiveRoute();
        if (activeRoute) {
            try {
                map.setBounds(activeRoute.getWayPoints().getBounds(), { checkZoomRange: true });
            } catch (eBounds) {
                /* ignore */
            }
        }
        updateRouteSummaryPanel(activeRoute, routingMode);
    });
}

document.getElementById('clearRoute').addEventListener('click', function () {
    hideError();
    hideRouteSummary();
    lastRouteReferencePoints = null;

    if (!map) {
        document.getElementById('startPoint').value = '';
        document.getElementById('endPoint').value = '';
        return;
    }

    if (multiRoute) {
        map.geoObjects.remove(multiRoute);
        multiRoute = null;
    }

    if (routeStartMarker) {
        map.geoObjects.remove(routeStartMarker);
        routeStartMarker = null;
    }

    map.geoObjects.each(function (obj) {
        if (
            obj !== currentMarker &&
            obj !== routeStartMarker &&
            !placemarks.includes(obj) &&
            obj !== multiRoute
        ) {
            map.geoObjects.remove(obj);
        }
    });

    document.getElementById('startPoint').value = '';
    document.getElementById('endPoint').value = '';
});
