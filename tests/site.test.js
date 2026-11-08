const { JSDOM } = require("jsdom");
const P = require("path"); const ROOT1 = P.resolve(__dirname, "..") + "/"; const path = ROOT1 + "index.html";
let fails = 0;
const t = (name, cond) => { console.log((cond ? "OK   " : "FAIL ") + name); if (!cond) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));

async function load(url) {
  const dom = await JSDOM.fromFile(path, { runScripts: "dangerously", resources: "usable", url: url || "file://" + path, pretendToBeVisual: true });
  await new Promise(r => dom.window.addEventListener("load", r));
  await wait(50);
  return dom;
}
const fire = (w, node, type) => node.dispatchEvent(new w.Event(type, { bubbles: true }));

(async () => {
  // --- Валидаторы
  const V = require(ROOT1 + "js/validators.js");
  t("имя: одно слово — ошибка", !V.fullName("Иван").ok);
  t("имя: корректное", V.fullName("  Иванова   Мария ").value === "Иванова Мария");
  t("имя: цифры — ошибка", !V.fullName("Иван 123").ok);
  t("имя: <script> — ошибка", !V.fullName("<script> alert").ok);
  t("email корректный", V.email("Test@Mail.ru").ok);
  t("email некорректный", !V.email("test@mail").ok && !V.email("a b@c.ru").ok);
  t("телефон 8 900...", V.phone("8 (900) 123-45-67").value === "+79001234567");
  t("телефон 10 цифр", V.phone("9001234567").value === "+79001234567");
  t("телефон короткий — ошибка", !V.phone("+7 900 12").ok);
  t("форматирование телефона", V.formatPhone("89001234567") === "+7 (900) 123-45-67");
  t("согласие обязательно", !V.consent(false).ok && V.consent(true).ok);

  // --- Страница
  let dom = await load();
  let w = dom.window, d = w.document;
  t("сессии отрисованы (12)", d.querySelectorAll(".session").length === 12);
  t("спикеры отрисованы (6)", d.querySelectorAll(".speaker").length === 6);
  t("чипы: 4 кнопки", d.querySelectorAll(".chip").length === 4);

  // фильтр по залу
  d.querySelector('.chip[data-hall="lab"]').click();
  let vis = [...d.querySelectorAll(".session")].filter(e => !e.hidden).length;
  t("фильтр «Лаборатория» = 3", vis === 3);
  t("кнопка зала нажата (aria-pressed)", d.querySelector('.chip[data-hall="lab"]').getAttribute("aria-pressed") === "true");
  t("зал на карте подсвечен", d.querySelector("#map-lab").classList.contains("is-active"));

  // поиск + пустое состояние
  const s = d.querySelector("#program-search");
  s.value = "безопасность"; fire(w, s, "input");
  t("пустое состояние при фильтре зал+запрос", !d.querySelector("#program-empty").hidden);
  d.querySelector("#program-reset").click();
  vis = [...d.querySelectorAll(".session")].filter(e => !e.hidden).length;
  t("сброс возвращает все 12", vis === 12 && d.querySelector("#program-empty").hidden);
  s.value = "ёлка-палка-нет"; fire(w, s, "input");
  t("пусто по запросу", !d.querySelector("#program-empty").hidden && /ёлка/.test(d.querySelector("#program-empty-text").textContent));
  s.value = '<img src=x onerror=alert(1)>'; fire(w, s, "input");
  t("XSS в поиске не создаёт элементов", d.querySelectorAll("#program-empty img").length === 0);

  // клик по карте
  d.querySelector("#program-reset").click();
  d.querySelector("#map-shop").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  vis = [...d.querySelectorAll(".session")].filter(e => !e.hidden).length;
  t("клик по залу на карте фильтрует (Мастерская=2)", vis === 2);

  // навигация
  const tg = d.querySelector(".nav-toggle");
  tg.click();
  t("меню открывается", tg.getAttribute("aria-expanded") === "true" && d.querySelector("#site-nav").classList.contains("is-open"));
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  t("Esc закрывает меню", tg.getAttribute("aria-expanded") === "false");

  t("обратный отсчёт заполнен", /До начала|завершён|идёт/.test(d.querySelector("#countdown").textContent));

  // форма: пустая отправка
  const form = d.querySelector("#register-form");
  form.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  const errs = [...d.querySelectorAll(".field__error")].filter(e => !e.hidden).length;
  t("пустая форма: 6 ошибок", errs === 6);
  t("сводка ошибок показана", !d.querySelector("#form-alert").hidden);
  t("фокус на первом невалидном поле", d.activeElement && d.activeElement.id === "f-name");
  t("aria-invalid выставлен", d.querySelector("#f-email").getAttribute("aria-invalid") === "true");

  // маска телефона
  const ph = d.querySelector("#f-phone"); ph.value = "89001234567"; fire(w, ph, "input");
  t("маска телефона в поле", ph.value === "+7 (900) 123-45-67");

  // заполнение и успех
  d.querySelector("#f-name").value = "Иванова Мария";
  d.querySelector("#f-email").value = "maria@example.ru";
  d.querySelector("#f-hall").value = "lab";
  d.querySelector('input[name="format"][value="online"]').checked = true;
  d.querySelector("#f-consent").checked = true;
  form.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  t("во время отправки кнопка заблокирована", d.querySelector("#submit-btn").disabled === true);
  await wait(1100);
  t("успех: панель показана, форма скрыта", !d.querySelector("#form-success").hidden && form.hidden);
  t("номер заявки КН-XXXXX", /^КН-\d{5}$/.test(d.querySelector("#success-code").textContent));
  d.querySelector("#success-reset").click();
  t("повторная заявка: форма снова пустая", !form.hidden && d.querySelector("#f-name").value === "");
  dom.window.close();

  // состояние ошибки отправки
  dom = await load("file://" + path + "?demo=error");
  w = dom.window; d = w.document;
  d.querySelector("#f-name").value = "Иванова Мария";
  d.querySelector("#f-email").value = "maria@example.ru";
  d.querySelector("#f-phone").value = "+7 (900) 123-45-67";
  d.querySelector("#f-hall").value = "main";
  d.querySelector('input[name="format"][value="offline"]').checked = true;
  d.querySelector("#f-consent").checked = true;
  d.querySelector("#register-form").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  await wait(1100);
  t("demo=error: показана ошибка с повтором", !d.querySelector("#form-alert").hidden && !!d.querySelector("#form-alert button"));
  t("demo=error: форма не скрыта, кнопка разблокирована", !d.querySelector("#register-form").hidden && !d.querySelector("#submit-btn").disabled);
  dom.window.close();

  // honeypot
  dom = await load(); w = dom.window; d = w.document;
  d.querySelector("#f-name").value = "Бот Ботов"; d.querySelector("#f-email").value = "b@b.ru";
  d.querySelector("#f-phone").value = "+7 (900) 123-45-67"; d.querySelector("#f-hall").value = "main";
  d.querySelector('input[name="format"][value="offline"]').checked = true; d.querySelector("#f-consent").checked = true;
  d.querySelector("#f-website").value = "spam";
  d.querySelector("#register-form").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  t("honeypot: бот получает «успех» без отправки", !d.querySelector("#form-success").hidden);

  // нет inline-стилей и внешних ресурсов (CSP)
  const html = require("fs").readFileSync(path, "utf8");
  t("в HTML нет style=\"…\" и <style>", !/ style=|<style/.test(html));
  t("нет внешних скриптов/стилей", !/(src|href)="https?:\/\/[^"]*\.(js|css)/.test(html));
  console.log(fails ? `\nПровалено: ${fails}` : "\nВсе проверки пройдены");
  process.exit(fails ? 1 : 0);
})();
