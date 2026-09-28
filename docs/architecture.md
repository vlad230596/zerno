# Архитектура

Zerno — статическое SPA без бэкенда: браузер ходит в ZenMoney Diff API напрямую,
сервер только отдаёт бандл. Всё, что ZenMoney хранить не умеет — конверты, цели,
правила, составные операции — лежит в скрытом хранилище внутри самих данных
ZenMoney (см. [Hidden store](#hidden-store--где-живут-данные-zerno)).

Форк [Zerro](https://github.com/ardov/zerro), точка ответвления `be47283a`.
Расхождения с оригиналом — в [fork-changes.md](./fork-changes.md), стенды и
выкладка — в [deployment.md](./deployment.md).

---

## 1. Стек

| Слой | Технологии |
|---|---|
| Сборка | Vite 7, TypeScript 5.9, pnpm 10 (`packageManager` в `package.json`) |
| UI | React 18, MUI 7 (`@mui/material`, `@mui/x-date-pickers`), Emotion |
| Состояние | Redux Toolkit 2 + react-redux 9, селекторы на `createSelector` |
| Роутинг | react-router **v5** (`history` v4, `createBrowserHistory`) |
| Данные | ZenMoney Diff API, IndexedDB (`idb`) внутри Web Worker, Comlink |
| Формы/DnD | Formik, `@dnd-kit` |
| Графики | Recharts 3 |
| i18n | i18next + react-i18next (ru/en) |
| PWA | `vite-plugin-pwa` + Workbox, свой `service-worker.ts` (`injectManifest`) |
| Тесты | Vitest + happy-dom + Testing Library |
| Мониторинг | Sentry, Google Analytics, Яндекс.Метрика (опционально, через env) |

MDX (`@mdx-js/rollup`, `@mdx-js/react`) остался в зависимостях и в
`vite.config.ts`, но ни одного `.mdx` в проекте нет — статьи автора удалены при
ребрендинге. Выкинуть при следующей правке зависимостей.

## 2. Файлы конфигурации в корне

| Файл | Назначение |
|---|---|
| `vite.config.ts` | Плагины (tsconfigPaths, react, mdx, PWA), `envPrefix: 'REACT_APP_'`, `define: APP_VERSION`, конфиг Vitest (`environment: 'happy-dom'`) |
| `tsconfig.json` | `strict`, `baseUrl: src` → абсолютные импорты вида `5-entities/tag`, `6-shared/ui/...` |
| `.env.development` | Ключи ZenMoney для локалки, `REDIRECT_URI=http://localhost:3000` |
| `.env.production` | Плейсхолдеры: ключи подставляются в CI из секретов репозитория |
| `pnpm-workspace.yaml` | `minimumReleaseAge: 4320` (не ставить пакеты моложе 3 дней) |
| `Dockerfile` | node:20-alpine, `pnpm run dev --host` — только для локальной разработки; прод-образ собирается из [`deploy/Dockerfile.web`](../deploy/Dockerfile.web) |
| `vercel.json` | Наследство апстрима: SPA-rewrite. Выкладка идёт не через Vercel |
| `typings/` | Внешние d.ts: `theme.d.ts`, `vite-env.d.ts`, `i18n.d.ts` |

## 3. Архитектура: Feature-Sliced Design

Каталоги пронумерованы по уровню — **импорт разрешён только «сверху вниз»**
(меньший номер зависит от большего):

```
src/
├── 1-app/        Инициализация приложения, провайдеры, роутинг
├── 2-pages/      Страницы (экраны)
├── 3-widgets/    Крупные самостоятельные блоки UI
├── 4-features/   Пользовательские сценарии (действия над данными)
├── 5-entities/   Доменные модели: селекторы + санки + UI сущности
├── 6-shared/     Переиспользуемая база: api, ui-kit, хелперы, типы, i18n
├── store/        Redux-стор и «сырой» слой данных ZenMoney
├── worker/       Web Worker (сеть + IndexedDB) через Comlink
├── demoData/     Генератор демо-данных для режима «Демо»
└── stories/      Storybook-истории (сам Storybook в зависимостях не подключён)
```

### 1-app
- `index.tsx` — точка входа: регистрация service worker, `initSentry()`,
  `bindWorkerToStore()`, экспорт `MainApp`. Заодно вешает на `window.zerro`
  отладочный объект (`zerro.state`, `zerro.resetData()`,
  `zerro.applyClientPatch()`, `zerro.toggleLogs()`).
- `App.tsx` — роутинг. Набор маршрутов зависит от состояния:
  - не залогинен → `/about`, всё остальное → `Auth`;
  - залогинен, данных ещё нет → лоадер с подсказками;
  - есть данные → `/transactions`, `/review`, `/accounts`, `/budget`,
    `/balance`, `/stats`, `/rules`, дефолт → `/budget`.

  Тяжёлые страницы (`About`, `Token`, `Stats`, `Review`, `Rules`, `Balance`)
  грузятся через `React.lazy`.
- `Providers.tsx` — `StyledEngineProvider → redux Provider →
  LocalizationProvider → AppThemeProvider → SnackbarProvider`.
- `GlobalErrorBoundary.tsx`, `GlobalWidgets.tsx`, `SWPrompt.tsx` (предложение
  обновить приложение).

### 2-pages
| Страница | Содержимое |
|---|---|
| `Budgets/` | Главный экран: таблица конвертов, превью конверта, попоуверы бюджета и цели, DnD-перетаскивание конвертов, боковая панель с итогами месяца, `MonthProvider` |
| `Transactions/` | Список операций: поиск строкой запроса (`#категория @место >1000 2024-05`), сумма и гистограмма по найденному, массовые действия, сборка составных операций. Переводы между своими счетами скрыты по умолчанию (`userSettings.ignoreTransfers`). Сортировка по дате (группы по дням) или по сумме (плоский список) |
| `Balance/` | Куда ушли деньги месяца: поток по категориям, полоска «Без категории по месяцам». Месяц живёт в адресе (`?month=`), а не в состоянии компонента |
| `Accounts.tsx` | Счета и их балансы |
| `Stats/` | Виджеты: `WidgetNetWorth`, `WidgetCashflow`, `WidgetAccHistory` |
| `Rules/` | Правила категоризации: список с приоритетом (DnD), редактирование и удаление, счётчик и список исключений с возвратом под правила. Создаются только из карточки операции |
| `Review/` | «Годовой отчёт» карточками: доходы, расходы, налоги, частые плательщики, накопления, QR |
| `Auth/` | Вход через ZenMoney, загрузка бэкапа и демо-режим |
| `Token.tsx` | Ручной ввод токена |
| `About/` | **Заглушка.** Статьи апстрима удалены при ребрендинге, свой текст не написан |

### 3-widgets
`Navigation` (десктопное меню + `MobileNavigation` + `SettingsMenu`),
`transaction/TransactionList`, `transaction/TransactionPreview`,
`account/AccountList`, `DebtorList`, `ErrorBoundary`, `RegularSyncHandler`
(периодическая синхронизация), `BackgroundCheckHandler` (запрос разрешения на
`periodicsync` и его диагностика), `RefreshButton`, `Amount`, `DataLine`, а
также `global/` — глобальные оверлеи: контекстные меню транзакции и счёта,
дровер списка транзакций, превью транзакции, транзакции конверта.

### 4-features — сценарии
- `authorization.ts` — `logIn` (OAuth-попап ZenMoney → токен → синк), `logOut`
  (чистит стор, IndexedDB, токен), загрузка бэкапа, демо-режим.
- `sync.ts` — **единственная точка синхронизации**: собирает локальный diff,
  шлёт его в воркер, применяет ответ сервера (`applyServerPatch`), сохраняет
  изменённые домены в IndexedDB.
- `localData.ts` — сохранение/загрузка/очистка локальной копии данных, включая
  `watchPendingChanges` — подписку, кладущую несинхронизированный дифф на диск.
- `shared/getDataToSave.ts` — что именно уходит в IndexedDB.
- `backgroundCheck.ts` — фоновая проверка трат: регистрация `periodicsync`,
  разбор того, почему Chrome отказал, и запуск проверки вручную.
- `installApp.ts` — установка PWA.
- `budget/` — `setTotalBudget`, конвертация ZenMoney-бюджетов в конверты.
- `envelope/` — создание, переименование, перемещение конвертов и групп.
- `moveMoney/` — перенос денег между конвертами (+ модалка).
- `bulkActions/` — `copyPrevMonth`, `fillGoals`, `fixOverspend`, `startFresh`.
- `export/` — выгрузка в CSV и полный JSON-бэкап.
- `mergeAccounts.ts` — объединение счетов.
- `transactionSearch/` — язык поиска операций: `parseQuery` разбирает строку на
  токены (категория, место, счёт, сумма, период, тип, флаги), `compileQuery`
  собирает из них `TrCondition`, `useSuggestions` подсказывает названия
  категорий/мест/счётов.
- `transactionRules/` — диалог создания и редактирования правила категоризации:
  галочки условия (магазин / текст места платежа / текст комментария), выбор
  категории и live-превью подходящих операций. Условие предзаполняется так,
  чтобы исходная операция всегда попадала в фильтр.
- `compositeEditor/` — один редактор на склейку и разделение составной операции
  плюс пикер существующего события.

### 5-entities — доменные модели
Каждая сущность экспортирует один объект-модель (`envelopeModel`, `goalModel`,
`budgetModel`, `accBalanceModel`, `debtorModel`, `userSettingsModel`, …) с
секциями *Selectors / Hooks / Thunks / Helpers* — единый паттерн публичного API.

Ключевые сущности:
- **`envelope`** — конверт. Абстракция над тегами ZenMoney и «долговыми»
  счетами: `getEnvelopes`, структура групп (`getEnvelopeStructure`,
  `flattenStructure`), `patchEnvelope`, `applyStructure`, парсинг составного
  `TEnvelopeId` (`EnvType`).
- **`envBalances`** — самая сложная часть: пошаговый расчёт балансов по месяцам.
  Файлы названы по стадиям конвейера, а граф зависимостей селекторов нарисован в
  [`dataflow.dot`](../src/5-entities/envBalances/dataflow.dot) (Graphviz):
  ```
  1 - currentFunds / monthList / rawActivity
  2 - activity / sortedActivity
  3 - envMetrics
  4 - monthTotals
  ```
- **`budget`** — два вида бюджета: `tagBudget` (нативный ZenMoney) и `envBudget`
  (свой, в скрытом хранилище).
- **`goal`** — цели накоплений (`goalType`, расчёт прогресса).
- **`cashflow`** — `classifyTransaction`: что считать доходом, расходом,
  переводом между своими счетами и долгом. Один ответ на этот вопрос на всё
  приложение — иначе перевод между двумя банками попадает и в доход, и в расход.
- **`currency`** — `instrument`, `fxRate`, `displayCurrency`: конвертация всех
  сумм в валюту отображения.
- **`transaction`, `account`, `tag`, `merchant`, `reminder`, `user`** — обёртки
  над сущностями ZenMoney.
- **`accBalances`** — балансы счетов на дату.
- **`debtors`** — долги/должники, вычисляются из транзакций по долговому счёту.
- **`rule`** — правила категоризации: список правил и список исключений в
  скрытом хранилище, движок `runAllRules()` (вызывается после каждого
  `applyServerPatch`). Условие правила — тот же `TrCondition`, что и в поиске.
  Ручная правка категории ставит операции **явное исключение** там, где человек
  её правит; всё прочее расхождение правило возвращает к своему значению.
  Подробнее: [features/auto-categorization.md](./features/auto-categorization.md).
- **`composite`** — составная операция: одно событие из нескольких транзакций
  (заказ с несколькими списаниями, разложенный на категории). Модель и
  инвариант — в `composite.ts`, хранение помесячное.
  Подробнее: [features/composite-operations.md](./features/composite-operations.md).
- **`userSettings`** — настройки пользователя.

### 6-shared
- `api/zenmoney/` — `auth.ts` (OAuth через попап и обмен кода на токен),
  `fetchDiff.ts` (Diff API), `endpoints.ts` (переключение `.ru` / `.app`).
- `api/zm-adapter/` — конвертация формата ZenMoney ↔ внутренний
  (`convertDiff.toClient/.toServer`), в т.ч. Unix-секунды → миллисекунды.
- `api/storage.ts` (IndexedDB через `idb`), `tokenStorage.ts`,
  `zmPreferenceStorage.ts`, `fxRates.ts`.
- `backgroundCheck.ts` — токен, курсор и `summarizeSpending()` для проверки из
  воркера, отдельно от UI-слоя `4-features/backgroundCheck.ts`.
- `ui/` — свой ui-kit поверх MUI: `AmountInput`, `SmartDialog`, `SmartSelect`,
  `SmartConfirm`, `AdaptivePopover`, `RadialProgress`, `PercentBar`, `TagIcon`,
  `theme/`, `SnackbarProvider`, `Logo`.
- `helpers/` — `money`, `date`, `color`, `keys`, `pluralize`, `receipt`,
  `performance` (обёртка `withPerf` для замера редьюсеров), `tracking`.
- `historyPopovers/` — попоуверы, привязанные к history (закрываются кнопкой
  «назад»).
- `localization/` — `i18n.ts`, переключатель языка, переводы `ru.json` /
  `en.ts`, локализация дат.
- `types/` — `data-entities.ts` (все ZenMoney-сущности: `TZmTransaction` /
  `TTransaction` и т.д.), `types.ts`, `ts-utils.ts`.
- `config.ts` — чтение `import.meta.env.REACT_APP_*`, имена БД.

## 4. Как устроены данные

### Хранилище (`src/store`)
Редьюсеры: `data`, `token`, `isPending`, `lastSync`, `displayCurrency`.
Middleware настроен с выключенными `immutableCheck` и `serializableCheck` —
данных много, проверки дороги.

Слайс `data` держит три состояния:

```ts
{
  server:  TDataStore | undefined  // последний снимок с сервера
  current: TDataStore              // server + локальные несинхронизированные правки
  diff:    TDiff | undefined       // накопленные локальные правки
}
```

- `applyClientPatch` — правка пользователя: применяется к `current` и копится в
  `diff`.
- `applyServerPatch` — ответ сервера: обновляет `server`, `current = server`, а
  из `diff` вычитается **только подтверждённое сервером**
  ([`subtractSyncedDiff.ts`](../src/store/data/shared/subtractSyncedDiff.ts)) —
  остальное накладывается обратно, иначе правка, сделанная пока летел запрос,
  откатывалась бы на экране.

### Цикл синхронизации

```
UI → thunk (4-features) → applyClientPatch → diff
                                    ↓
                            syncData() → Comlink → Web Worker
                                    ↓                    ↓
                        ZenMoney Diff API          IndexedDB
                                    ↓
                          applyServerPatch → current
```

Worker ([`src/worker/worker.ts`](../src/worker/worker.ts)) вынесен из главного
потока и умеет: `sync`, `getLocalData`, `saveLocalData`, `clearStorage`,
`convertZmToLocal`. Основной поток общается с ним через Comlink-прокси
(`src/worker/index.ts`).

Несинхронизированный дифф лежит на диске рядом со снимком, под отдельным ключом
`pendingDiff` со своей версией формата: без этого перезагрузка вкладки до
очередной синхронизации теряла бы правку. Пишет его `watchPendingChanges` в
[`localData.ts`](../src/4-features/localData.ts).

### Hidden store — где живут данные Zerno

У ZenMoney нет полей под конверты, цели и настройки Zerno. Решение: данные
пишутся **в напоминания (reminders)**, привязанные к служебному счёту
`🤖 [Zerro Data]` — так их легко найти и разом удалить. Реализация:
[`5-entities/shared/hidden-store/`](../src/5-entities/shared/hidden-store) —
фабрики `makeSimpleHiddenStore` (одна запись) и `makeMonthlyHiddenStore` (запись
на месяц); полезная нагрузка лежит в поле `comment` как JSON.

На этом механизме работают цели, собственные бюджеты конвертов, метаданные
конвертов, порядок категорий, настройки, правила категоризации и их исключения,
составные операции (`HiddenDataType`).

Комментарий напоминания ограничен по длине, поэтому порча хранилища —
реальный сценарий, а не теоретический. Комментарий, который начинается как наш,
но не разбирается, распознаётся (`isBrokenComment`, `getIsBroken`,
`getBrokenMonths`), сообщается наружу и в Sentry, и **не перезаписывается** —
это единственная копия того, что там было. Потребители обязаны на это
реагировать: движок правил при поломке не делает ничего, запись в повреждённый
месяц отклоняется.

## 5. Аутентификация

1. `logIn(endpoint)` открывает попап на `endpoints[preference].auth` с
   `client_id` и `redirect_uri`.
2. Пользователь логинится в ZenMoney, тот редиректит обратно с `?code=...`.
3. `processAuthCode()` в открывшемся окне кладёт код в `localStorage` и
   закрывает окно.
4. Основное окно ловит код, меняет его на токен, сохраняет в `tokenStorage`,
   запускает `syncData()`.

`redirect_uri` привязан к ключу ZenMoney, поэтому у каждого origin свой ключ —
см. [deployment.md](./deployment.md). Локально это значит: порт именно 3000.

Альтернативы: страница `/token` — вставить токен вручную; кнопка **Демо** —
генерируются синтетические данные (`src/demoData`) и используется `fakeToken`,
запросы к серверу не уходят.

## 6. Команды

```bash
pnpm install        # установка зависимостей
pnpm run dev        # dev-сервер на http://localhost:3000
pnpm run build      # tsc + vite build → dist/
pnpm run preview    # предпросмотр прод-сборки на :3000
pnpm test           # vitest
pnpm run lint       # tsc --noEmit
pnpm run lint:js    # eslint
pnpm run lint:css   # stylelint
pnpm run format     # prettier
```

Docker для локальной разработки:

```bash
docker build -t zerno:dev .
docker run -it -d --rm -v ${PWD}:/app -v /app/node_modules -p 3000:3000 -e CHOKIDAR_USEPOLLING=true zerno:dev
```

## 7. Заметки для разработки

- Абсолютные импорты от `src`:
  `import { envelopeModel } from '5-entities/envelope'`. Номер в пути сразу
  показывает слой — нарушение направления зависимостей видно глазами.
- Публичный API сущности — только `index.ts`; внутрь (`shared/`, `getXxx.ts`)
  снаружи не ходят.
- Prettier настроен прямо в `package.json`: без точек с запятой, одинарные
  кавычки, `arrowParens: avoid`.
- Тесты: 14 файлов, 136 тестов. Покрыто то, где ошибка молчит — язык поиска,
  движок правил, инвариант составной операции, вычитание подтверждённого диффа,
  разбор повреждённого скрытого хранилища.
- CI — три workflow в `.github/workflows`: проверки на `master`, автодеплой
  dev-стенда, релиз по тегу. Подробности — в [deployment.md](./deployment.md).
- В консоли браузера доступен объект `zerro` для инспекции стора и ручных
  патчей.
- `react-scan` в зависимостях — для отладки лишних ререндеров.
