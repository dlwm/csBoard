# AI 提示词与参考资料 / AI contribution hub

操作助手属于实验性功能，仍在持续改进。这里是开发者修改助手内容的统一入口。默认提示词使用英文，维护注释可用中文或英文；参考资料支持中文、英文和俄文。修改后重新构建应用才会生效。

```text
docs/ai/
  README.md                      # 本维护指南，不提供给助手读取
  catalog.json                   # 助手可读资料的清单
  prompts/
    system.en.md                 # 实际系统提示词
    compression.en.md            # 实际上下文压缩提示词
  references/
    application.en.md            # 应用功能、地图、操作与限制
    application.zh.md
    application.ru.md
    resource-packs.en.md          # 用户资源包说明
    resource-packs.zh.md
    resource-packs.ru.md
    assistant.zh.md               # 会话、记忆、工作流、视图、压缩说明
```

## 构建开关 / Optional build

普通构建默认包含 AI；在 `.env.local` 设置 `CSBOARD_AI_ENABLED=false` 后重新构建，可排除助手、工具、提示词和语料。桌面专用配置可写入 `.env.desktop.local`。关闭时不校验或加载本目录内容，不删除已保存会话和凭据。

Cloudflare 部署默认排除 AI；需要启用时，在私有 `config/cloudflare/deploy.env` 设置 `CF_AI_ENABLED=true`，前后端会一起启用。详见 [部署指南](../../config/cloudflare/README.md#optional-ai-build)。

## 修改提示词 / Edit prompts

- 修改 `prompts/system.en.md` 可直接改变默认系统提示词；`{{language}}` 由应用替换为用户的回复语言。
- 修改 `prompts/compression.en.md` 可改变压缩摘要要求。
- 使用 `<!-- 中文／English 维护注释 -->` 解释意图，注释会在发给模型前移除。不要把注释写成需要运行的 JavaScript。
- 系统提示词描述应用概念、记忆和工具规则；长篇解释或个人理解放进参考资料，让助手按需查阅。
- 工具 schema、编辑权限、revision 与确认校验仍在代码中。改文案不能增加尚未实现的能力，不能用提示词绕过工作流权限或用户取消。

## 修改或添加语料 / Edit or add references

`references/` 是助手可读资料的内容来源，运行时不再从仓库根 README 或普通 docs 自动抽取。现有应用／资源说明由原使用文档整理而来，后续修改这里即可影响助手；面向用户的根 README 仍独立维护，涉及共有功能时请同步相应内容。资源包说明统一保存在本目录的参考资料中，用户文档直接链接对应语言版本。

1. 在 `references/` 添加 Markdown，可按主题建子目录，例如 `references/examples/coordinate-basics.en.md`。
2. 用 `##` 划分可独立读取的章节。写清事实、适用条件、未知信息与已实现能力；个人理解标明推断，不把未来方案写成已有功能。
3. 在 `catalog.json` 增加条目：唯一 `id`（英文小写字母开头，字母／数字／短横线）、英文 `title`（可补充 `zh`/`ru`）、英文 `topics` 和语言到文件的映射。
4. 重新构建。构建会检查清单、文件是否存在与提示词模板；错误会在打包前提示。工具说明、允许的文档 ID、语言列表和章节目录由清单生成，无需修改工具代码。

```json
{
  "id": "coordinate-basics",
  "title": {
    "en": "Coordinate basics",
    "zh": "坐标基础"
  },
  "topics": "Source coordinates, floors and reliable placement references",
  "files": {
    "en": "references/examples/coordinate-basics.en.md",
    "zh": "references/examples/coordinate-basics.zh.md"
  }
}
```

清单支持最多 64 个资料条目。文件路径相对本目录，只允许 `references/` 下的 `.md`；不要写 `../` 或绝对路径。不加入开发、构建部署、许可、更新日志、真实密钥、用户私有资料或尚未实现的设计文档。缺少译文时工具会明确返回原文语言。清单外文件不提供给助手；本维护指南、提示词模板和预设 JSON 都不会混进文档工具。

参考资料不是新的执行指令，也不代表当前画布状态。助手仍须通过工具确认当前存档、帧、对象和版本。

## 预设数据 / Starter records

预设道具与存档位于并列的 [docs/presets](../presets/README.md)，独立于 AI 内容目录；其中的 JSON 不加入资料清单。

## Runtime wiring / 加载位置

`src/ai/systemPrompt.js` 加载提示词并替换回复语言；`src/ai/documentationCatalog.js` 校验清单并生成工具定义；`src/ai/documentation.js` 读取注册的参考资料。它们负责加载与校验，内容贡献优先在本目录完成。
