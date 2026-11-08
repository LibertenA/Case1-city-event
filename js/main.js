/*
 * Контур — поведение страницы.
 * Все пользовательские строки выводятся через textContent, поэтому разметку из данных вставить нельзя (защита от XSS).
 */
(function () {
  "use strict";

  var D = window.EventData;
  var V = window.Validators;
  var SVG_NS = "http://www.w3.org/2000/svg";

  document.documentElement.classList.add("js");

  /* ---------- Вспомогательные функции ---------- */
  function $(selector, root) { return (root || document).querySelector(selector); }

  function el(tag, props, children) {
    var node = document.createElement(tag);
    var key;
    props = props || {};
    for (key in props) {
      if (key === "text") node.textContent = props[key];
      else if (key === "class") node.className = props[key];
      else node.setAttribute(key, props[key]);
    }
    (children || []).forEach(function (child) {
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });
    return node;
  }

  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  function normalize(s) { return String(s || "").toLowerCase().replace(/ё/g, "е").trim(); }

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function scrollToEl(node) {
    if (node && typeof node.scrollIntoView === "function") node.scrollIntoView({ block: "start" });
  }

  /* ---------- Фильтрация программы (чистая функция) ---------- */
  function filterSessions(sessions, hall, query) {
    var q = normalize(query);
    return sessions.filter(function (s) {
      if (hall !== "all" && s.hall !== hall) return false;
      if (!q) return true;
      var hay = [s.title, s.text, hallName(s.hall), speakerNames(s)].join(" ");
      return normalize(hay).indexOf(q) !== -1;
    });
  }

  function hallName(id) { var h = byId(D.HALLS, id); return h ? h.name : ""; }

  function speakerNames(session) {
    return session.speakers.map(function (id) {
      var sp = byId(D.SPEAKERS, id);
      return sp ? sp.name : "";
    }).join(", ");
  }

  /* ---------- Меню на узких экранах ---------- */
  function initNav() {
    var toggle = $(".nav-toggle");
    var nav = $("#site-nav");
    if (!toggle || !nav) return;

    function setOpen(open) {
      toggle.setAttribute("aria-expanded", String(open));
      nav.classList.toggle("is-open", open);
    }
    toggle.addEventListener("click", function () {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });
    nav.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("a")) setOpen(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setOpen(false);
        toggle.focus();
      }
    });
  }

  /* ---------- Обратный отсчёт ---------- */
  function initCountdown() {
    var node = $("#countdown");
    if (!node) return;
    var start = new Date(D.EVENT.startsAt).getTime();
    var end = start + 9 * 3600 * 1000;

    function tick() {
      var now = Date.now();
      var diff = start - now;
      if (diff <= 0) {
        node.textContent = now < end ? "Фестиваль идёт прямо сейчас." : "Фестиваль завершён. Спасибо, что были с нами!";
        return;
      }
      var days = Math.floor(diff / 86400000);
      var hours = Math.floor((diff % 86400000) / 3600000);
      var mins = Math.floor((diff % 3600000) / 60000);
      node.textContent = "До начала: " +
        days + " " + plural(days, "день", "дня", "дней") + " " +
        hours + " " + plural(hours, "час", "часа", "часов") + " " +
        mins + " " + plural(mins, "минута", "минуты", "минут") + ".";
    }
    tick();
    setInterval(tick, 30000);
  }

  /* ---------- Программа ---------- */
  var state = { hall: "all", query: "" };
  var programNodes = {}; // id сессии -> <li>

  function renderSession(s) {
    var names = speakerNames(s);
    var li = el("li", { class: "session hall-" + s.hall, "data-id": s.id }, [
      el("p", { class: "session__time", text: s.start + "–" + s.end }),
      el("div", { class: "session__body" }, [
        el("h3", { class: "session__title", text: s.title }),
        el("p", { class: "session__meta" }, [
          el("span", { class: "tag", text: hallName(s.hall) }),
          el("span", { text: D.TYPE_LABELS[s.type] || "" }),
          el("span", { class: "session__speakers", text: names })
        ]),
        el("p", { class: "session__text", text: s.text })
      ])
    ]);
    return li;
  }

  function renderChips() {
    var box = $("#hall-filter");
    box.textContent = "";
    var items = [{ id: "all", name: "Все залы" }].concat(D.HALLS);
    items.forEach(function (h) {
      var count = h.id === "all" ? D.SESSIONS.length : D.SESSIONS.filter(function (s) { return s.hall === h.id; }).length;
      var btn = el("button", { class: "chip", type: "button", "data-hall": h.id, "aria-pressed": "false" }, [
        h.name,
        el("span", { class: "chip__count", text: "(" + count + ")" })
      ]);
      btn.addEventListener("click", function () { setHall(h.id); });
      box.appendChild(btn);
    });
  }

  function updateProgram() {
    var list = $("#program-list");
    var visible = filterSessions(D.SESSIONS, state.hall, state.query);
    var visibleIds = {};
    visible.forEach(function (s) { visibleIds[s.id] = true; });

    D.SESSIONS.forEach(function (s) {
      programNodes[s.id].hidden = !visibleIds[s.id];
    });

    Array.prototype.forEach.call(document.querySelectorAll(".chip"), function (chip) {
      chip.setAttribute("aria-pressed", String(chip.getAttribute("data-hall") === state.hall));
    });
    ["main", "lab", "shop"].forEach(function (id) {
      var g = $("#map-" + id);
      if (g) g.classList.toggle("is-active", state.hall === id);
    });

    var status = $("#program-status");
    var empty = $("#program-empty");
    if (visible.length === 0) {
      list.hidden = true;
      empty.hidden = false;
      var parts = [];
      if (state.query.trim()) parts.push("по запросу «" + state.query.trim() + "»");
      if (state.hall !== "all") parts.push("в зале «" + hallName(state.hall) + "»");
      $("#program-empty-text").textContent = "Выступлений " + parts.join(" ") + " нет. Измените запрос или выберите другой зал.";
      status.textContent = "Ничего не найдено.";
    } else {
      list.hidden = false;
      empty.hidden = true;
      status.textContent = "Показано " + visible.length + " из " + D.SESSIONS.length + " " + plural(D.SESSIONS.length, "выступления", "выступлений", "выступлений") + ".";
    }
  }

  function setHall(id) {
    state.hall = id;
    updateProgram();
  }

  function initProgram() {
    var list = $("#program-list");
    try {
      if (!D || !Array.isArray(D.SESSIONS)) throw new Error("no data");
      D.SESSIONS.forEach(function (s) {
        var li = renderSession(s);
        programNodes[s.id] = li;
        list.appendChild(li);
      });
      renderChips();
    } catch (err) {
      list.hidden = true;
      $("#hall-filter").hidden = true;
      $("#program-error").hidden = false;
      $("#program-retry").addEventListener("click", function () { window.location.reload(); });
      return;
    }

    var search = $("#program-search");
    search.addEventListener("input", function () {
      state.query = search.value;
      updateProgram();
    });
    $("#program-reset").addEventListener("click", function () {
      state.hall = "all";
      state.query = "";
      search.value = "";
      updateProgram();
      search.focus();
    });
    updateProgram();
  }

  /* ---------- Спикеры ---------- */
  function initials(name) {
    return name.split(" ").slice(0, 2).map(function (w) { return w.charAt(0); }).join("");
  }

  function avatar(speaker) {
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 64 64");
    svg.setAttribute("class", "speaker__avatar");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    var circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", "32"); circle.setAttribute("cy", "32"); circle.setAttribute("r", "32");
    circle.setAttribute("fill", speaker.color);
    var text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("x", "32"); text.setAttribute("y", "40");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("font-size", "22"); text.setAttribute("font-weight", "600");
    text.setAttribute("font-family", "Onest, system-ui, sans-serif");
    text.setAttribute("fill", "#FFFFFF");
    text.textContent = initials(speaker.name);
    svg.appendChild(circle);
    svg.appendChild(text);
    return svg;
  }

  function initSpeakers() {
    var list = $("#speakers-list");
    try {
      if (!D || !Array.isArray(D.SPEAKERS) || D.SPEAKERS.length === 0) throw new Error("no data");
      D.SPEAKERS.forEach(function (sp) {
        list.appendChild(el("li", { class: "speaker" }, [
          avatar(sp),
          el("h3", { class: "speaker__name", text: sp.name }),
          el("p", { class: "speaker__role", text: sp.role + ", " + sp.org }),
          el("p", { class: "speaker__bio", text: sp.bio })
        ]));
      });
    } catch (err) {
      list.hidden = true;
      $("#speakers-error").hidden = false;
    }
  }

  /* ---------- Схема площадки ---------- */
  function initVenue() {
    var legend = $("#hall-legend");
    if (!D) return;
    D.HALLS.forEach(function (h) {
      var btn = el("button", { class: "btn btn--ghost btn--small", type: "button", text: "Показать программу" });
      btn.setAttribute("aria-label", "Показать программу: " + h.name);
      btn.addEventListener("click", function () { showHall(h.id); });
      legend.appendChild(el("li", { class: "legend__item hall-" + h.id }, [
        el("span", { class: "legend__swatch", "aria-hidden": "true" }),
        el("span", { class: "legend__text" }, [h.name + ", " + h.seats + " мест", el("small", { text: h.note })]),
        btn
      ]));
    });

    ["main", "lab", "shop"].forEach(function (id) {
      var g = $("#map-" + id);
      if (!g) return;
      g.addEventListener("click", function () { showHall(id); });
      g.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showHall(id); }
      });
    });
  }

  function showHall(id) {
    setHall(id);
    scrollToEl($("#program"));
  }

  /* ---------- Форма регистрации ---------- */
  var HALL_IDS = ["main", "lab", "shop"];

  function initForm() {
    var form = $("#register-form");
    if (!form || !V) return;

    var alertBox = $("#form-alert");
    var success = $("#form-success");
    var submitBtn = $("#submit-btn");

    var fields = {
      name: { get: function () { return $("#f-name").value; }, check: V.fullName, inputs: ["#f-name"] },
      email: { get: function () { return $("#f-email").value; }, check: V.email, inputs: ["#f-email"] },
      phone: { get: function () { return $("#f-phone").value; }, check: V.phone, inputs: ["#f-phone"] },
      hall: { get: function () { return $("#f-hall").value; }, check: V.oneOf(HALL_IDS, "Выберите зал из списка."), inputs: ["#f-hall"] },
      format: {
        get: function () { var r = form.querySelector('input[name="format"]:checked'); return r ? r.value : ""; },
        check: V.oneOf(["offline", "online"], "Выберите, как вы будете участвовать."),
        inputs: ['input[name="format"]']
      },
      consent: { get: function () { return $("#f-consent").checked; }, check: V.consent, inputs: ["#f-consent"] }
    };
    var order = ["name", "email", "phone", "hall", "format", "consent"];
    var touched = {};

    function setError(key, message) {
      var holder = form.querySelector('[data-field="' + key + '"]');
      var errorNode = $("#f-" + key + "-error");
      var invalid = Boolean(message);
      fields[key].inputs.forEach(function (sel) {
        Array.prototype.forEach.call(form.querySelectorAll(sel), function (input) {
          if (invalid) input.setAttribute("aria-invalid", "true");
          else input.removeAttribute("aria-invalid");
        });
      });
      holder.classList.toggle("is-invalid", invalid);
      var check = holder.querySelector(".check");
      if (check) check.classList.toggle("is-invalid", invalid);
      errorNode.textContent = message;
      errorNode.hidden = !invalid;
    }

    function validate(key) {
      var res = fields[key].check(fields[key].get());
      setError(key, res.ok ? "" : res.message);
      return res;
    }

    order.forEach(function (key) {
      fields[key].inputs.forEach(function (sel) {
        Array.prototype.forEach.call(form.querySelectorAll(sel), function (input) {
          input.addEventListener("blur", function () { touched[key] = true; validate(key); });
          input.addEventListener(input.type === "checkbox" || input.type === "radio" || input.tagName === "SELECT" ? "change" : "input", function () {
            if (touched[key] || input.hasAttribute("aria-invalid")) validate(key);
          });
        });
      });
    });

    $("#f-phone").addEventListener("input", function (e) {
      var input = e.target;
      var formatted = V.formatPhone(input.value);
      if (input.value !== formatted) input.value = formatted;
    });

    function showAlert(message, withRetry) {
      alertBox.textContent = "";
      alertBox.appendChild(el("p", { text: message }));
      if (withRetry) {
        var retry = el("button", { class: "btn btn--ghost btn--small", type: "button", text: "Повторить отправку" });
        retry.addEventListener("click", function () { form.requestSubmit ? form.requestSubmit() : submit(); });
        alertBox.appendChild(retry);
      }
      alertBox.hidden = false;
    }

    // Имитация отправки. Реальных запросов нет: в демо данные остаются в браузере.
    function fakeSend() {
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          var forced = /(^|[?&])demo=error(&|$)/.test(window.location.search);
          if (forced || navigator.onLine === false) reject(new Error("network"));
          else resolve({ code: "КН-" + String(Math.floor(10000 + Math.random() * 90000)) });
        }, 900);
      });
    }

    function submit() {
      alertBox.hidden = true;
      var firstInvalid = null;
      var invalidCount = 0;
      order.forEach(function (key) {
        touched[key] = true;
        if (!validate(key).ok) {
          invalidCount++;
          if (!firstInvalid) firstInvalid = form.querySelector(fields[key].inputs[0]);
        }
      });
      if (invalidCount) {
        showAlert("Не отправлено: исправьте " + invalidCount + " " + plural(invalidCount, "поле", "поля", "полей") + " ниже.");
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      // Скрытое поле-ловушка для ботов: человек его не видит и не заполняет.
      if ($("#f-website") && $("#f-website").value) {
        showSuccess({ code: "КН-00000" });
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "Отправляем…";
      fakeSend().then(showSuccess, function () {
        showAlert("Не удалось отправить заявку. Проверьте подключение к интернету и повторите.", true);
      }).then(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = "Отправить заявку";
      });
    }

    function showSuccess(result) {
      $("#success-code").textContent = result.code;
      form.hidden = true;
      success.hidden = false;
      success.focus();
    }

    form.addEventListener("submit", function (e) { e.preventDefault(); submit(); });

    $("#success-reset").addEventListener("click", function () {
      form.reset();
      touched = {};
      order.forEach(function (key) { setError(key, ""); });
      alertBox.hidden = true;
      success.hidden = true;
      form.hidden = false;
      $("#f-name").focus();
    });
  }

  /* ---------- Запуск ---------- */
  function init() {
    initNav();
    if (D) initCountdown();
    initProgram();
    initSpeakers();
    initVenue();
    initForm();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  // Для автотестов
  window.__kontur = { filterSessions: filterSessions };
})();
