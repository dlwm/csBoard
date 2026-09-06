import { localize, normalizeLanguage } from './i18n.js';

const STEPS = {
  zh: [
    ['欢迎', '你可以在这里简单尝试视角控制、人物与道具放置、相机机位、战术绘制和帧管理等功能。需要离开时，点击右上角“结束教学”即可返回常规地图。'],
    ['移动与观察', '使用 WASD 平移，鼠标中键旋转，滚轮缩放。NAV 开关控制导航地面，MODEL 拖拽条调整建筑透明度。'],
    ['设置相机机位', '调整到常用观察角度后，按 Ctrl + 数字键保存机位；按对应数字键快速恢复。机位会按地图保存在当前浏览器。'],
    ['放置与调整人物', '已为你打开练习帧。按 E 放置人物，拖动改变位置，Ctrl + 左键调整朝向，双击切换蹲姿。'],
    ['添加和复用道具', '按 Q 打开道具轮盘并拖动选择；在“道具速记”中可录入 getpos、导入 JSON，并把已保存道具添加到协作帧。'],
    ['绘制与撤销', '按住左键绘制战术路线，选择颜色和线宽；Ctrl + 左键擦除。使用 Ctrl + Z 与 Ctrl + Y 撤销或重做。'],
    ['组织战术帧', '使用“插帧”创建下一阶段，“复制帧”保留当前站位后继续修改。方向键可在相邻帧之间切换。'],
    ['保存与协作', '将练习帧保存到本地存档，之后可随时恢复。开放房间后可以让其他成员实时查看，由房主控制存档与帧。'],
  ],
  en: [
    ['Welcome', 'Try camera controls, player and utility placement, saved camera positions, tactical drawing, and frame management here. Use “Exit Tutorial” in the upper-right corner to return to a regular map.'],
    ['Move and inspect', 'Use WASD to pan, middle mouse to rotate, and the wheel to zoom. The NAV switch toggles the ground; the MODEL slider fades the buildings.'],
    ['Save camera positions', 'Frame a useful angle, then press Ctrl + a number to save it. Press that number to restore it. Positions are stored per map in this browser.'],
    ['Place and adjust players', 'A practice frame is now open. Press E to place a player, drag to move, Ctrl + left click to aim, and double-click to crouch.'],
    ['Add and reuse utility', 'Press Q and drag through the utility wheel. Utility Notes can capture getpos, import JSON, and add saved utility to a Collaboration frame.'],
    ['Draw and undo', 'Hold left click to draw routes, then choose color and width. Ctrl + left click erases. Use Ctrl + Z and Ctrl + Y to undo or redo.'],
    ['Organize tactical frames', 'Insert Frame creates the next phase; Duplicate Frame preserves positions before editing. Arrow keys switch adjacent frames.'],
    ['Save and collaborate', 'Archive the practice frames locally for later restore. Open a room for live viewers while the owner controls archives and frames.'],
  ],
  ru: [
    ['Добро пожаловать', 'Здесь можно попробовать управление камерой, размещение игроков и гранат, сохранение ракурсов, тактическое рисование и работу с кадрами. Чтобы вернуться к обычной карте, нажмите «Выйти из обучения» справа вверху.'],
    ['Движение и обзор', 'WASD перемещает камеру, средняя кнопка мыши вращает её, колесо меняет масштаб. NAV включает навигационную поверхность, а ползунок MODEL меняет прозрачность зданий.'],
    ['Сохранение камер', 'Выберите удобный ракурс и нажмите Ctrl + цифру для сохранения. Эта цифра восстановит камеру. Позиции хранятся отдельно для каждой карты в этом браузере.'],
    ['Игроки', 'Учебный кадр уже открыт. Нажмите E, чтобы поставить игрока; перетаскивайте для перемещения, Ctrl + ЛКМ меняет направление, двойной клик переключает приседание.'],
    ['Гранаты', 'Нажмите Q и проведите по колесу гранат. В заметках можно сохранить getpos, импортировать JSON и добавить сохранённую гранату в совместный кадр.'],
    ['Рисование и отмена', 'Удерживайте ЛКМ для рисования маршрутов, выбирайте цвет и толщину. Ctrl + ЛКМ стирает. Ctrl + Z и Ctrl + Y отменяют и возвращают действие.'],
    ['Тактические кадры', '«Вставить кадр» создаёт следующий этап, а «Дублировать кадр» сохраняет позиции перед правкой. Стрелки переключают соседние кадры.'],
    ['Сохранение и совместная работа', 'Сохраните учебные кадры в локальный архив, чтобы восстановить их позже. Откройте комнату для совместного просмотра; архивами и кадрами управляет владелец.'],
  ],
};

