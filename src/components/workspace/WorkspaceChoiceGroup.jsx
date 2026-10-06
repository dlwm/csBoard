// A shared segmented control for workspace settings, independent of its slot.
// 分段选择统一外观；业务只提供选项、状态与回调，不另写浏览器默认按钮。
export default function WorkspaceChoiceGroup({ label, value, options, onChange }) {
  return <div className="workspace-choice-group" role="group" aria-label={label}>
    {options.map(option => <button type="button" key={option.value} aria-pressed={option.value === value} onClick={() => onChange(option.value)}>{option.label}</button>)}
  </div>;
}
