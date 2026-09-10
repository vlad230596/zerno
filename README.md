# Zerno

**Личный клиент [ZenMoney](https://zenmoney.app/) с конвертным бюджетированием**

Zerno синхронизируется с аккаунтом ZenMoney и позволяет планировать деньги по
конвертам в стиле YNAB: цели накоплений, аналитика, правила категоризации и
детальная история трат. Работает офлайн как PWA.

> Форк [Zerro](https://github.com/ardov/zerro) © [ardov](https://github.com/ardov),
> GPL-2.0. Точка ответвления — `be47283a`.
> Список расхождений с оригиналом — в [docs/fork-changes.md](./docs/fork-changes.md).

## Возможности

- 💰 **Конверты** по нескольким валютам
- 🎯 **Цели накоплений** на крупные покупки и подушку
- 💹 **Аналитика** доходов, расходов и капитала
- 🔍 **Поиск операций** на языке запросов: категории, магазины, суммы, даты, типы
- ✨ **Правила категоризации** — размечают историю и новые операции автоматически
- ⚡️ **Массовые действия**: слияние, смена категорий, удаление и восстановление
- 💾 **Полный бэкап** данных
- 📱 **PWA**, работает офлайн

## Документация

- [ARCHITECTURE.md](./ARCHITECTURE.md) — стек, слои FSD, устройство данных и синхронизации
- [docs/fork-changes.md](./docs/fork-changes.md) — что изменено относительно Zerro
- [docs/features/](./docs/features) — проработка отдельных фич

## Ссылки

- [ZenMoney](https://zenmoney.app/) + [документация API](https://github.com/zenmoney/ZenPlugins/wiki/ZenMoney-API)
- [Zerro](https://github.com/ardov/zerro) — оригинальный проект
- [YNAB](https://www.youneedabudget.com/) — про сам метод конвертного бюджетирования

## Запуск локально

1. Поставить [pnpm](https://pnpm.io/) и [Node.js](https://nodejs.org/)
2. `pnpm install`
3. `pnpm run dev` — дев-сервер на [http://localhost:3000](http://localhost:3000/)

Порт именно 3000: `REDIRECT_URI` в `.env.development` зарегистрирован на него,
на другом порту OAuth ZenMoney не пройдёт.

## Лицензия

[GPL-2.0](./LICENSE), как и у оригинала.