export function TutorialOffer({ language, devMode = false, onAccept, onDecline }) {
  const text = (zh, en, ru) => localize(language, { zh, en, ru });
  return <div className="tutorial-offer-backdrop" role="presentation">
    <section className="tutorial-offer" role="dialog" aria-modal="true" aria-labelledby="tutorial-offer-title">
      <span>{text('首次访问', 'FIRST VISIT', 'ПЕРВЫЙ ВИЗИТ')}</span>
      <h2 id="tutorial-offer-title">{text('是否前往操作教学？', 'Open the interactive tutorial?', 'Открыть интерактивное обучение?')}</h2>
      <p>{text('进入双层训练场的协作面板，学习人物、道具、相机机位、战术帧和本地存档。', 'Open Collaboration on the two-level Training Ground to learn players, utility, camera positions, tactical frames, and local archives.', 'Откройте совместный режим на двухуровневой тренировочной карте, чтобы изучить игроков, гранаты, камеры, тактические кадры и локальные архивы.')}</p>
      {devMode && <small className="tutorial-offer-dev-note">{text('开发模式：该提醒每访问 3 次显示一次。', 'Development mode: this reminder appears once every 3 visits.', 'Режим разработки: напоминание показывается раз в 3 посещения.')}</small>}
      <footer><button type="button" onClick={onDecline}>{text('暂不前往', 'NOT NOW', 'НЕ СЕЙЧАС')}</button><button type="button" onClick={onAccept}>{text('前往教学', 'START TUTORIAL', 'НАЧАТЬ ОБУЧЕНИЕ')}</button></footer>
    </section>
  </div>;
}

export default function TutorialGuide({ language, open, step, onOpen, onStep, onFinish, onExit }) {
  const text = (zh, en, ru) => localize(language, { zh, en, ru });
  if (!open) return <button type="button" className="tutorial-reopen" onClick={onOpen}>{text('操作教学', 'TUTORIAL', 'ОБУЧЕНИЕ')}</button>;
  const steps = STEPS[normalizeLanguage(language)];
  const [title, body] = steps[step];
  return <aside className="tutorial-guide" aria-live="polite">
    <header><span>{text('训练场 / 操作教学', 'TRAINING / TUTORIAL', 'ТРЕНИРОВКА / ОБУЧЕНИЕ')}</span><button type="button" onClick={onExit}>{text('结束教学', 'EXIT TUTORIAL', 'ВЫЙТИ ИЗ ОБУЧЕНИЯ')}</button></header>
    <div className="tutorial-progress">{steps.map((_, index) => <i key={index} className={index <= step ? 'active' : ''} />)}</div>
    <strong>{String(step + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}</strong>
    <h2>{title}</h2>
    <p>{body}</p>
    <footer>
      <button type="button" disabled={step === 0} onClick={() => onStep(step - 1)}>{text('上一步', 'BACK', 'НАЗАД')}</button>
      <button type="button" onClick={() => step === steps.length - 1 ? onFinish() : onStep(step + 1)}>{step === steps.length - 1 ? text('开始练习', 'START', 'НАЧАТЬ') : text('下一步', 'NEXT', 'ДАЛЕЕ')}</button>
    </footer>
  </aside>;
}
