// Stable machine codes and recovery guidance; hosts translate their own text.
// 中文：错误码用于逻辑，文案由宿主国际化，不按错误句子猜测行为。
const entries = {
 invalid_command:['input','Correct the command envelope.'],
 unknown_command:['capability','Discover available commands before calling.'],
 invalid_argument:['input','Correct the field identified by details.issue.path.'],
 invalid_context:['input','Correct operation IDs, revision or AbortSignal.'],
 invalid_data:['input','Provide finite, acyclic supported data.'],
 revision_conflict:['conflict','Read current state and reconcile before another edit.'],
 workspace_changed:['conflict','Read the current map/workspace before placing again.'],
 operation_busy:['state','Wait for the pending operation; do not retry in a tight loop.'],
 permission_denied:['permission','Respect the host decision.'],
 cancelled:['lifecycle','Treat as intentional cancellation.'],
 disposed:['lifecycle','Create a new instance.'],
 not_ready:['state','Wait for the relevant source/resource to be ready.'],
 missing_source:['state','Attach a data source before opening a segment.'],
 unknown_segment:['input','Select an ID from listSegments.'],
 track_unavailable:['capability','Inspect source track capabilities.'],
 object_catalog_changed:['conflict','Read model objects again before changing visibility.'],
 response_too_large:['budget','Request a narrower state or catalogue projection.'],
 invalid_event:['contract','Fix the producer payload; inspect onObserverError diagnostics.'],
 operation_failed:['internal','Preserve diagnostics and inspect state before retrying.'],
};
export const VIEWER_ERROR_DEFINITIONS = Object.freeze(Object.fromEntries(Object.entries(entries).map(([code,[category,recovery]])=>[code,Object.freeze({code,category,recovery})])));
