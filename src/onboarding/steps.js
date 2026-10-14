// Step IDs and targets form the tour contract. Text changes do not affect navigation.
// 步骤使用稳定 ID 与界面锚点；文案国际化不影响流程和完成状态。
const step = (id, panel, target, title, body, extra = {}) => ({ id, panel, target, title, body, ...extra });
export function operationGuideSteps({ demoParsing, mobile }) {
  return [
    step('view', null, '.board-view-toggle, .three-board', "onboarding.steps.exploreTheView", "onboarding.steps.switchBetween3dAndATopDown2dView"),
    step('camera', null, '.three-board', "onboarding.steps.moveTheCamera", "onboarding.steps.useWasdToMoveMiddleMouseToRotateShift", { touch: "onboarding.steps.dragWithOneFingerToRotateUseTwoFingers" }),
    step('camera-slots', null, '.camera-slots', "onboarding.steps.rememberAnAngle", "onboarding.steps.pressCtrlANumberToSaveTheCurrentCamera", { touch: "onboarding.steps.tapASavedCameraPositionToRestoreItTap" }),
    step('model', null, '.mobile-view-settings-toggle, [data-tour="models"]', "onboarding.steps.seeThroughBuildings", "onboarding.steps.in3dEnableAMapModelAndAdjustIts", { touch: "onboarding.steps.openViewSettingsInTheBottomBarForModel" }),
    step('floors', null, '.floor-controls, .camera-slots', "onboarding.steps.inspectMapFloors", "onboarding.steps.useFloorSelectionOnMultiLevelMapsToInspect"),
    step('import', 'demo', '.demo-source-controls', "onboarding.steps.bringInADemo", "onboarding.steps.chooseADemFileWaitForParsingThenOpen", { parsing: true }),
    step('rounds', 'demo', '[data-tour="rounds"], .demo-source-controls', "onboarding.steps.pickARound", "onboarding.steps.openTheRoundSelectorAndChooseARoundThe", { parsing: true, needsDemo: true }),
    step('timeline', 'demo', '[data-tour="timeline"], .demo-playback-controls', "onboarding.steps.scrubAndReplay", "onboarding.steps.dragTheTimelineToInspectAMomentIncludingFreeze", { parsing: true, needsDemo: true, touch: "onboarding.steps.dragTheTimelineToSeekAndTapPlayPause" }),
    step('analysis', 'analysis', '.analysis-player-picker, .analysis-panel', "onboarding.steps.chooseWhatToAnalyze", "onboarding.steps.choosePlayersAndParsedDemosInTheRightSidebar", { parsing: true }),
    step('utility-events', 'analysis', '.analysis-view-options, .analysis-panel', "onboarding.steps.reviewUtilityEvents", "onboarding.steps.selectUtilityEventsThenFilterByUtilityTypeAnd", { parsing: true }),
    step('recommendations', 'analysis', '[data-tour="recommendations"]', "onboarding.steps.saveAUsefulThrow", "onboarding.steps.thisStepSelectsAllAvailablePlayersOnTheMap", { parsing: true, task: 'utility' }),
    step('notes', 'utility', '[data-tour="notes"]', "onboarding.steps.openYourUtilityNotes", "onboarding.steps.theThrowYouSavedIsNowAvailableHereUse"),
    step('getpos', 'utility', '[data-tour="getpos"], .utility-hover-card, .utility-location-panel', "onboarding.steps.takeItBackToCs2", "onboarding.steps.openANoteAndCopyItsGetposPositionCommand"),
    step('save-frames', 'demo', '[data-tour="save-frame"], .demo-playback-controls', "onboarding.steps.saveTwoMoments", "onboarding.steps.returnToMatchReplayPauseAtAUsefulMoment", { parsing: true, needsDemo: true, task: 'frames' }),
    step('collab', 'collab', '.collab-panel', "onboarding.steps.openAnEditableArchive", (demoParsing ? "onboarding.steps.openTheArchiveContainingYourTwoSavedFramesRestore" : "onboarding.steps.createALocalArchiveFromTheRightSidebarThen")),
    step('players', 'collab', '.collab-objects, .touch-edit-tools, .three-board', "onboarding.steps.arrangePlayersAndUtility", "onboarding.steps.withAnArchiveOpenEPlacesAPlayerAt", { touch: "onboarding.steps.restoreTheSavedPlayerLayoutsThenDragPlayersTo" }),
    step('frames', 'collab', '.collab-frame-strip, .collab-panel', "onboarding.steps.developTheTactic", "onboarding.steps.insertAFrameForTheNextStageOrDuplicate"),
    step('drawing', 'collab', '.brush-controls, .three-board', "onboarding.steps.drawAndCollaborate", "onboarding.steps.chooseABrushColorAndWidthThenDragOn", { touch: "onboarding.steps.enableTheDrawingSwitchInTheMapControlsChoose" }),
    step('finish', null, '.workspace-help-trigger', "onboarding.steps.youAreReady", "onboarding.steps.youCanReviewTheseStepsAtAnyTimeBy"),
  ].filter(item => !item.parsing || demoParsing).map(item => ({ ...item, body: mobile && item.touch ? item.touch : item.body }));
}
