# Desktop resource packs / 桌面资源包 / Пакеты ресурсов

## 中文

- 正式桌面安装包不包含 GLB，首次使用以 NAV 展示地图；训练场为内置地图。
- 右上角“资源包”→“选择多个文件导入”，原生文件选择器支持多选 SVG/GLB，可分批导入，不使用 ZIP 或文件夹上传。
- 图标按名称识别，例如 `glock18.svg`（也接受 `glock.svg`）、`ak47.svg`、`ct_logo.svg`、`icon_headshot.svg`；模型为 `de_dust2.glb` 等。完整清单由 `electron/resource-catalog.json` 定义，界面逐项显示。
- 未导入图标使用当前默认图标；未导入模型不显示该地图模型操作，不会自动下载。完整度不是全有或全无：每个有效资源独立生效。
- GLB 必须保留原地图坐标、内置纹理和缓冲数据，不接受外部文件引用。暂不支持 `.zones.glb`、地图徽标、脚本插件和自定义地图。
- 文件保存在 Electron `userData/resource-packs`，不占浏览器 IndexedDB 配额；导入后的源文件可以移动。同名有效文件覆盖此前导入版本，同批重名目标报错；无效文件保留原资源。
- SVG 上限 2 MB，GLB 上限 1 GB。检查文件名、SVG 活动内容/外部引用、GLB 2.0 文件头/长度/JSON/数据块；此检查不保证任意模型都能正确渲染或与 NAV 对齐。
- 完成后显示成功/失败及逐文件原因。先保存工作，再“重新加载并应用”；重启应用也会应用导入结果。
- 开发启动读取 `.local/official/maps`。`npm run desktop:build:local` 生成带本地模型的测试目录包；正常 `desktop:build:mac`、`desktop:build:win`、`desktop:build` 均不携带模型。
- 历史 UI 测试素材位于被 Git 忽略的 `.local/official/ui/`，分 Equip/HUD/SideLogo 目录。可分别多选导入；不进入发布产物。

## English

Release desktop packages contain no GLB maps. Use **Resources → Import multiple
files** to select SVG icons and GLB maps in batches. Names determine their slots;
the full list is in `electron/resource-catalog.json`. `glock.svg` is accepted as
an alias for `glock18.svg`. Missing icons use built-in defaults; missing models
use NAV, with no model controls or automatic OSS downloads. Training Ground is
built in. Web behavior is unchanged.

Imported files live under Electron's `userData/resource-packs`, outside browser
storage. Valid matching files replace previous imports; invalid files do not.
SVGs must be self-contained, image-only and at most 2 MB. GLB 2.0 models must
embed required data, retain original map coordinates and be at most 1 GB.
Structural validation does not guarantee correct rendering or NAV alignment.
Zone models, map logos, scripts and custom maps are not supported. Save work
before **Reload and apply**, or restart the app later.

`desktop:build:local` is the explicit local-model test build. Normal release
commands exclude local models and test sources. Historical test SVGs are under
the ignored `.local/official/ui/` directory.

## Русский

Релиз Electron не содержит GLB. Откройте **Ресурсы → Импорт файлов**, выберите
несколько SVG/GLB и при необходимости добавляйте частями. Имена определяют
назначение файлов; список находится в `electron/resource-catalog.json`.
`glock.svg` соответствует `glock18.svg`. Отсутствующие значки используют
стандартные изображения, а карты — NAV без управления моделью и загрузки из OSS.
Учебная карта встроена; поведение веб-версии не изменяется.

Файлы сохраняются в Electron `userData/resource-packs`, вне хранилища браузера.
Корректный одноимённый импорт заменяет предыдущий; ошибочный — нет. SVG до 2 МБ
не должны содержать активный код или внешние ссылки. GLB 2.0 до 1 ГБ должны
содержать необходимые данные и сохранять координаты карты. Проверка структуры
не гарантирует правильное отображение или совпадение с NAV. Модели зон,
эмблемы карт, скрипты и пользовательские карты пока не поддерживаются.
Сохраните работу перед **Применить с перезагрузкой** или перезапустите приложение.

Только `desktop:build:local` включает локальные модели в тестовый пакет.
Релизные команды исключают их и тестовые исходники. Исторические SVG находятся
в игнорируемом Git каталоге `.local/official/ui/`.
