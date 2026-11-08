/*
 * Валидация формы регистрации. Функции чистые (без DOM), поэтому их легко тестировать.
 * Каждая функция возвращает { ok: boolean, value: нормализованное значение, message: текст ошибки }.
 */
(function (root) {
  "use strict";

  var NAME_WORD = /^[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё'’.-]*$/;
  var EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

  function ok(value) { return { ok: true, value: value, message: "" }; }
  function fail(message, value) { return { ok: false, value: value || "", message: message }; }

  function fullName(raw) {
    var value = String(raw || "").replace(/\s+/g, " ").trim();
    if (!value) return fail("Введите фамилию и имя.");
    if (value.length > 80) return fail("Слишком длинное значение: не больше 80 символов.", value);
    var words = value.split(" ");
    if (words.length < 2) return fail("Укажите фамилию и имя через пробел.", value);
    for (var i = 0; i < words.length; i++) {
      if (words[i].length < 2 || !NAME_WORD.test(words[i])) {
        return fail("Используйте только буквы, дефис и апостроф.", value);
      }
    }
    return ok(value);
  }

  function email(raw) {
    var value = String(raw || "").trim();
    if (!value) return fail("Введите адрес электронной почты.");
    if (value.length > 254 || !EMAIL.test(value)) {
      return fail("Проверьте адрес: он должен выглядеть как name@example.ru.", value);
    }
    return ok(value.toLowerCase());
  }

  // Приводит номер к виду +7XXXXXXXXXX
  function phone(raw) {
    var digits = String(raw || "").replace(/\D/g, "");
    if (!digits) return fail("Введите номер телефона.");
    if (digits.length === 10 && digits.charAt(0) === "9") digits = "7" + digits;
    if (digits.length === 11 && digits.charAt(0) === "8") digits = "7" + digits.slice(1);
    if (digits.length !== 11 || digits.charAt(0) !== "7" || digits.charAt(1) !== "9") {
      return fail("Введите мобильный номер: +7 (900) 123-45-67.", String(raw || ""));
    }
    return ok("+" + digits);
  }

  // Форматирует ввод по мере набора: +7 (900) 123-45-67
  function formatPhone(raw) {
    var d = String(raw || "").replace(/\D/g, "");
    if (!d) return "";
    if (d.charAt(0) === "8") d = "7" + d.slice(1);
    if (d.charAt(0) !== "7") d = "7" + d;
    d = d.slice(0, 11);
    var out = "+7";
    if (d.length > 1) out += " (" + d.slice(1, 4);
    if (d.length >= 5) out += ") " + d.slice(4, 7);
    if (d.length >= 8) out += "-" + d.slice(7, 9);
    if (d.length >= 10) out += "-" + d.slice(9, 11);
    return out;
  }

  function oneOf(allowed, message) {
    return function (raw) {
      var value = String(raw || "");
      return allowed.indexOf(value) === -1 ? fail(message) : ok(value);
    };
  }

  function consent(checked) {
    return checked ? ok(true) : fail("Без согласия на обработку данных регистрация невозможна.");
  }

  var api = {
    fullName: fullName,
    email: email,
    phone: phone,
    formatPhone: formatPhone,
    oneOf: oneOf,
    consent: consent
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.Validators = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
