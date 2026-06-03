from pathlib import Path


def test_index_html_contains_arrange_to_date_ui():
    html = Path("index.html").read_text(encoding="utf-8")

    assert "安排到日期" in html
    assert 'id="copy-target-date"' in html
    assert "确认安排" in html
    assert 'id="copy-continuation-field-list"' in html
    assert 'id="copy-chat-summary-checkbox"' in html
    assert "当前 LLM 对话摘要" in html


def test_app_js_tracks_target_date_for_arrange_modal():
    script = Path("src/app.js").read_text(encoding="utf-8")

    assert 'targetDate: ""' in script
    assert 'copyTargetDate: document.querySelector("#copy-target-date")' in script
    assert 'this.state.copyModalState.targetDate = event.target.value || ""' in script
    assert 'const targetDate = this.state.copyModalState.targetDate || nextDateKey(task.date || this.state.currentDate);' in script
    assert 'selectedContinuationFields: new Set()' in script
    assert 'includeChatSummary: false' in script
    assert 'copyContinuationFieldList: document.querySelector("#copy-continuation-field-list")' in script
    assert 'copyChatSummaryCheckbox: document.querySelector("#copy-chat-summary-checkbox")' in script
    assert 'toggleCopyContinuationField(event)' in script


def test_constants_expose_phase3_options():
    constants_text = Path("src/constants.js").read_text(encoding="utf-8")

    assert 'export const CONTINUATION_FIELD_OPTIONS = [' in constants_text
    assert '{ value: "lastProgress", label: "上次进度" }' in constants_text
    assert '{ value: "projectPath", label: "相关路径" }' in constants_text
    assert '{ value: "deadline", label: "DDL" }' in constants_text
    assert '{ value: "plan", label: "给出明日计划" }' in constants_text
    assert '{ value: "quote", label: "一句日历" }' in constants_text
    assert '{ value: "progress", label: "总结昨天进度" }' not in constants_text


def test_phase4_source_marker_and_future_blocks_are_present():
    script = Path("src/app.js").read_text(encoding="utf-8")
    utils_text = Path("src/utils.js").read_text(encoding="utf-8")

    assert "formatArrangedFromLabel" in utils_text
    assert 'return `↪ from ${year}/${month}/${day}`;' in utils_text
    assert 'task.arrangedFrom ? formatArrangedFromLabel(task.arrangedFrom) : ""' in script
    assert '延续 Notes：\\n${bulletText}' in script
    assert '下一步计划：\\n${trimSummaryText(summaryText)}' in script
    assert '一句日历：\\n${quote.text}' in script


def test_phase5_llm_summary_and_fallback_are_wired():
    script = Path("src/app.js").read_text(encoding="utf-8")
    adapter_text = Path("src/llmAdapter.js").read_text(encoding="utf-8")

    assert "summarizeTaskChatForArrange" in adapter_text
    assert "generateNextStepPlan" in adapter_text
    assert 'const SUMMARY_FAILURE_FALLBACK = "摘要生成失败，可手动补充";' in adapter_text
    assert "请使用自然语言，不要使用 ##、###、Markdown 标题、JSON 或代码块。" in adapter_text
    assert 'let chatSummaryText = "";' in script
    assert "summarizeTaskChatForArrange({" in script
    assert "chatSummaryText = chatSummaryResult.summary || SUMMARY_FAILURE_FALLBACK;" in script
    assert "summaryText = summaryResult.summary || SUMMARY_FAILURE_FALLBACK;" in script
    assert '当前 LLM 对话摘要：\\n${chatSummaryText}' in script
