import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { localize } from '../i18n.js';
import './analysisAiGuide.css';

// Browser API availability is not evidence that a model client is connected.
// Keep this guide local/offline; opening it never sends Demo data anywhere.
export default function AnalysisAiGuide({ language, loading, selectedDemoCount, onClose }) {
  const dialogRef = useRef(null);
  const promptRef = useRef(null);
  const [available, setAvailable] = useState(() => Boolean(document.modelContext?.registerTool));
  const [copyState, setCopyState] = useState('');
  const text = (zh, en, ru) => localize(language, { zh, en, ru });
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  const prompt = text(
    '请使用 CSBoard 的工具分析我选中的 Demo 第 1 回合。先调用 get_analysis_context 确认 Demo ID 和可用回合；有多个 Demo 时先问我选哪个。调用 get_round_analysis，先取 context，再分页读完 timeline、events、utility。重点分析双方开局站位、道具意图、持包人路线、CT 是否被引诱或识破、补防和回防时机。每个判断引用 tick/时间、选手和记录 ID，列出证据、反证及改进建议，区分事实与推测，不把全知视角当作玩家已知信息。如果无法调用这些工具，请明确说明未接入，不要编造分析。',
    'Use the CSBoard tools to analyze round 1 of my selected Demo. Call get_analysis_context to identify the Demo ID and available rounds; ask me to choose if there are several. Call get_round_analysis with context first, then read every page of timeline, events and utility. Examine setup, utility intent, bomb-carrier route, possible CT bait/reads, reinforcement and retake timing. Cite ticks, players and record IDs; give supporting and contradicting evidence and improvements. Separate facts from hypotheses and do not equate omniscient positions with player knowledge. If these tools are unavailable, say you are not connected rather than inventing an analysis.',
    'Проанализируй первый раунд выбранного Demo через инструменты CSBoard. Сначала вызови get_analysis_context для получения ID Demo и списка раундов; если Demo несколько, уточни выбор. Вызови get_round_analysis: сначала context, затем все страницы timeline, events и utility. Изучи расстановку, замысел гранат, маршрут игрока с бомбой, возможные обманные действия и чтение игры CT, помощь и ретейк. Указывай тики, игроков и ID записей, аргументы за и против и рекомендации. Разделяй факты и гипотезы: полная информация Demo не равна знаниям игроков. Если инструменты недоступны, сообщи об отсутствии подключения и не выдумывай анализ.',
  );
  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyState('copied');
    } catch {
      promptRef.current?.focus();
      promptRef.current?.select();
      setCopyState('manual');
    }
  };
  return createPortal(<dialog ref={dialogRef} className="analysis-ai-dialog" aria-labelledby="analysis-ai-title" onClose={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} onKeyDown={(event) => event.stopPropagation()}>
    <div className="analysis-ai-guide">
      <header><div><small>CSBOARD · AI</small><h2 id="analysis-ai-title">{text('AI 接入分析教程', 'AI analysis setup', 'Подключение ИИ к аналитике')}</h2></div><button type="button" autoFocus onClick={onClose} aria-label={text('关闭教程', 'Close guide', 'Закрыть инструкцию')}>×</button></header>
      <div className="analysis-ai-body">
        <p className="analysis-ai-notice">{text('页面提供分析工具 ≠ 模型已连接。普通聊天窗口、粘贴网页地址或填写 API Key，都不会自动获得浏览器里的 Demo 数据。', 'Exposing tools on this page does not connect a model. An ordinary chat, a pasted page URL or an API key does not automatically grant access to browser Demo data.', 'Наличие инструментов на странице не означает подключение модели. Обычный чат, ссылка на страницу или API-ключ не дают автоматического доступа к Demo в браузере.')}</p>
        <section className="analysis-ai-status">
          <h3>{text('当前状态', 'Current status', 'Текущее состояние')}</h3>
          <p>{available ? text('浏览器：提供 WebMCP 工具注册 API', 'Browser: WebMCP registration API available', 'Браузер: API регистрации WebMCP доступен') : text('浏览器：未检测到 WebMCP 工具注册 API', 'Browser: WebMCP registration API not detected', 'Браузер: API регистрации WebMCP не обнаружен')}</p>
          <p>{loading ? text('数据：加载中，请稍候', 'Data: still loading', 'Данные: загрузка') : selectedDemoCount ? text(`数据：已选 ${selectedDemoCount} 个 Demo`, `Data: ${selectedDemoCount} Demo(s) selected`, `Данные: выбрано Demo — ${selectedDemoCount}`) : text('数据：请先选择选手并勾选 Demo', 'Data: select players and check a Demo first', 'Данные: сначала выберите игроков и Demo')}</p>
          <p>{text('模型连接：本页无法确认，须由模型实际调用工具验证。API 存在也不保证工具注册成功。', 'Model connection: unverified here. Verify by an actual tool call; API availability alone does not guarantee successful registration.', 'Подключение модели здесь не подтверждено. Проверьте реальным вызовом: наличие API не гарантирует успешную регистрацию инструментов.')}</p>
          <button type="button" onClick={() => setAvailable(Boolean(document.modelContext?.registerTool))}>{text('重新检测', 'Check again', 'Проверить снова')}</button>
        </section>
        <section><h3>{text('1. 准备数据', '1. Prepare data', '1. Подготовьте данные')}</h3><p>{text('先完成 Demo 解析，进入对应地图的数据分析页，选择选手、勾选 Demo，等待加载结束。普通筛选分析沿用当前过滤；单回合分析保留双方全员，不受选手、阵营、经济过滤影响。', 'Parse a Demo, open Analysis on its map, select players and check the Demo, then wait for loading. Filtered analysis follows current filters; single-round analysis includes both teams regardless of player, side or economy filters.', 'Разберите Demo, откройте аналитику нужной карты, выберите игроков и Demo и дождитесь загрузки. Обычная аналитика учитывает фильтры; анализ раунда включает обе команды независимо от фильтров игроков, сторон и экономики.')}</p></section>
        <section><h3>{text('2. 连接支持网页工具的模型客户端', '2. Connect a compatible model client', '2. Подключите совместимый клиент ИИ')}</h3><p>{text('使用能发现并调用当前标签页 WebMCP 工具的浏览器代理或客户端，在该客户端中连接并授权此页面。具体入口取决于客户端；CSBoard 没有通用的 MCP 服务地址，也没有在页面内配置模型 API Key 的入口。客户端只支持传统 MCP 服务器，并不等于支持网页 WebMCP。', 'Use a browser agent or client that can discover and invoke WebMCP tools in this tab, then connect and authorize this page in that client. Setup varies by client. CSBoard provides neither a generic MCP server URL nor an in-page model API-key setting. Traditional MCP-server support does not imply browser WebMCP support.', 'Используйте браузерного агента или клиент, умеющий обнаруживать и вызывать WebMCP-инструменты этой вкладки, и разрешите доступ к странице в нём. Настройка зависит от клиента. В CSBoard нет универсального адреса MCP-сервера или настройки API-ключа модели. Поддержка обычных MCP-серверов не означает поддержку WebMCP в браузере.')}</p>
          <details><summary>{text('开发 / Electron 启动方式', 'Development / Electron launch', 'Запуск для разработки / Electron')}</summary><p>{text('源码环境可使用项目已有命令启用实验模式。它只启用浏览器能力，不会安装客户端或自动连接模型；版本不支持时仍可能不可用。', 'Source checkouts can use the existing experimental launch command. This only enables browser capabilities; it does not install a client or connect a model, and unsupported versions may still lack the API.', 'В исходном проекте можно включить экспериментальный режим существующей командой. Это лишь включает возможности браузера, не устанавливает клиент и не подключает модель; API всё ещё может быть недоступен.')}</p><pre><code>{'npm run build:desktop\nnpm run desktop:start:webmcp'}</code></pre></details>
        </section>
        <section><h3>{text('3. 验证连接，再分析', '3. Verify, then analyze', '3. Проверьте подключение и начните анализ')}</h3><p>{text('先让模型调用 get_analysis_context，并复述当前地图、选中的 Demo ID 和可用回合。如果模型说没有这个工具，说明连接尚未打通，不是第一回合没有数据。', 'Ask the model to call get_analysis_context and report the current map, selected Demo IDs and available rounds. If it cannot access that tool, the connection is not established; it does not mean round 1 has no data.', 'Попросите модель вызвать get_analysis_context и назвать карту, ID выбранных Demo и доступные раунды. Если инструмент недоступен, подключение не настроено — это не означает отсутствие данных первого раунда.')}</p>
          <dl>
            <dt>get_filtered_analysis_data</dt><dd>{text('按当前筛选分页读取 KD、区域时间或道具数据，每页最多 200 条。', 'Read filtered KD, area-time or utility records, up to 200 per page.', 'Данные KD, времени в зонах и гранат по фильтрам, до 200 записей на страницу.')}</dd>
            <dt>get_round_analysis</dt><dd>{text('指定 demoId 和 round；先 context，再分别翻完 timeline、events、utility。每页最多 100 条，可设置时间窗口和 0.25–5 秒采样间隔。', 'Specify demoId and round. Read context, then every page of timeline, events and utility. Up to 100 records per page; optional time windows and 0.25–5s sampling.', 'Укажите demoId и round. Прочтите context, затем все страницы timeline, events и utility. До 100 записей на страницу; временные окна и шаг 0,25–5 с.')}</dd>
            <dt>capture_3d_view</dt><dd>{text('视觉模型可读取当前 3D 视图，支持宽高、格式、质量参数。截图不会自动切到指定回合；应先在回合浏览中打开对应 Demo、回合和时刻，再核对返回的上下文。', 'Vision models can capture the current 3D viewport with size, format and quality options. Capture does not select the requested round; first open that Demo/round/time in Round Replay and verify returned context.', 'Модели с поддержкой изображений могут получить текущий 3D-вид с настройками размера, формата и качества. Снимок не переключает раунд: сначала откройте нужные Demo, раунд и момент в просмотре и проверьте контекст ответа.')}</dd>
          </dl>
        </section>
        <section><h3>{text('可直接发给模型的提示词', 'Prompt to send to your model', 'Запрос для вашей модели')}</h3><p>{text('把“第 1 回合”改成你要分析的回合。', 'Replace “round 1” with your target round.', 'Замените первый раунд на нужный.')}</p><textarea ref={promptRef} readOnly value={prompt} aria-label={text('分析提示词', 'Analysis prompt', 'Запрос для анализа')} /><div className="analysis-ai-copy"><button type="button" onClick={copyPrompt}>{text('复制提示词', 'Copy prompt', 'Копировать запрос')}</button><span role="status">{copyState === 'copied' ? text('已复制', 'Copied', 'Скопировано') : copyState === 'manual' ? text('无法自动复制，已选中文字，请手动复制。', 'Automatic copy failed. Text selected; copy manually.', 'Автокопирование недоступно. Текст выделен — скопируйте вручную.') : ''}</span></div></section>
        <section><h3>{text('边界与隐私', 'Limits and privacy', 'Ограничения и конфиденциальность')}</h3><p>{text('打开教程不会上传数据，CSBoard 不会替你调用模型服务。连接后，模型客户端可能把读取的选手名、Demo 内容和截图发送给其服务商，请只授权可信客户端。战术原意、被引诱和识破都需要模型提出证据与反证；缺少语音、精确视线和玩家实际已知信息时，应保留不确定性。', 'Opening this guide uploads nothing, and CSBoard does not call a model provider for you. Once connected, your client may send player names, Demo data and screenshots to its provider; authorize only trusted clients. Intent, bait and reads require supporting and contradicting evidence; missing comms, exact visibility and player knowledge must remain uncertain.', 'Открытие инструкции ничего не отправляет, и CSBoard не обращается к модели за вас. Подключённый клиент может отправлять имена игроков, Demo и снимки своему провайдеру — разрешайте доступ только доверенным клиентам. Замысел, обман и чтение игры требуют доказательств и контраргументов; отсутствие переговоров, точной видимости и знаний игроков означает неопределённость.')}</p></section>
      </div>
    </div>
  </dialog>, document.body);
}
