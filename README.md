# Study Desk

## Open-Source Repo Notes

- This public repo does not include real personal `data/*.json`.
- On first run, `serve_app.py` will create empty local data files automatically.
- LLM is disabled by default.
- If you later want to enable LLM, you must provide your own environment variables such as:
  - `STUDY_DESK_GPT_5_2_API_KEY`
  - `STUDY_DESK_DEEPSEEK_V3_671B_API_KEY`
  - `STUDY_DESK_DEEPSEEK_R1_671B_API_KEY`
  - `STUDY_DESK_QWEN_INSTRUCT_API_KEY`
  - `STUDY_DESK_QWEN25_VL_INSTRUCT_API_KEY`

Study Desk 是一个本地优先的学习任务工作台，核心目标不是做完整日历，而是把“今天要推进什么、什么时候推进、跨天怎么续上”放在同一个界面里完成。

当前版本聚焦三件事：

- 今日画布：完整任务卡片，支持拖拽、缩放、排序与归档
- 今日时间安排卡：上午 / 下午 / 晚上三段轻量时间片，只引用任务，不改变任务本体
- 大右抽屉编辑器：新建任务、编辑任务、任务延续区都通过同一个浮出式抽屉完成

![Study Desk Daily View](figures/daily.png)
![Study Desk Calendar View](figures/calender.png)

## 当前界面定义

### 今日视图

- 左侧：今日画布
- 右侧：今日时间安排卡
- 浮层：任务详情大右抽屉

详情抽屉不再占主布局宽度，所以不会挤压画布或时间片。浏览器缩放变化时，桌面端优先保持“左画布 + 右时间片”的双栏结构；只有在明确的小屏断点下才切成单列。

### 历史记录

- 按日期查看当天任务
- 查看正式总结 / 草稿总结
- 查看 notes 与任务延续区

### 月历模式

- 以月为单位聚合任务
- 每天默认显示 2 条任务
- 超出部分用 `+n`
- 标记规则：
  - `↪` 表示从过去安排来的任务
  - `★` 表示高重要且高紧急
  - `✓` 表示已完成

## 核心功能

### 1. 今日画布

- 新建学习卡片
- 拖动卡片位置
- 调整卡片大小
- 手动置顶 / 置底 / 恢复默认排序
- 设置状态、重要度、紧急度、颜色
- 归档与恢复归档

### 2. 今日时间安排卡

- 固定三个时间片：`上午 / 下午 / 晚上`
- 从画布拖入时间片
- 右键菜单加入时间片
- 同一任务允许出现在多个时间片
- 同一任务在同一时间片内不允许重复
- 时间片内支持上移 / 下移 / 移除

时间片是“引用层”，不是任务搬家：

- 左侧原卡片保持原样
- 卡片只增加轻标记，例如：`已安排：上午 / 晚上`
- 从时间片移除任务不会删除原任务

### 3. 任务详情大右抽屉

点击今日画布、历史记录或月历中的任务，都会打开同一个大右抽屉。

抽屉内容包括：

- 标题
- 状态
- 重要 / 紧急
- 颜色
- Notes
- 任务延续区
  - 上次进度
  - 项目路径
  - 相关文件
  - DDL

抽屉采用固定头部 + 内部滚动内容区。长 notes 或长延续信息会在抽屉内部滚动，不会再撑破页面。

### 4. 安排到指定日期

可将今天的任务续到未来某一天，并选择带过去哪些内容：

- 标题
- 选中的 notes
- 任务延续区字段
- 一句日历 / quote

新任务会写入：

- `scheduledDate`
- `arrangedFrom`
- `isArrangedTask`

### 5. 历史记录与月历回看

- 历史页查看某一天的任务与总结
- 月历页按月聚合任务分布
- 点击日期打开日期侧栏
- 点击任务打开大右抽屉

## LLM 状态

当前版本默认关闭 LLM。

这意味着：

- 前端不显示 LLM 对话区
- 今日总结保留手写与保存，不显示“自动生成草稿”
- “安排到指定日期”不显示“带上 LLM 对话摘要 / 下一步计划”
- 后端 `/api/llm` 在当前默认启动方式下会直接返回禁用态

本版本聚焦本地任务、时间片和跨天续接，不依赖 LLM 才能完成完整工作流。

## 运行方式

### 推荐方式：双击启动

直接双击：

- `start_study_desk.bat`

脚本会：

1. 检查本机是否有 Python 3
2. 启动 `serve_app.py`
3. 自动打开浏览器到 `http://127.0.0.1:4173/index.html`
4. 默认以无 LLM 模式启动

### 命令行方式

```bash
python serve_app.py 4173 --disable-llm
```

如果后续需要显式开启 LLM：

```bash
python serve_app.py 4173 --enable-llm
```

## 为什么不能直接双击 index.html

当前架构依赖 `serve_app.py` 提供：

- 静态资源服务
- 本地 JSON 读写 API
- `time_blocks.json` 的按日期读写
- 统一的本地运行入口

所以不能只双击 `index.html` 使用完整功能。

## 数据文件

项目主要数据都存放在 `data/` 下：

- `tasks.json`：任务主数据
- `notes.json`：任务 notes
- `messages.json`：任务内对话记录
- `records.json`：日总结与草稿
- `memory_entries.json`：任务延续区
- `time_blocks.json`：今日时间安排卡

时间片数据结构：

```json
{
  "2026-04-27": {
    "morning": ["task_a", "task_b"],
    "afternoon": ["task_c"],
    "evening": ["task_d"]
  }
}
```

时间片只存 `taskId`，不重复存任务标题、状态或来源信息；显示时统一从 `tasks.json` 派生。

## 项目结构

```text
daily_planning/
├─ data/
├─ docs/
├─ figures/
├─ icons/
├─ src/
│  ├─ app.js
│  ├─ constants.js
│  ├─ db.js
│  ├─ llmAdapter.js
│  └─ utils.js
├─ tests/
│  └─ manual_smoke_checklist.md
├─ index.html
├─ styles.css
├─ serve_app.py
├─ start_study_desk.bat
└─ workflow.md
```

## 手工验收

手工验收清单见：

- [tests/manual_smoke_checklist.md](tests/manual_smoke_checklist.md)

重点覆盖：

- 今日页双栏布局稳定性
- 大右抽屉内部滚动
- 时间片拖入 / 去重 / 排序 / 移除
- 拖入时间片后左侧卡片保持原样
- 月历 `↪ / ★ / ✓ / +n`
- 历史记录与旧数据兼容
- 无 LLM 模式与双击启动脚本
