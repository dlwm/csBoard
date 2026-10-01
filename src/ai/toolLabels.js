import { localize } from '../i18n.js';

// Display translations only. Protocol IDs and workflow permissions stay stable.
const labels = {
  read_app_documentation: ['查阅应用文档', 'Read application docs', 'Читать документацию', '按需读取使用说明、资源包和助手指南。', 'Read app, resource pack and assistant guides on demand.', 'Прочитать руководства приложения, ресурсов и помощника.'],
  get_session_memory: ['检索会话记忆', 'Search session memory', 'Поиск в памяти', '搜索较早的消息、操作结果与上下文。', 'Search earlier messages, outcomes and context.', 'Поиск старых сообщений, результатов и контекста.'],
  remember_context: ['保存记忆', 'Remember context', 'Сохранить факт', '保存明确的偏好或已确认事实。', 'Save an explicit preference or confirmed fact.', 'Сохранить предпочтение или подтверждённый факт.'],
  inspect_board_view: ['观察画布', 'Inspect board view', 'Осмотреть доску', '选择视角观察地面与画布对象。', 'Choose a view of ground and board objects.', 'Выбрать ракурс земли и объектов.'],
  resolve_view_point: ['定位图像坐标', 'Resolve image position', 'Найти позицию на снимке', '将截图像素转换为地面候选位置。', 'Convert screenshot pixels to ground candidates.', 'Перевести пиксель в позицию на земле.'],
  inspect_spatial_context: ['查询三维空间', 'Inspect spatial context', 'Изучить окружение', '读取区域边界、高差和相对位置。', 'Read bounds, heights and relative positions.', 'Прочитать границы, высоты и относительные позиции.'],
  list_nav_areas: ['查询地面区域', 'List ground areas', 'Список областей земли', '按范围读取地面多边形。', 'Read ground polygons within bounds.', 'Прочитать полигоны в заданных границах.'],
  find_nav_path: ['查询区域连接', 'Find area connections', 'Найти связи областей', '读取两个区域之间的连接路径。', 'Read a connection path between two areas.', 'Прочитать цепочку связей между областями.'],
  get_action_history: ['读取操作记录', 'Read action history', 'История действий', '查询本次运行的执行、失败与取消记录。', 'Read runtime outcomes, failures and cancellations.', 'Прочитать результаты, ошибки и отмены текущего запуска.'],
  get_board_state: ['读取画布状态', 'Read board state', 'Состояние доски', '读取当前帧、对象与编辑版本。', 'Read the current frame, objects and revision.', 'Прочитать кадр, объекты и версию.'],
  get_map_context: ['读取地图信息', 'Read map context', 'Контекст карты', '读取坐标约定和地图参考信息。', 'Read coordinate conventions and map references.', 'Прочитать систему координат и ориентиры.'],
  list_map_places: ['读取地点目录', 'List map places', 'Список мест', '列出已有地点名称与引用。', 'List indexed place names and references.', 'Прочитать известные названия и ссылки.'],
  find_map_locations: ['查找地图位置', 'Find map locations', 'Найти позиции', '按名称、区域或已知位置查找候选。', 'Find candidates by name, area or known position.', 'Найти кандидатов по имени, области или позиции.'],
  apply_tactical_changes: ['编辑画布对象', 'Edit board objects', 'Изменить объекты', '批量编辑人员、效果或线条，支持撤销。', 'Batch-edit players, effects or lines with undo.', 'Изменить игроков, эффекты или линии с отменой.'],
  search_utilities: ['查找投掷记录', 'Search saved throws', 'Найти броски', '搜索当前地图保存的道具记录。', 'Search saved utility records for this map.', 'Найти сохранённые броски на текущей карте.'],
  get_utility_details: ['读取道具详情', 'Read throw details', 'Данные броска', '核对记录中的出手位置与效果时间。', 'Inspect recorded release positions and effect timing.', 'Прочитать позицию броска и время эффекта.'],
  import_utility: ['导入道具记录', 'Import utility', 'Импортировать бросок', '把已有记录导入指定帧。', 'Import a saved record into the selected frame.', 'Импортировать запись в выбранный кадр.'],
  manage_frames: ['管理战术帧', 'Manage frames', 'Управление кадрами', '创建、复制、切换或删除帧。', 'Create, duplicate, switch or delete frames.', 'Создать, копировать, выбрать или удалить кадр.'],
  control_camera: ['调整观察镜头', 'Control camera', 'Управление камерой', '聚焦对象或使用保存的镜头位置。', 'Focus objects or use saved camera positions.', 'Выбрать объект или сохранённую камеру.'],
  edit_history: ['撤销或重做', 'Undo or redo', 'Отмена или повтор', '撤销或重做最近的画布操作。', 'Undo or redo the last board action.', 'Отменить или повторить действие на доске.'],
  clear_board: ['清空当前帧', 'Clear current frame', 'Очистить кадр', '确认后清空当前帧内容。', 'Clear the active frame after confirmation.', 'Очистить текущий кадр после подтверждения.'],
  list_archives: ['查询存档', 'List archives', 'Список архивов', '读取本地存档列表。', 'Read the local archive list.', 'Прочитать список локальных архивов.'],
  manage_archive_folders: ['管理存档目录', 'Manage archive folders', 'Папки архивов', '创建、移动或删除存档文件夹。', 'Create, move or delete archive folders.', 'Создать, переместить или удалить папки.'],
  request_room_action: ['管理协作房间', 'Manage room', 'Управление комнатой', '创建、加入或离开协作房间。', 'Create, join or leave a collaborative room.', 'Создать комнату, войти или выйти.'],
  request_archive_action: ['管理存档', 'Manage archives', 'Управление архивами', '打开存档流程、恢复或删除存档。', 'Open archive dialogs, restore or delete archives.', 'Открыть диалоги, восстановить или удалить архив.'],
  conversation: ['会话执行', 'Conversation execution', 'Выполнение диалога', '会话执行与中断结果。', 'Conversation outcomes and interruptions.', 'Результаты и прерывания диалога.'],
};
export function toolDisplay(name, language) {
  const row = labels[name] || ['其他操作', 'Other action', 'Другое действие', '未提供操作说明。', 'No description available.', 'Описание отсутствует.'];
  return { label: localize(language, { zh: row[0], en: row[1], ru: row[2] }), description: localize(language, { zh: row[3], en: row[4], ru: row[5] }) };
}
