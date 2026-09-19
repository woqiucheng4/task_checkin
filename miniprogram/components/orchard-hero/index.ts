Component({
  properties: {
    asset: { type: String, value: "" },
    embeddedSign: { type: Boolean, value: false },
    current: { type: Number, value: 0 },
    level: { type: Number, value: 1 },
    name: { type: String, value: "苹果树" },
    progressPercent: { type: Number, value: 0 },
    remaining: { type: Number, value: 0 },
    subtitle: { type: String, value: "完成任务，收集阳光，让小树快快长大！" },
    target: { type: Number, value: 30 },
    titleAsset: { type: String, value: "" },
    title: { type: String, value: "果园日计划" },
  },
});
